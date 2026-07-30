# Relatório — Migração de histórico entre canais (tenant GV Sports Education)

**Data:** 30/07/2026
**Fase:** 1 — investigação **somente leitura**. Nada foi alterado.
**Status:** aguardando aprovação para a Fase 2.

---

## 1. Identificação dos canais — **confirme antes de eu prosseguir**

Tenant **4 — GV Sports Education** (usuário Gustavo, `gustavo@eduflowia.com`, id 8). O tenant tem exatamente 2 canais:

| Papel | id | name | instance_name | is_active | is_connected | created_at | mensagens |
|---|---|---|---|---|---|---|---|
| **ANTIGO** | **30** | GV Comercial IA | `gv_comercial_ia` | `true` | `false` | 2026-04-17 22:34:50 | **8.188** |
| **NOVO** | **43** | CRM GV COMERCIAL | `t4_crm_gv_comercial` | `true` | `true` | 2026-07-30 19:38:14 | **0** |

A leitura bate com o contexto que você passou: o 30 é antigo (abril, cheio de histórico, desconectado) e o 43 é novo (criado hoje 19:38, conectado, zerado). O canal 43 já nasceu com o prefixo `t4_` — foi criado depois do deploy de hoje.

**Confirmação decisiva:** as duas instâncias têm o **mesmo `ownerJid`** no Evolution — `12392810940@s.whatsapp.net` (perfil "Gv Sports"). É o mesmo número WhatsApp nos dois canais, exatamente como você descreveu.

---

## 2. Por que o canal antigo não conecta — **a suspeita estava errada**

> Suspeita levantada: *instância deletada por fora, canal órfão.*

**Não é isso.** A instância `gv_comercial_ia` **continua existindo** no Evolution. O diagnóstico real:

| Evidência | Valor |
|---|---|
| `connectionState/gv_comercial_ia` (estado ao vivo) | **`connecting`** — estável em 5 amostras de 3 em 3s |
| `disconnectionReasonCode` | **401** |
| `disconnectionObject` | `{"tag":"conflict","attrs":{"type":"device_removed"}}` — `Stream Errored (conflict)` |
| `disconnectionAt` | **2026-07-10T19:22:29Z** |
| `updatedAt` da instância | 2026-07-28T21:58:01Z |
| Última mensagem no canal 30 | 2026-07-28 21:47:24 |
| Mensagens nas últimas 24h | **0** |

**Causa raiz:** a sessão do WhatsApp foi **removida do aparelho** (`device_removed`) — alguém desvinculou o dispositivo pelo celular, ou o WhatsApp derrubou a sessão. A instância não morreu; ela ficou **presa em `connecting`**, tentando reparear indefinidamente sem nunca completar. É por isso que o Gustavo não conseguia conectar.

**O canal novo não causou isso.** A desconexão é de **10/07** e o canal parou de receber em **28/07** — ambos **antes** da criação do canal novo (30/07 19:38). A ordem dos eventos inocenta o canal novo.

> ⚠️ **Armadilha de diagnóstico, para registro:** o `fetchInstances` reporta `connectionStatus: "open"` para o `gv_comercial_ia`, o que é **falso**. Esse campo é persistido no banco do Evolution e ficou desatualizado; o estado real só aparece no `connectionState`. Quem olhar só o `fetchInstances` conclui que o canal está saudável.

### Webhooks (os dois estão OK)

| Instância | URL | enabled | eventos |
|---|---|---|---|
| `t4_crm_gv_comercial` | `.../webhook/t4_crm_gv_comercial` | ✅ true | MESSAGES_UPSERT, CONNECTION_UPDATE, QRCODE_UPDATED, MESSAGES_UPDATE, SEND_MESSAGE |
| `gv_comercial_ia` | `.../webhook/gv_comercial_ia` | ✅ true | MESSAGES_UPSERT, CONNECTION_UPDATE, MESSAGES_UPDATE, SEND_MESSAGE |

