# Relatório — Erro 500 recorrente em `GET /api/evolution/instances/teste/status`

**Data da investigação:** 30/07/2026
**Investigador:** Claude Code
**Escopo:** investigação somente leitura — nenhum código, dado ou instância do Evolution foi alterado.

---

## 1. Resumo executivo

**Causa raiz confirmada: hipótese (a) — canais duplicados no banco.**

Existem **2 linhas na tabela `channels` com `instance_name = 'teste'`**, pertencentes a **tenants diferentes** (tenant 1 e tenant 4). O `scalar_one_or_none()` da função `get_status` estoura `sqlalchemy.exc.MultipleResultsFound`, que o `except Exception` converte em `HTTPException(500)`.

As hipóteses (b) e (c) foram **descartadas com evidência direta**:

- **(b) canal órfão** — descartada: a instância `teste` **existe** no Evolution (`id ca48b2a7-c130-4cc4-a2e1-2a1b9f60ec26`).
- **(c) Evolution instável** — descartada: a API respondeu `HTTP 200` em **76 ms** no `fetchInstances` e **3,6 ms** no `connectionState/teste`.

Além disso, a investigação revelou **dois problemas mais graves que o 500 em si** (detalhados na seção 6):

1. **O mesmo bug provoca perda silenciosa de mensagens** no webhook `MESSAGES_UPSERT` (retorna `200 OK` engolindo a exceção — o Evolution nunca reenvia).
2. **Colisão entre tenants**: o canal do tenant 4 aponta para a instância WhatsApp do tenant 1. Isso é um risco de vazamento de dados multi-tenant, não apenas um erro de UI.

---

## 2. Ambiente

| Item | Valor |
|---|---|
| Execução do backend | **systemd** — `eduflow-backend.service` |
| Unit file | `/etc/systemd/system/eduflow-backend.service` |
| Comando | `uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 1` |
| PID | `834200` (ativo desde 07/07) |
| Logs | `journalctl -u eduflow-backend.service` (retenção: **23/04/2026 → hoje**) |
| Banco | PostgreSQL `eduflow_db` @ localhost:5432 |
| `EVOLUTION_API_URL` | **não definida no `.env`** → usa o default hardcoded em `app/evolution/config.py`: `http://100.26.100.8:8080` |

> **Observação:** `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EDUFLOW_WEBHOOK_URL` **não estão no `.env`** — o sistema roda inteiramente com os fallbacks hardcoded em `backend/app/evolution/config.py`, incluindo a API key em texto puro no código versionado. Não é a causa do 500, mas é um risco de segurança/configuração a tratar em separado.

---

## 3. Evidências

### 3.1 Traceback completo (do journal)

O `get_status` engole o traceback (`except Exception` → `HTTPException`), então o log da rota mostra apenas `500 Internal Server Error`. O **mesmo erro** aparece com traceback completo no handler de webhook, que faz a query idêntica:

```
Jul 30 18:43:39 ip-172-26-5-236 uvicorn[834200]: Traceback (most recent call last):
Jul 30 18:43:39 ip-172-26-5-236 uvicorn[834200]:   File "/home/ubuntu/eduflow/backend/app/evolution/routes.py", line 357, in webhook
Jul 30 18:43:39 ip-172-26-5-236 uvicorn[834200]:     channel = result.scalar_one_or_none()
Jul 30 18:43:39 ip-172-26-5-236 uvicorn[834200]:   File ".../sqlalchemy/engine/result.py", line 1504, in scalar_one_or_none
Jul 30 18:43:39 ip-172-26-5-236 uvicorn[834200]:     return self._only_one_row(
Jul 30 18:43:39 ip-172-26-5-236 uvicorn[834200]:   File ".../sqlalchemy/engine/result.py", line 825, in _only_one_row
Jul 30 18:43:39 ip-172-26-5-236 uvicorn[834200]:     raise exc.MultipleResultsFound(
Jul 30 18:43:39 ip-172-26-5-236 uvicorn[834200]: sqlalchemy.exc.MultipleResultsFound: Multiple rows were found when one or none was required
Jul 30 18:43:39 ip-172-26-5-236 uvicorn[834200]: ❌ Erro webhook Evolution [teste]: Multiple rows were found when one or none was required
Jul 30 18:43:39 ip-172-26-5-236 uvicorn[834200]: INFO:     127.0.0.1:40226 - "POST /api/evolution/webhook/teste HTTP/1.1" 200 OK
```

