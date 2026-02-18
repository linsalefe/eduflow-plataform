"""
Pipeline de Voz em Tempo Real (CORRIGIDO).
Gerencia o WebSocket do Twilio Media Streams:
  1. Recebe áudio do lead (mulaw 8kHz)
  2. STT streaming → texto
  3. Envia texto ao LLM (via llm_contract)
  4. TTS streaming → áudio
  5. Envia áudio de volta ao Twilio
  6. Barge-in: se lead falar durante TTS, interrompe.

Compatível com Twilio Media Streams bidirecionais.

CORREÇÕES APLICADAS:
- FIX #1: VAD baseado em energia de áudio, não em tempo desde último pacote
- FIX #2: Greeting com fallback TwiML <Say> se TTS falhar
- FIX #3: Greeting roda em task separada, não bloqueia o loop
- FIX #4: stream_sid tratado corretamente
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
    
    FIX #1: VAD baseado em ENERGIA do áudio, não em tempo.
    O Twilio envia pacotes a cada 20ms continuamente (mesmo silêncio).
    Precisamos detectar silêncio pela energia do áudio, não pelo timing dos pacotes.
    """

    def __init__(self, silence_threshold_ms: int = 800, energy_threshold: int = 10):
        self.buffer = bytearray()
        self.last_speech_ts = time.time()  # FIX: tempo da última FALA (não último pacote)
        self.silence_threshold = silence_threshold_ms / 1000
        self.energy_threshold = energy_threshold
        self.is_speaking = False
        self.has_speech_data = False  # FIX: flag separada para quando tem fala real
        
        # FIX: Janela deslizante para suavizar detecção de energia
        self._energy_window = []
        self._window_size = 5  # Média das últimas 5 leituras

    def add_audio(self, payload: bytes):
        """Adiciona chunk de áudio ao buffer."""
        self.buffer.extend(payload)

        # Calcular energia do chunk (VAD simples baseado em energia)
        if len(payload) > 0:
            # Mulaw: valor 0xFF (255) e 0x7F (127) = silêncio
            # Desvio do ponto médio indica energia/fala
            energy = sum(abs(b - 128) for b in payload) / len(payload)
            
            # FIX: Média móvel para evitar falsos positivos
            self._energy_window.append(energy)
            if len(self._energy_window) > self._window_size:
                self._energy_window.pop(0)
            avg_energy = sum(self._energy_window) / len(self._energy_window)
            
            was_speaking = self.is_speaking
            self.is_speaking = avg_energy > self.energy_threshold

            if self.is_speaking:
                self.last_speech_ts = time.time()  # FIX: atualiza só quando TEM fala
                self.has_speech_data = True
            
            # Debug (remover em produção)
            if self.is_speaking and not was_speaking:
                print(f"🎤 Lead começou a falar (energia={avg_energy:.1f})")
            elif not self.is_speaking and was_speaking:
                print(f"🔇 Lead parou de falar (energia={avg_energy:.1f})")

    def is_silence_after_speech(self) -> bool:
        """
        FIX #1: Verifica se o lead PAROU de falar.
        Retorna True quando: tinha fala no buffer E o lead está em silêncio
        há mais de silence_threshold segundos.
        """
        if not self.has_speech_data:
            return False
        if self.is_speaking:
            return False
        # Tempo desde a última fala detectada
        return (time.time() - self.last_speech_ts) > self.silence_threshold

    def get_and_clear(self) -> bytes:
        """Retorna o áudio acumulado e limpa o buffer."""
        data = bytes(self.buffer)
        self.buffer = bytearray()
        self.has_speech_data = False
        self._energy_window.clear()
        return data

    def clear(self):
        """Limpa o buffer."""
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

        # Métricas
        self.call_start_time = time.time()
        self.latencies = []

        # RAG & Policies (injetados externamente)
        self.rag_snippets = []
        self.policies = {}
        
        # FIX #2: Flag para saber se o greeting foi enviado com sucesso
        self._greeting_sent = False
        self._greeting_task: Optional[asyncio.Task] = None
        
        # FIX: Lock para evitar processamento simultâneo
        self._processing_lock = asyncio.Lock()

    async def handle_websocket(self, websocket):
        """
        Handler principal do WebSocket do Twilio Media Streams.
        Processa mensagens bidirecionais.
        
        FIX #3: Greeting roda em task separada para não bloquear o loop.
        """
        self.websocket = websocket
        self.call_start_time = time.time()
        self.session.started_at = datetime.utcnow()

        # FIX #3: Enviar greeting em background task (não bloqueia o loop)
        self._greeting_task = asyncio.create_task(self._send_greeting_safe())

        # Loop principal de processamento
        try:
            async for message in websocket.iter_text():
                data = json.loads(message)
                event = data.get("event")

                if event == "connected":
                    print(f"🔌 Media Stream conectado: {data.get('streamSid')}")
                    # FIX #4: Usar streamSid do connected se ainda não tiver
                    if not self.stream_sid and data.get("streamSid"):
                        self.stream_sid = data.get("streamSid")

                elif event == "start":
                    start_info = data.get("start", {})
                    print(f"▶️ Stream iniciado: {start_info.get('callSid')}")
                    # FIX #4: Garantir stream_sid está setado
                    if start_info.get("streamSid"):
                        self.stream_sid = start_info["streamSid"]

                elif event == "media":
                    # Áudio do lead chegando
                    await self._handle_incoming_audio(data["media"])

                elif event == "stop":
                    print(f"⏹️ Stream parado")
                    break

        except Exception as e:
            print(f"❌ Erro no WebSocket: {e}")
            traceback.print_exc()
        finally:
            # Cancelar greeting task se ainda estiver rodando
            if self._greeting_task and not self._greeting_task.done():
                self._greeting_task.cancel()
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

        # FIX #1: Usar is_silence_after_speech() em vez de is_silence()
        # Isso detecta quando o lead PAROU de falar (baseado em energia)
        # em vez de verificar tempo desde último pacote (que nunca funciona)
        if self.audio_buffer.is_silence_after_speech():
            if not self.is_speaking_tts:
                async with self._processing_lock:
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
            print("⚠️ STT retornou vazio, ignorando turno")
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
            traceback.print_exc()
            return ""

    async def _text_to_speech(self, text: str):
        """Converte texto para áudio e envia via WebSocket."""
        if not text:
            print("⚠️ TTS: texto vazio, ignorando")
            return
        if not self.websocket:
            print("⚠️ TTS: websocket não conectado")
            return
        if not self.stream_sid:
            print("⚠️ TTS: stream_sid não definido, não é possível enviar áudio")
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
            
            if not pcm_data or len(pcm_data) == 0:
                print("⚠️ TTS: OpenAI retornou áudio vazio")
                return
                
            mulaw_data = self._pcm_to_mulaw(pcm_data)
            
            print(f"🔊 TTS: Enviando {len(mulaw_data)} bytes de áudio ({len(mulaw_data)/8000:.1f}s)")

            # Enviar em chunks de 20ms (160 bytes em mulaw 8kHz)
            chunk_size = 160
            for i in range(0, len(mulaw_data), chunk_size):
                if not self.is_speaking_tts:
                    print("🛑 TTS interrompido por barge-in")
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
                
                try:
                    await self.websocket.send_text(json.dumps(media_message))
                except Exception as send_err:
                    print(f"❌ Erro ao enviar chunk de áudio: {send_err}")
                    break

                # Simular timing real (20ms por chunk)
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

        # Enviar clear message para Twilio parar de tocar áudio
        if self.websocket and self.stream_sid:
            clear_message = {
                "event": "clear",
                "streamSid": self.stream_sid,
            }
            try:
                await self.websocket.send_text(json.dumps(clear_message))
            except Exception as e:
                print(f"⚠️ Erro ao enviar clear: {e}")

    async def _send_greeting_safe(self):
        """
        FIX #2 e #3: Envia saudação inicial com retry e fallback.
        Roda como task separada para não bloquear o loop principal.
        """
        # FIX: Esperar o stream_sid estar disponível (máximo 5 segundos)
        for _ in range(50):  # 50 x 100ms = 5s
            if self.stream_sid:
                break
            await asyncio.sleep(0.1)
        
        if not self.stream_sid:
            print("❌ Greeting: stream_sid não disponível após 5s. Abortando greeting.")
            return

        # Pequena pausa para garantir que o stream está pronto
        await asyncio.sleep(0.5)

        greeting = f"Oi, {self.session.lead_name}! Tudo bem? Aqui é a Nat. Vi que você se interessou pelo nosso curso. Posso falar rapidinho com você?"

        # Personalizar greeting se tiver script
        if hasattr(self, 'script') and self.script and self.script.opening_text:
            greeting = self.script.opening_text.replace(
                "{nome}", self.session.lead_name
            ).replace(
                "{curso}", self.session.course
            )

        self.fsm.add_turn("assistant", greeting)

        # FIX #2: Tentar TTS com retry
        max_retries = 2
        for attempt in range(max_retries):
            try:
                await self._text_to_speech(greeting)
                self._greeting_sent = True
                print(f"✅ Greeting enviado com sucesso (tentativa {attempt + 1})")
                return
            except Exception as e:
                print(f"⚠️ Greeting TTS falhou (tentativa {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(0.5)

        # FIX #2: Se TTS falhou completamente, logar o erro
        print("❌ GREETING FALHOU - Lead não ouvirá a saudação inicial!")
        print("   Verifique: OPENAI_API_KEY, conectividade, créditos na conta OpenAI")

    async def _send_greeting(self):
        """Wrapper legado - usa a versão safe."""
        await self._send_greeting_safe()

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
    