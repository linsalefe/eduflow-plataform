from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models import LandingPage, FormSubmission, Contact, Channel, Tenant
from app.auth import get_current_user, get_tenant_id
import json

from fastapi import UploadFile, File
import os, uuid, pathlib

UPLOAD_DIR = pathlib.Path("uploads/lp")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter(prefix="/api/landing-pages", tags=["Landing Pages"])

@router.post("/upload")
async def upload_image(file: UploadFile = File(...), user=Depends(get_current_user), tenant_id: int = Depends(get_tenant_id)):
    ext = file.filename.split(".")[-1].lower()
    if ext not in ["jpg", "jpeg", "png", "webp", "gif", "svg"]:
        raise HTTPException(400, "Formato não suportado. Use JPG, PNG ou WEBP.")
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = UPLOAD_DIR / filename
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Imagem muito grande. Máximo 5MB.")
    with open(filepath, "wb") as f:
        f.write(content)
    base_url = os.getenv("BASE_URL", "https://portal.eduflowia.com")
    return {"url": f"{base_url}/api/uploads/lp/{filename}"}

# === CRUD Landing Pages (autenticado) ===

@router.get("")
async def list_landing_pages(channel_id: int = None, db: AsyncSession = Depends(get_db), user=Depends(get_current_user), tenant_id: int = Depends(get_tenant_id)):
    query = select(LandingPage).where(LandingPage.tenant_id == tenant_id).order_by(LandingPage.created_at.desc())
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
            "tag": p.tag,
            "pipeline_stage": p.pipeline_stage,
            "whatsapp_message": p.whatsapp_message,
            "created_at": str(p.created_at),
        }
        for p in pages
    ]


@router.post("")
async def create_landing_page(data: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user), tenant_id: int = Depends(get_tenant_id)):
    # Verificar se slug já existe
    existing = await db.execute(select(LandingPage).where(LandingPage.slug == data["slug"]))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug já existe")

    page = LandingPage(
        tenant_id=tenant_id,
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
async def get_landing_page(page_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user), tenant_id: int = Depends(get_tenant_id)):
    result = await db.execute(select(LandingPage).where(LandingPage.id == page_id, LandingPage.tenant_id == tenant_id))
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
        "tag": page.tag,
        "pipeline_stage": page.pipeline_stage,
        "whatsapp_message": page.whatsapp_message,
        "created_at": str(page.created_at),
    }


@router.put("/{page_id}")
async def update_landing_page(page_id: int, data: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user), tenant_id: int = Depends(get_tenant_id)):
    result = await db.execute(select(LandingPage).where(LandingPage.id == page_id, LandingPage.tenant_id == tenant_id))
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
    if "tag" in data:
        page.tag = data["tag"]
    if "pipeline_stage" in data:
        page.pipeline_stage = data["pipeline_stage"]
    if "whatsapp_message" in data:
        page.whatsapp_message = data["whatsapp_message"]

    await db.commit()
    return {"message": "Landing page atualizada"}


@router.delete("/{page_id}")
async def delete_landing_page(page_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user), tenant_id: int = Depends(get_tenant_id)):
    result = await db.execute(select(LandingPage).where(LandingPage.id == page_id, LandingPage.tenant_id == tenant_id))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Landing page não encontrada")

    await db.delete(page)
    await db.commit()
    return {"message": "Landing page removida"}


# === Stats ===
# === Submissions (leads que preencheram) ===

@router.get("/{page_id}/submissions")
async def list_submissions(page_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user), tenant_id: int = Depends(get_tenant_id)):
    result = await db.execute(
        select(FormSubmission)
        .where(FormSubmission.landing_page_id == page_id, FormSubmission.tenant_id == tenant_id)
        .order_by(FormSubmission.created_at.desc())
    )
    submissions = result.scalars().all()

    items = []
    for s in submissions:
        # Buscar dados do contato (notas, status)
        contact = None
        if s.phone:
            phone_clean = s.phone.replace("+", "").replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
            if not phone_clean.startswith("55"):
                phone_clean = "55" + phone_clean
            contact_result = await db.execute(
                select(Contact).where(Contact.wa_id == phone_clean)
            )
            contact = contact_result.scalar_one_or_none()

        items.append({
            "id": s.id,
            "name": s.name,
            "phone": s.phone,
            "email": s.email or "",
            "course": s.course or "",
            "utm_source": s.utm_source or "",
            "utm_medium": s.utm_medium or "",
            "utm_campaign": s.utm_campaign or "",
            "utm_content": s.utm_content or "",
            "created_at": str(s.created_at) if s.created_at else "",
            "contact": {
                "wa_id": contact.wa_id if contact else "",
                "lead_status": contact.lead_status if contact else "",
                "ai_active": contact.ai_active if contact else False,
                "notes": contact.notes if contact else "",
            } if contact else None,
        })

    return items

