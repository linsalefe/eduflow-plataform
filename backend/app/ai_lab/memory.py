"""
Memória Persistente do Lead — Frente 2 do plano de melhorias de IA.

Fluxo:
1. Após cada resposta do agente, `should_update_memory()` decide se é hora de extrair.
2. Se for, `update_lead_memory()` roda em background: chama gpt-4o-mini com a memória
   atual + últimas 15 msgs, recebe memória ATUALIZADA como JSON, salva em contacts.
3. Antes da próxima resposta, `format_memory_for_prompt()` converte o JSON em texto
   injetado no system_prompt do agente (M.2).

Throttle híbrido (decisão da Sprint 3):
- Atualiza SE (retorno após 30+ min de inatividade) OU (>= 10 msgs novas do lead).
- Primeira vez sempre atualiza.

Feature flag: `tenant.features.ai_lead_memory` (bool, default false).
"""
import os
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models import Contact, Message, Tenant, TokenUsage

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ─── Constantes ───────────────────────────────────────────
MEMORY_MODEL = "gpt-4o-mini"
MEMORY_TEMPERATURE = 0.2
MEMORY_MAX_MESSAGES = 15
MEMORY_MAX_CHARS_PER_MSG = 300
MEMORY_MAX_ITEMS_PER_CATEGORY = 10

# Throttle híbrido
MEMORY_RETURN_THRESHOLD_MINUTES = 30
MEMORY_MSG_COUNT_THRESHOLD = 10

SP_TZ = timezone(timedelta(hours=-3))

EMPTY_MEMORY: dict = {
    "personal_facts": [],
    "preferences": [],
    "objections": [],
    "journey_context": "",
}


# ─── Decisão de throttle ──────────────────────────────────

async def should_update_memory(
    contact: Contact,
    db: AsyncSession,
) -> tuple[bool, str]:
    """
    Decide se a memória deste contato deve ser atualizada AGORA.

    Regras (híbrida, Opção 4 da Sprint 3):
    - Primeira vez (ai_memory_updated_at = NULL) -> sempre atualiza
    - Se passou >= 30 min desde última atualização E tem >= 1 msg nova do lead
      -> atualiza ("retorno")
    - Se >= 10 msgs novas do lead desde última atualização -> atualiza ("fallback")

    Retorna (bool, motivo) pra log/debug.
    """
    if not contact.ai_memory_updated_at:
        return True, "first_time"

    now = datetime.now(SP_TZ)
    last_update = contact.ai_memory_updated_at
    if last_update.tzinfo is None:
        last_update = last_update.replace(tzinfo=SP_TZ)

    minutes_since = (now - last_update).total_seconds() / 60.0

    # Conta msgs do lead (inbound) desde a última atualização
    # Message.created_at é naive (sem timezone), então comparamos com naive também
    cutoff = last_update.replace(tzinfo=None)
    msg_count_result = await db.execute(
        select(func.count(Message.id)).where(
            and_(
                Message.tenant_id == contact.tenant_id,
                Message.contact_wa_id == contact.wa_id,
                Message.direction == "inbound",
                Message.created_at > cutoff,
            )
        )
    )
    new_inbound_count = int(msg_count_result.scalar() or 0)

    # Trigger 1: retorno após inatividade
    if minutes_since >= MEMORY_RETURN_THRESHOLD_MINUTES and new_inbound_count >= 1:
        return True, f"return_after_{int(minutes_since)}min"

    # Trigger 2: fallback por volume de mensagens
    if new_inbound_count >= MEMORY_MSG_COUNT_THRESHOLD:
        return True, f"every_{new_inbound_count}_msgs"

    return False, f"skip (min={int(minutes_since)}, new_msgs={new_inbound_count})"


async def tenant_has_memory_enabled(tenant_id: int, db: AsyncSession) -> bool:
    """Checa a feature flag ai_lead_memory no Tenant."""
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant or not tenant.features:
        return False
    return bool(tenant.features.get("ai_lead_memory", False))


# ─── Extração via GPT-4o-mini ─────────────────────────────

