-- 2026-08-18 — Webhook de LP externa: pipeline de destino + notificação em grupo
--
-- Antes: todo lead de webhook caía no pipeline default do canal (ou do tenant)
-- com lead_status "novo", e não havia aviso para o time comercial.
-- Agora: cada webhook aponta para um pipeline/etapa próprios e pode notificar
-- um grupo de WhatsApp quando o lead entra.
--
-- As 4 colunas são nullable de propósito: webhooks já existentes continuam
-- com o comportamento atual (resolve_pipeline_id + "novo", sem notificação)
-- sem precisar de backfill.

BEGIN;

ALTER TABLE webhook_configs
  ADD COLUMN IF NOT EXISTS pipeline_id      INTEGER      NULL REFERENCES pipelines(id),
  ADD COLUMN IF NOT EXISTS pipeline_stage   VARCHAR(50)  NULL,
  ADD COLUMN IF NOT EXISTS notify_group_jid VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS notify_template  TEXT         NULL;

COMMENT ON COLUMN webhook_configs.pipeline_id IS
  'Pipeline de destino do lead. NULL = mantém o fallback (default do canal, depois default do tenant).';
COMMENT ON COLUMN webhook_configs.pipeline_stage IS
  'Key da coluna do pipeline usada como lead_status inicial. NULL = "novo".';
COMMENT ON COLUMN webhook_configs.notify_group_jid IS
  'JID do grupo WhatsApp ({id}@g.us) avisado quando o lead entra. NULL = sem notificação.';
COMMENT ON COLUMN webhook_configs.notify_template IS
  'Template da mensagem de grupo. Placeholders: {name} {phone} {course} {email} {origem}.';

COMMIT;
