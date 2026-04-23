# Plano de Refatoração: contact_wa_id → contact_id

**Data:** 2026-04-23  
**Status:** FASE 0 — Investigação e Planejamento (somente leitura)  
**Motivação:** `contacts.wa_id` tem constraint `UNIQUE GLOBAL` (`ix_contacts_wa_id`), impedindo multi-tenancy correto. Mesmo número WhatsApp em 2 tenants = `IntegrityError`.

---

## 1. Inventário de Dados

### 1.1 Tabela `contacts`

| tenant_id | count |
|-----------|-------|
| 1         | 70    |
| 4 (GV)    | 256   |
| 5         | 80    |
| 6         | 269   |
| 7         | 13    |
| **Total** | **688** |

**Duplicatas latentes (tenant_id, wa_id com COUNT > 1):** NENHUMA — o UNIQUE global impede duplicatas por wa_id (qualquer tenant).

### 1.2 Tabelas Filhas — Resumo

| Tabela | Rows total | Rows GV (t4) | Órfãs | FK? | Risco |
|--------|-----------|--------------|-------|-----|-------|
| messages | 13.991 | 1.265 | 0 | ✅ `contacts(wa_id)` | ALTO — maior tabela |
| activities | 697 | 415 | 0 | ✅ `contacts(wa_id)` ON DELETE CASCADE | MÉDIO |
| tasks | 8 | 5 | 6 (NULL) | ✅ `contacts(wa_id)` nullable | BAIXO |
| schedules | 5 | 0 | 0 | ✅ `contacts(wa_id)` | BAIXO |
| contact_tags | 36 | ? | 0 | ✅ `contacts(wa_id)` PK composta | MÉDIO — sem tenant_id |
| ai_conversation_summaries | 0 | 0 | 0 | ✅ `contacts(wa_id)` | ZERO — vazia |
| ai_calls | 21 | 0 | 10 (NULL) | ✅ `contacts(wa_id)` nullable | BAIXO |
| financial_entries | 0 | 0 | 0 | ✅ `contacts(wa_id)` | ZERO — vazia |

### 1.3 Tabelas Adicionais com `contact_wa_id` (SEM FK)

| Tabela | Rows | FK? | Notas |
|--------|------|-----|-------|
| call_logs | 0 | ❌ sem FK | `contact_wa_id` VARCHAR(20) nullable, sem constraint |
| notifications | 3.641 | ❌ sem FK | `contact_wa_id` VARCHAR(20) nullable, sem constraint |
| ai_feedback | 10 | ❌ sem FK | `contact_wa_id` VARCHAR(100), sem constraint |
| automation_executions | 308 | ❌ sem FK | `contact_wa_id` VARCHAR(100), sem constraint, sem tenant_id |
| chatbot_sessions | 2 | ❌ sem FK | `contact_wa_id` VARCHAR(100), tem tenant_id |

### 1.4 Referência positiva

`call_campaign_items` já usa `contact_id BIGINT FK → contacts(id)` — padrão correto a ser seguido.

`lead_agent_context` já usa `lead_id FK → contacts(id)` — outro exemplo do padrão correto.

### 1.5 Observações sobre órfãs

- **tasks:** 6 de 8 rows têm `contact_wa_id = NULL` — são tasks criadas sem contato associado (permitido pelo schema nullable). Não são referências quebradas.
- **ai_calls:** 10 de 21 rows têm `contact_wa_id = NULL` — idem, calls sem contato associado.
- **Nenhuma row** tem referência a um contato que foi deletado (0 dangling references reais).

---

## 2. Mapeamento de Código

### 2.1 Resumo Quantitativo

- **Total de referências a `contact_wa_id` / `.wa_id`:** ~306 ocorrências em 37 arquivos Python
- **Tabelas com FK:** 8 (messages, activities, tasks, schedules, contact_tags, ai_conversation_summaries, ai_calls, financial_entries)
- **Tabelas sem FK mas com coluna:** 5 (call_logs, notifications, ai_feedback, automation_executions, chatbot_sessions)
- **Total de tabelas a migrar:** 13

### 2.2 Queries SEM filtro por tenant_id (RISCO ALTO)

Estas queries fazem lookup de Contact por wa_id sem filtrar por tenant, causando o bug de multi-tenancy:

| # | Arquivo:Linha | Tipo | Código |
|---|---------------|------|--------|
| 1 | `main.py:130` | R | `select(Contact).where(Contact.wa_id == s.contact_wa_id)` |
| 2 | `main.py:168` | R | `select(Contact).where(Contact.wa_id == s.contact_wa_id)` |
| 3 | `main.py:301` | R+W | `select(Contact).where(Contact.wa_id == wa_id)` — webhook principal |
| 4 | `main.py:533` | R | `Contact.wa_id == ig_sender_id` |
| 5 | `routes.py:327` | R | `select(Contact).where(Contact.wa_id == req.to)` |
| 6 | `routes.py:358` | R | `select(Contact).where(Contact.wa_id == wa_id)` |
| 7 | `routes.py:384` | R | `select(Contact).where(Contact.wa_id == wa_id)` |
| 8 | `routes.py:413` | R | `select(Contact).where(Contact.wa_id == wa_id)` |
| 9 | `routes.py:492` | R | `select(Contact).where(Contact.wa_id == wa_id)` |
| 10 | `routes.py:630` | R+W | `select(Contact).where(Contact.wa_id == phone)` — create contact |
| 11 | `routes.py:683` | R+W | `select(Contact).where(Contact.wa_id == phone)` — bulk import |
| 12 | `webhook_routes.py:185` | R+W | `select(Contact).where(Contact.wa_id == phone)` |
| 13 | `landing_routes.py:163` | R | `select(Contact).where(Contact.wa_id == phone_clean)` |
| 14 | `kanban_routes.py:121` | R+W | `select(Contact).where(Contact.wa_id == card.contact_wa_id)` |
| 15 | `automation_routes.py:244` | R | `select(Contact).where(Contact.wa_id == ex.contact_wa_id)` |
| 16 | `ai_engine.py:182` | R | `select(Contact).where(Contact.wa_id == contact_wa_id)` |
| 17 | `ai_engine.py:283` | R | `select(ContactModel).where(ContactModel.wa_id == contact_wa_id)` |
| 18 | `voice_ai/routes.py:100` | R | `select(Contact).where(Contact.wa_id == phone)` |
| 19 | `voice_ai/routes.py:708` | R | `select(Contact).where(Contact.wa_id == data.contact_wa_id)` |
| 20 | `voice_ai/crm_adapter.py:33` | R | `select(Contact).where(Contact.wa_id == call.contact_wa_id)` |
| 21 | `exact_spotter.py:144` | R | `select(Contact).where(Contact.wa_id == phone)` |
| 22 | `evolution/ai_agent.py:54` | R | `select(Contact).where(Contact.wa_id == wa_id)` |
| 23 | `evolution/ai_agent.py:194` | R | `select(Contact).where(Contact.wa_id == wa_id)` |
| 24 | `voice_ai_elevenlabs/routes.py:138` | R | `Contact.wa_id.contains(phone_clean[-8:])` — MUITO PERIGOSO |

