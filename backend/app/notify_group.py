"""
Notificação de lead em grupo do WhatsApp.

Origem única para as duas entradas de lead que avisam grupo — webhook de LP
externa (webhook_routes) e landing page interna (landing_routes). As duas
renderizam o mesmo template e passam pelo mesmo envio.

Regras que valem para qualquer chamador:
  - roda DEPOIS do commit do lead;
  - falha no aviso nunca derruba o cadastro (try/except + [GROUP_NOTIFY_FAIL]);
  - não grava em `messages` — é aviso interno para o time, não conversa com o
    lead, e poluiria a timeline da aba Conversas.
"""
import json as json_lib
import logging
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

DEFAULT_TEMPLATE = "🚨 Novo lead — {origem}\nNome: {name}\n📞 {phone}\n{extras}"

# Fora do bloco {extras}, mas ainda disponíveis como placeholder explícito
# ({form_version}) para quem quiser:
#   - chaves de controle do formulário, que não dizem nada para quem lê o grupo;
#   - "origem", que já é placeholder fixo e sai no cabeçalho do template padrão
#     — no bloco automático apareceria duas vezes na mesma mensagem.
EXTRAS_HIDDEN_KEYS = {"form_version", "url_origem_form", "source", "origem"}

# Placeholders fixos, sempre disponíveis mesmo quando o lead não trouxe o campo.
FIXED_KEYS = ("name", "phone", "course", "email", "origem")

# Derivado de "phone" no render, não vem do lead: o número sem o "+", para o
# template que precisa do valor cru (colar em planilha, montar link próprio).
PHONE_RAW_KEY = "phone_raw"

MAX_EXTRA_LINES = 40


def _humanize(key: str) -> str:
    """nome_atleta -> "Nome atleta". A chave do form vira rótulo legível."""
    return str(key).replace("_", " ").strip().capitalize()


