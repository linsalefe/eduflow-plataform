# Guia de Teste — Sistema de Agentes IA EduFlow

**Atualizado em:** 13/03/2026

---

## Pré-requisitos

- Canal WhatsApp ativo e conectado via Evolution API
- Agentes ativados no Superadmin (`agent_plan_flags` com os agentes desejados como `true`)
- Agentes ativados na página **Agentes IA** do tenant (`agent_flags`)
- Mensagens configuradas em **Agentes IA → Mensagens dos Agentes**
- Movimentação automática configurada em **Agentes IA → Movimentação Automática**
- Prompt configurado em **Config. IA** com a personalidade da Nat
- Modelo recomendado: **GPT-4o** (GPT-5 tem instabilidade com JSON e temperature)

### Verificação rápida das flags

```bash
# Ver flags do tenant
sudo -u postgres psql -d eduflow_db -c "SELECT id, name, agent_plan_flags, agent_flags, agent_pipeline_moves FROM tenants LIMIT 5;"

# Ver canais e instâncias
sudo -u postgres psql -d eduflow_db -c "SELECT id, name, instance_name, tenant_id, is_active FROM channels ORDER BY id;"
```

### Verificar conexão da instância Evolution API

```bash
curl -s -X GET "http://<EVOLUTION_IP>:8080/instance/fetchInstances" \
  -H "apikey: <API_KEY>" | python3 -c "
import sys,json
data=json.load(sys.stdin)
for d in data:
    print(f'{d[\"name\"]} | status: {d[\"connectionStatus\"]} | number: {d.get(\"ownerJid\",\"?\")}')"
```

✅ A instância do canal de teste deve estar com status `open`.

---

## Teste 1 — Configuração da IA (Nat WhatsApp)

**Objetivo:** Verificar se o prompt e o RAG estão sendo usados corretamente.

1. Acesse `/ai-config`
2. Selecione o canal WhatsApp
3. Ative o **Agente Nat**
4. Selecione o modelo **GPT-4o**
5. Escreva um prompt no campo **Personalidade da Nat** (exemplo SDR completo):
   ```
   Você é a Nat, consultora virtual especializada em pós-graduação.
   Você trabalha como SDR e seu objetivo é qualificar leads e agendar uma reunião com a consultora acadêmica.

   ## REGRAS DE COMUNICAÇÃO
   - Envie NO MÁXIMO 2 frases por mensagem
   - Nunca envie duas perguntas na mesma mensagem
   - Seja cordial, profissional e objetiva
   - Use emojis com moderação (máximo 1 por mensagem)
   - Nunca invente informações sobre cursos, valores ou datas

   ## FLUXO DE QUALIFICAÇÃO (siga na ordem, uma etapa por mensagem)
   Etapa 1 — Apresentação e Interesse
   Etapa 2 — Formação
   Etapa 3 — Atuação Profissional
   Etapa 4 — Motivação
   Etapa 5 — Agendamento

   ## TRATAMENTO DE OBJEÇÕES
   - "Está caro" → Existem condições especiais, a consultora apresenta na reunião
   - "Vou pensar" → Reunião é rápida (15 min) e sem compromisso
   - "Não tenho tempo" → Ofereça horários flexíveis
   - "Me manda por mensagem" → Detalhes ficam melhor com a consultora

   ## O QUE NUNCA FAZER
   - Nunca falar de valores ou mensalidades
   - Nunca pressionar o lead
   - Nunca enviar mensagens longas
   - Nunca pular etapas do fluxo
   ```
6. Clique em **Salvar Configurações**
7. (Opcional) Envie um documento de teste na **Base de Conhecimento**
8. Envie uma mensagem de um número real para o WhatsApp do canal: "Olá, tenho interesse no curso"
9. Verifique nos logs:
   ```bash
   sudo journalctl -u eduflow-backend -f
   ```

✅ **Esperado:**
- A Nat responde com o nome e tom configurados no prompt
- O log mostra `[action=continue]`
- Sem erros de `max_tokens`, `temperature` ou resposta vazia

> **Nota:** O sistema injeta automaticamente as regras de formato JSON e actions no prompt. Não é necessário incluí-las no campo de personalidade.

---

## Teste 2 — Qualificação completa + Agendamento + Pipeline

**Objetivo:** Simular um lead sendo qualificado pela Nat até agendar uma reunião, verificando movimentação automática no pipeline e acionamento do FollowupAgent.

### Preparação

