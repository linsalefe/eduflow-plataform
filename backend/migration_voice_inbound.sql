-- =====================================================
-- Migration: Voice AI Inbound — Tabela voice_agents
-- Executar: sudo -u postgres psql eduflow_db -f migration_voice_inbound.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS voice_agents (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),

    -- Identificação
    slug VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- IVR
    ivr_key VARCHAR(5),
    ivr_label VARCHAR(255),

    -- IA — Prompt
    system_prompt TEXT NOT NULL,
    greeting_text TEXT,

    -- IA — Modelo
    llm_model VARCHAR(100) DEFAULT 'gpt-4o',
    llm_temperature INTEGER DEFAULT 30,
    llm_max_tokens INTEGER DEFAULT 500,

    -- Voz — ElevenLabs
    elevenlabs_voice_id VARCHAR(100),
    elevenlabs_model_id VARCHAR(100) DEFAULT 'eleven_multilingual_v2',

    -- Comportamento
    max_duration_sec INTEGER DEFAULT 300,
    silence_timeout_sec INTEGER DEFAULT 10,
    can_escalate BOOLEAN DEFAULT TRUE,
    escalation_phone VARCHAR(30),

    -- Base de conhecimento
    knowledge_doc_ids JSONB,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index para busca por tenant + slug
CREATE INDEX IF NOT EXISTS idx_voice_agents_tenant_slug ON voice_agents(tenant_id, slug);

-- Permissões
GRANT ALL PRIVILEGES ON TABLE voice_agents TO eduflow;
GRANT USAGE, SELECT ON SEQUENCE voice_agents_id_seq TO eduflow;
