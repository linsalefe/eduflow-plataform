"""
Rotas do módulo Voice AI Inbound.
Endpoints: IVR (menu de voz), gather (captura dígito), stream (WebSocket).
"""
from fastapi import APIRouter, Request
from fastapi.responses import Response
from sqlalchemy import select

from app.database import async_session
from app.voice_ai_inbound.config import (
    IVR_GREETING, IVR_INVALID, IVR_TIMEOUT_SEC, IVR_MAX_RETRIES,
    IVR_AGENT_MAP, BASE_URL,
)
from app.voice_ai_inbound.models import VoiceAgent


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