@router.get("/{page_id}/stats")
async def landing_page_stats(page_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user), tenant_id: int = Depends(get_tenant_id)):
    total = await db.execute(
        select(func.count(FormSubmission.id)).where(FormSubmission.landing_page_id == page_id)
    )
    return {"total_submissions": total.scalar() or 0}

# === Dashboard ROI ===

@router.get("/dashboard/roi")
async def dashboard_roi(db: AsyncSession = Depends(get_db), user=Depends(get_current_user), tenant_id: int = Depends(get_tenant_id)):
    from sqlalchemy import case, distinct

    # Total de submissions
    total_leads = await db.execute(select(func.count(FormSubmission.id)).where(FormSubmission.tenant_id == tenant_id))

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

public_router = APIRouter(prefix="/api/lp", tags=["Landing Pages Públicas"])


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
        tenant_id=page.tenant_id,
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

    # Gerar variações do número (com e sem 9º dígito) para encontrar contato existente
    def phone_variants(phone: str) -> list:
        """Retorna variações do telefone BR: com e sem o 9º dígito."""
        variants = [phone]
        if len(phone) == 13 and phone.startswith("55"):
            # 55 + DDD(2) + 9 + 8 dígitos → remover o 9
            ddd = phone[2:4]
            rest = phone[5:]  # pula o 9
            variants.append(f"55{ddd}{rest}")
        elif len(phone) == 12 and phone.startswith("55"):
            # 55 + DDD(2) + 8 dígitos → adicionar o 9
            ddd = phone[2:4]
            rest = phone[4:]
            variants.append(f"55{ddd}9{rest}")
        return variants

    variants = phone_variants(phone_clean)

    from sqlalchemy import or_
    existing_contact = await db.execute(
        select(Contact).where(
            Contact.tenant_id == page.tenant_id,
            or_(*[Contact.wa_id == v for v in variants])
        )
    )
    contact = existing_contact.scalar_one_or_none()

    import json as json_lib

    # Verificar se o estágio da LP desliga a IA
    target_stage = page.pipeline_stage or "novo"
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == page.tenant_id))
    tenant_obj = tenant_result.scalar_one_or_none()
    ai_off_statuses = (tenant_obj.ai_off_statuses if tenant_obj and tenant_obj.ai_off_statuses else [])
    should_ai_be_active = target_stage not in ai_off_statuses

    if not contact:
        extra_data = data.get("extra", {}) or {}
        notes_data = {
            "course": data.get("course", ""),
            "source": "landing_page",
            **extra_data,
        }
        contact = Contact(
            tenant_id=page.tenant_id,
            wa_id=phone_clean,
            name=data.get("name", ""),
            lead_status=target_stage,
            channel_id=page.channel_id,
            ai_active=should_ai_be_active,
            notes=json_lib.dumps(notes_data, ensure_ascii=False),
        )
        db.add(contact)
    else:
        contact.ai_active = should_ai_be_active
        if page.pipeline_stage:
            contact.lead_status = page.pipeline_stage
        try:
            existing_notes = json_lib.loads(contact.notes or "{}")
        except (json_lib.JSONDecodeError, TypeError):
            existing_notes = {}
        extra_data = data.get("extra", {}) or {}
        existing_notes["course"] = data.get("course", "")
        existing_notes["source"] = "landing_page"
        existing_notes.update(extra_data)
        contact.notes = json_lib.dumps(existing_notes, ensure_ascii=False)

    await db.flush()

    # === Aplicar tag da LP ===
    if page.tag:
        from app.models import Tag, contact_tags
        tag_result = await db.execute(
            select(Tag).where(Tag.tenant_id == page.tenant_id, Tag.name == page.tag)
        )
        tag_obj = tag_result.scalar_one_or_none()
        if not tag_obj:
            tag_obj = Tag(tenant_id=page.tenant_id, name=page.tag, color="blue")
            db.add(tag_obj)
            await db.flush()
        from sqlalchemy import text
        existing_tag = await db.execute(
            text("SELECT 1 FROM contact_tags WHERE contact_wa_id = :wid AND tag_id = :tid"),
            {"wid": contact.wa_id, "tid": tag_obj.id}
        )
        if not existing_tag.first():
            await db.execute(
                text("INSERT INTO contact_tags (contact_wa_id, tag_id) VALUES (:wid, :tid)"),
                {"wid": contact.wa_id, "tid": tag_obj.id}
            )

    # === Enviar mensagem WhatsApp ===
    if page.whatsapp_message and phone_clean:
        try:
            from app.evolution import client as evo_client
            channel_result = await db.execute(select(Channel).where(Channel.id == page.channel_id))
            channel_obj = channel_result.scalar_one_or_none()
            if channel_obj and channel_obj.instance_name:
                full_name = data.get("name", "")
                first_name = full_name.strip().split()[0] if full_name.strip() else full_name
                message_text = page.whatsapp_message.replace("{nome}", first_name)
                await evo_client.send_text(channel_obj.instance_name, phone_clean, message_text)
        except Exception as e:
            print(f"Erro WhatsApp: {e}")
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