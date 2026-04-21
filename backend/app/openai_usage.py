"""
Helper central para registrar consumo OpenAI em token_usage.
Nunca levanta exceção — falha silenciosamente.
"""
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TokenUsage

log = logging.getLogger(__name__)


async def log_openai_usage(
    db: AsyncSession,
    tenant_id: int,
    module: str,
    model: str,
    response,
) -> None:
    try:
        usage = getattr(response, "usage", None)
        if not usage:
            return

        prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
        completion_tokens = getattr(usage, "completion_tokens", 0) or 0
        total_tokens = getattr(usage, "total_tokens", prompt_tokens + completion_tokens) or 0

        record = TokenUsage(
            tenant_id=tenant_id,
            source=module,
            module=module,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
        )
        db.add(record)
        await db.commit()
    except Exception as e:
        log.warning("log_openai_usage falhou (%s/%s): %s", module, model, e)


async def log_whisper_usage(
    db: AsyncSession,
    tenant_id: int,
    module: str,
    duration_seconds: float,
) -> None:
    try:
        record = TokenUsage(
            tenant_id=tenant_id,
            source=module,
            module=module,
            model="whisper-1",
            prompt_tokens=int(duration_seconds),
            completion_tokens=0,
            total_tokens=int(duration_seconds),
        )
        db.add(record)
        await db.commit()
    except Exception as e:
        log.warning("log_whisper_usage falhou (%s): %s", module, e)
