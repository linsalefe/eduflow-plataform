"""
Rotas para gerenciamento de Call Campaigns.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional
from app.database import get_db
from app.models import Contact
from app.voice_ai_elevenlabs.models import CallCampaign, CallCampaignItem
from app.auth import get_current_user

router = APIRouter(prefix="/api/voice-ai-el/campaigns", tags=["Call Campaigns"])

SP_TZ = timezone(timedelta(hours=-3))


# ============================================================
# SCHEMAS
# ============================================================

class CreateCampaignRequest(BaseModel):
    name: str
    contact_ids: List[int]
    dynamic_variables: Dict[str, dict] = {}

class CampaignActionRequest(BaseModel):
    action: str  # "start", "pause", "cancel"


# ============================================================
# HELPERS
# ============================================================

def resolve_variables(contact: Contact, var_config: dict) -> dict:
    """Resolve as variáveis dinâmicas para um contato específico."""
    resolved = {}
    for var_name, config in var_config.items():
        source = config.get("source", "") if isinstance(config, dict) else config.source
        value = config.get("value", "") if isinstance(config, dict) else config.value

        if source == "contact_name":
            resolved[var_name] = contact.name or ""
        elif source == "contact_wa_id":
            resolved[var_name] = contact.wa_id or ""
        elif source == "fixed":
            resolved[var_name] = value or ""
        elif source == "tag":
            # Pega a primeira tag do contato que contenha o valor
            tag_names = [t.name for t in contact.tags] if contact.tags else []
            resolved[var_name] = tag_names[0] if tag_names else ""
        else:
            resolved[var_name] = ""
    return resolved

def format_phone(wa_id: str) -> str:
    """Formata wa_id para número E.164 para ligação."""
    clean = wa_id.replace("+", "").replace("-", "").replace(" ", "")
    # Fix BR mobile: wa_id pode estar sem o 9° dígito (55 + DDD + 8 dígitos = 12)
    # Formato correto: +55 + DDD(2) + 9 + número(8) = 13 dígitos
    if clean.startswith("55") and len(clean) == 12:
        clean = clean[:4] + "9" + clean[4:]
    return f"+{clean}"


# ============================================================
# CRIAR CAMPANHA
# ============================================================

@router.post("")
async def create_campaign(
    req: CreateCampaignRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Cria uma campanha de ligações com lista de contatos."""
    if not req.contact_ids:
        raise HTTPException(status_code=400, detail="Selecione pelo menos um contato.")
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Nome da campanha é obrigatório.")

    # Buscar contatos com tags
    result = await db.execute(
        select(Contact).where(
            Contact.id.in_(req.contact_ids),
            Contact.tenant_id == current_user.tenant_id,
        )
    )
    contacts = result.scalars().all()

    if not contacts:
        raise HTTPException(status_code=404, detail="Nenhum contato encontrado.")

    # Criar campanha
    campaign = CallCampaign(
        tenant_id=current_user.tenant_id,
        created_by=current_user.id,
        name=req.name.strip(),
        dynamic_variables=req.dynamic_variables,
        status="pending",
        total_items=len(contacts),
    )
    db.add(campaign)
    await db.flush()

    # Criar itens da fila
    var_config = req.dynamic_variables
    for contact in contacts:
        resolved = resolve_variables(contact, var_config)
        item = CallCampaignItem(
            campaign_id=campaign.id,
            contact_id=contact.id,
            phone_number=format_phone(contact.wa_id),
            resolved_variables=resolved,
            status="pending",
        )
        db.add(item)

    await db.commit()

    return {
        "id": campaign.id,
        "name": campaign.name,
        "total_items": campaign.total_items,
        "status": campaign.status,
    }


# ============================================================
# LISTAR CAMPANHAS
# ============================================================