### 2.3 Queries COM filtro por tenant_id (OK)

| Arquivo:Linha | Código |
|---------------|--------|
| `evolution/routes.py:252` | `Contact.wa_id == contact_phone, Contact.tenant_id == tenant_id` ✅ |
| `evolution/routes.py:401` | `Contact.wa_id == contact_phone, Contact.tenant_id == tenant_id` ✅ |
| `evolution/routes.py:484` | `Contact.wa_id == phone, Contact.tenant_id == tenant_id` ✅ |
| `evolution/routes.py:555` | `Contact.wa_id == phone, Contact.tenant_id == tenant_id` ✅ |
| `ai_routes.py:99` | `Contact.wa_id == wa_id, Contact.tenant_id == tenant_id` ✅ |
| `chatbot/engine.py:681` | `Contact.wa_id == contact_wa_id, Contact.tenant_id == tenant_id` ✅ |
| `routes.py:706` | `Contact.wa_id == wa_id, Contact.tenant_id == tenant_id` ✅ |
| `routes.py:732` | `Contact.wa_id == wa_id, Contact.tenant_id == tenant_id` ✅ |
| `routes.py:761` | `Contact.wa_id == wa_id, Contact.tenant_id == tenant_id` ✅ |
| `routes.py:838` | `Contact.wa_id == wa_id, Contact.tenant_id == tenant_id` ✅ |
| `routes.py:927` | `Contact.wa_id == wa_id, Contact.tenant_id == tenant_id` ✅ |
| `routes.py:1227` | `Contact.wa_id == wa_id, Contact.tenant_id == tenant_id` ✅ |
| `financial_routes.py:50` | `Contact.wa_id == data.contact_wa_id, Contact.tenant_id == tenant_id` ✅ |
| `ai_lab/service.py:297` | `Contact.wa_id == contact_wa_id, Contact.tenant_id == tenant_id` ✅ |

### 2.4 Operações de ESCRITA com contact_wa_id

Pontos onde objetos são criados com `contact_wa_id=xxx`:

| Arquivo:Linha | Modelo criado |
|---------------|---------------|
| `main.py:369` | `Message(contact_wa_id=msg["from"])` |
| `main.py:610` | `Message(contact_wa_id=ig_sender_id)` |
| `routes.py:337` | `Message(contact_wa_id=req.to)` |
| `routes.py:368` | `Message(contact_wa_id=wa_id)` |
| `routes.py:393` | `Message(contact_wa_id=wa_id)` |
| `routes.py:428` | `Message(contact_wa_id=wa_id)` |
| `routes.py:502` | `Message(contact_wa_id=wa_id)` |
| `routes.py:879` | `contact_tags.insert().values(contact_wa_id=wa_id)` |
| `routes.py:1152` | `contact_tags.insert().values(contact_wa_id=wa_id)` |
| `routes.py:1180` | `Activity(contact_wa_id=contact_wa_id)` |
| `task_routes.py:68` | `Activity(contact_wa_id=contact_wa_id)` |
| `task_routes.py:173` | `Task(contact_wa_id=req.contact_wa_id)` |
| `schedule_routes.py:101` | `Schedule(contact_wa_id=req.contact_wa_id)` |
| `financial_routes.py:57` | `FinancialEntry(contact_wa_id=data.contact_wa_id)` |
| `evolution/routes.py:387` | `Message(contact_wa_id=contact_phone)` |
| `evolution/routes.py:539` | `Message(contact_wa_id=phone)` |
| `evolution/routes.py:640` | `Message(contact_wa_id=phone)` |
| `evolution/ai_agent.py:405` | `Activity(contact_wa_id=wa_id)` |
| `ai_engine.py:262` | Passa `contact_wa_id` como parâmetro |
| `voice_ai/routes.py:148` | `AICall(contact_wa_id=phone)` |
| `voice_ai/routes.py:905` | `Schedule(contact_wa_id=call.contact_wa_id)` |
| `voice_ai/crm_adapter.py:95` | `AIConversationSummary(contact_wa_id=call.contact_wa_id)` |
| `exact_spotter.py:167` | `Activity(contact_wa_id=phone)` |
| `exact_spotter.py:179` | `Activity(contact_wa_id=phone)` |
| `reengagement.py:131` | `Activity(contact_wa_id=contact.wa_id)` |
| `automation_scheduler.py:75` | `AutomationExecution(contact_wa_id=contact_wa_id)` |
| `automation_scheduler.py:213` | `Message(contact_wa_id=execution.contact_wa_id)` |
| `landing_routes.py:405` | `INSERT INTO contact_tags (contact_wa_id, tag_id)` (raw SQL) |
| `chatbot/engine.py:206` | `Message(contact_wa_id=to)` |
| `chatbot/engine.py:271` | `Message(contact_wa_id=to)` |
| `chatbot/engine.py:368` | `Activity(contact_wa_id=contact.wa_id)` |
| `chatbot/engine.py:758` | `Task(contact_wa_id=contact.wa_id)` |
| `chatbot/engine.py:814` | `Task(contact_wa_id=contact.wa_id)` |
| `chatbot/engine.py:833` | `ChatbotSession(contact_wa_id=contact_wa_id)` |
| `agents/briefing/agent.py:39` | `Activity(contact_wa_id=lead.wa_id)` |
| `agents/followup/agent.py:133` | `Schedule(contact_wa_id=lead.wa_id)` |
| `agents/followup/agent.py:151` | `Schedule(contact_wa_id=lead.wa_id)` |
| `agents/followup/agent.py:168` | `Schedule(contact_wa_id=lead.wa_id)` |
| `jarvis/actions.py:290` | `Schedule(contact_wa_id=details["wa_id"])` |
| `ai_lab/service.py:159` | `AIFeedback(contact_wa_id=msg.contact_wa_id)` |
| `exact_routes.py:234` | `Activity(contact_wa_id=wa_id)` |
| `notification_routes.py:33` | `Notification(contact_wa_id=contact_wa_id)` |
| `webhook_routes.py:185+` | Cria Contact com `wa_id=phone` |

### 2.5 Frontend (API contracts que mudarão)

O frontend consome `contact_wa_id` e `wa_id` em várias APIs. A mudança de schema implica mudança de API responses. Verificar:
- `conversations-provider.tsx` (já modificado no working tree)
- Rotas de conversas, kanban, tasks, schedules, financeiro

### 2.6 Contagem por arquivo