```bash
# Resetar status do lead de teste para "novo"
sudo -u postgres psql -d eduflow_db -c "UPDATE contacts SET lead_status = 'novo' WHERE wa_id = '<NUMERO_TESTE>';"
```

### Execução

1. Envie "Olá" para o WhatsApp do canal
2. Responda as perguntas da Nat (formação, atuação, motivação)
3. Quando perguntar sobre reunião, responda: "Amanhã às 18h"
4. Monitore os logs:
   ```bash
   sudo journalctl -u eduflow-backend -f | grep -i "pipeline\|action=\|orquestrador\|FollowupAgent"
   ```

✅ **Esperado — Movimentação automática:**
```
📊 Pipeline: lead XXX movido de 'novo' → 'em_contato'        (no primeiro contato)
📊 Pipeline: lead XXX movido de 'em_contato' → 'qualificado'  (ao agendar reunião)
```

✅ **Esperado — Agentes:**
```
🤖 IA respondeu para XXX: Perfeito — confirmado: amanhã às 18h ... [action=schedule_call]
👤 Tenant sem voice ativo — reunião com closer humana: 2026-XX-XX 18:00:00
🤖 Orquestrador recebeu evento: call_completed | lead_id=XXX
➡️  Ação decidida: TRIGGER_FOLLOWUP
📋 FollowupAgent acionado para lead XXX
📅 Lembrete D-0 agendado para ...
📋 Briefing agendado para ...
🤖 Orquestrador acionado para lead XXX
```

> **Nota:** Se o tenant tem `voice: true` nas flags, o sistema cria um schedule `voice_ai` para ligação automática. Se `voice: false`, apenas agenda lembretes para a closer humana.

### Verificação no banco

```bash
# Ver schedules criados
sudo -u postgres psql -d eduflow_db -c "SELECT id, contact_wa_id, type, scheduled_date, scheduled_time, status FROM schedules ORDER BY id DESC LIMIT 5;"
```

✅ **Esperado:** 2 registros novos — `followup_reminder` (D-0) e `briefing_agent`

> **Nota:** O lembrete D-1 só é criado se a reunião for em 2+ dias. Se for "amanhã", o D-1 seria "hoje às 9h" que já passou, então não é criado.

> **Nota:** A mensagem de confirmação NÃO é enviada pelo FollowupAgent — a própria Nat já confirma na conversa. O FollowupAgent apenas agenda os lembretes.

---

## Teste 3 — Trigger por coluna do Kanban → FollowupAgent

**Objetivo:** Verificar se mover um lead no pipeline aciona o agente correto.

1. Acesse **Agentes IA → Triggers do Pipeline**
2. Configure a coluna **Qualificados** para acionar o agente **Follow-up** com delay `0`
3. Salve
4. Acesse o **Pipeline**
5. Mova um lead para a coluna **Qualificados**
6. Verifique nos logs:
   ```bash
   sudo journalctl -u eduflow-backend -f | grep -i "kanban\|followup\|orchestrator"
   ```

✅ **Esperado:**
```
🤖 Orquestrador recebeu evento: kanban_followup | lead_id=XXX
➡️  Ação decidida: TRIGGER_FOLLOWUP
📋 FollowupAgent acionado para lead XXX
✅ Mensagem de follow-up enviada para XXX
```

> **Nota:** Quando vem do kanban, o FollowupAgent envia mensagem mas não agenda lembretes (pois não tem data de reunião no payload).

---

## Teste 4 — Agente de Reativação via Kanban

**Objetivo:** Verificar se a mensagem de reativação é enviada corretamente.

### Preparação (se necessário)

```bash
# Adicionar trigger de reativação na coluna "perdido"
sudo -u postgres psql -d eduflow_db -c "UPDATE tenants SET kanban_triggers = (kanban_triggers::jsonb || '{\"perdido\": {\"agent\": \"reactivation\", \"delay\": 0, \"active\": true}}'::jsonb)::json WHERE id = <TENANT_ID>;"
```

### Execução

1. Acesse o **Pipeline**
2. Mova um lead para a coluna **Perdidos**
3. Verifique nos logs:
   ```bash
   sudo journalctl -u eduflow-backend -f | grep -i "reactivation\|reativação"
   ```

✅ **Esperado:**
```
🤖 Orquestrador recebeu evento: kanban_reactivation | lead_id=XXX
➡️  Ação decidida: TRIGGER_REACTIVATION
🔄 ReactivationAgent acionado para lead XXX | evento: kanban_reactivation
✅ Mensagem de reativação enviada para XXX
```

