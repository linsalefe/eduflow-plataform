'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2, CheckCircle, Clock, Award, Users, Send,
  BookOpen, Target, Star, ChevronDown, ChevronUp, Shield, Zap,
  TrendingUp, CheckCircle2, Quote, Sparkles, GraduationCap, ArrowDown
} from 'lucide-react';

// ═══════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════

interface Section { id: string; label: string; icon: string; enabled: boolean; locked?: boolean; data: any; }
interface FormField { id: string; label: string; type: 'text' | 'tel' | 'email' | 'select'; required: boolean; enabled: boolean; options?: string[]; }
interface LPConfig { primaryColor: string; secondaryColor: string; logoUrl: string; heroImageUrl: string; formFields: FormField[]; sections: Section[]; heroTitle?: string; heroSubtitle?: string; ctaText?: string; courseName?: string; [key: string]: any; }
interface LPData { title: string; template: string; config: LPConfig; }

// ═══════════════════════════════════════════
// HOOKS & HELPERS
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

// Scroll reveal hook
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function RevealSection({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(40px)',
        transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// Animated counter
function AnimatedNumber({ target, suffix = '' }: { target: string; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const num = parseInt(target) || 0;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        let start = 0;
        const step = (ts: number) => { start = start || ts; const p = Math.min((ts - start) / 1500, 1); setCount(Math.floor(p * num)); if (p < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
        obs.disconnect();
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [num]);
  return <div ref={ref}>{count}{suffix}</div>;
}

// FAQ
function FaqItem({ question, answer, color, index }: { question: string; answer: string; color: string; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <RevealSection delay={index * 80}>
      <div className={`border rounded-2xl overflow-hidden transition-all duration-300 ${open ? 'border-gray-200 shadow-lg shadow-gray-100/50' : 'border-gray-100 hover:border-gray-200'}`}>
        <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-6 text-left group">
          <span className="text-[15px] font-semibold text-gray-800 pr-4 group-hover:text-gray-900 transition-colors">{question}</span>
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300" style={{ backgroundColor: open ? color : '#f3f4f6', color: open ? 'white' : '#6b7280', transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>
            <ChevronDown className="w-4 h-4" />
          </div>
        </button>
        <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: open ? '500px' : '0', opacity: open ? 1 : 0 }}>
          <div className="px-6 pb-6">
            <p className="text-sm text-gray-600 leading-relaxed">{answer}</p>
          </div>
        </div>
      </div>
    </RevealSection>
  );
}

// ═══════════════════════════════════════════
// FORMULÁRIO DINÂMICO
// ═══════════════════════════════════════════

function DynamicLeadForm({ color, ctaText, title, slug, apiUrl, formFields, onSuccess }: {
  color: string; ctaText: string; title: string; slug: string; apiUrl: string; formFields: FormField[]; onSuccess: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const activeFields = formFields.filter(f => f.enabled);

  const formatPhone = (value: string) => {
    const d = value.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };

  const handleChange = (id: string, val: string, type: string) => {
    setValues(prev => ({ ...prev, [id]: type === 'tel' ? formatPhone(val) : val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values['name'] || !values['phone']) return;
    setSending(true);
    try {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const utms = { utm_source: params?.get('utm_source') || '', utm_medium: params?.get('utm_medium') || '', utm_campaign: params?.get('utm_campaign') || '', utm_content: params?.get('utm_content') || '' };
      const extra: Record<string, string> = {};
      activeFields.forEach(f => { if (!['name', 'phone', 'email'].includes(f.id)) extra[f.id] = values[f.id] || ''; });
      const res = await fetch(`${apiUrl}/lp/${slug}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: values['name'], phone: values['phone']?.replace(/\D/g, ''), email: values['email'] || '', course: values['interest'] || title || '', extra_fields: extra, ...utms }),
      });
      if (!res.ok) throw new Error();
      onSuccess();
    } catch { alert('Erro ao enviar. Tente novamente.'); }
    finally { setSending(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {activeFields.map((field, i) => (
        <div key={field.id} style={{ animationDelay: `${i * 60}ms` }} className="animate-fadeSlideUp">
          <label className="block text-[11px] font-bold text-gray-400 mb-1.5 uppercase tracking-[0.1em]">
            {field.label} {field.required && <span style={{ color }}>*</span>}
          </label>
          {field.type === 'select' ? (
            <select
              value={values[field.id] || ''} onChange={(e) => handleChange(field.id, e.target.value, field.type)} required={field.required}
              onFocus={() => setFocused(field.id)} onBlur={() => setFocused(null)}
              className="w-full px-4 py-3.5 border-2 rounded-xl text-sm outline-none transition-all duration-200 bg-white appearance-none"
              style={{ borderColor: focused === field.id ? color : '#e5e7eb' }}
            >
              <option value="">Selecione...</option>
              {(field.options || []).map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
            </select>
          ) : (
            <input
              type={field.type} value={values[field.id] || ''} onChange={(e) => handleChange(field.id, e.target.value, field.type)} required={field.required}
              onFocus={() => setFocused(field.id)} onBlur={() => setFocused(null)}
              placeholder={field.type === 'tel' ? '(00) 00000-0000' : field.type === 'email' ? 'seu@email.com' : field.label}
              className="w-full px-4 py-3.5 border-2 rounded-xl text-sm outline-none transition-all duration-200 bg-white"
              style={{ borderColor: focused === field.id ? color : '#e5e7eb' }}
            />
          )}
        </div>
      ))}
      <button
        type="submit" disabled={sending}
        className="w-full py-4 text-white font-bold rounded-xl transition-all duration-300 hover:shadow-xl active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 text-sm uppercase tracking-wide relative overflow-hidden group"
        style={{ backgroundColor: color }}
      >
        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
        <span className="relative flex items-center gap-2">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" />{ctaText || 'Quero me inscrever'}</>}
        </span>
      </button>
      <p className="text-[11px] text-gray-400 text-center flex items-center justify-center gap-1">
        <Shield className="w-3 h-3" /> Dados protegidos pela LGPD
      </p>
    </form>
  );
}

// ═══════════════════════════════════════════
// ÍCONES
// ═══════════════════════════════════════════

const iconMap: Record<string, any> = {
  award: Award, users: Users, book: BookOpen, zap: Zap,
  target: Target, clock: Clock, star: Star, trending: TrendingUp,
};

// ═══════════════════════════════════════════
// SEÇÕES
// ═══════════════════════════════════════════

function SectionHeader({ tag, title, color }: { tag: string; title: string; color: string }) {
  return (
    <RevealSection>
      <div className="text-center mb-10 lg:mb-16">
        <span
          className="inline-block text-xs font-bold uppercase tracking-[0.2em] px-4 py-2 rounded-full mb-4"
          style={{ backgroundColor: `${color}10`, color }}
        >
          {tag}
        </span>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-gray-900 leading-tight" style={{ fontFamily: 'var(--heading-font)' }}>
          {title}
        </h2>
      </div>
    </RevealSection>
  );
}

function StatsSection({ data, color }: { data: any; color: string }) {
  const items = data?.items || [];
  if (items.length === 0) return null;
  return (
    <section className="py-3 relative">
      <div className="max-w-6xl mx-auto px-6 -mt-8 relative z-10">
        <div
          className="rounded-2xl p-8 grid grid-cols-2 md:grid-cols-4 gap-8"
          style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`, boxShadow: `0 20px 60px ${color}30` }}
        >
          {items.map((stat: any, i: number) => (
            <RevealSection key={i} delay={i * 100}>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-black text-white flex items-center justify-center">
                  <AnimatedNumber target={stat.value} suffix={stat.suffix} />
                </div>
                <p className="text-sm text-white/70 mt-1 font-medium">{stat.label}</p>
              </div>
            </RevealSection>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutSection({ data, color }: { data: any; color: string }) {
  const highlights = data?.highlights?.filter((h: any) => h.label && h.value) || [];
  return (
    <section className="py-14 lg:py-24 bg-white relative overflow-hidden">
      <div className="absolute -right-40 top-0 w-80 h-80 rounded-full opacity-[0.03]" style={{ backgroundColor: color }} />
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeader tag={data?.sectionTitle || 'Sobre'} title={data?.sectionTitle || 'Sobre o Programa'} color={color} />
        {data?.description && (
          <RevealSection delay={100}>
            <p className="text-gray-500 leading-relaxed text-lg max-w-3xl mx-auto text-center mb-14">{data.description}</p>
          </RevealSection>
        )}
        {highlights.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {highlights.map((h: any, i: number) => (
              <RevealSection key={i} delay={i * 120}>
                <div className="relative p-6 rounded-2xl bg-gray-50 hover:bg-white hover:shadow-xl hover:shadow-gray-100/80 transition-all duration-500 group border border-transparent hover:border-gray-100">
                  <div className="absolute top-0 left-6 w-10 h-1 rounded-full transition-all duration-300 group-hover:w-16" style={{ backgroundColor: color }} />
                  <p className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.15em] mt-2">{h.label}</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">{h.value}</p>
                </div>
              </RevealSection>
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
    <section className="py-24 relative" style={{ backgroundColor: '#fafafa' }}>
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeader tag={data?.sectionTitle || 'Grade'} title={data?.sectionTitle || 'O que você vai aprender'} color={color} />
        <div className="max-w-3xl mx-auto space-y-3">
          {items.map((topic: string, i: number) => (
            <RevealSection key={i} delay={i * 80}>
              <div className="flex items-center gap-5 p-5 bg-white rounded-2xl border border-gray-100 hover:shadow-lg hover:shadow-gray-100/50 transition-all duration-300 hover:-translate-y-0.5 group">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3" style={{ backgroundColor: color }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <span className="text-[15px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">{topic}</span>
              </div>
            </RevealSection>
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
    <section className="py-14 lg:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeader tag={data?.sectionTitle || 'Para quem é'} title={data?.sectionTitle || 'Para quem é'} color={color} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {items.map((item: string, i: number) => (
            <RevealSection key={i} delay={i * 100}>
              <div className="flex items-start gap-4 p-6 rounded-2xl border border-gray-100 hover:shadow-lg hover:shadow-gray-100/50 transition-all duration-300 hover:-translate-y-0.5 bg-white group">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:scale-110" style={{ backgroundColor: `${color}12` }}>
                  <CheckCircle2 className="w-5 h-5" style={{ color }} />
                </div>
                <p className="text-[15px] text-gray-700 font-medium leading-relaxed pt-2">{item}</p>
              </div>
            </RevealSection>
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
    <section className="py-14 lg:py-24" style={{ backgroundColor: '#fafafa' }}>
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeader tag={data?.sectionTitle || 'Diferenciais'} title={data?.sectionTitle || 'Por que nos escolher'} color={color} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((diff: any, i: number) => {
            const Icon = iconMap[diff.icon] || Star;
            return (
              <RevealSection key={i} delay={i * 100}>
                <div className="p-7 rounded-2xl bg-white border border-gray-100 hover:shadow-xl hover:shadow-gray-100/50 transition-all duration-500 hover:-translate-y-1 group relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-[0.05] -translate-y-1/2 translate-x-1/2 transition-transform duration-500 group-hover:scale-150" style={{ backgroundColor: color }} />
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3" style={{ backgroundColor: `${color}10` }}>
                    <Icon className="w-7 h-7" style={{ color }} />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">{diff.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{diff.desc}</p>
                </div>
              </RevealSection>
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
    <section className="py-14 lg:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeader tag={data?.sectionTitle || 'Depoimentos'} title={data?.sectionTitle || 'O que dizem sobre nós'} color={color} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {items.map((t: any, i: number) => (
            <RevealSection key={i} delay={i * 120}>
              <div className="relative p-7 rounded-2xl border border-gray-100 bg-white hover:shadow-xl hover:shadow-gray-100/50 transition-all duration-500 hover:-translate-y-1 group">
                <div className="absolute -top-3 left-7">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-md" style={{ backgroundColor: color }}>
                    <Quote className="w-4 h-4 text-white" />
                  </div>
                </div>
                <p className="text-[15px] text-gray-600 leading-relaxed mt-4 mb-6">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center gap-3 pt-5 border-t border-gray-50">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-inner" style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}>
                    {t.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.role}</p>
                  </div>
                </div>
              </div>
            </RevealSection>
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
    <section className="py-14 lg:py-24" style={{ backgroundColor: '#fafafa' }}>
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader tag={data?.sectionTitle || 'FAQ'} title={data?.sectionTitle || 'Dúvidas Frequentes'} color={color} />
        <div className="space-y-3">
          {items.map((item: any, i: number) => (
            <FaqItem key={i} question={item.q} answer={item.a} color={color} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function VideoSection({ data, color }: { data: any; color: string }) {
  const url = data?.youtubeUrl || '';
  const videoId = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1];
  if (!videoId) return null;
  return (
    <section className="py-14 lg:py-24 bg-white">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader tag={data?.sectionTitle || 'Vídeo'} title={data?.sectionTitle || 'Conheça mais'} color={color} />
        <RevealSection delay={100}>
          <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-gray-200/50 border border-gray-100 group">
            <div className="aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${videoId}?rel=0`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{ boxShadow: `inset 0 0 0 1px ${color}10` }} />
          </div>
        </RevealSection>
      </div>
    </section>
  );
}

function CtaFinalSection({ data, color, slug, apiUrl, title, formFields, ctaText, submitted, onSuccess }: {
  data: any; color: string; slug: string; apiUrl: string; title: string;
  formFields: FormField[]; ctaText: string; submitted: boolean; onSuccess: () => void;
}) {
  return (
    <section className="py-14 lg:py-24 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 50%, ${color}99 100%)` }}>
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-white/5" />
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5" />
      <div className="relative z-10 max-w-5xl mx-auto px-5 lg:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <RevealSection>
            <div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight" style={{ fontFamily: 'var(--heading-font)' }}>
                {data?.title || 'Não perca essa oportunidade'}
              </h2>
              <p className="text-lg text-white/75 mt-5 leading-relaxed max-w-md">
                {data?.subtitle || 'Garanta seu lugar agora.'}
              </p>
              <div className="flex items-center gap-4 mt-8">
                <div className="flex -space-x-2">
                  {['A', 'B', 'C', 'D'].map((l, i) => (
                    <div key={i} className="w-9 h-9 rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center text-white text-xs font-bold backdrop-blur-sm">
                      {l}
                    </div>
                  ))}
                </div>
                <p className="text-sm text-white/60">Junte-se a centenas de clientes</p>
              </div>
            </div>
          </RevealSection>

          <RevealSection delay={200}>
            <div className="bg-white rounded-3xl p-8 shadow-2xl">
              {!submitted ? (
                <>
                  <h3 className="text-lg font-bold text-gray-900 text-center mb-1">Falta pouco!</h3>
                  <p className="text-sm text-gray-400 text-center mb-5">Preencha e receba todas as informações</p>
                  <DynamicLeadForm color={color} ctaText={ctaText} title={title} slug={slug} apiUrl={apiUrl} formFields={formFields} onSuccess={onSuccess} />
                </>
              ) : (
                <div className="text-center py-6">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                  </div>
                  <p className="text-xl font-bold text-gray-900">Inscrição recebida!</p>
                  <p className="text-sm text-gray-500 mt-2">Entraremos em contato em breve.</p>
                </div>
              )}
            </div>
          </RevealSection>
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
    (async () => {
      try {
        const res = await fetch(`${API_URL}/lp/${slug}`);
        if (!res.ok) throw new Error();
        setData(await res.json());
      } catch { setError('Página não encontrada'); }
      finally { setLoading(false); }
    })();
  }, [slug]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
        <p className="text-sm text-gray-400">Carregando...</p>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-5">
          <GraduationCap className="w-10 h-10 text-gray-200" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Página não encontrada</h1>
        <p className="text-gray-500 text-sm">Verifique o endereço e tente novamente.</p>
      </div>
    </div>
  );

  const c = data.config;
  const color = c.primaryColor || '#1D4ED8';
  const newFmt = isNewFormat(c);

  const headingFont = c.headingFont || 'Playfair Display';
  const bodyFont = c.bodyFont || 'Inter';
  const fontsToLoad = [...new Set([headingFont, bodyFont, 'Inter'])].map(f => f.replace(/ /g, '+')).join('&family=');

  const formFields: FormField[] = c.formFields || [
    { id: 'name', label: 'Nome completo', type: 'text', required: true, enabled: true },
    { id: 'phone', label: 'WhatsApp', type: 'tel', required: true, enabled: true },
    { id: 'email', label: 'E-mail', type: 'email', required: false, enabled: true },
  ];

  const heroSection = newFmt ? getSection(c, 'hero') : null;
  const heroTitle = heroSection?.data?.title || c.heroTitle || data.title;
  const heroSubtitle = heroSection?.data?.subtitle || c.heroSubtitle || '';
  const ctaText = heroSection?.data?.ctaText || c.ctaText || 'Quero me inscrever';
  const ctaSection = newFmt ? getSection(c, 'cta_final') : null;

  const middleSections = newFmt ? getEnabledSections(c).filter(s => s.id !== 'hero' && s.id !== 'cta_final') : [];

  const renderers: Record<string, (s: Section) => React.ReactNode> = {
    stats: (s) => <StatsSection key={s.id} data={s.data} color={color} />,
    about: (s) => <AboutSection key={s.id} data={s.data} color={color} />,
    topics: (s) => <TopicsSection key={s.id} data={s.data} color={color} />,
    audience: (s) => <AudienceSection key={s.id} data={s.data} color={color} />,
    differentials: (s) => <DifferentialsSection key={s.id} data={s.data} color={color} />,
    testimonials: (s) => <TestimonialsSection key={s.id} data={s.data} color={color} />,
    faq: (s) => <FaqSection key={s.id} data={s.data} color={color} />,
    video: (s) => <VideoSection key={s.id} data={s.data} color={color} />,
  };

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: `'${bodyFont}', -apple-system, sans-serif` }}>
      <link href={`https://fonts.googleapis.com/css2?family=${fontsToLoad}:wght@400;500;600;700;800;900&display=swap`} rel="stylesheet" />

      {/* CSS Animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        :root { --heading-font: '${headingFont}', serif; --body-font: '${bodyFont}', sans-serif; }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes pulse-soft { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
        .animate-fadeSlideUp { animation: fadeSlideUp 0.5s ease-out forwards; opacity: 0; }
        .animate-float { animation: float 4s ease-in-out infinite; }
        .animate-pulse-soft { animation: pulse-soft 3s ease-in-out infinite; }
        .heading-font { font-family: var(--heading-font) !important; }
      `}} />

      {/* ═══════ HERO ═══════ */}
      <section className="relative min-h-[85vh] lg:min-h-screen flex items-center overflow-hidden">
        {c.heroImageUrl ? (
          <>
            <div className="absolute inset-0"><img src={c.heroImageUrl} alt="" className="w-full h-full object-cover" /></div>
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, rgba(0,0,0,0.75) 0%, ${color}80 100%)` }} />
          </>
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, white 0%, ${color}08 30%, white 60%, ${color}05 100%)` }} />
            <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] rounded-full blur-[120px] opacity-15 animate-pulse-soft" style={{ backgroundColor: color }} />
            <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] rounded-full blur-[100px] opacity-10 animate-pulse-soft" style={{ backgroundColor: color, animationDelay: '1.5s' }} />
            <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: `radial-gradient(${color} 1px, transparent 1px)`, backgroundSize: '24px 24px' }} />
          </>
        )}

        <div className="relative z-10 max-w-7xl mx-auto px-5 lg:px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center w-full">
          <div className="animate-fadeSlideUp" style={{ animationDuration: '0.8s' }}>
            {c.logoUrl && <img src={c.logoUrl} alt="Logo" className={`h-12 lg:h-16 mb-5 lg:mb-8 object-contain ${c.heroImageUrl ? 'brightness-0 invert' : ''}`} style={{ animationDelay: '0.1s' }} />}
            <h1
              className={`text-3xl md:text-5xl lg:text-[3.5rem] xl:text-[4rem] font-black leading-[1.08] mb-4 lg:mb-6 ${c.heroImageUrl ? 'text-white' : 'text-gray-900'}`}
              style={{ fontFamily: 'var(--heading-font)' }}
            >
              {heroTitle}
            </h1>
            {heroSubtitle && (
              <p className={`text-base lg:text-xl leading-relaxed mb-6 lg:mb-10 max-w-lg ${c.heroImageUrl ? 'text-white/80' : 'text-gray-500'}`}>
                {heroSubtitle}
              </p>
            )}
            <div className={`hidden lg:flex items-center gap-2 text-sm ${c.heroImageUrl ? 'text-white/50' : 'text-gray-300'} animate-float`}>
              <ArrowDown className="w-4 h-4" />
              <span>Role para saber mais</span>
            </div>
          </div>

          <div className="animate-fadeSlideUp" style={{ animationDuration: '0.8s', animationDelay: '0.3s' }}>
            <div className="w-full max-w-[420px] mx-auto lg:ml-auto">
              {!submitted ? (
                <div className="bg-white rounded-2xl lg:rounded-3xl p-6 lg:p-8 shadow-[0_25px_80px_rgba(0,0,0,0.08)] border border-gray-100/80 backdrop-blur-sm">
                  <div className="text-center mb-6">
                    {c.logoUrl ? (
                      <div className="flex justify-center mb-4">
                        <img src={c.logoUrl} alt="Logo" className="h-12 object-contain" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 relative" style={{ backgroundColor: `${color}10` }}>
                        <Sparkles className="w-7 h-7" style={{ color }} />
                      </div>
                    )}
                    <h2 className="text-xl font-bold text-gray-900">Garanta sua vaga</h2>
                    <p className="text-sm text-gray-400 mt-1">Turmas com vagas limitadas</p>
                  </div>
                  <DynamicLeadForm color={color} ctaText={ctaText} title={data.title} slug={slug} apiUrl={API_URL} formFields={formFields} onSuccess={() => setSubmitted(true)} />
                </div>
              ) : (
                <div className="bg-white rounded-3xl p-8 shadow-[0_25px_80px_rgba(0,0,0,0.08)] border border-gray-100/80 text-center">
                  <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
                    <CheckCircle className="w-10 h-10 text-emerald-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Inscrição recebida!</h2>
                  <p className="text-gray-500">Em breve nossa equipe entrará em contato pelo WhatsApp.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ SEÇÕES DINÂMICAS ═══════ */}
      {middleSections.map(s => renderers[s.id]?.(s) || null)}

      {/* ═══════ CTA FINAL ═══════ */}
      <CtaFinalSection data={ctaSection?.data || {}} color={color} slug={slug} apiUrl={API_URL} title={data.title} formFields={formFields} ctaText={ctaText} submitted={submitted} onSuccess={() => setSubmitted(true)} />

      {/* ═══════ FOOTER ═══════ */}
      <footer className="py-8 bg-gray-950">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {c.logoUrl && <img src={c.logoUrl} alt="Logo" className="h-7 object-contain brightness-0 invert opacity-50" />}
            <span className="text-sm text-gray-500">© {new Date().getFullYear()}</span>
          </div>
          <p className="text-xs text-gray-600">Todos os direitos reservados</p>
        </div>
      </footer>
    </div>
  );
}