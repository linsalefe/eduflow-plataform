# Voice AI Inbound — Agentes de Voz para Atendimento de Chamadas

> **EduFlow Hub** | Versão 1.0 | Março 2026 | Confidencial

---

## Sumário

1. [O que é](#1-o-que-é)
2. [Arquitetura](#2-arquitetura)
3. [Stack Tecnológico](#3-stack-tecnológico)
4. [Estrutura de Arquivos](#4-estrutura-de-arquivos)
5. [Banco de Dados](#5-banco-de-dados)
6. [Backend — Implementação](#6-backend--implementação)
7. [Frontend — Implementação](#7-frontend--implementação)
8. [ElevenLabs — Configuração dos Agentes](#8-elevenlabs--configuração-dos-agentes)
9. [Twilio — Configuração](#9-twilio--configuração)
10. [Como Testar](#10-como-testar)
11. [Como Adicionar Novos Agentes](#11-como-adicionar-novos-agentes)
12. [Como Replicar em Outros Projetos](#12-como-replicar-em-outros-projetos)
13. [Custos](#13-custos)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. O que é

Sistema de atendimento telefônico por IA que permite clientes ligarem para um número Twilio e serem atendidos por agentes de voz inteligentes. Um menu IVR (digite 1, 2, etc.) roteia a chamada para o agente correto.

### Agentes ativos

| Tecla IVR | Agente | Nome | Função |
|-----------|--------|------|--------|
| 1 | Suporte | Lia | Responde dúvidas sobre como usar o CRM |
| 2 | Retenção | Maria | Atende clientes insatisfeitos ou pensando em cancelar |

### Diferenciais

- Atendimento 24/7 sem custo de equipe humana
- Latência inferior a 2 segundos por turno
- Transcrição completa salva no banco
- Dashboard com métricas em tempo real
- Escalável: adicionar novo agente é só configuração, sem código novo

---

## 2. Arquitetura

```
Cliente liga pro número Twilio (+553122980172)
        ↓
Twilio chama webhook: /api/voice-ai/twilio/answer
        ↓
Backend detecta Direction == "inbound"
        ↓
Redireciona para: /api/voice-inbound/answer
        ↓
IVR toca: "Digite 1 para suporte, 2 para seu plano"
        ↓
Cliente digita → /api/voice-inbound/gather
        ↓
Backend busca agent_id na tabela voice_agents
        ↓
Chama ElevenLabs Register Call API
        ↓
ElevenLabs retorna TwiML → Backend devolve ao Twilio
        ↓
ElevenLabs gerencia toda a conversa (STT + LLM + TTS)
        ↓
Chamada encerra → ElevenLabs envia webhook pós-chamada
        ↓
/api/voice-inbound/post-call-webhook salva no banco
        ↓
Dashboard frontend exibe histórico + métricas
```

### Diferença do SDR (outbound)

| Aspecto | SDR (Outbound) | Atendimento (Inbound) |
|---------|---------------|----------------------|
| Quem inicia | EduFlow liga pro lead | Cliente liga pro EduFlow |
| Integração ElevenLabs | `outbound_call()` | `register_call()` via API REST |
| IVR | Não tem | Menu com opções |
| Roteamento | Direto pro agente SDR | IVR → agente baseado no dígito |
| Webhook Twilio | ElevenLabs configura | Nosso servidor recebe e roteia |

---

## 3. Stack Tecnológico

| Componente | Tecnologia |
|-----------|-----------|
| Telefonia | Twilio Voice |
| IA Conversacional | ElevenLabs Agents (Register Call) |
| STT | ElevenLabs Scribe Realtime v2.1 |
| LLM | GPT-4.1 Mini (via ElevenLabs) |
| TTS | ElevenLabs (voz Marianne, μ-law 8000 Hz) |
| Backend | FastAPI + SQLAlchemy (async) |
| Banco | PostgreSQL |
| Frontend | Next.js + TypeScript + shadcn/ui |
| Deploy | AWS Lightsail + Nginx + systemd |

---

## 4. Estrutura de Arquivos

### Backend

```
backend/app/voice_ai_inbound/
├── __init__.py          # Inicialização do módulo
├── config.py            # Variáveis de ambiente e constantes (IVR, APIs)
├── models.py            # Modelo SQLAlchemy: tabela voice_agents
└── routes.py            # Endpoints: IVR, gather, webhook, dashboard, calls
```

### Frontend

```
frontend/src/app/voice-inbound/
└── page.tsx             # Página de Atendimento por Voz (dashboard + lista + detalhes)
```

### Alterações em arquivos existentes

```
backend/app/voice_ai/routes.py    → Adicionado roteamento inbound/outbound no /twilio/answer
backend/app/main.py               → Adicionado include_router(voice_inbound_router)
frontend/src/components/app-shell.tsx → Adicionado link "Atendimento IA" no sidebar
```

---

## 5. Banco de Dados

### Tabela: voice_agents

```sql
CREATE TABLE voice_agents (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    slug VARCHAR(50) NOT NULL,              -- "support", "retention"
    name VARCHAR(255) NOT NULL,             -- "Agente de Suporte"
    description TEXT,
    ivr_key VARCHAR(5),                     -- "1", "2"
    ivr_label VARCHAR(255),                 -- "Para suporte, digite 1"
    system_prompt TEXT NOT NULL,            -- Prompt do agente (backup local)
    greeting_text TEXT,                     -- Primeira fala
    llm_model VARCHAR(100) DEFAULT 'gpt-4o',
    llm_temperature INTEGER DEFAULT 30,    -- 30 = 0.3
    llm_max_tokens INTEGER DEFAULT 500,
    elevenlabs_agent_id VARCHAR(100),       -- Agent ID do ElevenLabs
    elevenlabs_voice_id VARCHAR(100),       -- Voice ID (se usar TTS avulso)
    elevenlabs_model_id VARCHAR(100) DEFAULT 'eleven_multilingual_v2',
    max_duration_sec INTEGER DEFAULT 300,
    silence_timeout_sec INTEGER DEFAULT 10,
    can_escalate BOOLEAN DEFAULT TRUE,
    escalation_phone VARCHAR(30),
    knowledge_doc_ids JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_voice_agents_tenant_slug ON voice_agents(tenant_id, slug);
GRANT ALL PRIVILEGES ON TABLE voice_agents TO eduflow;
GRANT USAGE, SELECT ON SEQUENCE voice_agents_id_seq TO eduflow;
```

### Tabelas reutilizadas (do módulo voice_ai)

- **ai_calls** — Registro de cada chamada (direction='inbound', source='inbound_support' ou 'inbound_retention')
- **ai_call_turns** — Cada turno da conversa (transcrição)

---

## 6. Backend — Implementação

### Endpoints

| Método | Endpoint | Auth | Descrição |
|--------|----------|------|-----------|
| POST | `/api/voice-inbound/answer` | Não (Twilio) | IVR — menu de voz |
| POST | `/api/voice-inbound/gather` | Não (Twilio) | Processa dígito → Register Call |
| POST | `/api/voice-inbound/post-call-webhook` | HMAC | Webhook pós-chamada do ElevenLabs |
| GET | `/api/voice-inbound/dashboard` | JWT | Métricas e KPIs |
| GET | `/api/voice-inbound/calls` | JWT | Lista chamadas com paginação |
| GET | `/api/voice-inbound/calls/{id}` | JWT | Detalhes + transcrição |

### Roteamento inbound/outbound

O webhook do Twilio (`/api/voice-ai/twilio/answer`) foi alterado para detectar a direção da chamada:

```python
direction = form.get("Direction", "")

if direction == "inbound":
    response.redirect(f"{BASE_URL}/api/voice-inbound/answer", method="POST")
    return Response(content=str(response), media_type="application/xml")

# outbound continua normalmente...
```

### Register Call — integração com ElevenLabs

Em vez de usar a SDK (`elevenlabs` Python package), usamos chamada HTTP direta porque a SDK retornava `None`:

```python
import httpx

resp = httpx.post(
    "https://api.elevenlabs.io/v1/convai/twilio/register-call",
    headers={
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    },
    json={
        "agent_id": elevenlabs_agent_id,
        "from_number": caller,
        "to_number": called,
        "direction": "inbound",
        "conversation_initiation_client_data": {
            "dynamic_variables": {
                "caller_number": caller,
                "agent_type": agent_slug,
            }
        },
    },
    timeout=10.0,
)

# resp.text contém TwiML pronto — devolver ao Twilio
return Response(content=resp.text, media_type="application/xml")
```

### Config (variáveis de ambiente usadas)

```env
ELEVENLABS_API_KEY=sua_chave_aqui
TWILIO_ACCOUNT_SID=seu_sid
TWILIO_AUTH_TOKEN=seu_token
TWILIO_PHONE_NUMBER=+553122980172
BASE_URL=https://portal.eduflowia.com
```

---

## 7. Frontend — Implementação

### Página: `/voice-inbound`

Localização: `frontend/src/app/voice-inbound/page.tsx`

**Componentes:**

- 4 KPICards: Total de chamadas, Duração média, Suporte (Lia), Retenção (Maria)
- Tabela de chamadas com filtro por agente
- Sheet lateral com detalhes + transcrição em formato chat

**APIs consumidas:**

```typescript
// Dashboard
api.get('/voice-inbound/dashboard?days=30')

// Lista de chamadas
api.get('/voice-inbound/calls?limit=50&agent=support')

// Detalhes
api.get('/voice-inbound/calls/123')
```

### Sidebar

Adicionado em `app-shell.tsx`:

```typescript
{ href: '/voice-inbound', label: 'Atendimento IA', icon: PhoneIncoming,
  color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
```

---

## 8. ElevenLabs — Configuração dos Agentes

### Agente de Suporte (Lia)

| Config | Valor |
|--------|-------|
| Agent ID | `agent_7701km0c8c0bf15901qantwmkpgz` |
| LLM | GPT-4.1 Mini |
| Voz | Marianne (Primário) |
| Idioma | Português (Brasil) |
| Input áudio | μ-law 8000 Hz |
| Output TTS | μ-law 8000 Hz |
| Turn Eagerness | Eager |
| Turno especulativo | Ativado |
| Assumir vez após silêncio | 8 segundos |
| Encerrar após silêncio | 60 segundos |
| Guardrails | Foco + Manipulação |
| Webhook pós-chamada | `https://portal.eduflowia.com/api/voice-inbound/post-call-webhook` |

### Agente de Retenção (Maria)

| Config | Valor |
|--------|-------|
| Agent ID | `agent_2001km0vkxc4f1drr7qd72t3bzxp` |
| LLM | GPT-4.1 Mini |
| Voz | Marianne (Primário) |
| Idioma | Português (Brasil) |
| Demais configs | Iguais ao Suporte |
| Webhook pós-chamada | `https://portal.eduflowia.com/api/voice-inbound/post-call-webhook` |

### Configurações críticas no ElevenLabs

1. **μ-law 8000 Hz** obrigatório em input E output — sem isso, Twilio não consegue conectar
2. **Turn Eagerness = Eager** + **Turno especulativo = On** — reduz latência significativamente
3. **Guardrails Foco + Manipulação** — essenciais para produção
4. **Max tokens = 300** — evita respostas longas demais por telefone

---

## 9. Twilio — Configuração

### Webhook do número

| Config | Valor |
|--------|-------|
| A call comes in | Webhook |
| URL | `https://portal.eduflowia.com/api/voice-ai/twilio/answer` |
| HTTP | HTTP POST |

Não precisa configurar nada específico para inbound. O roteamento é feito no backend via campo `Direction`.

### Número ativo

- **Número:** +553122980172
- **Tipo:** Local BR (Twilio)
- **Suporta:** Inbound + Outbound

---

## 10. Como Testar

### Teste básico

1. Ligar para `+55 31 2298-0172`
2. Ouvir o IVR: "Olá, bem-vindo ao EduFlow Hub..."
3. Digitar **1** para Suporte ou **2** para Retenção
4. Conversar com o agente
5. Verificar no dashboard: `https://portal.eduflowia.com/voice-inbound`

### Teste via logs

```bash
# Monitorar em tempo real
sudo journalctl -u eduflow-backend -f | grep -i "inbound"

# Verificar últimas chamadas no banco
sudo -u postgres psql eduflow_db -c "
SELECT id, from_number, source, outcome, duration_seconds, created_at
FROM ai_calls
WHERE direction = 'inbound'
ORDER BY id DESC
LIMIT 10;
"
```

### Verificar transcrição

```bash
sudo -u postgres psql eduflow_db -c "
SELECT t.role, t.text
FROM ai_call_turns t
JOIN ai_calls c ON c.id = t.call_id
WHERE c.id = (SELECT MAX(id) FROM ai_calls WHERE direction = 'inbound')
ORDER BY t.created_at;
"
```

### Verificar agentes no banco

```bash
sudo -u postgres psql eduflow_db -c "
SELECT id, slug, name, ivr_key, elevenlabs_agent_id, is_active
FROM voice_agents;
"
```

---

## 11. Como Adicionar Novos Agentes

Para adicionar um novo agente (ex: Agente de Vendas, tecla 3):

### Passo 1 — Criar agente no ElevenLabs

1. Acessar: `https://elevenlabs.io/app/conversational-ai`
2. Create Agent → Start from blank
3. Configurar: nome, prompt, voz, idioma, LLM
4. Aba Avançado: μ-law 8000 Hz (input + output), eager, turno especulativo
5. Aba Segurança: ativar Foco + Manipulação
6. Configurar webhook pós-chamada: `https://portal.eduflowia.com/api/voice-inbound/post-call-webhook`
7. Publicar e copiar o Agent ID

### Passo 2 — Inserir no banco

```sql
INSERT INTO voice_agents (tenant_id, slug, name, description, ivr_key, ivr_label, system_prompt, greeting_text, elevenlabs_agent_id)
VALUES (
  1,
  'sales',
  'Agente de Vendas',
  'Qualifica leads interessados no EduFlow',
  '3',
  'Para falar com vendas, digite 3',
  'Prompt completo aqui...',
  'Olá! Eu sou a Ana, consultora comercial do EduFlow.',
  'agent_XXXXXXXXXXXXXXX'
);
```

### Passo 3 — Atualizar IVR no config.py

```python
# backend/app/voice_ai_inbound/config.py

IVR_GREETING = os.getenv(
    "VOICE_INBOUND_IVR_GREETING",
    "Olá, bem-vindo ao EduFlow Hub. "
    "Para suporte técnico, digite 1. "
    "Para falar sobre seu plano, digite 2. "
    "Para falar com vendas, digite 3."
)

IVR_AGENT_MAP = {
    "1": "support",
    "2": "retention",
    "3": "sales",
}
```

### Passo 4 — Atualizar frontend (opcional)

Adicionar o agente nos labels em `voice-inbound/page.tsx`:

```typescript
const AGENT_LABELS: Record<string, string> = {
  inbound_support: 'Lia — Suporte',
  inbound_retention: 'Maria — Retenção',
  inbound_sales: 'Ana — Vendas',
};
```

### Passo 5 — Deploy

```bash
git add . && git commit -m "feat: agente de vendas inbound" && git push
cd ~/eduflow && git pull && sudo systemctl restart eduflow-backend
cd frontend && npm run build && sudo systemctl restart eduflow-frontend
```

---

## 12. Como Replicar em Outros Projetos

### Pré-requisitos

- Conta Twilio com número de telefone ativo
- Conta ElevenLabs com acesso a Conversational AI Agents
- Backend FastAPI com SQLAlchemy (async) e PostgreSQL
- Frontend Next.js (opcional)

### Passo a passo

#### 1. Copiar módulo backend

Copiar a pasta `backend/app/voice_ai_inbound/` inteira para o novo projeto:

```
voice_ai_inbound/
├── __init__.py
├── config.py
├── models.py
└── routes.py
```

#### 2. Criar tabela no banco

Executar o SQL da seção 5 (tabela `voice_agents`).

#### 3. Registrar router no main.py

```python
from app.voice_ai_inbound.routes import router as voice_inbound_router
app.include_router(voice_inbound_router)
```

#### 4. Criar roteador inbound no webhook do Twilio

No endpoint que recebe chamadas do Twilio, adicionar:

```python
direction = form.get("Direction", "")
if direction == "inbound":
    response = VoiceResponse()
    response.redirect(f"{BASE_URL}/api/voice-inbound/answer", method="POST")
    return Response(content=str(response), media_type="application/xml")
```

#### 5. Configurar variáveis de ambiente

```env
ELEVENLABS_API_KEY=sua_chave
TWILIO_ACCOUNT_SID=seu_sid
TWILIO_AUTH_TOKEN=seu_token
BASE_URL=https://seu-dominio.com
```

#### 6. Criar agentes no ElevenLabs

Seguir o passo a passo da seção 11.

#### 7. Configurar Twilio

Apontar webhook do número para: `https://seu-dominio.com/api/voice-ai/twilio/answer`

#### 8. Adaptar para o domínio

Modificar os prompts dos agentes no ElevenLabs para o contexto do novo projeto (ex: clínica, loja, etc.).

Modificar labels no IVR (`config.py`) e no frontend.

#### O que NÃO precisa mudar

- `routes.py` — lógica genérica, funciona para qualquer agente
- `models.py` — tabela genérica
- Integração com ElevenLabs — é a mesma API para qualquer domínio

---

## 13. Custos

### Por chamada (estimativa 3 min)

| Componente | Custo |
|-----------|-------|
| Twilio (receber ligação BR) | ~R$ 0,20/min = R$ 0,60 |
| ElevenLabs Agents | ~$0,10/min = R$ 1,80 |
| LLM (GPT-4.1 Mini via ElevenLabs) | Incluso no ElevenLabs |
| **Total por chamada (3 min)** | **~R$ 2,40** |

### Comparação com atendente humano

| Métrica | Atendente humano | Agente IA |
|---------|-----------------|-----------|
| Custo por hora | R$ 15-30 | R$ 0 (só paga por uso) |
| Disponibilidade | 8h/dia | 24/7 |
| Custo por chamada (3 min) | R$ 1,50-3,00 | R$ 2,40 |
| Escala | Limitada | Ilimitada |
| Consistência | Variável | Sempre a mesma qualidade |

### Desconto ElevenLabs

- Chamadas de teste: 50% de desconto
- Silêncio acima de 10s: 95% de desconto

---

## 14. Troubleshooting

### Chamada cai após digitar no IVR

**Causa:** Formato de áudio do agente ElevenLabs não é μ-law 8000 Hz.

**Solução:** No ElevenLabs, aba Avançado → Input = μ-law 8000 Hz; Vozes → engrenagem → Output = μ-law 8000 Hz.

### IVR repete "opção inválida" sem dar tempo de digitar

**Causa:** Timeout do IVR muito curto.

**Solução:** Aumentar `IVR_TIMEOUT_SEC` no `config.py` (recomendado: 10).

### Register Call retorna None (SDK Python)

**Causa:** Bug na SDK `elevenlabs` para Python — `register_call()` retorna None.

**Solução:** Usar chamada HTTP direta via `httpx` em vez da SDK. Ver seção 6.

### Agente responde lento

**Causa:** LLM pesado ou turn eagerness baixo.

**Solução:**
1. Trocar LLM para GPT-4.1 Mini ou Gemini 2.5 Flash
2. Turn Eagerness = Eager
3. Ativar Turno Especulativo

### Agente não encontrado no banco

**Causa:** `elevenlabs_agent_id` não cadastrado na tabela `voice_agents`.

**Verificação:**
```bash
sudo -u postgres psql eduflow_db -c "SELECT slug, elevenlabs_agent_id FROM voice_agents;"
```

### Webhook pós-chamada não salva dados

**Causa:** URL do webhook incorreta ou ElevenLabs desabilitou após falhas.

**Verificação:**
1. Conferir URL no painel ElevenLabs: `https://portal.eduflowia.com/api/voice-inbound/post-call-webhook`
2. Verificar se evento "Transcrição" está ativado
3. Testar manualmente: `curl -X POST https://portal.eduflowia.com/api/voice-inbound/post-call-webhook -H "Content-Type: application/json" -d '{}'`

### Chamada inbound vai direto pro SDR

**Causa:** Webhook do Twilio apontando para o ElevenLabs em vez do nosso servidor.

**Solução:** No Twilio Console → Phone Numbers → seu número → Voice Configuration → URL = `https://portal.eduflowia.com/api/voice-ai/twilio/answer`

---

## Histórico de Versões

| Versão | Data | Descrição |
|--------|------|-----------|
| v1.0 | 18/03/2026 | Módulo completo: IVR + Register Call + 2 agentes (Suporte e Retenção) + Dashboard |

---

## Commits Relacionados

| Hash | Descrição |
|------|-----------|
| — | feat: módulo voice_ai_inbound - config, models, routes e roteador inbound/outbound |
| — | feat: pipeline inbound (substituído por Register Call) |
| — | feat: voice inbound com ElevenLabs Agents Register Call |
| — | feat: página Atendimento por Voz + endpoints dashboard/calls inbound |
