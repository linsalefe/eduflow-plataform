"""
Composio Service — Orquestra integrações externas por tenant.

Cada tenant do EduFlow é mapeado como user_id no Composio,
garantindo isolamento completo de credenciais e conexões.

Toolkits suportados: gmail, googlecalendar, googlesheets, googlemeet
"""
import os
from composio import Composio

COMPOSIO_API_KEY = os.getenv("COMPOSIO_API_KEY")

# Singleton — reutilizado em todo o app
composio_client = Composio(api_key=COMPOSIO_API_KEY) if COMPOSIO_API_KEY else None

SUPPORTED_TOOLKITS = ["gmail", "outlook", "googlecalendar", "googlesheets", "googlemeet", "mailchimp", "sendgrid"]


def get_composio_user_id(tenant_id: int) -> str:
    """Mapeia tenant_id do EduFlow → user_id do Composio."""
    return f"eduflow_tenant_{tenant_id}"


def create_session(tenant_id: int, toolkits: list[str] | None = None):
    """
    Cria uma sessão Composio scoped ao tenant.
    Se toolkits não for fornecido, usa todos os suportados.
    """
    if not composio_client:
        raise RuntimeError("COMPOSIO_API_KEY não configurada")

    user_id = get_composio_user_id(tenant_id)

    kwargs = {"user_id": user_id}
    if toolkits:
        kwargs["toolkits"] = toolkits

    return composio_client.create(**kwargs)


def authorize_toolkit(tenant_id: int, toolkit: str) -> str:
    """
    Inicia fluxo OAuth para conectar um toolkit ao tenant.
    Retorna a redirect_url para o frontend redirecionar o usuário.
    """
    if toolkit not in SUPPORTED_TOOLKITS:
        raise ValueError(f"Toolkit '{toolkit}' não suportado. Use: {SUPPORTED_TOOLKITS}")

    session = create_session(tenant_id, toolkits=[toolkit])
    connection_request = session.authorize(toolkit)
    return connection_request.redirect_url


def list_connections(tenant_id: int) -> list[dict]:
    """Lista todos os toolkits suportados e seu status de conexão para o tenant."""
    session = create_session(tenant_id, toolkits=SUPPORTED_TOOLKITS)
    toolkits = session.toolkits()

    result = []
    for t in toolkits.items:
        if t.slug in SUPPORTED_TOOLKITS:
            result.append({
                "toolkit": t.slug,
                "name": t.name if hasattr(t, 'name') else t.slug,
                "connected": t.connection.is_active if t.connection else False,
            })

    # Garantir que todos os suportados apareçam mesmo sem retorno
    found_slugs = {r["toolkit"] for r in result}
    for slug in SUPPORTED_TOOLKITS:
        if slug not in found_slugs:
            result.append({"toolkit": slug, "name": slug, "connected": False})

    return result


def check_connection(tenant_id: int, toolkit: str) -> bool:
    """Verifica se um toolkit específico está conectado para o tenant."""
    session = create_session(tenant_id, toolkits=[toolkit])
    toolkits = session.toolkits()
    for t in toolkits.items:
        if t.slug == toolkit:
            return t.connection.is_active if t.connection else False
    return False


def get_tools(tenant_id: int, toolkits: list[str] | None = None):
    """Retorna tools formatadas para OpenAI, scoped ao tenant."""
    session = create_session(tenant_id, toolkits=toolkits or SUPPORTED_TOOLKITS)
    return session.tools()
