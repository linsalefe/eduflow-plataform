from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import Optional
import base64
import uuid

SP_TZ = timezone(timedelta(hours=-3))

from app.database import get_db
from app.models import Channel, Contact, Message, Tag, contact_tags, Activity
from app.whatsapp import send_text_message, send_template_message

router = APIRouter(prefix="/api", tags=["api"])


# === Schemas ===

class SendTextRequest(BaseModel):
    to: str
    text: str
    channel_id: int = 1


class SendTemplateRequest(BaseModel):
    to: str
    template_name: str
    language: str = "pt_BR"
    channel_id: int = 1
    parameters: list = []
    contact_name: str = ""


class UpdateContactRequest(BaseModel):
    name: Optional[str] = None
    lead_status: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[int] = None


class TagRequest(BaseModel):
    name: str
    color: str = "blue"


class ChannelRequest(BaseModel):
    name: str
    type: str = "whatsapp"  # whatsapp, instagram, messenger
    provider: str = "official"  # official, evolution
    phone_number: Optional[str] = None
    phone_number_id: Optional[str] = None
    whatsapp_token: Optional[str] = None
    waba_id: Optional[str] = None
    instance_name: Optional[str] = None
    instance_token: Optional[str] = None
    page_id: Optional[str] = None
    instagram_id: Optional[str] = None
    access_token: Optional[str] = None

# === Channels ===
# === Channels ===

@router.get("/channels")
async def list_channels(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Channel).where(Channel.is_active == True).order_by(Channel.id))
    channels = result.scalars().all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "phone_number": c.phone_number,
            "phone_number_id": c.phone_number_id,
            "waba_id": c.waba_id,
            "is_active": c.is_active,
            "type": c.type or "whatsapp",
            "provider": c.provider or "official",
            "is_connected": c.is_connected or False,
            "instance_name": c.instance_name,
            "page_id": c.page_id,
            "instagram_id": c.instagram_id,
        }
        for c in channels
    ]


@router.post("/channels")
async def create_channel(req: ChannelRequest, db: AsyncSession = Depends(get_db)):
    channel = Channel(
        type=req.type,
        provider=req.provider,
        instance_name=req.instance_name,
        instance_token=req.instance_token,
        page_id=req.page_id,
        instagram_id=req.instagram_id,
        access_token=req.access_token,
        name=req.name,
        phone_number=req.phone_number,
        phone_number_id=req.phone_number_id,
        whatsapp_token=req.whatsapp_token,
        waba_id=req.waba_id,
    )
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    return {"id": channel.id, "name": channel.name}


# === Dashboard ===

@router.get("/dashboard/stats")
async def dashboard_stats(channel_id: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())

    # Filtro base por canal
    contact_filter = [] if not channel_id else [Contact.channel_id == channel_id]
    message_filter = [] if not channel_id else [Message.channel_id == channel_id]

    total_contacts = await db.execute(
        select(func.count(Contact.id)).where(*contact_filter)
    )
    total_contacts = total_contacts.scalar()

    new_today = await db.execute(
        select(func.count(Contact.id)).where(Contact.created_at >= today_start, *contact_filter)
    )
    new_today = new_today.scalar()

    messages_today = await db.execute(
        select(func.count(Message.id)).where(Message.timestamp >= today_start, *message_filter)
    )
    messages_today = messages_today.scalar()

    inbound_today = await db.execute(
        select(func.count(Message.id)).where(
            Message.timestamp >= today_start, Message.direction == "inbound", *message_filter
        )
    )
    inbound_today = inbound_today.scalar()

    outbound_today = await db.execute(
        select(func.count(Message.id)).where(
            Message.timestamp >= today_start, Message.direction == "outbound", *message_filter
        )
    )
    outbound_today = outbound_today.scalar()

    messages_week = await db.execute(
        select(func.count(Message.id)).where(Message.timestamp >= week_start, *message_filter)
    )
    messages_week = messages_week.scalar()

    status_result = await db.execute(
        select(Contact.lead_status, func.count(Contact.id)).where(*contact_filter).group_by(Contact.lead_status)
    )
    status_counts = {row[0] or "novo": row[1] for row in status_result.all()}

    daily_messages = []
    for i in range(6, -1, -1):
        day = today_start - timedelta(days=i)
        next_day = day + timedelta(days=1)
        count = await db.execute(
            select(func.count(Message.id)).where(
                Message.timestamp >= day, Message.timestamp < next_day, *message_filter
            )
        )
        daily_messages.append({
            "date": day.strftime("%d/%m"),
            "day": day.strftime("%a"),
            "count": count.scalar()
        })

    return {
        "total_contacts": total_contacts,
        "new_today": new_today,
        "messages_today": messages_today,
        "inbound_today": inbound_today,
        "outbound_today": outbound_today,
        "messages_week": messages_week,
        "status_counts": status_counts,
        "daily_messages": daily_messages,
    }


