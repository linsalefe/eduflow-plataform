"""
Pipeline de Voz Inbound — Twilio ↔ Whisper STT ↔ GPT-4o ↔ ElevenLabs TTS.

Fluxo:
  1. Twilio envia áudio (g711_ulaw 8kHz) via WebSocket
  2. VAD detecta fim de fala → buffer enviado ao Whisper (STT)
  3. Texto transcrito → GPT-4o gera resposta (com contexto + RAG)
  4. Resposta texto → ElevenLabs TTS (streaming ulaw_8000)
  5. Áudio TTS → relay de volta ao Twilio

Projetado para agentes inbound (suporte, retenção, etc).
"""
import asyncio
import audioop
import base64
import io
import json
import struct
import time
import traceback
import wave
from datetime import datetime
from typing import Optional

import httpx
from openai import AsyncOpenAI

from app.voice_ai_inbound.config import (
    OPENAI_API_KEY,
    LLM_MODEL,
    LLM_TEMPERATURE,
    LLM_MAX_TOKENS,
    STT_MODEL,
    STT_LANGUAGE,
    ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID,
    ELEVENLABS_MODEL_ID,
    MAX_CALL_DURATION_SEC,
    SILENCE_TIMEOUT_SEC,
)

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)


# ============================================================
# PIPELINE PRINCIPAL
# ============================================================

