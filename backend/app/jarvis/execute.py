# backend/app/jarvis/execute.py
"""
Implementação das queries do Jarvis.
Cada tool chama uma query no banco Postgres, sempre filtrada por tenant_id.
"""
from datetime import datetime, timedelta
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import (
    Contact, Message, Channel, Tenant,
    FinancialEntry, LeadAgentContext,
    AIConversationSummary, Schedule,
    Task, LandingPage, FormSubmission, User,
)
from app.voice_ai.models import AICall


def _get_cutoff(period: str) -> datetime:
    """Retorna o datetime de corte para o período informado."""
    now = datetime.utcnow()
    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        return now - timedelta(days=7)
    elif period == "month":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return now - timedelta(days=1)


async def execute_tool(
    name: str,
    args: dict,
    tenant_id: int,
    db: AsyncSession,
    user_id: int | None = None,
) -> dict:
    """Executa a tool pelo nome e retorna os dados."""
    handlers = {
        "get_leads_summary": get_leads_summary,
        "get_leads_by_stage": get_leads_by_stage,
        "get_revenue_summary": get_revenue_summary,
        "get_stale_leads": get_stale_leads,
        "get_top_leads": get_top_leads,
        "get_agent_performance": get_agent_performance,
        "get_goal_progress": get_goal_progress,
        "get_contact_details": get_contact_details,
        "get_contact_conversations": get_contact_conversations,
        "get_upcoming_schedules": get_upcoming_schedules,
        "get_my_tasks": get_my_tasks,
        "get_form_submissions_summary": get_form_submissions_summary,
        "get_landing_page_performance": get_landing_page_performance,
    }
    handler = handlers.get(name)
    if not handler:
        return {"error": f"Tool '{name}' não encontrada"}

    # get_my_tasks precisa do user_id para filtrar "minhas"
    if name == "get_my_tasks":
        return await handler(args, tenant_id, user_id, db)
    return await handler(args, tenant_id, db)


# ============================================================
# 1. RESUMO DE LEADS POR PERÍODO
# ============================================================
async def get_leads_summary(args: dict, tenant_id: int, db: AsyncSession) -> dict:
    period = args.get("period", "today")
    cutoff = _get_cutoff(period)

    # Total de leads no período
    total_result = await db.execute(
        select(func.count(Contact.id))
        .where(Contact.tenant_id == tenant_id)
        .where(Contact.created_at >= cutoff)
    )
    total = total_result.scalar() or 0

    # Breakdown por canal
    breakdown_result = await db.execute(
        select(Channel.name, func.count(Contact.id))
        .join(Channel, Contact.channel_id == Channel.id)
        .where(Contact.tenant_id == tenant_id)
        .where(Contact.created_at >= cutoff)
        .group_by(Channel.name)
    )
    by_channel = [{"channel": r[0], "count": r[1]} for r in breakdown_result.all()]

    return {
        "period": period,
        "total_leads": total,
        "by_channel": by_channel,
    }


# ============================================================
# 2. LEADS POR COLUNA DO PIPELINE
# ============================================================
async def get_leads_by_stage(args: dict, tenant_id: int, db: AsyncSession) -> dict:
    stage = args.get("stage_name")

    query = (
        select(Contact.lead_status, func.count(Contact.id))
        .where(Contact.tenant_id == tenant_id)
        .group_by(Contact.lead_status)
    )
    if stage:
        query = query.where(Contact.lead_status == stage)

    result = await db.execute(query)
    stages = [{"name": r[0] or "sem_status", "count": r[1]} for r in result.all()]

    return {"stages": stages}


# ============================================================
# 3. FATURAMENTO DO MÊS
# ============================================================
async def get_revenue_summary(args: dict, tenant_id: int, db: AsyncSession) -> dict:
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Soma do faturamento (entradas)
    rev_result = await db.execute(
        select(func.sum(FinancialEntry.value))
        .where(FinancialEntry.tenant_id == tenant_id)
        .where(FinancialEntry.created_at >= month_start)
        .where(FinancialEntry.type == "income")
    )
    revenue = float(rev_result.scalar() or 0)

    # Meta do tenant
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    goal = float(getattr(tenant, "monthly_goal", 0) or 0)

    return {
        "revenue": revenue,
        "goal": goal,
        "remaining": max(0, goal - revenue),
        "percent": round(revenue / goal * 100, 1) if goal > 0 else 0,
    }


