"""
Configurações do módulo Voice AI - ElevenLabs.
"""
import os

# === ElevenLabs ===
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID", "agent_8201khxrydbcfxqtav8ffy0enqft")
ELEVENLABS_PHONE_NUMBER_ID = os.getenv("ELEVENLABS_PHONE_NUMBER_ID", "phnum_1901khxrxvs7ebc80097efpysx8k")

# === Twilio (reutiliza do voice_ai) ===
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")

# === Base URL do servidor ===
BASE_URL = os.getenv("BASE_URL", "https://portal.eduflowia.com")

# === Webhook ===
ELEVENLABS_WEBHOOK_SECRET = os.getenv("ELEVENLABS_WEBHOOK_SECRET", "")