| Arquivo | Ocorrências | Prioridade |
|---------|-------------|------------|
| `routes.py` | ~80 | CRÍTICA |
| `chatbot/engine.py` | ~30 | ALTA |
| `ai_lab/service.py` | ~20 | ALTA |
| `evolution/routes.py` | ~15 | ALTA |
| `main.py` | ~15 | CRÍTICA |
| `voice_ai/routes.py` | ~12 | MÉDIA |
| `export_routes.py` | ~12 | MÉDIA |
| `automation_scheduler.py` | ~12 | MÉDIA |
| `jarvis/execute.py` | ~10 | MÉDIA |
| `ai_engine.py` | ~15 | ALTA |
| `models.py` | ~12 | CRÍTICA |
| Outros (~26 arquivos) | ~53 | MÉDIA-BAIXA |

---

## 3. Análise do Schema Atual

### 3.1 `contacts`

```
PK: id (BIGINT, autoincrement)
UNIQUE: ix_contacts_wa_id (wa_id)  ← BUG: GLOBAL, não per-tenant
Indexes:
  - idx_contacts_tenant (tenant_id)
  - idx_contacts_assigned (assigned_to)
  - idx_contacts_pipeline (pipeline_id)
  - idx_contacts_ai_memory_updated (tenant_id, ai_memory_updated_at)
  - idx_contacts_ai_takeover (ai_takeover_active) WHERE ai_takeover_active = true
FKs:
  - tenant_id → tenants(id)
  - channel_id → channels(id)
  - assigned_to → users(id)
  - pipeline_id → pipelines(id) ON DELETE SET NULL
```

### 3.2 `messages`

```
PK: id (BIGINT)
UNIQUE: wa_message_id
Columns: contact_wa_id VARCHAR(20) NOT NULL
FKs:
  - contact_wa_id → contacts(wa_id) [sem ON DELETE]
  - channel_id → channels(id)
  - tenant_id → tenants(id)
Indexes: idx on contact_wa_id, tenant_id
```

### 3.3 `activities`

```
PK: id (BIGINT)
Columns: contact_wa_id VARCHAR(20) NOT NULL
FKs:
  - contact_wa_id → contacts(wa_id) ON DELETE CASCADE
  - tenant_id → tenants(id)
Indexes: idx on contact_wa_id, created_at DESC, tenant_id
```

### 3.4 `tasks`

```
PK: id (INTEGER)
Columns: contact_wa_id VARCHAR(20) NULLABLE
FKs:
  - contact_wa_id → contacts(wa_id) [sem ON DELETE]
  - assigned_to → users(id)
  - created_by → users(id)
  - tenant_id → tenants(id)
Indexes: idx on contact_wa_id, assigned_to, due_date, status, tenant_id
```

### 3.5 `schedules`

```
PK: id (INTEGER)
Columns: contact_wa_id VARCHAR(20) NOT NULL
FKs:
  - contact_wa_id → contacts(wa_id) [sem ON DELETE]
  - call_id → ai_calls(id)
  - channel_id → channels(id)
  - tenant_id → tenants(id)
Indexes: idx on contact_wa_id, scheduled_at, status, tenant_id
```

### 3.6 `contact_tags`

```
PK composta: (contact_wa_id, tag_id)
Columns: contact_wa_id VARCHAR(20), tag_id INTEGER
FKs:
  - contact_wa_id → contacts(wa_id) [sem ON DELETE]
  - tag_id → tags(id)
SEM tenant_id  ← risco de isolamento
```

### 3.7 `ai_conversation_summaries`

```
PK: id (INTEGER)
Columns: contact_wa_id VARCHAR(20) NOT NULL
FKs:
  - contact_wa_id → contacts(wa_id) [sem ON DELETE]
  - channel_id → channels(id)
  - tenant_id → tenants(id)
Indexes: idx on tenant_id, contact_wa_id
```

### 3.8 `ai_calls`

```
PK: id (INTEGER)
Columns: contact_wa_id VARCHAR(20) NULLABLE
FKs:
  - contact_wa_id → contacts(wa_id) [sem ON DELETE]
  - lead_id → exact_leads(id)
  - tenant_id → tenants(id)
Indexes: idx on contact_wa_id, created_at, outcome, status, tenant_id
Referenced by: ai_call_events, ai_call_qa, ai_call_turns, call_campaign_items, schedules
```

### 3.9 `financial_entries`

```
PK: id (INTEGER)
Columns: contact_wa_id VARCHAR(20) NOT NULL
FKs:
  - contact_wa_id → contacts(wa_id) [sem ON DELETE]
  - created_by → users(id)
  - tenant_id → tenants(id)
Indexes: idx on contact_wa_id, created_at, tenant_id
```

### 3.10 Tabelas sem FK (coluna informacional)

```
call_logs:             contact_wa_id VARCHAR(20) nullable, sem FK
notifications:         contact_wa_id VARCHAR(20) nullable, sem FK
ai_feedback:           contact_wa_id VARCHAR(100), sem FK
automation_executions: contact_wa_id VARCHAR(100), sem FK, SEM tenant_id
chatbot_sessions:      contact_wa_id VARCHAR(100), sem FK
```

### 3.11 Tabela `voice_ai/models.py` — `ai_calls`

```python
contact_wa_id = Column(String(20), ForeignKey("contacts.wa_id"), nullable=True)
```
Definida em arquivo separado: `backend/app/voice_ai/models.py:20`

---

## 4. Análise de Riscos

### Risco 1: Downtime durante migration

- **`ALTER TABLE messages ADD COLUMN contact_id BIGINT NULL`** em ~14k rows: **< 1 segundo** (apenas adiciona metadados, não reescreve tabela em PostgreSQL).
- **`UPDATE messages SET contact_id = ...`** em 14k rows via JOIN: **< 5 segundos**.
- **Criação de índice:** `CREATE INDEX CONCURRENTLY` pode rodar sem lock.
- **FK constraint:** `ADD CONSTRAINT` faz full table scan para validar — ~14k rows = **< 2 segundos**.
- **Consequência de webhook durante migration:** Se a transaction é rápida (< 10s total), o webhook pode receber 500 momentâneo mas o retry do WhatsApp resolverá em 30s.
- **Recomendação:** Executar fora do horário comercial (após 22h BRT) ou em horário de baixo tráfego.

### Risco 2: Rows órfãs

- **Quantidade:** 0 referências quebradas reais. 6 tasks + 10 ai_calls com `contact_wa_id = NULL` (intencional).
- **Proposta:** Rows com `contact_wa_id = NULL` terão `contact_id = NULL` naturalmente. Nenhuma ação especial necessária.

### Risco 3: Queries não atualizadas

- **24 queries** fazem lookup por `wa_id` sem `tenant_id` — todas precisam mudar.
- **~40 pontos de escrita** criam objetos com `contact_wa_id=xxx` — todos precisam mudar para `contact_id=xxx`.
- **~37 arquivos** precisam ser editados no total.
- **Estimativa:** ~300 linhas de código a modificar.
- **RISCO PRINCIPAL:** Se uma única query não for atualizada, o app quebra com `column contact_wa_id does not exist` na Fase D.

### Risco 4: Relationships SQLAlchemy