class InboundVoicePipeline:
    """
    Pipeline de voz inbound.
    Gerencia uma chamada completa: STT → LLM → TTS em loop.
    """

    def __init__(self, agent_config: dict):
        """
        agent_config vem da tabela voice_agents:
          - system_prompt, greeting_text, llm_model, llm_temperature,
            llm_max_tokens, elevenlabs_voice_id, elevenlabs_model_id,
            max_duration_sec, silence_timeout_sec, can_escalate, etc.
        """
        self.agent = agent_config
        self.stream_sid: Optional[str] = None
        self.twilio_ws = None
        self.call_sid: str = ""
        self.caller: str = ""

        # Conversa (histórico pro GPT-4o)
        self.messages: list = []
        self._init_system_prompt()

        # Buffer de áudio do usuário (mulaw bytes)
        self.audio_buffer = bytearray()
        self.last_audio_time = 0.0
        self.is_speaking = False
        self.speech_started = False

        # Controle
        self.call_start_time = 0.0
        self._call_ended = False
        self._processing = False  # Evita processar enquanto já está processando

        # Métricas
        self.total_turns = 0
        self.latencies: list = []
        self.transcript: list = []  # [{"role": "user"|"assistant", "text": "..."}]

        # Config do agente (com fallbacks)
        self.voice_id = agent_config.get("elevenlabs_voice_id") or ELEVENLABS_VOICE_ID
        self.model_id = agent_config.get("elevenlabs_model_id") or ELEVENLABS_MODEL_ID
        self.llm_model = agent_config.get("llm_model") or LLM_MODEL
        self.llm_temp = (agent_config.get("llm_temperature") or 30) / 100  # 30 → 0.3
        self.llm_max_tokens = agent_config.get("llm_max_tokens") or LLM_MAX_TOKENS
        self.max_duration = agent_config.get("max_duration_sec") or MAX_CALL_DURATION_SEC
        self.silence_timeout = agent_config.get("silence_timeout_sec") or SILENCE_TIMEOUT_SEC

        # VAD config
        self.SILENCE_THRESHOLD = 500      # Energia mínima pra considerar fala
        self.SILENCE_DURATION_MS = 1200   # 1.2s de silêncio = fim de fala
        self.MIN_SPEECH_MS = 300          # Mínimo de fala pra considerar válido

    def _init_system_prompt(self):
        """Inicializa o histórico com o system prompt do agente."""
        prompt = self.agent.get("system_prompt", "Você é um assistente de suporte.")
        self.messages = [{"role": "system", "content": prompt}]

    # ============================================================
    # ENTRY POINT
    # ============================================================

    async def handle_websocket(self, twilio_ws):
        """Handler principal — recebe o WebSocket do Twilio."""
        self.twilio_ws = twilio_ws
        self.call_start_time = time.time()
        self.last_audio_time = time.time()

        print(f"🎙️ [INBOUND] Pipeline iniciado | agent={self.agent.get('slug')} | call_sid={self.call_sid}")

        try:
            # Loop principal: recebe pacotes do Twilio
            async for message in twilio_ws.iter_text():
                if self._call_ended:
                    break

                data = json.loads(message)
                event = data.get("event")

                if event == "media":
                    await self._handle_audio(data)

                elif event == "start":
                    info = data.get("start", {})
                    self.stream_sid = info.get("streamSid")
                    print(f"▶️ [INBOUND] Stream Twilio iniciado: {self.stream_sid}")

                elif event == "stop":
                    print(f"⏹️ [INBOUND] Stream parado (cliente desligou)")
                    break

                # Timeout da chamada
                if time.time() - self.call_start_time > self.max_duration:
                    print(f"⏰ [INBOUND] Timeout ({self.max_duration}s)")
                    await self._say_and_hangup("Nosso tempo acabou. Obrigado por ligar!")
                    break

        except Exception as e:
            print(f"❌ [INBOUND] Erro no pipeline: {e}")
            traceback.print_exc()
        finally:
            self._call_ended = True

        print(f"🏁 [INBOUND] Pipeline finalizado | turns={self.total_turns} | duracao={int(time.time()-self.call_start_time)}s")

    # ============================================================
    # AUDIO HANDLING + VAD
    # ============================================================

    async def _handle_audio(self, data: dict):
        """Processa chunk de áudio do Twilio. Detecta fala/silêncio."""
        payload = data.get("media", {}).get("payload", "")
        if not payload:
            return

        # Decodificar base64 → mulaw bytes
        audio_bytes = base64.b64decode(payload)

        # Calcular energia do chunk (RMS)
        try:
            linear = audioop.ulaw2lin(audio_bytes, 2)
            rms = audioop.rms(linear, 2)
        except Exception:
            rms = 0

        now = time.time()

        if rms > self.SILENCE_THRESHOLD:
            # Está falando
            if not self.is_speaking:
                self.is_speaking = True
                self.speech_started = True
                self.audio_buffer = bytearray()  # Reset buffer
                print(f"🗣️ [INBOUND] Fala detectada (rms={rms})")

            self.audio_buffer.extend(audio_bytes)
            self.last_audio_time = now

        elif self.is_speaking:
            # Silêncio após fala
            self.audio_buffer.extend(audio_bytes)  # Inclui silêncio no buffer
            silence_ms = (now - self.last_audio_time) * 1000

            if silence_ms >= self.SILENCE_DURATION_MS and not self._processing:
                # Fim de fala detectado
                speech_ms = len(self.audio_buffer) / 8  # 8 bytes/ms em 8kHz mulaw
                if speech_ms >= self.MIN_SPEECH_MS:
                    self.is_speaking = False
                    await self._process_speech()
                else:
                    # Muito curto, descarta
                    self.is_speaking = False
                    self.audio_buffer = bytearray()

    # ============================================================
    # STT → LLM → TTS
    # ============================================================

    async def _process_speech(self):
        """Pipeline completo: transcreve → pensa → fala."""
        if self._processing or len(self.audio_buffer) == 0:
            return

        self._processing = True
        t0 = time.perf_counter()

        try:
            # 1. WHISPER STT
            user_text = await self._transcribe(bytes(self.audio_buffer))
            t_stt = time.perf_counter()
            self.audio_buffer = bytearray()  # Limpa buffer

            if not user_text or len(user_text.strip()) < 2:
                print(f"🔇 [INBOUND] Transcrição vazia, ignorando")
                return

            stt_ms = int((t_stt - t0) * 1000)
            print(f"📝 [INBOUND] STT ({stt_ms}ms): {user_text}")

            # Salvar no histórico
            self.messages.append({"role": "user", "content": user_text})
            self.transcript.append({"role": "user", "text": user_text})

            # 2. GPT-4o
            assistant_text = await self._think(user_text)
            t_llm = time.perf_counter()
            llm_ms = int((t_llm - t_stt) * 1000)

            if not assistant_text:
                print(f"⚠️ [INBOUND] GPT-4o retornou vazio")
                return

            print(f"🤖 [INBOUND] LLM ({llm_ms}ms): {assistant_text[:100]}...")

            # Salvar no histórico
            self.messages.append({"role": "assistant", "content": assistant_text})
            self.transcript.append({"role": "assistant", "text": assistant_text})

            # 3. ELEVENLABS TTS → TWILIO
            await self._speak(assistant_text)
            t_tts = time.perf_counter()
            tts_ms = int((t_tts - t_llm) * 1000)

            total_ms = int((t_tts - t0) * 1000)
            self.latencies.append(total_ms)
            self.total_turns += 1

            print(f"⏱️ [INBOUND] Turn #{self.total_turns}: STT={stt_ms}ms LLM={llm_ms}ms TTS={tts_ms}ms TOTAL={total_ms}ms")

        except Exception as e:
            print(f"❌ [INBOUND] Erro no _process_speech: {e}")
            traceback.print_exc()
        finally:
            self._processing = False

    # ============================================================
    # WHISPER STT
    # ============================================================

    async def _transcribe(self, mulaw_bytes: bytes) -> str:
        """Converte mulaw bytes → WAV → envia ao Whisper → retorna texto."""
        try:
            # Converter mulaw → PCM linear 16-bit
            pcm_data = audioop.ulaw2lin(mulaw_bytes, 2)

            # Criar WAV em memória
            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)  # 16-bit
                wf.setframerate(8000)
                wf.writeframes(pcm_data)

            wav_buffer.seek(0)
            wav_buffer.name = "audio.wav"

            # Enviar ao Whisper
            response = await openai_client.audio.transcriptions.create(
                model=STT_MODEL,
                file=wav_buffer,
                language=STT_LANGUAGE,
                response_format="text",
            )

            return response.strip() if response else ""

        except Exception as e:
            print(f"❌ [INBOUND] Whisper STT erro: {e}")
            return ""

    # ============================================================
    # GPT-4o (CÉREBRO)
    # ============================================================

    async def _think(self, user_text: str) -> str:
        """Envia conversa ao GPT-4o e retorna a resposta."""
        try:
            response = await openai_client.chat.completions.create(
                model=self.llm_model,
                messages=self.messages,
                temperature=self.llm_temp,
                max_tokens=self.llm_max_tokens,
            )

            content = response.choices[0].message.content
            return content.strip() if content else ""

        except Exception as e:
            print(f"❌ [INBOUND] GPT-4o erro: {e}")
            return "Desculpe, tive um problema. Pode repetir?"

    # ============================================================
    # ELEVENLABS TTS (STREAMING)
    # ============================================================

    async def _speak(self, text: str):
        """Converte texto em áudio via ElevenLabs streaming e envia ao Twilio."""
        if not text or not self.stream_sid:
            return

        try:
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}/stream"
            headers = {
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
            }
            payload = {
                "text": text,
                "model_id": self.model_id,
                "output_format": "ulaw_8000",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.8,
                    "style": 0.0,
                    "use_speaker_boost": True,
                },
            }

            async with httpx.AsyncClient(timeout=15.0) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as resp:
                    if resp.status_code != 200:
                        err = await resp.aread()
                        print(f"❌ [INBOUND] ElevenLabs TTS erro {resp.status_code}: {err[:200]}")
                        return

                    # Streaming: envia cada chunk direto pro Twilio
                    async for chunk in resp.aiter_bytes(1024):
                        if self._call_ended:
                            break
                        if chunk:
                            b64_audio = base64.b64encode(chunk).decode("utf-8")
                            media_msg = {
                                "event": "media",
                                "streamSid": self.stream_sid,
                                "media": {"payload": b64_audio},
                            }
                            try:
                                await self.twilio_ws.send_text(json.dumps(media_msg))
                            except Exception:
                                break

        except Exception as e:
            print(f"❌ [INBOUND] ElevenLabs TTS erro: {e}")
            traceback.print_exc()

    # ============================================================
    # HELPERS
    # ============================================================

    async def _say_and_hangup(self, text: str):
        """Fala uma mensagem final e encerra."""
        await self._speak(text)
        self.transcript.append({"role": "assistant", "text": text})
        # Pequeno delay pra garantir que o áudio chegou
        await asyncio.sleep(1.0)
        self._call_ended = True

    def get_summary(self) -> dict:
        """Retorna resumo da chamada para persistência."""
        avg_latency = int(sum(self.latencies) / len(self.latencies)) if self.latencies else 0
        duration = int(time.time() - self.call_start_time) if self.call_start_time else 0

        return {
            "call_sid": self.call_sid,
            "caller": self.caller,
            "agent_slug": self.agent.get("slug", ""),
            "agent_name": self.agent.get("name", ""),
            "total_turns": self.total_turns,
            "duration_seconds": duration,
            "avg_latency_ms": avg_latency,
            "transcript": self.transcript,
            "messages": self.messages[1:],  # Sem o system prompt
        }
