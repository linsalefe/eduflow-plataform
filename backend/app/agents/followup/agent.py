from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Contact, Tenant, Schedule
from app.agents.orchestrator.orchestrator import AgentEvent, get_or_create_context


def parse_meeting_datetime(collected_fields: dict) -> Optional[datetime]:
    try:
        data_str = collected_fields.get("data_agendamento", "")
        hora_str = collected_fields.get("hora_agendamento", "")
        if data_str and hora_str:
            dt = datetime.strptime(f"{data_str} {hora_str}", "%d/%m/%Y %H:%M")
            return dt
        return None
    except Exception as e:
        print(f"⚠️ Erro ao parsear data da reunião: {e} | campos={collected_fields}")
        return None


def _render_template(template: str, **kwargs) -> str:
    """Substitui variáveis {nome}, {data}, {hora}, {interesse}, {empresa} no template."""
    for key, value in kwargs.items():
        template = template.replace(f"{{{key}}}", value or "")
    return template


class FollowupAgent:

    async def _get_templates(self, tenant: Tenant) -> dict:
        messages = tenant.agent_messages or {}
        followup = messages.get("followup", {})
        return {
            "confirmation": followup.get("confirmation",
                "Oi {nome}! 😊 Ficou confirmado o nosso bate-papo para *{data} às {hora}*. Qualquer dúvida pode me chamar aqui. Até lá! 👋"),
            "reminder_d1": followup.get("reminder_d1",
                "Oi {nome}! 😊 Só passando para lembrar que amanhã temos nosso bate-papo agendado para às {hora}. Te espero lá!"),
            "reminder_d0": followup.get("reminder_d0",
                "Oi {nome}! 🎯 Daqui a pouco temos nosso bate-papo! Esteja à vontade para tirar todas as suas dúvidas. Até já! 😊"),
        }

    async def handle(self, event: AgentEvent, db: AsyncSession):
        print(f"📋 FollowupAgent acionado para lead {event.lead_id}")
        payload = event.payload or {}
        outcome = payload.get("outcome", "")

        # Permite disparo por kanban (sem outcome) ou por ligação qualificada
        if outcome and outcome != "qualified":
            print(f"⏭️ Outcome '{outcome}' não requer follow-up. Ignorando.")
            return

        # Buscar lead
        lead_result = await db.execute(select(Contact).where(Contact.id == event.lead_id))
        lead = lead_result.scalar_one_or_none()
        if not lead:
            print(f"❌ Lead {event.lead_id} não encontrado")
            return

        # Buscar tenant
        tenant_result = await db.execute(select(Tenant).where(Tenant.id == event.tenant_id))
        tenant = tenant_result.scalar_one_or_none()
        if not tenant:
            print(f"❌ Tenant {event.tenant_id} não encontrado")
            return

        # Atualizar contexto
        collected_fields = payload.get("collected_fields", {})
        ctx = await get_or_create_context(event.lead_id, event.tenant_id, db)
        ctx.call_outcome = outcome
        ctx.call_summary = payload.get("summary", "")
        ctx.last_event = "call_completed"

        meeting_date = parse_meeting_datetime(collected_fields)
        if meeting_date:
            ctx.meeting_date = meeting_date
            print(f"📅 Reunião agendada para: {meeting_date}")
        else:
            print(f"⚠️ Não foi possível parsear a data da reunião. Campos: {collected_fields}")

        await db.commit()

        phone = lead.wa_id
        if not phone:
            print(f"❌ Lead {event.lead_id} sem telefone")
            return

        lead_name = (lead.name or "").split()[0] if lead.name else "Lead"
        templates = await self._get_templates(tenant)

        # Montar variáveis
        data_str = collected_fields.get("data_agendamento") or collected_fields.get("dia_agendamento") or ""
        hora_str = collected_fields.get("hora_agendamento") or collected_fields.get("horario_agendamento") or ""

        # Agendar lembretes (confirmação já é feita pela Nat no WhatsApp)
        
        if meeting_date:
            await self._schedule_reminders(lead, meeting_date, event.tenant_id, db, templates, lead_name, hora_str)

    async def _send_whatsapp(self, phone: str, message: str, tenant_id: int, db: AsyncSession):
        try:
            from app.evolution.client import send_text
            from app.models import Channel
            channel_result = await db.execute(
                select(Channel).where(
                    Channel.tenant_id == tenant_id,
                    Channel.is_active == True,
                    Channel.type == "whatsapp",
                )
            )
            channel = channel_result.scalars().first()
            if not channel:
                print(f"❌ Nenhum canal WhatsApp ativo para tenant {tenant_id}")
                return
            await send_text(channel.instance_name, phone, message)
            print(f"✅ Mensagem de follow-up enviada para {phone}")
        except Exception as e:
            print(f"❌ Erro ao enviar WhatsApp follow-up: {e}")

    async def _schedule_reminders(
        self, lead, meeting_date: datetime, tenant_id: int, db: AsyncSession,
        templates: dict, lead_name: str, hora_str: str
    ):
        try:
            lead_name_full = lead.name or "Lead"

            # Lembrete D-1
            d1 = (meeting_date - timedelta(days=1)).replace(hour=9, minute=0, second=0)
            if d1 > datetime.utcnow():
                msg_d1 = _render_template(templates["reminder_d1"], nome=lead_name, hora=hora_str, data="", interesse="", empresa="")
                db.add(Schedule(
                    tenant_id=tenant_id,
                    contact_wa_id=lead.wa_id,
                    phone=lead.wa_id,
                    contact_name=lead_name_full,
                    scheduled_at=d1,
                    scheduled_date=d1.strftime("%d/%m/%Y"),
                    scheduled_time=d1.strftime("%H:%M"),
                    type="followup_reminder",
                    status="pending",
                    notes=msg_d1,
                ))
                print(f"📅 Lembrete D-1 agendado para {d1}")

            # Lembrete D-0
            d0 = meeting_date - timedelta(hours=2)
            if d0 > datetime.utcnow():
                msg_d0 = _render_template(templates["reminder_d0"], nome=lead_name, hora=hora_str, data="", interesse="", empresa="")
                db.add(Schedule(
                    tenant_id=tenant_id,
                    contact_wa_id=lead.wa_id,
                    phone=lead.wa_id,
                    contact_name=lead_name_full,
                    scheduled_at=d0,
                    scheduled_date=d0.strftime("%d/%m/%Y"),
                    scheduled_time=d0.strftime("%H:%M"),
                    type="followup_reminder",
                    status="pending",
                    notes=msg_d0,
                ))
                print(f"📅 Lembrete D-0 agendado para {d0}")

            # Briefing
            briefing_time = meeting_date - timedelta(minutes=15)
            if briefing_time > datetime.utcnow():
                db.add(Schedule(
                    tenant_id=tenant_id,
                    contact_wa_id=lead.wa_id,
                    phone=lead.wa_id,
                    contact_name=lead_name_full,
                    scheduled_at=briefing_time,
                    scheduled_date=briefing_time.strftime("%d/%m/%Y"),
                    scheduled_time=briefing_time.strftime("%H:%M"),
                    type="briefing_agent",
                    status="pending",
                    notes="Briefing automático 15min antes da reunião",
                ))
                print(f"📋 Briefing agendado para {briefing_time}")

            await db.commit()
        except Exception as e:
            print(f"❌ Erro ao agendar lembretes: {e}")