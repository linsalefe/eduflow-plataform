from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel
from typing import Optional, List, Any
from app.database import get_db
from app.models import Pipeline, Contact
from app.auth import get_current_user, get_tenant_id
from app.models import User

router = APIRouter(prefix="/api/pipelines", tags=["pipelines"])

DEFAULT_COLUMNS = [
    {"key": "novo", "label": "Novos Leads", "color": "#1D4ED8", "order": 0},
    {"key": "em_contato", "label": "Em Contato", "color": "#f59e0b", "order": 1},
    {"key": "qualificado", "label": "Qualificados", "color": "#8b5cf6", "order": 2},
    {"key": "negociando", "label": "Negociando", "color": "#06b6d4", "order": 3},
    {"key": "convertido", "label": "Convertidos", "color": "#10b981", "order": 4},
    {"key": "perdido", "label": "Perdidos", "color": "#ef4444", "order": 5},
]


class CreatePipelineRequest(BaseModel):
    name: str
    columns: Optional[List[Any]] = None


class UpdatePipelineRequest(BaseModel):
    name: Optional[str] = None
    columns: Optional[List[Any]] = None
    order: Optional[int] = None


@router.get("")
async def list_pipelines(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Pipeline)
        .where(Pipeline.tenant_id == tenant_id)
        .order_by(Pipeline.order, Pipeline.id)
    )
    pipelines = result.scalars().all()

    items = []
    for p in pipelines:
        count_result = await db.execute(
            select(func.count(Contact.id)).where(Contact.pipeline_id == p.id)
        )
        contact_count = count_result.scalar() or 0
        items.append({
            "id": p.id,
            "tenant_id": p.tenant_id,
            "name": p.name,
            "columns": p.columns or [],
            "is_default": p.is_default,
            "order": p.order,
            "contact_count": contact_count,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        })
    return items


@router.post("")
async def create_pipeline(
    req: CreatePipelineRequest,
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    # Check limit of 10
    count_result = await db.execute(
        select(func.count(Pipeline.id)).where(Pipeline.tenant_id == tenant_id)
    )
    count = count_result.scalar() or 0
    if count >= 10:
        raise HTTPException(status_code=400, detail="Limite de 10 pipelines atingido")

    pipeline = Pipeline(
        tenant_id=tenant_id,
        name=req.name,
        columns=req.columns if req.columns is not None else DEFAULT_COLUMNS,
        is_default=False,
        order=count,
    )
    db.add(pipeline)
    await db.commit()
    await db.refresh(pipeline)

    return {
        "id": pipeline.id,
        "tenant_id": pipeline.tenant_id,
        "name": pipeline.name,
        "columns": pipeline.columns,
        "is_default": pipeline.is_default,
        "order": pipeline.order,
        "created_at": pipeline.created_at.isoformat() if pipeline.created_at else None,
    }


@router.get("/{pipeline_id}")
async def get_pipeline(
    pipeline_id: int,
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Pipeline).where(Pipeline.id == pipeline_id, Pipeline.tenant_id == tenant_id)
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    count_result = await db.execute(
        select(func.count(Contact.id)).where(Contact.pipeline_id == p.id)
    )
    contact_count = count_result.scalar() or 0

    return {
        "id": p.id,
        "tenant_id": p.tenant_id,
        "name": p.name,
        "columns": p.columns or [],
        "is_default": p.is_default,
        "order": p.order,
        "contact_count": contact_count,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


@router.put("/{pipeline_id}")
async def update_pipeline(
    pipeline_id: int,
    req: UpdatePipelineRequest,
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Pipeline).where(Pipeline.id == pipeline_id, Pipeline.tenant_id == tenant_id)
    )
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    if req.name is not None:
        pipeline.name = req.name
    if req.columns is not None:
        pipeline.columns = req.columns
        flag_modified(pipeline, "columns")
    if req.order is not None:
        pipeline.order = req.order

    await db.commit()
    return {
        "id": pipeline.id,
        "name": pipeline.name,
        "columns": pipeline.columns,
        "is_default": pipeline.is_default,
        "order": pipeline.order,
        "updated_at": pipeline.updated_at.isoformat() if pipeline.updated_at else None,
    }


@router.delete("/{pipeline_id}")
async def delete_pipeline(
    pipeline_id: int,
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Pipeline).where(Pipeline.id == pipeline_id, Pipeline.tenant_id == tenant_id)
    )
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    if pipeline.is_default:
        raise HTTPException(status_code=400, detail="Não é possível deletar o pipeline default")

    # Find default pipeline
    default_result = await db.execute(
        select(Pipeline).where(Pipeline.tenant_id == tenant_id, Pipeline.is_default == True)
    )
    default_pipeline = default_result.scalar_one_or_none()
    if not default_pipeline:
        raise HTTPException(status_code=500, detail="Pipeline default não encontrado")

    # Move contacts to default pipeline
    await db.execute(
        update(Contact)
        .where(Contact.pipeline_id == pipeline_id)
        .values(pipeline_id=default_pipeline.id, lead_status="novo")
    )

    await db.delete(pipeline)
    await db.commit()
    return {"message": "Pipeline deletado, contacts movidos para pipeline default"}


@router.put("/{pipeline_id}/columns")
async def update_pipeline_columns(
    pipeline_id: int,
    data: List[Any],
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Pipeline).where(Pipeline.id == pipeline_id, Pipeline.tenant_id == tenant_id)
    )
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    pipeline.columns = data
    flag_modified(pipeline, "columns")

    await db.commit()
    return {"message": "Colunas atualizadas", "columns": pipeline.columns}
