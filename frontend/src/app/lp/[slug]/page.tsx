'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2, CheckCircle, GraduationCap, Clock, Award, Users, Send,
  BookOpen, Target, Star, ChevronDown, ChevronUp, Shield, Zap,
  TrendingUp, MapPin, Calendar, Phone, Mail, ArrowRight, Play,
  CheckCircle2, Quote, Sparkles
} from 'lucide-react';

interface LPConfig {
  heroTitle: string;
  heroSubtitle: string;
  ctaText: string;
  primaryColor: string;
  logoUrl: string;
  courseName: string;
  // Stats
  statStudents: string;
  statApproval: string;
  statYears: string;
  statCourses: string;
  // Sobre o curso
  courseDescription: string;
  courseDuration: string;
  courseFormat: string;
  courseModules: string;
  // Para quem
  targetAudience: string;
  // Diferenciais
  differentials: string;
  // Depoimentos
  testimonials: string;
  // FAQ
  faq: string;
  // Instituição
  institutionName: string;
  institutionDescription: string;
}

interface LPData {
  title: string;
  template: string;
  config: LPConfig;
}

// Helper to parse JSON arrays from config (stored as strings)
function parseConfigArray(value: string | undefined, fallback: any[]): any[] {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Animated counter
function AnimatedNumber({ target, suffix = '' }: { target: string; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const num = parseInt(target) || 0;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          let start = 0;
          const duration = 1500;
          const step = (timestamp: number) => {
            start = start || timestamp;
            const progress = Math.min((timestamp - start) / duration, 1);
            setCount(Math.floor(progress * num));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [num]);

  return <div ref={ref}>{count}{suffix}</div>;
}

// FAQ Item
function FaqItem({ question, answer, color }: { question: string; answer: string; color: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden transition-all hover:border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <span className="text-[15px] font-semibold text-gray-800 pr-4">{question}</span>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
          style={{ backgroundColor: open ? color : '#f3f4f6', color: open ? 'white' : '#6b7280' }}
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>
      {open && (
        <div className="px-5 pb-5 -mt-1">
          <p className="text-sm text-gray-600 leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}

// Form component (reusable)
function LeadForm({
  color,
  ctaText,
  courseName,
  title: lpTitle,
  slug,
  apiUrl,
  onSuccess,
}: {
  color: string;
  ctaText: string;
  courseName: string;
  title: string;
  slug: string;
  apiUrl: string;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const getUtmParams = () => {
    if (typeof window === 'undefined') return {};
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_content: params.get('utm_content') || '',
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    setSending(true);
    try {
      const utms = getUtmParams();
      const res = await fetch(`${apiUrl}/lp/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone: phone.replace(/\D/g, ''),
          email,
          course: courseName || lpTitle || '',
          ...utms,
        }),
      });
      if (!res.ok) throw new Error('Erro ao enviar');
      onSuccess();
    } catch {
      alert('Erro ao enviar. Tente novamente.');
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Nome completo *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Seu nome"
          className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm focus:ring-2 outline-none transition-all bg-gray-50/50 focus:bg-white"
          style={{ '--tw-ring-color': `${color}40` } as any}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">WhatsApp *</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          required
          placeholder="(00) 00000-0000"
          className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm focus:ring-2 outline-none transition-all bg-gray-50/50 focus:bg-white"
          style={{ '--tw-ring-color': `${color}40` } as any}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">E-mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm focus:ring-2 outline-none transition-all bg-gray-50/50 focus:bg-white"
          style={{ '--tw-ring-color': `${color}40` } as any}
        />
      </div>
      <button
        type="submit"
        disabled={sending}
        className="w-full py-4 text-white font-bold rounded-xl transition-all hover:opacity-90 hover:shadow-lg active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 text-sm uppercase tracking-wide"
        style={{ backgroundColor: color }}
      >
        {sending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Send className="w-4 h-4" />
            {ctaText || 'Quero me inscrever'}
          </>
        )}
      </button>
      <p className="text-[11px] text-gray-400 text-center flex items-center justify-center gap-1">
        <Shield className="w-3 h-3" />
        Dados protegidos pela LGPD
      </p>
    </form>
  );
}

export default function PublicLandingPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [data, setData] = useState<LPData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:8001';

  useEffect(() => {
    const fetchLP = async () => {
      try {
        const res = await fetch(`${API_URL}/lp/${slug}`);
        if (!res.ok) throw new Error('Página não encontrada');
        const json = await res.json();
        setData(json);
      } catch {
        setError('Página não encontrada');
      } finally {
        setLoading(false);
      }
    };
    fetchLP();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <GraduationCap className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Página não encontrada</h1>
          <p className="text-gray-500">Verifique o endereço e tente novamente.</p>
        </div>
      </div>
    );
  }

  const c = data.config;
  const color = c.primaryColor || '#6366f1';

  // Parse arrays from config
  const modules = parseConfigArray(c.courseModules, [
    'Fundamentos e Introdução',
    'Metodologias Avançadas',
    'Prática Supervisionada',
    'Projeto de Conclusão'
  ]);

  const targetAudience = parseConfigArray(c.targetAudience, [
    'Graduados que desejam se especializar na área',
    'Profissionais que buscam atualização e diferenciação no mercado',
    'Quem quer ampliar suas oportunidades de carreira',
    'Profissionais que desejam atuar com mais segurança e embasamento'
  ]);

  const differentials = parseConfigArray(c.differentials, [
    { icon: 'award', title: 'Certificação MEC', desc: 'Diploma reconhecido em todo o território nacional' },
    { icon: 'users', title: 'Corpo Docente', desc: 'Professores com experiência prática e acadêmica' },
    { icon: 'book', title: 'Material Exclusivo', desc: 'Conteúdo atualizado e casos reais do mercado' },
    { icon: 'zap', title: 'Metodologia Ativa', desc: 'Aprendizado prático com aplicação imediata' },
    { icon: 'target', title: 'Networking', desc: 'Comunidade ativa de profissionais da área' },
    { icon: 'clock', title: 'Flexibilidade', desc: 'Estude no seu ritmo, de onde estiver' },
  ]);

  const testimonials = parseConfigArray(c.testimonials, [
    { name: 'Maria Silva', role: 'Psicóloga Clínica', text: 'A pós-graduação transformou minha forma de atuar. O conteúdo é extremamente prático e aplicável no dia a dia.' },
    { name: 'João Santos', role: 'Enfermeiro', text: 'Excelente corpo docente e material de estudo. Me sinto muito mais preparado para os desafios da profissão.' },
    { name: 'Ana Oliveira', role: 'Pedagoga', text: 'A melhor decisão profissional que tomei. Recomendo para todos que querem se destacar na área.' },
  ]);

  const faqItems = parseConfigArray(c.faq, [
    { q: 'Qual a duração do curso?', a: c.courseDuration || 'O curso tem duração média de 12 a 18 meses, com aulas quinzenais.' },
    { q: 'O diploma é reconhecido pelo MEC?', a: 'Sim, nosso curso é devidamente reconhecido e o diploma tem validade em todo o território nacional.' },
    { q: 'Qual o formato das aulas?', a: c.courseFormat || 'As aulas são realizadas em formato híbrido, com encontros presenciais e conteúdo online.' },
    { q: 'Quais são as formas de pagamento?', a: 'Aceitamos cartão de crédito em até 18x, boleto bancário e PIX. Consulte condições especiais.' },
    { q: 'Preciso ter experiência na área?', a: 'Não é necessário. O curso é aberto para graduados de áreas correlatas que desejam se especializar.' },
  ]);

  const iconMap: Record<string, any> = {
    award: Award, users: Users, book: BookOpen, zap: Zap,
    target: Target, clock: Clock, star: Star, trending: TrendingUp,
  };

  const stats = [
    { value: c.statStudents || '500', suffix: '+', label: 'Alunos formados' },
    { value: c.statApproval || '98', suffix: '%', label: 'Aprovação' },
    { value: c.statYears || '10', suffix: '+', label: 'Anos de mercado' },
    { value: c.statCourses || '15', suffix: '+', label: 'Cursos disponíveis' },
  ];

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:wght@700;800;900&display=swap" rel="stylesheet" />

      {/* ═══════ HERO ═══════ */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden">
        {/* Background gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${color}10 0%, white 40%, ${color}05 100%)`,
          }}
        />
        {/* Decorative elements */}
        <div
          className="absolute top-20 right-20 w-[500px] h-[500px] rounded-full blur-[100px] opacity-20"
          style={{ backgroundColor: color }}
        />
        <div
          className="absolute bottom-20 left-10 w-[300px] h-[300px] rounded-full blur-[80px] opacity-10"
          style={{ backgroundColor: color }}
        />
        {/* Dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(${color} 1px, transparent 1px)`,
            backgroundSize: '30px 30px',
          }}
        />

        <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center w-full">
          {/* Left content */}
          <div>
            {c.logoUrl && (
              <img src={c.logoUrl} alt="Logo" className="h-14 mb-8 object-contain" />
            )}
            {c.courseName && (
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-6"
                style={{ backgroundColor: `${color}12`, color }}
              >
                <Sparkles className="w-4 h-4" />
                {c.courseName}
              </div>
            )}
            <h1
              className="text-5xl lg:text-6xl font-black leading-[1.1] mb-6 text-gray-900"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {c.heroTitle || data.title}
            </h1>
            {c.heroSubtitle && (
              <p className="text-lg text-gray-500 leading-relaxed mb-10 max-w-lg">
                {c.heroSubtitle}
              </p>
            )}

            {/* Quick info pills */}
            <div className="flex flex-wrap gap-3">
              {[
                { icon: Award, text: 'Certificação MEC' },
                { icon: Clock, text: c.courseDuration || 'Início Imediato' },
                { icon: MapPin, text: c.courseFormat || 'Presencial + Online' },
              ].map((pill) => (
                <div
                  key={pill.text}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-100 shadow-sm text-sm text-gray-600"
                >
                  <pill.icon className="w-4 h-4" style={{ color }} />
                  <span className="font-medium">{pill.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right - Form Card */}
          <div className="w-full max-w-[420px] mx-auto lg:ml-auto">
            {!submitted ? (
              <div className="bg-white rounded-3xl p-8 shadow-[0_20px_60px_rgba(0,0,0,0.08)] border border-gray-100">
                <div className="text-center mb-6">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                    style={{ backgroundColor: `${color}12` }}
                  >
                    <GraduationCap className="w-7 h-7" style={{ color }} />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Garanta sua vaga</h2>
                  <p className="text-sm text-gray-400 mt-1">Turmas com vagas limitadas</p>
                </div>
                <LeadForm
                  color={color}
                  ctaText={c.ctaText}
                  courseName={c.courseName}
                  title={data.title}
                  slug={slug}
                  apiUrl={API_URL}
                  onSuccess={() => setSubmitted(true)}
                />
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-8 shadow-[0_20px_60px_rgba(0,0,0,0.08)] border border-gray-100 text-center">
                <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle className="w-10 h-10 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Inscrição recebida!</h2>
                <p className="text-gray-500">Em breve nossa equipe entrará em contato pelo WhatsApp.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══════ STATS BAR ═══════ */}
      <section style={{ backgroundColor: color }} className="py-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl md:text-4xl font-black text-white flex items-center justify-center">
                  <AnimatedNumber target={stat.value} suffix={stat.suffix} />
                </div>
                <p className="text-sm text-white/70 mt-1 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ SOBRE O CURSO ═══════ */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <span
                className="text-sm font-bold uppercase tracking-widest"
                style={{ color }}
              >
                Sobre o curso
              </span>
              <h2
                className="text-4xl font-black text-gray-900 mt-3 mb-6"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Tudo o que você precisa para se destacar
              </h2>
              <p className="text-gray-500 leading-relaxed mb-8 text-lg">
                {c.courseDescription || 'Nosso curso foi desenvolvido para formar profissionais de excelência, combinando teoria avançada com prática supervisionada. Você terá acesso a conteúdo atualizado, professores referência no mercado e uma metodologia que prioriza a aplicação real dos conhecimentos.'}
              </p>

              {/* Course details */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: Clock, label: 'Duração', value: c.courseDuration || '12 meses' },
                  { icon: BookOpen, label: 'Formato', value: c.courseFormat || 'Híbrido' },
                  { icon: Award, label: 'Certificação', value: 'Reconhecido MEC' },
                  { icon: Calendar, label: 'Início', value: 'Turmas Abertas' },
                ].map((detail) => (
                  <div key={detail.label} className="flex items-start gap-3 p-4 rounded-2xl bg-gray-50">
                    <detail.icon className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color }} />
                    <div>
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">{detail.label}</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{detail.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modules list */}
            <div className="bg-gray-50 rounded-3xl p-8">
              <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                <BookOpen className="w-5 h-5" style={{ color }} />
                Módulos do Curso
              </h3>
              <div className="space-y-3">
                {modules.map((mod: string, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <span className="text-sm font-medium text-gray-700">{mod}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ PARA QUEM É ═══════ */}
      <section className="py-24" style={{ backgroundColor: `${color}06` }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span
              className="text-sm font-bold uppercase tracking-widest"
              style={{ color }}
            >
              Para quem é
            </span>
            <h2
              className="text-4xl font-black text-gray-900 mt-3"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Esse curso é para você que...
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl mx-auto">
            {targetAudience.map((item: string, i: number) => (
              <div
                key={i}
                className="flex items-start gap-4 p-6 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${color}15` }}
                >
                  <CheckCircle2 className="w-4 h-4" style={{ color }} />
                </div>
                <p className="text-[15px] text-gray-700 font-medium leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ DIFERENCIAIS ═══════ */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span
              className="text-sm font-bold uppercase tracking-widest"
              style={{ color }}
            >
              Diferenciais
            </span>
            <h2
              className="text-4xl font-black text-gray-900 mt-3"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Por que escolher a {c.institutionName || 'nossa instituição'}?
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {differentials.map((diff: any, i: number) => {
              const Icon = iconMap[diff.icon] || Star;
              return (
                <div
                  key={i}
                  className="p-6 rounded-2xl border border-gray-100 hover:shadow-lg transition-all group"
                >
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"
                    style={{ backgroundColor: `${color}10` }}
                  >
                    <Icon className="w-6 h-6" style={{ color }} />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">{diff.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{diff.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════ DEPOIMENTOS ═══════ */}
      <section className="py-24" style={{ backgroundColor: `${color}06` }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span
              className="text-sm font-bold uppercase tracking-widest"
              style={{ color }}
            >
              Depoimentos
            </span>
            <h2
              className="text-4xl font-black text-gray-900 mt-3"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              O que nossos alunos dizem
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t: any, i: number) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <Quote className="w-8 h-8 mb-4 opacity-20" style={{ color }} />
                <p className="text-[15px] text-gray-600 leading-relaxed mb-6">"{t.text}"</p>
                <div className="flex items-center gap-3 pt-4 border-t border-gray-50">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    style={{ backgroundColor: color }}
                  >
                    {t.name?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ FAQ ═══════ */}
      <section className="py-24 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-16">
            <span
              className="text-sm font-bold uppercase tracking-widest"
              style={{ color }}
            >
              Dúvidas Frequentes
            </span>
            <h2
              className="text-4xl font-black text-gray-900 mt-3"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Perguntas mais comuns
            </h2>
          </div>

          <div className="space-y-3">
            {faqItems.map((item: any, i: number) => (
              <FaqItem key={i} question={item.q} answer={item.a} color={color} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ CTA FINAL ═══════ */}
      <section
        className="py-24 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)` }}
      >
        {/* Pattern */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative z-10 max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2
                className="text-4xl font-black text-white leading-tight"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Não perca essa oportunidade
              </h2>
              <p className="text-lg text-white/80 mt-4 leading-relaxed">
                As vagas são limitadas e a próxima turma já está se formando.
                Garanta seu lugar e dê o próximo passo na sua carreira.
              </p>
              <div className="flex items-center gap-4 mt-6">
                <div className="flex -space-x-2">
                  {['M', 'J', 'A', 'C'].map((l, i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-white text-xs font-bold"
                    >
                      {l}
                    </div>
                  ))}
                </div>
                <p className="text-sm text-white/70">+{c.statStudents || '500'} alunos já se matricularam</p>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-8">
              {!submitted ? (
                <>
                  <h3 className="text-lg font-bold text-gray-900 text-center mb-5">
                    Preencha e receba todas as informações
                  </h3>
                  <LeadForm
                    color={color}
                    ctaText={c.ctaText}
                    courseName={c.courseName}
                    title={data.title}
                    slug={slug}
                    apiUrl={API_URL}
                    onSuccess={() => setSubmitted(true)}
                  />
                </>
              ) : (
                <div className="text-center py-4">
                  <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <p className="font-bold text-gray-900">Inscrição recebida!</p>
                  <p className="text-sm text-gray-500 mt-1">Entraremos em contato em breve.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="py-8 bg-gray-900">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {c.logoUrl && <img src={c.logoUrl} alt="Logo" className="h-8 object-contain brightness-0 invert" />}
            <span className="text-sm text-gray-400">
              {c.institutionName || ''} © {new Date().getFullYear()}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Todos os direitos reservados
          </p>
        </div>
      </footer>
    </div>
  );
}