@router.get("")
async def list_campaigns(
    limit: int = Query(default=20),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Lista campanhas do tenant."""
    query = (
        select(CallCampaign)
        .where(CallCampaign.tenant_id == current_user.tenant_id)
        .order_by(CallCampaign.id.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(query)
    campaigns = result.scalars().all()

    count_result = await db.execute(
        select(func.count(CallCampaign.id))
        .where(CallCampaign.tenant_id == current_user.tenant_id)
    )
    total = count_result.scalar() or 0

    return {
        "total": total,
        "campaigns": [
            {
                "id": c.id,
                "name": c.name,
                "status": c.status,
                "total_items": c.total_items,
                "completed_items": c.completed_items,
                "failed_items": c.failed_items,
                "created_at": str(c.created_at) if c.created_at else "",
                "started_at": str(c.started_at) if c.started_at else "",
                "completed_at": str(c.completed_at) if c.completed_at else "",
            }
            for c in campaigns
        ],
    }


# ============================================================
# DETALHES DA CAMPANHA
# ============================================================

@router.get("/{campaign_id}")
async def get_campaign_detail(
    campaign_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Detalhes da campanha com todos os itens."""
    result = await db.execute(
        select(CallCampaign).where(
            CallCampaign.id == campaign_id,
            CallCampaign.tenant_id == current_user.tenant_id,
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campanha não encontrada.")

    # Buscar itens com nome do contato
    items_result = await db.execute(
        select(CallCampaignItem)
        .where(CallCampaignItem.campaign_id == campaign_id)
        .order_by(CallCampaignItem.id)
    )
    items = items_result.scalars().all()

    # Buscar nomes dos contatos
    contact_ids = [item.contact_id for item in items]
    contacts_result = await db.execute(
        select(Contact).where(Contact.id.in_(contact_ids))
    )
    contacts_map = {c.id: c.name for c in contacts_result.scalars().all()}

    return {
        "campaign": {
            "id": campaign.id,
            "name": campaign.name,
            "status": campaign.status,
            "dynamic_variables": campaign.dynamic_variables or {},
            "total_items": campaign.total_items,
            "completed_items": campaign.completed_items,
            "failed_items": campaign.failed_items,
            "created_at": str(campaign.created_at) if campaign.created_at else "",
            "started_at": str(campaign.started_at) if campaign.started_at else "",
            "completed_at": str(campaign.completed_at) if campaign.completed_at else "",
        },
        "items": [
            {
                "id": item.id,
                "contact_id": item.contact_id,
                "contact_name": contacts_map.get(item.contact_id, ""),
                "phone_number": item.phone_number,
                "resolved_variables": item.resolved_variables or {},
                "status": item.status,
                "attempt_count": item.attempt_count,
                "outcome": item.outcome or "",
                "duration_seconds": item.duration_seconds or 0,
                "summary": item.summary or "",
                "call_id": item.call_id,
                "started_at": str(item.started_at) if item.started_at else "",
                "completed_at": str(item.completed_at) if item.completed_at else "",
            }
            for item in items
        ],
    }


# ============================================================
# AÇÕES DA CAMPANHA (start, pause, cancel)
# ============================================================

@router.post("/{campaign_id}/action")
async def campaign_action(
    campaign_id: int,
    req: CampaignActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Inicia, pausa ou cancela uma campanha."""
    result = await db.execute(
        select(CallCampaign).where(
            CallCampaign.id == campaign_id,
            CallCampaign.tenant_id == current_user.tenant_id,
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campanha não encontrada.")

    now = datetime.now(SP_TZ).replace(tzinfo=None)

    if req.action == "start":
        if campaign.status not in ("pending", "paused"):
            raise HTTPException(status_code=400, detail=f"Não é possível iniciar campanha com status '{campaign.status}'.")
        campaign.status = "running"
        if not campaign.started_at:
            campaign.started_at = now

    elif req.action == "pause":
        if campaign.status != "running":
            raise HTTPException(status_code=400, detail="Só é possível pausar campanha em execução.")
        campaign.status = "paused"

    elif req.action == "cancel":
        if campaign.status in ("completed", "cancelled"):
            raise HTTPException(status_code=400, detail=f"Campanha já está '{campaign.status}'.")
        campaign.status = "cancelled"
        # Cancelar itens pendentes
        pending_items = await db.execute(
            select(CallCampaignItem).where(
                CallCampaignItem.campaign_id == campaign_id,
                CallCampaignItem.status == "pending",
            )
        )
        for item in pending_items.scalars().all():
            item.status = "skipped"

    else:
        raise HTTPException(status_code=400, detail=f"Ação inválida: {req.action}")

    await db.commit()

    return {"id": campaign.id, "status": campaign.status}