O canal novo está corretamente plugado — a migração vai ser útil de fato. Mas veja o item 5.3: o webhook do **antigo** continuar ligado é um risco pós-migração.

---

## 3. Tamanho da migração

Varredura de **todas as 15 tabelas** do banco que têm coluna `channel_id` (não só as citadas):

| Tabela | → canal 30 (antigo) | canal 43 (novo) | Ação proposta |
|---|---:|---:|---|
| `messages` | **8.188** | 0 | migrar |
| `contacts` | **1.424** | 0 | migrar |
| `form_submissions` | **1.109** | 0 | migrar |
| `contact_channel_state` | **858** | 0 | migrar (ver §4) |
| `bkp_clean_20260716_ccs` | 437 | 0 | **não migrar** — tabela de backup de uma limpeza de 16/07 |
| `knowledge_documents` | 5 | 0 | migrar |
| `ai_configs` | 1 | 0 | migrar |
| `landing_pages` | 1 | 0 | migrar (**crítico** — ver §5.1) |
| `ai_conversation_summaries` | 0 | 0 | nada a fazer |
| `call_logs` | 0 | 0 | nada a fazer |
| `schedules` | 0 | 0 | nada a fazer |
| `voice_scripts` | 0 | 0 | nada a fazer |
| `chatbot_sessions` | 0 | 0 | nada a fazer |
| `automation_flows` | 0 | 0 | nada a fazer |
| `webhook_configs` | 0 | 0 | nada a fazer |

Contexto: os **1.424** contatos do canal 30 são **100% dos contatos do tenant 4** (nenhum contato sem canal). Dos 8.188 mensagens, **954 contatos distintos** têm histórico.

---

## 4. Conflitos em `contact_channel_state` — **zero, mas é alvo móvel**

A tabela tem `UNIQUE (contact_id, channel_id)`, então essa era a parte delicada. Resultado da checagem:

```sql
SELECT a.contact_id, a.lead_status, a.updated_at, b.lead_status, b.updated_at
FROM contact_channel_state a
JOIN contact_channel_state b ON b.contact_id = a.contact_id AND b.channel_id = 43
WHERE a.channel_id = 30;
```

```
 contact_id | status_antigo | upd_antigo | status_novo | upd_novo
------------+---------------+------------+-------------+----------
(0 rows)
```

**Nenhum conflito.** O canal 43 não tem nenhuma linha em `contact_channel_state` (foi criado há minutos e ainda não recebeu mensagem — 0 linhas criadas após 19:38). O `UPDATE ... SET channel_id = 43` passaria direto hoje.

> ⚠️ **Mas isso pode mudar a qualquer momento.** O canal 43 está **`open` e ativo**: assim que chegar a primeira mensagem, o backend cria uma linha em `contact_channel_state` para aquele contato e um conflito nasce. Por isso o SQL da Fase 2 abaixo **já trata conflitos mesmo sendo zero agora** — e a checagem deve ser **repetida dentro da transação**, não antes dela.

### Distribuição atual (para conferir o Kanban depois)

`lead_status` dos 858 registros do canal 30 — os 6 maiores:

| lead_status | qtd |
|---|---:|
| desqualificado | 339 |
| novo | 211 |
| perdido | 138 |
| encerramento | 41 |
| follow_up | 20 |
| qualificado | 18 |

(mais 16 status com ≤16 cada; total 22 status distintos)

`pipeline_id` dos mesmos 858: **402** no pipeline 1, **19** no pipeline 9, **437** NULL. O `UPDATE` não toca em `pipeline_id`, então essa distribuição se preserva.

---

## 5. Três coisas que mudam o plano

### 5.1 A landing page está viva e despejando leads no canal morto — **o item mais urgente**

```
 id | tenant_id |        slug         |         title         | is_active | pipeline_stage
----+-----------+---------------------+-----------------------+-----------+---------------
  8 |         4 | gv-sports-education | GV Sports & Education | t         | formulario
```

