# backend/app/jarvis/actions.py
"""
Executores de ações do Jarvis.
Cada action resolve o lead pelo nome, prepara os dados e executa.
Todas requerem confirmação prévia do frontend.
"""
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Contact, Channel, Schedule, Tenant
from app.evolution.client import send_text
from app.voice_ai_elevenlabs.voice_pipeline import make_outbound_call

logger = logging.getLogger(__name__)

SP_TZ = timezone(timedelta(hours=-3))


# ============================================================
# HELPER — Resolver lead pelo nome (fuzzy)
# ============================================================
async def resolve_lead(name: str, tenant_id: int, db: AsyncSession) -> dict | None:
    """Busca lead pelo nome (case insensitive, parcial)."""
    from sqlalchemy import and_
    clean_name = name.lower().strip()
    words = clean_name.split()

    # Busca por cada palavra separadamente (ignora acentos)
    word_filters = [
        func.lower(func.unaccent(Contact.name)).contains(func.unaccent(w))
        for w in words
    ]

    result = await db.execute(
        select(Contact)
        .where(Contact.tenant_id == tenant_id)
        .where(and_(*word_filters))
        .order_by(Contact.updated_at.desc())
        .limit(1)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        return None

    # Buscar canal do lead (ou primeiro WhatsApp ativo como fallback)
    channel = None
    if contact.channel_id:
        ch_result = await db.execute(
            select(Channel).where(Channel.id == contact.channel_id)
        )
        channel = ch_result.scalar_one_or_none()

    if not channel:
        ch_result = await db.execute(
            select(Channel)
            .where(Channel.tenant_id == tenant_id)
            .where(Channel.type == "whatsapp")
            .where(Channel.is_active == True)
            .limit(1)
        )
        channel = ch_result.scalar_one_or_none()

    # Buscar TODOS os canais WhatsApp ativos do tenant
    all_channels_result = await db.execute(
        select(Channel)
        .where(Channel.tenant_id == tenant_id)
        .where(Channel.type == "whatsapp")
        .where(Channel.is_active == True)
    )
    all_channels = all_channels_result.scalars().all()

    return {
        "contact_id": contact.id,
        "name": contact.name or "Sem nome",
        "wa_id": contact.wa_id,
        "phone": contact.wa_id,
        "lead_status": contact.lead_status,
        "channel_id": channel.id if channel else None,
        "instance_name": channel.instance_name if channel else None,
        "available_channels": [
            {"id": ch.id, "name": ch.name, "instance_name": ch.instance_name}
            for ch in all_channels
        ],
    }


# ============================================================
# PREPARE — Monta o pending_action (antes da confirmação)
# ============================================================
async def prepare_action(tool_name: str, args: dict, tenant_id: int, db: AsyncSession) -> dict:
    """Prepara a ação sem executar. Retorna dados para confirmação."""

    lead_name = args.get("lead_name", "")
    lead = await resolve_lead(lead_name, tenant_id, db)

    if not lead:
        return {
            "action": tool_name,
            "error": f"Lead '{lead_name}' não encontrado no sistema.",
            "requires_confirmation": False,
        }

    if tool_name == "action_send_followup":
        message = args.get("message") or f"Oi {lead['name']}! 😊 Tudo bem? Passando para saber se ainda tem interesse. Posso te ajudar com alguma dúvida?"
        return {
            "action": "send_followup",
            "requires_confirmation": True,
            "description": f"Enviar follow-up via WhatsApp para {lead['name']}",
            "details": {
                "lead_name": lead["name"],
                "wa_id": lead["wa_id"],
                "message": message,
                "channel_id": lead["channel_id"],
                "instance_name": lead["instance_name"],
                "available_channels": lead["available_channels"],
            },
        }

    elif tool_name == "action_make_call":
        course = args.get("course", "")
        phone = lead["phone"]
        if not phone.startswith("+"):
            phone = f"+{phone}"
        return {
            "action": "make_call",
            "requires_confirmation": True,
            "description": f"Ligar para {lead['name']}" + (f" sobre {course}" if course else ""),
            "details": {
                "lead_name": lead["name"],
                "phone": phone,
                "course": course,
            },
        }

    elif tool_name == "action_move_pipeline":
        target = args.get("target_stage", "")
        valid_stages = ["novo", "em_contato", "qualificado", "em_matricula", "matriculado", "perdido"]
        if target not in valid_stages:
            return {
                "action": "move_pipeline",
                "error": f"Coluna '{target}' inválida. Use: {', '.join(valid_stages)}",
                "requires_confirmation": False,
            }
        return {
            "action": "move_pipeline",
            "requires_confirmation": True,
            "description": f"Mover {lead['name']} para coluna '{target}'",
            "details": {
                "lead_name": lead["name"],
                "contact_id": lead["contact_id"],
                "wa_id": lead["wa_id"],
                "current_stage": lead["lead_status"],
                "target_stage": target,
            },
        }

    elif tool_name == "action_schedule":
        date = args.get("date", "")
        time = args.get("time", "")
        stype = args.get("type", "consultant")
        course = args.get("course", "")

        if not date or not time:
            return {
                "action": "schedule",
                "error": "Data e hora são obrigatórias para agendar.",
                "requires_confirmation": False,
            }

        return {
            "action": "schedule",
            "requires_confirmation": True,
            "description": f"Agendar {stype} com {lead['name']} para {date} às {time}" + (f" ({course})" if course else ""),
            "details": {
                "lead_name": lead["name"],
                "wa_id": lead["wa_id"],
                "phone": lead["phone"],
                "date": date,
                "time": time,
                "type": stype,
                "course": course,
                "channel_id": lead["channel_id"],
            },
        }

    return {"action": tool_name, "error": "Ação não reconhecida", "requires_confirmation": False}


# ============================================================
# EXECUTE — Executa a ação confirmada
# ============================================================
async def execute_action(action: str, details: dict, tenant_id: int, db: AsyncSession) -> dict:
    """Executa a ação após confirmação do usuário."""

    try:
        if action == "send_followup":
            return await _exec_followup(details, tenant_id, db)
        elif action == "make_call":
            return await _exec_call(details)
        elif action == "move_pipeline":
            return await _exec_move(details, tenant_id, db)
        elif action == "schedule":
            return await _exec_schedule(details, tenant_id, db)
        else:
            return {"success": False, "message": f"Ação '{action}' não reconhecida"}
    except Exception as e:
        logger.error(f"[Jarvis Action] Erro ao executar {action}: {e}", exc_info=True)
        return {"success": False, "message": f"Erro ao executar: {str(e)}"}


async def _exec_followup(details: dict, tenant_id: int, db: AsyncSession) -> dict:
    """Envia mensagem de follow-up via WhatsApp (Evolution API)."""
    instance = details.get("instance_name")
    wa_id = details.get("wa_id")
    message = details.get("message")

    if not instance:
        return {"success": False, "message": "Canal WhatsApp não configurado para este tenant"}

    result = await send_text(instance, wa_id, message)
    logger.info(f"[Jarvis] Follow-up enviado para {details['lead_name']}: {result}")

    return {
        "success": True,
        "message": f"Mensagem de follow-up enviada para {details['lead_name']}",
    }


async def _exec_call(details: dict) -> dict:
    """Dispara ligação via ElevenLabs Voice."""
    phone = details.get("phone", "")
    lead_name = details.get("lead_name", "")
    course = details.get("course", "")

    # Fix BR mobile: wa_id pode estar sem o 9° dígito (55 + DDD + 8 dígitos = 12)
    # Formato correto: +55 + DDD(2) + 9 + número(8) = 13 dígitos
    clean = phone.replace("+", "")
    if clean.startswith("55") and len(clean) == 12:
        clean = clean[:4] + "9" + clean[4:]
    phone = f"+{clean}"

    result = make_outbound_call(
        to_number=phone,
        lead_name=lead_name,
        course=course,
    )

    if result.get("success"):
        return {
            "success": True,
            "message": f"Ligação disparada para {lead_name}" + (f" sobre {course}" if course else ""),
        }
    else:
        return {
            "success": False,
            "message": f"Erro ao ligar: {result.get('error', 'desconhecido')}",
        }


async def _exec_move(details: dict, tenant_id: int, db: AsyncSession) -> dict:
    """Move lead no pipeline."""
    contact_id = details.get("contact_id")
    target = details.get("target_stage")

    result = await db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == tenant_id)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        return {"success": False, "message": "Lead não encontrado"}

    old_status = contact.lead_status
    contact.lead_status = target
    await db.commit()

    return {
        "success": True,
        "message": f"{details['lead_name']} movido de '{old_status}' para '{target}'",
    }


async def _exec_schedule(details: dict, tenant_id: int, db: AsyncSession) -> dict:
    """Cria agendamento."""
    scheduled_dt = datetime.strptime(f"{details['date']} {details['time']}", "%Y-%m-%d %H:%M")

    schedule = Schedule(
        tenant_id=tenant_id,
        type=details.get("type", "consultant"),
        contact_wa_id=details["wa_id"],
        contact_name=details["lead_name"],
        phone=details["phone"],
        course=details.get("course", ""),
        scheduled_date=details["date"],
        scheduled_time=details["time"],
        scheduled_at=scheduled_dt,
        status="pending",
        channel_id=details.get("channel_id"),
    )
    db.add(schedule)
    await db.commit()

    return {
        "success": True,
        "message": f"Agendamento criado para {details['lead_name']} em {details['date']} às {details['time']}",
    }