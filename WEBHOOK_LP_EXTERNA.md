# Integração Webhook — LP Externa → EduFlow

Guia prático para conectar qualquer landing page externa ao EduFlow, fazendo o lead cair automaticamente no WhatsApp com a IA ativa.

---

## Como funciona

```
Lead preenche formulário na LP externa
        ↓
LP envia os dados para a URL do webhook
        ↓
EduFlow cria o contato automaticamente
        ↓
Sistema envia mensagem de boas-vindas no WhatsApp
        ↓
IA assume o atendimento
```

---

## Passo 1 — Gerar a URL do webhook

1. Acesse o EduFlow → **Automações** → aba **Webhooks LP Externa**
2. Clique em **Novo webhook**
3. Preencha:
   - **Nome:** identifica a origem (ex: "Site Principal", "LP Google Ads")
   - **Canal WhatsApp:** qual número vai atender esse lead
   - **Mensagem de boas-vindas:** primeira mensagem enviada automaticamente
4. Clique em **Criar webhook**
5. Copie a URL gerada

> A URL tem este formato:
> `https://portal.eduflowia.com/api/webhook/lead/{TOKEN}`

---

## Passo 2 — Campos aceitos

O webhook aceita os seguintes campos em formato JSON:

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | string | ✅ Sim | Nome completo do lead |
| `phone` | string | ✅ Sim | Telefone (com ou sem DDI) |
| `course` | string | Não | Curso de interesse |
| `email` | string | Não | E-mail do lead |

**Formato do telefone aceito:**
- `83988046720` — sem DDI (sistema adiciona 55 automaticamente)
- `5583988046720` — com DDI 55
- `(83) 98804-6720` — com máscara (sistema limpa automaticamente)
- `+55 83 98804-6720` — formato internacional

---

## Implementações

### HTML puro

```html
<form id="form-lead">
  <input type="text" id="nome" placeholder="Seu nome" required />
  <input type="tel" id="telefone" placeholder="Seu WhatsApp" required />
  <input type="text" id="curso" placeholder="Curso de interesse" />
  <input type="email" id="email" placeholder="Seu e-mail" />
  <button type="submit">Quero saber mais</button>
</form>

<script>
document.getElementById('form-lead').addEventListener('submit', async function(e) {
  e.preventDefault();

  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const response = await fetch('https://portal.eduflowia.com/api/webhook/lead/SEU_TOKEN_AQUI', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('nome').value,
        phone: document.getElementById('telefone').value,
        course: document.getElementById('curso').value,
        email: document.getElementById('email').value,
      })
    });

    if (response.ok) {
      // Redirecionar ou mostrar mensagem de sucesso
      window.location.href = '/obrigado';
    }
  } catch (error) {
    console.error('Erro ao enviar:', error);
    btn.disabled = false;
    btn.textContent = 'Quero saber mais';
  }
});
</script>
```

---

### WordPress + WPForms

1. Instale o plugin **WPForms**
2. Crie o formulário com os campos: Nome, WhatsApp, Curso
3. Vá em **Configurações → Notificações → Webhook**
4. Cole a URL do EduFlow
5. Mapeie os campos:
   - Campo "Nome" → `name`
   - Campo "WhatsApp" → `phone`
   - Campo "Curso" → `course`

---

### WordPress + Contact Form 7

Instale o plugin **CF7 to Webhook** e configure:

```
URL: https://portal.eduflowia.com/api/webhook/lead/SEU_TOKEN_AQUI
Método: POST
Content-Type: application/json

Mapeamento:
  name  → [your-name]
  phone → [your-tel]
  course → [your-curso]
```

---

### Elementor Forms

1. Edite o formulário no Elementor
2. Vá em **Ações após envio → Webhook**
3. Cole a URL do EduFlow
4. Em **Campos personalizados**, mapeie:
   - `name` → campo Nome
   - `phone` → campo Telefone
   - `course` → campo Curso

---

### RD Station

1. No RD Station, acesse **Automações**
2. Crie uma automação com gatilho **"Conversão em formulário"**
3. Adicione a ação **"Webhook"**
4. Configure:
   - URL: `https://portal.eduflowia.com/api/webhook/lead/SEU_TOKEN_AQUI`
   - Método: POST
   - Campos: `name`, `phone`, `course`

---

### Typeform

1. Vá em **Connect → Webhooks**
2. Cole a URL do EduFlow
3. Ative e teste

> ⚠️ O Typeform envia os dados em formato diferente. Nesse caso, use **Zapier** ou **Make** como intermediário para mapear os campos corretamente.

---

### Zapier / Make (intermediário universal)

Use quando a plataforma da LP não suporta webhook nativo ou quando o formato dos dados é diferente.

**No Zapier:**
1. Trigger: formulário da LP (Google Forms, Typeform, etc.)
2. Action: **Webhooks by Zapier → POST**
3. URL: `https://portal.eduflowia.com/api/webhook/lead/SEU_TOKEN_AQUI`
4. Payload Type: `JSON`
5. Data:
   ```
   name  → {{Nome do campo}}
   phone → {{Telefone do campo}}
   course → {{Curso do campo}}
   ```

---

## Testando a integração

Após configurar, teste com o seguinte comando no terminal:

```bash
curl -X POST https://portal.eduflowia.com/api/webhook/lead/SEU_TOKEN_AQUI \
  -H "Content-Type: application/json" \
  -d '{"name": "Lead Teste", "phone": "83988046720", "course": "Pós-graduação"}'
```

**Resposta esperada:**
```json
{"status": "ok", "message": "Lead recebido com sucesso"}
```

Em seguida, verifique no EduFlow → **Conversas** se o contato apareceu e se a mensagem de boas-vindas foi enviada no WhatsApp.

---

## Observações importantes

- Cada webhook tem um **token único** — não compartilhe a URL publicamente
- Se o lead já existir no sistema, seus dados serão **atualizados** e a IA será reativada
- A mensagem de boas-vindas é enviada **imediatamente** após o recebimento
- O lead entra no pipeline com status **"Novo Lead"**
- Use `{nome}` na mensagem de boas-vindas para personalizar com o nome do lead

---

*EduFlow — Documentação interna v1.0 — Março 2026*