Ela aponta para o **canal 30**. E não é histórica: **13 `form_submissions` entraram hoje**, a última às **17:50**, e o último contato criado no tenant é dessa mesma submissão. Ou seja, enquanto a LP apontar para o canal 30, **todo lead novo continua nascendo em um canal que não consegue mandar mensagem**. Isso está acontecendo agora, independente da migração do histórico.

### 5.2 O canal novo está sem pipeline padrão — o Kanban não vai abrir certo

| canal | default_pipeline_id | operation_mode |
|---|---|---|
| 30 (antigo) | **1** (Pipeline Principal, tenant 4) | ai |
| 43 (novo) | **NULL** | ai |

Se migrarmos o histórico sem copiar o `default_pipeline_id`, os leads chegam no canal novo mas o Kanban não tem pipeline padrão definido. Incluí isso no SQL. (Verifiquei: o pipeline 1 pertence mesmo ao tenant 4 — não há vazamento entre tenants.)

### 5.3 Depois da migração, o canal antigo ainda pode "roubar" mensagens

O webhook de `gv_comercial_ia` continua **enabled** no Evolution, e o handler de webhook busca o canal por `instance_name` **sem filtrar `is_active`**. Então, se aquela instância um dia reconectar, as mensagens voltam a cair no canal 30 — mesmo marcado como inativo — e o histórico se parte de novo.

Marcar `is_active = false` (como você planejou) **não impede isso**. Para fechar de vez, seria preciso **desconectar/deletar a instância `gv_comercial_ia` no Evolution Manager** depois da migração. Não incluí isso no SQL porque é ação no Evolution, não no banco, e você pediu para não deletar nada lá — fica como recomendação para você decidir.

---

## 6. Plano SQL proposto para a Fase 2 (**não executado**)

### 6.1 Backup

O banco inteiro tem **47 MB** (`messages` 22 MB, `contacts` 1,7 MB) — dump completo é rápido e barato, melhor que dump seletivo:

```bash
pg_dump -h localhost -U eduflow -d eduflow_db -Fc \
  -f /home/ubuntu/backups/eduflow_pre_migracao_canal_$(date +%Y%m%d_%H%M%S).dump
```

### 6.2 Transação única

```sql
BEGIN;

-- Trava os dois canais para evitar corrida com mensagem chegando no meio
SELECT id FROM channels WHERE id IN (30, 43) FOR UPDATE;

-- Fotografia do "antes" (conferir na saída antes de commitar)
SELECT 'antes' fase, 'messages' t, COUNT(*) FROM messages WHERE channel_id=30
UNION ALL SELECT 'antes','contacts', COUNT(*) FROM contacts WHERE channel_id=30
UNION ALL SELECT 'antes','ccs', COUNT(*) FROM contact_channel_state WHERE channel_id=30
UNION ALL SELECT 'antes','form_submissions', COUNT(*) FROM form_submissions WHERE channel_id=30;

-- 1) Mensagens
UPDATE messages SET channel_id = 43 WHERE channel_id = 30;

-- 2) contact_channel_state — resolve conflitos ANTES de mover.
--    Hoje são 0, mas o canal novo está ativo: tratamos de forma defensiva.
--    Regra: vence o registro com updated_at mais recente.

--  2a) conflito em que o ANTIGO é mais velho ou igual -> descarta o antigo
DELETE FROM contact_channel_state a
USING contact_channel_state b
WHERE a.channel_id = 30 AND b.channel_id = 43
  AND a.contact_id = b.contact_id
  AND a.updated_at <= b.updated_at;

--  2b) conflito em que o ANTIGO é mais recente -> descarta o do canal novo
DELETE FROM contact_channel_state b
USING contact_channel_state a
WHERE a.channel_id = 30 AND b.channel_id = 43
  AND a.contact_id = b.contact_id
  AND a.updated_at > b.updated_at;

--  2c) move o que sobrou (sem conflito possível agora)
UPDATE contact_channel_state SET channel_id = 43 WHERE channel_id = 30;

-- 3) Resumos de conversa (0 linhas hoje, mantido por segurança)
UPDATE ai_conversation_summaries SET channel_id = 43 WHERE channel_id = 30;

-- 4) Contatos
UPDATE contacts SET channel_id = 43 WHERE channel_id = 30;

-- 5) Landing page — leads novos passam a nascer no canal certo
UPDATE landing_pages SET channel_id = 43 WHERE channel_id = 30;

-- 6) Histórico de formulários
UPDATE form_submissions SET channel_id = 43 WHERE channel_id = 30;

-- 7) Configuração de IA e base de conhecimento
UPDATE ai_configs         SET channel_id = 43 WHERE channel_id = 30;
UPDATE knowledge_documents SET channel_id = 43 WHERE channel_id = 30;

-- 8) Herda o pipeline padrão (senão o Kanban do canal novo fica sem pipeline)
UPDATE channels
   SET default_pipeline_id = (SELECT default_pipeline_id FROM channels WHERE id = 30)
 WHERE id = 43 AND default_pipeline_id IS NULL;

-- 9) Aposenta o canal antigo — SEM deletar (delete apagaria call_logs/form_submissions)
UPDATE channels SET is_active = false WHERE id = 30;

-- Fotografia do "depois"
SELECT 'depois' fase, 'messages_30' t, COUNT(*) FROM messages WHERE channel_id=30
UNION ALL SELECT 'depois','messages_43', COUNT(*) FROM messages WHERE channel_id=43
UNION ALL SELECT 'depois','ccs_30', COUNT(*) FROM contact_channel_state WHERE channel_id=30
UNION ALL SELECT 'depois','ccs_43', COUNT(*) FROM contact_channel_state WHERE channel_id=43
UNION ALL SELECT 'depois','contacts_43', COUNT(*) FROM contacts WHERE channel_id=43;

-- Conferir os números acima. Se estiverem certos:
COMMIT;
-- Se algo estiver estranho: ROLLBACK;
```

