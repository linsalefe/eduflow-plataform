from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, update
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.models import Notification, User
from app.auth import get_current_user, get_tenant_id

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


# -- Helper (chamado por outros modulos) --------------

async def create_notification(
    db: AsyncSession,
    user_id: int,
    type: str,
    title: str,
    message: str = None,
    link: str = None,
    contact_wa_id: str = None,
    tenant_id: int = None,
):
    notif = Notification(
        tenant_id=tenant_id,
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        link=link,
        contact_wa_id=contact_wa_id,
    )
    db.add(notif)
    return notif


async def notify_all_users(
    db: AsyncSession,
    type: str,
    title: str,
    message: str = None,
    link: str = None,
    contact_wa_id: str = None,
    tenant_id: int = None,
):
    user_filter = [User.is_active == True]
    if tenant_id:
        user_filter.append(User.tenant_id == tenant_id)
    result = await db.execute(select(User).where(*user_filter))
    users = result.scalars().all()
    for u in users:
        await create_notification(db, u.id, type, title, message, link, contact_wa_id, tenant_id=tenant_id)


# -- Serializer ----------------------------------------

def notif_to_dict(n: Notification) -> dict:
    return {
        "id": n.id,
        "user_id": n.user_id,
        "type": n.type,
        "title": n.title,
        "message": n.message,
        "is_read": n.is_read,
        "link": n.link,
        "contact_wa_id": n.contact_wa_id,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


# -- Routes --------------------------------------------

@router.get("")
async def list_notifications(
    limit: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    return [notif_to_dict(n) for n in result.scalars().all()]


@router.get("/unread-count")
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(func.count(Notification.id)).where(
            and_(Notification.user_id == current_user.id, Notification.is_read == False)
        )
    )
    count = result.scalar() or 0
    return {"count": count}


@router.patch("/{notif_id}/read")
async def mark_as_read(
    notif_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            and_(Notification.id == notif_id, Notification.user_id == current_user.id)
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")

    notif.is_read = True
    await db.commit()
    return {"ok": True}


@router.patch("/read-all")
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        update(Notification)
        .where(and_(Notification.user_id == current_user.id, Notification.is_read == False))
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}