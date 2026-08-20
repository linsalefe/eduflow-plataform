"""
Telefone clicável no aviso de lead em grupo (app/notify_group.render_template).

O WhatsApp só transforma um número em link quando ele aparece em formato
internacional com "+". O phone chega ao helper normalizado por phone_utils
(DDI 55, sem máscara, sem "+"), então o grupo mostrava "5519995601499" como
texto morto. Agora {phone} sai com "+" e {phone_raw} entrega o número cru.

Não sobe main.py: monta uma app mínima com um endpoint que só chama o render,
que é o que está sob teste — sem banco, sem Evolution, sem produção.

    pytest tests/test_notify_phone_clicavel.py
"""
import os
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.notify_group import (  # noqa: E402
    DEFAULT_TEMPLATE,
    phone_clicavel,
    phone_raw,
    render_template,
)

PHONE = "5519995601499"


def _app() -> FastAPI:
    """App mínima: um POST que devolve o texto renderizado. Só o render sob teste."""
    app = FastAPI()

    @app.post("/render")
    async def _render(body: dict):
        return {"texto": render_template(body.get("template"), body.get("lead_data") or {})}

    return app


@pytest.fixture(scope="module")
def client():
    with TestClient(_app()) as c:
        yield c


def _render(client, lead_data, template=None):
    r = client.post("/render", json={"template": template, "lead_data": lead_data})
    assert r.status_code == 200, r.text
    return r.json()["texto"]


def test_template_padrao_sai_com_mais(client):
    """Caso do GV: o número normalizado ganha o "+" e vira link no grupo."""
    texto = _render(client, {"name": "Ana", "phone": PHONE, "origem": "highschool"})
    assert f"📞 +{PHONE}" in texto
    assert f"📞 {PHONE}\n" not in texto


def test_phone_que_ja_vem_com_mais_nao_duplica(client):
    texto = _render(client, {"name": "Ana", "phone": "+" + PHONE, "origem": "camp"})
    assert f"+{PHONE}" in texto
    assert "++" not in texto


def test_phone_raw_sai_sem_mais(client):
    texto = _render(client, {"name": "Ana", "phone": PHONE}, template="{phone_raw}")
    assert texto == PHONE


def test_phone_raw_tira_o_mais_de_entrada_ja_prefixada(client):
    texto = _render(client, {"name": "Ana", "phone": "+" + PHONE}, template="{phone_raw}")
    assert texto == PHONE


def test_template_custom_usando_os_dois(client):
    template = "Lead {name}\nClique: {phone}\nCopiar: {phone_raw}"
    texto = _render(client, {"name": "Ana", "phone": PHONE}, template=template)
    assert texto == f"Lead Ana\nClique: +{PHONE}\nCopiar: {PHONE}"


def test_phone_ausente_nao_deixa_mais_solto(client):
    """Lead sem telefone não pode render "📞 +" — "+" sozinho não é número."""
    texto = _render(client, {"name": "Ana", "origem": "camp"})
    assert "+" not in texto


def test_extras_nao_sobrescrevem_phone_nem_phone_raw(client):
    """Campo do formulário chamado "phone" não rouba o telefone do lead."""
    lead = {
        "name": "Ana",
        "phone": PHONE,
        "extra": {"phone": "11999999999", "phone_raw": "11999999999"},
    }
    texto = _render(client, lead, template="{phone}|{phone_raw}")
    assert texto == f"+{PHONE}|{PHONE}"


def test_extras_e_demais_placeholders_seguem_funcionando(client):
    """O "+" é a única mudança: o resto do render fica como estava."""
    lead = {
        "name": "Ana",
        "phone": PHONE,
        "origem": "highschool",
        "extra": {"nome_atleta": "Ana", "esporte": "vôlei", "bolsista": True, "vazio": ""},
    }
    texto = _render(client, lead)
    assert texto.startswith("🚨 Novo lead — highschool")
    assert "Nome atleta: Ana" in texto
    assert "Bolsista: sim" in texto
    assert "Vazio" not in texto
    assert f"📞 +{PHONE}" in texto


def test_default_template_inalterado():
    """O "+" nasce no render, não no template — templates salvos não migram."""
    assert DEFAULT_TEMPLATE == "🚨 Novo lead — {origem}\nNome: {name}\n📞 {phone}\n{extras}"
    assert "+" not in DEFAULT_TEMPLATE


@pytest.mark.parametrize(
    "entrada,clicavel,cru",
    [
        (PHONE, "+" + PHONE, PHONE),
        ("+" + PHONE, "+" + PHONE, PHONE),
        ("  " + PHONE + "  ", "+" + PHONE, PHONE),
        ("", "", ""),
        (None, "", ""),
    ],
)
def test_helpers_isolados(entrada, clicavel, cru):
    assert phone_clicavel(entrada) == clicavel
    assert phone_raw(entrada) == cru
