# Relatório — Correções aplicadas (erro 500 em `/api/evolution/instances/{name}/status`)

**Data:** 30/07/2026
**Base:** `RELATORIO_ERRO_500_STATUS.md`
**Escopo:** Etapas 1 a 10 conforme solicitado. O handler `MESSAGES_UPSERT` e todo o fluxo de recebimento de mensagens/webhooks ficaram **intocados** nesta rodada.

---

## 1. Resumo

Todas as 10 etapas foram executadas e validadas. O erro 500 não ocorre mais: o endpoint responde **200** com degradação graciosa, e a causa raiz (duplicação de `instance_name`) agora é impedida em **três camadas** — geração de nome com prefixo de tenant, checagem 409 na aplicação, e constraint UNIQUE no banco.

Além do previsto, a rodada fechou uma **falha de segurança relevante**: `status`, `qrcode`, `delete` e `logout` eram endpoints **sem autenticação nenhuma** — qualquer pessoa com acesso à API podia deletar a instância WhatsApp de qualquer tenant. Isso está corrigido e testado.

| Etapa | Status |
|---|---|
| 1 — Limpeza do canal fantasma | ✅ concluída |
| 2 — Validação de resposta no client | ✅ concluída |
| 3 — Criação à prova de duplicata | ✅ concluída |
| 4 — Status resiliente | ✅ concluída |
| 5 — Delete e logout tolerantes | ✅ concluída |
| 6 — Auth e escopo de tenant | ✅ concluída (frontend já enviava auth — sem mudança) |
| 7 — Constraint UNIQUE | ✅ aplicada em produção |
| 8 — Segredos fora do código | ✅ concluída (rotação da chave pendente — manual) |
| 9 — Erro visível no polling | ✅ concluída e **em produção** |
| 10 — Verificação final | ✅ concluída |

---

## 2. O que mudou em cada arquivo

### `backend/app/evolution/client.py` (+52/-8)

- Nova exceção **`EvolutionAPIError(RuntimeError)`** com `status_code` e `body`.
- Novo helper **`_check(res)`**: levanta `EvolutionAPIError` se `status_code >= 400` (com `res.text[:300]`) ou se o corpo não for JSON válido.
- `_check` aplicado em **5 funções de gestão de instância**: `create_instance`, `get_instance_status`, `get_qrcode`, `delete_instance`, `logout_instance`.
- **Funções de envio intocadas** conforme instruído: `send_text`, `send_media`, `send_audio`, `send_buttons`, `get_profile_picture`, `list_instances`.
- **Decisão de projeto a registrar:** dentro de `create_instance`, a chamada `webhook/set` **não** levanta exceção quando falha — apenas loga `WARNING` e devolve `webhook_configured: false`. Levantar ali deixaria uma instância órfã no Evolution (criada, mas sem canal no banco), que é exatamente o tipo de inconsistência que esta rodada existe para eliminar.

### `backend/app/evolution/config.py` (+21/-5)

- `EVOLUTION_API_KEY` agora vem de `os.getenv` **sem default**; ausente ⇒ `RuntimeError` no import, derrubando o startup com mensagem clara.
- **Chave real removida do código.**
- `load_dotenv()` chamado explicitamente no módulo: `app.main` importa `app.evolution.routes` (linha 40) **antes** do seu próprio `load_dotenv()` (linha 60), então depender da ordem de import era frágil.
- `EVOLUTION_API_URL` e `EDUFLOW_WEBHOOK_URL` seguem com default (não são segredos), mas agora estão no `.env`.

### `backend/app/evolution/routes.py` (+164/-50)

- Nova função **`build_instance_name(name, tenant_id)`** → `f"t{tenant_id}_{slug}"`.
- Novo helper **`_tenant_channels(db, instance_name, tenant_id)`**: usa `.scalars().all()`, filtra por tenant e **loga ERROR com os ids** se vier mais de um canal (defesa em profundidade).
- **`create_instance`**: gera nome prefixado → checa duplicata em qualquer tenant (**409**) → chama o Evolution → **só grava o `Channel` se o Evolution confirmou**. Erro do Evolution vira **502**, não 500. Falha ao buscar QR code virou `WARNING` + `qrcode: null` (o canal já existe; não deve virar 500).
- **`get_status`**: falha externa/resposta inválida ⇒ `WARNING` + `{"state": "unknown", "is_connected": false}` com **HTTP 200**. Atualiza `is_connected` em **todos** os canais retornados.
- **`delete_instance`**: `.scalars().all()`, processa cada canal, falha no Evolution segue tolerada (agora com `WARNING` em vez de `pass` silencioso), commit único ao final.
- **`logout_instance`**: `.scalars().all()`; falha externa vira **502** com mensagem amigável.
- **Auth + tenant** (`Depends(get_current_user)` + `Depends(get_tenant_id)`) em `status`, `qrcode`, `delete` e `logout`; canal de outro tenant ⇒ **404**.
- **Rotas de webhook intocadas** — seguem públicas, como exigido.

