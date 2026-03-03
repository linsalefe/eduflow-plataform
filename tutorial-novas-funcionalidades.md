# EduFlow — Guia para Adicionar Novas Funcionalidades

## Visão Geral

Este documento é um guia prático para quando você precisar adicionar novas funcionalidades ao EduFlow. Ele cobre desde a criação de uma nova página até a integração com o sistema multi-tenant (features por cliente).

---

## 1. Adicionar um Novo Módulo Controlável por Tenant

Quando você cria uma funcionalidade nova que precisa ser ativada/desativada por cliente.

### Passo 1 — Escolher o nome da feature

Escolha um nome em snake_case. Exemplos: `crm_avancado`, `chatbot_instagram`, `relatorios_pdf`.

### Passo 2 — Banco de Dados

Atualize o default do JSON e os tenants existentes:

```sql
-- Atualizar o default para novos tenants
ALTER TABLE tenants ALTER COLUMN features SET DEFAULT '{
  "dashboard": true,
  "conversas": true,
  "pipeline": true,
  "financeiro": true,
  "landing_pages": true,
  "campanhas": true,
  "relatorios": true,
  "usuarios": true,
  "automacoes": true,
  "tarefas": true,
  "voice_ai": false,
  "ai_whatsapp": true,
  "agenda": true,
  "sua_nova_feature": false
}'::jsonb;

-- Adicionar aos tenants existentes (false = desativado por padrão)
UPDATE tenants SET features = jsonb_set(features, '{sua_nova_feature}', 'false');

-- Ou para ativar para um cliente específico:
UPDATE tenants SET features = jsonb_set(features, '{sua_nova_feature}', 'true') WHERE id = 1;
```

### Passo 3 — Backend: Model Tenant

No arquivo `backend/app/models.py`, atualize o default do campo `features` no model `Tenant`:

```python
features = Column(JSON, default={
    "dashboard": True,
    "conversas": True,
    "pipeline": True,
    "financeiro": True,
    "landing_pages": True,
    "campanhas": True,
    "relatorios": True,
    "usuarios": True,
    "automacoes": True,
    "tarefas": True,
    "voice_ai": False,
    "ai_whatsapp": True,
    "agenda": True,
    "sua_nova_feature": False,  # <-- adicione aqui
})
```

### Passo 4 — Frontend: Sidebar

No arquivo `frontend/src/components/Sidebar.tsx`:

**4a.** Adicione no `featureMap`:

```typescript
const featureMap: Record<string, string> = {
  // ... features existentes ...
  '/sua-nova-rota': 'sua_nova_feature',  // <-- adicione aqui
};
```

**4b.** Adicione o item no `menuGroups` (no grupo que fizer sentido):

```typescript
{ href: '/sua-nova-rota', label: 'Nome no Menu', icon: SeuIcone },
```

**4c.** Importe o ícone no topo (de lucide-react):

```typescript
import { ..., SeuIcone } from 'lucide-react';
```

### Passo 5 — Frontend: Painel Admin

No arquivo `frontend/src/app/admin/page.tsx`, adicione no `FEATURE_LABELS`:

```typescript
const FEATURE_LABELS: Record<string, string> = {
  // ... labels existentes ...
  sua_nova_feature: 'Nome Bonito da Feature',  // <-- adicione aqui
};
```

Pronto! A feature já aparece no painel admin com toggle e some do sidebar quando desativada.

---

## 2. Criar uma Nova Rota no Backend

Toda nova rota precisa ter isolamento por tenant_id.

### Passo 1 — Criar o arquivo de rotas

Crie `backend/app/sua_nova_routes.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.auth import get_current_user, get_tenant_id
from app.models import SeuModel

router = APIRouter(prefix="/api/sua-rota", tags=["Sua Feature"])


@router.get("")
async def listar(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(
        select(SeuModel).where(SeuModel.tenant_id == tenant_id)
    )
    items = result.scalars().all()
    return [{"id": i.id, "name": i.name} for i in items]


@router.post("")
async def criar(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    item = SeuModel(
        tenant_id=tenant_id,  # <-- SEMPRE incluir
        name=data.get("name"),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {"id": item.id, "message": "Criado com sucesso"}
```

### Passo 2 — Registrar no main.py

No arquivo `backend/app/main.py`:

```python
# No topo, com os outros imports:
from app.sua_nova_routes import router as sua_nova_router

# Lá embaixo, com os outros include_router:
app.include_router(sua_nova_router)
```

