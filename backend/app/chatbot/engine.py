"""
Motor de execução do Chatbot Visual.

Entrada: handle_inbound_message() chamado pelo webhook Evolution quando
channel.operation_mode == 'chatbot'.
"""
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Tuple, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.models import (
    ChatbotFlow, ChatbotSession, ChatbotScheduledResume,
    Channel, Contact, Message, Task, Tag, User,
)

# ============================================================
# Configuração
# ============================================================
MAX_ADVANCE_STEPS = 50
SESSION_TIMEOUT_HOURS = 24
SP_TZ = timezone(timedelta(hours=-3))

EMOJI_NUMS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"]


# ============================================================
# Helpers de grafo
# ============================================================
def _node_type(node: dict) -> str:
    return node.get("type") or (node.get("data") or {}).get("kind") or ""


def find_node(graph: dict, node_id: Any) -> Optional[dict]:
    if node_id is None:
        return None
    for n in graph.get("nodes", []):
        if str(n.get("id")) == str(node_id):
            return n
    return None


def find_next_node(graph: dict, source_id: Any, source_handle: Optional[str] = None) -> Optional[dict]:
    if source_id is None:
        return None
    for e in graph.get("edges", []):
        if str(e.get("source")) != str(source_id):
            continue
        if source_handle is not None and e.get("sourceHandle") != source_handle:
            continue
        if source_handle is None and e.get("sourceHandle"):
            continue
        return find_node(graph, e.get("target"))
    if source_handle is not None:
        return None
    for e in graph.get("edges", []):
        if str(e.get("source")) == str(source_id):
            return find_node(graph, e.get("target"))
    return None


def find_trigger_node(graph: dict, text: str) -> Optional[dict]:
    text_lower = (text or "").strip().lower()
    fallback = None
    for n in graph.get("nodes", []):
        if _node_type(n) != "trigger":
            continue
        data = n.get("data") or {}
        mode = data.get("mode", "any_message")
        if mode == "keyword":
            keyword = (data.get("keyword") or "").strip().lower()
            if keyword and keyword in text_lower:
                return n
        elif mode == "any_message":
            fallback = fallback or n
    return fallback


# ============================================================
# Interpolação de variáveis
# ============================================================
def interpolate(template: str, variables: Dict[str, Any], contact: Optional[Contact] = None) -> str:
    if not template:
        return ""
    merged: Dict[str, str] = {}
    if contact is not None:
        merged["nome"] = contact.name or ""
        merged["telefone"] = contact.wa_id or ""
    for k, v in (variables or {}).items():
        merged[str(k)] = str(v)
    result = template
    for key, val in merged.items():
        result = result.replace("{" + key + "}", val)
    return result


# ============================================================
# Validação de input
# ============================================================
def validate_input(value: str, validation: str) -> bool:
    v = (value or "").strip()
    if validation in (None, "", "text"):
        return bool(v)
    if validation == "email":
        return bool(re.match(r"^[\w\.\-\+]+@[\w\-]+\.[\w\.\-]+$", v))
    if validation == "cpf":
        return len(re.sub(r"\D", "", v)) == 11
    if validation == "phone":
        d = re.sub(r"\D", "", v)
        return 10 <= len(d) <= 13
    if validation == "number":
        try:
            # BR format: 1.234,56 → strip thousands dots, then comma→dot
            cleaned = re.sub(r"[^\d\.,\-]", "", v)
            if "," in cleaned:
                cleaned = cleaned.replace(".", "").replace(",", ".")
            float(cleaned)
            return True
        except Exception:
            return False
    return True


# ============================================================
# Matching de botões
# ============================================================
def match_button_choice(buttons: List[dict], user_response: str) -> Optional[dict]:
    if not buttons or not user_response:
        return None
    clean = (user_response or "").strip().lower()

    digits = re.sub(r"\D", "", clean)
    if digits.isdigit():
        idx = int(digits) - 1
        if 0 <= idx < len(buttons):
            return buttons[idx]

    for btn in buttons:
        label = (btn.get("label") or "").strip().lower()
        if not label:
            continue
        if label == clean or label in clean or clean in label:
            return btn

    for btn in buttons:
        if btn.get("id") and str(btn["id"]).strip().lower() == clean:
            return btn
    return None


