"""
Webhook de entrada para LP externas.
Gerencia webhooks por canal com mensagem de boas-vindas configurável.
"""
import hashlib
import os
import json as json_lib
import secrets
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import Channel, Contact, WebhookConfig
from app.auth import get_current_user, get_tenant_id

router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])
public_router = APIRouter(prefix="/api/webhook", tags=["Webhook Public"])


# ── Listar webhooks ────────────────────────────────────────
@router.get("")
async def list_webhooks(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(
        select(WebhookConfig).where(WebhookConfig.tenant_id == tenant_id)
        .order_by(WebhookConfig.created_at.desc())
    )
    webhooks = result.scalars().all()

    base_url = os.getenv("BASE_URL", "https://portal.eduflowia.com")
    output = []
    for w in webhooks:
        channel_result = await db.execute(select(Channel).where(Channel.id == w.channel_id))
        channel = channel_result.scalar_one_or_none()
        output.append({
            "id": w.id,
            "name": w.name,
            "channel_id": w.channel_id,
            "channel_name": channel.name if channel else "",
            "welcome_message": w.welcome_message,
            "is_active": w.is_active,
            "url": f"{base_url}/api/webhook/lead/{w.token}",
            "created_at": w.created_at.isoformat() if w.created_at else None,
        })
    return output


# ── Criar webhook ──────────────────────────────────────────
class WebhookCreate(BaseModel):
    name: str
    channel_id: int
    welcome_message: str


@router.post("")
async def create_webhook(
    data: WebhookCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    # Verificar canal
    channel_result = await db.execute(
        select(Channel).where(Channel.id == data.channel_id, Channel.tenant_id == tenant_id)
    )
    if not channel_result.scalar_one_or_none():
        raise HTTPException(404, "Canal não encontrado")

    token = secrets.token_hex(16)
    webhook = WebhookConfig(
        tenant_id=tenant_id,
        channel_id=data.channel_id,
        name=data.name,
        welcome_message=data.welcome_message,
        is_active=True,
        token=token,
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)

    base_url = os.getenv("BASE_URL", "https://portal.eduflowia.com")
    return {
        "id": webhook.id,
        "url": f"{base_url}/api/webhook/lead/{token}",
        "message": "Webhook criado com sucesso",
    }


# ── Atualizar webhook ──────────────────────────────────────
class WebhookUpdate(BaseModel):
    name: Optional[str] = None
    welcome_message: Optional[str] = None
    is_active: Optional[bool] = None


@router.put("/{webhook_id}")
async def update_webhook(
    webhook_id: int,
    data: WebhookUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(
        select(WebhookConfig).where(WebhookConfig.id == webhook_id, WebhookConfig.tenant_id == tenant_id)
    )
    webhook = result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(404, "Webhook não encontrado")

    if data.name is not None:
        webhook.name = data.name
    if data.welcome_message is not None:
        webhook.welcome_message = data.welcome_message
    if data.is_active is not None:
        webhook.is_active = data.is_active

    await db.commit()
    return {"message": "Webhook atualizado"}


# ── Deletar webhook ────────────────────────────────────────
@router.delete("/{webhook_id}")
async def delete_webhook(
    webhook_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(
        select(WebhookConfig).where(WebhookConfig.id == webhook_id, WebhookConfig.tenant_id == tenant_id)
    )
    webhook = result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(404, "Webhook não encontrado")

    await db.delete(webhook)
    await db.commit()
    return {"message": "Webhook removido"}


# ── Receber lead da LP externa (público) ──────────────────
class ExternalLeadData(BaseModel):
    name: str
    phone: str
    course: Optional[str] = None
    email: Optional[str] = None


@public_router.post("/lead/{token}")
async def receive_external_lead(
    token: str,
    data: ExternalLeadData,
    db: AsyncSession = Depends(get_db),
):
    # Buscar webhook config pelo token
    webhook_result = await db.execute(
        select(WebhookConfig).where(WebhookConfig.token == token, WebhookConfig.is_active == True)
    )
    webhook = webhook_result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(404, "Webhook não encontrado ou inativo")

    # Buscar canal
    channel_result = await db.execute(
        select(Channel).where(Channel.id == webhook.channel_id, Channel.is_active == True)
    )
    channel = channel_result.scalar_one_or_none()
    if not channel:
        raise HTTPException(404, "Canal não encontrado")

    # Limpar telefone
    phone = data.phone.replace("+", "").replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
    if not phone.startswith("55"):
        phone = "55" + phone

    # Criar ou atualizar contato
    existing = await db.execute(select(Contact).where(Contact.wa_id == phone))
    contact = existing.scalar_one_or_none()

    notes = json_lib.dumps({
        "course": data.course or "",
        "email": data.email or "",
        "source": "lp_externa",
    }, ensure_ascii=False)

    if not contact:
        # Resolve pipeline for new contact
        _pipeline_id = None
        try:
            from app.models import Pipeline
            _ch_result = await db.execute(
                select(Channel.default_pipeline_id).where(Channel.id == webhook.channel_id)
            )
            _ch_pipeline = _ch_result.scalar_one_or_none()
            if _ch_pipeline:
                _pipeline_id = _ch_pipeline
            else:
                _p_result = await db.execute(
                    select(Pipeline.id).where(Pipeline.tenant_id == webhook.tenant_id, Pipeline.is_default == True)
                )
                _pipeline_id = _p_result.scalar_one_or_none()
        except:
            pass

        contact = Contact(
            tenant_id=webhook.tenant_id,
            wa_id=phone,
            name=data.name,
            lead_status="novo",
            channel_id=webhook.channel_id,
            pipeline_id=_pipeline_id,
            ai_active=True,
            notes=notes,
        )
        db.add(contact)
    else:
        contact.ai_active = True
        contact.name = data.name
        contact.notes = notes

    await db.commit()

    # Disparar mensagem de boas-vindas
    try:
        from app.evolution.client import send_text
        message = webhook.welcome_message.replace("{nome}", data.name)
        await send_text(channel.instance_name, phone, message)
    except Exception as e:
        print(f"❌ Erro ao enviar mensagem de boas-vindas: {e}")

    return JSONResponse({"status": "ok", "message": "Lead recebido com sucesso"})