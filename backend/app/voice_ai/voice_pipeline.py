"""
Pipeline de Voz em Tempo Real.
Gerencia o WebSocket do Twilio Media Streams:
  1. Recebe áudio do lead (mulaw 8kHz)
  2. STT streaming → texto
  3. Envia texto ao LLM (via llm_contract)
  4. TTS streaming → áudio
  5. Envia áudio de volta ao Twilio
  6. Barge-in: se lead falar durante TTS, interrompe.

Compatível com Twilio Media Streams bidirecionais.
"""
import asyncio
import base64
import json
import time
import io
import struct
from typing import Optional
from datetime import datetime

from openai import AsyncOpenAI
from app.voice_ai.config import (
    OPENAI_API_KEY, STT_MODEL, TTS_MODEL, TTS_VOICE,
    FSM_BARGE_IN_THRESHOLD_MS, FSM_SILENCE_TIMEOUT_SEC,
    FSM_MAX_CALL_DURATION_SEC, DEEPGRAM_API_KEY, STT_PROVIDER, TTS_PROVIDER,
)
from app.voice_ai.fsm import FSMEngine, CallSession, State
from app.voice_ai.llm_contract import call_llm, generate_call_summary

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)


class AudioBuffer:
    """Acumula áudio do lead para enviar ao STT em chunks."""

    def __init__(self, silence_threshold_ms: int = 800):
        self.buffer = bytearray()
        self.last_audio_ts = time.time()
        self.silence_threshold = silence_threshold_ms / 1000
        self.is_speaking = False
        self.has_data = False

    def add_audio(self, payload: bytes):
        """Adiciona chunk de áudio ao buffer."""
        self.buffer.extend(payload)
        self.last_audio_ts = time.time()
        self.has_data = True

        # Detectar se tem energia (VAD simples)
        if len(payload) > 0:
            # Mulaw: valores próximos de 0xFF ou 0x7F = silêncio
            energy = sum(abs(b - 128) for b in payload) / len(payload)
            self.is_speaking = energy > 10  # threshold simples

    def is_silence(self) -> bool:
        """Verifica se o lead parou de falar (silêncio detectado)."""
        return (time.time() - self.last_audio_ts) > self.silence_threshold

    def get_and_clear(self) -> bytes:
        """Retorna o áudio acumulado e limpa o buffer."""
        data = bytes(self.buffer)
        self.buffer = bytearray()
        self.has_data = False
        return data

    def clear(self):
        """Limpa o buffer."""
        self.buffer = bytearray()
        self.has_data = False


