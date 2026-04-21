# 🟣 EduFlow Hub — Plataforma SaaS de CRM Multicanal com IA

**Plataforma multi-tenant de CRM e atendimento inteligente** com WhatsApp, Voice AI, pipeline Kanban, landing pages, chatbot visual e automações — tudo em um único painel.

**URL de Produção:** `https://portal.eduflowia.com`

---

## 📋 Índice

1. [Visão Geral](#-visão-geral)
2. [Arquitetura](#-arquitetura)
3. [Tech Stack](#-tech-stack)
4. [Funcionalidades](#-funcionalidades)
5. [Multi-Tenant (SaaS)](#-multi-tenant-saas)
6. [Estrutura de Pastas](#-estrutura-de-pastas)
7. [Banco de Dados](#-banco-de-dados)
8. [API — Endpoints](#-api--endpoints)
9. [Variáveis de Ambiente](#-variáveis-de-ambiente)
10. [Setup Local (Desenvolvimento)](#-setup-local-desenvolvimento)
11. [Deploy (Produção)](#-deploy-produção)
12. [Comandos Úteis](#-comandos-úteis)
13. [Integrações Externas](#-integrações-externas)
14. [Solução de Problemas](#-solução-de-problemas)
15. [Changelog](#-changelog)
16. [Licença](#-licença)

---

## 🔍 Visão Geral

O **EduFlow Hub** é uma plataforma SaaS multi-tenant de CRM e atendimento multicanal com IA. Cada cliente (tenant) opera em um ambiente isolado com seus próprios dados, usuários, canais e configurações.

**Principais capacidades:**

- Atendimento multicanal (WhatsApp via Evolution API, Instagram, Messenger)
- Agente de IA no WhatsApp (GPT-4o + RAG com base de conhecimento)
- **Chatbot Visual** estilo ManyChat/n8n — editor drag-and-drop com simulador integrado, conectores HTTP Request e Webhook Out
- Voice AI — ligações automáticas com IA conversacional (OpenAI Realtime API + Twilio)
- Pipeline Kanban com drag-and-drop (múltiplos pipelines por tenant)
- Landing pages white-label com rastreamento UTM
- Automações e envio em massa de templates
- Agendamento integrado ao Google Calendar
- Dashboard com métricas, ROI de campanhas e relatórios Excel
- Painel superadmin para gestão de tenants, features e consumo de tokens
- Sistema de features por tenant (módulos ligam/desligam por plano), com suporte a features opt-in estritas

---

## 🏗 Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│                    NAVEGADOR / APP                        │
│               portal.eduflowia.com                       │
│                  Next.js (React)                         │
└─────────────────────┬────────────────────────────────────┘
                      │ HTTPS
                      ▼
┌──────────────────────────────────────────────────────────┐
│                NGINX (Reverse Proxy + SSL)                │
│                                                          │
│   /         → Frontend (porta 3000)                      │
│   /api/     → Backend  (porta 8001)                      │
│   /webhook  → Backend  (porta 8001)                      │
└──────────┬──────────────────────┬────────────────────────┘
           │                      │
           ▼                      ▼
┌──────────────────┐   ┌─────────────────────────────────┐
│  Next.js App     │   │       FastAPI Backend            │
│  Porta 3000      │   │       Porta 8001                 │
│                  │   │                                   │
│  - Login         │   │  - REST API (/api/*)              │
│  - Dashboard     │   │  - Webhooks (Evolution/Meta)      │
│  - Conversas     │   │  - JWT Auth + Multi-Tenant        │
│  - Pipeline      │   │  - AI Engine (GPT-4o + RAG)       │
│  - Automações    │   │  - Chatbot Engine (determinístico)│
│  - Landing Pages │   │  - Chatbot Delay Scheduler (30s)  │
│  - Agenda        │   │  - Voice AI (Realtime API)        │
│  - Relatórios    │   │  - Google Calendar / Drive         │
│  - Config IA     │   │  - Twilio Voice                   │
│  - Chatbot Visual│   │  - Token Usage Tracking           │
│  - Voice AI      │   │  - Superadmin Routes              │
│  - Superadmin    │   │                                   │
└──────────────────┘   └──────────┬────────────────────────┘
                                  │
                                  ▼
                       ┌──────────────────┐
                       │   PostgreSQL     │
                       │   (eduflow_db)   │
                       │                  │
                       │  Todas as tabelas│
                       │  com tenant_id   │
                       └──────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐
│  Evolution API  │  │   OpenAI API    │  │  Twilio Voice    │
│  (WhatsApp)     │  │                 │  │                  │
│  - QR Code      │  │  - GPT-4o       │  │  - WebRTC        │
│  - Webhook      │  │  - Embeddings   │  │  - PSTN          │
│  - Grupos       │  │  - Realtime API │  │  - Gravações     │
└─────────────────┘  └─────────────────┘  └──────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐
│  Meta Graph API │  │  ElevenLabs     │  │  Google APIs     │
│                 │  │                 │  │                  │
│  - Instagram    │  │  - TTS Agents   │  │  - Calendar      │
│  - Messenger    │  │  - Conv. AI     │  │  - Drive         │
│  - Lead Forms   │  │                 │  │                  │
└─────────────────┘  └─────────────────┘  └──────────────────┘
```

---

## 🛠 Tech Stack

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript |
| **Estilização** | Tailwind CSS 4, shadcn/ui, Framer Motion |
| **Componentes** | TanStack Table, Recharts, @hello-pangea/dnd, Lucide React |
| **Canvas/Editor** | `@xyflow/react` v12 (editor visual do Chatbot) |
| **Backend** | FastAPI (Python), SQLAlchemy 2.x (async), asyncpg |
| **HTTP Client** | httpx 0.28 (assíncrono, usado por conectores do Chatbot) |
| **Banco de Dados** | PostgreSQL 14+ |
| **Autenticação** | JWT (PyJWT) + bcrypt |
| **WhatsApp** | Evolution API v2 |
| **IA / LLM** | OpenAI GPT-4o + text-embedding-3-small |
| **Voice AI** | OpenAI Realtime API + Twilio Voice |
| **TTS / Agents** | ElevenLabs Conversational AI |
| **Calendário** | Google Calendar API v3 |
| **Armazenamento** | Google Drive API |
| **Telefonia** | Twilio (WebRTC + PSTN) |
| **Social** | Meta Graph API (Instagram, Messenger, Lead Forms) |
| **Landing Pages** | Netlify (hospedagem estática) |
| **Relatórios** | openpyxl (.xlsx) |
| **Servidor** | AWS Lightsail (Ubuntu 22.04), Nginx, Let's Encrypt |
| **DNS/Hosting** | Hostinger (eduflowia.com) |
| **Controle de Versão** | Git + GitHub (`linsalefe/eduflow-plataform`) |

---

## 🎯 Funcionalidades

### Conversas (Inbox Multicanal)
- Interface inspirada no WhatsApp Web (tema escuro)
- Suporte a WhatsApp (Evolution API), Instagram e Messenger
- Suporte a grupos de WhatsApp
- Envio e recebimento de texto, imagens, áudios, vídeos e documentos
- Busca global ⌘K (contatos + páginas)
- Filtros avançados: tags, não lidos, IA ativa, atendente
- Ações em lote: mover status e adicionar tags para múltiplos contatos

### CRM (Painel lateral)
- Perfil do contato, toggle IA, atribuição de responsável
- Status do lead (Novo → Contato → Qualificado → Negociando → Convertido → Perdido)
- Tags coloridas, notas internas, timeline de atividades automática

### Pipeline Kanban
- Drag-and-drop nativo entre colunas do funil
- Múltiplos pipelines por tenant (Vendas, Suporte, Pós-venda)
- Update otimista, busca, auto-refresh, modal de detalhes

### Agente de IA (WhatsApp)
- GPT-4o com RAG (base de conhecimento por canal)
- Fluxo de qualificação configurável
- Integração com Google Calendar para agendamento automático
- Resumo gerado ao desligar IA

### Chatbot Visual *(novo módulo)*
- Editor visual arrastar-e-soltar estilo **ManyChat / n8n / Make**
- Canvas com React Flow, handles laterais, edges com labels contextuais
- **11 tipos de nós**: Gatilho, Mensagem, Botões, Captura, Condição, Tag, Mover Kanban, Passar para humano, Espera, HTTP Request, Webhook Out, Fim
- **Conectores externos**:
  - **HTTP Request** — chamadas REST (GET/POST/PUT/PATCH/DELETE) com 2 saídas (sucesso/erro), parsing automático de JSON, dot-notation em variáveis
  - **Webhook Out** — POST fire-and-forget pra notificar Slack/Zapier/n8n/sistemas próprios
- **Scheduler assíncrono** de delay (loop 30s via lifespan do FastAPI)
- **Simulador integrado** — testa o fluxo no browser sem tocar WhatsApp nem banco
- **Publish-to-channel** com aviso de conflito (IA ativa, outro chatbot ativo)
- **Exclusividade por canal**: cada canal roda em apenas um modo (`ai`/`chatbot`/`none`)
- Drawer de monitoramento de sessões (4 abas: Ativas, Aguardando, Concluídas, Canceladas)
- Feature **opt-in estrita** (default desligado)

### Voice AI (Ligações com IA)
- Disparo automático de chamadas para leads
- OpenAI Realtime API (STT + LLM + TTS em tempo real)
- Máquina de estados (FSM) para qualificação
- Registro automático no CRM

### ElevenLabs Agents
- Aba "Agente" com sub-tabs: Ferramentas, Personalidade, Variáveis
- Conexão direta com ElevenLabs API
- Campanhas de chamadas outbound com mapeamento de variáveis

### Landing Pages
- Criação de LPs white-label com formulário integrado ao CRM
- Rastreamento UTM (source, medium, campaign)
- Hospedagem em Netlify
- Configuração de tag, etapa do pipeline e mensagem WhatsApp automática

### Dashboard & Relatórios
- Métricas gerais: conversas, leads, mensagens
- Dashboard avançado: taxa de conversão, tempo de resposta, performance por atendente
- Dashboard de ROI de campanhas
- 3 relatórios exportáveis em Excel (.xlsx)

### Automações
- Envio em massa de templates WhatsApp com filtros
- Campanhas de chamadas com Voice AI

### Agenda
- Calendário Google embutido
- Painel de disponibilidade por consultora
- Agendamento automático via IA

---

## 🏢 Multi-Tenant (SaaS)

O EduFlow opera como SaaS multi-tenant com isolamento por `tenant_id` em todas as tabelas.

```
┌──────────────────────────────────────────────┐
│            SUPERADMIN (Álefe)                 │
│                                              │
│  ┌───────────┐  ┌───────────┐  ┌─────────┐  │
│  │ Tenant 1  │  │ Tenant 2  │  │ Tenant N│  │
│  │ GV Sports │  │ Cliente X │  │   ...   │  │
│  │ Plan: Pro │  │ Plan: Pro │  │         │  │
│  └───────────┘  └───────────┘  └─────────┘  │
└──────────────────────────────────────────────┘
```

### Sistema de Features
Cada tenant possui um JSON que controla os módulos visíveis no sidebar:

```json
{
  "dashboard": true,
  "conversas": true,
  "pipeline": true,
  "ai_whatsapp": true,
  "chatbot": false,
  "voice_ai": false,
  "landing_pages": true,
  "automacoes": true,
  "agenda": true,
  "relatorios": true,
  "usuarios": true
}
```

### Features Legadas vs Opt-in Estritas

Existem dois tipos de features no sistema:

- **Legadas** (default-on): se a chave não existir no JSON, considera-se **ligada**. Inclui `dashboard`, `conversas`, `pipeline`, etc. Lógica: `features[key] !== false`.
- **Opt-in estritas** (default-off): só é considerada ligada se for **explicitamente `true`** no JSON. Inclui `chatbot`. Lógica: `features[key] === true`.

A lista é declarada em `frontend/src/app/admin/page.tsx` via `OPT_IN_FEATURES`. Esse padrão protege features premium/sensíveis de "vazarem" ligadas por padrão.

### Painel Superadmin (`/admin`)
- Dashboard com totais de clientes, usuários e contatos
- CRUD de tenants com criação automática de usuário admin
- Toggle ativar/desativar tenant (inadimplência)
- Controle granular de features por tenant
- Consumo de tokens (OpenAI) por tenant com estimativa de custos

### Proteção de Rotas
Todas as rotas protegidas injetam `tenant_id` automaticamente via dependency:

```python
@router.get("/endpoint")
async def my_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    query = select(Model).where(Model.tenant_id == tenant_id)
```

---

## 🗂 Estrutura de Pastas

```
eduflow-plataform/
├── backend/
│   ├── app/
│   │   ├── main.py                 # App FastAPI + webhooks + lifespan (schedulers)
│   │   ├── models.py               # Modelos SQLAlchemy
│   │   ├── database.py             # Conexão PostgreSQL
│   │   ├── routes.py               # Contatos, mensagens, tags, dashboard
│   │   ├── auth.py                 # JWT + get_tenant_id + get_current_superadmin
│   │   ├── auth_routes.py          # Login, registro, listagem de usuários
│   │   ├── ai_routes.py            # Config IA, RAG, toggle, test-chat
│   │   ├── ai_engine.py            # Motor IA: RAG + GPT-4o + qualificação
│   │   ├── kanban_routes.py        # Pipeline Kanban
│   │   ├── pipeline_routes.py      # Múltiplos pipelines por tenant
│   │   ├── landing_routes.py       # Landing Pages + Dashboard ROI
│   │   ├── schedule_routes.py      # Agendamentos
│   │   ├── calendar_routes.py      # Google Calendar
│   │   ├── twilio_routes.py        # VoIP: token, TwiML, webhooks
│   │   ├── export_routes.py        # Relatórios Excel
│   │   ├── tenant_routes.py        # CRUD tenants (Superadmin)
│   │   ├── notification_routes.py  # Notificações
│   │   ├── financial_routes.py     # Financeiro
│   │   ├── task_routes.py          # Tarefas
│   │   ├── oauth_routes.py         # OAuth Meta (Instagram/Messenger)
│   │   ├── automation_scheduler.py # Scheduler de automações (15 min)
│   │   ├── chatbot/                # 🤖 Módulo Chatbot Visual
│   │   │   ├── engine.py           # Motor determinístico + executor de nós
│   │   │   ├── routes.py           # CRUD fluxos, sessions, publish-to-channel
│   │   │   └── scheduler.py        # Loop 30s — retoma nós de espera
│   │   ├── evolution/
│   │   │   ├── routes.py           # Webhook Evolution API (+ routing AI/Chatbot)
│   │   │   ├── ai_agent.py         # Agente IA para WhatsApp
│   │   │   └── config.py           # Config Evolution API
│   │   ├── voice_ai/
│   │   │   ├── routes.py           # Endpoints Voice AI + WebSocket
│   │   │   ├── voice_pipeline.py   # OpenAI Realtime API relay
│   │   │   ├── fsm.py              # Máquina de estados
│   │   │   ├── llm_contract.py     # Contrato LLM + resumo
│   │   │   ├── crm_adapter.py      # Integração CRM
│   │   │   ├── config.py           # Variáveis Voice AI
│   │   │   └── models.py           # Tabelas Voice AI
│   │   ├── google_calendar.py
│   │   ├── google_drive.py
│   │   └── whatsapp.py
│   ├── migration_chatbot.sql          # Schema inicial do Chatbot
│   ├── migration_chatbot_delay.sql    # Tabela de delays
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── login/page.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── conversations/page.tsx
│   │   │   ├── pipeline/page.tsx
│   │   │   ├── automacoes/page.tsx
│   │   │   ├── ai-config/page.tsx
│   │   │   ├── landing-pages/page.tsx
│   │   │   ├── agenda/page.tsx
│   │   │   ├── calls/page.tsx
│   │   │   ├── relatorios/page.tsx
│   │   │   ├── canais/page.tsx         # Canais + seletor de modo (IA/Chatbot/Nenhum)
│   │   │   ├── chatbot/                # 🤖 Módulo Chatbot
│   │   │   │   ├── page.tsx            # Listagem + CRUD de fluxos
│   │   │   │   └── [id]/page.tsx       # Editor visual (React Flow)
│   │   │   ├── admin/page.tsx
│   │   │   └── ...
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── AppLayout.tsx
│   │   │   ├── CommandPalette.tsx
│   │   │   ├── ConfirmModal.tsx
│   │   │   ├── ActivityTimeline.tsx
│   │   │   ├── Webphone.tsx
│   │   │   └── chatbot/                # 🤖 Componentes do Chatbot
│   │   │       ├── node-catalog.tsx    # Tipos, metadata, paleta, 11 nós visuais
│   │   │       ├── node-inspector.tsx  # Forms de edição por tipo
│   │   │       ├── edge-components.tsx # CustomEdge com labels + botão "+"
│   │   │       ├── sessions-drawer.tsx # Monitoramento de sessões
│   │   │       ├── simulator-engine.ts # Replica do motor em TS (dry-run)
│   │   │       ├── simulator-drawer.tsx# Chat UI do simulador
│   │   │       └── channel-mode-selector.tsx
│   │   ├── contexts/
│   │   │   └── auth-context.tsx
│   │   └── lib/
│   │       └── api.ts
│   ├── package.json
│   └── .env.production
└── README.md
```

---

## 🗄 Banco de Dados

Banco: `eduflow_db` | Usuário: `eduflow` | Driver: `asyncpg`

Todas as tabelas possuem coluna `tenant_id` (exceto `tenants` e tabelas de sistema).

### Tabelas principais

| Tabela | Descrição |
|--------|-----------|
| `tenants` | Clientes SaaS (nome, slug, plano, features, status) |
| `users` | Usuários (superadmin, admin, atendente) com tenant_id |
| `contacts` | Contatos/leads com status, notas, atribuição, IA, pipeline_id |
| `messages` | Mensagens (inbound/outbound) com tipo e status |
| `channels` | Canais (WhatsApp, Instagram, Messenger) com credenciais + `operation_mode` + `active_chatbot_flow_id` |
| `tags` / `contact_tags` | Sistema de tags coloridas por contato |
| `activities` | Timeline de atividades automática |
| `ai_configs` | Configuração da IA por canal |
| `knowledge_documents` | Base de conhecimento RAG com embeddings |
| `ai_conversation_summaries` | Resumos de conversa IA |
| `ai_messages` | Histórico de mensagens IA |
| `schedules` | Agendamentos (voice_ai, consultant) |
| `call_logs` | Logs de chamadas Twilio |
| `landing_pages` | Landing pages com tag, pipeline_stage, whatsapp_message |
| `form_submissions` | Submissões de formulários com UTM |
| `token_usage` | Tracking de consumo de tokens OpenAI por tenant |
| `ai_calls` / `ai_call_turns` | Chamadas e turnos do Voice AI |
| `pipelines` | Múltiplos pipelines por tenant |
| `meta_lead_configs` | Configuração de Meta Lead Forms |
| `chatbot_flows` | 🤖 Fluxos do Chatbot (`graph` rascunho + `published_graph` snapshot) |
| `chatbot_sessions` | 🤖 Sessões do Chatbot (`active`/`waiting`/`completed`/`cancelled`/`timeout`) |
| `chatbot_scheduled_resumes` | 🤖 Fila de retomadas do scheduler (nó delay) |

### Tabelas do Chatbot — detalhes

- **`chatbot_flows`** — `graph` (JSONB) é o rascunho em edição (autosave 1.5s); `published_graph` é o snapshot que o runtime lê. Publicar = copiar um no outro e incrementar `version`.
- **`chatbot_sessions`** — índice parcial único `idx_chatbot_sessions_unique_open` em `(contact_wa_id, channel_id)` WHERE status IN ('active','waiting') garante 1 sessão aberta por contato × canal.
- **`chatbot_scheduled_resumes`** — scheduler roda a cada 30s buscando `status='pending' AND resume_at <= now` (índice parcial `idx_chatbot_resumes_due`).

---

## 🔌 API — Endpoints

### Autenticação
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/login` | Login (retorna JWT com tenant_id) |
| GET | `/api/auth/me` | Dados do usuário logado |
| POST | `/api/auth/register` | Criar usuário (admin do tenant) |
| GET | `/api/auth/users` | Listar usuários do tenant |

### Contatos + CRM
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/contacts?channel_id=X` | Listar contatos |
| PATCH | `/api/contacts/{wa_id}` | Atualizar status/notas |
| PATCH | `/api/contacts/{wa_id}/assign` | Atribuir responsável |
| POST/DELETE | `/api/contacts/{wa_id}/tags/{id}` | Gerenciar tags |
| GET | `/api/contacts/{wa_id}/activities` | Timeline |
| POST | `/api/contacts/bulk-update` | Ações em lote |

### Mensagens
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/messages/{wa_id}` | Histórico |
| POST | `/api/send/text` | Enviar texto |
| POST | `/api/send/template` | Enviar template |

### IA
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/PUT | `/api/ai/config/{channel_id}` | Config IA |
| GET/POST/DELETE | `/api/ai/knowledge/{channel_id}` | RAG docs |
| PATCH | `/api/ai/contacts/{wa_id}/toggle` | Toggle IA |

### Chatbot Visual 🤖
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/api/chatbot/flows` | Listar / criar fluxos |
| GET/PUT/DELETE | `/api/chatbot/flows/{id}` | CRUD de fluxo (PUT salva rascunho) |
| POST | `/api/chatbot/flows/{id}/publish` | Publicar (copia graph → published_graph) |
| POST | `/api/chatbot/flows/{id}/unpublish` | Despublicar |
| POST | `/api/chatbot/flows/{id}/duplicate` | Duplicar fluxo como rascunho |
| GET | `/api/chatbot/flows/{id}/channels-status` | Canais com status em relação ao fluxo |
| GET | `/api/chatbot/channels` | Canais do tenant com `operation_mode` |
| PUT | `/api/chatbot/channels/{id}/mode` | Trocar modo (IA/Chatbot/Nenhum) com `force` |
| GET | `/api/chatbot/flows/{id}/sessions?status=...` | Listar sessões (active/waiting/completed/cancelled/timeout/all) |
| DELETE | `/api/chatbot/flows/{fid}/sessions/{sid}` | Cancelar sessão (cascateia pra resumes) |
| POST | `/api/chatbot/flows/{fid}/sessions/{sid}/resume-now` | Antecipar retomada de sessão em espera |

### Voice AI
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/voice-ai/leads/new` | Disparar chamada |
| GET | `/api/voice-ai/dashboard` | Métricas Voice AI |
| POST | `/api/voice-ai/twilio/answer` | Webhook Twilio (TwiML) |

### Landing Pages
| Método | Rota | Descrição |
|--------|------|-----------|
| CRUD | `/api/landing-pages` | Gerenciar LPs |
| POST | `/api/lp/{slug}/submit` | Formulário público |
| GET | `/api/landing-pages/dashboard/roi` | Dashboard ROI |

### Superadmin
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/api/admin/tenants` | Listar/criar tenants |
| PATCH | `/api/admin/tenants/{id}` | Atualizar tenant |
| PATCH | `/api/admin/tenants/{id}/features` | Gerenciar features |
| PATCH | `/api/admin/tenants/{id}/toggle` | Ativar/desativar |

### Outros
| Grupo | Rotas |
|-------|-------|
| Canais | `/api/channels` (CRUD) |
| Tags | `/api/tags` (CRUD) |
| Pipelines | `/api/pipelines` (CRUD), `/api/tenant/kanban-columns` |
| Dashboard | `/api/dashboard/stats`, `/api/dashboard/advanced` |
| Agenda | `/api/schedules` (CRUD), `/api/calendar/*` |
| Relatórios | `/api/export/contacts`, `/api/export/pipeline`, `/api/export/messages` |
| Busca | `/api/search?q=termo` |
| Webhook | `GET/POST /webhook/{instance}` (Evolution API) |

---

## 🔐 Variáveis de Ambiente

### Backend (`backend/.env`)

```env
# Banco de Dados
DATABASE_URL=postgresql+asyncpg://eduflow:SENHA@localhost:5432/eduflow_db

# Autenticação
JWT_SECRET=chave-secreta-jwt

# OpenAI
OPENAI_API_KEY=sk-...

# Evolution API
# (chave armazenada em backend/app/evolution/config.py)

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_API_KEY_SID=SK...
TWILIO_API_KEY_SECRET=...
TWILIO_TWIML_APP_SID=AP...
TWILIO_PHONE_NUMBER=+553122980172

# Voice AI
BASE_URL=https://portal.eduflowia.com
VOICE_AI_ENABLED=true
VOICE_AI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17
VOICE_AI_REALTIME_VOICE=coral

# ElevenLabs
ELEVENLABS_API_KEY=...

# Meta (Instagram/Messenger)
META_APP_ID=...
META_APP_SECRET=...
FRONTEND_URL=https://portal.eduflowia.com
```

### Frontend (`frontend/.env.production`)

```env
NEXT_PUBLIC_API_URL=https://portal.eduflowia.com/api
```

---

## 💻 Setup Local (Desenvolvimento)

### Pré-requisitos
- Node.js 20+
- Python 3.10+
- PostgreSQL 14+
- Git

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
# Criar .env com as variáveis acima
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend

```bash
cd frontend
npm install
# Criar .env.local com: NEXT_PUBLIC_API_URL=http://localhost:8001/api
npm run dev
```

### Banco de Dados

```bash
sudo -u postgres psql -c "CREATE USER eduflow WITH PASSWORD 'SUA_SENHA';"
sudo -u postgres psql -c "CREATE DATABASE eduflow_db OWNER eduflow;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE eduflow_db TO eduflow;"
```

As tabelas são criadas automaticamente pelo SQLAlchemy ao iniciar o backend.

Para aplicar as migrations do Chatbot:

```bash
sudo -u postgres psql eduflow_db -f backend/migration_chatbot.sql
sudo -u postgres psql eduflow_db -f backend/migration_chatbot_delay.sql
```

### Habilitar Chatbot num tenant

O Chatbot é uma feature **opt-in estrita** — desligada por padrão. Para habilitar:

1. Acesse `/admin` como superadmin
2. Abra o tenant alvo
3. Em "Automação e IA", ative **"Chatbot Visual"**
4. Faça logout/login (features são carregadas no `/auth/me`)
5. Item "Chatbot" aparece no sidebar

---

## 🚀 Deploy (Produção)

### Servidor
- **AWS Lightsail** — Ubuntu 22.04, 2GB RAM, $12/mês
- **IP:** 44.211.127.84
- **Domínio:** portal.eduflowia.com (DNS via Hostinger)
- **SSL:** Let's Encrypt (Certbot + Nginx)

### Serviços systemd

```bash
sudo systemctl status eduflow-backend    # FastAPI (porta 8001)
sudo systemctl status eduflow-frontend   # Next.js (porta 3000)
```

### Schedulers em background (lifespan)

O backend registra automaticamente no startup os schedulers abaixo:

| Scheduler | Intervalo | Responsabilidade |
|-----------|-----------|------------------|
| Sync Exact Spotter | 10 min | Sync de leads legado |
| Scheduler de ligações | 1 min | Disparo de chamadas Voice AI agendadas |
| Automation scheduler | 15 min | Envio de mensagens programadas |
| Campaign worker | contínuo | Fila de campanhas outbound |
| **Chatbot delay scheduler** | **30s** | **Retoma sessões do Chatbot em nó `delay`** |

Verifique o startup:
```bash
sudo journalctl -u eduflow-backend -n 30 | grep -E "scheduler|iniciado"
```

### Fluxo de Deploy

```bash
# 1. Push local
git add <arquivos específicos>
git commit -m "mensagem"
git push

# 2. No servidor (SSH)
cd ~/eduflow
git pull

# Backend
sudo systemctl restart eduflow-backend

# Frontend (se alterado)
cd frontend
npm run build
sudo systemctl restart eduflow-frontend
```

> ⚠️ **Nunca usar `git add .` no servidor** — risco de commitar uploads de mídia.
> Se `git pull` falhar por conflito em package.json:
> `git checkout -- frontend/package.json frontend/package-lock.json`

---

## 🧰 Comandos Úteis

```bash
# Status dos serviços
sudo systemctl status eduflow-backend
sudo systemctl status eduflow-frontend

# Logs
sudo journalctl -u eduflow-backend -n 100 --no-pager
sudo journalctl -u eduflow-frontend -n 50 --no-pager

# Filtrar logs do Chatbot
sudo journalctl -u eduflow-backend -n 200 | grep -E "Chatbot|🌐|📤|⏸️|⏰"

# Banco de dados
sudo -u postgres psql eduflow_db

# Consultas úteis
SELECT * FROM tenants;
SELECT id, name, email, role, tenant_id FROM users;
SELECT COUNT(*) FROM contacts GROUP BY tenant_id;
SELECT * FROM token_usage ORDER BY created_at DESC LIMIT 20;

# Consultas Chatbot
SELECT id, name, is_published, version FROM chatbot_flows WHERE tenant_id = X;
SELECT operation_mode, active_chatbot_flow_id FROM channels WHERE tenant_id = X;
SELECT id, status, current_node_id, started_at FROM chatbot_sessions
  WHERE status IN ('active','waiting') ORDER BY started_at DESC;
SELECT id, session_id, resume_at, status FROM chatbot_scheduled_resumes
  WHERE status = 'pending' ORDER BY resume_at;
```

---

## 🔗 Integrações Externas

| Serviço | Uso | Config |
|---------|-----|--------|
| **Evolution API** | WhatsApp (QR Code, webhooks, grupos) | `evolution/config.py` |
| **Meta Graph API** | Instagram DM, Messenger, Lead Forms | OAuth + `.env` |
| **OpenAI** | GPT-4o (chat), Embeddings (RAG), Realtime API (Voice) | `.env` |
| **ElevenLabs** | TTS Agents, Conversational AI | `.env` + API direta |
| **Twilio** | Telefonia (WebRTC + PSTN), gravações | `.env` |
| **Google Calendar** | Consulta de horários, criação de eventos | Service Account JSON |
| **Google Drive** | Upload de gravações | Service Account JSON |
| **Exact Spotter** | Sync de leads (legado, opcional) | `.env` |
| **Netlify** | Hospedagem de landing pages estáticas | Deploy manual |
| **Webhooks externos** | Integrações sob demanda via nó `webhook_out` do Chatbot (Slack, Zapier, n8n, Make, sistemas próprios) | Configurado por fluxo |

---

## ❗ Solução de Problemas

### Backend não inicia
```bash
sudo journalctl -u eduflow-backend -n 50 --no-pager
# Comum: módulo não encontrado → pip install na venv
```

### Frontend dá 502
```bash
sudo systemctl status eduflow-frontend
# Rebuildar: cd frontend && npm run build
# OOM? Criar swap: sudo fallocate -l 2G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

### Webhook Evolution API não recebe mensagens
- URL deve incluir `/{instance_name}` no path
- `groupsIgnore` deve ser `false` para suporte a grupos
- CORS: verificar `backend/app/main.py`

### Erro `tenant_id null` no webhook Instagram
- Bug conhecido — verificar se o canal tem `tenant_id` preenchido no banco

### Mutations JSON não persistem (SQLAlchemy)
```python
from sqlalchemy.orm.attributes import flag_modified
tenant.features["voice_ai"] = True
flag_modified(tenant, "features")
await db.commit()
```

### Tabela nova sem permissão
```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO eduflow;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO eduflow;
```

### Chatbot — item não aparece no sidebar
- Feature desligada ou sessão sem refresh
- Verificar: `SELECT features->'chatbot' FROM tenants WHERE id = X;` — deve retornar `true`
- Usuário precisa fazer logout/login depois de ativar a feature

### Chatbot — bot não responde no WhatsApp
- Canal não está em modo chatbot: `SELECT operation_mode FROM channels WHERE id = X;`
- Fluxo não publicado: `SELECT is_published FROM chatbot_flows WHERE id = X;`
- Nenhum trigger bate com a mensagem recebida (modo "palavra-chave" requer match)

### Chatbot — sessões em "waiting" não retomam
- Scheduler não iniciou: conferir log `⏰ Chatbot delay scheduler iniciado`
- Resumes vencidos: `SELECT * FROM chatbot_scheduled_resumes WHERE status='pending' AND resume_at < NOW();`
- Se aparecerem mas não processam, checar erro no log do backend

### Chatbot — HTTP Request sempre cai no branch de erro
- URL inválida, API fora do ar, ou 4xx/5xx
- Ver última falha: `SELECT variables->>'_last_error' FROM chatbot_sessions WHERE id = X;`

---

## 📜 Changelog

### 2026-04 — Chatbot Visual (módulo novo)

Módulo completo de chatbot estilo ManyChat/n8n entregue em 14 iterações incrementais:

- **Fundação** — Schema (`chatbot_flows`, `chatbot_sessions`, `chatbot_scheduled_resumes`), CRUD backend, motor determinístico em Python
- **Editor visual** — Canvas React Flow com 11 tipos de nós, handles laterais, edges customizados com labels e botão "+" pra inserir nó no meio
- **Exclusividade por canal** — Coluna `operation_mode` em `channels` (`ai`/`chatbot`/`none`), regra "1 canal = 1 modo"
- **Publish-to-channel** — Diálogo de publicação com status colorido por canal (livre/IA ativa/outro chatbot/mesmo fluxo) + confirmações de conflito
- **Pipeline cascade** — Nós `handoff` e `move_stage` suportam escolha de pipeline + estágio quando tenant tem múltiplos pipelines
- **Scheduler de delay** — Loop async 30s processa resumes pendentes, nó `delay` pausa sessão até tempo configurado (minutos/horas/dias)
- **Simulador** — Chat UI no editor que roda o fluxo em dry-run (TS puro), sem tocar WhatsApp nem banco
- **Conectores externos:**
  - **HTTP Request** — GET/POST/PUT/PATCH/DELETE, headers custom, interpolação em URL/body, parsing de JSON, dot-notation em variáveis (`{api_response.user.name}`), 2 saídas (sucesso/erro), timeout 10s + 1 retry
  - **Webhook Out** — POST fire-and-forget, payload automático (padrão) ou customizado, `asyncio.create_task` não bloqueia fluxo
- **Superadmin — features opt-in estritas** — Novo padrão `OPT_IN_FEATURES` onde a chave precisa ser explicitamente `true` (chatbot usa esse padrão; outras features permanecem com comportamento legado)

### 2025-12 a 2026-03

- Múltiplos pipelines por tenant
- Voice AI (OpenAI Realtime API + Twilio)
- ElevenLabs Agents + campanhas outbound
- Meta Lead Forms (rascunho, backend pronto, frontend pendente)
- Signup self-service com Stripe (3 planos)
- Superadmin com consumo de tokens e gestão de features

---

## 📄 Licença

Projeto proprietário — **Álefe Lins © 2025-2026**. Todos os direitos reservados.

Repositório: `github.com/linsalefe/eduflow-plataform`