**Definição atual (models.py):**
```python
# Contact → messages (via wa_id implícito na FK)
class Contact:
    messages = relationship("Message", back_populates="contact")
    tags = relationship("Tag", secondary=contact_tags, back_populates="contacts")

class Message:
    contact_wa_id = Column(String(20), ForeignKey("contacts.wa_id"))
    contact = relationship("Contact", back_populates="messages")
```

**Nova definição proposta:**
```python
class Contact:
    messages = relationship("Message", back_populates="contact", foreign_keys="[Message.contact_id]")
    tags = relationship("Tag", secondary=contact_tags, back_populates="contacts")
    # ... todas as backref existentes continuam

class Message:
    contact_id = Column(BigInteger, ForeignKey("contacts.id"), nullable=False, index=True)
    contact = relationship("Contact", back_populates="messages", foreign_keys=[contact_id])
```

**Nota sobre `contact_tags`:** Esta tabela usa `contact_wa_id` como parte da PK composta. Precisará de uma migração especial:
1. Criar nova tabela `contact_tags_new` com `(contact_id, tag_id)` como PK
2. Popular via JOIN
3. Renomear tabelas
4. Ou: adicionar `contact_id`, dropar PK antiga, criar PK nova

### Risco 5: Duplicatas latentes

- **Resultado do query:** 0 duplicatas `(tenant_id, wa_id)` encontradas.
- A constraint UNIQUE nova em `(tenant_id, wa_id)` não falhará.
- **Porém:** após criar UNIQUE `(tenant_id, wa_id)`, a constraint global `ix_contacts_wa_id` precisa ser dropada para permitir mesmo wa_id em tenants diferentes.

### Risco 6: Ordem de deploy

```
1. FASE A: SQL migration (adicionar colunas, popular, índices, FKs)
2. FASE B: Deploy código dual-write (escreve em AMBAS colunas)
   - Testar: novas rows têm contact_id preenchido
3. FASE C: Deploy código dual-read (lê preferencialmente por contact_id)
   - Testar: app inteiro funciona
4. FASE D: SQL migration (dropar colunas antigas, trocar UNIQUE)
   - Testar: webhook com mesmo número em 2 tenants
```

**CRÍTICO:** Código da Fase B DEVE ser deployado e validado ANTES de executar Fase D. Se dropar `contact_wa_id` com código antigo rodando = crash total.

---

## 5. Plano de Migration em 4 Fases Reversíveis

### PASSO 0 — Backup Obrigatório (EXECUTAR ANTES DE QUALQUER FASE)

```bash
# Backup completo do banco
sudo -u postgres pg_dump eduflow_db > ~/eduflow_backup_$(date +%Y%m%d_%H%M).sql
ls -lh ~/eduflow_backup_*.sql

# Verificar integridade do backup
sudo -u postgres pg_dump eduflow_db | wc -l
# Esperado: > 50.000 linhas para um banco com ~19k rows
```

---

### FASE A — Adicionar colunas novas (ZERO RISCO)

**Objetivo:** Adicionar `contact_id BIGINT NULL` nas 13 tabelas. Popular via JOIN. Coexistem com `contact_wa_id`.

```sql
-- ============================================================
-- FASE A: Adicionar contact_id em todas as tabelas
-- Estimativa: < 30 segundos total para ~19k rows
-- ============================================================

BEGIN;

-- --------------------------------------------------------
-- A.1: Adicionar coluna nullable em tabelas COM FK
-- --------------------------------------------------------
ALTER TABLE messages ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE ai_conversation_summaries ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
-- contact_tags tratada separadamente (PK composta)

-- Tabelas SEM FK mas com contact_wa_id informacional
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE ai_feedback ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE automation_executions ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;
ALTER TABLE chatbot_sessions ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;

COMMIT;

-- --------------------------------------------------------
-- A.2: Popular contact_id via JOIN (fora de transaction para performance)
-- --------------------------------------------------------

UPDATE messages m 
SET contact_id = c.id 
FROM contacts c 
WHERE m.contact_wa_id = c.wa_id AND m.contact_id IS NULL;
-- Esperado: 13.991 rows atualizadas

UPDATE activities a 
SET contact_id = c.id 
FROM contacts c 
WHERE a.contact_wa_id = c.wa_id AND a.contact_id IS NULL;
-- Esperado: 697 rows

UPDATE tasks t 
SET contact_id = c.id 
FROM contacts c 
WHERE t.contact_wa_id = c.wa_id AND t.contact_id IS NULL;
-- Esperado: 2 rows (6 têm NULL)

UPDATE schedules s 
SET contact_id = c.id 
FROM contacts c 
WHERE s.contact_wa_id = c.wa_id AND s.contact_id IS NULL;
-- Esperado: 5 rows

UPDATE ai_conversation_summaries a 
SET contact_id = c.id 
FROM contacts c 
WHERE a.contact_wa_id = c.wa_id AND a.contact_id IS NULL;
-- Esperado: 0 rows (tabela vazia)

UPDATE ai_calls a 
SET contact_id = c.id 
FROM contacts c 
WHERE a.contact_wa_id = c.wa_id AND a.contact_id IS NULL;
-- Esperado: 11 rows (10 têm NULL)

UPDATE financial_entries f 
SET contact_id = c.id 
FROM contacts c 
WHERE f.contact_wa_id = c.wa_id AND f.contact_id IS NULL;
-- Esperado: 0 rows (tabela vazia)

-- Tabelas sem FK
UPDATE call_logs cl 
SET contact_id = c.id 
FROM contacts c 
WHERE cl.contact_wa_id = c.wa_id AND cl.contact_id IS NULL;

UPDATE notifications n 
SET contact_id = c.id 
FROM contacts c 
WHERE n.contact_wa_id = c.wa_id AND n.contact_id IS NULL;

UPDATE ai_feedback af 
SET contact_id = c.id 
FROM contacts c 
WHERE af.contact_wa_id = c.wa_id AND af.contact_id IS NULL;

UPDATE automation_executions ae 
SET contact_id = c.id 
FROM contacts c 
WHERE ae.contact_wa_id = c.wa_id AND ae.contact_id IS NULL;

UPDATE chatbot_sessions cs 
SET contact_id = c.id 
FROM contacts c 
WHERE cs.contact_wa_id = c.wa_id AND cs.contact_id IS NULL;

-- --------------------------------------------------------
-- A.3: contact_tags — migração especial (PK composta)
-- --------------------------------------------------------

-- Adicionar coluna
ALTER TABLE contact_tags ADD COLUMN IF NOT EXISTS contact_id BIGINT NULL;

-- Popular
UPDATE contact_tags ct 
SET contact_id = c.id 
FROM contacts c 
WHERE ct.contact_wa_id = c.wa_id AND ct.contact_id IS NULL;

-- --------------------------------------------------------
-- A.4: Índices para performance (CONCURRENTLY = sem lock)
-- --------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_messages_contact_id ON messages(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_activities_contact_id ON activities(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tasks_contact_id ON tasks(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_schedules_contact_id ON schedules(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ai_conversation_summaries_contact_id ON ai_conversation_summaries(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ai_calls_contact_id ON ai_calls(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_financial_entries_contact_id ON financial_entries(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_contact_tags_contact_id ON contact_tags(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_notifications_contact_id ON notifications(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_automation_executions_contact_id ON automation_executions(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_chatbot_sessions_contact_id ON chatbot_sessions(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ai_feedback_contact_id ON ai_feedback(contact_id);

-- --------------------------------------------------------
-- A.5: Foreign Keys (validação full scan, mas tabelas pequenas)
-- --------------------------------------------------------

BEGIN;

ALTER TABLE messages 
  ADD CONSTRAINT fk_messages_contact_id 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE activities 
  ADD CONSTRAINT fk_activities_contact_id 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE tasks 
  ADD CONSTRAINT fk_tasks_contact_id 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE schedules 
  ADD CONSTRAINT fk_schedules_contact_id 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE ai_conversation_summaries 
  ADD CONSTRAINT fk_ai_conversation_summaries_contact_id 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE ai_calls 
  ADD CONSTRAINT fk_ai_calls_contact_id 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE financial_entries 
  ADD CONSTRAINT fk_financial_entries_contact_id 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE contact_tags 
  ADD CONSTRAINT fk_contact_tags_contact_id 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

-- Tabelas sem FK original — adicionar FK agora para integridade
ALTER TABLE notifications 
  ADD CONSTRAINT fk_notifications_contact_id 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE chatbot_sessions 
  ADD CONSTRAINT fk_chatbot_sessions_contact_id 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE ai_feedback 
  ADD CONSTRAINT fk_ai_feedback_contact_id 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

-- automation_executions: sem tenant_id, difícil garantir integridade
-- Adicionar FK para forçar consistência futura
ALTER TABLE automation_executions 
  ADD CONSTRAINT fk_automation_executions_contact_id 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

COMMIT;
```

