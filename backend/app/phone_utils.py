"""Utilitários de telefone BR (nono dígito) compartilhados.

Centraliza a normalização e a busca de contato por telefone pra que TODOS os
pontos que criam/buscam contato usem a MESMA lógica (formulário, webhook do
WhatsApp, etc). A divergência entre esses pontos é a causa raiz da duplicação
de contatos: o JID do WhatsApp no Brasil frequentemente vem SEM o 9.
"""


def clean_phone_br(raw: str) -> str:
    """Remove formatação e garante prefixo BR (55)."""
    if not raw:
        return ""
    cleaned = raw.replace("+", "").replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
    if cleaned and not cleaned.startswith("55"):
        cleaned = "55" + cleaned
    return cleaned


def phone_variants_br(clean: str) -> list:
    """Variações do telefone BR: com e sem o 9º dígito.

    - 13 dígitos (55 + DDD + 9 + 8): também retorna versão sem o 9
    - 12 dígitos (55 + DDD + 8):     também retorna versão com o 9
    - outros tamanhos: retorna só o original
    """
    if not clean:
        return []
    variants = [clean]
    if len(clean) == 13 and clean.startswith("55"):
        ddd = clean[2:4]
        rest = clean[5:]  # pula o 9
        variants.append(f"55{ddd}{rest}")
    elif len(clean) == 12 and clean.startswith("55"):
        ddd = clean[2:4]
        rest = clean[4:]
        variants.append(f"55{ddd}9{rest}")
    return variants


async def find_contact_by_phone(db, tenant_id, phone):
    """Busca um Contact pelo telefone tratando o nono dígito BR.

    - SEMPRE filtra por tenant_id (isolamento multi-tenant).
    - Grupos / JIDs não-numéricos (com '@'): match exato, sem mexer no nono dígito.
    - Números BR: tenta todas as variantes (com e sem o 9).
    - Usa .scalars().first() (NUNCA scalar_one_or_none): pode haver duplicado
      legado no banco; .first() evita MultipleResultsFound e pega o mais antigo.

    Retorna o Contact ou None.
    """
    from sqlalchemy import select, or_
    from app.models import Contact

    if not phone:
        return None

    # Grupo ou JID não-numérico → match exato (não tratar nono dígito)
    if "@" in phone or not phone.lstrip("+").isdigit():
        result = await db.execute(
            select(Contact)
            .where(Contact.wa_id == phone, Contact.tenant_id == tenant_id)
            .order_by(Contact.id.asc())
        )
        return result.scalars().first()

    variants = phone_variants_br(clean_phone_br(phone))
    if not variants:
        return None

    result = await db.execute(
        select(Contact)
        .where(
            Contact.tenant_id == tenant_id,
            or_(*[Contact.wa_id == v for v in variants]),
        )
        .order_by(Contact.id.asc())
    )
    return result.scalars().first()
