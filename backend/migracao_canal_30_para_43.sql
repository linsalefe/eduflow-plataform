-- ============================================================
-- Migração de histórico: canal 30 (GV Comercial IA) -> canal 43 (CRM GV COMERCIAL)
-- Tenant 4 — GV Sports Education
-- Base: RELATORIO_MIGRACAO_CANAL.md §6.2
--
-- Transação única com asserções: qualquer divergência levanta exceção
-- e a transação inteira é revertida (o COMMIT final nunca chega a rodar).
-- ============================================================

\set ANTIGO 30
\set NOVO   43

BEGIN;

-- Serializa contra mensagens chegando no meio da migração
SELECT id FROM channels WHERE id IN (:ANTIGO, :NOVO) ORDER BY id FOR UPDATE;

-- ---------- Fotografia do ANTES ----------
CREATE TEMP TABLE _antes ON COMMIT DROP AS
SELECT 'messages'                  AS tabela, COUNT(*) FILTER (WHERE channel_id=:ANTIGO) AS antigo, COUNT(*) FILTER (WHERE channel_id=:NOVO) AS novo FROM messages
UNION ALL SELECT 'contacts',              COUNT(*) FILTER (WHERE channel_id=:ANTIGO), COUNT(*) FILTER (WHERE channel_id=:NOVO) FROM contacts
UNION ALL SELECT 'contact_channel_state', COUNT(*) FILTER (WHERE channel_id=:ANTIGO), COUNT(*) FILTER (WHERE channel_id=:NOVO) FROM contact_channel_state
UNION ALL SELECT 'form_submissions',      COUNT(*) FILTER (WHERE channel_id=:ANTIGO), COUNT(*) FILTER (WHERE channel_id=:NOVO) FROM form_submissions
UNION ALL SELECT 'landing_pages',         COUNT(*) FILTER (WHERE channel_id=:ANTIGO), COUNT(*) FILTER (WHERE channel_id=:NOVO) FROM landing_pages
UNION ALL SELECT 'ai_configs',            COUNT(*) FILTER (WHERE channel_id=:ANTIGO), COUNT(*) FILTER (WHERE channel_id=:NOVO) FROM ai_configs
UNION ALL SELECT 'knowledge_documents',   COUNT(*) FILTER (WHERE channel_id=:ANTIGO), COUNT(*) FILTER (WHERE channel_id=:NOVO) FROM knowledge_documents
UNION ALL SELECT 'ai_conversation_summaries', COUNT(*) FILTER (WHERE channel_id=:ANTIGO), COUNT(*) FILTER (WHERE channel_id=:NOVO) FROM ai_conversation_summaries;

\echo '===== ANTES ====='
SELECT * FROM _antes ORDER BY antigo DESC;

-- Quantos contatos distintos devem existir em contact_channel_state no canal novo ao final
CREATE TEMP TABLE _ccs_esperado ON COMMIT DROP AS
SELECT COUNT(DISTINCT contact_id) AS n
FROM contact_channel_state WHERE channel_id IN (:ANTIGO, :NOVO);

-- Registra os conflitos encontrados (para o relatório)
CREATE TEMP TABLE _conflitos ON COMMIT DROP AS
SELECT a.contact_id,
       a.lead_status AS status_antigo, a.updated_at AS upd_antigo,
       b.lead_status AS status_novo,   b.updated_at AS upd_novo,
       CASE WHEN a.updated_at > b.updated_at THEN 'mantem_antigo' ELSE 'mantem_novo' END AS decisao
FROM contact_channel_state a
JOIN contact_channel_state b ON b.contact_id = a.contact_id AND b.channel_id = :NOVO
WHERE a.channel_id = :ANTIGO;

\echo '===== CONFLITOS EM contact_channel_state ====='
SELECT * FROM _conflitos;

-- ---------- 1) Mensagens ----------
UPDATE messages SET channel_id = :NOVO WHERE channel_id = :ANTIGO;

-- ---------- 2) contact_channel_state (resolve conflito antes de mover) ----------
-- 2a) conflito em que o registro ANTIGO é mais velho ou igual -> descarta o antigo
DELETE FROM contact_channel_state a
USING contact_channel_state b
WHERE a.channel_id = :ANTIGO AND b.channel_id = :NOVO
  AND a.contact_id = b.contact_id
  AND a.updated_at <= b.updated_at;

-- 2b) conflito em que o registro ANTIGO é mais recente -> descarta o do canal novo
DELETE FROM contact_channel_state b
USING contact_channel_state a
WHERE a.channel_id = :ANTIGO AND b.channel_id = :NOVO
  AND a.contact_id = b.contact_id
  AND a.updated_at > b.updated_at;

-- 2c) move o que restou
UPDATE contact_channel_state SET channel_id = :NOVO WHERE channel_id = :ANTIGO;

-- ---------- 3..7) Demais tabelas ----------
UPDATE ai_conversation_summaries SET channel_id = :NOVO WHERE channel_id = :ANTIGO;
UPDATE contacts                  SET channel_id = :NOVO WHERE channel_id = :ANTIGO;
UPDATE landing_pages             SET channel_id = :NOVO WHERE channel_id = :ANTIGO;
UPDATE form_submissions          SET channel_id = :NOVO WHERE channel_id = :ANTIGO;
UPDATE ai_configs                SET channel_id = :NOVO WHERE channel_id = :ANTIGO;
UPDATE knowledge_documents       SET channel_id = :NOVO WHERE channel_id = :ANTIGO;

