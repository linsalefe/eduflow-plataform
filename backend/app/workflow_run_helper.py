# backend/app/workflow_run_helper.py
"""
Helpers para criar e atualizar WorkflowRun durante a execução de um
fluxo do Workflow Builder.

WorkflowRun é a timeline auditável da execução: trigger, nós visitados,
custo OpenAI, outcome final.
"""
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models import WorkflowRun

logger = logging.getLogger(__name__)


async def create_run(
    *,
    tenant_id: int,
    flow_id: int,
    contact_id: Optional[int],
    session_id: Optional[int],
    trigger_event: Optional[str],
    trigger_payload: Optional[dict],
    db: AsyncSession,
    initial_status: str = "running",
) -> WorkflowRun:
    """Cria um WorkflowRun e dá flush. Retorna a instância com ID."""
    run = WorkflowRun(
        tenant_id=tenant_id,
        flow_id=flow_id,
        session_id=session_id,
        contact_id=contact_id,
        trigger_event=trigger_event,
        trigger_payload=trigger_payload or {},
        status=initial_status,
        timeline=[],
        variables={},
    )
    db.add(run)
    await db.flush()
    return run


async def append_timeline_event(
    run: WorkflowRun,
    event: dict,
    db: AsyncSession,
) -> None:
    """Anexa um evento ao timeline e marca o JSONB como dirty."""
    if run is None:
        return
    timeline = list(run.timeline or [])
    enriched = {"at": datetime.utcnow().isoformat(), **event}
    timeline.append(enriched)
    run.timeline = timeline
    flag_modified(run, "timeline")
    await db.flush()


async def add_tokens(
    run: WorkflowRun,
    tokens_in: int,
    tokens_out: int,
    db: AsyncSession,
) -> None:
    """Acumula consumo OpenAI no run."""
    if run is None:
        return
    run.openai_tokens_input = (run.openai_tokens_input or 0) + (tokens_in or 0)
    run.openai_tokens_output = (run.openai_tokens_output or 0) + (tokens_out or 0)
    await db.flush()


async def complete_run(
    run: WorkflowRun,
    status: str,
    db: AsyncSession,
    error_message: Optional[str] = None,
) -> None:
    """
    Marca o run como finalizado.
    status válidos: 'completed', 'failed', 'blocked_by_lock', 'cancelled'.
    """
    if run is None:
        return
    run.status = status
    run.completed_at = datetime.utcnow()
    if error_message:
        run.error_message = error_message[:1000]
    await db.flush()
