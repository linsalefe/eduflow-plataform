from sqlalchemy import Column, String, Text, DateTime, BigInteger, Integer, Boolean, ForeignKey, func, Table, Numeric, UniqueConstraint, JSON
from sqlalchemy.orm import relationship
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text, ForeignKey, Table, Numeric
from app.database import Base
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector


contact_tags = Table(
    "contact_tags",
    Base.metadata,
    Column("contact_id", BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True),
    Column("tag_id", Integer, ForeignKey("tags.id"), primary_key=True),
)


class Channel(Base):
    __tablename__ = "channels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    name = Column(String(100), nullable=False)
    phone_number = Column(String(20), nullable=True)
    phone_number_id = Column(String(50), nullable=True)
    whatsapp_token = Column(Text, nullable=True)
    waba_id = Column(String(50))
    type = Column(String(20), default="whatsapp")
    provider = Column(String(20), default="official")
    instance_name = Column(String(100), nullable=True)
    instance_token = Column(Text, nullable=True)
    page_id = Column(String(50), nullable=True)
    instagram_id = Column(String(50), nullable=True)
    access_token = Column(Text, nullable=True)
    is_connected = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    default_pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="SET NULL"), nullable=True)
    operation_mode = Column(String(20), nullable=False, default="ai")  # ai | chatbot | none
    active_chatbot_flow_id = Column(Integer, ForeignKey("chatbot_flows.id", ondelete="SET NULL"), nullable=True)

    tenant = relationship("Tenant", back_populates="channels")
    contacts = relationship("Contact", back_populates="channel")
    messages = relationship("Message", back_populates="channel")

class Contact(Base):
    __tablename__ = "contacts"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    wa_id = Column(String(20), nullable=False, index=True)
    name = Column(String(255), nullable=True)
    profile_picture_url = Column(String, nullable=True)
    lead_status = Column(String(30), default="novo")
    notes = Column(Text, nullable=True)
    ai_active = Column(Boolean, default=False)
    last_inbound_at = Column(DateTime, nullable=True)
    reengagement_count = Column(Integer, default=0)
    channel_id = Column(Integer, ForeignKey("channels.id"))
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    deal_value = Column(Numeric(10, 2), nullable=True, default=0)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="SET NULL"), nullable=True)
    is_group = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    ai_memory = Column(JSONB, nullable=True, server_default='{}')
    ai_memory_updated_at = Column(DateTime(timezone=True), nullable=True)

    # Handoff: workflow → agente de IA
    ai_takeover_active = Column(Boolean, default=False)
    ai_takeover_started_at = Column(DateTime, nullable=True)
    ai_takeover_last_activity = Column(DateTime, nullable=True)
    ai_takeover_timeout_minutes = Column(Integer, nullable=True)
    ai_takeover_context = Column(JSON, nullable=True)

    messages = relationship("Message", back_populates="contact", foreign_keys="Message.contact_id")
    tags = relationship(
        "Tag", secondary=contact_tags, back_populates="contacts",
        primaryjoin=id == contact_tags.c.contact_id,
        secondaryjoin="Tag.id == contact_tags.c.tag_id",
    )
    channel = relationship("Channel", back_populates="contacts")

class Message(Base):
    __tablename__ = "messages"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    wa_message_id = Column(String(255), unique=True, nullable=False, index=True)
    contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True, index=True)
    channel_id = Column(Integer, ForeignKey("channels.id"))
    direction = Column(String(10), nullable=False)
    message_type = Column(String(20), nullable=False)
    content = Column(Text, nullable=True)
    timestamp = Column(DateTime, nullable=False)
    status = Column(String(20), default="received")
    sent_by_ai = Column(Boolean, default=False)
    sender_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    contact = relationship("Contact", back_populates="messages", foreign_keys=[contact_id])
    channel = relationship("Channel", back_populates="messages")


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_tag_tenant_name"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    name = Column(String(50), nullable=False)
    color = Column(String(20), nullable=False, default="blue")
    created_at = Column(DateTime, server_default=func.now())

    contacts = relationship(
        "Contact", secondary=contact_tags, back_populates="tags",
        primaryjoin=id == contact_tags.c.tag_id,
        secondaryjoin="Contact.id == contact_tags.c.contact_id",
    )


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="atendente")
    is_active = Column(Boolean, default=True)
    avatar_url = Column(String(500), nullable=True)
    notify_email = Column(Boolean, default=True)
    notify_sound = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    tenant = relationship("Tenant", back_populates="users")

