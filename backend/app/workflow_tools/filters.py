# backend/app/workflow_tools/filters.py
"""
Filtra as tools disponíveis pra um tenant baseado em feature flags
(tenant.features) e plan flags (tenant.agent_plan_flags).

Padrão espelha jarvis/filters.py mas usa a estrutura ToolDef.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tenant
from app.workflow_tools.base import ToolDef, registry


async def get_available_tools_for_tenant(tenant_id: int, db: AsyncSession) -> list[ToolDef]:
    """
    Retorna apenas as tools liberadas pro tenant.

    Critério:
      - Tool com feature_flag: tenant.features[flag] precisa ser True (default True se ausente).
      - Tool com plan_flag:    tenant.agent_plan_flags[flag] precisa ser True (default False se ausente).
      - Tool sem nenhuma flag: passa direto.
    """
    res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = res.scalar_one_or_none()
    if not tenant:
        return []

    features = tenant.features or {}
    plan_flags = tenant.agent_plan_flags or {}

    available: list[ToolDef] = []
    for tool in registry.all():
        if tool.feature_flag is not None:
            # Default True pra retrocompat com tenants antigos
            if not bool(features.get(tool.feature_flag, True)):
                continue
        if tool.plan_flag is not None:
            # Default False — plan precisa ser explicitamente liberado
            if not bool(plan_flags.get(tool.plan_flag, False)):
                continue
        available.append(tool)
    return available


async def filter_tools_by_names(
    tenant_id: int,
    selected_names: list[str],
    db: AsyncSession,
) -> list[ToolDef]:
    """
    Resolve a interseção entre:
      - tools selecionadas pelo user no nó-Agente (selected_names)
      - tools liberadas pro tenant (feature/plan)

    Tools selecionadas que não existem ou estão bloqueadas são silenciosamente removidas.
    Mantém a ordem de selected_names.
    """
    available = await get_available_tools_for_tenant(tenant_id, db)
    available_by_name = {t.name: t for t in available}
    return [available_by_name[n] for n in selected_names if n in available_by_name]
