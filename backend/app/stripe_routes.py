"""
Rotas Stripe: Checkout Session + Webhook para auto-provisionamento de tenants.
"""
import os
import stripe
import secrets
import string
import re
import json
import logging
from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from app.database import get_db
from app.models import Tenant, User
from app.auth import hash_password, get_current_user, get_tenant_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stripe", tags=["Stripe"])

# === Config (via env vars) ===
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "")

stripe.api_key = STRIPE_SECRET_KEY

# Mapeamento price_id -> plano
PRICE_TO_PLAN = {
    "price_1TKUf7IQX3lFbR8HWCe1Uz3y": {"plan": "starter", "name": "EduFlow Starter", "max_users": 3, "max_channels": 1},
    "price_1TKUg6IQX3lFbR8HcMozNhQ0": {"plan": "pro", "name": "EduFlow Pro", "max_users": 5, "max_channels": 3},
    "price_1TKUhWIQX3lFbR8Hv9E40G7F": {"plan": "enterprise", "name": "EduFlow Enterprise", "max_users": 15, "max_channels": 5},
    "price_1TKXGpIQX3lFbR8Hp4MA3qHr": {"plan": "starter", "name": "EduFlow Starter", "max_users": 3, "max_channels": 1},
    "price_1TKXHZIQX3lFbR8HZ7GDP2a3": {"plan": "starter", "name": "EduFlow Starter", "max_users": 3, "max_channels": 1},
    "price_1TKXJMIQX3lFbR8HymrHnrua": {"plan": "pro", "name": "EduFlow Pro", "max_users": 5, "max_channels": 3},
    "price_1TKXJoIQX3lFbR8HxFfEewKk": {"plan": "pro", "name": "EduFlow Pro", "max_users": 5, "max_channels": 3},
    "price_1TKXKKIQX3lFbR8HZo3ErHbg": {"plan": "enterprise", "name": "EduFlow Enterprise", "max_users": 15, "max_channels": 5},
    "price_1TKXKqIQX3lFbR8H0k7mp8ER": {"plan": "enterprise", "name": "EduFlow Enterprise", "max_users": 15, "max_channels": 5},
}

# Features por plano
PLAN_FEATURES = {
    "starter": {
        "dashboard": True, "conversas": True, "pipeline": True, "financeiro": True,
        "landing_pages": True, "campanhas": True, "relatorios": True, "usuarios": True,
        "automacoes": True, "tarefas": True, "agenda": True,
        "voice_ai": False, "ai_whatsapp": False, "voice_inbound": False, "ai_audio_response": False,
    },
    "pro": {
        "dashboard": True, "conversas": True, "pipeline": True, "financeiro": True,
        "landing_pages": True, "campanhas": True, "relatorios": True, "usuarios": True,
        "automacoes": True, "tarefas": True, "agenda": True,
        "voice_ai": False, "ai_whatsapp": True, "voice_inbound": False, "ai_audio_response": False,
    },
    "enterprise": {
        "dashboard": True, "conversas": True, "pipeline": True, "financeiro": True,
        "landing_pages": True, "campanhas": True, "relatorios": True, "usuarios": True,
        "automacoes": True, "tarefas": True, "agenda": True,
        "voice_ai": True, "ai_whatsapp": True, "voice_inbound": True, "ai_audio_response": True,
    },
}

AGENT_PLAN_FLAGS = {
    "starter": {"whatsapp": False, "voice": False, "followup": False, "reactivation": False, "briefing": False},
    "pro": {"whatsapp": True, "voice": False, "followup": True, "reactivation": True, "briefing": True},
    "enterprise": {"whatsapp": True, "voice": True, "followup": True, "reactivation": True, "briefing": True},
}


def generate_password(length=10):
    """Gera senha aleatória segura."""
    chars = string.ascii_letters + string.digits
    return ''.join(secrets.choice(chars) for _ in range(length))


def generate_slug(company_name: str) -> str:
    """Gera slug a partir do nome da empresa."""
    slug = company_name.lower().strip()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s]+', '-', slug)
    slug = re.sub(r'-+', '-', slug).strip('-')
    return slug or "empresa"


