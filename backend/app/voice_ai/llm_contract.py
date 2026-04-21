"""
Contrato do LLM - transforma chat em produto.
O LLM recebe input estruturado e DEVE retornar JSON com schema obrigatório.
Isso garante controle, consistência e rastreabilidade.
"""
import json
from typing import Optional
from openai import AsyncOpenAI
from app.voice_ai.config import OPENAI_API_KEY, LLM_MODEL, LLM_TEMPERATURE, LLM_MAX_TOKENS
from app.voice_ai.fsm import CallSession, State

client = AsyncOpenAI(api_key=OPENAI_API_KEY)


# === System Prompt Base ===

SYSTEM_PROMPT = """Você é Nat, assistente virtual de atendimento da instituição de ensino.
Seu papel é ligar para leads interessados, qualificar e encaminhar para o próximo passo.

REGRAS ABSOLUTAS:
1. Fale SEMPRE frases curtas (1-2 frases no máximo). Isso é uma ligação, não um texto.
2. Seja natural, amigável e profissional. Use linguagem coloquial brasileira.
3. NUNCA invente informações sobre preços, datas ou grades. Use apenas o que está no RAG.
4. NUNCA diga que é uma IA ou robô. Se perguntarem, diga "sou da equipe de atendimento".
5. Se o lead estiver ocupado, agende um melhor horário. Não insista.
6. Colete os campos obrigatórios de forma natural (não pareça um formulário).
7. Se detectar objeção, trate com empatia ANTES de continuar.
8. LGPD: nunca compartilhe dados de outros leads ou informações confidenciais.

FORMATO DA RESPOSTA:
Você DEVE responder APENAS com JSON válido, sem markdown, sem explicação. Schema:
{
  "say": "texto curto para falar agora (1-2 frases)",
  "ask": "pergunta, se houver (null se não)",
  "action": "continue|advance|handle_objection|schedule|transfer|follow_up|end_call",
  "fields_update": {"campo": "valor extraído"},
  "confidence": 0.0 a 1.0,
  "handoff_reason": "motivo se for transferir (null se não)",
  "objection_detected": "objeção detectada (null se não)",
  "next_state_suggestion": "OPENING|CONTEXT|QUALIFY|HANDLE_OBJECTION|SCHEDULE|WARM_TRANSFER|FOLLOW_UP|CLOSE"
}
"""


def build_llm_input(session: CallSession, last_utterance: str, rag_snippets: list = None, policies: dict = None) -> list:
    """
    Monta o input estruturado para o LLM.
    Sempre o mesmo formato, independente do estado.
    """
    # Contexto do lead
    lead_context = {
        "nome": session.lead_name,
        "telefone": session.lead_phone,
        "curso_interesse": session.course,
        "origem": session.source,
        "campanha": session.campaign,
    }

    # Estado atual
    state_info = {
        "estado_atual": session.state.value,
        "estado_anterior": session.previous_state.value if session.previous_state else None,
        "campos_coletados": session.collected_fields,
        "campos_faltantes": session.get_missing_fields(),
        "objecoes_registradas": session.objections,
        "turno_numero": session.turn_count,
        "score_atual": session.calculate_score()[0],
    }

    # RAG snippets
    rag_context = ""
    if rag_snippets:
        rag_context = "\n\nBASE DE CONHECIMENTO (use estas informações):\n"
        for snippet in rag_snippets:
            rag_context += f"[{snippet.get('title', '')}]: {snippet.get('content', '')}\n"

    # Políticas
    policy_text = ""
    if policies:
        policy_text = "\n\nPOLÍTICAS (respeite rigorosamente):\n"
        for key, value in policies.items():
            policy_text += f"- {key}: {value}\n"

    # Instruções específicas por estado
    state_instructions = _get_state_instructions(session.state, session)

    # Montar mensagens
    messages = [
        {
            "role": "system",
            "content": (
                SYSTEM_PROMPT
                + f"\n\nCONTEXTO DO LEAD:\n{json.dumps(lead_context, ensure_ascii=False)}"
                + f"\n\nESTADO DA CONVERSA:\n{json.dumps(state_info, ensure_ascii=False)}"
                + state_instructions
                + rag_context
                + policy_text
            ),
        }
    ]

    # Adicionar histórico da conversa (últimos 10 turnos)
    for turn in session.conversation_history[-10:]:
        role = "user" if turn["role"] == "user" else "assistant"
        if role == "assistant":
            # Para o LLM, recriar como se fosse texto simples
            messages.append({"role": role, "content": turn["content"]})
        else:
            messages.append({"role": role, "content": turn["content"]})

    # Última fala do lead
    messages.append({"role": "user", "content": last_utterance})

    return messages