def _build_extraction_prompt() -> str:
    return (
        "Você é um extrator de fatos sobre um lead em conversas de vendas por WhatsApp.\n\n"
        "Sua tarefa: atualizar a MEMÓRIA do lead com base em mensagens recentes.\n\n"
        "REGRAS ABSOLUTAS:\n"
        "1. NUNCA invente, deduza ou suponha fatos. Só extraia o que o lead disse explicitamente.\n"
        "2. NUNCA remova fatos da memória atual, a menos que o lead contradiga diretamente.\n"
        "3. Se o lead mudou de opinião, SUBSTITUA o item antigo (não adicione os dois).\n"
        "4. Frases curtas: no máximo 15 palavras por item.\n"
        "5. Português brasileiro, minúsculas (exceto nomes próprios).\n"
        "6. Máximo 10 itens por categoria.\n\n"
        "CATEGORIAS:\n"
        "- personal_facts: fatos sobre a pessoa/negócio do lead "
        "(profissão, empresa, tamanho, localização, situação).\n"
        "- preferences: preferências explícitas (horário, canal, formato, estilo).\n"
        "- objections: objeções mencionadas (preço, prazo, concorrente, dúvida técnica).\n"
        "- journey_context: texto curto (1 frase) com o momento atual na jornada. "
        "Ex: 'aguardando envio da proposta', 'pediu tempo pra pensar'.\n\n"
        "FORMATO DE RESPOSTA (JSON estrito, sem markdown):\n"
        '{"personal_facts": [...], "preferences": [...], "objections": [...], "journey_context": "..."}'
    )


def _truncate(text: str, max_chars: int) -> str:
    if not text:
        return ""
    text = text.strip()
    return text if len(text) <= max_chars else text[:max_chars] + "…"


def _format_messages_for_extraction(messages: list[Message]) -> str:
    lines = []
    for m in messages:
        role = "Lead" if m.direction == "inbound" else "IA"
        content = _truncate(m.content or "", MEMORY_MAX_CHARS_PER_MSG)
        if not content:
            continue
        lines.append(f"{role}: {content}")
    return "\n".join(lines)


def _sanitize_memory(raw: Any) -> dict:
    """Garante estrutura válida mesmo se o GPT devolver algo fora do padrão."""
    if not isinstance(raw, dict):
        return dict(EMPTY_MEMORY)
    out = dict(EMPTY_MEMORY)

    for key in ("personal_facts", "preferences", "objections"):
        val = raw.get(key, [])
        if not isinstance(val, list):
            val = []
        cleaned = [
            str(item).strip()
            for item in val
            if isinstance(item, (str, int, float)) and str(item).strip()
        ]
        out[key] = cleaned[:MEMORY_MAX_ITEMS_PER_CATEGORY]

    jc = raw.get("journey_context", "")
    out["journey_context"] = str(jc).strip()[:500] if jc else ""

    return out


async def _log_memory_token_usage(
    db: AsyncSession,
    tenant_id: int,
    usage: Any,
) -> None:
    try:
        if not usage:
            return
        token_record = TokenUsage(
            tenant_id=tenant_id,
            source="memory_extraction",
            module="ai_lab",
            model=MEMORY_MODEL,
            prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
            total_tokens=getattr(usage, "total_tokens", 0) or 0,
        )
        db.add(token_record)
    except Exception as e:
        logger.error(f"[ai_lab.memory] Falha ao logar token_usage: {e}")


async def extract_memory_from_messages(
    existing_memory: dict,
    messages: list[Message],
    db: AsyncSession,
    tenant_id: int,
) -> dict | None:
    """
    Chama gpt-4o-mini passando memória atual + msgs recentes.
    Retorna memória atualizada (dict) ou None em caso de falha.
    """
    if not messages:
        return None

    memory_in = _sanitize_memory(existing_memory or {})
    msgs_text = _format_messages_for_extraction(messages)
    if not msgs_text:
        return None

    user_content = (
        f"MEMÓRIA ATUAL DO LEAD (JSON):\n{json.dumps(memory_in, ensure_ascii=False)}\n\n"
        f"NOVAS MENSAGENS (ordem cronológica):\n{msgs_text}\n\n"
        "Devolva APENAS o JSON da memória ATUALIZADA."
    )

    try:
        response = await client.chat.completions.create(
            model=MEMORY_MODEL,
            temperature=MEMORY_TEMPERATURE,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _build_extraction_prompt()},
                {"role": "user", "content": user_content},
            ],
        )
        await _log_memory_token_usage(db, tenant_id, response.usage)

        raw = response.choices[0].message.content or "{}"
        parsed = json.loads(raw)
        return _sanitize_memory(parsed)
    except json.JSONDecodeError as e:
        logger.error(f"[ai_lab.memory] JSON inválido do GPT: {e}")
        return None
    except Exception as e:
        logger.error(f"[ai_lab.memory] Erro na chamada OpenAI: {e}")
        return None


