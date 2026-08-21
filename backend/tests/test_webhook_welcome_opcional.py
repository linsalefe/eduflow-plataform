"""
Mensagem de boas-vindas opcional no webhook de LP externa.

Antes: welcome_message era obrigatória (Pydantic + guard do form) e o handler
chamava .replace() nela sem checar — vazio virava mensagem em branco no
WhatsApp do lead, NULL virava AttributeError engolido pelo except. Agora
vazio/NULL é configuração válida: nada é enviado ao lead e o aviso no grupo
comercial (que é independente) continua saindo.

Não sobe main.py: monta uma app mínima com o public_router real e um stub de
sessão no lugar do get_db — sem banco, sem Evolution, sem produção.

    pytest tests/test_webhook_welcome_opcional.py
"""
import os
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_db  # noqa: E402
from app.models import Channel, Contact, WebhookConfig  # noqa: E402
from app.webhook_routes import public_router  # noqa: E402

TOKEN = "tok_teste_welcome_opcional"
LEAD_PHONE = "5519995601499"
GROUP_JID = "1203630@g.us"


# ── Stub de sessão ─────────────────────────────────────────
class _Result:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class FakeSession:
    """Responde os três selects do handler (webhook, canal, contato) pela
    entidade do statement. Guarda o que foi adicionado/commitado."""

    def __init__(self, webhook, channel, contact=None):
        self._by_entity = {WebhookConfig: webhook, Channel: channel, Contact: contact}
        self.added = []
        self.commits = 0

    async def execute(self, stmt):
        entity = stmt.column_descriptions[0]["entity"]
        return _Result(self._by_entity.get(entity))

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj):
        pass


def _webhook(welcome_message, notify_group_jid=None):
    return WebhookConfig(
        id=7,
        tenant_id=1,
        channel_id=42,
        name="LP Externa Agência",
        welcome_message=welcome_message,
        # pipeline_id preenchido: evita o fallback que importaria app.routes.
        pipeline_id=3,
        pipeline_stage="novo",
        notify_group_jid=notify_group_jid,
        notify_template=None,
        is_active=True,
        token=TOKEN,
    )


def _channel():
    return Channel(id=42, tenant_id=1, name="Comercial", instance_name="inst_comercial", is_active=True)


@pytest.fixture
def make_client(monkeypatch):
    """Cria o client já com send_text e notify_lead_to_group espionados."""
    sent, notified = [], []

    async def fake_send_text(instance_name, phone, message):
        sent.append({"instance_name": instance_name, "phone": phone, "message": message})

    async def fake_notify(db, **kwargs):
        notified.append(kwargs)

    import app.evolution.client as evo_client
    import app.notify_group as notify_group

    monkeypatch.setattr(evo_client, "send_text", fake_send_text)
    monkeypatch.setattr(notify_group, "notify_lead_to_group", fake_notify)

    def _make(welcome_message, notify_group_jid=None):
        app = FastAPI()
        app.include_router(public_router)
        session = FakeSession(_webhook(welcome_message, notify_group_jid), _channel())

        async def _get_db():
            yield session

        app.dependency_overrides[get_db] = _get_db
        return TestClient(app), session, sent, notified

    return _make


def _post_lead(client, name="Ana Souza"):
    r = client.post(f"/api/webhook/lead/{TOKEN}", json={"name": name, "phone": LEAD_PHONE, "course": "Medicina"})
    assert r.status_code == 200, r.text
    return r.json()


# ── Sem mensagem: lead entra, nada vai pro WhatsApp dele ───
@pytest.mark.parametrize("welcome", [None, "", "   ", "\n"])
def test_sem_mensagem_nao_dispara_nada_ao_lead(make_client, welcome):
    """Caso da agência: vazio/NULL = lead criado, zero send_text."""
    client, session, sent, _ = make_client(welcome)
    assert _post_lead(client)["status"] == "ok"

    assert sent == [], f"não podia enviar nada ao lead, enviou: {sent}"
    contato = next(o for o in session.added if isinstance(o, Contact))
    assert contato.wa_id == LEAD_PHONE
    assert contato.name == "Ana Souza"
    assert contato.pipeline_id == 3
    assert contato.lead_status == "novo"
    assert session.commits >= 1


def test_sem_mensagem_o_aviso_de_grupo_continua_saindo(make_client):
    """Notificação de grupo é independente do disparo ao lead."""
    client, _, sent, notified = make_client(None, notify_group_jid=GROUP_JID)
    _post_lead(client)

    assert sent == []
    assert len(notified) == 1
    assert notified[0]["group_jid"] == GROUP_JID
    assert notified[0]["channel_id"] == 42
    assert notified[0]["lead_data"]["phone"] == LEAD_PHONE
    assert notified[0]["lead_data"]["name"] == "Ana Souza"


# ── Com mensagem: comportamento atual intacto ──────────────
def test_com_mensagem_dispara_como_antes(make_client):
    client, _, sent, _ = make_client("Oi {nome}, vi que você se interessou! 👋")
    _post_lead(client)

    assert len(sent) == 1
    assert sent[0]["instance_name"] == "inst_comercial"
    assert sent[0]["phone"] == LEAD_PHONE
    assert sent[0]["message"] == "Oi Ana Souza, vi que você se interessou! 👋"


def test_com_mensagem_e_grupo_os_dois_saem(make_client):
    client, _, sent, notified = make_client("Olá {nome}!", notify_group_jid=GROUP_JID)
    _post_lead(client)

    assert [s["message"] for s in sent] == ["Olá Ana Souza!"]
    assert len(notified) == 1
