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
    delay_hours: int
    message: str


class FlowCreate(BaseModel):
    name: str
    stage: str
    steps: List[StepSchema]


class FlowUpdate(BaseModel):
    name: Optional[str] = None
    stage: Optional[str] = None
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
            "created_at": flow.created_at.isoformat() if flow.created_at else None,
            "steps": [
                {
                    "id": s.id,
                    "step_order": s.step_order,
                    "delay_hours": s.delay_hours,
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
        is_active=True,
    )
    db.add(flow)
    await db.flush()

    for step in data.steps:
        db.add(AutomationStep(
            flow_id=flow.id,
            step_order=step.step_order,
            delay_hours=step.delay_hours,
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
                delay_hours=step.delay_hours,
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
    # Verificar se o fluxo pertence ao tenant
    flow_result = await db.execute(
        select(AutomationFlow).where(
            AutomationFlow.id == flow_id,
            AutomationFlow.tenant_id == tenant_id,
        )
    )
    if not flow_result.scalar_one_or_none():
        raise HTTPException(404, "Fluxo não encontrado")

    # Buscar execuções pendentes
    exec_result = await db.execute(
        select(AutomationExecution).where(
            AutomationExecution.flow_id == flow_id,
            AutomationExecution.status == "pending",
        ).order_by(AutomationExecution.next_send_at)
    )
    executions = exec_result.scalars().all()

    # Buscar nomes dos contatos
    output = []
    for ex in executions:
        contact_result = await db.execute(
            select(Contact).where(Contact.wa_id == ex.contact_wa_id)
        )
        contact = contact_result.scalar_one_or_none()
        output.append({
            "contact_wa_id": ex.contact_wa_id,
            "contact_name": contact.name if contact else ex.contact_wa_id,
            "current_step": ex.current_step,
            "next_send_at": ex.next_send_at.isoformat(),
        })

    return output