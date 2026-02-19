"""
Pipeline de Voz — OpenAI Realtime API.

Substitui completamente a cadeia STT→LLM→TTS por uma ÚNICA conexão
WebSocket com a API Realtime do GPT-4o, que faz tudo integrado:
  - STT nativo (server-side VAD)
  - LLM nativo (GPT-4o)
  - TTS nativo (voz neural, ~500ms de latência)
  - Barge-in nativo (interrupção automática)

Áudio: Twilio envia g711_ulaw 8kHz → OpenAI aceita g711_ulaw 8kHz.
Sem conversão de formato! Relay direto entre os dois WebSockets.

Function calling: Coleta de dados e controle de FSM via tools.

v4.0: Otimizações de naturalidade baseadas na documentação oficial
      OpenAI Realtime API (GA) + Realtime Prompting Cookbook.
      - semantic_vad consistente (em vez de server_vad)
      - Prompt reestruturado com bullets curtos
      - Seções: Pacing, Language, Reference Pronunciations, Unclear Audio
      - Variety reforçada com CAPS
      - Tool preambles com sample phrases
"""
import asyncio
import json
import time
import traceback
from typing import Optional
from datetime import datetime

import websockets

from app.voice_ai.config import (
    OPENAI_API_KEY,
    FSM_MAX_CALL_DURATION_SEC,
    REALTIME_MODEL,
    REALTIME_VOICE,
)
from app.voice_ai.fsm import FSMEngine, CallSession, State
from app.voice_ai.llm_contract import generate_call_summary


# ============================================================
# PIPELINE PRINCIPAL
# ============================================================

class VoicePipeline:
    """
    Pipeline de voz usando OpenAI Realtime API.
    Atua como relay bidirecional entre Twilio e OpenAI.
    """

    def __init__(self, session: CallSession, fsm: FSMEngine):
        self.session = session
        self.fsm = fsm
        self.stream_sid: Optional[str] = None
        self.twilio_ws = None
        self.openai_ws = None

        # Métricas
        self.call_start_time = time.time()
        self.latencies = []

        # RAG & Policies (injetados externamente)
        self.rag_snippets = []
        self.policies = {}
        self.script = None

        # Controle interno
        self._finalized = False
        self._call_ended = False
        self._vad_reactivated = False
        self._t0 = None  # Timestamp de início para medição

    # --------------------------------------------------------
    # ENTRY POINT
    # --------------------------------------------------------

    async def pre_connect(self):
        """Pre-conecta ao OpenAI Realtime API para reduzir latência."""
        url = f"wss://api.openai.com/v1/realtime?model={REALTIME_MODEL}"
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        }
        try:
            self.openai_ws = await websockets.connect(
                url,
                additional_headers=headers,
                open_timeout=3,
                close_timeout=3,
                ping_interval=20,
                ping_timeout=20,
            )
            print(f"[TIMING] openai_connected dt_ms={(time.perf_counter()-self._t0)*1000:.0f}" if self._t0 else "")
            print(f"✅ Conectado ao OpenAI Realtime API ({REALTIME_MODEL})")
            await self._configure_session()
            await self._trigger_greeting()
        except Exception as e:
            print(f"❌ Erro no pre_connect: {e}")
            traceback.print_exc()

    async def handle_websocket(self, twilio_ws):
        """
        Handler principal. Faz relay bidirecional.
        OpenAI já deve estar conectado via pre_connect().
        """
        self.twilio_ws = twilio_ws
        self.call_start_time = time.time()
        self.session.started_at = datetime.utcnow()

        try:
            if not self.openai_ws:
                await self.pre_connect()

            if not self.openai_ws:
                print("❌ Falha ao conectar ao OpenAI")
                return

            twilio_task = asyncio.create_task(self._relay_twilio_to_openai())
            openai_task = asyncio.create_task(self._relay_openai_to_twilio())

            done, pending = await asyncio.wait(
                [twilio_task, openai_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        except Exception as e:
            print(f"❌ Erro na conexão Realtime: {e}")
            traceback.print_exc()
        finally:
            if self.openai_ws:
                try:
                    await self.openai_ws.close()
                except Exception:
                    pass
            await self._finalize_call()

    # --------------------------------------------------------
    # HELPER: enviar para OpenAI de forma segura (websockets v13+)
    # --------------------------------------------------------

    async def _send_to_openai(self, data: dict) -> bool:
        """Envia JSON para o OpenAI WS. Retorna False se falhou."""
        if not self.openai_ws:
            return False
        try:
            await self.openai_ws.send(json.dumps(data))
            return True
        except Exception:
            return False

    # --------------------------------------------------------
    # CONFIGURAÇÃO DA SESSÃO
    # --------------------------------------------------------

    async def _configure_session(self):
        """Envia configuração da sessão para o OpenAI Realtime (formato GA)."""
        system_prompt = self._build_system_prompt()
        tools = self._build_tools()

        config = {
            "type": "session.update",
            "session": {
                "type": "realtime",
                "model": REALTIME_MODEL,
                "output_modalities": ["audio"],
                "instructions": system_prompt,
                "audio": {
                    "output": {
                        "format": {"type": "audio/pcmu"},
                        "voice": REALTIME_VOICE,
                        "speed": 1.08,
                    },
                    "input": {
                        "format": {"type": "audio/pcmu"},
                        "transcription": {"model": "gpt-4o-transcribe", "language": "pt"},
                        "turn_detection": {
                            "type": "semantic_vad",
                            "eagerness": "medium",
                            "create_response": True,
                            "interrupt_response": True,
                        },
                    },
                },
                "tools": tools,
                "tool_choice": "auto",
            },
        }
        await self._send_to_openai(config)

        # Esperar confirmação
        try:
            async for msg in self.openai_ws:
                event = json.loads(msg)
                if event["type"] == "session.updated":
                    print(f"[TIMING] session_configured dt_ms={(time.perf_counter()-self._t0)*1000:.0f}" if self._t0 else "")
                    print("✅ Sessão Realtime configurada")
                    break
                elif event["type"] == "error":
                    print(f"❌ Erro na configuração: {event.get('error', {})}")
                    break
        except Exception as e:
            print(f"❌ Erro aguardando configuração: {e}")

    async def _trigger_greeting(self):
        """Envia greeting com VAD desabilitado para evitar cancelamento."""
        # 1) Limpar buffer de audio acumulado
        await self._send_to_openai({"type": "input_audio_buffer.clear"})

        # 2) Desabilitar VAD durante greeting
        await self._send_to_openai({
            "type": "session.update",
            "session": {
                "type": "realtime",
                "audio": {
                    "input": {
                        "turn_detection": None
                    }
                }
            }
        })

        # 3) Criar resposta de greeting
        await self._send_to_openai({
            "type": "response.create",
            "response": {}
        })
        print("🎙️ Greeting solicitado ao Realtime API (VAD desabilitado)")

    # --------------------------------------------------------
    # RELAY: TWILIO → OPENAI
    # --------------------------------------------------------

    async def _relay_twilio_to_openai(self):
        """Encaminha áudio do Twilio para o OpenAI Realtime."""
        try:
            async for message in self.twilio_ws.iter_text():
                if self._call_ended:
                    break

                data = json.loads(message)
                event = data.get("event")

                if event == "media":
                    audio_msg = {
                        "type": "input_audio_buffer.append",
                        "audio": data["media"]["payload"],
                    }
                    await self._send_to_openai(audio_msg)

                elif event == "start":
                    info = data.get("start", {})
                    self.stream_sid = info.get("streamSid")
                    print(f"▶️ Stream Twilio iniciado: {self.stream_sid}")

                elif event == "connected":
                    if data.get("streamSid"):
                        self.stream_sid = data["streamSid"]

                elif event == "stop":
                    print("⏹️ Stream Twilio parado (lead desligou)")
                    break

                # Verificar timeout
                if time.time() - self.call_start_time > FSM_MAX_CALL_DURATION_SEC:
                    print("⏰ Timeout da chamada")
                    break

        except Exception as e:
            print(f"❌ Relay Twilio→OpenAI erro: {e}")

    # --------------------------------------------------------
    # RELAY: OPENAI → TWILIO
    # --------------------------------------------------------

    async def _relay_openai_to_twilio(self):
        """Encaminha áudio do OpenAI para o Twilio + processa eventos."""
        audio_chunks_sent = 0
        try:
            async for message in self.openai_ws:
                if self._call_ended:
                    break

                event = json.loads(message)
                etype = event.get("type", "")

                # ====== LOG VERBOSO DE TODOS OS EVENTOS ======
                if etype in ("response.audio.delta", "response.output_audio.delta"):
                    audio_chunks_sent += 1
                    if audio_chunks_sent % 50 == 1:
                        print(f"🔊 [OPENAI] audio delta (chunk #{audio_chunks_sent})")
                else:
                    # Loga TODOS os eventos que não são audio delta
                    print(f"📡 [OPENAI] {etype}")
                    if etype == "error":
                        print(f"   ❌ Detalhe: {json.dumps(event.get('error', {}), ensure_ascii=False)}")
                    elif etype == "response.done":
                        resp = event.get("response", {})
                        outputs = resp.get("output", [])
                        status = resp.get("status", "?")
                        print(f"   📋 status={status}, outputs={len(outputs)}")
                        for i, out in enumerate(outputs):
                            print(f"   📋 output[{i}]: type={out.get('type')}, role={out.get('role', '-')}")
                    elif etype == "input_audio_buffer.speech_started":
                        print(f"   🗣️ Lead começou a falar!")
                    elif etype == "input_audio_buffer.speech_stopped":
                        print(f"   🤐 Lead parou de falar")
                    elif etype == "input_audio_buffer.committed":
                        print(f"   ✅ Buffer de áudio commitado")
                    elif etype == "response.created":
                        print(f"   🆕 Nova response criada")
                    elif etype == "conversation.item.created":
                        item = event.get("item", {})
                        print(f"   📎 item type={item.get('type')}, role={item.get('role', '-')}")
                # ====== FIM DO LOG VERBOSO ======

                # ------- ÁUDIO: IA → Twilio -------
                if etype in ("response.audio.delta", "response.output_audio.delta"):
                    if self.stream_sid and self.twilio_ws:
                        media_msg = {
                            "event": "media",
                            "streamSid": self.stream_sid,
                            "media": {"payload": event["delta"]},
                        }
                        try:
                            await self.twilio_ws.send_text(json.dumps(media_msg))
                        except Exception:
                            break

                # ------- TRANSCRIÇÃO DA IA -------
                elif etype in ("response.audio_transcript.done", "response.output_audio_transcript.done"):
                    transcript = event.get("transcript", "")
                    if transcript:
                        print(f"🤖 IA disse: {transcript[:100]}")
                        self.fsm.add_turn("assistant", transcript)

                # ------- TRANSCRIÇÃO DO LEAD -------
                elif etype == "conversation.item.input_audio_transcription.completed":
                    transcript = event.get("transcript", "")
                    if transcript:
                        print(f"🎙️ Lead disse: {transcript}")
                        self.fsm.add_turn("user", transcript)

                # ------- FUNCTION CALL -------
                elif etype == "response.function_call_arguments.done":
                    await self._handle_function_call(event)

                # ------- RESPOSTA COMPLETA -------
                elif etype == "response.done":
                    # Reativar VAD após greeting — usa semantic_vad (melhor que server_vad)
                    if not self._vad_reactivated:
                        await self._send_to_openai({
                            "type": "session.update",
                            "session": {
                                "type": "realtime",
                                "audio": {
                                    "input": {
                                        "turn_detection": {
                                            "type": "semantic_vad",
                                            "eagerness": "medium",
                                            "create_response": True,
                                            "interrupt_response": True,
                                        }
                                    }
                                }
                            }
                        })
                        self._vad_reactivated = True
                        print("✅ VAD reativado após greeting (semantic_vad)")
                        print(f"[TIMING] greeting_done dt_ms={(time.perf_counter()-self._t0)*1000:.0f}" if self._t0 else "")

                    response = event.get("response", {})
                    for item in response.get("output", []):
                        if (
                            item.get("type") == "function_call"
                            and item.get("name") == "end_call"
                        ):
                            print("📞 IA solicitou encerramento")
                            await asyncio.sleep(5)
                            self._call_ended = True
                            return

                # ------- BARGE-IN (lead interrompeu) -------
                elif etype == "input_audio_buffer.speech_started":
                    # Cancelar resposta em andamento no OpenAI
                    await self._send_to_openai({"type": "response.cancel"})
                    # Limpar áudio no Twilio
                    if self.stream_sid and self.twilio_ws:
                        clear_msg = {
                            "event": "clear",
                            "streamSid": self.stream_sid,
                        }
                        try:
                            await self.twilio_ws.send_text(json.dumps(clear_msg))
                        except Exception:
                            pass

                # ------- ERROS -------
                elif etype == "error":
                    err = event.get("error", {})
                    print(f"❌ OpenAI Realtime erro: {err.get('type')}: {err.get('message')}")

        except websockets.exceptions.ConnectionClosed:
            print("🔌 OpenAI Realtime desconectou")
        except Exception as e:
            print(f"❌ Relay OpenAI→Twilio erro: {e}")
            traceback.print_exc()

    # --------------------------------------------------------
    # FUNCTION CALLING (coleta de dados / controle de FSM)
    # --------------------------------------------------------

    async def _handle_function_call(self, event: dict):
        """Processa function calls do Realtime API."""
        fn_name = event.get("name", "")
        call_id = event.get("call_id", "")
        args_str = event.get("arguments", "{}")

        try:
            args = json.loads(args_str)
        except json.JSONDecodeError:
            args = {}

        result = {"success": True}

        if fn_name == "update_lead_fields":
            for key, value in args.items():
                if value and value.strip():
                    self.session.collected_fields[key] = value
            collected = list(self.session.collected_fields.keys())
            result["collected"] = collected
            print(f"📝 Campos atualizados: {args} → Total: {collected}")

        elif fn_name == "change_state":
            new_state_str = args.get("new_state", "")
            reason = args.get("reason", "")
            try:
                new_state = State(new_state_str)
                old_state = self.session.state
                self.fsm.transition(new_state)
                result["transitioned"] = f"{old_state.value} → {new_state.value}"
                print(f"🔄 FSM: {old_state.value} → {new_state.value} ({reason})")
            except (ValueError, KeyError):
                result["success"] = False
                result["error"] = f"Estado inválido: {new_state_str}"

        elif fn_name == "register_objection":
            objection = args.get("objection", "")
            if objection:
                self.fsm.add_objection(objection)
                print(f"⚠️ Objeção registrada: {objection}")

        elif fn_name == "end_call":
            reason = args.get("reason", "encerramento normal")
            self.fsm.transition(State.CLOSE)
            self._call_ended = True
            print(f"📞 Chamada encerrada: {reason}")

        elif fn_name == "schedule_meeting":
            date = args.get("date", "")
            time_str = args.get("time", "")
            self.session.collected_fields["data_agendamento"] = date
            self.session.collected_fields["hora_agendamento"] = time_str
            self.fsm.transition(State.SCHEDULE)
            result["scheduled"] = f"{date} às {time_str}"
            print(f"📅 Reunião agendada: {date} às {time_str}")

        # Enviar resultado de volta ao OpenAI
        fn_output = {
            "type": "conversation.item.create",
            "item": {
                "type": "function_call_output",
                "call_id": call_id,
                "output": json.dumps(result, ensure_ascii=False),
            },
        }
        sent = await self._send_to_openai(fn_output)
        if sent:
            await self._send_to_openai({"type": "response.create"})

    # --------------------------------------------------------
    # SYSTEM PROMPT — Reestruturado conforme OpenAI Realtime
    #                 Prompting Guide (bullets curtos, CAPS,
    #                 seções claras, sample phrases)
    # --------------------------------------------------------

    def _build_system_prompt(self) -> str:
        """Monta o system prompt completo para o Realtime API."""

        lead_info = f"""
## Lead Info
- Nome: {self.session.lead_name}
- Telefone: {self.session.lead_phone}
- Curso de interesse: {self.session.course or 'não especificado'}
- Origem: {self.session.source or 'site'}
- Campanha: {self.session.campaign or 'orgânico'}
"""

        rag_context = ""
        if self.rag_snippets:
            rag_context = "\n# Context\n\nBASE DE CONHECIMENTO (use para responder perguntas):\n"
            for s in self.rag_snippets:
                rag_context += f"- {s.get('title', '')}: {s.get('content', '')}\n"

        policy_text = ""
        if self.policies:
            policy_text = "\n# Policies\n\nRESPEITE RIGOROSAMENTE:\n"
            for k, v in self.policies.items():
                policy_text += f"- {k}: {v}\n"

        script_override = ""
        if self.script and self.script.system_prompt_override:
            script_override = f"\n# Script Override\n\n{self.script.system_prompt_override}\n"

        objection_responses = ""
        if self.script and self.script.objection_responses:
            objection_responses = "\n# Objection Responses\n\n"
            for obj, resp in self.script.objection_responses.items():
                objection_responses += f"- Se disser '{obj}': {resp}\n"

        return f"""# Role & Objective

Você é NAT, SDR do CENAT — Centro Nacional de Saúde Mental.
Você está em uma LIGAÇÃO TELEFÔNICA fazendo o contato do processo seletivo para pós-graduação.
Seu objetivo é qualificar o candidato e agendar uma conversa com a consultora.

{lead_info}

# Personality & Tone

## Identity
- SDR profissional, simpática e objetiva do CENAT.

## Tone
- Calorosa, confiante, empática. NUNCA robótica ou formal demais.

## Length
- Frases curtas e naturais. É UMA LIGAÇÃO, NÃO UM TEXTO.
- REGRA CRÍTICA: NUNCA termine seu turno com uma frase informativa. Se você tem algo a informar E uma pergunta a fazer, FALE TUDO JUNTO no mesmo turno.
- Exemplo ERRADO: "O próximo passo é agendar com a consultora." [para e espera]
- Exemplo CERTO: "O próximo passo é agendar com a consultora. Ela vai te explicar tudo certinho. Pra você seria melhor de manhã ou de tarde?"
- Se não tiver pergunta a fazer, faça uma transição natural pro próximo assunto SEM PARAR.
- Só PARE e espere quando fizer uma PERGUNTA DIRETA ao lead.

## Pacing
- Fale de forma natural e fluida em português brasileiro.
- Use pausas naturais entre frases.
- Entregue sua resposta rápido, SEM soar apressada.

## Style
- Use contrações naturais: "tá", "pra", "pro", "né", "beleza".
- Fale como uma profissional simpática, NÃO como roteiro decorado.
- NUNCA use abreviações escritas. Fale "você" ou "cê", NUNCA "vc".
- Sorria na voz. Seja acolhedora.

## Audio Behavior
- Entonação acolhedora e confiante.
- Ritmo conversacional, nem devagar demais.
- Faça micro-pausas naturais entre frases.
- Demonstre empatia e interesse genuíno na voz.

# Language

- SEMPRE responda em português brasileiro.
- Use sotaque brasileiro natural.
- Mantenha o mesmo idioma durante TODA a conversa.

# Variety

- NÃO REPITA a mesma frase duas vezes. VARIE SEMPRE.
- Cada resposta DEVE soar diferente da anterior.

# Instructions / Rules

- NUNCA invente preços, datas ou informações. Se não souber, diga "vou verificar pra você".
- NUNCA diga que é IA ou robô. Se perguntarem: "Sou da equipe de atendimento!"
- Se o lead estiver ocupado: "Sem problema! Qual horário fica melhor pra eu te ligar?"
- Colete informações NATURALMENTE. NUNCA pareça um formulário.
- SE DETECTAR OBJEÇÃO: EMPATIA PRIMEIRO, depois argumente.

# Adaptive Listening

- ESCUTE COM ATENÇÃO o que o lead diz. Use as palavras DELE nas suas respostas.
- Se ele mencionar um desafio no trabalho, conecte com o curso: "Isso é exatamente o que a pós aborda..."
- Se ele mencionar experiência prévia, valorize: "Que legal que você já tem essa vivência!"
- Se ele parecer inseguro, encoraje: "Muita gente começa com essa mesma dúvida..."
- Se ele falar pouco, faça perguntas abertas pra ele se abrir.
- Se ele falar muito, demonstre interesse e resuma: "Então você tá buscando..."
- ADAPTE seu tom ao tom do lead. Se ele for formal, seja mais formal. Se for descontraído, seja leve.
- NUNCA ignore o que o lead acabou de dizer pra seguir o roteiro. SEMPRE reaja antes de avançar.

# Conversation Flow Rules

- NUNCA pare após frases informativas. SEMPRE emende com a próxima pergunta ou próximo assunto.
- Frases informativas SÃO PONTE, não são turno. Use elas pra conectar, não pra encerrar.
- Se você precisa informar algo E perguntar algo, FALE TUDO NO MESMO TURNO.
- Só PARE e ESPERE a resposta do lead quando sua ÚLTIMA frase for uma PERGUNTA DIRETA.
- Exemplo de fluxo HUMANO: "Legal que você trabalha no CAPS! E o que te motivou a buscar essa pós?"
- Exemplo ROBÓTICO (NUNCA faça): "Legal que você trabalha no CAPS!" [silêncio esperando resposta]

# Turn Pattern

- TODA resposta após o lead falar DEVE seguir este padrão:
  1. ACK curto (reação): "Entendi", "Legal", "Bacana", "Certo", "Show"
  2. ESPELHO (repita algo que o lead disse com suas palavras): "Então você tá no hospital infantil..."
  3. PERGUNTA ou PRÓXIMO PASSO
- Exemplo HUMANO: "Entendi. Você quer se especializar pra melhorar os atendimentos... massa. E pra estudar, você prefere noite ou fim de semana?"
- Exemplo ROBÓTICO (NUNCA): "Legal. Qual é a sua disponibilidade de horário?"
- VARIE os acks. NÃO use sempre "Entendi". Alterne: "Certo", "Bacana", "Show", "Legal", "Massa", "Que legal", "Faz sentido".

# Conversation Flow

Greeting → Apresentação → Formação → Atuação → Motivação → Validação → Investimento → Agendamento → Encerramento.
Avance SOMENTE quando o candidato responder. UMA ETAPA POR VEZ.

## Greeting
- Se apresente e contextualize a ligação.
- Sample phrases (VARIE):
  - "Olá, {{{{nome}}}}! Tudo bem? Aqui é a Nat do CENAT!"
  - "Oi, {{{{nome}}}}! Aqui é a Nat, do CENAT. Tudo bem com você?"

## Apresentação
- Explique o motivo da ligação.
- Sample phrases (VARIE):
  - "Estou entrando em contato referente à sua aplicação na pós-graduação em {{{{curso}}}}. Esse contato faz parte do processo seletivo, vou fazer algumas perguntas, mas é bem breve, tudo bem?"
  - "Vi aqui que você demonstrou interesse na pós de {{{{curso}}}}. É rapidinho, só umas perguntinhas do processo seletivo, pode ser?"

## Formação
- Pergunte a formação do candidato.
- "{{{{nome}}}}, qual é a sua formação?"
- Após resposta, reaja com interesse: "Legal!", "Que bacana!", "Muito bom!"

## Atuação
- Pergunte onde trabalha atualmente.
- "E hoje você trabalha onde?" ou "E onde você tá atuando hoje?"
- Após resposta, reaja: "Certo!", "Entendi!"

## Motivação
- Pergunte o que busca na pós.
- "{{{{nome}}}}, você poderia me explicar um pouco mais do que você procura hoje em uma pós-graduação?"
- ESCUTE COM ATENÇÃO. Essa resposta é a mais importante.

## Validação
- Conecte a resposta do candidato com a pós USANDO AS PALAVRAS DELE.
- Junte validação + próximo passo NO MESMO TURNO. NÃO pare entre eles.
- Exemplo: "{{{{nome}}}}, muito obrigada por me contar! Isso vai muito de encontro com a pós, justamente por essas questões que você trouxe. E em relação ao investimento, seria possível pra você o valor aproximado de trezentos reais mensais?"
- NUNCA faça validação sozinha e espere. Sempre emende com a próxima etapa.

## Investimento
- Mencione o valor aproximado.
- "{{{{nome}}}}, em relação ao investimento, seria possível pra você o valor aproximado de trezentos reais mensais para a pós?"
- Se sim: "Perfeito!"
- Se não: use empatia e diga que existem condições especiais que a consultora pode apresentar.

## Agendamento
- Agende a conversa com a consultora.
- Primeiro explique o próximo passo:
  - "O próximo e último passo é agendarmos uma conversa com a consultora. Ela vai trazer os detalhes da pós, conteúdo, corpo docente, tirar suas dúvidas, e se fizer sentido já segue com a matrícula."
- Depois pergunte o TURNO:
  - "Pra você seria melhor pela manhã ou pela tarde?"
- Após o turno, pergunte o DIA DA SEMANA:
  - "E qual dia da semana fica bom pra você? Temos disponibilidade de segunda a sexta."
- Após o dia, SUGIRA um horário específico:
  - Se manhã: "Que tal às dez horas?" ou "Às nove e meia fica bom?"
  - Se tarde: "Às quatorze horas funciona?" ou "Pode ser às quinze horas?"
- CONFIRME dia e horário: "Então fica combinado, [dia] às [hora]. A consultora vai te ligar nesse horário, tá?"
- UMA PERGUNTA POR VEZ. Espere cada resposta antes de avançar.

## Encerramento
- Após confirmar o agendamento, mencione o voucher e a ementa.
- Faça um resumo rápido do que foi combinado.
- Pergunte se ficou alguma dúvida.
- Despeça-se de forma calorosa e pessoal.
- Sample phrases (VARIE, combine de formas diferentes):
  - "{{{{nome}}}}, vou te encaminhar pelo WhatsApp a ementa da pós pra você dar uma olhada no conteúdo, tá?"
  - "E vou mandar também um voucher que isenta da taxa de matrícula. Ele tem validade, então fica de olho!"
  - "Então recapitulando: sua conversa com a consultora fica pra [dia] às [hora]. Ela vai te ligar nesse horário."
  - "Até o momento ficou com alguma dúvida?"
  - "{{{{nome}}}}, muito obrigada pelo seu tempo! Foi muito bom falar com você. Um abraço e até mais!"
  - "Qualquer coisa antes da reunião, pode me chamar, tá? Um beijo e até mais!"

# Unclear Audio

- Se não ouvir direito, peça para repetir naturalmente.
- "Desculpa, não consegui ouvir. Pode repetir?"
- "Acho que cortou, o que você disse?"

# Tools

- Before ANY tool call, say one short natural line. Then call IMMEDIATELY.
- Use update_lead_fields() quando extrair informações (formação, onde trabalha, objetivo, prazo, pagamento).
- Use change_state() para avançar no fluxo.
- Use register_objection() quando detectar objeção.
- Use schedule_meeting() quando o candidato aceitar agendar.
- Use end_call() APENAS após a despedida completa.

# Safety & Escalation

- Se o candidato pedir para falar com um humano: "Claro! Vou te transferir agora mesmo."
- Se disser "NÃO QUERO" de forma firme, RESPEITE e encerre com educação.
{script_override}{rag_context}{policy_text}{objection_responses}"""

    # --------------------------------------------------------
    # TOOLS DEFINITION
    # --------------------------------------------------------

    def _build_tools(self) -> list:
        """Define as funções disponíveis para o Realtime API."""
        return [
            {
                "type": "function",
                "name": "update_lead_fields",
                "description": (
                    "Atualizar dados coletados do lead. "
                    "Chame sempre que extrair informações da conversa."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "confirmed_interest": {
                            "type": "string",
                            "description": "Lead confirmou interesse? (sim/não)",
                        },
                        "objetivo": {
                            "type": "string",
                            "description": "Objetivo do lead com o curso",
                        },
                        "prazo": {
                            "type": "string",
                            "description": "Prazo para começar (ex: mês que vem, 3 meses)",
                        },
                        "disponibilidade": {
                            "type": "string",
                            "description": "Disponibilidade de horário do lead",
                        },
                        "forma_pagamento": {
                            "type": "string",
                            "description": "Preferência de pagamento",
                        },
                    },
                },
            },
            {
                "type": "function",
                "name": "change_state",
                "description": "Mudar o estado da conversa quando avançar no fluxo.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "new_state": {
                            "type": "string",
                            "enum": [
                                "OPENING", "CONTEXT", "QUALIFY",
                                "HANDLE_OBJECTION", "SCHEDULE",
                                "WARM_TRANSFER", "FOLLOW_UP", "CLOSE",
                            ],
                            "description": "Novo estado da conversa",
                        },
                        "reason": {
                            "type": "string",
                            "description": "Motivo da mudança de estado",
                        },
                    },
                    "required": ["new_state"],
                },
            },
            {
                "type": "function",
                "name": "register_objection",
                "description": "Registrar quando o lead expressar uma objeção.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "objection": {
                            "type": "string",
                            "description": "Objeção expressa pelo lead (ex: preço alto, sem tempo)",
                        },
                    },
                    "required": ["objection"],
                },
            },
            {
                "type": "function",
                "name": "schedule_meeting",
                "description": "Agendar reunião quando o lead aceitar.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "date": {
                            "type": "string",
                            "description": "Data combinada (DD/MM/AAAA)",
                        },
                        "time": {
                            "type": "string",
                            "description": "Hora combinada (HH:MM)",
                        },
                    },
                    "required": ["date", "time"],
                },
            },
            {
                "type": "function",
                "name": "end_call",
                "description": "Encerrar a chamada. Use APENAS depois de se despedir.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "reason": {
                            "type": "string",
                            "description": "Motivo (despedida, lead desligou, ocupado)",
                        },
                    },
                    "required": ["reason"],
                },
            },
        ]

    # --------------------------------------------------------
    # FINALIZAÇÃO
    # --------------------------------------------------------

    async def _finalize_call(self):
        """Finaliza a chamada: gera resumo, calcula score, prepara dados."""
        if self._finalized:
            return
        self._finalized = True
        self.session.is_active = False

        # Gerar resumo
        summary = ""
        try:
            summary = await generate_call_summary(self.session)
        except Exception as e:
            print(f"⚠️ Erro ao gerar resumo: {e}")
            summary = f"Erro: {e}"

        outcome = self.fsm.determine_outcome()
        score, breakdown = self.session.calculate_score()

        duration = int(time.time() - self.call_start_time)
        print(
            f"📋 Chamada finalizada: outcome={outcome}, "
            f"score={score}, turnos={self.session.turn_count}, duração={duration}s"
        )

        self.final_data = {
            "outcome": outcome,
            "score": score,
            "score_breakdown": breakdown,
            "collected_fields": self.session.collected_fields,
            "objections": self.session.objections,
            "tags": self.session.tags,
            "summary": summary,
            "total_turns": self.session.turn_count,
            "avg_latency_ms": 0,
            "duration_seconds": duration,
            "handoff_type": self._get_handoff_type(),
        }

    def _get_handoff_type(self) -> Optional[str]:
        state_to_handoff = {
            State.SCHEDULE: "schedule",
            State.WARM_TRANSFER: "warm_transfer",
            State.FOLLOW_UP: "follow_up",
        }
        return state_to_handoff.get(self.session.state)


# ============================================================
# STORE GLOBAL DE SESSÕES ATIVAS
# ============================================================

active_pipelines: dict[str, VoicePipeline] = {}


def get_pipeline(call_sid: str) -> Optional[VoicePipeline]:
    return active_pipelines.get(call_sid)


def register_pipeline(call_sid: str, pipeline: VoicePipeline):
    active_pipelines[call_sid] = pipeline


def remove_pipeline(call_sid: str):
    active_pipelines.pop(call_sid, None)