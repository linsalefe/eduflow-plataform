"""
Agente IA para WhatsApp via Evolution API.
Qualifica leads vindos de campanhas/landing pages.
Usa AIConfig (prompt por tenant) + RAG (base de conhecimento).
"""
import os
import json
import re
import uuid
import asyncio
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Contact, Message, AIConfig, Channel, Tenant, TokenUsage
from app.openai_usage import log_openai_usage
from app.evolution.client import send_text, send_audio
from app.elevenlabs.client import text_to_audio_base64
from app.ai_engine import search_knowledge
from app.database import async_session
from app.ai_lab.memory import (
    format_memory_for_prompt,
    update_lead_memory,
    tenant_has_memory_enabled,
)
from app.ai_lab.few_shot import (
    get_relevant_examples,
    format_examples_for_prompt,
)
from datetime import datetime, timezone, timedelta

SP_TZ = timezone(timedelta(hours=-3))

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


async def get_ai_config(channel_id: int, db: AsyncSession) -> AIConfig | None:
    """Busca configuração da IA para o canal."""
    result = await db.execute(
        select(AIConfig).where(AIConfig.channel_id == channel_id)
    )
    return result.scalar_one_or_none()


async def get_channel_id_for_contact(wa_id: str, instance_name: str, db: AsyncSession) -> int | None:
    """Busca channel_id pelo instance_name ou pelo contato."""
    ch_result = await db.execute(
        select(Channel).where(Channel.instance_name == instance_name)
    )
    channel = ch_result.scalar_one_or_none()
    if channel:
        return channel.id

    c_result = await db.execute(
        select(Contact).where(Contact.wa_id == wa_id)
    )
    contact = c_result.scalar_one_or_none()
    return contact.channel_id if contact else None


async def get_conversation_history(wa_id: str, db: AsyncSession, limit: int = 20) -> list:
    """Busca últimas mensagens do contato para contexto."""
    result = await db.execute(
        select(Message)
        .where(Message.contact_wa_id == wa_id)
        .order_by(Message.timestamp.desc())
        .limit(limit)
    )
    messages = result.scalars().all()
    messages.reverse()

    history = []
    for msg in messages:
        role = "assistant" if msg.direction == "outbound" and msg.sent_by_ai else "user"
        if msg.direction == "outbound" and not msg.sent_by_ai:
            continue
        history.append({"role": role, "content": msg.content})

    return history


async def _build_fewshot_block(
    tenant_id: int | None,
    history: list[dict],
    user_message: str,
    db: AsyncSession,
) -> str:
    """
    Monta o bloco de exemplos few-shot para injetar no system_prompt.
    Best-effort: qualquer erro => retorna "" e o agente segue sem few-shot.
    """
    if not tenant_id:
        return ""

    # Contexto insuficiente gera embedding ruim. Pula.
    if not history or len(history) < 2:
        return ""

    try:
        # últimas 5 msgs do histórico + msg atual do lead
        current_context = history[-5:] + [{"role": "user", "content": user_message}]
        examples = await get_relevant_examples(
            tenant_id=tenant_id,
            current_context=current_context,
            db=db,
        )
        if not examples:
            return ""

        # Log custo do embedding (text-embedding-3-small ~ N tokens/input)
        try:
            approx_tokens = sum(
                len(m.get("content", "") or "") // 4 for m in current_context
            )
            token_record = TokenUsage(
                tenant_id=tenant_id,
                source="few_shot_embedding",
                module="few_shot_embedding",
                model="text-embedding-3-small",
                prompt_tokens=approx_tokens,
                completion_tokens=0,
                total_tokens=approx_tokens,
            )
            db.add(token_record)
        except Exception as e:
            print(f"⚠️ [few_shot] Falha ao logar token_usage: {e}")

        block = format_examples_for_prompt(examples)
        print(f"🧪 [few_shot] tenant={tenant_id} injetou {len(examples)} exemplo(s), ~{len(block)} chars")
        return block
    except Exception as e:
        print(f"⚠️ [few_shot] erro ao montar bloco: {e}")
        return ""