### 3.2 Reprodução direta do 500 (somente leitura)

```console
$ curl -s -w "\nHTTP:%{http_code}\n" http://127.0.0.1:8001/api/evolution/instances/teste/status
{"detail":"Multiple rows were found when one or none was required"}
HTTP:500

$ curl -s -w "\nHTTP:%{http_code}\n" http://127.0.0.1:8001/api/evolution/instances/gv_comercial_ia/status   # controle
{"instance_name":"gv_comercial_ia","state":"connecting","is_connected":false}
HTTP:200
```

O `detail` do 500 é literalmente a mensagem do `MultipleResultsFound` — o erro é **100% determinístico** e independe do Evolution.

### 3.3 Banco de dados

```sql
SELECT id, tenant_id, name, instance_name, is_active, is_connected, created_at
FROM channels WHERE instance_name = 'teste';
```

```
 id | tenant_id | name  | instance_name | is_active | is_connected |         created_at
----+-----------+-------+---------------+-----------+--------------+----------------------------
 38 |         1 | teste | teste         | t         | f            | 2026-07-30 13:55:04.645849
 40 |         4 | teste | teste         | t         | f            | 2026-07-30 18:43:39.158427
(2 rows)
```

Check geral de duplicados:

```sql
SELECT instance_name, COUNT(*) FROM channels
WHERE instance_name IS NOT NULL GROUP BY instance_name HAVING COUNT(*) > 1;
```

```
 instance_name | count
---------------+-------
 teste         |     2
(1 row)
```

**`teste` é o único `instance_name` duplicado** em toda a tabela (13 canais no total).

**A tabela `channels` não possui nenhuma constraint UNIQUE em `instance_name`** — os únicos índices são `channels_pkey` (id) e `idx_channels_tenant` (tenant_id). Nada no banco impede a duplicação.

Ambas as linhas duplicadas estão **sem dados dependentes**:

| id | tenant | mensagens | contatos | ai_configs | sessões chatbot | contact_channel_state |
|----|--------|-----------|----------|------------|-----------------|----------------------|
| 38 | 1      | 0         | 0        | 0          | 0               | 0                    |
| 40 | 4      | 0         | 0        | 0          | 0               | 0                    |

### 3.4 Evolution API — saudável, instância existe

```console
$ curl -H "apikey: <key>" http://100.26.100.8:8080/instance/fetchInstances
HTTP:200 time:0.076064s        # 11 instâncias retornadas

$ curl -H "apikey: <key>" http://100.26.100.8:8080/instance/connectionState/teste
{"instance":{"instanceName":"teste","state":"connecting"}}
HTTP:200 time:0.003628s
```

Metadados da instância `teste` no Evolution — **existe exatamente uma**:

```json
{
  "id": "ca48b2a7-c130-4cc4-a2e1-2a1b9f60ec26",
  "name": "teste",
  "connectionStatus": "connecting",
  "ownerJid": "5531953471207@s.whatsapp.net",
  "createdAt": "2026-07-30T13:55:04.719Z",
  "updatedAt": "2026-07-30T18:50:10.141Z",
  "disconnectionReasonCode": 401,
  "disconnectionObject": "{\"error\":{\"data\":{\"tag\":\"conflict\",\"attrs\":{\"type\":\"device_removed\"}}, ... \"message\":\"Stream Errored (conflict)\"}}"
}
```

> **Prova decisiva:** o `createdAt` do Evolution é `13:55:04.719Z` — bate com o `created_at` do canal **38** (`13:55:04.645`, tenant 1). A segunda criação (18:43:39, tenant 4) **não gerou instância nova no Evolution** — só existe uma — mas **inseriu a linha 40 no banco mesmo assim**. Ver seção 5.

---

## 4. Frequência do erro

Contagem no journal (janela de retenção completa: 23/04 → 30/07):

| Evento | Ocorrências | Quando |
|---|---|---|
| `GET /instances/teste/status` → **500** | **4** (reais) | 30/07 18:43:44, 18:43:47, 18:43:50, 18:43:53 |
| `GET /instances/teste/status` → **200 OK** | 9 | 30/07 13:55:13 → 13:55:37 (antes da duplicação) |
| `POST /webhook/teste` → `MultipleResultsFound` | **4** e contando | 30/07 18:43:39, 18:47:09, 18:50:40, 18:54:11 |

*(uma 5ª ocorrência de 500 às 18:50:45 é a reprodução manual desta investigação)*

