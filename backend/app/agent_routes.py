"""
CRUD de agentes de IA (desacoplados dos canais).
"""
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional, List

from app.database import get_db
from app.auth import get_tenant_id
from app.models import AIConfig, Channel, KnowledgeDocument

router = APIRouter(prefix="/api/agents", tags=["agents"])


class AgentCreate(BaseModel):
    name: str
    icon: str = "Bot"
    channel_id: Optional[int] = None
    is_enabled: bool = True
    system_prompt: Optional[str] = None
    model: str = "gpt-5-mini"
    temperature: str = "0.7"
    max_tokens: int = 500
    # F2.C — biblioteca de agentes pra Workflow (NULL = não usado em workflow)
    tools: Optional[List[str]] = None
    outcomes: Optional[List[str]] = None


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    channel_id: Optional[int] = None
    is_enabled: Optional[bool] = None
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[str] = None
    max_tokens: Optional[int] = None
    # F2.C — usar ["__clear__"] explicitamente pra limpar (None = não tocar)
    tools: Optional[List[str]] = None
    outcomes: Optional[List[str]] = None


class AgentOut(BaseModel):
    id: int
    name: str
    icon: str
    channel_id: Optional[int]
    channel_name: Optional[str]
    is_enabled: bool
    system_prompt: Optional[str]
    model: str
    temperature: str
    max_tokens: int
    knowledge_docs_count: int
    # F2.C
    tools: Optional[List[str]] = None
    outcomes: Optional[List[str]] = None
    is_workflow_capable: bool = False


def _agent_out(ac, channel_name: Optional[str], docs_count: int) -> AgentOut:
    return AgentOut(
        id=ac.id,
        name=ac.name,
        icon=ac.icon or "Bot",
        channel_id=ac.channel_id,
        channel_name=channel_name,
        is_enabled=ac.is_enabled,
        system_prompt=ac.system_prompt,
        model=ac.model,
        temperature=ac.temperature,
        max_tokens=ac.max_tokens,
        knowledge_docs_count=docs_count,
        tools=ac.tools,
        outcomes=ac.outcomes,
        is_workflow_capable=(ac.tools is not None),
    )


