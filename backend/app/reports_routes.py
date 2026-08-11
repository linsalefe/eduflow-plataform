"""
Relatórios / KPIs — Fase 1.

Endpoint único de agregação (`GET /api/reports/overview`) que alimenta a página
`/relatorios`. Todas as agregações são feitas em SQL (date_trunc + group_by);
não há loop de queries nem contagem em Python sobre linhas cruas.

Escopo desta fase (sem migration, só dado que já existe e é confiável):
  - Leads que entraram no período (série + por canal de origem + por responsável)
  - Snapshot atual do pipeline, com as colunas vindas de Pipeline.columns
  - Movimentações de etapa (activities type='status_change') — cobertura parcial
  - Volume de mensagens: inbound/outbound e IA vs Manual/Automação

Fora de escopo (ver `PHASE2_PLACEHOLDERS`):
  - Qualquer métrica por atendente humano. Message não tem coluna que identifique
    quem enviou (não existe sent_by_user_id; sender_name só é preenchido em
    inbound de grupo), então "atendimentos/tempo por SDR" é impossível hoje.
  - Ligações: call_logs está vazia e o único insert (twilio_routes.py) não passa
    tenant_id, que é NOT NULL.

Convenções de tempo — atenção, o banco NÃO é homogêneo:
  - Message.timestamp é gravado explicitamente em America/Sao_Paulo naive
    (datetime.now(SP_TZ).replace(tzinfo=None)).
  - Contact.created_at e Activity.created_at usam server_default=func.now() e o
    servidor Postgres roda com TimeZone=Etc/UTC, ou seja, são UTC naive (3h à
    frente de SP). Por isso essas colunas passam por _to_sp() antes de qualquer
    filtro/bucket, senão leads criados após as 21h SP cairiam no dia seguinte.
"""
from datetime import date, datetime, time, timedelta
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, nullslast, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_tenant_id
from app.database import get_db
from app.models import Activity, Channel, Contact, Message, Pipeline, User

router = APIRouter(prefix="/api/reports", tags=["reports"])

MAX_RANGE_DAYS = 366

# granularity da API -> unidade do date_trunc. Whitelist: o valor nunca é
# interpolado direto na query sem passar por aqui.
_TRUNC = {"daily": "day", "weekly": "week", "monthly": "month"}

UNASSIGNED_LABEL = "Não atribuído"

PHASE2_PLACEHOLDERS = ["atendimentos_por_sdr", "tempo_por_sdr", "ligacoes"]


def _to_sp(col):
    """Converte coluna naive-UTC para naive-America/Sao_Paulo dentro do SQL."""
    return func.timezone("America/Sao_Paulo", func.timezone("UTC", col))


def _bucket_expr(col, granularity: str):
    return func.date_trunc(_TRUNC[granularity], col)


def _bucket_start(d: date, granularity: str) -> date:
    """Início do bucket que contém `d`, alinhado com o date_trunc do Postgres."""
    if granularity == "weekly":
        return d - timedelta(days=d.weekday())  # date_trunc('week') = segunda
    if granularity == "monthly":
        return d.replace(day=1)
    return d


def _next_bucket(d: date, granularity: str) -> date:
    if granularity == "weekly":
        return d + timedelta(days=7)
    if granularity == "monthly":
        return date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)
    return d + timedelta(days=1)


def _bucket_keys(start: date, end: date, granularity: str) -> list[str]:
    """Todos os buckets do intervalo, para densificar séries com zero."""
    keys: list[str] = []
    cur = _bucket_start(start, granularity)
    last = _bucket_start(end, granularity)
    while cur <= last:
        keys.append(cur.isoformat())
        cur = _next_bucket(cur, granularity)
    return keys


def _row_bucket(value: Any) -> str:
    """date_trunc devolve timestamp; normaliza para 'YYYY-MM-DD'."""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


def _densify(rows: dict[str, int], keys: list[str]) -> list[dict]:
    return [{"bucket": k, "count": int(rows.get(k, 0))} for k in keys]


