"""
CRM Adapter - Integra o Voice AI com o CRM existente (Exact Spotter + interno).
Responsável por: criar/atualizar leads, notas, etapa do funil, score.

FIX #8: channel_id NULL → busca o primeiro channel disponível como fallback
"""
import httpx
import os
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Contact, ExactLead, AIConversationSummary, Channel
from app.voice_ai.models import AICall


EXACT_TOKEN = os.getenv("EXACT_SPOTTER_TOKEN", "")
EXACT_USER_ID = int(os.getenv("EXACT_USER_ID", "415875"))


async def update_lead_after_call(call: AICall, db: AsyncSession):
    """
    Atualiza o lead no CRM após a chamada da IA.
    1. Atualiza Contact interno (status, notas)
    2. Posta na timeline do Exact Spotter
    3. Move no funil se necessário
    """
    contact = None

    # === 1. Atualizar Contact interno ===
    if call.contact_wa_id:
        result = await db.execute(
            select(Contact).where(Contact.wa_id == call.contact_wa_id, Contact.tenant_id == call.tenant_id)
        )
        contact = result.scalar_one_or_none()

        if contact:
            # Atualizar status baseado no outcome
            status_map = {
                "qualified": "qualificado",
                "scheduled": "agendado",
                "transferred": "em_atendimento",
                "follow_up": "follow_up",
                "not_qualified": "nao_qualificado",
                "no_answer": "nao_atendeu",
                "busy": "ocupado",
            }
            new_status = status_map.get(call.outcome, contact.lead_status)
            contact.lead_status = new_status

            # Atualizar notas
            note = f"[IA Voice - {datetime.now().strftime('%d/%m %H:%M')}] "
            note += f"Score: {call.score}/100 | Resultado: {call.outcome}"
            if call.collected_fields:
                fields_str = ", ".join(f"{k}: {v}" for k, v in call.collected_fields.items())
                note += f" | Dados: {fields_str}"
            if call.objections:
                note += f" | Objeções: {', '.join(call.objections)}"

            existing_notes = contact.notes or ""
            contact.notes = f"{note}\n{existing_notes}".strip()

    # === 2. Criar/Atualizar card no Kanban ===
    if call.contact_wa_id:
        result = await db.execute(
            select(AIConversationSummary).where(
                AIConversationSummary.contact_wa_id == call.contact_wa_id
            )
        )
        summary = result.scalar_one_or_none()

        if not summary:
            # FIX #8: Determinar channel_id de forma robusta
            channel_id = None

            # Prioridade 1: channel_id do contato
            if contact and contact.channel_id:
                channel_id = contact.channel_id

            # Prioridade 2: buscar primeiro channel ativo como fallback
            if not channel_id:
                ch_result = await db.execute(
                    select(Channel.id).where(Channel.is_active == True).limit(1)
                )
                first_channel = ch_result.scalar_one_or_none()
                if first_channel:
                    channel_id = first_channel
                    print(f"⚠️ CRM: Usando channel_id fallback={channel_id} para {call.contact_wa_id}")

            # Se AINDA não tem channel_id, não cria o summary (evita crash)
            if not channel_id:
                print(f"❌ CRM: Sem channel_id disponível — pulando AIConversationSummary para {call.contact_wa_id}")
            else:
                summary = AIConversationSummary(
                    contact_wa_id=call.contact_wa_id,
                    contact_id=contact.id if contact else None,
                    channel_id=channel_id,
                    status=_outcome_to_kanban_status(call.outcome),
                    summary=call.summary,
                    lead_name=call.lead_name,
                    lead_course=call.course,
                    ai_messages_count=call.total_turns,
                )
                db.add(summary)
        else:
            summary.status = _outcome_to_kanban_status(call.outcome)
            summary.summary = call.summary
            summary.ai_messages_count = (summary.ai_messages_count or 0) + call.total_turns

    try:
        await db.commit()
    except Exception as e:
        print(f"❌ CRM commit error: {e}")
        await db.rollback()

    # === 3. Postar no Exact Spotter ===
    if call.lead_id:
        await _post_to_exact_timeline(call)


async def _post_to_exact_timeline(call: AICall):
    """Posta resumo da ligação na timeline do Exact Spotter."""
    if not EXACT_TOKEN:
        return

    text = f"""📞 LIGAÇÃO IA (Nat)
📅 {datetime.now().strftime('%d/%m/%Y %H:%M')}
👤 Lead: {call.lead_name or 'N/A'}
🎓 Curso: {call.course or 'N/A'}
📊 Score: {call.score}/100
⏱️ Duração: {call.duration_seconds or 0}s
🎯 Resultado: {call.outcome or 'N/A'}
📌 Dados: {_format_fields(call.collected_fields)}
⚠️ Objeções: {', '.join(call.objections) if call.objections else 'Nenhuma'}
📝 {call.summary or 'Sem resumo'}"""

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.exactspotter.com/v3/timelineAdd",
                headers={
                    "Content-Type": "application/json",
                    "token_exact": EXACT_TOKEN,
                },
                json={
                    "leadId": call.lead_id,
                    "text": text,
                    "userId": EXACT_USER_ID,
                },
                timeout=10,
            )
            print(f"📝 Exact Spotter timeline (IA): {resp.status_code}")
    except Exception as e:
        print(f"❌ Erro ao postar no Exact: {e}")


async def move_lead_in_funnel(exact_lead_id: int, stage: str):
    """Move lead para outra etapa no funil do Exact Spotter."""
    if not EXACT_TOKEN:
        return

    stage_map = {
        "qualified": "Qualificado pela IA",
        "scheduled": "Reunião Agendada",
        "transferred": "Em Atendimento",
        "not_qualified": "Não Qualificado",
    }

    target_stage = stage_map.get(stage)
    if not target_stage:
        return

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.exactspotter.com/v3/leads/updateStage",
                headers={
                    "Content-Type": "application/json",
                    "token_exact": EXACT_TOKEN,
                },
                json={
                    "leadId": exact_lead_id,
                    "stage": target_stage,
                },
                timeout=10,
            )
            print(f"📊 Lead movido no funil: {target_stage} ({resp.status_code})")
    except Exception as e:
        print(f"❌ Erro ao mover lead no funil: {e}")


def _outcome_to_kanban_status(outcome: str) -> str:
    """Converte outcome da IA para status do kanban."""
    mapping = {
        "qualified": "qualificado_ia",
        "scheduled": "agendado",
        "transferred": "em_atendimento",
        "follow_up": "follow_up",
        "not_qualified": "nao_qualificado",
        "no_answer": "nao_atendeu",
        "busy": "tentar_novamente",
    }
    return mapping.get(outcome, "em_atendimento_ia")


def _format_fields(fields: dict) -> str:
    """Formata campos coletados para exibição."""
    if not fields:
        return "Nenhum"
    return ", ".join(f"{k}: {v}" for k, v in fields.items())