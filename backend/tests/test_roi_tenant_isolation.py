"""
Regressão do vazamento entre tenants em GET /api/landing-pages/dashboard/roi.

Antes do fix, só total_leads filtrava por tenant: by_source/by_campaign/
by_page/by_day/funnel somavam as submissões de TODOS os tenants. O mesmo valia
para GET /api/landing-pages/{page_id}/stats.

Roda contra um Postgres descartável (date_trunc é específico do Postgres, não
dá para trocar por SQLite) montando uma app mínima só com o router de LPs.

    createdb eduflow_roi_test
    ROI_TEST_DATABASE_URL=postgresql+asyncpg://... pytest tests/test_roi_tenant_isolation.py
"""
import os
import sys
import asyncio
from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

TEST_DB_URL = os.getenv(
    "ROI_TEST_DATABASE_URL",
    "postgresql+asyncpg://eduflow:eduflow@localhost:5432/eduflow_roi_test",
)

from app.database import get_db  # noqa: E402
from app.models import (  # noqa: E402
    Base, Tenant, User, Channel, Contact, LandingPage, FormSubmission,
)
from app.auth import create_access_token, hash_password  # noqa: E402
import app.voice_ai.models  # noqa: E402,F401  (registra ai_calls no metadata)
from app.landing_routes import router as landing_router  # noqa: E402


# O id do usuário é igual ao do tenant no seed, então o mesmo número serve de
# tenant e de "sub" no token.
TENANT_A, TENANT_B, TENANT_VAZIO = 1, 4, 7

# (tenant, slug, utm_source, utm_campaign, telefone_da_submissao, wa_id_do_contato, lead_status)
#
# O telefone da submissão vai MASCARADO de propósito: é assim que o formulário
# grava ("+55 (11) 99000-0001") enquanto o Contact guarda o wa_id normalizado.
# wa_id None = submissão sem contato correspondente (não entra no funil).
SEED = [
    # casa depois de normalizar a máscara
    (TENANT_A, "curso-a", "google", "camp-a", "+55 (11) 99000-0001", "5511990000001", "novo"),
    # contato legado SEM o nono dígito: só casa pela variante BR
    (TENANT_A, "curso-a", "google", "camp-a", "+55 (11) 99000-0002", "551190000002", "ganho"),
    # lead que nunca virou contato
    (TENANT_A, "curso-a", "meta", "camp-a", "+55 (11) 99000-0003", None, None),
    # MESMO telefone da primeira submissão do tenant A, contato próprio do B:
    # cada tenant só pode enxergar o seu.
    (TENANT_B, "curso-b", "google", "camp-b", "+55 (11) 99000-0001", "5511990000001", "qualificado"),
    (TENANT_B, "curso-b", "tiktok", "camp-b", "+55 (11) 99000-0004", "5511990000004", "novo"),
]

# funil esperado por tenant, derivado do SEED acima
FUNIL_A = {"novo": 1, "ganho": 1}
FUNIL_B = {"qualificado": 1, "novo": 1}


async def _seed(engine):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        for tid in (TENANT_A, TENANT_B, TENANT_VAZIO):
            db.add(Tenant(
                id=tid, name=f"Tenant {tid}", slug=f"tenant-{tid}",
                owner_name=f"Dono {tid}", owner_email=f"dono{tid}@test.local",
            ))
            db.add(Channel(id=tid, tenant_id=tid, name=f"Canal {tid}", instance_name=f"inst{tid}"))
            db.add(User(
                id=tid, tenant_id=tid, name=f"User {tid}",
                email=f"u{tid}@test.local", password_hash=hash_password("x"),
                role="admin", is_active=True,
            ))
        await db.flush()

        pages = {}
        for tid, slug in ((TENANT_A, "curso-a"), (TENANT_B, "curso-b")):
            page = LandingPage(
                tenant_id=tid, channel_id=tid, slug=slug,
                title=f"LP {slug}", template="curso", config="{}", is_active=True,
            )
            db.add(page)
            pages[slug] = page
        await db.flush()

        ontem = datetime.now() - timedelta(days=1)
        for tid, slug, source, campaign, phone, wa_id, status in SEED:
            db.add(FormSubmission(
                tenant_id=tid, landing_page_id=pages[slug].id, channel_id=tid,
                name=f"Lead {phone}", phone=phone, course="Curso",
                utm_source=source, utm_medium="cpc", utm_campaign=campaign,
                created_at=ontem,
            ))
            if wa_id:
                db.add(Contact(
                    tenant_id=tid, wa_id=wa_id, name=f"Lead {phone}",
                    lead_status=status, channel_id=tid,
                ))
        await db.commit()
        return {slug: p.id for slug, p in pages.items()}


async def _seed_and_dispose():
    """Popula o banco e fecha o engine: o TestClient roda em outro event loop e
    conexões abertas aqui não podem vazar para lá."""
    engine = create_async_engine(TEST_DB_URL, future=True, poolclass=NullPool)
    try:
        return await _seed(engine)
    finally:
        await engine.dispose()