def _stringify(value: Any) -> str:
    """Valor do form em uma linha. dict/list saem compactos, não em JSON indentado."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "sim" if value else "não"
    if isinstance(value, (dict, list)):
        try:
            return json_lib.dumps(value, ensure_ascii=False, separators=(", ", ": "))
        except (TypeError, ValueError):
            return str(value)
    return str(value)


def phone_clicavel(phone: Any) -> str:
    """
    Telefone com "+" na frente — é o que faz o WhatsApp tornar o número clicável.

    APRESENTAÇÃO, e só isso: o app só reconhece o número como internacional (e
    portanto vira link para abrir a conversa) quando ele aparece com "+". O
    telefone chega aqui já normalizado por app/phone_utils.py (DDI 55, sem
    máscara, sem "+"), e nada disso muda o dado gravado — o "+" nasce e morre na
    mensagem do grupo. Não replicar regra de telefone aqui: normalização é
    responsabilidade exclusiva de phone_utils.

    Idempotente: número que já venha com "+" não ganha um segundo.
    """
    texto = _stringify(phone).strip()
    if not texto:
        return ""
    return texto if texto.startswith("+") else "+" + texto


def phone_raw(phone: Any) -> str:
    """O mesmo telefone sem o "+", para quem precisa do número cru no template."""
    return _stringify(phone).strip().lstrip("+")


def build_extras_block(extras: Optional[dict]) -> str:
    """
    Bloco automático de campos extras, um por linha: "Idade atleta: 16".

    Campo vazio é omitido — linha "Esporte: " no grupo é ruído, e formulário
    com campo opcional em branco é o caso comum.
    """
    if not extras:
        return ""
    linhas = []
    for key, value in extras.items():
        if key in EXTRAS_HIDDEN_KEYS:
            continue
        texto = _stringify(value).strip()
        if not texto:
            continue
        linhas.append(f"{_humanize(key)}: {texto}")
        if len(linhas) >= MAX_EXTRA_LINES:
            break
    return "\n".join(linhas)


def render_template(template: Optional[str], lead_data: dict) -> str:
    """
    Preenche o template.

    replace() e nunca str.format(): o template é escrito pelo cliente na UI, e
    uma chave desconhecida ou uma chave solta derrubaria o format() — o lead
    entraria sem aviso nenhum no grupo. Com replace, placeholder desconhecido
    fica literal, o que é visível e não custa a mensagem.

    Disponíveis: os fixos, {phone_raw}, qualquer chave dos extras ({nome_atleta})
    e {extras}.
    """
    text = template or DEFAULT_TEMPLATE
    extras = lead_data.get("extra") or {}

    valores = {k: lead_data.get(k, "") for k in FIXED_KEYS}
    # {phone} sai com "+" para o WhatsApp renderizar como link clicável — foi o
    # pedido do comercial, que copiava o número na mão. Quem quiser o número cru
    # no template usa {phone_raw}.
    valores["phone"] = phone_clicavel(valores.get("phone"))
    valores[PHONE_RAW_KEY] = phone_raw(lead_data.get("phone", ""))
    # Extras entram depois, mas sem sobrescrever um fixo de mesmo nome: "name"
    # do formulário não pode roubar o lugar do nome do lead.
    for key, value in extras.items():
        if key not in valores:
            valores[key] = value
    valores["extras"] = build_extras_block(extras)

    for key, value in valores.items():
        text = text.replace("{" + str(key) + "}", _stringify(value))

    # Um {extras} vazio deixa linha em branco pendurada no fim da mensagem.
    return "\n".join(linha for linha in text.split("\n") if linha.strip() != "").strip()


async def notify_lead_to_group(
    db: AsyncSession,
    channel_id: int,
    group_jid: Optional[str],
    template: Optional[str],
    lead_data: dict,
) -> bool:
    """
    Renderiza e envia o aviso do lead para o grupo. Devolve True se enviou.

    Nunca levanta: o chamador roda isso depois de gravar o lead, e um erro aqui
    não pode voltar como falha para a landing page ou para o webhook.
    """
    if not group_jid:
        return False
    try:
        from app.evolution.client import send_text
        from app.models import Channel

        result = await db.execute(select(Channel).where(Channel.id == channel_id))
        channel = result.scalar_one_or_none()
        if not channel or not channel.instance_name:
            logger.error(
                f"[GROUP_NOTIFY_FAIL] canal {channel_id} sem instância — grupo={group_jid}"
            )
            return False

        texto = render_template(template, lead_data)
        await send_text(channel.instance_name, group_jid, texto)
        logger.info(
            f"[GROUP_NOTIFY_OK] canal={channel_id} instance={channel.instance_name} "
            f"grupo={group_jid} origem={lead_data.get('origem', '')}"
        )
        return True
    except Exception as e:
        logger.error(f"[GROUP_NOTIFY_FAIL] canal={channel_id} grupo={group_jid}: {e}")
        return False


def resolve_group_target(
    notify_rules: Any,
    notify_group_jid: Optional[str],
    notify_template: Optional[str],
    origem: Optional[str],
) -> tuple[Optional[str], Optional[str]]:
    """
    Decide para qual grupo o lead vai, e com qual template.

    Existe porque a LP do GV é uma só para CAMP e High School: o programa está
    no campo `origem` do payload, não em LPs separadas, e cada programa tem seu
    grupo comercial.

    Ordem: regra que casa a origem > notify_group_jid da LP > não notifica.
    Devolve (group_jid, template).
    """
    origem_norm = (origem or "").strip().lower()

    regras = notify_rules
    if isinstance(regras, str):
        try:
            regras = json_lib.loads(regras)
        except (json_lib.JSONDecodeError, TypeError):
            regras = None

    if isinstance(regras, list) and origem_norm:
        for regra in regras:
            if not isinstance(regra, dict):
                continue
            if (regra.get("origem") or "").strip().lower() != origem_norm:
                continue
            jid = (regra.get("group_jid") or "").strip()
            if not jid:
                continue
            # template null/ausente na regra herda o da LP, e o default cobre
            # o resto lá no render.
            return jid, (regra.get("template") or notify_template)

    if notify_group_jid:
        return notify_group_jid, notify_template
    return None, None
