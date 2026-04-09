"""
Composio Routes — Endpoints para gerenciar integrações Composio por tenant.

Endpoints:
  GET  /api/integrations/connections         → lista toolkits e status
  GET  /api/integrations/connections/{tk}    → status de um toolkit
  POST /api/integrations/connect/{tk}        → inicia OAuth, retorna redirect_url
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.auth import get_current_user, get_tenant_id
from app.composio_service import (
    authorize_toolkit,
    list_connections,
    check_connection,
    SUPPORTED_TOOLKITS,
)

router = APIRouter(prefix="/api/integrations", tags=["Integrations"])


@router.get("/connections")
async def get_connections(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Lista todos os toolkits suportados e status de conexão do tenant."""
    try:
        connections = list_connections(tenant_id)
        return connections
    except Exception as e:
        print(f"❌ Erro Composio list_connections: {e}")
        # Retornar todos como desconectados se Composio falhar
        return [{"toolkit": t, "name": t, "connected": False} for t in SUPPORTED_TOOLKITS]


@router.get("/connections/{toolkit}")
async def get_connection_status(
    toolkit: str,
    user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """Verifica se um toolkit específico está conectado."""
    if toolkit not in SUPPORTED_TOOLKITS:
        raise HTTPException(400, f"Toolkit não suportado. Use: {SUPPORTED_TOOLKITS}")
    try:
        connected = check_connection(tenant_id, toolkit)
        return {"toolkit": toolkit, "connected": connected}
    except Exception as e:
        print(f"❌ Erro Composio check_connection: {e}")
        return {"toolkit": toolkit, "connected": False}


@router.post("/connect/{toolkit}")
async def connect_toolkit(
    toolkit: str,
    user=Depends(get_current_user),
    tenant_id: int = Depends(get_tenant_id),
):
    """
    Inicia OAuth para conectar um toolkit.
    Retorna redirect_url — o frontend deve abrir essa URL em nova aba.
    """
    if toolkit not in SUPPORTED_TOOLKITS:
        raise HTTPException(400, f"Toolkit não suportado. Use: {SUPPORTED_TOOLKITS}")
    try:
        redirect_url = authorize_toolkit(tenant_id, toolkit)
        return {"redirect_url": redirect_url}
    except Exception as e:
        print(f"❌ Erro Composio authorize: {e}")
        raise HTTPException(500, f"Erro ao iniciar conexão: {str(e)}")


@router.get("/supported")
async def get_supported_toolkits():
    """Retorna lista de toolkits suportados pelo EduFlow."""
    toolkit_info = {
        "gmail": {"name": "Gmail", "description": "Envie e gerencie emails automáticos", "icon": "mail"},
        "googlecalendar": {"name": "Google Calendar", "description": "Agende reuniões e eventos automaticamente", "icon": "calendar"},
        "googlesheets": {"name": "Google Sheets", "description": "Exporte dados e relatórios para planilhas", "icon": "sheet"},
        "googlemeet": {"name": "Google Meet", "description": "Crie links de reunião automaticamente", "icon": "video"},
        "outlook": {"name": "Outlook", "description": "Envie e gerencie emails pelo Outlook", "icon": "mail"},
        "mailchimp": {"name": "Mailchimp", "description": "Sincronize leads com listas e campanhas de email marketing", "icon": "mailchimp"},
        "sendgrid": {"name": "SendGrid", "description": "Envie emails transacionais e campanhas em massa", "icon": "sendgrid"},
    }
    return [{"toolkit": k, **v} for k, v in toolkit_info.items()]
