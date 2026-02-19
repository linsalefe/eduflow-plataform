"""
Rotas da API Voice AI.
Endpoints para: disparar chamadas, webhooks Twilio, WebSocket Media Streams,
gerenciamento de chamadas, dashboard de métricas.
"""
import json
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Request, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, case

from app.database import get_db, async_session
from app.auth import get_current_user
from app.models import Contact, ExactLead, Channel

from app.voice_ai.models import AICall, AICallTurn, AICallEvent, AICallQA, VoiceScript
from app.voice_ai.fsm import FSMEngine, CallSession, State
from app.voice_ai.voice_pipeline import VoicePipeline, register_pipeline, remove_pipeline, get_pipeline
from app.voice_ai.llm_contract import generate_call_summary
from app.voice_ai.crm_adapter import update_lead_after_call, move_lead_in_funnel
from app.voice_ai.scheduler_adapter import (
    schedule_meeting, send_schedule_confirmation,
    send_followup_message, get_next_available_slots,
)
from app.voice_ai.config import (
    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER,
    BASE_URL, MAX_CALL_RETRIES, RETRY_DELAY_MINUTES,
)

SP_TZ = timezone(timedelta(hours=-3))

router = APIRouter(prefix="/api/voice-ai", tags=["Voice AI"])


# ============================================================
# SCHEMAS
# ============================================================

class NewLeadRequest(BaseModel):
    """Lead novo entrando pelo LP/CRM."""
    name: str
    phone: str
    course: str = ""
    source: str = ""
    campaign: str = ""
    channel_id: int = None
    lead_id: int = None  # exact_lead.id se vier do CRM
    priority: str = "normal"  # normal|high|low


class ManualCallRequest(BaseModel):
    """Disparo manual de chamada IA."""
    contact_wa_id: str
    course: str = ""
    script_id: int = None


class CallActionRequest(BaseModel):
    """Ação em uma chamada ativa."""
    action: str  # transfer|end


class ScriptCreateRequest(BaseModel):
    """Criar/atualizar roteiro."""
    name: str
    course: str = None
    persona: str = None
    channel_id: int = None
    opening_text: str = None
    context_text: str = None
    qualify_questions: list = None
    objection_responses: dict = None
    closing_text: str = None
    policies: dict = None
    system_prompt_override: str = None


# ============================================================
# 1. INBOUND: Receber lead novo
# ============================================================

@router.post("/leads/new")
async def receive_new_lead(data: NewLeadRequest, db: AsyncSession = Depends(get_db)):
    """
    Recebe lead novo (de LP, CRM, ou webhook) e agenda chamada.
    Este é o ponto de entrada principal do sistema.
    """
    # Formatar telefone
    phone = data.phone.replace("+", "").replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
    if not phone.startswith("55"):
        phone = "55" + phone
    to_number = f"+{phone}"

    # Buscar/criar contato
    result = await db.execute(select(Contact).where(Contact.wa_id == phone))
    contact = result.scalar_one_or_none()
    if not contact:
        contact = Contact(
            wa_id=phone,
            name=data.name,
            lead_status="novo",
            channel_id=data.channel_id,
        )
        db.add(contact)
        await db.flush()

    # Buscar lead no Exact se não veio
    lead_id = data.lead_id
    if not lead_id:
        result = await db.execute(
            select(ExactLead).where(
                (ExactLead.phone1.contains(phone[-8:])) |
                (ExactLead.phone2.contains(phone[-8:]))
            )
        )
        exact_lead = result.scalar_one_or_none()
        if exact_lead:
            lead_id = exact_lead.exact_id

    # Criar registro da chamada
    ai_call = AICall(
        lead_id=lead_id,
        contact_wa_id=phone,
        from_number=TWILIO_PHONE_NUMBER,
        to_number=to_number,
        direction="outbound",
        status="pending",
        lead_name=data.name,
        course=data.course,
        campaign=data.campaign,
        source=data.source,
    )
    db.add(ai_call)
    await db.commit()
    await db.refresh(ai_call)

    # Disparar chamada (assíncrono)
    asyncio.create_task(_initiate_call(ai_call.id, to_number, data.name, data.course))

    return {
        "call_id": ai_call.id,
        "status": "pending",
        "message": f"Chamada agendada para {data.name} ({to_number})",
    }


