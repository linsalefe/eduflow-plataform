"""
Pipeline de voz simplificado usando ElevenLabs Agents.
Diferente do OpenAI Realtime (500+ linhas de relay), aqui o ElevenLabs gerencia tudo.
"""
from elevenlabs import ElevenLabs
from app.voice_ai_elevenlabs.config import (
    ELEVENLABS_API_KEY,
    ELEVENLABS_AGENT_ID,
    ELEVENLABS_PHONE_NUMBER_ID,
)


client = ElevenLabs(api_key=ELEVENLABS_API_KEY)


def make_outbound_call(to_number: str, lead_name: str, course: str) -> dict:
    """
    Dispara ligação outbound via ElevenLabs Agents + Twilio.
    O ElevenLabs gerencia toda a conversa (STT → LLM → TTS).
    """
    try:
        result = client.conversational_ai.twilio.outbound_call(
            agent_id=ELEVENLABS_AGENT_ID,
            agent_phone_number_id=ELEVENLABS_PHONE_NUMBER_ID,
            to_number=to_number,
            conversation_initiation_client_data={
                "dynamic_variables": {
                    "nome": lead_name,
                    "curso": course,
                }
            },
        )
        return {
            "success": True,
            "data": result,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }