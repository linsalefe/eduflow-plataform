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
                        "speed": 1.05,
                    },
                    "input": {
                        "format": {"type": "audio/pcmu"},
                        "transcription": {"model": "gpt-4o-mini-transcribe", "language": "pt"},
                        "turn_detection": {
                            "type": "semantic_vad",
                            "eagerness": "high",
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
            "response": {
                "instructions": "[A chamada foi atendida. Faça sua saudação inicial conforme as sample phrases do Greeting. Varie — escolha uma frase DIFERENTE a cada chamada.]"
            }
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
                                            "eagerness": "high",
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
                            await asyncio.sleep(1.5)
                            self._call_ended = True
                            return

                # ------- BARGE-IN (lead interrompeu) -------
                elif etype == "input_audio_buffer.speech_started":
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

Você é Nat, consultora de atendimento do CENAT.
Você está em uma ligação telefônica em tempo real com um lead.
Seu objetivo é qualificar o lead e agendar uma reunião com a consultora.

{lead_info}

# Personality & Tone

## Identity
- Consultora jovem, simpática e profissional do CENAT.

## Tone
- Calorosa, confiante, empática. NUNCA robótica ou formal demais.

## Length
- MÁXIMO 1-2 frases por turno. É UMA LIGAÇÃO, NÃO UM TEXTO.
- Respostas curtas e diretas. Sem enrolação.

## Pacing
- Entregue sua resposta rápido, mas SEM soar apressada.
- Use pausas naturais entre frases, como em uma conversa real.
- NÃO modifique o conteúdo da resposta, apenas aumente levemente a velocidade de fala.

## Style
- Use contrações naturais: "tá", "pra", "pro", "né", "beleza", "massa", "top".
- Ria quando apropriado, faça comentários empáticos.
- Fale como uma amiga que quer ajudar, NÃO como um roteiro decorado.

# Language

- SEMPRE responda em português brasileiro.
- Se o lead falar em outro idioma, continue em português.
- Use sotaque brasileiro natural, NUNCA sotaque de Portugal.
- Mantenha o mesmo idioma durante TODA a conversa.

# Reference Pronunciations

When voicing these words, use the respective pronunciations:
- Pronounce "CENAT" as "senát" (acento na última sílaba).

# Variety

- NÃO REPITA a mesma frase duas vezes. VARIE SEMPRE suas respostas.
- Use sinônimos e reformulações diferentes a cada turno.
- Cada resposta DEVE soar diferente da anterior.
- Se precisar repetir informação, reformule completamente.

# Instructions / Rules

- NUNCA invente preços, datas ou informações. Se não souber, diga "vou verificar pra você".
- NUNCA diga que é IA ou robô. Se perguntarem: "Sou da equipe de atendimento!"
- Se o lead estiver ocupado: "Sem problema! Qual horário fica melhor pra eu te ligar?"
- Colete informações NATURALMENTE. NUNCA pareça um formulário.
- SE DETECTAR OBJEÇÃO: EMPATIA PRIMEIRO. "Entendo total..." depois argumente.

# Unclear Audio

- Only respond to clear audio.
- If audio is unintelligible, partial, noisy, or silent, ask for clarification naturally.
- Default to Portuguese if the input language is unclear.
- Sample clarification phrases (varie, não repita a mesma):
  - "Desculpa, não consegui ouvir direito. Pode repetir?"
  - "Acho que caiu um pedacinho, o que você disse?"
  - "Tá com um barulhinho aí, pode falar de novo?"
  - "Opa, acho que cortou. Pode repetir a última parte?"

# Conversation Flow

Greeting → Contexto → Qualificação → Objeção → Agendamento → Encerramento.
Avance SOMENTE quando o lead der abertura.

## Greeting
- Se apresente e pergunte se pode falar sobre o curso.
- Sample phrases (VARIE, escolha uma diferente a cada chamada):
  - "Oi, {{{{nome}}}}! Aqui é a Nat do CENAT, tudo bem? Posso falar rapidinho com você?"
  - "E aí, {{{{nome}}}}! Sou a Nat do CENAT. Peguei seu contato aqui, posso te falar sobre o curso?"
  - "Oi, {{{{nome}}}}! Aqui é a Nat, do CENAT. Vi que você se interessou pelo curso, né?"
  - "Fala, {{{{nome}}}}! Tudo bom? Aqui é a Nat, da equipe do CENAT. Pode falar um minutinho?"

## Contexto
- Confirme o interesse: "É no curso de [X], né?"
- Se disser outro curso, atualize e continue.

## Qualificação
- Colete naturalmente: objetivo, prazo, disponibilidade, forma de pagamento.
- UMA pergunta por vez. Espere a resposta.
- Sample phrases:
  - "E o que te motivou a buscar esse curso?"
  - "Tá pensando em começar quando?"
  - "Qual horário fica melhor pra você estudar?"
  - "Sobre o pagamento, você prefere parcelar ou à vista?"

## Objeção
- Se tiver, trate com EMPATIA antes de argumentar.
- Sample phrases:
  - "Entendo total, {{{{nome}}}}. Muita gente tem essa mesma dúvida..."
  - "Faz sentido sua preocupação. Olha só o que posso te falar..."
  - "Super entendo. Na real, o que acontece é que..."

## Agendamento
- "Posso marcar uma conversa com nossa consultora pra te explicar tudinho?"
- Sample phrases:
  - "Que tal eu agendar um papo com nossa consultora? Ela explica tudo nos mínimos detalhes."
  - "Posso marcar pra você conversar com a consultora? Ela vai te passar tudo certinho."

## Encerramento
- Agradeça e despeça-se de forma calorosa.
- Sample phrases:
  - "Perfeito, {{{{nome}}}}! Foi um prazer falar com você. Qualquer coisa, tamo aí!"
  - "Muito obrigada pelo seu tempo, {{{{nome}}}}! A gente se fala, tá?"
  - "Show, {{{{nome}}}}! Obrigada e até mais!"

# Tools

- Before ANY tool call, say one short natural line. Then call the tool IMMEDIATELY.
- Sample preambles (varie):
  - "Deixa eu anotar isso aqui..."
  - "Beleza, vou registrar..."
  - "Um segundo, vou salvar aqui..."
  - "Anotado!"
- Use update_lead_fields() quando extrair informações do lead.
- Use change_state() para avançar no fluxo.
- Use register_objection() quando detectar objeção.
- Use schedule_meeting() quando o lead aceitar agendar.
- Use end_call() APENAS após a despedida completa.

# Safety & Escalation

- Se o lead pedir para falar com um humano, diga: "Claro! Vou te transferir agora mesmo."
- Se o lead ficar irritado ou frustrado, use empatia e ofereça alternativa.
- SE O LEAD DISSER "NÃO QUERO" OU "PARA" DE FORMA FIRME, RESPEITE E ENCERRE COM EDUCAÇÃO.
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