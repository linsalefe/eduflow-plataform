from datetime import datetime
from typing import Optional
from dataclasses import dataclass, field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import LeadAgentContext, Tenant


@dataclass
class AgentEvent:
    lead_id: int
    tenant_id: int
    event_type: str  # whatsapp_qualified | call_completed | meeting_no_show
    payload: dict = field(default_factory=dict)


async def get_context(lead_id: int, tenant_id: int, db: AsyncSession) -> Optional[LeadAgentContext]:
    result = await db.execute(
        select(LeadAgentContext).where(
            LeadAgentContext.lead_id == lead_id,
            LeadAgentContext.tenant_id == tenant_id,
        )
    )
    return result.scalar_one_or_none()


async def get_or_create_context(lead_id: int, tenant_id: int, db: AsyncSession) -> LeadAgentContext:
    ctx = await get_context(lead_id, tenant_id, db)
    if not ctx:
        ctx = LeadAgentContext(lead_id=lead_id, tenant_id=tenant_id)
        db.add(ctx)
        await db.flush()
    return ctx


class AgentOrchestrator:

    async def on_event(self, event: AgentEvent, db: AsyncSession):
        print(f"🤖 Orquestrador recebeu evento: {event.event_type} | lead_id={event.lead_id}")

        tenant_result = await db.execute(
            select(Tenant).where(Tenant.id == event.tenant_id)
        )
        tenant = tenant_result.scalar_one_or_none()
        if not tenant:
            print(f"❌ Tenant {event.tenant_id} não encontrado")
            return

        ctx = await get_or_create_context(event.lead_id, event.tenant_id, db)

        # Verifica lock
        if ctx.locked_until and ctx.locked_until > datetime.utcnow():
            print(f"🔒 Lead {event.lead_id} bloqueado até {ctx.locked_until}. Evento ignorado.")
            return

        action = self._decide(event, ctx, tenant)
        print(f"➡️  Ação decidida: {action}")

        if action:
            await self._execute(action, event, ctx, tenant, db)

    def _decide(self, event: AgentEvent, ctx: LeadAgentContext, tenant: Tenant) -> Optional[str]:
        flags = tenant.agent_flags or {}
        plan = tenant.agent_plan_flags or {}

        if event.event_type == "whatsapp_qualified":
            if plan.get("voice") and flags.get("voice"):
                return "TRIGGER_VOICE_CALL"
            return "NOTIFY_HUMAN"

        elif event.event_type == "call_completed":
            outcome = event.payload.get("outcome", "")
            if outcome == "qualified" and plan.get("followup") and flags.get("followup"):
                return "TRIGGER_FOLLOWUP"
            elif outcome == "not_qualified" and plan.get("reactivation") and flags.get("reactivation"):
                return "TRIGGER_REACTIVATION"

        elif event.event_type == "meeting_no_show":
            if plan.get("reactivation") and flags.get("reactivation"):
                return "TRIGGER_REACTIVATION"
        elif event.event_type.startswith("kanban_"):
            agent = event.event_type.replace("kanban_", "")
            if plan.get(agent) and flags.get(agent):
                if agent == "followup":
                    return "TRIGGER_FOLLOWUP"
                elif agent == "reactivation":
                    return "TRIGGER_REACTIVATION"
                elif agent == "voice":
                    return "TRIGGER_VOICE_CALL"
                elif agent == "whatsapp":
                    return "TRIGGER_WHATSAPP"
        return None

    async def _execute(self, action: str, event: AgentEvent, ctx: LeadAgentContext, tenant: Tenant, db: AsyncSession):
        if action == "TRIGGER_FOLLOWUP":
            from app.agents.followup.agent import FollowupAgent
            await FollowupAgent().handle(event, db)

        elif action == "TRIGGER_REACTIVATION":
            from app.agents.reactivation.agent import ReactivationAgent
            await ReactivationAgent().handle(event, db)

        elif action == "TRIGGER_VOICE_CALL":
            print(f"📞 Agendando ligação para lead {event.lead_id}")

        elif action == "NOTIFY_HUMAN":
            print(f"👤 Lead {event.lead_id} encaminhado para atendimento humano")


orchestrator = AgentOrchestrator()