**Leitura dos números:**

- Antes de 18:43 o endpoint era **100% saudável** (9/9 OK às 13:55, com apenas um canal). O erro nasceu exatamente no instante da duplicação.
- Os 4 erros de 18:43:44–18:43:53 são um burst de **9 segundos** — é o polling do frontend a cada 3 s enquanto o modal de QR code está aberto (`frontend/src/app/canais/page.tsx:178`, `setInterval(..., 3000)`).
- **O baixo total não indica baixa gravidade.** O contador só é baixo porque o modal de QR ficou aberto pouco tempo. O erro é determinístico: **toda vez que alguém abrir a tela de canais para `teste`, o loop de 500 recomeça e nunca termina** — o polling só para quando `is_connected` vira `true`, o que nunca acontece porque a resposta é sempre 500.
- Os erros de **webhook continuam acontecendo agora**, a cada ~3,5 minutos, sem intervenção de usuário (o Evolution reenvia `CONNECTION_UPDATE` enquanto a instância está `connecting`). Esses são invisíveis: o handler responde `200 OK`. Confirmado durante esta investigação: uma nova ocorrência (18:54:11) surgiu enquanto o relatório era escrito. As 4 ocorrências são as **únicas** em toda a retenção do journal (23/04 → 30/07) — ou seja, o problema nasceu hoje às 18:43 e está ativo.

---

## 5. Cruzamento — como a duplicata foi criada

Linha do tempo reconstruída a partir dos logs, do banco e da Evolution API:

| Horário (30/07) | Evento | Evidência |
|---|---|---|
| 13:55:04.645 | Tenant 1 cria canal "teste" → canal **id 38** | `channels.created_at` |
| 13:55:04.719 | Evolution cria a instância `teste` | `createdAt` da instância |
| 13:55:13 → 13:55:37 | 9× `GET .../teste/status` → **200 OK** | journal |
| **18:43:39.158** | Tenant 4 cria outro canal "teste" → canal **id 40** | `channels.created_at` |
| 18:43:39.440 | Webhook `CONNECTION_UPDATE [teste]` → **`MultipleResultsFound`** | traceback |
| 18:43:41 | `POST /api/evolution/instances` → **200 OK** | journal |
| 18:43:44 → 18:43:53 | 4× `GET .../teste/status` → **500** | journal |
| 18:47:09, 18:50:40 | Webhooks seguem falhando | journal |

**Mecanismo da falha, passo a passo:**

1. `create_instance` (`routes.py:38`) deriva `instance_name` do nome digitado pelo usuário — `req.name.lower().replace(" ", "_")` — **sem prefixo de tenant e sem checar se já existe**. Dois tenants que digitam "teste" produzem o mesmo `instance_name`.
2. O tenant 4 chamou `POST /instance/create` no Evolution para um nome já em uso. O Evolution **rejeitou** — provado pelo fato de o `createdAt` da instância continuar em `13:55:04.719Z` e existir **apenas uma** instância `teste`.
3. `client.create_instance` (`client.py:15`) faz `res.json()` **sem verificar `res.status_code`**. A resposta de erro do Evolution é um JSON válido, então nenhuma exceção é levantada.
4. `routes.py` não inspeciona o retorno e **insere a linha `Channel` mesmo assim** — nascendo o canal 40, órfão de instância própria e duplicado no `instance_name`.
5. A partir daí, **todo** `scalar_one_or_none()` filtrando por `instance_name == 'teste'` estoura.

Ou seja: a hipótese (a) é a causa direta do 500, mas ela é **consequência** da falha de validação descrita no ponto 3 — o `client.py` não validar `status_code`, exatamente como suspeitado no enunciado. As duas hipóteses do briefing são **a mesma cadeia causal**, não alternativas.

---

## 6. Impacto além do 500 (descobertas adicionais)

### 6.1 Perda silenciosa de mensagens — mais grave que o 500

`routes.py:382`, no handler `MESSAGES_UPSERT`, usa o **mesmo** `scalar_one_or_none()`. Quando chega uma mensagem de WhatsApp na instância `teste`:

- a query estoura `MultipleResultsFound`;
- o `except` do webhook captura, imprime `❌ Erro webhook` e responde **`200 OK`**;
- o Evolution interpreta `200` como sucesso e **nunca reenvia**;
- **a mensagem é perdida permanentemente, sem alarme.**

### 6.2 Colisão entre tenants — risco de vazamento multi-tenant