async def _build_memory_block(
    tenant_id: int | None,
    contact: Contact | None,
    db: AsyncSession,
) -> str:
    """
    Monta o bloco de memória persistente do lead pra injetar no system_prompt.
    Best-effort: qualquer erro => retorna "" e o agente segue sem memória.
    """
    if not tenant_id or not contact:
        return ""

    try:
        if not await tenant_has_memory_enabled(tenant_id, db):
            return ""

        memory = contact.ai_memory if isinstance(contact.ai_memory, dict) else {}
        block = format_memory_for_prompt(memory)
        if block:
            facts = memory.get("personal_facts", []) or []
            objs = memory.get("objections", []) or []
            print(
                f"🧠 [memory] tenant={tenant_id} contact={contact.id} "
                f"facts={len(facts)} objections={len(objs)}"
            )
        return block
    except Exception as e:
        print(f"⚠️ [memory] erro ao montar bloco: {e}")
        return ""


async def _update_lead_memory_bg(contact_id: int) -> None:
    """
    Wrapper que roda `update_lead_memory` numa sessão nova.
    Rodado via asyncio.create_task após o commit da resposta do agente.
    Best-effort: engole qualquer exceção.
    """
    try:
        async with async_session() as bg_db:
            await update_lead_memory(contact_id, bg_db)
    except Exception as e:
        print(f"⚠️ [memory] erro em background update_lead_memory: {e}")