**Validação pós-A:**

```sql
-- Verificar contact_id NULL em cada tabela (esperado: 0 exceto tasks/ai_calls com wa_id NULL)
SELECT 'messages' AS tbl, COUNT(*) FROM messages WHERE contact_id IS NULL
UNION ALL SELECT 'activities', COUNT(*) FROM activities WHERE contact_id IS NULL
UNION ALL SELECT 'tasks', COUNT(*) FROM tasks WHERE contact_id IS NULL
UNION ALL SELECT 'schedules', COUNT(*) FROM schedules WHERE contact_id IS NULL
UNION ALL SELECT 'contact_tags', COUNT(*) FROM contact_tags WHERE contact_id IS NULL
UNION ALL SELECT 'ai_conversation_summaries', COUNT(*) FROM ai_conversation_summaries WHERE contact_id IS NULL
UNION ALL SELECT 'ai_calls', COUNT(*) FROM ai_calls WHERE contact_id IS NULL
UNION ALL SELECT 'financial_entries', COUNT(*) FROM financial_entries WHERE contact_id IS NULL
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications WHERE contact_id IS NULL
UNION ALL SELECT 'automation_executions', COUNT(*) FROM automation_executions WHERE contact_id IS NULL
UNION ALL SELECT 'chatbot_sessions', COUNT(*) FROM chatbot_sessions WHERE contact_id IS NULL
UNION ALL SELECT 'ai_feedback', COUNT(*) FROM ai_feedback WHERE contact_id IS NULL;

-- Esperado:
-- messages: 0
-- activities: 0
-- tasks: 6 (os com contact_wa_id NULL)
-- schedules: 0
-- contact_tags: 0
-- ai_conversation_summaries: 0
-- ai_calls: 10 (os com contact_wa_id NULL)
-- financial_entries: 0
-- notifications: depende (as que não tinham contact_wa_id preenchido)
-- automation_executions: depende
```

**Rollback Fase A:**

```sql
-- Dropar FKs
ALTER TABLE messages DROP CONSTRAINT IF EXISTS fk_messages_contact_id;
ALTER TABLE activities DROP CONSTRAINT IF EXISTS fk_activities_contact_id;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_contact_id;
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS fk_schedules_contact_id;
ALTER TABLE ai_conversation_summaries DROP CONSTRAINT IF EXISTS fk_ai_conversation_summaries_contact_id;
ALTER TABLE ai_calls DROP CONSTRAINT IF EXISTS fk_ai_calls_contact_id;
ALTER TABLE financial_entries DROP CONSTRAINT IF EXISTS fk_financial_entries_contact_id;
ALTER TABLE contact_tags DROP CONSTRAINT IF EXISTS fk_contact_tags_contact_id;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_notifications_contact_id;
ALTER TABLE chatbot_sessions DROP CONSTRAINT IF EXISTS fk_chatbot_sessions_contact_id;
ALTER TABLE ai_feedback DROP CONSTRAINT IF EXISTS fk_ai_feedback_contact_id;
ALTER TABLE automation_executions DROP CONSTRAINT IF EXISTS fk_automation_executions_contact_id;

-- Dropar índices
DROP INDEX IF EXISTS ix_messages_contact_id;
DROP INDEX IF EXISTS ix_activities_contact_id;
DROP INDEX IF EXISTS ix_tasks_contact_id;
DROP INDEX IF EXISTS ix_schedules_contact_id;
DROP INDEX IF EXISTS ix_ai_conversation_summaries_contact_id;
DROP INDEX IF EXISTS ix_ai_calls_contact_id;
DROP INDEX IF EXISTS ix_financial_entries_contact_id;
DROP INDEX IF EXISTS ix_contact_tags_contact_id;
DROP INDEX IF EXISTS ix_notifications_contact_id;
DROP INDEX IF EXISTS ix_automation_executions_contact_id;
DROP INDEX IF EXISTS ix_chatbot_sessions_contact_id;
DROP INDEX IF EXISTS ix_ai_feedback_contact_id;

-- Dropar colunas
ALTER TABLE messages DROP COLUMN IF EXISTS contact_id;
ALTER TABLE activities DROP COLUMN IF EXISTS contact_id;
ALTER TABLE tasks DROP COLUMN IF EXISTS contact_id;
ALTER TABLE schedules DROP COLUMN IF EXISTS contact_id;
ALTER TABLE ai_conversation_summaries DROP COLUMN IF EXISTS contact_id;
ALTER TABLE ai_calls DROP COLUMN IF EXISTS contact_id;
ALTER TABLE financial_entries DROP COLUMN IF EXISTS contact_id;
ALTER TABLE contact_tags DROP COLUMN IF EXISTS contact_id;
ALTER TABLE call_logs DROP COLUMN IF EXISTS contact_id;
ALTER TABLE notifications DROP COLUMN IF EXISTS contact_id;
ALTER TABLE ai_feedback DROP COLUMN IF EXISTS contact_id;
ALTER TABLE automation_executions DROP COLUMN IF EXISTS contact_id;
ALTER TABLE chatbot_sessions DROP COLUMN IF EXISTS contact_id;
```