# === Envio de Mensagens ===

async def get_channel(channel_id: int, db: AsyncSession) -> Channel:
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Canal não encontrado")
    return channel


@router.post("/send/text")
async def send_text(req: SendTextRequest, db: AsyncSession = Depends(get_db)):
    channel = await get_channel(req.channel_id, db)

    # Evolution API
    if channel.provider == "evolution" and channel.instance_name:
        from app.evolution.client import send_text as evo_send
        result = await evo_send(channel.instance_name, req.to, req.text)

        # Salvar mensagem no banco
        import uuid
        wa_id = req.to.replace("+", "").replace("-", "").replace(" ", "")
        msg_id = result.get("key", {}).get("id", str(uuid.uuid4()))

        contact_result = await db.execute(select(Contact).where(Contact.wa_id == wa_id))
        contact = contact_result.scalar_one_or_none()
        if not contact:
            contact = Contact(wa_id=wa_id, name="", channel_id=req.channel_id)
            db.add(contact)
            await db.flush()

        message = Message(
            wa_message_id=msg_id,
            contact_wa_id=wa_id,
            channel_id=req.channel_id,
            direction="outbound",
            message_type="text",
            content=req.text,
            timestamp=datetime.now(SP_TZ).replace(tzinfo=None),
            status="sent",
        )
        db.add(message)
        await db.commit()
        return result

    # API Oficial (Meta)
    result = await send_text_message(req.to, req.text, channel.phone_number_id, channel.whatsapp_token)
    if "messages" in result:
        wa_id = result.get("contacts", [{}])[0].get("wa_id", req.to)
        contact_result = await db.execute(select(Contact).where(Contact.wa_id == wa_id))
        contact = contact_result.scalar_one_or_none()
        if not contact:
            contact = Contact(wa_id=wa_id, name="", channel_id=req.channel_id)
            db.add(contact)
            await db.flush()
        message = Message(
            wa_message_id=result["messages"][0]["id"],
            contact_wa_id=wa_id,
            channel_id=req.channel_id,
            direction="outbound",
            message_type="text",
            content=req.text,
            timestamp=datetime.now(SP_TZ).replace(tzinfo=None),
            status="sent",
        )
        db.add(message)
        await db.commit()
    return result

@router.post("/send/template")
async def send_template(req: SendTemplateRequest, db: AsyncSession = Depends(get_db)):
    channel = await get_channel(req.channel_id, db)
    result = await send_template_message(req.to, req.template_name, req.language, channel.phone_number_id, channel.whatsapp_token, req.parameters if req.parameters else None)

    if "messages" in result:
        wa_id = result.get("contacts", [{}])[0].get("wa_id", req.to)

        contact_result = await db.execute(select(Contact).where(Contact.wa_id == wa_id))
        contact = contact_result.scalar_one_or_none()
        if not contact:
            db.add(Contact(wa_id=wa_id, name=req.contact_name or "", channel_id=req.channel_id))
            await db.flush()
        elif req.contact_name and not contact.name:
            contact.name = req.contact_name

        # Montar conteúdo legível
        content_text = f"template:{req.template_name}"
        if req.parameters:
            content_text = f"[Template] " + ", ".join(req.parameters)

        message = Message(
            wa_message_id=result["messages"][0]["id"],
            contact_wa_id=wa_id,
            channel_id=req.channel_id,
            direction="outbound",
            message_type="template",
            content=content_text,
            timestamp=datetime.now(SP_TZ).replace(tzinfo=None),
            status="sent",
        )
        db.add(message)
        await db.commit()

    return result


