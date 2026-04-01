from fastapi import FastAPI, Request, Query, HTTPException, Depends
from app.ai_engine import generate_ai_response
from app.whatsapp import send_text_message
from app.ai_routes import router as ai_router
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from dotenv import load_dotenv
from app.automation_scheduler import start_automation_scheduler
import httpx
from app.twilio_routes import router as twilio_router
from datetime import datetime, timezone, timedelta
from app.voice_ai_elevenlabs.campaign_routes import router as campaign_router
from app.kanban_routes import router as kanban_router
from app.schedule_routes import router as schedule_router
from app.tenant_routes import router as tenant_router, tenant_router as tenant_agent_router
from app.calendar_routes import router as calendar_router
from app.notification_routes import router as notification_router
from app.webhook_routes import router as webhook_router, public_router as webhook_public_router
from app.landing_routes import router as landing_router
from app.financial_routes import router as financial_router
from app.notification_routes import notify_all_users
from app.agents.orchestrator.orchestrator import orchestrator
from app.voice_ai_inbound.routes import router as voice_inbound_router
from fastapi.staticfiles import StaticFiles
from app.voice_ai_elevenlabs.routes import router as voice_ai_el_router
from app.landing_routes import public_router as landing_public_router
from app.export_routes import router as export_router
from app.task_routes import router as task_router
from app.automation_routes import router as automation_router
from app.voice_ai_elevenlabs.agent_tools_routes import router as agent_tools_router
from app.oauth_routes import router as oauth_router
from app.voice_ai.routes import router as voice_ai_router
from app.voice_ai_elevenlabs.campaign_worker import campaign_worker
from app.evolution.routes import router as evolution_router
from app.jarvis.routes import router as jarvis_router
from contextlib import asynccontextmanager
import os
import asyncio

SP_TZ = timezone(timedelta(hours=-3))

from app.database import get_db, async_session
from app.models import Channel, Contact, Message
from app.routes import router
from app.auth_routes import router as auth_router
from app.exact_routes import router as exact_router
from app.exact_spotter import sync_exact_leads

load_dotenv()


async def sync_job():
    """Job que sincroniza leads do Exact Spotter a cada 10 minutos."""
    while True:
        await asyncio.sleep(600)  # 10 minutos
        try:
            async with async_session() as db:
                result = await sync_exact_leads(db)
                print(f"🔄 Sync Exact Spotter: {result}")
        except Exception as e:
            print(f"❌ Erro no sync Exact Spotter: {e}")

async def cleanup_recordings_job():
    """Job que exclui gravações com +90 dias a cada 24 horas."""
    while True:
        await asyncio.sleep(86400)  # 24 horas
        try:
            from app.google_drive import delete_old_recordings
            delete_old_recordings(days=90)
            print("🗑️ Limpeza de gravações antigas concluída")
        except Exception as e:
            print(f"❌ Erro na limpeza de gravações: {e}")
