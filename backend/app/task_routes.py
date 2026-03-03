from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, update
from pydantic import BaseModel
from typing import Optional
from app.models import Task, Contact, User
from datetime import datetime, date, timedelta

from app.database import get_db
from app.models import Task, Contact, User
from app.auth import get_current_user, get_tenant_id

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


# ── Schemas ──────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    type: str = "follow_up"
    priority: str = "media"
    due_date: str
    due_time: Optional[str] = None
    contact_wa_id: Optional[str] = None
    assigned_to: int

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    status: Optional[str] = None
    contact_wa_id: Optional[str] = None
    assigned_to: Optional[int] = None


# ── Helpers ──────────────────────────────────────────────

def task_to_dict(t: Task) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "type": t.type,
        "priority": t.priority,
        "due_date": t.due_date,
        "due_time": t.due_time,
        "status": t.status,
        "contact_wa_id": t.contact_wa_id,
        "contact_name": t.contact.name if t.contact else None,
        "assigned_to": t.assigned_to,
        "assigned_name": t.assigned_user.name if t.assigned_user else None,
        "created_by": t.created_by,
        "creator_name": t.creator.name if t.creator else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


async def log_activity(db: AsyncSession, contact_wa_id: str, activity_type: str, description: str, metadata: str = None, tenant_id: int = None):
    from app.models import Activity
    activity = Activity(
        tenant_id=tenant_id,
        contact_wa_id=contact_wa_id,
        type=activity_type,
        description=description,
        extra_data=metadata,
    )
    db.add(activity)


# ── Routes ───────────────────────────────────────────────

@router.get("")
async def list_tasks(
    status: Optional[str] = None,
    assigned_to: Optional[int] = None,
    priority: Optional[str] = None,
    filter: Optional[str] = None,  # today, overdue, week
    contact_wa_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    query = select(Task).where(Task.tenant_id == tenant_id).order_by(Task.due_date.asc(), Task.due_time.asc())

    if status:
        query = query.where(Task.status == status)
    if assigned_to:
        query = query.where(Task.assigned_to == assigned_to)
    if priority:
        query = query.where(Task.priority == priority)
    if contact_wa_id:
        query = query.where(Task.contact_wa_id == contact_wa_id)

    today_str = date.today().isoformat()

    if filter == "today":
        query = query.where(and_(Task.due_date == today_str, Task.status == "pending"))
    elif filter == "overdue":
        query = query.where(and_(Task.due_date < today_str, Task.status == "pending"))
    elif filter == "week":
        week_end = (date.today() + timedelta(days=7)).isoformat()
        query = query.where(and_(Task.due_date >= today_str, Task.due_date <= week_end, Task.status == "pending"))

    result = await db.execute(query)
    tasks = result.scalars().all()

    # Carregar relações
    for t in tasks:
        await db.refresh(t, ["contact", "assigned_user", "creator"])

    return [task_to_dict(t) for t in tasks]


@router.get("/stats")
async def task_stats(
    assigned_to: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    today_str = date.today().isoformat()

    base = select(Task).where(Task.tenant_id == tenant_id)
    if assigned_to:
        base = base.where(Task.assigned_to == assigned_to)

    # Pendentes hoje
    r1 = await db.execute(base.where(and_(Task.due_date == today_str, Task.status == "pending")))
    today_count = len(r1.scalars().all())

    # Atrasadas
    r2 = await db.execute(base.where(and_(Task.due_date < today_str, Task.status == "pending")))
    overdue_count = len(r2.scalars().all())

    # Concluídas essa semana
    week_start = (date.today() - timedelta(days=date.today().weekday())).isoformat()
    r3 = await db.execute(base.where(and_(Task.status == "completed", Task.due_date >= week_start)))
    completed_week = len(r3.scalars().all())

    # Total pendentes
    r4 = await db.execute(base.where(Task.status == "pending"))
    total_pending = len(r4.scalars().all())

    return {
        "today": today_count,
        "overdue": overdue_count,
        "completed_week": completed_week,
        "total_pending": total_pending,
    }


@router.post("")
async def create_task(
    req: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    task = Task(
        tenant_id=tenant_id,
        title=req.title,
        description=req.description,
        type=req.type,
        priority=req.priority,
        due_date=req.due_date,
        due_time=req.due_time,
        contact_wa_id=req.contact_wa_id,
        assigned_to=req.assigned_to,
        created_by=current_user.id,
    )
    db.add(task)
    await db.flush()

    # Registrar atividade no contato
    if req.contact_wa_id:
        await log_activity(
            db, req.contact_wa_id, "task_created",
            f"Tarefa criada: {req.title}",
            f'{{"task_id": {task.id}, "priority": "{req.priority}"}}'
        )

    await db.commit()
    await db.refresh(task, ["contact", "assigned_user", "creator"])
    return task_to_dict(task)


@router.patch("/{task_id}")
async def update_task(
    task_id: int,
    req: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Task).where(Task.id == task_id, Task.tenant_id == tenant_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    for field, value in req.dict(exclude_unset=True).items():
        setattr(task, field, value)

    task.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(task, ["contact", "assigned_user", "creator"])
    return task_to_dict(task)


@router.patch("/{task_id}/complete")
async def complete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Task).where(Task.id == task_id, Task.tenant_id == tenant_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    task.status = "completed"
    task.completed_at = datetime.utcnow()
    task.updated_at = datetime.utcnow()

    # Registrar atividade no contato
    if task.contact_wa_id:
        await log_activity(
            db, task.contact_wa_id, "task_completed",
            f"Tarefa concluída: {task.title}",
            f'{{"task_id": {task.id}}}'
        )

    await db.commit()
    await db.refresh(task, ["contact", "assigned_user", "creator"])
    return task_to_dict(task)


@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Task).where(Task.id == task_id, Task.tenant_id == tenant_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    await db.delete(task)
    await db.commit()
    return {"ok": True, "message": "Tarefa deletada"}