# EduFlow × ElevenLabs — Documentação de Evolução dos Agentes de IA

> **Última atualização:** 01 de Abril de 2026  
> **Responsável técnico:** Álefe Lins  
> **Plataforma:** EduFlow Hub — portal.eduflowia.com

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura da Integração](#2-arquitetura-da-integração)
3. [Agentes Configurados](#3-agentes-configurados)
4. [Módulo Voice AI — ElevenLabs](#4-módulo-voice-ai--elevenlabs)
5. [Aba Agente — Configurações pela UI](#5-aba-agente--configurações-pela-ui)
6. [Ferramentas do Agente (Tools)](#6-ferramentas-do-agente-tools)
7. [Personalidade e System Prompt](#7-personalidade-e-system-prompt)
8. [Variáveis Dinâmicas](#8-variáveis-dinâmicas)
9. [Post-Call Webhook](#9-post-call-webhook)
10. [Fluxo Completo de uma Ligação](#10-fluxo-completo-de-uma-ligação)
11. [Banco de Dados — Tabelas Relacionadas](#11-banco-de-dados--tabelas-relacionadas)
12. [Configurações de Infraestrutura](#12-configurações-de-infraestrutura)
13. [Checklist de Implementação](#13-checklist-de-implementação)
14. [Próximos Passos](#14-próximos-passos)

---

## 1. Visão Geral

O EduFlow utiliza a plataforma **ElevenLabs Conversational AI** para executar agentes de voz em ligações telefônicas automáticas via **Twilio**. Os agentes são responsáveis por qualificar leads, agendar reuniões e registrar informações no CRM — tudo sem intervenção humana.

### Tecnologias envolvidas

| Componente | Tecnologia | Função |
|------------|-----------|--------|
| Agente de IA | ElevenLabs Conversational AI | Voz, NLP, tool calling |
| Telefonia | Twilio Voice | Ligações outbound/inbound |
| Backend | FastAPI (Python) | Orquestração, webhooks, CRM |
| Banco de dados | PostgreSQL | Persistência de chamadas e transcrições |
| LLM | GPT-4o (via ElevenLabs) | Raciocínio e geração de respostas |
| TTS | ElevenLabs TTS | Síntese de voz em PT-BR |

---

## 2. Arquitetura da Integração

```
┌─────────────────────────────────────────────────────────────┐
│                        FLUXO DE LIGAÇÃO                     │
│                                                             │
│  EduFlow Backend                                            │
│       │                                                     │
│       ├── make_outbound_call(phone, name, course)           │
│       │         │                                           │
│       │         ▼                                           │
│       │   Twilio API ──── Liga para o lead                  │
│       │         │                                           │
│       │         ▼                                           │
│       │   Lead atende                                       │
│       │         │                                           │
│       │         ▼                                           │
│       │   ElevenLabs Agent ←── System Prompt                │
│       │   (Rafael SDR)         + Tools configuradas         │
│       │         │              + Dynamic Variables          │
│       │         │                                           │
│       │   [Conversa em tempo real]                          │
│       │         │                                           │
│       │         ▼                                           │
│       │   Ligação encerra                                   │
│       │         │                                           │
│       │         ▼                                           │
│       └── POST /api/voice-ai-el/post-call-webhook           │
│               │                                             │
│               ├── Salva transcrição (ai_call_turns)         │
│               ├── Salva resumo em PT-BR (ai_calls)          │
│               ├── Atualiza pipeline do CRM                  │
│               └── Aciona Orquestrador de Agentes            │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Agentes Configurados

A conta ElevenLabs do EduFlow possui **4 agentes ativos**:

| Agent ID | Nome | Finalidade | Status |
|----------|------|-----------|--------|
| `agent_8201khxrydbcfxqtav8ffy0enqft` | **Rafael - SDR (eduflow)** | Qualificação outbound de leads | ✅ Principal |
| `agent_2001km0vkxc4f1drr7qd72t3bzxp` | EduFlow Retenção | Retenção de clientes | ✅ Ativo |
| `agent_7701km0c8c0bf15901qantwmkpgz` | EduFlow Suporte | Atendimento de suporte | ✅ Ativo |
| `agent_7701khxr1myeefcabvej9qsjc0tb` | Support agent | Suporte genérico | ⚪ Reserva |

### Rafael SDR — Agente Principal

O **Rafael** é o agente responsável pelas ligações outbound de qualificação. Ele:

- Se apresenta como consultor da EduFlow
- Usa a metodologia **SPIN Selling** (Situação → Problema → Implicação → Necessidade-Solução)
- Qualifica leads em **quente / morno / frio**
- Agenda reuniões com consultores
- Encerra a ligação com a tool `end_call`
- Gera resumo e análise pós-chamada

**Voice ID:** `gAzaYtjDCyG4vCelULMb`  
**Idioma:** Português Brasileiro  
**Tom:** Consultivo, empático, natural

---

## 4. Módulo Voice AI — ElevenLabs

### Arquivos do módulo

```
backend/app/voice_ai_elevenlabs/
├── __init__.py
├── config.py              # API keys, Agent ID, URLs
├── voice_pipeline.py      # make_outbound_call() via Twilio
├── routes.py              # Endpoints da API + Post-Call Webhook
├── agent_tools_routes.py  # Gerenciamento de tools e personalidade
├── campaign_routes.py     # Gerenciamento de campanhas outbound
├── campaign_worker.py     # Worker de disparo automático
└── models.py              # Modelos: CallCampaign, CallCampaignItem
```

### Variáveis de ambiente

```env
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_WEBHOOK_SECRET=wsec_...
ELEVENLABS_VOICE_ID=QVAas5gGwu8nTdZ3MUpQ
ELEVENLABS_AGENT_ID=agent_8201khxrydbcfxqtav8ffy0enqft
```

### Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/voice-ai-el/outbound-call` | Dispara ligação outbound |
| POST | `/api/voice-ai-el/post-call-webhook` | Recebe dados pós-chamada do ElevenLabs |
| GET | `/api/voice-ai-el/dashboard` | Métricas do dashboard |
| GET | `/api/voice-ai-el/calls` | Lista chamadas com filtros |
| GET | `/api/voice-ai-el/calls/{id}` | Detalhes + transcrição de uma chamada |
| GET | `/api/voice-ai-el/calls/{id}/audio` | Áudio da ligação |
| GET | `/api/voice-ai-el/health` | Status da integração |

---

## 5. Aba Agente — Configurações pela UI

A partir de **01/04/2026**, o EduFlow possui uma interface dedicada para configurar os agentes ElevenLabs diretamente pela plataforma, sem precisar acessar o dashboard do ElevenLabs.

**Localização:** Voice AI → Aba "Agente"

### Sub-abas disponíveis

#### 5.1 Ferramentas
Lista todas as tools disponíveis para o agente, com:
- Nome legível em português
- Descrição do que a tool faz
- Campo "Quando usar" para orientar o LLM
- Toggle para ativar/desativar
- Botão para adicionar novas tools customizadas
- Configurações avançadas (URL webhook, método HTTP) — colapsáveis

#### 5.2 Personalidade
Permite editar diretamente no ElevenLabs:
- **Seletor de agente** — dropdown com todos os agentes da conta
- **Voice ID** — ID da voz no ElevenLabs
- **System Prompt** — instruções completas do agente
- **Botão "Salvar no ElevenLabs"** — atualiza o agente via API em tempo real

#### 5.3 Variáveis Dinâmicas
Documenta as variáveis que o agente recebe automaticamente ao iniciar cada ligação.

---

## 6. Ferramentas do Agente (Tools)

### Tools padrão do sistema

| Nome | Identificador | Descrição | Quando usar |
|------|--------------|-----------|-------------|
| **Qualificar Lead** | `qualify_lead` | Registra nível de interesse, orçamento e prazo no CRM | Quando o lead demonstrar interesse concreto |
| **Agendar Reunião** | `schedule_meeting` | Verifica agenda e agenda reunião automaticamente | Quando o lead aceitar conversar com um consultor |
| **Encerrar Conversa** | `end_call` | Encerra a ligação com mensagem de despedida | Quando a conversa chegar ao fim naturalmente |
| **Consultar Dados do Lead** | `get_customer_info` | Busca informações do lead no CRM antes da conversa | Automaticamente no início de cada chamada |

### Tool `schedule_meeting` — Configuração de estágio

A tool de agendamento possui uma configuração especial: **"Após agendar, mover lead para"**. Isso permite que cada tenant configure para qual etapa do pipeline o lead vai quando o agente agendar uma reunião.

**Exemplo:** Após o agente agendar uma reunião, o lead é movido automaticamente para o estágio "Agendamento" no pipeline de vendas.

### Adicionando tools customizadas

Qualquer usuário pode adicionar novas tools pela UI:

1. Acessar **Voice AI → Agente → Ferramentas**
2. Clicar em **+ Nova Ferramenta**
3. Preencher:
   - **Nome** — como vai aparecer para o usuário
   - **O que faz** — descrição que o LLM usa para decidir quando chamar
   - **Quando usar** — contexto de ativação
4. Expandir **Configurações Avançadas** para definir:
   - Método HTTP (GET, POST, PUT, PATCH)
   - URL do webhook

### Banco de dados — tabela `agent_tools`

```sql
CREATE TABLE agent_tools (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,           -- identificador técnico
    display_name VARCHAR(150) NOT NULL,   -- nome legível
    description TEXT NOT NULL,            -- para o usuário
    when_to_use TEXT,                     -- contexto de ativação
    is_active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,      -- tools padrão não podem ser removidas
    method VARCHAR(10) DEFAULT 'POST',
    webhook_url TEXT,
    parameters JSONB DEFAULT '[]',
    post_action_stage VARCHAR(100),       -- estágio do pipeline após execução
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 7. Personalidade e System Prompt

### Como funciona

A personalidade do agente é gerenciada **diretamente no ElevenLabs** via API. O EduFlow não armazena o system prompt no banco — ele é buscado em tempo real do ElevenLabs ao selecionar o agente na UI.

**Fluxo:**
1. Usuário seleciona o agente no dropdown
2. EduFlow faz `GET /v1/convai/agents/{agent_id}` no ElevenLabs
3. Carrega `system_prompt` e `voice_id` nos campos
4. Usuário edita e clica "Salvar no ElevenLabs"
5. EduFlow faz `PATCH /v1/convai/agents/{agent_id}` com os novos dados

### Rotas backend

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/voice-ai/agent-tools/elevenlabs-agents` | Lista todos os agentes da conta |
| GET | `/api/voice-ai/agent-tools/elevenlabs-agents/{id}` | Carrega prompt e voz de um agente |
| PUT | `/api/voice-ai/agent-tools/elevenlabs-agents/{id}` | Atualiza agente no ElevenLabs |
| GET | `/api/voice-ai/agent-tools/personality` | Dados locais de personalidade |
| PUT | `/api/voice-ai/agent-tools/personality` | Salva dados locais |

### Banco de dados — tabela `agent_personality`

```sql
CREATE TABLE agent_personality (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL UNIQUE,
    agent_name VARCHAR(100) DEFAULT 'Sofia',
    voice VARCHAR(100) DEFAULT 'rachel',
    system_prompt TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 8. Variáveis Dinâmicas

As variáveis dinâmicas são injetadas automaticamente no contexto do agente no início de cada ligação.

| Variável | Descrição | Origem |
|----------|-----------|--------|
| `{{lead_name}}` | Nome do lead | CRM automático |
| `{{lead_phone}}` | Número de telefone | CRM automático |
| `{{product_interest}}` | Produto/serviço de interesse | CRM automático |
| `{{caller_id}}` | Número detectado automaticamente | Sistema (Twilio) |
| `{{system__caller_id}}` | Caller ID nativo do ElevenLabs | ElevenLabs (automático) |

### Secret Variables (segurança)

Variáveis prefixadas com `secret__` são usadas apenas em headers HTTP e **nunca enviadas ao LLM**:

- `secret__tenant_api_key` — autenticação entre ElevenLabs e EduFlow
- `secret__tenant_id` — isolamento multi-tenant

---

## 9. Post-Call Webhook

Após cada ligação, o ElevenLabs envia automaticamente um webhook para o EduFlow com todos os dados da conversa.

### URL do webhook

```
POST https://portal.eduflowia.com/api/voice-ai-el/post-call-webhook
```

### Dados recebidos e processados

| Campo | Origem no payload | Uso no EduFlow |
|-------|------------------|----------------|
| Transcrição | `data.transcript` | Salva em `ai_call_turns` |
| Resumo | `data.analysis.transcript_summary` | Traduzido para PT-BR e salvo em `ai_calls.summary` |
| Resultado | `data.analysis.call_successful` | Define `outcome`: qualified / not_qualified / completed |
| Dados coletados | `data.analysis.data_collection_results` | Salvo em `ai_calls.collected_fields` |
| Duração | `data.metadata.call_duration_secs` | Salvo em `ai_calls.duration_seconds` |
| Call SID | `data.metadata.phone_call.call_sid` | Vincula com registro Twilio |
| Conversation ID | `data.conversation_id` | Usado para buscar áudio via API |

### Tradução automática do resumo

O resumo gerado pelo ElevenLabs vem em inglês por padrão. O EduFlow traduz automaticamente para PT-BR usando GPT-4o-mini:

```python
translation = await openai_client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "Traduza o texto para português brasileiro..."},
        {"role": "user", "content": summary_text}
    ],
)
```

### Ações pós-chamada

Após salvar os dados, o webhook automaticamente:
1. **Atualiza o CRM** — move o lead no pipeline conforme o outcome
2. **Aciona o Orquestrador** — dispara agentes de follow-up se necessário
3. **Atualiza a campanha** — marca o item como concluído se veio de uma campanha

---

## 10. Fluxo Completo de uma Ligação

```
1. DISPARO
   └── EduFlow cria registro em ai_calls (status: pending)
   └── Twilio.calls.create() → liga para o lead

2. ATENDIMENTO
   └── Lead atende → Twilio conecta ao ElevenLabs Agent
   └── ElevenLabs injeta Dynamic Variables
   └── Agente executa greeting e inicia SPIN

3. CONVERSA
   └── Lead fala → ElevenLabs STT transcreve
   └── GPT-4o processa e gera resposta
   └── ElevenLabs TTS sintetiza voz
   └── Agente chama tools conforme necessário:
       ├── qualify_lead → POST /api/... → CRM atualizado
       ├── schedule_meeting → POST /api/... → Reunião criada
       └── end_call → Ligação encerrada

4. PÓS-CHAMADA
   └── ElevenLabs envia webhook para EduFlow
   └── EduFlow salva: transcrição, resumo (PT-BR), dados coletados
   └── Lead movido para estágio correto no pipeline
   └── Orquestrador decide próxima ação
```

---

## 11. Banco de Dados — Tabelas Relacionadas

### `ai_calls` — registro principal de cada chamada

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL PK | ID interno |
| tenant_id | INTEGER | Tenant proprietário |
| lead_name | VARCHAR | Nome do lead |
| to_number | VARCHAR | Número chamado |
| from_number | VARCHAR | Número do agente |
| twilio_call_sid | VARCHAR | ID da chamada no Twilio |
| direction | VARCHAR | outbound / inbound |
| status | VARCHAR | pending / completed / failed |
| outcome | VARCHAR | qualified / not_qualified / completed |
| summary | TEXT | Resumo em PT-BR (traduzido) |
| collected_fields | JSONB | Dados coletados durante a conversa |
| duration_seconds | INTEGER | Duração total |
| total_turns | INTEGER | Número de turnos |
| source | VARCHAR | elevenlabs / twilio |
| campaign | VARCHAR | conversation_id do ElevenLabs |
| started_at | TIMESTAMP | Início da ligação |
| ended_at | TIMESTAMP | Fim da ligação |

### `ai_call_turns` — turnos da transcrição

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL PK | ID interno |
| call_id | INTEGER FK | Chamada vinculada |
| role | VARCHAR | user / agent |
| text | TEXT | Conteúdo da fala |
| fsm_state | VARCHAR | Estado da conversa |
| total_latency_ms | INTEGER | Latência do turno |
| created_at | TIMESTAMP | Timestamp do turno |

### `agent_tools` — tools configuradas por tenant

_(ver seção 6)_

### `agent_personality` — personalidade por tenant

_(ver seção 7)_

---

## 12. Configurações de Infraestrutura

### Evolution API (WhatsApp)

| Instância | Status | groupsIgnore | Webhook ativo |
|-----------|--------|-------------|---------------|
| `ia` | 🟢 open | false | ✅ |
| `gv_sports_comercial` | 🟢 open | false | ✅ |
| `whatsapp_comercial` | 🟢 open | true | ⚪ |

### Webhook URL por instância

```
https://portal.eduflowia.com/api/evolution/webhook/{instance_name}
```

### Eventos configurados no webhook

- `MESSAGES_UPSERT`
- `MESSAGES_UPDATE`
- `MESSAGES_DELETE`
- `SEND_MESSAGE`
- `CONNECTION_UPDATE`
- `GROUPS_UPSERT`
- `GROUP_UPDATE`
- `GROUP_PARTICIPANTS_UPDATE`

### IPs estáticos do ElevenLabs (para whitelist)

| Região | IPs |
|--------|-----|
| US | 34.67.146.145, 34.59.11.47 |
| EU | 35.204.38.71, 34.147.113.54 |
| Ásia | 35.185.187.110, 35.247.157.189 |

---

## 13. Checklist de Implementação

### Voice AI — ElevenLabs

- [x] Integração Twilio + ElevenLabs para chamadas outbound
- [x] Post-Call Webhook recebendo e salvando dados
- [x] Transcrição salva por turnos em `ai_call_turns`
- [x] Tradução automática do resumo para PT-BR
- [x] Dashboard com métricas (total, atendidas, score, duração)
- [x] Lista de chamadas com filtros por outcome
- [x] Detalhe da chamada com transcrição e áudio
- [x] Campanhas outbound com worker automático

### Aba Agente

- [x] Sub-aba Ferramentas com tools padrão
- [x] Toggle ativar/desativar por tool
- [x] Modal de nova ferramenta customizada
- [x] Dropdown de estágio pós-agendamento na tool `schedule_meeting`
- [x] Sub-aba Personalidade conectada ao ElevenLabs
- [x] Dropdown de seleção de agente
- [x] Carregamento de prompt e voz em tempo real
- [x] Salvamento direto no ElevenLabs via API
- [x] Sub-aba Variáveis Dinâmicas documentadas

### WhatsApp Groups

- [x] `groupsIgnore: false` nas instâncias ativas
- [x] Evento `GROUPS_UPSERT` ativado nos webhooks
- [x] Campo `contact_wa_id` expandido para `VARCHAR(100)`
- [x] Nome do grupo buscado na Evolution API
- [x] Mensagens de grupo aparecendo nas conversas

---

## 14. Próximos Passos

### Alta prioridade

- [ ] **Testar ligação completa** — verificar resumo em PT-BR, dados coletados e transcrição após chamada real
- [ ] **Conectar tool `schedule_meeting`** ao Google Calendar para criar eventos automaticamente
- [ ] **Conectar tool `qualify_lead`** ao pipeline do CRM para mover leads automaticamente

### Média prioridade

- [ ] **Monitor de Post-Call melhorado** — exibir análise de sentimento por turno
- [ ] **Alerta de lead quente** — notificação push quando agente classificar lead como HOT
- [ ] **Relatório semanal automático** — envio por e-mail toda segunda-feira

### Futuro

- [ ] **IVR multi-agente** — roteamento por tecla para agentes especializados
- [ ] **Batch Calling** — upload de lista CSV para campanhas em massa
- [ ] **Integração Meta Lead Forms** — leads de anúncios entrando direto no pipeline
- [ ] **WhatsApp Agent nativo ElevenLabs** — como complemento à Evolution API

---

*Documento gerado em 01/04/2026 — EduFlow Hub*