async def scheduler_job():
    """Job que verifica agendamentos pendentes e dispara ligações a cada 1 minuto."""
    await asyncio.sleep(30)  # Espera 30s pro app iniciar
    while True:
        try:
            from app.models import Schedule
            from sqlalchemy import select
            from datetime import datetime, timezone, timedelta
            SP = timezone(timedelta(hours=-3))
            now = datetime.now(SP).replace(tzinfo=None)
            print(f"⏰ Scheduler rodando: {now}")

            async with async_session() as db:
                result = await db.execute(
                    select(Schedule).where(
                        Schedule.status == "pending",
                        Schedule.type == "voice_ai",
                        Schedule.scheduled_at <= now,
                    )
                )
                schedules = result.scalars().all()

                for s in schedules:
                    try:
                        from app.voice_ai_elevenlabs.voice_pipeline import make_outbound_call
                        await make_outbound_call(s.phone, s.contact_name or "Lead", s.course or "Pós-graduação")
                        s.status = "completed"
                        print(f"📞 Agendamento disparado: {s.contact_name} ({s.phone}) às {s.scheduled_time}")
                    except Exception as e:
                        s.status = "failed"
                        s.notes = str(e)
                        print(f"❌ Erro agendamento {s.id}: {e}")
                await db.commit()

            async with async_session() as db:
                # Followup reminders
                result_followup = await db.execute(
                    select(Schedule).where(
                        Schedule.status == "pending",
                        Schedule.type == "followup_reminder",
                        Schedule.scheduled_at <= now,
                    )
                )
                followup_schedules = result_followup.scalars().all()
                for s in followup_schedules:
                    try:
                        from app.models import Contact, Channel
                        from app.evolution.client import send_text
                        lead_result = await db.execute(
                            select(Contact).where(Contact.wa_id == s.contact_wa_id)
                        )
                        lead = lead_result.scalar_one_or_none()
                        if lead:
                            channel_result = await db.execute(
                                select(Channel).where(
                                    Channel.tenant_id == s.tenant_id,
                                    Channel.is_active == True,
                                    Channel.type == "whatsapp",
                                )
                            )
                            channel = channel_result.scalars().first()
                            if channel:
                                msg = s.notes or "Lembrete da sua reunião! 😊"
                                await send_text(channel.instance_name, lead.wa_id, msg)
                                print(f"📅 Lembrete enviado para {lead.name} ({lead.wa_id})")
                        s.status = "completed"
                    except Exception as e:
                        s.status = "failed"
                        s.notes = str(e)
                        print(f"❌ Erro lembrete {s.id}: {e}")
                await db.commit()

            async with async_session() as db:
                # Briefing agent
                result_briefing = await db.execute(
                    select(Schedule).where(
                        Schedule.status == "pending",
                        Schedule.type == "briefing_agent",
                        Schedule.scheduled_at <= now,
                    )
                )
                briefing_schedules = result_briefing.scalars().all()
                for s in briefing_schedules:
                    try:
                        from app.agents.briefing.agent import BriefingAgent
                        from app.models import Contact
                        lead_result = await db.execute(
                            select(Contact).where(Contact.wa_id == s.contact_wa_id)
                        )
                        lead = lead_result.scalar_one_or_none()
                        if lead:
                            await BriefingAgent().handle(lead.id, s.tenant_id, db)
                        s.status = "completed"
                    except Exception as e:
                        s.status = "failed"
                        s.notes = str(e)
                        print(f"❌ Erro briefing {s.id}: {e}")
                await db.commit()
        except Exception as e:
            print(f"❌ Erro scheduler_job: {e}")

        # Reengajamento automático
        try:
            from app.reengagement import run_reengagement
            await run_reengagement()
        except Exception as e:
            print(f"❌ Erro reengagement: {e}")

        await asyncio.sleep(60)  # Checa a cada 1 minuto

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(sync_job())
    cleanup_task = asyncio.create_task(cleanup_recordings_job())
    print("✅ Sync Exact Spotter agendado (a cada 10 min)")
    scheduler_task = asyncio.create_task(scheduler_job())
    print("📅 Scheduler de ligações agendado (a cada 1 min)")
    automation_task = asyncio.create_task(start_automation_scheduler())
    print("🤖 Automation scheduler iniciado (a cada 15 min)")
    campaign_task = asyncio.create_task(campaign_worker())
    print("📞 Campaign worker iniciado")
    yield
    task.cancel()
    cleanup_task.cancel()
    scheduler_task.cancel()
    automation_task.cancel()
    campaign_task.cancel()


