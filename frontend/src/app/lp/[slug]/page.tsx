'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2, CheckCircle, Clock, Award, Users, Send,
  BookOpen, Target, Star, ChevronDown, ChevronUp, Shield, Zap,
  TrendingUp, CheckCircle2, Quote, Sparkles, GraduationCap
} from 'lucide-react';

// ═══════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════

interface Section {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  locked?: boolean;
  data: any;
}

interface FormField {
  id: string;
  label: string;
  type: 'text' | 'tel' | 'email' | 'select';
  required: boolean;
  enabled: boolean;
  options?: string[];
}

interface LPConfig {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  heroImageUrl: string;
  formFields: FormField[];
  sections: Section[];
  // Compatibilidade com config antigo
  heroTitle?: string;
  heroSubtitle?: string;
  ctaText?: string;
  courseName?: string;
  [key: string]: any;
}

interface LPData {
  title: string;
  template: string;
  config: LPConfig;
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

function getSection(config: LPConfig, id: string): Section | null {
  if (!config.sections) return null;
  return config.sections.find(s => s.id === id && s.enabled) || null;
}

function getEnabledSections(config: LPConfig): Section[] {
  if (!config.sections) return [];
  return config.sections.filter(s => s.enabled);
}

function isNewFormat(config: LPConfig): boolean {
  return Array.isArray(config.sections);
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
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-5 text-left">
        <span className="text-[15px] font-semibold text-gray-800 pr-4">{question}</span>
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all" style={{ backgroundColor: open ? color : '#f3f4f6', color: open ? 'white' : '#6b7280' }}>
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

// ═══════════════════════════════════════════
// FORMULÁRIO DINÂMICO
// ═══════════════════════════════════════════

function DynamicLeadForm({
  color,
  ctaText,
  title,
  slug,
  apiUrl,
  formFields,
  onSuccess,
}: {
  color: string;
  ctaText: string;
  title: string;
  slug: string;
  apiUrl: string;
  formFields: FormField[];
  onSuccess: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  const activeFields = formFields.filter(f => f.enabled);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleChange = (fieldId: string, value: string, type: string) => {
    if (type === 'tel') {
      setValues(prev => ({ ...prev, [fieldId]: formatPhone(value) }));
    } else {
      setValues(prev => ({ ...prev, [fieldId]: value }));
    }
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
    const name = values['name'] || '';
    const phone = values['phone'] || '';
    if (!name || !phone) return;

    setSending(true);
    try {
      const utms = getUtmParams();
      const extraFields: Record<string, string> = {};
      activeFields.forEach(f => {
        if (!['name', 'phone', 'email'].includes(f.id)) {
          extraFields[f.id] = values[f.id] || '';
        }
      });

      const res = await fetch(`${apiUrl}/lp/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone: phone.replace(/\D/g, ''),
          email: values['email'] || '',
          course: values['interest'] || title || '',
          extra_fields: extraFields,
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
      {activeFields.map(field => (
        <div key={field.id}>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
            {field.label} {field.required && '*'}
          </label>

          {field.type === 'select' ? (
            <select
              value={values[field.id] || ''}
              onChange={(e) => handleChange(field.id, e.target.value, field.type)}
              required={field.required}
              className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm focus:ring-2 outline-none transition-all bg-gray-50/50 focus:bg-white appearance-none"
              style={{ '--tw-ring-color': `${color}40` } as any}
            >
              <option value="">Selecione...</option>
              {(field.options || []).map((opt, i) => (
                <option key={i} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              type={field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : 'text'}
              value={values[field.id] || ''}
              onChange={(e) => handleChange(field.id, e.target.value, field.type)}
              required={field.required}
              placeholder={
                field.type === 'tel' ? '(00) 00000-0000' :
                field.type === 'email' ? 'seu@email.com' :
                field.label
              }
              className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm focus:ring-2 outline-none transition-all bg-gray-50/50 focus:bg-white"
              style={{ '--tw-ring-color': `${color}40` } as any}
            />
          )}
        </div>
      ))}

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

// ═══════════════════════════════════════════
// ÍCONES MAP
// ═══════════════════════════════════════════

const iconMap: Record<string, any> = {
  award: Award, users: Users, book: BookOpen, zap: Zap,
  target: Target, clock: Clock, star: Star, trending: TrendingUp,
};

// ═══════════════════════════════════════════
// SEÇÕES RENDERIZÁVEIS
// ═══════════════════════════════════════════

function StatsSection({ data, color }: { data: any; color: string }) {
  const items = data?.items || [];
  if (items.length === 0) return null;
  return (
    <section style={{ backgroundColor: color }} className="py-8">
      <div className="max-w-7xl mx-auto px-6">
        <div className={`grid grid-cols-2 md:grid-cols-${Math.min(items.length, 4)} gap-8`}>
          {items.map((stat: any, i: number) => (
            <div key={i} className="text-center">
              <div className="text-3xl md:text-4xl font-black text-white flex items-center justify-center">
                <AnimatedNumber target={stat.value} suffix={stat.suffix} />
              </div>
              <p className="text-sm text-white/70 mt-1 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutSection({ data, color }: { data: any; color: string }) {
  const highlights = data?.highlights?.filter((h: any) => h.label && h.value) || [];
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <span className="text-sm font-bold uppercase tracking-widest" style={{ color }}>
            {data?.sectionTitle || 'Sobre'}
          </span>
          <h2 className="text-4xl font-black text-gray-900 mt-3" style={{ fontFamily: "'Playfair Display', serif" }}>
            {data?.sectionTitle || 'Sobre o Programa'}
          </h2>
        </div>
        {data?.description && (
          <p className="text-gray-500 leading-relaxed text-lg max-w-3xl mx-auto text-center mb-12">
            {data.description}
          </p>
        )}
        {highlights.length > 0 && (
          <div className={`grid grid-cols-1 md:grid-cols-${Math.min(highlights.length, 3)} gap-6 max-w-4xl mx-auto`}>
            {highlights.map((h: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-5 rounded-2xl bg-gray-50">
                <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color }} />
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">{h.label}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{h.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TopicsSection({ data, color }: { data: any; color: string }) {
  const items = data?.items?.filter((t: string) => t.trim()) || [];
  if (items.length === 0) return null;
  return (
    <section className="py-24" style={{ backgroundColor: `${color}06` }}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-sm font-bold uppercase tracking-widest" style={{ color }}>
            {data?.sectionTitle || 'Grade'}
          </span>
          <h2 className="text-4xl font-black text-gray-900 mt-3" style={{ fontFamily: "'Playfair Display', serif" }}>
            {data?.sectionTitle || 'O que você vai aprender'}
          </h2>
        </div>
        <div className="max-w-3xl mx-auto space-y-3">
          {items.map((topic: string, i: number) => (
            <div key={i} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: color }}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <span className="text-sm font-medium text-gray-700">{topic}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AudienceSection({ data, color }: { data: any; color: string }) {
  const items = data?.items?.filter((t: string) => t.trim()) || [];
  if (items.length === 0) return null;
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-sm font-bold uppercase tracking-widest" style={{ color }}>
            {data?.sectionTitle || 'Para quem é'}
          </span>
          <h2 className="text-4xl font-black text-gray-900 mt-3" style={{ fontFamily: "'Playfair Display', serif" }}>
            {data?.sectionTitle || 'Para quem é'}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {items.map((item: string, i: number) => (
            <div key={i} className="flex items-start gap-4 p-6 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
                <CheckCircle2 className="w-4 h-4" style={{ color }} />
              </div>
              <p className="text-[15px] text-gray-700 font-medium leading-relaxed">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DifferentialsSection({ data, color }: { data: any; color: string }) {
  const items = data?.items?.filter((d: any) => d.title) || [];
  if (items.length === 0) return null;
  return (
    <section className="py-24" style={{ backgroundColor: `${color}06` }}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-sm font-bold uppercase tracking-widest" style={{ color }}>
            {data?.sectionTitle || 'Diferenciais'}
          </span>
          <h2 className="text-4xl font-black text-gray-900 mt-3" style={{ fontFamily: "'Playfair Display', serif" }}>
            {data?.sectionTitle || 'Por que nos escolher'}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((diff: any, i: number) => {
            const Icon = iconMap[diff.icon] || Star;
            return (
              <div key={i} className="p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg transition-all group">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ backgroundColor: `${color}10` }}>
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
  );
}

function TestimonialsSection({ data, color }: { data: any; color: string }) {
  const items = data?.items?.filter((t: any) => t.text) || [];
  if (items.length === 0) return null;
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-sm font-bold uppercase tracking-widest" style={{ color }}>
            {data?.sectionTitle || 'Depoimentos'}
          </span>
          <h2 className="text-4xl font-black text-gray-900 mt-3" style={{ fontFamily: "'Playfair Display', serif" }}>
            {data?.sectionTitle || 'O que dizem sobre nós'}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {items.map((t: any, i: number) => (
            <div key={i} className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
              <Quote className="w-8 h-8 mb-4 opacity-20" style={{ color }} />
              <p className="text-[15px] text-gray-600 leading-relaxed mb-6">&ldquo;{t.text}&rdquo;</p>
              <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: color }}>
                  {t.name?.charAt(0) || '?'}
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
  );
}

function FaqSection({ data, color }: { data: any; color: string }) {
  const items = data?.items?.filter((f: any) => f.q) || [];
  if (items.length === 0) return null;
  return (
    <section className="py-24 bg-white">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-sm font-bold uppercase tracking-widest" style={{ color }}>
            {data?.sectionTitle || 'FAQ'}
          </span>
          <h2 className="text-4xl font-black text-gray-900 mt-3" style={{ fontFamily: "'Playfair Display', serif" }}>
            {data?.sectionTitle || 'Dúvidas Frequentes'}
          </h2>
        </div>
        <div className="space-y-3">
          {items.map((item: any, i: number) => (
            <FaqItem key={i} question={item.q} answer={item.a} color={color} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaFinalSection({
  data, color, slug, apiUrl, title, formFields, ctaText, submitted, onSuccess
}: {
  data: any; color: string; slug: string; apiUrl: string; title: string;
  formFields: FormField[]; ctaText: string; submitted: boolean; onSuccess: () => void;
}) {
  return (
    <section className="py-24 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)` }}>
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
      <div className="relative z-10 max-w-4xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-4xl font-black text-white leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
              {data?.title || 'Não perca essa oportunidade'}
            </h2>
            <p className="text-lg text-white/80 mt-4 leading-relaxed">
              {data?.subtitle || 'Garanta seu lugar agora.'}
            </p>
          </div>
          <div className="bg-white rounded-3xl p-8">
            {!submitted ? (
              <>
                <h3 className="text-lg font-bold text-gray-900 text-center mb-5">Preencha e receba todas as informações</h3>
                <DynamicLeadForm
                  color={color}
                  ctaText={ctaText}
                  title={title}
                  slug={slug}
                  apiUrl={apiUrl}
                  formFields={formFields}
                  onSuccess={onSuccess}
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
  );
}

// ═══════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════

export default function PublicLandingPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [data, setData] = useState<LPData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

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
  const newFormat = isNewFormat(c);

  // Form fields (novo formato ou padrão)
  const formFields: FormField[] = c.formFields || [
    { id: 'name', label: 'Nome completo', type: 'text', required: true, enabled: true },
    { id: 'phone', label: 'WhatsApp', type: 'tel', required: true, enabled: true },
    { id: 'email', label: 'E-mail', type: 'email', required: false, enabled: true },
  ];

  // Hero data
  const heroSection = newFormat ? getSection(c, 'hero') : null;
  const heroTitle = heroSection?.data?.title || c.heroTitle || data.title;
  const heroSubtitle = heroSection?.data?.subtitle || c.heroSubtitle || '';
  const ctaText = heroSection?.data?.ctaText || c.ctaText || 'Quero me inscrever';

  // CTA Final data
  const ctaSection = newFormat ? getSection(c, 'cta_final') : null;

  // Seções para renderizar (excluindo hero e cta_final que são tratados separadamente)
  const middleSections = newFormat
    ? getEnabledSections(c).filter(s => s.id !== 'hero' && s.id !== 'cta_final')
    : [];

  // Mapa de componentes de seção
  const sectionRenderers: Record<string, (section: Section) => React.ReactNode> = {
    stats: (s) => <StatsSection key={s.id} data={s.data} color={color} />,
    about: (s) => <AboutSection key={s.id} data={s.data} color={color} />,
    topics: (s) => <TopicsSection key={s.id} data={s.data} color={color} />,
    audience: (s) => <AudienceSection key={s.id} data={s.data} color={color} />,
    differentials: (s) => <DifferentialsSection key={s.id} data={s.data} color={color} />,
    testimonials: (s) => <TestimonialsSection key={s.id} data={s.data} color={color} />,
    faq: (s) => <FaqSection key={s.id} data={s.data} color={color} />,
  };

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:wght@700;800;900&display=swap" rel="stylesheet" />

      {/* ═══════ HERO ═══════ */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden">
        {/* Background */}
        {c.heroImageUrl ? (
          <>
            <div className="absolute inset-0">
              <img src={c.heroImageUrl} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="absolute inset-0 bg-black/50" />
          </>
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${color}10 0%, white 40%, ${color}05 100%)` }} />
            <div className="absolute top-20 right-20 w-[500px] h-[500px] rounded-full blur-[100px] opacity-20" style={{ backgroundColor: color }} />
            <div className="absolute bottom-20 left-10 w-[300px] h-[300px] rounded-full blur-[80px] opacity-10" style={{ backgroundColor: color }} />
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `radial-gradient(${color} 1px, transparent 1px)`, backgroundSize: '30px 30px' }} />
          </>
        )}

        <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center w-full">
          {/* Left */}
          <div>
            {c.logoUrl && <img src={c.logoUrl} alt="Logo" className={`h-14 mb-8 object-contain ${c.heroImageUrl ? 'brightness-0 invert' : ''}`} />}
            <h1 className={`text-5xl lg:text-6xl font-black leading-[1.1] mb-6 ${c.heroImageUrl ? 'text-white' : 'text-gray-900'}`} style={{ fontFamily: "'Playfair Display', serif" }}>
              {heroTitle}
            </h1>
            {heroSubtitle && (
              <p className={`text-lg leading-relaxed mb-10 max-w-lg ${c.heroImageUrl ? 'text-white/80' : 'text-gray-500'}`}>
                {heroSubtitle}
              </p>
            )}
          </div>

          {/* Right - Form Card */}
          <div className="w-full max-w-[420px] mx-auto lg:ml-auto">
            {!submitted ? (
              <div className="bg-white rounded-3xl p-8 shadow-[0_20px_60px_rgba(0,0,0,0.08)] border border-gray-100">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${color}12` }}>
                    <Sparkles className="w-7 h-7" style={{ color }} />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Garanta sua vaga</h2>
                  <p className="text-sm text-gray-400 mt-1">Turmas com vagas limitadas</p>
                </div>
                <DynamicLeadForm
                  color={color}
                  ctaText={ctaText}
                  title={data.title}
                  slug={slug}
                  apiUrl={API_URL}
                  formFields={formFields}
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

      {/* ═══════ SEÇÕES DINÂMICAS ═══════ */}
      {middleSections.map(section => {
        const renderer = sectionRenderers[section.id];
        if (!renderer) return null;
        return renderer(section);
      })}

      {/* ═══════ CTA FINAL ═══════ */}
      <CtaFinalSection
        data={ctaSection?.data || {}}
        color={color}
        slug={slug}
        apiUrl={API_URL}
        title={data.title}
        formFields={formFields}
        ctaText={ctaText}
        submitted={submitted}
        onSuccess={() => setSubmitted(true)}
      />

      {/* ═══════ FOOTER ═══════ */}
      <footer className="py-8 bg-gray-900">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {c.logoUrl && <img src={c.logoUrl} alt="Logo" className="h-8 object-contain brightness-0 invert" />}
            <span className="text-sm text-gray-400">
              © {new Date().getFullYear()}
            </span>
          </div>
          <p className="text-xs text-gray-500">Todos os direitos reservados</p>
        </div>
      </footer>
    </div>
  );
}