def format_buttons_as_text(intro: str, buttons: List[dict]) -> str:
    lines: List[str] = []
    if intro:
        lines.append(intro.strip())
        lines.append("")
    for i, btn in enumerate(buttons):
        num = EMOJI_NUMS[i] if i < len(EMOJI_NUMS) else f"{i+1}."
        lines.append(f"{num} {btn.get('label', '')}")
    lines.append("")
    lines.append("_Responda com o número ou o texto da opção._")
    return "\n".join(lines)


# ============================================================
# Sender
# ============================================================
async def _send_text(channel: Channel, to: str, text: str, tenant_id: int, db: AsyncSession):
    from app.evolution.client import send_text as evolution_send_text
    try:
        await evolution_send_text(channel.instance_name, to, text)
    except Exception as e:
        print(f"⚠️ Chatbot: erro Evolution ao enviar: {e}")

    msg = Message(
        tenant_id=tenant_id,
        wa_message_id=f"bot_{uuid.uuid4().hex[:16]}",
        contact_wa_id=to,
        channel_id=channel.id,
        direction="outbound",
        message_type="text",
        content=text,
        timestamp=datetime.now(SP_TZ).replace(tzinfo=None),
        status="sent",
        sent_by_ai=False,
    )
    db.add(msg)


# ============================================================
# Executor de um nó
# ============================================================
async def _execute_node(
    node: dict,
    session: ChatbotSession,
    graph: dict,
    channel: Channel,
    contact: Contact,
    db: AsyncSession,
) -> Tuple[Optional[dict], bool]:
    nt = _node_type(node)
    data = node.get("data") or {}
    to = session.contact_wa_id
    tid = session.tenant_id

    if nt == "trigger":
        return find_next_node(graph, node["id"]), False

    if nt == "message":
        text = interpolate(data.get("text", ""), session.variables, contact)
        if text:
            await _send_text(channel, to, text, tid, db)
        return find_next_node(graph, node["id"]), False

    if nt == "buttons":
        intro = interpolate(data.get("text", ""), session.variables, contact)
        buttons = data.get("buttons") or []
        rendered = format_buttons_as_text(intro, buttons)
        session.current_node_id = str(node["id"])
        session.last_interaction_at = datetime.utcnow()
        await db.commit()
        await _send_text(channel, to, rendered, tid, db)
        await db.commit()
        return None, True

    if nt == "input":
        prompt = interpolate(data.get("prompt", ""), session.variables, contact)
        session.current_node_id = str(node["id"])
        session.last_interaction_at = datetime.utcnow()
        await db.commit()
        if prompt:
            await _send_text(channel, to, prompt, tid, db)
            await db.commit()
        return None, True

    if nt == "condition":
        var_name = data.get("variable", "")
        op = data.get("operator", "equals")
        value = str(data.get("value", ""))
        actual = str((session.variables or {}).get(var_name, ""))
        a = actual.strip().lower()
        b = value.strip().lower()
        result = False
        if op == "equals":
            result = a == b
        elif op == "not_equals":
            result = a != b
        elif op == "contains":
            result = b in a
        handle = "true" if result else "false"
        return find_next_node(graph, node["id"], source_handle=handle), False

    if nt == "tag":
        tag_name = (data.get("tag_name") or "").strip()
        if tag_name:
            tag_res = await db.execute(
                select(Tag).where(Tag.tenant_id == tid, Tag.name == tag_name)
            )
            tag = tag_res.scalar_one_or_none()
            if not tag:
                tag = Tag(tenant_id=tid, name=tag_name)
                db.add(tag)
                await db.flush()
            existing_ids = {t.id for t in (contact.tags or [])}
            if tag.id not in existing_ids:
                contact.tags.append(tag)
        return find_next_node(graph, node["id"]), False

    if nt == "move_stage":
        stage = (data.get("stage") or "").strip()
        pipeline_id = data.get("pipeline_id")
        if stage and contact:
            contact.lead_status = stage
            if pipeline_id:
                try:
                    contact.pipeline_id = int(pipeline_id)
                except (ValueError, TypeError):
                    pass
        return find_next_node(graph, node["id"]), False

    if nt == "handoff":
        title = interpolate(data.get("task_title") or "Atendimento via chatbot", session.variables, contact)
        desc = interpolate(data.get("task_description") or "", session.variables, contact)
        if session.variables:
            captured = "\n".join(f"- {k}: {v}" for k, v in session.variables.items())
            desc = (desc + "\n\nDados capturados:\n" + captured).strip() if desc else f"Dados capturados:\n{captured}"

        assigned_to = data.get("assigned_to_user_id")
        if not assigned_to:
            admin_res = await db.execute(
                select(User).where(User.tenant_id == tid).limit(1)
            )
            admin = admin_res.scalar_one_or_none()
            assigned_to = admin.id if admin else None

        if assigned_to:
            task = Task(
                tenant_id=tid,
                title=title[:255],
                description=desc,
                type="chatbot_handoff",
                priority=data.get("priority", "media"),
                due_date=datetime.utcnow().strftime("%Y-%m-%d"),
                status="pending",
                contact_wa_id=contact.wa_id if contact else None,
                assigned_to=assigned_to,
                created_by=assigned_to,
            )
            db.add(task)

        stage = (data.get("stage") or "").strip()
        pipeline_id = data.get("pipeline_id")
        if stage and contact:
            contact.lead_status = stage
            if pipeline_id:
                try:
                    contact.pipeline_id = int(pipeline_id)
                except (ValueError, TypeError):
                    pass

        return None, False

    if nt == "delay":
        # Grava resume e pausa a sessão (scheduler acorda depois)
        amount = data.get("amount")
        unit = data.get("unit") or "minutes"
        try:
            amount = int(amount) if amount is not None else 1
        except (ValueError, TypeError):
            amount = 1
        if amount < 1:
            amount = 1

        if unit == "days":
            delta = timedelta(days=amount)
        elif unit == "hours":
            delta = timedelta(hours=amount)
        else:
            delta = timedelta(minutes=amount)

        next_node = find_next_node(graph, node["id"])
        if not next_node:
            return None, False

        resume = ChatbotScheduledResume(
            session_id=session.id,
            resume_at=datetime.utcnow() + delta,
            node_id=str(next_node["id"]),
            status="pending",
        )
        db.add(resume)
        session.status = "waiting"
        session.current_node_id = str(node["id"])
        session.last_interaction_at = datetime.utcnow()
        await db.commit()
        print(f"⏸️ Chatbot: sessão {session.id} aguardando {amount}{unit[0]} (retoma {resume.resume_at.isoformat()})")
        return None, True

    if nt == "end":
        return None, False

    print(f"⚠️ Chatbot: tipo de nó desconhecido '{nt}' ({node.get('id')}) — pulando")
    return find_next_node(graph, node["id"]), False


