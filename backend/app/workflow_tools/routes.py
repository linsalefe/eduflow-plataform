# backend/app/workflow_tools/routes.py
"""
Endpoints do Workflow Tools:
  - GET  /api/workflow-tools/available   lista tools liberadas pro tenant
  - POST /api/workflow-tools/test        executa o agent em modo seguro (dry-ish)

O endpoint /test força a lista de tools pra apenas READ_ONLY_TOOLS, evitando
efeito colateral (nada de WhatsApp, stage, etc). Suficiente pra validar a
qualidade do prompt e a decisão do agent.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import ChatbotSession, Contact, User
from app.chatbot.agent_node import execute_agent_node
from app.workflow_tools.base import registry
from app.workflow_tools.filters import get_available_tools_for_tenant

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/workflow-tools", tags=["WorkflowTools"])

READ_ONLY_TOOLS = {"get_contact_summary"}


class ToolDescriptor(BaseModel):
    name: str
    description: str
    is_action: bool  # True se a tool tem efeito colateral (não está em READ_ONLY_TOOLS)


class ToolsListResponse(BaseModel):
    tools: list[ToolDescriptor]


class TestAgentBody(BaseModel):
    # Se agent_id setado, prompt/model/tools/outcomes podem ser omitidos —
    # serão carregados do AIConfig referenciado.
    agent_id: Optional[int] = None
    prompt: Optional[str] = None
    model: Optional[str] = "gpt-4o-mini"
    tools: list[str] = Field(default_factory=list)
    outcomes: list[str] = Field(default_factory=list)
    contact_id: Optional[int] = None
    user_message: Optional[str] = None


class TestAgentResponse(BaseModel):
    ok: bool
    outcome: str
    agent_text: str = ""
    tool_calls: list[dict] = Field(default_factory=list)
    tokens_in: int = 0
    tokens_out: int = 0
    error: Optional[str] = None
    used_contact_id: Optional[int] = None
    note: str = "Test mode: only get_contact_summary tool was enabled. No side effects."


@router.get("/available", response_model=ToolsListResponse)
async def list_available_tools(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista tools disponíveis pro tenant do usuário logado."""
    tools = await get_available_tools_for_tenant(user.tenant_id, db)
    return ToolsListResponse(
        tools=[
            ToolDescriptor(
                name=t.name,
                description=t.description,
                is_action=(t.name not in READ_ONLY_TOOLS),
            )
            for t in tools
        ]
    )


@router.post("/test", response_model=TestAgentResponse)
async def test_agent_prompt(
    body: TestAgentBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Executa execute_agent_node em modo seguro:
      - Força lista de tools pra apenas READ_ONLY_TOOLS (sem efeito colateral)
      - Faz rollback no final pra não persistir nada
      - Não toca em LeadAgentContext (sem lock)
    """
    # 0. Validar: precisa OU prompt inline OU agent_id
    if not body.agent_id and (not body.prompt or not body.prompt.strip()):
        raise HTTPException(status_code=400, detail="Forneça 'prompt' inline ou 'agent_id' de um agente salvo")

    # 1. Resolver contato pra teste (informado ou primeiro do tenant)
    if body.contact_id:
        c_res = await db.execute(
            select(Contact)
            .options(selectinload(Contact.tags))
            .where(Contact.id == body.contact_id, Contact.tenant_id == user.tenant_id)
        )
        contact = c_res.scalar_one_or_none()
        if not contact:
            raise HTTPException(status_code=404, detail="Contato não pertence ao tenant")
    else:
        c_res = await db.execute(
            select(Contact)
            .options(selectinload(Contact.tags))
            .where(Contact.tenant_id == user.tenant_id)
            .limit(1)
        )
        contact = c_res.scalar_one_or_none()
        if not contact:
            raise HTTPException(status_code=400, detail="Nenhum contato disponível pra teste")

    # 2. Filtrar tools — apenas READ_ONLY_TOOLS
    safe_tools = [t for t in body.tools if t in READ_ONLY_TOOLS]
    # Sempre garantir get_contact_summary disponível pra agent ter o que fazer
    if "get_contact_summary" not in safe_tools and registry.get("get_contact_summary"):
        safe_tools.append("get_contact_summary")

    # 3. Session em memória (NÃO adiciona ao db; só usada como container de variáveis)
    fake_session = ChatbotSession(
        tenant_id=user.tenant_id,
        flow_id=0,
        channel_id=contact.channel_id,
        contact_id=contact.id,
        status="active",
        variables={},
    )

    # 4. Executar com isolamento via SAVEPOINT (rollback nested NÃO invalida o contact)
    savepoint = await db.begin_nested()
    try:
        result = await execute_agent_node(
            node_data={
                "agent_id": body.agent_id,
                "prompt": body.prompt or "",
                "model": body.model or "",  # vazio força DEFAULT ou agent.model
                "tools": safe_tools,
                "outcomes": body.outcomes,
                "user_message": body.user_message or "",
            },
            session=fake_session,
            contact=contact,
            channel=None,  # sem channel pra impedir send_message mesmo se vazasse
            db=db,
        )
    except Exception as e:
        logger.exception("workflow-tools/test: execute_agent_node falhou")
        await savepoint.rollback()
        return TestAgentResponse(
            ok=False,
            outcome="error",
            agent_text="",
            tool_calls=[],
            tokens_in=0,
            tokens_out=0,
            error=f"{type(e).__name__}: {str(e)[:300]}",
            used_contact_id=contact.id,
        )
    else:
        # Sucesso — desfaz qualquer mudança persistida (modo seguro)
        await savepoint.rollback()

    return TestAgentResponse(
        ok=bool(result.get("ok")),
        outcome=result.get("outcome") or "done",
        agent_text=result.get("agent_text") or "",
        tool_calls=result.get("tool_calls") or [],
        tokens_in=result.get("tokens_in") or 0,
        tokens_out=result.get("tokens_out") or 0,
        error=result.get("error"),
        used_contact_id=contact.id,
    )