✅ O lead recebe a mensagem de "lead frio" configurada em **Agentes IA → Mensagens → Reativação**.

---

## Teste 5 — Agente de Briefing

**Objetivo:** Verificar se o briefing é gerado e salvo antes da reunião.

### Preparação

O briefing é automaticamente agendado pelo FollowupAgent (15 min antes da reunião). Para testar imediatamente:

```bash
# Forçar execução do briefing (usar horário no fuso SP, não UTC!)
sudo -u postgres psql -d eduflow_db -c "UPDATE schedules SET scheduled_at = NOW() - interval '4 hours' WHERE type = 'briefing_agent' AND status = 'pending' ORDER BY id DESC LIMIT 1;"
```

> ⚠️ **Importante:** O scheduler usa fuso SP (UTC-3). O `NOW()` do PostgreSQL retorna UTC. Use `interval '4 hours'` para garantir que o horário fique no passado no fuso SP.

### Execução

1. Aguarde até 1 minuto (o scheduler roda a cada minuto)
2. Verifique nos logs:
   ```bash
   sudo journalctl -u eduflow-backend -f | grep -i "briefing"
   ```

✅ **Esperado:**
```
📋 BriefingAgent acionado para lead XXX
✅ Briefing salvo para lead XXX
```

### Verificação no banco

```bash
# Ver se o briefing foi salvo nas notas do contato
sudo -u postgres psql -d eduflow_db -c "SELECT wa_id, LEFT(notes, 300) FROM contacts WHERE notes LIKE '%briefing%' OR notes LIKE '%Briefing%' LIMIT 3;"

# Ver status do schedule
sudo -u postgres psql -d eduflow_db -c "SELECT id, type, scheduled_at, status FROM schedules WHERE type = 'briefing_agent' ORDER BY id DESC LIMIT 3;"
```

✅ **Esperado:** Status `completed` e briefing gerado pelo GPT nas notas do lead.

> **Nota:** Se o `lead_agent_context` não tiver dados preenchidos, o briefing usará um fallback com as informações disponíveis.

---

## Teste 6 — Mensagens customizadas

**Objetivo:** Verificar se as mensagens editadas no frontend são usadas pelos agentes.

1. Acesse **Agentes IA → Mensagens dos Agentes**
2. Edite a mensagem de lembrete D-0 do Follow-up:
   ```
   Oi {nome}! 🎉 Sua reunião é daqui a pouco! Prepare suas dúvidas. Até já!
   ```
3. Salve
4. Repita o **Teste 2** para criar um novo agendamento
5. Verifique no banco se o lembrete usa o texto editado:
   ```bash
   sudo -u postgres psql -d eduflow_db -c "SELECT id, type, notes FROM schedules WHERE type = 'followup_reminder' ORDER BY id DESC LIMIT 3;"
   ```

✅ **Esperado:** O campo `notes` do schedule contém exatamente o texto configurado, com as variáveis `{nome}`, `{hora}` substituídas.

---

## Teste 7 — Movimentação Automática do Pipeline

**Objetivo:** Verificar se a IA move leads automaticamente conforme configurado.

### Preparação

1. Acesse **Agentes IA → Movimentação Automática**
2. Configure:
   - Primeiro contato da IA → **Em Contato**
   - Reunião agendada pela IA → **Qualificados**
3. Salve
4. Resete o lead de teste:
   ```bash
   sudo -u postgres psql -d eduflow_db -c "UPDATE contacts SET lead_status = 'novo' WHERE wa_id = '<NUMERO_TESTE>';"
   ```

### Execução

1. Envie "Olá" do celular
2. Monitore:
   ```bash
   sudo journalctl -u eduflow-backend -f | grep -i "pipeline"
   ```

✅ **Esperado no primeiro contato:**
```
📊 Pipeline: lead XXX movido de 'novo' → 'em_contato'
```

3. Continue o fluxo até agendar ("Amanhã às 18h")

✅ **Esperado no agendamento:**
```
📊 Pipeline: lead XXX movido de 'em_contato' → 'qualificado'
```

### Teste com "Não mover"

1. Configure "Reunião agendada" como **Não mover**
2. Repita o fluxo
3. Verifique que o lead permanece em `em_contato` após o agendamento

---

## Teste 8 — Flags do Tenant (voice ativo vs inativo)

**Objetivo:** Verificar que o sistema respeita as flags de cada tenant.

### Cenário A: Tenant sem voice