# ─── Orquestrador ─────────────────────────────────────────

async def update_lead_memory(
    contact_id: int,
    db: AsyncSession,
    force: bool = False,
) -> dict | None:
    """
    Orquestra a atualização da memória de um contato.
    Retorna a nova memória ou None (skip, erro ou feature desligada).

    Best-effort: nunca levanta exceção pra fora.
    """
    try:
        contact_result = await db.execute(select(Contact).where(Contact.id == contact_id))
        contact = contact_result.scalar_one_or_none()
        if not contact:
            return None

        if not await tenant_has_memory_enabled(contact.tenant_id, db):
            return None

        if not force:
            should, reason = await should_update_memory(contact, db)
            if not should:
                logger.debug(f"[ai_lab.memory] skip contact={contact_id} reason={reason}")
                return None
        else:
            reason = "forced"

        # Busca últimas N msgs (ordem cronológica)
        msg_result = await db.execute(
            select(Message)
            .where(
                and_(
                    Message.tenant_id == contact.tenant_id,
                    Message.contact_wa_id == contact.wa_id,
                )
            )
            .order_by(desc(Message.id))
            .limit(MEMORY_MAX_MESSAGES)
        )
        messages = list(msg_result.scalars().all())
        messages.reverse()
        if not messages:
            return None

        existing = contact.ai_memory if isinstance(contact.ai_memory, dict) else {}
        new_memory = await extract_memory_from_messages(
            existing_memory=existing,
            messages=messages,
            db=db,
            tenant_id=contact.tenant_id,
        )
        if new_memory is None:
            return None

        # Persiste
        contact.ai_memory = new_memory
        flag_modified(contact, "ai_memory")
        contact.ai_memory_updated_at = datetime.now(SP_TZ)

        await db.commit()
        logger.info(
            f"[ai_lab.memory] updated contact={contact_id} tenant={contact.tenant_id} "
            f"reason={reason} facts={len(new_memory.get('personal_facts', []))} "
            f"objections={len(new_memory.get('objections', []))}"
        )
        return new_memory
    except Exception as e:
        logger.error(f"[ai_lab.memory] erro geral em update_lead_memory: {e}")
        try:
            await db.rollback()
        except Exception:
            pass
        return None


# ─── Formatação para prompt do agente (usado no M.2) ──────

def format_memory_for_prompt(memory: dict | None) -> str:
    """
    Converte o JSON da memória em um bloco de texto pra injetar no system_prompt do agente.
    Retorna string vazia se a memória for vazia ou None.
    """
    if not memory or not isinstance(memory, dict):
        return ""

    mem = _sanitize_memory(memory)
    facts = mem.get("personal_facts") or []
    prefs = mem.get("preferences") or []
    objs = mem.get("objections") or []
    jc = mem.get("journey_context") or ""

    if not (facts or prefs or objs or jc):
        return ""

    lines = ["", "VOCÊ JÁ SABE SOBRE ESTE LEAD:"]
    if facts:
        lines.append("Fatos: " + "; ".join(facts))
    if prefs:
        lines.append("Preferências: " + "; ".join(prefs))
    if objs:
        lines.append("Objeções conhecidas: " + "; ".join(objs))
    if jc:
        lines.append(f"Momento atual: {jc}")
    lines.append(
        "Use esse conhecimento para não repetir perguntas já respondidas e manter a conversa fluida."
    )
    return "\n".join(lines)