class ExactLead(Base):
    __tablename__ = "exact_leads"
    __table_args__ = (
        UniqueConstraint("tenant_id", "exact_id", name="uq_exactlead_tenant_exactid"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    exact_id = Column(Integer, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    phone1 = Column(String(30), nullable=True)
    phone2 = Column(String(30), nullable=True)
    source = Column(String(100), nullable=True)
    sub_source = Column(String(100), nullable=True)
    stage = Column(String(50), nullable=True)
    funnel_id = Column(Integer, nullable=True)
    sdr_name = Column(String(255), nullable=True)
    register_date = Column(DateTime, nullable=True)
    update_date = Column(DateTime, nullable=True)
    synced_at = Column(DateTime, server_default=func.now())


class AIConfig(Base):
    __tablename__ = "ai_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    channel_id = Column(Integer, ForeignKey("channels.id"), unique=True, nullable=True)
    name = Column(String(100), nullable=False)
    icon = Column(String(30), default="Bot", nullable=True)
    is_enabled = Column(Boolean, default=False)
    system_prompt = Column(Text, nullable=True)
    model = Column(String(50), default="gpt-5")
    temperature = Column(String(10), default="0.7")
    max_tokens = Column(Integer, default=500)

    # F2.A — Biblioteca de agentes pra Workflow.
    # NULL = agente nunca foi usado em workflow (intacto pro modo `ai` do canal).
    tools = Column(JSONB, nullable=True)        # lista de nomes de tools
    outcomes = Column(JSONB, nullable=True)     # lista de outcomes (handles do nó)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    channel = relationship("Channel", backref="ai_config")

    @property
    def is_workflow_capable(self) -> bool:
        """True se o agente foi configurado pra ser usado em workflow."""
        return self.tools is not None


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    agent_id = Column(Integer, ForeignKey("ai_configs.id", ondelete="CASCADE"), nullable=False)
    channel_id = Column(Integer, ForeignKey("channels.id"), nullable=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Text, nullable=True)
    chunk_index = Column(Integer, default=0)
    token_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())

    agent = relationship("AIConfig", backref="knowledge_documents")
    channel = relationship("Channel", backref="knowledge_documents")


class AIConversationSummary(Base):
    __tablename__ = "ai_conversation_summaries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True, index=True)
    channel_id = Column(Integer, ForeignKey("channels.id"), nullable=False)
    status = Column(String(30), default="em_atendimento_ia")
    summary = Column(Text, nullable=True)
    lead_name = Column(String(255), nullable=True)
    lead_course = Column(String(255), nullable=True)
    ai_messages_count = Column(Integer, default=0)
    human_took_over = Column(Boolean, default=False)
    started_at = Column(DateTime, server_default=func.now())
    finished_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    contact = relationship("Contact", backref="ai_summaries", foreign_keys=[contact_id])
    channel = relationship("Channel", backref="ai_summaries")


class CallLog(Base):
    __tablename__ = "call_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    call_sid = Column(String(100), unique=True, nullable=False, index=True)
    from_number = Column(String(30), nullable=False)
    to_number = Column(String(30), nullable=False)
    direction = Column(String(20), nullable=False)
    status = Column(String(30), default="initiated")
    duration = Column(Integer, default=0)
    recording_url = Column(Text, nullable=True)
    recording_sid = Column(String(100), nullable=True)
    drive_file_url = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_name = Column(String(255), nullable=True)
    contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True)
    contact_name = Column(String(255), nullable=True)
    channel_id = Column(Integer, ForeignKey("channels.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", backref="call_logs")
    channel = relationship("Channel", backref="call_logs")

class LandingPage(Base):
    __tablename__ = "landing_pages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    channel_id = Column(Integer, ForeignKey("channels.id"), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    title = Column(String(255), nullable=False)
    template = Column(String(50), nullable=False, default="curso")
    config = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    tag = Column(String(100), nullable=True)
    pipeline_stage = Column(String(50), nullable=True)
    whatsapp_message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    channel = relationship("Channel", backref="landing_pages")
    submissions = relationship("FormSubmission", back_populates="landing_page")

class FormSubmission(Base):
    __tablename__ = "form_submissions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    landing_page_id = Column(Integer, ForeignKey("landing_pages.id"), nullable=False)
    channel_id = Column(Integer, ForeignKey("channels.id"), nullable=False)
    name = Column(String(255), nullable=False)
    phone = Column(String(30), nullable=False)
    email = Column(String(255), nullable=True)
    course = Column(String(255), nullable=True)
    utm_source = Column(String(100), nullable=True)
    utm_medium = Column(String(100), nullable=True)
    utm_campaign = Column(String(100), nullable=True)
    utm_content = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    landing_page = relationship("LandingPage", back_populates="submissions")
    channel = relationship("Channel", backref="form_submissions")

class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    type = Column(String(20), nullable=False)
    contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True, index=True)
    contact_name = Column(String(255), nullable=True)
    phone = Column(String(30), nullable=False)
    course = Column(String(255), nullable=True)
    scheduled_date = Column(String(10), nullable=False)
    scheduled_time = Column(String(5), nullable=False)
    scheduled_at = Column(DateTime, nullable=False)
    status = Column(String(20), default="pending")
    call_id = Column(Integer, ForeignKey("ai_calls.id"), nullable=True)
    channel_id = Column(Integer, ForeignKey("channels.id"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    contact = relationship("Contact", backref="schedules", foreign_keys=[contact_id])
    channel = relationship("Channel", backref="schedules")

class Activity(Base):
    __tablename__ = "activities"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True, index=True)
    type = Column(String(30), nullable=False)
    description = Column(Text, nullable=False)
    extra_data = Column("metadata", Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    type = Column(String(30), default="follow_up")
    priority = Column(String(20), default="media")
    due_date = Column(String(10), nullable=False)
    due_time = Column(String(5), nullable=True)
    status = Column(String(20), default="pending")
    contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    contact = relationship("Contact", backref="tasks", foreign_keys=[contact_id])
    assigned_user = relationship("User", foreign_keys=[assigned_to], backref="assigned_tasks")
    creator = relationship("User", foreign_keys=[created_by], backref="created_tasks")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(30), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=True)
    is_read = Column(Boolean, default=False)
    link = Column(String(255), nullable=True)
    contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", backref="notifications")


class FinancialEntry(Base):
    __tablename__ = "financial_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True, index=True)
    type = Column(String(20), nullable=False)
    value = Column(Numeric(10, 2), nullable=False)
    description = Column(Text, nullable=True)
    course = Column(String(100), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    contact = relationship("Contact", backref="financial_entries", foreign_keys=[contact_id])
    creator = relationship("User", backref="financial_entries")

class Pipeline(Base):
    __tablename__ = "pipelines"
    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    name = Column(String(255), nullable=False)
    columns = Column(JSON, default=[])
    is_default = Column(Boolean, default=False)
    order = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    owner_name = Column(String(255), nullable=False)
    owner_email = Column(String(255), nullable=False)
    owner_phone = Column(String(30), nullable=True)
    plan = Column(String(30), default="basic")
    status = Column(String(20), default="active")
    max_users = Column(Integer, default=5)
    max_channels = Column(Integer, default=2)
    notes = Column(Text, nullable=True)
    logo_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    is_active = Column(Boolean, default=True)
    features = Column(JSON, default={
        "dashboard": True,
        "conversas": True,
        "pipeline": True,
        "financeiro": True,
        "landing_pages": True,
        "campanhas": True,
        "relatorios": True,
        "usuarios": True,
        "automacoes": True,
        "tarefas": True,
        "voice_ai": False,
        "ai_whatsapp": True,
        "voice_inbound": False,
        "ai_audio_response": False,
        "agenda": True,
        "ai_lead_memory": False,
        "chatbot": False,
    })

    agent_plan_flags = Column(JSON, default={
        "whatsapp": True,
        "voice": False,
        "followup": False,
        "reactivation": False,
        "briefing": False,
    })

    agent_flags = Column(JSON, default={})

    kanban_triggers = Column(JSON, default={})
    agent_messages = Column(JSON, default={
        "followup": {
            "confirmation": "Oi {nome}! 😊 Aqui é a Nat.\n\nQue ótimo papo! Ficou confirmado o nosso bate-papo para *{data} às {hora}*.\n\nQualquer dúvida pode me chamar aqui. Até lá! 👋",
            "reminder_d1": "Oi {nome}! 😊 Só passando para lembrar que amanhã temos nosso bate-papo agendado para às {hora}. Te espero lá!",
            "reminder_d0": "Oi {nome}! 🎯 Daqui a pouco temos nosso bate-papo! Esteja à vontade para tirar todas as suas dúvidas. Até já! 😊"
        },
        "reactivation": {
            "no_show": "Oi {nome}! Vi que não conseguiu no horário combinado. Sem problemas! Quer remarcar? 😊",
            "no_answer": "Oi {nome}! Tentei te contatar algumas vezes mas não consegui falar. Posso te ajudar de outra forma?",
            "cold": "Oi {nome}! Tudo bem? Passando para saber se ainda tem interesse. Posso te contar mais detalhes? 😊"
        },
        "briefing": {
            "prompt": "Gere um briefing objetivo sobre o lead para a consultora usar na reunião. Destaque motivação, perfil e principais pontos de atenção. Seja direto e prático."
        }
    })
    kanban_columns = Column(JSON, default=[
    {"key": "novo", "label": "Novos Leads", "color": "#6366f1", "order": 0},
    {"key": "em_contato", "label": "Em Contato", "color": "#f59e0b", "order": 1},
    {"key": "qualificado", "label": "Qualificados", "color": "#8b5cf6", "order": 2},
    {"key": "em_matricula", "label": "Em Matrícula", "color": "#06b6d4", "order": 3},
    {"key": "matriculado", "label": "Matriculados", "color": "#10b981", "order": 4},
    {"key": "perdido", "label": "Perdidos", "color": "#ef4444", "order": 5},
    ])

    agent_pipeline_moves = Column(JSON, default={
        "on_first_contact": "em_contato",
        "on_schedule_call": "qualificado",
    })

    qualification_fields = Column(JSON, default=[])
    ai_off_statuses = Column(JSON, default=["qualificado", "desqualificado", "matriculado", "perdido"])
    ai_off_statuses = Column(JSON, default=["qualificado", "desqualificado", "matriculado", "perdido"])
    reengagement_config = Column(JSON, default={})
    monthly_goal = Column(Float, default=0)
    monthly_lead_goal = Column(Integer, default=0)
    monthly_schedule_goal = Column(Integer, default=0)
    credits_balance = Column(Integer, default=0)
    credits_used = Column(Integer, default=0)
    stripe_customer_id = Column(String(255), nullable=True)
    stripe_subscription_id = Column(String(255), nullable=True)
    subscription_status = Column(String(30), default="manual")

    users = relationship("User", back_populates="tenant")
    channels = relationship("Channel", back_populates="tenant")


class LeadAgentContext(Base):
    __tablename__ = "lead_agent_context"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True)
    lead_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)

    # Dados coletados pelo Nat-WA
    wa_formacao = Column(String(255), nullable=True)
    wa_atuacao = Column(String(255), nullable=True)
    wa_motivacao = Column(String(255), nullable=True)
    wa_disponibilidade = Column(String(255), nullable=True)

    # Dados coletados pelo Nat-Voice
    call_summary = Column(Text, nullable=True)
    call_score = Column(Integer, nullable=True)
    call_outcome = Column(String(50), nullable=True)
    call_objections = Column(JSON, default=[])
    meeting_date = Column(DateTime, nullable=True)

    # Controle do orquestrador
    current_agent = Column(String(50), nullable=True)
    locked_by = Column(String(50), nullable=True)
    locked_until = Column(DateTime, nullable=True)
    last_event = Column(String(50), nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Subscription(Base):
    
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    plan = Column(String(30), nullable=False, default="basic")
    value = Column(Numeric(10, 2), nullable=False)
    billing_day = Column(Integer, nullable=False, default=1)
    status = Column(String(20), default="active")
    started_at = Column(DateTime, server_default=func.now())
    next_billing = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    tenant = relationship("Tenant", backref="subscription")

class AutomationFlow(Base):
    __tablename__ = "automation_flows"
    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    name = Column(String(255), nullable=False)
    stage = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())
    channel_id = Column(Integer, ForeignKey("channels.id", ondelete="SET NULL"), nullable=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="SET NULL"), nullable=True)


