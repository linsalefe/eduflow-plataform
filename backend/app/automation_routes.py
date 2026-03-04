from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from app.database import get_db
from app.auth import get_current_user, get_tenant_id
from app.models import AutomationFlow, AutomationStep, AutomationExecution, Contact

router = APIRouter(prefix="/api/automations", tags=["Automations"])


class StepSchema(BaseModel):
    step_order: int
    delay_minutes: int
    message: str


class FlowCreate(BaseModel):
    name: str
    stage: str
    channel_id: Optional[int] = None
    steps: List[StepSchema]


class FlowUpdate(BaseModel):
    name: Optional[str] = None
    stage: Optional[str] = None
    channel_id: Optional[int] = None
    is_active: Optional[bool] = None
    steps: Optional[List[StepSchema]] = None


# ── Listar fluxos ──────────────────────────────────────────
@router.get("")
async def list_flows(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(
        select(AutomationFlow)
        .where(AutomationFlow.tenant_id == tenant_id)
        .order_by(AutomationFlow.created_at.desc())
    )
    flows = result.scalars().all()

    output = []
    for flow in flows:
        steps_result = await db.execute(
            select(AutomationStep)
            .where(AutomationStep.flow_id == flow.id)
            .order_by(AutomationStep.step_order)
        )
        steps = steps_result.scalars().all()
        output.append({
            "id": flow.id,
            "name": flow.name,
            "stage": flow.stage,
            "is_active": flow.is_active,
            "channel_id": flow.channel_id,
            "created_at": flow.created_at.isoformat() if flow.created_at else None,
            "steps": [
                {
                    "id": s.id,
                    "step_order": s.step_order,
                    "delay_minutes": s.delay_minutes,
                    "message": s.message,
                }
                for s in steps
            ],
        })
    return output


# ── Criar fluxo ────────────────────────────────────────────
@router.post("")
async def create_flow(
    data: FlowCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    flow = AutomationFlow(
        tenant_id=tenant_id,
        name=data.name,
        stage=data.stage,
        channel_id=data.channel_id,
        is_active=True,
    )
    db.add(flow)
    await db.flush()

    for step in data.steps:
        db.add(AutomationStep(
            flow_id=flow.id,
            step_order=step.step_order,
            delay_minutes=step.delay_minutes,
            message=step.message,
        ))

    await db.commit()
    return {"id": flow.id, "message": "Fluxo criado com sucesso"}


# ── Atualizar fluxo ────────────────────────────────────────
@router.put("/{flow_id}")
async def update_flow(
    flow_id: int,
    data: FlowUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(
        select(AutomationFlow)
        .where(AutomationFlow.id == flow_id, AutomationFlow.tenant_id == tenant_id)
    )
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Fluxo não encontrado")

    if data.name is not None:
        flow.name = data.name
    if data.stage is not None:
        flow.stage = data.stage
    if data.channel_id is not None:
        flow.channel_id = data.channel_id
    if data.is_active is not None:
        flow.is_active = data.is_active
    flow.updated_at = datetime.utcnow()

    if data.steps is not None:
        await db.execute(
            AutomationStep.__table__.delete().where(AutomationStep.flow_id == flow_id)
        )
        for step in data.steps:
            db.add(AutomationStep(
                flow_id=flow.id,
                step_order=step.step_order,
                delay_minutes=step.delay_minutes,
                message=step.message,
            ))

    await db.commit()
    return {"message": "Fluxo atualizado"}


# ── Deletar fluxo ──────────────────────────────────────────
@router.delete("/{flow_id}")
async def delete_flow(
    flow_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(
        select(AutomationFlow)
        .where(AutomationFlow.id == flow_id, AutomationFlow.tenant_id == tenant_id)
    )
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Fluxo não encontrado")

    await db.delete(flow)
    await db.commit()
    return {"message": "Fluxo removido"}


# ── Stats ──────────────────────────────────────────────────
@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    flows_result = await db.execute(
        select(AutomationFlow).where(AutomationFlow.tenant_id == tenant_id)
    )
    flows = flows_result.scalars().all()
    flow_ids = [f.id for f in flows]

    sent_today = 0
    if flow_ids:
        today = datetime.utcnow().date()
        exec_result = await db.execute(
            select(AutomationExecution).where(
                AutomationExecution.flow_id.in_(flow_ids),
                AutomationExecution.status == "sent",
            )
        )
        executions = exec_result.scalars().all()
        sent_today = sum(
            1 for e in executions
            if e.updated_at and e.updated_at.date() == today
        )

    return {
        "total_flows": len(flows),
        "active_flows": sum(1 for f in flows if f.is_active),
        "sent_today": sent_today,
    }
# ── Fila de execuções de um fluxo ─────────────────────────
@router.get("/{flow_id}/queue")
async def get_flow_queue(
    flow_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    flow_result = await db.execute(
        select(AutomationFlow).where(
            AutomationFlow.id == flow_id,
            AutomationFlow.tenant_id == tenant_id,
        )
    )
    if not flow_result.scalar_one_or_none():
        raise HTTPException(404, "Fluxo não encontrado")

    pending_result = await db.execute(
        select(AutomationExecution).where(
            AutomationExecution.flow_id == flow_id,
            AutomationExecution.status == "pending",
        ).order_by(AutomationExecution.next_send_at)
    )
    pending = pending_result.scalars().all()

    history_result = await db.execute(
        select(AutomationExecution).where(
            AutomationExecution.flow_id == flow_id,
            AutomationExecution.status.in_(["completed", "failed"]),
        ).order_by(AutomationExecution.updated_at.desc()).limit(20)
    )
    history = history_result.scalars().all()

    async def enrich(ex):
        contact_result = await db.execute(select(Contact).where(Contact.wa_id == ex.contact_wa_id))
        contact = contact_result.scalar_one_or_none()
        return {
            "contact_wa_id": ex.contact_wa_id,
            "contact_name": contact.name if contact else ex.contact_wa_id,
            "current_step": ex.current_step,
            "status": ex.status,
            "next_send_at": ex.next_send_at.isoformat() if ex.next_send_at else None,
            "sent_at": ex.sent_at.isoformat() if ex.sent_at else None,
            "error_message": ex.error_message,
        }

    output_pending = [await enrich(ex) for ex in pending]
    output_history = [await enrich(ex) for ex in history]

    return {"pending": output_pending, "history": output_history}