---

### FASE B — Dual-Write (BAIXO RISCO)

**Objetivo:** Atualizar código Python para escrever em AMBAS as colunas (`contact_wa_id` E `contact_id`).

#### B.1 — Mudanças no Model (`models.py`)

Adicionar `contact_id` em cada model, mantendo `contact_wa_id`:

```python
# Message — adicionar:
contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True, index=True)

# Activity — adicionar:
contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True, index=True)

# Task — adicionar:
contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True)

# Schedule — adicionar:
contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True, index=True)

# FinancialEntry — adicionar:
contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True, index=True)

# AIConversationSummary — adicionar:
contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True, index=True)

# contact_tags — adicionar coluna à Table():
Column("contact_id", BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True)

# Notification — adicionar:
contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)

# AutomationExecution — adicionar:
contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True)

# ChatbotSession — adicionar:
contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True)

# AIFeedback — adicionar:
contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True)
```

Em `voice_ai/models.py`:
```python
# AICall — adicionar:
contact_id = Column(BigInteger, ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True)
```

#### B.2 — Mudanças nos pontos de ESCRITA

Para cada ponto de escrita listado no item 2.4, o padrão é:

**Antes:**
```python
Message(contact_wa_id=wa_id, ...)
```

**Depois:**
```python
Message(contact_wa_id=wa_id, contact_id=contact.id, ...)
```

Isso requer que o objeto `contact` (Contact) esteja disponível no contexto. Na maioria dos pontos já está, pois o código faz um `select(Contact).where(...)` antes de criar o Message/Activity/etc.

**Arquivos a modificar (42 pontos de escrita):**

| Arquivo | Linhas | Mudança |
|---------|--------|---------|
| `main.py` | 369, 610 | Adicionar `contact_id=contact.id` |
| `routes.py` | 337, 368, 393, 428, 502, 879, 1152, 1180 | Adicionar `contact_id=contact.id` |
| `task_routes.py` | 68, 173 | Adicionar `contact_id` |
| `schedule_routes.py` | 101 | Adicionar `contact_id` |
| `financial_routes.py` | 57 | Adicionar `contact_id` |
| `evolution/routes.py` | 387, 539, 640 | Adicionar `contact_id` |
| `evolution/ai_agent.py` | 405 | Adicionar `contact_id` |
| `ai_engine.py` | 262 | Adicionar `contact_id` |
| `voice_ai/routes.py` | 148, 905 | Adicionar `contact_id` |
| `voice_ai/crm_adapter.py` | 95 | Adicionar `contact_id` |
| `exact_spotter.py` | 167, 179 | Adicionar `contact_id` |
| `reengagement.py` | 131 | Adicionar `contact_id` |
| `automation_scheduler.py` | 75, 213 | Adicionar `contact_id` |
| `landing_routes.py` | 405 | Mudar raw SQL |
| `chatbot/engine.py` | 206, 271, 368, 758, 814, 833 | Adicionar `contact_id` |
| `agents/briefing/agent.py` | 39 | Adicionar `contact_id` |
| `agents/followup/agent.py` | 133, 151, 168 | Adicionar `contact_id` |
| `jarvis/actions.py` | 290 | Adicionar `contact_id` |
| `ai_lab/service.py` | 159 | Adicionar `contact_id` |
| `exact_routes.py` | 234 | Adicionar `contact_id` |
| `notification_routes.py` | 33 | Adicionar `contact_id` |
| `webhook_routes.py` | ~190 | Adicionar `contact_id` ao criar Contact |

**Validação pós-B:**

```sql
-- Verificar que novas rows criadas têm contact_id preenchido
SELECT 'messages' AS tbl, COUNT(*) AS sem_contact_id 
FROM messages 
WHERE contact_id IS NULL AND contact_wa_id IS NOT NULL AND created_at > NOW() - INTERVAL '1 hour'
UNION ALL
SELECT 'activities', COUNT(*) 
FROM activities 
WHERE contact_id IS NULL AND contact_wa_id IS NOT NULL AND created_at > NOW() - INTERVAL '1 hour';
-- Esperado: 0 em todas
```

**Rollback Fase B:** `git revert <commit-hash>` — o código volta a escrever só em `contact_wa_id`, sem afetar a coluna `contact_id` existente.

---

### FASE C — Dual-Read com preferência por contact_id (MÉDIO RISCO)

**Objetivo:** Mudar queries de LEITURA para usar `contact_id` em vez de `contact_wa_id`. O campo `contact_wa_id` continua existindo mas é ignorado nas queries.

#### C.1 — Mudanças nas queries de leitura

**Padrão:**

Antes:
```python
select(Contact).where(Contact.wa_id == wa_id)
```

Depois (quando tenant disponível):
```python
select(Contact).where(Contact.wa_id == wa_id, Contact.tenant_id == tenant_id)
```

Ou melhor (quando já se tem contact_id):
```python
select(Contact).where(Contact.id == contact_id)
```

Para queries em tabelas filhas:

Antes:
```python
Message.contact_wa_id == wa_id
```

Depois:
```python
Message.contact_id == contact.id
```

#### C.2 — Mudanças nos relationships SQLAlchemy

```python
# Contact model — manter ambas relationships durante transição
class Contact:
    messages = relationship("Message", back_populates="contact", 
                          foreign_keys="[Message.contact_id]")
    # ... idem para activities, tasks, schedules, etc.

class Message:
    contact_id = Column(BigInteger, ForeignKey("contacts.id"), nullable=False)
    contact = relationship("Contact", back_populates="messages",
                          foreign_keys=[contact_id])
```

#### C.3 — Arquivos a modificar (todos os 24 pontos sem tenant_id + queries de leitura)

Mesmos arquivos da seção 2.2 + 2.4, agora nas queries de SELECT/filtro.

#### C.4 — Mudanças na API (response format)

Endpoints que retornam `contact_wa_id` nos responses precisam:
- Continuar retornando `contact_wa_id` para backward compatibility com frontend
- OU atualizar frontend simultaneamente

**Recomendação:** Retornar AMBOS `contact_wa_id` e `contact_id` nos responses durante transição.

**Validação pós-C:**

- App inteiro funciona sem regressão
- Conversas renderizam corretamente
- Kanban renderiza
- Tasks aparecem corretamente
- Nenhum erro 500 nos logs
- Chat GV Sports funciona normalmente

**Rollback Fase C:** `git revert <commit-hash>`

---

### FASE D — Cutover (PONTO DE NÃO RETORNO)

**Objetivo:** Dropar `contact_wa_id` das tabelas filhas, trocar UNIQUE de `(wa_id)` para `(tenant_id, wa_id)` na tabela contacts.

