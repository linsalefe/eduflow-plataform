"""
Rotas do módulo Voice AI - ElevenLabs.
Endpoints para disparar ligações, webhook e consultar histórico.
"""
from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Date
from datetime import datetime, timezone, timedelta
from app.voice_ai_elevenlabs.voice_pipeline import make_outbound_call
from app.database import get_db
from app.voice_ai.models import AICall, AICallTurn

router = APIRouter(prefix="/api/voice-ai-el", tags=["Voice AI - ElevenLabs"])

SP_TZ = timezone(timedelta(hours=-3))


class OutboundCallRequest(BaseModel):
    to_number: str
    lead_name: str
    course: str


# ============================================================
# OUTBOUND CALL
# ============================================================

@router.post("/outbound-call")
async def outbound_call(request: OutboundCallRequest):
    """Dispara uma ligação outbound via ElevenLabs Agents."""
    if not request.to_number.startswith("+"):
        raise HTTPException(status_code=400, detail="Número deve começar com + (ex: +5531999999999)")

    result = make_outbound_call(
        to_number=request.to_number,
        lead_name=request.lead_name,
        course=request.course,
    )

    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["error"])

    return result


# ============================================================
# POST-CALL WEBHOOK
# ============================================================

@router.post("/post-call-webhook")
async def post_call_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Webhook chamado pelo ElevenLabs após cada ligação.
    Salva transcrição, duração e resultado na tabela ai_calls.
    """
    try:
        payload = await request.json()
        print(f"📦 ElevenLabs webhook payload recebido")

        data = payload.get("data", {})
        metadata = data.get("metadata", {})
        analysis = data.get("analysis", {})
        phone_call = metadata.get("phone_call", {})
        initiation = data.get("conversation_initiation_client_data", {})
        dynamic_vars = initiation.get("dynamic_variables", {})
        transcript_list = data.get("transcript", [])

        # Dados do lead
        lead_name = dynamic_vars.get("nome", "")
        course = dynamic_vars.get("curso", "")
        conversation_id = data.get("conversation_id", "")
        to_number = phone_call.get("external_number", "")
        from_number = phone_call.get("agent_number", "")
        call_sid = phone_call.get("call_sid", "")
        duration = metadata.get("call_duration_secs", 0)
        termination = metadata.get("termination_reason", "")

        # Transcrição como texto
        transcript_text = ""
        for turn in transcript_list:
            role = turn.get("role", "")
            message = turn.get("message", "")
            if message:
                label = "Lead" if role == "user" else "Nat"
                transcript_text += f"{label}: {message}\n"

        # Data collection
        data_collection = analysis.get("data_collection_results", {})
        collected_fields = {}
        for key, val in data_collection.items():
            collected_fields[key.strip()] = val.get("value", "")

        # Outcome
        call_successful = analysis.get("call_successful", "unknown")
        if call_successful == "success":
            outcome = "qualified"
        elif call_successful == "failure":
            outcome = "not_qualified"
        else:
            outcome = "completed"

        # Summary
        summary_text = analysis.get("transcript_summary", "")

        now = datetime.now(SP_TZ).replace(tzinfo=None)

        # Criar registro
        ai_call = AICall(
            from_number=from_number,
            to_number=to_number,
            twilio_call_sid=call_sid,
            direction="outbound",
            status="completed",
            outcome=outcome,
            collected_fields=collected_fields if collected_fields else None,
            summary=summary_text or transcript_text[:2000],
            course=course,
            lead_name=lead_name,
            duration_seconds=int(duration),
            total_turns=len([t for t in transcript_list if t.get("message")]),
            source="elevenlabs",
            campaign=conversation_id,
            started_at=now,
            ended_at=now,
        )
        db.add(ai_call)
        await db.flush()

        # Salvar turnos
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

        print(f"✅ ElevenLabs post-call salvo: call_id={ai_call.id}, lead={lead_name}, curso={course}, duracao={duration}s, outcome={outcome}")
        print(f"📊 Campos coletados: {collected_fields}")
        return {"status": "ok", "call_id": ai_call.id}

    except Exception as e:
        print(f"❌ Erro no post-call webhook ElevenLabs: {e}")
        await db.rollback()
        return {"status": "error", "detail": str(e)}


# ============================================================
# DASHBOARD
# ============================================================

@router.get("/dashboard")
async def get_dashboard(days: int = Query(default=7), db: AsyncSession = Depends(get_db)):
    """Dashboard com métricas das ligações ElevenLabs."""
    cutoff = datetime.now(SP_TZ).replace(tzinfo=None) - timedelta(days=days)

    # Base query - só ligações ElevenLabs
    base = select(AICall).where(AICall.source == "elevenlabs", AICall.created_at >= cutoff)

    # Total e respondidas
    total_q = await db.execute(select(func.count(AICall.id)).where(AICall.source == "elevenlabs", AICall.created_at >= cutoff))
    total_calls = total_q.scalar() or 0

    answered_q = await db.execute(
        select(func.count(AICall.id)).where(
            AICall.source == "elevenlabs",
            AICall.created_at >= cutoff,
            AICall.status == "completed",
            AICall.duration_seconds > 0
        )
    )
    answered_calls = answered_q.scalar() or 0

    # Médias
    avg_q = await db.execute(
        select(
            func.avg(AICall.duration_seconds),
        ).where(AICall.source == "elevenlabs", AICall.created_at >= cutoff, AICall.duration_seconds > 0)
    )
    avg_row = avg_q.first()
    avg_duration = round(avg_row[0] or 0)

    # Outcomes
    outcome_q = await db.execute(
        select(AICall.outcome, func.count(AICall.id)).where(
            AICall.source == "elevenlabs", AICall.created_at >= cutoff
        ).group_by(AICall.outcome)
    )
    outcomes = {row[0] or "unknown": row[1] for row in outcome_q.fetchall()}

    # Daily
    daily_q = await db.execute(
        select(
            cast(AICall.created_at, Date).label("date"),
            func.count(AICall.id).label("total"),
            func.count(AICall.id).filter(AICall.outcome == "qualified").label("qualified"),
        ).where(
            AICall.source == "elevenlabs", AICall.created_at >= cutoff
        ).group_by(cast(AICall.created_at, Date)).order_by(cast(AICall.created_at, Date))
    )
    daily = [{"date": str(row.date), "total": row.total, "scheduled": 0, "qualified": row.qualified} for row in daily_q.fetchall()]

    # By course
    course_q = await db.execute(
        select(
            AICall.course,
            func.count(AICall.id).label("total"),
        ).where(
            AICall.source == "elevenlabs", AICall.created_at >= cutoff, AICall.course != ""
        ).group_by(AICall.course)
    )
    by_course = [{"course": row.course, "total": row.total, "avg_score": 0} for row in course_q.fetchall()]

    answer_rate = round((answered_calls / total_calls * 100) if total_calls > 0 else 0)

    return {
        "period_days": days,
        "total_calls": total_calls,
        "answered_calls": answered_calls,
        "answer_rate": answer_rate,
        "avg_score": 0,
        "avg_latency_ms": 0,
        "avg_duration_seconds": avg_duration,
        "outcomes": outcomes,
        "daily": daily,
        "by_course": by_course,
    }


# ============================================================
# CALLS LIST
# ============================================================

@router.get("/calls")
async def get_calls(
    limit: int = Query(default=50),
    offset: int = Query(default=0),
    outcome: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
):
    """Lista de chamadas ElevenLabs com paginação e filtro."""
    query = select(AICall).where(AICall.source == "elevenlabs").order_by(AICall.id.desc())

    if outcome:
        query = query.where(AICall.outcome == outcome)

    # Total
    count_q = select(func.count(AICall.id)).where(AICall.source == "elevenlabs")
    if outcome:
        count_q = count_q.where(AICall.outcome == outcome)
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
                "lead_name": c.lead_name or "",
                "to_number": c.to_number or "",
                "course": c.course or "",
                "status": c.status or "",
                "fsm_state": c.fsm_state or "",
                "outcome": c.outcome or "",
                "score": c.score or 0,
                "duration_seconds": c.duration_seconds or 0,
                "total_turns": c.total_turns or 0,
                "avg_latency_ms": c.avg_latency_ms or 0,
                "attempt_number": c.attempt_number or 1,
                "handoff_type": c.handoff_type or "",
                "summary": c.summary or "",
                "collected_fields": c.collected_fields or {},
                "objections": c.objections or [],
                "tags": c.tags or [],
                "started_at": str(c.started_at) if c.started_at else "",
                "ended_at": str(c.ended_at) if c.ended_at else "",
                "created_at": str(c.created_at) if c.created_at else "",
            }
            for c in calls
        ],
    }


# ============================================================
# CALL DETAIL
# ============================================================

@router.get("/calls/{call_id}")
async def get_call_detail(call_id: int, db: AsyncSession = Depends(get_db)):
    """Detalhes de uma chamada específica com transcrição."""
    result = await db.execute(select(AICall).where(AICall.id == call_id))
    call = result.scalar_one_or_none()

    if not call:
        raise HTTPException(status_code=404, detail="Chamada não encontrada")

    # Buscar turnos
    turns_result = await db.execute(
        select(AICallTurn).where(AICallTurn.call_id == call_id).order_by(AICallTurn.created_at)
    )
    turns = turns_result.scalars().all()

    return {
        "call": {
            "id": call.id,
            "lead_name": call.lead_name or "",
            "to_number": call.to_number or "",
            "course": call.course or "",
            "status": call.status or "",
            "fsm_state": call.fsm_state or "",
            "outcome": call.outcome or "",
            "score": call.score or 0,
            "duration_seconds": call.duration_seconds or 0,
            "total_turns": call.total_turns or 0,
            "avg_latency_ms": call.avg_latency_ms or 0,
            "attempt_number": call.attempt_number or 1,
            "handoff_type": call.handoff_type or "",
            "summary": call.summary or "",
            "collected_fields": call.collected_fields or {},
            "objections": call.objections or [],
            "tags": call.tags or [],
            "started_at": str(call.started_at) if call.started_at else "",
            "ended_at": str(call.ended_at) if call.ended_at else "",
            "created_at": str(call.created_at) if call.created_at else "",
            "campaign": call.campaign or "",
        },
        "transcript": [
            {
                "role": t.role,
                "text": t.text,
                "state": t.fsm_state or "",
                "latency_ms": t.total_latency_ms or 0,
                "action": t.action or "",
                "barge_in": t.barge_in or False,
                "timestamp": str(t.created_at) if t.created_at else "",
            }
            for t in turns
        ],
        "qa": None,
    }

@router.get("/calls/{call_id}/audio")
async def get_call_audio(call_id: int, db: AsyncSession = Depends(get_db)):
    """Retorna o áudio da ligação do ElevenLabs."""
    import httpx
    from app.voice_ai_elevenlabs.config import ELEVENLABS_API_KEY

    result = await db.execute(select(AICall).where(AICall.id == call_id))
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(status_code=404, detail="Chamada não encontrada")

    conversation_id = call.campaign
    if not conversation_id:
        raise HTTPException(status_code=404, detail="Sem conversation_id")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"https://api.elevenlabs.io/v1/convai/conversations/{conversation_id}/audio",
            headers={"xi-api-key": ELEVENLABS_API_KEY},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=404, detail="Áudio não encontrado")

        from fastapi.responses import Response
        return Response(
            content=resp.content,
            media_type="audio/mpeg",
            headers={"Content-Disposition": f"inline; filename=call_{call_id}.mp3"},
        )

# ============================================================
# HEALTH
# ============================================================

@router.get("/health")
async def health():
    """Verifica se o módulo ElevenLabs está configurado."""
    from app.voice_ai_elevenlabs.config import ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID
    return {
        "status": "ok",
        "provider": "elevenlabs",
        "api_key_configured": bool(ELEVENLABS_API_KEY),
        "agent_id": ELEVENLABS_AGENT_ID,
    }