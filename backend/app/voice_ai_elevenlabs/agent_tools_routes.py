"""
Rotas para gerenciamento de Tools do Agente de Voice AI.
Permite criar, listar, editar, ativar/desativar e remover tools por tenant.
"""
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import asyncio
from sqlalchemy import select, text
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped
from sqlalchemy import Integer, String, Boolean, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB

from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/voice-ai/agent-tools", tags=["Agent Tools"])


# ============================================================
# SCHEMAS
# ============================================================

class ToolCreate(BaseModel):
    display_name: str
    description: str
    when_to_use: Optional[str] = None
    method: Optional[str] = "POST"
    webhook_url: Optional[str] = None
    parameters: Optional[list] = []


class ToolUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    when_to_use: Optional[str] = None
    method: Optional[str] = None
    webhook_url: Optional[str] = None
    parameters: Optional[list] = None
    is_active: Optional[bool] = None
    post_action_stage: Optional[str] = None


# ============================================================
# TOOLS PADRÃO DO SISTEMA
# ============================================================

SYSTEM_TOOLS = [
    {
        "name": "qualify_lead",
        "display_name": "Qualificar Lead",
        "description": "Quando o lead demonstrar interesse concreto, o agente registra automaticamente o nível de interesse, orçamento e prazo no CRM.",
        "when_to_use": "Sempre que o lead perguntar sobre preço, prazo ou demonstrar intenção de compra.",
        "is_system": True,
        "is_active": True,
        "method": "POST",
        "webhook_url": None,
        "parameters": [],
    },
    {
        "name": "schedule_meeting",
        "display_name": "Agendar Reunião",
        "description": "O agente verifica a agenda disponível e agenda uma reunião sem precisar de intervenção humana.",
        "when_to_use": "Quando o lead aceitar conversar com um consultor ou pedir para agendar.",
        "is_system": True,
        "is_active": True,
        "method": "POST",
        "webhook_url": None,
        "parameters": [],
    },
    {
        "name": "end_call",
        "display_name": "Encerrar Conversa",
        "description": "Quando o assunto acabar, o agente encerra a conversa com uma mensagem de despedida personalizada.",
        "when_to_use": "Quando o lead disser que não tem interesse, ou quando a conversa chegar ao fim naturalmente.",
        "is_system": True,
        "is_active": True,
        "method": None,
        "webhook_url": None,
        "parameters": [],
    },
    {
        "name": "get_customer_info",
        "display_name": "Consultar Dados do Lead",
        "description": "Antes de iniciar a conversa, o agente busca informações do lead no CRM para personalizar o atendimento.",
        "when_to_use": "Automaticamente no início de cada chamada.",
        "is_system": True,
        "is_active": True,
        "method": "GET",
        "webhook_url": None,
        "parameters": [],
    },
]


# ============================================================
# ENDPOINTS
# ============================================================

