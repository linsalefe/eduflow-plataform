# 📞 EduFlow Voice AI — Módulo de Ligações com IA

Sistema de ligações automáticas com IA para qualificação de leads, integrado ao EduFlow Hub.

---

## ✅ O que está funcionando

| Componente | Status | Observação |
|------------|--------|------------|
| Servidor AWS Lightsail | ✅ Operacional | Ubuntu 22.04, 2GB RAM |
| PostgreSQL + Migrations | ✅ Operacional | 5 tabelas do Voice AI criadas |
| Backend FastAPI | ✅ Operacional | Uvicorn na porta 8001 |
| Frontend Next.js | ✅ Operacional | Build de produção na porta 3000 |
| Nginx + SSL | ✅ Operacional | portal.eduflowia.com |
| Login/Auth | ✅ Operacional | JWT funcionando |
| Dashboard `/api/voice-ai/dashboard` | ✅ Operacional | Métricas e KPIs |
| Twilio (disparo de chamadas) | ✅ Operacional | Número +553122980172 |
| Twilio Webhooks | ✅ Operacional | answer, status, recording |
| OpenAI Realtime API | ✅ Conecta + Funciona | gpt-4o-realtime-preview-2024-12-17 |
| Greeting (saudação inicial) | ✅ Funciona | IA fala com voz natural (coral) |
| Conversa bidirecional | ✅ Funciona | Lead fala ↔ IA responde em tempo real |
| Transcrição em tempo real | ✅ Funciona | input_audio_transcription funcionando |
| Function Calling | ✅ Funciona | update_lead_fields, change_state, end_call |
| FSM (Máquina de Estados) | ✅ Funciona | OPENING→CONTEXT→QUALIFY→SCHEDULE→CLOSE |
| Score de qualificação | ✅ Funciona | Score 0-100 calculado automaticamente |
| Resumo automático | ✅ Funciona | Gerado ao final da chamada |
| Atualização CRM | ✅ Funciona | Status e resumo atualizados no banco |
| CRM Adapter | ✅ Corrigido | Fix channel_id NULL |
| Pipeline websockets v13 | ✅ Corrigido | Compatível com v13+ |
| RAG (snippets de contexto) | ✅ Funciona | Com fallback se quota excedida |
| VAD (Voice Activity Detection) | ✅ Funciona | threshold 0.8, silence 800ms |
| Barge-in | ✅ Funciona | IA para quando lead interrompe |

---

## ❌ O que falta concluir

### 🔴 Prioridade Alta — Latência do Greeting

A IA **funciona completamente** mas há um **delay de ~10-16 segundos** entre o lead atender e a IA começar a falar.

**Diagnóstico:**
- Media Stream conecta em T+0s
- Queries no banco (AICall, CallSession, VoiceScript, RAG) levam ~8-12s
- Conexão OpenAI Realtime API leva ~2-3s (sequencial após DB)
- Greeting só dispara após tudo completar

**Tentativas já feitas:**
- ❌ Conexão OpenAI em paralelo com DB → greeting disparava antes do relay estar ativo, áudio se perdia
- ❌ Greeting após relay → áudio acumulado do Twilio ativava VAD e cancelava greeting
- ❌ `input_audio_buffer.clear` antes do greeting → não resolveu
- ❌ Modelo `gpt-4o-mini-realtime-preview` → qualidade muito inferior, descartado

**Próximas abordagens a testar:**
1. Otimizar queries do banco (índices, cache, reduzir JOINs)
2. Enviar `input_audio_buffer.clear` + desabilitar VAD temporariamente durante greeting
3. Usar `asyncio.gather()` para paralelizar todas as queries DB
4. Conectar OpenAI primeiro, iniciar relay, só depois fazer DB queries em background
5. Pre-conectar OpenAI no boot da aplicação (connection pool)

---

### 🟡 Prioridade Média

| Tarefa | Status | Descrição |
|--------|--------|-----------|
| Voz em Português | ⚠️ Funciona parcial | Responde em PT-BR mas pode misturar inglês em edge cases |
| Timeout da chamada | 🔲 Não testado | FSM_MAX_CALL_DURATION_SEC (300s) |
| Retry automático | 🔲 Não testado | Re-tentativas (5min, 30min, 120min) |
| Gravação | 🔲 Não testado | recording_url após chamada |
| Auto recharge OpenAI | ✅ Configurado | Evitar interrupção por falta de créditos |

