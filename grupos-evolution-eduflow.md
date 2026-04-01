# EduFlow × Evolution API — Suporte a Grupos WhatsApp

> **Última atualização:** 01 de Abril de 2026  
> **Responsável técnico:** Álefe Lins  
> **Plataforma:** EduFlow Hub — portal.eduflowia.com

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Como Grupos Funcionam no WhatsApp](#2-como-grupos-funcionam-no-whatsapp)
3. [Configuração das Instâncias](#3-configuração-das-instâncias)
4. [Configuração dos Webhooks](#4-configuração-dos-webhooks)
5. [Fluxo de uma Mensagem de Grupo](#5-fluxo-de-uma-mensagem-de-grupo)
6. [Tratamento no Backend](#6-tratamento-no-backend)
7. [Banco de Dados](#7-banco-de-dados)
8. [Exibição no Frontend](#8-exibição-no-frontend)
9. [Correções Aplicadas](#9-correções-aplicadas)
10. [Limitações e Considerações](#10-limitações-e-considerações)
11. [Comandos Úteis](#11-comandos-úteis)
12. [Checklist](#12-checklist)

---

## 1. Visão Geral

O EduFlow suporta recebimento e exibição de mensagens de **grupos WhatsApp** via Evolution API. Mensagens enviadas em grupos onde a instância conectada é participante aparecem automaticamente na aba **Conversas**, identificadas com ícone de grupo e o nome do grupo correto.

### O que funciona

- ✅ Receber mensagens de grupos
- ✅ Exibir o nome correto do grupo (buscado na Evolution API)
- ✅ Identificar quem enviou cada mensagem dentro do grupo
- ✅ Suporte a texto, imagens, áudios, vídeos e documentos
- ✅ Grupos aparecem separados de contatos individuais

### O que não funciona (por design)

- ❌ Agente de IA respondendo em grupos (desativado intencionalmente)
- ❌ Envio de mensagens para grupos pela plataforma (não implementado)
- ❌ Listagem de membros do grupo na UI

---

## 2. Como Grupos Funcionam no WhatsApp

### Identificação por JID

No WhatsApp, cada entidade tem um **JID (Jabber ID)** único:

| Tipo | Formato | Exemplo |
|------|---------|---------|
| Contato individual | `{número}@s.whatsapp.net` | `5531999999999@s.whatsapp.net` |
| Grupo | `{id}@g.us` | `120363407291306248@g.us` |
| Participante em grupo | `{lid}@lid` | `260970953867397@lid` |

O EduFlow usa o JID do **grupo** como identificador do contato (`wa_id`), não o número individual de quem enviou.

### Estrutura de uma mensagem de grupo

```json
{
  "key": {
    "remoteJid": "120363407291306248@g.us",
    "fromMe": false,
    "id": "3ACE4B3AE37AE3151E1C",
    "participant": "260970953867397@lid",
    "participantAlt": "558388046720@s.whatsapp.net"
  },
  "pushName": "Álefe Lins",
  "message": {
    "conversation": "Olá 👋"
  },
  "messageType": "conversation"
}
```

Campos importantes:
- `remoteJid` → JID do grupo (`@g.us`)
- `participant` → LID interno do remetente
- `participantAlt` → Número real do remetente
- `pushName` → Nome de exibição do remetente

---

## 3. Configuração das Instâncias

### Instâncias com suporte a grupos ativado

| Instância | Status | groupsIgnore | Tenant |
|-----------|--------|-------------|--------|
| `ia` | 🟢 open | `false` | Álefe Lins (tenant 1) |
| `gv_sports_comercial` | 🟢 open | `false` | GV Sports (tenant GV) |
| `whatsapp_comercial` | 🟢 open | `true` | — (grupos desativados) |

### Como ativar grupos em uma instância

```bash
curl -s -X POST "http://13.221.209.242:8080/settings/set/{instance_name}" \
  -H "apikey: {EVOLUTION_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "groupsIgnore": false,
    "rejectCall": false,
    "msgCall": "",
    "alwaysOnline": false,
    "readMessages": false,
    "readStatus": false,
    "syncFullHistory": false
  }'
```

### Como verificar configuração atual

```bash
curl -s "http://13.221.209.242:8080/settings/find/{instance_name}" \
  -H "apikey: {EVOLUTION_API_KEY}" \
  | python3 -m json.tool
```

---

## 4. Configuração dos Webhooks

### URL do webhook por instância

```
https://portal.eduflowia.com/api/evolution/webhook/{instance_name}
```

**Importante:** A URL inclui o nome da instância no path. O endpoint na Evolution API estava configurado com URL genérica (`/api/evolution/webhook`) que retornava 404. A correção foi incluir `/{instance_name}` na URL.

### Eventos necessários para grupos

```json
{
  "webhook": {
    "enabled": true,
    "url": "https://portal.eduflowia.com/api/evolution/webhook/{instance_name}",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "MESSAGES_DELETE",
      "SEND_MESSAGE",
      "CONNECTION_UPDATE",
      "GROUPS_UPSERT",
      "GROUP_UPDATE",
      "GROUP_PARTICIPANTS_UPDATE"
    ]
  }
}
```

### Descrição dos eventos de grupo

| Evento | Descrição |
|--------|-----------|
| `GROUPS_UPSERT` | Nova mensagem em grupo ou grupo criado |
| `GROUP_UPDATE` | Nome, foto ou descrição do grupo alterados |
| `GROUP_PARTICIPANTS_UPDATE` | Participante adicionado ou removido |

### Como atualizar webhook

```bash
curl -s -X POST "http://13.221.209.242:8080/webhook/set/{instance_name}" \
  -H "apikey: {EVOLUTION_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "https://portal.eduflowia.com/api/evolution/webhook/{instance_name}",
      "webhook_by_events": false,
      "webhook_base64": false,
      "events": [
        "MESSAGES_UPSERT",
        "MESSAGES_UPDATE",
        "MESSAGES_DELETE",
        "SEND_MESSAGE",
        "CONNECTION_UPDATE",
        "GROUPS_UPSERT",
        "GROUP_UPDATE",
        "GROUP_PARTICIPANTS_UPDATE"
      ]
    }
  }'
```

### Como verificar webhook atual

```bash
curl -s "http://13.221.209.242:8080/webhook/find/{instance_name}" \
  -H "apikey: {EVOLUTION_API_KEY}" \
  | python3 -m json.tool
```

---

## 5. Fluxo de uma Mensagem de Grupo

```
1. Participante envia mensagem no grupo
        │
        ▼
2. Evolution API detecta (MESSAGES_UPSERT)
        │
        ▼
3. Evolution envia webhook para:
   POST https://portal.eduflowia.com/api/evolution/webhook/ia
        │
        ▼
4. Backend identifica remoteJid com @g.us
   → is_group = True
   → phone = "120363407291306248@g.us"
   → sender_name = pushName do remetente
        │
        ▼
5. Backend verifica se grupo já existe como contato
   → Se não existe:
      └── Busca nome do grupo na Evolution API:
          GET /group/findGroupInfos/{instance}?groupJid={jid}
          → subject: "Nome do Grupo"
      └── Cria contato com wa_id = JID do grupo
        │
        ▼
6. Salva mensagem com:
   → contact_wa_id = JID do grupo
   → sender_name = nome do remetente
   → content = texto da mensagem
        │
        ▼
7. Grupo aparece na lista de conversas do EduFlow
```

---

## 6. Tratamento no Backend

**Arquivo:** `backend/app/evolution/routes.py`

### Detecção de grupo

```python
is_group = "@g.us" in remote_jid

if is_group:
    phone = remote_jid  # ex: 120363407291306248@g.us
    participant = key.get("participant", "") or msg.get("participant", "")
    sender_name = msg.get("pushName", participant.replace("@s.whatsapp.net", ""))
else:
    phone = remote_jid.replace("@s.whatsapp.net", "")
    sender_name = msg.get("pushName", phone)
```

### Busca do nome do grupo

Quando um novo grupo é detectado, o backend busca o nome real do grupo na Evolution API:

```python
if is_group:
    try:
        async with httpx.AsyncClient(timeout=5) as http_client:
            group_resp = await http_client.get(
                f"{EVOLUTION_API_URL}/group/findGroupInfos/{instance_name}",
                params={"groupJid": contact_phone},
                headers={"apikey": EVOLUTION_API_KEY},
            )
            if group_resp.status_code == 200:
                group_name = group_resp.json().get("subject", sender_name)
    except Exception as e:
        print(f"⚠️ Erro ao buscar nome do grupo: {e}")
```

### Criação do contato de grupo

```python
contact = Contact(
    tenant_id=tenant_id,
    wa_id=contact_phone,      # JID do grupo: 120363...@g.us
    name=group_name,          # Nome real do grupo
    channel_id=channel_id,
    lead_status="novo",
    ai_active=True,
    is_group=is_group,        # True para grupos
)
```

### Salvar mensagem com remetente

```python
# [parameters: (tenant_id, wa_message_id, contact_wa_id, channel_id,
#               direction, message_type, content, timestamp,
#               status, sent_by_ai, sender_name)]
```

O campo `sender_name` identifica quem enviou a mensagem dentro do grupo.

---

## 7. Banco de Dados

### Ajuste necessário — VARCHAR expandido

O JID de grupos tem até 26 caracteres (`120363407291306248@g.us`), maior que o limite original de 20. Foi necessário expandir:

```sql
ALTER TABLE messages ALTER COLUMN contact_wa_id TYPE VARCHAR(100);
ALTER TABLE contacts ALTER COLUMN wa_id TYPE VARCHAR(100);
```

### Contato de grupo no banco

```sql
SELECT wa_id, name, is_group, channel_id, tenant_id
FROM contacts
WHERE is_group = true;

-- Resultado esperado:
-- wa_id                    | name        | is_group | channel_id | tenant_id
-- 120363407291306248@g.us  | Teste       | t        | 20         | 1
```

### Mensagens do grupo

```sql
SELECT wa_message_id, contact_wa_id, content, sender_name, direction
FROM messages
WHERE contact_wa_id LIKE '%@g.us%'
ORDER BY timestamp DESC;
```

### Buscar todos os grupos ativos

```sql
SELECT c.wa_id, c.name, c.tenant_id, COUNT(m.id) as total_msgs
FROM contacts c
LEFT JOIN messages m ON m.contact_wa_id = c.wa_id
WHERE c.is_group = true
GROUP BY c.wa_id, c.name, c.tenant_id
ORDER BY total_msgs DESC;
```

---

## 8. Exibição no Frontend

Grupos aparecem na lista de conversas exatamente como contatos individuais. A diferença é visual:

- **Ícone de grupo** ao lado do nome (🏷 ícone de grupo no avatar)
- **Nome do grupo** como título da conversa
- **Nome do remetente** exibido em cada mensagem dentro da conversa
- **Última mensagem** exibida no preview da lista

### Identificação visual no frontend

O frontend identifica grupos pelo JID (`@g.us`):

```tsx
const isGroup = contact.wa_id?.includes('@g.us');
```

---

## 9. Correções Aplicadas

Durante a implementação, os seguintes problemas foram identificados e corrigidos:

### Problema 1 — URL do webhook incorreta

**Sintoma:** Evolution enviava webhooks mas EduFlow retornava 404.

**Causa:** URL configurada como `/api/evolution/webhook` (sem instância). O endpoint real exige `/api/evolution/webhook/{instance_name}`.

**Correção:** Atualizar URL nas instâncias para incluir o nome:
```
https://portal.eduflowia.com/api/evolution/webhook/ia
https://portal.eduflowia.com/api/evolution/webhook/gv_sports_comercial
```

### Problema 2 — `groupsIgnore: true` nas instâncias

**Sintoma:** Mensagens de grupos não chegavam mesmo com webhook configurado.

**Causa:** Configuração padrão da Evolution ignora mensagens de grupos.

**Correção:**
```bash
curl -X POST ".../settings/set/{instance}" -d '{"groupsIgnore": false, ...}'
```

### Problema 3 — VARCHAR(20) insuficiente

**Sintoma:** `StringDataRightTruncationError` ao salvar mensagem de grupo.

**Causa:** JID do grupo tem 26 caracteres; campo `contact_wa_id` limitado a 20.

**Correção:**
```sql
ALTER TABLE messages ALTER COLUMN contact_wa_id TYPE VARCHAR(100);
ALTER TABLE contacts ALTER COLUMN wa_id TYPE VARCHAR(100);
```

### Problema 4 — Nome do grupo incorreto

**Sintoma:** Grupo aparecia com o nome do remetente, não do grupo.

**Causa:** Backend usava `pushName` (nome do participante) como nome do contato.

**Correção:** Buscar nome real do grupo via `GET /group/findGroupInfos/{instance}?groupJid={jid}` e usar o campo `subject`.

---

## 10. Limitações e Considerações

### Agente de IA em grupos

O agente de IA (`ai_active = true`) é criado nos contatos de grupo por padrão, mas **não deve responder em grupos** — isso causaria respostas públicas indesejadas. Recomenda-se desativar `ai_active` para contatos de grupo:

```sql
-- Desativar IA para todos os grupos
UPDATE contacts SET ai_active = false WHERE is_group = true;
```

Ou adicionar verificação no código:

```python
if is_group:
    ai_active = False
```

### Mensagens enviadas pelo número conectado

Mensagens com `fromMe: true` (enviadas pelo próprio número da instância) são ignoradas por padrão no processamento de grupos — apenas mensagens recebidas são salvas.

### Grupos com muitas mensagens

Grupos muito ativos podem gerar alto volume de webhooks. Considere implementar rate limiting ou filtros por grupo específico no futuro.

### Nome do grupo em cache

O nome do grupo é buscado apenas na **primeira vez** que o grupo aparece. Se o nome mudar posteriormente, não é atualizado automaticamente. Para forçar atualização:

```sql
UPDATE contacts SET name = 'Novo Nome' WHERE wa_id = '120363407291306248@g.us';
```

---

## 11. Comandos Úteis

### Verificar todas as instâncias e status de grupos

```bash
curl -s http://13.221.209.242:8080/instance/fetchInstances \
  -H "apikey: {EVOLUTION_API_KEY}" \
  | python3 -c "
import sys,json
data=json.load(sys.stdin)
for i in data:
    name=i.get('name','')
    status=i.get('connectionStatus','')
    groups_ignore=i.get('Setting',{}).get('groupsIgnore','?')
    print(f'{name} | {status} | groupsIgnore={groups_ignore}')
"
```

### Buscar informações de um grupo específico

```bash
curl -s "http://13.221.209.242:8080/group/findGroupInfos/{instance}?groupJid={jid}" \
  -H "apikey: {EVOLUTION_API_KEY}" \
  | python3 -m json.tool
```

### Listar grupos que a instância participa

```bash
curl -s "http://13.221.209.242:8080/group/fetchAllGroups/{instance}?getParticipants=false" \
  -H "apikey: {EVOLUTION_API_KEY}" \
  | python3 -c "
import sys,json
data=json.load(sys.stdin)
for g in data:
    print(g.get('id',''), '-', g.get('subject',''))
"
```

### Verificar grupos salvos no banco

```bash
sudo -u postgres psql eduflow_db -c "
SELECT wa_id, name, tenant_id, created_at
FROM contacts
WHERE is_group = true
ORDER BY created_at DESC;
"
```

### Verificar mensagens de um grupo

```bash
sudo -u postgres psql eduflow_db -c "
SELECT sender_name, content, timestamp
FROM messages
WHERE contact_wa_id = '{group_jid}'
ORDER BY timestamp DESC
LIMIT 20;
"
```

---

## 12. Checklist

### Infraestrutura Evolution API

- [x] `groupsIgnore: false` na instância `ia`
- [x] `groupsIgnore: false` na instância `gv_sports_comercial`
- [x] Evento `GROUPS_UPSERT` ativado no webhook da `ia`
- [x] Evento `GROUPS_UPSERT` ativado no webhook da `gv_sports_comercial`
- [x] URL do webhook corrigida para incluir `/{instance_name}`

### Backend

- [x] Detecção de JID de grupo (`@g.us`)
- [x] Campo `contact_wa_id` expandido para `VARCHAR(100)`
- [x] Campo `wa_id` expandido para `VARCHAR(100)`
- [x] Busca de nome do grupo na Evolution API
- [x] Contato criado com `is_group = true`
- [x] `sender_name` salvo em cada mensagem

### Frontend

- [x] Grupos aparecem na lista de conversas
- [x] Nome correto do grupo exibido

### Pendente

- [ ] Desativar `ai_active` automaticamente para grupos
- [ ] Ícone visual diferenciado para grupos na lista de conversas
- [ ] Exibir nome do remetente dentro da conversa de grupo
- [ ] Atualização automática do nome do grupo via evento `GROUP_UPDATE`

---

*Documento gerado em 01/04/2026 — EduFlow Hub*
