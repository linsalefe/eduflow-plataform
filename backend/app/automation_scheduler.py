"""
Scheduler de automações — roda a cada 15 minutos.
Verifica execuções pendentes e dispara mensagens via Evolution API.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import async_session
from app.models import (
    AutomationFlow, AutomationStep, AutomationExecution,
    Contact, Channel, Message
)
from app.evolution.client import send_text

logger = logging.getLogger(__name__)


async def trigger_automations_for_contact(
    contact_wa_id: str,
    stage: str,
    tenant_id: int,
    db: AsyncSession,
):
    """
    Chamado quando um lead muda de estágio.
    Inicia execuções dos fluxos ativos para aquele estágio.
    """
    # Buscar fluxos ativos para este estágio e tenant
    result = await db.execute(
        select(AutomationFlow).where(
            AutomationFlow.tenant_id == tenant_id,
            AutomationFlow.stage == stage,
            AutomationFlow.is_active == True,
        )
    )
    flows = result.scalars().all()

    for flow in flows:
        # Verificar se já existe execução ativa para este contato neste fluxo
        existing = await db.execute(
            select(AutomationExecution).where(
                AutomationExecution.flow_id == flow.id,
                AutomationExecution.contact_wa_id == contact_wa_id,
                AutomationExecution.status == "pending",
            )
        )
        if existing.scalar_one_or_none():
            continue  # Já tem execução rodando

        # Buscar primeiro step
        first_step = await db.execute(
            select(AutomationStep).where(
                AutomationStep.flow_id == flow.id,
                AutomationStep.step_order == 1,
            )
        )
        step = first_step.scalar_one_or_none()
        if not step:
            continue

        # Criar execução
        execution = AutomationExecution(
            flow_id=flow.id,
            contact_wa_id=contact_wa_id,
            current_step=1,
            next_send_at=datetime.utcnow() + timedelta(minutes=step.delay_minutes),
            status="pending",
        )
        db.add(execution)
        logger.info(f"✅ Execução criada: fluxo {flow.name} → {contact_wa_id}")

    await db.commit()


async def cancel_automations_for_contact(contact_wa_id: str, db: AsyncSession):
    """
    Cancela todas as execuções pendentes de um contato.
    Chamado quando o lead responde ou muda de estágio.
    """
    result = await db.execute(
        select(AutomationExecution).where(
            AutomationExecution.contact_wa_id == contact_wa_id,
            AutomationExecution.status == "pending",
        )
    )
    executions = result.scalars().all()
    for ex in executions:
        ex.status = "cancelled"
        ex.updated_at = datetime.utcnow()
    if executions:
        await db.commit()
        logger.info(f"🚫 {len(executions)} execuções canceladas para {contact_wa_id}")


async def run_scheduler():
    """Job principal — processa execuções pendentes."""
    async with async_session() as db:
        try:
            now = datetime.utcnow()

            # Buscar execuções que precisam ser disparadas
            result = await db.execute(
                select(AutomationExecution).where(
                    AutomationExecution.status == "pending",
                    AutomationExecution.next_send_at <= now,
                )
            )
            executions = result.scalars().all()

            if not executions:
                return

            logger.info(f"⚡ Processando {len(executions)} execuções...")

            for execution in executions:
                try:
                    await process_execution(execution, db)
                except Exception as e:
                    logger.error(f"❌ Erro execução {execution.id}: {e}")
                    execution.error_message = str(e)
                    execution.status = "failed"
                    execution.updated_at = datetime.utcnow()
                    await db.commit()

        except Exception as e:
            logger.error(f"❌ Erro no scheduler: {e}")


async def process_execution(execution: AutomationExecution, db: AsyncSession):
    """Processa uma execução individual."""

    # Buscar o step atual
    step_result = await db.execute(
        select(AutomationStep).where(
            AutomationStep.flow_id == execution.flow_id,
            AutomationStep.step_order == execution.current_step,
        )
    )
    step = step_result.scalar_one_or_none()
    if not step:
        execution.status = "completed"
        execution.updated_at = datetime.utcnow()
        await db.commit()
        return

    # Buscar contato
    contact_result = await db.execute(
        select(Contact).where(Contact.wa_id == execution.contact_wa_id)
    )
    contact = contact_result.scalar_one_or_none()
    if not contact:
        execution.status = "cancelled"
        execution.updated_at = datetime.utcnow()
        await db.commit()
        return

    # Não disparar se a IA estiver ativa
    if contact.ai_active:
        logger.info(f"⏭️ IA ativa para {execution.contact_wa_id} — pulando")
        execution.status = "cancelled"
        execution.updated_at = datetime.utcnow()
        await db.commit()
        return

    # Buscar canal do tenant
    flow_result = await db.execute(
        select(AutomationFlow).where(AutomationFlow.id == execution.flow_id)
    )
    flow = flow_result.scalar_one_or_none()

    channel_filter = [Channel.tenant_id == flow.tenant_id, Channel.is_active == True]
    if flow.channel_id:
        channel_filter.append(Channel.id == flow.channel_id)
    channel_result = await db.execute(
        select(Channel).where(*channel_filter).limit(1)
    )
    channel = channel_result.scalar_one_or_none()
    if not channel:
        execution.status = "cancelled"
        execution.updated_at = datetime.utcnow()
        await db.commit()
        return

    # Substituir variáveis na mensagem
    message = step.message.replace("{nome}", contact.name or "")

    # Enviar mensagem via Evolution API
    await send_text(
        instance_name=channel.instance_name,
        to=execution.contact_wa_id,
        text=message,
    )
    logger.info(f"📨 Mensagem enviada para {execution.contact_wa_id} (step {execution.current_step})")
    # NOVO:
    print(f"✅ Automação [{flow.name}] → {contact.name or execution.contact_wa_id}: '{message[:50]}'")

    # Salvar mensagem no banco para aparecer na conversa
    SP_TZ = timezone(timedelta(hours=-3))
    auto_msg = Message(
        tenant_id=flow.tenant_id,
        wa_message_id=f"auto_{uuid.uuid4().hex[:16]}",
        contact_wa_id=execution.contact_wa_id,
        channel_id=channel.id,
        direction="outbound",
        message_type="text",
        content=message,
        timestamp=datetime.now(SP_TZ).replace(tzinfo=None),
        status="sent",
        sent_by_ai=False,
    )
    db.add(auto_msg)

    # Verificar próximo step
    next_step_result = await db.execute(
        select(AutomationStep).where(
            AutomationStep.flow_id == execution.flow_id,
            AutomationStep.step_order == execution.current_step + 1,
        )
    )
    next_step = next_step_result.scalar_one_or_none()

    if next_step:
        execution.current_step += 1
        execution.next_send_at = datetime.utcnow() + timedelta(minutes=next_step.delay_minutes)
        execution.updated_at = datetime.utcnow()
    else:
        execution.status = "completed"
        execution.updated_at = datetime.utcnow()

    await db.commit()


async def start_automation_scheduler():
    """Loop infinito que roda o scheduler a cada 15 minutos."""
    logger.info("🤖 Automation scheduler iniciado")
    while True:
        try:
            await run_scheduler()
        except Exception as e:
            logger.error(f"❌ Erro no loop do scheduler: {e}")
        await asyncio.sleep(60)  # 15 minutos