@router.post("/send/media")
async def send_media(
    file: UploadFile = File(...),
    to: str = Form(...),
    channel_id: int = Form(1),
    type: str = Form("image"),  # image, audio, document
    db: AsyncSession = Depends(get_db),
):
    """Envia mídia (imagem, áudio, documento) via Evolution API."""
    channel = await get_channel(channel_id, db)

    if not channel.provider == "evolution" or not channel.instance_name:
        raise HTTPException(status_code=400, detail="Envio de mídia só suportado via Evolution API por enquanto")

    file_bytes = await file.read()
    b64 = base64.b64encode(file_bytes).decode("utf-8")
    b64_data = f"data:{file.content_type};base64,{b64}"
    wa_id = to.replace("+", "").replace("-", "").replace(" ", "")
    filename = file.filename or "arquivo"

    from app.evolution.client import send_media as evo_send_media, send_audio as evo_send_audio

    if type == "audio":
        result = await evo_send_audio(channel.instance_name, wa_id, b64_data)
        message_type = "audio"
        content = f"🎤 Áudio"
    elif type == "image":
        media_type = "image"
        if file.content_type and file.content_type.startswith("video"):
            media_type = "video"
        result = await evo_send_media(channel.instance_name, wa_id, media_type, b64_data, filename, file.content_type or "image/jpeg")
        message_type = media_type
        content = f"📷 {media_type.capitalize()}"
    else:
        result = await evo_send_media(channel.instance_name, wa_id, "document", b64_data, filename, file.content_type or "application/octet-stream")
        message_type = "document"
        content = f"📄 {filename}"

    # Salvar mensagem no banco
    msg_id = str(uuid.uuid4())
    if isinstance(result, dict):
        msg_id = result.get("key", {}).get("id", msg_id)

    contact_result = await db.execute(select(Contact).where(Contact.wa_id == wa_id))
    contact = contact_result.scalar_one_or_none()
    if not contact:
        contact = Contact(wa_id=wa_id, name="", channel_id=channel_id)
        db.add(contact)
        await db.flush()

    message = Message(
        wa_message_id=msg_id,
        contact_wa_id=wa_id,
        channel_id=channel_id,
        direction="outbound",
        message_type=message_type,
        content=content,
        timestamp=datetime.now(SP_TZ).replace(tzinfo=None),
        status="sent",
    )
    db.add(message)
    await db.commit()
    return {"status": "ok", "message_id": msg_id}


# === Contatos ===