app = FastAPI(title="EduFlow API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://portal.eduflowia.com", "http://localhost:3000", "https://gv-sports-education.netlify.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(auth_router)
app.include_router(exact_router)
app.include_router(ai_router)
app.include_router(kanban_router)
app.include_router(calendar_router)
VERIFY_TOKEN = os.getenv("WEBHOOK_VERIFY_TOKEN")
app.include_router(twilio_router)
app.include_router(landing_router)
app.include_router(landing_public_router)
app.include_router(oauth_router)
app.include_router(voice_ai_el_router)
app.include_router(agent_tools_router)
app.include_router(tenant_router)
app.include_router(tenant_agent_router)
app.include_router(voice_ai_router)
app.include_router(automation_router)
app.include_router(voice_inbound_router)
app.include_router(financial_router)
app.include_router(evolution_router)
app.include_router(notification_router)
app.include_router(task_router)
app.include_router(webhook_router)
app.include_router(webhook_public_router)
app.include_router(campaign_router)
app.include_router(schedule_router)
app.include_router(export_router)
app.include_router(jarvis_router)

@app.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    if hub_mode == "subscribe" and hub_token == VERIFY_TOKEN:
        print("✅ Webhook verificado com sucesso!")
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Token inválido")


@app.post("/webhook")
async def receive_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()

    if body.get("object") == "instagram":
        return await handle_instagram_webhook(body, db)

    if body.get("object") != "whatsapp_business_account":
        return {"status": "ignored"}

    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            metadata = value.get("metadata", {})
            phone_number_id = metadata.get("phone_number_id")

            # Identificar canal
            channel_id = None
            if phone_number_id:
                result = await db.execute(
                    select(Channel).where(Channel.phone_number_id == phone_number_id)
                )
                channel = result.scalar_one_or_none()
                if channel:
                    channel_id = channel.id

            # Salvar contato
            for contact_data in value.get("contacts", []):
                wa_id = contact_data["wa_id"]
                name = contact_data.get("profile", {}).get("name", "")

                result = await db.execute(select(Contact).where(Contact.wa_id == wa_id))
                contact = result.scalar_one_or_none()

                if not contact:
                    contact = Contact(wa_id=wa_id, name=name, channel_id=channel_id)
                    db.add(contact)
                    await notify_all_users(
                        db, "new_lead", 
                        f"Novo lead: {name or wa_id}",
                        f"Um novo lead entrou pelo WhatsApp",
                        f"/conversations",
                        wa_id,
                    )
                else:
                    contact.name = name
                    if not contact.channel_id and channel_id:
                        contact.channel_id = channel_id

            # Salvar mensagens
            for msg in value.get("messages", []):
                wa_message_id = msg["id"]

                result = await db.execute(select(Message).where(Message.wa_message_id == wa_message_id))
                if result.scalar_one_or_none():
                    continue

                msg_type = msg["type"]
                content = ""

                if msg_type == "text":
                    content = msg["text"]["body"]
                elif msg_type == "image":
                    media = msg.get("image", {})
                    content = f'media:{media.get("id", "")}|{media.get("mime_type", "image/jpeg")}|{media.get("caption", "")}'
                elif msg_type == "audio":
                    media = msg.get("audio", {})
                    content = f'media:{media.get("id", "")}|{media.get("mime_type", "audio/ogg")}|'
                elif msg_type == "video":
                    media = msg.get("video", {})
                    content = f'media:{media.get("id", "")}|{media.get("mime_type", "video/mp4")}|{media.get("caption", "")}'
                elif msg_type == "document":
                    media = msg.get("document", {})
                    content = f'media:{media.get("id", "")}|{media.get("mime_type", "")}|{media.get("filename", "documento")}'
                elif msg_type == "sticker":
                    media = msg.get("sticker", {})
                    content = f'media:{media.get("id", "")}|{media.get("mime_type", "image/webp")}|'

                message = Message(
                    wa_message_id=wa_message_id,
                    contact_wa_id=msg["from"],
                    channel_id=channel_id,
                    direction="inbound",
                    message_type=msg_type,
                    content=content,
                    timestamp=datetime.fromtimestamp(int(msg["timestamp"]), tz=SP_TZ).replace(tzinfo=None),
                    status="received",
                )
                db.add(message)

            # Atualizar status de mensagens enviadas
            for status_update in value.get("statuses", []):
                wa_message_id = status_update["id"]
                new_status = status_update["status"]

                result = await db.execute(select(Message).where(Message.wa_message_id == wa_message_id))
                existing = result.scalar_one_or_none()
                if existing:
                    existing.status = new_status

            # === AGENTE IA: DESATIVADO TEMPORARIAMENTE ===
            # for msg in value.get("messages", []):
            #     sender_wa_id = msg["from"]
            #     msg_type = msg["type"]
            #
            #     # Só responde mensagens de texto
            #     if msg_type != "text":
            #         continue
            #
            #     # Buscar contato para verificar se IA está ativa
            #     contact_result = await db.execute(
            #         select(Contact).where(Contact.wa_id == sender_wa_id)
            #     )
            #     ai_contact = contact_result.scalar_one_or_none()
            #
            #     if not ai_contact or not ai_contact.ai_active or not channel_id:
            #         continue
            #
            #     # Buscar canal para enviar resposta
            #     channel_result = await db.execute(
            #         select(Channel).where(Channel.id == channel_id)
            #     )
            #     ai_channel = channel_result.scalar_one_or_none()
            #     if not ai_channel:
            #         continue
            #
            #     # Gerar resposta da IA
            #     user_text = msg.get("text", {}).get("body", "")
            #     ai_response = await generate_ai_response(
            #         contact_wa_id=sender_wa_id,
            #         user_message=user_text,
            #         channel_id=channel_id,
            #         db=db,
            #     )
            #
            #     if ai_response:
            #         # Enviar via WhatsApp
            #         send_result = await send_text_message(
            #             to=sender_wa_id,
            #             text=ai_response,
            #             phone_number_id=ai_channel.phone_number_id,
            #             token=ai_channel.whatsapp_token,
            #         )
            #
            #         # Salvar mensagem da IA no banco
            #         if "messages" in send_result:
            #             ai_msg = Message(
            #                 wa_message_id=send_result["messages"][0]["id"],
            #                 contact_wa_id=sender_wa_id,
            #                 channel_id=channel_id,
            #                 direction="outbound",
            #                 message_type="text",
            #                 content=ai_response,
            #                 timestamp=datetime.now(SP_TZ).replace(tzinfo=None),
            #                 status="sent",
            #             )
            #             db.add(ai_msg)
            #
            #             # Atualizar contador no summary do kanban
            #             from app.models import AIConversationSummary
            #             summary_result = await db.execute(
            #                 select(AIConversationSummary).where(
            #                     AIConversationSummary.contact_wa_id == sender_wa_id,
            #                     AIConversationSummary.status == "em_atendimento_ia",
            #                 )
            #             )
            #             summary = summary_result.scalar_one_or_none()
            #             if summary:
            #                 summary.ai_messages_count = (summary.ai_messages_count or 0) + 1
            #
            #         print(f"🤖 IA respondeu para {sender_wa_id}")

            await db.commit()
            print(f"💾 Dados salvos no banco!")

    return {"status": "ok"}


async def handle_instagram_webhook(body: dict, db: AsyncSession):
    """Processa mensagens do Instagram Direct."""

    for entry in body.get("entry", []):
        ig_user_id = str(entry.get("id", ""))
        print(f"🔍 Instagram webhook entry ID: {ig_user_id}")

        # Identificar canal pelo instagram_id
        channel_id = None
        channel = None
        if ig_user_id:
            result = await db.execute(
                select(Channel).where(Channel.instagram_id == ig_user_id, Channel.is_active == True)
            )
            channel = result.scalar_one_or_none()
            if channel:
                channel_id = channel.id

        for messaging_event in entry.get("messaging", []):
            sender_id = str(messaging_event.get("sender", {}).get("id", ""))
            message_data = messaging_event.get("message", {})
            timestamp = messaging_event.get("timestamp", 0)

            # Ignorar mensagens enviadas por nós mesmos (echo)
            if sender_id == ig_user_id:
                continue

            # Ignorar se não tem mensagem
            if not message_data or message_data.get("is_echo"):
                continue

            msg_id = message_data.get("mid", "")
            if not msg_id:
                continue

            # Verificar duplicata
            existing_msg = await db.execute(
                select(Message).where(Message.wa_message_id == msg_id)
            )
            if existing_msg.scalar_one_or_none():
                continue

            # Determinar tipo e conteúdo
            msg_type = "text"
            content = ""

            if "text" in message_data:
                content = message_data["text"]
            elif "attachments" in message_data:
                attachment = message_data["attachments"][0]
                att_type = attachment.get("type", "image")
                att_url = attachment.get("payload", {}).get("url", "")
                msg_type = att_type
                content = f"media:{att_url}|{att_type}|"

            # Usar sender_id como identificador (equivalente ao wa_id)
            ig_sender_id = f"ig_{sender_id}"

            # Criar ou atualizar contato
            contact_result = await db.execute(
                select(Contact).where(Contact.wa_id == ig_sender_id)
            )
            contact = contact_result.scalar_one_or_none()

            if not contact:
                # Buscar nome/username do perfil via API
                ig_name = f"Instagram {sender_id}"
                if channel and channel.access_token:
                    try:
                        async with httpx.AsyncClient() as http_client:
                            profile_res = await http_client.get(
                                f"https://graph.instagram.com/v22.0/{sender_id}",
                                params={
                                    "fields": "name,username,profile_picture_url",
                                    "access_token": channel.access_token,
                                },
                            )
                        if profile_res.status_code == 200:
                            profile = profile_res.json()
                            username = profile.get("username", "")
                            name = profile.get("name", "")
                            ig_name = name or f"@{username}" if username else ig_name
                            print(f"👤 Instagram perfil: {ig_name} (@{username})")
                    except Exception as e:
                        print(f"⚠️ Erro ao buscar perfil Instagram: {e}")

                contact = Contact(
                    wa_id=ig_sender_id,
                    name=ig_name,
                    channel_id=channel_id,
                )
                db.add(contact)
                await db.flush()
                await notify_all_users(
                    db, "new_lead",
                    f"Novo lead: {ig_name or ig_sender_id}",
                    f"Um novo lead entrou pelo Instagram",
                    f"/conversations",
                    ig_sender_id,
                )

            # Salvar mensagem
            ts = datetime.fromtimestamp(timestamp / 1000, tz=SP_TZ).replace(tzinfo=None) if timestamp > 9999999999 else datetime.fromtimestamp(timestamp, tz=SP_TZ).replace(tzinfo=None)

            message = Message(
                wa_message_id=msg_id,
                contact_wa_id=ig_sender_id,
                channel_id=channel_id,
                direction="inbound",
                message_type=msg_type,
                content=content,
                timestamp=ts,
                status="received",
            )
            db.add(message)
            print(f"📩 Instagram DM de {sender_id}: {content[:50]}")

        await db.commit()

    return {"status": "ok"}

# Servir uploads estáticos
import pathlib
pathlib.Path("uploads").mkdir(exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.get("/health")
async def health():
    return {"status": "online"}