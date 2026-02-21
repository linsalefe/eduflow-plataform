"""
Rotas do módulo Evolution API.
Gerencia instâncias WhatsApp e recebe webhooks.
"""
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
import json
from app.models import Channel, Contact, Message, Schedule
from app.models import Channel, Contact, Message
from app.evolution import client

router = APIRouter(prefix="/api/evolution", tags=["Evolution API"])


class CreateInstanceRequest(BaseModel):
    name: str
    purpose: str = "commercial"  # commercial, ai


# ============================================================
# INSTÂNCIAS
# ============================================================

@router.post("/instances")
async def create_instance(req: CreateInstanceRequest, db: AsyncSession = Depends(get_db)):
    """Cria uma instância Evolution e salva como canal."""
    # Gera nome único
    instance_name = req.name.lower().replace(" ", "_").replace("-", "_")

    try:
        result = await client.create_instance(instance_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao criar instância: {str(e)}")

    # Salvar como canal no banco
    channel = Channel(
        name=req.name,
        type="whatsapp",
        provider="evolution",
        instance_name=instance_name,
        is_active=True,
        is_connected=False,
    )
    db.add(channel)
    await db.commit()
    await db.refresh(channel)

    # Buscar QR code
    qr = await client.get_qrcode(instance_name)

    return {
        "channel_id": channel.id,
        "instance_name": instance_name,
        "purpose": req.purpose,
        "qrcode": qr,
    }


@router.get("/instances/{instance_name}/qrcode")
async def get_qrcode(instance_name: str):
    """Retorna o QR code para conectar o WhatsApp."""
    try:
        qr = await client.get_qrcode(instance_name)
        return qr
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/instances/{instance_name}/status")
async def get_status(instance_name: str, db: AsyncSession = Depends(get_db)):
    """Verifica status de conexão da instância."""
    try:
        status = await client.get_instance_status(instance_name)

        # Atualizar is_connected no banco
        state = status.get("instance", {}).get("state", "close")
        is_connected = state == "open"

        result = await db.execute(
            select(Channel).where(Channel.instance_name == instance_name)
        )
        channel = result.scalar_one_or_none()
        if channel:
            channel.is_connected = is_connected
            await db.commit()

        return {"instance_name": instance_name, "state": state, "is_connected": is_connected}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/instances/{instance_name}")
async def delete_instance(instance_name: str, db: AsyncSession = Depends(get_db)):
    """Deleta a instância e remove o canal."""
    try:
        await client.delete_instance(instance_name)
    except Exception:
        pass  # Instância pode já não existir

    # Remover canal do banco
    result = await db.execute(
        select(Channel).where(Channel.instance_name == instance_name)
    )
    channel = result.scalar_one_or_none()
    if channel:
        await db.delete(channel)
        await db.commit()

    return {"status": "deleted", "instance_name": instance_name}


@router.post("/instances/{instance_name}/logout")
async def logout_instance(instance_name: str, db: AsyncSession = Depends(get_db)):
    """Desconecta o WhatsApp sem deletar a instância."""
    try:
        await client.logout_instance(instance_name)

        result = await db.execute(
            select(Channel).where(Channel.instance_name == instance_name)
        )
        channel = result.scalar_one_or_none()
        if channel:
            channel.is_connected = False
            await db.commit()

        return {"status": "logged_out", "instance_name": instance_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# WEBHOOK
# ============================================================

@router.post("/webhook/{instance_name}")
async def webhook(instance_name: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Recebe eventos do Evolution API (mensagens, conexão, QR code)."""
    try:
        payload = await request.json()
        event = payload.get("event", "").upper().replace(".", "_")

        print(f"📩 Evolution webhook [{instance_name}]: {event}")
        print(f"📦 Payload: {payload}")

        # Atualizar status de conexão
        if event == "CONNECTION_UPDATE":
            state = payload.get("data", {}).get("state", "")
            is_connected = state == "open"

            result = await db.execute(
                select(Channel).where(Channel.instance_name == instance_name)
            )
            channel = result.scalar_one_or_none()
            if channel:
                channel.is_connected = is_connected
                if is_connected:
                    # Pegar número do WhatsApp conectado
                    owner = payload.get("data", {}).get("instance", "")
                    if owner:
                        channel.phone_number = owner
                await db.commit()

            print(f"🔗 Conexão [{instance_name}]: {state}")

        # Mensagem recebida
       # Mensagem recebida
        elif event == "MESSAGES_UPSERT":
            data = payload.get("data", {})

            # Evolution v2 manda um objeto, não uma lista
            if isinstance(data, list):
                messages = data
            else:
                messages = [data]

            # Buscar canal
            result = await db.execute(
                select(Channel).where(Channel.instance_name == instance_name)
            )
            channel = result.scalar_one_or_none()
            channel_id = channel.id if channel else None

            for msg in messages:
                key = msg.get("key", {})
                from_me = key.get("fromMe", False)
                remote_jid = key.get("remoteJid", "")
                msg_id = key.get("id", "")

                # Ignorar grupos
                if "@g.us" in remote_jid:
                    continue

                # Extrair número limpo
                phone = remote_jid.replace("@s.whatsapp.net", "")
                sender_name = msg.get("pushName", phone)

                # Extrair texto
                message_content = msg.get("message", {})
                msg_type = msg.get("messageType", "text")
                text = (
                    message_content.get("conversation", "")
                    or message_content.get("extendedTextMessage", {}).get("text", "")
                )

                if not text and msg_type not in ("image", "audio", "video", "document", "sticker"):
                    continue

                # Direção
                direction = "outbound" if from_me else "inbound"
                contact_phone = phone

                # Criar ou atualizar contato (só pra mensagens recebidas)
                if not from_me:
                    contact_result = await db.execute(
                        select(Contact).where(Contact.wa_id == contact_phone)
                    )
                    contact = contact_result.scalar_one_or_none()

                    if not contact:
                        contact = Contact(
                            wa_id=contact_phone,
                            name=sender_name,
                            channel_id=channel_id,
                            lead_status="novo",
                        )
                        db.add(contact)
                        await db.flush()
                        print(f"👤 Novo contato: {sender_name} ({contact_phone})")
                    else:
                        if sender_name and sender_name != contact_phone:
                            contact.name = sender_name
                        if not contact.channel_id and channel_id:
                            contact.channel_id = channel_id

                # Verificar duplicata
                existing = await db.execute(
                    select(Message).where(Message.wa_message_id == msg_id)
                )
                if existing.scalar_one_or_none():
                    continue

                # Conteúdo baseado no tipo
                if msg_type in ("image", "audio", "video", "document", "sticker"):
                    media = message_content.get(msg_type, {})
                    media_id = media.get("id", "")
                    mime = media.get("mimetype", "")
                    caption = media.get("caption", "")
                    text = f"media:{media_id}|{mime}|{caption}"

                # Timestamp
                ts = msg.get("messageTimestamp", 0)
                from datetime import datetime, timezone, timedelta
                SP_TZ = timezone(timedelta(hours=-3))
                msg_time = datetime.fromtimestamp(int(ts), tz=SP_TZ).replace(tzinfo=None) if ts else datetime.now(SP_TZ).replace(tzinfo=None)

                # Salvar mensagem
                new_msg = Message(
                    wa_message_id=msg_id,
                    contact_wa_id=contact_phone,
                    channel_id=channel_id,
                    direction=direction,
                    message_type=msg_type if msg_type != "conversation" else "text",
                    content=text,
                    timestamp=msg_time,
                    status="received" if not from_me else "sent",
                )
                db.add(new_msg)

                # Atualizar updated_at do contato
                if not from_me:
                    contact_update = await db.execute(
                        select(Contact).where(Contact.wa_id == contact_phone)
                    )
                    ct = contact_update.scalar_one_or_none()
                    if ct:
                        ct.updated_at = msg_time

                print(f"💬 {'📤' if from_me else '📥'} [{instance_name}] {sender_name} ({contact_phone}): {text[:100]}")

            await db.commit()
            # === AGENTE IA: Responder se ai_active ===
            for msg in messages:
                key = msg.get("key", {})
                if key.get("fromMe", False):
                    continue
                remote_jid = key.get("remoteJid", "")
                if "@g.us" in remote_jid:
                    continue

                phone = remote_jid.replace("@s.whatsapp.net", "")
                sender_name = msg.get("pushName", phone)

                message_content = msg.get("message", {})
                text = (
                    message_content.get("conversation", "")
                    or message_content.get("extendedTextMessage", {}).get("text", "")
                )
                if not text:
                    continue

                # Verificar se IA está ativa para este contato
                contact_check = await db.execute(
                    select(Contact).where(Contact.wa_id == phone)
                )
                ct = contact_check.scalar_one_or_none()
                if not ct or not ct.ai_active:
                    continue

                # Processar com agente IA
                from app.evolution.ai_agent import process_message
                result = await process_message(
                    wa_id=phone,
                    user_message=text,
                    contact_name=sender_name,
                    instance_name=instance_name,
                    channel_id=channel_id,
                    db=db,
                )

                action = result.get("action", "continue")
                print(f"🤖 IA respondeu para {phone}: {result.get('message', '')[:80]} [action={action}]")

                # Disparar ligação se lead aceitou
                if action == "trigger_call":
                    try:
                        from app.voice_ai_elevenlabs.voice_pipeline import make_outbound_call
                        notes = json.loads(ct.notes or "{}")
                        course = notes.get("course", "Pós-graduação")
                        await make_outbound_call(phone, sender_name, course)
                        print(f"📞 Ligação disparada para {phone}")
                    except Exception as e:
                        print(f"❌ Erro ao disparar ligação: {e}")
                # Agendar ligação se lead não pode agora
                elif action == "schedule_call":
                    try:
                        from app.models import Schedule
                        notes_data = json.loads(ct.notes or "{}")
                        course = notes_data.get("course", "Pós-graduação")
                        collected = result.get("collected", {})

                        dia = collected.get("dia_agendamento", "")
                        horario = collected.get("horario_agendamento", "")

                        if dia and horario:
                            # Converter dia/horário para datetime
                            from app.evolution.scheduler import parse_schedule_datetime
                            scheduled_dt = parse_schedule_datetime(dia, horario)

                            if scheduled_dt:
                                schedule = Schedule(
                                    type="voice_ai",
                                    contact_wa_id=phone,
                                    contact_name=sender_name,
                                    phone=phone,
                                    course=course,
                                    scheduled_date=scheduled_dt.strftime("%Y-%m-%d"),
                                    scheduled_time=scheduled_dt.strftime("%H:%M"),
                                    scheduled_at=scheduled_dt,
                                    status="pending",
                                    channel_id=channel_id,
                                )
                                db.add(schedule)
                                await db.commit()
                                print(f"📅 Agendamento criado: {sender_name} → {scheduled_dt}")
                            else:
                                print(f"⚠️ Não conseguiu parsear data: dia={dia}, horario={horario}")
                        else:
                            print(f"⚠️ Agendamento sem dia/horário: {collected}")
                    except Exception as e:
                        print(f"❌ Erro ao agendar: {e}")

        return {"status": "ok"}

    except Exception as e:
        print(f"❌ Erro webhook Evolution [{instance_name}]: {e}")
        return {"status": "error", "detail": str(e)}


# ============================================================
# ENVIAR MENSAGEM
# ============================================================

@router.post("/send")
async def send_message(
    instance_name: str,
    to: str,
    text: str,
):
    """Envia mensagem de texto pelo WhatsApp via Evolution."""
    try:
        result = await client.send_text(instance_name, to, text)
        return {"status": "sent", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))