### Passo 3 — Testar

```bash
sudo systemctl restart eduflow-backend
curl -s http://localhost:8001/api/sua-rota -H "Authorization: Bearer SEU_TOKEN"
```

---

## 3. Criar um Novo Model (Tabela)

### Passo 1 — Definir no models.py

No arquivo `backend/app/models.py`:

```python
class SeuModel(Base):
    __tablename__ = "sua_tabela"
    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True)  # <-- OBRIGATÓRIO
    name = Column(String(255), nullable=False)
    # ... seus campos ...
    created_at = Column(DateTime, server_default=func.now())
```

### Passo 2 — Criar a tabela no banco

```sql
sudo -u postgres psql -d eduflow_db -c "
CREATE TABLE IF NOT EXISTS sua_tabela (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
"
```

### Passo 3 — Dar permissão ao usuário eduflow

```sql
sudo -u postgres psql -d eduflow_db -c "
GRANT ALL PRIVILEGES ON TABLE sua_tabela TO eduflow;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO eduflow;
"
```

---

## 4. Criar uma Nova Página no Frontend

### Passo 1 — Criar a pasta e arquivo

```bash
mkdir -p frontend/src/app/sua-pagina
```

Crie `frontend/src/app/sua-pagina/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import api from '@/lib/api';

export default function SuaPagina() {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/sua-rota')
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6">Carregando...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Sua Página</h1>
      {/* Seu conteúdo aqui */}
    </div>
  );
}
```

### Passo 2 — Build e deploy

```bash
cd frontend && npm run build
sudo systemctl restart eduflow-frontend
```

---

## 5. Checklist de Deploy

Sempre que fizer alterações, siga esta ordem:

```bash
# 1. No Mac (VSCode) — commit e push
git add .
git commit -m "descrição da mudança"
git push

# 2. No servidor (SSH)
cd ~/eduflow
git pull

# 3. Se alterou o backend:
sudo systemctl restart eduflow-backend

# 4. Se alterou o frontend:
cd frontend && npm run build
sudo systemctl restart eduflow-frontend

# 5. Verificar se subiu sem erros:
sudo journalctl -u eduflow-backend -n 20 --no-pager
```

---

## 6. Padrões Importantes

### 6.1 — Toda query SELECT precisa filtrar por tenant_id

```python
# CERTO
query = select(Model).where(Model.tenant_id == tenant_id)

# ERRADO (vazamento de dados entre clientes!)
query = select(Model)
```

### 6.2 — Todo INSERT precisa incluir tenant_id

```python
# CERTO
item = Model(tenant_id=tenant_id, name="teste")

# ERRADO (dado fica sem dono!)
item = Model(name="teste")
```

### 6.3 — Rotas públicas (sem auth) usam tenant do objeto pai

Exemplo: formulário de landing page (qualquer pessoa pode enviar):

```python
# Busca a landing page primeiro
page = await get_page(slug)

# Usa o tenant_id da page
contact = Contact(tenant_id=page.tenant_id, ...)
```

### 6.4 — Webhooks descobrem tenant pelo canal

Exemplo: webhook do Evolution API:

```python
channel = await get_channel(instance_name)
tenant_id = channel.tenant_id

# Usa esse tenant_id nos inserts
contact = Contact(tenant_id=tenant_id, ...)
message = Message(tenant_id=tenant_id, ...)
```

### 6.5 — Superadmin tem tenant_id=null

O superadmin não pertence a nenhum tenant. Ele acessa apenas as rotas `/api/admin/*`. As rotas normais retornam 400 para ele porque exigem `tenant_id: int`.

### 6.6 — auth_routes.py permite superadmin

Nas rotas de registro e listagem de usuários, use:

```python
if current_user.role not in ("admin", "superadmin"):
    raise HTTPException(403, "Apenas administradores")
```

---

## 7. Referência Rápida de Arquivos

| Arquivo | O que faz |
|---------|-----------|
| `backend/app/models.py` | Models SQLAlchemy (tabelas) |
| `backend/app/auth.py` | JWT, get_current_user, get_tenant_id |
| `backend/app/main.py` | App FastAPI, imports de routers |
| `backend/app/tenant_routes.py` | CRUD de tenants (superadmin) |
| `frontend/src/contexts/auth-context.tsx` | User, features, hasFeature() |
| `frontend/src/components/Sidebar.tsx` | Menu lateral, featureMap |
| `frontend/src/app/admin/page.tsx` | Painel superadmin |
| `frontend/src/lib/api.ts` | Axios com interceptors |