class VoicePipeline:
    """
    Pipeline de voz em tempo real para uma chamada.
    Cada chamada ativa tem uma instância desta classe.
    """

    def __init__(self, session: CallSession, fsm: FSMEngine):
        self.session = session
        self.fsm = fsm
        self.audio_buffer = AudioBuffer()
        self.stream_sid: Optional[str] = None
        self.websocket = None

        # Controle de barge-in
        self.is_speaking_tts = False
        self.tts_task: Optional[asyncio.Task] = None

        # Métricas
        self.call_start_time = time.time()
        self.latencies = []

        # RAG & Policies (injetados externamente)
        self.rag_snippets = []
        self.policies = {}

    async def handle_websocket(self, websocket):
        """
        Handler principal do WebSocket do Twilio Media Streams.
        Processa mensagens bidirecionais.
        """
        self.websocket = websocket
        self.call_start_time = time.time()
        self.session.started_at = datetime.utcnow()

        # Enviar greeting inicial
        await self._send_greeting()

        # Loop principal de processamento
        try:
            async for message in websocket.iter_text():
                data = json.loads(message)
                event = data.get("event")

                if event == "connected":
                    print(f"🔌 Media Stream conectado: {data.get('streamSid')}")
                    self.stream_sid = data.get("streamSid")

                elif event == "start":
                    print(f"▶️ Stream iniciado: {data.get('start', {}).get('callSid')}")

                elif event == "media":
                    # Áudio do lead chegando
                    await self._handle_incoming_audio(data["media"])

                elif event == "stop":
                    print(f"⏹️ Stream parado")
                    break

        except Exception as e:
            print(f"❌ Erro no WebSocket: {e}")
        finally:
            await self._finalize_call()

    async def _handle_incoming_audio(self, media_data: dict):
        """Processa áudio recebido do lead."""
        payload = base64.b64decode(media_data["payload"])
        self.audio_buffer.add_audio(payload)

        # Barge-in: se o lead falar durante TTS, interromper
        if self.is_speaking_tts and self.audio_buffer.is_speaking:
            await self._handle_barge_in()

        # Verificar timeout da chamada
        elapsed = time.time() - self.call_start_time
        if elapsed > FSM_MAX_CALL_DURATION_SEC:
            await self._timeout_call()
            return

        # Quando detectar silêncio (lead parou de falar), processar
        if self.audio_buffer.has_data and self.audio_buffer.is_silence():
            if not self.is_speaking_tts:
                await self._process_utterance()

    async def _process_utterance(self):
        """Processa a fala completa do lead: STT → LLM → TTS."""
        audio_data = self.audio_buffer.get_and_clear()
        if len(audio_data) < 1600:  # Menos que 100ms de áudio, ignorar
            return

        t_start = time.time()

        # === 1. STT: áudio → texto ===
        t_stt_start = time.time()
        text = await self._speech_to_text(audio_data)
        stt_latency = int((time.time() - t_stt_start) * 1000)

        if not text or text.strip() == "":
            return

        print(f"🎙️ Lead disse: {text}")

        # Registrar turno do lead
        self.fsm.add_turn("user", text)

        # === 2. LLM: texto → decisão + resposta ===
        t_llm_start = time.time()
        llm_response = await call_llm(
            self.session, text,
            rag_snippets=self.rag_snippets,
            policies=self.policies,
        )
        llm_latency = int((time.time() - t_llm_start) * 1000)

        print(f"🤖 IA decidiu: action={llm_response['action']}, say={llm_response['say'][:60]}...")

        # === 3. Processar ação do LLM ===
        await self._process_llm_action(llm_response)

        # === 4. TTS: texto → áudio ===
        say_text = llm_response["say"]
        if llm_response.get("ask"):
            say_text += f" {llm_response['ask']}"

        t_tts_start = time.time()
        await self._text_to_speech(say_text)
        tts_latency = int((time.time() - t_tts_start) * 1000)

        # Registrar turno da IA
        self.fsm.add_turn("assistant", say_text)

        # Métricas
        total_latency = int((time.time() - t_start) * 1000)
        self.latencies.append({
            "stt": stt_latency,
            "llm": llm_latency,
            "tts": tts_latency,
            "total": total_latency,
        })
        print(f"⏱️ Latência: STT={stt_latency}ms, LLM={llm_latency}ms, TTS={tts_latency}ms, Total={total_latency}ms")

        # Se a ação é encerrar, fechar
        if llm_response["action"] == "end_call":
            await asyncio.sleep(2)  # Esperar TTS terminar
            await self._finalize_call()

    async def _process_llm_action(self, llm_response: dict):
        """Processa a ação decidida pelo LLM e atualiza a FSM."""
        action = llm_response["action"]

        # Atualizar campos coletados
        if llm_response.get("fields_update"):
            self.fsm.update_fields(llm_response["fields_update"])

        # Registrar objeção
        if llm_response.get("objection_detected"):
            self.fsm.add_objection(llm_response["objection_detected"])

        # Transição de estado
        if action != "continue":
            target_state = self.fsm.get_next_action(action)
            if target_state != self.session.state:
                self.fsm.transition(target_state)
                print(f"🔄 FSM: {self.session.previous_state} → {self.session.state}")

    async def _speech_to_text(self, audio_data: bytes) -> str:
        """Converte áudio (mulaw 8kHz) para texto usando STT."""
        try:
            # Converter mulaw para WAV para a API do OpenAI
            wav_data = self._mulaw_to_wav(audio_data)

            # Usar OpenAI Whisper
            audio_file = io.BytesIO(wav_data)
            audio_file.name = "audio.wav"

            response = await openai_client.audio.transcriptions.create(
                model=STT_MODEL,
                file=audio_file,
                language="pt",
                response_format="text",
            )
            return response.strip() if response else ""

        except Exception as e:
            print(f"❌ Erro STT: {e}")
            return ""

    async def _text_to_speech(self, text: str):
        """Converte texto para áudio e envia via WebSocket."""
        if not text or not self.websocket or not self.stream_sid:
            return

        self.is_speaking_tts = True

        try:
            # Gerar áudio com OpenAI TTS
            response = await openai_client.audio.speech.create(
                model=TTS_MODEL,
                voice=TTS_VOICE,
                input=text,
                response_format="pcm",  # Raw PCM 24kHz 16-bit
                speed=1.0,
            )

            # Converter PCM 24kHz → mulaw 8kHz para Twilio
            pcm_data = response.content
            mulaw_data = self._pcm_to_mulaw(pcm_data)

            # Enviar em chunks de 20ms (160 bytes em mulaw 8kHz)
            chunk_size = 160
            for i in range(0, len(mulaw_data), chunk_size):
                if not self.is_speaking_tts:
                    break  # Barge-in interrompeu

                chunk = mulaw_data[i:i + chunk_size]
                payload = base64.b64encode(chunk).decode("utf-8")

                media_message = {
                    "event": "media",
                    "streamSid": self.stream_sid,
                    "media": {
                        "payload": payload,
                    },
                }
                await self.websocket.send_text(json.dumps(media_message))

                # Simular timing real (20ms por chunk)
                await asyncio.sleep(0.02)

        except Exception as e:
            print(f"❌ Erro TTS: {e}")
        finally:
            self.is_speaking_tts = False

    async def _handle_barge_in(self):
        """Interrompe o TTS quando o lead começa a falar."""
        print("🛑 Barge-in detectado! Interrompendo TTS...")
        self.is_speaking_tts = False

        # Enviar clear message para Twilio parar de tocar áudio
        if self.websocket and self.stream_sid:
            clear_message = {
                "event": "clear",
                "streamSid": self.stream_sid,
            }
            await self.websocket.send_text(json.dumps(clear_message))

    async def _send_greeting(self):
        """Envia a saudação inicial da chamada."""
        greeting = f"Oi, {self.session.lead_name}! Tudo bem? Aqui é a Nat. Vi que você se interessou pelo nosso curso. Posso falar rapidinho com você?"

        # Personalizar greeting se tiver script
        if hasattr(self, 'script') and self.script and self.script.opening_text:
            greeting = self.script.opening_text.replace("{nome}", self.session.lead_name).replace("{curso}", self.session.course)

        self.fsm.add_turn("assistant", greeting)
        await asyncio.sleep(0.5)  # Pequena pausa antes de falar
        await self._text_to_speech(greeting)

    async def _timeout_call(self):
        """Encerra a chamada por timeout."""
        timeout_msg = f"Obrigada pelo seu tempo, {self.session.lead_name}! Vou te enviar mais informações por WhatsApp. Até mais!"
        self.fsm.add_turn("assistant", timeout_msg)
        await self._text_to_speech(timeout_msg)
        self.fsm.transition(State.CLOSE)
        self.session.tags.append("timeout")

    async def _finalize_call(self):
        """Finaliza a chamada: gera resumo, calcula score, prepara dados."""
        self.session.is_active = False

        # Calcular métricas
        avg_latency = 0
        if self.latencies:
            avg_latency = int(sum(l["total"] for l in self.latencies) / len(self.latencies))

        # Gerar resumo
        summary = await generate_call_summary(self.session)

        # Resultado final
        outcome = self.fsm.determine_outcome()
        score, breakdown = self.session.calculate_score()

        print(f"📋 Chamada finalizada: outcome={outcome}, score={score}, turnos={self.session.turn_count}")

        # Esses dados serão lidos pelo route handler para salvar no DB
        self.final_data = {
            "outcome": outcome,
            "score": score,
            "score_breakdown": breakdown,
            "collected_fields": self.session.collected_fields,
            "objections": self.session.objections,
            "tags": self.session.tags,
            "summary": summary,
            "total_turns": self.session.turn_count,
            "avg_latency_ms": avg_latency,
            "duration_seconds": int(time.time() - self.call_start_time),
            "handoff_type": self._get_handoff_type(),
        }

    def _get_handoff_type(self) -> Optional[str]:
        """Retorna o tipo de handoff baseado no estado final."""
        state_to_handoff = {
            State.SCHEDULE: "schedule",
            State.WARM_TRANSFER: "warm_transfer",
            State.FOLLOW_UP: "follow_up",
        }
        return state_to_handoff.get(self.session.state)

    @staticmethod
    def _mulaw_to_wav(mulaw_data: bytes) -> bytes:
        """Converte áudio mulaw 8kHz mono para WAV."""
        # WAV header para mulaw 8kHz mono
        num_channels = 1
        sample_rate = 8000
        bits_per_sample = 8
        data_size = len(mulaw_data)

        wav_buffer = io.BytesIO()
        # RIFF header
        wav_buffer.write(b'RIFF')
        wav_buffer.write(struct.pack('<I', 36 + data_size))
        wav_buffer.write(b'WAVE')
        # fmt chunk
        wav_buffer.write(b'fmt ')
        wav_buffer.write(struct.pack('<I', 16))  # chunk size
        wav_buffer.write(struct.pack('<H', 7))   # format: mulaw
        wav_buffer.write(struct.pack('<H', num_channels))
        wav_buffer.write(struct.pack('<I', sample_rate))
        wav_buffer.write(struct.pack('<I', sample_rate * num_channels * bits_per_sample // 8))
        wav_buffer.write(struct.pack('<H', num_channels * bits_per_sample // 8))
        wav_buffer.write(struct.pack('<H', bits_per_sample))
        # data chunk
        wav_buffer.write(b'data')
        wav_buffer.write(struct.pack('<I', data_size))
        wav_buffer.write(mulaw_data)

        return wav_buffer.getvalue()

    @staticmethod
    def _pcm_to_mulaw(pcm_data: bytes, input_rate: int = 24000, output_rate: int = 8000) -> bytes:
        """Converte PCM 24kHz 16-bit para mulaw 8kHz para Twilio."""
        # Downsample: 24kHz → 8kHz (pegar 1 a cada 3 samples)
        ratio = input_rate // output_rate
        samples = []
        for i in range(0, len(pcm_data) - 1, 2 * ratio):
            if i + 1 < len(pcm_data):
                sample = struct.unpack('<h', pcm_data[i:i+2])[0]
                samples.append(sample)

        # PCM → mulaw
        MULAW_MAX = 0x1FFF
        MULAW_BIAS = 33
        mulaw_bytes = bytearray()

        for sample in samples:
            sign = 0x80 if sample < 0 else 0
            sample = min(abs(sample), MULAW_MAX)
            sample += MULAW_BIAS

            exponent = 7
            for exp_val in [0x4000, 0x2000, 0x1000, 0x800, 0x400, 0x200, 0x100]:
                if sample >= exp_val:
                    break
                exponent -= 1

            mantissa = (sample >> (exponent + 3)) & 0x0F
            mulaw_byte = ~(sign | (exponent << 4) | mantissa) & 0xFF
            mulaw_bytes.append(mulaw_byte)

        return bytes(mulaw_bytes)


# === Store global de sessões ativas ===
active_pipelines: dict[str, VoicePipeline] = {}  # call_sid → pipeline


def get_pipeline(call_sid: str) -> Optional[VoicePipeline]:
    """Retorna o pipeline ativo para uma chamada."""
    return active_pipelines.get(call_sid)


def register_pipeline(call_sid: str, pipeline: VoicePipeline):
    """Registra um pipeline ativo."""
    active_pipelines[call_sid] = pipeline


def remove_pipeline(call_sid: str):
    """Remove um pipeline ativo."""
    active_pipelines.pop(call_sid, None)
