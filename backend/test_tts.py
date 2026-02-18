"""
Teste rápido para verificar se o TTS da OpenAI está funcionando.
Rode com: python test_tts.py

Se este teste falhar, a IA nunca vai falar nas ligações.
"""
import asyncio
import os
from openai import AsyncOpenAI


async def test_tts():
    api_key = os.getenv("OPENAI_API_KEY", "")
    
    if not api_key:
        print("❌ OPENAI_API_KEY não está configurada!")
        print("   Configure com: export OPENAI_API_KEY='sk-...'")
        return False

    print(f"🔑 API Key: {api_key[:8]}...{api_key[-4:]}")
    
    client = AsyncOpenAI(api_key=api_key)
    
    # Teste 1: TTS
    print("\n📢 Testando TTS (text-to-speech)...")
    try:
        response = await client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input="Olá, aqui é a Nat! Tudo bem com você?",
            response_format="pcm",
            speed=1.0,
        )
        pcm_data = response.content
        duration = len(pcm_data) / (24000 * 2)  # 24kHz, 16-bit
        print(f"✅ TTS OK! Recebeu {len(pcm_data)} bytes ({duration:.1f}s de áudio)")
    except Exception as e:
        print(f"❌ TTS FALHOU: {e}")
        return False

    # Teste 2: STT
    print("\n🎙️ Testando STT (speech-to-text)...")
    try:
        import io
        import struct
        
        # Criar um WAV fake com silêncio para testar se a API aceita
        wav_buffer = io.BytesIO()
        sample_rate = 8000
        duration_s = 1
        num_samples = sample_rate * duration_s
        
        wav_buffer.write(b'RIFF')
        data_size = num_samples * 2
        wav_buffer.write(struct.pack('<I', 36 + data_size))
        wav_buffer.write(b'WAVE')
        wav_buffer.write(b'fmt ')
        wav_buffer.write(struct.pack('<I', 16))
        wav_buffer.write(struct.pack('<H', 1))  # PCM
        wav_buffer.write(struct.pack('<H', 1))  # mono
        wav_buffer.write(struct.pack('<I', sample_rate))
        wav_buffer.write(struct.pack('<I', sample_rate * 2))
        wav_buffer.write(struct.pack('<H', 2))
        wav_buffer.write(struct.pack('<H', 16))
        wav_buffer.write(b'data')
        wav_buffer.write(struct.pack('<I', data_size))
        wav_buffer.write(b'\x00' * data_size)
        
        audio_file = io.BytesIO(wav_buffer.getvalue())
        audio_file.name = "test.wav"
        
        response = await client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language="pt",
            response_format="text",
        )
        print(f"✅ STT OK! (resposta: '{response.strip() or '[silêncio]'}')")
    except Exception as e:
        print(f"❌ STT FALHOU: {e}")
        return False

    print("\n🎉 Todos os testes passaram! O TTS/STT está funcionando.")
    return True


async def test_config():
    """Verifica configurações necessárias."""
    print("=" * 50)
    print("🔍 VERIFICAÇÃO DE CONFIGURAÇÃO")
    print("=" * 50)
    
    configs = {
        "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY", ""),
        "TWILIO_ACCOUNT_SID": os.getenv("TWILIO_ACCOUNT_SID", ""),
        "TWILIO_AUTH_TOKEN": os.getenv("TWILIO_AUTH_TOKEN", ""),
        "TWILIO_PHONE_NUMBER": os.getenv("TWILIO_PHONE_NUMBER", ""),
        "BASE_URL": os.getenv("BASE_URL", ""),
    }
    
    all_ok = True
    for key, value in configs.items():
        if not value:
            print(f"  ❌ {key} → NÃO CONFIGURADA")
            all_ok = False
        elif "seu-dominio" in value or "example" in value:
            print(f"  ⚠️ {key} → Valor placeholder! ({value})")
            all_ok = False
        else:
            masked = value[:6] + "..." + value[-4:] if len(value) > 10 else "***"
            print(f"  ✅ {key} → {masked}")
    
    if not all_ok:
        print("\n⚠️ Algumas configurações precisam ser corrigidas!")
    else:
        print("\n✅ Todas as configurações estão presentes.")
    
    return all_ok


if __name__ == "__main__":
    asyncio.run(test_config())
    print()
    asyncio.run(test_tts())