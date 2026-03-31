"""
Worker assíncrono que processa a fila de campanhas.
Roda como task em background no startup do app.
Processa 1 ligação por vez, aguarda conclusão antes da próxima.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session
from app.voice_ai_elevenlabs.models import CallCampaign, CallCampaignItem
from app.voice_ai_elevenlabs.voice_pipeline import make_outbound_call

SP_TZ = timezone(timedelta(hours=-3))

# Controle global
_worker_running = False


async def campaign_worker():
    """
    Loop principal do worker.
    Verifica a cada 10 segundos se há campanhas 'running' com itens pendentes.
    Processa 1 ligação por vez e aguarda 30s entre ligações.
    """
    global _worker_running
    _worker_running = True

    await asyncio.sleep(15)  # Espera app iniciar
    print("📞 Campaign Worker iniciado")

    while _worker_running:
        try:
            async with async_session() as db:
                # Buscar campanha running com itens pendentes
                campaign = await _get_next_campaign(db)

                if not campaign:
                    await asyncio.sleep(10)
                    continue

                # Buscar próximo item pendente
                item = await _get_next_item(db, campaign.id)

                if not item:
                    # Sem mais itens, finalizar campanha
                    await _finalize_campaign(db, campaign)
                    continue

                # Processar a ligação
                await _process_item(db, campaign, item)

                # Aguardar entre ligações (30s para não sobrecarregar)
                await asyncio.sleep(30)

        except Exception as e:
            print(f"❌ Campaign Worker erro: {e}")
            await asyncio.sleep(10)


async def _get_next_campaign(db: AsyncSession) -> CallCampaign | None:
    """Busca a próxima campanha com status 'running'."""
    result = await db.execute(
        select(CallCampaign)
        .where(CallCampaign.status == "running")
        .order_by(CallCampaign.started_at)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _get_next_item(db: AsyncSession, campaign_id: int) -> CallCampaignItem | None:
    """Busca o próximo item pendente da campanha."""
    result = await db.execute(
        select(CallCampaignItem)
        .where(
            CallCampaignItem.campaign_id == campaign_id,
            CallCampaignItem.status == "pending",
        )
        .order_by(CallCampaignItem.id)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _process_item(db: AsyncSession, campaign: CallCampaign, item: CallCampaignItem):
    """Dispara a ligação para um item da fila."""
    now = datetime.now(SP_TZ).replace(tzinfo=None)

    try:
        # Marcar como ligando
        item.status = "calling"
        item.started_at = now
        item.attempt_count += 1
        await db.commit()

        print(f"📞 Campanha '{campaign.name}' | Ligando para {item.phone_number} ({item.resolved_variables.get('nome', 'N/A')})")

        # Disparar ligação
        result = make_outbound_call(
            to_number=item.phone_number,
            dynamic_variables=item.resolved_variables or {},
        )

        if result["success"]:
            # Ligação disparada com sucesso — o webhook vai atualizar o resultado
            item.status = "calling"
            print(f"✅ Ligação disparada para {item.phone_number}")
        else:
            # Falha ao disparar
            item.status = "failed"
            item.completed_at = now
            item.summary = f"Erro ao disparar: {result.get('error', 'Desconhecido')}"
            campaign.failed_items = (campaign.failed_items or 0) + 1
            print(f"❌ Falha ao ligar para {item.phone_number}: {result.get('error')}")

        await db.commit()

    except Exception as e:
        item.status = "failed"
        item.completed_at = now
        item.summary = f"Erro: {str(e)}"
        campaign.failed_items = (campaign.failed_items or 0) + 1
        await db.commit()
        print(f"❌ Erro ao processar item {item.id}: {e}")


async def _finalize_campaign(db: AsyncSession, campaign: CallCampaign):
    """Verifica se a campanha terminou e atualiza o status."""
    now = datetime.now(SP_TZ).replace(tzinfo=None)

    # Contar itens ainda em 'calling' (aguardando webhook)
    calling_result = await db.execute(
        select(CallCampaignItem)
        .where(
            CallCampaignItem.campaign_id == campaign.id,
            CallCampaignItem.status == "calling",
        )
    )
    calling_items = calling_result.scalars().all()

    if calling_items:
        # Ainda tem ligação em andamento, aguardar
        return

    # Tudo finalizado
    campaign.status = "completed"
    campaign.completed_at = now
    await db.commit()
    print(f"✅ Campanha '{campaign.name}' finalizada | {campaign.completed_items} completadas, {campaign.failed_items} falhas")


def stop_worker():
    """Para o worker gracefully."""
    global _worker_running
    _worker_running = False