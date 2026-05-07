# backend/app/workflow_tools/tools.py
"""
Catálogo de 8 tools básicas do Workflow:

  1. send_message         — envia WhatsApp pro contato
  2. move_stage           — muda lead_status (+ pipeline_id opcional)
  3. apply_tag            — adiciona tag (cria se não existir)
  4. remove_tag           — remove tag
  5. create_task          — cria Task atribuída a um user
  6. assign_seller        — muda Contact.assigned_to
  7. schedule_meeting     — cria Schedule
  8. get_contact_summary  — snapshot read-only do contato

Cada tool é registrada no `registry` singleton no momento do import.
"""
import uuid
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Contact, Tag, Task, Schedule, Message, User
from app.workflow_tools.base import ToolDef, ToolContext, registry

logger = logging.getLogger(__name__)
SP_TZ = timezone(timedelta(hours=-3))


# ============================================================
# 1. send_message
# ============================================================
async def _h_send_message(args: dict, ctx: ToolContext, db: AsyncSession) -> dict:
    text = (args.get("text") or "").strip()
    if not text:
        return {"ok": False, "error": "text vazio"}
    if not ctx.channel or not ctx.contact:
        return {"ok": False, "error": "channel ou contact ausente"}

    from app.evolution.client import send_text as evolution_send_text
    try:
        await evolution_send_text(ctx.channel.instance_name, ctx.contact.wa_id, text)
    except Exception as e:
        logger.exception("workflow_tools.send_message: falha Evolution")
        return {"ok": False, "error": str(e)[:300]}

    msg = Message(
        tenant_id=ctx.tenant_id,
        wa_message_id=f"wf_{uuid.uuid4().hex[:16]}",
        contact_id=ctx.contact.id,
        channel_id=ctx.channel.id,
        direction="outbound",
        message_type="text",
        content=text,
        timestamp=datetime.now(SP_TZ).replace(tzinfo=None),
        status="sent",
        sent_by_ai=True,
    )
    db.add(msg)
    await db.flush()
    return {"ok": True, "message_id": msg.id, "sent_text": text[:100]}


registry.register(ToolDef(
    name="send_message",
    description="Envia uma mensagem de texto via WhatsApp para o contato atual do fluxo.",
    parameters_schema={
        "type": "object",
        "properties": {
            "text": {"type": "string", "description": "Texto da mensagem (suporta emojis)."}
        },
        "required": ["text"],
    },
    handler=_h_send_message,
))


# ============================================================
# 2. move_stage
# ============================================================
async def _h_move_stage(args: dict, ctx: ToolContext, db: AsyncSession) -> dict:
    stage = (args.get("stage") or "").strip()
    pipeline_id = args.get("pipeline_id")
    if not stage:
        return {"ok": False, "error": "stage vazio"}
    if not ctx.contact:
        return {"ok": False, "error": "contact ausente"}

    old_stage = ctx.contact.lead_status
    ctx.contact.lead_status = stage
    if pipeline_id:
        try:
            ctx.contact.pipeline_id = int(pipeline_id)
        except (ValueError, TypeError):
            pass
    await db.flush()
    return {"ok": True, "from_stage": old_stage, "to_stage": stage}


registry.register(ToolDef(
    name="move_stage",
    description="Move o contato para uma coluna do pipeline/Kanban (lead_status). pipeline_id é opcional.",
    parameters_schema={
        "type": "object",
        "properties": {
            "stage": {"type": "string", "description": "Nome da coluna de destino (ex: 'qualificado', 'em_negociacao')."},
            "pipeline_id": {"type": "integer", "description": "ID do pipeline (opcional). Default: mantém atual."}
        },
        "required": ["stage"],
    },
    handler=_h_move_stage,
))


# ============================================================
# 3. apply_tag
# ============================================================
async def _h_apply_tag(args: dict, ctx: ToolContext, db: AsyncSession) -> dict:
    tag_name = (args.get("tag_name") or "").strip()
    if not tag_name:
        return {"ok": False, "error": "tag_name vazio"}
    if not ctx.contact:
        return {"ok": False, "error": "contact ausente"}

    res = await db.execute(
        select(Tag).where(Tag.tenant_id == ctx.tenant_id, Tag.name == tag_name)
    )
    tag = res.scalar_one_or_none()
    if not tag:
        tag = Tag(tenant_id=ctx.tenant_id, name=tag_name)
        db.add(tag)
        await db.flush()

    existing_ids = {t.id for t in (ctx.contact.tags or [])}
    if tag.id in existing_ids:
        return {"ok": True, "tag": tag_name, "already_had": True}

    ctx.contact.tags.append(tag)
    await db.flush()
    return {"ok": True, "tag": tag_name, "already_had": False}


