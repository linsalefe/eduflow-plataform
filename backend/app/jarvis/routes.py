# backend/app/jarvis/routes.py
"""
Rota principal do Jarvis — assistente de voz do dashboard.
v3: Memoria conversacional + filtro de tools por plano + prompt engajador.
"""
import base64
import json
import os
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from openai import AsyncOpenAI
from elevenlabs import ElevenLabs
from sqlalchemy.ext.asyncio import AsyncSession
from dotenv import load_dotenv

load_dotenv()

from app.auth import get_current_user, get_tenant_id
from app.database import get_db
from app.models import User
from app.jarvis.tools import JARVIS_TOOLS
from app.jarvis.execute import execute_tool
from app.jarvis.actions import prepare_action, execute_action
from app.jarvis.prompts import build_system_prompt
from app.jarvis.filters import get_available_tools
from app.jarvis import session as jarvis_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/jarvis", tags=["Jarvis"])

# Clients
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))

# ElevenLabs config
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "ZxhW0J5Q17DnNxZM6VDC")

# Action tool names (requerem confirmacao)
ACTION_TOOLS = {"action_send_followup", "action_make_call", "action_move_pipeline", "action_schedule"}


# ============================================================
# SCHEMAS
# ============================================================
class JarvisQuery(BaseModel):
    text: str


class JarvisConfirm(BaseModel):
    action: str
    details: dict
    generate_audio: Optional[bool] = True


# ============================================================
# POST /api/jarvis/query — pergunta ou acao (com confirmacao)
# ============================================================
@router.post("/query")
async def jarvis_query(
    body: JarvisQuery,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Recebe pergunta/comando em texto. Retorna resposta ou pending_action."""

    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Texto vazio")

    try:
        # 1. Montar system prompt
        system_prompt = await build_system_prompt(tenant_id, db)

        # 2. Filtrar tools disponiveis para este tenant (plano/features)
        available_tools = await get_available_tools(tenant_id, db)
        if not available_tools:
            raise HTTPException(status_code=403, detail="Nenhuma tool disponivel para este tenant")

        # 3. Recuperar historico da sessao (ultimos turnos)
        history = jarvis_session.get_history(tenant_id, user.id)

        # 4. Montar messages: system + historico + user atual
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history)
        messages.append({"role": "user", "content": body.text})

        # 5. Chamar GPT-4o com tools filtradas
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=available_tools,
            tool_choice="auto",
        )

        # 6. Processar — pode ser query ou action
        result = await _process_response(
            response, messages, tenant_id, db,
            user_id=user.id, available_tools=available_tools,
        )

        # 7. Salvar turno na sessao — somente se for resposta final de texto
        # (pending_action NAO salva ainda, so apos confirmacao no /confirm)
        if result.get("type") == "answer" and result.get("text"):
            jarvis_session.append_turn(
                tenant_id=tenant_id,
                user_id=user.id,
                user_message=body.text,
                assistant_message=result["text"],
            )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Jarvis] Erro ao processar query: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao processar sua pergunta")


# ============================================================
# POST /api/jarvis/confirm — executa acao confirmada
# ============================================================
@router.post("/confirm")
async def jarvis_confirm(
    body: JarvisConfirm,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Executa uma acao previamente preparada, apos confirmacao do usuario."""

    try:
        result = await execute_action(body.action, body.details, tenant_id, db)

        text = result.get("message", "Acao executada.")
        audio_b64 = None

        if body.generate_audio and result.get("success"):
            audio_b64 = _generate_audio(text)

        # Registrar acao confirmada na sessao como turno
        synthetic_user_msg = f"[Acao confirmada: {body.action}]"
        jarvis_session.append_turn(
            tenant_id=tenant_id,
            user_id=user.id,
            user_message=synthetic_user_msg,
            assistant_message=text,
        )

        return {
            "type": "action_result",
            "success": result.get("success", False),
            "text": text,
            "audio_b64": audio_b64,
        }

    except Exception as e:
        logger.error(f"[Jarvis] Erro ao confirmar acao: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao executar a acao")


# ============================================================
# POST /api/jarvis/session/clear — reseta conversa do usuario
# ============================================================
@router.post("/session/clear")
async def jarvis_session_clear(
    user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Apaga o historico da sessao atual (para botao 'nova conversa')."""
    jarvis_session.clear(tenant_id, user.id)
    return {"status": "cleared"}


# ============================================================
# INTERNAL — process GPT-4o response (query or action)
# ============================================================
async def _process_response(
    response,
    messages: list,
    tenant_id: int,
    db: AsyncSession,
    user_id: Optional[int] = None,
    available_tools: Optional[list] = None,
    max_iterations: int = 5,
) -> dict:
    """Processa resposta do GPT-4o. Se for action, retorna pending_action."""

    for _ in range(max_iterations):
        msg = response.choices[0].message

        # Resposta final de texto (query respondida)
        if msg.content and not msg.tool_calls:
            audio_b64 = _generate_audio(msg.content) if ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID else None
            return {
                "type": "answer",
                "text": msg.content,
                "audio_b64": audio_b64,
            }

        # Sem tool calls — fallback
        if not msg.tool_calls:
            text = "Nao entendi a pergunta. Pode repetir?"
            return {
                "type": "answer",
                "text": text,
                "audio_b64": _generate_audio(text) if ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID else None,
            }

        # Verificar se alguma tool call e uma ACTION
        for tc in msg.tool_calls:
            if tc.function.name in ACTION_TOOLS:
                try:
                    args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    args = {}

                logger.info(f"[Jarvis] Action detected: {tc.function.name}({args})")
                pending = await prepare_action(tc.function.name, args, tenant_id, db)

                if pending.get("error"):
                    text = pending["error"]
                    return {
                        "type": "answer",
                        "text": text,
                        "audio_b64": _generate_audio(text) if ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID else None,
                    }

                desc = pending.get("description", "")
                audio_b64 = _generate_audio(f"Posso {desc.lower()}?") if ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID else None

                return {
                    "type": "pending_action",
                    "text": f"{desc}. Deseja confirmar?",
                    "audio_b64": audio_b64,
                    "pending_action": pending,
                }

        # E uma query tool — executar normalmente
        messages.append(msg)
        for tc in msg.tool_calls:
            try:
                args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                args = {}

            logger.info(f"[Jarvis] Tool call: {tc.function.name}({args})")
            result = await execute_tool(tc.function.name, args, tenant_id, db, user_id=user_id)

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, ensure_ascii=False, default=str),
            })

        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=available_tools or JARVIS_TOOLS,
        )

    text = "Desculpe, nao consegui processar sua pergunta."
    return {
        "type": "answer",
        "text": text,
        "audio_b64": None,
    }


# ============================================================
# INTERNAL — generate ElevenLabs TTS audio
# ============================================================
def _generate_audio(text: str) -> str | None:
    """Gera audio via ElevenLabs TTS e retorna base64."""
    if not ELEVENLABS_API_KEY or not ELEVENLABS_VOICE_ID:
        return None
    try:
        client = ElevenLabs(api_key=ELEVENLABS_API_KEY)
        audio_generator = client.text_to_speech.convert(
            voice_id=ELEVENLABS_VOICE_ID,
            text=text,
            model_id="eleven_multilingual_v2",
            output_format="mp3_44100_128",
        )
        audio_bytes = b"".join(audio_generator)
        return base64.b64encode(audio_bytes).decode()
    except Exception as e:
        logger.error(f"[Jarvis] Erro ao gerar audio ElevenLabs: {e}")
        return None