-- ---------- 8) Herda o pipeline padrão ----------
UPDATE channels
   SET default_pipeline_id = (SELECT default_pipeline_id FROM channels WHERE id = :ANTIGO)
 WHERE id = :NOVO AND default_pipeline_id IS NULL;

-- ---------- 9) Aposenta o canal antigo (SEM deletar) ----------
UPDATE channels SET is_active = false WHERE id = :ANTIGO;

-- ---------- ASSERÇÕES ----------
DO $$
DECLARE
    v_esperado bigint;
    v_real     bigint;
    v_sobra    bigint;
BEGIN
    -- Nenhuma linha pode continuar apontando para o canal antigo
    SELECT (SELECT COUNT(*) FROM messages              WHERE channel_id = 30)
         + (SELECT COUNT(*) FROM contacts              WHERE channel_id = 30)
         + (SELECT COUNT(*) FROM contact_channel_state WHERE channel_id = 30)
         + (SELECT COUNT(*) FROM form_submissions      WHERE channel_id = 30)
         + (SELECT COUNT(*) FROM landing_pages         WHERE channel_id = 30)
         + (SELECT COUNT(*) FROM ai_configs            WHERE channel_id = 30)
         + (SELECT COUNT(*) FROM knowledge_documents   WHERE channel_id = 30)
         + (SELECT COUNT(*) FROM ai_conversation_summaries WHERE channel_id = 30)
    INTO v_sobra;
    IF v_sobra <> 0 THEN
        RAISE EXCEPTION 'ABORTADO: % linhas ainda apontam para o canal 30', v_sobra;
    END IF;

    -- messages: total no canal novo = soma do antes
    SELECT antigo + novo INTO v_esperado FROM _antes WHERE tabela = 'messages';
    SELECT COUNT(*) INTO v_real FROM messages WHERE channel_id = 43;
    IF v_real <> v_esperado THEN
        RAISE EXCEPTION 'ABORTADO: messages esperado % obtido %', v_esperado, v_real;
    END IF;

    -- contacts
    SELECT antigo + novo INTO v_esperado FROM _antes WHERE tabela = 'contacts';
    SELECT COUNT(*) INTO v_real FROM contacts WHERE channel_id = 43;
    IF v_real <> v_esperado THEN
        RAISE EXCEPTION 'ABORTADO: contacts esperado % obtido %', v_esperado, v_real;
    END IF;

    -- form_submissions
    SELECT antigo + novo INTO v_esperado FROM _antes WHERE tabela = 'form_submissions';
    SELECT COUNT(*) INTO v_real FROM form_submissions WHERE channel_id = 43;
    IF v_real <> v_esperado THEN
        RAISE EXCEPTION 'ABORTADO: form_submissions esperado % obtido %', v_esperado, v_real;
    END IF;

    -- contact_channel_state: 1 linha por contato distinto que existia nos dois canais
    SELECT n INTO v_esperado FROM _ccs_esperado;
    SELECT COUNT(*) INTO v_real FROM contact_channel_state WHERE channel_id = 43;
    IF v_real <> v_esperado THEN
        RAISE EXCEPTION 'ABORTADO: contact_channel_state esperado % obtido %', v_esperado, v_real;
    END IF;

    -- pipeline herdado e canal antigo inativo
    IF (SELECT default_pipeline_id FROM channels WHERE id = 43) IS NULL THEN
        RAISE EXCEPTION 'ABORTADO: canal 43 ficou sem default_pipeline_id';
    END IF;
    IF (SELECT is_active FROM channels WHERE id = 30) <> false THEN
        RAISE EXCEPTION 'ABORTADO: canal 30 nao foi desativado';
    END IF;

    RAISE NOTICE 'Todas as assercoes passaram.';
END $$;

\echo '===== DEPOIS ====='
SELECT 'messages' AS tabela, COUNT(*) FILTER (WHERE channel_id=30) AS antigo, COUNT(*) FILTER (WHERE channel_id=43) AS novo FROM messages
UNION ALL SELECT 'contacts',              COUNT(*) FILTER (WHERE channel_id=30), COUNT(*) FILTER (WHERE channel_id=43) FROM contacts
UNION ALL SELECT 'contact_channel_state', COUNT(*) FILTER (WHERE channel_id=30), COUNT(*) FILTER (WHERE channel_id=43) FROM contact_channel_state
UNION ALL SELECT 'form_submissions',      COUNT(*) FILTER (WHERE channel_id=30), COUNT(*) FILTER (WHERE channel_id=43) FROM form_submissions
UNION ALL SELECT 'landing_pages',         COUNT(*) FILTER (WHERE channel_id=30), COUNT(*) FILTER (WHERE channel_id=43) FROM landing_pages
UNION ALL SELECT 'ai_configs',            COUNT(*) FILTER (WHERE channel_id=30), COUNT(*) FILTER (WHERE channel_id=43) FROM ai_configs
UNION ALL SELECT 'knowledge_documents',   COUNT(*) FILTER (WHERE channel_id=30), COUNT(*) FILTER (WHERE channel_id=43) FROM knowledge_documents
ORDER BY 3 DESC;

SELECT id, name, is_active, is_connected, default_pipeline_id FROM channels WHERE id IN (30,43) ORDER BY id;

COMMIT;
