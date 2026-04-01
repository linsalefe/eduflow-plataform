# 📞 Call Campaigns — Disparo de Ligações em Lista

## Visão Geral

O módulo **Call Campaigns** permite disparar ligações automáticas via IA (ElevenLabs) para uma lista de contatos selecionados do CRM. As ligações são processadas **uma por vez** em fila, com acompanhamento em tempo real do progresso, resumo automático de cada chamada e controle total (iniciar, pausar, cancelar).

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND                            │
│  /voice-ai → Aba "Campanhas"                           │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Lista de    │  │ Criar Nova   │  │ Detalhe da    │  │
│  │ Campanhas   │  │ Campanha     │  │ Campanha      │  │
│  │ (cards)     │  │ (dialog)     │  │ (sheet)       │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ API REST
┌────────────────────────▼────────────────────────────────┐
│                     BACKEND                             │
│                                                         │
│  campaign_routes.py    → CRUD + ações (start/pause)     │
│  campaign_worker.py    → Fila assíncrona (1 por vez)    │
│  voice_pipeline.py     → Disparo via ElevenLabs API     │
│  routes.py (webhook)   → Recebe resultado pós-ligação   │
│                                                         │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│              ELEVENLABS + TWILIO                        │
│  ElevenLabs Conversational AI → gerencia a conversa     │
│  Twilio → telefonia (discagem e áudio)                  │
└─────────────────────────────────────────────────────────┘
```

---

## Banco de Dados

### Tabelas Criadas

**`call_campaigns`** — Campanha principal

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | SERIAL PK | ID da campanha |
| tenant_id | INTEGER FK | Tenant proprietário |
| created_by | INTEGER FK | Usuário que criou |
| name | VARCHAR(255) | Nome da campanha |
| dynamic_variables | JSONB | Mapeamento de variáveis do agente |
| status | VARCHAR(30) | pending, running, paused, completed, cancelled |
| total_items | INTEGER | Total de contatos na fila |
| completed_items | INTEGER | Ligações concluídas |
| failed_items | INTEGER | Ligações que falharam |
| started_at | TIMESTAMP | Início da execução |
| completed_at | TIMESTAMP | Fim da execução |

**`call_campaign_items`** — Cada contato na fila

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | SERIAL PK | ID do item |
| campaign_id | INTEGER FK | Campanha pai |
| contact_id | BIGINT FK | Contato do CRM |
| phone_number | VARCHAR(30) | Número formatado (E.164) |
| resolved_variables | JSONB | Variáveis resolvidas para este contato |
| status | VARCHAR(30) | pending, calling, completed, failed, skipped |
| call_id | INTEGER FK | Vínculo com ai_calls (após ligação) |
| outcome | VARCHAR(30) | Resultado (qualified, not_qualified, etc) |
| duration_seconds | INTEGER | Duração da ligação |
| summary | TEXT | Resumo automático da conversa |

### Migração SQL

```sql
-- Executar no servidor via SSH:
sudo -u postgres psql eduflow_db << 'EOF'

