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

v3.1: Compatível com websockets v13+ (ClientConnection API)
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

    # --------------------------------------------------------
    # ENTRY POINT
    # --------------------------------------------------------

    async def handle_websocket(self, twilio_ws):
        """
        Handler principal. Conecta ao OpenAI Realtime e faz relay bidirecional.
        """
        self.twilio_ws = twilio_ws
        self.call_start_time = time.time()
        self.session.started_at = datetime.utcnow()

        url = f"wss://api.openai.com/v1/realtime?model={REALTIME_MODEL}"
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "OpenAI-Beta": "realtime=v1",
        }

        try:
            async with websockets.connect(
                url,
                additional_headers=headers,
            ) as openai_ws:
                self.openai_ws = openai_ws
                print(f"✅ Conectado ao OpenAI Realtime API ({REALTIME_MODEL})")

                # 1. Configurar sessão
                await self._configure_session()

                # 2. Enviar greeting (a IA fala a saudação)
                await self._trigger_greeting()

                # 3. Relay bidirecional
                twilio_task = asyncio.create_task(self._relay_twilio_to_openai())
                openai_task = asyncio.create_task(self._relay_openai_to_twilio())

                done, pending = await asyncio.wait(
                    [twilio_task, openai_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )

                # Cancelar a task que ainda está rodando
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
        """Envia configuração da sessão para o OpenAI Realtime."""
        system_prompt = self._build_system_prompt()
        tools = self._build_tools()

        config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": system_prompt,
                "voice": REALTIME_VOICE,
                "input_audio_format": "g711_ulaw",
                "output_audio_format": "g711_ulaw",
                "input_audio_transcription": {
                    "model": "whisper-1",
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 700,
                },
                "tools": tools,
                "tool_choice": "auto",
                "temperature": 0.7,
                "max_response_output_tokens": 200,
            },
        }
        await self._send_to_openai(config)

        # Esperar confirmação
        try:
            async for msg in self.openai_ws:
                event = json.loads(msg)
                if event["type"] == "session.updated":
                    print("✅ Sessão Realtime configurada")
                    break
                elif event["type"] == "error":
                    print(f"❌ Erro na configuração: {event.get('error', {})}")
                    break
        except Exception as e:
            print(f"❌ Erro aguardando configuração: {e}")

    async def _trigger_greeting(self):
        """
        Dispara o greeting: cria uma mensagem de sistema e pede
        para a IA se apresentar. A IA fala com voz natural.
        """
        create_msg = {
            "type": "conversation.item.create",
            "item": {
                "type": "message",
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": "[A chamada foi atendida. Faça sua saudação inicial.]",
                    }
                ],
            },
        }
        await self._send_to_openai(create_msg)
        await self._send_to_openai({"type": "response.create"})
        print("🎙️ Greeting solicitado ao Realtime API")

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
        try:
            async for message in self.openai_ws:
                if self._call_ended:
                    break

                event = json.loads(message)
                etype = event.get("type", "")

                # ------- ÁUDIO: IA → Twilio -------
                if etype == "response.audio.delta":
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
                elif etype == "response.audio_transcript.done":
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
    # SYSTEM PROMPT
    # --------------------------------------------------------

    def _build_system_prompt(self) -> str:
        """Monta o system prompt completo para o Realtime API."""

        lead_info = f"""
DADOS DO LEAD:
- Nome: {self.session.lead_name}
- Telefone: {self.session.lead_phone}
- Curso de interesse: {self.session.course or 'não especificado'}
- Origem: {self.session.source or 'site'}
- Campanha: {self.session.campaign or 'orgânico'}
"""

        rag_context = ""
        if self.rag_snippets:
            rag_context = "\nBASE DE CONHECIMENTO (use para responder perguntas):\n"
            for s in self.rag_snippets:
                rag_context += f"- {s.get('title', '')}: {s.get('content', '')}\n"

        policy_text = ""
        if self.policies:
            policy_text = "\nPOLÍTICAS (respeite rigorosamente):\n"
            for k, v in self.policies.items():
                policy_text += f"- {k}: {v}\n"

        script_override = ""
        if self.script and self.script.system_prompt_override:
            script_override = f"\nINSTRUÇÕES DO SCRIPT:\n{self.script.system_prompt_override}\n"

        objection_responses = ""
        if self.script and self.script.objection_responses:
            objection_responses = "\nRESPOSTAS PARA OBJEÇÕES:\n"
            for obj, resp in self.script.objection_responses.items():
                objection_responses += f"- Se disser '{obj}': {resp}\n"

        return f"""Você é Nat, consultora de atendimento de uma instituição de ensino.
Você está em uma LIGAÇÃO TELEFÔNICA em tempo real com um lead.

{lead_info}

PERSONALIDADE:
- Simpática, animada mas profissional
- Fala como brasileira natural, com expressões coloquiais
- Usa "né", "tá", "beleza", "massa" naturalmente
- Ri quando apropriado, faz comentários empáticos
- Tom de voz caloroso, como uma amiga que quer ajudar

REGRAS ABSOLUTAS:
1. FRASES CURTÍSSIMAS. Máximo 1-2 frases por vez. É uma ligação, não um texto.
2. Fale naturalmente. Use contrações: "tá", "pra", "pro", "vc", "né"
3. NUNCA invente preços, datas ou informações. Se não souber, diga que vai verificar.
4. NUNCA diga que é uma IA ou robô. Se perguntarem: "Sou da equipe de atendimento!"
5. Se o lead estiver ocupado: "Sem problema! Qual horário fica melhor pra eu te ligar?"
6. Colete informações NATURALMENTE. Nunca pareça um formulário.
7. Se detectar objeção: EMPATIA PRIMEIRO. "Entendo total..." depois argumente.

FLUXO DA CONVERSA:
1. SAUDAÇÃO → Se apresente, pergunte se pode falar sobre o curso
2. CONTEXTO → Confirme o interesse: "É no curso de [X], né?"
3. QUALIFICAÇÃO → Colete naturalmente: objetivo, prazo, disponibilidade, forma de pagamento
4. OBJEÇÃO → Se tiver, trate com empatia
5. AGENDAMENTO → "Posso marcar uma conversa com nossa consultora pra te explicar tudo?"
6. ENCERRAMENTO → Agradeça e despeça-se

FUNÇÕES DISPONÍVEIS:
- Use update_lead_fields() quando extrair informações do lead
- Use change_state() para avançar no fluxo
- Use register_objection() quando detectar objeção
- Use schedule_meeting() quando o lead aceitar agendar
- Use end_call() APENAS após a despedida completa

COMECE se apresentando ao lead de forma calorosa e natural.
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