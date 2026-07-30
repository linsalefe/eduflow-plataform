-- ============================================================
-- UNIQUE em channels.instance_name (sem lock, sem transação)
--
-- Contexto: dois tenants criaram canais com instance_name='teste',
-- derrubando GET /api/evolution/instances/{name}/status com
-- MultipleResultsFound (HTTP 500). Ver RELATORIO_ERRO_500_STATUS.md.
--
-- Índice PARCIAL: canais não-Evolution (ex.: Instagram, id 27) têm
-- instance_name NULL e não devem colidir entre si. A cláusula <> '' cobre
-- também o caso de string vazia, que o Postgres trataria como valor real
-- (NULLs são sempre distintos entre si; '' não é).
--
-- PRÉ-REQUISITO: não pode restar nenhum duplicado. Conferir com:
--   SELECT instance_name, COUNT(*) FROM channels
--   WHERE instance_name IS NOT NULL
--   GROUP BY instance_name HAVING COUNT(*) > 1;
-- O resultado precisa vir vazio, senão o CREATE INDEX falha.
-- ============================================================

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_channels_instance_name
    ON channels (instance_name)
    WHERE instance_name IS NOT NULL AND instance_name <> '';
