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
| OpenAI Realtime API | ✅ Conecta | Sessão configurada com sucesso |
| Greeting (saudação inicial) | ✅ Funciona | IA fala com voz natural (coral) |
| CRM Adapter | ✅ Corrigido | Fix channel_id NULL |
| Pipeline websockets v13 | ✅ Corrigido | Compatível com v13+ |

---

## ❌ O que falta concluir

### 🔴 Prioridade Alta — Conversa Bidirecional

A IA **fala o greeting** mas **trava após a primeira fala do lead**. A conversa não avança.

**Diagnóstico provável:**
- O relay Twilio→OpenAI está enviando áudio, mas o Realtime API pode não estar processando corretamente os turnos após o greeting
- Possível conflito entre o `response.create` do greeting e o VAD do server-side
- O `_relay_openai_to_twilio` pode estar perdendo eventos de resposta

**Arquivos envolvidos:**
- `backend/app/voice_ai/voice_pipeline.py` → relay bidirecional
- `backend/app/voice_ai/routes.py` → websocket handler

**O que testar:**
1. Ativar logs verbosos no `_relay_openai_to_twilio` para ver TODOS os eventos recebidos
2. Verificar se o `input_audio_buffer.append` está sendo recebido pelo OpenAI
3. Verificar se o server VAD detecta a fala do lead (`input_audio_buffer.speech_started`)
4. Verificar se o `response.done` do greeting finaliza antes do lead falar

**Possíveis soluções:**
- Adicionar `await asyncio.sleep(0.5)` entre `response.create` do greeting e início do relay
- Verificar se o `message` do websocket vem como `str` ou `bytes` (websockets v13 pode mudar)
- Logar todos os `etype` recebidos do OpenAI para mapear o fluxo real

---

### 🟡 Prioridade Média

| Tarefa | Descrição | Arquivo |
|--------|-----------|---------|
| Voz em Português | Forçar idioma pt-BR no Realtime API (pode responder em inglês) | `voice_pipeline.py` |
| Barge-in robusto | Testar se o `clear` do Twilio realmente para o áudio | `voice_pipeline.py` |
| Function Calling | Validar se `update_lead_fields`, `change_state`, `end_call` funcionam | `voice_pipeline.py` |
| Timeout da chamada | Verificar se FSM_MAX_CALL_DURATION_SEC (300s) está sendo respeitado | `voice_pipeline.py` |
| Retry automático | Testar se re-tentativas (5min, 30min, 120min) disparam corretamente | `routes.py` |
| Gravação | Verificar se recording_url está sendo salva após a chamada | `routes.py` |

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

## Credenciais

| Serviço | Credencial |
|---------|------------|
| **Admin Login** | linsalefe@gmail.com / SUA_SENHA_ADMIN |
| **PostgreSQL** | eduflow / SUA_SENHA_DB |
| **Twilio Phone** | +553122980172 (São José do Rio Preto, SP) |

---

## Custos por Chamada (estimativa v3)

| Item | Custo |
|------|-------|
| Twilio voz (BR) | ~R$ 0,15/min |
| OpenAI Realtime (input áudio) | ~$0.06/min |
| OpenAI Realtime (output áudio) | ~$0.24/min |
| OpenAI GPT-4o-mini (resumo) | ~$0.01/chamada |
| **Total por chamada de 3min** | **~$1.00 (~R$ 5,50)** |

> Para reduzir custo, trocar para `gpt-4o-mini-realtime-preview-2024-12-17`.

---

## Histórico de Bugs Corrigidos

| # | Bug | Causa | Fix |
|---|-----|-------|-----|
| 1 | Dashboard 500 error | `func.count().filter()` incompatível com PostgreSQL GROUP BY | Trocado por `func.sum(case(...))`, depois por raw SQL |
| 2 | channel_id NULL crash | `AIConversationSummary` criado sem channel_id (NOT NULL) | Fallback para primeiro Channel ativo |
| 3 | TypeScript build error | CSS property `ringColor` inválida no pipeline/page.tsx | Trocado por `boxShadow` |
| 4 | Suspense boundary | `useSearchParams()` sem `<Suspense>` no callback/page.tsx | Adicionado wrapper |
| 5 | IA muda (11s silêncio) | OpenAI TTS demorava 11s; barge-in cortava o greeting | Migrado para Realtime API (v3) |
| 6 | websockets v13 crash | `ClientConnection.open` não existe no websockets v13+ | Substituído por try/except helper |
| 7 | from_number como integer | `call.from_number` (string) inserido em campo integer | Corrigido para `channel_id=None` com fallback |

---

## Como Debugar

### Logs do Backend
```bash
sudo journalctl -u eduflow-backend -f | grep -i "realtime\|pipeline\|lead\|greeting\|fsm\|error\|❌\|✅\|🎙️\|🤖\|📝\|🔄\|📞"
```

### Testar TTS/STT
```bash
cd ~/eduflow/backend
source venv/bin/activate
export $(grep -v '^#' .env | xargs)
python3 test_tts.py
```

### Disparar Chamada de Teste
```bash
TOKEN=$(curl -s -X POST http://localhost:8001/api/auth/login -H "Content-Type: application/json" -d '{"email":"linsalefe@gmail.com","password":"SUA_SENHA_ADMIN"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl -s -X POST http://localhost:8001/api/voice-ai/leads/new -H "Content-Type: application/json" -d '{"name":"Teste","phone":"+55SEU_NUMERO","course":"Administração","source":"debug"}' | python3 -m json.tool
```

### Ver Detalhe de uma Chamada
```bash
curl -s http://localhost:8001/api/voice-ai/calls/ID -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

---

## Endpoints da API

### Entrada de Leads
| Método | Endpoint | Auth | Descrição |
|--------|----------|------|-----------|
| POST | `/api/voice-ai/leads/new` | Não | Recebe lead e dispara chamada |
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