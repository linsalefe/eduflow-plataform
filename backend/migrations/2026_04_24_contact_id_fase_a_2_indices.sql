-- ============================================================
-- FASE A.2 — Índices em contact_id (sem lock, sem transação)
-- Cada CREATE INDEX CONCURRENTLY em comando próprio
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_messages_contact_id ON messages(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_activities_contact_id ON activities(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tasks_contact_id ON tasks(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_schedules_contact_id ON schedules(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ai_conversation_summaries_contact_id ON ai_conversation_summaries(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ai_calls_contact_id ON ai_calls(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_financial_entries_contact_id ON financial_entries(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_contact_tags_contact_id ON contact_tags(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_call_logs_contact_id ON call_logs(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_notifications_contact_id ON notifications(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ai_feedback_contact_id ON ai_feedback(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_automation_executions_contact_id ON automation_executions(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_chatbot_sessions_contact_id ON chatbot_sessions(contact_id);
