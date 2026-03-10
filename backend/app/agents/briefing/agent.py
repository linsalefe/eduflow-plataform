from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Contact, Tenant, Activity
from app.agents.orchestrator.orchestrator import get_context


class BriefingAgent:

    async def handle(self, lead_id: int, tenant_id: int, db: AsyncSession):
        print(f"📋 BriefingAgent acionado para lead {lead_id}")

        # Buscar lead
        lead_result = await db.execute(select(Contact).where(Contact.id == lead_id))
        lead = lead_result.scalar_one_or_none()
        if not lead:
            print(f"❌ Lead {lead_id} não encontrado")
            return

        # Buscar contexto
        ctx = await get_context(lead_id, tenant_id, db)
        if not ctx:
            print(f"❌ Contexto não encontrado para lead {lead_id}")
            return

        # Gerar briefing via GPT-4
        briefing = await self._generate_briefing(lead, ctx)

        # Salvar como nota no contato
        if lead.notes:
            lead.notes = f"{lead.notes}\n\n---\n{briefing}"
        else:
            lead.notes = briefing

        # Criar atividade no feed do lead
        activity = Activity(
            tenant_id=tenant_id,
            contact_wa_id=lead.wa_id,
            type="briefing",
            description=briefing,
        )
        db.add(activity)
        await db.commit()

        print(f"✅ Briefing salvo para lead {lead_id}")

    async def _generate_briefing(self, lead, ctx) -> str:
        try:
            import openai
            import os

            client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

            prompt = f"""Gere um briefing conciso (máximo 8 linhas) para uma consultora
que vai falar com um lead em 15 minutos.

Lead: {lead.name}
Formação: {ctx.wa_formacao or 'não informada'}
Onde trabalha: {ctx.wa_atuacao or 'não informado'}
Motivação declarada: {ctx.wa_motivacao or 'não informada'}
Objeções levantadas: {ctx.call_objections or 'nenhuma'}
Score de qualificação: {ctx.call_score or 'não avaliado'}
Resumo da ligação: {ctx.call_summary or 'não disponível'}

Formato: bullet points diretos, tom profissional.
Comece com o nome do lead e termine com uma dica de abordagem.
Responda apenas o briefing, sem introdução."""

            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=300,
            )
            return response.choices[0].message.content

        except Exception as e:
            print(f"⚠️ Erro ao gerar briefing via GPT: {e}")
            # Fallback sem GPT
            name = lead.name or "Lead"
            return (
                f"📋 Briefing — {name}\n"
                f"• Formação: {ctx.wa_formacao or 'não informada'}\n"
                f"• Trabalha em: {ctx.wa_atuacao or 'não informado'}\n"
                f"• Motivação: {ctx.wa_motivacao or 'não informada'}\n"
                f"• Resumo da ligação: {ctx.call_summary or 'não disponível'}"
            )