**BACKUP OBRIGATÓRIO ANTES DESTA FASE.**

```sql
-- ============================================================
-- FASE D: Cutover — PONTO DE NÃO RETORNO
-- Executar SOMENTE após validação completa das Fases A, B e C
-- ============================================================

BEGIN;

-- --------------------------------------------------------
-- D.1: Tornar contact_id NOT NULL onde contact_wa_id era NOT NULL
-- --------------------------------------------------------
ALTER TABLE messages ALTER COLUMN contact_id SET NOT NULL;
ALTER TABLE activities ALTER COLUMN contact_id SET NOT NULL;
-- schedules: contact_wa_id era NOT NULL
ALTER TABLE schedules ALTER COLUMN contact_id SET NOT NULL;
-- ai_conversation_summaries: contact_wa_id era NOT NULL (mas tabela vazia)
ALTER TABLE ai_conversation_summaries ALTER COLUMN contact_id SET NOT NULL;
-- financial_entries: contact_wa_id era NOT NULL (mas tabela vazia)
ALTER TABLE financial_entries ALTER COLUMN contact_id SET NOT NULL;

-- tasks: contact_wa_id era nullable → contact_id permanece nullable
-- ai_calls: contact_wa_id era nullable → contact_id permanece nullable

COMMIT;

-- --------------------------------------------------------
-- D.2: Dropar FKs antigas (contact_wa_id → contacts.wa_id)
-- --------------------------------------------------------

BEGIN;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_contact_wa_id_fkey;
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_contact_wa_id_fkey;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_contact_wa_id_fkey;
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_contact_wa_id_fkey;
ALTER TABLE ai_conversation_summaries DROP CONSTRAINT IF EXISTS ai_conversation_summaries_contact_wa_id_fkey;
ALTER TABLE ai_calls DROP CONSTRAINT IF EXISTS ai_calls_contact_wa_id_fkey;
ALTER TABLE financial_entries DROP CONSTRAINT IF EXISTS financial_entries_contact_wa_id_fkey;
ALTER TABLE contact_tags DROP CONSTRAINT IF EXISTS contact_tags_contact_wa_id_fkey;

COMMIT;

-- --------------------------------------------------------
-- D.3: Dropar colunas contact_wa_id das tabelas filhas
-- --------------------------------------------------------

BEGIN;

ALTER TABLE messages DROP COLUMN IF EXISTS contact_wa_id;
ALTER TABLE activities DROP COLUMN IF EXISTS contact_wa_id;
ALTER TABLE tasks DROP COLUMN IF EXISTS contact_wa_id;
ALTER TABLE schedules DROP COLUMN IF EXISTS contact_wa_id;
ALTER TABLE ai_conversation_summaries DROP COLUMN IF EXISTS contact_wa_id;
ALTER TABLE ai_calls DROP COLUMN IF EXISTS contact_wa_id;
ALTER TABLE financial_entries DROP COLUMN IF EXISTS contact_wa_id;
ALTER TABLE call_logs DROP COLUMN IF EXISTS contact_wa_id;
ALTER TABLE notifications DROP COLUMN IF EXISTS contact_wa_id;
ALTER TABLE ai_feedback DROP COLUMN IF EXISTS contact_wa_id;
ALTER TABLE automation_executions DROP COLUMN IF EXISTS contact_wa_id;
ALTER TABLE chatbot_sessions DROP COLUMN IF EXISTS contact_wa_id;

COMMIT;

-- --------------------------------------------------------
-- D.4: contact_tags — migrar PK
-- --------------------------------------------------------

BEGIN;

-- Dropar PK antiga
ALTER TABLE contact_tags DROP CONSTRAINT IF EXISTS contact_tags_pkey;

-- Dropar coluna antiga
ALTER TABLE contact_tags DROP COLUMN IF EXISTS contact_wa_id;

-- Criar PK nova
ALTER TABLE contact_tags ADD PRIMARY KEY (contact_id, tag_id);

COMMIT;

-- --------------------------------------------------------
-- D.5: Trocar UNIQUE de contacts
-- --------------------------------------------------------

BEGIN;

-- Dropar unique global
DROP INDEX IF EXISTS ix_contacts_wa_id;

-- Criar unique per-tenant
CREATE UNIQUE INDEX ix_contacts_tenant_wa_id ON contacts(tenant_id, wa_id);

COMMIT;
```

**Validação pós-D:**

```sql
-- Verificar schema
\d contacts
-- Deve mostrar UNIQUE em (tenant_id, wa_id) e NÃO em (wa_id) sozinho

\d messages
-- Deve mostrar contact_id NOT NULL e NÃO ter contact_wa_id

-- Testar: inserir mesmo wa_id em 2 tenants
INSERT INTO contacts (tenant_id, wa_id, name) VALUES (1, '5500000000001', 'Test T1');
INSERT INTO contacts (tenant_id, wa_id, name) VALUES (4, '5500000000001', 'Test T4');
-- Deve funcionar!

-- Cleanup
DELETE FROM contacts WHERE wa_id = '5500000000001' AND name LIKE 'Test%';
```

**Rollback Fase D:** Restaurar do backup. NÃO há rollback incremental viável.

```bash
# Restaurar backup
sudo -u postgres psql -c "DROP DATABASE eduflow_db;"
sudo -u postgres psql -c "CREATE DATABASE eduflow_db;"
sudo -u postgres psql eduflow_db < ~/eduflow_backup_YYYYMMDD_HHMM.sql
```

---

## 6. Checklist de Validação

### Pré-Migration (PASSO 0)
- [ ] Backup completo criado e verificado
- [ ] Backup testado com `pg_restore` ou `psql < dump`
- [ ] Horário de baixo tráfego (após 22h BRT ou domingo)
- [ ] Equipe avisada

### Pós-Fase A
- [ ] `\d messages` mostra ambas colunas (`contact_wa_id` e `contact_id`)
- [ ] `SELECT COUNT(*) FROM messages WHERE contact_id IS NULL AND contact_wa_id IS NOT NULL` = 0
- [ ] Idem para activities, schedules, contact_tags, ai_conversation_summaries, financial_entries
- [ ] `tasks WHERE contact_id IS NULL`: apenas as 6 que já tinham `contact_wa_id NULL`
- [ ] `ai_calls WHERE contact_id IS NULL`: apenas as 10 que já tinham `contact_wa_id NULL`
- [ ] Backend sobe sem erro (`uvicorn` inicia normalmente)
- [ ] Webhook recebe mensagem e processa normalmente
- [ ] Chat do tenant GV (t4) funciona: enviar e receber mensagem
- [ ] Kanban do GV renderiza