class AutomationStep(Base):
    __tablename__ = "automation_steps"
    id = Column(Integer, primary_key=True, autoincrement=True)
    flow_id = Column(Integer, ForeignKey("automation_flows.id", ondelete="CASCADE"), nullable=False)
    step_order = Column(Integer, nullable=False)
    delay_hours = Column(Integer, nullable=False, default=1)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    delay_minutes = Column(Integer, nullable=False, default=60)


class AutomationExecution(Base):
    __tablename__ = "automation_executions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    flow_id = Column(Integer, ForeignKey("automation_flows.id", ondelete="CASCADE"), nullable=False)
    contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True, index=True)
    current_step = Column(Integer, nullable=False, default=0)
    next_send_at = Column(DateTime, nullable=False)
    status = Column(String(50), nullable=False, default="pending")
    sent_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class WebhookConfig(Base):
    __tablename__ = "webhook_configs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    channel_id = Column(Integer, ForeignKey("channels.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    welcome_message = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    token = Column(String(32), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class TokenUsage(Base):
    __tablename__ = "token_usage"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    source = Column(String(50), nullable=False, default="whatsapp_ai")
    module = Column(String(50), nullable=True, index=True)
    model = Column(String(100), nullable=True)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AIFeedback(Base):
    """
    Feedback do cliente sobre respostas da IA no Laboratório do Agente.
    rating='up'   -> aprovação simples
    rating='down' -> rejeição com motivo opcional (reason)
    rating='edit' -> correção do cliente (corrected_response). Gera embedding.
    """
    __tablename__ = "ai_feedback"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    message_id = Column(
        BigInteger,
        ForeignKey("messages.id", ondelete="CASCADE"),
        nullable=False,
    )
    contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True, index=True)
    rating = Column(String(10), nullable=False)  # 'up' | 'down' | 'edit'
    reason = Column(String(50), nullable=True)
    corrected_response = Column(Text, nullable=True)
    context_snippet = Column(JSONB, nullable=True)
    context_embedding = Column(Vector(1536), nullable=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# Chatbot Visual — Fluxos e Sessões
# ============================================================
class ChatbotFlow(Base):
    __tablename__ = "chatbot_flows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Rascunho em edição (o editor visual salva aqui)
    graph = Column(JSONB, nullable=False, server_default='{"nodes":[],"edges":[]}')

    # Snapshot ativo (o runtime executa isto — só atualiza ao publicar)
    is_published = Column(Boolean, nullable=False, default=False)
    published_graph = Column(JSONB, nullable=True)

    version = Column(Integer, nullable=False, default=1)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ChatbotSession(Base):
    __tablename__ = "chatbot_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    flow_id = Column(Integer, ForeignKey("chatbot_flows.id", ondelete="CASCADE"), nullable=False)
    channel_id = Column(Integer, ForeignKey("channels.id", ondelete="CASCADE"), nullable=False)
    contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True, index=True)

    # ID do nó corrente dentro do grafo (IDs do React Flow são strings)
    current_node_id = Column(String(100), nullable=True)

    # Variáveis capturadas durante o fluxo: {"nome": "João", "cpf": "..."}
    variables = Column(JSONB, nullable=False, server_default='{}')

    status = Column(String(20), nullable=False, default="active")  # active | waiting | completed | timeout | cancelled
    started_at = Column(DateTime, server_default=func.now())
    last_interaction_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ChatbotScheduledResume(Base):
    __tablename__ = "chatbot_scheduled_resumes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("chatbot_sessions.id", ondelete="CASCADE"), nullable=False)
    resume_at = Column(DateTime, nullable=False)
    node_id = Column(String(100), nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # pending | processed | cancelled
    processed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class ChatbotTriggerLog(Base):
    """
    Registro de cada disparo de fluxo do chatbot por evento (não-mensagem).
    Usado para:
      - Cooldown: evitar redisparos em ações repetidas (ex: arrastar card 4x).
      - Auditoria/analytics: rastrear quando e por qual evento o fluxo disparou.
    """
    __tablename__ = "chatbot_trigger_log"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    contact_id = Column(Integer, nullable=False)
    flow_id = Column(Integer, nullable=False)
    event_type = Column(String(40), nullable=False)
    payload = Column(JSON, nullable=False, default=dict)
    triggered_at = Column(DateTime, nullable=False)


class WorkflowRun(Base):
    """
    Instância auditável de execução de um fluxo do Workflow Builder.
    Diferente de ChatbotSession (que é a conversa em si), WorkflowRun
    é o registro de UMA execução: quais nós rodaram, quanto custou em
    IA, qual o outcome, erros se houve.

    Criado para suportar o nó-Agente do Workflow (Fase 1 do mini-N8N).
    """
    __tablename__ = "workflow_run"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    flow_id = Column(Integer, ForeignKey("chatbot_flows.id", ondelete="CASCADE"), nullable=False)
    session_id = Column(Integer, ForeignKey("chatbot_sessions.id", ondelete="SET NULL"), nullable=True)
    contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True, index=True)

    trigger_event = Column(String(40), nullable=True)
    trigger_payload = Column(JSONB, nullable=False, server_default='{}')

    # 'running' | 'completed' | 'failed' | 'blocked_by_lock' | 'cancelled'
    status = Column(String(20), nullable=False, default="running")

    # Lista de {node_id, node_kind, started_at, completed_at, outcome, error}
    timeline = Column(JSONB, nullable=False, server_default='[]')

    variables = Column(JSONB, nullable=False, server_default='{}')

    openai_tokens_input = Column(Integer, nullable=False, default=0)
    openai_tokens_output = Column(Integer, nullable=False, default=0)

    started_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)


class QuickReply(Base):
    """Mensagens prontas (quick replies) compartilhadas no tenant.

    Atalhos digitados após `/` no inbox que se expandem em texto com variáveis
    dinâmicas substituídas pelo contato (`{nome}`, `{primeiro_nome}`, `{telefone}`).
    """
    __tablename__ = "quick_replies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    shortcut = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())