def _parse_transition(description: Optional[str]) -> Optional[tuple[str, str]]:
    """
    Extrai (from, to) de 'Status: novo → em_contato'.

    O histórico só existe como texto livre (Activity.description), então o parse
    é defensivo: qualquer linha fora do formato é ignorada em vez de quebrar.
    """
    if not description or "→" not in description:
        return None
    body = description.split(":", 1)[1] if ":" in description else description
    parts = body.split("→")
    if len(parts) != 2:
        return None
    origem, destino = parts[0].strip(), parts[1].strip()
    if not origem or not destino:
        return None
    return origem, destino


@router.get("/overview")
async def reports_overview(
    start: date = Query(..., description="Início do período (YYYY-MM-DD), inclusivo"),
    end: date = Query(..., description="Fim do período (YYYY-MM-DD), inclusivo"),
    granularity: Literal["daily", "weekly", "monthly"] = "daily",
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    """
    Agregações de KPI do tenant para o período informado.

    Os blocos `leads_*`, `stage_movements` e `messages` são do PERÍODO.
    `pipeline_snapshot` é o estado ATUAL de todos os contatos do tenant — não
    respeita o filtro de data, porque lead_status não tem histórico completo
    (ver stage_movements.coverage_note).
    """
    if start > end:
        raise HTTPException(
            status_code=422, detail="Data inicial não pode ser posterior à data final"
        )
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(
            status_code=422, detail=f"Intervalo máximo de {MAX_RANGE_DAYS} dias"
        )

    # Bounds naive em horário de São Paulo; `end` é inclusivo, daí o +1 dia.
    period_start = datetime.combine(start, time.min)
    period_end = datetime.combine(end + timedelta(days=1), time.min)
    keys = _bucket_keys(start, end, granularity)

    contact_created_sp = _to_sp(Contact.created_at)
    activity_created_sp = _to_sp(Activity.created_at)

    # Grupos de WhatsApp não são leads — ficam fora de toda contagem de contato.
    not_group = Contact.is_group.isnot(True)
    contact_scope = [Contact.tenant_id == tenant_id, not_group]
    contact_period = contact_scope + [
        contact_created_sp >= period_start,
        contact_created_sp < period_end,
    ]

    # ── Q1: leads que entraram, por bucket ────────────────────────────────
    leads_bucket = _bucket_expr(contact_created_sp, granularity)
    q_leads_series = await db.execute(
        select(leads_bucket.label("bucket"), func.count(Contact.id).label("count"))
        .where(*contact_period)
        .group_by(leads_bucket)
        .order_by(leads_bucket)
    )
    leads_rows = {_row_bucket(r.bucket): int(r.count) for r in q_leads_series.all()}
    leads_series = _densify(leads_rows, keys)
    leads_total = sum(leads_rows.values())

    # ── Q2: leads por canal de ORIGEM (Contact.channel_id) ────────────────
    # Contact.channel_id é o canal em que o contato foi criado, não onde é
    # atendido hoje — a UI rotula como "canal de origem".
    q_by_channel = await db.execute(
        select(
            Contact.channel_id,
            Channel.type,
            Channel.name,
            func.count(Contact.id).label("count"),
        )
        .select_from(Contact)
        .join(Channel, Channel.id == Contact.channel_id, isouter=True)
        .where(*contact_period)
        .group_by(Contact.channel_id, Channel.type, Channel.name)
        .order_by(func.count(Contact.id).desc())
    )
    leads_by_channel = [
        {
            "channel_id": r.channel_id,
            "channel_type": r.type or "desconhecido",
            "channel_name": r.name or "Sem canal",
            "count": int(r.count),
        }
        for r in q_by_channel.all()
    ]

    # ── Q3: leads por responsável (assigned_to, ~8% preenchido) ───────────
    q_by_user = await db.execute(
        select(
            Contact.assigned_to,
            User.name,
            func.count(Contact.id).label("count"),
        )
        .select_from(Contact)
        .join(User, User.id == Contact.assigned_to, isouter=True)
        .where(*contact_period)
        .group_by(Contact.assigned_to, User.name)
        .order_by(func.count(Contact.id).desc())
    )
    leads_by_user = [
        {
            "user_id": r.assigned_to,
            "user_name": r.name if r.assigned_to else UNASSIGNED_LABEL,
            "count": int(r.count),
        }
        for r in q_by_user.all()
    ]

    # ── Q4: colunas do(s) pipeline(s) do tenant ───────────────────────────
    # lead_status é string livre; as chaves/labels/cores válidas vivem no JSON
    # Pipeline.columns. Como um tenant pode ter vários pipelines com chaves
    # diferentes, a ordem é: colunas do default primeiro, depois as chaves
    # exclusivas dos demais (dedupe por key, primeiro vencedor).
    q_pipelines = await db.execute(
        select(Pipeline.id, Pipeline.name, Pipeline.columns, Pipeline.is_default)
        .where(Pipeline.tenant_id == tenant_id)
        .order_by(nullslast(Pipeline.is_default.desc()), Pipeline.order, Pipeline.id)
    )
    column_defs: list[dict] = []
    seen_keys: set[str] = set()
    for row in q_pipelines.all():
        for col in row.columns or []:
            if not isinstance(col, dict):
                continue
            key = col.get("key")
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)
            column_defs.append(
                {
                    "key": key,
                    "label": col.get("label") or key,
                    "color": col.get("color") or "#94a3b8",
                }
            )

    # ── Q5: snapshot atual por lead_status ────────────────────────────────
    q_snapshot = await db.execute(
        select(
            Contact.lead_status,
            func.count(Contact.id).label("count"),
            func.coalesce(func.sum(Contact.deal_value), 0).label("deal_value_sum"),
        )
        .where(*contact_scope)
        .group_by(Contact.lead_status)
    )
    snapshot_rows = q_snapshot.all()
    status_counts = {r.lead_status: int(r.count) for r in snapshot_rows}
    status_values = {r.lead_status: float(r.deal_value_sum or 0) for r in snapshot_rows}

    snapshot_columns = [
        {
            "key": c["key"],
            "label": c["label"],
            "color": c["color"],
            "count": status_counts.get(c["key"], 0),
            "deal_value_sum": status_values.get(c["key"], 0.0),
        }
        for c in column_defs
    ]

    # Status que não batem com nenhuma coluna de nenhum pipeline (lixo histórico,
    # colunas renomeadas/removidas, NULL). Vão para o bucket "Outros".
    orphan_statuses = sorted(
        (s for s in status_counts if s not in seen_keys),
        key=lambda s: status_counts[s],
        reverse=True,
        # NULL vira string vazia na ordenação abaixo
    )
    others = {
        "count": sum(status_counts[s] for s in orphan_statuses),
        "deal_value_sum": sum(status_values.get(s, 0.0) for s in orphan_statuses),
        "statuses": [s if s is not None else "(vazio)" for s in orphan_statuses],
    }

    # ── Q6: snapshot cruzado com canal ────────────────────────────────────
    q_snap_channel = await db.execute(
        select(Channel.type, Contact.lead_status, func.count(Contact.id).label("count"))
        .select_from(Contact)
        .join(Channel, Channel.id == Contact.channel_id, isouter=True)
        .where(*contact_scope)
        .group_by(Channel.type, Contact.lead_status)
    )
    snapshot_by_channel = [
        {
            "channel_type": r.type or "desconhecido",
            "status_key": r.lead_status if r.lead_status in seen_keys else "outros",
            "count": int(r.count),
        }
        for r in q_snap_channel.all()
    ]

    # ── Q7: snapshot cruzado com responsável ──────────────────────────────
    q_snap_user = await db.execute(
        select(
            Contact.assigned_to, Contact.lead_status, func.count(Contact.id).label("count")
        )
        .where(*contact_scope)
        .group_by(Contact.assigned_to, Contact.lead_status)
    )
    snapshot_by_user = [
        {
            "user_id": r.assigned_to,
            "status_key": r.lead_status if r.lead_status in seen_keys else "outros",
            "count": int(r.count),
        }
        for r in q_snap_user.all()
    ]

    # ── Q8/Q9: movimentações de etapa (cobertura parcial) ─────────────────
    # Só o PATCH /api/contacts/{wa_id} grava esse Activity. Mudanças feitas por
    # chatbot, automações, workflow tools, jarvis, voice_ai e bulk-update NÃO
    # aparecem aqui — daí coverage_note='partial'.
    movement_scope = [
        Activity.tenant_id == tenant_id,
        Activity.type == "status_change",
        activity_created_sp >= period_start,
        activity_created_sp < period_end,
    ]
    mov_bucket = _bucket_expr(activity_created_sp, granularity)
    q_mov_series = await db.execute(
        select(mov_bucket.label("bucket"), func.count(Activity.id).label("count"))
        .where(*movement_scope)
        .group_by(mov_bucket)
        .order_by(mov_bucket)
    )
    mov_rows = {_row_bucket(r.bucket): int(r.count) for r in q_mov_series.all()}
    mov_series = _densify(mov_rows, keys)
    mov_total = sum(mov_rows.values())

    # As descrições já vêm agrupadas do banco; aqui só se faz o parse do texto e
    # a fusão de descrições distintas que representam a mesma transição.
    q_transitions = await db.execute(
        select(Activity.description, func.count(Activity.id).label("count"))
        .where(*movement_scope)
        .group_by(Activity.description)
        .order_by(func.count(Activity.id).desc())
        .limit(200)
    )
    transitions: dict[tuple[str, str], int] = {}
    for r in q_transitions.all():
        parsed = _parse_transition(r.description)
        if not parsed:
            continue
        transitions[parsed] = transitions.get(parsed, 0) + int(r.count)
    top_transitions = [
        {"from": origem, "to": destino, "count": total}
        for (origem, destino), total in sorted(
            transitions.items(), key=lambda kv: kv[1], reverse=True
        )[:10]
    ]

    # ── Q10: mensagens do período ─────────────────────────────────────────
    # sent_by_ai=True identifica o agente de IA. O complemento NÃO é "humano":
    # inclui chatbot, automações e auto-resposta de landing page, que gravam
    # sent_by_ai=False explicitamente. Rótulo correto: "Manual/Automação".
    msg_bucket = _bucket_expr(Message.timestamp, granularity)
    q_messages = await db.execute(
        select(
            msg_bucket.label("bucket"),
            func.count(Message.id)
            .filter(Message.direction == "inbound")
            .label("inbound"),
            func.count(Message.id)
            .filter(Message.direction == "outbound")
            .label("outbound"),
            func.count(Message.id)
            .filter(Message.sent_by_ai.is_(True))
            .label("ai"),
            func.count(Message.id)
            .filter(
                and_(Message.direction == "outbound", Message.sent_by_ai.isnot(True))
            )
            .label("manual_or_automation"),
        )
        .where(
            Message.tenant_id == tenant_id,
            Message.timestamp >= period_start,
            Message.timestamp < period_end,
        )
        .group_by(msg_bucket)
        .order_by(msg_bucket)
    )
    msg_rows = {
        _row_bucket(r.bucket): {
            "inbound": int(r.inbound),
            "outbound": int(r.outbound),
            "ai": int(r.ai),
            "manual_or_automation": int(r.manual_or_automation),
        }
        for r in q_messages.all()
    }
    empty_msg = {"inbound": 0, "outbound": 0, "ai": 0, "manual_or_automation": 0}
    messages_series = [
        {
            "bucket": k,
            "inbound": msg_rows.get(k, empty_msg)["inbound"],
            "outbound": msg_rows.get(k, empty_msg)["outbound"],
        }
        for k in keys
    ]

    return {
        "period": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "granularity": granularity,
        },
        "leads_in": {"total": leads_total, "series": leads_series},
        "leads_by_channel": leads_by_channel,
        "leads_by_user": leads_by_user,
        "pipeline_snapshot": {
            "columns": snapshot_columns,
            "others": others,
            "by_channel": snapshot_by_channel,
            "by_user": snapshot_by_user,
        },
        "stage_movements": {
            "coverage_note": "partial",
            "total": mov_total,
            "series": mov_series,
            "top_transitions": top_transitions,
        },
        "messages": {
            "inbound": sum(v["inbound"] for v in msg_rows.values()),
            "outbound": sum(v["outbound"] for v in msg_rows.values()),
            "ai": sum(v["ai"] for v in msg_rows.values()),
            "manual_or_automation": sum(
                v["manual_or_automation"] for v in msg_rows.values()
            ),
            "series": messages_series,
        },
        "phase2_placeholders": PHASE2_PLACEHOLDERS,
    }
