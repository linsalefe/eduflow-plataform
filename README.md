# 🟣 EduFlow Hub — Plataforma SaaS de CRM Multicanal com IA

**Plataforma multi-tenant de CRM e atendimento inteligente** com WhatsApp, Voice AI, pipeline Kanban, landing pages e automações — tudo em um único painel.

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
15. [Licença](#-licença)

---

## 🔍 Visão Geral

O **EduFlow Hub** é uma plataforma SaaS multi-tenant de CRM e atendimento multicanal com IA. Cada cliente (tenant) opera em um ambiente isolado com seus próprios dados, usuários, canais e configurações.

**Principais capacidades:**

- Atendimento multicanal (WhatsApp via Evolution API, Instagram, Messenger)
- Agente de IA no WhatsApp (GPT-4o + RAG com base de conhecimento)
- Voice AI — ligações automáticas com IA conversacional (OpenAI Realtime API + Twilio)
- Pipeline Kanban com drag-and-drop
- Landing pages white-label com rastreamento UTM
- Automações e envio em massa de templates
- Agendamento integrado ao Google Calendar
- Dashboard com métricas, ROI de campanhas e relatórios Excel
- Painel superadmin para gestão de tenants, features e consumo de tokens
- Sistema de features por tenant (módulos ligam/desligam por plano)

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
│  - Automações    │   │  - Voice AI (Realtime API)        │
│  - Landing Pages │   │  - Google Calendar / Drive         │
│  - Agenda        │   │  - Twilio Voice                   │
│  - Relatórios    │   │  - Token Usage Tracking           │
│  - Config IA     │   │  - Superadmin Routes              │
│  - Voice AI      │   │                                   │
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
| **Frontend** | Next.js 15 (App Router), React, TypeScript |
| **Estilização** | Tailwind CSS, shadcn/ui, Framer Motion |
| **Componentes** | TanStack Table, Recharts, @hello-pangea/dnd, Lucide React |
| **Backend** | FastAPI (Python), SQLAlchemy 2.x (async), asyncpg |
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
- Update otimista, busca, auto-refresh, modal de detalhes

### Agente de IA (WhatsApp)
- GPT-4o com RAG (base de conhecimento por canal)
- Fluxo de qualificação configurável
- Integração com Google Calendar para agendamento automático
- Resumo gerado ao desligar IA

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
  "voice_ai": false,
  "landing_pages": true,
  "automacoes": true,
  "agenda": true,
  "relatorios": true,
  "usuarios": true
}
```

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
│   │   ├── main.py                 # App FastAPI + webhooks
│   │   ├── models.py               # Modelos SQLAlchemy
│   │   ├── database.py             # Conexão PostgreSQL
│   │   ├── routes.py               # Contatos, mensagens, tags, dashboard
│   │   ├── auth.py                 # JWT + get_tenant_id + get_current_superadmin
│   │   ├── auth_routes.py          # Login, registro, listagem de usuários
│   │   ├── ai_routes.py            # Config IA, RAG, toggle, test-chat
│   │   ├── ai_engine.py            # Motor IA: RAG + GPT-4o + qualificação
│   │   ├── kanban_routes.py        # Pipeline Kanban
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
│   │   ├── evolution/
│   │   │   ├── routes.py           # Webhook Evolution API
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
│   │   │   ├── admin/page.tsx
│   │   │   └── ...
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── AppLayout.tsx
│   │   │   ├── CommandPalette.tsx
│   │   │   ├── ConfirmModal.tsx
│   │   │   ├── ActivityTimeline.tsx
│   │   │   └── Webphone.tsx
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
| `contacts` | Contatos/leads com status, notas, atribuição, IA |
| `messages` | Mensagens (inbound/outbound) com tipo e status |
| `channels` | Canais (WhatsApp, Instagram, Messenger) com credenciais |
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
| `meta_lead_configs` | Configuração de Meta Lead Forms |

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
| Dashboard | `/api/dashboard/stats`, `/api/dashboard/advanced` |
| Agenda | `/api/schedules` (CRUD), `/api/calendar/*` |
| Relatórios | `/api/export/contacts`, `/api/export/pipeline`, `/api/export/messages` |
| Busca | `/api/search?q=termo` |
| Webhook | `GET/POST /webhook` (Evolution API) |

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

# Banco de dados
sudo -u postgres psql eduflow_db

# Consultas úteis
SELECT * FROM tenants;
SELECT id, name, email, role, tenant_id FROM users;
SELECT COUNT(*) FROM contacts GROUP BY tenant_id;
SELECT * FROM token_usage ORDER BY created_at DESC LIMIT 20;
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

---

## 📄 Licença

Projeto proprietário — **Álefe Lins © 2025-2026**. Todos os direitos reservados.

Repositório: `github.com/linsalefe/eduflow-plataform`