registry.register(ToolDef(
    name="apply_tag",
    description="Adiciona uma tag ao contato. Cria a tag automaticamente se não existir no tenant.",
    parameters_schema={
        "type": "object",
        "properties": {
            "tag_name": {"type": "string", "description": "Nome da tag (ex: 'lead-quente', 'origem-facebook')."}
        },
        "required": ["tag_name"],
    },
    handler=_h_apply_tag,
))


# ============================================================
# 4. remove_tag
# ============================================================
async def _h_remove_tag(args: dict, ctx: ToolContext, db: AsyncSession) -> dict:
    tag_name = (args.get("tag_name") or "").strip()
    if not tag_name or not ctx.contact:
        return {"ok": False, "error": "tag_name vazio ou contact ausente"}

    found = None
    for t in (ctx.contact.tags or []):
        if t.name == tag_name:
            found = t
            break
    if not found:
        return {"ok": True, "tag": tag_name, "had": False}

    ctx.contact.tags.remove(found)
    await db.flush()
    return {"ok": True, "tag": tag_name, "had": True}


registry.register(ToolDef(
    name="remove_tag",
    description="Remove uma tag do contato (silenciosamente ok se ele não tinha).",
    parameters_schema={
        "type": "object",
        "properties": {
            "tag_name": {"type": "string", "description": "Nome da tag a remover."}
        },
        "required": ["tag_name"],
    },
    handler=_h_remove_tag,
))


# ============================================================
# 5. create_task
# ============================================================
async def _h_create_task(args: dict, ctx: ToolContext, db: AsyncSession) -> dict:
    title = (args.get("title") or "").strip()
    description = (args.get("description") or "").strip()
    priority = (args.get("priority") or "media").strip()
    due_in_hours = args.get("due_in_hours")
    assigned_to = args.get("assigned_to_user_id")

    if not title or not ctx.contact:
        return {"ok": False, "error": "title vazio ou contact ausente"}

    # Sem user explícito? Tenta o assigned do contato; senão pega o primeiro user do tenant
    if not assigned_to:
        assigned_to = ctx.contact.assigned_to
    if not assigned_to:
        admin_res = await db.execute(
            select(User).where(User.tenant_id == ctx.tenant_id).limit(1)
        )
        admin = admin_res.scalar_one_or_none()
        assigned_to = admin.id if admin else None
    if not assigned_to:
        return {"ok": False, "error": "nenhum user disponível pra atribuir a tarefa"}

    due_date_dt = datetime.utcnow()
    if due_in_hours:
        try:
            due_date_dt = due_date_dt + timedelta(hours=int(due_in_hours))
        except (ValueError, TypeError):
            pass

    task = Task(
        tenant_id=ctx.tenant_id,
        title=title[:255],
        description=description,
        type="workflow_agent",
        priority=priority if priority in ("baixa", "media", "alta") else "media",
        due_date=due_date_dt.strftime("%Y-%m-%d"),
        status="pending",
        contact_id=ctx.contact.id,
        assigned_to=assigned_to,
        created_by=assigned_to,
    )
    db.add(task)
    await db.flush()
    return {"ok": True, "task_id": task.id, "assigned_to": assigned_to}


registry.register(ToolDef(
    name="create_task",
    description="Cria uma tarefa pra um vendedor cuidar do contato. Sem user explícito, atribui ao vendedor do contato ou ao primeiro user do tenant.",
    parameters_schema={
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Título curto da tarefa."},
            "description": {"type": "string", "description": "Descrição detalhada (opcional)."},
            "priority": {"type": "string", "enum": ["baixa", "media", "alta"], "description": "Prioridade (default: media)."},
            "due_in_hours": {"type": "integer", "description": "Daqui a quantas horas vence (opcional)."},
            "assigned_to_user_id": {"type": "integer", "description": "ID do user (opcional)."}
        },
        "required": ["title"],
    },
    handler=_h_create_task,
    feature_flag="tarefas",
))


