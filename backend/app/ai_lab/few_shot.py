"""
Few-shot learning para o agente do EduFlow.

Fluxo:
1. Cliente corrige uma resposta da IA no Laboratório -> registro em ai_feedback
   (rating='edit') com embedding do contexto gerado.
2. Antes de gerar próxima resposta, `get_relevant_examples()` busca as N
   correções mais similares ao contexto atual (cosine distance via pgvector).
3. `format_examples_for_prompt()` converte isso num bloco pra injetar no
   system_prompt.

Limites rígidos ficam como constantes no topo. Mudar aqui impacta custo
de inferência e qualidade — revisar com cuidado.
"""
import os
import logging
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIFeedback

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# --- Limites rígidos (não remover sem revisar custo) ---
MAX_FEWSHOT_EXAMPLES = 3
MAX_TOKENS_PER_EXAMPLE = 400  # em chars aproximados, truncagem pura
SIMILARITY_THRESHOLD = 0.75
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMS = 1536
MAX_EMBEDDING_INPUT_CHARS = 8000


async def generate_context_embedding(text_input: str) -> list[float] | None:
    """
    Gera embedding de um trecho de conversa.
    Retorna None em caso de falha (nunca levanta exceção — few-shot é best-effort).
    """
    if not text_input or not text_input.strip():
        return None
    try:
        response = await client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text_input[:MAX_EMBEDDING_INPUT_CHARS],
        )
        return response.data[0].embedding
    except Exception as e:
        logger.error(f"[ai_lab.few_shot] Erro gerando embedding: {e}")
        return None


def context_to_text(messages: list[dict]) -> str:
    """Converte lista de mensagens [{role, content}, ...] em texto plano."""
    if not messages:
        return ""
    lines = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "") or ""
        prefix = "Lead" if role == "user" else "IA"
        lines.append(f"{prefix}: {content}")
    return "\n".join(lines)


async def get_relevant_examples(
    tenant_id: int,
    current_context: list[dict],
    db: AsyncSession,
    max_examples: int = MAX_FEWSHOT_EXAMPLES,
    similarity_threshold: float = SIMILARITY_THRESHOLD,
) -> list[dict]:
    """
    Busca as N correções do cliente (rating='edit') com contexto mais similar
    ao atual. Usa cosine distance via pgvector.

    Retorna lista ordenada por similaridade (mais similar primeiro):
        [{context_snippet, corrected_response, similarity}, ...]

    Se não houver embeddings salvos ou falhar a geração do embedding do
    contexto atual, retorna lista vazia (agente segue sem few-shot).
    """
    context_text = context_to_text(current_context)
    if not context_text:
        return []

    embedding = await generate_context_embedding(context_text)
    if not embedding:
        return []

    # cosine_distance: 0 = idêntico, 1 = ortogonal, 2 = oposto.
    # similarity = 1 - cosine_distance (intervalo [-1, 1], prático [0, 1]).
    distance = AIFeedback.context_embedding.cosine_distance(embedding).label("distance")

    stmt = (
        select(
            AIFeedback.context_snippet,
            AIFeedback.corrected_response,
            distance,
        )
        .where(AIFeedback.tenant_id == tenant_id)
        .where(AIFeedback.rating == "edit")
        .where(AIFeedback.context_embedding.is_not(None))
        .where(AIFeedback.corrected_response.is_not(None))
        .order_by(distance)
        .limit(max_examples * 2)  # margem pra filtrar por threshold
    )

    try:
        result = await db.execute(stmt)
        rows = result.all()
    except Exception as e:
        logger.error(f"[ai_lab.few_shot] Erro na busca pgvector: {e}")
        return []

    examples = []
    for row in rows:
        similarity = 1.0 - float(row.distance)
        if similarity >= similarity_threshold:
            examples.append({
                "context_snippet": row.context_snippet,
                "corrected_response": row.corrected_response,
                "similarity": similarity,
            })
        if len(examples) >= max_examples:
            break
    return examples


def _format_snippet(snippet: Any) -> str:
    """Formata o context_snippet (esperado: lista de {role, content})."""
    if not snippet:
        return ""
    if isinstance(snippet, list):
        lines = []
        for m in snippet[-5:]:  # só últimas 5 msgs
            role = m.get("role", "user")
            content = (m.get("content", "") or "")[:MAX_TOKENS_PER_EXAMPLE]
            prefix = "Lead" if role == "user" else "IA"
            lines.append(f"  {prefix}: {content}")
        return "\n".join(lines)
    return str(snippet)[:MAX_TOKENS_PER_EXAMPLE]


def format_examples_for_prompt(examples: list[dict]) -> str:
    """
    Formata os exemplos num bloco pronto pra concatenar no system_prompt.
    Retorna string vazia se não houver exemplos.
    """
    if not examples:
        return ""

    blocks = []
    for i, ex in enumerate(examples, start=1):
        context_fmt = _format_snippet(ex.get("context_snippet"))
        corrected = (ex.get("corrected_response") or "")[:MAX_TOKENS_PER_EXAMPLE]
        blocks.append(
            f"Exemplo {i}:\n"
            f"Contexto:\n{context_fmt}\n"
            f"Resposta correta: {corrected}"
        )

    body = "\n\n".join(blocks)
    return (
        "\n\nQuando aparecer situação parecida com estas, responda no estilo abaixo:\n\n"
        f"{body}"
    )
