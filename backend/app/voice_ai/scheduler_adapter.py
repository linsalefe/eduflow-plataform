"""
Scheduler Adapter - Agendamento de reuniões + confirmação.
Integra com Google Calendar e WhatsApp/SMS para confirmações.
"""
import os
from datetime import datetime, timedelta
from typing import Optional
from app.google_calendar import (
    get_available_dates, get_available_slots, create_event, CALENDARS
)
from app.whatsapp import send_text_message
from app.voice_ai.config import WHATSAPP_FOLLOWUP_ENABLED


# Calendar padrão para agendamentos da IA
DEFAULT_CALENDAR = os.getenv("VOICE_AI_CALENDAR", "victoria")


async def get_next_available_slots(days_ahead: int = 3, max_slots: int = 6) -> list[dict]:
    """
    Retorna próximos horários disponíveis para o LLM oferecer.
    Formato: [{"date": "2026-02-20", "weekday": "Sexta", "time": "10:00"}, ...]
    """
    try:
        cal_id = CALENDARS[DEFAULT_CALENDAR]["calendar_id"]
        dates = await get_available_dates(cal_id, days_ahead=days_ahead)

        slots = []
        for d in dates:
            available = await get_available_slots(cal_id, d["date"])
            for s in available[:3]:  # Max 3 slots por dia
                slots.append({
                    "date": d["date"],
                    "weekday": d["weekday"],
                    "time": s["start"],
                })
                if len(slots) >= max_slots:
                    return slots
        return slots
    except Exception as e:
        print(f"⚠️ Erro ao buscar slots: {e}")
        return []


async def schedule_meeting(
    lead_name: str,
    lead_phone: str,
    course: str,
    date_str: str,
    time_str: str,
    duration_min: int = 30,
) -> dict:
    """
    Agenda reunião no Google Calendar e retorna dados do evento.
    """
    try:
        cal_id = CALENDARS[DEFAULT_CALENDAR]["calendar_id"]
        closer_name = CALENDARS[DEFAULT_CALENDAR]["name"]

        start_dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
        end_dt = start_dt + timedelta(minutes=duration_min)

        summary = f"📞 Ligação - {lead_name} ({course})"
        description = (
            f"Lead: {lead_name}\n"
            f"Telefone: {lead_phone}\n"
            f"Curso: {course}\n"
            f"Agendado pela IA Nat (Voice AI)\n"
            f"Closer: {closer_name}"
        )

        event = await create_event(cal_id, summary, description, start_dt, end_dt)

        return {
            "success": True,
            "event_link": event.get("htmlLink", ""),
            "date": date_str,
            "time": time_str,
            "closer": closer_name,
        }
    except Exception as e:
        print(f"❌ Erro ao agendar: {e}")
        return {"success": False, "error": str(e)}


async def send_schedule_confirmation(
    phone: str,
    lead_name: str,
    course: str,
    date_str: str,
    time_str: str,
    channel_phone_number_id: str = None,
    channel_token: str = None,
) -> bool:
    """
    Envia confirmação de agendamento por WhatsApp.
    """
    if not WHATSAPP_FOLLOWUP_ENABLED:
        return False

    # Formatar data para PT-BR
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        weekdays = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]
        date_formatted = f"{weekdays[dt.weekday()]}, {dt.strftime('%d/%m')}"
    except Exception:
        date_formatted = date_str

    text = (
        f"✅ *Agendamento Confirmado*\n\n"
        f"Oi, {lead_name}! 👋\n\n"
        f"Sua conversa sobre o curso de *{course}* está marcada:\n\n"
        f"📅 *{date_formatted}* às *{time_str}*\n"
        f"📞 Nossa consultora vai te ligar nesse horário.\n\n"
        f"Qualquer coisa, é só responder aqui! 😊"
    )

    try:
        if channel_phone_number_id and channel_token:
            result = await send_text_message(
                to=phone,
                text=text,
                phone_number_id=channel_phone_number_id,
                token=channel_token,
            )
            return "messages" in result
        else:
            print(f"⚠️ WhatsApp não configurado para confirmação")
            return False
    except Exception as e:
        print(f"❌ Erro ao enviar WhatsApp: {e}")
        return False


async def send_followup_message(
    phone: str,
    lead_name: str,
    course: str,
    channel_phone_number_id: str = None,
    channel_token: str = None,
) -> bool:
    """
    Envia mensagem de follow-up por WhatsApp quando o lead pede pra pensar.
    """
    if not WHATSAPP_FOLLOWUP_ENABLED:
        return False

    text = (
        f"Oi, {lead_name}! 👋\n\n"
        f"Aqui é a Nat, da equipe de atendimento. Acabamos de conversar sobre o curso de *{course}*.\n\n"
        f"Fico à disposição pra qualquer dúvida! Se quiser agendar uma conversa mais detalhada "
        f"com nossa consultora, é só me responder aqui. 😊\n\n"
        f"Bons estudos! 📚"
    )

    try:
        if channel_phone_number_id and channel_token:
            result = await send_text_message(
                to=phone,
                text=text,
                phone_number_id=channel_phone_number_id,
                token=channel_token,
            )
            return "messages" in result
        return False
    except Exception as e:
        print(f"❌ Erro ao enviar follow-up: {e}")
        return False
