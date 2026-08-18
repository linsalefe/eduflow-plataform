-- 2026-08-18 — Roteamento da notificação de grupo por origem do lead
--
-- Complementa 2026_08_18_landing_page_notify_grupo.sql.
--
-- Motivo: a LP gv-sports-education é UMA só para dois programas — CAMP e High
-- School são distinguidos pelo campo "origem" do payload, não por LPs
-- separadas. Um notify_group_jid único mandaria os dois programas para o mesmo
-- grupo, que é justamente o que não se quer: CAMP vai para o comercial do CAMP
-- e High School para o comercial do High School.
--
-- notify_group_jid continua valendo como fallback "avisa tudo num grupo só",
-- para LP de programa único, que é o caso mais comum.

BEGIN;

ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS notify_rules JSONB NULL;

COMMENT ON COLUMN landing_pages.notify_rules IS
  'Roteamento por origem do lead. Formato: [{"origem": "highschool", "group_jid": "...@g.us", '
  '"template": null}]. A origem casa com extra.origem do payload (case-insensitive, trim). '
  '"template": null na regra herda landing_pages.notify_template e, na falta dele, o default do '
  'app/notify_group.py. Sem regra que case, cai em notify_group_jid; sem ele, não notifica.';

COMMIT;
