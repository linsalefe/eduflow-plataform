# backend/app/jarvis/filters.py
"""
Filtra as tools do Jarvis expostas ao GPT com base em agent_plan_flags
e features do tenant. Evita que o modelo chame tools de features que
o tenant não contratou ou desabilitou.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Tenant
from app.jarvis.tools import JARVIS_TOOLS

# Tools globalmente desativadas (independente do plano).
# Motivo: tabela financial_entries vazia — reativar quando a
# gestão financeira for melhorada no CRM.
DISABLED_TOOLS: set[str] = {"get_revenue_summary", "get_goal_progress"}

# Mapa: nome da tool → lista de (tipo, chave). tipo: "plan" | "feature".
# Se TODAS as chaves forem False, a tool é removida.
TOOL_GATES: dict[str, list[tuple[str, str]]] = {
    # Action tools
    "action_send_followup": [("plan", "whatsapp")],
    "action_make_call": [("plan", "voice")],
    "action_schedule": [("feature", "agenda")],

    # Query tools específicas
    "get_upcoming_schedules": [("feature", "agenda")],
    "get_my_tasks": [("feature", "tarefas")],
    "get_form_submissions_summary": [("feature", "landing_pages")],
    "get_landing_page_performance": [("feature", "landing_pages")],
    "get_agent_performance": [("plan", "whatsapp")],  # sem whatsapp não há dado
}


async def get_available_tools(tenant_id: int, db: AsyncSession) -> list[dict]:
    """
    Retorna apenas as tools liberadas para o tenant com base em
    agent_plan_flags e features. Tools em DISABLED_TOOLS são sempre
    removidas. Tools sem gate passam direto.
    """
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        return []

    plan_flags = tenant.agent_plan_flags or {}
    features = tenant.features or {}

    allowed: list[dict] = []
    for tool in JARVIS_TOOLS:
        name = tool["function"]["name"]

        if name in DISABLED_TOOLS:
            continue

        gates = TOOL_GATES.get(name)
        if gates is None:
            allowed.append(tool)
            continue

        passes = True
        for gate_type, key in gates:
            source = plan_flags if gate_type == "plan" else features
            # Default True para features (retrocompat), False para plan
            default = True if gate_type == "feature" else False
            if not bool(source.get(key, default)):
                passes = False
                break

        if passes:
            allowed.append(tool)

    return allowed
