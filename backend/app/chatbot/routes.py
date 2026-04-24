"""
CRUD de fluxos do Chatbot Visual e configuração do modo operacional
(ai | chatbot | none) dos canais.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.database import get_db
from app.auth import get_current_user, get_tenant_id
from app.models import (
    ChatbotFlow, ChatbotSession, Channel, Tenant, User, Contact,
    ChatbotScheduledResume,
)

router = APIRouter(prefix="/api/chatbot", tags=["Chatbot"])


# ============================================================
# Schemas (Pydantic v2)
# ============================================================
class GraphData(BaseModel):
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)


class FlowCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None


class FlowUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    graph: Optional[GraphData] = None


class ChannelModeUpdate(BaseModel):
    operation_mode: str = Field(..., pattern="^(ai|chatbot|none)$")
    active_chatbot_flow_id: Optional[int] = None
    force: bool = False  # True = substitui fluxo/IA em uso sem erro


class ChannelConflictInfo(BaseModel):
    """Usado pelo endpoint /flows/{id}/publish-channel-info."""
    channel_id: int
    channel_name: str
    channel_type: str
    current_mode: str
    current_flow_id: Optional[int]
    current_flow_name: Optional[str]
    status: str  # free | ai_conflict | other_chatbot | same_chatbot


# ============================================================
# Helpers
# ============================================================
async def ensure_chatbot_feature(tenant_id: int, db: AsyncSession) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(404, "Tenant não encontrado")
    features = tenant.features or {}
    if not features.get("chatbot", False):
        raise HTTPException(403, "Recurso Chatbot não habilitado para este tenant")
    return tenant


def _flow_to_dict(flow: ChatbotFlow) -> dict:
    return {
        "id": flow.id,
        "name": flow.name,
        "description": flow.description,
        "graph": flow.graph or {"nodes": [], "edges": []},
        "published_graph": flow.published_graph,
        "is_published": flow.is_published,
        "version": flow.version,
        "created_by": flow.created_by,
        "created_at": flow.created_at.isoformat() if flow.created_at else None,
        "updated_at": flow.updated_at.isoformat() if flow.updated_at else None,
    }


# ============================================================
# CRUD de fluxos
# ============================================================
@router.get("/flows")
async def list_flows(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    await ensure_chatbot_feature(tenant_id, db)
    result = await db.execute(
        select(ChatbotFlow)
        .where(ChatbotFlow.tenant_id == tenant_id)
        .order_by(ChatbotFlow.updated_at.desc())
    )
    flows = result.scalars().all()
    return [
        {
            "id": f.id,
            "name": f.name,
            "description": f.description,
            "is_published": f.is_published,
            "version": f.version,
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "updated_at": f.updated_at.isoformat() if f.updated_at else None,
        }
        for f in flows
    ]


@router.get("/flows/{flow_id}")
async def get_flow(
    flow_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    await ensure_chatbot_feature(tenant_id, db)
    result = await db.execute(
        select(ChatbotFlow).where(
            ChatbotFlow.id == flow_id,
            ChatbotFlow.tenant_id == tenant_id,
        )
    )
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Fluxo não encontrado")
    return _flow_to_dict(flow)


@router.post("/flows")
async def create_flow(
    data: FlowCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    await ensure_chatbot_feature(tenant_id, db)
    flow = ChatbotFlow(
        tenant_id=tenant_id,
        name=data.name,
        description=data.description,
        graph={"nodes": [], "edges": []},
        created_by=current_user.id,
    )
    db.add(flow)
    await db.commit()
    await db.refresh(flow)
    return _flow_to_dict(flow)


@router.put("/flows/{flow_id}")
async def update_flow(
    flow_id: int,
    data: FlowUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    await ensure_chatbot_feature(tenant_id, db)
    result = await db.execute(
        select(ChatbotFlow).where(
            ChatbotFlow.id == flow_id,
            ChatbotFlow.tenant_id == tenant_id,
        )
    )
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Fluxo não encontrado")

    if data.name is not None:
        flow.name = data.name
    if data.description is not None:
        flow.description = data.description
    if data.graph is not None:
        flow.graph = data.graph.model_dump()
        flag_modified(flow, "graph")

    flow.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(flow)
    return _flow_to_dict(flow)


@router.post("/flows/{flow_id}/publish")
async def publish_flow(
    flow_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    await ensure_chatbot_feature(tenant_id, db)
    result = await db.execute(
        select(ChatbotFlow).where(
            ChatbotFlow.id == flow_id,
            ChatbotFlow.tenant_id == tenant_id,
        )
    )
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Fluxo não encontrado")

    graph = flow.graph or {"nodes": [], "edges": []}
    nodes = graph.get("nodes", [])
    if not nodes:
        raise HTTPException(400, "Fluxo vazio — adicione nós antes de publicar")

    has_trigger = any(
        (n.get("type") == "trigger") or (n.get("data", {}).get("kind") == "trigger")
        for n in nodes
    )
    if not has_trigger:
        raise HTTPException(400, "Fluxo precisa de ao menos um nó de gatilho (trigger)")

    flow.published_graph = graph
    flow.is_published = True
    flow.version += 1
    flow.updated_at = datetime.utcnow()
    flag_modified(flow, "published_graph")
    await db.commit()
    await db.refresh(flow)
    return _flow_to_dict(flow)


@router.post("/flows/{flow_id}/unpublish")
async def unpublish_flow(
    flow_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    await ensure_chatbot_feature(tenant_id, db)
    result = await db.execute(
        select(ChatbotFlow).where(
            ChatbotFlow.id == flow_id,
            ChatbotFlow.tenant_id == tenant_id,
        )
    )
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Fluxo não encontrado")

    flow.is_published = False
    flow.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "Fluxo despublicado", "id": flow_id}


@router.post("/flows/{flow_id}/duplicate")
async def duplicate_flow(
    flow_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    await ensure_chatbot_feature(tenant_id, db)
    result = await db.execute(
        select(ChatbotFlow).where(
            ChatbotFlow.id == flow_id,
            ChatbotFlow.tenant_id == tenant_id,
        )
    )
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(404, "Fluxo não encontrado")

    copy = ChatbotFlow(
        tenant_id=tenant_id,
        name=f"{original.name} (cópia)",
        description=original.description,
        graph=original.graph or {"nodes": [], "edges": []},
        is_published=False,
        published_graph=None,
        created_by=current_user.id,
    )
    db.add(copy)
    await db.commit()
    await db.refresh(copy)
    return _flow_to_dict(copy)


@router.delete("/flows/{flow_id}")
async def delete_flow(
    flow_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    await ensure_chatbot_feature(tenant_id, db)
    result = await db.execute(
        select(ChatbotFlow).where(
            ChatbotFlow.id == flow_id,
            ChatbotFlow.tenant_id == tenant_id,
        )
    )
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Fluxo não encontrado")

    channels_using = await db.execute(
        select(Channel).where(
            Channel.tenant_id == tenant_id,
            Channel.active_chatbot_flow_id == flow_id,
        )
    )
    ch_list = channels_using.scalars().all()
    if ch_list:
        names = ", ".join(c.name for c in ch_list)
        raise HTTPException(
            409,
            f"Fluxo em uso pelos canais: {names}. Troque o fluxo ativo antes de excluir.",
        )

    await db.delete(flow)
    await db.commit()
    return {"message": "Fluxo excluído", "id": flow_id}


# ============================================================
# Modo operacional do canal
# ============================================================
@router.get("/channels")
async def list_channels_with_mode(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    await ensure_chatbot_feature(tenant_id, db)
    result = await db.execute(
        select(Channel)
        .where(Channel.tenant_id == tenant_id)
        .order_by(Channel.id)
    )
    channels = result.scalars().all()

    flow_ids = {c.active_chatbot_flow_id for c in channels if c.active_chatbot_flow_id}
    flow_map: dict[int, ChatbotFlow] = {}
    if flow_ids:
        flows_res = await db.execute(
            select(ChatbotFlow).where(ChatbotFlow.id.in_(flow_ids))
        )
        flow_map = {f.id: f for f in flows_res.scalars().all()}

    return [
        {
            "id": c.id,
            "name": c.name,
            "type": c.type,
            "provider": c.provider,
            "operation_mode": c.operation_mode,
            "active_chatbot_flow_id": c.active_chatbot_flow_id,
            "active_chatbot_flow_name": (
                flow_map[c.active_chatbot_flow_id].name
                if c.active_chatbot_flow_id and c.active_chatbot_flow_id in flow_map
                else None
            ),
            "is_active": c.is_active,
        }
        for c in channels
    ]


@router.put("/channels/{channel_id}/mode")
async def update_channel_mode(
    channel_id: int,
    data: ChannelModeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    await ensure_chatbot_feature(tenant_id, db)

    result = await db.execute(
        select(Channel).where(
            Channel.id == channel_id,
            Channel.tenant_id == tenant_id,
        )
    )
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(404, "Canal não encontrado")

    previous_mode = channel.operation_mode
    previous_flow_id = channel.active_chatbot_flow_id

    # Validações específicas de cada modo
    if data.operation_mode == "chatbot":
        if not data.active_chatbot_flow_id:
            raise HTTPException(400, "active_chatbot_flow_id é obrigatório no modo chatbot")
        flow_res = await db.execute(
            select(ChatbotFlow).where(
                ChatbotFlow.id == data.active_chatbot_flow_id,
                ChatbotFlow.tenant_id == tenant_id,
            )
        )
        flow = flow_res.scalar_one_or_none()
        if not flow:
            raise HTTPException(404, "Fluxo não encontrado")
        if not flow.is_published:
            raise HTTPException(400, "Fluxo precisa estar publicado antes de ativar no canal")

        # Regra: 1 fluxo → 1 canal. Se este fluxo já está ativo noutro canal,
        # desvincula o outro canal (só com force=true pra evitar surpresas).
        other_ch_res = await db.execute(
            select(Channel).where(
                Channel.tenant_id == tenant_id,
                Channel.active_chatbot_flow_id == data.active_chatbot_flow_id,
                Channel.id != channel.id,
            )
        )
        other_channels = other_ch_res.scalars().all()
        if other_channels and not data.force:
            names = ", ".join(c.name for c in other_channels)
            raise HTTPException(
                409,
                f"Este fluxo já está ativo em outro canal ({names}). "
                f"Use force=true para mover."
            )
        for oc in other_channels:
            oc.operation_mode = "none"
            oc.active_chatbot_flow_id = None
            # cancela sessões do canal desvinculado
            sres = await db.execute(
                select(ChatbotSession).where(
                    ChatbotSession.channel_id == oc.id,
                    ChatbotSession.status == "active",
                )
            )
            for s in sres.scalars().all():
                s.status = "cancelled"
                s.completed_at = datetime.utcnow()
                s.updated_at = datetime.utcnow()

    channel.operation_mode = data.operation_mode
    if data.operation_mode == "chatbot":
        channel.active_chatbot_flow_id = data.active_chatbot_flow_id
    else:
        channel.active_chatbot_flow_id = None

    # Ao sair do modo chatbot OU trocar de fluxo: cancelar sessões abertas + resumes
    leaving_chatbot = previous_mode == "chatbot" and data.operation_mode != "chatbot"
    switching_flow = (
        previous_mode == "chatbot"
        and data.operation_mode == "chatbot"
        and previous_flow_id
        and previous_flow_id != data.active_chatbot_flow_id
    )
    if leaving_chatbot or switching_flow:
        sessions_res = await db.execute(
            select(ChatbotSession).where(
                ChatbotSession.channel_id == channel_id,
                ChatbotSession.status.in_(["active", "waiting"]),
            )
        )
        cancelled_sessions = sessions_res.scalars().all()
        if cancelled_sessions:
            session_ids = [s.id for s in cancelled_sessions]
            rres = await db.execute(
                select(ChatbotScheduledResume).where(
                    ChatbotScheduledResume.session_id.in_(session_ids),
                    ChatbotScheduledResume.status == "pending",
                )
            )
            now = datetime.utcnow()
            for r in rres.scalars().all():
                r.status = "cancelled"
                r.processed_at = now
            for s in cancelled_sessions:
                s.status = "cancelled"
                s.completed_at = now
                s.updated_at = now
            print(f"chatbot: {len(cancelled_sessions)} sessão(ões) + resumes cancelados no canal {channel_id}")

    await db.commit()
    await db.refresh(channel)
    return {
        "id": channel.id,
        "name": channel.name,
        "operation_mode": channel.operation_mode,
        "active_chatbot_flow_id": channel.active_chatbot_flow_id,
        "message": "Modo do canal atualizado",
    }


# ============================================================
# Sessões do chatbot (monitoramento)
# ============================================================
@router.get("/flows/{flow_id}/sessions")
async def list_sessions(
    flow_id: int,
    status: str = "active",
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    await ensure_chatbot_feature(tenant_id, db)

    flow_res = await db.execute(
        select(ChatbotFlow).where(
            ChatbotFlow.id == flow_id,
            ChatbotFlow.tenant_id == tenant_id,
        )
    )
    if not flow_res.scalar_one_or_none():
        raise HTTPException(404, "Fluxo não encontrado")

    q = select(ChatbotSession).where(ChatbotSession.flow_id == flow_id)
    if status != "all":
        if status not in ("active", "waiting", "completed", "cancelled", "timeout"):
            raise HTTPException(400, "status inválido")
        q = q.where(ChatbotSession.status == status)

    q = q.order_by(ChatbotSession.last_interaction_at.desc()).limit(min(limit, 200))
    res = await db.execute(q)
    sessions = res.scalars().all()

    if not sessions:
        return []

    _contact_ids = list({s.contact_id for s in sessions if s.contact_id})
    contacts_res = await db.execute(
        select(Contact).where(
            Contact.id.in_(_contact_ids),
        )
    ) if _contact_ids else None
    contact_map = {c.id: c for c in contacts_res.scalars().all()} if contacts_res else {}

    # Para sessões em waiting, buscar o resume_at mais próximo
    next_resume_map: Dict[int, datetime] = {}
    waiting_ids = [s.id for s in sessions if s.status == "waiting"]
    if waiting_ids:
        rres = await db.execute(
            select(ChatbotScheduledResume).where(
                ChatbotScheduledResume.session_id.in_(waiting_ids),
                ChatbotScheduledResume.status == "pending",
            ).order_by(ChatbotScheduledResume.resume_at)
        )
        for r in rres.scalars().all():
            if r.session_id not in next_resume_map:
                next_resume_map[r.session_id] = r.resume_at

    return [
        {
            "id": s.id,
            "contact_wa_id": contact_map.get(s.contact_id).wa_id if contact_map.get(s.contact_id) else None,
            "contact_name": (contact_map.get(s.contact_id).name
                             if contact_map.get(s.contact_id) else None),
            "current_node_id": s.current_node_id,
            "status": s.status,
            "variables": s.variables or {},
            "channel_id": s.channel_id,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "last_interaction_at": s.last_interaction_at.isoformat() if s.last_interaction_at else None,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            "next_resume_at": next_resume_map[s.id].isoformat() if s.id in next_resume_map else None,
        }
        for s in sessions
    ]


@router.delete("/flows/{flow_id}/sessions/{session_id}")
async def cancel_session(
    flow_id: int,
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    await ensure_chatbot_feature(tenant_id, db)

    res = await db.execute(
        select(ChatbotSession).where(
            ChatbotSession.id == session_id,
            ChatbotSession.flow_id == flow_id,
            ChatbotSession.tenant_id == tenant_id,
        )
    )
    session = res.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Sessão não encontrada")

    if session.status not in ("active", "waiting"):
        raise HTTPException(400, f"Sessão já está em status '{session.status}'")

    # Cancelamento em cascata: invalida resumes pendentes
    resumes_res = await db.execute(
        select(ChatbotScheduledResume).where(
            ChatbotScheduledResume.session_id == session_id,
            ChatbotScheduledResume.status == "pending",
        )
    )
    for r in resumes_res.scalars().all():
        r.status = "cancelled"
        r.processed_at = datetime.utcnow()

    session.status = "cancelled"
    session.completed_at = datetime.utcnow()
    session.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "Sessão cancelada", "id": session_id}


# ============================================================
# Channels com info de conflito — usado no Dialog de Publicar
# ============================================================
@router.get("/flows/{flow_id}/channels-status")
async def list_channels_for_publish(
    flow_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """
    Lista canais do tenant com info do status de cada um em relação ao
    fluxo informado. Usado pelo diálogo "Publicar em qual canal?" do editor.

    status:
      - free            → canal sem chatbot/IA (modo 'none')
      - ai_conflict     → canal em modo 'ai' (IA ativa)
      - other_chatbot   → canal tem outro chatbot ativo
      - same_chatbot    → canal já tem ESTE chatbot ativo
    """
    await ensure_chatbot_feature(tenant_id, db)

    # Valida fluxo
    flow_res = await db.execute(
        select(ChatbotFlow).where(
            ChatbotFlow.id == flow_id,
            ChatbotFlow.tenant_id == tenant_id,
        )
    )
    if not flow_res.scalar_one_or_none():
        raise HTTPException(404, "Fluxo não encontrado")

    # Canais do tenant
    ch_res = await db.execute(
        select(Channel)
        .where(Channel.tenant_id == tenant_id)
        .order_by(Channel.id)
    )
    channels = ch_res.scalars().all()

    # Mapa de nomes dos fluxos ativos
    flow_ids = {c.active_chatbot_flow_id for c in channels if c.active_chatbot_flow_id}
    flow_map: Dict[int, ChatbotFlow] = {}
    if flow_ids:
        fres = await db.execute(select(ChatbotFlow).where(ChatbotFlow.id.in_(flow_ids)))
        flow_map = {f.id: f for f in fres.scalars().all()}

    out = []
    for c in channels:
        mode = c.operation_mode or "ai"
        if mode == "ai":
            status = "ai_conflict"
        elif mode == "chatbot":
            if c.active_chatbot_flow_id == flow_id:
                status = "same_chatbot"
            else:
                status = "other_chatbot"
        else:
            status = "free"  # mode == 'none'

        out.append({
            "channel_id": c.id,
            "channel_name": c.name,
            "channel_type": c.type,
            "current_mode": mode,
            "current_flow_id": c.active_chatbot_flow_id,
            "current_flow_name": (
                flow_map[c.active_chatbot_flow_id].name
                if c.active_chatbot_flow_id and c.active_chatbot_flow_id in flow_map
                else None
            ),
            "status": status,
        })
    return out


@router.post("/flows/{flow_id}/sessions/{session_id}/resume-now")
async def resume_session_now(
    flow_id: int,
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Força retomada imediata de uma sessão em 'waiting' — antecipa um resume pendente."""
    await ensure_chatbot_feature(tenant_id, db)

    sres = await db.execute(
        select(ChatbotSession).where(
            ChatbotSession.id == session_id,
            ChatbotSession.flow_id == flow_id,
            ChatbotSession.tenant_id == tenant_id,
        )
    )
    session = sres.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Sessão não encontrada")
    if session.status != "waiting":
        raise HTTPException(400, f"Sessão não está aguardando (status: {session.status})")

    rres = await db.execute(
        select(ChatbotScheduledResume).where(
            ChatbotScheduledResume.session_id == session_id,
            ChatbotScheduledResume.status == "pending",
        )
    )
    count = 0
    now = datetime.utcnow()
    for r in rres.scalars().all():
        r.resume_at = now
        count += 1
    await db.commit()
    return {"message": f"{count} retomada(s) antecipada(s)", "session_id": session_id}