---

## 8. Comandos Úteis no Servidor

```bash
# Ver logs do backend
sudo journalctl -u eduflow-backend -n 50 --no-pager

# Ver logs do frontend
sudo journalctl -u eduflow-frontend -n 50 --no-pager

# Reiniciar tudo
sudo systemctl restart eduflow-backend && sudo systemctl restart eduflow-frontend

# Acessar banco de dados
sudo -u postgres psql -d eduflow_db

# Ver features de um tenant
sudo -u postgres psql -d eduflow_db -c "SELECT id, name, features FROM tenants;"

# Ativar feature para um tenant
sudo -u postgres psql -d eduflow_db -c "UPDATE tenants SET features = jsonb_set(features, '{nome_feature}', 'true') WHERE id = 1;"

# Desativar feature
sudo -u postgres psql -d eduflow_db -c "UPDATE tenants SET features = jsonb_set(features, '{nome_feature}', 'false') WHERE id = 1;"

# Dar permissão em nova tabela
sudo -u postgres psql -d eduflow_db -c "GRANT ALL PRIVILEGES ON TABLE nova_tabela TO eduflow;"
sudo -u postgres psql -d eduflow_db -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO eduflow;"
```

---

## 9. Exemplo Completo: Adicionando Módulo "Certificados"

Vamos supor que você quer adicionar um módulo de emissão de certificados.

### 9.1 — Banco

```sql
-- Criar tabela
sudo -u postgres psql -d eduflow_db -c "
CREATE TABLE certificates (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    student_name VARCHAR(255) NOT NULL,
    course VARCHAR(255) NOT NULL,
    issued_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);
GRANT ALL PRIVILEGES ON TABLE certificates TO eduflow;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO eduflow;
"

-- Adicionar feature aos tenants
sudo -u postgres psql -d eduflow_db -c "
UPDATE tenants SET features = jsonb_set(features, '{certificados}', 'false');
"
```

### 9.2 — Backend: Model

Em `models.py` adicione:

```python
class Certificate(Base):
    __tablename__ = "certificates"
    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True)
    student_name = Column(String(255), nullable=False)
    course = Column(String(255), nullable=False)
    issued_at = Column(DateTime, server_default=func.now())
    created_at = Column(DateTime, server_default=func.now())
```

E atualize o default do `features` no model `Tenant`.

### 9.3 — Backend: Rotas

Crie `backend/app/certificate_routes.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.auth import get_current_user, get_tenant_id
from app.models import Certificate

router = APIRouter(prefix="/api/certificates", tags=["Certificados"])


class CertificateCreate(BaseModel):
    student_name: str
    course: str


@router.get("")
async def list_certificates(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    result = await db.execute(
        select(Certificate)
        .where(Certificate.tenant_id == tenant_id)
        .order_by(Certificate.created_at.desc())
    )
    certs = result.scalars().all()
    return [
        {
            "id": c.id,
            "student_name": c.student_name,
            "course": c.course,
            "issued_at": c.issued_at.isoformat() if c.issued_at else None,
        }
        for c in certs
    ]


@router.post("")
async def create_certificate(
    data: CertificateCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    cert = Certificate(
        tenant_id=tenant_id,
        student_name=data.student_name,
        course=data.course,
    )
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    return {"id": cert.id, "message": "Certificado emitido"}
```

### 9.4 — Backend: Registrar no main.py

```python
from app.certificate_routes import router as certificate_router
app.include_router(certificate_router)
```

### 9.5 — Frontend: Página

Crie `frontend/src/app/certificados/page.tsx` com a interface.

### 9.6 — Frontend: Sidebar + Admin

No `Sidebar.tsx`:

```typescript
// featureMap
'/certificados': 'certificados',

// menuGroups (no grupo que quiser)
{ href: '/certificados', label: 'Certificados', icon: Award },
```

No `admin/page.tsx`:

```typescript
certificados: 'Certificados',
```

### 9.7 — Deploy

```bash
git add . && git commit -m "feat: módulo certificados" && git push
# No servidor:
cd ~/eduflow && git pull
sudo systemctl restart eduflow-backend
cd frontend && npm run build && sudo systemctl restart eduflow-frontend
```

### 9.8 — Ativar para o cliente

No painel admin (`/admin`), expanda o tenant e clique no botão "Certificados" para ativar.

---

*Documento criado em 03/03/2026 — EduFlow Multi-Tenant v1.0*
