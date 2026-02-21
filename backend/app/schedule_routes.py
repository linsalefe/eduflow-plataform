"""
Rotas de agendamentos: CRUD + listagem com filtros.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta, timezone

from app.database import get_db
from app.auth_routes import get_current_user
from app.models import Schedule, Contact

SP_TZ = timezone(timedelta(hours=-3))

router = APIRouter(prefix="/api/schedules", tags=["Schedules"])


class ScheduleCreate(BaseModel):
    contact_wa_id: str
    contact_name: Optional[str] = ""
    phone: str
    course: Optional[str] = ""
    scheduled_date: str  # YYYY-MM-DD
    scheduled_time: str  # HH:MM
    type: str = "voice_ai"  # voice_ai ou consultant
    channel_id: Optional[int] = None
    notes: Optional[str] = None


class ScheduleUpdate(BaseModel):
    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    type: Optional[str] = None


@router.get("")
async def list_schedules(
    status: Optional[str] = None,
    type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 100,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista agendamentos com filtros."""
    query = select(Schedule).order_by(Schedule.scheduled_at.asc())

    if status:
        query = query.where(Schedule.status == status)
    if type:
        query = query.where(Schedule.type == type)
    if date_from:
        query = query.where(Schedule.scheduled_date >= date_from)
    if date_to:
        query = query.where(Schedule.scheduled_date <= date_to)

    query = query.limit(limit)
    result = await db.execute(query)
    schedules = result.scalars().all()

    return [
        {
            "id": s.id,
            "type": s.type,
            "contact_wa_id": s.contact_wa_id,
            "contact_name": s.contact_name or "",
            "phone": s.phone,
            "course": s.course or "",
            "scheduled_date": s.scheduled_date,
            "scheduled_time": s.scheduled_time,
            "scheduled_at": str(s.scheduled_at) if s.scheduled_at else "",
            "status": s.status,
            "call_id": s.call_id,
            "channel_id": s.channel_id,
            "notes": s.notes or "",
            "created_at": str(s.created_at) if s.created_at else "",
        }
        for s in schedules
    ]


@router.post("")
async def create_schedule(
    req: ScheduleCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cria agendamento manual."""
    scheduled_dt = datetime.strptime(f"{req.scheduled_date} {req.scheduled_time}", "%Y-%m-%d %H:%M")

    schedule = Schedule(
        type=req.type,
        contact_wa_id=req.contact_wa_id,
        contact_name=req.contact_name,
        phone=req.phone,
        course=req.course,
        scheduled_date=req.scheduled_date,
        scheduled_time=req.scheduled_time,
        scheduled_at=scheduled_dt,
        status="pending",
        channel_id=req.channel_id,
        notes=req.notes,
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)

    return {"id": schedule.id, "status": "created"}


@router.patch("/{schedule_id}")
async def update_schedule(
    schedule_id: int,
    req: ScheduleUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Atualiza agendamento (editar data/hora, cancelar, etc)."""
    result = await db.execute(select(Schedule).where(Schedule.id == schedule_id))
    schedule = result.scalar_one_or_none()

    if not schedule:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")

    if req.scheduled_date is not None:
        schedule.scheduled_date = req.scheduled_date
    if req.scheduled_time is not None:
        schedule.scheduled_time = req.scheduled_time
    if req.scheduled_date or req.scheduled_time:
        d = req.scheduled_date or schedule.scheduled_date
        t = req.scheduled_time or schedule.scheduled_time
        schedule.scheduled_at = datetime.strptime(f"{d} {t}", "%Y-%m-%d %H:%M")
    if req.status is not None:
        schedule.status = req.status
    if req.notes is not None:
        schedule.notes = req.notes
    if req.type is not None:
        schedule.type = req.type

    await db.commit()
    return {"id": schedule.id, "status": "updated"}


@router.delete("/{schedule_id}")
async def delete_schedule(
    schedule_id: int,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deleta agendamento."""
    result = await db.execute(select(Schedule).where(Schedule.id == schedule_id))
    schedule = result.scalar_one_or_none()

    if not schedule:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")

    await db.delete(schedule)
    await db.commit()
    return {"status": "deleted"}


@router.get("/stats")
async def schedule_stats(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Estatísticas de agendamentos."""
    now = datetime.now(SP_TZ).replace(tzinfo=None)
    today = now.strftime("%Y-%m-%d")

    # Total pendentes
    pending = await db.execute(
        select(func.count(Schedule.id)).where(Schedule.status == "pending")
    )
    # Hoje
    today_count = await db.execute(
        select(func.count(Schedule.id)).where(
            Schedule.scheduled_date == today,
            Schedule.status == "pending",
        )
    )
    # Completados
    completed = await db.execute(
        select(func.count(Schedule.id)).where(Schedule.status == "completed")
    )
    # Cancelados
    cancelled = await db.execute(
        select(func.count(Schedule.id)).where(Schedule.status == "cancelled")
    )

    return {
        "pending": pending.scalar() or 0,
        "today": today_count.scalar() or 0,
        "completed": completed.scalar() or 0,
        "cancelled": cancelled.scalar() or 0,
    }