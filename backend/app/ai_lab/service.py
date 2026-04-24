"""
Camada de serviço do Laboratório do Agente.
Isola lógica de negócio das rotas FastAPI.
"""
import logging
from typing import Any, Optional

from sqlalchemy import select, func, and_, desc, delete, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIFeedback, Message, Contact
from app.ai_lab.few_shot import generate_context_embedding

logger = logging.getLogger(__name__)

VALID_RATINGS = {"up", "down", "edit"}
VALID_REASONS = {
    "tom_errado",
    "info_errada",
    "avancou_rapido",
    "parou_cedo",
    "outro",
}


# ─────────────────────────────────────────────────────────────
# Validação / helpers
# ─────────────────────────────────────────────────────────────

async def _ensure_message_belongs_to_tenant(
    db: AsyncSession,
    message_id: int,
    tenant_id: int,
) -> Message:
    """Retorna a Message se pertencer ao tenant. Senão, levanta ValueError."""
    result = await db.execute(
        select(Message).where(
            and_(Message.id == message_id, Message.tenant_id == tenant_id)
        )
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise ValueError(f"Message {message_id} não encontrada ou não pertence ao tenant")
    return msg


async def _build_fallback_context(
    db: AsyncSession,
    tenant_id: int,
    contact_wa_id: str,
    before_message_id: int,
    window: int = 5,
) -> list[dict]:
    """Pega as últimas N mensagens do contato ANTES da mensagem alvo."""
    result = await db.execute(
        select(Message)
        .where(
            and_(
                Message.tenant_id == tenant_id,
                Message.contact_wa_id == contact_wa_id,
                Message.id < before_message_id,
            )
        )
        .order_by(desc(Message.id))
        .limit(window)
    )
    msgs = list(result.scalars().all())
    msgs.reverse()  # ordem cronológica
    return [
        {
            "role": "assistant" if m.sent_by_ai else "user",
            "content": m.content or "",
        }
        for m in msgs
    ]


# ─────────────────────────────────────────────────────────────
# CRUD de feedback
# ─────────────────────────────────────────────────────────────

async def save_feedback(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    message_id: int,
    rating: str,
    reason: Optional[str] = None,
    corrected_response: Optional[str] = None,
    context_snippet: Optional[list[dict]] = None,
) -> AIFeedback:
    """
    Cria ou atualiza feedback do usuário para uma mensagem da IA.

    Regras:
    - rating deve estar em VALID_RATINGS
    - se rating='edit', corrected_response é obrigatório e gera embedding
    - se context_snippet não for informado, deriva das últimas 5 msgs do contato
    - se já existe feedback do mesmo user para mesmo message_id, atualiza
    """
    if rating not in VALID_RATINGS:
        raise ValueError(f"rating inválido: {rating}. Use: {VALID_RATINGS}")

    if rating == "edit" and not (corrected_response and corrected_response.strip()):
        raise ValueError("corrected_response é obrigatório quando rating='edit'")

    if reason and reason not in VALID_REASONS:
        raise ValueError(f"reason inválido: {reason}. Use: {VALID_REASONS}")

    msg = await _ensure_message_belongs_to_tenant(db, message_id, tenant_id)

    # Fallback: deriva contexto se não veio do frontend
    if context_snippet is None or len(context_snippet) == 0:
        context_snippet = await _build_fallback_context(
            db, tenant_id, msg.contact_wa_id, msg.id
        )

    # Upsert: busca feedback existente do mesmo user
    existing_result = await db.execute(
        select(AIFeedback).where(
            and_(
                AIFeedback.message_id == message_id,
                AIFeedback.user_id == user_id,
                AIFeedback.tenant_id == tenant_id,
            )
        )
    )
    feedback = existing_result.scalar_one_or_none()

    # Gera embedding só se for edit e houver contexto
    embedding = None
    if rating == "edit" and context_snippet:
        ctx_text = "\n".join(
            f"{'Lead' if m.get('role') == 'user' else 'IA'}: {m.get('content', '')}"
            for m in context_snippet
        )
        embedding = await generate_context_embedding(ctx_text)
        if embedding is None:
            logger.warning(
                f"[ai_lab.service] Embedding falhou para message_id={message_id}. "
                "Feedback será salvo sem embedding — não entrará em few-shot."
            )

    if feedback:
        # UPDATE
        feedback.rating = rating
        feedback.reason = reason
        feedback.corrected_response = corrected_response
        feedback.context_snippet = context_snippet
        if embedding is not None:
            feedback.context_embedding = embedding
        elif rating != "edit":
            feedback.context_embedding = None  # limpa se rating mudou pra up/down
    else:
        # INSERT
        # Buscar contact para dual-write
        _ct = (await db.execute(select(Contact).where(
            Contact.wa_id == msg.contact_wa_id, Contact.tenant_id == tenant_id,
        ))).scalar_one_or_none()

        feedback = AIFeedback(
            tenant_id=tenant_id,
            message_id=message_id,
            contact_wa_id=msg.contact_wa_id,
            contact_id=_ct.id if _ct else None,
            rating=rating,
            reason=reason,
            corrected_response=corrected_response,
            context_snippet=context_snippet,
            context_embedding=embedding,
            user_id=user_id,
        )
        db.add(feedback)

    await db.commit()
    await db.refresh(feedback)
    return feedback


# ─────────────────────────────────────────────────────────────
# Listagens / stats
# ─────────────────────────────────────────────────────────────

async def list_conversations_with_ai(
    db: AsyncSession,
    tenant_id: int,
    limit: int = 30,
    offset: int = 0,
    filter_type: str = "all",
) -> list[dict]:
    """
    Lista contatos que tiveram ao menos 1 mensagem da IA.
    Retorna último timestamp + totais de feedback pra render na lista do Lab.

    filter_type:
      - 'all'        : todos
      - 'unreviewed' : contatos sem nenhum feedback
      - 'reviewed'   : contatos com pelo menos 1 feedback
      - 'edits'      : contatos com pelo menos 1 correção (rating='edit')
    """
    # Subquery: agregado de feedbacks por contato
    fb_agg = (
        select(
            AIFeedback.contact_wa_id.label("cw"),
            func.count(AIFeedback.id).label("fb_total"),
            func.sum(
                case((AIFeedback.rating == "up", 1), else_=0)
            ).label("fb_up"),
            func.sum(
                case((AIFeedback.rating == "down", 1), else_=0)
            ).label("fb_down"),
            func.sum(
                case((AIFeedback.rating == "edit", 1), else_=0)
            ).label("fb_edit"),
        )
        .where(AIFeedback.tenant_id == tenant_id)
        .group_by(AIFeedback.contact_wa_id)
        .subquery()
    )

    # Conversas com mensagens da IA
    base = (
        select(
            Message.contact_wa_id.label("wa_id"),
            func.max(Message.id).label("last_msg_id"),
            func.max(Message.timestamp).label("last_msg_at"),
            func.count(Message.id).label("ai_msg_count"),
            func.coalesce(fb_agg.c.fb_total, 0).label("fb_total"),
            func.coalesce(fb_agg.c.fb_up, 0).label("fb_up"),
            func.coalesce(fb_agg.c.fb_down, 0).label("fb_down"),
            func.coalesce(fb_agg.c.fb_edit, 0).label("fb_edit"),
        )
        .select_from(Message)
        .outerjoin(fb_agg, fb_agg.c.cw == Message.contact_wa_id)
        .where(
            and_(
                Message.tenant_id == tenant_id,
                Message.sent_by_ai == True,  # noqa: E712
            )
        )
        .group_by(
            Message.contact_wa_id,
            fb_agg.c.fb_total,
            fb_agg.c.fb_up,
            fb_agg.c.fb_down,
            fb_agg.c.fb_edit,
        )
    )

    # Filtros
    if filter_type == "unreviewed":
        base = base.having(func.coalesce(fb_agg.c.fb_total, 0) == 0)
    elif filter_type == "reviewed":
        base = base.having(func.coalesce(fb_agg.c.fb_total, 0) > 0)
    elif filter_type == "edits":
        base = base.having(func.coalesce(fb_agg.c.fb_edit, 0) > 0)

    base = base.order_by(desc("last_msg_at")).limit(limit).offset(offset)

    result = await db.execute(base)
    rows = result.all()

    # Completa com dados do contato (nome, avatar)
    out = []
    for r in rows:
        c_result = await db.execute(
            select(Contact).where(
                and_(
                    Contact.tenant_id == tenant_id,
                    Contact.wa_id == r.wa_id,
                )
            )
        )
        contact = c_result.scalar_one_or_none()
        out.append({
            "contact_wa_id": r.wa_id,
            "contact_name": contact.name if contact else r.wa_id,
            "profile_picture_url": contact.profile_picture_url if contact else None,
            "last_message_at": r.last_msg_at.isoformat() if r.last_msg_at else None,
            "ai_message_count": int(r.ai_msg_count or 0),
            "feedback_total": int(r.fb_total or 0),
            "feedback_up": int(r.fb_up or 0),
            "feedback_down": int(r.fb_down or 0),
            "feedback_edit": int(r.fb_edit or 0),
        })
    return out


async def get_conversation_detail(
    db: AsyncSession,
    tenant_id: int,
    contact_wa_id: str,
    limit: int = 50,
) -> dict:
    """
    Retorna as N últimas mensagens do contato + feedback existente por message_id.
    """
    # Contato
    c_result = await db.execute(
        select(Contact).where(
            and_(
                Contact.tenant_id == tenant_id,
                Contact.wa_id == contact_wa_id,
            )
        )
    )
    contact = c_result.scalar_one_or_none()
    if not contact:
        raise ValueError(f"Contato {contact_wa_id} não encontrado no tenant {tenant_id}")

    # Mensagens (últimas N, ordem cronológica)
    m_result = await db.execute(
        select(Message)
        .where(
            and_(
                Message.tenant_id == tenant_id,
                Message.contact_id == contact.id,
            )
        )
        .order_by(desc(Message.id))
        .limit(limit)
    )
    msgs = list(m_result.scalars().all())
    msgs.reverse()

    # Feedbacks existentes (mapeados por message_id)
    f_result = await db.execute(
        select(AIFeedback).where(
            and_(
                AIFeedback.tenant_id == tenant_id,
                AIFeedback.contact_id == contact.id,
            )
        )
    )
    fb_by_msg: dict[int, AIFeedback] = {}
    for fb in f_result.scalars().all():
        fb_by_msg[fb.message_id] = fb

    messages_out = []
    for m in msgs:
        fb = fb_by_msg.get(m.id)
        messages_out.append({
            "id": m.id,
            "direction": m.direction,
            "sent_by_ai": m.sent_by_ai,
            "content": m.content,
            "timestamp": m.timestamp.isoformat() if m.timestamp else None,
            "feedback": (
                {
                    "id": fb.id,
                    "rating": fb.rating,
                    "reason": fb.reason,
                    "corrected_response": fb.corrected_response,
                    "created_at": fb.created_at.isoformat() if fb.created_at else None,
                }
                if fb
                else None
            ),
        })

    return {
        "contact": {
            "wa_id": contact.wa_id,
            "name": contact.name,
            "profile_picture_url": contact.profile_picture_url,
            "lead_status": contact.lead_status,
        },
        "messages": messages_out,
    }


async def get_stats(db: AsyncSession, tenant_id: int) -> dict:
    """Agregados para dashboard do Laboratório."""
    # Totais por rating
    agg = await db.execute(
        select(
            AIFeedback.rating,
            func.count(AIFeedback.id),
        )
        .where(AIFeedback.tenant_id == tenant_id)
        .group_by(AIFeedback.rating)
    )
    by_rating = {row[0]: int(row[1]) for row in agg.all()}

    total = sum(by_rating.values())
    up = by_rating.get("up", 0)
    down = by_rating.get("down", 0)
    edit = by_rating.get("edit", 0)

    # Quantas correções têm embedding (elegíveis pra few-shot)
    embed_result = await db.execute(
        select(func.count(AIFeedback.id)).where(
            and_(
                AIFeedback.tenant_id == tenant_id,
                AIFeedback.rating == "edit",
                AIFeedback.context_embedding.is_not(None),
            )
        )
    )
    eligible_for_fewshot = int(embed_result.scalar() or 0)

    # Últimas 5 correções
    recent_result = await db.execute(
        select(AIFeedback)
        .where(
            and_(
                AIFeedback.tenant_id == tenant_id,
                AIFeedback.rating == "edit",
            )
        )
        .order_by(desc(AIFeedback.created_at))
        .limit(5)
    )
    recent_edits = [
        {
            "id": fb.id,
            "contact_wa_id": fb.contact_wa_id,
            "corrected_response": (fb.corrected_response or "")[:160],
            "created_at": fb.created_at.isoformat() if fb.created_at else None,
        }
        for fb in recent_result.scalars().all()
    ]

    approval_rate = round(up / total, 3) if total else 0.0

    return {
        "total_feedback": total,
        "up": up,
        "down": down,
        "edit": edit,
        "approval_rate": approval_rate,
        "eligible_for_fewshot": eligible_for_fewshot,
        "recent_edits": recent_edits,
    }


async def delete_feedback(
    db: AsyncSession,
    tenant_id: int,
    feedback_id: int,
) -> bool:
    """Deleta um feedback. Retorna True se deletou, False se não encontrou."""
    result = await db.execute(
        select(AIFeedback).where(
            and_(
                AIFeedback.id == feedback_id,
                AIFeedback.tenant_id == tenant_id,
            )
        )
    )
    fb = result.scalar_one_or_none()
    if not fb:
        return False
    await db.delete(fb)
    await db.commit()
    return True
