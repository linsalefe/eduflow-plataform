-- Limpeza das colunas Perdido/Desqualificado da Pipeline Principal (id=1)
-- Tenant 4 = GV Sports Education. Data: 2026-07-16.
-- Acao: remove os cards do quadro (pipeline_id = NULL), preservando contatos,
--       mensagens, tags e lead_status. Reversivel via tabelas de backup abaixo.
\set ON_ERROR_STOP on
BEGIN;

-- 1) Backup das linhas afetadas -------------------------------------------
DROP TABLE IF EXISTS bkp_clean_20260716_contacts;
CREATE TABLE bkp_clean_20260716_contacts AS
SELECT id, tenant_id, pipeline_id, lead_status
FROM contacts
WHERE tenant_id = 4
  AND pipeline_id = 1
  AND lead_status IN ('perdido','desqualificado');

DROP TABLE IF EXISTS bkp_clean_20260716_ccs;
CREATE TABLE bkp_clean_20260716_ccs AS
SELECT id, tenant_id, contact_id, channel_id, pipeline_id, lead_status
FROM contact_channel_state
WHERE tenant_id = 4
  AND pipeline_id = 1
  AND lead_status IN ('perdido','desqualificado');

-- 2) Update: tira da pipeline ---------------------------------------------
UPDATE contacts
SET pipeline_id = NULL, updated_at = now()
WHERE tenant_id = 4
  AND pipeline_id = 1
  AND lead_status IN ('perdido','desqualificado');

UPDATE contact_channel_state
SET pipeline_id = NULL, updated_at = now()
WHERE tenant_id = 4
  AND pipeline_id = 1
  AND lead_status IN ('perdido','desqualificado');

-- 3) Verificacao ----------------------------------------------------------
SELECT 'backup_contacts' AS t, count(*) FROM bkp_clean_20260716_contacts
UNION ALL SELECT 'backup_ccs', count(*) FROM bkp_clean_20260716_ccs
UNION ALL SELECT 'restam_contacts_pipe1', count(*) FROM contacts
  WHERE tenant_id=4 AND pipeline_id=1 AND lead_status IN ('perdido','desqualificado')
UNION ALL SELECT 'restam_ccs_pipe1', count(*) FROM contact_channel_state
  WHERE tenant_id=4 AND pipeline_id=1 AND lead_status IN ('perdido','desqualificado');

COMMIT;
