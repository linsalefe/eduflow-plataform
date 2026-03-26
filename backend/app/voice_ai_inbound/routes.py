"""
Rotas do módulo Voice AI Inbound.
Endpoints: IVR (menu de voz), gather (captura dígito), post-call webhook.
Usa ElevenLabs Agents via Register Call — ElevenLabs gerencia toda a conversa.
"""
import traceback
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request
from fastapi.responses import Response
from sqlalchemy import select

from app.database import async_session
from app.voice_ai_inbound.config import (
    IVR_GREETING, IVR_INVALID, IVR_TIMEOUT_SEC,
    IVR_AGENT_MAP, BASE_URL, ELEVENLABS_API_KEY,
)
from app.voice_ai_inbound.models import VoiceAgent


router = APIRouter(prefix="/api/voice-inbound", tags=["Voice AI Inbound"])

SP_TZ = timezone(timedelta(hours=-3))


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

    form = await request.form()
    call_sid = form.get("CallSid", "")
    caller = form.get("From", "")

    print(f"📞 [INBOUND] Chamada recebida: {caller} → IVR menu (CallSid: {call_sid})")

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

    return Response(content=str(response), media_type="application/xml")


# ============================================================
# 2. GATHER — Processa dígito do IVR → Register Call ElevenLabs
# ============================================================

@router.post("/gather")
async def inbound_gather(request: Request):
    """
    Recebe o dígito pressionado no IVR.
    Registra a chamada no ElevenLabs Agent correto via Register Call.
    ElevenLabs retorna TwiML pronto → devolvemos ao Twilio.
    """
    from twilio.twiml.voice_response import VoiceResponse, Gather
    from backend.app.elevenlabs.client import ElevenLabs

    form = await request.form()
    digit = form.get("Digits", "")
    call_sid = form.get("CallSid", "")
    caller = form.get("From", "")
    called = form.get("To", "")

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

    # Buscar elevenlabs_agent_id do banco
    elevenlabs_agent_id = None
    async with async_session() as db:
        result = await db.execute(
            select(VoiceAgent).where(
                VoiceAgent.slug == agent_slug,
                VoiceAgent.is_active == True,
            )
        )
        agent = result.scalar_one_or_none()
        if agent:
            elevenlabs_agent_id = agent.elevenlabs_agent_id

    if not elevenlabs_agent_id:
        print(f"❌ [INBOUND] Agente '{agent_slug}' sem agent_id configurado")
        response = VoiceResponse()
        response.say(
            "Desculpe, este serviço está temporariamente indisponível. Tente novamente mais tarde.",
            voice="Polly.Camila", language="pt-BR",
        )
        response.hangup()
        return Response(content=str(response), media_type="application/xml")

    print(f"📞 [INBOUND] IVR: digit={digit} → agent={agent_slug} → ElevenLabs={elevenlabs_agent_id}")

    try:
        import httpx

        resp = httpx.post(
            "https://api.elevenlabs.io/v1/convai/twilio/register-call",
            headers={
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "agent_id": elevenlabs_agent_id,
                "from_number": caller,
                "to_number": called,
                "direction": "inbound",
                "conversation_initiation_client_data": {
                    "dynamic_variables": {
                        "caller_number": caller,
                        "agent_type": agent_slug,
                    }
                },
            },
            timeout=10.0,
        )

        print(f"📄 [INBOUND] ElevenLabs status={resp.status_code}")
        print(f"📄 [INBOUND] ElevenLabs response: {resp.text[:500]}")

        if resp.status_code == 200:
            return Response(content=resp.text, media_type="application/xml")
        else:
            raise Exception(f"ElevenLabs retornou {resp.status_code}: {resp.text[:200]}")

    except Exception as e:
        print(f"❌ [INBOUND] Erro no register_call: {e}")
        traceback.print_exc()

        response = VoiceResponse()
        response.say(
            "Desculpe, tivemos um problema técnico. Tente novamente em alguns minutos.",
            voice="Polly.Camila", language="pt-BR",
        )
        response.hangup()
        return Response(content=str(response), media_type="application/xml")


