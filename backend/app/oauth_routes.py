"""
Rotas OAuth para integração com Meta (Instagram / Messenger)
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import httpx
import os

from app.database import get_db
from app.models import Channel
from app.auth import get_current_user

router = APIRouter(prefix="/api/oauth", tags=["OAuth"])

META_APP_ID = os.getenv("META_APP_ID", "886462874541479")
META_APP_SECRET = os.getenv("META_APP_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://ff4e-177-37-145-33.ngrok-free.app")


class OAuthCallbackRequest(BaseModel):
    code: str
    channel_type: str  # instagram ou messenger
    channel_name: str = "Instagram"


@router.post("/meta/callback")
async def meta_oauth_callback(
    req: OAuthCallbackRequest,
    db: AsyncSession = Depends(get_db),
):
    redirect_uri = f"{FRONTEND_URL}/canais/callback"

    # 1. Trocar code por short-lived token
    async with httpx.AsyncClient() as client:
        token_res = await client.get(
            "https://graph.facebook.com/v21.0/oauth/access_token",
            params={
                "client_id": META_APP_ID,
                "client_secret": META_APP_SECRET,
                "redirect_uri": redirect_uri,
                "code": req.code,
            }
        )

    if token_res.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Erro ao obter token: {token_res.text}")

    token_data = token_res.json()
    short_token = token_data.get("access_token")

    if not short_token:
        raise HTTPException(status_code=400, detail="Token não recebido")

    # 2. Trocar por long-lived token (60 dias)
    async with httpx.AsyncClient() as client:
        long_res = await client.get(
            "https://graph.facebook.com/v21.0/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": META_APP_ID,
                "client_secret": META_APP_SECRET,
                "fb_exchange_token": short_token,
            }
        )

    long_token = short_token
    if long_res.status_code == 200:
        long_token = long_res.json().get("access_token", short_token)

    # 3. Buscar páginas do usuário
    async with httpx.AsyncClient() as client:
        pages_res = await client.get(
            "https://graph.facebook.com/v21.0/me/accounts",
            params={"access_token": long_token}
        )

    pages = []
    if pages_res.status_code == 200:
        pages = pages_res.json().get("data", [])

    # 4. Se Instagram, buscar Instagram Business Account
    instagram_id = None
    page_id = None
    page_token = None

    if pages:
        # Usar a primeira página
        page = pages[0]
        page_id = page["id"]
        page_token = page.get("access_token", long_token)

        if req.channel_type == "instagram":
            async with httpx.AsyncClient() as client:
                ig_res = await client.get(
                    f"https://graph.facebook.com/v21.0/{page_id}",
                    params={
                        "fields": "instagram_business_account",
                        "access_token": page_token,
                    }
                )
            if ig_res.status_code == 200:
                ig_data = ig_res.json().get("instagram_business_account")
                if ig_data:
                    instagram_id = ig_data.get("id")

    # 5. Criar o canal
    channel = Channel(
        name=req.channel_name,
        type=req.channel_type,
        provider="meta",
        page_id=page_id,
        instagram_id=instagram_id,
        access_token=page_token or long_token,
        is_connected=True,
        is_active=True,
    )
    db.add(channel)
    await db.commit()
    await db.refresh(channel)

    return {
        "status": "connected",
        "channel_id": channel.id,
        "page_id": page_id,
        "instagram_id": instagram_id,
        "pages_found": len(pages),
    }


@router.get("/meta/url")
async def get_oauth_url(channel_type: str = "instagram"):
    redirect_uri = f"{FRONTEND_URL}/canais/callback"

    scopes = {
        "instagram": "instagram_basic,instagram_manage_messages,pages_show_list,pages_messaging,pages_manage_metadata",
        "messenger": "pages_show_list,pages_messaging,pages_manage_metadata",
    }

    scope = scopes.get(channel_type, scopes["instagram"])

    url = (
        f"https://www.facebook.com/v21.0/dialog/oauth"
        f"?client_id={META_APP_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&scope={scope}"
        f"&response_type=code"
        f"&state={channel_type}"
    )

    return {"url": url}