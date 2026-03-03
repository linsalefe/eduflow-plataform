"""
Modelos de banco de dados para o sistema Voice AI.
Tabelas: ai_calls, ai_call_turns, ai_call_events, voice_scripts, ai_call_qa
"""
from sqlalchemy import (
    Column, String, Text, DateTime, Integer, Float, Boolean,
    ForeignKey, JSON, func
)
from sqlalchemy.orm import relationship
from app.database import Base


class AICall(Base):
    """Registro de cada ligação feita pela IA."""
    __tablename__ = "ai_calls"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    lead_id = Column(Integer, ForeignKey("exact_leads.id"), nullable=True)
    contact_wa_id = Column(String(20), ForeignKey("contacts.wa_id"), nullable=True)
    twilio_call_sid = Column(String(100), unique=True, nullable=True, index=True)

    # Dados da chamada
    from_number = Column(String(30), nullable=False)
    to_number = Column(String(30), nullable=False)
    direction = Column(String(20), default="outbound")
    status = Column(String(30), default="pending")
    fsm_state = Column(String(30), default="OPENING")

    # Resultado
    outcome = Column(String(30), nullable=True)
    score = Column(Integer, default=0)
    score_breakdown = Column(JSON, nullable=True)
    collected_fields = Column(JSON, nullable=True)
    objections = Column(JSON, nullable=True)
    tags = Column(JSON, nullable=True)
    summary = Column(Text, nullable=True)

    # Contexto
    course = Column(String(255), nullable=True)
    campaign = Column(String(255), nullable=True)
    source = Column(String(100), nullable=True)
    lead_name = Column(String(255), nullable=True)

    # Handoff
    handoff_type = Column(String(30), nullable=True)
    handoff_data = Column(JSON, nullable=True)

    # Métricas
    duration_seconds = Column(Integer, default=0)
    total_turns = Column(Integer, default=0)
    avg_latency_ms = Column(Integer, default=0)
    recording_url = Column(Text, nullable=True)
    drive_file_url = Column(Text, nullable=True)

    # Retry
    attempt_number = Column(Integer, default=1)
    retry_of_call_id = Column(Integer, ForeignKey("ai_calls.id"), nullable=True)

    # Timestamps
    started_at = Column(DateTime, nullable=True)
    answered_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    turns = relationship("AICallTurn", back_populates="call", order_by="AICallTurn.created_at")
    events = relationship("AICallEvent", back_populates="call", order_by="AICallEvent.created_at")
    qa_score = relationship("AICallQA", back_populates="call", uselist=False)


class AICallTurn(Base):
    """Cada turno da conversa (fala do lead ou da IA)."""
    __tablename__ = "ai_call_turns"

    id = Column(Integer, primary_key=True, autoincrement=True)
    call_id = Column(Integer, ForeignKey("ai_calls.id"), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # user|assistant|system
    text = Column(Text, nullable=False)
    fsm_state = Column(String(30), nullable=True)

    # Métricas do turno
    stt_latency_ms = Column(Integer, nullable=True)
    llm_latency_ms = Column(Integer, nullable=True)
    tts_latency_ms = Column(Integer, nullable=True)
    total_latency_ms = Column(Integer, nullable=True)
    confidence = Column(Float, nullable=True)  # 0-1 confiança do LLM

    # Ação executada pelo LLM neste turno
    action = Column(String(50), nullable=True)  # update_crm|schedule|transfer|send_whatsapp|end_call
    fields_extracted = Column(JSON, nullable=True)

    barge_in = Column(Boolean, default=False)  # Lead interrompeu a IA?
    created_at = Column(DateTime, server_default=func.now())

    call = relationship("AICall", back_populates="turns")


class AICallEvent(Base):
    """Eventos da chamada (mudanças de estado, erros, ações)."""
    __tablename__ = "ai_call_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    call_id = Column(Integer, ForeignKey("ai_calls.id"), nullable=False, index=True)
    event = Column(String(50), nullable=False)  # fsm_transition|twilio_status|error|action|barge_in
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    call = relationship("AICall", back_populates="events")


class VoiceScript(Base):
    """Roteiros por curso/persona para a IA seguir."""
    __tablename__ = "voice_scripts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    name = Column(String(255), nullable=False)
    course = Column(String(255), nullable=True)
    persona = Column(String(100), nullable=True)
    channel_id = Column(Integer, ForeignKey("channels.id"), nullable=True)

    # Falas por estado da FSM
    opening_text = Column(Text, nullable=True)
    context_text = Column(Text, nullable=True)
    qualify_questions = Column(JSON, nullable=True)
    objection_responses = Column(JSON, nullable=True)
    closing_text = Column(Text, nullable=True)

    # Políticas
    policies = Column(JSON, nullable=True)
    system_prompt_override = Column(Text, nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class AICallQA(Base):
    """Avaliação automática de qualidade da chamada."""
    __tablename__ = "ai_call_qa"

    id = Column(Integer, primary_key=True, autoincrement=True)
    call_id = Column(Integer, ForeignKey("ai_calls.id"), unique=True, nullable=False)

    script_adherence = Column(Float, nullable=True)  # 0-1: aderência ao roteiro
    clarity_score = Column(Float, nullable=True)  # 0-1: clareza das falas
    avg_latency_ms = Column(Integer, nullable=True)
    fields_completion = Column(Float, nullable=True)  # 0-1: % campos coletados
    outcome_quality = Column(Float, nullable=True)  # 0-1: qualidade do resultado
    overall_score = Column(Float, nullable=True)  # média ponderada
    notes = Column(Text, nullable=True)  # observações do QA automático

    evaluated_at = Column(DateTime, server_default=func.now())

    call = relationship("AICall", back_populates="qa_score")