O canal 40 (tenant 4) e o canal 38 (tenant 1) apontam para a **mesma instância WhatsApp** (`ownerJid 5531953471207@s.whatsapp.net`, criada pelo tenant 1). Nenhuma das 6 queries por `instance_name` filtra por `tenant_id`.

Isso significa que **trocar `scalar_one_or_none()` por `.first()` não é uma correção suficiente** — resolveria o 500, mas passaria a atribuir de forma determinística e silenciosa todos os eventos de `teste` a um único tenant, potencialmente o errado. Mensagens do tenant 4 poderiam ser gravadas sob o tenant 1, ou vice-versa.

### 6.3 Todos os pontos de consulta afetados

As 6 ocorrências de `Channel.instance_name ==` usam `scalar_one_or_none()` e quebram igualmente:

| Arquivo:linha | Função | Efeito com duplicata |
|---|---|---|
| `app/evolution/routes.py:91` | `get_status` | **500 na tela de canais** (relatado) |
| `app/evolution/routes.py:114` | `delete_instance` | 500 — **impossível deletar o canal pela UI** |
| `app/evolution/routes.py:144` | `logout_instance` | 500 — impossível desconectar |
| `app/evolution/routes.py:355` | `webhook` / `CONNECTION_UPDATE` | status de conexão nunca atualiza |
| `app/evolution/routes.py:382` | `webhook` / `MESSAGES_UPSERT` | **perda silenciosa de mensagens** |
| `app/evolution/ai_agent.py:47` | `get_channel_id_for_contact` | agente de IA não resolve o canal |

> Consequência prática importante para o plano de correção: como `delete_instance` (linha 114) também estoura, **o canal duplicado não pode ser removido pela interface** — a limpeza precisa ser feita direto no banco, ou depois do deploy do fix de código.

### 6.4 O frontend mascara o erro

`frontend/src/app/canais/page.tsx:177-190` — o `catch` do polling tem apenas o comentário `// silent polling error`. O usuário vê o modal de QR girando indefinidamente sem nenhuma mensagem, enquanto o backend acumula 500 a cada 3 segundos. É por isso que o sintoma foi percebido como "loop" e não como erro.

---

## 7. Proposta de correção

> **Nada abaixo foi aplicado.** Conforme solicitado, esta seção é apenas proposta.

### (i) Limpeza de dados

Ambos os canais duplicados estão sem dados dependentes (0 mensagens, 0 contatos, 0 configs), então a limpeza é de baixo risco. Duas opções:

**Opção A — remover o canal 40 (recomendada).** O canal 40 (tenant 4) é o registro espúrio: nunca teve instância própria no Evolution, foi criado por uma chamada que o Evolution rejeitou, e não tem nenhum dado.

```sql
-- Conferir antes (deve retornar 0 em todas as colunas):
SELECT (SELECT COUNT(*) FROM messages WHERE channel_id=40) AS msgs,
       (SELECT COUNT(*) FROM contacts WHERE channel_id=40) AS contatos,
       (SELECT COUNT(*) FROM ai_configs WHERE channel_id=40) AS ai_cfg,
       (SELECT COUNT(*) FROM chatbot_sessions WHERE channel_id=40) AS sessoes,
       (SELECT COUNT(*) FROM contact_channel_state WHERE channel_id=40) AS ccs;

BEGIN;
DELETE FROM channels WHERE id = 40;
-- validar: a query abaixo deve retornar 1 linha
SELECT id, tenant_id, instance_name FROM channels WHERE instance_name = 'teste';
COMMIT;
```

**Opção B — renomear, se o tenant 4 realmente precisa de um canal.** Não basta renomear no banco: seria preciso **criar de fato** a instância no Evolution com o novo nome e reconfigurar o webhook, senão nasce um canal órfão (hipótese (b), que hoje não existe). Se o tenant 4 precisar de um canal, o caminho limpo é apagar a linha 40 e criar de novo pela UI com um nome distinto — **depois** do fix de código do item (ii), senão o mesmo bug se repete.

*Decisão a confirmar com o time:* o canal 40 (tenant 4) foi criado por engano ou o tenant 4 realmente queria um canal WhatsApp próprio?

**Verificação pós-limpeza:**

```console
curl -s -w "\nHTTP:%{http_code}\n" http://127.0.0.1:8001/api/evolution/instances/teste/status
# esperado: HTTP:200
journalctl -u eduflow-backend.service -f | grep "Erro webhook Evolution"
# esperado: silêncio
```

