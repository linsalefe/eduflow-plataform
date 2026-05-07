# backend/app/chatbot/agent_node.py
"""
Executor isolado do nó "agent" do Workflow.

Recebe a configuração do nó (prompt, modelo, lista de tools selecionadas,
outcomes), monta contexto do lead, chama OpenAI em loop de tool-calling
e aplica as ações via app.workflow_tools.

Esta função NÃO está integrada ao engine.py ainda. F1.B faz a integração.
Pode ser chamada manualmente via REPL para teste.
"""
import os
import json
import logging
from typing import Any, Optional

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models import AIConfig, Channel, ChatbotSession, Contact, Tenant
from app.workflow_tools.base import ToolContext, ToolDef
from app.workflow_tools.filters import filter_tools_by_names

logger = logging.getLogger(__name__)
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

DEFAULT_MODEL = "gpt-4o-mini"
MAX_TOOL_LOOPS = 6
DEFAULT_TIMEOUT_SECONDS = 30


async def execute_agent_node(
    node_data: dict,
    session: ChatbotSession,
    contact: Contact,
    channel: Optional[Channel],
    db: AsyncSession,
    tenant: Optional[Tenant] = None,
) -> dict:
    """
    Executa um nó-Agente.

    node_data esperado:
      {
        "prompt": "...",                                    # system prompt
        "model": "gpt-4o-mini",                             # opcional
        "tools": ["send_message", "move_stage"],            # nomes selecionados pelo user
        "outcomes": ["qualificado", "nao_qualificado"],     # opcional — vira finish_agent enum
        "user_message": "..."                               # opcional
      }

    Retorna:
      {
        "ok": bool,
        "outcome": str,          # handle de saída (default: "done")
        "tool_calls": [...],     # log das tools chamadas
        "agent_text": str,       # último texto do agent
        "tokens_in": int,
        "tokens_out": int,
        "error": str | None,
      }
    """
    # F2.A — Se node_data.agent_id está setado, busca config no AIConfig
    # e MESCLA com o que veio inline (inline tem prioridade quando ambos presentes).
    agent_id = node_data.get("agent_id")
    saved_agent: AIConfig | None = None
    if agent_id:
        try:
            res = await db.execute(
                select(AIConfig).where(
                    AIConfig.id == int(agent_id),
                    AIConfig.tenant_id == session.tenant_id,
                )
            )
            saved_agent = res.scalar_one_or_none()
        except Exception:
            saved_agent = None
        if saved_agent is None:
            return {
                "ok": False, "outcome": "error",
                "error": f"agent_id={agent_id} não encontrado pro tenant",
                "tool_calls": [], "agent_text": "",
                "tokens_in": 0, "tokens_out": 0,
            }

    # Prompt: inline > saved_agent.system_prompt
    prompt = (node_data.get("prompt") or "").strip()
    if not prompt and saved_agent:
        prompt = (saved_agent.system_prompt or "").strip()

    # Model: inline > saved_agent.model > DEFAULT_MODEL
    model = (node_data.get("model") or "").strip()
    if not model and saved_agent:
        model = (saved_agent.model or "").strip()
    if not model:
        model = DEFAULT_MODEL

    # Tools: inline > saved_agent.tools
    selected_tool_names: list[str] = list(node_data.get("tools") or [])
    if not selected_tool_names and saved_agent and saved_agent.tools:
        selected_tool_names = list(saved_agent.tools)

    # Outcomes: inline > saved_agent.outcomes
    outcomes: list[str] = list(node_data.get("outcomes") or [])
    if not outcomes and saved_agent and saved_agent.outcomes:
        outcomes = list(saved_agent.outcomes)

    user_message = (node_data.get("user_message") or "").strip()

    base_result = {
        "tool_calls": [],
        "agent_text": "",
        "tokens_in": 0,
        "tokens_out": 0,
    }

    if not prompt:
        return {**base_result, "ok": False, "outcome": "error", "error": "prompt vazio"}

    if not contact:
        return {**base_result, "ok": False, "outcome": "error", "error": "contact ausente"}

    # 1. Resolver tools = (selecionadas pelo user) ∩ (liberadas pro tenant)
    tools = await filter_tools_by_names(session.tenant_id, selected_tool_names, db)
    tools_by_name: dict[str, ToolDef] = {t.name: t for t in tools}
    openai_tools = [t.to_openai_schema() for t in tools]

    # 2. Tool sintética finish_agent (só se outcomes foram declarados)
    outcomes_clause = ""
    if outcomes:
        outcomes_clause = (
            "\n\nAo final da execução, você DEVE chamar a função finish_agent "
            f"com um destes valores em outcome: {', '.join(repr(o) for o in outcomes)}."
        )
        openai_tools.append({
            "type": "function",
            "function": {
                "name": "finish_agent",
                "description": "Encerra o agente e define qual handle de saída do nó deve ser usado.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "outcome": {"type": "string", "enum": outcomes},
                        "summary": {"type": "string", "description": "Resumo opcional (1 linha)."},
                    },
                    "required": ["outcome"],
                },
            },
        })

    # 3. Contexto do lead pro agent
    # Snapshot defensivo: capturar tags via SQL direto se a relação não foi carregada
    # com selectinload (caso do endpoint /test em modo seguro).
    try:
        contact_tag_names = [t.name for t in (contact.tags or [])]
    except Exception:
        # Lazy load falhou em contexto async — buscar via SQL direto
        from sqlalchemy import text as _sql_text
        try:
            res = await db.execute(
                _sql_text(
                    "SELECT t.name FROM tags t "
                    "JOIN contact_tags ct ON ct.tag_id = t.id "
                    "WHERE ct.contact_wa_id = :wa_id AND t.tenant_id = :tid"
                ),
                {"wa_id": contact.wa_id, "tid": session.tenant_id if session else contact.tenant_id},
            )
            contact_tag_names = [row[0] for row in res.all()]
        except Exception:
            contact_tag_names = []

    lead_snapshot = {
        "name": contact.name,
        "wa_id": contact.wa_id,
        "lead_status": contact.lead_status,
        "tags": contact_tag_names,
    }
    session_vars = dict(session.variables or {}) if session else {}

    system_prompt = (
        prompt
        + f"\n\nDADOS DO CONTATO ATUAL:\n{json.dumps(lead_snapshot, ensure_ascii=False)}"
        + (f"\n\nVARIÁVEIS DO FLUXO:\n{json.dumps(session_vars, ensure_ascii=False)}" if session_vars else "")
        + outcomes_clause
    )

    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    messages.append({"role": "user", "content": user_message or "Execute conforme as instruções do system prompt."})

    # 4. Loop de tool calling
    tool_call_log: list[dict] = []
    total_tokens_in = 0
    total_tokens_out = 0
    final_outcome = "done"
    final_text = ""
    ctx = ToolContext(
        tenant_id=session.tenant_id,
        contact=contact,
        channel=channel,
        session=session,
        tenant=tenant,
    )

    try:
        for _ in range(MAX_TOOL_LOOPS):
            kwargs: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "timeout": DEFAULT_TIMEOUT_SECONDS,
            }
            if openai_tools:
                kwargs["tools"] = openai_tools
                kwargs["tool_choice"] = "auto"

            resp = await client.chat.completions.create(**kwargs)
            usage = resp.usage
            if usage:
                total_tokens_in += usage.prompt_tokens or 0
                total_tokens_out += usage.completion_tokens or 0

            msg = resp.choices[0].message

            if not msg.tool_calls:
                # Agent só respondeu texto — encerra.
                final_text = msg.content or ""
                break

            # Append assistant message com tool_calls
            messages.append({
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in msg.tool_calls
                ],
            })

            should_break = False
            for tc in msg.tool_calls:
                fn_name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}

                if fn_name == "finish_agent":
                    final_outcome = args.get("outcome") or "done"
                    final_text = args.get("summary") or ""
                    tool_call_log.append({"name": fn_name, "args": args, "result": {"ok": True, "finished": True}})
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps({"ok": True}),
                    })
                    should_break = True
                    continue

                tool_def = tools_by_name.get(fn_name)
                if not tool_def:
                    result = {"ok": False, "error": f"tool '{fn_name}' não disponível pro tenant"}
                else:
                    try:
                        result = await tool_def.handler(args, ctx, db)
                    except Exception as e:
                        logger.exception("workflow agent: tool '%s' falhou", fn_name)
                        result = {"ok": False, "error": str(e)[:300]}

                tool_call_log.append({"name": fn_name, "args": args, "result": result})
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False, default=str)[:4000],
                })

            if should_break:
                break
        else:
            # Estourou MAX_TOOL_LOOPS sem finalizar
            return {
                "ok": False,
                "outcome": "error",
                "error": f"max tool loops ({MAX_TOOL_LOOPS}) atingido",
                "tool_calls": tool_call_log,
                "agent_text": final_text,
                "tokens_in": total_tokens_in,
                "tokens_out": total_tokens_out,
            }

        # Marca session.variables como dirty pra commit posterior
        if session is not None:
            session.variables = dict(session.variables or {})
            flag_modified(session, "variables")

        return {
            "ok": True,
            "outcome": final_outcome,
            "tool_calls": tool_call_log,
            "agent_text": final_text,
            "tokens_in": total_tokens_in,
            "tokens_out": total_tokens_out,
            "error": None,
        }

    except Exception as e:
        logger.exception("execute_agent_node falhou")
        return {
            "ok": False,
            "outcome": "error",
            "error": str(e)[:500],
            "tool_calls": tool_call_log,
            "agent_text": final_text,
            "tokens_in": total_tokens_in,
            "tokens_out": total_tokens_out,
        }