---

### 🟢 Prioridade Baixa

| Tarefa | Descrição | Arquivo |
|--------|-----------|---------|
| QA Engine | Avaliação automática pós-chamada | `qa_engine.py` |
| Scheduler Adapter | Criar evento no Google Calendar após agendamento | `scheduler_adapter.py` |
| WhatsApp Follow-up | Enviar mensagem de follow-up após a ligação | `scheduler_adapter.py` |
| Exact Spotter Timeline | Postar resumo na timeline do lead | `crm_adapter.py` |
| Dashboard Frontend | Gráficos, lista de chamadas, player de gravação | `frontend/src/app/voice-ai/page.tsx` |
| Scripts/Roteiros | CRUD de roteiros personalizados via interface | `routes.py` + frontend |

---

## Arquitetura

```
Internet → Nginx (443/SSL) → Frontend Next.js (3000) + Backend FastAPI (8001)
                                   ↓
                              PostgreSQL (5432)
                                   ↓
                         ┌─────────┴─────────┐
                         │   Voice AI Tables  │
                         │  ai_calls          │
                         │  ai_call_turns     │
                         │  ai_call_events    │
                         │  voice_scripts     │
                         │  ai_call_qa        │
                         └─────────┬─────────┘
                                   ↓
                    ┌──────────────┼──────────────┐
                    ↓              ↓              ↓
              Twilio API    OpenAI Realtime    Exact Spotter
           (chamadas voz)   (STT+LLM+TTS)      (CRM)
```

### Fluxo da Chamada (v3 — Realtime API)

```
1. POST /api/voice-ai/leads/new
2. Backend cria registro em ai_calls (status: pending)
3. Twilio.calls.create() → liga para o lead
4. Lead atende → Twilio chama /twilio/answer
5. TwiML retorna <Connect><Stream> → WebSocket bidirecional
6. Pipeline conecta ao OpenAI Realtime API via WSS
7. Realtime API gerencia: STT + LLM + TTS + VAD + Barge-in
8. Áudio relay: Twilio ↔ OpenAI (g711_ulaw 8kHz direto)
9. Function calls: coleta dados, muda estado FSM
10. Chamada encerra → gera resumo, score, atualiza CRM
```

---

## Exemplo de Chamada Completa (18/02/2026)

```
🎙️ IA: "Oi, Teste Debug! Tudo bom? Aqui é a Nat, da equipe de atendimento do CENAT. Pode falar rapidinho?"
🗣️ Lead: "Posso ser."
🎙️ IA: "É rapidinho! Então, vi aqui que você demonstrou interesse no curso de Administração, né? Queria saber o que te motivou?"
🗣️ Lead: "Olha, tem uma empresa e eu gostaria de gerir ela melhor."
🎙️ IA: "Entendi, super bacana! E você tá pensando em começar quando?"
🗣️ Lead: "Olha, o negócio vai começar a partir do mês que vem."
🎙️ IA: "Massa! E você tem alguma preferência de horário pra estudar?"
🗣️ Lead: "Eu preferia a noite."
🎙️ IA: "Beleza, anotado! Sobre o pagamento, você prefere parcelar, pagar à vista?"
🗣️ Lead: "Gosto de... no Pix."
🎙️ IA: "Perfeito! Posso marcar uma conversa com nossa consultora?"
🗣️ Lead: "Pode ser amanhã, às 10 da manhã."
🎙️ IA: "Agendado! Amanhã, às 10h. A nossa consultora vai te ligar!"

📊 Score: 100/100 | Status: qualified | Duração: 135s
```

---

## Custos por Chamada (dados reais)

### Preços Oficiais (Fev/2026)

**OpenAI Realtime API — gpt-4o-realtime-preview (por 1M tokens):**

| Tipo | Input | Output |
|------|-------|--------|
| Audio | $40.00 | $80.00 |
| Text | $5.00 | $20.00 |

**Twilio Voice — Brasil:**

| Tipo | Custo |
|------|-------|
| Chamada para celular BR | ~$0.14/min |
| Número local BR | ~$2-5/mês |

### Estimativa por Minuto

