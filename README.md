# 🟢 Cenat Hub — Central de Atendimento Integrado

**Plataforma de multiatendimento via WhatsApp Business API** desenvolvida para o CENAT (Centro Educacional Novas Abordagens em Saúde Mental).

Permite que a equipe comercial gerencie leads, responda conversas em tempo real, envie templates personalizados, qualifique leads automaticamente com IA e acompanhe métricas — tudo em um único painel web acessível de qualquer navegador.

---

## 📋 Índice

1. [Visão Geral](#-visão-geral)
2. [Arquitetura do Sistema](#-arquitetura-do-sistema)
3. [Tecnologias Utilizadas](#-tecnologias-utilizadas)
4. [Pré-requisitos](#-pré-requisitos)
5. [ETAPA 1 — Configuração do Meta Business](#-etapa-1--configuração-do-meta-business)
6. [ETAPA 2 — Configuração do Ambiente Local](#-etapa-2--configuração-do-ambiente-local)
7. [ETAPA 3 — Backend (FastAPI)](#-etapa-3--backend-fastapi)
8. [ETAPA 4 — Banco de Dados (PostgreSQL)](#-etapa-4--banco-de-dados-postgresql)
9. [ETAPA 5 — Frontend (Next.js)](#-etapa-5--frontend-nextjs)
10. [ETAPA 6 — Webhook (Receber Mensagens)](#-etapa-6--webhook-receber-mensagens)
11. [ETAPA 7 — Deploy em Produção (AWS Lightsail)](#-etapa-7--deploy-em-produção-aws-lightsail)
12. [ETAPA 8 — Configurar Templates do WhatsApp](#-etapa-8--configurar-templates-do-whatsapp)
13. [ETAPA 9 — Integração Exact Spotter (CRM)](#-etapa-9--integração-exact-spotter-crm)
14. [ETAPA 10 — Agente de IA (Nat)](#-etapa-10--agente-de-ia-nat)
15. [ETAPA 11 — Google Calendar](#-etapa-11--google-calendar)
16. [ETAPA 12 — VoIP Twilio (Ligações)](#-etapa-12--voip-twilio-ligações)
17. [ETAPA 13 — Landing Pages de Captação](#-etapa-13--landing-pages-de-captação)
18. [ETAPA 14 — Pipeline Kanban de Matrículas](#-etapa-14--pipeline-kanban-de-matrículas)
19. [ETAPA 15 — Dashboard de Campanhas (ROI)](#-etapa-15--dashboard-de-campanhas-roi)
20. [ETAPA 16 — Multi-Canal (Instagram, Messenger, Evolution API)](#-etapa-16--multi-canal-instagram-messenger-evolution-api)
21. [ETAPA 17 — Melhorias UX/CRM (Sprints 1–9)](#-etapa-17--melhorias-uxcrm-sprints-19)
22. [Funcionalidades](#-funcionalidades)
23. [Estrutura de Pastas](#-estrutura-de-pastas)
24. [Banco de Dados — Tabelas](#-banco-de-dados--tabelas)
25. [API — Endpoints](#-api--endpoints)
26. [Variáveis de Ambiente](#-variáveis-de-ambiente)
27. [Comandos Úteis](#-comandos-úteis)
28. [Solução de Problemas](#-solução-de-problemas)
29. [Licença](#-licença)

---

## 🔍 Visão Geral

O **Cenat Hub** é uma plataforma web completa de CRM e atendimento via WhatsApp Business API Cloud. A equipe comercial utiliza o painel para:

- Receber e responder mensagens de leads em tempo real
- Iniciar novas conversas enviando templates aprovados pelo Meta
- Gerenciar status de cada lead (Novo → Contato → Qualificado → Matriculado → Perdido)
- Organizar leads com tags e notas
- Operar múltiplos números de WhatsApp em um único painel
- Visualizar métricas no dashboard (total de conversas, leads novos, etc.)
- Receber e visualizar mídias (fotos, áudios, vídeos, documentos)
- Integração com Exact Spotter (CRM) — importação automática de leads de pós-graduação
- Página de automações para envio em massa de templates por filtros (estágio, curso, SDR)
- Qualificar leads automaticamente via IA (Nat) com fluxo de 5 etapas
- Agendar reuniões automaticamente verificando Google Calendar em tempo real
- Acompanhar leads no Kanban IA (aguardando IA, qualificado, agendado, etc.)
- Anotações automáticas na timeline do Exact Spotter quando IA é desligada
- Página de agenda com calendário Google embutido e painel de disponibilidade
- Chat de teste da IA para simular conversas antes de ativar em produção
- Ligações VoIP via Twilio (browser → celular e celular → browser)
- Gravação automática de chamadas com upload ao Google Drive
- **Busca global (⌘K)** com navegação por teclado entre páginas e contatos
- **Filtros avançados** por tags, mensagens não lidas e status da IA
- **Ações em lote** — mover status e adicionar tags para múltiplos contatos
- **Timeline de atividades** com log automático por contato (status, tags, IA, notas)
- **Atribuição de leads** para membros da equipe com avatar na lista
- **Notificações toast** em toda a plataforma (sucesso, erro, warning)
- **Interface responsiva** otimizada para mobile, tablet e desktop

**URL de Produção:** `https://hub.cenatdata.online`

---

## 🏗 Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────┐
│                       NAVEGADOR                         │
│                (hub.cenatdata.online)                    │
│                   Next.js (React)                       │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 NGINX (Reverse Proxy)                   │
│                 SSL via Let's Encrypt                   │
│                                                         │
│   /         → Frontend (porta 3001)                     │
│   /api/     → Backend  (porta 8001)                     │
│   /webhook  → Backend  (porta 8001)                     │
└──────────┬──────────────────────┬───────────────────────┘
           │                      │
           ▼                      ▼
┌──────────────────┐  ┌──────────────────────────────────┐
│  Next.js App     │  │       FastAPI Backend             │
│  Porta 3001      │  │       Porta 8001                  │
│                  │  │                                    │
│  - Login         │  │  - REST API (/api/*)               │
│  - Dashboard     │  │  - Webhook WhatsApp (/webhook)     │
│  - Conversas     │  │  - Autenticação JWT                │
│  - Leads Pós     │  │  - Proxy de mídia                  │
│  - Automações    │  │  - Sync Exact Spotter (10min)      │
│  - Usuários      │  │  - Envio em massa de templates     │
│  - Config IA     │  │  - AI Engine (GPT-5 + RAG)         │
│  - Kanban IA     │  │  - Google Calendar API              │
│  - Teste IA      │  │  - Twilio Voice (VoIP)              │
│  - Agenda        │  │  - Google Drive (gravações)          │
│  - Ligações      │  │  - Activity Timeline                 │
│  - Pipeline      │  │  - Busca Global + Bulk Actions       │
│  - Landing Pages │  │  - Atribuição de Leads               │
│  - Campanhas ROI │  │                                      │
│  - Canais        │  │                                      │
└──────────────────┘  └──────────┬───────────────────────┘
                                 │
                                 ▼
                      ┌──────────────────┐
                      │   PostgreSQL     │
                      │   Porta 5432     │
                      │                  │
                      │  - contacts      │
                      │  - messages      │
                      │  - channels      │
                      │  - users         │
                      │  - tags          │
                      │  - contact_tags  │
                      │  - activities    │
                      │  - exact_leads   │
                      │  - ai_configs    │
                      │  - knowledge_    │
                      │    documents     │
                      │  - ai_conver-    │
                      │    sation_       │
                      │    summaries     │
                      │  - ai_messages   │
                      │  - call_logs     │
                      │  - landing_pages │
                      │  - form_         │
                      │    submissions   │
                      └──────────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│  Exact Spotter API   │  │  Meta / WhatsApp     │
│  (CRM - v3)          │  │  Cloud API           │
│                      │  │                      │
│  - Leads pós-grad    │  │  - Enviar mensagens  │
│  - Sync a cada 10min │  │  - Receber webhook   │
│  - Histórico/Dados   │  │  - Baixar mídias     │
└──────────────────────┘  │  - Templates         │
                          └──────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│     OpenAI API       │  │   Google Calendar    │
│                      │  │   API v3             │
│  - GPT-5 (respostas)│  │                      │
│  - GPT-4o-mini       │  │  - Consultar         │
│    (retry + resumos) │  │    horários livres   │
│  - Embeddings        │  │  - Criar eventos     │
│    (RAG)             │  │    automaticamente   │
└──────────────────────┘  └──────────────────────┘

┌──────────────────────┐
│     Twilio Voice      │
│                      │
│  - WebRTC (browser)  │
│  - PSTN (celular)    │
│  - Gravações         │
│  - TwiML Engine      │
└──────────────────────┘
```

### Fluxo de uma mensagem recebida

1. Lead envia mensagem pelo WhatsApp
2. Meta envia POST para `https://hub.cenatdata.online/webhook`
3. Nginx encaminha para FastAPI (porta 8001)
4. Backend salva no PostgreSQL (contato + mensagem)
5. Frontend faz polling a cada 3 segundos e exibe no chat

### Fluxo de uma mensagem enviada

1. Atendente digita mensagem no chat
2. Frontend faz POST para `/api/send/text`
3. Backend envia via WhatsApp Cloud API
4. Meta entrega ao lead no WhatsApp
5. Backend salva mensagem no PostgreSQL

### Fluxo de sincronização Exact Spotter

1. A cada 10 minutos, background task busca leads na API Exact Spotter
2. Filtra leads com subSource começando em "pos" (pós-graduação)
3. Insere novos leads ou atualiza existentes na tabela `exact_leads`
4. Frontend exibe leads na página `/leads-pos` com filtros e detalhes

### Fluxo de atendimento com IA

1. Lead recebe template de primeiro contato via WhatsApp
2. Lead responde → webhook recebe a mensagem
3. Backend salva no PostgreSQL e aciona o AI Engine
4. AI Engine busca contexto via RAG (base de conhecimento dos cursos)
5. AI Engine injeta nome do lead, curso de interesse e horários livres do Google Calendar
6. GPT-5 gera resposta seguindo fluxo de qualificação em 5 etapas
7. Resposta enviada automaticamente via WhatsApp API
8. Ao confirmar agendamento → evento criado automaticamente no Google Calendar
9. Ao desligar IA → resumo gerado via GPT-4o-mini e postado na timeline do Exact Spotter

---

## 🛠 Tecnologias Utilizadas

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| **Frontend** | Next.js (React) | 15.x |
| **Estilização** | Tailwind CSS | 3.x |
| **Ícones** | Lucide React | latest |
| **HTTP Client** | Axios | latest |
| **Toasts** | Sonner | latest |
| **Backend** | FastAPI (Python) | 0.100+ |
| **ORM** | SQLAlchemy (async) | 2.x |
| **DB Driver** | asyncpg | latest |
| **Banco de Dados** | PostgreSQL | 14+ |
| **Autenticação** | JWT (PyJWT) + bcrypt | — |
| **HTTP (backend)** | httpx | latest |
| **CRM** | Exact Spotter API v3 | — |
| **WhatsApp API** | Meta Cloud API | v22.0 |
| **WhatsApp API** | Evolution API v2 | latest |
| **IA / LLM** | OpenAI GPT-5 + GPT-4o-mini | latest |
| **Embeddings** | OpenAI text-embedding-3-small | latest |
| **Calendário** | Google Calendar API v3 | — |
| **Google Auth** | google-api-python-client + google-auth | latest |
| **VoIP** | Twilio Voice SDK | 2.x |
| **Twilio JS** | @twilio/voice-sdk | 2.18+ |
| **Servidor Web** | Nginx | 1.18 |
| **SSL** | Certbot (Let's Encrypt) | auto |
| **Hospedagem** | AWS EC2 / Lightsail | Ubuntu 24.04 |
| **Controle de versão** | Git + GitHub | — |

---

## ✅ Pré-requisitos

Antes de começar, você precisa ter:

- **Conta Meta Business** verificada (business.facebook.com)
- **App Meta Developers** com produto WhatsApp configurado
- **Número de telefone** vinculado ao WhatsApp Business API
- **Conta Exact Spotter** com token de API (para integração CRM)
- **Conta OpenAI** com API key (para o agente de IA)
- **Conta Google Cloud** com Calendar API ativada + Service Account
- **Conta Twilio** com créditos e número brasileiro com Voice habilitado
- **Conta AWS** (para hospedagem em produção)
- **Domínio** apontando para o IP do servidor
- **Git e GitHub** configurados na máquina local
- **Node.js 20+** instalado localmente
- **Python 3.10+** instalado localmente
- **PostgreSQL 14+** instalado localmente (para desenvolvimento)

---

## 📱 ETAPA 1 — Configuração do Meta Business

Esta é a etapa mais importante. Sem ela, nada funciona.

### 1.1 — Criar App no Meta Developers

1. Acesse **https://developers.facebook.com**
2. Clique em **Criar App**
3. Selecione **Negócio** como tipo
4. Preencha:
   - Nome do App: `Cenat Hub` (ou o nome que preferir)
   - E-mail: seu e-mail de contato
   - Portfólio de negócios: selecione seu negócio verificado
5. Clique em **Criar App**

### 1.2 — Adicionar Produto WhatsApp

1. No painel do app, clique em **Adicionar Produto**
2. Encontre **WhatsApp** e clique em **Configurar**
3. Selecione o portfólio de negócios associado
4. O Meta vai criar automaticamente:
   - Um **WABA** (WhatsApp Business Account)
   - Um **número de teste** (para desenvolvimento)

### 1.3 — Vincular Número de Produção

> ⚠️ **Importante:** O número de teste tem limitações (só envia para números cadastrados). Para uso real, vincule um número de produção.

1. Vá em **WhatsApp → Configuração da API**
2. Clique em **Adicionar número de telefone**
3. Insira o número (formato internacional, ex: `+55 83 98804-6720`)
4. Verifique via SMS ou ligação
5. Defina o **nome de exibição** (aparece no WhatsApp do lead)
6. Configure o **PIN de verificação em duas etapas** (guarde esse PIN!)

### 1.4 — Obter Credenciais

Após configurar, anote as seguintes informações (você vai precisar delas):

| Informação | Onde encontrar | Exemplo |
|-----------|---------------|---------|
| **Token de Acesso** | API Setup → Token permanente | `EAAM...QWZDZD` |
| **Phone Number ID** | API Setup → Número selecionado | `978293125363835` |
| **WABA ID** | Business Settings → WhatsApp Accounts | `1360246076143727` |
| **App ID** | Dashboard do App | `1234567890` |
| **Webhook Verify Token** | Você define (string qualquer) | `cenat_webhook_2024` |

#### Como gerar o Token Permanente

1. Vá em **business.facebook.com → Configurações → Usuários do sistema**
2. Crie um **Usuário do sistema** (tipo Admin)
3. Clique no usuário → **Gerar Token**
4. Selecione o app
5. Marque as permissões:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
6. Clique em **Gerar Token**
7. **Copie e salve o token** — ele não aparece novamente!

### 1.5 — Configurar Webhook (depois do deploy)

> Esta etapa só pode ser feita depois que o servidor estiver rodando. Volte aqui na ETAPA 7.

1. Vá em **Meta Developers → Seu App → WhatsApp → Configuração**
2. Em "Webhook", clique em **Editar**
3. Preencha:
   - **URL do Callback:** `https://hub.cenatdata.online/webhook`
   - **Token de Verificação:** `cenat_webhook_2024`
4. Clique em **Verificar e Salvar**
5. Em **Campos do Webhook**, ative:
   - ✅ `messages` — para receber mensagens
   - ✅ `message_status` — para receber status (enviado, entregue, lido)

---

## 💻 ETAPA 2 — Configuração do Ambiente Local

### 2.1 — Clonar o Repositório

```bash
git clone git@github.com:linsalefe/pos-plataform.git
cd pos-plataform
```

### 2.2 — Estrutura do Projeto

```
pos-plataform/
├── backend/                        # API FastAPI (Python)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # App principal + webhook + sync Exact Spotter
│   │   ├── models.py               # Modelos SQLAlchemy
│   │   ├── database.py             # Conexão com PostgreSQL
│   │   ├── routes.py               # Rotas da API
│   │   ├── auth.py                 # Autenticação JWT
│   │   ├── auth_routes.py          # Rotas de login/registro
│   │   ├── whatsapp.py             # Funções de envio WhatsApp
│   │   ├── exact_spotter.py        # Integração API Exact Spotter
│   │   ├── exact_routes.py         # Rotas: leads pós, sync, detalhes, envio em massa
│   │   ├── ai_engine.py            # Motor IA: RAG + GPT + qualificação
│   │   ├── ai_routes.py            # Rotas IA: config, knowledge, test, toggle
│   │   ├── kanban_routes.py        # Rotas Kanban IA
│   │   ├── calendar_routes.py      # Rotas Google Calendar
│   │   ├── google_calendar.py      # Integração Google Calendar API
│   │   ├── twilio_routes.py        # Rotas VoIP: token, TwiML, webhooks, gravações
│   │   ├── google_drive.py         # Upload gravações ao Google Drive
│   │   ├── landing_routes.py       # Rotas: Landing Pages, formulário, dashboard ROI
│   │   ├── oauth_routes.py         # Rotas: OAuth Meta (Instagram/Messenger)
│   │   ├── migrate_ai.py           # Script migração tabelas IA
│   │   └── create_tables.py        # Script para criar tabelas
│   ├── requirements.txt
│   ├── google-credentials.json     # Chave Service Account Google (NÃO commitar)
│   └── .env
├── frontend/                       # Interface Next.js (React)
│   ├── src/
│   │   ├── app/
│   │   │   ├── login/page.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── conversations/page.tsx
│   │   │   ├── users/page.tsx
│   │   │   ├── leads-pos/page.tsx
│   │   │   ├── automacoes/page.tsx
│   │   │   ├── ai-config/page.tsx
│   │   │   ├── kanban/page.tsx
│   │   │   ├── ai-test/page.tsx
│   │   │   ├── agenda/page.tsx
│   │   │   ├── calls/page.tsx
│   │   │   ├── pipeline/page.tsx
│   │   │   ├── landing-pages/page.tsx
│   │   │   ├── dashboard-roi/page.tsx
│   │   │   ├── canais/page.tsx
│   │   │   ├── canais/callback/page.tsx
│   │   │   ├── lp/[slug]/page.tsx
│   │   │   ├── not-found.tsx          # Página 404 customizada
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── components/
│   │   │   ├── Sidebar.tsx            # Menu lateral com unread badge + busca ⌘K
│   │   │   ├── AppLayout.tsx          # Wrapper com proteção de rota + CommandPalette
│   │   │   ├── CommandPalette.tsx     # Busca global ⌘K (contatos + páginas)
│   │   │   ├── ConfirmModal.tsx       # Modal de confirmação estilizado
│   │   │   ├── ActivityTimeline.tsx   # Timeline de atividades por contato
│   │   │   └── Webphone.tsx           # Webphone flutuante (VoIP)
│   │   ├── contexts/
│   │   │   └── auth-context.tsx
│   │   └── lib/
│   │       └── api.ts                # Axios com interceptor 401 + toasts automáticos
│   ├── public/
│   │   ├── logo-icon-white.png
│   │   ├── logo-icon-color.png
│   │   ├── logo-principal-cor.png
│   │   └── logo-principal-negativo.png
│   ├── package.json
│   └── .env.production
└── README.md
```

---

## ⚙️ ETAPA 3 — Backend (FastAPI)

### 3.1 — Criar ambiente virtual e instalar dependências

```bash
cd backend
python3 -m venv venv
source venv/bin/activate      # No Windows: venv\Scripts\activate
pip install -r requirements.txt
pip install bcrypt==4.0.1
```

### 3.2 — Arquivo `requirements.txt`

```
fastapi
uvicorn[standard]
sqlalchemy[asyncio]
asyncpg
python-dotenv
httpx
pyjwt
bcrypt==4.0.1
apscheduler
openai
numpy
google-api-python-client
google-auth
twilio
```

### 3.3 — Criar arquivo `.env`

Crie o arquivo `backend/.env` com suas credenciais:

```env
# WhatsApp API
WHATSAPP_TOKEN=SEU_TOKEN_PERMANENTE_AQUI
WHATSAPP_PHONE_ID=SEU_PHONE_NUMBER_ID_AQUI
WEBHOOK_VERIFY_TOKEN=cenat_webhook_2024

# Banco de Dados
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/cenat_whatsapp

# Autenticação
JWT_SECRET=sua-chave-secreta-jwt-aqui

# Exact Spotter CRM
EXACT_SPOTTER_TOKEN=seu_token_exact_spotter_aqui

# OpenAI (IA)
OPENAI_API_KEY=sua_chave_openai

# Twilio Voice (VoIP)
TWILIO_ACCOUNT_SID=seu_account_sid
TWILIO_AUTH_TOKEN=seu_auth_token
TWILIO_API_KEY_SID=sua_api_key_sid
TWILIO_API_KEY_SECRET=seu_api_key_secret
TWILIO_TWIML_APP_SID=seu_twiml_app_sid
TWILIO_PHONE_NUMBER=+553123916801

# OAuth Meta (Instagram/Messenger)
META_APP_ID=886462874541479
META_APP_SECRET=sua_chave_secreta
FRONTEND_URL=https://seu-dominio.com
```

> ⚠️ **Nunca commite o `.env`!** Adicione ao `.gitignore`.

### 3.4 — Rodar o Backend

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

O backend estará acessível em `http://localhost:8001`.

Teste: `curl http://localhost:8001/health` → deve retornar `{"status": "ok"}`

---

## 🗄 ETAPA 4 — Banco de Dados (PostgreSQL)

### 4.1 — Criar Banco de Dados (Desenvolvimento Local)

```bash
# No Mac/Linux
psql -U postgres -c "CREATE DATABASE cenat_whatsapp;"

# Ou, se usar sudo:
sudo -u postgres psql -c "CREATE DATABASE cenat_whatsapp;"
```

### 4.2 — Criar Tabelas Automaticamente

Ao rodar o backend pela primeira vez, as tabelas base são criadas automaticamente via SQLAlchemy. Mas algumas colunas extras precisam ser adicionadas manualmente:

```bash
psql -U postgres cenat_whatsapp -c "
-- Colunas extras na tabela contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_status VARCHAR(30) DEFAULT 'novo';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS channel_id INTEGER REFERENCES channels(id);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id);

-- Coluna extra na tabela messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel_id INTEGER REFERENCES channels(id);

-- Tabela de tags (se não existir)
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT 'blue',
    created_at TIMESTAMP DEFAULT now()
);

-- Tabela de relação contato-tags
CREATE TABLE IF NOT EXISTS contact_tags (
    contact_wa_id VARCHAR(20) REFERENCES contacts(wa_id),
    tag_id INTEGER REFERENCES tags(id),
    PRIMARY KEY (contact_wa_id, tag_id)
);

-- Tabela de timeline de atividades
CREATE TABLE IF NOT EXISTS activities (
    id BIGSERIAL PRIMARY KEY,
    contact_wa_id VARCHAR(20) NOT NULL REFERENCES contacts(wa_id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    description TEXT NOT NULL,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_contacts_assigned ON contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_wa_id);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);
"
```

### 4.3 — Criar Tabela de Leads Exact Spotter

```bash
cd backend && source venv/bin/activate
python -m app.create_tables
```

Ou manualmente:

```bash
psql -U postgres cenat_whatsapp -c "
CREATE TABLE IF NOT EXISTS exact_leads (
    id SERIAL PRIMARY KEY,
    exact_id INTEGER UNIQUE NOT NULL,
    name VARCHAR(255),
    phone1 VARCHAR(50),
    phone2 VARCHAR(50),
    source VARCHAR(255),
    sub_source VARCHAR(255),
    stage VARCHAR(255),
    funnel_id INTEGER,
    sdr_name VARCHAR(255),
    register_date TIMESTAMP,
    update_date TIMESTAMP,
    synced_at TIMESTAMP DEFAULT now()
);
"
```

### 4.4 — Inserir Canal (Número de WhatsApp)

```bash
psql -U postgres cenat_whatsapp -c "
INSERT INTO channels (name, phone_number, phone_number_id, whatsapp_token, waba_id, is_active)
VALUES (
    'Pós-Graduação (SDR)',
    '5511952137432',
    '978293125363835',
    'SEU_TOKEN_AQUI',
    '1360246076143727',
    true
);
"
```

> 📌 Para adicionar mais números, basta inserir mais linhas nesta tabela com os dados de cada número.

### 4.5 — Criar Usuário Admin

```bash
# Gerar hash da senha com Python
cd backend && source venv/bin/activate
HASH=$(python3 -c "
import bcrypt
h = bcrypt.hashpw('SuaSenhaAqui'.encode(), bcrypt.gensalt()).decode()
print(h)
")

# Inserir no banco
psql -U postgres cenat_whatsapp -c "
INSERT INTO users (name, email, password_hash, role, is_active)
VALUES ('Seu Nome', 'seu@email.com', '$HASH', 'admin', true);
"
```

---

## 🎨 ETAPA 5 — Frontend (Next.js)

### 5.1 — Instalar dependências

```bash
cd frontend
npm install
npm install sonner    # Sistema de toasts
```

### 5.2 — Configurar variáveis de ambiente

Crie `frontend/.env.local` para desenvolvimento:

```env
NEXT_PUBLIC_API_URL=http://localhost:8001/api
```

Crie `frontend/.env.production` para produção:

```env
NEXT_PUBLIC_API_URL=https://hub.cenatdata.online/api
```

### 5.3 — Arquivo `src/lib/api.ts`

```typescript
import axios from 'axios';
import { toast } from 'sonner';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api',
});

// Interceptor: logout automático em 401, toasts em erros
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
      window.location.href = '/login';
    } else if (error.response?.status >= 500) {
      toast.error('Erro no servidor');
    } else if (!error.response) {
      toast.error('Sem conexão com o servidor');
    }
    return Promise.reject(error);
  }
);

export default api;
```

### 5.4 — Rodar o Frontend (Desenvolvimento)

```bash
cd frontend
npm run dev
```

O frontend estará acessível em `http://localhost:3000`.

### 5.5 — Build para Produção

```bash
cd frontend
npm run build
npm start -- -p 3001
```

---

## 🔗 ETAPA 6 — Webhook (Receber Mensagens)

### 6.1 — Como funciona

O webhook é o mecanismo pelo qual o Meta envia mensagens recebidas para o seu servidor. Toda vez que alguém manda uma mensagem para o seu número de WhatsApp Business, o Meta faz um POST para a URL configurada.

### 6.2 — Desenvolvimento Local (ngrok)

Para receber webhooks localmente, use o **ngrok**:

```bash
# Instalar ngrok (Mac)
brew install ngrok

# Ou baixar de https://ngrok.com/download

# Expor o backend local
ngrok http 8001
```

O ngrok gera uma URL como `https://abc123.ngrok-free.app`. Use essa URL no Meta:

1. Meta Developers → Seu App → WhatsApp → Configuração
2. Webhook URL: `https://abc123.ngrok-free.app/webhook`
3. Verify Token: `cenat_webhook_2024`
4. Ative os campos: `messages`, `message_status`

> ⚠️ A URL do ngrok muda toda vez que reinicia. Atualize no Meta.

### 6.3 — Produção

Em produção, o webhook aponta para o domínio real:

- **URL:** `https://hub.cenatdata.online/webhook`
- **Verify Token:** `cenat_webhook_2024`

---

## 🚀 ETAPA 7 — Deploy em Produção (AWS Lightsail)

### 7.1 — Criar Instância no Lightsail

1. Acesse **https://lightsail.aws.amazon.com**
2. Clique em **Create Instance**
3. Configure:
   - **Plataforma:** Linux/Unix
   - **Blueprint:** Ubuntu 22.04
   - **Plano:** $12/mês (2 GB RAM, 2 vCPUs, 60 GB SSD)
   - **Nome:** `cenat-hub`
4. Clique em **Create Instance**

### 7.2 — IP Estático

1. Na página da instância, vá em **Networking**
2. Clique em **Attach static IP**
3. Crie e anexe (é grátis enquanto vinculado)
4. Anote o IP estático (ex: `18.208.110.141`)

### 7.3 — Firewall

Na mesma página de Networking, adicione regras:

| Aplicativo | Protocolo | Porta |
|-----------|-----------|-------|
| SSH | TCP | 22 |
| HTTP | TCP | 80 |
| HTTPS | TCP | 443 |
| Personalizar | TCP | 8001 |

### 7.4 — Configurar DNS

No painel do seu provedor de domínio, crie:

| Tipo | Nome | Valor |
|------|------|-------|
| A | hub | IP estático da instância |

Após configurar, `hub.cenatdata.online` vai apontar para o servidor.

### 7.5 — Acessar o Servidor via SSH

Você pode acessar pelo terminal do Lightsail (botão "Connect using SSH") ou configurar no VSCode via SSH.

### 7.6 — Instalar Dependências no Servidor

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar pacotes essenciais
sudo apt install -y python3 python3-pip python3-venv postgresql postgresql-contrib nginx certbot python3-certbot-nginx git curl

# Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar versões
node -v          # v20.x.x
npm -v           # 10.x.x
python3 --version # 3.10+
```

### 7.7 — Configurar PostgreSQL

```bash
sudo -u postgres psql -c "CREATE USER cenat WITH PASSWORD 'CenatHub2024#';"
sudo -u postgres psql -c "CREATE DATABASE cenat_whatsapp OWNER cenat;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE cenat_whatsapp TO cenat;"
```

### 7.8 — Configurar Chave SSH para GitHub

```bash
ssh-keygen -t ed25519 -C "cenat-hub" -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

Copie a chave pública e adicione no GitHub: **Settings → SSH and GPG Keys → New SSH Key**.

### 7.9 — Clonar o Projeto

```bash
cd /home/ubuntu
git clone git@github.com:linsalefe/pos-plataform.git
```

### 7.10 — Configurar Backend no Servidor

```bash
cd /home/ubuntu/pos-plataform/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install bcrypt==4.0.1 pyjwt httpx
```

Criar `.env` de produção:

```bash
cat > /home/ubuntu/pos-plataform/backend/.env << 'EOF'
WHATSAPP_TOKEN=SEU_TOKEN_AQUI
WHATSAPP_PHONE_ID=978293125363835
WEBHOOK_VERIFY_TOKEN=cenat_webhook_2024
DATABASE_URL=postgresql+asyncpg://cenat:CenatHub2024#@localhost:5432/cenat_whatsapp
JWT_SECRET=cenat-hub-prod-secret-2024-x7k9m
EXACT_SPOTTER_TOKEN=seu_token_exact_spotter_aqui
OPENAI_API_KEY=sua_chave_openai
TWILIO_ACCOUNT_SID=seu_account_sid
TWILIO_AUTH_TOKEN=seu_auth_token
TWILIO_API_KEY_SID=sua_api_key_sid
TWILIO_API_KEY_SECRET=seu_api_key_secret
TWILIO_TWIML_APP_SID=seu_twiml_app_sid
TWILIO_PHONE_NUMBER=+553123916801
META_APP_ID=886462874541479
META_APP_SECRET=sua_chave_secreta
FRONTEND_URL=https://hub.cenatdata.online
EOF
```

Criar tabelas:

```bash
source venv/bin/activate
python -m app.create_tables
```

### 7.11 — Criar Serviço do Backend (systemd)

```bash
sudo tee /etc/systemd/system/cenat-backend.service << 'EOF'
[Unit]
Description=Cenat Hub Backend
After=network.target postgresql.service

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/pos-plataform/backend
ExecStart=/home/ubuntu/pos-plataform/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=3
EnvironmentFile=/home/ubuntu/pos-plataform/backend/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable cenat-backend
sudo systemctl start cenat-backend
```

### 7.12 — Configurar Frontend no Servidor

```bash
cd /home/ubuntu/pos-plataform/frontend

cat > .env.production << 'EOF'
NEXT_PUBLIC_API_URL=https://hub.cenatdata.online/api
EOF

npm install
npm run build
```

### 7.13 — Criar Serviço do Frontend (systemd)

```bash
sudo tee /etc/systemd/system/cenat-frontend.service << 'EOF'
[Unit]
Description=Cenat Hub Frontend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/pos-plataform/frontend
ExecStart=/usr/bin/npm start -- -p 3001
Restart=always
RestartSec=3
Environment=NODE_ENV=production
Environment=NEXT_PUBLIC_API_URL=https://hub.cenatdata.online/api

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable cenat-frontend
sudo systemctl start cenat-frontend
```

### 7.14 — Configurar Nginx

```bash
sudo tee /etc/nginx/sites-available/cenat-hub << 'EOF'
server {
    listen 80;
    server_name hub.cenatdata.online;

    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /webhook {
        proxy_pass http://127.0.0.1:8001/webhook;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /health {
        proxy_pass http://127.0.0.1:8001/health;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/cenat-hub /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### 7.15 — Instalar SSL (HTTPS)

```bash
sudo certbot --nginx -d hub.cenatdata.online --non-interactive --agree-tos -m seu@email.com
```

### 7.16 — Testar Tudo

```bash
curl https://hub.cenatdata.online/health
curl https://hub.cenatdata.online/api/channels
```

---

## 📝 ETAPA 8 — Configurar Templates do WhatsApp

Templates são mensagens pré-aprovadas pelo Meta, obrigatórias para **iniciar** uma conversa com um lead que não mandou mensagem primeiro.

### 8.1 — Acessar Gerenciador de Templates

1. Acesse **https://business.facebook.com/latest/whatsapp_manager/message_templates**
2. Clique em **Criar modelo**

### 8.2 — Criar Template de Primeiro Contato

| Campo | Valor |
|-------|-------|
| **Categoria** | Marketing |
| **Tipo** | Padrão |
| **Nome** | `primeiro_contato_pos` |
| **Idioma** | Portuguese (BR) |

### 8.3 — Regras Importantes dos Templates

- Só podem ser enviados para **iniciar** uma conversa
- Cada envio tem um **custo** (~R$0,25 a R$0,80 por conversa)
- Depois que o lead responde, a **janela de 24 horas** abre
- Dentro da janela, você pode enviar **texto livre** sem custo adicional
- Se a janela fechar (24h sem resposta do lead), precisa enviar novo template

---

## 🔗 ETAPA 9 — Integração Exact Spotter (CRM)

### 9.1 — Obter Token da API

1. Acesse o **Exact Spotter** da sua conta
2. Vá em **Configurações → Integrações → API**
3. Copie o **Token de API** (token_exact)
4. Adicione ao `.env` do backend:

```env
EXACT_SPOTTER_TOKEN=seu_token_aqui
```

### 9.2 — Como Funciona a Sincronização

- O backend possui uma **background task** que roda a cada **10 minutos**
- Busca todos os leads da API Exact Spotter (v3, protocolo OData)
- Filtra apenas leads com `subSource` começando com `"pos"` (pós-graduação)
- Insere novos leads ou atualiza dados de leads existentes na tabela `exact_leads`

### 9.3 — Dados Sincronizados

| Campo | Origem no Exact Spotter |
|-------|------------------------|
| name | lead (nome do lead) |
| phone1 | phone1 |
| phone2 | phone2 |
| source | source.value |
| sub_source | subSource.value (curso) |
| stage | stage (etapa no funil) |
| funnel_id | funnelId |
| sdr_name | sdr.name |
| register_date | registerDate |
| update_date | updateDate |

---

## 🤖 ETAPA 10 — Agente de IA (Nat)

### 10.1 — Visão Geral

A **Nat** é o agente de IA do Cenat Hub que qualifica leads automaticamente via WhatsApp.

### 10.2 — Fluxo de Qualificação (5 Etapas)

| Etapa | Pergunta | Objetivo |
|-------|----------|----------|
| 1 | Graduação e ano de conclusão | Verificar formação |
| 2 | Área de atuação | Entender perfil profissional |
| 3 | Expectativas com a pós-graduação | Qualificar interesse real |
| 4 | Valor das parcelas (~R$300/mês) | Verificar aceitação do investimento |
| 5 | Melhor dia/horário para ligação | Agendar reunião com consultora |

### 10.3 — Modelos Utilizados

| Modelo | Uso |
|--------|-----|
| `gpt-5` | Respostas principais da conversa |
| `gpt-4o-mini` | Retry quando GPT-5 retorna vazio + geração de resumos |
| `text-embedding-3-small` | Embeddings para RAG |

---

## 📅 ETAPA 11 — Google Calendar

### 11.1 — Configuração

1. Acesse **https://console.cloud.google.com**
2. Ative a **Google Calendar API**
3. Crie uma **Service Account** com chave JSON
4. Salve como `backend/google-credentials.json`

### 11.2 — Funcionalidades

- Consulta de horários livres em tempo real (8h–18h, slots de 30 minutos)
- Pula finais de semana automaticamente
- Injeção no prompt da IA — Nat só oferece horários realmente disponíveis
- Criação automática de eventos quando lead confirma agendamento

---

## 📞 ETAPA 12 — VoIP Twilio (Ligações)

### 12.1 — Visão Geral

Ligações telefônicas via Twilio Voice integradas ao navegador.

### 12.2 — Variáveis de Ambiente

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_API_KEY_SID=SKxxxxxxxx
TWILIO_API_KEY_SECRET=xxxxxxxx
TWILIO_TWIML_APP_SID=APxxxxxxxx
TWILIO_PHONE_NUMBER=+553123916801
```

---

## 🎯 ETAPA 13 — Landing Pages de Captação

### 13.1 — Visão Geral

Landing Pages de alta conversão com formulário integrado ao CRM e rastreamento UTM.

### 13.2 — Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/landing-pages` | Listar LPs |
| POST | `/api/landing-pages` | Criar LP |
| PUT | `/api/landing-pages/{id}` | Atualizar LP |
| DELETE | `/api/landing-pages/{id}` | Excluir LP |
| GET | `/api/lp/{slug}` | LP pública (sem auth) |
| POST | `/api/lp/{slug}/submit` | Envio do formulário (sem auth) |
| GET | `/api/landing-pages/dashboard/roi` | Dashboard de ROI |

---

## 📊 ETAPA 14 — Pipeline Kanban de Matrículas

### 14.1 — Colunas do Funil

| Coluna | Status | Cor |
|--------|--------|-----|
| Novos Leads | `novo` | Indigo |
| Em Contato | `em_contato` | Âmbar |
| Qualificados | `qualificado` | Roxo |
| Em Matrícula | `negociando` | Ciano |
| Matriculados | `convertido` | Verde |
| Perdidos | `perdido` | Vermelho |

---

## 📈 ETAPA 15 — Dashboard de Campanhas (ROI)

Dashboard dedicado para ROI de campanhas. Métricas: total de leads, por origem, por campanha, por LP, por dia e funil.

---

## 🔗 ETAPA 16 — Multi-Canal (Instagram, Messenger, Evolution API)

| Canal | Provider | Conexão |
|-------|----------|---------|
| WhatsApp (QR Code) | Evolution API | Escanear QR Code |
| WhatsApp (Oficial) | Meta Cloud API | Token + Phone ID |
| Instagram Direct | Meta Graph API | OAuth |
| Messenger | Meta Graph API | OAuth |

---

## 🚀 ETAPA 17 — Melhorias UX/CRM (Sprints 1–9)

Série de 9 sprints de melhoria que elevaram o score de qualidade de **4.7 para 8.8/10**, equiparando a plataforma a CRMs como HubSpot e Pipedrive.

### 17.1 — Sprint 1: Sistema de Toasts + Interceptor Axios

- Implementação do **Sonner** como sistema de notificações visuais
- **20 pontos de toast** em toda a plataforma (sucesso, erro, warning)
- **Interceptor Axios** captura 401 (logout automático) e erros de rede
- Substituição de todos os `alert()` e `console.error` por toasts visuais
- **Arquivos:** `lib/api.ts`, `layout.tsx` (Toaster global)

### 17.2 — Sprint 2: Responsividade

- Adaptação de **8 páginas** para mobile/tablet com breakpoints Tailwind
- Sidebar colapsável com overlay no mobile
- Grids adaptáveis (cols-1 → cols-2 → cols-4)
- Modais full-screen no mobile
- **Páginas:** Dashboard, Conversas, Pipeline, Agenda, Canais, Landing Pages, Dashboard ROI, Usuários

### 17.3 — Sprint 3: Acessibilidade + Skeleton Loading + Empty States

- **22 aria-labels** em botões icon-only
- Skeleton loading animado no Dashboard e lista de contatos
- Empty states com ícones SVG e mensagens em Conversas, Pipeline e Agenda
- **Componente:** ConfirmModal.tsx (substitui `window.confirm()`)

### 17.4 — Sprint 4: Busca Global (⌘K)

- **CommandPalette.tsx** — modal de busca estilo Notion/Spotlight
- Atalho: `Cmd+K` (Mac) ou `Ctrl+K` (Windows/Linux)
- Busca em tempo real com **debounce 300ms**
- Resultados agrupados: **Páginas** (Dashboard, Conversas, Pipeline...) + **Contatos** (nome, telefone)
- Navegação completa por teclado (↑ ↓ Enter Esc)
- Botão "Buscar... ⌘K" no topo da sidebar
- **Backend:** `GET /api/search?q=termo` — busca ILIKE em contacts (limite 10) + lista estática de páginas

### 17.5 — Sprint 5: Filtros Avançados

- Painel expansível com botão "Filtros" + badge de contagem
- **Filtros por tags** — multi-select com pills coloridas
- **Filtro não lidos** — toggle para contatos com mensagens não lidas
- **Filtro IA** — IA ativa / IA desativada
- Contador "X contatos" sempre visível
- Botão "Limpar filtros"
- **Implementação:** 100% client-side (sem endpoint adicional)

### 17.6 — Sprint 6: Ações em Lote (Bulk Actions)

- **Checkboxes** na lista de contatos (ao lado do avatar)
- **"Selecionar todos"** no topo da lista (com estado parcial)
- **Barra flutuante** ao selecionar — aparece no fundo da sidebar com:
  - Contador "X selecionados"
  - Dropdown "Mover status" (todas as opções do funil)
  - Dropdown "Adicionar tag" (todas as tags)
  - Botão cancelar seleção
- **Backend:**
  - `POST /api/contacts/bulk-update` — `{wa_ids: [], lead_status: ""}`
  - `POST /api/contacts/bulk-tag` — `{wa_ids: [], tag_id: N}`
  - `POST /api/contacts/bulk-remove-tag` — `{wa_ids: [], tag_id: N}`

### 17.7 — Sprint 7: Timeline de Atividades

- **Tabela `activities`** no PostgreSQL com log automático
- **Eventos registrados automaticamente:**
  - Mudança de status do lead (ex: "Status: novo → em_contato")
  - Notas atualizadas
  - Tag adicionada / removida (com nome da tag)
  - IA ligada / desligada
  - Contato atribuído a usuário
- **Componente `ActivityTimeline.tsx`** no painel CRM (abaixo das notas)
  - Ícones por tipo (GitBranch, Tag, FileText, Bot)
  - Cores por tipo (amber, emerald, red, blue, purple)
  - Tempo relativo (agora, 5min, 2h, 3d, 15/02)
  - Linha vertical de timeline
- **Backend:** `GET /api/contacts/{wa_id}/activities?limit=30`

### 17.8 — Sprint 8: Permissões + Atribuição de Leads

- Campo `assigned_to` na tabela contacts (FK → users)
- **Seletor de atribuição** no painel CRM:
  - Dropdown com todos os usuários ativos
  - Avatar com iniciais coloridas
  - Opção "Ninguém" para remover atribuição
  - Mostra role do usuário (admin/atendente)
- **Badge na lista de contatos** — avatar do atendente atribuído ao lado do horário
- Log automático na timeline ao atribuir
- **Backend:**
  - `PATCH /api/contacts/{wa_id}/assign` — `{assigned_to: user_id | null}`
  - `GET /api/users/list` — lista de usuários ativos (sem autenticação admin)

### 17.9 — Sprint 9: Polish + Correções

- **Página Agenda:**
  - 3× `console.error` → `toast.error` / `toast.success`
  - 2× `confirm()` → ConfirmModal estilizado
  - Responsividade (header, stats grid, calendário)
  - Toast de sucesso ao criar/editar/cancelar/deletar agendamento
- **Página 404** customizada (`not-found.tsx`) com botões "Ir para Dashboard" e "Voltar"
- **Aria-labels** em Usuários (fechar modal, mostrar/ocultar senha)

### 17.10 — Resumo de Score

| Critério | Antes | Depois |
|----------|-------|--------|
| Toasts / Feedback | 0 | 20 pontos |
| Responsividade | 2/10 páginas | 10/10 páginas |
| Acessibilidade | 0 aria-labels | 22+ aria-labels |
| Busca Global | Não existia | ⌘K completo |
| Filtros | Apenas status | Tags + Não lidos + IA |
| Bulk Actions | Não existia | Status + Tags em lote |
| Timeline | Não existia | 5 tipos de evento |
| Atribuição | Não existia | Dropdown + avatar |
| **Score Total** | **4.7/10** | **8.8/10** |

---

## 🎯 Funcionalidades

### Dashboard

- Total de conversas ativas
- Leads novos (últimas 24h)
- Mensagens enviadas/recebidas
- Gráfico de atividade
- Skeleton loading durante carregamento

### Conversas (WhatsApp Web Clone)

- Interface inspirada no WhatsApp Web (tema escuro)
- Chat em tempo real com polling (3 segundos)
- Envio e recebimento de texto, emojis, imagens, áudios, vídeos e documentos
- **Busca global ⌘K** — encontra contatos e páginas instantaneamente
- **Filtros avançados** — por tags, não lidos, IA ativa/inativa
- **Ações em lote** — selecionar múltiplos contatos e mover status ou adicionar tags
- Filtro por status (Todos, Novo, Contato, Qualificado, etc.)
- Seletor de canal (múltiplos números)
- Skeleton loading + empty states

### CRM (Painel lateral)

- **Perfil** do contato com foto, telefone, data de cadastro
- **Toggle IA** — ligar/desligar Nat por contato
- **Atribuição** — selecionar responsável pelo lead (dropdown com avatares)
- **Status do lead** — Novo → Contato → Qualificado → Matriculado → Perdido
- **Tags** coloridas — adicionar, remover, criar novas
- **Notas** internas editáveis
- **Timeline de atividades** — log automático de todas as ações

### Nova Conversa

- Seletor dinâmico de templates aprovados
- Preenchimento de variáveis com prévia em tempo real
- Criação automática do contato no sistema
- Busca inteligente de leads do Exact Spotter

### Gerenciar Usuários (Admin)

- Lista de todos os usuários
- Criar novos usuários (atendentes ou admins)
- Ativar/desativar usuários
- Controle de acesso por função

### Autenticação

- Login com email e senha
- JWT com expiração de 24 horas
- Proteção de todas as rotas
- Logout seguro
- Interceptor automático em 401

### Sistema de Notificações

- Toasts visuais (Sonner) em toda a plataforma
- Sucesso (verde), erro (vermelho), warning (amarelo)
- Modais de confirmação estilizados (substituem `window.confirm`)

---

## 🗂 Banco de Dados — Tabelas

### `contacts`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| wa_id | VARCHAR(20) PK | ID WhatsApp (DDD+número) |
| name | VARCHAR(255) | Nome do contato |
| lead_status | VARCHAR(30) | Status: novo, contato, qualificado, matriculado, perdido |
| notes | TEXT | Notas internas |
| ai_active | BOOLEAN | Se a IA está ativa para este contato |
| channel_id | INTEGER FK | Canal (número) vinculado |
| assigned_to | INTEGER FK | Usuário responsável (FK → users) |
| created_at | TIMESTAMP | Data de criação |
| updated_at | TIMESTAMP | Última atualização |

### `messages`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL PK | ID interno |
| wa_message_id | VARCHAR(100) UNIQUE | ID da mensagem no WhatsApp |
| contact_wa_id | VARCHAR(20) FK | Contato vinculado |
| channel_id | INTEGER FK | Canal vinculado |
| direction | VARCHAR(10) | inbound ou outbound |
| message_type | VARCHAR(20) | text, image, audio, video, document, template, sticker |
| content | TEXT | Conteúdo (texto ou media:ID\|mime\|caption) |
| timestamp | TIMESTAMP | Hora da mensagem |
| status | VARCHAR(20) | sent, delivered, read, received |
| sent_by_ai | BOOLEAN | Se foi enviada pela IA |

### `channels`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL PK | ID interno |
| name | VARCHAR(100) | Nome do canal |
| type | VARCHAR(20) | whatsapp, instagram, messenger |
| provider | VARCHAR(20) | official, evolution, meta |
| phone_number | VARCHAR(20) | Número no formato 55XXXXXXXXXXX |
| phone_number_id | VARCHAR(50) | ID do número na API do Meta |
| whatsapp_token | TEXT | Token de acesso |
| waba_id | VARCHAR(50) | ID da conta WhatsApp Business |
| instance_name | VARCHAR(100) | Instância Evolution API |
| page_id | VARCHAR(50) | Page ID Facebook |
| instagram_id | VARCHAR(50) | Instagram Business ID |
| access_token | TEXT | Token OAuth Meta |
| is_connected | BOOLEAN | Status da conexão |
| is_active | BOOLEAN | Se o canal está ativo |
| created_at | TIMESTAMP | Data de criação |

### `users`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL PK | ID interno |
| name | VARCHAR(255) | Nome do usuário |
| email | VARCHAR(255) UNIQUE | Email (usado no login) |
| password_hash | VARCHAR(255) | Senha hasheada (bcrypt) |
| role | VARCHAR(20) | admin ou atendente |
| is_active | BOOLEAN | Se pode fazer login |
| created_at | TIMESTAMP | Data de criação |

### `tags`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL PK | ID interno |
| name | VARCHAR(50) UNIQUE | Nome da tag |
| color | VARCHAR(20) | Cor (blue, red, green, etc.) |
| created_at | TIMESTAMP | Data de criação |

### `contact_tags`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| contact_wa_id | VARCHAR(20) PK, FK | Contato |
| tag_id | INTEGER PK, FK | Tag |

### `activities`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | BIGSERIAL PK | ID interno |
| contact_wa_id | VARCHAR(20) FK | Contato vinculado |
| type | VARCHAR(30) | Tipo: status_change, tag_added, tag_removed, note, ai_toggle, assigned |
| description | TEXT | Descrição legível (ex: "Status: novo → em_contato") |
| metadata | TEXT | Dados extras (JSON opcional) |
| created_at | TIMESTAMP | Data do evento |

### `exact_leads`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL PK | ID interno |
| exact_id | INTEGER UNIQUE | ID do lead no Exact Spotter |
| name | VARCHAR(255) | Nome do lead |
| phone1 | VARCHAR(50) | Telefone principal |
| phone2 | VARCHAR(50) | Telefone secundário |
| source | VARCHAR(255) | Fonte |
| sub_source | VARCHAR(255) | Curso |
| stage | VARCHAR(255) | Estágio no funil |
| funnel_id | INTEGER | ID do funil |
| sdr_name | VARCHAR(255) | Nome do SDR |
| register_date | TIMESTAMP | Data de cadastro |
| update_date | TIMESTAMP | Data de atualização |
| synced_at | TIMESTAMP | Data da sincronização |

### `ai_configs`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL PK | ID interno |
| channel_id | INTEGER FK UNIQUE | Canal vinculado |
| is_enabled | BOOLEAN | IA ativa para o canal |
| system_prompt | TEXT | Prompt de sistema |
| model | VARCHAR(50) | Modelo GPT |
| temperature | VARCHAR(10) | Temperatura |
| max_tokens | INTEGER | Limite de tokens |

### `knowledge_documents`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL PK | ID interno |
| channel_id | INTEGER FK | Canal vinculado |
| title | VARCHAR(500) | Título |
| content | TEXT | Conteúdo |
| embedding | BYTEA | Embedding numpy |
| chunk_index | INTEGER | Índice do chunk |
| token_count | INTEGER | Contagem de tokens |

### `ai_conversation_summaries`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL PK | ID interno |
| contact_wa_id | VARCHAR(20) FK | Contato |
| channel_id | INTEGER FK | Canal |
| status | VARCHAR(30) | Status do atendimento IA |
| ai_active | BOOLEAN | IA ativa |
| lead_course | VARCHAR(255) | Curso de interesse |
| summary | TEXT | Resumo gerado |
| human_took_over | BOOLEAN | Se humano assumiu |

### `ai_messages`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL PK | ID interno |
| contact_wa_id | VARCHAR(20) FK | Contato |
| channel_id | INTEGER FK | Canal |
| role | VARCHAR(20) | user ou assistant |
| content | TEXT | Conteúdo |
| model | VARCHAR(50) | Modelo utilizado |
| tokens_used | INTEGER | Tokens consumidos |

### `schedules`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL PK | ID interno |
| contact_wa_id | VARCHAR(20) | Contato |
| type | VARCHAR(20) | voice_ai ou consultant |
| scheduled_date | DATE | Data agendada |
| scheduled_time | TIME | Horário agendado |
| status | VARCHAR(20) | pending, completed, cancelled, failed |
| notes | TEXT | Observações |

### `call_logs`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL PK | ID interno |
| call_sid | VARCHAR | ID Twilio |
| from_number | VARCHAR | Origem |
| to_number | VARCHAR | Destino |
| direction | VARCHAR | outbound ou inbound |
| status | VARCHAR | Status da chamada |
| duration | INTEGER | Duração em segundos |
| recording_url | VARCHAR | URL gravação Twilio |
| drive_file_url | VARCHAR | Link Google Drive |

### `landing_pages`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL PK | ID interno |
| title | VARCHAR(255) | Título da LP |
| slug | VARCHAR(100) UNIQUE | URL amigável |
| description | TEXT | Descrição |
| primary_color | VARCHAR(7) | Cor principal (hex) |
| is_active | BOOLEAN | Se está publicada |

### `form_submissions`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL PK | ID interno |
| landing_page_id | INTEGER FK | LP de origem |
| name | VARCHAR(255) | Nome do lead |
| phone | VARCHAR(20) | Telefone |
| email | VARCHAR(255) | Email |
| utm_source | VARCHAR(100) | Origem UTM |
| utm_medium | VARCHAR(100) | Mídia UTM |
| utm_campaign | VARCHAR(100) | Campanha UTM |

---

## 🔌 API — Endpoints

### Autenticação

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/login` | Login (retorna JWT) |
| GET | `/api/auth/me` | Dados do usuário logado |
| POST | `/api/auth/register` | Criar usuário (admin) |
| GET | `/api/auth/users` | Listar usuários (admin) |
| PATCH | `/api/auth/users/{id}` | Ativar/desativar usuário |

### Contatos + CRM

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/contacts?channel_id=X` | Listar contatos do canal |
| GET | `/api/contacts/{wa_id}` | Detalhes do contato |
| PATCH | `/api/contacts/{wa_id}` | Atualizar nome/status/notas |
| PATCH | `/api/contacts/{wa_id}/assign` | Atribuir a usuário |
| POST | `/api/contacts/{wa_id}/tags/{id}` | Adicionar tag |
| DELETE | `/api/contacts/{wa_id}/tags/{id}` | Remover tag |
| GET | `/api/contacts/{wa_id}/activities` | Timeline de atividades |
| POST | `/api/contacts/{wa_id}/read` | Marcar como lido |
| GET | `/api/contacts/{wa_id}/messages` | Histórico de mensagens |

### Busca + Bulk Actions

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/search?q=termo` | Busca global (contatos + páginas) |
| GET | `/api/users/list` | Usuários para atribuição |
| POST | `/api/contacts/bulk-update` | Mover status em lote |
| POST | `/api/contacts/bulk-tag` | Adicionar tag em lote |
| POST | `/api/contacts/bulk-remove-tag` | Remover tag em lote |

### Mensagens

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/messages/{wa_id}` | Histórico de mensagens |
| POST | `/api/send/text` | Enviar texto livre |
| POST | `/api/send/template` | Enviar template |

### Tags

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/tags` | Listar todas as tags |
| POST | `/api/tags` | Criar nova tag |

### Canais

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/channels` | Listar canais ativos |
| POST | `/api/channels` | Criar novo canal |
| GET | `/api/channels/{id}/templates` | Listar templates aprovados |

### Mídia + Dashboard

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/media/{media_id}` | Proxy para baixar mídia |
| GET | `/api/dashboard/stats` | Métricas gerais |

### Exact Spotter

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/exact-leads` | Listar leads |
| POST | `/api/exact-leads/sync` | Sincronizar |
| GET | `/api/exact-leads/stats` | Estatísticas |
| GET | `/api/exact-leads/{id}/details` | Detalhes do lead |
| POST | `/api/exact-leads/bulk-send-template` | Envio em massa |

### Agente de IA

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/ai/config/{channel_id}` | Config da IA |
| PUT | `/api/ai/config/{channel_id}` | Salvar config |
| GET | `/api/ai/knowledge/{channel_id}` | Listar documentos RAG |
| POST | `/api/ai/knowledge/{channel_id}` | Adicionar documento |
| DELETE | `/api/ai/knowledge/{doc_id}` | Remover documento |
| PATCH | `/api/ai/contacts/{wa_id}/toggle` | Ligar/desligar IA |
| POST | `/api/ai/test-chat` | Testar conversa |

### Kanban IA

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/kanban/board/{channel_id}` | Board completo |
| PATCH | `/api/kanban/move` | Mover card |

### Google Calendar

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/calendar/consultants` | Listar consultoras |
| GET | `/api/calendar/available-dates/{key}` | Dias com horários |
| GET | `/api/calendar/available-slots/{key}/{date}` | Horários livres |
| POST | `/api/calendar/book` | Agendar reunião |

### Agendamentos

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/schedules?limit=500` | Listar agendamentos |
| GET | `/api/schedules/stats` | Estatísticas |
| POST | `/api/schedules` | Criar agendamento |
| PATCH | `/api/schedules/{id}` | Atualizar agendamento |
| DELETE | `/api/schedules/{id}` | Deletar agendamento |

### VoIP (Twilio)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/twilio/token` | Token WebRTC |
| POST | `/api/twilio/voice` | TwiML saída |
| POST | `/api/twilio/voice-incoming` | TwiML entrada |
| POST | `/api/twilio/call-status` | Status da chamada |
| POST | `/api/twilio/recording-status` | Gravação finalizada |
| GET | `/api/twilio/recording/{sid}` | Proxy gravação |
| GET | `/api/twilio/call-logs` | Histórico |

### Landing Pages

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/landing-pages` | Listar LPs |
| POST | `/api/landing-pages` | Criar LP |
| PUT | `/api/landing-pages/{id}` | Atualizar LP |
| DELETE | `/api/landing-pages/{id}` | Excluir LP |
| GET | `/api/lp/{slug}` | LP pública |
| POST | `/api/lp/{slug}/submit` | Formulário |
| GET | `/api/landing-pages/dashboard/roi` | Dashboard ROI |

### OAuth

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/oauth/meta/url?channel_type=instagram` | URL OAuth |
| POST | `/api/oauth/meta/callback` | Callback OAuth |

### Webhook

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/webhook` | Verificação Meta |
| POST | `/webhook` | Receber mensagens |

---

## 🔐 Variáveis de Ambiente

### Backend (`backend/.env`)

```env
# WhatsApp API (obrigatório)
WHATSAPP_TOKEN=token_permanente_do_meta
WHATSAPP_PHONE_ID=phone_number_id_principal
WEBHOOK_VERIFY_TOKEN=string_secreta_para_webhook

# Banco de Dados (obrigatório)
DATABASE_URL=postgresql+asyncpg://usuario:senha@host:5432/cenat_whatsapp

# Autenticação (obrigatório)
JWT_SECRET=chave_secreta_para_tokens_jwt

# Exact Spotter CRM
EXACT_SPOTTER_TOKEN=token_da_api_exact_spotter

# OpenAI (IA)
OPENAI_API_KEY=sua_chave_openai

# Twilio Voice (VoIP)
TWILIO_ACCOUNT_SID=seu_account_sid
TWILIO_AUTH_TOKEN=seu_auth_token
TWILIO_API_KEY_SID=sua_api_key_sid
TWILIO_API_KEY_SECRET=seu_api_key_secret
TWILIO_TWIML_APP_SID=seu_twiml_app_sid
TWILIO_PHONE_NUMBER=+553123916801

# OAuth Meta (Instagram/Messenger)
META_APP_ID=886462874541479
META_APP_SECRET=sua_chave_secreta
FRONTEND_URL=https://seu-dominio.com
```

### Frontend (`frontend/.env.production`)

```env
NEXT_PUBLIC_API_URL=https://seu-dominio.com/api
```

---

## 🧰 Comandos Úteis

### Servidor de Produção

```bash
# Verificar status
sudo systemctl status cenat-backend
sudo systemctl status cenat-frontend
sudo systemctl status nginx

# Reiniciar serviços
sudo systemctl restart cenat-backend
sudo systemctl restart cenat-frontend
sudo systemctl restart nginx

# Ver logs
sudo journalctl -u cenat-backend -n 50 --no-pager
sudo journalctl -u cenat-frontend -n 50 --no-pager

# Deploy
cd /home/ubuntu/pos-plataform && git pull
sudo systemctl restart cenat-backend
cd frontend && npm run build && sudo systemctl restart cenat-frontend

# Banco de dados
psql -U eduflow -d eduflow_db -h localhost

# Consultas úteis:
# SELECT * FROM contacts ORDER BY created_at DESC LIMIT 10;
# SELECT * FROM activities ORDER BY created_at DESC LIMIT 20;
# SELECT COUNT(*) FROM activities GROUP BY type;
# SELECT id, name, role, is_active FROM users;
# SELECT * FROM channels;
```

### Desenvolvimento Local

```bash
# Backend
cd backend && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# Frontend
cd frontend && npm run dev

# Webhook (ngrok)
ngrok http 8001
```

---

## ❗ Solução de Problemas

### Backend não inicia

```bash
sudo journalctl -u cenat-backend -n 50 --no-pager
# Erro comum: módulo não encontrado → pip install na venv
```

### Frontend dá 502 Bad Gateway

```bash
sudo systemctl status cenat-frontend
# Verificar node -v >= 20.x, rebuildar: npm run build
```

### Webhook não recebe mensagens

```bash
curl https://hub.cenatdata.online/webhook?hub.mode=subscribe&hub.verify_token=cenat_webhook_2024&hub.challenge=test
# Deve retornar: test
```

### Timeline vazia

```bash
# Verificar se a tabela activities existe
psql -U eduflow -d eduflow_db -h localhost -c "SELECT COUNT(*) FROM activities;"
# Se der erro, rodar a migration da ETAPA 4.2
```

### Atribuição não funciona

```bash
# Verificar se a coluna assigned_to existe
psql -U eduflow -d eduflow_db -h localhost -c "\d contacts" | grep assigned
# Se não existir: ALTER TABLE contacts ADD COLUMN assigned_to INTEGER REFERENCES users(id);
```

### Busca ⌘K não abre

- Verificar se `CommandPalette.tsx` existe em `components/`
- Verificar se `AppLayout.tsx` importa o `<CommandPalette />`
- Verificar se `Sidebar.tsx` tem o botão "Buscar... ⌘K"

### Bulk actions não funcionam

```bash
# Testar endpoint
curl -X POST https://hub.cenatdata.online/api/contacts/bulk-update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{"wa_ids": ["5511999999999"], "lead_status": "em_contato"}'
```

---

## 📄 Licença

Projeto proprietário — CENAT © 2026. Todos os direitos reservados.