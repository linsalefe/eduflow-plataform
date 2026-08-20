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


# tenant -> (user_id, nº de submissões, landing pages)
TENANT_A, TENANT_B, TENANT_VAZIO = 1, 4, 7

# (tenant, slug, utm_source, utm_campaign, telefone)
SEED = [
    (TENANT_A, "curso-a", "google", "camp-a", "5511900000001"),
    (TENANT_A, "curso-a", "google", "camp-a", "5511900000002"),
    (TENANT_A, "curso-a", "meta", "camp-a", "5511900000003"),
    (TENANT_B, "curso-b", "google", "camp-b", "5511900000004"),
    (TENANT_B, "curso-b", "tiktok", "camp-b", "5511900000005"),
]


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
        for tid, slug, source, campaign, phone in SEED:
            db.add(FormSubmission(
                tenant_id=tid, landing_page_id=pages[slug].id, channel_id=tid,
                name=f"Lead {phone}", phone=phone, course="Curso",
                utm_source=source, utm_medium="cpc", utm_campaign=campaign,
                created_at=ontem,
            ))
            db.add(Contact(
                tenant_id=tid, wa_id=phone, name=f"Lead {phone}",
                lead_status="novo", channel_id=tid,
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
    assert roi["funnel"] == {"novo": 3}


def test_roi_do_tenant_b_conta_so_o_que_e_dele(client):
    roi = _roi(client, TENANT_B)
    assert roi["total_leads"] == 2
    assert {r["source"]: r["total"] for r in roi["by_source"]} == {"google": 1, "tiktok": 1}
    assert {r["campaign"]: r["total"] for r in roi["by_campaign"]} == {"camp-b": 2}
    assert [(r["slug"], r["total"]) for r in roi["by_page"]] == [("curso-b", 2)]
    assert sum(r["total"] for r in roi["by_day"]) == 2
    assert roi["funnel"] == {"novo": 2}


def test_tenants_nao_veem_os_mesmos_numeros(client):
    a, b = _roi(client, TENANT_A), _roi(client, TENANT_B)
    assert a["total_leads"] != b["total_leads"]
    # a soma de cada bloco tem de bater com o total do próprio tenant — se
    # vazasse, by_source somaria os 5 leads do banco nos dois casos.
    for roi in (a, b):
        assert sum(r["total"] for r in roi["by_source"]) == roi["total_leads"]
        assert sum(r["total"] for r in roi["by_page"]) == roi["total_leads"]
        assert sum(roi["funnel"].values()) == roi["total_leads"]
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


def test_stats_da_lp_nao_conta_submissao_de_outro_tenant(client):
    lp_a = client.page_ids["curso-a"]
    r = client.get(f"/api/landing-pages/{lp_a}/stats", headers=_auth(TENANT_A))
    assert r.json()["total_submissions"] == 3
    # o tenant B não tem essa LP: tem de ver zero, não os 3 leads do tenant A
    r = client.get(f"/api/landing-pages/{lp_a}/stats", headers=_auth(TENANT_B))
    assert r.json()["total_submissions"] == 0
