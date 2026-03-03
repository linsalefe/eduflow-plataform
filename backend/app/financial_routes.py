from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, extract
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from decimal import Decimal

from app.database import get_db
from app.models import FinancialEntry, Contact, User
from app.auth import get_current_user, get_tenant_id

router = APIRouter(prefix="/api/financial", tags=["Financial"])


# ── Schemas ──────────────────────────────────────────

class EntryCreate(BaseModel):
    contact_wa_id: str
    type: str = "matricula"
    value: float
    description: Optional[str] = None
    course: Optional[str] = None


# ── Serializer ───────────────────────────────────────

def entry_to_dict(e: FinancialEntry) -> dict:
    return {
        "id": e.id,
        "contact_wa_id": e.contact_wa_id,
        "type": e.type,
        "value": float(e.value),
        "description": e.description,
        "course": e.course,
        "created_by": e.created_by,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


# ── Routes ───────────────────────────────────────────

@router.post("/entries")
async def create_entry(
    data: EntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Contact).where(Contact.wa_id == data.contact_wa_id, Contact.tenant_id == tenant_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contato não encontrado")

    entry = FinancialEntry(
        tenant_id=tenant_id,
        contact_wa_id=data.contact_wa_id,
        type=data.type,
        value=data.value,
        description=data.description,
        course=data.course,
        created_by=current_user.id,
    )
    db.add(entry)

    # Atualizar deal_value do contato
    contact.deal_value = (contact.deal_value or 0) + Decimal(str(data.value))

    await db.commit()
    await db.refresh(entry)
    return entry_to_dict(entry)


@router.get("/entries")
async def list_entries(
    month: Optional[int] = None,
    year: Optional[int] = None,
    course: Optional[str] = None,
    type: Optional[str] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    query = select(FinancialEntry).where(FinancialEntry.tenant_id == tenant_id).order_by(FinancialEntry.created_at.desc())

    if month and year:
        query = query.where(
            and_(
                extract("month", FinancialEntry.created_at) == month,
                extract("year", FinancialEntry.created_at) == year,
            )
        )
    elif year:
        query = query.where(extract("year", FinancialEntry.created_at) == year)

    if course:
        query = query.where(FinancialEntry.course == course)
    if type:
        query = query.where(FinancialEntry.type == type)

    query = query.limit(limit)
    result = await db.execute(query)
    entries = result.scalars().all()

    # Enriquecer com nome do contato
    enriched = []
    for e in entries:
        d = entry_to_dict(e)
        contact_res = await db.execute(select(Contact.name).where(Contact.wa_id == e.contact_wa_id))
        d["contact_name"] = contact_res.scalar_one_or_none() or e.contact_wa_id
        creator_res = await db.execute(select(User.name).where(User.id == e.created_by))
        d["created_by_name"] = creator_res.scalar_one_or_none() or ""
        enriched.append(d)

    return enriched


@router.get("/summary")
async def financial_summary(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    now = datetime.now()
    m = month or now.month
    y = year or now.year

    date_filter = and_(
        FinancialEntry.tenant_id == tenant_id,
        extract("month", FinancialEntry.created_at) == m,
        extract("year", FinancialEntry.created_at) == y,
    )

    # Receita total do mês (matriculas)
    res = await db.execute(
        select(func.coalesce(func.sum(FinancialEntry.value), 0))
        .where(and_(date_filter, FinancialEntry.type == "matricula"))
    )
    revenue = float(res.scalar())

    # Cancelamentos do mês
    res = await db.execute(
        select(func.coalesce(func.sum(FinancialEntry.value), 0))
        .where(and_(date_filter, FinancialEntry.type == "cancelamento"))
    )
    cancellations = float(res.scalar())

    # Total de matrículas
    res = await db.execute(
        select(func.count(FinancialEntry.id))
        .where(and_(date_filter, FinancialEntry.type == "matricula"))
    )
    total_enrollments = res.scalar() or 0

    # Ticket médio
    avg_ticket = revenue / total_enrollments if total_enrollments > 0 else 0

    # Receita por curso
    res = await db.execute(
        select(FinancialEntry.course, func.sum(FinancialEntry.value), func.count(FinancialEntry.id))
        .where(and_(date_filter, FinancialEntry.type == "matricula"))
        .group_by(FinancialEntry.course)
    )
    by_course = [
        {"course": row[0] or "Sem curso", "revenue": float(row[1]), "count": row[2]}
        for row in res.all()
    ]

    return {
        "month": m,
        "year": y,
        "revenue": revenue,
        "cancellations": cancellations,
        "net_revenue": revenue - cancellations,
        "total_enrollments": total_enrollments,
        "avg_ticket": round(avg_ticket, 2),
        "by_course": by_course,
    }


@router.get("/by-agent")
async def revenue_by_agent(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    now = datetime.now()
    m = month or now.month
    y = year or now.year

    date_filter = and_(
        FinancialEntry.tenant_id == tenant_id,
        extract("month", FinancialEntry.created_at) == m,
        extract("year", FinancialEntry.created_at) == y,
        FinancialEntry.type == "matricula",
    )

    res = await db.execute(
        select(
            FinancialEntry.created_by,
            func.sum(FinancialEntry.value),
            func.count(FinancialEntry.id),
        )
        .where(date_filter)
        .group_by(FinancialEntry.created_by)
    )

    agents = []
    for row in res.all():
        user_res = await db.execute(select(User.name).where(User.id == row[0]))
        name = user_res.scalar_one_or_none() or f"User #{row[0]}"
        agents.append({
            "user_id": row[0],
            "name": name,
            "revenue": float(row[1]),
            "count": row[2],
        })

    agents.sort(key=lambda x: x["revenue"], reverse=True)
    return agents


@router.delete("/entries/{entry_id}")
async def delete_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(FinancialEntry).where(FinancialEntry.id == entry_id, FinancialEntry.tenant_id == tenant_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada não encontrada")

    # Reverter deal_value do contato
    contact_res = await db.execute(select(Contact).where(Contact.wa_id == entry.contact_wa_id))
    contact = contact_res.scalar_one_or_none()
    if contact and contact.deal_value:
        contact.deal_value = max(0, contact.deal_value - entry.value)

    await db.delete(entry)
    await db.commit()
    return {"ok": True}