"""Rotas de Mensagens Prontas (Quick Replies).

Endpoints:
- GET    /api/quick-replies          — listar (qualquer user do tenant)
- POST   /api/quick-replies          — criar (admin/superadmin)
- PUT    /api/quick-replies/{id}     — editar (admin/superadmin)
- DELETE /api/quick-replies/{id}     — remover (admin/superadmin)
"""
import re
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import QuickReply, User
from app.auth import get_current_user, get_tenant_id

logger = logging.getLogger("eduflow.quick_replies")

router = APIRouter(prefix="/api/quick-replies", tags=["Quick Replies"])

# Regex do shortcut normalizado: minúsculas, números, underscore, hífen
_SHORTCUT_RE = re.compile(r"^[a-z0-9_\-]{1,50}$")


def _normalize_shortcut(raw: str) -> str:
    """Normaliza shortcut: trim, lowercase, espaços→underscore."""
    if not raw:
        return ""
    s = raw.strip().lower().replace(" ", "_")
    return s


def _validate_shortcut(shortcut: str) -> str:
    """Valida e retorna shortcut normalizado. Levanta HTTPException(400) se inválido."""
    norm = _normalize_shortcut(shortcut)
    if not norm:
        raise HTTPException(status_code=400, detail="Atalho é obrigatório")
    if not _SHORTCUT_RE.match(norm):
        raise HTTPException(
            status_code=400,
            detail="Atalho inválido. Use apenas letras minúsculas, números, _ e -. Máx 50 caracteres.",
        )
    return norm


def _validate_content(content: str) -> str:
    """Valida content. Levanta HTTPException(400) se inválido."""
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="Conteúdo é obrigatório")
    if len(content) > 4000:
        raise HTTPException(status_code=400, detail="Conteúdo muito longo (máx 4000 caracteres)")
    return content


def _require_admin(user: User) -> None:
    """403 se não for admin ou superadmin."""
    if user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")


def _serialize(qr: QuickReply) -> dict:
    return {
        "id": qr.id,
        "shortcut": qr.shortcut,
        "content": qr.content,
        "created_by_user_id": qr.created_by_user_id,
        "created_at": str(qr.created_at) if qr.created_at else "",
        "updated_at": str(qr.updated_at) if qr.updated_at else "",
    }


@router.get("")
async def list_quick_replies(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Lista mensagens prontas do tenant, ordenadas por shortcut."""
    result = await db.execute(
        select(QuickReply)
        .where(QuickReply.tenant_id == tenant_id)
        .order_by(QuickReply.shortcut.asc())
    )
    return [_serialize(qr) for qr in result.scalars().all()]


@router.post("")
async def create_quick_reply(
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Cria mensagem pronta. Admin/superadmin only."""
    _require_admin(user)
    shortcut = _validate_shortcut(data.get("shortcut", ""))
    content = _validate_content(data.get("content", ""))

    qr = QuickReply(
        tenant_id=tenant_id,
        shortcut=shortcut,
        content=content,
        created_by_user_id=user.id,
    )
    db.add(qr)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=f"Já existe uma mensagem com o atalho '{shortcut}'")
    await db.refresh(qr)
    logger.info(f"[QR_CREATE] tenant={tenant_id} user={user.id} shortcut={shortcut} id={qr.id}")
    return _serialize(qr)


@router.put("/{qr_id}")
async def update_quick_reply(
    qr_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Edita mensagem pronta. Admin/superadmin only."""
    _require_admin(user)
    result = await db.execute(
        select(QuickReply).where(QuickReply.id == qr_id, QuickReply.tenant_id == tenant_id)
    )
    qr = result.scalar_one_or_none()
    if not qr:
        raise HTTPException(status_code=404, detail="Mensagem pronta não encontrada")

    if "shortcut" in data:
        qr.shortcut = _validate_shortcut(data["shortcut"])
    if "content" in data:
        qr.content = _validate_content(data["content"])

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=f"Já existe uma mensagem com esse atalho")
    await db.refresh(qr)
    logger.info(f"[QR_UPDATE] tenant={tenant_id} user={user.id} id={qr.id} shortcut={qr.shortcut}")
    return _serialize(qr)


@router.delete("/{qr_id}", status_code=204)
async def delete_quick_reply(
    qr_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Remove mensagem pronta. Admin/superadmin only."""
    _require_admin(user)
    result = await db.execute(
        select(QuickReply).where(QuickReply.id == qr_id, QuickReply.tenant_id == tenant_id)
    )
    qr = result.scalar_one_or_none()
    if not qr:
        raise HTTPException(status_code=404, detail="Mensagem pronta não encontrada")

    await db.delete(qr)
    await db.commit()
    logger.info(f"[QR_DELETE] tenant={tenant_id} user={user.id} id={qr_id}")
    return None
