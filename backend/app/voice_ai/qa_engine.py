"""
QA Automático - Avalia qualidade das chamadas automaticamente.
Roda como task assíncrona após cada chamada completada.
"""
import json
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.voice_ai.models import AICall, AICallTurn, AICallQA
from app.voice_ai.config import OPENAI_API_KEY

client = AsyncOpenAI(api_key=OPENAI_API_KEY)


async def evaluate_call(call_id: int, db: AsyncSession):
    """
    Avalia automaticamente a qualidade de uma chamada completada.
    Gera scores de: aderência ao roteiro, clareza, completude, qualidade do outcome.
    """
    # Buscar chamada
    result = await db.execute(select(AICall).where(AICall.id == call_id))
    call = result.scalar_one_or_none()
    if not call:
        return

    # Buscar turnos
    turns_result = await db.execute(
        select(AICallTurn).where(AICallTurn.call_id == call_id).order_by(AICallTurn.created_at)
    )
    turns = turns_result.scalars().all()

    if not turns:
        return

    # Montar transcrição
    transcript = "\n".join([
        f"{'Lead' if t.role == 'user' else 'IA'} [{t.fsm_state}]: {t.text}"
        for t in turns
    ])

    # Calcular métricas objetivas
    fields_required = ["confirmed_interest", "objetivo", "prazo", "disponibilidade", "forma_pagamento"]
    fields_collected = call.collected_fields or {}
    fields_completion = len([f for f in fields_required if f in fields_collected]) / len(fields_required)

    avg_latency = call.avg_latency_ms or 0

    # Chamar LLM para avaliação subjetiva
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": """Você é um avaliador de qualidade de ligações de vendas.
Analise a transcrição e retorne APENAS JSON (sem markdown):
{
  "script_adherence": 0.0 a 1.0 (IA seguiu o roteiro de qualificação?),
  "clarity_score": 0.0 a 1.0 (falas claras, naturais, sem erros?),
  "outcome_quality": 0.0 a 1.0 (resultado adequado dado o contexto?),
  "notes": "2-3 frases sobre pontos fortes e fracos"
}"""
                },
                {
                    "role": "user",
                    "content": f"""TRANSCRIÇÃO:
{transcript}

DADOS DA CHAMADA:
- Outcome: {call.outcome}
- Score: {call.score}/100
- Campos coletados: {json.dumps(fields_collected, ensure_ascii=False)}
- Objeções: {call.objections}
- Duração: {call.duration_seconds}s
- Turnos: {len(turns)}"""
                },
            ],
            temperature=0.2,
            max_tokens=300,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        eval_data = json.loads(content)

        # Calcular score geral
        overall = (
            eval_data.get("script_adherence", 0.5) * 0.3
            + eval_data.get("clarity_score", 0.5) * 0.2
            + fields_completion * 0.3
            + eval_data.get("outcome_quality", 0.5) * 0.2
        )

        # Salvar QA
        qa = AICallQA(
            call_id=call_id,
            script_adherence=eval_data.get("script_adherence", 0.5),
            clarity_score=eval_data.get("clarity_score", 0.5),
            avg_latency_ms=avg_latency,
            fields_completion=fields_completion,
            outcome_quality=eval_data.get("outcome_quality", 0.5),
            overall_score=overall,
            notes=eval_data.get("notes", ""),
        )
        db.add(qa)
        await db.commit()

        print(f"📊 QA avaliado para call_id={call_id}: overall={overall:.2f}")

    except Exception as e:
        print(f"❌ Erro no QA automático: {e}")
