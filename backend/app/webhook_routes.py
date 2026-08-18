"""
Webhook de entrada para LP externas.

Gerencia webhooks por canal com mensagem de boas-vindas configurável,
pipeline/etapa de destino do lead e notificação opcional em um grupo do
WhatsApp quando o lead entra.
"""
import hashlib
import os
import json as json_lib
import logging
import re
import secrets
import time
import unicodedata
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from app.database import get_db
from app.models import Channel, Contact, Pipeline, WebhookConfig
from app.auth import get_current_user, get_tenant_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])
public_router = APIRouter(prefix="/api/webhook", tags=["Webhook Public"])


# ── Proteções do endpoint público ──────────────────────────
# O /lead/{token} é aberto na internet: sem teto, um formulário em loop (ou um
# bot) cria contato e dispara mensagem de WhatsApp a cada request.
RATE_LIMIT_MAX = 30          # requests
RATE_LIMIT_WINDOW = 60       # segundos, por token
MAX_PAYLOAD_BYTES = 8 * 1024
MAX_EXTRA_FIELDS = 30        # campos arbitrários guardados no notes
MAX_EXTRA_VALUE_LEN = 500

# Janela deslizante em memória: {token: [timestamps]}. É por processo — com
# vários workers o teto efetivo é 30/min × workers. Suficiente para o objetivo
# (conter abuso e loop de formulário).
# NOTE: janela por worker; teto global exigiria Redis
_rate_hits: dict[str, list[float]] = {}


async def _rate_limit_by_token(token: str) -> None:
    """Aplica RATE_LIMIT_MAX requests por RATE_LIMIT_WINDOW para cada token."""
    now = time.monotonic()
    cutoff = now - RATE_LIMIT_WINDOW
    hits = [t for t in _rate_hits.get(token, []) if t > cutoff]
    if len(hits) >= RATE_LIMIT_MAX:
        _rate_hits[token] = hits
        raise HTTPException(
            429,
            f"Limite de {RATE_LIMIT_MAX} requisições por minuto excedido para este webhook",
        )
    hits.append(now)
    _rate_hits[token] = hits
    # Poda tokens ociosos para a memória não crescer indefinidamente.
    if len(_rate_hits) > 1000:
        for key in [k for k, v in _rate_hits.items() if not any(t > cutoff for t in v)]:
            _rate_hits.pop(key, None)


