# Jarvis — Assistente Executivo de Voz para CRM

> **EduFlow Hub** | Versão 3.0 | Março 2026 | Confidencial

---

## Sumário

1. [O que é o Jarvis](#1-o-que-é-o-jarvis)
2. [Funcionalidades Completas](#2-funcionalidades-completas)
3. [Arquitetura Técnica](#3-arquitetura-técnica)
4. [Stack Tecnológico](#4-stack-tecnológico)
5. [Estrutura de Arquivos](#5-estrutura-de-arquivos)
6. [Backend — Implementação](#6-backend--implementação)
7. [Frontend — Implementação](#7-frontend--implementação)
8. [Fluxo de Ações com Confirmação](#8-fluxo-de-ações-com-confirmação)
9. [Guia de Implementação em Outros Projetos](#9-guia-de-implementação-em-outros-projetos)
10. [Custos e Monetização](#10-custos-e-monetização)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. O que é o Jarvis

O Jarvis é um assistente de voz integrado ao dashboard que permite ao gestor **consultar dados** e **executar ações** no CRM usando comandos de voz.

O gestor clica no microfone, fala uma pergunta ou comando, e recebe a resposta em **áudio + texto** com dados em tempo real do banco de dados.

### Diferencial competitivo

Nenhum CRM nacional no segmento educacional oferece:
- Consulta por voz com dados em tempo real
- Execução de ações por comando de voz (follow-up, ligação, pipeline, agendamento)
- Confirmação visual antes de executar qualquer ação
- Resposta em áudio com voz natural (ElevenLabs TTS)

---

## 2. Funcionalidades Completas

### 2.1 Consultas (Query Tools)

| Comando de voz | Tool | O que retorna |
|---|---|---|
| "Quantos leads entraram hoje?" | `get_leads_summary` | Total de leads por período com breakdown por canal |
| "Quantos leads tem em qualificado?" | `get_leads_by_stage` | Leads por coluna do pipeline |
| "Quanto faturei esse mês?" | `get_revenue_summary` | Faturamento + progresso da meta |
| "Quais leads estão parados há 3 dias?" | `get_stale_leads` | Leads sem contato com nome e dias parados |
| "Me mostra os leads mais quentes" | `get_top_leads` | Top leads por score de qualificação |
| "Como estão os agentes?" | `get_agent_performance` | Métricas: atendimentos, agendamentos, taxa, score |
| "Quanto falta pra bater a meta?" | `get_goal_progress` | Progresso detalhado: faturamento, leads, matrículas necessárias |
| "Me fala sobre o Felipe Guerra" | `get_contact_details` | Dados completos: nome, telefone, status, score, tags, última mensagem |
| "Quais as últimas mensagens do Felipe?" | `get_contact_conversations` | Últimas N mensagens trocadas com o lead |

### 2.2 Ações (Action Tools — com confirmação)

| Comando de voz | Tool | O que executa |
|---|---|---|
| "Manda um follow-up pro Carlos Silva" | `action_send_followup` | Envia mensagem WhatsApp via Evolution API |
| "Liga pro Felipe Guerra" | `action_make_call` | Dispara ligação de IA via ElevenLabs Voice |
| "Move o Salmir pra qualificado" | `action_move_pipeline` | Altera `lead_status` do contato |
| "Agenda reunião com Ana para amanhã às 14h" | `action_schedule` | Cria registro na tabela `schedules` |

**Todas as ações passam por confirmação visual** antes de serem executadas. O usuário vê um card com os detalhes e clica "Confirmar" ou "Cancelar".

### 2.3 Recursos Visuais

- **Botão flutuante** com órbitas animadas e partículas
- **Overlay fullscreen** com orbe central brilhante
- **4 estados visuais**: idle, listening, processing, speaking + confirming
- **Transcrição em tempo real** da fala do usuário
- **Card de confirmação** com ícone e cor por tipo de ação
- **Seletor de canal** WhatsApp para follow-ups
- **Resposta em áudio** com voz masculina profissional (ElevenLabs TTS)

---

## 3. Arquitetura Técnica

### 3.1 Fluxo de consulta (Query)

```
Usuário fala → Web Speech API transcreve → POST /api/jarvis/query
    → GPT-4o identifica intenção → Chama query tool
    → Backend executa SQL no PostgreSQL (filtrado por tenant_id)
    → GPT-4o gera resposta natural em português
    → ElevenLabs TTS gera áudio → Frontend toca áudio + mostra texto
```

### 3.2 Fluxo de ação (Action)

```
Usuário fala "liga pro Carlos" → POST /api/jarvis/query
    → GPT-4o chama action_make_call
    → Backend PREPARA ação (NÃO executa) → Retorna pending_action
    → Frontend mostra card de confirmação
    → Usuário clica Confirmar → POST /api/jarvis/confirm
    → Backend EXECUTA ação (ElevenLabs outbound call)
    → Retorna resultado + áudio de confirmação
```

### 3.3 Diagrama de componentes

```
┌──────────────────┐     ┌───────────────────┐     ┌─────────────────┐
│   Browser         │     │   FastAPI          │     │   PostgreSQL     │
│   Web Speech API  │────▶│   /jarvis/query    │────▶│   Queries SQL    │
│   Framer Motion   │     │   /jarvis/confirm  │     │   por tenant_id  │
│   ElevenLabs TTS  │◀────│                    │◀────│                  │
└──────────────────┘     └───────┬───────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌──────────┐ ┌──────────┐ ┌──────────────┐
              │ GPT-4o   │ │ElevenLabs│ │ Evolution API│
              │ Tool Use │ │ TTS/Voice│ │ WhatsApp     │
              └──────────┘ └──────────┘ └──────────────┘
```

---

## 4. Stack Tecnológico

### Backend
- **FastAPI** — Framework Python assíncrono
- **SQLAlchemy Async** — ORM com queries assíncronas
- **PostgreSQL** — Banco de dados com extensão `unaccent`
- **OpenAI GPT-4o** — Interpretação de intenção + tool calling
- **ElevenLabs** — TTS (text-to-speech) para respostas em áudio
- **ElevenLabs Conversational AI** — Ligações de IA outbound
- **Evolution API** — Envio de mensagens WhatsApp

### Frontend
- **Next.js + TypeScript** — Framework React
- **Framer Motion** — Animações (orbe, spring physics, transitions)
- **Tailwind CSS** — Estilização
- **Web Speech API** — Reconhecimento de voz nativo do browser
- **Lucide React** — Ícones

---

## 5. Estrutura de Arquivos

```
backend/app/jarvis/
├── __init__.py          # Inicialização do módulo
├── routes.py            # Rotas POST /query e /confirm
├── tools.py             # Definição das 11 tools (7 query + 4 action)
├── execute.py           # Queries SQL para cada query tool
├── actions.py           # Preparação + execução das action tools
└── prompts.py           # System prompt dinâmico com contexto do tenant

frontend/src/
├── components/jarvis/
│   └── jarvis-button.tsx  # Componente completo (botão + overlay + confirmação)
├── app/globals.css        # Animações CSS do Jarvis
├── app/dashboard/page.tsx # Integração do <JarvisButton /> na dashboard
└── app/configuracoes/metas/page.tsx  # Tela de configuração de metas
```

---

## 6. Backend — Implementação

### 6.1 routes.py — Rota principal

A rota `/api/jarvis/query` recebe o texto transcrito e orquestra todo o fluxo:

1. Monta o system prompt com contexto do tenant (nome, produto, knowledge base)
2. Chama GPT-4o com as 11 tools definidas
3. Se GPT-4o retorna query tool → executa SQL → retorna resposta em texto + áudio
4. Se GPT-4o retorna action tool → prepara ação sem executar → retorna `pending_action`

A rota `/api/jarvis/confirm` executa uma ação previamente preparada após confirmação.

**Resposta tem 3 tipos:**
```json
// Consulta respondida
{ "type": "answer", "text": "...", "audio_b64": "..." }

// Ação pendente de confirmação
{ "type": "pending_action", "text": "...", "audio_b64": "...", "pending_action": { "action": "...", "description": "...", "details": {} } }

// Resultado de ação confirmada
{ "type": "action_result", "success": true, "text": "...", "audio_b64": "..." }
```

### 6.2 tools.py — Definição das tools

11 tools no total:

**Query tools (executam SQL, retornam dados):**
- `get_leads_summary` — leads por período
- `get_leads_by_stage` — leads por coluna do pipeline
- `get_revenue_summary` — faturamento + meta
- `get_stale_leads` — leads sem contato há X dias
- `get_top_leads` — leads por score
- `get_agent_performance` — métricas dos agentes IA
- `get_goal_progress` — progresso de metas
- `get_contact_details` — dados completos de um lead
- `get_contact_conversations` — mensagens trocadas com lead

**Action tools (requerem confirmação):**
- `action_send_followup` — enviar WhatsApp
- `action_make_call` — disparar ligação IA
- `action_move_pipeline` — mover lead no pipeline
- `action_schedule` — agendar reunião

### 6.3 execute.py — Queries SQL

Cada query tool executa SQL assíncrono via SQLAlchemy, **sempre filtrado por `tenant_id`** para garantir isolamento multi-tenant.

Exemplo simplificado:
```python
async def get_leads_summary(args, tenant_id, db):
    cutoff = _get_cutoff(args.get("period", "today"))
    result = await db.execute(
        select(func.count(Contact.id))
        .where(Contact.tenant_id == tenant_id)
        .where(Contact.created_at >= cutoff)
    )
    return {"total_leads": result.scalar() or 0}
```

### 6.4 actions.py — Preparação e execução de ações

Cada action tem 2 fases:

**Fase 1 — `prepare_action()`:** Resolve o lead pelo nome (busca fuzzy com `unaccent`), monta os detalhes, retorna para confirmação. NÃO executa nada.

**Fase 2 — `execute_action()`:** Chamada após confirmação do usuário. Executa a ação real (envia WhatsApp, dispara ligação, etc).

**Busca de lead por nome:**
```python
# Busca fuzzy: ignora acentos, busca por cada palavra separadamente
words = name.lower().strip().split()
word_filters = [
    func.lower(func.unaccent(Contact.name)).contains(func.unaccent(w))
    for w in words
]
result = await db.execute(
    select(Contact)
    .where(Contact.tenant_id == tenant_id)
    .where(and_(*word_filters))
)
```

**Fix do 9° dígito para ligações BR:**
```python
# wa_id pode estar sem o 9° dígito (55 + DDD + 8 dígitos = 12)
clean = phone.replace("+", "")
if clean.startswith("55") and len(clean) == 12:
    clean = clean[:4] + "9" + clean[4:]
phone = f"+{clean}"
```

### 6.5 prompts.py — System prompt dinâmico

O system prompt é montado em tempo real puxando:

1. **Nome da instituição** — tabela `Tenant`
2. **Contexto do produto** — `system_prompt` do `AIConfig` (mesmo prompt do agente WhatsApp)
3. **Base de conhecimento** — `KnowledgeDocument` (documentos RAG: cursos, preços, detalhes)

Inclui também:
- Regras de resposta (direto, máximo 3 frases, português BR, sem markdown)
- Correção de transcrição de voz ("litros" → "leads", "edu flor" → "EduFlow")
- Regras de ações (chamar tool imediatamente, nunca responder em texto)

---

## 7. Frontend — Implementação

### 7.1 JarvisButton — Componente principal

Um único componente React que gerencia todo o fluxo:

**Estados:**
```typescript
type JarvisState = 'idle' | 'listening' | 'processing' | 'speaking' | 'confirming';
```

**Estrutura visual:**
- Botão flutuante (fixo, canto inferior direito) com órbitas animadas
- Ao clicar → abre overlay fullscreen com orbe central
- Orbe reage ao volume do microfone (estado listening)
- Card de confirmação aparece para ações (estado confirming)

### 7.2 Estados visuais do orbe

| Estado | Visual do Orbe | Ícone | Texto |
|---|---|---|---|
| idle | Glow pulsante (breathing) | Microfone | "Toque no orbe e faça sua pergunta" |
| listening | Expande + ripples sonar | Barras de áudio | Transcrição em tempo real |
| processing | Anel conic-gradient girando | Sparkles rotativo | "Consultando dados..." |
| speaking | Waveform bars | Barras de áudio | Resposta do Jarvis |
| confirming | Normal | Ícone da ação | Card com Confirmar/Cancelar |

### 7.3 Card de confirmação

Cada tipo de ação tem cor e ícone próprios:

| Ação | Ícone | Cor |
|---|---|---|
| Follow-up WhatsApp | MessageSquare | Verde (emerald) |
| Ligação IA | PhoneCall | Azul (blue) |
| Mover pipeline | GitBranch | Violeta (violet) |
| Agendamento | CalendarCheck | Âmbar (amber) |

O card mostra: descrição da ação, nome do lead, detalhes (mensagem, curso, data, coluna destino) e seletor de canal WhatsApp quando aplicável.

### 7.4 Animações CSS

Todas as animações ficam no `globals.css`:

- `jarvis-orb-breathe` — glow pulsante no idle
- `jarvis-orb-listening` — orbe expande reagindo ao volume
- `jarvis-orbit` / `jarvis-orbit-reverse` — anéis orbitais girando
- `jarvis-particle-pulse` — partículas nas órbitas
- `jarvis-ripple` — ondas sonar no listening
- `jarvis-process-ring` — conic-gradient no processing
- `jarvis-speak-bar` — waveform no speaking
- `jarvis-starburst` — linhas irradiando atrás do orbe
- `jarvis-btn-idle` — breathing no botão flutuante
- `jarvis-cursor` — cursor piscando na transcrição

---

## 8. Fluxo de Ações com Confirmação

### 8.1 Sequência completa

```
1. Usuário fala: "Manda follow-up pro Carlos"
2. Web Speech API transcreve → "manda follow-up pro Carlos"
3. Frontend envia POST /api/jarvis/query { text: "manda follow-up pro Carlos" }
4. Backend:
   a. GPT-4o identifica → action_send_followup({ lead_name: "Carlos" })
   b. actions.py resolve lead: busca "Carlos" no banco com unaccent
   c. Monta pending_action com detalhes (wa_id, mensagem, canais disponíveis)
   d. Retorna { type: "pending_action", pending_action: {...} }
5. Frontend:
   a. Toca áudio: "Posso enviar follow-up via WhatsApp para Carlos Silva?"
   b. Mostra card de confirmação (verde, ícone MessageSquare)
   c. Mostra seletor de canal WhatsApp
   d. Usuário escolhe canal e clica "Confirmar"
6. Frontend envia POST /api/jarvis/confirm { action: "send_followup", details: {...} }
7. Backend:
   a. actions.py executa → Evolution API envia mensagem WhatsApp
   b. Retorna { type: "action_result", success: true, text: "Mensagem enviada para Carlos Silva" }
8. Frontend toca áudio de confirmação
```

### 8.2 Proteções

- Ações NUNCA são executadas sem confirmação visual
- O GPT-4o NÃO executa ações — ele apenas chama a tool, o backend prepara e retorna para confirmação
- Se o lead não for encontrado, retorna erro amigável
- Se dados obrigatórios estiverem faltando (ex: data para agendamento), o GPT-4o pergunta antes
- Cada ação é logada para auditoria

---

## 9. Guia de Implementação em Outros Projetos

### 9.1 Pré-requisitos

- **Backend:** Python 3.10+ com FastAPI + SQLAlchemy async + PostgreSQL
- **Frontend:** React/Next.js com TypeScript
- **APIs:** OpenAI (GPT-4o), ElevenLabs (TTS), canal de mensagens (WhatsApp/etc)
- **PostgreSQL:** extensão `unaccent` instalada

### 9.2 Passo a passo

#### Passo 1 — Instalar dependências

**Backend:**
```bash
pip install openai elevenlabs
```

**Frontend:**
```bash
npm install framer-motion lucide-react
```

**PostgreSQL:**
```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
```

#### Passo 2 — Configurar variáveis de ambiente

```env
# .env do backend
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=xxxxxxxxxxxxx
```

**Notas sobre ElevenLabs:**
- A API key precisa da permissão `text_to_speech` habilitada
- O `voice_id` define a voz do Jarvis (masculina ou feminina)
- Use o modelo `eleven_multilingual_v2` para português

#### Passo 3 — Criar módulo backend

Crie a pasta `backend/app/jarvis/` com os 5 arquivos:

**`__init__.py`** — arquivo vazio

**`prompts.py`** — system prompt com regras:
- Adapte o nome do produto/empresa
- Inclua regras de resposta por voz (sem markdown, frases curtas)
- Inclua correções de transcrição para termos do seu domínio
- Inclua regras de ações (chamar tools imediatamente)
- Injete contexto dinâmico do tenant se for multi-tenant

**`tools.py`** — definição das tools do GPT-4o:
- Cada tool é um JSON schema que descreve nome, descrição e parâmetros
- Query tools: retornam dados sem efeitos colaterais
- Action tools: nome começa com `action_`, requerem confirmação
- Adapte as tools ao seu modelo de dados

**`execute.py`** — queries SQL:
- Uma função async por query tool
- Sempre filtre por tenant_id (multi-tenant)
- Use `func.unaccent()` para busca de nomes
- Busque por palavras separadas (split) para fuzzy matching

**`actions.py`** — preparação + execução:
- `prepare_action()`: resolve lead, monta detalhes, retorna sem executar
- `execute_action()`: executa após confirmação
- Adapte as integrações ao seu stack (WhatsApp, ligação, etc)

**`routes.py`** — rotas FastAPI:
- `POST /api/jarvis/query` — recebe texto, retorna answer ou pending_action
- `POST /api/jarvis/confirm` — executa ação confirmada
- Inclua autenticação (JWT Bearer token ou equivalente)

#### Passo 4 — Registrar rotas

```python
# main.py
from app.jarvis.routes import router as jarvis_router
app.include_router(jarvis_router)
```

#### Passo 5 — Criar frontend

**CSS (globals.css):** Cole todas as animações do Jarvis (breathing, sonar, orbital, etc).

**Componente JarvisButton:**
- Gerencia estados: idle, listening, processing, speaking, confirming
- Web Speech API para captura de voz
- Overlay fullscreen com orbe animado
- Card de confirmação para ações
- Integração com as 2 rotas do backend

**Integração na página:**
```tsx
import { JarvisButton } from '@/components/jarvis/jarvis-button';

// Dentro do layout/dashboard:
<JarvisButton />
```

#### Passo 6 — Configurar metas (opcional)

Se quiser suporte a metas:
1. Adicione campos `monthly_goal`, `monthly_lead_goal`, `monthly_schedule_goal` ao modelo do tenant
2. Crie rotas GET/PUT para metas
3. Crie tela de configuração no frontend

### 9.3 Adaptando para outro domínio

O Jarvis foi feito para CRM educacional, mas pode ser adaptado para qualquer domínio:

**Para clínicas/saúde:**
- Trocar "leads" por "pacientes"
- Trocar "matrícula" por "agendamento de consulta"
- Tools: `get_patients_today`, `get_appointments`, `action_send_reminder`

**Para e-commerce:**
- Trocar "leads" por "pedidos/clientes"
- Tools: `get_orders_summary`, `get_revenue`, `action_send_tracking`

**Para imobiliárias:**
- Trocar "leads" por "interessados"
- Tools: `get_property_visits`, `get_proposals`, `action_schedule_visit`

**O que adaptar:**
1. Tools no `tools.py` — descreva as consultas do seu domínio
2. Queries no `execute.py` — adapte às suas tabelas
3. Actions no `actions.py` — adapte às suas integrações
4. System prompt no `prompts.py` — descreva o papel do assistente
5. Correções de transcrição — termos específicos do seu domínio

---

## 10. Custos e Monetização

### 10.1 Custo por consulta

| Componente | Custo/consulta | Observação |
|---|---|---|
| Web Speech API | Grátis | Nativo do browser |
| GPT-4o (tool calling) | ~R$0,05 | Inclui interpretação + tools |
| ElevenLabs TTS | ~R$0,05 | Voz multilingual v2 |
| **Total** | **~R$0,10** | **~R$120/mês por tenant** |

### 10.2 Sugestão de pricing

| Plano | Preço | Inclui Jarvis |
|---|---|---|
| Growth | R$999/mês | Não |
| Pro | R$1.999/mês | Jarvis consultas |
| Enterprise | R$2.999/mês | Jarvis consultas + ações |

### 10.3 ROI para o cliente

- Gestor ganha ~30 min/dia que gastaria abrindo dashboards
- Ações por voz eliminam atrito operacional
- Nenhum concorrente nacional oferece essa funcionalidade
- O Jarvis é a feature que fecha contratos em demos

---

## 11. Troubleshooting

### ElevenLabs não gera áudio
- Verifique se `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID` estão no `.env`
- A API key precisa ter permissão `text_to_speech`
- Teste direto: `client.text_to_speech.convert(...)`

### GPT-4o não chama as tools
- Verifique se o system prompt tem regras claras sobre ações
- Adicione: "NUNCA responda em texto sobre ações. CHAME A TOOL."
- Verifique se `tool_choice='auto'` está setado na chamada

### Lead não encontrado
- Instale extensão `unaccent` no PostgreSQL
- Use busca por palavras separadas (split) ao invés de substring direta
- Adicione correções de transcrição no prompt ("litros" → "leads")

### Ligação não é disparada
- Verifique formato do número: deve ser `+55DDXXXXXXXXX` (13 dígitos)
- `wa_id` pode estar sem o 9° dígito — adicione fix automático
- Teste `make_outbound_call()` direto pelo terminal

### Card de confirmação não aparece
- Verifique se `playAudio` usa `keepState=true` para pending_actions
- O estado `confirming` não pode ser sobrescrito por `speaking`

### Web Speech API não funciona
- Funciona apenas em Chrome, Edge e Safari
- Requer HTTPS em produção (não funciona em HTTP)
- Firefox não suporta — considere fallback com OpenAI Whisper

---

> **EduFlow Hub — Jarvis v3 — Documento Técnico — Março 2026 — Confidencial**
