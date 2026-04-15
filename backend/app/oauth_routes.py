"""
Rotas OAuth para integração com Meta (Instagram Business Login)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import httpx
import os

from app.database import get_db
from app.models import Channel
from app.auth import get_current_user, get_tenant_id

router = APIRouter(prefix="/api/oauth", tags=["OAuth"])

# Instagram Business Login (API do Instagram)
IG_APP_ID = os.getenv("INSTAGRAM_APP_ID", "")
IG_APP_SECRET = os.getenv("INSTAGRAM_APP_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://portal.eduflowia.com")


class InstagramCallbackRequest(BaseModel):
    code: str
    channel_name: str = "Instagram"


@router.get("/instagram/url")
async def get_instagram_oauth_url():
    """Gera a URL de OAuth do Instagram Business Login."""
    redirect_uri = f"{FRONTEND_URL}/canais/callback"

    scopes = "%2C".join([
        "instagram_business_basic",
        "instagram_business_manage_messages",
        "instagram_business_manage_comments",
        "instagram_business_content_publish",
        "instagram_business_manage_insights",
    ])

    url = (
        f"https://www.instagram.com/oauth/authorize"
        f"?force_reauth=true"
        f"&client_id={IG_APP_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope={scopes}"
    )

    return {"url": url}


@router.post("/instagram/callback")
async def instagram_oauth_callback(
    req: InstagramCallbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Troca o code do Instagram por token e cria o canal."""
    redirect_uri = f"{FRONTEND_URL}/canais/callback"

    # 1. Trocar code por short-lived token
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://api.instagram.com/oauth/access_token",
            data={
                "client_id": IG_APP_ID,
                "client_secret": IG_APP_SECRET,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
                "code": req.code,
            },
        )

    if token_res.status_code != 200:
        print(f"❌ Instagram token error: {token_res.text}")
        raise HTTPException(status_code=400, detail=f"Erro ao obter token: {token_res.text}")

    token_data = token_res.json()
    short_token = token_data.get("access_token")
    ig_user_id = str(token_data.get("user_id", ""))

    if not short_token:
        raise HTTPException(status_code=400, detail="Token não recebido")

    # 2. Trocar por long-lived token (60 dias)
    async with httpx.AsyncClient() as client:
        long_res = await client.get(
            "https://graph.instagram.com/access_token",
            params={
                "grant_type": "ig_exchange_token",
                "client_secret": IG_APP_SECRET,
                "access_token": short_token,
            },
        )

    long_token = short_token
    if long_res.status_code == 200:
        long_data = long_res.json()
        long_token = long_data.get("access_token", short_token)

    # 3. Buscar dados do perfil do Instagram
    async with httpx.AsyncClient() as client:
        profile_res = await client.get(
            f"https://graph.instagram.com/v22.0/me",
            params={
                "fields": "user_id,username,name,profile_picture_url",
                "access_token": long_token,
            },
        )

    ig_username = ""
    ig_name = ""
    ig_profile_pic = ""
    if profile_res.status_code == 200:
        profile_data = profile_res.json()
        ig_username = profile_data.get("username", "")
        ig_name = profile_data.get("name", ig_username)
        ig_profile_pic = profile_data.get("profile_picture_url", "")
        # user_id retornado pela API é o correto para webhooks
        ig_user_id = str(profile_data.get("user_id", profile_data.get("id", ig_user_id)))
        print(f"🔍 Instagram OAuth profile: user_id={ig_user_id}, username={ig_username}")

    # 4. Verificar se já existe canal com esse instagram_id
    existing = await db.execute(
        select(Channel).where(
            Channel.instagram_id == ig_user_id,
            Channel.tenant_id == tenant_id,
            Channel.is_active == True,
        )
    )
    existing_channel = existing.scalar_one_or_none()

    if existing_channel:
        # Atualizar token
        existing_channel.access_token = long_token
        existing_channel.is_connected = True
        existing_channel.name = req.channel_name or ig_name or existing_channel.name
        await db.commit()
        await db.refresh(existing_channel)
        return {
            "status": "connected",
            "channel_id": existing_channel.id,
            "instagram_id": ig_user_id,
            "username": ig_username,
            "updated": True,
        }

    # 5. Criar novo canal
    channel = Channel(
        tenant_id=tenant_id,
        name=req.channel_name or ig_name or f"Instagram @{ig_username}",
        type="instagram",
        provider="instagram",
        instagram_id=ig_user_id,
        access_token=long_token,
        is_connected=True,
        is_active=True,
    )
    db.add(channel)
    await db.commit()
    await db.refresh(channel)

    print(f"✅ Instagram conectado: @{ig_username} (ID: {ig_user_id})")

    return {
        "status": "connected",
        "channel_id": channel.id,
        "instagram_id": ig_user_id,
        "username": ig_username,
        "profile_picture_url": ig_profile_pic,
    }