### `frontend/src/app/canais/page.tsx` (+38/-6)

- `pollFailuresRef` (contador de falhas consecutivas) e `statusError` (mapa `instance_name → boolean`).
- No `catch` do polling (antes só `// silent polling error`): `console.error` com **endpoint + mensagem**, e após **3 falhas consecutivas** o `setInterval` é limpo, `qrStatus` vira `error` e aparece um toast.
- Card do canal ganhou terceiro estado visual (âmbar): **"Não foi possível verificar o status"**, distinto de "Conectado"/"Desconectado".

### Arquivos novos

- **`backend/migration_unique_instance_name.sql`** — índice UNIQUE parcial, no padrão dos `migration_*.sql` existentes.
- **`backend/.env.example`** — não existia no projeto; criado com placeholders para todas as variáveis (nenhum valor real).

### `backend/.env` (não versionado)

Adicionadas `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` (valor **atual**, sem rotação) e `EDUFLOW_WEBHOOK_URL`, com comentário alertando sobre a rotação pendente.

---

## 3. Resultado das verificações

### Etapa 1 — limpeza

Conferidas **15 tabelas** (todas as FKs para `channels` + `contact_tags` via contatos) para o canal 40: **zero linhas em todas**.

```
contacts 0 | messages 0 | call_logs 0 | form_submissions 0 | voice_scripts 0
landing_pages 0 | ai_configs 0 | ai_conversation_summaries 0 | automation_flows 0
chatbot_sessions 0 | contact_channel_state 0 | knowledge_documents 0 | schedules 0
webhook_configs 0 | contact_tags 0
```

Após `DELETE FROM channels WHERE id = 40;`:

```
 id | tenant_id | name  | instance_name | is_active | is_connected
----+-----------+-------+---------------+-----------+--------------
 38 |         1 | teste | teste         | t         | f
(1 row)
```

Check de duplicados: **0 linhas**.

### Etapa 7 — constraint

```
"uq_channels_instance_name" UNIQUE, btree (instance_name)
    WHERE instance_name IS NOT NULL AND instance_name::text <> ''::text
```

Teste de bloqueio (em transação revertida):

```
ERROR:  duplicate key value violates unique constraint "uq_channels_instance_name"
DETAIL:  Key (instance_name)=(teste) already exists.
```

> Nota: o predicado inclui `<> ''` além de `IS NOT NULL`. O canal 27 (Instagram) tem `instance_name` **NULL** de verdade — verificado —, mas string vazia não seria tratada como distinta pelo Postgres, e dois canais não-Evolution com `''` quebrariam a criação de canais no futuro.

### Etapa 8 — fail-fast da chave

```
RuntimeError: EVOLUTION_API_KEY não configurada. Defina a variável no .env do backend
(ou no EnvironmentFile do systemd) antes de subir a aplicação. Veja backend/.env.example.
```

### Etapa 10 — startup e endpoints

Backend reiniciado (PID 1054223): `Application startup complete` — sem erros.

| Teste | Esperado | Obtido |
|---|---|---|
| `GET .../teste/status` **sem auth** | 401 | ✅ **401** |
| `GET .../teste/status` **tenant 1** (dono) | 200, sem 500 | ✅ **200** `{"state":"unknown","is_connected":false}` |
| `GET .../teste/status` **tenant 4** (não-dono) | 404 | ✅ **404** `{"detail":"Canal não encontrado"}` |
| `POST /instances` `{"name":"QA Dup Test"}` | prefixo `t1_` | ✅ **200** `{"channel_id":41,"instance_name":"t1_qa_dup_test","webhook_configured":true}` |
| Instância aparece no Evolution | 200 | ✅ **200** em `connectionState/t1_qa_dup_test` |
| `POST /instances` mesmo nome de novo | 409 | ✅ **409** `"Já existe um canal com o nome 'QA Dup Test'"` |
| `POST /instances` `{"name":"qa-dup-test"}` (variação de grafia) | 409 | ✅ **409** — o slug normaliza maiúsculas/hífen/espaço |
| `DELETE` por **tenant 4** (não-dono) | 404, sem deletar | ✅ **404**; canal e instância **intactos** |
| `DELETE` por **tenant 1** (dono) | remove dos dois lados | ✅ **200**; banco `0 linhas`, Evolution **404** |
| `npx tsc --noEmit` (frontend) | sem erros | ✅ exit 0 |

O canal de teste `t1_qa_dup_test` foi **removido** ao final — banco e Evolution limpos. Estado final: **12 canais, 0 duplicados**.

### Sobre o `state: "unknown"` no teste do canal `teste`

Durante a verificação, a instância `teste` **deixou de existir no Evolution**:

```
{"status":404,"error":"Not Found","response":{"message":["The \"teste\" instance does not exist"]}}
```

