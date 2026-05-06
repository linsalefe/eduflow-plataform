-- Trigger: chatbot_trigger_log
-- Registra disparos de fluxos do chatbot por evento (stage_change, etc).
-- Usado para cooldown e auditoria.
-- Idempotente — pode ser rodado múltiplas vezes sem erro.

CREATE TABLE IF NOT EXISTS chatbot_trigger_log (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    contact_id INTEGER NOT NULL,
    flow_id INTEGER NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    triggered_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_trigger_log_cooldown
    ON chatbot_trigger_log (contact_id, flow_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_chatbot_trigger_log_tenant
    ON chatbot_trigger_log (tenant_id, triggered_at DESC);

-- Permissões (rodar como superuser do Postgres):
-- GRANT ALL PRIVILEGES ON TABLE chatbot_trigger_log TO eduflow;
-- GRANT USAGE, SELECT ON SEQUENCE chatbot_trigger_log_id_seq TO eduflow;
