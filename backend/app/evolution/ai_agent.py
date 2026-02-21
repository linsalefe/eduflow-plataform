"""
Agente IA para WhatsApp via Evolution API.
Qualifica leads vindos de campanhas/landing pages.
"""
import os
import json
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Contact, Message
from app.evolution.client import send_text
from datetime import datetime, timezone, timedelta

SP_TZ = timezone(timedelta(hours=-3))

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

SYSTEM_PROMPT = """Você é a Nat, assistente virtual do CENAT (Centro Nacional de Saúde Mental).

Seu objetivo é qualificar leads que chegaram via campanha de WhatsApp. Você deve:

1. CUMPRIMENTAR de forma calorosa e breve
2. CONFIRMAR o interesse no curso que o lead demonstrou
3. COLETAR as seguintes informações:
   - Formação acadêmica
   - Área de atuação atual
   - Principal motivação para a pós-graduação
4. PERGUNTAR se o lead pode atender uma ligação AGORA para receber mais detalhes
   - Se SIM: diga que uma especialista vai ligar em instantes e use action "trigger_call"
   - Se NÃO: pergunte qual o melhor dia e horário para a ligação

REGRAS:
- Mensagens CURTAS (máximo 2 frases por vez)
- Tom caloroso, empático, nunca robótico
- Use emojis com moderação (1 por mensagem no máximo)
- NUNCA mande mensagens longas ou parágrafos
- Faça UMA pergunta por vez
- Se o lead disser que não tem interesse, agradeça e encerre

REGRAS CRÍTICAS DE ACTION:
- "continue": Use enquanto ainda está coletando informações ou conversando
- "trigger_call": Use IMEDIATAMENTE quando o lead confirmar que PODE atender ligação AGORA
- "schedule_call": Use IMEDIATAMENTE quando o lead CONFIRMAR um dia e horário para receber a ligação. Exemplo: se o lead diz "amanhã às 10h" e você confirma, na resposta de confirmação JÁ use action "schedule_call" com dia_agendamento e horario_agendamento preenchidos
- "end": Use quando o lead disser que não tem interesse ou a conversa encerrar

IMPORTANTE: Quando o lead confirmar o agendamento (ex: "sim", "pode ser", "ok"), você DEVE usar action "schedule_call" e preencher dia_agendamento e horario_agendamento nos collected. NÃO use "continue" após confirmar agendamento.

FORMATO DE RESPOSTA:
Responda APENAS com JSON (sem markdown, sem backticks):
{
  "message": "texto da mensagem para o lead",
  "collected": {
    "formacao": "valor ou null",
    "atuacao": "valor ou null",
    "motivacao": "valor ou null",
    "aceita_ligacao": "sim/nao/null",
    "dia_agendamento": "valor ou null",
    "horario_agendamento": "valor ou null"
  },
  "action": "continue/trigger_call/schedule_call/end"
}
"""


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
            continue  # Ignorar mensagens do consultor humano
        history.append({"role": role, "content": msg.content})

    return history


async def process_message(
    wa_id: str,
    user_message: str,
    contact_name: str,
    instance_name: str,
    channel_id: int,
    db: AsyncSession,
) -> dict:
    """Processa mensagem do lead e gera resposta da IA."""

    # Buscar contexto do contato
    contact_result = await db.execute(
        select(Contact).where(Contact.wa_id == wa_id)
    )
    contact = contact_result.scalar_one_or_none()

    # Montar curso (se vier da landing page, estará nas notas)
    course = ""
    if contact and contact.notes:
        try:
            notes = json.loads(contact.notes)
            course = notes.get("course", "")
        except (json.JSONDecodeError, TypeError):
            pass

    # Histórico de conversa
    history = await get_conversation_history(wa_id, db)

    # Montar mensagens para a LLM
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"Dados do lead: Nome={contact_name}, Curso de interesse={course or 'não informado'}"},
    ]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    try:
        response = await client.chat.completions.create(
            model="gpt-4.1",
            messages=messages,
            temperature=0.3,
            max_tokens=300,
        )

        raw = response.choices[0].message.content.strip()

        # Parse JSON
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            # Tentar extrair JSON do texto
            import re
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
        collected = parsed.get("collected", {})
        
        if action == "continue":
            # Detectar trigger_call
            if any(kw in msg_lower for kw in ["ligar em instantes", "vai te ligar agora", "ligação agora"]):
                action = "trigger_call"
                print(f"🔄 Action corrigido para trigger_call via fallback")
            
            # Detectar schedule_call
            elif any(kw in msg_lower for kw in ["agendado", "agendada", "vamos agendar", "vai te ligar amanhã", "vai te ligar na"]):
                action = "schedule_call"
                # Tentar extrair dia/horário da mensagem se não veio no collected
                if not collected.get("dia_agendamento") or collected["dia_agendamento"] == "null":
                    import re
                    if "amanhã" in msg_lower or "amanha" in msg_lower:
                        collected["dia_agendamento"] = "amanhã"
                    dia_match = re.search(r'(segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)', msg_lower)
                    if dia_match:
                        collected["dia_agendamento"] = dia_match.group(1)
                
                if not collected.get("horario_agendamento") or collected["horario_agendamento"] == "null":
                    import re
                    hora_match = re.search(r'(\d{1,2})\s*[h:]?\s*(\d{2})?\s*(da\s*(?:manhã|tarde|noite))?', msg_lower)
                    if hora_match:
                        collected["horario_agendamento"] = hora_match.group(0).strip()
                
                print(f"🔄 Action corrigido para schedule_call via fallback: dia={collected.get('dia_agendamento')}, hora={collected.get('horario_agendamento')}")
            
            # Detectar end
            elif any(kw in msg_lower for kw in ["obrigada pelo seu tempo", "qualquer dúvida", "até logo"]):
                action = "end"
                
        # Enviar resposta via Evolution
        if ai_message:
            await send_text(instance_name, wa_id, ai_message)

            # Salvar mensagem no banco
            import uuid
            ai_msg = Message(
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

        return {
            "message": ai_message,
            "collected": collected,
            "action": action,
        }

    except Exception as e:
        print(f"❌ Erro agente IA WhatsApp: {e}")
        return {"message": "", "collected": {}, "action": "error"}