def _get_state_instructions(state: State, session: CallSession) -> str:
    """Instruções específicas por estado da FSM."""
    instructions = {
        State.OPENING: """
INSTRUÇÕES PARA OPENING:
- Se apresente brevemente: "Oi [nome], tudo bem? Aqui é a Nat, da [instituição]."
- Peça permissão: "Vi que você se interessou pelo [curso]. Posso te contar rapidinho como funciona?"
- Se o lead disser que não pode falar, agradeça e pergunte melhor horário.
- Se autorizar, avance para CONTEXT.
- Máximo 2 tentativas. Se não autorizar, encerre com educação.
""",
        State.CONTEXT: """
INSTRUÇÕES PARA CONTEXT:
- Confirme o interesse: "Você tem interesse em [curso], é isso mesmo?"
- Se confirmar, avance para QUALIFY.
- Se disser outro curso, atualize o campo e continue.
- Se não tiver interesse, encerre educadamente.
""",
        State.QUALIFY: f"""
INSTRUÇÕES PARA QUALIFY:
- Colete os campos faltantes de forma NATURAL (não pareça formulário).
- Campos que FALTAM: {session.get_missing_fields()}
- Faça UMA pergunta por vez. Espere a resposta.
- Extraia informações das respostas do lead (pode ter mais de um campo na mesma fala).
- Se o lead demonstrar objeção, mude para HANDLE_OBJECTION.
- Quando todos os campos estiverem coletados, sugira SCHEDULE ou WARM_TRANSFER.
""",
        State.HANDLE_OBJECTION: f"""
INSTRUÇÕES PARA HANDLE_OBJECTION:
- Objeções registradas: {session.objections}
- Trate com EMPATIA primeiro: "Entendo perfeitamente..."
- Depois dê o contraponto usando a base de conhecimento.
- Se resolver, volte para QUALIFY.
- Se não resolver após 2 tentativas, ofereça FOLLOW_UP com material por WhatsApp.
""",
        State.SCHEDULE: """
INSTRUÇÕES PARA SCHEDULE:
- Ofereça horários: "Posso agendar uma conversa mais detalhada com nossa consultora. Qual dia e horário fica melhor pra você?"
- Confirme data e hora.
- Informe que vai enviar confirmação por WhatsApp.
- Avance para CLOSE.
""",
        State.WARM_TRANSFER: """
INSTRUÇÕES PARA WARM_TRANSFER:
- Avise o lead: "Vou te passar agora pra [closer] que pode te ajudar melhor com os detalhes. Um momento."
- Gere handoff_reason com resumo do que foi discutido.
- Avance para CLOSE.
""",
        State.FOLLOW_UP: """
INSTRUÇÕES PARA FOLLOW_UP:
- Avise: "Vou te enviar um material completo por WhatsApp pra você avaliar com calma."
- Pergunte se pode ligar de volta em outro momento.
- Avance para CLOSE.
""",
        State.CLOSE: """
INSTRUÇÕES PARA CLOSE:
- Agradeça: "Muito obrigada pelo seu tempo, [nome]! Qualquer dúvida, estou à disposição."
- Gere action: end_call.
""",
    }
    return instructions.get(state, "")