async def _limit_payload(request: Request) -> None:
    """Recusa corpo maior que MAX_PAYLOAD_BYTES antes de parsear o JSON."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit():
        if int(declared) > MAX_PAYLOAD_BYTES:
            raise HTTPException(413, f"Payload maior que {MAX_PAYLOAD_BYTES} bytes")
        return
    # Sem content-length (transfer-encoding: chunked): lê com teto e guarda no
    # cache do Request, que é de onde o FastAPI parseia o corpo em seguida.
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_PAYLOAD_BYTES:
            raise HTTPException(413, f"Payload maior que {MAX_PAYLOAD_BYTES} bytes")
        chunks.append(chunk)
    request._body = b"".join(chunks)


# ── Helpers ────────────────────────────────────────────────
DEFAULT_NOTIFY_TEMPLATE = (
    "🔔 *Novo lead*\n"
    "👤 {name}\n"
    "📱 {phone}\n"
    "🎓 {course}\n"
    "✉️ {email}\n"
    "🔗 Origem: {origem}"
)


def _slugify(value: str) -> str:
    """
    Slug do nome do webhook. Vai para notes."origem" e é o que o relatório de
    aquisição usa como bucket do lead (reports_routes._contact_acquisition_sq).
    """
    base = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-zA-Z0-9]+", "_", base).strip("_").lower()
    return base or "webhook"


def _render_notify(template: Optional[str], ctx: dict) -> str:
    """
    Preenche os placeholders do template da notificação.

    replace() em vez de str.format(): o template é escrito pelo cliente na UI e
    qualquer chave desconhecida (ou uma chave solta) derrubaria o format() —
    e aí o lead entraria sem aviso nenhum no grupo.
    """
    text = template or DEFAULT_NOTIFY_TEMPLATE
    for key, value in ctx.items():
        text = text.replace("{" + key + "}", str(value or ""))
    return text


async def _validate_pipeline_stage(
    db: AsyncSession, tenant_id: int, pipeline_id: Optional[int], stage: Optional[str]
) -> Optional[str]:
    """
    Valida que o pipeline é do tenant e que a etapa existe nas columns dele.
    Devolve a etapa normalizada (a primeira coluna quando nenhuma foi escolhida).
    """
    if not pipeline_id:
        return stage or None
    result = await db.execute(
        select(Pipeline).where(Pipeline.id == pipeline_id, Pipeline.tenant_id == tenant_id)
    )
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(404, "Pipeline não encontrado")

    keys = [c.get("key") for c in (pipeline.columns or []) if isinstance(c, dict) and c.get("key")]
    if stage:
        if stage not in keys:
            raise HTTPException(400, f"Etapa '{stage}' não existe no pipeline '{pipeline.name}'")
        return stage
    return keys[0] if keys else None


def _webhook_payload(w: WebhookConfig, channel_name: str, pipeline_name: str, base_url: str) -> dict:
    return {
        "id": w.id,
        "name": w.name,
        "channel_id": w.channel_id,
        "channel_name": channel_name,
        "welcome_message": w.welcome_message,
        "pipeline_id": w.pipeline_id,
        "pipeline_name": pipeline_name,
        "pipeline_stage": w.pipeline_stage,
        "notify_group_jid": w.notify_group_jid,
        "notify_template": w.notify_template,
        "is_active": w.is_active,
        "url": f"{base_url}/api/webhook/lead/{w.token}",
        "created_at": w.created_at.isoformat() if w.created_at else None,
    }


# ── Listar webhooks ────────────────────────────────────────
@router.get("")
async def list_webhooks(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(
        select(WebhookConfig).where(WebhookConfig.tenant_id == tenant_id)
        .order_by(WebhookConfig.created_at.desc())
    )
    webhooks = result.scalars().all()

    channels_result = await db.execute(select(Channel).where(Channel.tenant_id == tenant_id))
    channel_names = {c.id: c.name for c in channels_result.scalars().all()}
    pipelines_result = await db.execute(select(Pipeline).where(Pipeline.tenant_id == tenant_id))
    pipeline_names = {p.id: p.name for p in pipelines_result.scalars().all()}

    base_url = os.getenv("BASE_URL", "https://portal.eduflowia.com")
    return [
        _webhook_payload(
            w,
            channel_names.get(w.channel_id, ""),
            pipeline_names.get(w.pipeline_id, "") if w.pipeline_id else "",
            base_url,
        )
        for w in webhooks
    ]


# ── Grupos disponíveis do canal ────────────────────────────
@router.get("/groups/{channel_id}")
async def list_channel_groups(
    channel_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """
    Grupos em que a instância do canal é participante, para popular o select
    de notificação. 409 quando a instância não está conectada — a Evolution só
    conhece os grupos com a sessão do WhatsApp aberta.
    """
    channel_result = await db.execute(
        select(Channel).where(Channel.id == channel_id, Channel.tenant_id == tenant_id)
    )
    channel = channel_result.scalar_one_or_none()
    if not channel:
        raise HTTPException(404, "Canal não encontrado")
    if not channel.instance_name:
        raise HTTPException(409, "Canal sem instância do WhatsApp configurada")

    from app.evolution.client import EvolutionAPIError, fetch_all_groups, get_instance_status

    try:
        status = await get_instance_status(channel.instance_name)
    except EvolutionAPIError as e:
        logger.warning(f"[WEBHOOK_GROUPS] status falhou instance={channel.instance_name}: {e}")
        raise HTTPException(409, "Não foi possível consultar o canal. Conecte o canal para listar os grupos.")
    except Exception as e:
        logger.warning(f"[WEBHOOK_GROUPS] status indisponível instance={channel.instance_name}: {e}")
        raise HTTPException(409, "Não foi possível consultar o canal. Conecte o canal para listar os grupos.")

    state = (status or {}).get("instance", {}).get("state") or (status or {}).get("state")
    if state != "open":
        raise HTTPException(409, "Conecte o canal para listar os grupos")

    try:
        groups = await fetch_all_groups(channel.instance_name)
    except Exception as e:
        logger.warning(f"[WEBHOOK_GROUPS] fetchAllGroups falhou instance={channel.instance_name}: {e}")
        raise HTTPException(409, "Não foi possível listar os grupos deste canal")

    output = []
    for g in groups:
        if not isinstance(g, dict):
            continue
        jid = g.get("id") or g.get("jid")
        if not jid:
            continue
        output.append({"jid": jid, "name": g.get("subject") or g.get("name") or jid})
    output.sort(key=lambda g: g["name"].lower())
    return output


# ── Criar webhook ──────────────────────────────────────────
class WebhookCreate(BaseModel):
    name: str
    channel_id: int
    welcome_message: str
    pipeline_id: Optional[int] = None
    pipeline_stage: Optional[str] = None
    notify_group_jid: Optional[str] = None
    notify_template: Optional[str] = None


@router.post("")
async def create_webhook(
    data: WebhookCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    # Verificar canal
    channel_result = await db.execute(
        select(Channel).where(Channel.id == data.channel_id, Channel.tenant_id == tenant_id)
    )
    if not channel_result.scalar_one_or_none():
        raise HTTPException(404, "Canal não encontrado")

    stage = await _validate_pipeline_stage(db, tenant_id, data.pipeline_id, data.pipeline_stage)

    token = secrets.token_hex(16)
    webhook = WebhookConfig(
        tenant_id=tenant_id,
        channel_id=data.channel_id,
        name=data.name,
        welcome_message=data.welcome_message,
        pipeline_id=data.pipeline_id,
        pipeline_stage=stage,
        notify_group_jid=(data.notify_group_jid or None),
        notify_template=(data.notify_template or None),
        is_active=True,
        token=token,
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)

    base_url = os.getenv("BASE_URL", "https://portal.eduflowia.com")
    return {
        "id": webhook.id,
        "url": f"{base_url}/api/webhook/lead/{token}",
        "message": "Webhook criado com sucesso",
    }


# ── Atualizar webhook ──────────────────────────────────────
class WebhookUpdate(BaseModel):
    name: Optional[str] = None
    # channel_id faltava aqui: a UI mandava o campo, o Pydantic descartava e o
    # canal do webhook ficava congelado no valor da criação.
    channel_id: Optional[int] = None
    welcome_message: Optional[str] = None
    is_active: Optional[bool] = None
    pipeline_id: Optional[int] = None
    pipeline_stage: Optional[str] = None
    notify_group_jid: Optional[str] = None
    notify_template: Optional[str] = None


@router.put("/{webhook_id}")
async def update_webhook(
    webhook_id: int,
    data: WebhookUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(
        select(WebhookConfig).where(WebhookConfig.id == webhook_id, WebhookConfig.tenant_id == tenant_id)
    )
    webhook = result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(404, "Webhook não encontrado")

    fields = data.model_dump(exclude_unset=True)

    if data.channel_id is not None:
        channel_result = await db.execute(
            select(Channel).where(Channel.id == data.channel_id, Channel.tenant_id == tenant_id)
        )
        if not channel_result.scalar_one_or_none():
            raise HTTPException(404, "Canal não encontrado")
        webhook.channel_id = data.channel_id

    # pipeline_id e pipeline_stage andam juntos: validar a etapa contra o
    # pipeline que vai ficar salvo, não contra o que veio no corpo.
    if "pipeline_id" in fields or "pipeline_stage" in fields:
        new_pipeline_id = fields.get("pipeline_id", webhook.pipeline_id)
        new_stage = fields.get("pipeline_stage", webhook.pipeline_stage)
        if not new_pipeline_id:
            webhook.pipeline_id = None
            webhook.pipeline_stage = None
        else:
            webhook.pipeline_id = new_pipeline_id
            webhook.pipeline_stage = await _validate_pipeline_stage(
                db, tenant_id, new_pipeline_id, new_stage
            )

    if data.name is not None:
        webhook.name = data.name
    if data.welcome_message is not None:
        webhook.welcome_message = data.welcome_message
    if data.is_active is not None:
        webhook.is_active = data.is_active
    if "notify_group_jid" in fields:
        webhook.notify_group_jid = data.notify_group_jid or None
    if "notify_template" in fields:
        webhook.notify_template = data.notify_template or None

    await db.commit()
    return {"message": "Webhook atualizado"}


# ── Deletar webhook ────────────────────────────────────────
@router.delete("/{webhook_id}")
async def delete_webhook(
    webhook_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(
        select(WebhookConfig).where(WebhookConfig.id == webhook_id, WebhookConfig.tenant_id == tenant_id)
    )
    webhook = result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(404, "Webhook não encontrado")

    await db.delete(webhook)
    await db.commit()
    return {"message": "Webhook removido"}


# ── Receber lead da LP externa (público) ──────────────────
class ExternalLeadData(BaseModel):
    # extra="allow": a LP pode mandar campos próprios (turno, unidade, cupom…)
    # e eles são preservados no notes do contato.
    model_config = ConfigDict(extra="allow")

    name: str = Field(max_length=255)
    phone: str = Field(max_length=30)
    course: Optional[str] = Field(default=None, max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)


def _clean_extras(raw: Optional[dict]) -> dict:
    """Campos extras do payload, limitados em quantidade e tamanho."""
    extras = {}
    for key, value in list((raw or {}).items())[:MAX_EXTRA_FIELDS]:
        if isinstance(value, (dict, list)):
            value = json_lib.dumps(value, ensure_ascii=False)
        if isinstance(value, str) and len(value) > MAX_EXTRA_VALUE_LEN:
            value = value[:MAX_EXTRA_VALUE_LEN]
        extras[str(key)[:100]] = value
    return extras


@public_router.post(
    "/lead/{token}",
    dependencies=[Depends(_limit_payload), Depends(_rate_limit_by_token)],
)
async def receive_external_lead(
    token: str,
    data: ExternalLeadData,
    db: AsyncSession = Depends(get_db),
):
    # Buscar webhook config pelo token
    webhook_result = await db.execute(
        select(WebhookConfig).where(WebhookConfig.token == token, WebhookConfig.is_active == True)
    )
    webhook = webhook_result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(404, "Webhook não encontrado ou inativo")

    # Buscar canal
    channel_result = await db.execute(
        select(Channel).where(Channel.id == webhook.channel_id, Channel.is_active == True)
    )
    channel = channel_result.scalar_one_or_none()
    if not channel:
        raise HTTPException(404, "Canal não encontrado")

    # Limpar telefone
    phone = data.phone.replace("+", "").replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
    if not phone.startswith("55"):
        phone = "55" + phone

    origem = _slugify(webhook.name)
    extras = _clean_extras(data.model_extra)

    # Criar ou atualizar contato
    existing = await db.execute(select(Contact).where(Contact.wa_id == phone, Contact.tenant_id == channel.tenant_id))
    contact = existing.scalar_one_or_none()

    # MERGE no notes existente (mesmo padrão do landing_routes): o notes guarda
    # o histórico do lead e é lido pelo relatório de aquisição — sobrescrever
    # apaga UTM/curso de submissões anteriores.
    existing_notes = {}
    if contact and contact.notes:
        try:
            parsed = json_lib.loads(contact.notes)
            if isinstance(parsed, dict):
                existing_notes = parsed
            else:
                existing_notes = {"notes_texto": str(parsed)}
        except (json_lib.JSONDecodeError, TypeError):
            # ~3% dos notes em produção são anotação livre ("MÃE DO CARLOS").
            # Guarda o texto em vez de descartá-lo.
            existing_notes = {"notes_texto": contact.notes}

    notes_data = {
        **existing_notes,
        **extras,
        # Canônicos por último: o payload da LP não pode falsear a origem do
        # lead, que é o que classifica o bucket no relatório.
        "course": data.course or existing_notes.get("course", "") or "",
        "email": data.email or existing_notes.get("email", "") or "",
        "source": "webhook_externo",
        "origem": origem,
    }
    notes = json_lib.dumps(notes_data, ensure_ascii=False)

    if not contact:
        if webhook.pipeline_id:
            pipeline_id = webhook.pipeline_id
            lead_status = webhook.pipeline_stage or "novo"
        else:
            from app.routes import resolve_pipeline_id
            pipeline_id = await resolve_pipeline_id(webhook.channel_id, webhook.tenant_id, db)
            lead_status = "novo"

        contact = Contact(
            tenant_id=webhook.tenant_id,
            wa_id=phone,
            name=data.name,
            lead_status=lead_status,
            channel_id=webhook.channel_id,
            pipeline_id=pipeline_id,
            ai_active=True,
            notes=notes,
        )
        db.add(contact)
        logger.info(
            f"[WEBHOOK_LEAD_CREATE] tenant={webhook.tenant_id} webhook={webhook.id} "
            f"wa_id={phone} pipeline_id={pipeline_id} stage={lead_status}"
        )
    else:
        contact.ai_active = True
        contact.name = data.name
        contact.notes = notes
        # Lead que já existe só é movido quando o webhook tem pipeline próprio E
        # o contato está em outro pipeline. Se ele já está no pipeline de
        # destino, a etapa atual é preservada — reenviar o formulário não pode
        # jogar um lead qualificado de volta para o começo do funil.
        if webhook.pipeline_id and contact.pipeline_id != webhook.pipeline_id:
            contact.pipeline_id = webhook.pipeline_id
            contact.lead_status = webhook.pipeline_stage or "novo"
            logger.info(
                f"[WEBHOOK_LEAD_MOVE] tenant={webhook.tenant_id} webhook={webhook.id} "
                f"wa_id={phone} pipeline_id={webhook.pipeline_id} stage={contact.lead_status}"
            )

        # Reenvio do formulário é sinal de interesse e precisa aparecer na
        # timeline do lead — é a única marca que sobra, já que a etapa não muda.
        from app.routes import log_activity
        await log_activity(
            db,
            contact_wa_id=phone,
            activity_type="webhook_resubmit",
            description=f"Reenvio de formulário pelo webhook \"{webhook.name}\"",
            metadata=json_lib.dumps(
                {
                    "webhook_id": webhook.id,
                    "origem": origem,
                    "course": data.course or "",
                },
                ensure_ascii=False,
            ),
            tenant_id=webhook.tenant_id,
            contact_id=contact.id,
        )

    await db.commit()

    # Disparar mensagem de boas-vindas
    try:
        from app.evolution.client import send_text
        message = webhook.welcome_message.replace("{nome}", data.name)
        await send_text(channel.instance_name, phone, message)
    except Exception as e:
        logger.error(f"[WEBHOOK_LEAD] erro ao enviar boas-vindas webhook={webhook.id}: {e}")

    # Notificar o grupo comercial. Pós-commit e em try/except: o lead já está
    # salvo e uma falha no grupo não pode derrubar a resposta para a LP.
    # Não grava em messages de propósito — é aviso interno, não conversa.
    if webhook.notify_group_jid:
        try:
            from app.evolution.client import send_text
            texto = _render_notify(
                webhook.notify_template,
                {
                    "name": data.name,
                    "phone": phone,
                    "course": data.course or "",
                    "email": data.email or "",
                    "origem": origem,
                },
            )
            await send_text(channel.instance_name, webhook.notify_group_jid, texto)
            logger.info(
                f"[WEBHOOK_NOTIFY_OK] webhook={webhook.id} grupo={webhook.notify_group_jid}"
            )
        except Exception as e:
            logger.error(
                f"[WEBHOOK_NOTIFY_FAIL] webhook={webhook.id} "
                f"grupo={webhook.notify_group_jid}: {e}"
            )

    return JSONResponse({"status": "ok", "message": "Lead recebido com sucesso"})
