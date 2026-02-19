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
        data = await request.json()

        # Extrair dados do payload ElevenLabs
        conversation_id = data.get("conversation_id", "")
        agent_id = data.get("agent_id", "")
        status = data.get("status", "completed")
        transcript = data.get("transcript", [])
        metadata = data.get("metadata", {})
        analysis = data.get("analysis", {})
        call_duration = data.get("call_duration_secs", 0)

        # Extrair número do lead dos metadata
        to_number = metadata.get("to_number", "")
        from_number = metadata.get("from_number", "")

        # Montar transcrição como texto
        transcript_text = ""
        for turn in transcript:
            role = turn.get("role", "")
            text = turn.get("message", "")
            transcript_text += f"{'Lead' if role == 'user' else 'Nat'}: {text}\n"

        # Extrair dados coletados e resultado da analysis
        collected_fields = analysis.get("data_collection", {})
        evaluation = analysis.get("evaluation", {})

        # Determinar outcome
        outcome = "completed"
        if evaluation:
            eval_result = evaluation.get("solved_user_inquiry", "unknown")
            if eval_result == "success":
                outcome = "qualified"
            elif eval_result == "failure":
                outcome = "not_qualified"

        now = datetime.now(SP_TZ).replace(tzinfo=None)

        # Criar registro na tabela ai_calls
        ai_call = AICall(
            from_number=from_number,
            to_number=to_number,
            direction="outbound",
            status=status,
            outcome=outcome,
            collected_fields=collected_fields if collected_fields else None,
            summary=transcript_text[:2000] if transcript_text else None,
            course=metadata.get("course", ""),
            lead_name=metadata.get("lead_name", ""),
            duration_seconds=int(call_duration),
            total_turns=len(transcript),
            source="elevenlabs",
            campaign=conversation_id,
            started_at=now,
            ended_at=now,
        )
        db.add(ai_call)
        await db.flush()

        # Salvar cada turno da conversa
        for turn in transcript:
            ai_turn = AICallTurn(
                call_id=ai_call.id,
                role=turn.get("role", "unknown"),
                text=turn.get("message", ""),
            )
            db.add(ai_turn)

        await db.commit()

        print(f"✅ ElevenLabs post-call salvo: call_id={ai_call.id}, conversation={conversation_id}")
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