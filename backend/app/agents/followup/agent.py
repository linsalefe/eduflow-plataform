from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Contact, Tenant
from app.agents.orchestrator.orchestrator import AgentEvent, get_or_create_context


def parse_meeting_datetime(collected_fields: dict) -> Optional[datetime]:
    """Tenta extrair a data/hora da reunião dos campos coletados pela Nat."""
    try:
        # Formato 1: data_agendamento + hora_agendamento
        data_str = collected_fields.get("data_agendamento", "")
        hora_str = collected_fields.get("hora_agendamento", "")

        if data_str and hora_str:
            # Tenta DD/MM/YYYY HH:MM
            dt = datetime.strptime(f"{data_str} {hora_str}", "%d/%m/%Y %H:%M")
            return dt

        # Formato 2: dia_agendamento (nome do dia) + horario_agendamento
        # Nesse caso não temos data exata, retorna None por ora
        return None

    except Exception as e:
        print(f"⚠️ Erro ao parsear data da reunião: {e} | campos={collected_fields}")
        return None


class FollowupAgent:

    async def handle(self, event: AgentEvent, db: AsyncSession):
        print(f"📋 FollowupAgent acionado para lead {event.lead_id}")

        payload = event.payload or {}
        outcome = payload.get("outcome", "")

        if outcome != "qualified":
            print(f"⏭️ Outcome '{outcome}' não requer follow-up. Ignorando.")
            return

        # Buscar lead
        lead_result = await db.execute(
            select(Contact).where(Contact.id == event.lead_id)
        )
        lead = lead_result.scalar_one_or_none()
        if not lead:
            print(f"❌ Lead {event.lead_id} não encontrado")
            return

        # Buscar tenant
        tenant_result = await db.execute(
            select(Tenant).where(Tenant.id == event.tenant_id)
        )
        tenant = tenant_result.scalar_one_or_none()
        if not tenant:
            print(f"❌ Tenant {event.tenant_id} não encontrado")
            return

        # Atualizar contexto com dados da ligação
        collected_fields = payload.get("collected_fields", {})
        ctx = await get_or_create_context(event.lead_id, event.tenant_id, db)
        ctx.call_outcome = outcome
        ctx.call_summary = payload.get("summary", "")
        ctx.last_event = "call_completed"

        # Parsear data da reunião
        meeting_date = parse_meeting_datetime(collected_fields)
        if meeting_date:
            ctx.meeting_date = meeting_date
            print(f"📅 Reunião agendada para: {meeting_date}")
        else:
            print(f"⚠️ Não foi possível parsear a data da reunião. Campos: {collected_fields}")

        await db.commit()

        # Enviar mensagem imediata de confirmação
        phone = lead.wa_id
        if not phone:
            print(f"❌ Lead {event.lead_id} sem telefone")
            return

        lead_name = (lead.name or "").split()[0] if lead.name else "Lead"
        msg = self._build_confirmation_msg(lead_name, collected_fields)

        await self._send_whatsapp(phone, msg, event.tenant_id, db)

        # Agendar lembretes se tiver data
        if meeting_date:
            await self._schedule_reminders(lead, meeting_date, event.tenant_id, db)

    def _build_confirmation_msg(self, name: str, fields: dict) -> str:
        data = fields.get("data_agendamento") or fields.get("dia_agendamento") or ""
        hora = fields.get("hora_agendamento") or fields.get("horario_agendamento") or ""

        msg = f"Oi {name}! 😊 Aqui é a Nat.\n\n"
        msg += "Que ótimo papo! Ficou confirmado o nosso bate-papo"

        if data and hora:
            msg += f" para *{data} às {hora}*"
        elif data:
            msg += f" para *{data}*"

        msg += ".\n\n"
        msg += "Qualquer dúvida pode me chamar aqui. Até lá! 👋"
        return msg

    async def _send_whatsapp(self, phone: str, message: str, tenant_id: int, db: AsyncSession):
        """Envia mensagem via Evolution API."""
        try:
            from app.evolution.client import send_text
            from app.models import Channel

            # Buscar canal ativo do tenant
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

    async def _schedule_reminders(self, lead: Contact, meeting_date: datetime, tenant_id: int, db: AsyncSession):
        """Agenda lembretes D-1 e D-0."""
        try:
            from app.models import Schedule

            lead_name = lead.name or "Lead"
            phone = lead.wa_id

            # Lembrete D-1 (dia anterior às 9h)
            d1 = (meeting_date - timedelta(days=1)).replace(hour=9, minute=0, second=0)
            if d1 > datetime.utcnow():
                db.add(Schedule(
                    tenant_id=tenant_id,
                    contact_wa_id=lead.wa_id,
                    phone=phone,
                    contact_name=lead_name,
                    scheduled_at=d1,
                    scheduled_date=d1.strftime("%d/%m/%Y"),
                    scheduled_time=d1.strftime("%H:%M"),
                    type="followup_reminder",
                    status="pending",
                    notes="Lembrete D-1 da reunião",
                ))
                print(f"📅 Lembrete D-1 agendado para {d1}")

            # Lembrete D-0 (2 horas antes)
            d0 = meeting_date - timedelta(hours=2)
            if d0 > datetime.utcnow():
                db.add(Schedule(
                    tenant_id=tenant_id,
                    contact_wa_id=lead.wa_id,
                    phone=phone,
                    contact_name=lead_name,
                    scheduled_at=d0,
                    scheduled_date=d0.strftime("%d/%m/%Y"),
                    scheduled_time=d0.strftime("%H:%M"),
                    type="followup_reminder",
                    status="pending",
                    notes="Lembrete D-0 da reunião (2h antes)",
                ))
                print(f"📅 Lembrete D-0 agendado para {d0}")

            await db.commit()

        except Exception as e:
            print(f"❌ Erro ao agendar lembretes: {e}")