### 6.3 Resultado esperado

| Métrica | Antes | Depois (esperado) |
|---|---:|---:|
| `messages` canal 30 → 43 | 8.188 → 0 | 0 → **8.188** |
| `contact_channel_state` 30 → 43 | 858 → 0 | 0 → **858** |
| `contacts` 30 → 43 | 1.424 → 0 | 0 → **1.424** |
| `form_submissions` 30 → 43 | 1.109 → 0 | 0 → **1.109** |
| `landing_pages` 30 → 43 | 1 → 0 | 0 → **1** |
| `ai_configs` / `knowledge_documents` | 1 / 5 → 0 | 0 → **1 / 5** |
| canal 30 `is_active` | true | **false** |
| canal 43 `default_pipeline_id` | NULL | **1** |

*(a linha de `contact_channel_state` assume zero conflitos, como está hoje; se surgir conflito entre agora e a execução, o total no canal 43 será 858 menos os descartados)*

### 6.4 Verificação pós-migração (Fase 2, item 4)

1. **Histórico por contato** — pegar 3 contatos com bastante histórico e conferir que tudo veio junto:
   ```sql
   SELECT contact_id, COUNT(*) FROM messages WHERE channel_id=43
   GROUP BY 1 ORDER BY 2 DESC LIMIT 3;
   ```
   Depois abrir esses 3 contatos na conversa pelo canal novo, na interface.
2. **Kanban** — comparar a distribuição de `lead_status` do canal 43 com a tabela do §4; tem que bater exatamente.
3. **Nenhum órfão** — as 15 tabelas devem retornar 0 para `channel_id = 30`.
4. **LP** — confirmar que uma nova submissão em `gv-sports-education` cria contato no canal 43.

---

## 7. Pontos para você decidir antes da Fase 2

