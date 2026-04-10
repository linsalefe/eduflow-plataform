'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, X, Loader2, Sparkles, ArrowRight, Phone, Zap, Bot, Clock, TrendingUp, Feather, Shield, Building2, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

/* ── Planos ── */
const plans = [
  {
    name: 'Starter',
    price: 297,
    price_id: 'price_1TKUf7IQX3lFbR8HWCe1Uz3y',
    description: 'Para empresas que querem organizar e escalar a operação comercial',
    features: [
      { text: 'CRM Completo', included: true },
      { text: 'Pipeline de Vendas (Kanban)', included: true },
      { text: 'Automações de WhatsApp', included: true },
      { text: 'Disparos em Massa', included: true },
      { text: 'Landing Pages', included: true },
      { text: 'Agenda Integrada', included: true },
      { text: 'Relatórios e Dashboard', included: true },
      { text: 'Agente IA no WhatsApp', included: false },
      { text: 'Agente IA por Voz', included: false },
    ],
    icon: Zap,
    popular: false,
  },
  {
    name: 'Pro',
    price: 597,
    price_id: 'price_1TKUg6IQX3lFbR8HcMozNhQ0',
    description: 'Para quem quer IA vendendo e qualificando leads 24h',
    features: [
      { text: 'Tudo do Starter', included: true },
      { text: 'Agente IA SDR no WhatsApp', included: true },
      { text: 'Atendimento Automático por IA', included: true },
      { text: 'Qualificação Automática de Leads', included: true },
      { text: 'Follow-up Inteligente', included: true },
      { text: 'Briefing por IA', included: true },
      { text: 'Reativação de Leads', included: true },
      { text: 'Agente IA por Voz', included: false },
    ],
    icon: Bot,
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 2500,
    price_id: 'price_1TKUhWIQX3lFbR8Hv9E40G7F',
    description: 'Atendimento completo com IA por voz e WhatsApp. Escala total.',
    features: [
      { text: 'Tudo do Pro', included: true },
      { text: 'Agente IA por Voz (Ligações)', included: true },
      { text: 'Ligações Automáticas Outbound', included: true },
      { text: 'Voice Inbound IA (Receptivo)', included: true },
      { text: 'Suporte Prioritário', included: true },
      { text: 'Canais Ilimitados', included: true },
      { text: 'Onboarding Dedicado', included: true },
      { text: 'SLA Garantido', included: true },
    ],
    icon: Phone,
    popular: false,
  },
];

/* ── Chat messages ── */
const chatMessages = [
  { from: 'lead', text: 'Oi, vi o anúncio de vocês' },
  { from: 'nat', text: 'Olá! 😊 Sou a Nat, assistente virtual. Como posso te ajudar?' },
  { from: 'lead', text: 'Quero saber mais sobre os planos' },
  { from: 'nat', text: 'Claro! Qual seu principal desafio hoje? Tempo de resposta ou organização de leads?' },
  { from: 'lead', text: 'Demoro muito pra responder os leads' },
  { from: 'nat', text: 'Entendi! Com o EduFlow Pro, sua IA responde em 30 segundos, 24h por dia. Quer agendar uma demonstração?' },
];

/* ── Chat mockup component ── */
function ChatMockup() {
  const [visibleMessages, setVisibleMessages] = useState<number>(0);
  const [typing, setTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visibleMessages >= chatMessages.length) return;

    const nextMsg = chatMessages[visibleMessages];
    const delay = visibleMessages === 0 ? 1200 : 1800;

    const typingTimer = setTimeout(() => {
      if (nextMsg.from === 'nat') setTyping(true);
      const showTimer = setTimeout(() => {
        setTyping(false);
        setVisibleMessages((v) => v + 1);
      }, nextMsg.from === 'nat' ? 1400 : 600);
      return () => clearTimeout(showTimer);
    }, delay);

    return () => clearTimeout(typingTimer);
  }, [visibleMessages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleMessages, typing]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.4 }}
      className="w-full max-w-sm mx-auto lg:mx-0"
    >
      <div className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl shadow-black/20">
        {/* Chat header */}
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1D4ED8] to-[#3b82f6] flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold">Nat — IA EduFlow</p>
            <p className="text-emerald-400 text-[11px]">Online agora</p>
          </div>
          <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>

        {/* Chat body */}
        <div className="p-4 space-y-3 h-[320px] overflow-y-auto scrollbar-hide">
          <AnimatePresence>
            {chatMessages.slice(0, visibleMessages).map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3 }}
                className={`flex ${msg.from === 'lead' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
                    msg.from === 'lead'
                      ? 'bg-[#1D4ED8] text-white rounded-br-md'
                      : 'bg-white/[0.07] text-gray-200 border border-white/[0.06] rounded-bl-md'
                  }`}
                >
                  {msg.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>
            {typing && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex justify-start"
              >
                <div className="bg-white/[0.07] border border-white/[0.06] rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
                  <span className="w-2 h-2 bg-[#60a5fa] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-[#60a5fa] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-[#60a5fa] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={chatEndRef} />
        </div>
      </div>
    </motion.div>
  );
}

