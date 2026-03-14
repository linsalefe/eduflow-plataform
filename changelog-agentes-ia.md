# Changelog — Sistema de Agentes IA EduFlow

**Data:** 13/03/2026
**Sessão:** Testes completos + Correções + Novas funcionalidades

---

## Resumo

Sessão completa de testes do sistema de agentes IA seguindo o `guia-teste-agentes.md`. Todos os 6 testes passaram com sucesso após correções aplicadas durante o processo. Além dos fixes, foram implementadas novas funcionalidades de movimentação automática no pipeline.

---

## Testes Realizados

| # | Teste | Resultado |
|---|-------|-----------|
| 1 | Configuração da IA (Nat WhatsApp) | ✅ Passou |
| 2 | Qualificação completa + FollowupAgent | ✅ Passou |
| 3 | Trigger por coluna do Kanban → FollowupAgent | ✅ Passou |
| 4 | Trigger por coluna do Kanban → ReactivationAgent | ✅ Passou |
| 5 | Agente de Briefing via Scheduler | ✅ Passou |
| 6 | Mensagens customizadas nos agentes | ✅ Passou |

---

## Bugs Corrigidos

### 1. `max_tokens` incompatível com GPT-5

**Arquivo:** `backend/app/evolution/ai_agent.py`
**Problema:** GPT-5 não aceita o parâmetro `max_tokens`, exige `max_completion_tokens`.
**Erro:** `Unsupported parameter: 'max_tokens' is not supported with this model`
**Correção:** Substituído `max_tokens=max_tokens` por `max_completion_tokens=max_tokens` na chamada da API.

---

### 2. `temperature` não suportada no GPT-5

**Arquivo:** `backend/app/evolution/ai_agent.py`
**Problema:** GPT-5 só aceita temperature padrão (1), rejeita valores customizados.
**Erro:** `Unsupported value: 'temperature' does not support 0.5 with this model`
**Correção:** Criado dict `api_params` dinâmico que só inclui `temperature` quando o modelo não é GPT-5:
```python
api_params = {"model": model, "messages": messages, "max_completion_tokens": max_tokens}
if not model.startswith("gpt-5"):
    api_params["temperature"] = temperature
response = await client.chat.completions.create(**api_params)
```

---

### 3. Retry com gpt-4o-mini quando GPT-5 retorna vazio

**Arquivo:** `backend/app/evolution/ai_agent.py`
**Problema:** GPT-5 retornava resposta vazia em ~50% das mensagens, resultando em mensagens em branco enviadas ao lead.
**Correção:** Adicionado retry automático com gpt-4o-mini quando a resposta do GPT-5 vem vazia:
```python
if not raw and model.startswith("gpt-5"):
    print("⚠️ GPT-5 retornou vazio, tentando retry com gpt-4o-mini...")
    retry_params = {"model": "gpt-4o-mini", "messages": messages, "max_tokens": max_tokens, "temperature": temperature}
    response = await client.chat.completions.create(**retry_params)
    raw = (response.choices[0].message.content or "").strip()
```

---

### 4. FORMAT_RULES não injetadas no prompt customizado

**Arquivo:** `backend/app/evolution/ai_agent.py`
**Problema:** Quando o usuário configurava um prompt personalizado na página `/ai-config`, ele substituía completamente o `DEFAULT_SYSTEM_PROMPT` — que continha as regras de formato JSON e as actions (`schedule_call`, `trigger_call`, etc.). O GPT respondia em texto puro e a action sempre caía no fallback `continue`.
**Correção:** Criado bloco `FORMAT_RULES` fixo que é sempre concatenado ao final do prompt:
```python
FORMAT_RULES = """
REGRAS CRÍTICAS DE ACTION (NUNCA IGNORE):
- "continue": enquanto coleta informações
- "trigger_call": quando lead aceita ligação AGORA
- "schedule_call": quando lead CONFIRMA dia e horário
- "end": quando lead não tem interesse

FORMATO DE RESPOSTA OBRIGATÓRIO:
Responda APENAS com JSON válido...
"""
messages = [{"role": "system", "content": system_prompt + lead_info + rag_context + FORMAT_RULES}]
```

---

### 5. GPT-4o e GPT-4o-mini não disponíveis no seletor de modelo

**Arquivo:** `frontend/src/app/ai-config/page.tsx`
**Problema:** O dropdown de modelo só tinha GPT-5 e variantes. GPT-4o (mais estável para JSON) não estava disponível.
**Correção:** Adicionadas opções `gpt-4o` e `gpt-4o-mini` no seletor:
```html
<option value="gpt-4o">GPT-4o</option>
<option value="gpt-4o-mini">GPT-4o Mini</option>
```
**Recomendação:** Usar GPT-4o como modelo padrão — aceita temperature, retorna JSON consistente, sem respostas vazias.

