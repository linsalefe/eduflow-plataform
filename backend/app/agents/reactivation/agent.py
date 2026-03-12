from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Contact
from app.agents.orchestrator.orchestrator import AgentEvent, get_context


class ReactivationAgent:

    SCENARIOS = {
        "no_show":     "Oi {name}! Vi que não conseguiu no horário combinado. Sem problemas! Quer remarcar? 😊",
        "no_answer_3": "Oi {name}! Tentei te ligar algumas vezes mas não consegui falar. Posso te ajudar de outra forma?",
        "cold_7d":     "Oi {name}! Tudo bem? Passando para saber se ainda tem interesse no curso. Posso te contar mais detalhes? 😊",
    }

    async def handle(self, event: AgentEvent, db: AsyncSession):
        print(f"🔄 ReactivationAgent acionado para lead {event.lead_id} | evento: {event.event_type}")

        scenario = self._detect_scenario(event)
        if not scenario:
            print(f"⏭️ Nenhum cenário de reativação detectado para evento '{event.event_type}'")
            return

        # Buscar lead
        lead_result = await db.execute(
            select(Contact).where(Contact.id == event.lead_id)
        )
        lead = lead_result.scalar_one_or_none()
        if not lead:
            print(f"❌ Lead {event.lead_id} não encontrado")
            return

        msg = self._build_message(scenario, lead)
        await self._send_whatsapp(lead.wa_id, msg, event.tenant_id, db)

    def _detect_scenario(self, event: AgentEvent) -> str:
        mapping = {
            "meeting_no_show": "no_show",
            "no_answer_3":     "no_answer_3",
            "cold_7d":         "cold_7d",
            "call_completed":  self._from_call_completed(event),
        }

        # Evento vindo do kanban trigger → tratar como lead frio
        if event.event_type.startswith("kanban_"):
            return "cold_7d"

        return mapping.get(event.event_type, "")

    def _from_call_completed(self, event: AgentEvent) -> str:
        outcome = event.payload.get("outcome", "")
        if outcome == "not_qualified":
            return "cold_7d"
        return ""

    def _build_message(self, scenario: str, lead: Contact) -> str:
        name = (lead.name or "").split()[0] if lead.name else "Lead"
        template = self.SCENARIOS.get(scenario, "")
        return template.format(name=name)

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
            print(f"✅ Mensagem de reativação enviada para {phone}")

        except Exception as e:
            print(f"❌ Erro ao enviar WhatsApp reativação: {e}")