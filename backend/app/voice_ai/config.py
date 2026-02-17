"""
Configurações do módulo Voice AI.
"""
import os

# === Twilio ===
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")
TWILIO_MEDIA_STREAM_URL = os.getenv("TWILIO_MEDIA_STREAM_URL", "")  # wss://seu-server/api/voice-ai/stream

# === OpenAI ===
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
LLM_MODEL = os.getenv("VOICE_AI_LLM_MODEL", "gpt-4o")
LLM_TEMPERATURE = float(os.getenv("VOICE_AI_LLM_TEMPERATURE", "0.4"))
LLM_MAX_TOKENS = int(os.getenv("VOICE_AI_LLM_MAX_TOKENS", "300"))

# === STT (Speech-to-Text) ===
STT_PROVIDER = os.getenv("VOICE_AI_STT_PROVIDER", "openai")  # openai | deepgram | google
STT_MODEL = os.getenv("VOICE_AI_STT_MODEL", "whisper-1")
STT_LANGUAGE = "pt-BR"
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")

# === TTS (Text-to-Speech) ===
TTS_PROVIDER = os.getenv("VOICE_AI_TTS_PROVIDER", "openai")  # openai | elevenlabs
TTS_MODEL = os.getenv("VOICE_AI_TTS_MODEL", "tts-1")
TTS_VOICE = os.getenv("VOICE_AI_TTS_VOICE", "nova")  # nova = feminina BR natural
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "")

# === FSM ===
FSM_MAX_QUALIFY_RETRIES = 3
FSM_SILENCE_TIMEOUT_SEC = 8
FSM_MAX_CALL_DURATION_SEC = 300  # 5 minutos máx por ligação
FSM_BARGE_IN_THRESHOLD_MS = 200  # ms de fala do lead pra interromper TTS

# === Campos obrigatórios por estado ===
REQUIRED_FIELDS = {
    "OPENING": [],
    "CONTEXT": ["confirmed_interest"],
    "QUALIFY": ["objetivo", "prazo", "disponibilidade", "forma_pagamento"],
    "HANDLE_OBJECTION": [],
    "SCHEDULE": ["data_agendamento", "hora_agendamento"],
    "WARM_TRANSFER": ["handoff_reason"],
    "FOLLOW_UP": [],
    "CLOSE": [],
}

# === Score ===
SCORE_WEIGHTS = {
    "confirmed_interest": 20,
    "objetivo": 15,
    "prazo": 15,
    "disponibilidade": 15,
    "forma_pagamento": 20,
    "sem_objecao": 15,
}

# === Base URL do servidor (para Twilio callbacks) ===
BASE_URL = os.getenv("BASE_URL", "https://seu-dominio.ngrok-free.app")

# === WhatsApp ===
WHATSAPP_FOLLOWUP_ENABLED = os.getenv("WHATSAPP_FOLLOWUP_ENABLED", "true").lower() == "true"

# === Retry ===
MAX_CALL_RETRIES = 3
RETRY_DELAY_MINUTES = [5, 30, 120]  # 5min, 30min, 2h
