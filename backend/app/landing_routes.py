from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models import LandingPage, FormSubmission, Contact, Channel
from app.auth import get_current_user
import json

router = APIRouter(prefix="/api/landing-pages", tags=["Landing Pages"])





# === CRUD Landing Pages (autenticado) ===

@router.get("")
async def list_landing_pages(channel_id: int = None, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    query = select(LandingPage).order_by(LandingPage.created_at.desc())
    if channel_id:
        query = query.where(LandingPage.channel_id == channel_id)
    result = await db.execute(query)
    pages = result.scalars().all()
    return [
        {
            "id": p.id,
            "channel_id": p.channel_id,
            "slug": p.slug,
            "title": p.title,
            "template": p.template,
            "config": json.loads(p.config) if p.config else {},
            "is_active": p.is_active,
            "created_at": str(p.created_at),
        }
        for p in pages
    ]


@router.post("")
async def create_landing_page(data: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    # Verificar se slug já existe
    existing = await db.execute(select(LandingPage).where(LandingPage.slug == data["slug"]))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug já existe")

    page = LandingPage(
        channel_id=data["channel_id"],
        slug=data["slug"],
        title=data["title"],
        template=data.get("template", "curso"),
        config=json.dumps(data.get("config", {})),
        is_active=data.get("is_active", True),
    )
    db.add(page)
    await db.commit()
    await db.refresh(page)
    return {"id": page.id, "slug": page.slug, "message": "Landing page criada"}


@router.get("/{page_id}")
async def get_landing_page(page_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(LandingPage).where(LandingPage.id == page_id))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Landing page não encontrada")
    return {
        "id": page.id,
        "channel_id": page.channel_id,
        "slug": page.slug,
        "title": page.title,
        "template": page.template,
        "config": json.loads(page.config) if page.config else {},
        "is_active": page.is_active,
        "created_at": str(page.created_at),
    }


@router.put("/{page_id}")
async def update_landing_page(page_id: int, data: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(LandingPage).where(LandingPage.id == page_id))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Landing page não encontrada")

    if "title" in data:
        page.title = data["title"]
    if "slug" in data:
        page.slug = data["slug"]
    if "template" in data:
        page.template = data["template"]
    if "config" in data:
        page.config = json.dumps(data["config"])
    if "is_active" in data:
        page.is_active = data["is_active"]

    await db.commit()
    return {"message": "Landing page atualizada"}


@router.delete("/{page_id}")
async def delete_landing_page(page_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(LandingPage).where(LandingPage.id == page_id))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Landing page não encontrada")

    await db.delete(page)
    await db.commit()
    return {"message": "Landing page removida"}


# === Stats ===

@router.get("/{page_id}/stats")
async def landing_page_stats(page_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    total = await db.execute(
        select(func.count(FormSubmission.id)).where(FormSubmission.landing_page_id == page_id)
    )
    return {"total_submissions": total.scalar() or 0}


# === Rota Pública (sem auth) ===

public_router = APIRouter(prefix="/lp", tags=["Landing Pages Públicas"])


@public_router.get("/{slug}")
async def get_public_landing_page(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(LandingPage).where(LandingPage.slug == slug, LandingPage.is_active == True)
    )
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Página não encontrada")
    return {
        "title": page.title,
        "template": page.template,
        "config": json.loads(page.config) if page.config else {},
    }


@public_router.post("/{slug}/submit")
async def submit_form(slug: str, data: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(LandingPage).where(LandingPage.slug == slug, LandingPage.is_active == True)
    )
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Página não encontrada")

    submission = FormSubmission(
        landing_page_id=page.id,
        channel_id=page.channel_id,
        name=data.get("name", ""),
        phone=data.get("phone", ""),
        email=data.get("email"),
        course=data.get("course"),
        utm_source=data.get("utm_source"),
        utm_medium=data.get("utm_medium"),
        utm_campaign=data.get("utm_campaign"),
        utm_content=data.get("utm_content"),
    )
    db.add(submission)

    phone_clean = data.get("phone", "").replace("+", "").replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
    if phone_clean and not phone_clean.startswith("55"):
        phone_clean = "55" + phone_clean

    existing_contact = await db.execute(
        select(Contact).where(Contact.wa_id == phone_clean)
    )
    contact = existing_contact.scalar_one_or_none()

    if not contact:
        contact = Contact(
            wa_id=phone_clean,
            name=data.get("name", ""),
            lead_status="novo",
            channel_id=page.channel_id,
        )
        db.add(contact)

    await db.commit()
    return {"message": "Inscrição recebida com sucesso", "contact_wa_id": phone_clean}