# ============================================================
# 3. POST-CALL WEBHOOK — Recebe dados após a chamada
# ============================================================

@router.post("/post-call-webhook")
async def inbound_post_call(request: Request):
    """
    Webhook chamado pelo ElevenLabs após cada chamada inbound.
    Salva transcrição, duração e resultado na tabela ai_calls.
    """
    from app.voice_ai.models import AICall, AICallTurn

    try:
        payload = await request.json()
        print(f"📦 [INBOUND] Post-call webhook recebido")

        data = payload.get("data", {})
        metadata = data.get("metadata", {})
        analysis = data.get("analysis", {})
        transcript_list = data.get("transcript", [])
        initiation = data.get("conversation_initiation_client_data", {})
        dynamic_vars = initiation.get("dynamic_variables", {})

        conversation_id = data.get("conversation_id", "")
        caller = dynamic_vars.get("caller_number", "")
        agent_type = dynamic_vars.get("agent_type", "support")
        duration = metadata.get("call_duration_secs", 0)

        # Transcrição como texto
        transcript_text = ""
        for turn in transcript_list:
            role = turn.get("role", "")
            message = turn.get("message", "")
            if message:
                label = "Cliente" if role == "user" else "Lia"
                transcript_text += f"{label}: {message}\n"

        # Análise
        call_successful = analysis.get("call_successful", "unknown")
        summary_text = analysis.get("transcript_summary", "")

        if call_successful == "success":
            outcome = "resolved"
        elif call_successful == "failure":
            outcome = "unresolved"
        else:
            outcome = "completed"

        now = datetime.now(SP_TZ).replace(tzinfo=None)

        async with async_session() as db:
            ai_call = AICall(
                tenant_id=1,
                from_number=caller,
                to_number="inbound",
                twilio_call_sid=conversation_id,
                direction="inbound",
                status="completed",
                outcome=outcome,
                source=f"inbound_{agent_type}",
                lead_name=caller,
                campaign=f"EduFlow {agent_type.title()}",
                summary=summary_text or transcript_text[:2000],
                duration_seconds=int(duration),
                total_turns=len([t for t in transcript_list if t.get("message")]),
                started_at=now,
                ended_at=now,
            )
            db.add(ai_call)
            await db.flush()

            for turn in transcript_list:
                message = turn.get("message", "")
                if not message:
                    continue
                ai_turn = AICallTurn(
                    call_id=ai_call.id,
                    role=turn.get("role", "unknown"),
                    text=message,
                )
                db.add(ai_turn)

            await db.commit()
            print(f"✅ [INBOUND] Chamada salva: id={ai_call.id}, agent={agent_type}, duracao={duration}s, outcome={outcome}")

        return {"status": "ok", "call_id": ai_call.id}

    except Exception as e:
        print(f"❌ [INBOUND] Erro no post-call webhook: {e}")
        traceback.print_exc()
        return {"status": "error", "detail": str(e)}


# ============================================================
# 4. DASHBOARD — Métricas das chamadas inbound
# ============================================================