@router.get("/contacts")
async def list_contacts(channel_id: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm import aliased
    from sqlalchemy import case

    latest_msg = (
        select(
            Message.contact_wa_id,
            func.max(Message.timestamp).label("last_ts")
        )
        .group_by(Message.contact_wa_id)
        .subquery()
    )

    query = (
        select(Contact)
        .outerjoin(latest_msg, Contact.wa_id == latest_msg.c.contact_wa_id)
        .order_by(latest_msg.c.last_ts.desc().nullslast())
    )
    if channel_id:
        query = query.where(Contact.channel_id == channel_id)
    result = await db.execute(query)
    contacts = result.scalars().all()

    contacts_list = []
    for c in contacts:
        msg_result = await db.execute(
            select(Message).where(Message.contact_wa_id == c.wa_id).order_by(Message.timestamp.desc()).limit(1)
        )
        last_msg = msg_result.scalar_one_or_none()

        tag_result = await db.execute(
            select(Tag).join(contact_tags).where(contact_tags.c.contact_wa_id == c.wa_id)
        )
        tags = tag_result.scalars().all()

        unread_result = await db.execute(
            select(func.count(Message.id)).where(
                Message.contact_wa_id == c.wa_id, Message.direction == "inbound", Message.status == "received"
            )
        )
        unread = unread_result.scalar()

        contacts_list.append({
            "wa_id": c.wa_id,
            "name": c.name or c.wa_id,
            "lead_status": c.lead_status or "novo",
            "notes": c.notes,
            "channel_id": c.channel_id,
            "last_message": last_msg.content if last_msg else "",
            "last_message_time": last_msg.timestamp.isoformat() if last_msg else None,
            "direction": last_msg.direction if last_msg else None,
            "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in tags],
            "unread": unread,
            "ai_active": c.ai_active or False,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "assigned_to": c.assigned_to,
        })

    return contacts_list

@router.post("/contacts/{wa_id}/read")
async def mark_as_read(wa_id: str, db: AsyncSession = Depends(get_db)):
    """Marca todas as mensagens inbound como lidas."""
    from sqlalchemy import update
    await db.execute(
        update(Message).where(
            Message.contact_wa_id == wa_id,
            Message.direction == "inbound",
            Message.status == "received",
        ).values(status="read")
    )
    await db.commit()
    return {"status": "ok"}

@router.get("/contacts/{wa_id}")
async def get_contact(wa_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Contact).where(Contact.wa_id == wa_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contato não encontrado")

    tag_result = await db.execute(
        select(Tag).join(contact_tags).where(contact_tags.c.contact_wa_id == wa_id)
    )
    tags = tag_result.scalars().all()

    msg_count = await db.execute(select(func.count(Message.id)).where(Message.contact_wa_id == wa_id))

    return {
        "wa_id": contact.wa_id,
        "name": contact.name,
        "lead_status": contact.lead_status,
        "notes": contact.notes,
        "channel_id": contact.channel_id,
        "ai_active": contact.ai_active or False,
        "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in tags],
        "total_messages": msg_count.scalar(),
        "created_at": contact.created_at.isoformat() if contact.created_at else None,
    }


@router.patch("/contacts/{wa_id}")
async def update_contact(wa_id: str, req: UpdateContactRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Contact).where(Contact.wa_id == wa_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contato não encontrado")

    if req.name is not None:
        contact.name = req.name
    if req.lead_status is not None:
        old_status = contact.lead_status
        contact.lead_status = req.lead_status
        await log_activity(db, wa_id, "status_change", f"Status: {old_status or 'novo'} → {req.lead_status}")
    if req.notes is not None:
        contact.notes = req.notes
        await log_activity(db, wa_id, "note", "Notas atualizadas")

    await db.commit()
    return {"status": "updated"}


@router.post("/contacts/{wa_id}/tags/{tag_id}")
async def add_tag_to_contact(wa_id: str, tag_id: int, db: AsyncSession = Depends(get_db)):
    tag_result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = tag_result.scalar_one_or_none()
    await db.execute(contact_tags.insert().values(contact_wa_id=wa_id, tag_id=tag_id))
    await log_activity(db, wa_id, "tag_added", f"Tag adicionada: {tag.name if tag else tag_id}")
    await db.commit()
    return {"status": "tag added"}


@router.delete("/contacts/{wa_id}/tags/{tag_id}")
async def remove_tag_from_contact(wa_id: str, tag_id: int, db: AsyncSession = Depends(get_db)):
    tag_result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = tag_result.scalar_one_or_none()
    await db.execute(
        contact_tags.delete().where(contact_tags.c.contact_wa_id == wa_id, contact_tags.c.tag_id == tag_id)
    )
    await log_activity(db, wa_id, "tag_added", f"Tag adicionada: {tag.name if tag else tag_id}")
    await db.commit()
    return {"status": "tag removed"}


# === Mensagens ===

@router.get("/contacts/{wa_id}/messages")
async def get_messages(wa_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Message).where(Message.contact_wa_id == wa_id).order_by(Message.timestamp.asc())
    )
    messages = result.scalars().all()

    return [
        {
            "id": m.id,
            "wa_message_id": m.wa_message_id,
            "direction": m.direction,
            "type": m.message_type,
            "content": m.content,
            "timestamp": m.timestamp.isoformat(),
            "status": m.status,
            "sent_by_ai": m.sent_by_ai or False,
            "channel_id": m.channel_id,
        }
        for m in messages
    ]


@router.get("/contacts/{wa_id}/picture")
async def get_contact_picture(wa_id: str, channel_id: int = 1, db: AsyncSession = Depends(get_db)):
    """Busca a URL da foto de perfil do contato via Evolution API."""
    channel = await get_channel(channel_id, db)

    if not channel.provider == "evolution" or not channel.instance_name:
        return {"profilePictureUrl": None}

    from app.evolution.client import get_profile_picture
    url = await get_profile_picture(channel.instance_name, wa_id)
    return {"profilePictureUrl": url}


# === Tags ===

@router.get("/tags")
async def list_tags(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).order_by(Tag.name))
    tags = result.scalars().all()
    return [{"id": t.id, "name": t.name, "color": t.color} for t in tags]


@router.post("/tags")
async def create_tag(req: TagRequest, db: AsyncSession = Depends(get_db)):
    tag = Tag(name=req.name, color=req.color)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return {"id": tag.id, "name": tag.name, "color": tag.color}


@router.delete("/tags/{tag_id}")
async def delete_tag(tag_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag não encontrada")
    await db.delete(tag)
    await db.commit()
    return {"status": "deleted"}


@router.get("/channels/{channel_id}/templates")
async def list_templates(channel_id: int, db: AsyncSession = Depends(get_db)):
    import httpx
    channel = await get_channel(channel_id, db)
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://graph.facebook.com/v22.0/{channel.waba_id}/message_templates",
            headers={"Authorization": f"Bearer {channel.whatsapp_token}"},
            params={"status": "APPROVED", "limit": 50},
        )
        data = response.json()

    templates = []
    for t in data.get("data", []):
        params = []
        for comp in t.get("components", []):
            if comp["type"] == "BODY":
                text = comp.get("text", "")
                import re
                matches = re.findall(r'\{\{(\d+)\}\}', text)
                params = [f"Variável {m}" for m in matches]
                body_text = text
        templates.append({
            "name": t["name"],
            "language": t["language"],
            "status": t["status"],
            "body": body_text if 'body_text' in dir() else "",
            "parameters": params,
        })
        if 'body_text' in dir():
            del body_text

    return templates


@router.get("/media/{media_id}")
async def get_media(media_id: str, channel_id: int = 1, db: AsyncSession = Depends(get_db)):
    import httpx
    channel = await get_channel(channel_id, db)

    # Passo 1: pegar URL da mídia
    async with httpx.AsyncClient() as client:
        url_response = await client.get(
            f"https://graph.facebook.com/v22.0/{media_id}",
            headers={"Authorization": f"Bearer {channel.whatsapp_token}"},
        )
        url_data = url_response.json()
        media_url = url_data.get("url")

        if not media_url:
            raise HTTPException(status_code=404, detail="Mídia não encontrada")

        # Passo 2: baixar mídia
        media_response = await client.get(
            media_url,
            headers={"Authorization": f"Bearer {channel.whatsapp_token}"},
        )

    from fastapi.responses import Response
    return Response(
        content=media_response.content,
        media_type=url_data.get("mime_type", "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=86400"},
    )

# === Busca Global ===

@router.get("/search")
async def global_search(q: str = "", db: AsyncSession = Depends(get_db)):
    """Busca contatos por nome ou telefone (wa_id)"""
    if not q or len(q.strip()) < 2:
        return {"contacts": [], "pages": []}

    term = f"%{q.strip()}%"

    result = await db.execute(
        select(Contact)
        .where(
            (Contact.name.ilike(term)) | (Contact.wa_id.ilike(term))
        )
        .order_by(Contact.name.asc())
        .limit(10)
    )
    contacts = result.scalars().all()

    contacts_list = []
    for c in contacts:
        tag_result = await db.execute(
            select(Tag).join(contact_tags).where(contact_tags.c.contact_wa_id == c.wa_id)
        )
        tags = tag_result.scalars().all()

        contacts_list.append({
            "wa_id": c.wa_id,
            "name": c.name or c.wa_id,
            "lead_status": c.lead_status or "novo",
            "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in tags],
        })

    # Busca de páginas estática (match no label)
    pages = [
        {"label": "Dashboard", "href": "/dashboard", "icon": "LayoutDashboard"},
        {"label": "Conversas", "href": "/conversations", "icon": "MessageCircle"},
        {"label": "Pipeline", "href": "/pipeline", "icon": "GitBranch"},
        {"label": "Campanhas", "href": "/dashboard-roi", "icon": "BarChart3"},
        {"label": "Landing Pages", "href": "/landing-pages", "icon": "FileText"},
        {"label": "Usuários", "href": "/users", "icon": "Users"},
        {"label": "Automações", "href": "/automacoes", "icon": "Zap"},
        {"label": "Voice AI", "href": "/voice-ai", "icon": "PhoneCall"},
        {"label": "Agenda", "href": "/agenda", "icon": "Calendar"},
        {"label": "Canais", "href": "/canais", "icon": "Radio"},
    ]
    q_lower = q.strip().lower()
    matched_pages = [p for p in pages if q_lower in p["label"].lower()]

    return {"contacts": contacts_list, "pages": matched_pages}

# Cole este código no FINAL do arquivo backend/app/routes.py
# (logo após o endpoint /search que você adicionou na Sprint 4)


# === Bulk Actions ===

class BulkUpdateRequest(BaseModel):
    wa_ids: list[str]
    lead_status: Optional[str] = None

class BulkTagRequest(BaseModel):
    wa_ids: list[str]
    tag_id: int

@router.post("/contacts/bulk-update")
async def bulk_update_contacts(req: BulkUpdateRequest, db: AsyncSession = Depends(get_db)):
    """Atualiza status de múltiplos contatos"""
    if not req.wa_ids or not req.lead_status:
        raise HTTPException(status_code=400, detail="wa_ids e lead_status são obrigatórios")

    result = await db.execute(
        select(Contact).where(Contact.wa_id.in_(req.wa_ids))
    )
    contacts = result.scalars().all()

    for c in contacts:
        c.lead_status = req.lead_status

    await db.commit()
    return {"updated": len(contacts)}


@router.post("/contacts/bulk-tag")
async def bulk_add_tag(req: BulkTagRequest, db: AsyncSession = Depends(get_db)):
    """Adiciona tag a múltiplos contatos"""
    if not req.wa_ids:
        raise HTTPException(status_code=400, detail="wa_ids é obrigatório")

    added = 0
    for wa_id in req.wa_ids:
        try:
            await db.execute(contact_tags.insert().values(contact_wa_id=wa_id, tag_id=req.tag_id))
            added += 1
        except Exception:
            pass  # já tem a tag

    await db.commit()
    return {"added": added}


@router.post("/contacts/bulk-remove-tag")
async def bulk_remove_tag(req: BulkTagRequest, db: AsyncSession = Depends(get_db)):
    """Remove tag de múltiplos contatos"""
    if not req.wa_ids:
        raise HTTPException(status_code=400, detail="wa_ids é obrigatório")

    await db.execute(
        contact_tags.delete().where(
            contact_tags.c.contact_wa_id.in_(req.wa_ids),
            contact_tags.c.tag_id == req.tag_id
        )
    )
    await db.commit()
    return {"removed": len(req.wa_ids)}
async def log_activity(db: AsyncSession, contact_wa_id: str, activity_type: str, description: str, metadata: str = None):
    """Helper para registrar atividade na timeline"""
    activity = Activity(
        contact_wa_id=contact_wa_id,
        type=activity_type,
        description=description,
        extra_data=metadata,
    )
    db.add(activity)


@router.get("/contacts/{wa_id}/activities")
async def get_activities(wa_id: str, limit: int = 50, db: AsyncSession = Depends(get_db)):
    """Retorna timeline de atividades de um contato"""
    result = await db.execute(
        select(Activity)
        .where(Activity.contact_wa_id == wa_id)
        .order_by(Activity.created_at.desc())
        .limit(limit)
    )
    activities = result.scalars().all()

    return [
        {
            "id": a.id,
            "type": a.type,
            "description": a.description,
            "metadata": a.extra_data,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in activities
    ]


@router.get("/users/list")
async def list_users_simple(db: AsyncSession = Depends(get_db)):
    """Lista usuários ativos para seletor de atribuição"""
    from app.models import User
    result = await db.execute(
        select(User).where(User.is_active == True).order_by(User.name)
    )
    users = result.scalars().all()
    return [
        {"id": u.id, "name": u.name, "role": u.role}
        for u in users
    ]


@router.patch("/contacts/{wa_id}/assign")
async def assign_contact(wa_id: str, req: dict, db: AsyncSession = Depends(get_db)):
    """Atribui contato a um usuário"""
    result = await db.execute(select(Contact).where(Contact.wa_id == wa_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contato não encontrado")

    user_id = req.get("assigned_to")
    contact.assigned_to = user_id

    if user_id:
        from app.models import User
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        await log_activity(db, wa_id, "assigned", f"Atribuído a {user.name if user else f'#{user_id}'}")
    else:
        await log_activity(db, wa_id, "assigned", "Atribuição removida")

    await db.commit()
    return {"status": "assigned", "assigned_to": user_id}
# === Dashboard Avançado ===

@router.get("/dashboard/advanced")
async def dashboard_advanced(channel_id: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    from app.models import User, Activity
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    seven_days_ago = today_start - timedelta(days=7)
    fourteen_days_ago = today_start - timedelta(days=14)

    contact_filter = [] if not channel_id else [Contact.channel_id == channel_id]
    message_filter = [] if not channel_id else [Message.channel_id == channel_id]

    # --- Métricas por atendente ---
    agent_stats_q = await db.execute(
        select(
            Contact.assigned_to,
            func.count(Contact.id)
        ).where(
            Contact.assigned_to.isnot(None),
            *contact_filter
        ).group_by(Contact.assigned_to)
    )
    agent_leads = {row[0]: row[1] for row in agent_stats_q.all()}

    agent_msgs_q = await db.execute(
        select(func.count(Message.id)).where(
            Message.direction == "outbound",
            Message.timestamp >= seven_days_ago,
            *message_filter
        )
    )
    total_outbound_week = agent_msgs_q.scalar() or 0

    # Buscar nomes dos usuários
    users_q = await db.execute(select(User).where(User.is_active == True))
    users_map = {u.id: u.name for u in users_q.scalars().all()}

    agents = []
    for user_id, lead_count in agent_leads.items():
        # Mensagens enviadas por contatos deste atendente nos últimos 7 dias
        assigned_contacts_q = await db.execute(
            select(Contact.wa_id).where(Contact.assigned_to == user_id, *contact_filter)
        )
        assigned_wa_ids = [r[0] for r in assigned_contacts_q.all()]

        msg_count = 0
        if assigned_wa_ids:
            mc = await db.execute(
                select(func.count(Message.id)).where(
                    Message.direction == "outbound",
                    Message.timestamp >= seven_days_ago,
                    Message.contact_wa_id.in_(assigned_wa_ids),
                    *message_filter
                )
            )
            msg_count = mc.scalar() or 0

        agents.append({
            "user_id": user_id,
            "name": users_map.get(user_id, f"#{user_id}"),
            "leads": lead_count,
            "messages_week": msg_count,
        })

    agents.sort(key=lambda x: x["leads"], reverse=True)

    # --- Não atribuídos ---
    unassigned_q = await db.execute(
        select(func.count(Contact.id)).where(
            Contact.assigned_to.is_(None),
            *contact_filter
        )
    )
    unassigned_count = unassigned_q.scalar() or 0

    # --- Taxa de conversão ---
    total_q = await db.execute(select(func.count(Contact.id)).where(*contact_filter))
    total = total_q.scalar() or 0
    converted_q = await db.execute(
        select(func.count(Contact.id)).where(Contact.lead_status == "convertido", *contact_filter)
    )
    converted = converted_q.scalar() or 0
    conversion_rate = round((converted / total * 100), 1) if total > 0 else 0

    # --- Leads por tag (top 8) ---
    from app.models import contact_tags, Tag
    tags_q = await db.execute(
        select(
            Tag.name,
            Tag.color,
            func.count(contact_tags.c.contact_wa_id)
        ).join(Tag, Tag.id == contact_tags.c.tag_id)
        .group_by(Tag.name, Tag.color)
        .order_by(func.count(contact_tags.c.contact_wa_id).desc())
        .limit(8)
    )
    tags_data = [{"name": r[0], "color": r[1], "count": r[2]} for r in tags_q.all()]

    # --- Novos leads: esta semana vs semana passada ---
    new_this_week_q = await db.execute(
        select(func.count(Contact.id)).where(
            Contact.created_at >= seven_days_ago, *contact_filter
        )
    )
    new_this_week = new_this_week_q.scalar() or 0

    new_last_week_q = await db.execute(
        select(func.count(Contact.id)).where(
            Contact.created_at >= fourteen_days_ago,
            Contact.created_at < seven_days_ago,
            *contact_filter
        )
    )
    new_last_week = new_last_week_q.scalar() or 0

    trend_pct = round(((new_this_week - new_last_week) / max(new_last_week, 1)) * 100, 1)

    # --- Tempo médio de primeira resposta (últimos 7 dias) ---
    # Calcula tempo entre primeira msg inbound e primeira msg outbound por contato
    avg_response = None
    try:
        from sqlalchemy import and_
        recent_contacts_q = await db.execute(
            select(Contact.wa_id).where(
                Contact.created_at >= seven_days_ago, *contact_filter
            ).limit(50)
        )
        recent_wa_ids = [r[0] for r in recent_contacts_q.all()]

        response_times = []
        for wa_id in recent_wa_ids:
            first_in_q = await db.execute(
                select(Message.timestamp).where(
                    Message.contact_wa_id == wa_id,
                    Message.direction == "inbound"
                ).order_by(Message.timestamp.asc()).limit(1)
            )
            first_in = first_in_q.scalar()

            if first_in:
                first_out_q = await db.execute(
                    select(Message.timestamp).where(
                        Message.contact_wa_id == wa_id,
                        Message.direction == "outbound",
                        Message.timestamp > first_in
                    ).order_by(Message.timestamp.asc()).limit(1)
                )
                first_out = first_out_q.scalar()
                if first_out:
                    diff = (first_out - first_in).total_seconds() / 60  # em minutos
                    if diff < 1440:  # ignora se > 24h (provavelmente fora de horário)
                        response_times.append(diff)

        if response_times:
            avg_response = round(sum(response_times) / len(response_times), 1)
    except Exception:
        avg_response = None

    return {
        "agents": agents,
        "unassigned_leads": unassigned_count,
        "conversion_rate": conversion_rate,
        "converted": converted,
        "total": total,
        "tags": tags_data,
        "new_this_week": new_this_week,
        "new_last_week": new_last_week,
        "trend_pct": trend_pct,
        "avg_response_minutes": avg_response,
    }







