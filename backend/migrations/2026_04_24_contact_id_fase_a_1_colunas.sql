-- ============================================================
-- FASE A.1 — Adicionar contact_id em 13 tabelas + popular
-- TUDO em uma transação. Reversível via rollback.
-- ============================================================

BEGIN;

-- A.1.1 — Adicionar coluna nullable em todas as tabelas
ALTER TABLE messages ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE ai_conversation_summaries ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE contact_tags ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE ai_feedback ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE automation_executions ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE chatbot_sessions ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;

-- A.1.2 — Popular contact_id via JOIN com contacts.wa_id
UPDATE messages m SET contact_id = c.id
  FROM contacts c WHERE m.contact_wa_id = c.wa_id AND m.contact_id IS NULL;

UPDATE activities a SET contact_id = c.id
  FROM contacts c WHERE a.contact_wa_id = c.wa_id AND a.contact_id IS NULL;

UPDATE tasks t SET contact_id = c.id
  FROM contacts c WHERE t.contact_wa_id = c.wa_id AND t.contact_id IS NULL;

UPDATE schedules s SET contact_id = c.id
  FROM contacts c WHERE s.contact_wa_id = c.wa_id AND s.contact_id IS NULL;

UPDATE ai_conversation_summaries acs SET contact_id = c.id
  FROM contacts c WHERE acs.contact_wa_id = c.wa_id AND acs.contact_id IS NULL;

UPDATE ai_calls aic SET contact_id = c.id
  FROM contacts c WHERE aic.contact_wa_id = c.wa_id AND aic.contact_id IS NULL;

UPDATE financial_entries fe SET contact_id = c.id
  FROM contacts c WHERE fe.contact_wa_id = c.wa_id AND fe.contact_id IS NULL;

UPDATE contact_tags ct SET contact_id = c.id
  FROM contacts c WHERE ct.contact_wa_id = c.wa_id AND ct.contact_id IS NULL;

UPDATE call_logs cl SET contact_id = c.id
  FROM contacts c WHERE cl.contact_wa_id = c.wa_id AND cl.contact_id IS NULL;

UPDATE notifications n SET contact_id = c.id
  FROM contacts c WHERE n.contact_wa_id = c.wa_id AND n.contact_id IS NULL;

UPDATE ai_feedback af SET contact_id = c.id
  FROM contacts c WHERE af.contact_wa_id = c.wa_id AND af.contact_id IS NULL;

UPDATE automation_executions ae SET contact_id = c.id
  FROM contacts c WHERE ae.contact_wa_id = c.wa_id AND ae.contact_id IS NULL;

UPDATE chatbot_sessions cs SET contact_id = c.id
  FROM contacts c WHERE cs.contact_wa_id = c.wa_id AND cs.contact_id IS NULL;

COMMIT;