### Pós-Fase B
- [ ] Enviar mensagem pelo WhatsApp → row nova em `messages` tem `contact_id` preenchido
- [ ] Criar task manualmente → row nova em `tasks` tem `contact_id` preenchido
- [ ] Criar activity → row nova tem `contact_id` preenchido
- [ ] Criar schedule → row nova tem `contact_id` preenchido
- [ ] Enviar mensagem via chatbot → row nova tem `contact_id` preenchido
- [ ] Nenhum erro 500 nos logs por 1 hora
- [ ] `SELECT COUNT(*) FROM messages WHERE contact_id IS NULL AND created_at > NOW() - INTERVAL '1 hour'` = 0

### Pós-Fase C
- [ ] Conversas renderizam corretamente no frontend
- [ ] Kanban renderiza com cards corretos
- [ ] Tasks aparecem na lista de tasks
- [ ] Schedules aparecem no calendário
- [ ] Financial entries renderizam (se houver dados)
- [ ] Export de contatos/mensagens funciona
- [ ] Busca de contatos funciona
- [ ] Tags aparecem nos contatos
- [ ] AI engine responde a mensagens
- [ ] Chatbot engine processa mensagens
- [ ] Voice AI funciona (se ativo)
- [ ] Nenhum erro 500 nos logs por 24 horas
- [ ] Dashboard de métricas renderiza

### Pós-Fase D
- [ ] Webhook aceita MESMO número WhatsApp em 2 tenants sem erro
- [ ] `\d+ contacts` mostra UNIQUE em `(tenant_id, wa_id)`, SEM UNIQUE em `(wa_id)` sozinho
- [ ] `\d messages` NÃO tem coluna `contact_wa_id`
- [ ] Nenhuma query quebra (0 erros 500)
- [ ] Chat GV funciona
- [ ] Todos os endpoints da API respondem 200
- [ ] Frontend não mostra erros no console
- [ ] Backup pós-migration criado e verificado

---

## 7. Estimativa de Tempo

### Fase A — SQL Migration
- ALTER TABLE (13 tabelas): < 1 segundo cada = **~5 segundos**
- UPDATE (13 tabelas, ~19k rows total): **< 10 segundos**
- CREATE INDEX CONCURRENTLY (12 índices): **< 30 segundos** (sem lock)
- ADD CONSTRAINT FK (12 FKs): **< 10 segundos**
- **Total Fase A: ~1 minuto** (downtime efetivo: < 15 segundos para as FKs)

### Fase B — Código Dual-Write
- **42 pontos de escrita** a modificar
- ~150 linhas de código a alterar
- 20 arquivos Python
- **Estimativa: 2-4 horas de desenvolvimento**

### Fase C — Código Dual-Read
- **24+ queries de leitura** a modificar
- ~100 linhas de código a alterar
- ~15 arquivos Python + possíveis mudanças no frontend
- **Estimativa: 3-5 horas de desenvolvimento**

### Fase D — SQL Cutover
- DROP CONSTRAINT (8 FKs): < 1 segundo cada = **~5 segundos**
- DROP COLUMN (13 tabelas): < 1 segundo cada = **~5 segundos**
- ALTER contact_tags PK: **< 1 segundo**
- DROP/CREATE INDEX contacts: **< 1 segundo**
- **Total Fase D: < 30 segundos** de downtime

### Timeline Recomendada
- **Dia 1:** Fase A (SQL) + Fase B (dual-write) + deploy + validação
- **Dia 2:** Monitorar, corrigir bugs se houver
- **Dia 3:** Fase C (dual-read) + deploy + validação 24h
- **Dia 4-5:** Monitorar
- **Dia 6 (fim de semana):** Fase D (cutover) com backup

---

## 8. Pontos de Atenção Críticos

### 8.1 `contact_tags` sem tenant_id
A tabela `contact_tags` não tem `tenant_id`. Após migração para `contact_id`, a isolação por tenant será garantida indiretamente via FK para `contacts(id)`. Mas queries que fazem JOIN com `contact_tags` precisam garantir que o Contact sendo consultado é do tenant correto.

### 8.2 `automation_executions` sem tenant_id
Mesma situação. Sem `tenant_id`, o isolamento depende do `contact_id` FK.

### 8.3 `voice_ai/models.py` — modelo separado
O model `AICall` está definido em `voice_ai/models.py`, não no `models.py` principal. A migração precisa incluir esse arquivo.

### 8.4 Raw SQL em `landing_routes.py:400-406`
Há INSERT direto em `contact_tags` via `text()`. Precisa ser atualizado manualmente:
```python
text("INSERT INTO contact_tags (contact_wa_id, tag_id) VALUES (:wid, :tid)")
# → 
text("INSERT INTO contact_tags (contact_id, tag_id) VALUES (:cid, :tid)")
```

### 8.5 Raw SQL em `routes.py:710`
```python
await db.execute(text(f"DELETE FROM messages WHERE contact_wa_id = '{wa_id}'"))
```
SQL injection risk + precisa mudar para `contact_id`. **CORRIGIR URGENTEMENTE.**

### 8.6 `routes.py:163-168` — DELETE em cascata manual
```python
for tbl in ["messages", "activities", "contact_tags", "tasks", "schedules", ...]:
    await db.execute(text(f"DELETE FROM {tbl} WHERE contact_wa_id = ANY(:ids)"), ...)
```
Este código faz DELETE manual em todas as tabelas filhas. Com `ON DELETE CASCADE` na FK de `contact_id`, isso será desnecessário — pode simplesmente deletar o Contact.

### 8.7 Frontend `conversations-provider.tsx`
Já tem mudanças no working tree. Verificar se as mudanças são compatíveis com a API nova.

### 8.8 `voice_ai_elevenlabs/routes.py:138` — Query MUITO perigosa
```python
Contact.wa_id.contains(phone_clean[-8:])
```
Busca por substring dos últimos 8 dígitos SEM filtro de tenant. Pode retornar contato de OUTRO tenant. **Alto risco de data leak.**

---

## 9. Diagrama de Dependências

```
contacts (wa_id UNIQUE GLOBAL → tenant_id+wa_id UNIQUE)
  │
  ├── messages.contact_wa_id → messages.contact_id
  ├── activities.contact_wa_id → activities.contact_id
  ├── tasks.contact_wa_id → tasks.contact_id
  ├── schedules.contact_wa_id → schedules.contact_id
  ├── contact_tags.contact_wa_id → contact_tags.contact_id (PK!)
  ├── ai_conversation_summaries.contact_wa_id → .contact_id
  ├── ai_calls.contact_wa_id → ai_calls.contact_id
  ├── financial_entries.contact_wa_id → .contact_id
  │
  ├── call_logs.contact_wa_id → .contact_id (sem FK)
  ├── notifications.contact_wa_id → .contact_id (sem FK)
  ├── ai_feedback.contact_wa_id → .contact_id (sem FK)
  ├── automation_executions.contact_wa_id → .contact_id (sem FK)
  └── chatbot_sessions.contact_wa_id → .contact_id (sem FK)
  
  Já usando contact_id (referência):
  ├── call_campaign_items.contact_id → contacts(id) ✅
  └── lead_agent_context.lead_id → contacts(id) ✅
```
