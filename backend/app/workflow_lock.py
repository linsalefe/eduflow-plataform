# backend/app/workflow_lock.py
"""
Lock global por lead, reutilizando a tabela `lead_agent_context`.

Owner do lock é uma string identificando quem o adquiriu (ex:
"workflow_run:42"). Reentrância: o mesmo owner pode renovar seu próprio
lock. Outros owners ficam bloqueados até `locked_until` expirar.

Timeout padrão: 5 minutos. Se o processo morrer sem release, o lock
vence e libera automaticamente.

Implementação assume single-worker uvicorn (padrão do projeto). Para
multi-worker no futuro, adicionar SELECT ... FOR UPDATE.
"""
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Contact, LeadAgentContext

logger = logging.getLogger(__name__)

LOCK_DURATION_SECONDS = 300  # 5 minutos


async def try_acquire_lock(
    contact: Contact,
    tenant_id: int,
    owner: str,
    db: AsyncSession,
    duration_seconds: int = LOCK_DURATION_SECONDS,
) -> bool:
    """
    Tenta adquirir lock global pro lead. Retorna True se conseguiu,
    False se outro owner já tem lock ativo.

    - Se LeadAgentContext do lead não existe, cria e adquire.
    - Se existe e está expirado/livre, adquire.
    - Se existe e está ativo do MESMO owner, renova (reentrante).
    - Se existe e está ativo de OUTRO owner, retorna False.
    """
    if not contact or not contact.id:
        logger.warning("workflow_lock.try_acquire: contact ausente ou sem id")
        return False

    now = datetime.utcnow()
    new_until = now + timedelta(seconds=duration_seconds)

    res = await db.execute(
        select(LeadAgentContext).where(LeadAgentContext.lead_id == contact.id)
    )
    ctx = res.scalar_one_or_none()

    if ctx is None:
        ctx = LeadAgentContext(
            tenant_id=tenant_id,
            lead_id=contact.id,
            locked_by=owner,
            locked_until=new_until,
        )
        db.add(ctx)
        await db.flush()
        return True

    # Lock ativo de outro owner?
    if ctx.locked_until is not None and ctx.locked_until > now:
        if ctx.locked_by == owner:
            # Reentrante — renova
            ctx.locked_until = new_until
            await db.flush()
            return True
        # Bloqueado por outro
        return False

    # Lock livre ou expirado — pegar
    ctx.locked_by = owner
    ctx.locked_until = new_until
    await db.flush()
    return True


async def release_lock(
    contact: Contact,
    owner: str,
    db: AsyncSession,
) -> bool:
    """
    Libera o lock se o owner bate. Retorna True se liberou, False se
    o lock pertencia a outro owner ou não existia.
    """
    if not contact or not contact.id:
        return False

    res = await db.execute(
        select(LeadAgentContext).where(LeadAgentContext.lead_id == contact.id)
    )
    ctx = res.scalar_one_or_none()
    if ctx is None:
        return False

    if ctx.locked_by != owner:
        return False

    ctx.locked_until = None
    ctx.locked_by = None
    await db.flush()
    return True


async def peek_lock(contact: Contact, db: AsyncSession) -> Optional[dict]:
    """
    Read-only: retorna info do lock atual ou None se livre/expirado.
    Útil pra debug e pra _run_workflow_safely registrar quem bloqueou.
    """
    if not contact or not contact.id:
        return None
    res = await db.execute(
        select(LeadAgentContext).where(LeadAgentContext.lead_id == contact.id)
    )
    ctx = res.scalar_one_or_none()
    if ctx is None:
        return None
    if ctx.locked_until is None:
        return None
    if ctx.locked_until <= datetime.utcnow():
        return None
    return {
        "locked_by": ctx.locked_by,
        "locked_until": ctx.locked_until.isoformat() if ctx.locked_until else None,
    }
