"""
Rotas do módulo Evolution API.
Gerencia instâncias WhatsApp e recebe webhooks.
"""
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import get_current_user, get_tenant_id
from sqlalchemy import select, delete
from app.database import get_db
import json
from app.models import Channel, Contact, Message, Schedule, AIConfig, KnowledgeDocument, AIConversationSummary, CallLog, LandingPage, FormSubmission
from app.evolution import client


router = APIRouter(prefix="/api/evolution", tags=["Evolution API"])


class CreateInstanceRequest(BaseModel):
    name: str
    purpose: str = "commercial"  # commercial, ai


# ============================================================
# INSTÂNCIAS
# ============================================================

@router.post("/instances")
async def create_instance(req: CreateInstanceRequest, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user), tenant_id: int = Depends(get_tenant_id)):
    """Cria uma instância Evolution e salva como canal."""
    # Gera nome único
    instance_name = req.name.lower().replace(" ", "_").replace("-", "_")

    try:
        result = await client.create_instance(instance_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao criar instância: {str(e)}")

    # Salvar como canal no banco
    channel = Channel(
        tenant_id=tenant_id,
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
    from sqlalchemy import text

    try:
        await client.delete_instance(instance_name)
    except Exception:
        pass

    result = await db.execute(
        select(Channel).where(Channel.instance_name == instance_name)
    )
    channel = result.scalar_one_or_none()
    if channel:
        ch_id = channel.id

        # 1) Buscar wa_ids e ids dos contatos deste canal
        rows = await db.execute(
            select(Contact.wa_id, Contact.id).where(Contact.channel_id == ch_id)
        )
        contact_rows = rows.fetchall()
        wa_ids = [r[0] for r in contact_rows]
        contact_ids = [r[1] for r in contact_rows]

        # 2) Deletar lead_agent_context (referencia contacts.id)
        if contact_ids:
            await db.execute(
                text("DELETE FROM lead_agent_context WHERE lead_id = ANY(:ids)"),
                {"ids": contact_ids}
            )

        if wa_ids:
            # 3) Deletar tabelas que referenciam contacts (via contact_wa_id)
            for tbl in ['activities', 'ai_calls', 'ai_conversation_summaries',
                        'contact_tags', 'financial_entries', 'messages',
                        'schedules', 'tasks']:
                await db.execute(
                    text(f"DELETE FROM {tbl} WHERE contact_wa_id = ANY(:ids)"),
                    {"ids": wa_ids}
                )

        # 4) Deletar tabelas que referenciam channels (via channel_id)
        for tbl in ['ai_configs', 'ai_conversation_summaries', 'call_logs',
                    'form_submissions', 'knowledge_documents', 'landing_pages',
                    'messages', 'schedules', 'voice_scripts']:
            await db.execute(
                text(f"DELETE FROM {tbl} WHERE channel_id = :ch_id"),
                {"ch_id": ch_id}
            )

        # 5) Deletar contatos e canal
        await db.execute(
            text("DELETE FROM contacts WHERE channel_id = :ch_id"),
            {"ch_id": ch_id}
        )
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
            tenant_id = channel.tenant_id if channel else None

            for msg in messages:
                key = msg.get("key", {})
                from_me = key.get("fromMe", False)
                remote_jid = key.get("remoteJid", "")
                msg_id = key.get("id", "")

                # Verificar se é grupo
                is_group = "@g.us" in remote_jid

                # Extrair número limpo
                if is_group:
                    phone = remote_jid  # ex: 120363XXX@g.us
                    participant = key.get("participant", "") or msg.get("participant", "")
                    sender_name = msg.get("pushName", participant.replace("@s.whatsapp.net", ""))
                else:
                    phone = remote_jid.replace("@s.whatsapp.net", "")
                    sender_name = msg.get("pushName", phone)

                # Extrair texto
                message_content = msg.get("message", {})
                raw_msg_type = msg.get("messageType", "text")

                # Normalizar messageType da Evolution (audioMessage → audio, etc)
                MEDIA_TYPE_MAP = {
                    "imageMessage": "image",
                    "audioMessage": "audio",
                    "pttMessage": "audio",
                    "videoMessage": "video",
                    "documentMessage": "document",
                    "documentWithCaptionMessage": "document",
                    "stickerMessage": "sticker",
                }
                msg_type = MEDIA_TYPE_MAP.get(raw_msg_type, raw_msg_type)

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
                        select(Contact).where(Contact.wa_id == contact_phone, Contact.tenant_id == tenant_id)
                    )
                    contact = contact_result.scalar_one_or_none()

                    if not contact:
                        from datetime import datetime, timezone, timedelta
                        SP_TZ = timezone(timedelta(hours=-3))

                        # Para grupos, buscar nome do grupo na Evolution API
                        group_name = sender_name
                        if is_group:
                            try:
                                import httpx
                                from app.evolution.config import EVOLUTION_API_URL, EVOLUTION_API_KEY
                                async with httpx.AsyncClient(timeout=5) as http_client:
                                    group_resp = await http_client.get(
                                        f"{EVOLUTION_API_URL}/group/findGroupInfos/{instance_name}",
                                        params={"groupJid": contact_phone},
                                        headers={"apikey": EVOLUTION_API_KEY},
                                    )
                                    if group_resp.status_code == 200:
                                        group_name = group_resp.json().get("subject", sender_name)
                            except Exception as e:
                                print(f"⚠️ Erro ao buscar nome do grupo: {e}")

                        # Resolve pipeline for new contact
                        _pipeline_id = None
                        try:
                            from app.models import Pipeline
                            _ch_result = await db.execute(
                                select(Channel.default_pipeline_id).where(Channel.id == channel_id)
                            )
                            _ch_pipeline = _ch_result.scalar_one_or_none()
                            if _ch_pipeline:
                                _pipeline_id = _ch_pipeline
                            else:
                                _p_result = await db.execute(
                                    select(Pipeline.id).where(Pipeline.tenant_id == tenant_id, Pipeline.is_default == True)
                                )
                                _pipeline_id = _p_result.scalar_one_or_none()
                        except:
                            pass

                        contact = Contact(
                            tenant_id=tenant_id,
                            wa_id=contact_phone,
                            name=group_name,
                            channel_id=channel_id,
                            pipeline_id=_pipeline_id,
                            lead_status="novo",
                            ai_active=False if is_group else True,
                            last_inbound_at=datetime.now(SP_TZ).replace(tzinfo=None),
                            reengagement_count=0,
                            is_group=is_group,
                        )
                        db.add(contact)
                        await db.flush()
                        print(f"👤 Novo contato: {sender_name} ({contact_phone})")
                    # Atualizar last_inbound_at para reengajamento
                    if not from_me:
                        from datetime import datetime, timezone, timedelta
                        SP_TZ = timezone(timedelta(hours=-3))
                        contact.last_inbound_at = datetime.now(SP_TZ).replace(tzinfo=None)
                        contact.reengagement_count = 0

                # Verificar duplicata
                existing = await db.execute(
                    select(Message).where(Message.wa_message_id == msg_id)
                )
                if existing.scalar_one_or_none():
                    continue

                # Conteúdo baseado no tipo
                if msg_type in ("image", "audio", "video", "document", "sticker"):
                    # Evolution usa chave completa (audioMessage, imageMessage, etc)
                    media = message_content.get(raw_msg_type, {})
                    if raw_msg_type == "documentWithCaptionMessage":
                        media = media.get("message", {}).get("documentMessage", {})
                    mime = media.get("mimetype", "")
                    caption = media.get("caption", "")

                    # Baixar mídia via Evolution API e salvar em disco
                    local_filename = ""
                    try:
                        import httpx, uuid, os
                        from app.evolution.config import EVOLUTION_API_URL, EVOLUTION_API_KEY

                        media_dir = "/home/ubuntu/eduflow/backend/media"
                        os.makedirs(media_dir, exist_ok=True)

                        ext_map = {
                            "audio/ogg; codecs=opus": ".ogg", "audio/ogg": ".ogg",
                            "audio/mpeg": ".mp3", "image/jpeg": ".jpg",
                            "image/png": ".png", "image/webp": ".webp",
                            "video/mp4": ".mp4", "application/pdf": ".pdf",
                        }
                        ext = ext_map.get(mime.split(";")[0].strip(), ".bin")
                        local_filename = f"{uuid.uuid4().hex}{ext}"

                        async with httpx.AsyncClient(timeout=30) as http:
                            resp = await http.post(
                                f"{EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/{instance_name}",
                                json={"message": {"key": key}, "convertToMp4": False},
                                headers={"apikey": EVOLUTION_API_KEY},
                            )
                            if resp.status_code in (200, 201):
                                b64_data = resp.json().get("base64", "")
                                if b64_data:
                                    import base64 as b64module
                                    file_bytes = b64module.b64decode(b64_data)
                                    filepath = os.path.join(media_dir, local_filename)
                                    with open(filepath, "wb") as f:
                                        f.write(file_bytes)
                                    print(f"📎 Mídia salva: {filepath} ({len(file_bytes)} bytes)")
                                else:
                                    local_filename = ""
                            else:
                                print(f"⚠️ Erro ao baixar mídia: {resp.status_code}")
                                local_filename = ""
                    except Exception as e:
                        print(f"⚠️ Erro ao salvar mídia: {e}")
                        local_filename = ""

                    text = f"local:{local_filename}|{mime}|{caption}" if local_filename else f"[{msg_type}]"

                # Timestamp
                ts = msg.get("messageTimestamp", 0)
                from datetime import datetime, timezone, timedelta
                SP_TZ = timezone(timedelta(hours=-3))
                msg_time = datetime.fromtimestamp(int(ts), tz=SP_TZ).replace(tzinfo=None) if ts else datetime.now(SP_TZ).replace(tzinfo=None)

                # Salvar mensagem
                new_msg = Message(
                    tenant_id=tenant_id,
                    wa_message_id=msg_id,
                    contact_wa_id=contact_phone,
                    channel_id=channel_id,
                    direction=direction,
                    message_type=msg_type if msg_type != "conversation" else "text",
                    content=text,
                    timestamp=msg_time,
                    status="received" if not from_me else "sent",
                    sender_name=sender_name if is_group and not from_me else None,
                )
                db.add(new_msg)

                # Atualizar updated_at do contato
                if not from_me:
                    contact_update = await db.execute(
                        select(Contact).where(Contact.wa_id == contact_phone, Contact.tenant_id == tenant_id)
                    )
                    ct = contact_update.scalar_one_or_none()
                    if ct:
                        ct.updated_at = msg_time
                        from app.automation_scheduler import cancel_automations_for_contact
                        await cancel_automations_for_contact(contact_phone, db)

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

                # Se for áudio, transcrever com Whisper
                raw_msg_type = msg.get("messageType", "")
                if not text and raw_msg_type in ("audioMessage", "pttMessage"):
                    try:
                        import httpx, os, tempfile
                        from app.evolution.config import EVOLUTION_API_URL, EVOLUTION_API_KEY
                        from openai import AsyncOpenAI

                        async with httpx.AsyncClient(timeout=30) as http:
                            resp = await http.post(
                                f"{EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/{instance_name}",
                                json={"message": {"key": key}, "convertToMp4": False},
                                headers={"apikey": EVOLUTION_API_KEY},
                            )
                            if resp.status_code in (200, 201):
                                import base64 as b64module
                                b64_data = resp.json().get("base64", "")
                                if b64_data:
                                    audio_bytes = b64module.b64decode(b64_data)
                                    with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
                                        tmp.write(audio_bytes)
                                        tmp_path = tmp.name
                                    whisper_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
                                    with open(tmp_path, "rb") as audio_file:
                                        transcription = await whisper_client.audio.transcriptions.create(
                                            model="whisper-1",
                                            file=audio_file,
                                            language="pt",
                                        )
                                    text = transcription.text
                                    os.unlink(tmp_path)
                                    print(f"🎙️ Áudio transcrito: {text[:80]}")
                    except Exception as e:
                        print(f"⚠️ Erro ao transcrever áudio: {e}")

                if not text:
                    continue

                # Verificar se IA está ativa para este contato
                contact_check = await db.execute(
                    select(Contact).where(Contact.wa_id == phone, Contact.tenant_id == tenant_id)
                )
                ct = contact_check.scalar_one_or_none()
                if not ct or not ct.ai_active:
                    continue

                # Verificar se o agente está ativado no canal
                from app.models import AIConfig
                ai_cfg_check = await db.execute(
                    select(AIConfig).where(AIConfig.channel_id == channel_id)
                )
                ai_cfg = ai_cfg_check.scalar_one_or_none()
                if not ai_cfg or not ai_cfg.is_enabled:
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
                    tenant_id=tenant_id,
                    input_message_type=raw_msg_type,
                )

                action = result.get("action", "continue")
                print(f"🤖 IA respondeu para {phone}: {result.get('message', '')[:80]} [action={action}]")

                # Mover lead para "em_contato" no primeiro atendimento da IA
                try:
                    from app.models import Tenant
                    if ct and ct.lead_status == "novo":
                        tenant_result_move = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
                        tenant_move = tenant_result_move.scalar_one_or_none()
                        moves = (tenant_move.agent_pipeline_moves or {}) if tenant_move else {}
                        target = moves.get("on_first_contact", "")
                        if target:
                            ct.lead_status = target
                            await db.commit()
                            print(f"📊 Pipeline: lead {ct.id} movido de 'novo' → '{target}'")
                except Exception as e:
                    print(f"❌ Erro ao mover lead no primeiro contato: {e}")

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
                        from app.models import Schedule, Tenant
                        from app.agents.orchestrator.orchestrator import orchestrator, AgentEvent

                        collected = result.get("collected", {})
                        dia = collected.get("dia_agendamento", "")
                        horario = collected.get("horario_agendamento", "")

                        if dia and horario:
                            from app.evolution.scheduler import parse_schedule_datetime
                            scheduled_dt = parse_schedule_datetime(dia, horario)

                            if scheduled_dt:
                                # Verificar se tenant tem voice ativo
                                tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
                                tenant_obj = tenant_result.scalar_one_or_none()
                                plan_flags = (tenant_obj.agent_plan_flags or {}) if tenant_obj else {}
                                agent_flags = (tenant_obj.agent_flags or {}) if tenant_obj else {}

                                if plan_flags.get("voice") and agent_flags.get("voice"):
                                    # Tenant tem voz → agendar ligação automática
                                    notes_data = json.loads(ct.notes or "{}")
                                    course = notes_data.get("course", "Pós-graduação")
                                    schedule = Schedule(
                                        tenant_id=tenant_id,
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
                                    print(f"📞 Agendamento voice_ai criado: {sender_name} → {scheduled_dt}")
                                else:
                                    await db.commit()
                                    print(f"👤 Tenant sem voice ativo — reunião com closer humana: {scheduled_dt}")

                                # Sempre acionar orquestrador → FollowupAgent
                                await orchestrator.on_event(AgentEvent(
                                    lead_id=ct.id,
                                    tenant_id=tenant_id,
                                    event_type="call_completed",
                                    payload={
                                        "outcome": "qualified",
                                        "summary": f"Lead qualificado via WhatsApp. Reunião agendada para {scheduled_dt}",
                                        "collected_fields": {
                                            "data_agendamento": scheduled_dt.strftime("%d/%m/%Y"),
                                            "hora_agendamento": scheduled_dt.strftime("%H:%M"),
                                        },
                                    },
                                ), db)
                                print(f"🤖 Orquestrador acionado para lead {ct.id}")

                                # Mover lead na pipeline automaticamente
                                try:
                                    moves = (tenant_obj.agent_pipeline_moves or {}) if tenant_obj else {}
                                    target_status = moves.get("on_schedule_call", "")
                                    if target_status and ct.lead_status != target_status:
                                        old_status = ct.lead_status
                                        ct.lead_status = target_status
                                        await db.commit()
                                        print(f"📊 Pipeline: lead {ct.id} movido de '{old_status}' → '{target_status}'")
                                except Exception as e:
                                    print(f"❌ Erro ao mover lead na pipeline: {e}")

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