import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import User, Tenant
from app.auth import hash_password, verify_password, create_access_token, get_current_user, get_tenant_id

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "atendente"


@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")

    if not user.is_active:
        raise HTTPException(status_code=401, detail="Usuário inativo")

    # Verificar se tenant está ativo
    tenant_features = {}
    if user.tenant_id:
        from app.models import Tenant
        tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        tenant = tenant_result.scalar_one_or_none()
        if tenant:
            if not tenant.is_active:
                raise HTTPException(status_code=403, detail="Conta suspensa. Entre em contato com o suporte.")
            tenant_features = tenant.features or {}

    token = create_access_token({
        "sub": str(user.id),
        "role": user.role,
        "tenant_id": user.tenant_id,
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "tenant_id": user.tenant_id,
            "features": tenant_features,
        },
    }

@router.get("/me")
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    tenant_features = {}
    if user.tenant_id:
        from app.models import Tenant
        tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        tenant = tenant_result.scalar_one_or_none()
        if tenant:
            tenant_features = tenant.features or {}

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "tenant_id": user.tenant_id,
        "avatar_url": user.avatar_url,
        "notify_email": user.notify_email if user.notify_email is not None else True,
        "notify_sound": user.notify_sound if user.notify_sound is not None else True,
        "features": tenant_features,
    }


@router.post("/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Apenas admin pode criar usuários
    if current_user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Apenas administradores podem criar usuários")

    # Verificar se email já existe
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    user = User(
        name=req.name,
        email=req.email,
        password_hash=hash_password(req.password),
        role=req.role,
        tenant_id=current_user.tenant_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
    }


@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Apenas administradores")

    query = select(User).order_by(User.name)
    if current_user.tenant_id:
        query = query.where(User.tenant_id == current_user.tenant_id)

    result = await db.execute(query)
    users = result.scalars().all()

    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "is_active": u.is_active,
            "tenant_id": u.tenant_id,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.patch("/users/{user_id}")
async def toggle_user(user_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Apenas administradores")

    query = select(User).where(User.id == user_id)
    if current_user.tenant_id:
        query = query.where(User.tenant_id == current_user.tenant_id)

    result = await db.execute(query)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    user.is_active = not user.is_active
    await db.commit()
    return {"id": user.id, "is_active": user.is_active}


# === Profile ===

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    notify_email: Optional[bool] = None
    notify_sound: Optional[bool] = None


@router.patch("/profile")
async def update_profile(req: ProfileUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if req.name is not None:
        user.name = req.name
    if req.notify_email is not None:
        user.notify_email = req.notify_email
    if req.notify_sound is not None:
        user.notify_sound = req.notify_sound
    await db.commit()
    await db.refresh(user)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "avatar_url": user.avatar_url,
        "notify_email": user.notify_email if user.notify_email is not None else True,
        "notify_sound": user.notify_sound if user.notify_sound is not None else True,
    }


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
async def change_password(req: ChangePasswordRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if not verify_password(req.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Nova senha deve ter pelo menos 6 caracteres")
    user.password_hash = hash_password(req.new_password)
    await db.commit()
    return {"status": "ok", "message": "Senha alterada com sucesso"}


@router.post("/upload-avatar")
async def upload_avatar(file: UploadFile = File(...), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    os.makedirs("uploads/avatars", exist_ok=True)
    filepath = f"uploads/avatars/{user.id}.jpg"
    contents = await file.read()
    with open(filepath, "wb") as f:
        f.write(contents)
    user.avatar_url = f"/api/uploads/avatars/{user.id}.jpg"
    await db.commit()
    return {"avatar_url": user.avatar_url}


# === Company ===

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    owner_phone: Optional[str] = None


@router.get("/company")
async def get_company(db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")
    return {
        "name": tenant.name,
        "owner_phone": tenant.owner_phone,
        "logo_url": tenant.logo_url,
    }


@router.patch("/company")
async def update_company(req: CompanyUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user), tenant_id: int = Depends(get_tenant_id)):
    if user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Apenas administradores")
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")
    if req.name is not None:
        tenant.name = req.name
    if req.owner_phone is not None:
        tenant.owner_phone = req.owner_phone
    await db.commit()
    await db.refresh(tenant)
    return {
        "name": tenant.name,
        "owner_phone": tenant.owner_phone,
        "logo_url": tenant.logo_url,
    }


@router.post("/upload-logo")
async def upload_logo(file: UploadFile = File(...), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user), tenant_id: int = Depends(get_tenant_id)):
    if user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Apenas administradores")
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")
    os.makedirs("uploads/logos", exist_ok=True)
    filepath = f"uploads/logos/{tenant_id}.png"
    contents = await file.read()
    with open(filepath, "wb") as f:
        f.write(contents)
    tenant.logo_url = f"/api/uploads/logos/{tenant_id}.png"
    await db.commit()
    return {"logo_url": tenant.logo_url}