/* ── Page ── */
export default function PricingPage() {
  const [selectedPlan, setSelectedPlan] = useState<typeof plans[0] | null>(null);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', company_name: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;

    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price_id: selectedPlan.price_id,
          email: formData.email,
          name: formData.name,
          company_name: formData.company_name,
          phone: formData.phone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao processar pagamento');
      }

      window.location.href = data.checkout_url;
    } catch (err: any) {
      setError(err.message || 'Erro ao criar sessão de pagamento');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a1628] relative overflow-hidden">
      {/* ── Background layers ── */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(29,78,216,0.15)_0%,_transparent_60%)]" />
      <div className="absolute top-[-200px] left-[-100px] w-[700px] h-[700px] bg-[#1D4ED8]/[0.07] rounded-full blur-3xl" />
      <div className="absolute bottom-[-200px] right-[-100px] w-[600px] h-[600px] bg-[#3b82f6]/[0.05] rounded-full blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* ── Header fixo ── */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0a1628]/80 border-b border-white/[0.04]">
        <div className="flex items-center justify-between px-6 md:px-12 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <img src="/logo-icon-white.png" alt="EduFlow" className="h-8 w-8" />
            <span className="text-white text-xl font-bold">EduFlow <span className="font-light text-[#93c5fd]">Hub</span></span>
          </div>
          <a
            href="/login"
            className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-full px-4 py-2"
          >
            Já sou cliente <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </header>

      {/* ── Hero section ── */}
      <section className="relative z-10 px-6 pt-16 md:pt-24 pb-20 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Copy */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 bg-white/[0.06] border border-white/[0.1] rounded-full px-4 py-1.5 mb-6"
            >
              <Sparkles className="w-4 h-4 text-[#60a5fa]" />
              <span className="text-[#93c5fd] text-sm font-medium">Plataforma #1 de vendas com IA</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl md:text-5xl lg:text-[3.4rem] font-bold text-white leading-[1.1] mb-6"
            >
              Pare de perder clientes por demora.{' '}
              <span className="bg-gradient-to-r from-[#3b82f6] to-[#93c5fd] bg-clip-text text-transparent">
                Automatize sua operação comercial.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-gray-400 text-lg md:text-xl leading-relaxed mb-8 max-w-xl"
            >
              CRM com IA que responde, qualifica e agenda reuniões no piloto automático. Mais faturamento, mais liberdade de tempo.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap gap-4"
            >
              <a
                href="#planos"
                className="inline-flex items-center gap-2 bg-[#1D4ED8] hover:bg-[#1e40af] text-white font-semibold py-3.5 px-7 rounded-xl transition-all duration-200 shadow-lg shadow-[#1D4ED8]/25"
              >
                Ver planos <ArrowRight className="w-4 h-4" />
              </a>
              <div className="flex items-center gap-2 text-gray-400 text-sm py-3.5">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Cancele quando quiser</span>
              </div>
            </motion.div>
          </div>

          {/* Chat mockup */}
          <div className="hidden lg:block">
            <ChatMockup />
          </div>
        </div>
      </section>

      {/* ── Benefícios ── */}
      <section className="relative z-10 px-6 pb-24 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Clock,
              title: 'Resposta em 30s',
              desc: 'Enquanto você dorme, a IA está qualificando e agendando',
              gradient: 'from-[#1D4ED8]/20 to-[#3b82f6]/10',
            },
            {
              icon: TrendingUp,
              title: '2.5x mais conversão',
              desc: 'Empresas que respondem rápido convertem 2.5x mais',
              gradient: 'from-emerald-500/20 to-emerald-600/10',
            },
            {
              icon: Feather,
              title: 'Liberdade de tempo',
              desc: 'Pare de ficar preso no WhatsApp. A IA cuida da operação',
              gradient: 'from-purple-500/20 to-purple-600/10',
            },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-7 group hover:-translate-y-1 transition-all duration-300"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-5`}>
                  <Icon className="w-6 h-6 text-[#60a5fa]" />
                </div>
                <h4 className="text-white font-bold text-lg mb-2">{item.title}</h4>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── Planos ── */}
      <section id="planos" className="relative z-10 px-6 pb-24 max-w-7xl mx-auto scroll-mt-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Escolha o plano ideal para{' '}
            <span className="bg-gradient-to-r from-[#3b82f6] to-[#93c5fd] bg-clip-text text-transparent">
              sua operação
            </span>
          </h2>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Todos os planos incluem suporte, atualizações e setup assistido.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 items-start">
          {plans.map((plan, idx) => {
            const Icon = plan.icon;
            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: idx * 0.15 }}
                whileHover={{ y: -4 }}
                className={`relative rounded-2xl p-[1px] transition-shadow duration-300 ${
                  plan.popular
                    ? 'bg-gradient-to-b from-[#3b82f6] via-[#1D4ED8] to-[#3b82f6]/40 shadow-xl shadow-[#1D4ED8]/20 scale-[1.02] md:scale-[1.04]'
                    : 'bg-white/[0.08] hover:shadow-lg hover:shadow-[#1D4ED8]/10'
                }`}
              >
                {/* Popular badge */}
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                    <div className="bg-gradient-to-r from-[#1D4ED8] to-[#3b82f6] text-white text-xs font-bold px-5 py-1.5 rounded-full uppercase tracking-widest shadow-lg shadow-[#1D4ED8]/30">
                      Mais Popular
                    </div>
                  </div>
                )}

                {/* Pulsing glow for Pro */}
                {plan.popular && (
                  <div className="absolute -inset-1 bg-[#1D4ED8]/20 rounded-2xl blur-xl animate-pulse pointer-events-none" style={{ animationDuration: '3s' }} />
                )}

                <div className="relative bg-[#0d1d35] rounded-2xl p-8 h-full flex flex-col">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${plan.popular ? 'bg-[#1D4ED8]/30' : 'bg-white/[0.06]'}`}>
                      <Icon className={`w-5 h-5 ${plan.popular ? 'text-[#60a5fa]' : 'text-gray-400'}`} />
                    </div>
                    <h3 className="text-white text-xl font-bold">{plan.name}</h3>
                  </div>

                  <p className="text-gray-400 text-sm mb-6 leading-relaxed min-h-[40px]">{plan.description}</p>

                  <div className="mb-7">
                    <div className="flex items-baseline gap-1">
                      <span className="text-gray-500 text-lg">R$</span>
                      <span className="text-white text-5xl font-extrabold tracking-tight">{plan.price.toLocaleString('pt-BR')}</span>
                      <span className="text-gray-500 text-sm">/mês</span>
                    </div>
                  </div>

                  <div className="h-px bg-white/[0.06] mb-6" />

                  <ul className="space-y-3.5 mb-8 flex-1">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3">
                        {feature.included ? (
                          <div className="w-5 h-5 rounded-full bg-[#1D4ED8]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="w-3 h-3 text-[#60a5fa]" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-white/[0.04] flex items-center justify-center flex-shrink-0 mt-0.5">
                            <X className="w-3 h-3 text-gray-600" />
                          </div>
                        )}
                        <span className={feature.included ? 'text-gray-300 text-sm' : 'text-gray-600 text-sm line-through'}>
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => setSelectedPlan(plan)}
                    className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer ${
                      plan.popular
                        ? 'bg-[#1D4ED8] hover:bg-[#1e40af] text-white shadow-lg shadow-[#1D4ED8]/30 hover:shadow-xl hover:shadow-[#1D4ED8]/40'
                        : 'bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.08] hover:border-white/[0.15]'
                    }`}
                  >
                    Começar agora
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── Social proof ── */}
      <section className="relative z-10 px-6 pb-28 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Usado por empresas em todo Brasil
          </h3>
          <p className="text-gray-400">Automatize sua operação com quem entende de vendas e IA</p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {[
            { value: '500+', label: 'Leads qualificados/mês' },
            { value: '30s', label: 'Tempo médio de resposta' },
            { value: '24/7', label: 'Atendimento contínuo' },
            { value: '98%', label: 'Uptime garantido' },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 text-center"
            >
              <p className="text-3xl font-extrabold bg-gradient-to-r from-[#3b82f6] to-[#93c5fd] bg-clip-text text-transparent mb-1">{stat.value}</p>
              <p className="text-gray-500 text-xs">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-wrap items-center justify-center gap-6 mt-10"
        >
          {[
            { icon: Shield, text: 'Pagamento seguro via Stripe' },
            { icon: Building2, text: 'Multi-tenant isolado' },
            { icon: Users, text: 'Suporte humanizado' },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="flex items-center gap-2 text-gray-500 text-sm">
                <Icon className="w-4 h-4 text-gray-600" />
                <span>{item.text}</span>
              </div>
            );
          })}
        </motion.div>
      </section>

      {/* ── CTA final ── */}
      <section className="relative z-10 px-6 pb-24 max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="backdrop-blur-xl bg-gradient-to-br from-[#1D4ED8]/15 to-[#3b82f6]/5 border border-[#1D4ED8]/20 rounded-2xl p-10 md:p-14 text-center"
        >
          <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Pronto para escalar suas vendas?
          </h3>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            Comece agora e veja a IA trabalhando por você em menos de 24 horas.
          </p>
          <a
            href="#planos"
            className="inline-flex items-center gap-2 bg-[#1D4ED8] hover:bg-[#1e40af] text-white font-semibold py-3.5 px-8 rounded-xl transition-all duration-200 shadow-lg shadow-[#1D4ED8]/25"
          >
            Escolher meu plano <ArrowRight className="w-4 h-4" />
          </a>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo-icon-white.png" alt="EduFlow" className="h-5 w-5 opacity-50" />
            <span className="text-gray-500 text-sm">EduFlow Hub &copy; 2025 — Todos os direitos reservados</span>
          </div>
          <div className="flex gap-6">
            <a href="/login" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">Login</a>
            <a href="/privacy" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">Privacidade</a>
          </div>
        </div>
      </footer>

      {/* ── Modal checkout (AnimatePresence) ── */}
      <AnimatePresence>
        {selectedPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => { setSelectedPlan(null); setError(''); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="relative bg-[#0d1d35] border border-white/[0.1] rounded-2xl p-8 w-full max-w-md shadow-2xl shadow-black/30"
            >
              <button
                onClick={() => { setSelectedPlan(null); setError(''); }}
                className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-[#1D4ED8]/20 flex items-center justify-center">
                    {selectedPlan.popular ? <Bot className="w-4 h-4 text-[#60a5fa]" /> : <Zap className="w-4 h-4 text-[#60a5fa]" />}
                  </div>
                  <h3 className="text-white text-xl font-bold">Assinar {selectedPlan.name}</h3>
                </div>
                <p className="text-gray-400 text-sm">
                  R$ {selectedPlan.price.toLocaleString('pt-BR')}/mês — Preencha seus dados para continuar
                </p>
              </div>

              <form onSubmit={handleSubscribe} className="space-y-4">
                <div>
                  <label className="text-gray-300 text-sm font-medium block mb-1.5">Nome completo *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#3b82f6]/50 focus:ring-1 focus:ring-[#3b82f6]/25 transition-all"
                    placeholder="Seu nome completo"
                  />
                </div>

                <div>
                  <label className="text-gray-300 text-sm font-medium block mb-1.5">Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#3b82f6]/50 focus:ring-1 focus:ring-[#3b82f6]/25 transition-all"
                    placeholder="seu@email.com"
                  />
                </div>

                <div>
                  <label className="text-gray-300 text-sm font-medium block mb-1.5">Telefone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#3b82f6]/50 focus:ring-1 focus:ring-[#3b82f6]/25 transition-all"
                    placeholder="(11) 99999-9999"
                  />
                </div>

                <div>
                  <label className="text-gray-300 text-sm font-medium block mb-1.5">Nome da empresa *</label>
                  <input
                    type="text"
                    required
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#3b82f6]/50 focus:ring-1 focus:ring-[#3b82f6]/25 transition-all"
                    placeholder="Nome da sua empresa"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#1D4ED8] hover:bg-[#1e40af] disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-[#1D4ED8]/25"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Redirecionando...
                    </>
                  ) : (
                    <>
                      Ir para pagamento seguro
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <p className="text-gray-500 text-xs text-center pt-1">
                  Pagamento seguro processado pelo Stripe. Cancele quando quiser.
                </p>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