O Evolution passou de **11 para 10 instâncias** entre 18:54 e 19:26. **Não fui eu** — nesta rodada só executei `GET` no Evolution, mais a criação/remoção do `t1_qa_dup_test`. A instância foi removida por fora (provavelmente manualmente no Evolution Manager).

Isso na prática **virou um bom teste do comportamento novo**: o canal 38 agora é órfão (canal no banco sem instância no Evolution — a hipótese (b) do relatório original, que na investigação era falsa e agora é verdadeira). Com o código antigo isso seria mais um **500**; com o novo, retorna **200** com `state: "unknown"`. Exatamente o previsto na Etapa 4.

---

## 4. Pendências

### 4.1 Rotação manual da chave do Evolution — **ação necessária**

A chave `c4772f...efc304` **não foi rotacionada** (conforme instruído). Ela está no `.env` e removida do código, **mas**:

> `backend/app/evolution/config.py` **é versionado no git** — a chave está no **histórico do repositório**. Removê-la do arquivo atual não a remove do histórico.

Passos: gerar nova chave no Evolution Manager → substituir `EVOLUTION_API_KEY` em `backend/.env` → `sudo systemctl restart eduflow-backend.service`. Nenhuma mudança de código é necessária.

### 4.2 `MESSAGES_UPSERT` — adiado por decisão

`routes.py:460` segue com `scalar_one_or_none()` e o webhook segue respondendo `200 OK` ao engolir exceções. Com a constraint UNIQUE ativa, o gatilho original (duplicatas) está bloqueado, então o risco imediato caiu bastante — mas o padrão "erro vira 200 e a mensagem some" continua lá para outras causas de exceção. Fica para a rodada separada, como combinado.

### 4.3 Canal do tenant 4 — decisão de produto

O canal 40 foi removido. Se o tenant 4 realmente precisa de um canal WhatsApp, basta criar pela UI: o nome agora vira `t4_<slug>`, sem colidir com o do tenant 1. **Nenhuma ação de código necessária** — só confirmar se era engano ou necessidade real.

### 4.4 Canal `teste` (id 38, tenant 1) está órfão

A instância foi deletada do Evolution por fora. O canal continua no banco e responderá `state: "unknown"` para sempre. Decidir entre: deletar o canal (`DELETE /api/evolution/instances/teste` autenticado como tenant 1 — já testado e funcionando), ou recriar a instância. Não agi por conta própria por estar fora do escopo autorizado.

### 4.5 Frontend — deploy concluído

Build e restart executados após confirmação explícita (havia indisponibilidade de alguns segundos em `portal.eduflowia.com`):

```
✓ Compiled successfully in 63s
✓ Generating static pages (43/43)
├ ○ /canais
```

| Verificação | Resultado |
|---|---|
| `systemctl is-active eduflow-frontend` | ✅ active |
| `GET http://127.0.0.1:3000/canais` | ✅ **200** (40 ms) |
| `GET https://portal.eduflowia.com/canais` | ✅ **200** |
| String da Etapa 9 no bundle | ✅ presente no chunk do cliente e no SSR |

**Ressalva honesta:** confirmei que a página **carrega** (HTTP 200) e que o código novo está no bundle servido, mas **não verifiquei o console do navegador** — não tenho acesso a browser neste ambiente. A verificação "sem erros no console" da Etapa 10 continua pendente de conferência visual por você, abrindo a página de canais com o DevTools.

### 4.6 Observações menores (só registro, sem ação)

- **`list_instances` em `client.py` não recebeu `_check`** — não estava na lista das 5 funções da Etapa 2. É função de gestão e seria coerente incluir depois.
- **`ai_agent.py:49`** (`get_channel_id_for_contact`) ainda usa `scalar_one_or_none()` — fica no fluxo de IA/mensagens, deliberadamente fora desta rodada.
- **Delete de instância órfã via API ficou mais restrito:** com o filtro de tenant, só é possível deletar canal que exista no banco para aquele tenant. Limpar uma instância que exista **só** no Evolution agora exige o Evolution Manager. Foi uma troca consciente — o comportamento anterior permitia deleção sem autenticação alguma.
- **Segredos hardcoded em `config.py` e vizinhos:** varredura em todo o `backend/app/` encontrou **apenas** a chave do Evolution. Todos os demais segredos (OpenAI, Twilio, ElevenLabs, Stripe, Instagram, Composio, SMTP) já vinham de `os.getenv`/`.env`. O `.env` **não está versionado** (confirmado: coberto pelo `.gitignore` e ausente do índice do git).
- **`JWT_SECRET` tem default fraco** em `app/auth.py:17` (`"eduflow-secret-2025"`, 19 bytes — o PyJWT emite `InsecureKeyLengthWarning`). Não está no `.env`, então o default está em uso. Fora do escopo desta rodada; vale tratar junto com a rotação do item 4.1.
- Para os testes autenticados emiti **dois tokens JWT de 10 minutos** (usuários id 3 / tenant 1 e id 8 / tenant 4) via `create_access_token`. Já expiraram; nenhuma senha foi alterada ou lida.
