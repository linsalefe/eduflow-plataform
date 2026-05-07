# backend/app/agent_routes_workflow.py
"""
Endpoints de leitura de AIConfigs pra uso em Workflows.

Mantido em arquivo separado pra não tocar app/ai_routes.py (CRUD legado
do agente-de-canal). Esses endpoints são read-only e seguros.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import AIConfig, Channel, User

router = APIRouter(prefix="/api/agents", tags=["AgentsWorkflow"])


class WorkflowAgentSummary(BaseModel):
    id: int
    name: str
    icon: Optional[str] = None
    model: Optional[str] = None
    has_tools: bool
    tools_count: int
    outcomes_count: int
    channel_id: Optional[int] = None
    channel_name: Optional[str] = None
    is_isolated: bool  # True se também serve como agente-de-canal


class WorkflowAgentDetail(WorkflowAgentSummary):
    system_prompt: Optional[str] = None
    temperature: Optional[str] = None
    max_tokens: Optional[int] = None
    tools: list[str] = []
    outcomes: list[str] = []


@router.get("/workflow-eligible", response_model=list[WorkflowAgentSummary])
async def list_workflow_eligible_agents(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Lista todos os AIConfigs do tenant que estão prontos pra serem
    usados em um nó-Agente de Workflow (ou seja, têm `tools` setado).

    Inclui:
      - Agentes "puros" de biblioteca (channel_id=NULL, tools=[...])
      - Agentes mistos (channel_id setado E tools setado)

    NÃO inclui:
      - Agentes só-canal (tools=NULL) — esses precisam ser editados primeiro
        pra ganhar tools/outcomes antes de aparecerem aqui.
    """
    res = await db.execute(
        select(AIConfig, Channel.name.label("channel_name"))
        .outerjoin(Channel, Channel.id == AIConfig.channel_id)
        .where(AIConfig.tenant_id == user.tenant_id)
        .where(AIConfig.tools.isnot(None))
        .order_by(AIConfig.name.asc())
    )
    rows = res.all()
    return [
        WorkflowAgentSummary(
            id=ac.id,
            name=ac.name,
            icon=ac.icon,
            model=ac.model,
            has_tools=True,
            tools_count=len(ac.tools or []),
            outcomes_count=len(ac.outcomes or []),
            channel_id=ac.channel_id,
            channel_name=ch_name,
            is_isolated=ac.channel_id is not None,
        )
        for ac, ch_name in rows
    ]


@router.get("/workflow-eligible/{agent_id}", response_model=WorkflowAgentDetail)
async def get_workflow_agent(
    agent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retorna detalhes completos de um agente pra usar/editar em workflow."""
    res = await db.execute(
        select(AIConfig, Channel.name.label("channel_name"))
        .outerjoin(Channel, Channel.id == AIConfig.channel_id)
        .where(AIConfig.id == agent_id)
        .where(AIConfig.tenant_id == user.tenant_id)
    )
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Agente não encontrado pro tenant")
    ac, ch_name = row

    return WorkflowAgentDetail(
        id=ac.id,
        name=ac.name,
        icon=ac.icon,
        model=ac.model,
        has_tools=ac.tools is not None,
        tools_count=len(ac.tools or []),
        outcomes_count=len(ac.outcomes or []),
        channel_id=ac.channel_id,
        channel_name=ch_name,
        is_isolated=ac.channel_id is not None,
        system_prompt=ac.system_prompt,
        temperature=ac.temperature,
        max_tokens=ac.max_tokens,
        tools=list(ac.tools or []),
        outcomes=list(ac.outcomes or []),
    )
