"""
Rotas do módulo Voice AI - ElevenLabs.
Endpoints para disparar ligações e comparar com OpenAI Realtime.
"""
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
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