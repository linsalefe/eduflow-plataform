"""
Rotas do Superadmin: CRUD de tenants, features, ativação/desativação.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import Tenant, User, Contact, Channel, TokenUsage
from sqlalchemy import select, func, and_
from datetime import datetime, timedelta
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
            "credits_balance": t.credits_balance or 0,
            "credits_used": t.credits_used or 0,
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

@tenant_router.get("/ai-off-statuses")
async def get_ai_off_statuses(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")
    return tenant.ai_off_statuses or []


@tenant_router.put("/ai-off-statuses")
async def update_ai_off_statuses(
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
    tenant.ai_off_statuses = data
    flag_modified(tenant, "ai_off_statuses")

    await db.commit()
    return {"message": "AI off statuses atualizados", "ai_off_statuses": tenant.ai_off_statuses}

@tenant_router.get("/agent-messages")
async def get_agent_messages(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")
    return tenant.agent_messages or {
        "followup": {
            "confirmation": "Oi {nome}! 😊 Ficou confirmado o nosso bate-papo para *{data} às {hora}*. Qualquer dúvida pode me chamar aqui. Até lá! 👋",
            "reminder_d1": "Oi {nome}! 😊 Só passando para lembrar que amanhã temos nosso bate-papo agendado para às {hora}. Te espero lá!",
            "reminder_d0": "Oi {nome}! 🎯 Daqui a pouco temos nosso bate-papo! Esteja à vontade para tirar todas as suas dúvidas. Até já! 😊"
        },
        "reactivation": {
            "no_show": "Oi {nome}! Vi que não conseguiu no horário combinado. Sem problemas! Quer remarcar? 😊",
            "no_answer": "Oi {nome}! Tentei te contatar algumas vezes mas não consegui falar. Posso te ajudar de outra forma?",
            "cold": "Oi {nome}! Tudo bem? Passando para saber se ainda tem interesse. Posso te contar mais detalhes? 😊"
        },
        "briefing": {
            "prompt": "Gere um briefing objetivo sobre o lead para a consultora usar na reunião. Destaque motivação, perfil e principais pontos de atenção. Seja direto e prático."
        }
    }


@tenant_router.put("/agent-messages")
async def update_agent_messages(
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
    tenant.agent_messages = data
    flag_modified(tenant, "agent_messages")

    await db.commit()
    return {"message": "Mensagens atualizadas", "agent_messages": tenant.agent_messages}

@tenant_router.get("/agent-pipeline-moves")
async def get_agent_pipeline_moves(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")
    return tenant.agent_pipeline_moves or {"on_first_contact": "em_contato", "on_schedule_call": "qualificado"}


@tenant_router.put("/agent-pipeline-moves")
async def update_agent_pipeline_moves(
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
    tenant.agent_pipeline_moves = data
    flag_modified(tenant, "agent_pipeline_moves")
    await db.commit()
    return {"message": "Pipeline moves atualizados", "agent_pipeline_moves": tenant.agent_pipeline_moves}
# === Metas mensais ===

class GoalsUpdate(BaseModel):
    monthly_goal: Optional[float] = None
    monthly_lead_goal: Optional[int] = None
    monthly_schedule_goal: Optional[int] = None


@tenant_router.get("/goals")
async def get_goals(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")
    return {
        "monthly_goal": tenant.monthly_goal or 0,
        "monthly_lead_goal": tenant.monthly_lead_goal or 0,
        "monthly_schedule_goal": tenant.monthly_schedule_goal or 0,
    }


@tenant_router.put("/goals")
async def update_goals(
    data: GoalsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    if data.monthly_goal is not None:
        tenant.monthly_goal = data.monthly_goal
    if data.monthly_lead_goal is not None:
        tenant.monthly_lead_goal = data.monthly_lead_goal
    if data.monthly_schedule_goal is not None:
        tenant.monthly_schedule_goal = data.monthly_schedule_goal

    await db.commit()
    return {
        "message": "Metas atualizadas",
        "monthly_goal": tenant.monthly_goal,
        "monthly_lead_goal": tenant.monthly_lead_goal,
        "monthly_schedule_goal": tenant.monthly_schedule_goal,
    }
@tenant_router.get("/reengagement-config")
async def get_reengagement_config(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")
    return tenant.reengagement_config or {
        "enabled": False,
        "attempts": [
            {"delay_minutes": 20, "instruction": "Envie uma mensagem gentil perguntando se o lead ainda está aí."},
            {"delay_minutes": 1440, "instruction": "Reforce o valor do serviço e pergunte se tem dúvidas."},
            {"delay_minutes": 2880, "instruction": "Última tentativa, diga que está à disposição."},
        ],
        "max_attempts": 3,
        "move_to_on_give_up": "parou_de_responder",
    }


@tenant_router.put("/reengagement-config")
async def update_reengagement_config(
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
    tenant.reengagement_config = data
    flag_modified(tenant, "reengagement_config")

    await db.commit()
    return {"message": "Configuração de reengajamento atualizada", "reengagement_config": tenant.reengagement_config}
# === Rotas de Token Usage ===

@router.get("/token-usage")
async def get_token_usage_summary(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    """Retorna consumo total de tokens por tenant."""
    result = await db.execute(
        select(
            TokenUsage.tenant_id,
            Tenant.name.label("tenant_name"),
            func.sum(TokenUsage.prompt_tokens).label("prompt_tokens"),
            func.sum(TokenUsage.completion_tokens).label("completion_tokens"),
            func.sum(TokenUsage.total_tokens).label("total_tokens"),
            func.count(TokenUsage.id).label("total_calls"),
        )
        .join(Tenant, Tenant.id == TokenUsage.tenant_id)
        .group_by(TokenUsage.tenant_id, Tenant.name)
        .order_by(func.sum(TokenUsage.total_tokens).desc())
    )
    rows = result.all()

    # Buscar créditos de cada tenant

    tenant_ids = [r.tenant_id for r in rows]
    credits_map = {}
    if tenant_ids:
        t_result = await db.execute(
            select(Tenant.id, Tenant.credits_balance, Tenant.credits_used)
            .where(Tenant.id.in_(tenant_ids))
        )
        for tr in t_result.all():
            credits_map[tr.id] = {"balance": tr.credits_balance or 0, "used": tr.credits_used or 0}

    return [
        {
            "tenant_id": r.tenant_id,
            "tenant_name": r.tenant_name,
            "prompt_tokens": r.prompt_tokens or 0,
            "completion_tokens": r.completion_tokens or 0,
            "total_tokens": r.total_tokens or 0,
            "total_calls": r.total_calls or 0,
            "credits_balance": credits_map.get(r.tenant_id, {}).get("balance", 0),
            "credits_used": credits_map.get(r.tenant_id, {}).get("used", 0),
        }
        for r in rows
    ]


@router.get("/token-usage/{tenant_id}")
async def get_token_usage_by_tenant(
    tenant_id: int,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    """Retorna consumo diário de tokens de um tenant específico."""
    since = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(
        select(
            func.date(TokenUsage.created_at).label("date"),
            func.sum(TokenUsage.prompt_tokens).label("prompt_tokens"),
            func.sum(TokenUsage.completion_tokens).label("completion_tokens"),
            func.sum(TokenUsage.total_tokens).label("total_tokens"),
            func.count(TokenUsage.id).label("calls"),
            TokenUsage.model,
        )
        .where(
            and_(
                TokenUsage.tenant_id == tenant_id,
                TokenUsage.created_at >= since,
            )
        )
        .group_by(func.date(TokenUsage.created_at), TokenUsage.model)
        .order_by(func.date(TokenUsage.created_at).desc())
    )
    rows = result.all()
    return [
        {
            "date": str(r.date),
            "prompt_tokens": r.prompt_tokens or 0,
            "completion_tokens": r.completion_tokens or 0,
            "total_tokens": r.total_tokens or 0,
            "calls": r.calls or 0,
            "model": r.model,
        }
        for r in rows
    ]

@router.post("/tenants/{tenant_id}/credits")
async def add_credits(
    tenant_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    """Adiciona créditos a um tenant."""
    amount = int(body.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Quantidade inválida")

    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    tenant.credits_balance = (tenant.credits_balance or 0) + amount
    await db.commit()

    return {
        "credits_balance": tenant.credits_balance,
        "credits_used": tenant.credits_used,
    }

@router.patch("/tenants/{tenant_id}/credits")
async def set_credits(
    tenant_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    """Define o saldo de créditos de um tenant."""
    amount = int(body.get("amount", 0))
    if amount < 0:
        raise HTTPException(status_code=400, detail="Valor inválido")

    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    tenant.credits_balance = amount
    await db.commit()

    return {
        "credits_balance": tenant.credits_balance,
        "credits_used": tenant.credits_used,
    }