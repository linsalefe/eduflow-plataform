-- ============================================================
-- MIGRATION: Voice AI Tables
-- Cria as tabelas necessárias para o sistema de ligações com IA
-- Execute este SQL no PostgreSQL do EduFlow
-- ============================================================

-- 1. Tabela principal de chamadas da IA
CREATE TABLE IF NOT EXISTS ai_calls (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES exact_leads(id),
    contact_wa_id VARCHAR(20) REFERENCES contacts(wa_id),
    twilio_call_sid VARCHAR(100) UNIQUE,
    
    -- Dados da chamada
    from_number VARCHAR(30) NOT NULL,
    to_number VARCHAR(30) NOT NULL,
    direction VARCHAR(20) DEFAULT 'outbound',
    status VARCHAR(30) DEFAULT 'pending',
    fsm_state VARCHAR(30) DEFAULT 'OPENING',
    
    -- Resultado
    outcome VARCHAR(30),
    score INTEGER DEFAULT 0,
    score_breakdown JSONB,
    collected_fields JSONB,
    objections JSONB,
    tags JSONB,
    summary TEXT,
    
    -- Contexto
    course VARCHAR(255),
    campaign VARCHAR(255),
    source VARCHAR(100),
    lead_name VARCHAR(255),
    
    -- Handoff
    handoff_type VARCHAR(30),
    handoff_data JSONB,
    
    -- Métricas
    duration_seconds INTEGER DEFAULT 0,
    total_turns INTEGER DEFAULT 0,
    avg_latency_ms INTEGER DEFAULT 0,
    recording_url TEXT,
    drive_file_url TEXT,
    
    -- Retry
    attempt_number INTEGER DEFAULT 1,
    retry_of_call_id INTEGER REFERENCES ai_calls(id),
    
    -- Timestamps
    started_at TIMESTAMP,
    answered_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_calls_twilio_sid ON ai_calls(twilio_call_sid);
CREATE INDEX IF NOT EXISTS idx_ai_calls_status ON ai_calls(status);
CREATE INDEX IF NOT EXISTS idx_ai_calls_outcome ON ai_calls(outcome);
CREATE INDEX IF NOT EXISTS idx_ai_calls_created ON ai_calls(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_calls_contact ON ai_calls(contact_wa_id);

-- 2. Turnos da conversa (cada fala)
CREATE TABLE IF NOT EXISTS ai_call_turns (
    id SERIAL PRIMARY KEY,
    call_id INTEGER NOT NULL REFERENCES ai_calls(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,  -- user|assistant|system
    text TEXT NOT NULL,
    fsm_state VARCHAR(30),
    
    -- Métricas do turno
    stt_latency_ms INTEGER,
    llm_latency_ms INTEGER,
    tts_latency_ms INTEGER,
    total_latency_ms INTEGER,
    confidence FLOAT,
    
    -- Ação executada
    action VARCHAR(50),
    fields_extracted JSONB,
    barge_in BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_call_turns_call ON ai_call_turns(call_id);

-- 3. Eventos da chamada
CREATE TABLE IF NOT EXISTS ai_call_events (
    id SERIAL PRIMARY KEY,
    call_id INTEGER NOT NULL REFERENCES ai_calls(id) ON DELETE CASCADE,
    event VARCHAR(50) NOT NULL,
    payload JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_call_events_call ON ai_call_events(call_id);

-- 4. Roteiros / Scripts
CREATE TABLE IF NOT EXISTS voice_scripts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    course VARCHAR(255),
    persona VARCHAR(100),
    channel_id INTEGER REFERENCES channels(id),
    
    opening_text TEXT,
    context_text TEXT,
    qualify_questions JSONB,
    objection_responses JSONB,
    closing_text TEXT,
    
    policies JSONB,
    system_prompt_override TEXT,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. QA Automático
CREATE TABLE IF NOT EXISTS ai_call_qa (
    id SERIAL PRIMARY KEY,
    call_id INTEGER UNIQUE NOT NULL REFERENCES ai_calls(id) ON DELETE CASCADE,
    
    script_adherence FLOAT,
    clarity_score FLOAT,
    avg_latency_ms INTEGER,
    fields_completion FLOAT,
    outcome_quality FLOAT,
    overall_score FLOAT,
    notes TEXT,
    
    evaluated_at TIMESTAMP DEFAULT NOW()
);

-- 6. Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ai_calls_updated_at
    BEFORE UPDATE ON ai_calls
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_voice_scripts_updated_at
    BEFORE UPDATE ON voice_scripts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SEED: Roteiro padrão genérico
-- ============================================================

INSERT INTO voice_scripts (name, course, opening_text, context_text, qualify_questions, objection_responses, closing_text, policies)
VALUES (
    'Roteiro Padrão - Pós-graduação',
    NULL,  -- Genérico para todos os cursos
    'Oi, {nome}! Tudo bem? Aqui é a Nat, da equipe de atendimento. Vi que você demonstrou interesse em nossos cursos. Posso falar rapidinho com você?',
    'Bacana! Vi que você se interessou pelo curso de {curso}. É isso mesmo?',
    '[
        {"field": "objetivo", "question": "Legal! E qual seria seu principal objetivo com esse curso? O que te motivou a procurar?"},
        {"field": "prazo", "question": "Entendi! E pra quando você pensa em começar?"},
        {"field": "disponibilidade", "question": "Beleza! E qual período seria melhor pra você? Temos opções de manhã, tarde e noite."},
        {"field": "forma_pagamento", "question": "Perfeito! E sobre o investimento, você prefere à vista com desconto ou parcelado?"}
    ]',
    '{
        "preco": "Entendo que o investimento é uma consideração importante. Temos condições especiais e formas de pagamento facilitadas. Posso te passar os detalhes?",
        "tempo": "Compreendo! O curso foi desenhado pra ser flexível e se encaixar na rotina de quem trabalha. As aulas são [horários] e o material fica disponível online.",
        "pensar": "Claro, sem problema! Posso te enviar um material completo por WhatsApp pra você avaliar com calma. Que tal?",
        "desconfianca": "Entendo sua preocupação. Somos uma instituição reconhecida pelo MEC com mais de [X] anos de experiência. Posso te contar mais sobre nossa estrutura?"
    }',
    'Muito obrigada pelo seu tempo, {nome}! Foi um prazer conversar com você. Qualquer dúvida, estou à disposição!',
    '{"pode_dar_desconto": false, "mencionar_preco": false, "preco_apenas_closer": true, "lgpd": true}'
) ON CONFLICT DO NOTHING;

-- ============================================================
-- PRONTO! Execute com: psql -d eduflow_db -f migration_voice_ai.sql
-- ============================================================