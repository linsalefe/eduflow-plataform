"""
Webhook de entrada para LP externas.
O cliente cola a URL no formulário da LP dele e os leads
caem automaticamente no EduFlow com a IA ativa.
"""
import hashlib
import os
import json as json_lib
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import Channel, Contact
from app.auth import get_current_user, get_tenant_id

router = APIRouter(prefix="/api/webhook", tags=["Webhook"])
public_router = APIRouter(prefix="/api/webhook", tags=["Webhook Public"])


def generate_token(channel_id: int, tenant_id: int) -> str:
    """Gera token único e determinístico para o canal."""
    secret = os.getenv("SECRET_KEY", "eduflow-secret")
    raw = f"{channel_id}-{tenant_id}-{secret}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ── Buscar URL do webhook (autenticado) ────────────────────
@router.get("/lead-url/{channel_id}")
async def get_webhook_url(
    channel_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(
        select(Channel).where(
            Channel.id == channel_id,
            Channel.tenant_id == tenant_id,
        )
    )
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(404, "Canal não encontrado")

    token = generate_token(channel_id, tenant_id)
    base_url = os.getenv("BASE_URL", "https://portal.eduflowia.com")
    url = f"{base_url}/api/webhook/lead/{channel_id}/{token}"

    return {"url": url, "channel_name": channel.name}


# ── Receber lead da LP externa (público) ──────────────────
class ExternalLeadData(BaseModel):
    name: str
    phone: str
    course: Optional[str] = None
    email: Optional[str] = None
    source: Optional[str] = "lp_externa"


@public_router.post("/lead/{channel_id}/{token}")
async def receive_external_lead(
    channel_id: int,
    token: str,
    data: ExternalLeadData,
    db: AsyncSession = Depends(get_db),
):
    # Buscar canal
    channel_result = await db.execute(
        select(Channel).where(Channel.id == channel_id, Channel.is_active == True)
    )
    channel = channel_result.scalar_one_or_none()
    if not channel:
        raise HTTPException(404, "Canal não encontrado")

    # Validar token
    expected = generate_token(channel_id, channel.tenant_id)
    if token != expected:
        raise HTTPException(403, "Token inválido")

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
        "source": data.source,
    }, ensure_ascii=False)

    if not contact:
        contact = Contact(
            tenant_id=channel.tenant_id,
            wa_id=phone,
            name=data.name,
            lead_status="novo",
            channel_id=channel_id,
            ai_active=True,
            notes=notes,
        )
        db.add(contact)
    else:
        contact.ai_active = True
        contact.name = data.name
        contact.notes = notes

    await db.commit()

    return JSONResponse({"status": "ok", "message": "Lead recebido com sucesso"})