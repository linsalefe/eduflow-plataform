"""
Rotas do módulo Voice AI Inbound.
Endpoints: IVR (menu de voz), gather (captura dígito), stream (WebSocket).
"""
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from sqlalchemy import select

from app.database import async_session
from app.voice_ai_inbound.config import (
    IVR_GREETING, IVR_INVALID, IVR_TIMEOUT_SEC, IVR_MAX_RETRIES,
    IVR_AGENT_MAP, BASE_URL,
)
from app.voice_ai_inbound.models import VoiceAgent
from app.voice_ai_inbound.pipeline import InboundVoicePipeline


router = APIRouter(prefix="/api/voice-inbound", tags=["Voice AI Inbound"])


# ============================================================
# 1. IVR — Menu de voz (chamada inbound atendida)
# ============================================================

@router.post("/answer")
async def inbound_answer(request: Request):
    """
    Primeiro endpoint chamado quando um cliente liga.
    Retorna TwiML com menu IVR: "Digite 1 para suporte, 2 para..."
    """
    from twilio.twiml.voice_response import VoiceResponse, Gather

    response = VoiceResponse()

    gather = Gather(
        num_digits=1,
        action=f"{BASE_URL}/api/voice-inbound/gather",
        method="POST",
        timeout=IVR_TIMEOUT_SEC,
        language="pt-BR",
    )
    gather.say(IVR_GREETING, voice="Polly.Camila", language="pt-BR")
    response.append(gather)

    # Se não digitou nada, repete
    response.say(IVR_INVALID, voice="Polly.Camila", language="pt-BR")
    response.redirect(f"{BASE_URL}/api/voice-inbound/answer", method="POST")

    form = await request.form()
    call_sid = form.get("CallSid", "")
    caller = form.get("From", "")
    print(f"📞 Inbound call: {caller} → IVR menu (CallSid: {call_sid})")

    return Response(content=str(response), media_type="application/xml")


# ============================================================
# 2. GATHER — Processa dígito do IVR
# ============================================================

@router.post("/gather")
async def inbound_gather(request: Request):
    """
    Recebe o dígito pressionado no IVR.
    Conecta ao agente correto via Media Stream.
    """
    from twilio.twiml.voice_response import VoiceResponse, Gather, Connect, Stream

    form = await request.form()
    digit = form.get("Digits", "")
    call_sid = form.get("CallSid", "")
    caller = form.get("From", "")

    agent_slug = IVR_AGENT_MAP.get(digit)

    if not agent_slug:
        # Dígito inválido — repete o menu
        response = VoiceResponse()
        gather = Gather(
            num_digits=1,
            action=f"{BASE_URL}/api/voice-inbound/gather",
            method="POST",
            timeout=IVR_TIMEOUT_SEC,
            language="pt-BR",
        )
        gather.say(IVR_INVALID, voice="Polly.Camila", language="pt-BR")
        response.append(gather)
        response.say(
            "Não foi possível entender. Encerrando a ligação.",
            voice="Polly.Camila", language="pt-BR",
        )
        response.hangup()
        return Response(content=str(response), media_type="application/xml")

    # Buscar agente no banco para pegar o greeting
    greeting = None
    async with async_session() as db:
        result = await db.execute(
            select(VoiceAgent).where(
                VoiceAgent.slug == agent_slug,
                VoiceAgent.is_active == True,
            )
        )
        agent = result.scalar_one_or_none()
        if agent and agent.greeting_text:
            greeting = agent.greeting_text

    print(f"📞 IVR: digit={digit} → agent={agent_slug} (CallSid: {call_sid}, From: {caller})")

    response = VoiceResponse()

    # Fala o greeting enquanto conecta
    if greeting:
        response.say(greeting, voice="Polly.Camila", language="pt-BR")

    # Conectar Media Stream bidirecional com o agente
    connect = Connect()
    stream = Stream(
        url=f"{BASE_URL.replace('https', 'wss')}/api/voice-inbound/stream",
        name="inbound_stream",
    )
    stream.parameter(name="call_sid", value=call_sid)
    stream.parameter(name="agent_slug", value=agent_slug)
    stream.parameter(name="caller", value=caller)
    connect.append(stream)
    response.append(connect)

    return Response(content=str(response), media_type="application/xml")


# ============================================================
# 3. WEBSOCKET — Media Stream (pipeline STT→LLM→TTS)
# ============================================================

