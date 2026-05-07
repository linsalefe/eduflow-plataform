-- 2026-05-06 — Tabela workflow_run: timeline auditável de execução de fluxos
-- Diferente de chatbot_sessions (que é a conversa em si), workflow_run guarda
-- quais nós foram visitados, quanto custou em IA, qual o outcome.

CREATE TABLE IF NOT EXISTS workflow_run (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    flow_id INTEGER NOT NULL REFERENCES chatbot_flows(id) ON DELETE CASCADE,
    session_id INTEGER REFERENCES chatbot_sessions(id) ON DELETE SET NULL,
    contact_id BIGINT REFERENCES contacts(id) ON DELETE CASCADE,

    trigger_event VARCHAR(40),
    trigger_payload JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- 'running' | 'completed' | 'failed' | 'blocked_by_lock' | 'cancelled'
    status VARCHAR(20) NOT NULL DEFAULT 'running',

    -- lista de {node_id, node_kind, started_at, completed_at, outcome, error}
    timeline JSONB NOT NULL DEFAULT '[]'::jsonb,

    variables JSONB NOT NULL DEFAULT '{}'::jsonb,

    openai_tokens_input INTEGER NOT NULL DEFAULT 0,
    openai_tokens_output INTEGER NOT NULL DEFAULT 0,

    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_workflow_run_tenant ON workflow_run(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_run_contact ON workflow_run(contact_id);
CREATE INDEX IF NOT EXISTS idx_workflow_run_status_running ON workflow_run(status) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_workflow_run_started ON workflow_run(started_at DESC);

-- Reforço de índice no lock global (lead_agent_context já existe).
-- Esse índice acelera o "tem lock ativo pra esse lead?" que F1.B vai usar.
CREATE INDEX IF NOT EXISTS idx_lead_agent_context_lock
ON lead_agent_context(lead_id, locked_until)
WHERE locked_until IS NOT NULL;
