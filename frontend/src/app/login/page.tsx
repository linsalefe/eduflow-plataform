'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Eye, EyeOff, Loader2, Mail, Lock, AlertCircle, MessageCircle, Users, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const { user, loading: authLoading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (!authLoading && user) router.push('/dashboard'); }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a1628]">
        <div className="h-8 w-8 rounded-full border-2 border-[#3b82f6] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen flex bg-[#0a1628] relative overflow-hidden">

      {/* Global radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(29,78,216,0.12)_0%,_transparent_70%)]" />

      {/* ── Lado esquerdo — Branding ── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 relative">
        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1D4ED8]/15 via-transparent to-[#3b82f6]/5" />
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-[#1D4ED8]/10 rounded-full blur-3xl blob-drift" />
        <div className="absolute bottom-1/4 right-10 w-72 h-72 bg-[#3b82f6]/8 rounded-full blur-3xl blob-drift-reverse" />

        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        <div className={`relative z-10 max-w-lg transition-all duration-1000 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <img src="/logo-icon-white.png" alt="EduFlow" className="w-12 h-12 object-contain" />
            <div>
              <span className="text-2xl font-bold text-white tracking-tight">EduFlow</span>
              <span className="text-2xl font-light text-[#93c5fd] ml-1.5">Hub</span>
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-bold text-white leading-tight mb-3">
            Captação de Clientes
            <br />
            <span className="text-[#60a5fa]">Inteligente</span>
          </h1>
          <p className="text-base text-gray-400 leading-relaxed max-w-md">
            Gerencie leads, qualifique com IA e converta mais clientes com
            atendimento automatizado via WhatsApp.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-3 mt-10">
            {[
              { icon: MessageCircle, label: 'WhatsApp IA' },
              { icon: Users, label: 'Qualificação automática' },
              { icon: BarChart3, label: 'Funil de vendas' },
            ].map((feat, i) => (
              <div
                key={feat.label}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] backdrop-blur-sm transition-all duration-700 ease-out ${
                  mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: `${800 + i * 150}ms` }}
              >
                <feat.icon className="w-4 h-4 text-[#60a5fa]" />
                <span className="text-sm text-gray-300 font-medium">{feat.label}</span>
              </div>
            ))}
          </div>

          {/* Trust signal */}
          <div className={`mt-12 flex items-center gap-2 transition-all duration-700 ease-out ${mounted ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '1200ms' }}>
            <div className="flex -space-x-2">
              {['bg-blue-500', 'bg-emerald-500', 'bg-purple-500'].map((color, i) => (
                <div key={i} className={`w-7 h-7 rounded-full ${color} border-2 border-[#0a1628] flex items-center justify-center text-white text-[9px] font-bold`}>
                  {['C', 'M', 'U'][i]}
                </div>
              ))}
            </div>
            <p className="text-[13px] text-gray-500">
              Usado por <span className="text-gray-400 font-medium">empresas</span> em todo Brasil
            </p>
          </div>
        </div>
      </div>

      {/* ── Divisor vertical ── */}
      <div className="hidden lg:block w-px bg-gradient-to-b from-transparent via-white/[0.08] to-transparent" />

      {/* ── Lado direito — Form ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 relative">
        {/* Glow behind card */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/8 rounded-full blur-3xl pointer-events-none" />

        <div
          className={`w-full max-w-[420px] relative z-10 transition-all duration-700 ease-out delay-300 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          {/* Logo mobile */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <img src="/logo-icon-white.png" alt="EduFlow" className="w-10 h-10 object-contain" />
            <span className="text-2xl font-bold text-white">EduFlow</span>
          </div>

          {/* Glassmorphism card com animated gradient border */}
          <div className="login-card-glow backdrop-blur-xl p-8 shadow-2xl shadow-black/30">
            {/* Header */}
            <div className="mb-7">
              <h2 className="text-[22px] font-bold text-[#0f172a]">Bem-vindo de volta</h2>
              <p className="text-gray-400 text-sm mt-1">Entre com suas credenciais para acessar</p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-5 flex items-center gap-2.5 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-600">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[13px] font-medium text-gray-500">
                  Email
                </Label>
                <div className="relative input-glow rounded-xl transition-all">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    className="pl-10 h-12 bg-gray-50 border-gray-200 rounded-xl text-sm focus:border-primary focus:ring-[#1D4ED8]/10"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[13px] font-medium text-gray-500">
                  Senha
                </Label>
                <div className="relative input-glow rounded-xl transition-all">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="pl-10 pr-12 h-12 bg-gray-50 border-gray-200 rounded-xl text-sm focus:border-primary focus:ring-[#1D4ED8]/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl shadow-lg shadow-[#1D4ED8]/25 hover:shadow-xl hover:shadow-[#1D4ED8]/30 active:scale-[0.98] transition-all duration-200 mt-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>
          </div>

          {/* Footer */}
          <p className="text-center text-[11px] text-gray-600 mt-6">
            EduFlow © {new Date().getFullYear()} — Todos os direitos reservados
          </p>
        </div>
      </div>
    </div>
  );
}