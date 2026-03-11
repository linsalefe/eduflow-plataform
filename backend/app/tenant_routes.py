"""
Rotas do Superadmin: CRUD de tenants, features, ativação/desativação.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import Tenant, User, Contact, Channel
from app.auth import get_current_user, get_tenant_id, hash_password

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# === Middleware: só superadmin ===

async def require_superadmin(current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao superadmin")
    return current_user


# === Schemas ===

class TenantCreate(BaseModel):
    name: str
    slug: str
    owner_name: str
    owner_email: str
    owner_phone: Optional[str] = None
    owner_password: str
    plan: str = "basic"
    max_users: int = 5
    max_channels: int = 2
    notes: Optional[str] = None

class TenantUpdate(BaseModel):
    name: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    owner_phone: Optional[str] = None
    plan: Optional[str] = None
    max_users: Optional[int] = None
    max_channels: Optional[int] = None
    notes: Optional[str] = None

class FeaturesUpdate(BaseModel):
    features: dict


# === Rotas ===

@router.get("/tenants")
async def list_tenants(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    result = await db.execute(select(Tenant).order_by(Tenant.created_at.desc()))
    tenants = result.scalars().all()

    items = []
    for t in tenants:
        user_count = (await db.execute(
            select(func.count(User.id)).where(User.tenant_id == t.id)
        )).scalar() or 0

        contact_count = (await db.execute(
            select(func.count(Contact.id)).where(Contact.tenant_id == t.id)
        )).scalar() or 0

        items.append({
            "id": t.id,
            "name": t.name,
            "slug": t.slug,
            "owner_name": t.owner_name,
            "owner_email": t.owner_email,
            "owner_phone": t.owner_phone,
            "plan": t.plan,
            "status": t.status,
            "is_active": t.is_active,
            "max_users": t.max_users,
            "max_channels": t.max_channels,
            "features": t.features or {},
            "agent_plan_flags": t.agent_plan_flags or {},
            "notes": t.notes,
            "user_count": user_count,
            "contact_count": contact_count,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })

    return items


@router.post("/tenants")
async def create_tenant(
    data: TenantCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    # Verificar slug único
    existing = await db.execute(select(Tenant).where(Tenant.slug == data.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug já existe")

    # Verificar email do owner
    existing_email = await db.execute(select(User).where(User.email == data.owner_email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    # Criar tenant
    tenant = Tenant(
        name=data.name,
        slug=data.slug,
        owner_name=data.owner_name,
        owner_email=data.owner_email,
        owner_phone=data.owner_phone,
        plan=data.plan,
        max_users=data.max_users,
        max_channels=data.max_channels,
        notes=data.notes,
    )
    db.add(tenant)
    await db.flush()

    # Criar usuário admin do tenant
    owner = User(
        tenant_id=tenant.id,
        name=data.owner_name,
        email=data.owner_email,
        password_hash=hash_password(data.owner_password),
        role="admin",
        is_active=True,
    )
    db.add(owner)
    await db.commit()

    return {"id": tenant.id, "slug": tenant.slug, "message": "Tenant criado com sucesso"}


@router.get("/tenants/{tenant_id}")
async def get_tenant(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    # Buscar usuários do tenant
    users_result = await db.execute(
        select(User).where(User.tenant_id == tenant_id).order_by(User.name)
    )
    users = users_result.scalars().all()

    # Stats
    contact_count = (await db.execute(
        select(func.count(Contact.id)).where(Contact.tenant_id == tenant_id)
    )).scalar() or 0

    channel_count = (await db.execute(
        select(func.count(Channel.id)).where(Channel.tenant_id == tenant_id)
    )).scalar() or 0

    return {
        "id": t.id,
        "name": t.name,
        "slug": t.slug,
        "owner_name": t.owner_name,
        "owner_email": t.owner_email,
        "owner_phone": t.owner_phone,
        "plan": t.plan,
        "status": t.status,
        "is_active": t.is_active,
        "max_users": t.max_users,
        "max_channels": t.max_channels,
        "features": t.features or {},
        "notes": t.notes,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "stats": {
            "users": len(users),
            "contacts": contact_count,
            "channels": channel_count,
        },
        "users": [
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "is_active": u.is_active,
            }
            for u in users
        ],
    }


@router.patch("/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: int,
    data: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    for field, value in data.dict(exclude_unset=True).items():
        setattr(tenant, field, value)

    await db.commit()
    return {"message": "Tenant atualizado"}


@router.patch("/tenants/{tenant_id}/features")
async def update_features(
    tenant_id: int,
    data: FeaturesUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    current = dict(tenant.features or {})
    current.update(data.features)
    tenant.features = current

    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(tenant, "features")

    await db.commit()
    return {"message": "Features atualizadas", "features": tenant.features}


@router.patch("/tenants/{tenant_id}/toggle")
async def toggle_tenant(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    tenant.is_active = not tenant.is_active
    await db.commit()

    status = "ativado" if tenant.is_active else "desativado"
    return {"message": f"Tenant {status}", "is_active": tenant.is_active}

# ============================================================
# ROTAS DE AGENTES — SUPERADMIN
# ============================================================

@router.patch("/tenants/{tenant_id}/plan-flags")
async def update_plan_flags(
    tenant_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    current = dict(tenant.agent_plan_flags or {})
    current.update(data)
    tenant.agent_plan_flags = current

    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(tenant, "agent_plan_flags")

    await db.commit()
    return {"message": "Plan flags atualizados", "agent_plan_flags": tenant.agent_plan_flags}


# ============================================================
# ROTAS DE AGENTES — TENANT
# ============================================================

tenant_router = APIRouter(prefix="/api/tenant", tags=["Tenant - Agentes"])


@tenant_router.get("/agent-plan-flags")
async def get_agent_plan_flags(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")
    return tenant.agent_plan_flags or {}


@tenant_router.get("/agent-flags")
async def get_agent_flags(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")
    return tenant.agent_flags or {}


@tenant_router.put("/agent-flags")
async def update_agent_flags(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    plan = tenant.agent_plan_flags or {}
    for agent, value in data.items():
        if value and not plan.get(agent):
            raise HTTPException(status_code=403, detail=f"Agente '{agent}' não disponível no plano")

    from sqlalchemy.orm.attributes import flag_modified
    tenant.agent_flags = data
    flag_modified(tenant, "agent_flags")

    await db.commit()
    return {"message": "Agent flags atualizados", "agent_flags": tenant.agent_flags}


@tenant_router.get("/kanban-triggers")
async def get_kanban_triggers(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")
    return tenant.kanban_triggers or {}


@tenant_router.put("/kanban-triggers")
async def update_kanban_triggers(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    from sqlalchemy.orm.attributes import flag_modified
    tenant.kanban_triggers = data
    flag_modified(tenant, "kanban_triggers")

    await db.commit()
    return {"message": "Kanban triggers atualizados", "kanban_triggers": tenant.kanban_triggers}

@tenant_router.get("/kanban-columns")
async def get_kanban_columns(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")
    return tenant.kanban_columns or [
        {"key": "novo", "label": "Novos Leads", "color": "#6366f1", "order": 0},
        {"key": "em_contato", "label": "Em Contato", "color": "#f59e0b", "order": 1},
        {"key": "qualificado", "label": "Qualificados", "color": "#8b5cf6", "order": 2},
        {"key": "em_matricula", "label": "Em Matrícula", "color": "#06b6d4", "order": 3},
        {"key": "matriculado", "label": "Matriculados", "color": "#10b981", "order": 4},
        {"key": "perdido", "label": "Perdidos", "color": "#ef4444", "order": 5},
    ]


from typing import List, Any

@tenant_router.put("/kanban-columns")
async def update_kanban_columns(
    data: List[Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    from sqlalchemy.orm.attributes import flag_modified
    tenant.kanban_columns = data
    flag_modified(tenant, "kanban_columns")

    await db.commit()
    return {"message": "Colunas atualizadas", "kanban_columns": tenant.kanban_columns}