### (ii) Mudanças de código

Em ordem de prioridade:

**1. Validar `status_code` no `client.py` — impede que a duplicata volte a nascer.**

Nenhuma das funções de `client.py` checa `res.status_code` antes de `res.json()` (`create_instance`, `get_instance_status`, `get_qrcode`, `delete_instance`, `logout_instance`, `send_text`, `send_media`, `send_audio`, `list_instances`). Só `send_buttons` valida — e serve de modelo. Sugestão: usar `res.raise_for_status()`, ou um helper compartilhado que trate `res.status_code >= 400` e `res.json()` inválido, levantando exceção tipada.

**2. Não gravar o `Channel` se o Evolution rejeitou a criação.**

Em `routes.py:create_instance`, inspecionar o retorno de `client.create_instance` e abortar com `4xx` antes do `db.add(channel)` — hoje a linha é inserida incondicionalmente.

**3. Impedir a colisão na origem — `instance_name` único por tenant.**

- Prefixar `instance_name` com o tenant (ex.: `t4_teste`), **ou** checar duplicidade antes de criar e retornar `409 Conflict`.
- Adicionar constraint no banco como rede de segurança:
  ```sql
  CREATE UNIQUE INDEX CONCURRENTLY uq_channels_instance_name
    ON channels (instance_name) WHERE instance_name IS NOT NULL;
  ```
  *(exige que a limpeza do item (i) seja feita antes, senão a criação do índice falha)*
- **Cuidado:** se optar por prefixar, é uma mudança que afeta os canais existentes e os webhooks já registrados no Evolution — aplicar só a canais novos, ou planejar migração dos 13 canais atuais junto com o reregistro dos webhooks.

**4. Trocar `scalar_one_or_none()` nos 6 pontos da tabela em 6.3.**

Substituir por `.scalars().first()` com `.order_by(Channel.id)` para tornar determinístico, **e** — onde o `tenant_id` estiver disponível no contexto — adicionar o filtro por tenant. Isolar essa busca em um helper único (ex.: `get_channel_by_instance(db, instance_name, tenant_id=None)`) evita que os 6 call sites divirjam de novo. Isso torna o sistema resiliente a duplicatas em vez de apenas mascará-las.

**5. Não responder `200 OK` quando o webhook falha.**

`routes.py:webhook` engole qualquer exceção e responde `200`, o que faz o Evolution descartar o evento. Retornar `5xx` em falha inesperada (para o Evolution reenviar) e logar via `logger.exception` em vez de `print` — o módulo já tem um `logger` configurado na linha 15, mas o handler usa `print`.

**6. Deixar o erro visível no frontend.**

`canais/page.tsx:177-190` — no `catch` do polling, contar falhas consecutivas e, após N tentativas, parar o `setInterval` e exibir um toast. Hoje o loop é infinito e silencioso.

---

## 8. Comandos usados na investigação (todos read-only)

```bash
# Como o backend roda
systemctl cat eduflow-backend.service
ps aux | grep uvicorn

# Logs
journalctl -u eduflow-backend.service --since "48 hours ago" | grep "instances/teste/status"
journalctl -u eduflow-backend.service --since "7 days ago" | grep -E "Traceback|MultipleResultsFound|httpx|ConnectError|ReadTimeout"
journalctl -u eduflow-backend.service --since "2026-07-30 00:00" | grep "Erro webhook Evolution \[teste\]"

# Banco (SELECT apenas)
psql -h localhost -U eduflow -d eduflow_db -c "SELECT id, tenant_id, name, instance_name, is_active, is_connected FROM channels WHERE instance_name = 'teste';"
psql -h localhost -U eduflow -d eduflow_db -c "SELECT instance_name, COUNT(*) FROM channels WHERE instance_name IS NOT NULL GROUP BY instance_name HAVING COUNT(*) > 1;"
psql -h localhost -U eduflow -d eduflow_db -c "\d channels"

# Evolution API (somente GET)
curl -H "apikey: <key>" http://100.26.100.8:8080/instance/fetchInstances
curl -H "apikey: <key>" http://100.26.100.8:8080/instance/connectionState/teste

# Reprodução do erro (GET)
curl http://127.0.0.1:8001/api/evolution/instances/teste/status
```

Nenhum `DELETE`, `POST` ou `UPDATE` foi executado — nem no banco, nem no Evolution API.