@router.get("")
async def list_tools(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista todas as tools do tenant (sistema + customizadas)."""
    tenant_id = str(current_user.id)

    result = await db.execute(
        text("""
            SELECT id, name, display_name, description, when_to_use,
                   is_active, is_system, method, webhook_url, parameters, created_at
            FROM agent_tools
            WHERE tenant_id = :tenant_id
            ORDER BY is_system DESC, display_name ASC
        """),
        {"tenant_id": tenant_id}
    )
    rows = result.mappings().all()

    # Se o tenant não tem tools ainda, inicializa com as tools padrão
    if not rows:
        await _seed_system_tools(tenant_id, db)
        result = await db.execute(
            text("""
                SELECT id, name, display_name, description, when_to_use,
                       is_active, is_system, method, webhook_url, parameters, created_at
                FROM agent_tools
                WHERE tenant_id = :tenant_id
                ORDER BY is_system DESC, display_name ASC
            """),
            {"tenant_id": tenant_id}
        )
        rows = result.mappings().all()

    return [dict(r) for r in rows]


@router.post("")
async def create_tool(
    data: ToolCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cria uma nova tool customizada."""
    tenant_id = str(current_user.id)

    import json
    result = await db.execute(
        text("""
            INSERT INTO agent_tools
                (tenant_id, name, display_name, description, when_to_use,
                 method, webhook_url, parameters, is_system, is_active)
            VALUES
                (:tenant_id, :name, :display_name, :description, :when_to_use,
                 :method, :webhook_url,CAST(:parameters AS JSONB), false, true)
            RETURNING id, name, display_name, description, when_to_use,
                      is_active, is_system, method, webhook_url, parameters, created_at
        """),
        {
            "tenant_id": tenant_id,
            "name": data.display_name.lower().replace(" ", "_"),
            "display_name": data.display_name,
            "description": data.description,
            "when_to_use": data.when_to_use,
            "method": data.method,
            "webhook_url": data.webhook_url,
            "parameters": json.dumps(data.parameters or []),
        }
    )
    await db.commit()
    row = result.mappings().first()
    return dict(row)


@router.patch("/{tool_id}")
async def update_tool(
    tool_id: int,
    data: ToolUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Atualiza uma tool (ativa/desativa ou edita campos)."""
    tenant_id = str(current_user.id)

    # Verificar que a tool pertence ao tenant
    check = await db.execute(
        text("SELECT id, is_system FROM agent_tools WHERE id = :id AND tenant_id = :tenant_id"),
        {"id": tool_id, "tenant_id": tenant_id}
    )
    row = check.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Tool não encontrada")

    # Montar campos a atualizar
    fields = []
    params: dict = {"id": tool_id, "tenant_id": tenant_id}

    if data.is_active is not None:
        fields.append("is_active = :is_active")
        params["is_active"] = data.is_active

    if data.post_action_stage is not None:
        fields.append("post_action_stage = :post_action_stage")
        params["post_action_stage"] = data.post_action_stage    

    # Tools de sistema só permitem toggle de is_active
    if not row["is_system"]:
        if data.display_name is not None:
            fields.append("display_name = :display_name")
            params["display_name"] = data.display_name
        if data.description is not None:
            fields.append("description = :description")
            params["description"] = data.description
        if data.when_to_use is not None:
            fields.append("when_to_use = :when_to_use")
            params["when_to_use"] = data.when_to_use
        if data.method is not None:
            fields.append("method = :method")
            params["method"] = data.method
        if data.webhook_url is not None:
            fields.append("webhook_url = :webhook_url")
            params["webhook_url"] = data.webhook_url
        if data.parameters is not None:
            import json
            fields.append("parameters = CAST(:parameters AS JSONB)")
            params["parameters"] = json.dumps(data.parameters)

    if not fields:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    fields.append("updated_at = NOW()")

    await db.execute(
        text(f"UPDATE agent_tools SET {', '.join(fields)} WHERE id = :id AND tenant_id = :tenant_id"),
        params
    )
    await db.commit()

    result = await db.execute(
        text("""
            SELECT id, name, display_name, description, when_to_use,
                   is_active, is_system, method, webhook_url, parameters, created_at
            FROM agent_tools WHERE id = :id
        """),
        {"id": tool_id}
    )
    return dict(result.mappings().first())


@router.delete("/{tool_id}")
async def delete_tool(
    tool_id: int,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove uma tool customizada (tools de sistema não podem ser removidas)."""
    tenant_id = str(current_user.id)

    check = await db.execute(
        text("SELECT id, is_system FROM agent_tools WHERE id = :id AND tenant_id = :tenant_id"),
        {"id": tool_id, "tenant_id": tenant_id}
    )
    row = check.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Tool não encontrada")
    if row["is_system"]:
        raise HTTPException(status_code=400, detail="Tools do sistema não podem ser removidas")

    await db.execute(
        text("DELETE FROM agent_tools WHERE id = :id AND tenant_id = :tenant_id"),
        {"id": tool_id, "tenant_id": tenant_id}
    )
    await db.commit()
    return {"ok": True}


# ============================================================
# HELPER: Seed das tools padrão
# ============================================================

async def _seed_system_tools(tenant_id: str, db: AsyncSession):
    """Insere as tools padrão para um tenant novo."""
    import json
    for tool in SYSTEM_TOOLS:
        await db.execute(
            text("""
                INSERT INTO agent_tools
                    (tenant_id, name, display_name, description, when_to_use,
                     is_system, is_active, method, webhook_url, parameters)
                VALUES
                    (:tenant_id, :name, :display_name, :description, :when_to_use,
                     :is_system, :is_active, :method, :webhook_url, CAST(:parameters AS JSONB))
                ON CONFLICT DO NOTHING
            """),
            {
                "tenant_id": tenant_id,
                "name": tool["name"],
                "display_name": tool["display_name"],
                "description": tool["description"],
                "when_to_use": tool["when_to_use"],
                "is_system": tool["is_system"],
                "is_active": tool["is_active"],
                "method": tool["method"],
                "webhook_url": tool["webhook_url"],
                "parameters": json.dumps(tool["parameters"]),
            }
        )
    await db.commit()
# ============================================================
# PERSONALIDADE DO AGENTE
# ============================================================

class PersonalityUpdate(BaseModel):
    agent_name: Optional[str] = None
    voice: Optional[str] = None
    system_prompt: Optional[str] = None
    agent_id: Optional[str] = None  # ← adicionar essa linha


@router.get("/personality")
async def get_personality(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retorna a personalidade do agente do tenant."""
    tenant_id = str(current_user.id)

    result = await db.execute(
        text("""
            SELECT agent_name, voice, system_prompt
            FROM agent_personality
            WHERE tenant_id = :tenant_id
        """),
        {"tenant_id": tenant_id}
    )
    row = result.mappings().first()

    if not row:
        return {"agent_name": "Sofia", "voice": "rachel", "system_prompt": ""}

    return dict(row)


@router.put("/personality")
async def save_personality(
    data: PersonalityUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Salva ou atualiza a personalidade do agente."""
    tenant_id = str(current_user.id)

    await db.execute(
        text("""
            INSERT INTO agent_personality (tenant_id, agent_name, voice, system_prompt, updated_at)
            VALUES (:tenant_id, :agent_name, :voice, :system_prompt, NOW())
            ON CONFLICT (tenant_id) DO UPDATE SET
                agent_name = EXCLUDED.agent_name,
                voice = EXCLUDED.voice,
                system_prompt = EXCLUDED.system_prompt,
                updated_at = NOW()
        """),
        {
            "tenant_id": tenant_id,
            "agent_name": data.agent_name or "Sofia",
            "voice": data.voice or "rachel",
            "system_prompt": data.system_prompt or "",
        }
    )
    await db.commit()
    return {"ok": True, "agent_name": data.agent_name, "voice": data.voice}

    # ============================================================
# AGENTES ELEVENLABS
# ============================================================

import os
import httpx

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_BASE = "https://api.elevenlabs.io/v1"


@router.get("/elevenlabs-agents")
async def list_elevenlabs_agents(
    current_user=Depends(get_current_user),
):
    """Lista todos os agentes da conta ElevenLabs."""
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{ELEVENLABS_BASE}/convai/agents",
            headers={"xi-api-key": ELEVENLABS_API_KEY},
            timeout=30,
        )
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail="Erro ao buscar agentes do ElevenLabs")
    
    agents = res.json().get("agents", [])
    return [{"agent_id": a["agent_id"], "name": a["name"]} for a in agents]


@router.get("/elevenlabs-agents/{agent_id}")
async def get_elevenlabs_agent(
    agent_id: str,
    current_user=Depends(get_current_user),
):
    """Busca configuração atual de um agente do ElevenLabs."""
    for attempt in range(3):
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get(
                    f"{ELEVENLABS_BASE}/convai/agents/{agent_id}",
                    headers={"xi-api-key": ELEVENLABS_API_KEY},
                    timeout=60,
                )
            if res.status_code == 200:
                data = res.json()
                return {
                    "agent_id": agent_id,
                    "name": data.get("name", ""),
                    "system_prompt": data.get("conversation_config", {}).get("agent", {}).get("prompt", {}).get("prompt", ""),
                    "voice_id": data.get("conversation_config", {}).get("tts", {}).get("voice_id", ""),
                }
        except httpx.TimeoutException:
            if attempt == 2:
                raise HTTPException(status_code=504, detail="ElevenLabs timeout após 3 tentativas")
            await asyncio.sleep(2)
    raise HTTPException(status_code=502, detail="Erro ao buscar agente")


@router.put("/elevenlabs-agents/{agent_id}")
async def update_elevenlabs_agent(
    agent_id: str,
    data: PersonalityUpdate,
    current_user=Depends(get_current_user),
):
    """Atualiza system prompt e voz de um agente no ElevenLabs."""
    payload: dict = {"conversation_config": {"agent": {}, "tts": {}}}

    if data.system_prompt is not None:
        payload["conversation_config"]["agent"] = {
            "prompt": {"prompt": data.system_prompt}
        }
    if data.voice is not None:
        payload["conversation_config"]["tts"] = {
            "voice_id": data.voice
        }
    if data.agent_name is not None:
        payload["name"] = data.agent_name

    async with httpx.AsyncClient() as client:
        res = await client.patch(
            f"{ELEVENLABS_BASE}/convai/agents/{agent_id}",
            headers={
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )

    if res.status_code not in (200, 204):
        raise HTTPException(status_code=502, detail=f"Erro ao atualizar agente: {res.text}")

    return {"ok": True}

    # ============================================================
# ESTÁGIOS DO PIPELINE
# ============================================================

@router.get("/pipeline-stages")
async def get_pipeline_stages(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retorna os estágios do pipeline do tenant logado."""
    result = await db.execute(
        text("""
            SELECT DISTINCT lead_status
            FROM contacts
            WHERE tenant_id = :tenant_id
            AND lead_status IS NOT NULL
            ORDER BY lead_status
        """),
        {"tenant_id": current_user.tenant_id}
    )
    rows = result.fetchall()
    return [{"slug": r[0], "name": r[0].replace("_", " ").title()} for r in rows]