-- MIGRAÇÃO MULTI-TENANT - EduFlow

-- 1. Criar tabela de tenants
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    owner_email VARCHAR(255) NOT NULL,
    owner_phone VARCHAR(30),
    plan VARCHAR(30) DEFAULT 'basic',
    status VARCHAR(20) DEFAULT 'active',
    max_users INTEGER DEFAULT 5,
    max_channels INTEGER DEFAULT 2,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Criar tabela de subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    plan VARCHAR(30) NOT NULL DEFAULT 'basic',
    value NUMERIC(10,2) NOT NULL,
    billing_day INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) DEFAULT 'active',
    started_at TIMESTAMP DEFAULT NOW(),
    next_billing TIMESTAMP,
    cancelled_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);

-- 3. Inserir tenant padrao para o cliente atual
INSERT INTO tenants (name, slug, owner_name, owner_email, plan, status)
VALUES ('Cliente Atual', 'cliente-atual', 'Admin', 'admin@eduflow.com', 'pro', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 4. Adicionar tenant_id em todas as tabelas existentes
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE channels ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE tags ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE exact_leads ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE ai_conversation_summaries ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE voice_scripts ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);

-- 5. Vincular todos os dados existentes ao tenant padrao (id=1)
UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE channels SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE contacts SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE messages SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE tags SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE exact_leads SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE ai_configs SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE knowledge_documents SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE ai_conversation_summaries SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE call_logs SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE landing_pages SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE form_submissions SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE schedules SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE activities SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE tasks SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE notifications SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE financial_entries SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE ai_calls SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE voice_scripts SET tenant_id = 1 WHERE tenant_id IS NULL;

-- 6. Tornar NOT NULL (exceto users)
ALTER TABLE channels ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE contacts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE tags ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE exact_leads ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE ai_configs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE knowledge_documents ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE ai_conversation_summaries ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE call_logs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE landing_pages ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE form_submissions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE schedules ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE activities ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE financial_entries ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE ai_calls ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE voice_scripts ALTER COLUMN tenant_id SET NOT NULL;

-- 7. Criar indices para performance
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_channels_tenant ON channels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tags_tenant ON tags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exact_leads_tenant ON exact_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_configs_tenant ON ai_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_tenant ON knowledge_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_tenant ON ai_conversation_summaries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_tenant ON call_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_landing_pages_tenant ON landing_pages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_tenant ON form_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_schedules_tenant ON schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activities_tenant ON activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_tenant ON financial_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_calls_tenant ON ai_calls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_voice_scripts_tenant ON voice_scripts(tenant_id);

-- 8. Ajustar constraints de unicidade por tenant
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_key;
ALTER TABLE tags ADD CONSTRAINT uq_tag_tenant_name UNIQUE (tenant_id, name);

ALTER TABLE exact_leads DROP CONSTRAINT IF EXISTS exact_leads_exact_id_key;
ALTER TABLE exact_leads ADD CONSTRAINT uq_exactlead_tenant_exactid UNIQUE (tenant_id, exact_id);

-- 9. Criar usuario superadmin
INSERT INTO users (name, email, password_hash, role, tenant_id)
VALUES (
    'Super Admin',
    'superadmin@eduflow.com',
    '$2b$12$LJ3m4ys3Lk0TSwHjPPaXruGXrMBjeed4DP0V2G0SVfMSJv6gKJTLe',
    'superadmin',
    NULL
) ON CONFLICT (email) DO NOTHING;