CREATE TABLE IF NOT EXISTS call_campaigns (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    created_by INTEGER REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    dynamic_variables JSONB DEFAULT '{}',
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    total_items INTEGER DEFAULT 0,
    completed_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_campaign_items (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES call_campaigns(id) ON DELETE CASCADE,
    contact_id BIGINT NOT NULL REFERENCES contacts(id),
    phone_number VARCHAR(30) NOT NULL,
    resolved_variables JSONB DEFAULT '{}',
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    attempt_count INTEGER DEFAULT 0,
    call_id INTEGER REFERENCES ai_calls(id),
    outcome VARCHAR(30),
    duration_seconds INTEGER DEFAULT 0,
    summary TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_tenant ON call_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaign_status ON call_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaign_items_campaign ON call_campaign_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_items_status ON call_campaign_items(status);

GRANT ALL PRIVILEGES ON TABLE call_campaigns TO eduflow;
GRANT ALL PRIVILEGES ON TABLE call_campaign_items TO eduflow;
GRANT USAGE, SELECT ON SEQUENCE call_campaigns_id_seq TO eduflow;
GRANT USAGE, SELECT ON SEQUENCE call_campaign_items_id_seq TO eduflow;

EOF
```

---

## Arquivos do Backend

### 1. `backend/app/voice_ai_elevenlabs/models.py`
Models SQLAlchemy para `CallCampaign` e `CallCampaignItem`.

### 2. `backend/app/voice_ai_elevenlabs/campaign_routes.py`
Rotas da API:

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/voice-ai-el/campaigns` | Criar campanha |
| GET | `/api/voice-ai-el/campaigns` | Listar campanhas |
| GET | `/api/voice-ai-el/campaigns/{id}` | Detalhes da campanha |
| POST | `/api/voice-ai-el/campaigns/{id}/action` | Iniciar, pausar ou cancelar |

**Body para criar campanha:**
```json
{
  "name": "Reengajamento Março",
  "contact_ids": [1, 2, 3],
  "dynamic_variables": {
    "nome": { "source": "contact_name" },
    "servico": { "source": "fixed", "value": "Intercâmbio Esportivo" }
  }
}
```

**Fontes de variáveis disponíveis:**
- `contact_name` — Nome do contato no CRM
- `contact_wa_id` — Número WhatsApp do contato
- `tag` — Primeira tag do contato
- `fixed` — Valor fixo digitado pelo usuário

**Body para ação:**
```json
{ "action": "start" }   // ou "pause" ou "cancel"
```

### 3. `backend/app/voice_ai_elevenlabs/campaign_worker.py`
Worker assíncrono que roda em background:
- Verifica a cada 10 segundos se há campanhas com status `running`
- Pega o próximo item `pending` da fila
- Dispara a ligação via `make_outbound_call()`
- Aguarda 30 segundos entre ligações
- Finaliza a campanha quando não há mais itens pendentes

### 4. `backend/app/voice_ai_elevenlabs/voice_pipeline.py`
Função `make_outbound_call()` refatorada para aceitar `dynamic_variables` genérico (dicionário livre) mantendo retrocompatibilidade com `lead_name` e `course`.

### 5. `backend/app/voice_ai_elevenlabs/routes.py` (webhook)
O webhook `post-call-webhook` foi atualizado para:
- Após salvar a ligação em `ai_calls`, buscar se há um `call_campaign_item` com status `calling` para o mesmo número
- Se encontrar, atualizar o item com `outcome`, `duration_seconds`, `summary` e `call_id`
- Incrementar `completed_items` na campanha

---

## Arquivos do Frontend

### `frontend/src/components/voice-ai/campaign-tab.tsx`
Componente completo com:

- **Lista de campanhas** — Cards com nome, status, barra de progresso e botões de ação
- **Dialog de criação** — 2 etapas:
  1. Seleção de contatos (com busca e seleção múltipla)
  2. Configuração (nome da campanha + variáveis dinâmicas)
- **Sheet de detalhes** — Progresso, estatísticas e lista de contatos com status individual
- **Auto-refresh** — A cada 15s quando há campanha em execução

### `frontend/src/app/voice-ai/page.tsx`
Adicionada terceira aba "Campanhas" com import do `CampaignTab`.

---

## Registro no `main.py`

```python
# Imports
from app.voice_ai_elevenlabs.campaign_routes import router as campaign_router
from app.voice_ai_elevenlabs.campaign_worker import campaign_worker

# Startup (dentro do lifespan)
campaign_task = asyncio.create_task(campaign_worker())

# Router
app.include_router(campaign_router)

# Shutdown (no yield)
campaign_task.cancel()
```

---

## Fluxo de Uso

### 1. Criar Campanha
1. Acessar **Voice AI → Campanhas → + Nova Campanha**
2. Selecionar os contatos desejados (busca por nome ou número)
3. Clicar **Próximo**
4. Dar um nome à campanha
5. Configurar as variáveis dinâmicas:
   - O nome da variável deve corresponder ao que o agente ElevenLabs espera no prompt (ex: `{{nome}}`, `{{servico}}`)
   - Escolher a fonte: nome do contato, número, tag ou valor fixo
6. Clicar **Criar Campanha**

### 2. Iniciar Campanha
1. Na lista de campanhas, clicar **Iniciar**
2. O worker começa a processar a fila automaticamente
3. Cada contato recebe uma ligação por vez
4. Entre cada ligação há um intervalo de 30 segundos

### 3. Acompanhar Progresso
- Clicar na campanha para abrir o painel de detalhes
- Ver status individual de cada contato (Pendente, Ligando, Concluída, Falhou)
- Ver outcome e resumo de cada ligação concluída
- Progresso atualiza automaticamente a cada 15 segundos

### 4. Pausar / Cancelar
- **Pausar** — Para temporariamente a fila (retomável)
- **Cancelar** — Para definitivamente e marca itens pendentes como "pulado"

---

## Detalhes Técnicos Importantes

### Formato de Telefone (Brasil)
O `wa_id` do WhatsApp pode estar sem o 9° dígito (ex: `558388046720` em vez de `5583988046720`). A função `format_phone()` corrige automaticamente:
```python
# wa_id: 558388046720 (12 dígitos, sem o 9)
# Corrigido para: +5583988046720 (13 dígitos, com o 9)
if clean.startswith("55") and len(clean) == 12:
    clean = clean[:4] + "9" + clean[4:]
```

### Variáveis Dinâmicas
As variáveis são resolvidas no momento da criação da campanha (não no momento da ligação). Isso significa que se o nome do contato mudar entre a criação e a execução, o valor antigo será usado.

### Concorrência
O worker processa **1 ligação por vez** com intervalo de 30 segundos. Apenas 1 campanha `running` é processada por vez (a mais antiga).

### Webhook
O webhook do ElevenLabs (`/api/voice-ai-el/post-call-webhook`) é chamado automaticamente após cada ligação. Ele atualiza tanto o registro em `ai_calls` quanto o item correspondente na `call_campaign_items`.

---

## Deploy

### Primeira vez (após criar os arquivos)
```bash
# 1. Migração SQL (no servidor)
sudo -u postgres psql eduflow_db < migration_campaigns.sql

# 2. Deploy do código
git add .
git commit -m "feat: call campaigns"
git push

# 3. No servidor
cd ~/eduflow
git pull
sudo systemctl restart eduflow-backend
cd frontend && npm run build && sudo systemctl restart eduflow-frontend
```

### Verificação
```bash
# Backend iniciou com worker
sudo journalctl -u eduflow-backend --no-pager -n 20 | grep "Campaign Worker"
# Deve mostrar: 📞 Campaign Worker iniciado

# Rotas respondendo
curl -s http://localhost:8001/api/voice-ai-el/campaigns
# Deve retornar: {"detail":"Not authenticated"}

# Tabelas criadas
sudo -u postgres psql eduflow_db -c "\dt call_*"
# Deve listar call_campaigns e call_campaign_items
```

---

## Troubleshooting

| Problema | Causa | Solução |
|----------|-------|---------|
| Worker não inicia | Import falha ou não registrado no main.py | Verificar logs: `sudo journalctl -u eduflow-backend` |
| Ligação não toca | Número sem 9° dígito | Verificar `format_phone()` em `campaign_routes.py` |
| 422 ao criar campanha | `contact_ids` com null | Verificar se `/api/contacts` retorna campo `id` |
| Campanha fica "Em execução" sem avançar | Worker não processando | Reiniciar backend: `sudo systemctl restart eduflow-backend` |
| Webhook não atualiza campanha | Múltiplos contatos com mesmo telefone | Usar `.limit(1)` na busca do webhook |
| Item fica "Ligando" indefinidamente | Webhook do ElevenLabs não configurado | Configurar webhook URL no painel ElevenLabs |
