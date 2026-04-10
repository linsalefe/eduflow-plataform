'use client';

import { CheckCircle, ArrowRight, Mail } from 'lucide-react';

export default function CheckoutSuccessPage() {
  return (
    <div className="min-h-screen bg-[#0a1628] relative overflow-hidden flex items-center justify-center">
      {/* Background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(29,78,216,0.12)_0%,_transparent_70%)]" />
      <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-[#1D4ED8]/8 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-[#3b82f6]/6 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '12s' }} />

      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 text-center px-6 max-w-lg mx-auto">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <img src="/logo-icon-white.png" alt="EduFlow" className="h-8 w-8" />
          <span className="text-white text-xl font-bold">EduFlow <span className="font-light text-[#93c5fd]">Hub</span></span>
        </div>

        {/* Success card */}
        <div className="backdrop-blur-xl bg-white/[0.05] border border-white/[0.08] rounded-2xl p-10">
          {/* Animated check icon */}
          <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-6 ring-4 ring-emerald-500/10">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>

          <h1 className="text-3xl font-bold text-white mb-3">
            Pagamento confirmado!
          </h1>

          <p className="text-gray-400 text-lg mb-8 leading-relaxed">
            Sua assinatura esta ativa. Enviamos seus dados de acesso para o email cadastrado.
          </p>

          {/* Email notice */}
          <div className="bg-[#1D4ED8]/10 border border-[#1D4ED8]/20 rounded-xl px-5 py-4 mb-8 flex items-start gap-3">
            <Mail className="w-5 h-5 text-[#60a5fa] mt-0.5 flex-shrink-0" />
            <p className="text-gray-300 text-sm text-left">
              Verifique sua caixa de entrada (e spam) para encontrar o email com seu <strong className="text-white">login e senha</strong> de acesso ao portal.
            </p>
          </div>

          <a
            href="/login"
            className="inline-flex items-center justify-center gap-2 bg-[#1D4ED8] hover:bg-[#1e40af] text-white font-semibold py-3.5 px-8 rounded-xl transition-all duration-200 shadow-lg shadow-[#1D4ED8]/25 w-full"
          >
            Acessar o Portal
            <ArrowRight className="w-4 h-4" />
          </a>

          <p className="text-gray-500 text-xs mt-6">
            Precisa de ajuda? Entre em contato com nosso suporte.
          </p>
        </div>
      </div>
    </div>
  );
}