| Componente | Custo/min |
|------------|-----------|
| Twilio (chamada BR) | ~$0.14 |
| OpenAI (áudio in+out+text) | ~$0.20 |
| **Total** | **~$0.34/min** |

### Estimativa por Chamada (3 min média)

| Cenário | Custo/chamada | Custo/dia (100 chamadas) |
|---------|---------------|--------------------------|
| Modelo atual (gpt-4o-realtime) | ~$1.02 (~R$6) | ~$102 (~R$612) |
| Modelo mini (descartado — baixa qualidade) | ~$0.57 (~R$3.40) | ~$57 (~R$342) |

> ⚠️ `gpt-4o-mini-realtime-preview` foi testado e descartado por perda significativa de qualidade na voz e inteligência da conversa.

---

## Estrutura de Arquivos

```
backend/app/voice_ai/
├── __init__.py
├── config.py              # Variáveis de ambiente e constantes
├── models.py              # Tabelas: ai_calls, ai_call_turns, etc.
├── fsm.py                 # Máquina de estados (OPENING→CLOSE)
├── llm_contract.py        # Contrato LLM + geração de resumo
├── voice_pipeline.py      # OpenAI Realtime API relay bidirecional
├── routes.py              # Endpoints da API + WebSocket handler
├── crm_adapter.py         # Integração CRM (Exact + interno)
├── scheduler_adapter.py   # Agendamento (Calendar + WhatsApp)
└── qa_engine.py           # Avaliação automática de qualidade
```

---

## Configuração do Servidor

| Item | Valor |
|------|-------|
| **IP** | 44.211.127.84 |
| **Domínio** | portal.eduflowia.com |
| **SSL** | Let's Encrypt |
| **SO** | Ubuntu 22.04 |
| **RAM** | 2GB (Lightsail $12/mês) |
| **Python** | 3.10 |
| **Node** | 20 |
| **PostgreSQL** | 14 |

### Serviços Systemd

```bash
sudo systemctl status eduflow-backend   # FastAPI (porta 8001)
sudo systemctl status eduflow-frontend  # Next.js (porta 3000)
```

### Variáveis de Ambiente (.env)

```env
DATABASE_URL=postgresql+asyncpg://eduflow:SUA_SENHA_DB@localhost:5432/eduflow_db
OPENAI_API_KEY=SUA_OPENAI_KEY
TWILIO_ACCOUNT_SID=SEU_TWILIO_SID
TWILIO_AUTH_TOKEN=SEU_TWILIO_TOKEN
TWILIO_PHONE_NUMBER=+553122980172
BASE_URL=https://portal.eduflowia.com
VOICE_AI_ENABLED=true
VOICE_AI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17
VOICE_AI_REALTIME_VOICE=coral
```

### Twilio Webhooks

| Evento | URL | Método |
|--------|-----|--------|
| A call comes in | `https://portal.eduflowia.com/api/voice-ai/twilio/answer` | POST |
| Call status changes | `https://portal.eduflowia.com/api/voice-ai/twilio/status` | POST |

---

## Endpoints da API

### Entrada de Leads
| Método | Endpoint | Auth | Descrição |
|--------|----------|------|-----------|
| POST | `/api/voice-ai/leads/new` | Sim | Recebe lead e dispara chamada |
| POST | `/api/voice-ai/calls/manual` | Sim | Disparo manual |

### Twilio Callbacks
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/voice-ai/twilio/answer` | TwiML quando atende |
| POST | `/api/voice-ai/twilio/status` | Status da chamada |
| POST | `/api/voice-ai/twilio/recording-status` | Gravação pronta |
| WS | `/api/voice-ai/stream` | Media Stream (Realtime API relay) |

### Gerenciamento
| Método | Endpoint | Auth | Descrição |
|--------|----------|------|-----------|
| GET | `/api/voice-ai/calls` | Sim | Lista chamadas |
| GET | `/api/voice-ai/calls/{id}` | Sim | Detalhe + transcrição |
| POST | `/api/voice-ai/calls/{id}/transfer` | Sim | Transferir para closer |
| POST | `/api/voice-ai/calls/{id}/end` | Sim | Encerrar chamada |
| GET | `/api/voice-ai/dashboard` | Sim | Métricas e KPIs |
| GET | `/api/voice-ai/scripts` | Sim | Lista roteiros |
| POST | `/api/voice-ai/scripts` | Sim | Criar roteiro |

---

## FSM (Máquina de Estados)

```
OPENING → CONTEXT → QUALIFY → HANDLE_OBJECTION
                                      │
                              ┌───────┼───────┐
                              ▼       ▼       ▼
                          SCHEDULE  TRANSFER  FOLLOW_UP
                              │       │       │
                              └───────┼───────┘
                                      ▼
                                    CLOSE