1. **Confirmar os canais** — 30 (antigo) → 43 (novo). É isso mesmo?
2. **A landing page entra na migração?** Está no meu SQL (§6.2 item 5). É o que para a sangria de leads no canal morto — recomendo fortemente incluir.
3. **`ai_configs` + `knowledge_documents` migram junto?** Incluí. O agente de IA está com `is_enabled = false` hoje, então mover não liga nada sozinho; só mantém a configuração e as 5 fontes de conhecimento amarradas ao canal ativo.
4. **`form_submissions` migram?** Incluí (1.109 linhas de histórico). Se preferir deixar o histórico de formulários no canal antigo como registro, é só remover esse UPDATE.
5. **Instância antiga no Evolution** — depois da migração, quer que eu peça para você desconectar/deletar a `gv_comercial_ia` no Evolution Manager? Sem isso, o risco do §5.3 continua aberto. **Eu não vou tocar no Evolution.**
6. **Janela de execução** — o canal 43 está ativo. Quanto antes rodar, menor a chance de aparecer conflito em `contact_channel_state`. Se puder ser numa janela de baixo movimento, melhor.

---

# FASE 2 — MIGRAÇÃO EXECUTADA

**Aprovada e executada em 30/07/2026, 20:12–20:20.** Escopo conforme o §6.2 (incluindo landing page, `form_submissions`, `ai_configs`/`knowledge_documents` e herança do `default_pipeline_id`).

## 8. Backup

Dump completo do banco, formato custom:

```
/home/ubuntu/backups/eduflow_pre_migracao_20260730_201228.dump   (4,6 MB)
```

Validado com `pg_restore -l`: **592 entradas**, com as 8 tabelas afetadas presentes.

> Nota: o `pg_dump` como usuário `eduflow` **falhou** — `permission denied for table subscriptions` (o usuário da aplicação não é dono dessa tabela). O dump foi feito como superusuário `postgres`. Vale saber disso para futuras rotinas de backup: um backup rodando como `eduflow` sairia **incompleto**.

## 9. Execução

Script: `backend/migracao_canal_30_para_43.sql` — transação única, com `SELECT ... FOR UPDATE` nos dois canais e um bloco de asserções que aborta tudo se qualquer número divergir.

```
NOTICE:  Todas as assercoes passaram.
COMMIT
=== EXIT CODE: 0 ===
```

### Surgiu 1 conflito real — o tratamento defensivo foi usado

Na Fase 1 os conflitos eram **zero**. Entre a investigação e a execução, o canal novo recebeu **2 mensagens** e criou 2 registros em `contact_channel_state`, gerando um conflito:

```
 contact_id | status_antigo |         upd_antigo         | status_novo |          upd_novo          |   decisao
------------+---------------+----------------------------+-------------+----------------------------+-------------
      10609 | novo          | 2026-07-28 16:42:42.194696 | novo        | 2026-07-30 20:06:00.935684 | mantem_novo
```

Resolvido pela regra combinada (vence o `updated_at` mais recente): manteve o registro do canal novo, descartou o do antigo. Os dois lados estavam em `lead_status = 'novo'`, então não houve perda de etapa de funil.

Foi exatamente o "alvo móvel" antecipado no §4 — a decisão de escrever o SQL tratando conflitos mesmo com zero conflitos na investigação evitou um `UNIQUE violation` que teria abortado a migração.

## 10. Antes e depois

| Tabela | Antes (canal 30) | Antes (canal 43) | **Depois (canal 43)** | Canal 30 |
|---|---:|---:|---:|---:|
| `messages` | 8.188 | 2 | **8.190** | 0 |
| `contacts` | 1.425 | 0 | **1.425** | 0 |
| `form_submissions` | 1.110 | 0 | **1.110** | 0 |
| `contact_channel_state` | 858 | 2 | **859** | 0 |
| `knowledge_documents` | 5 | 0 | **5** | 0 |
| `ai_configs` | 1 | 0 | **1** | 0 |
| `landing_pages` | 1 | 0 | **1** | 0 |
| `ai_conversation_summaries` | 0 | 0 | 0 | 0 |

*`contact_channel_state`: 858 + 2 − 1 (conflito descartado) = **859**. ✅*

Os números do "antes" ficaram levemente acima do levantamento da Fase 1 (8.188→+2 msgs, 1.424→1.425 contatos, 1.109→1.110 submissões) porque o sistema continuou operando entre as duas fases.