@router.get("", response_model=List[AgentOut])
async def list_agents(db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    result = await db.execute(
        select(AIConfig, Channel.name.label("channel_name"))
        .outerjoin(Channel, Channel.id == AIConfig.channel_id)
        .where(AIConfig.tenant_id == tenant_id)
        .order_by(AIConfig.name)
    )
    rows = result.all()

    kd_counts = await db.execute(
        select(
            KnowledgeDocument.agent_id,
            func.count(KnowledgeDocument.id).label("cnt"),
        )
        .where(KnowledgeDocument.tenant_id == tenant_id)
        .group_by(KnowledgeDocument.agent_id)
    )
    counts_map = {row.agent_id: row.cnt for row in kd_counts.all()}

    return [_agent_out(ac, channel_name, counts_map.get(ac.id, 0)) for ac, channel_name in rows]


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: int, db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    agent = (await db.execute(
        select(AIConfig).where(AIConfig.id == agent_id, AIConfig.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agente nao encontrado")

    channel_name = None
    if agent.channel_id:
        ch = (await db.execute(select(Channel).where(Channel.id == agent.channel_id))).scalar_one_or_none()
        channel_name = ch.name if ch else None

    docs_count = (await db.execute(
        select(func.count(KnowledgeDocument.id)).where(KnowledgeDocument.agent_id == agent_id)
    )).scalar() or 0

    return _agent_out(agent, channel_name, docs_count)


@router.post("", response_model=AgentOut)
async def create_agent(req: AgentCreate, db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    if req.channel_id is not None:
        ch = (await db.execute(
            select(Channel).where(Channel.id == req.channel_id, Channel.tenant_id == tenant_id)
        )).scalar_one_or_none()
        if not ch:
            raise HTTPException(404, "Canal nao encontrado")

        existing = (await db.execute(
            select(AIConfig).where(AIConfig.channel_id == req.channel_id)
        )).scalar_one_or_none()
        if existing:
            raise HTTPException(400, f"Canal ja esta associado ao agente '{existing.name}'")

    agent = AIConfig(
        tenant_id=tenant_id,
        name=req.name,
        icon=req.icon,
        channel_id=req.channel_id,
        is_enabled=req.is_enabled,
        system_prompt=req.system_prompt,
        model=req.model,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
        tools=req.tools,
        outcomes=req.outcomes,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)

    return _agent_out(agent, None, 0)


@router.put("/{agent_id}", response_model=AgentOut)
async def update_agent(agent_id: int, req: AgentUpdate, db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    agent = (await db.execute(
        select(AIConfig).where(AIConfig.id == agent_id, AIConfig.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agente nao encontrado")

    if req.channel_id is not None and req.channel_id != agent.channel_id:
        ch = (await db.execute(
            select(Channel).where(Channel.id == req.channel_id, Channel.tenant_id == tenant_id)
        )).scalar_one_or_none()
        if not ch:
            raise HTTPException(404, "Canal nao encontrado")

        existing = (await db.execute(
            select(AIConfig).where(AIConfig.channel_id == req.channel_id, AIConfig.id != agent_id)
        )).scalar_one_or_none()
        if existing:
            raise HTTPException(400, f"Canal ja esta associado ao agente '{existing.name}'")

    payload = req.model_dump(exclude_unset=True)
    # F2.C — sentinela ["__clear__"] limpa tools/outcomes (volta pra NULL,
    # removendo o agente da biblioteca de Workflow). [] permanece como lista vazia válida.
    if payload.get("tools") == ["__clear__"]:
        agent.tools = None
        payload.pop("tools", None)
    if payload.get("outcomes") == ["__clear__"]:
        agent.outcomes = None
        payload.pop("outcomes", None)

    for field, value in payload.items():
        setattr(agent, field, value)

    from sqlalchemy.orm.attributes import flag_modified
    if "tools" in payload:
        flag_modified(agent, "tools")
    if "outcomes" in payload:
        flag_modified(agent, "outcomes")

    await db.commit()
    await db.refresh(agent)

    channel_name = None
    if agent.channel_id:
        ch = (await db.execute(select(Channel).where(Channel.id == agent.channel_id))).scalar_one_or_none()
        channel_name = ch.name if ch else None

    docs_count = (await db.execute(
        select(func.count(KnowledgeDocument.id)).where(KnowledgeDocument.agent_id == agent_id)
    )).scalar() or 0

    return _agent_out(agent, channel_name, docs_count)


@router.delete("/{agent_id}")
async def delete_agent(agent_id: int, db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    agent = (await db.execute(
        select(AIConfig).where(AIConfig.id == agent_id, AIConfig.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agente nao encontrado")

    await db.delete(agent)
    await db.commit()
    return {"ok": True}


# ============================================================
# Knowledge Documents — por agente
# ============================================================

@router.get("/{agent_id}/knowledge")
async def list_agent_knowledge(agent_id: int, db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    agent = (await db.execute(
        select(AIConfig).where(AIConfig.id == agent_id, AIConfig.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agente nao encontrado")

    result = await db.execute(
        select(
            KnowledgeDocument.title,
            func.count(KnowledgeDocument.id).label("chunks"),
            func.sum(KnowledgeDocument.token_count).label("total_tokens"),
            func.min(KnowledgeDocument.created_at).label("created_at"),
        )
        .where(KnowledgeDocument.agent_id == agent_id)
        .group_by(KnowledgeDocument.title)
        .order_by(func.min(KnowledgeDocument.created_at).desc())
    )
    docs = result.all()

    return [
        {
            "title": d.title,
            "chunks": d.chunks,
            "total_tokens": d.total_tokens or 0,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in docs
    ]


@router.post("/{agent_id}/knowledge")
async def upload_agent_knowledge(
    agent_id: int,
    title: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    agent = (await db.execute(
        select(AIConfig).where(AIConfig.id == agent_id, AIConfig.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agente nao encontrado")

    from app.ai_engine import generate_embedding, split_into_chunks

    content_bytes = await file.read()
    try:
        content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "Arquivo deve ser texto (.txt, .md, .csv)")

    if not content.strip():
        raise HTTPException(400, "Arquivo vazio")

    chunks = split_into_chunks(content, title)
    if not chunks:
        raise HTTPException(400, "Nao foi possivel processar o documento")

    saved = 0
    for chunk in chunks:
        try:
            embedding = await generate_embedding(chunk["content"])
            doc = KnowledgeDocument(
                tenant_id=tenant_id,
                agent_id=agent_id,
                channel_id=agent.channel_id,
                title=chunk["title"],
                content=chunk["content"],
                embedding=json.dumps(embedding),
                chunk_index=chunk["chunk_index"],
                token_count=chunk["token_count"],
            )
            db.add(doc)
            saved += 1
        except Exception as e:
            print(f"Erro ao processar chunk {chunk['chunk_index']}: {e}")
            continue

    await db.commit()

    return {
        "title": title,
        "chunks_saved": saved,
        "total_tokens": sum(c["token_count"] for c in chunks),
    }


@router.delete("/{agent_id}/knowledge/{title:path}")
async def delete_agent_knowledge(
    agent_id: int,
    title: str,
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    agent = (await db.execute(
        select(AIConfig).where(AIConfig.id == agent_id, AIConfig.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agente nao encontrado")

    result = await db.execute(
        select(KnowledgeDocument).where(
            KnowledgeDocument.agent_id == agent_id,
            KnowledgeDocument.title == title,
        )
    )
    docs = result.scalars().all()

    if not docs:
        raise HTTPException(404, "Documento nao encontrado")

    for doc in docs:
        await db.delete(doc)

    await db.commit()
    return {"status": "deleted", "chunks_removed": len(docs)}