async def call_llm(session: CallSession, last_utterance: str, rag_snippets: list = None, policies: dict = None) -> dict:
    """
    Chama o LLM e retorna resposta estruturada.
    Garante que a resposta seja sempre JSON válido.
    """
    messages = build_llm_input(session, last_utterance, rag_snippets, policies)

    try:
        response = await client.chat.completions.create(
            model=LLM_MODEL,
            messages=messages,
            temperature=LLM_TEMPERATURE,
            max_completion_tokens=LLM_MAX_TOKENS,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        if not content:
            return _fallback_response(session)

        # Parse JSON
        result = json.loads(content)

        # Validar campos obrigatórios
        return _validate_response(result, session)

    except json.JSONDecodeError as e:
        print(f"❌ LLM retornou JSON inválido: {e}")
        return _fallback_response(session)
    except Exception as e:
        print(f"❌ Erro ao chamar LLM: {e}")
        return _fallback_response(session)


def _validate_response(response: dict, session: CallSession) -> dict:
    """Valida e sanitiza a resposta do LLM."""
    defaults = {
        "say": "Desculpe, pode repetir?",
        "ask": None,
        "action": "continue",
        "fields_update": {},
        "confidence": 0.5,
        "handoff_reason": None,
        "objection_detected": None,
        "next_state_suggestion": session.state.value,
    }

    # Garantir todos os campos
    for key, default in defaults.items():
        if key not in response or response[key] is None:
            if key == "say":
                response[key] = default
            elif key not in response:
                response[key] = default

    # Limitar tamanho do "say" (máx ~50 palavras para parecer natural)
    if response.get("say"):
        words = response["say"].split()
        if len(words) > 60:
            response["say"] = " ".join(words[:50]) + "..."

    # Validar action
    valid_actions = ["continue", "advance", "handle_objection", "schedule", "transfer", "follow_up", "end_call"]
    if response.get("action") not in valid_actions:
        response["action"] = "continue"

    # Validar confidence
    try:
        response["confidence"] = max(0.0, min(1.0, float(response.get("confidence", 0.5))))
    except (TypeError, ValueError):
        response["confidence"] = 0.5

    return response


def _fallback_response(session: CallSession) -> dict:
    """Resposta de fallback quando o LLM falha."""
    fallbacks = {
        State.OPENING: {
            "say": f"Oi, {session.lead_name}! Tudo bem? Aqui é da equipe de atendimento. Posso falar rapidinho sobre o curso que você se interessou?",
            "action": "continue",
        },
        State.CONTEXT: {
            "say": f"Você tem interesse no curso de {session.course}, é isso? Pode me contar um pouquinho mais?",
            "action": "continue",
        },
        State.QUALIFY: {
            "say": "Entendi! E qual seria seu principal objetivo com esse curso?",
            "action": "continue",
        },
        State.HANDLE_OBJECTION: {
            "say": "Entendo sua preocupação. Posso te explicar melhor como funciona?",
            "action": "continue",
        },
        State.CLOSE: {
            "say": f"Muito obrigada pelo seu tempo, {session.lead_name}! Qualquer dúvida, estou à disposição.",
            "action": "end_call",
        },
    }

    fb = fallbacks.get(session.state, {
        "say": "Desculpe, pode repetir? Quero ter certeza que entendi.",
        "action": "continue",
    })

    return {
        "say": fb["say"],
        "ask": None,
        "action": fb["action"],
        "fields_update": {},
        "confidence": 0.3,
        "handoff_reason": None,
        "objection_detected": None,
        "next_state_suggestion": session.state.value,
    }


async def generate_call_summary(session: CallSession) -> str:
    """Gera resumo estruturado da chamada ao final."""
    conversation_text = "\n".join([
        f"{'Lead' if t['role'] == 'user' else 'IA'}: {t['content']}"
        for t in session.conversation_history
    ])

    score, breakdown = session.calculate_score()

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": """Gere um resumo objetivo da ligação de qualificação. Formato:
📞 RESUMO DA LIGAÇÃO (IA Nat)
📅 Data: [data]
👤 Lead: [nome]
🎓 Curso: [curso]
📊 Score: [score]/100
📌 Dados coletados: [listar]
⚠️ Objeções: [listar ou "nenhuma"]
🎯 Resultado: [qualified/not_qualified/scheduled/transferred/follow_up]
📝 Observações: [2-3 frases do que aconteceu]

Seja breve e direto."""
                },
                {
                    "role": "user",
                    "content": (
                        f"Lead: {session.lead_name}\n"
                        f"Curso: {session.course}\n"
                        f"Score: {score}/100\n"
                        f"Campos: {json.dumps(session.collected_fields, ensure_ascii=False)}\n"
                        f"Objeções: {session.objections}\n"
                        f"Estado final: {session.state.value}\n\n"
                        f"Conversa:\n{conversation_text}"
                    ),
                }
            ],
            temperature=0.3,
            max_completion_tokens=400,
        )
        return response.choices[0].message.content or "Resumo não disponível"
    except Exception as e:
        return f"Erro ao gerar resumo: {e}"