# ============================================================
# 6. assign_seller
# ============================================================
async def _h_assign_seller(args: dict, ctx: ToolContext, db: AsyncSession) -> dict:
    user_id = args.get("user_id")
    if not user_id or not ctx.contact:
        return {"ok": False, "error": "user_id vazio ou contact ausente"}

    user_res = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == ctx.tenant_id)
    )
    user = user_res.scalar_one_or_none()
    if not user:
        return {"ok": False, "error": f"user {user_id} não pertence ao tenant"}

    old_assigned = ctx.contact.assigned_to
    ctx.contact.assigned_to = user_id
    await db.flush()
    return {
        "ok": True,
        "from_user_id": old_assigned,
        "to_user_id": user_id,
        "user_name": getattr(user, "name", None),
    }


registry.register(ToolDef(
    name="assign_seller",
    description="Atribui o contato a um vendedor (User) específico do tenant.",
    parameters_schema={
        "type": "object",
        "properties": {
            "user_id": {"type": "integer", "description": "ID do User do tenant."}
        },
        "required": ["user_id"],
    },
    handler=_h_assign_seller,
))


# ============================================================
# 7. schedule_meeting
# ============================================================
async def _h_schedule_meeting(args: dict, ctx: ToolContext, db: AsyncSession) -> dict:
    date = (args.get("date") or "").strip()       # YYYY-MM-DD
    time_s = (args.get("time") or "").strip()     # HH:MM
    schedule_type = (args.get("type") or "consultant").strip()
    notes = (args.get("notes") or "").strip()

    if not date or not time_s or not ctx.contact:
        return {"ok": False, "error": "date/time/contact obrigatórios"}

    try:
        scheduled_at = datetime.strptime(f"{date} {time_s}", "%Y-%m-%d %H:%M")
    except ValueError:
        return {"ok": False, "error": "formato inválido. Use date=YYYY-MM-DD e time=HH:MM"}

    sched = Schedule(
        tenant_id=ctx.tenant_id,
        type=schedule_type if schedule_type in ("voice_ai", "consultant") else "consultant",
        contact_wa_id=ctx.contact.wa_id,
        contact_name=ctx.contact.name,
        phone=ctx.contact.wa_id,
        scheduled_date=date,
        scheduled_time=time_s,
        scheduled_at=scheduled_at,
        status="pending",
        notes=notes,
    )
    db.add(sched)
    await db.flush()
    return {"ok": True, "schedule_id": sched.id, "scheduled_at": scheduled_at.isoformat()}


registry.register(ToolDef(
    name="schedule_meeting",
    description="Agenda uma reunião ou ligação com o contato. Tipos: 'consultant' (humano) ou 'voice_ai' (IA).",
    parameters_schema={
        "type": "object",
        "properties": {
            "date": {"type": "string", "description": "Data formato YYYY-MM-DD."},
            "time": {"type": "string", "description": "Hora formato HH:MM (24h)."},
            "type": {"type": "string", "enum": ["voice_ai", "consultant"], "description": "Tipo (default: consultant)."},
            "notes": {"type": "string", "description": "Observações (opcional)."}
        },
        "required": ["date", "time"],
    },
    handler=_h_schedule_meeting,
    feature_flag="agenda",
))


# ============================================================
# 8. get_contact_summary
# ============================================================
async def _h_get_contact_summary(args: dict, ctx: ToolContext, db: AsyncSession) -> dict:
    if not ctx.contact:
        return {"ok": False, "error": "contact ausente"}

    tags = [t.name for t in (ctx.contact.tags or [])]

    msgs_limit = int(args.get("messages_limit") or 5)
    msgs_res = await db.execute(
        select(Message)
        .where(Message.contact_id == ctx.contact.id)
        .order_by(Message.id.desc())
        .limit(msgs_limit)
    )
    last_msgs = [
        {
            "direction": m.direction,
            "content": (m.content or "")[:200],
            "at": m.timestamp.isoformat() if m.timestamp else None,
        }
        for m in reversed(msgs_res.scalars().all())
    ]

    return {
        "ok": True,
        "name": ctx.contact.name,
        "wa_id": ctx.contact.wa_id,
        "lead_status": ctx.contact.lead_status,
        "pipeline_id": ctx.contact.pipeline_id,
        "assigned_to": ctx.contact.assigned_to,
        "tags": tags,
        "last_inbound_at": ctx.contact.last_inbound_at.isoformat() if ctx.contact.last_inbound_at else None,
        "recent_messages": last_msgs,
    }


registry.register(ToolDef(
    name="get_contact_summary",
    description="Retorna snapshot read-only do contato atual: nome, status, tags, vendedor e últimas mensagens.",
    parameters_schema={
        "type": "object",
        "properties": {
            "messages_limit": {"type": "integer", "description": "Quantas últimas mensagens incluir (default: 5)."}
        },
    },
    handler=_h_get_contact_summary,
))
