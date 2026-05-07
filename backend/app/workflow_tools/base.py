# backend/app/workflow_tools/base.py
"""
Definições base da camada de tools do Workflow.

ToolDef descreve uma tool: nome, descrição, schema de parâmetros,
handler async e flags opcionais de gate (feature ou plan).

ToolContext é o contexto repassado pra cada handler quando ele é
invocado pelo nó-Agente: tenant, contact, channel, session.

WorkflowToolRegistry mantém o catálogo global de tools.
"""
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Channel, ChatbotSession, Contact, Tenant


@dataclass
class ToolContext:
    """Contexto repassado a cada handler de tool."""
    tenant_id: int
    contact: Contact
    channel: Optional[Channel] = None
    session: Optional[ChatbotSession] = None
    tenant: Optional[Tenant] = None


@dataclass
class ToolDef:
    """Definição de uma tool do Workflow."""
    name: str
    description: str
    parameters_schema: dict  # JSON Schema (compatível com OpenAI tool calling)
    handler: Callable[[dict, ToolContext, AsyncSession], Awaitable[dict]]
    feature_flag: Optional[str] = None  # gate via tenant.features
    plan_flag: Optional[str] = None     # gate via tenant.agent_plan_flags

    def to_openai_schema(self) -> dict:
        """Schema no formato esperado pelo OpenAI function calling."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters_schema,
            },
        }


class WorkflowToolRegistry:
    """Registry global de tools do Workflow (singleton)."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolDef] = {}

    def register(self, tool: ToolDef) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Tool '{tool.name}' já registrada")
        self._tools[tool.name] = tool

    def get(self, name: str) -> Optional[ToolDef]:
        return self._tools.get(name)

    def all(self) -> list[ToolDef]:
        return list(self._tools.values())

    def names(self) -> list[str]:
        return list(self._tools.keys())


# Singleton global. tools.py vai chamar registry.register(...) no import.
registry = WorkflowToolRegistry()