async def send_welcome_email(to_email: str, name: str, password: str, plan_name: str):
    """
    Envia email com credenciais de acesso.
    Usa smtplib com Gmail App Password.
    """
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    import os

    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")

    if not smtp_user or not smtp_pass:
        logger.warning(f"SMTP nao configurado. Credenciais: {to_email} / {password}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Bem-vindo ao EduFlow Hub - Seus dados de acesso"
    msg["From"] = f"EduFlow Hub <{smtp_user}>"
    msg["To"] = to_email

    html = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a1628; padding: 40px 30px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #ffffff; font-size: 28px; margin: 0;">EduFlow <span style="color: #93c5fd; font-weight: 300;">Hub</span></h1>
        </div>
        <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 30px;">
            <h2 style="color: #60a5fa; margin-top: 0;">Bem-vindo, {name}!</h2>
            <p style="color: #94a3b8; line-height: 1.6;">Sua conta <strong style="color: #ffffff;">{plan_name}</strong> esta ativa. Aqui estao seus dados de acesso:</p>
            <div style="background: rgba(29,78,216,0.15); border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="color: #94a3b8; margin: 5px 0;">Email: <strong style="color: #ffffff;">{to_email}</strong></p>
                <p style="color: #94a3b8; margin: 5px 0;">Senha: <strong style="color: #ffffff;">{password}</strong></p>
            </div>
            <a href="https://portal.eduflowia.com/login" style="display: inline-block; background: #1D4ED8; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 10px;">Acessar o Portal</a>
            <p style="color: #64748b; font-size: 13px; margin-top: 20px;">Recomendamos trocar sua senha apos o primeiro acesso.</p>
        </div>
        <p style="color: #475569; font-size: 12px; text-align: center; margin-top: 25px;">EduFlow Hub - Todos os direitos reservados</p>
    </div>
    """

    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, to_email, msg.as_string())
        logger.info(f"Email enviado para {to_email}")
    except Exception as e:
        logger.error(f"Erro ao enviar email: {e}")
        logger.warning(f"Credenciais: {to_email} / {password}")


# === Rotas ===

@router.post("/create-checkout-session")
async def create_checkout_session(request: Request):
    """Cria sessao de checkout do Stripe. Rota publica (sem auth)."""
    data = await request.json()
    price_id = data.get("price_id")
    customer_email = data.get("email")
    customer_name = data.get("name")
    company_name = data.get("company_name")
    customer_phone = data.get("phone", "")

    if not price_id or price_id not in PRICE_TO_PLAN:
        raise HTTPException(status_code=400, detail="Plano invalido")

    if not customer_email or not customer_name or not company_name:
        raise HTTPException(status_code=400, detail="Preencha todos os campos obrigatorios")

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            customer_email=customer_email,
            success_url="https://portal.eduflowia.com/checkout/success?session_id={CHECKOUT_SESSION_ID}",
            cancel_url="https://portal.eduflowia.com/pricing",
            metadata={
                "customer_name": customer_name,
                "company_name": company_name,
                "customer_email": customer_email,
                "customer_phone": customer_phone,
            },
        )
        return {"checkout_url": session.url}
    except Exception as e:
        logger.error(f"Erro Stripe checkout: {e}")
        raise HTTPException(status_code=500, detail="Erro ao criar sessao de pagamento")


@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Recebe webhooks do Stripe e provisiona tenant automaticamente."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        if STRIPE_WEBHOOK_SECRET:
            event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        else:
            event = json.loads(payload)
    except Exception as e:
        logger.error(f"Webhook invalido: {e}")
        raise HTTPException(status_code=400, detail="Webhook invalido")

    # === CHECKOUT COMPLETADO — CRIAR TENANT ===
    if event["type"] == "checkout.session.completed":
        session_data = event["data"]["object"]

        customer_email = session_data.get("customer_email") or session_data.get("metadata", {}).get("customer_email")
        customer_name = session_data.get("metadata", {}).get("customer_name", "Admin")
        company_name = session_data.get("metadata", {}).get("company_name", "Empresa")
        customer_phone = session_data.get("metadata", {}).get("customer_phone", "")
        stripe_customer_id = session_data.get("customer")
        stripe_subscription_id = session_data.get("subscription")

        # Identificar plano pelo price_id da subscription
        plan_info = None
        if stripe_subscription_id:
            try:
                sub = stripe.Subscription.retrieve(stripe_subscription_id)
                price_id = sub["items"]["data"][0]["price"]["id"]
                plan_info = PRICE_TO_PLAN.get(price_id)
            except Exception as e:
                logger.error(f"Erro ao buscar subscription: {e}")

        if not plan_info:
            plan_info = PRICE_TO_PLAN.get("price_1TKUf7IQX3lFbR8HWCe1Uz3y")  # fallback: starter

        plan = plan_info["plan"]

        # Verificar se email ja existe
        existing_user = await db.execute(select(User).where(User.email == customer_email))
        if existing_user.scalar_one_or_none():
            logger.warning(f"Email ja existe: {customer_email}. Webhook ignorado.")
            return {"status": "email_already_exists"}

        # Gerar slug unico
        base_slug = generate_slug(company_name)
        slug = base_slug
        counter = 1
        while True:
            existing = await db.execute(select(Tenant).where(Tenant.slug == slug))
            if not existing.scalar_one_or_none():
                break
            slug = f"{base_slug}-{counter}"
            counter += 1

        # Gerar senha
        raw_password = generate_password()

        # Criar tenant
        tenant = Tenant(
            name=company_name,
            slug=slug,
            owner_name=customer_name,
            owner_email=customer_email,
            owner_phone=customer_phone,
            plan=plan,
            max_users=plan_info["max_users"],
            max_channels=plan_info["max_channels"],
            stripe_customer_id=stripe_customer_id,
            stripe_subscription_id=stripe_subscription_id,
            subscription_status="active",
            features=PLAN_FEATURES.get(plan, PLAN_FEATURES["starter"]),
            agent_plan_flags=AGENT_PLAN_FLAGS.get(plan, AGENT_PLAN_FLAGS["starter"]),
        )
        db.add(tenant)
        await db.flush()

        # Criar usuario admin do tenant
        user = User(
            tenant_id=tenant.id,
            name=customer_name,
            email=customer_email,
            password_hash=hash_password(raw_password),
            role="admin",
            is_active=True,
        )
        db.add(user)
        await db.commit()

        # Enviar email com credenciais
        await send_welcome_email(customer_email, customer_name, raw_password, plan_info["name"])

        logger.info(f"Tenant criado via Stripe: {company_name} ({slug}) | Plano: {plan} | Email: {customer_email}")

    # === SUBSCRIPTION ATUALIZADA ===
    elif event["type"] == "customer.subscription.updated":
        sub = event["data"]["object"]
        stripe_sub_id = sub["id"]
        status = sub["status"]  # active, past_due, canceled, unpaid, etc.

        result = await db.execute(select(Tenant).where(Tenant.stripe_subscription_id == stripe_sub_id))
        tenant = result.scalar_one_or_none()
        if tenant:
            tenant.subscription_status = status
            if status in ("past_due", "unpaid"):
                logger.warning(f"Pagamento pendente: {tenant.name} ({stripe_sub_id})")
            await db.commit()
            logger.info(f"Subscription {stripe_sub_id} -> {status}")

    # === SUBSCRIPTION CANCELADA ===
    elif event["type"] == "customer.subscription.deleted":
        sub = event["data"]["object"]
        stripe_sub_id = sub["id"]

        result = await db.execute(select(Tenant).where(Tenant.stripe_subscription_id == stripe_sub_id))
        tenant = result.scalar_one_or_none()
        if tenant:
            tenant.subscription_status = "canceled"
            tenant.is_active = False
            await db.commit()
            logger.info(f"Tenant desativado (cancelamento): {tenant.name}")

    # === PAGAMENTO FALHOU ===
    elif event["type"] == "invoice.payment_failed":
        invoice = event["data"]["object"]
        stripe_sub_id = invoice.get("subscription")
        if stripe_sub_id:
            result = await db.execute(select(Tenant).where(Tenant.stripe_subscription_id == stripe_sub_id))
            tenant = result.scalar_one_or_none()
            if tenant:
                tenant.subscription_status = "past_due"
                await db.commit()
                logger.warning(f"Pagamento falhou: {tenant.name}")

    return {"status": "ok"}


@router.get("/config")
async def get_stripe_config():
    """Retorna a publishable key para o frontend."""
    return {
        "publishable_key": STRIPE_PUBLISHABLE_KEY,
        "plans": [
            {
                "name": "Starter",
                "price": 297,
                "price_id": "price_1TKUf7IQX3lFbR8HWCe1Uz3y",
                "features": ["CRM Completo", "Pipeline de Vendas", "Automacoes", "Disparos em Massa", "Landing Pages", "Agenda"],
            },
            {
                "name": "Pro",
                "price": 597,
                "price_id": "price_1TKUg6IQX3lFbR8HcMozNhQ0",
                "features": ["Tudo do Starter", "Agente IA no WhatsApp", "Qualificacao Automatica", "Follow-up Inteligente", "Briefing por IA", "Reativacao de Leads"],
                "popular": True,
            },
            {
                "name": "Enterprise",
                "price": 2500,
                "price_id": "price_1TKUhWIQX3lFbR8Hv9E40G7F",
                "features": ["Tudo do Pro", "Agente IA por Voz", "Ligacoes Automaticas", "Voice Inbound IA", "Suporte Prioritario", "Canais Ilimitados"],
            },
        ],
    }


@router.get("/subscription-status")
async def subscription_status(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user), tenant_id: int = Depends(get_tenant_id)):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    if tenant.stripe_subscription_id:
        try:
            sub = stripe.Subscription.retrieve(tenant.stripe_subscription_id)
            current_period_end = datetime.fromtimestamp(sub["current_period_end"]).isoformat() if sub.get("current_period_end") else None
            return {
                "plan": tenant.plan,
                "subscription_status": sub.get("status", tenant.subscription_status),
                "current_period_end": current_period_end,
                "cancel_at_period_end": sub.get("cancel_at_period_end", False),
            }
        except Exception as e:
            logger.error(f"Erro ao consultar subscription Stripe: {e}")

    return {
        "plan": tenant.plan,
        "subscription_status": tenant.subscription_status or "manual",
        "current_period_end": None,
        "cancel_at_period_end": False,
    }


@router.post("/cancel-subscription")
async def cancel_subscription(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user), tenant_id: int = Depends(get_tenant_id)):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")
    if not tenant.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="Plano gerenciado manualmente")

    try:
        stripe.Subscription.modify(tenant.stripe_subscription_id, cancel_at_period_end=True)
    except Exception as e:
        logger.error(f"Erro ao cancelar subscription Stripe: {e}")
        raise HTTPException(status_code=500, detail="Erro ao cancelar assinatura")

    tenant.subscription_status = "canceling"
    await db.commit()
    return {"status": "ok", "message": "Assinatura será cancelada no fim do período"}
