"""
Reengajamento automático — verifica conversas travadas e envia mensagem via IA.
"""
import json
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import async_session
from app.models import Contact, Tenant, Channel, AIConfig, Message
from app.evolution.client import send_text
from openai import AsyncOpenAI
import os

SP_TZ = timezone(timedelta(hours=-3))
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


async def run_reengagement():
    """Verifica contatos com IA ativa que pararam de responder."""
    async with async_session() as db:
        try:
            now = datetime.now(SP_TZ).replace(tzinfo=None)

            # Buscar todos os tenants com reengagement habilitado
            tenants_result = await db.execute(
                select(Tenant).where(Tenant.is_active == True)
            )
            tenants = tenants_result.scalars().all()

            for tenant in tenants:
                config = tenant.reengagement_config or {}
                if not config.get("enabled", False):
                    continue

                attempts = config.get("attempts", [])
                max_attempts = config.get("max_attempts", 3)
                move_to = config.get("move_to_on_give_up", "parou_de_responder")

                # Buscar contatos com IA ativa e last_inbound_at preenchido
                contacts_result = await db.execute(
                    select(Contact).where(
                        Contact.tenant_id == tenant.id,
                        Contact.ai_active == True,
                        Contact.last_inbound_at != None,
                        Contact.reengagement_count < max_attempts,
                    )
                )
                contacts = contacts_result.scalars().all()

                for contact in contacts:
                    attempt_index = contact.reengagement_count
                    if attempt_index >= len(attempts):
                        continue

                    attempt = attempts[attempt_index]
                    delay_minutes = attempt.get("delay_minutes", 120)
                    instruction = attempt.get("instruction", "")

                    # Verificar se já passou o tempo necessário
                    time_since_last = (now - contact.last_inbound_at).total_seconds() / 60
                    if time_since_last < delay_minutes:
                        continue

                    # Verificar última mensagem da conversa
                    last_msg_result = await db.execute(
                        select(Message)
                        .where(Message.contact_wa_id == contact.wa_id, Message.tenant_id == tenant.id)
                        .order_by(Message.timestamp.desc())
                        .limit(1)
                    )
                    last_msg = last_msg_result.scalar_one_or_none()

                    # Se a última mensagem é INBOUND (lead respondeu), não reengajar
                    if last_msg and last_msg.direction == "inbound":
                        continue

                    # Se última mensagem é outbound da IA, verificar tempo desde ela
                    if last_msg and last_msg.direction == "outbound" and last_msg.sent_by_ai:
                        time_since_ai = (now - last_msg.timestamp).total_seconds() / 60
                        if time_since_ai < delay_minutes:
                            continue

                    # Verificar se agente está ativado no canal
                    ai_cfg_result = await db.execute(
                        select(AIConfig).where(AIConfig.channel_id == contact.channel_id)
                    )
                    ai_cfg = ai_cfg_result.scalar_one_or_none()
                    if not ai_cfg or not ai_cfg.is_enabled:
                        continue

                    # Buscar canal para enviar
                    channel_result = await db.execute(
                        select(Channel).where(
                            Channel.id == contact.channel_id,
                            Channel.is_active == True,
                        )
                    )
                    channel = channel_result.scalar_one_or_none()
                    if not channel or not channel.instance_name:
                        continue

                    # Gerar mensagem via GPT
                    try:
                        system_prompt = ai_cfg.system_prompt or ""
                        lead_name = (contact.name or "").split()[0] if contact.name else "Lead"

                        gpt_response = await client.chat.completions.create(
                            model="gpt-4o",
                            messages=[
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": f"O lead {lead_name} parou de responder há {int(time_since_last)} minutos. Esta é a tentativa {attempt_index + 1} de {max_attempts} de reengajamento. {instruction} Responda APENAS com o texto da mensagem, sem JSON."},
                            ],
                            max_tokens=200,
                            temperature=0.7,
                        )
                        message_text = (gpt_response.choices[0].message.content or "").strip()

                        if not message_text:
                            continue

                        # Enviar via WhatsApp
                        await send_text(channel.instance_name, contact.wa_id, message_text)

                        # Salvar mensagem no banco
                        import uuid
                        ai_msg = Message(
                            tenant_id=tenant.id,
                            wa_message_id=f"reeng_{uuid.uuid4().hex[:12]}",
                            contact_wa_id=contact.wa_id,
                            channel_id=contact.channel_id,
                            direction="outbound",
                            message_type="text",
                            content=message_text,
                            timestamp=now,
                            status="sent",
                            sent_by_ai=True,
                        )
                        db.add(ai_msg)

                        # Incrementar contador
                        contact.reengagement_count = attempt_index + 1
                        await db.commit()

                        print(f"🔄 Reengajamento ({attempt_index + 1}/{max_attempts}) enviado para {contact.name} ({contact.wa_id})")

                    except Exception as e:
                        print(f"❌ Erro reengajamento {contact.wa_id}: {e}")

                # Desativar IA para quem esgotou tentativas
                expired_result = await db.execute(
                    select(Contact).where(
                        Contact.tenant_id == tenant.id,
                        Contact.ai_active == True,
                        Contact.last_inbound_at != None,
                        Contact.reengagement_count >= max_attempts,
                    )
                )
                expired = expired_result.scalars().all()

                for contact in expired:
                    # Verificar se tempo desde última tentativa já passou
                    if len(attempts) > 0:
                        last_delay = attempts[-1].get("delay_minutes", 120)
                        time_since_last = (now - contact.last_inbound_at).total_seconds() / 60
                        total_delay = sum(a.get("delay_minutes", 0) for a in attempts)
                        if time_since_last < total_delay:
                            continue

                    contact.ai_active = False
                    contact.lead_status = move_to
                    print(f"⏹️ IA desligada para {contact.name} ({contact.wa_id}) — sem resposta após {max_attempts} tentativas")

                await db.commit()

        except Exception as e:
            print(f"❌ Erro no reengagement scheduler: {e}")