# ============================================================
# Avanço no grafo
# ============================================================
async def _advance_from(
    session: ChatbotSession,
    start_node: dict,
    graph: dict,
    channel: Channel,
    contact: Contact,
    db: AsyncSession,
):
    current = start_node
    steps = 0
    while current and steps < MAX_ADVANCE_STEPS:
        next_node, should_wait = await _execute_node(current, session, graph, channel, contact, db)
        if should_wait:
            return
        if next_node is None:
            session.current_node_id = str(current.get("id"))
            session.status = "completed"
            session.completed_at = datetime.utcnow()
            session.last_interaction_at = datetime.utcnow()
            await db.commit()
            return
        current = next_node
        steps += 1

    print(f"⚠️ Chatbot: limite de {MAX_ADVANCE_STEPS} passos na sessão {session.id}")
    session.status = "cancelled"
    session.completed_at = datetime.utcnow()
    await db.commit()


# ============================================================
# Entry point
# ============================================================
async def handle_inbound_message(
    message_text: str,
    contact_wa_id: str,
    contact_name: str,
    channel: Channel,
    tenant_id: int,
    db: AsyncSession,
):
    if not channel or not channel.active_chatbot_flow_id:
        return

    ct_res = await db.execute(
        select(Contact)
        .options(selectinload(Contact.tags))
        .where(Contact.wa_id == contact_wa_id, Contact.tenant_id == tenant_id)
    )
    contact = ct_res.scalar_one_or_none()
    if not contact:
        print(f"⚠️ Chatbot: contato {contact_wa_id} não encontrado")
        return

    if contact.ai_active:
        contact.ai_active = False

    sess_res = await db.execute(
        select(ChatbotSession).where(
            ChatbotSession.contact_wa_id == contact_wa_id,
            ChatbotSession.channel_id == channel.id,
            ChatbotSession.status == "active",
        )
    )
    session = sess_res.scalar_one_or_none()

    if session:
        last = session.last_interaction_at or session.started_at
        if last and (datetime.utcnow() - last) > timedelta(hours=SESSION_TIMEOUT_HOURS):
            session.status = "timeout"
            session.completed_at = datetime.utcnow()
            await db.commit()
            session = None

    flow_res = await db.execute(
        select(ChatbotFlow).where(
            ChatbotFlow.id == channel.active_chatbot_flow_id,
            ChatbotFlow.tenant_id == tenant_id,
        )
    )
    flow = flow_res.scalar_one_or_none()
    if not flow or not flow.is_published or not flow.published_graph:
        print(f"⚠️ Chatbot: fluxo {channel.active_chatbot_flow_id} ausente ou não publicado")
        return

    graph = flow.published_graph or {"nodes": [], "edges": []}

    # SEM sessão ativa → achar trigger e iniciar
    if session is None:
        trigger = find_trigger_node(graph, message_text)
        if not trigger:
            return

        session = ChatbotSession(
            tenant_id=tenant_id,
            flow_id=flow.id,
            channel_id=channel.id,
            contact_wa_id=contact_wa_id,
            current_node_id=str(trigger.get("id")),
            variables={},
            status="active",
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        await _advance_from(session, trigger, graph, channel, contact, db)
        return

    # COM sessão ativa → processar resposta
    waiting_node = find_node(graph, session.current_node_id)
    if not waiting_node:
        print(f"⚠️ Chatbot: nó {session.current_node_id} não encontrado — sessão cancelada")
        session.status = "cancelled"
        session.completed_at = datetime.utcnow()
        await db.commit()
        return

    nt = _node_type(waiting_node)

    if nt == "buttons":
        buttons = waiting_node.get("data", {}).get("buttons") or []
        selected = match_button_choice(buttons, message_text)
        if not selected:
            intro = interpolate(waiting_node.get("data", {}).get("text", ""), session.variables, contact)
            rendered = format_buttons_as_text("Não entendi. Por favor escolha uma das opções:\n\n" + intro, buttons)
            await _send_text(channel, contact_wa_id, rendered, tenant_id, db)
            session.last_interaction_at = datetime.utcnow()
            await db.commit()
            return
        capture_to = waiting_node.get("data", {}).get("capture_to")
        if capture_to:
            new_vars = dict(session.variables or {})
            new_vars[capture_to] = selected.get("label") or selected.get("id") or ""
            session.variables = new_vars
            flag_modified(session, "variables")
        session.last_interaction_at = datetime.utcnow()

        next_node = find_next_node(graph, waiting_node["id"], source_handle=selected.get("id"))
        await db.commit()
        if next_node:
            await _advance_from(session, next_node, graph, channel, contact, db)
        else:
            session.status = "completed"
            session.completed_at = datetime.utcnow()
            await db.commit()
        return

    if nt == "input":
        data = waiting_node.get("data") or {}
        var_name = data.get("variable") or "resposta"
        validation = data.get("validation") or "text"
        if not validate_input(message_text, validation):
            err = data.get("error_message") or "Resposta inválida. Tente novamente."
            await _send_text(channel, contact_wa_id, err, tenant_id, db)
            session.last_interaction_at = datetime.utcnow()
            await db.commit()
            return

        new_vars = dict(session.variables or {})
        new_vars[var_name] = message_text.strip()
        session.variables = new_vars
        flag_modified(session, "variables")
        session.last_interaction_at = datetime.utcnow()

        next_node = find_next_node(graph, waiting_node["id"])
        await db.commit()
        if next_node:
            await _advance_from(session, next_node, graph, channel, contact, db)
        else:
            session.status = "completed"
            session.completed_at = datetime.utcnow()
            await db.commit()
        return

    print(f"⚠️ Chatbot: sessão {session.id} em nó não-waiting '{nt}' — avançando")
    next_node = find_next_node(graph, waiting_node["id"])
    if next_node:
        await _advance_from(session, next_node, graph, channel, contact, db)
    else:
        session.status = "completed"
        session.completed_at = datetime.utcnow()
        await db.commit()


# ============================================================
# Entry point para o scheduler de delays
# ============================================================
async def resume_session_from_node(
    session_id: int,
    from_node_id: str,
    db: AsyncSession,
) -> bool:
    """
    Chamado pelo scheduler quando um resume vence.
    Carrega sessão + fluxo + contato + canal e avança a partir de `from_node_id`.
    Retorna True se avançou, False se não foi possível.
    """
    sres = await db.execute(
        select(ChatbotSession).where(ChatbotSession.id == session_id)
    )
    session = sres.scalar_one_or_none()
    if not session:
        print(f"⏰ Resume: sessão {session_id} não existe — ignorando")
        return False

    if session.status not in ("waiting", "active"):
        print(f"⏰ Resume: sessão {session_id} em status '{session.status}' — ignorando")
        return False

    chres = await db.execute(select(Channel).where(Channel.id == session.channel_id))
    channel = chres.scalar_one_or_none()
    if not channel or channel.operation_mode != "chatbot":
        print(f"⏰ Resume: canal {session.channel_id} não está em modo chatbot — cancelando sessão")
        session.status = "cancelled"
        session.completed_at = datetime.utcnow()
        await db.commit()
        return False

    fres = await db.execute(select(ChatbotFlow).where(ChatbotFlow.id == session.flow_id))
    flow = fres.scalar_one_or_none()
    if not flow or not flow.is_published or not flow.published_graph:
        session.status = "cancelled"
        session.completed_at = datetime.utcnow()
        await db.commit()
        return False

    cres = await db.execute(
        select(Contact)
        .options(selectinload(Contact.tags))
        .where(
            Contact.wa_id == session.contact_wa_id,
            Contact.tenant_id == session.tenant_id,
        )
    )
    contact = cres.scalar_one_or_none()
    if not contact:
        session.status = "cancelled"
        session.completed_at = datetime.utcnow()
        await db.commit()
        return False

    graph = flow.published_graph or {"nodes": [], "edges": []}
    node = find_node(graph, from_node_id)
    if not node:
        print(f"⏰ Resume: nó {from_node_id} sumiu do grafo — cancelando sessão")
        session.status = "cancelled"
        session.completed_at = datetime.utcnow()
        await db.commit()
        return False

    session.status = "active"
    session.last_interaction_at = datetime.utcnow()
    await db.commit()

    await _advance_from(session, node, graph, channel, contact, db)
    return True