# ============================================================
# 4. LEADS PARADOS (SEM CONTATO HÁ X DIAS)
# ============================================================
async def get_stale_leads(args: dict, tenant_id: int, db: AsyncSession) -> dict:
    days = args.get("days", 3)
    cutoff = datetime.utcnow() - timedelta(days=days)

    # Subquery: última mensagem de cada contato
    last_msg_sub = (
        select(
            Message.contact_id,
            func.max(Message.timestamp).label("last_message")
        )
        .where(Message.tenant_id == tenant_id, Message.contact_id.isnot(None))
        .group_by(Message.contact_id)
        .subquery()
    )

    # Contacts cuja última mensagem é anterior ao cutoff
    result = await db.execute(
        select(Contact.name, Contact.wa_id, last_msg_sub.c.last_message)
        .join(last_msg_sub, Contact.id == last_msg_sub.c.contact_id)
        .where(Contact.tenant_id == tenant_id)
        .where(Contact.lead_status.notin_(["matriculado", "perdido"]))
        .where(last_msg_sub.c.last_message < cutoff)
        .order_by(last_msg_sub.c.last_message.asc())
        .limit(10)
    )
    leads = []
    for r in result.all():
        days_stale = (datetime.utcnow() - r.last_message).days if r.last_message else days
        leads.append({
            "name": r.name or "Sem nome",
            "wa_id": r.wa_id,
            "days_without_contact": days_stale,
        })

    return {
        "total_stale": len(leads),
        "days_threshold": days,
        "leads": leads,
    }


# ============================================================
# 5. LEADS MAIS QUENTES (POR SCORE)
# ============================================================
async def get_top_leads(args: dict, tenant_id: int, db: AsyncSession) -> dict:
    limit = args.get("limit", 5)

    result = await db.execute(
        select(
            Contact.name,
            Contact.lead_status,
            LeadAgentContext.call_score,
            LeadAgentContext.call_outcome,
        )
        .join(LeadAgentContext, LeadAgentContext.lead_id == Contact.id)
        .where(LeadAgentContext.tenant_id == tenant_id)
        .where(LeadAgentContext.call_score.isnot(None))
        .order_by(LeadAgentContext.call_score.desc())
        .limit(limit)
    )
    leads = [
        {
            "name": r.name or "Sem nome",
            "score": r.call_score,
            "stage": r.lead_status,
            "outcome": r.call_outcome,
        }
        for r in result.all()
    ]

    return {"top_leads": leads}

