-- =========================================================
-- Migration: Chatbot Visual (Fase 1 — Fundação)
-- Cria chatbot_flows, chatbot_sessions e estende channels.
-- Idempotente: pode ser executada várias vezes sem erro.
-- =========================================================

BEGIN;

-- ---------------------------------------------------------
-- 1. Tabela chatbot_flows
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS chatbot_flows (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    graph JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    published_graph JSONB,
    version INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_flows_tenant
    ON chatbot_flows(tenant_id);

CREATE INDEX IF NOT EXISTS idx_chatbot_flows_published
    ON chatbot_flows(tenant_id, is_published);

-- ---------------------------------------------------------
-- 2. Tabela chatbot_sessions
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS chatbot_sessions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    flow_id INTEGER NOT NULL REFERENCES chatbot_flows(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    contact_wa_id VARCHAR(100) NOT NULL,
    current_node_id VARCHAR(100),
    variables JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_interaction_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_contact
    ON chatbot_sessions(contact_wa_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_status
    ON chatbot_sessions(status);

CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_flow
    ON chatbot_sessions(flow_id);

-- Garante 1 sessão ativa por (contato × canal)
CREATE UNIQUE INDEX IF NOT EXISTS idx_chatbot_sessions_unique_active
    ON chatbot_sessions(contact_wa_id, channel_id)
    WHERE status = 'active';

-- ---------------------------------------------------------
-- 3. Extensão da tabela channels
-- ---------------------------------------------------------
ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS operation_mode VARCHAR(20) NOT NULL DEFAULT 'ai';

ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS active_chatbot_flow_id INTEGER
    REFERENCES chatbot_flows(id) ON DELETE SET NULL;

-- Constraint de valores válidos (drop antes, caso já exista)
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_operation_mode_check;
ALTER TABLE channels
    ADD CONSTRAINT channels_operation_mode_check
    CHECK (operation_mode IN ('ai', 'chatbot', 'none'));

-- ---------------------------------------------------------
-- 4. Permissões pro usuário da aplicação
-- ---------------------------------------------------------
GRANT ALL PRIVILEGES ON TABLE chatbot_flows TO eduflow;
GRANT ALL PRIVILEGES ON TABLE chatbot_sessions TO eduflow;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO eduflow;

COMMIT;