---

### 6. ReactivationAgent não reconhecia eventos do Kanban

**Arquivo:** `backend/app/agents/reactivation/agent.py`
**Problema:** O método `_detect_scenario` só mapeava eventos específicos (`meeting_no_show`, `no_answer_3`, `cold_7d`, `call_completed`). Quando o evento vinha do kanban como `kanban_reactivation`, o mapping retornava vazio e o agente ignorava.
**Correção:** Adicionada verificação para eventos kanban antes do mapping:
```python
def _detect_scenario(self, event: AgentEvent) -> str:
    mapping = {...}
    if event.event_type.startswith("kanban_"):
        return "cold_7d"
    return mapping.get(event.event_type, "")
```

---

### 7. Orquestrador não acionado após `schedule_call`

**Arquivo:** `backend/app/evolution/routes.py`
**Problema:** Quando `action == "schedule_call"`, o código criava o schedule `voice_ai` mas nunca acionava o orquestrador. O FollowupAgent (confirmação + lembretes + briefing) não era disparado.
**Correção:** Adicionada chamada ao orquestrador após o agendamento, com verificação das flags do tenant:
- Se tenant tem `voice` ativo → cria schedule `voice_ai` + aciona orquestrador
- Se tenant NÃO tem `voice` → apenas aciona orquestrador (reunião com closer humana)

---

### 8. Indentação errada no Scheduler (main.py)

**Arquivo:** `backend/app/main.py`
**Problema:** Os blocos de `followup_reminder` e `briefing_agent` estavam com indentação fora do `async with async_session() as db:`, fazendo com que a sessão DB estivesse fechada ao executar as queries. O scheduler crashava silenciosamente.
**Correção:** Corrigida a indentação de todo o bloco, garantindo que as queries rodem dentro do contexto de sessão:
```python
async with async_session() as db:
    result_followup = await db.execute(...)  # Agora dentro do context manager
    followup_schedules = result_followup.scalars().all()
    for s in followup_schedules:
        ...
    await db.commit()
```

---

### 9. Confirmação duplicada do FollowupAgent

**Arquivo:** `backend/app/agents/followup/agent.py`
**Problema:** A Nat já confirmava a reunião na conversa do WhatsApp ("Perfeito — confirmado: amanhã às 18h ✅"), e logo depois o FollowupAgent enviava outra mensagem de confirmação — ficava duplicado.
**Correção:** Removido o envio da mensagem de confirmação do FollowupAgent, mantendo apenas o agendamento de lembretes D-1, D-0 e briefing.

---

### 10. Fallback de action não detectava "confirmado"

**Arquivo:** `backend/app/evolution/ai_agent.py`
**Problema:** O GPT-4o frequentemente respondia com "confirmado" em vez de retornar `action: "schedule_call"` no JSON. O fallback de keywords só verificava "agendado/agendada" mas não "confirmado/confirmada".
**Correção:** Adicionadas keywords ao fallback:
```python
elif any(kw in msg_lower for kw in ["agendado", "agendada", "confirmado", "confirmada", "confirmado:", "vamos agendar", "vai te ligar amanhã", "vai te ligar na"]):
    action = "schedule_call"
```

---

### 11. Timezone mismatch no Scheduler

**Problema encontrado:** O `NOW()` do PostgreSQL retorna UTC, mas o scheduler compara com horário de SP (UTC-3). Um schedule criado às 13:21 UTC não era encontrado pelo scheduler rodando às 10:48 SP.
**Impacto:** Schedules podiam demorar até 3h a mais para serem processados.
**Observação:** Para testes, o `scheduled_at` deve ser setado no fuso SP, não UTC.

---

## Novas Funcionalidades

### 1. Movimentação Automática de Leads na Pipeline

**Arquivos alterados:**
- `backend/app/models.py` — novo campo `agent_pipeline_moves`
- `backend/app/tenant_routes.py` — rotas GET/PUT para `/agent-pipeline-moves`
- `backend/app/evolution/routes.py` — lógica de movimentação
- `frontend/src/app/configuracoes/agentes/page.tsx` — seção de configuração

**Descrição:** Os leads agora são movidos automaticamente no pipeline quando a IA interage:

| Evento | Movimentação padrão |
|--------|-------------------|
| Primeiro contato da Nat | `novo` → `em_contato` |
| Reunião agendada (schedule_call) | `em_contato` → `qualificado` |

