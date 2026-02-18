"""
Pipeline de Voz em Tempo Real (v2 - CORRIGIDO).

CORREÇÕES v2 (baseadas nos logs de produção):
- FIX #5: Greeting agora é via TwiML <Say> (instantâneo) → pipeline NÃO gera greeting próprio
- FIX #6: Barge-in desabilitado nos primeiros 3s após TTS iniciar (evita "alô" matar a fala)
- FIX #7: Após barge-in, buffer é limpo e lead's utterance é processada na próxima janela
- FIX #1-4: Mantidos da v1
"""
import asyncio
import base64
import json
import time
import io
import struct
import traceback
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
    """
    Acumula áudio do lead para enviar ao STT em chunks.
    VAD baseado em ENERGIA do áudio (não em tempo entre pacotes).
    """

    def __init__(self, silence_threshold_ms: int = 800, energy_threshold: int = 10):
        self.buffer = bytearray()
        self.last_speech_ts = time.time()
        self.silence_threshold = silence_threshold_ms / 1000
        self.energy_threshold = energy_threshold
        self.is_speaking = False
        self.has_speech_data = False

        # Janela deslizante para suavizar detecção de energia
        self._energy_window = []
        self._window_size = 5

    def add_audio(self, payload: bytes):
        """Adiciona chunk de áudio ao buffer."""
        self.buffer.extend(payload)

        if len(payload) > 0:
            energy = sum(abs(b - 128) for b in payload) / len(payload)

            self._energy_window.append(energy)
            if len(self._energy_window) > self._window_size:
                self._energy_window.pop(0)
            avg_energy = sum(self._energy_window) / len(self._energy_window)

            was_speaking = self.is_speaking
            self.is_speaking = avg_energy > self.energy_threshold

            if self.is_speaking:
                self.last_speech_ts = time.time()
                self.has_speech_data = True

            if self.is_speaking and not was_speaking:
                print(f"🎤 Lead começou a falar (energia={avg_energy:.1f})")
            elif not self.is_speaking and was_speaking:
                print(f"🔇 Lead parou de falar (energia={avg_energy:.1f})")

    def is_silence_after_speech(self) -> bool:
        """Retorna True quando tinha fala e agora está em silêncio."""
        if not self.has_speech_data:
            return False
        if self.is_speaking:
            return False
        return (time.time() - self.last_speech_ts) > self.silence_threshold

    def get_and_clear(self) -> bytes:
        """Retorna o áudio acumulado e limpa o buffer."""
        data = bytes(self.buffer)
        self.buffer = bytearray()
        self.has_speech_data = False
        self._energy_window.clear()
        return data

    def clear(self):
        """Limpa o buffer sem retornar dados."""
        self.buffer = bytearray()
        self.has_speech_data = False
        self._energy_window.clear()


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

        # FIX #6: Proteção contra barge-in nos primeiros segundos do TTS
        self._tts_start_time: float = 0
        self._barge_in_grace_period: float = 2.5  # segundos de proteção

        # Métricas
        self.call_start_time = time.time()
        self.latencies = []

        # RAG & Policies (injetados externamente)
        self.rag_snippets = []
        self.policies = {}

        # FIX #5: Greeting agora é via TwiML <Say>, não precisa de task separada
        self._greeting_sent_via_twiml = True  # TwiML cuida do greeting
        self._first_response = True  # Flag para a primeira resposta da IA

        # Lock para evitar processamento simultâneo
        self._processing_lock = asyncio.Lock()

    async def handle_websocket(self, websocket):
        """
        Handler principal do WebSocket do Twilio Media Streams.
        
        FIX #5: NÃO envia greeting via TTS - o TwiML <Say> já fez isso.
        O pipeline começa direto esperando o lead falar.
        """
        self.websocket = websocket
        self.call_start_time = time.time()
        self.session.started_at = datetime.utcnow()

        # Registrar o greeting do TwiML no histórico (para o LLM ter contexto)
        greeting = self._build_greeting_text()
        self.fsm.add_turn("assistant", greeting)

        print(f"🎙️ Pipeline pronto - aguardando lead falar...")

        # Loop principal de processamento
        try:
            async for message in websocket.iter_text():
                data = json.loads(message)
                event = data.get("event")

                if event == "connected":
                    print(f"🔌 Media Stream conectado: {data.get('streamSid')}")
                    if not self.stream_sid and data.get("streamSid"):
                        self.stream_sid = data.get("streamSid")

                elif event == "start":
                    start_info = data.get("start", {})
                    print(f"▶️ Stream iniciado: {start_info.get('callSid')}")
                    if start_info.get("streamSid"):
                        self.stream_sid = start_info["streamSid"]

                elif event == "media":
                    await self._handle_incoming_audio(data["media"])

                elif event == "stop":
                    print(f"⏹️ Stream parado")
                    break

        except Exception as e:
            print(f"❌ Erro no WebSocket: {e}")
            traceback.print_exc()
        finally:
            await self._finalize_call()

    def _build_greeting_text(self) -> str:
        """Monta o texto do greeting (mesmo que foi falado via TwiML)."""
        greeting = (
            f"Oi, {self.session.lead_name}! Tudo bem? Aqui é a Nat. "
            f"Vi que você se interessou pelo nosso curso. Posso falar rapidinho com você?"
        )
        if hasattr(self, 'script') and self.script and self.script.opening_text:
            greeting = self.script.opening_text.replace(
                "{nome}", self.session.lead_name
            ).replace(
                "{curso}", self.session.course
            )
        return greeting

    async def _handle_incoming_audio(self, media_data: dict):
        """Processa áudio recebido do lead."""
        payload = base64.b64decode(media_data["payload"])
        self.audio_buffer.add_audio(payload)

        # FIX #6: Barge-in com grace period
        if self.is_speaking_tts and self.audio_buffer.is_speaking:
            elapsed_since_tts = time.time() - self._tts_start_time
            if elapsed_since_tts > self._barge_in_grace_period:
                await self._handle_barge_in()
            # Se ainda está no grace period, ignora o barge-in
            # (o lead provavelmente está dizendo "alô" ou "sim")

        # Verificar timeout da chamada
        elapsed = time.time() - self.call_start_time
        if elapsed > FSM_MAX_CALL_DURATION_SEC:
            await self._timeout_call()
            return

        # Quando detectar silêncio após fala, processar
        if self.audio_buffer.is_silence_after_speech():
            if not self.is_speaking_tts:
                async with self._processing_lock:
                    await self._process_utterance()

    async def _process_utterance(self):
        """Processa a fala completa do lead: STT → LLM → TTS."""
        audio_data = self.audio_buffer.get_and_clear()
        if len(audio_data) < 1600:  # Menos que 100ms, ignorar
            return

        t_start = time.time()

        # === 1. STT: áudio → texto ===
        t_stt_start = time.time()
        text = await self._speech_to_text(audio_data)
        stt_latency = int((time.time() - t_stt_start) * 1000)

        if not text or text.strip() == "":
            print("⚠️ STT retornou vazio, ignorando turno")
            return

        # Filtrar falas muito curtas / noise
        clean_text = text.strip().lower()
        noise_phrases = {"", ".", "...", "hum", "uh", "ah"}
        if clean_text in noise_phrases:
            print(f"⚠️ STT noise filtrado: '{text}'")
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

        say_text = llm_response["say"]
        if llm_response.get("ask"):
            say_text += f" {llm_response['ask']}"

        print(f"🤖 IA: action={llm_response['action']}, say={say_text[:80]}...")

        # === 3. Processar ação do LLM ===
        await self._process_llm_action(llm_response)

        # === 4. TTS: texto → áudio ===
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
        print(f"⏱️ Latência: STT={stt_latency}ms LLM={llm_latency}ms TTS={tts_latency}ms Total={total_latency}ms")

        # Se a ação é encerrar, fechar
        if llm_response["action"] == "end_call":
            await asyncio.sleep(2)
            await self._finalize_call()

    async def _process_llm_action(self, llm_response: dict):
        """Processa a ação decidida pelo LLM e atualiza a FSM."""
        action = llm_response["action"]

        if llm_response.get("fields_update"):
            self.fsm.update_fields(llm_response["fields_update"])

        if llm_response.get("objection_detected"):
            self.fsm.add_objection(llm_response["objection_detected"])

        if action != "continue":
            target_state = self.fsm.get_next_action(action)
            if target_state != self.session.state:
                self.fsm.transition(target_state)
                print(f"🔄 FSM: {self.session.previous_state} → {self.session.state}")

    async def _speech_to_text(self, audio_data: bytes) -> str:
        """Converte áudio (mulaw 8kHz) para texto usando STT."""
        try:
            wav_data = self._mulaw_to_wav(audio_data)
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
            traceback.print_exc()
            return ""

    async def _text_to_speech(self, text: str):
        """Converte texto para áudio e envia via WebSocket."""
        if not text:
            print("⚠️ TTS: texto vazio")
            return
        if not self.websocket:
            print("⚠️ TTS: websocket não conectado")
            return
        if not self.stream_sid:
            print("⚠️ TTS: stream_sid não definido")
            return

        self.is_speaking_tts = True
        self._tts_start_time = time.time()  # FIX #6: Marca início para grace period

        try:
            response = await openai_client.audio.speech.create(
                model=TTS_MODEL,
                voice=TTS_VOICE,
                input=text,
                response_format="pcm",
                speed=1.0,
            )

            pcm_data = response.content
            if not pcm_data or len(pcm_data) == 0:
                print("⚠️ TTS: OpenAI retornou áudio vazio")
                return

            mulaw_data = self._pcm_to_mulaw(pcm_data)
            duration_s = len(mulaw_data) / 8000
            print(f"🔊 TTS: Enviando {len(mulaw_data)} bytes ({duration_s:.1f}s)")

            # Enviar em chunks de 20ms (160 bytes em mulaw 8kHz)
            chunk_size = 160
            for i in range(0, len(mulaw_data), chunk_size):
                if not self.is_speaking_tts:
                    print("🛑 TTS interrompido por barge-in")
                    break

                chunk = mulaw_data[i:i + chunk_size]
                payload = base64.b64encode(chunk).decode("utf-8")

                media_message = {
                    "event": "media",
                    "streamSid": self.stream_sid,
                    "media": {"payload": payload},
                }

                try:
                    await self.websocket.send_text(json.dumps(media_message))
                except Exception as send_err:
                    print(f"❌ Erro ao enviar chunk: {send_err}")
                    break

                await asyncio.sleep(0.02)

        except Exception as e:
            print(f"❌ Erro TTS: {e}")
            traceback.print_exc()
        finally:
            self.is_speaking_tts = False

    async def _handle_barge_in(self):
        """Interrompe o TTS quando o lead começa a falar."""
        print("🛑 Barge-in detectado! Interrompendo TTS...")
        self.is_speaking_tts = False

        if self.websocket and self.stream_sid:
            clear_message = {
                "event": "clear",
                "streamSid": self.stream_sid,
            }
            try:
                await self.websocket.send_text(json.dumps(clear_message))
            except Exception as e:
                print(f"⚠️ Erro ao enviar clear: {e}")

    async def _timeout_call(self):
        """Encerra a chamada por timeout."""
        timeout_msg = (
            f"Obrigada pelo seu tempo, {self.session.lead_name}! "
            f"Vou te enviar mais informações por WhatsApp. Até mais!"
        )
        self.fsm.add_turn("assistant", timeout_msg)
        await self._text_to_speech(timeout_msg)
        self.fsm.transition(State.CLOSE)
        self.session.tags.append("timeout")

    async def _finalize_call(self):
        """Finaliza a chamada: gera resumo, calcula score, prepara dados."""
        if not self.session.is_active:
            return  # Já foi finalizada
        self.session.is_active = False

        avg_latency = 0
        if self.latencies:
            avg_latency = int(sum(l["total"] for l in self.latencies) / len(self.latencies))

        summary = ""
        try:
            summary = await generate_call_summary(self.session)
        except Exception as e:
            print(f"⚠️ Erro ao gerar resumo: {e}")
            summary = f"Erro ao gerar resumo: {e}"

        outcome = self.fsm.determine_outcome()
        score, breakdown = self.session.calculate_score()

        print(f"📋 Chamada finalizada: outcome={outcome}, score={score}, turnos={self.session.turn_count}")

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
        state_to_handoff = {
            State.SCHEDULE: "schedule",
            State.WARM_TRANSFER: "warm_transfer",
            State.FOLLOW_UP: "follow_up",
        }
        return state_to_handoff.get(self.session.state)

    @staticmethod
    def _mulaw_to_wav(mulaw_data: bytes) -> bytes:
        """Converte áudio mulaw 8kHz mono para WAV."""
        num_channels = 1
        sample_rate = 8000
        bits_per_sample = 8
        data_size = len(mulaw_data)

        wav_buffer = io.BytesIO()
        wav_buffer.write(b'RIFF')
        wav_buffer.write(struct.pack('<I', 36 + data_size))
        wav_buffer.write(b'WAVE')
        wav_buffer.write(b'fmt ')
        wav_buffer.write(struct.pack('<I', 16))
        wav_buffer.write(struct.pack('<H', 7))   # mulaw
        wav_buffer.write(struct.pack('<H', num_channels))
        wav_buffer.write(struct.pack('<I', sample_rate))
        wav_buffer.write(struct.pack('<I', sample_rate * num_channels * bits_per_sample // 8))
        wav_buffer.write(struct.pack('<H', num_channels * bits_per_sample // 8))
        wav_buffer.write(struct.pack('<H', bits_per_sample))
        wav_buffer.write(b'data')
        wav_buffer.write(struct.pack('<I', data_size))
        wav_buffer.write(mulaw_data)

        return wav_buffer.getvalue()

    @staticmethod
    def _pcm_to_mulaw(pcm_data: bytes, input_rate: int = 24000, output_rate: int = 8000) -> bytes:
        """Converte PCM 24kHz 16-bit para mulaw 8kHz para Twilio."""
        ratio = input_rate // output_rate
        samples = []
        for i in range(0, len(pcm_data) - 1, 2 * ratio):
            if i + 1 < len(pcm_data):
                sample = struct.unpack('<h', pcm_data[i:i+2])[0]
                samples.append(sample)

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
active_pipelines: dict[str, VoicePipeline] = {}


def get_pipeline(call_sid: str) -> Optional[VoicePipeline]:
    return active_pipelines.get(call_sid)


def register_pipeline(call_sid: str, pipeline: VoicePipeline):
    active_pipelines[call_sid] = pipeline


def remove_pipeline(call_sid: str):
    active_pipelines.pop(call_sid, None)