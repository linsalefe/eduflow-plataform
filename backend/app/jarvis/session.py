# backend/app/jarvis/session.py
"""
Sessao conversacional em memoria para o Jarvis.
Mantem contexto entre perguntas do mesmo usuario. TTL de 15 minutos
de inatividade. Chave: (tenant_id, user_id).

Perde historico no reinicio do backend — aceitavel por ora.
Se precisar persistir, promover para Redis ou tabela jarvis_sessions.
"""
from datetime import datetime, timedelta
from threading import Lock
from typing import Literal

SESSION_TTL_MINUTES = 15
MAX_TURNS = 10  # user + assistant = 1 turno -> 20 mensagens no total

Role = Literal["user", "assistant"]

# Estrutura: {(tenant_id, user_id): {"messages": [...], "last_activity": datetime}}
_sessions: dict[tuple[int, int], dict] = {}
_lock = Lock()


def _cleanup_expired() -> None:
    """Remove sessoes inativas ha mais de SESSION_TTL_MINUTES."""
    cutoff = datetime.utcnow() - timedelta(minutes=SESSION_TTL_MINUTES)
    expired = [k for k, v in _sessions.items() if v["last_activity"] < cutoff]
    for k in expired:
        _sessions.pop(k, None)


def get_history(tenant_id: int, user_id: int) -> list[dict]:
    """
    Retorna o historico de mensagens da sessao (formato OpenAI chat).
    Se a sessao expirou, retorna lista vazia.
    """
    with _lock:
        _cleanup_expired()
        key = (tenant_id, user_id)
        sess = _sessions.get(key)
        if not sess:
            return []
        return list(sess["messages"])


def append_turn(
    tenant_id: int,
    user_id: int,
    user_message: str,
    assistant_message: str,
) -> None:
    """
    Adiciona um turno completo (user + assistant) a sessao.
    Cria a sessao se nao existir. Trunca para MAX_TURNS.
    """
    with _lock:
        _cleanup_expired()
        key = (tenant_id, user_id)
        sess = _sessions.get(key)
        if not sess:
            sess = {"messages": [], "last_activity": datetime.utcnow()}
            _sessions[key] = sess

        sess["messages"].append({"role": "user", "content": user_message})
        sess["messages"].append({"role": "assistant", "content": assistant_message})
        sess["last_activity"] = datetime.utcnow()

        # Truncar: manter so os ultimos MAX_TURNS turnos
        max_msgs = MAX_TURNS * 2
        if len(sess["messages"]) > max_msgs:
            sess["messages"] = sess["messages"][-max_msgs:]


def clear(tenant_id: int, user_id: int) -> None:
    """Apaga a sessao do usuario (para botao 'nova conversa' no futuro)."""
    with _lock:
        _sessions.pop((tenant_id, user_id), None)


def stats() -> dict:
    """Debug: retorna numero de sessoes ativas."""
    with _lock:
        _cleanup_expired()
        return {
            "active_sessions": len(_sessions),
            "total_messages": sum(len(s["messages"]) for s in _sessions.values()),
        }
