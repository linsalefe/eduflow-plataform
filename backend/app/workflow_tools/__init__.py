# backend/app/workflow_tools/__init__.py
"""
Camada de tools tipadas que o nó-Agente do Workflow pode chamar
para agir DENTRO do CRM (mover stage, mandar mensagem, criar tarefa,
etc). Cada tool tem schema JSON compatível com OpenAI function calling.

O import deste pacote registra automaticamente todas as tools no
registry singleton. Para listar:

    from app.workflow_tools import registry
    print(registry.names())
"""
from app.workflow_tools.base import ToolDef, ToolContext, registry
from app.workflow_tools import tools as _tools  # registra side-effect

__all__ = ["ToolDef", "ToolContext", "registry"]
