"""
Rotas do módulo Evolution API.
Gerencia instâncias WhatsApp e recebe webhooks.
"""
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import Channel
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
        elif event == "MESSAGES_UPSERT":
            messages = payload.get("data", [])
            if isinstance(messages, dict):
                messages = [messages]

            for msg in messages:
                key = msg.get("key", {})
                from_me = key.get("fromMe", False)
                remote_jid = key.get("remoteJid", "")

                # Ignorar mensagens próprias e de grupos
                if from_me or "@g.us" in remote_jid:
                    continue

                # Extrair texto
                message_content = msg.get("message", {})
                text = (
                    message_content.get("conversation", "")
                    or message_content.get("extendedTextMessage", {}).get("text", "")
                )

                if not text:
                    continue

                # Extrair número limpo
                phone = remote_jid.replace("@s.whatsapp.net", "")
                sender_name = msg.get("pushName", phone)

                print(f"💬 Mensagem [{instance_name}] de {sender_name} ({phone}): {text[:100]}")

                # TODO: Salvar no banco (Contact + Message)
                # TODO: Fase 3 - Enviar para agente IA

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