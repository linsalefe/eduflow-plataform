-- ============================================================
-- FASE A.3 — Foreign Keys em contact_id
-- TUDO em uma transação
-- ============================================================

BEGIN;

-- Tabelas que JÁ tinham FK em contact_wa_id
ALTER TABLE messages ADD CONSTRAINT fk_messages_contact_id
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE activities ADD CONSTRAINT fk_activities_contact_id
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE tasks ADD CONSTRAINT fk_tasks_contact_id
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE schedules ADD CONSTRAINT fk_schedules_contact_id
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE ai_conversation_summaries ADD CONSTRAINT fk_ai_conversation_summaries_contact_id
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE ai_calls ADD CONSTRAINT fk_ai_calls_contact_id
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE financial_entries ADD CONSTRAINT fk_financial_entries_contact_id
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE contact_tags ADD CONSTRAINT fk_contact_tags_contact_id
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

-- Tabelas SEM FK antes (contact_id é NULL para órfãs — FK nullable aceita)
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_contact_id
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE chatbot_sessions ADD CONSTRAINT fk_chatbot_sessions_contact_id
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE ai_feedback ADD CONSTRAINT fk_ai_feedback_contact_id
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE automation_executions ADD CONSTRAINT fk_automation_executions_contact_id
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE call_logs ADD CONSTRAINT fk_call_logs_contact_id
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

COMMIT;
