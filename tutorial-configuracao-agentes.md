# Tutorial: Configurando os Agentes IA para um Cliente Real

---

## Visão Geral

O sistema de agentes do EduFlow funciona em 3 camadas:

1. **Superadmin** — define quais agentes o cliente pode usar (plano)
2. **Cliente (admin)** — ativa os agentes e configura os triggers
3. **Sistema** — dispara automaticamente com base nos eventos

---

## PASSO 1 — Superadmin: Liberar agentes no plano do cliente

Acesse: `https://portal.eduflowia.com` logado como superadmin.

1. Vá em **Painel Admin**
2. Encontre o tenant do cliente e clique para expandir
3. Na seção **Agentes IA**, clique nos agentes que deseja liberar para o cliente:
   - **Nat WhatsApp** — qualificação automática via WhatsApp
   - **Nat Voice** — ligação automática de qualificação
   - **Follow-up** — confirmação e lembretes de reunião
   - **Reativação** — recupera leads frios e no-shows
   - **Briefing** — resumo do lead antes da reunião

> Os agentes ficam roxos quando ativos. Clique para ativar/desativar.

---

## PASSO 2 — Cliente: Configurar as colunas do Pipeline

Antes de configurar os agentes, o cliente precisa ter as colunas do pipeline corretas.

Acesse: **Pipeline** → botão ⚙️ (configurar colunas) no header.

### Colunas recomendadas para escola/pós-graduação:

| Coluna | Key sugerido | Cor sugerida |
|--------|-------------|--------------|
| Novos Leads | `novo` | Roxo `#6366f1` |
| Em Contato | `em_contato` | Amarelo `#f59e0b` |
| Qualificados | `qualificado` | Roxo `#8b5cf6` |
| Reunião Marcada | `reuniao_marcada` | Ciano `#06b6d4` |
| Matriculados | `matriculado` | Verde `#10b981` |
| Perdidos | `perdido` | Vermelho `#ef4444` |

### Como editar:
1. Clique no **ícone de engrenagem** no header do Pipeline
2. Clique na **bolinha colorida** para trocar a cor
3. Clique no **nome** para editar diretamente
4. Arraste pelo **ícone ⠿** para reordenar
5. Clique no **ícone de lixeira** para excluir
6. Use o campo **Nova Coluna** para adicionar
7. Clique **Salvar**

---

## PASSO 3 — Cliente: Ativar os agentes

Acesse: **Configurações → Agentes IA**

### 3.1 Ativar os agentes desejados

Na seção **Agentes ativos**, ligue o toggle de cada agente que o cliente quer usar.

> Agentes cinza = indisponíveis no plano (ver Passo 1)

### Cenários comuns:

**Cliente com Voice AI completo:**
- ✅ Nat WhatsApp — ON
- ✅ Nat Voice — ON
- ✅ Follow-up — ON
- ✅ Reativação — ON
- ✅ Briefing — ON

**Cliente só com WhatsApp (sem ligações):**
- ✅ Nat WhatsApp — ON
- ❌ Nat Voice — OFF
- ✅ Follow-up — ON
- ✅ Reativação — ON
- ❌ Briefing — OFF

**Cliente manual (só organização):**
- ❌ Todos os agentes — OFF
- Configura apenas os triggers do pipeline

---

## PASSO 4 — Cliente: Configurar os Triggers do Pipeline

Na mesma página **Configurações → Agentes IA**, seção **Triggers do Pipeline**.

Aqui o cliente define: **"quando um lead entrar na coluna X, acionar o agente Y"**

### Configuração recomendada (escola com Voice AI completo):

| Coluna | Agente | Delay | Ativo |
|--------|--------|-------|-------|
| Novos Leads | Nat WhatsApp | 0 min | ✅ |
| Qualificados | Nat Voice | 5 min | ✅ |
| Reunião Marcada | Follow-up | 0 min | ✅ |
| Perdidos | Reativação | 1440 min (24h) | ✅ |

### Configuração recomendada (escola só WhatsApp):

| Coluna | Agente | Delay | Ativo |
|--------|--------|-------|-------|
| Novos Leads | Nat WhatsApp | 0 min | ✅ |
| Reunião Marcada | Follow-up | 0 min | ✅ |
| Perdidos | Reativação | 1440 min (24h) | ✅ |

### Como configurar:
1. Ative o toggle da coluna (fica amarelo)
2. Selecione o agente no dropdown
3. Defina o delay em minutos (0 = imediato)
4. Clique **Salvar**

---

## PASSO 5 — Testar o fluxo

### Teste básico:
1. Acesse o **Pipeline**
2. Arraste um lead para a coluna que tem trigger configurado
3. Aguarde alguns segundos
4. Verifique no WhatsApp do lead se recebeu a mensagem

### Verificar nos logs (acesso servidor):
```bash
sudo journalctl -u eduflow-backend --since "5 minutes ago" --no-pager | grep -E "🤖|➡️|📋|✅|⚠️"
```

---

## Fluxo Completo — Como funciona automaticamente

```
Lead entra → Coluna "Novos Leads"
    └─ Trigger: Nat WhatsApp dispara
        └─ IA qualifica via WhatsApp
            └─ Se qualificado → Orquestrador
                └─ Nat Voice agenda ligação
                    └─ Ligação realizada
                        └─ Se qualificado → Follow-up
                            ├─ Mensagem de confirmação enviada
                            ├─ Lembrete D-1 agendado
                            ├─ Lembrete D-0 agendado
                            └─ Briefing agendado (15min antes)
                        └─ Se não qualificado → Reativação
                            └─ Mensagem de reengajamento enviada
```

---

## Dúvidas Frequentes

**P: O cliente pode ter nomes de colunas diferentes?**
R: Sim. O sistema usa a coluna onde o lead foi colocado, independente do nome. O cliente mapeia qual coluna dispara qual agente.

**P: O que acontece se o agente estiver desativado mas o trigger estiver ativo?**
R: O orquestrador verifica se o agente está ativo antes de executar. Se estiver desativado, o trigger é ignorado silenciosamente.

**P: Posso ter duas colunas disparando o mesmo agente?**
R: Sim. Por exemplo, "Reunião Marcada" e "Reagendado" podem ambas disparar o Follow-up.

**P: O delay funciona como?**
R: O sistema agenda o disparo para `agora + delay minutos`. O scheduler verifica a cada 1 minuto.

---

## Checklist de Onboarding de Novo Cliente

- [ ] Passo 1: Liberar agentes no plano (superadmin)
- [ ] Passo 2: Configurar colunas do pipeline (cliente)
- [ ] Passo 3: Ativar os agentes desejados (cliente)
- [ ] Passo 4: Configurar triggers por coluna (cliente)
- [ ] Passo 5: Testar com lead real
- [ ] Verificar logs sem erros
