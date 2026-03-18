"""
Configurações do módulo Voice AI Inbound.
Pipeline: Twilio (WebSocket) → Whisper STT → GPT-4o → ElevenLabs TTS → Twilio
"""
import os

# === Twilio ===
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")

# === OpenAI (cérebro + STT) ===
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
LLM_MODEL = os.getenv("VOICE_INBOUND_LLM_MODEL", "gpt-4o")
LLM_TEMPERATURE = float(os.getenv("VOICE_INBOUND_LLM_TEMPERATURE", "0.3"))
LLM_MAX_TOKENS = int(os.getenv("VOICE_INBOUND_LLM_MAX_TOKENS", "500"))
STT_MODEL = os.getenv("VOICE_INBOUND_STT_MODEL", "whisper-1")
STT_LANGUAGE = "pt"

# === ElevenLabs TTS ===
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("VOICE_INBOUND_ELEVENLABS_VOICE_ID", "")
ELEVENLABS_MODEL_ID = os.getenv("VOICE_INBOUND_ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")

# === Base URL ===
BASE_URL = os.getenv("BASE_URL", "https://portal.eduflowia.com")

# === IVR (Menu de voz) ===
IVR_GREETING = os.getenv(
    "VOICE_INBOUND_IVR_GREETING",
    "Olá, bem-vindo ao EduFlow Hub. "
    "Para suporte técnico, digite 1. "
    "Para falar sobre seu plano, digite 2."
)
IVR_INVALID = os.getenv(
    "VOICE_INBOUND_IVR_INVALID",
    "Opção inválida. Por favor, digite 1 para suporte ou 2 para falar sobre seu plano."
)
IVR_TIMEOUT_SEC = int(os.getenv("VOICE_INBOUND_IVR_TIMEOUT", "10"))
IVR_MAX_RETRIES = int(os.getenv("VOICE_INBOUND_IVR_MAX_RETRIES", "2"))

# === Agentes mapeados por tecla do IVR ===
IVR_AGENT_MAP = {
    "1": "support",
    "2": "retention",
}

# === Limites de chamada ===
MAX_CALL_DURATION_SEC = int(os.getenv("VOICE_INBOUND_MAX_DURATION", "300"))  # 5 min
SILENCE_TIMEOUT_SEC = int(os.getenv("VOICE_INBOUND_SILENCE_TIMEOUT", "10"))

# === Escalação para humano ===
ESCALATION_PHONE = os.getenv("VOICE_INBOUND_ESCALATION_PHONE", "")  # Número para transferir