# ============================================================
# 2. TWILIO CALLBACKS
# ============================================================

@router.post("/twilio/status")
async def twilio_status_callback(request: Request):
    """
    Webhook do Twilio: atualiza status da chamada.
    Eventos: initiated, ringing, answered, completed, busy, no-answer, failed
    """
    form = await request.form()
    call_sid = form.get("CallSid", "")
    status = form.get("CallStatus", "")
    duration = form.get("CallDuration", "0")

    async with async_session() as db:
        result = await db.execute(
            select(AICall).where(AICall.twilio_call_sid == call_sid)
        )
        call = result.scalar_one_or_none()

        if call:
            call.status = status
            call.duration_seconds = int(duration) if duration else 0

            if status == "answered":
                call.answered_at = datetime.now(SP_TZ).replace(tzinfo=None)
            elif status in ["completed", "busy", "no-answer", "failed", "canceled"]:
                call.ended_at = datetime.now(SP_TZ).replace(tzinfo=None)

                # Se não atendeu, agendar retry
                if status in ["busy", "no-answer"] and call.attempt_number < MAX_CALL_RETRIES:
                    call.outcome = status.replace("-", "_")
                    asyncio.create_task(_schedule_retry(call.id))

            # Registrar evento
            event = AICallEvent(
                call_id=call.id,
                event="twilio_status",
                payload={"status": status, "duration": duration},
            )
            db.add(event)
            await db.commit()

    print(f"📞 Voice AI Call {call_sid}: {status} ({duration}s)")
    return Response(content="", media_type="application/xml")


@router.post("/twilio/answer")
async def twilio_answer_twiml(request: Request):
    """
    TwiML retornado quando a chamada é atendida.
    v3: Só conecta o Media Stream. Greeting via Realtime API.
    """
    from twilio.twiml.voice_response import VoiceResponse, Connect, Stream

    form = await request.form()
    call_sid = form.get("CallSid", "")

    response = VoiceResponse()

    # Conectar Media Stream bidirecional
    connect = Connect()
    stream = Stream(
        url=f"{BASE_URL.replace('https', 'wss')}/api/voice-ai/stream",
        name="voice_ai_stream",
    )
    stream.parameter(name="call_sid", value=call_sid)
    connect.append(stream)
    response.append(connect)

    print(f"📞 TwiML: Connect Stream para {call_sid}")
    return Response(content=str(response), media_type="application/xml")

@router.post("/twilio/recording-status")
async def twilio_recording_callback(request: Request):
    """Webhook de gravação (quando termina)."""
    form = await request.form()
    call_sid = form.get("CallSid", "")
    recording_url = form.get("RecordingUrl", "")
    recording_sid = form.get("RecordingSid", "")

    if recording_url:
        async with async_session() as db:
            result = await db.execute(
                select(AICall).where(AICall.twilio_call_sid == call_sid)
            )
            call = result.scalar_one_or_none()
            if call:
                call.recording_url = f"{recording_url}.mp3"
                await db.commit()

    return Response(content="", media_type="application/xml")


# ============================================================
# 3. WEBSOCKET: Media Stream
# ============================================================