# ============================================================
# 8. DETALHES DE UM CONTATO ESPECÍFICO
# ============================================================
async def get_contact_details(args: dict, tenant_id: int, db: AsyncSession) -> dict:
    name = args.get("lead_name", "")
    from app.models import LeadAgentContext, Tag, contact_tags

    # Buscar contato pelo nome
    result = await db.execute(
        select(Contact)
        .where(Contact.tenant_id == tenant_id)
        .where(func.lower(Contact.name).contains(name.lower().strip()))
        .order_by(Contact.updated_at.desc())
        .limit(1)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        return {"error": f"Contato '{name}' não encontrado"}

    # Buscar contexto do agente (score, formação, etc)
    ctx_result = await db.execute(
        select(LeadAgentContext)
        .where(LeadAgentContext.lead_id == contact.id)
        .limit(1)
    )
    ctx = ctx_result.scalar_one_or_none()

    # Buscar tags
    tags_result = await db.execute(
        select(Tag.name)
        .join(contact_tags)
        .where(contact_tags.c.contact_id == contact.id)
    )
    tags = [r[0] for r in tags_result.all()]

    # Última mensagem
    last_msg_result = await db.execute(
        select(Message)
        .where(Message.contact_id == contact.id)
        .order_by(Message.timestamp.desc())
        .limit(1)
    )
    last_msg = last_msg_result.scalar_one_or_none()

    return {
        "name": contact.name or "Sem nome",
        "phone": contact.wa_id,
        "status": contact.lead_status,
        "deal_value": float(contact.deal_value or 0),
        "notes": contact.notes or "",
        "created_at": str(contact.created_at) if contact.created_at else "",
        "tags": tags,
        "score": ctx.call_score if ctx else None,
        "call_outcome": ctx.call_outcome if ctx else None,
        "formacao": ctx.wa_formacao if ctx else None,
        "atuacao": ctx.wa_atuacao if ctx else None,
        "motivacao": ctx.wa_motivacao if ctx else None,
        "last_message": {
            "direction": last_msg.direction if last_msg else None,
            "content": last_msg.content[:200] if last_msg and last_msg.content else None,
            "timestamp": str(last_msg.timestamp) if last_msg else None,
            "sent_by_ai": last_msg.sent_by_ai if last_msg else None,
        } if last_msg else None,
    }


# ============================================================
# 9. CONVERSAS DE UM CONTATO
# ============================================================
async def get_contact_conversations(args: dict, tenant_id: int, db: AsyncSession) -> dict:
    name = args.get("lead_name", "")
    limit = args.get("limit", 10)

    # Buscar contato
    result = await db.execute(
        select(Contact)
        .where(Contact.tenant_id == tenant_id)
        .where(and_(*[
            func.lower(func.unaccent(Contact.name)).contains(func.unaccent(w))
            for w in name.lower().strip().split()
        ]))
        .order_by(Contact.updated_at.desc())
        .limit(1)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        return {"error": f"Contato '{name}' não encontrado"}

    # Buscar mensagens
    msgs_result = await db.execute(
        select(Message)
        .where(Message.contact_id == contact.id)
        .where(Message.tenant_id == tenant_id)
        .order_by(Message.timestamp.desc())
        .limit(limit)
    )
    messages = msgs_result.scalars().all()

    return {
        "lead_name": contact.name,
        "total_messages": len(messages),
        "messages": [
            {
                "direction": m.direction,
                "content": m.content[:300] if m.content else "",
                "timestamp": str(m.timestamp),
                "type": m.message_type,
                "sent_by_ai": m.sent_by_ai,
            }
            for m in reversed(messages)
        ],
    }


# ============================================================
# 6. PERFORMANCE DOS AGENTES
# ============================================================
async def get_agent_performance(args: dict, tenant_id: int, db: AsyncSession) -> dict:
    period = args.get("period", "week")
    cutoff = _get_cutoff(period)

    # --- Agente WhatsApp (AIConversationSummary) ---
    wa_total_result = await db.execute(
        select(func.count(AIConversationSummary.id))
        .where(AIConversationSummary.tenant_id == tenant_id)
        .where(AIConversationSummary.started_at >= cutoff)
    )
    wa_total = wa_total_result.scalar() or 0

    # --- Agente de Voz (AICall) ---
    voice_total_result = await db.execute(
        select(func.count(AICall.id))
        .where(AICall.tenant_id == tenant_id)
        .where(AICall.created_at >= cutoff)
    )
    voice_total = voice_total_result.scalar() or 0

    # Agendamentos feitos (Schedule)
    schedules_result = await db.execute(
        select(func.count(Schedule.id))
        .where(Schedule.tenant_id == tenant_id)
        .where(Schedule.created_at >= cutoff)
    )
    schedules = schedules_result.scalar() or 0

    # Score médio das ligações
    avg_score_result = await db.execute(
        select(func.avg(AICall.score))
        .where(AICall.tenant_id == tenant_id)
        .where(AICall.created_at >= cutoff)
        .where(AICall.score > 0)
    )
    avg_score = round(float(avg_score_result.scalar() or 0), 1)

    total_interactions = wa_total + voice_total
    schedule_rate = round(schedules / total_interactions * 100, 1) if total_interactions > 0 else 0

    return {
        "period": period,
        "whatsapp_conversations": wa_total,
        "voice_calls": voice_total,
        "total_interactions": total_interactions,
        "schedules": schedules,
        "schedule_rate_percent": schedule_rate,
        "avg_call_score": avg_score,
    }


# ============================================================
# 7. PROGRESSO DA META
# ============================================================
async def get_goal_progress(args: dict, tenant_id: int, db: AsyncSession) -> dict:
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Faturamento do mês
    rev_result = await db.execute(
        select(func.sum(FinancialEntry.value))
        .where(FinancialEntry.tenant_id == tenant_id)
        .where(FinancialEntry.created_at >= month_start)
        .where(FinancialEntry.type == "income")
    )
    revenue = float(rev_result.scalar() or 0)

    # Quantidade de matrículas (entradas financeiras)
    enrollments_result = await db.execute(
        select(func.count(FinancialEntry.id))
        .where(FinancialEntry.tenant_id == tenant_id)
        .where(FinancialEntry.created_at >= month_start)
        .where(FinancialEntry.type == "income")
    )
    enrollments = enrollments_result.scalar() or 0

    # Ticket médio
    avg_ticket = round(revenue / enrollments, 2) if enrollments > 0 else 0

    # Metas do tenant
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    goal = float(getattr(tenant, "monthly_goal", 0) or 0)
    lead_goal = int(getattr(tenant, "monthly_lead_goal", 0) or 0)

    # Leads do mês
    leads_result = await db.execute(
        select(func.count(Contact.id))
        .where(Contact.tenant_id == tenant_id)
        .where(Contact.created_at >= month_start)
    )
    leads_this_month = leads_result.scalar() or 0

    remaining = max(0, goal - revenue)
    enrollments_needed = int(remaining / avg_ticket) if avg_ticket > 0 else 0

    return {
        "revenue": revenue,
        "revenue_goal": goal,
        "revenue_remaining": remaining,
        "revenue_percent": round(revenue / goal * 100, 1) if goal > 0 else 0,
        "enrollments_this_month": enrollments,
        "avg_ticket": avg_ticket,
        "enrollments_needed_to_goal": enrollments_needed,
        "leads_this_month": leads_this_month,
        "leads_goal": lead_goal,
    }


# ============================================================
# 10. PRÓXIMOS AGENDAMENTOS (schedules)
# ============================================================
async def get_upcoming_schedules(args: dict, tenant_id: int, db: AsyncSession) -> dict:
    days = int(args.get("days") or 7)
    status_filter = args.get("status", "pending")

    now = datetime.utcnow()
    cutoff = now + timedelta(days=days)

    query = (
        select(Schedule)
        .where(Schedule.tenant_id == tenant_id)
        .where(Schedule.scheduled_at >= now)
        .where(Schedule.scheduled_at <= cutoff)
    )
    if status_filter != "all":
        query = query.where(Schedule.status == status_filter)
    query = query.order_by(Schedule.scheduled_at.asc()).limit(20)

    result = await db.execute(query)
    rows = result.scalars().all()

    schedules = [
        {
            "contact_name": s.contact_name or "Sem nome",
            "phone": s.phone,
            "date": s.scheduled_date,
            "time": s.scheduled_time,
            "type": s.type,
            "course": s.course or "",
            "status": s.status,
            "notes": s.notes or "",
        }
        for s in rows
    ]

    return {
        "window_days": days,
        "total": len(schedules),
        "schedules": schedules,
    }


# ============================================================
# 11. MINHAS TAREFAS (tasks do usuário logado)
# ============================================================
async def get_my_tasks(args: dict, tenant_id: int, user_id: int | None, db: AsyncSession) -> dict:
    if not user_id:
        return {"error": "user_id não disponível no contexto"}

    status_filter = args.get("status", "pending")
    due_filter = args.get("due_filter", "all")

    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    week_str = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%d")

    query = (
        select(Task)
        .where(Task.tenant_id == tenant_id)
        .where(Task.assigned_to == user_id)
    )
    if status_filter != "all":
        query = query.where(Task.status == status_filter)

    if due_filter == "today":
        query = query.where(Task.due_date == today_str)
    elif due_filter == "overdue":
        query = query.where(Task.due_date < today_str).where(Task.status == "pending")
    elif due_filter == "week":
        query = query.where(Task.due_date >= today_str).where(Task.due_date <= week_str)

    query = query.order_by(Task.due_date.asc(), Task.due_time.asc().nullslast()).limit(30)

    result = await db.execute(query)
    rows = result.scalars().all()

    tasks = [
        {
            "title": t.title,
            "description": (t.description or "")[:200],
            "type": t.type,
            "priority": t.priority,
            "due_date": t.due_date,
            "due_time": t.due_time or "",
            "status": t.status,
        }
        for t in rows
    ]

    return {
        "status_filter": status_filter,
        "due_filter": due_filter,
        "total": len(tasks),
        "tasks": tasks,
    }


# ============================================================
# 12. RESUMO DE FORM SUBMISSIONS (leads de LP)
# ============================================================
async def get_form_submissions_summary(args: dict, tenant_id: int, db: AsyncSession) -> dict:
    period = args.get("period", "week")
    group_by = args.get("group_by", "none")
    cutoff = _get_cutoff(period)

    total_result = await db.execute(
        select(func.count(FormSubmission.id))
        .where(FormSubmission.tenant_id == tenant_id)
        .where(FormSubmission.created_at >= cutoff)
    )
    total = total_result.scalar() or 0

    breakdown = []
    if group_by == "utm_source":
        res = await db.execute(
            select(FormSubmission.utm_source, func.count(FormSubmission.id))
            .where(FormSubmission.tenant_id == tenant_id)
            .where(FormSubmission.created_at >= cutoff)
            .group_by(FormSubmission.utm_source)
        )
        breakdown = [{"key": (r[0] or "sem_utm"), "count": r[1]} for r in res.all()]
    elif group_by == "utm_campaign":
        res = await db.execute(
            select(FormSubmission.utm_campaign, func.count(FormSubmission.id))
            .where(FormSubmission.tenant_id == tenant_id)
            .where(FormSubmission.created_at >= cutoff)
            .group_by(FormSubmission.utm_campaign)
        )
        breakdown = [{"key": (r[0] or "sem_utm"), "count": r[1]} for r in res.all()]
    elif group_by == "utm_medium":
        res = await db.execute(
            select(FormSubmission.utm_medium, func.count(FormSubmission.id))
            .where(FormSubmission.tenant_id == tenant_id)
            .where(FormSubmission.created_at >= cutoff)
            .group_by(FormSubmission.utm_medium)
        )
        breakdown = [{"key": (r[0] or "sem_utm"), "count": r[1]} for r in res.all()]
    elif group_by == "landing_page":
        res = await db.execute(
            select(LandingPage.title, func.count(FormSubmission.id))
            .join(LandingPage, FormSubmission.landing_page_id == LandingPage.id)
            .where(FormSubmission.tenant_id == tenant_id)
            .where(FormSubmission.created_at >= cutoff)
            .group_by(LandingPage.title)
        )
        breakdown = [{"key": r[0], "count": r[1]} for r in res.all()]

    return {
        "period": period,
        "total_submissions": total,
        "group_by": group_by,
        "breakdown": breakdown,
    }


# ============================================================
# 13. PERFORMANCE DE LANDING PAGES
# ============================================================
async def get_landing_page_performance(args: dict, tenant_id: int, db: AsyncSession) -> dict:
    period = args.get("period", "month")

    if period == "all":
        cutoff = datetime(2000, 1, 1)
    else:
        cutoff = _get_cutoff(period)

    res = await db.execute(
        select(
            LandingPage.id,
            LandingPage.title,
            LandingPage.slug,
            LandingPage.is_active,
            func.count(FormSubmission.id).label("submissions"),
        )
        .outerjoin(
            FormSubmission,
            (FormSubmission.landing_page_id == LandingPage.id)
            & (FormSubmission.created_at >= cutoff),
        )
        .where(LandingPage.tenant_id == tenant_id)
        .group_by(LandingPage.id, LandingPage.title, LandingPage.slug, LandingPage.is_active)
        .order_by(func.count(FormSubmission.id).desc())
    )

    pages = [
        {
            "title": r.title,
            "slug": r.slug,
            "is_active": bool(r.is_active),
            "submissions": int(r.submissions or 0),
        }
        for r in res.all()
    ]

    return {
        "period": period,
        "total_pages": len(pages),
        "pages": pages,
    }