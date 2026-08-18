-- 2026-08-18 — Landing page interna passa a avisar um grupo do WhatsApp
--
-- A notificação de lead em grupo já existia no webhook de LP externa
-- (webhook_configs.notify_group_jid/notify_template). As landing pages
-- internas não avisavam ninguém — e são por onde entram os leads de
-- CAMP/High School hoje.
--
-- Mesmos nomes de coluna e mesma semântica do webhook de propósito: as duas
-- origens são renderizadas e enviadas pelo mesmo helper (app/notify_group.py).
-- Nullable: LP existente continua sem notificar, sem backfill.

BEGIN;

ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS notify_group_jid VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS notify_template  TEXT         NULL;

COMMENT ON COLUMN landing_pages.notify_group_jid IS
  'JID do grupo WhatsApp ({id}@g.us) avisado quando o lead entra. NULL = sem notificação.';
COMMENT ON COLUMN landing_pages.notify_template IS
  'Template da mensagem de grupo. Placeholders fixos ({name} {phone} {course} {email} {origem}), '
  'qualquer chave dos campos extras do form, e {extras} para o bloco automático.';

COMMIT;