@router.get("/dashboard")
async def inbound_dashboard(request: Request):
    """Dashboard com métricas das chamadas inbound."""
    from sqlalchemy import func, cast, Date
    from app.voice_ai.models import AICall
    from app.auth import get_current_user

    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        return {"error": "Não autenticado"}

    days = int(request.query_params.get("days", "30"))
    cutoff = datetime.now(SP_TZ).replace(tzinfo=None) - timedelta(days=days)

    async with async_session() as db:
        base_filter = [AICall.direction == "inbound", AICall.created_at >= cutoff]

        # Total
        total_q = await db.execute(
            select(func.count(AICall.id)).where(*base_filter)
        )
        total = total_q.scalar() or 0

        # Duração média
        avg_q = await db.execute(
            select(func.avg(AICall.duration_seconds)).where(*base_filter, AICall.duration_seconds > 0)
        )
        avg_duration = round(avg_q.scalar() or 0)

        # Latência média
        lat_q = await db.execute(
            select(func.avg(AICall.avg_latency_ms)).where(*base_filter, AICall.avg_latency_ms > 0)
        )
        avg_latency = round(lat_q.scalar() or 0)

        # Por outcome
        outcome_q = await db.execute(
            select(AICall.outcome, func.count(AICall.id)).where(*base_filter).group_by(AICall.outcome)
        )
        outcomes = {row[0] or "unknown": row[1] for row in outcome_q.fetchall()}

        # Por agente
        agent_q = await db.execute(
            select(AICall.source, func.count(AICall.id)).where(*base_filter).group_by(AICall.source)
        )
        by_agent = {row[0] or "unknown": row[1] for row in agent_q.fetchall()}

        # Diário
        daily_q = await db.execute(
            select(
                cast(AICall.created_at, Date).label("date"),
                func.count(AICall.id).label("total"),
            ).where(*base_filter).group_by(cast(AICall.created_at, Date)).order_by(cast(AICall.created_at, Date))
        )
        daily = [{"date": str(row.date), "total": row.total} for row in daily_q.fetchall()]

    return {
        "period_days": days,
        "total_calls": total,
        "avg_duration_seconds": avg_duration,
        "avg_latency_ms": avg_latency,
        "outcomes": outcomes,
        "by_agent": by_agent,
        "daily": daily,
    }


# ============================================================
# 5. CALLS LIST — Lista de chamadas inbound
# ============================================================

@router.get("/calls")
async def inbound_calls(request: Request):
    """Lista chamadas inbound com paginação."""
    from sqlalchemy import func
    from app.voice_ai.models import AICall

    limit = int(request.query_params.get("limit", "50"))
    offset = int(request.query_params.get("offset", "0"))
    agent_filter = request.query_params.get("agent", "")

    async with async_session() as db:
        query = select(AICall).where(AICall.direction == "inbound").order_by(AICall.id.desc())

        if agent_filter:
            query = query.where(AICall.source == f"inbound_{agent_filter}")

        # Total
        count_q = select(func.count(AICall.id)).where(AICall.direction == "inbound")
        if agent_filter:
            count_q = count_q.where(AICall.source == f"inbound_{agent_filter}")
        total_result = await db.execute(count_q)
        total = total_result.scalar() or 0

        # Paginated
        result = await db.execute(query.limit(limit).offset(offset))
        calls = result.scalars().all()

    return {
        "total": total,
        "calls": [
            {
                "id": c.id,
                "from_number": c.from_number or "",
                "source": c.source or "",
                "status": c.status or "",
                "outcome": c.outcome or "",
                "summary": c.summary or "",
                "duration_seconds": c.duration_seconds or 0,
                "total_turns": c.total_turns or 0,
                "avg_latency_ms": c.avg_latency_ms or 0,
                "created_at": str(c.created_at) if c.created_at else "",
            }
            for c in calls
        ],
    }


# ============================================================
# 6. CALL DETAIL — Detalhes com transcrição
# ============================================================

@router.get("/calls/{call_id}")
async def inbound_call_detail(call_id: int):
    """Detalhes de uma chamada inbound com transcrição."""
    from app.voice_ai.models import AICall, AICallTurn
    from fastapi import HTTPException

    async with async_session() as db:
        result = await db.execute(select(AICall).where(AICall.id == call_id))
        call = result.scalar_one_or_none()
        if not call:
            raise HTTPException(status_code=404, detail="Chamada não encontrada")

        turns_result = await db.execute(
            select(AICallTurn).where(AICallTurn.call_id == call_id).order_by(AICallTurn.created_at)
        )
        turns = turns_result.scalars().all()

    return {
        "call": {
            "id": call.id,
            "from_number": call.from_number or "",
            "source": call.source or "",
            "status": call.status or "",
            "outcome": call.outcome or "",
            "summary": call.summary or "",
            "duration_seconds": call.duration_seconds or 0,
            "total_turns": call.total_turns or 0,
            "avg_latency_ms": call.avg_latency_ms or 0,
            "campaign": call.campaign or "",
            "created_at": str(call.created_at) if call.created_at else "",
        },
        "transcript": [
            {
                "role": t.role,
                "text": t.text,
                "timestamp": str(t.created_at) if t.created_at else "",
            }
            for t in turns
        ],
    }