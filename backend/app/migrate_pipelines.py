"""
Migração: cria pipeline default para cada tenant existente
e associa todos os contacts ao pipeline criado.

Executar: cd ~/eduflow/backend && python -m app.migrate_pipelines
"""
import json
import psycopg2
from dotenv import load_dotenv
import os

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

DATABASE_URL = os.getenv("DATABASE_URL", "")
# Converter asyncpg URL para psycopg2
dsn = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

DEFAULT_COLUMNS = [
    {"key": "novo", "label": "Novos Leads", "color": "#6366f1", "order": 0},
    {"key": "em_contato", "label": "Em Contato", "color": "#f59e0b", "order": 1},
    {"key": "qualificado", "label": "Qualificados", "color": "#8b5cf6", "order": 2},
    {"key": "em_matricula", "label": "Em Matrícula", "color": "#06b6d4", "order": 3},
    {"key": "matriculado", "label": "Matriculados", "color": "#10b981", "order": 4},
    {"key": "perdido", "label": "Perdidos", "color": "#ef4444", "order": 5},
]


def migrate():
    conn = psycopg2.connect(dsn)
    cur = conn.cursor()

    # Buscar todos os tenants
    cur.execute("SELECT id, name, kanban_columns FROM tenants")
    tenants = cur.fetchall()

    total_tenants = 0
    total_contacts = 0

    for tenant_id, tenant_name, kanban_columns in tenants:
        # Verificar se já existe pipeline default para esse tenant
        cur.execute(
            "SELECT id FROM pipelines WHERE tenant_id = %s AND is_default = true",
            (tenant_id,)
        )
        existing = cur.fetchone()
        if existing:
            print(f"  Tenant {tenant_id} ({tenant_name}) já tem pipeline default (id={existing[0]}), pulando...")
            continue

        # Determinar colunas
        columns = kanban_columns if kanban_columns else DEFAULT_COLUMNS
        if isinstance(columns, str):
            columns = json.loads(columns)

        # Criar pipeline default
        cur.execute(
            """INSERT INTO pipelines (tenant_id, name, columns, is_default, "order")
               VALUES (%s, %s, %s, true, 0) RETURNING id""",
            (tenant_id, "Pipeline Principal", json.dumps(columns))
        )
        pipeline_id = cur.fetchone()[0]

        # Atualizar contacts
        cur.execute(
            "UPDATE contacts SET pipeline_id = %s WHERE tenant_id = %s",
            (pipeline_id, tenant_id)
        )
        contacts_updated = cur.rowcount

        total_tenants += 1
        total_contacts += contacts_updated
        print(f"  Tenant {tenant_id} ({tenant_name}): pipeline_id={pipeline_id}, {contacts_updated} contacts migrados")

    conn.commit()
    cur.close()
    conn.close()

    print(f"\nMigração concluída: {total_tenants} tenants, {total_contacts} contacts atualizados")


if __name__ == "__main__":
    migrate()