### Estado dos canais

```
 id |       name        | is_active | is_connected | default_pipeline_id
----+-------------------+-----------+--------------+---------------------
 30 | GV Comercial IA   |     f     |      f       |          1
 43 | CRM GV COMERCIAL  |     t     |      t       |          1   <- herdado
```

Canal 30 **desativado, não deletado** — `call_logs`, `form_submissions` e todo o resto preservados, como você pediu.

## 11. Verificação

**Órfãos:** varredura nas **15 tabelas** com coluna `channel_id` → **0 linhas** apontando para o canal 30. (As 437 linhas em `bkp_clean_20260716_ccs` são a tabela de backup de uma limpeza anterior, deliberadamente não migrada.)

**Histórico de conversa** (via API, autenticado como Gustavo — `GET /api/contacts/{wa_id}/messages`):

| Contato | wa_id | Mensagens | Período |
|---|---|---:|---|
| Matheus Menegueli | 12393064163 | **110** | 20/04 → 23/06 |
| Diego Fernandes | 5511981416747 | **98** | 26/04 → 09/05 |
| Daniel Batista | 558398906968 | **74** | 11/06 → 30/07 |

Os três batem exatamente com o banco. O terceiro é justamente o contato **10609**, o do conflito — histórico íntegro.

**Kanban / pipeline** (`GET /api/contacts?channel_id=…`):

| Consulta | Resultado |
|---|---|
| `channel_id=43` | **954 contatos** — idêntico aos 954 contatos com histórico apurados na Fase 1 |
| `channel_id=43&pipeline_id=1` | 418 contatos |
| `channel_id=43&pipeline_id=9` | 20 contatos |
| `channel_id=30` | **0 contatos** |

Distribuição de `lead_status` no canal 43: **as 22 etapas preservadas**, com os mesmos totais da linha de base do §4 (`desqualificado` 339, `perdido` 138, `encerramento` 41, `follow_up` 20…). A única diferença é `novo` 211 → **212**, o contato que o canal novo captou no intervalo. Total 859.

**Lista de canais** (`GET /api/channels` como Gustavo): retorna **apenas o canal 43**, com `default_pipeline_id = 1`. O canal 30 sumiu da interface, como esperado (o endpoint filtra `is_active = true`).

> Detalhe técnico útil: a visão por canal resolve os contatos por **`Message.channel_id`**, não por `Contact.channel_id` (que o próprio código comenta ser "só o canal de criação"). Foi a migração das 8.190 mensagens que fez os 954 contatos aparecerem sob o canal novo. Sem `channel_id` na query, o endpoint cai no campo legado `Contact.pipeline_id` e devolve a visão do tenant inteiro (543) — não é o Kanban do canal.

## 12. Pendências

1. **Instância antiga ainda vinculada no Evolution — risco em aberto.** `gv_comercial_ia` continua existindo, com webhook **enabled**, e o handler de webhook busca canal por `instance_name` **sem filtrar `is_active`**. Se aquela instância reconectar, mensagens voltam a cair no canal 30 (inativo) e o histórico se parte de novo. Fechar isso exige **desconectar/deletar a instância no Evolution Manager** — ação sua; não toquei no Evolution.
2. **Canal 30 continua no banco**, inativo e invisível na UI. Nada a fazer a menos que você queira removê-lo depois — e aí vale lembrar que o `delete_instance` apaga `call_logs`/`form_submissions` do canal.
3. **Backup de rotina pode estar saindo incompleto** — ver a nota do §8 sobre o `permission denied` em `subscriptions` quando o dump roda como `eduflow`.
4. **`bkp_clean_20260716_ccs`** (437 linhas) segue apontando para o canal 30. É tabela de backup de limpeza anterior; se não tem mais serventia, pode ser descartada em outra rodada.
5. **Backup retido** em `/home/ubuntu/backups/eduflow_pre_migracao_20260730_201228.dump`. Sugiro manter por alguns dias antes de descartar.