```bash
sudo -u postgres psql -d eduflow_db -c "UPDATE tenants SET agent_flags = '{\"voice\": false, \"followup\": true, \"reactivation\": true, \"briefing\": true, \"whatsapp\": true}' WHERE id = <TENANT_ID>;"
```

1. Faça o fluxo de qualificação completo
2. Verifique nos logs:
   ```bash
   sudo journalctl -u eduflow-backend --since "2 min ago" --no-pager | grep -i "voice\|Tenant\|closer"
   ```

✅ **Esperado:** `👤 Tenant sem voice ativo — reunião com closer humana`

### Cenário B: Tenant com voice

```bash
sudo -u postgres psql -d eduflow_db -c "UPDATE tenants SET agent_flags = '{\"voice\": true, \"followup\": true, \"reactivation\": true, \"briefing\": true, \"whatsapp\": true}' WHERE id = <TENANT_ID>;"
```

1. Faça o fluxo de qualificação completo

✅ **Esperado:** `📞 Agendamento voice_ai criado: Lead → 2026-XX-XX`

---

## Verificações rápidas de banco

```bash
# Ver últimas mensagens enviadas pela IA
sudo -u postgres psql -d eduflow_db -c "SELECT content, timestamp FROM messages WHERE sent_by_ai = true ORDER BY timestamp DESC LIMIT 5;"

# Ver contexto dos leads
sudo -u postgres psql -d eduflow_db -c "SELECT lead_id, call_outcome, meeting_date, last_event FROM lead_agent_context ORDER BY id DESC LIMIT 5;"

# Ver schedules pendentes
sudo -u postgres psql -d eduflow_db -c "SELECT type, scheduled_date, scheduled_time, status FROM schedules WHERE status = 'pending' ORDER BY scheduled_at ASC LIMIT 10;"

# Ver flags e movimentação do tenant
sudo -u postgres psql -d eduflow_db -c "SELECT id, name, agent_flags, agent_pipeline_moves FROM tenants LIMIT 5;"

# Ver kanban triggers
sudo -u postgres psql -d eduflow_db -c "SELECT id, name, kanban_triggers FROM tenants LIMIT 5;"
```

---

## Logs úteis

```bash
# Logs em tempo real
sudo journalctl -u eduflow-backend -f

# Últimos 50 logs
sudo journalctl -u eduflow-backend -n 50 --no-pager

# Filtrar só erros
sudo journalctl -u eduflow-backend -n 50 --no-pager | grep "❌\|ERROR\|Error"

# Filtrar agentes
sudo journalctl -u eduflow-backend -n 50 --no-pager | grep "Agent\|Orchestrator\|followup\|reactivation\|briefing"

# Filtrar pipeline
sudo journalctl -u eduflow-backend -n 50 --no-pager | grep "Pipeline\|pipeline\|movido"

# Filtrar scheduler
sudo journalctl -u eduflow-backend -n 50 --no-pager | grep "⏰\|Scheduler\|scheduler"

# Filtrar actions da IA
sudo journalctl -u eduflow-backend -n 50 --no-pager | grep "action="
```

---

## Troubleshooting

### IA não responde

1. Verificar se a instância Evolution está `open`
2. Verificar se o webhook está configurado: `curl -s -X GET "http://<EVOLUTION_IP>:8080/webhook/find/<INSTANCE_NAME>" -H "apikey: <KEY>"`
3. Verificar se `ai_active = true` no contato
4. Verificar logs: `sudo journalctl -u eduflow-backend -f`

### Action sempre vem como `continue`

1. Verificar se o modelo é **GPT-4o** (GPT-5 tem problemas com JSON)
2. As FORMAT_RULES são injetadas automaticamente — não precisam estar no prompt
3. O fallback de keywords detecta: "agendado", "agendada", "confirmado", "confirmada"

### Scheduler não processa schedules

1. Verificar se está rodando: `grep "⏰" nos logs`
2. Lembrar que o scheduler usa **fuso SP (UTC-3)**, não UTC
3. Para forçar execução, setar `scheduled_at` com horário passado no fuso SP

### FollowupAgent não é acionado

1. Verificar `agent_flags` do tenant — `followup` deve ser `true`
2. Verificar `agent_plan_flags` — `followup` deve ser `true`
3. O orquestrador exige ambas as flags ativas

### Lead não move no pipeline

1. Verificar `agent_pipeline_moves` do tenant
2. O lead só move de `novo` → `em_contato` no primeiro contato (se já estiver em outra coluna, não move)
3. Verificar se o campo está salvo: `SELECT agent_pipeline_moves FROM tenants WHERE id = X;`
