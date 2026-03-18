"""
Modelos do módulo Voice AI Inbound.
Tabela: voice_agents — cada agente de voz configurável (suporte, retenção, etc.)
"""
from sqlalchemy import (
    Column, String, Text, DateTime, Integer, Boolean,
    ForeignKey, JSON, func
)
from app.database import Base


class VoiceAgent(Base):
    """
    Agente de voz inbound configurável.
    Cada agente tem seu próprio prompt, voz, e base de conhecimento.
    Mapeado por tecla no IVR (ex: 1 → support, 2 → retention).
    """
    __tablename__ = "voice_agents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    # Identificação
    slug = Column(String(50), nullable=False, index=True)  # "support", "retention"
    name = Column(String(255), nullable=False)              # "Agente de Suporte"
    description = Column(Text, nullable=True)               # Descrição para o admin

    # IVR
    ivr_key = Column(String(5), nullable=True)              # "1", "2", etc.
    ivr_label = Column(String(255), nullable=True)          # "Para suporte técnico, digite 1"

    # IA — Prompt
    system_prompt = Column(Text, nullable=False)            # Prompt completo do agente
    greeting_text = Column(Text, nullable=True)             # Primeira fala ao conectar

    # IA — Modelo
    llm_model = Column(String(100), default="gpt-4o")
    llm_temperature = Column(Integer, default=30)           # 30 = 0.3 (armazena como int x100)
    llm_max_tokens = Column(Integer, default=500)

    # ElevenLabs
    elevenlabs_agent_id = Column(String(100), nullable=True)  # Agent ID do ElevenLabs
    elevenlabs_voice_id = Column(String(100), nullable=True)
    elevenlabs_model_id = Column(String(100), default="eleven_multilingual_v2")

    # Comportamento
    max_duration_sec = Column(Integer, default=300)         # 5 min
    silence_timeout_sec = Column(Integer, default=10)
    can_escalate = Column(Boolean, default=True)            # Pode transferir para humano?
    escalation_phone = Column(String(30), nullable=True)    # Número de escalação

    # Base de conhecimento — IDs dos docs vinculados (tabela futura)
    knowledge_doc_ids = Column(JSON, nullable=True)         # [1, 2, 3]

    # Status
    is_active = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())