@router.websocket("/stream")
async def websocket_media_stream(websocket: WebSocket):
    """
    WebSocket para Twilio Media Streams.
    Aqui acontece toda a conversa em tempo real:
    STT → LLM → TTS → áudio de volta.
    """
    await websocket.accept()

    call_sid = None
    pipeline = None

    try:
        # Primeiro pacote contém metadata
        async for message in websocket.iter_text():
            data = json.loads(message)

            if data.get("event") == "start":
                # Extrair call_sid dos parâmetros
                start_data = data.get("start", {})
                custom_params = start_data.get("customParameters", {})
                call_sid = custom_params.get("call_sid", start_data.get("callSid", ""))

                import time as _time
                _t0 = _time.perf_counter()
                print(f"[TIMING] stream_connected dt_ms=0")
                print(f"🎙️ Media Stream conectado para chamada: {call_sid}")

                # Buscar dados da chamada no DB
                async with async_session() as db:
                    result = await db.execute(
                        select(AICall).where(AICall.twilio_call_sid == call_sid)
                    )
                    ai_call = result.scalar_one_or_none()

                    if not ai_call:
                        print(f"❌ Chamada não encontrada: {call_sid}")
                        break

                    # Criar sessão FSM
                    session = CallSession(
                        call_id=ai_call.id,
                        lead_id=ai_call.lead_id,
                        lead_name=ai_call.lead_name or "",
                        lead_phone=ai_call.to_number,
                        course=ai_call.course or "",
                        source=ai_call.source or "",
                        campaign=ai_call.campaign or "",
                    )

                    # Buscar RAG snippets se tiver curso (com timeout de 3s)
                    rag_snippets = []
                    if ai_call.course:
                        try:
                            from app.ai_engine import search_knowledge
                            result2 = await db.execute(select(Channel).limit(1))
                            channel = result2.scalar_one_or_none()
                            if channel:
                                rag_snippets = await asyncio.wait_for(
                                    search_knowledge(ai_call.course, channel.id, db, top_k=3),
                                    timeout=3.0,
                                )
                                print(f"📚 RAG: {len(rag_snippets)} snippets carregados")
                        except asyncio.TimeoutError:
                            print("⚠️ RAG timeout (3s) — seguindo sem snippets")
                            rag_snippets = []
                        except Exception as e:
                            print(f"⚠️ RAG erro: {e} — seguindo sem snippets")
                            rag_snippets = []

                    # Buscar script ativo
                    script = None
                    script_result = await db.execute(
                        select(VoiceScript).where(
                            VoiceScript.is_active == True,
                            (VoiceScript.course == ai_call.course) | (VoiceScript.course == None)
                        ).order_by(desc(VoiceScript.course))  # Específico primeiro
                        .limit(1)
                    )
                    script = script_result.scalar_one_or_none()

                # Criar FSM e Pipeline
                fsm = FSMEngine(session)
                pipeline = VoicePipeline(session, fsm)
                pipeline._t0 = _t0
                pipeline.rag_snippets = rag_snippets

                if script and script.policies:
                    pipeline.policies = script.policies
                if script:
                    pipeline.script = script

                register_pipeline(call_sid, pipeline)

                # Passar stream_sid para o pipeline
                pipeline.stream_sid = data.get("start", {}).get("streamSid")

                # Atualizar status
                async with async_session() as db:
                    result = await db.execute(
                        select(AICall).where(AICall.twilio_call_sid == call_sid)
                    )
                    ai_call = result.scalar_one_or_none()
                    if ai_call:
                        ai_call.status = "in_progress"
                        ai_call.fsm_state = "OPENING"
                        db.add(AICallEvent(
                            call_id=ai_call.id,
                            event="stream_connected",
                            payload={"stream_sid": data.get("start", {}).get("streamSid")},
                        ))
                        await db.commit()

                # Delegar o processamento para o pipeline
                await pipeline.handle_websocket(websocket)
                break  # Pipeline assume o controle

            elif data.get("event") == "connected":
                continue

    except WebSocketDisconnect:
        print(f"🔌 WebSocket desconectado: {call_sid}")
    except Exception as e:
        print(f"❌ Erro no WebSocket: {e}")
    finally:
        # Salvar dados finais da chamada
        if pipeline and call_sid:
            await _save_call_results(call_sid, pipeline)
            remove_pipeline(call_sid)


# ============================================================
# 4. GERENCIAMENTO DE CHAMADAS
# ============================================================

