"""
Debounce de mensagens inbound.

Quando lead envia msg, ao invés de chamar IA imediatamente, agenda chamada
pra daqui a DEBOUNCE_SECONDS. Se nova msg chegar do mesmo contato,
cancela timer anterior e cria novo.

Implementação: dict global {contact_key: asyncio.Task}.
Requer: 1 worker uvicorn (sem memória compartilhada).
"""

import asyncio
import logging
from typing import Dict, Callable, Awaitable, Any

logger = logging.getLogger(__name__)

DEBOUNCE_SECONDS = 15

# Dict global: chave = (tenant_id, wa_id), valor = asyncio.Task agendada
_pending_tasks: Dict[tuple, asyncio.Task] = {}


def _make_key(tenant_id: int, wa_id: str) -> tuple:
    return (tenant_id, wa_id)


async def _delayed_call(
    tenant_id: int,
    wa_id: str,
    callback: Callable[..., Awaitable[Any]],
    callback_args: tuple,
    callback_kwargs: dict,
):
    """Espera DEBOUNCE_SECONDS e chama callback. Remove entrada do dict após execução."""
    key = _make_key(tenant_id, wa_id)
    try:
        await asyncio.sleep(DEBOUNCE_SECONDS)
        logger.info(f"Debounce expirou para {key}, executando callback")
        await callback(*callback_args, **callback_kwargs)
    except asyncio.CancelledError:
        logger.info(f"Debounce cancelado para {key} (nova mensagem chegou)")
        raise
    except Exception:
        logger.exception(f"Erro no debounce callback para {key}")
    finally:
        current = _pending_tasks.get(key)
        if current and current.done():
            _pending_tasks.pop(key, None)


def schedule_debounced_call(
    tenant_id: int,
    wa_id: str,
    callback: Callable[..., Awaitable[Any]],
    callback_kwargs: dict,
):
    """
    Agenda chamada do callback após DEBOUNCE_SECONDS de silêncio.

    Se já existe timer ativo pra esse (tenant_id, wa_id), cancela e cria novo.
    callback_kwargs são passados ao callback como **kwargs.
    """
    key = _make_key(tenant_id, wa_id)

    existing = _pending_tasks.get(key)
    if existing and not existing.done():
        existing.cancel()
        logger.info(f"Resetando debounce para {key}")

    task = asyncio.create_task(
        _delayed_call(tenant_id, wa_id, callback, (), callback_kwargs)
    )
    _pending_tasks[key] = task
    logger.info(f"Debounce agendado para {key} ({DEBOUNCE_SECONDS}s)")