async def process_message(
    wa_id: str,
    user_message: str,
    contact_name: str,
    instance_name: str,
    channel_id: int,
    db: AsyncSession,
    tenant_id: int = None,
    input_message_type: str = "text",
) -> dict:
    """Processa mensagem do lead e gera resposta da IA."""

    # Buscar contato
    contact_result = await db.execute(
        select(Contact).where(Contact.wa_id == wa_id)
    )
    contact = contact_result.scalar_one_or_none()

    # Curso do lead
    course = ""
    if contact and contact.notes:
        try:
            notes = json.loads(contact.notes)
            course = notes.get("course", "")
        except (json.JSONDecodeError, TypeError):
            pass

    # ── Buscar AIConfig do canal ──────────────────────────────────────────────
    ai_config = await get_ai_config(channel_id, db)
    if not ai_config or not ai_config.system_prompt:
        print(f"⚠️ Sem prompt configurado para canal {channel_id}. IA não vai responder.")
        return {"message": "", "collected": {}, "action": "continue"}
    system_prompt = ai_config.system_prompt
    model = (ai_config.model or "gpt-4.1") if ai_config else "gpt-4.1"
    temperature = float((ai_config.temperature or "0.3")) if ai_config else 0.3
    max_tokens = (ai_config.max_tokens or 300) if ai_config else 300

    # ── Buscar RAG ────────────────────────────────────────────────────────────
    rag_context = ""
    try:
        relevant_docs = await search_knowledge(user_message, channel_id, db, top_k=3)
        if relevant_docs:
            rag_context = "\n\n📚 BASE DE CONHECIMENTO (use para responder):\n"
            for doc in relevant_docs:
                rag_context += f"\n[{doc['title']}]\n{doc['content']}\n"
    except Exception as e:
        print(f"⚠️ Erro ao buscar RAG: {e}")

    # ── Histórico de conversa ─────────────────────────────────────────────────
    history = await get_conversation_history(wa_id, db)

    # ── Montar mensagens ──────────────────────────────────────────────────────
    lead_info = f"\nDados do lead: Nome={contact_name}, Curso de interesse={course or 'não informado'}"

    # ── Buscar campos de qualificação do tenant ──────────────────────────────
    qualification_fields = []
    ai_audio_enabled = False
    if tenant_id:
        try:
            tenant_result = await db.execute(
                select(Tenant).where(Tenant.id == tenant_id)
            )
            tenant = tenant_result.scalar_one_or_none()
            if tenant and tenant.qualification_fields:
                qualification_fields = tenant.qualification_fields
            ai_audio_enabled = bool((tenant.features or {}).get("ai_audio_response", False)) if tenant else False

            # Bloquear se sem créditos
            if tenant and tenant.credits_balance <= 0:
                print(f"🚫 Tenant {tenant_id} sem créditos. IA bloqueada.")
                return {"message": "", "collected": {}, "action": "continue"}
        except Exception as e:
            print(f"⚠️ Erro ao buscar qualification_fields: {e}")
            ai_audio_enabled = False

    # ── Montar collected fields dinâmicos ─────────────────────────────────────
    if qualification_fields:
        collected_json = ",\n    ".join(
            f'"{f["key"]}": "valor ou null"' for f in qualification_fields
        )
    else:
        collected_json = '''"formacao": "valor ou null",
    "atuacao": "valor ou null",
    "motivacao": "valor ou null",
    "aceita_ligacao": "sim/nao/null",
    "dia_agendamento": "valor ou null",
    "horario_agendamento": "valor ou null"'''

    FORMAT_RULES = f"""

REGRAS CRÍTICAS DE ACTION (NUNCA IGNORE):
- "continue": Use enquanto ainda está coletando informações ou conversando
- "trigger_call": Use IMEDIATAMENTE quando o lead confirmar que PODE atender ligação AGORA
- "schedule_call": Use IMEDIATAMENTE quando o lead CONFIRMAR um dia e horário para reunião/ligação
- "end": Use quando o lead disser que não tem interesse ou a conversa encerrar

FORMATO DE RESPOSTA OBRIGATÓRIO:
Responda APENAS com JSON válido (sem markdown, sem backticks, sem texto fora do JSON):
{{
  "message": "texto da mensagem para o lead",
  "collected": {{
    {collected_json}
  }},
  "action": "continue/trigger_call/schedule_call/end"
}}"""

    # ── Memória persistente do lead ───────────────────────────────────────────
    memory_block = await _build_memory_block(tenant_id, contact, db)

    # ── Few-shot do Laboratório do Agente ─────────────────────────────────────
    fewshot_block = await _build_fewshot_block(tenant_id, history, user_message, db)

    messages = [
        {"role": "system", "content": system_prompt + lead_info + rag_context + memory_block + fewshot_block + FORMAT_RULES},
    ]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    try:
        api_params = {
            "model": model,
            "messages": messages,
            "max_completion_tokens": max_tokens,
        }
        if not model.startswith("gpt-5"):
            api_params["temperature"] = temperature

        response = await client.chat.completions.create(**api_params)
        raw = (response.choices[0].message.content or "").strip()

        # Retry com gpt-4o-mini se resposta vazia
        if not raw and model.startswith("gpt-5"):
            print(f"⚠️ GPT-5 retornou vazio, tentando retry com gpt-4o-mini...")
            retry_params = {
                "model": "gpt-4o-mini",
                "messages": messages,
                "max_completion_tokens": max_tokens,
                "temperature": temperature,
            }
            response = await client.chat.completions.create(**retry_params)
            raw = (response.choices[0].message.content or "").strip()

        # Salvar consumo de tokens e debitar crédito
        try:
            if tenant_id:
                await log_openai_usage(db, tenant_id=tenant_id, module="whatsapp_ai", model=response.model or model, response=response)

            # Debitar 1 crédito por mensagem processada
            if tenant_id:
                tenant_result2 = await db.execute(
                    select(Tenant).where(Tenant.id == tenant_id)
                )
                t = tenant_result2.scalar_one_or_none()
                if t:
                    t.credits_balance = max(0, (t.credits_balance or 0) - 1)
                    t.credits_used = (t.credits_used or 0) + 1
        except Exception as e:
            print(f"⚠️ Erro ao salvar token_usage/créditos: {e}")

        # Parse JSON
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r'\{.*\}', raw, re.DOTALL)
            if match:
                parsed = json.loads(match.group())
            else:
                parsed = {"message": raw, "collected": {}, "action": "continue"}

        ai_message = parsed.get("message", "")
        collected = parsed.get("collected", {})
        action = parsed.get("action", "continue")

        # Fallback: detectar action pelo conteúdo da mensagem
        msg_lower = ai_message.lower()

        if action == "continue":
            if any(kw in msg_lower for kw in ["ligar em instantes", "vai te ligar agora", "ligação agora"]):
                action = "trigger_call"
                print(f"🔄 Action corrigido para trigger_call via fallback")

            elif any(kw in msg_lower for kw in ["agendado", "agendada", "confirmado", "confirmada", "confirmado:", "vamos agendar", "vai te ligar amanhã", "vai te ligar na"]):
                action = "schedule_call"
                if not collected.get("dia_agendamento") or collected["dia_agendamento"] == "null":
                    if "amanhã" in msg_lower or "amanha" in msg_lower:
                        collected["dia_agendamento"] = "amanhã"
                    dia_match = re.search(r'(segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)', msg_lower)
                    if dia_match:
                        collected["dia_agendamento"] = dia_match.group(1)
                if not collected.get("horario_agendamento") or collected["horario_agendamento"] == "null":
                    hora_match = re.search(r'(\d{1,2})\s*[h:]?\s*(\d{2})?\s*(da\s*(?:manhã|tarde|noite))?', msg_lower)
                    if hora_match:
                        collected["horario_agendamento"] = hora_match.group(0).strip()
                print(f"🔄 Action corrigido para schedule_call via fallback")

            elif any(kw in msg_lower for kw in ["obrigada pelo seu tempo", "qualquer dúvida", "até logo"]):
                action = "end"

        # Enviar resposta via Evolution
        if ai_message:
            lead_sent_audio = input_message_type in ("audioMessage", "pttMessage")
            if ai_audio_enabled and lead_sent_audio:
                audio_b64 = await text_to_audio_base64(ai_message)
                if audio_b64:
                    await send_audio(instance_name, wa_id, audio_b64)
                else:
                    await send_text(instance_name, wa_id, ai_message)
            else:
                await send_text(instance_name, wa_id, ai_message)

            # Salvar mensagem no banco
            ai_msg = Message(
                tenant_id=tenant_id,
                wa_message_id=f"ai_{uuid.uuid4().hex[:16]}",
                contact_wa_id=wa_id,
                channel_id=channel_id,
                direction="outbound",
                message_type="text",
                content=ai_message,
                timestamp=datetime.now(SP_TZ).replace(tzinfo=None),
                status="sent",
                sent_by_ai=True,
            )
            db.add(ai_msg)

            # Atualizar dados coletados nas notas do contato
            if contact and any(v for v in collected.values() if v and v != "null"):
                try:
                    existing_notes = json.loads(contact.notes or "{}")
                except (json.JSONDecodeError, TypeError):
                    existing_notes = {}

                for key, val in collected.items():
                    if val and val != "null":
                        existing_notes[key] = val

                contact.notes = json.dumps(existing_notes, ensure_ascii=False)

            await db.commit()

            # Memória do lead: extração em background (best-effort, não bloqueia resposta)
            if tenant_id and contact:
                try:
                    asyncio.create_task(_update_lead_memory_bg(contact.id))
                except Exception as e:
                    print(f"⚠️ [memory] falha ao agendar background task: {e}")

        return {
            "message": ai_message,
            "collected": collected,
            "action": action,
        }

    except Exception as e:
        print(f"❌ Erro agente IA WhatsApp: {e}")
        return {"message": "", "collected": {}, "action": "error"}