```

| Estado | O que faz | Campos obrigatórios |
|--------|-----------|---------------------|
| OPENING | Apresentação + permissão | — |
| CONTEXT | Confirma interesse/curso | confirmed_interest |
| QUALIFY | Coleta dados do lead | objetivo, prazo, disponibilidade, forma_pagamento |
| HANDLE_OBJECTION | Trata objeções | — |
| SCHEDULE | Agenda reunião | data_agendamento, hora_agendamento |
| WARM_TRANSFER | Transfere pro closer | handoff_reason |
| FOLLOW_UP | Encerra com WhatsApp | — |
| CLOSE | Despedida | — |

---

## Score de Qualificação (0-100)

| Campo | Peso |
|-------|------|
| Confirmou interesse | 20 |
| Objetivo claro | 15 |
| Prazo definido | 15 |
| Disponibilidade | 15 |
| Forma de pagamento | 20 |
| Sem objeções | 15 |

---

## Histórico de Bugs Corrigidos

| # | Bug | Causa | Fix |
|---|-----|-------|-----|
| 1 | Dashboard 500 error | `func.count().filter()` incompatível com PostgreSQL GROUP BY | Trocado por raw SQL |
| 2 | channel_id NULL crash | `AIConversationSummary` criado sem channel_id (NOT NULL) | Fallback para primeiro Channel ativo |
| 3 | TypeScript build error | CSS property `ringColor` inválida | Trocado por `boxShadow` |
| 4 | Suspense boundary | `useSearchParams()` sem `<Suspense>` | Adicionado wrapper |
| 5 | IA muda (11s silêncio) | OpenAI TTS demorava 11s | Migrado para Realtime API (v3) |
| 6 | websockets v13 crash | `ClientConnection.open` não existe no v13+ | Substituído por try/except |
| 7 | from_number como integer | Inserido em campo integer | Corrigido para `channel_id=None` com fallback |
| 8 | Greeting truncado | max_response_output_tokens muito baixo | Aumentado para 4096 |
| 9 | VAD muito sensível | Ruído ativava VAD e cortava greeting | threshold 0.8, silence 800ms |
| 10 | Sem créditos OpenAI | Saldo -$0.08 bloqueava API | Adicionado créditos + auto recharge |
| 11 | Greeting sem áudio | relay não ativo quando greeting disparava | Greeting antes do relay (versão estável) |

---

## Como Debugar

### Logs do Backend
```bash
sudo journalctl -u eduflow-backend -f | grep -E "📞|✅|❌|🎙️|🤖|📡|Stream|Realtime|greeting|RAG|error"
```

### Disparar Chamada de Teste
```bash
TOKEN=$(curl -s -X POST http://localhost:8001/api/auth/login -H "Content-Type: application/json" -d '{"email":"linsalefe@gmail.com","password":"SUA_SENHA_ADMIN"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -X POST http://localhost:8001/api/voice-ai/leads/new \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Teste","phone":"+55SEU_NUMERO","course":"Administração","source":"debug"}' | python3 -m json.tool
```

### Monitorar Logs Filtrados
```bash
sudo journalctl -u eduflow-backend -n 50 --no-pager | grep -E "📞|✅|❌|🎙️|🤖|📡|Traceback|Error"
```

### Ver Detalhe de uma Chamada
```bash
curl -s http://localhost:8001/api/voice-ai/calls/ID -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

---

## Git — Commits Importantes

| Hash | Descrição |
|------|-----------|
| `0706814` | ✅ **Versão estável** — rag_snippets fix, conversa funcional |
| `a7f498a` | pre_connect + max_tokens 4096 + VAD 0.8 |
| `effffad` | Ajuste no voice pipeline |

> Para reverter para versão estável: `git reset --hard 0706814`