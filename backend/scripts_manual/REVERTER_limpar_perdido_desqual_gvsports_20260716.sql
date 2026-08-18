-- REVERSAO da limpeza de 2026-07-16 (tenant 4 = GV Sports Education).
-- Restaura o pipeline_id=1 dos contatos/estados que foram tirados do quadro.
-- Requer que as tabelas bkp_clean_20260716_contacts / _ccs ainda existam.
-- Se elas ja tiverem sido dropadas, restaure primeiro com backup_dump_20260716.sql.
\set ON_ERROR_STOP on
BEGIN;

UPDATE contacts c
SET pipeline_id = b.pipeline_id, updated_at = now()
FROM bkp_clean_20260716_contacts b
WHERE c.id = b.id AND c.pipeline_id IS NULL;

UPDATE contact_channel_state s
SET pipeline_id = b.pipeline_id, updated_at = now()
FROM bkp_clean_20260716_ccs b
WHERE s.id = b.id AND s.pipeline_id IS NULL;

SELECT 'restaurados_contacts' AS t, count(*) FROM contacts c
  JOIN bkp_clean_20260716_contacts b ON b.id=c.id WHERE c.pipeline_id=1
UNION ALL SELECT 'restaurados_ccs', count(*) FROM contact_channel_state s
  JOIN bkp_clean_20260716_ccs b ON b.id=s.id WHERE s.pipeline_id=1;

COMMIT;
