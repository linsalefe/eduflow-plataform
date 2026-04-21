-- =========================================================
-- Migration: chatbot_scheduled_resumes
-- Armazena pausas de fluxo em nós `delay` para retomada automática.
-- Idempotente.
-- =========================================================

BEGIN;

CREATE TABLE IF NOT EXISTS chatbot_scheduled_resumes (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES chatbot_sessions(id) ON DELETE CASCADE,
    resume_at TIMESTAMP NOT NULL,
    node_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    processed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_resumes_due
    ON chatbot_scheduled_resumes(resume_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_chatbot_resumes_session
    ON chatbot_scheduled_resumes(session_id);

-- Atualizar o índice único de sessões ativas pra incluir "waiting"
DROP INDEX IF EXISTS idx_chatbot_sessions_unique_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chatbot_sessions_unique_open
    ON chatbot_sessions(contact_wa_id, channel_id)
    WHERE status IN ('active', 'waiting');

GRANT ALL PRIVILEGES ON TABLE chatbot_scheduled_resumes TO eduflow;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO eduflow;

COMMIT;
