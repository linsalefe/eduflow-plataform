"""
Delay configurável entre o submit da LP e o disparo do workflow stage_change.

Problema: a LP cria o contato em 'formulario' e o flow com trigger stage_change
mandava a boas-vindas em <1s — antes do lead terminar de clicar no botão de
WhatsApp e mandar a mensagem dele. Parecia bot. Agora o DISPARO é atrasado
(não o fluxo: nó "Aguardar" tem mínimo de 1min e a sessão em 'waiting' é
cancelada quando chega inbound do contato).

Não sobe main.py nem banco: chama _trigger_chatbot_stage_change direto com
asyncio.sleep e start_flow_by_event espionados.

    pytest tests/test_lp_trigger_delay.py
"""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.chatbot.engine as engine  # noqa: E402
import app.database as database  # noqa: E402
import app.landing_routes as landing_routes  # noqa: E402
from app.routes import _trigger_chatbot_stage_change  # noqa: E402


class _FakeSession:
    """Substitui async_session(): nada de pool nem conexão real."""

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


@pytest.fixture
def spy(monkeypatch):
    """Espiona sleep e start_flow_by_event, registrando a ordem das chamadas."""
    calls = []

    async def fake_sleep(seconds):
        calls.append(("sleep", seconds))

    async def fake_start_flow(db, **kwargs):
        calls.append(("start_flow", kwargs))

    # O helper importa os dois lá dentro, então o patch é no módulo de origem.
    monkeypatch.setattr(engine, "start_flow_by_event", fake_start_flow)
    monkeypatch.setattr(database, "async_session", lambda: _FakeSession())
    monkeypatch.setattr(asyncio, "sleep", fake_sleep)
    return calls


def _run(**kwargs):
    base = dict(tenant_id=4, contact_id=99, stage_from="novo", stage_to="formulario")
    base.update(kwargs)
    asyncio.run(_trigger_chatbot_stage_change(**base))


# ── Disparo com delay (submit da LP) ───────────────────────
def test_com_delay_espera_antes_de_disparar(spy):
    """Caso GV Sports: 30s de espera e só depois o flow começa."""
    _run(delay_seconds=30)

    assert [c[0] for c in spy] == ["sleep", "start_flow"]
    assert spy[0][1] == 30
    assert spy[1][1]["event_type"] == "stage_change"
    assert spy[1][1]["tenant_id"] == 4
    assert spy[1][1]["contact_id"] == 99
    assert spy[1][1]["payload"] == {"stage_from": "novo", "stage_to": "formulario"}


# ── Disparo imediato (drag manual no Kanban) ───────────────
def test_sem_delay_nao_dorme(spy):
    """PATCH /contacts não passa delay_seconds: continua instantâneo."""
    _run()

    assert [c[0] for c in spy] == ["start_flow"]


@pytest.mark.parametrize("delay", [0, -5])
def test_delay_nao_positivo_nao_dorme(spy, delay):
    _run(delay_seconds=delay)

    assert [c[0] for c in spy] == ["start_flow"]


# ── Leitura da env ─────────────────────────────────────────
@pytest.mark.parametrize(
    "valor, esperado",
    [
        (None, 30),      # ausente
        ("", 30),        # vazio
        ("abc", 30),     # inválido
        ("-1", 30),      # negativo
        ("0", 0),        # imediato é configuração válida
        ("45", 45),
    ],
)
def test_env_int(monkeypatch, valor, esperado):
    if valor is None:
        monkeypatch.delenv("LP_TRIGGER_DELAY_SECONDS", raising=False)
    else:
        monkeypatch.setenv("LP_TRIGGER_DELAY_SECONDS", valor)

    assert landing_routes._env_int("LP_TRIGGER_DELAY_SECONDS", 30) == esperado
