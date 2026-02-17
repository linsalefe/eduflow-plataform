# 📞 EduFlow Voice AI

Sistema de ligações automáticas com IA integrado ao EduFlow Hub.

## Como Funciona

```
Lead entra (LP/CRM)
       │
       ▼
  POST /api/voice-ai/leads/new
       │
       ▼
  Twilio cria chamada ──► Lead atende
       │                        │
       ▼                        ▼
  TwiML conecta           Media Stream (WSS)
  Media Stream                  │
       │              ┌─────────┴─────────┐
       ▼              │                   │
  STT (Whisper)    Áudio Lead ──► Texto   │
       │              │                   │
       ▼              │                   │
  LLM (GPT-4o)    Decisão + Resposta     │
       │              │                   │
       ▼              │                   │
  TTS (OpenAI)    Texto ──► Áudio IA     │
       │              │                   │
       ▼              └─────────┬─────────┘
  Áudio volta                   │
  pro Twilio              Barge-in?
       │              (lead interrompe)
       ▼
  FSM controla estados:
  OPENING → CONTEXT → QUALIFY → HANDLE_OBJECTION
                                      │
                              ┌───────┼───────┐
                              ▼       ▼       ▼
                          SCHEDULE  TRANSFER  FOLLOW_UP
                              │       │       │
                              └───────┼───────┘
                                      ▼
                                    CLOSE
                                      │
                              ┌───────┼───────┐
                              ▼       ▼       ▼
                          Atualiza  Agenda   Envia
                           CRM    Calendar  WhatsApp
```

## Estrutura de Arquivos

```
backend/app/voice_ai/
├── __init__.py
├── config.py              # Variáveis de ambiente e constantes
├── models.py              # Tabelas: ai_calls, ai_call_turns, etc.
├── fsm.py                 # Máquina de estados (OPENING→CLOSE)
├── llm_contract.py        # Input/Output estruturado do LLM
├── voice_pipeline.py      # WebSocket: STT→LLM→TTS + barge-in
├── routes.py              # Endpoints da API
├── crm_adapter.py         # Integração CRM (Exact + interno)
├── scheduler_adapter.py   # Agendamento (Calendar + WhatsApp)
└── qa_engine.py           # Avaliação automática de qualidade

backend/
├── migration_voice_ai.sql # SQL para criar tabelas
└── .env.voice-ai          # Template de variáveis de ambiente

frontend/src/app/voice-ai/
└── page.tsx               # Dashboard de monitoramento
```

## Setup Rápido

### 1. Banco de Dados
```bash
psql -d eduflow_db -f backend/migration_voice_ai.sql
```

### 2. Variáveis de Ambiente
Copie o conteúdo de `.env.voice-ai` para o seu `.env` e preencha os valores.

### 3. Ngrok (desenvolvimento)
```bash
ngrok http 8001
# Copie a URL https e coloque em BASE_URL no .env
```

### 4. Configurar Twilio
No console do Twilio, configure o número de telefone:
- **Voice URL**: `https://SEU-NGROK/api/voice-ai/twilio/answer` (POST)
- **Status Callback**: `https://SEU-NGROK/api/voice-ai/twilio/status` (POST)

### 5. Rodar
```bash
cd backend
uvicorn app.main:app --reload --port 8001
```

## Endpoints da API

### Entrada de Leads
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/voice-ai/leads/new` | Recebe lead e dispara chamada |
| POST | `/api/voice-ai/calls/manual` | Disparo manual (autenticado) |

### Twilio Callbacks
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/voice-ai/twilio/answer` | TwiML quando atende |
| POST | `/api/voice-ai/twilio/status` | Status da chamada |
| POST | `/api/voice-ai/twilio/recording-status` | Gravação pronta |
| WS | `/api/voice-ai/stream` | Media Stream (STT/TTS) |

### Gerenciamento
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/voice-ai/calls` | Lista chamadas (filtros) |
| GET | `/api/voice-ai/calls/{id}` | Detalhe + transcrição |
| POST | `/api/voice-ai/calls/{id}/transfer` | Transferir para closer |
| POST | `/api/voice-ai/calls/{id}/end` | Encerrar chamada |
| GET | `/api/voice-ai/dashboard` | Métricas e KPIs |
| GET | `/api/voice-ai/scripts` | Lista roteiros |
| POST | `/api/voice-ai/scripts` | Criar roteiro |

## FSM (Máquina de Estados)

A FSM garante que a IA **nunca "viaje"** e colete todos os dados necessários:

| Estado | O que faz | Campos obrigatórios |
|--------|-----------|-------------------|
| OPENING | Apresentação + permissão | - |
| CONTEXT | Confirma interesse/curso | confirmed_interest |
| QUALIFY | Coleta dados do lead | objetivo, prazo, disponibilidade, forma_pagamento |
| HANDLE_OBJECTION | Trata objeções | - |
| SCHEDULE | Agenda reunião | data_agendamento, hora_agendamento |
| WARM_TRANSFER | Transfere pro closer | handoff_reason |
| FOLLOW_UP | Encerra com WhatsApp | - |
| CLOSE | Despedida | - |

## Contrato do LLM

O LLM recebe input estruturado e **deve** retornar JSON:

```json
{
  "say": "Texto curto para falar (1-2 frases)",
  "ask": "Pergunta, se houver",
  "action": "continue|advance|handle_objection|schedule|transfer|follow_up|end_call",
  "fields_update": {"campo": "valor extraído"},
  "confidence": 0.85,
  "handoff_reason": null,
  "objection_detected": null,
  "next_state_suggestion": "QUALIFY"
}
```

## Score de Qualificação (0-100)

| Campo | Peso |
|-------|------|
| Confirmou interesse | 20 |
| Objetivo claro | 15 |
| Prazo definido | 15 |
| Disponibilidade | 15 |
| Forma de pagamento | 20 |
| Sem objeções | 15 |

## Integração com LP (Landing Pages)

Quando `VOICE_AI_ENABLED=true`, o submit da landing page dispara automaticamente uma chamada:
```
Lead preenche LP → POST /lp/{slug}/submit → Voice AI liga em ~5s
```

## Retry Automático

Se o lead não atender:
- 1ª tentativa: imediata
- 2ª tentativa: 5 minutos depois
- 3ª tentativa: 30 minutos depois
- Máximo: 3 tentativas

## Custos Estimados

| Item | Custo aprox. |
|------|-------------|
| Twilio (voz BR) | ~R$ 0,15/min |
| OpenAI Whisper (STT) | ~$0,006/min |
| OpenAI GPT-4o (LLM) | ~$0,01/chamada |
| OpenAI TTS | ~$0,015/1000 chars |
| **Total por chamada (3min)** | **~R$ 0,70** |
