"""
Rotas do módulo Voice AI - ElevenLabs.
Endpoints para disparar ligações e comparar com OpenAI Realtime.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.voice_ai_elevenlabs.voice_pipeline import make_outbound_call

router = APIRouter(prefix="/api/voice-ai-el", tags=["Voice AI - ElevenLabs"])


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