@router.websocket("/stream")
async def inbound_stream(websocket: WebSocket):
    """
    WebSocket para Twilio Media Streams (inbound).
    Recebe áudio → Whisper STT → GPT-4o → ElevenLabs TTS → devolve áudio.
    """
    await websocket.accept()

    pipeline = None

    try:
        async for message in websocket.iter_text():
            data = json.loads(message)

            if data.get("event") == "start":
                start_data = data.get("start", {})
                custom_params = start_data.get("customParameters", {})
                call_sid = custom_params.get("call_sid", "")
                agent_slug = custom_params.get("agent_slug", "support")
                caller = custom_params.get("caller", "")

                print(f"📞 [INBOUND] Stream conectado: agent={agent_slug}, caller={caller}, call_sid={call_sid}")

                # Buscar config do agente no banco
                agent_config = await _load_agent_config(agent_slug)

                if not agent_config:
                    print(f"❌ [INBOUND] Agente '{agent_slug}' não encontrado no banco")
                    await websocket.close()
                    return

                # Criar pipeline
                pipeline = InboundVoicePipeline(agent_config)
                pipeline.call_sid = call_sid
                pipeline.caller = caller

                # Rodar o pipeline
                await pipeline.handle_websocket(websocket)
                break

    except WebSocketDisconnect:
        print(f"📞 [INBOUND] WebSocket desconectado")
    except Exception as e:
        print(f"❌ [INBOUND] Erro no stream: {e}")
        traceback.print_exc()
    finally:
        if pipeline:
            await _save_call(pipeline)


# ============================================================
# HELPERS
# ============================================================

import json
import traceback
from datetime import datetime, timezone, timedelta
from app.voice_ai.models import AICall, AICallTurn

SP_TZ = timezone(timedelta(hours=-3))


async def _load_agent_config(slug: str) -> dict | None:
    """Carrega configuração do agente do banco."""
    async with async_session() as db:
        result = await db.execute(
            select(VoiceAgent).where(
                VoiceAgent.slug == slug,
                VoiceAgent.is_active == True,
            )
        )
        agent = result.scalar_one_or_none()
        if not agent:
            return None

        return {
            "id": agent.id,
            "tenant_id": agent.tenant_id,
            "slug": agent.slug,
            "name": agent.name,
            "system_prompt": agent.system_prompt,
            "greeting_text": agent.greeting_text,
            "llm_model": agent.llm_model,
            "llm_temperature": agent.llm_temperature,
            "llm_max_tokens": agent.llm_max_tokens,
            "elevenlabs_voice_id": agent.elevenlabs_voice_id,
            "elevenlabs_model_id": agent.elevenlabs_model_id,
            "max_duration_sec": agent.max_duration_sec,
            "silence_timeout_sec": agent.silence_timeout_sec,
            "can_escalate": agent.can_escalate,
            "escalation_phone": agent.escalation_phone,
            "knowledge_doc_ids": agent.knowledge_doc_ids,
        }


async def _save_call(pipeline: InboundVoicePipeline):
    """Salva a chamada inbound e transcrição no banco."""
    try:
        summary = pipeline.get_summary()
        agent_config = pipeline.agent
        now = datetime.now(SP_TZ).replace(tzinfo=None)

        async with async_session() as db:
            ai_call = AICall(
                tenant_id=agent_config.get("tenant_id", 1),
                from_number=summary["caller"],
                to_number="inbound",
                twilio_call_sid=summary["call_sid"],
                direction="inbound",
                status="completed",
                outcome="support_completed",
                source=f"inbound_{summary['agent_slug']}",
                lead_name=summary["caller"],
                campaign=summary["agent_name"],
                duration_seconds=summary["duration_seconds"],
                total_turns=summary["total_turns"],
                avg_latency_ms=summary["avg_latency_ms"],
                started_at=now,
                ended_at=now,
            )
            db.add(ai_call)
            await db.flush()

            for turn in summary["transcript"]:
                ai_turn = AICallTurn(
                    call_id=ai_call.id,
                    role=turn["role"],
                    text=turn["text"],
                )
                db.add(ai_turn)

            await db.commit()
            print(f"✅ [INBOUND] Chamada salva: id={ai_call.id}, turns={summary['total_turns']}, duracao={summary['duration_seconds']}s")

    except Exception as e:
        print(f"❌ [INBOUND] Erro ao salvar chamada: {e}")
        traceback.print_exc()