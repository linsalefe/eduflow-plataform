-- 2026-05-07 — AIConfig vira biblioteca reutilizável de agentes
-- Antes: 1 AIConfig por canal (UNIQUE). Agora: pode ser usado em workflows também.
-- Regra preservada: continua sendo no máximo 1 AIConfig isolado por canal (índice parcial).

BEGIN;

-- 1. Adiciona colunas pro modo workflow. Ambas nullable: agentes existentes continuam intocados.
ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS tools JSONB,
  ADD COLUMN IF NOT EXISTS outcomes JSONB;

COMMENT ON COLUMN ai_configs.tools IS
  'Lista de nomes de tools do workflow_tools.registry. NULL = agente nunca foi usado em workflow.';
COMMENT ON COLUMN ai_configs.outcomes IS
  'Lista de outcomes (handles de saída do nó-Agente). NULL = agente nunca foi usado em workflow.';

-- 2. Remove UNIQUE em channel_id e recria como índice parcial (mantém: 1 isolado por canal).
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'ai_configs'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ILIKE '%channel_id%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ai_configs DROP CONSTRAINT %I', cname);
    RAISE NOTICE 'Removida constraint UNIQUE: %', cname;
  ELSE
    RAISE NOTICE 'Nenhuma constraint UNIQUE em channel_id encontrada (já removida?)';
  END IF;
END $$;

-- Também remover qualquer índice unique solto em channel_id (caso seja índice e não constraint)
DROP INDEX IF EXISTS ai_configs_channel_id_key;

-- 3. Recria como índice parcial: única regra é "1 AIConfig por canal QUANDO há canal".
--    AIConfigs com channel_id NULL (agentes-de-biblioteca puros) podem ter quantos quiser.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_configs_channel_isolated_uniq
  ON ai_configs(channel_id)
  WHERE channel_id IS NOT NULL;

-- 4. Index pra listar agentes-de-biblioteca rapidamente
CREATE INDEX IF NOT EXISTS idx_ai_configs_tenant_workflow_capable
  ON ai_configs(tenant_id)
  WHERE tools IS NOT NULL;

COMMIT;