**Configuração por tenant:** Cada cliente configura as colunas de destino no painel Agentes IA → seção "Movimentação Automática". A opção "Não mover" desativa a automação para aquela etapa.

**Banco de dados:**
```sql
ALTER TABLE tenants ADD COLUMN agent_pipeline_moves JSON DEFAULT '{"on_first_contact": "em_contato", "on_schedule_call": "qualificado"}';
```

---

### 2. Prompt SDR Profissional para a Nat

**Configuração aplicada em `/ai-config`:**
Prompt completo com fluxo de qualificação em 5 etapas, tratamento de objeções, regras de comunicação e instruções de encerramento. Substituiu o prompt genérico anterior.

---

## Configurações de Banco Aplicadas

```sql
-- Ativar agent_flags para tenant de teste (id=1)
UPDATE tenants SET agent_flags = '{"voice": false, "followup": true, "reactivation": true, "briefing": true, "whatsapp": true}' WHERE id = 1;

-- Adicionar trigger de reativação na coluna "perdido"
UPDATE tenants SET kanban_triggers = (kanban_triggers::jsonb || '{"perdido": {"agent": "reactivation", "delay": 0, "active": true}}'::jsonb)::json WHERE id = 1;

-- Nova coluna para movimentação automática
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS agent_pipeline_moves JSON DEFAULT '{"on_first_contact": "em_contato", "on_schedule_call": "qualificado"}';
```

---

## Pendências Identificadas

### 1. Bug do Instagram — tenant_id null (URGENTE)
**Erro:** `NotNullViolationError: null value in column "tenant_id" of relation "messages"`
**Local:** `backend/app/main.py` → `handle_instagram_webhook` (linha 529)
**Impacto:** Webhook do Instagram crasha a cada ~10s, gerando erros 500 contínuos nos logs.
**Causa provável:** Canal do Instagram não tem `tenant_id` associado, ou a busca do tenant não está funcionando.

### 2. BriefingAgent com dados parciais
**Problema:** O BriefingAgent lê dados do `lead_agent_context` (formação, atuação, motivação), mas esses campos não são preenchidos pelo `ai_agent.py` durante a qualificação via WhatsApp. Os dados ficam apenas no `contacts.notes` como JSON.
**Solução:** Conectar o `ai_agent.py` para salvar os dados coletados também no `lead_agent_context`.

### 3. Timezone do Scheduler vs PostgreSQL
**Problema:** O scheduler usa fuso SP (UTC-3) para comparar com `scheduled_at`, mas o `NOW()` do PostgreSQL insere em UTC. Isso pode causar atrasos de até 3h no processamento.
**Solução:** Padronizar todos os horários para UTC ou para SP consistentemente.

---

## Arquivos Modificados

| Arquivo | Tipo de mudança |
|---------|----------------|
| `backend/app/evolution/ai_agent.py` | Fixes #1, #2, #3, #4, #10 |
| `backend/app/evolution/routes.py` | Fix #7, Feature #1 |
| `backend/app/agents/reactivation/agent.py` | Fix #6 |
| `backend/app/agents/followup/agent.py` | Fix #9 |
| `backend/app/main.py` | Fix #8 |
| `backend/app/models.py` | Feature #1 (nova coluna) |
| `backend/app/tenant_routes.py` | Feature #1 (novas rotas) |
| `frontend/src/app/ai-config/page.tsx` | Fix #5 |
| `frontend/src/app/configuracoes/agentes/page.tsx` | Feature #1 (UI) |

---

## Commits Realizados

1. `fix: ReactivationAgent agora reconhece eventos kanban`
2. `fix: usar max_completion_tokens para compatibilidade com GPT-5`
3. `fix: remover temperature para modelos GPT-5`
4. `feat: retry com gpt-4o-mini quando GPT-5 retorna vazio`
5. `feat: adicionar GPT-4o e GPT-4o-mini no seletor de modelo`
6. `fix: injetar regras de formato JSON e actions no prompt sempre`
7. `feat: schedule_call respeita flags voice do tenant + aciona orquestrador sempre`
8. `fix: corrigir indentação do scheduler para followup e briefing`
9. `debug: print no scheduler loop`
10. `fix: remover confirmação duplicada do FollowupAgent, manter só lembretes`
11. `fix: adicionar confirmado/confirmada ao fallback de schedule_call`
12. `feat: movimentação automática de leads na pipeline pela IA`
13. `feat: configuração de movimentação automática do pipeline na página de agentes`