@router.post("/calls/{call_id}/transfer")
async def transfer_call(call_id: int, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Transfere chamada ativa para um closer (warm transfer)."""
    result = await db.execute(select(AICall).where(AICall.id == call_id))
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(404, "Chamada não encontrada")

    # Buscar pipeline ativo
    pipeline = get_pipeline(call.twilio_call_sid)
    if pipeline:
        # Encerrar pipeline e fazer transfer via Twilio
        pipeline.session.is_active = False
        pipeline.fsm.transition(State.WARM_TRANSFER)

    # Fazer transfer via Twilio API
    from twilio.rest import Client
    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        # Atualizar chamada com TwiML de transfer
        client.calls(call.twilio_call_sid).update(
            twiml=f'<Response><Say language="pt-BR">Vou te transferir para nossa consultora. Um momento.</Say><Dial>{TWILIO_PHONE_NUMBER}</Dial></Response>'
        )
        call.handoff_type = "warm_transfer"
        call.outcome = "transferred"
        await db.commit()
        return {"status": "transferred"}
    except Exception as e:
        raise HTTPException(500, f"Erro ao transferir: {e}")


@router.post("/calls/{call_id}/end")
async def end_call(call_id: int, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Encerra uma chamada ativa."""
    result = await db.execute(select(AICall).where(AICall.id == call_id))
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(404, "Chamada não encontrada")

    from twilio.rest import Client
    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        client.calls(call.twilio_call_sid).update(status="completed")
        return {"status": "ended"}
    except Exception as e:
        raise HTTPException(500, f"Erro ao encerrar: {e}")


@router.get("/calls/{call_id}")
async def get_call_detail(call_id: int, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Retorna detalhes completos de uma chamada."""
    result = await db.execute(select(AICall).where(AICall.id == call_id))
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(404, "Chamada não encontrada")

    # Buscar turnos
    turns_result = await db.execute(
        select(AICallTurn).where(AICallTurn.call_id == call_id).order_by(AICallTurn.created_at)
    )
    turns = turns_result.scalars().all()

    # Buscar QA
    qa_result = await db.execute(
        select(AICallQA).where(AICallQA.call_id == call_id)
    )
    qa = qa_result.scalar_one_or_none()

    return {
        "call": _serialize_call(call),
        "transcript": [
            {
                "role": t.role,
                "text": t.text,
                "state": t.fsm_state,
                "latency_ms": t.total_latency_ms,
                "action": t.action,
                "barge_in": t.barge_in,
                "timestamp": t.created_at.isoformat() if t.created_at else None,
            }
            for t in turns
        ],
        "qa": {
            "script_adherence": qa.script_adherence,
            "clarity_score": qa.clarity_score,
            "fields_completion": qa.fields_completion,
            "overall_score": qa.overall_score,
            "notes": qa.notes,
        } if qa else None,
    }


# ============================================================
# 5. DASHBOARD & MÉTRICAS
# ============================================================

@router.get("/calls")
async def list_calls(
    limit: int = 50,
    offset: int = 0,
    status: str = None,
    outcome: str = None,
    course: str = None,
    date_from: str = None,
    date_to: str = None,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista chamadas com filtros."""
    query = select(AICall).order_by(desc(AICall.created_at))

    if status:
        query = query.where(AICall.status == status)
    if outcome:
        query = query.where(AICall.outcome == outcome)
    if course:
        query = query.where(AICall.course.ilike(f"%{course}%"))
    if date_from:
        query = query.where(AICall.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        query = query.where(AICall.created_at <= datetime.fromisoformat(date_to))

    result = await db.execute(query.limit(limit).offset(offset))
    calls = result.scalars().all()

    # Total
    count_query = select(func.count(AICall.id))
    if status:
        count_query = count_query.where(AICall.status == status)
    total = (await db.execute(count_query)).scalar() or 0

    return {
        "total": total,
        "calls": [_serialize_call(c) for c in calls],
    }


@router.get("/dashboard")
async def get_dashboard(
    days: int = 7,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Dashboard com métricas do Voice AI."""
    since = datetime.now() - timedelta(days=days)

    # Total de chamadas
    total = (await db.execute(
        select(func.count(AICall.id)).where(AICall.created_at >= since)
    )).scalar() or 0

    # Atendidas
    answered = (await db.execute(
        select(func.count(AICall.id)).where(
            AICall.created_at >= since,
            AICall.status == "completed",
        )
    )).scalar() or 0

    # Por outcome
    outcomes = (await db.execute(
        select(AICall.outcome, func.count(AICall.id))
        .where(AICall.created_at >= since, AICall.outcome != None)
        .group_by(AICall.outcome)
    )).all()

    # Score médio
    avg_score = (await db.execute(
        select(func.avg(AICall.score)).where(
            AICall.created_at >= since,
            AICall.score > 0,
        )
    )).scalar() or 0

    # Latência média
    avg_latency = (await db.execute(
        select(func.avg(AICall.avg_latency_ms)).where(
            AICall.created_at >= since,
            AICall.avg_latency_ms > 0,
        )
    )).scalar() or 0

    # Duração média
    avg_duration = (await db.execute(
        select(func.avg(AICall.duration_seconds)).where(
            AICall.created_at >= since,
            AICall.duration_seconds > 0,
        )
    )).scalar() or 0

    # Por dia
    from sqlalchemy import text as sa_text
    daily = (await db.execute(
        sa_text("""
            SELECT date_trunc('day', created_at) AS day,
                   count(id) AS total,
                   sum(CASE WHEN outcome = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
                   sum(CASE WHEN outcome = 'qualified' THEN 1 ELSE 0 END) AS qualified
            FROM ai_calls
            WHERE created_at >= :since
            GROUP BY date_trunc('day', created_at)
            ORDER BY date_trunc('day', created_at)
        """),
        {"since": since}
    )).all()

    # Por curso
    by_course = (await db.execute(
        select(AICall.course, func.count(AICall.id), func.avg(AICall.score))
        .where(AICall.created_at >= since, AICall.course != None)
        .group_by(AICall.course)
        .order_by(func.count(AICall.id).desc())
    )).all()

    return {
        "period_days": days,
        "total_calls": total,
        "answered_calls": answered,
        "answer_rate": round(answered / total * 100, 1) if total > 0 else 0,
        "avg_score": round(float(avg_score), 1),
        "avg_latency_ms": round(float(avg_latency)),
        "avg_duration_seconds": round(float(avg_duration)),
        "outcomes": {r[0]: r[1] for r in outcomes},
        "daily": [
            {
                "date": str(r[0])[:10] if r[0] else None,
                "total": r[1],
                "scheduled": r[2],
                "qualified": r[3],
            }
            for r in daily
        ],
        "by_course": [
            {"course": r[0], "total": r[1], "avg_score": round(float(r[2] or 0), 1)}
            for r in by_course
        ],
    }


# ============================================================
# 6. ROTEIROS / SCRIPTS
# ============================================================

@router.get("/scripts")
async def list_scripts(current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Lista roteiros ativos."""
    result = await db.execute(
        select(VoiceScript).where(VoiceScript.is_active == True).order_by(VoiceScript.name)
    )
    scripts = result.scalars().all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "course": s.course,
            "persona": s.persona,
            "has_opening": bool(s.opening_text),
            "has_qualify": bool(s.qualify_questions),
            "has_objections": bool(s.objection_responses),
        }
        for s in scripts
    ]


@router.post("/scripts")
async def create_script(data: ScriptCreateRequest, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Cria novo roteiro."""
    script = VoiceScript(
        name=data.name,
        course=data.course,
        persona=data.persona,
        channel_id=data.channel_id,
        opening_text=data.opening_text,
        context_text=data.context_text,
        qualify_questions=data.qualify_questions,
        objection_responses=data.objection_responses,
        closing_text=data.closing_text,
        policies=data.policies,
        system_prompt_override=data.system_prompt_override,
    )
    db.add(script)
    await db.commit()
    await db.refresh(script)
    return {"id": script.id, "message": "Roteiro criado"}


# ============================================================
# 7. DISPARO MANUAL
# ============================================================

@router.post("/calls/manual")
async def manual_call(data: ManualCallRequest, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Dispara chamada IA manualmente para um contato existente."""
    result = await db.execute(
        select(Contact).where(Contact.wa_id == data.contact_wa_id)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(404, "Contato não encontrado")

    return await receive_new_lead(
        NewLeadRequest(
            name=contact.name or "Lead",
            phone=data.contact_wa_id,
            course=data.course,
        ),
        db=db,
    )


# ============================================================
# FUNÇÕES AUXILIARES
# ============================================================

async def _initiate_call(call_id: int, to_number: str, lead_name: str, course: str):
    """Dispara a chamada no Twilio."""
    from twilio.rest import Client

    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

        call = client.calls.create(
            to=to_number,
            from_=TWILIO_PHONE_NUMBER,
            url=f"{BASE_URL}/api/voice-ai/twilio/answer",
            status_callback=f"{BASE_URL}/api/voice-ai/twilio/status",
            status_callback_event=["initiated", "ringing", "answered", "completed"],
            record=True,
            recording_status_callback=f"{BASE_URL}/api/voice-ai/twilio/recording-status",
            machine_detection="Enable",  # Detectar secretária eletrônica
            machine_detection_timeout=5,
            timeout=30,  # 30s para atender
        )

        # Atualizar call_sid no banco
        async with async_session() as db:
            result = await db.execute(select(AICall).where(AICall.id == call_id))
            ai_call = result.scalar_one_or_none()
            if ai_call:
                ai_call.twilio_call_sid = call.sid
                ai_call.status = "initiated"
                ai_call.started_at = datetime.now(SP_TZ).replace(tzinfo=None)
                db.add(AICallEvent(
                    call_id=call_id,
                    event="call_initiated",
                    payload={"call_sid": call.sid, "to": to_number},
                ))
                await db.commit()

        print(f"📞 Voice AI: Ligando para {lead_name} ({to_number}) - SID: {call.sid}")

    except Exception as e:
        print(f"❌ Erro ao iniciar chamada: {e}")
        async with async_session() as db:
            result = await db.execute(select(AICall).where(AICall.id == call_id))
            ai_call = result.scalar_one_or_none()
            if ai_call:
                ai_call.status = "failed"
                ai_call.outcome = "error"
                db.add(AICallEvent(
                    call_id=call_id,
                    event="error",
                    payload={"error": str(e)},
                ))
                await db.commit()


async def _save_call_results(call_sid: str, pipeline: VoicePipeline):
    """Salva resultados da chamada no banco após finalização."""
    if not hasattr(pipeline, 'final_data'):
        return

    data = pipeline.final_data
    session = pipeline.session

    async with async_session() as db:
        result = await db.execute(
            select(AICall).where(AICall.twilio_call_sid == call_sid)
        )
        call = result.scalar_one_or_none()
        if not call:
            return

        # Atualizar chamada
        call.outcome = data["outcome"]
        call.score = data["score"]
        call.score_breakdown = data["score_breakdown"]
        call.collected_fields = data["collected_fields"]
        call.objections = data["objections"]
        call.tags = data["tags"]
        call.summary = data["summary"]
        call.total_turns = data["total_turns"]
        call.avg_latency_ms = data["avg_latency_ms"]
        call.duration_seconds = data["duration_seconds"]
        call.handoff_type = data.get("handoff_type")
        call.fsm_state = session.state.value
        call.ended_at = datetime.now(SP_TZ).replace(tzinfo=None)

        # Salvar turnos da conversa
        for turn in session.conversation_history:
            db.add(AICallTurn(
                call_id=call.id,
                role=turn["role"],
                text=turn["content"],
                fsm_state=turn.get("state"),
            ))

        # Registrar evento de conclusão
        db.add(AICallEvent(
            call_id=call.id,
            event="call_completed",
            payload=data,
        ))

        await db.commit()

        # === Ações pós-chamada ===

        # 1. Atualizar CRM
        try:
            await update_lead_after_call(call, db)
        except Exception as e:
            print(f"❌ Erro ao atualizar CRM: {e}")

        # 2. Se agendou, criar evento e enviar WhatsApp
        if call.outcome == "scheduled" and call.collected_fields:
            fields = call.collected_fields
            if fields.get("data_agendamento") and fields.get("hora_agendamento"):
                try:
                    meeting = await schedule_meeting(
                        call.lead_name or "Lead",
                        call.to_number,
                        call.course or "",
                        fields["data_agendamento"],
                        fields["hora_agendamento"],
                    )
                    if meeting.get("success"):
                        call.handoff_data = meeting
                        await db.commit()

                        # Enviar confirmação WhatsApp
                        await send_schedule_confirmation(
                            call.contact_wa_id,
                            call.lead_name,
                            call.course,
                            fields["data_agendamento"],
                            fields["hora_agendamento"],
                        )
                except Exception as e:
                    print(f"❌ Erro ao agendar: {e}")

        # 3. Se follow-up, enviar WhatsApp
        elif call.outcome == "follow_up":
            try:
                await send_followup_message(
                    call.contact_wa_id,
                    call.lead_name,
                    call.course,
                )
            except Exception as e:
                print(f"❌ Erro ao enviar follow-up: {e}")

        # 4. Mover no funil do Exact
        if call.lead_id and call.outcome:
            try:
                await move_lead_in_funnel(call.lead_id, call.outcome)
            except Exception as e:
                print(f"❌ Erro ao mover no funil: {e}")


async def _schedule_retry(call_id: int):
    """Agenda retry de chamada não atendida."""
    async with async_session() as db:
        result = await db.execute(select(AICall).where(AICall.id == call_id))
        call = result.scalar_one_or_none()
        if not call:
            return

        attempt = call.attempt_number
        if attempt >= MAX_CALL_RETRIES:
            return

        delay_min = RETRY_DELAY_MINUTES[min(attempt, len(RETRY_DELAY_MINUTES) - 1)]
        print(f"🔁 Retry {attempt + 1} agendado em {delay_min} minutos para call_id={call_id}")

        # Esperar o delay
        await asyncio.sleep(delay_min * 60)

        # Criar nova chamada como retry
        new_call = AICall(
            lead_id=call.lead_id,
            contact_wa_id=call.contact_wa_id,
            from_number=call.from_number,
            to_number=call.to_number,
            direction="outbound",
            status="pending",
            lead_name=call.lead_name,
            course=call.course,
            campaign=call.campaign,
            source=call.source,
            attempt_number=attempt + 1,
            retry_of_call_id=call.id,
        )
        db.add(new_call)
        await db.commit()
        await db.refresh(new_call)

        # Disparar
        asyncio.create_task(
            _initiate_call(new_call.id, call.to_number, call.lead_name, call.course)
        )


def _serialize_call(call: AICall) -> dict:
    """Serializa AICall para JSON."""
    return {
        "id": call.id,
        "lead_id": call.lead_id,
        "lead_name": call.lead_name,
        "to_number": call.to_number,
        "course": call.course,
        "status": call.status,
        "fsm_state": call.fsm_state,
        "outcome": call.outcome,
        "score": call.score,
        "score_breakdown": call.score_breakdown,
        "collected_fields": call.collected_fields,
        "objections": call.objections,
        "tags": call.tags,
        "summary": call.summary,
        "handoff_type": call.handoff_type,
        "duration_seconds": call.duration_seconds,
        "total_turns": call.total_turns,
        "avg_latency_ms": call.avg_latency_ms,
        "recording_url": call.recording_url,
        "attempt_number": call.attempt_number,
        "started_at": call.started_at.isoformat() if call.started_at else None,
        "answered_at": call.answered_at.isoformat() if call.answered_at else None,
        "ended_at": call.ended_at.isoformat() if call.ended_at else None,
        "created_at": call.created_at.isoformat() if call.created_at else None,
    }
