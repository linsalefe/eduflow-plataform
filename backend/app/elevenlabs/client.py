import os
import httpx
import base64

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "ZxhW0J5Q17DnNxZM6VDC")

async def text_to_audio_base64(text: str) -> str | None:
    """Converte texto em áudio via ElevenLabs e retorna base64."""
    if not ELEVENLABS_API_KEY:
        return None

    print(f"[ElevenLabs] Usando voice_id: {ELEVENLABS_VOICE_ID}")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code == 200:
                return base64.b64encode(response.content).decode("utf-8")
            else:
                print(f"[ElevenLabs] Erro {response.status_code}: {response.text}")
                return None
    except Exception as e:
        print(f"[ElevenLabs] Exceção: {e}")
        return None