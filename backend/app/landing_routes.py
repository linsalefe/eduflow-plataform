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
# === Dashboard ROI ===

@router.get("/dashboard/roi")
async def dashboard_roi(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    from sqlalchemy import case, distinct

    # Total de submissions
    total_leads = await db.execute(select(func.count(FormSubmission.id)))

    # Leads por origem (utm_source)
    leads_by_source = await db.execute(
        select(
            FormSubmission.utm_source,
            func.count(FormSubmission.id).label("total")
        ).where(FormSubmission.utm_source != None, FormSubmission.utm_source != "")
        .group_by(FormSubmission.utm_source)
        .order_by(func.count(FormSubmission.id).desc())
    )

    # Leads por campanha
    leads_by_campaign = await db.execute(
        select(
            FormSubmission.utm_campaign,
            func.count(FormSubmission.id).label("total")
        ).where(FormSubmission.utm_campaign != None, FormSubmission.utm_campaign != "")
        .group_by(FormSubmission.utm_campaign)
        .order_by(func.count(FormSubmission.id).desc())
    )

    # Leads por landing page
    leads_by_page = await db.execute(
        select(
            LandingPage.title,
            LandingPage.slug,
            func.count(FormSubmission.id).label("total")
        ).join(LandingPage, FormSubmission.landing_page_id == LandingPage.id)
        .group_by(LandingPage.title, LandingPage.slug)
        .order_by(func.count(FormSubmission.id).desc())
    )

    # Leads por dia (últimos 30 dias)
    from datetime import datetime, timedelta
    thirty_days_ago = datetime.now() - timedelta(days=30)
    day_trunc = func.date_trunc('day', FormSubmission.created_at)
    leads_by_day = await db.execute(
        select(
            day_trunc.label("day"),
            func.count(FormSubmission.id).label("total")
        ).where(FormSubmission.created_at >= thirty_days_ago)
        .group_by(day_trunc)
        .order_by(day_trunc)
    )

    # Status dos contatos vindos de LPs
    from sqlalchemy import exists
    contacts_from_lp = await db.execute(
        select(
            Contact.lead_status,
            func.count(Contact.id).label("total")
        ).where(
            Contact.wa_id.in_(
                select(distinct(FormSubmission.phone))
            )
        ).group_by(Contact.lead_status)
    )

    return {
        "total_leads": total_leads.scalar() or 0,
        "by_source": [{"source": r[0] or "direto", "total": r[1]} for r in leads_by_source.all()],
        "by_campaign": [{"campaign": r[0] or "sem campanha", "total": r[1]} for r in leads_by_campaign.all()],
        "by_page": [{"title": r[0], "slug": r[1], "total": r[2]} for r in leads_by_page.all()],
        "by_day": [{"day": str(r[0])[:10], "total": r[1]} for r in leads_by_day.all()],
        "funnel": {r[0]: r[1] for r in contacts_from_lp.all()},
    }

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
        import json as json_lib
        contact = Contact(
            wa_id=phone_clean,
            name=data.get("name", ""),
            lead_status="novo",
            channel_id=page.channel_id,
            ai_active=True,
            notes=json_lib.dumps({"course": data.get("course", ""), "source": "landing_page"}, ensure_ascii=False),
        )
        db.add(contact)
    else:
        import json as json_lib
        contact.ai_active = True
        try:
            existing_notes = json_lib.loads(contact.notes or "{}")
        except (json_lib.JSONDecodeError, TypeError):
            existing_notes = {}
        existing_notes["course"] = data.get("course", "")
        existing_notes["source"] = "landing_page"
        contact.notes = json_lib.dumps(existing_notes, ensure_ascii=False)
    await db.commit()
    
    # === VOICE AI: Disparar ligação automática para o lead ===
    try:
        from app.voice_ai.routes import receive_new_lead, NewLeadRequest
        from app.database import async_session as voice_session
        
        # Verificar se Voice AI está habilitada (variável de ambiente)
        import os
        if os.getenv("VOICE_AI_ENABLED", "false").lower() == "true":
            async with voice_session() as voice_db:
                await receive_new_lead(
                    NewLeadRequest(
                        name=data.get("name", ""),
                        phone=phone_clean,
                        course=data.get("course", ""),
                        source=data.get("utm_source", "landing_page"),
                        campaign=data.get("utm_campaign", ""),
                        channel_id=page.channel_id,
                    ),
                    db=voice_db,
                )
            print(f"📞 Voice AI: Chamada disparada para {data.get('name', '')} ({phone_clean})")
    except Exception as e:
        print(f"⚠️ Voice AI indisponível: {e}")
    return {"message": "Inscrição recebida com sucesso", "contact_wa_id": phone_clean}
