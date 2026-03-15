# backend/app/jarvis/routes.py
"""
Rota principal do Jarvis — assistente de voz do dashboard.
Recebe texto transcrito, consulta GPT-4o com tools, retorna áudio ElevenLabs.
"""
import base64
import json
import os
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from openai import AsyncOpenAI
from elevenlabs import ElevenLabs
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_tenant_id
from app.database import get_db
from app.models import User
from app.jarvis.tools import JARVIS_TOOLS
from app.jarvis.execute import execute_tool
from app.jarvis.prompts import build_system_prompt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/jarvis", tags=["Jarvis"])

# Clients
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))

# ElevenLabs config (mesma voz da Nat)
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "")


class JarvisQuery(BaseModel):
    text: str  # transcrição do áudio


@router.post("/query")
async def jarvis_query(
    body: JarvisQuery,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Recebe pergunta em texto, consulta dados via GPT-4o tools, retorna texto + áudio."""

    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Texto vazio")

    try:
        # 1. Montar system prompt com contexto do tenant
        system_prompt = await build_system_prompt(tenant_id, db)

        # 2. Chamar GPT-4o com tools
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": body.text},
        ]

        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=JARVIS_TOOLS,
            tool_choice="auto",
        )

        # 3. Processar tool calls em loop até ter resposta final
        answer = await _process_tool_loop(response, messages, tenant_id, db)

        # 4. Gerar áudio com ElevenLabs TTS
        audio_b64 = None
        if ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID:
            audio_b64 = _generate_audio(answer)

        return {
            "text": answer,
            "audio_b64": audio_b64,
        }

    except Exception as e:
        logger.error(f"[Jarvis] Erro ao processar query: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao processar sua pergunta")


async def _process_tool_loop(
    response,
    messages: list,
    tenant_id: int,
    db: AsyncSession,
    max_iterations: int = 5,
) -> str:
    """Loop de tool use até o GPT-4o retornar resposta de texto."""

    for _ in range(max_iterations):
        msg = response.choices[0].message

        # Se tem conteúdo de texto, é a resposta final
        if msg.content and not msg.tool_calls:
            return msg.content

        # Se não tem tool calls, retorno padrão
        if not msg.tool_calls:
            return "Não entendi a pergunta. Pode repetir?"

        # Processar cada tool call
        messages.append(msg)
        for tc in msg.tool_calls:
            try:
                args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                args = {}

            logger.info(f"[Jarvis] Tool call: {tc.function.name}({args})")

            result = await execute_tool(tc.function.name, args, tenant_id, db)

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, ensure_ascii=False, default=str),
            })

        # Nova chamada ao GPT-4o com os resultados das tools
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=JARVIS_TOOLS,
        )

    return "Desculpe, não consegui processar sua pergunta. Tente de outra forma."


def _generate_audio(text: str) -> str | None:
    """Gera áudio via ElevenLabs TTS e retorna base64."""
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
        logger.error(f"[Jarvis] Erro ao gerar áudio ElevenLabs: {e}")
        return None