@pytest.fixture(scope="module")
def client():
    page_ids = asyncio.run(_seed_and_dispose())

    # NullPool: cada request abre a conexão no loop do TestClient.
    engine = create_async_engine(TEST_DB_URL, future=True, poolclass=NullPool)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with Session() as session:
            yield session

    app = FastAPI()
    app.include_router(landing_router)
    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as c:
        c.page_ids = page_ids
        yield c


def _auth(user_id):
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user_id)})}"}


def _roi(client, tenant):
    r = client.get("/api/landing-pages/dashboard/roi", headers=_auth(tenant))
    assert r.status_code == 200, r.text
    return r.json()


def test_roi_do_tenant_a_conta_so_o_que_e_dele(client):
    roi = _roi(client, TENANT_A)
    assert roi["total_leads"] == 3
    assert {r["source"]: r["total"] for r in roi["by_source"]} == {"google": 2, "meta": 1}
    assert {r["campaign"]: r["total"] for r in roi["by_campaign"]} == {"camp-a": 3}
    assert [(r["slug"], r["total"]) for r in roi["by_page"]] == [("curso-a", 3)]
    assert sum(r["total"] for r in roi["by_day"]) == 3
    assert roi["funnel"] == FUNIL_A


def test_roi_do_tenant_b_conta_so_o_que_e_dele(client):
    roi = _roi(client, TENANT_B)
    assert roi["total_leads"] == 2
    assert {r["source"]: r["total"] for r in roi["by_source"]} == {"google": 1, "tiktok": 1}
    assert {r["campaign"]: r["total"] for r in roi["by_campaign"]} == {"camp-b": 2}
    assert [(r["slug"], r["total"]) for r in roi["by_page"]] == [("curso-b", 2)]
    assert sum(r["total"] for r in roi["by_day"]) == 2
    assert roi["funnel"] == FUNIL_B


def test_tenants_nao_veem_os_mesmos_numeros(client):
    a, b = _roi(client, TENANT_A), _roi(client, TENANT_B)
    assert a["total_leads"] != b["total_leads"]
    # a soma de cada bloco tem de bater com o total do próprio tenant — se
    # vazasse, by_source somaria os 5 leads do banco nos dois casos.
    for roi in (a, b):
        assert sum(r["total"] for r in roi["by_source"]) == roi["total_leads"]
        assert sum(r["total"] for r in roi["by_page"]) == roi["total_leads"]
        # o funil conta contatos, não submissões: é <= total_leads porque nem
        # todo lead virou contato (ver SEED).
        assert 0 < sum(roi["funnel"].values()) <= roi["total_leads"]
    assert {r["campaign"] for r in a["by_campaign"]}.isdisjoint(
        {r["campaign"] for r in b["by_campaign"]}
    )


def test_tenant_sem_landing_page_recebe_zeros(client):
    roi = _roi(client, TENANT_VAZIO)
    assert roi == {
        "total_leads": 0,
        "by_source": [],
        "by_campaign": [],
        "by_page": [],
        "by_day": [],
        "funnel": {},
    }


def test_funnel_casa_telefone_mascarado_com_wa_id_normalizado(client):
    """A submissão grava '+55 (11) 99000-0001' e o contato '5511990000001'.

    Comparando os campos crus em SQL isso nunca casa — era a causa do funil
    voltar {} em produção.
    """
    funnel = _roi(client, TENANT_A)["funnel"]
    assert funnel.get("novo") == 1


def test_funnel_casa_contato_sem_o_nono_digito(client):
    """Contato legado gravado sem o 9 ('551190000002') tem de casar com a
    submissão de '+55 (11) 99000-0002' pela variante BR do phone_utils."""
    funnel = _roi(client, TENANT_A)["funnel"]
    assert funnel.get("ganho") == 1


def test_funnel_ignora_submissao_sem_contato(client):
    """O tenant A tem 3 submissões, mas só 2 viraram contato."""
    roi = _roi(client, TENANT_A)
    assert roi["total_leads"] == 3
    assert sum(roi["funnel"].values()) == 2


def test_funnel_nao_puxa_contato_de_outro_tenant_com_o_mesmo_telefone(client):
    """'+55 (11) 99000-0001' aparece nos dois tenants, com contatos distintos.

    Sem o filtro de tenant dos dois lados, o contato 'qualificado' do B cairia
    no funil do A (e vice-versa) — a normalização em Python amplia o conjunto de
    telefones, então esse isolamento importa ainda mais que antes.
    """
    a, b = _roi(client, TENANT_A)["funnel"], _roi(client, TENANT_B)["funnel"]
    assert "qualificado" not in a          # status que só existe no tenant B
    assert "ganho" not in b                # status que só existe no tenant A
    assert a == FUNIL_A and b == FUNIL_B


def test_stats_da_lp_nao_conta_submissao_de_outro_tenant(client):
    lp_a = client.page_ids["curso-a"]
    r = client.get(f"/api/landing-pages/{lp_a}/stats", headers=_auth(TENANT_A))
    assert r.json()["total_submissions"] == 3
    # o tenant B não tem essa LP: tem de ver zero, não os 3 leads do tenant A
    r = client.get(f"/api/landing-pages/{lp_a}/stats", headers=_auth(TENANT_B))
    assert r.json()["total_submissions"] == 0
