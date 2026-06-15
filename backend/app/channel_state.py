"""
Helper para gerenciar ContactChannelState (jornada por canal).

get_or_create_channel_state: retorna (criando se preciso) a linha de estado
para um dado (contact_id, channel_id), herdando defaults do canal.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import ContactChannelState, Channel, Pipeline


async def get_or_create_channel_state(
    db: AsyncSession,
    *,
    tenant_id: int,
    contact_id: int,
    channel_id: int,
) -> ContactChannelState:
    """
    Retorna o ContactChannelState para (contact_id, channel_id).
    Se não existir, cria com defaults do canal (pipeline do canal ou default do tenant).
    """
    result = await db.execute(
        select(ContactChannelState).where(
            ContactChannelState.contact_id == contact_id,
            ContactChannelState.channel_id == channel_id,
        )
    )
    state = result.scalar_one_or_none()
    if state:
        return state

    # Resolver pipeline_id para o novo estado
    pipeline_id = None
    try:
        ch_result = await db.execute(
            select(Channel.default_pipeline_id).where(Channel.id == channel_id)
        )
        pipeline_id = ch_result.scalar_one_or_none()
        if not pipeline_id:
            p_result = await db.execute(
                select(Pipeline.id).where(
                    Pipeline.tenant_id == tenant_id,
                    Pipeline.is_default == True,
                )
            )
            pipeline_id = p_result.scalar_one_or_none()
    except Exception:
        pass

    state = ContactChannelState(
        tenant_id=tenant_id,
        contact_id=contact_id,
        channel_id=channel_id,
        pipeline_id=pipeline_id,
        lead_status="novo",
        ai_active=False,
        assigned_to=None,
        deal_value=0,
        last_inbound_at=None,
        reengagement_count=0,
    )
    db.add(state)
    await db.flush()
    return state
