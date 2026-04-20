"""
Endpoints do Laboratório do Agente.
Prefix: /api/ai-lab
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Path
from pydantic import BaseModel, Field
from typing import Optional, Literal
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.auth import get_current_user, get_tenant_id
from app.ai_lab import service as ai_lab_service

router = APIRouter(prefix="/api/ai-lab", tags=["AI Lab"])


# ─── Schemas ──────────────────────────────────────────────

class ContextMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class FeedbackCreate(BaseModel):
    message_id: int
    rating: Literal["up", "down", "edit"]
    reason: Optional[str] = None
    corrected_response: Optional[str] = None
    context_snippet: Optional[list[ContextMessage]] = None


class FeedbackResponse(BaseModel):
    id: int
    message_id: int
    rating: str
    reason: Optional[str] = None
    corrected_response: Optional[str] = None
    has_embedding: bool


# ─── Routes ───────────────────────────────────────────────

@router.post("/feedback", response_model=FeedbackResponse)
async def create_feedback(
    req: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """
    Salva feedback de uma mensagem da IA.
    Upsert: se já existe feedback do mesmo usuário pra essa mensagem, atualiza.
    Se rating='edit', gera embedding do contexto (síncrono).
    """
    try:
        snippet = (
            [m.model_dump() for m in req.context_snippet]
            if req.context_snippet
            else None
        )
        fb = await ai_lab_service.save_feedback(
            db=db,
            tenant_id=tenant_id,
            user_id=current_user.id,
            message_id=req.message_id,
            rating=req.rating,
            reason=req.reason,
            corrected_response=req.corrected_response,
            context_snippet=snippet,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return FeedbackResponse(
        id=fb.id,
        message_id=fb.message_id,
        rating=fb.rating,
        reason=fb.reason,
        corrected_response=fb.corrected_response,
        has_embedding=fb.context_embedding is not None,
    )


@router.delete("/feedback/{feedback_id}")
async def remove_feedback(
    feedback_id: int = Path(..., ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Remove feedback (ex: usuário clicou no botão por engano)."""
    ok = await ai_lab_service.delete_feedback(db, tenant_id, feedback_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Feedback não encontrado")
    return {"ok": True}


@router.get("/conversations")
async def list_conversations(
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    filter_type: Literal["all", "unreviewed", "reviewed", "edits"] = Query(
        "all", alias="filter"
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Lista conversas que tiveram mensagens da IA."""
    data = await ai_lab_service.list_conversations_with_ai(
        db=db,
        tenant_id=tenant_id,
        limit=limit,
        offset=offset,
        filter_type=filter_type,
    )
    return {"items": data, "count": len(data), "limit": limit, "offset": offset}


@router.get("/conversations/{contact_wa_id}")
async def get_conversation(
    contact_wa_id: str = Path(..., min_length=3, max_length=100),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Detalhes de uma conversa (mensagens + feedback existente)."""
    try:
        return await ai_lab_service.get_conversation_detail(
            db=db,
            tenant_id=tenant_id,
            contact_wa_id=contact_wa_id,
            limit=limit,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/stats")
async def get_lab_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Métricas agregadas do Laboratório pro tenant logado."""
    return await ai_lab_service.get_stats(db=db, tenant_id=tenant_id)
