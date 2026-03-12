# Guia de Teste — Sistema de Agentes IA EduFlow

## Pré-requisitos

- Canal WhatsApp ativo e conectado via Evolution API
- Agentes ativados no Superadmin (Nat WhatsApp, Follow-up, Reativação, Briefing)
- Agentes ativados na página **Agentes IA** do tenant
- Mensagens configuradas em **Agentes IA → Mensagens dos Agentes**
- Prompt configurado em **Config. IA** com a personalidade da Nat

---

## Teste 1 — Configuração da IA (Nat WhatsApp)

**Objetivo:** Verificar se o prompt e o RAG estão sendo usados corretamente.

1. Acesse `/ai-config`
2. Selecione o canal WhatsApp
3. Ative o **Agente Nat**
4. Escreva um prompt no campo **Personalidade da Nat**:
   ```
   Você é a Julia, assistente virtual da Escola X.
   Seu objetivo é qualificar leads interessados em pós-graduação.
   Seja cordial, use no máximo 2 frases por mensagem.
   ```
5. Clique em **Salvar Configurações**
6. (Opcional) Envie um documento de teste na **Base de Conhecimento**
7. Envie uma mensagem de um número real para o WhatsApp do canal
8. Verifique nos logs se o nome "Julia" aparece na resposta:
   ```bash
   sudo journalctl -u eduflow-backend -n 30 --no-pager | grep -i "julia\|ai_agent\|process_message"
   ```

✅ **Esperado:** A Nat responde com o nome e tom configurados no prompt.

---

## Teste 2 — Qualificação completa pelo WhatsApp

**Objetivo:** Simular um lead sendo qualificado pela Nat até agendar uma reunião.

1. Envie uma mensagem para o WhatsApp do canal (ex: "Olá, tenho interesse no curso")
2. Responda as perguntas da Nat:
   - Formação
   - Área de atuação
   - Motivação
3. Quando a Nat perguntar sobre ligação, responda **"Não, prefiro agendar"**
4. Informe um dia e horário no formato `DD/MM/YYYY HH:MM` (ex: "15/04/2025 10:00")
5. Confirme o agendamento

6. Verifique nos logs:
   ```bash
   sudo journalctl -u eduflow-backend -n 50 --no-pager | grep -i "schedule_call\|followup\|confirmação"
   ```

✅ **Esperado:**
- Action `schedule_call` detectada nos logs
- Orquestrador aciona `TRIGGER_FOLLOWUP`
- FollowupAgent envia mensagem de confirmação no WhatsApp
- Lembretes D-1 e D-0 aparecem na tabela `schedules` do banco

7. Verifique no banco:
   ```bash
   sudo -u postgres psql -d eduflow_db -c "SELECT contact_wa_id, type, scheduled_date, scheduled_time, status FROM schedules ORDER BY id DESC LIMIT 5;"
   ```

✅ **Esperado:** 3 registros — `followup_reminder` (D-1), `followup_reminder` (D-0), `briefing_agent`

---

## Teste 3 — Trigger por coluna do Kanban

**Objetivo:** Verificar se mover um lead no pipeline aciona o agente correto.

1. Acesse **Agentes IA → Triggers do Pipeline**
2. Configure a coluna **Qualificados** para acionar o agente **Follow-up** com delay `0`
3. Salve
4. Acesse o **Pipeline**
5. Mova um lead para a coluna **Qualificados**
6. Verifique nos logs:
   ```bash
   sudo journalctl -u eduflow-backend -n 20 --no-pager | grep -i "kanban\|followup\|orchestrator"
   ```

✅ **Esperado:** Log `kanban_followup → TRIGGER_FOLLOWUP → FollowupAgent acionado`

---

## Teste 4 — Agente de Reativação

**Objetivo:** Verificar se a mensagem de reativação é enviada corretamente.

**Cenário: Lead frio (kanban trigger)**

1. Configure a coluna **Perdidos** para acionar o agente **Reativação**
2. Mova um lead para **Perdidos**
3. Verifique nos logs:
   ```bash
   sudo journalctl -u eduflow-backend -n 20 --no-pager | grep -i "reativacao\|reactivation"
   ```

✅ **Esperado:** Mensagem de lead frio enviada no WhatsApp do lead.

---

## Teste 5 — Agente de Briefing

**Objetivo:** Verificar se o briefing é gerado e salvo antes da reunião.

1. Com um lead que tenha reunião agendada, force a execução do briefing manualmente:
   ```bash
   sudo -u postgres psql -d eduflow_db -c "UPDATE schedules SET scheduled_at = NOW() - interval '1 minute' WHERE type = 'briefing_agent' AND status = 'pending' LIMIT 1;"
   ```
2. Aguarde até 1 minuto (o scheduler roda a cada minuto)
3. Verifique nos logs:
   ```bash
   sudo journalctl -u eduflow-backend -n 30 --no-pager | grep -i "briefing"
   ```
4. Verifique no banco se o briefing foi salvo nas notas do contato:
   ```bash
   sudo -u postgres psql -d eduflow_db -c "SELECT wa_id, notes FROM contacts WHERE notes LIKE '%briefing%' LIMIT 3;"
   ```

✅ **Esperado:** Briefing gerado pelo GPT salvo nas notas do lead.

---

## Teste 6 — Mensagens customizadas

**Objetivo:** Verificar se as mensagens editadas no frontend são usadas pelos agentes.

1. Acesse **Agentes IA → Mensagens dos Agentes**
2. Edite a mensagem de confirmação do Follow-up:
   ```
   Oi {nome}! 🎉 Perfeito! Sua consulta está confirmada para {data} às {hora}. Até lá!
   ```
3. Salve
4. Repita o **Teste 2** e confirme um agendamento
5. Verifique se a mensagem enviada no WhatsApp corresponde ao template editado

✅ **Esperado:** O lead recebe exatamente o texto que foi configurado, com as variáveis substituídas.

---

## Verificações rápidas de banco

```bash
# Ver últimas mensagens enviadas pela IA
sudo -u postgres psql -d eduflow_db -c "SELECT content, timestamp FROM messages WHERE sent_by_ai = true ORDER BY timestamp DESC LIMIT 5;"

# Ver contexto dos leads
sudo -u postgres psql -d eduflow_db -c "SELECT lead_id, call_outcome, meeting_date, last_event FROM lead_agent_context ORDER BY id DESC LIMIT 5;"

# Ver schedules pendentes
sudo -u postgres psql -d eduflow_db -c "SELECT type, scheduled_date, scheduled_time, status FROM schedules WHERE status = 'pending' ORDER BY scheduled_at ASC LIMIT 10;"
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
```
