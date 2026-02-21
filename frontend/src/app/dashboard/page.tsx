'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, ArrowDownLeft, ArrowUpRight, TrendingUp, TrendingDown,
  UserPlus, Loader2, MessageSquare, Activity, Clock, Target,
  UserCheck, UserX, Hash, BarChart3,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/auth-context';
import api from '@/lib/api';
import { toast } from 'sonner';

interface Stats {
  total_contacts: number;
  new_today: number;
  messages_today: number;
  inbound_today: number;
  outbound_today: number;
  messages_week: number;
  status_counts: Record<string, number>;
  daily_messages: { date: string; day: string; count: number }[];
}

interface AdvancedStats {
  agents: { user_id: number; name: string; leads: number; messages_week: number }[];
  unassigned_leads: number;
  conversion_rate: number;
  converted: number;
  total: number;
  tags: { name: string; color: string; count: number }[];
  new_this_week: number;
  new_last_week: number;
  trend_pct: number;
  avg_response_minutes: number | null;
}

const statusLabels: Record<string, string> = {
  novo: 'Novos Leads',
  em_contato: 'Em Contato',
  qualificado: 'Qualificados',
  negociando: 'Em Matrícula',
  convertido: 'Matriculados',
  perdido: 'Perdidos',
};

const statusColors: Record<string, { bg: string; text: string; bar: string; dot: string }> = {
  novo: { bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-500', dot: 'bg-blue-500' },
  em_contato: { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-500', dot: 'bg-amber-500' },
  qualificado: { bg: 'bg-purple-50', text: 'text-purple-700', bar: 'bg-purple-500', dot: 'bg-purple-500' },
  negociando: { bg: 'bg-cyan-50', text: 'text-cyan-700', bar: 'bg-cyan-500', dot: 'bg-cyan-500' },
  convertido: { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  perdido: { bg: 'bg-red-50', text: 'text-red-700', bar: 'bg-red-500', dot: 'bg-red-500' },
};

const tagColorMap: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-700' },
  green: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  red: { bg: 'bg-red-100', text: 'text-red-700' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-700' },
  cyan: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
};

const statCards = [
  { key: 'total_contacts', label: 'Total de contatos', icon: Users, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
  { key: 'new_today', label: 'Novos hoje', icon: UserPlus, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
  { key: 'inbound_today', label: 'Recebidas hoje', icon: ArrowDownLeft, iconBg: 'bg-purple-50', iconColor: 'text-purple-600' },
  { key: 'outbound_today', label: 'Enviadas hoje', icon: ArrowUpRight, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formatResponseTime(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [advanced, setAdvanced] = useState<AdvancedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (!authLoading && !user) router.push('/login'); }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadStats();
      const interval = setInterval(loadStats, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const loadStats = async () => {
    try {
      const [res, advRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/dashboard/advanced'),
      ]);
      setStats(res.data);
      setAdvanced(advRes.data);
    } catch (err) {
      toast.error('Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  };

  const maxDailyCount = stats ? Math.max(...stats.daily_messages.map(d => d.count), 1) : 1;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fb]">
        <Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  if (loading || !stats) {
    return (
      <AppLayout>
        <div className="animate-pulse space-y-6 max-w-7xl mx-auto">
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-32" />
            <div className="h-7 bg-gray-200 rounded w-56" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-[120px] bg-gray-200 rounded-2xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 h-[300px] bg-gray-200 rounded-2xl" />
            <div className="h-[300px] bg-gray-200 rounded-2xl" />
          </div>
        </div>
      </AppLayout>
    );
  }

  const maxAgentLeads = advanced ? Math.max(...advanced.agents.map(a => a.leads), 1) : 1;
  const maxTagCount = advanced ? Math.max(...advanced.tags.map(t => t.count), 1) : 1;

  return (
    <AppLayout>
      <div className="space-y-4 lg:space-y-6 max-w-7xl mx-auto overflow-y-auto h-full pb-6">

        {/* ── Header ── */}
        <div className={`transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <p className="text-sm text-gray-400 mb-0.5">{getGreeting()},</p>
          <h1 className="text-xl lg:text-2xl font-semibold text-[#27273D] tracking-tight">
            {user.name.split(' ')[0]}
          </h1>
        </div>

        {/* ── Stats Cards ── */}
        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 transition-all duration-700 ease-out delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {statCards.map((card) => {
            const Icon = card.icon;
            const value = stats[card.key as keyof Stats] as number;
            return (
              <div
                key={card.key}
                className="bg-white rounded-2xl p-4 lg:p-5 border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all duration-200 group"
              >
                <div className="flex items-center justify-between mb-3 lg:mb-4">
                  <div className={`w-9 h-9 lg:w-10 lg:h-10 ${card.iconBg} rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform duration-200`}>
                    <Icon className={`w-4 h-4 lg:w-[18px] lg:h-[18px] ${card.iconColor}`} />
                  </div>
                </div>
                <p className="text-xl lg:text-2xl font-bold text-[#27273D] tabular-nums">{value}</p>
                <p className="text-[12px] lg:text-[13px] text-gray-400 mt-0.5">{card.label}</p>
              </div>
            );
          })}
        </div>

        {/* ── Gráfico + Funil ── */}
        {stats.total_contacts === 0 ? (
          <div className={`bg-white rounded-2xl border border-gray-100 p-6 lg:p-10 transition-all duration-700 ease-out delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="flex flex-col items-center text-center max-w-md mx-auto">
              <div className="w-16 h-16 bg-[#6366f1]/10 rounded-2xl flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-[#6366f1]" />
              </div>
              <h2 className="text-lg font-semibold text-[#27273D] mb-2">Bem-vindo ao EduFlow!</h2>
              <p className="text-[13px] text-gray-400 leading-relaxed mb-6">
                Para começar a receber mensagens e acompanhar seus leads, conecte seu primeiro canal do WhatsApp.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <button
                  onClick={() => router.push('/canais')}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#6366f1] text-white text-[13px] font-medium rounded-xl hover:bg-[#4f46e5] transition-all"
                >
                  <Activity className="w-4 h-4" />
                  Conectar canal
                </button>
                <button
                  onClick={() => router.push('/conversations')}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-600 text-[13px] font-medium rounded-xl hover:bg-gray-200 transition-all"
                >
                  <MessageSquare className="w-4 h-4" />
                  Ver conversas
                </button>
              </div>
            </div>
          </div>
        ) : (
        <div className={`grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4 transition-all duration-700 ease-out delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

          {/* Gráfico de barras */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-4 lg:p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-[15px] font-semibold text-[#27273D]">Mensagens na semana</h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  <span className="font-semibold text-[#27273D]">{stats.messages_week}</span> nos últimos 7 dias
                </p>
              </div>
              <div className="w-9 h-9 bg-[#6366f1]/8 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-[#6366f1]" />
              </div>
            </div>

            <div className="flex items-end justify-between gap-1 lg:gap-2 h-36 lg:h-48">
              {stats.daily_messages.map((day, i) => {
                const pct = (day.count / maxDailyCount) * 100;
                const isHovered = hoveredBar === i;
                const isToday = i === stats.daily_messages.length - 1;

                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center gap-2 cursor-default"
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    <span className={`text-xs font-semibold tabular-nums transition-all duration-200 ${
                      isHovered ? 'text-[#6366f1]' : 'text-gray-400'
                    }`}>
                      {day.count}
                    </span>

                    <div className="w-full bg-gray-50 rounded-lg overflow-hidden relative" style={{ height: '130px' }}>
                      <div
                        className={`w-full rounded-lg transition-all duration-500 ease-out ${
                          isToday
                            ? 'bg-[#6366f1]'
                            : isHovered
                              ? 'bg-[#6366f1]/70'
                              : 'bg-[#6366f1]/25'
                        }`}
                        style={{
                          height: `${Math.max(pct, day.count > 0 ? 6 : 2)}%`,
                          marginTop: `${100 - Math.max(pct, day.count > 0 ? 6 : 2)}%`,
                        }}
                      />
                    </div>

                    <span className={`text-[11px] font-medium transition-colors duration-200 ${
                      isToday ? 'text-[#6366f1]' : 'text-gray-400'
                    }`}>
                      {day.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Funil de Matrículas */}
          <div className="bg-white rounded-2xl p-4 lg:p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-[15px] font-semibold text-[#27273D]">Funil de Matrículas</h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  <span className="font-semibold text-[#27273D]">{stats.total_contacts}</span> contatos
                </p>
              </div>
              <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center">
                <Activity className="w-4 h-4 text-purple-600" />
              </div>
            </div>

            <div className="space-y-3.5">
              {Object.entries(statusLabels).map(([key, label]) => {
                const count = stats.status_counts[key] || 0;
                const pct = stats.total_contacts > 0 ? (count / stats.total_contacts) * 100 : 0;
                const colors = statusColors[key];
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                        <span className="text-[13px] text-gray-600">{label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400 tabular-nums">
                          {pct.toFixed(0)}%
                        </span>
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${colors.bg} ${colors.text} tabular-nums`}>
                          {count}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${colors.bar} rounded-full transition-all duration-700 ease-out`}
                        style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* ══ MÉTRICAS AVANÇADAS ═══════════════════════════════ */}
        {/* ══════════════════════════════════════════════════════ */}
        {advanced && stats.total_contacts > 0 && (
          <>
            {/* ── KPI Row: Conversão + Tempo Resposta + Tendência ── */}
            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4 transition-all duration-700 ease-out delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

              {/* Taxa de conversão */}
              <div className="bg-white rounded-2xl p-4 lg:p-5 border border-gray-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <Target className="w-[18px] h-[18px] text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[12px] text-gray-400">Taxa de Conversão</p>
                    <p className="text-xl font-bold text-[#27273D] tabular-nums">{advanced.conversion_rate}%</p>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(advanced.conversion_rate, 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-2 tabular-nums">
                  {advanced.converted} de {advanced.total} convertidos
                </p>
              </div>

              {/* Tempo médio de resposta */}
              <div className="bg-white rounded-2xl p-4 lg:p-5 border border-gray-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                    <Clock className="w-[18px] h-[18px] text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[12px] text-gray-400">Tempo Médio de Resposta</p>
                    <p className="text-xl font-bold text-[#27273D] tabular-nums">
                      {formatResponseTime(advanced.avg_response_minutes)}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">
                  Primeira resposta aos novos leads (7 dias)
                </p>
              </div>

              {/* Tendência semanal */}
              <div className="bg-white rounded-2xl p-4 lg:p-5 border border-gray-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    advanced.trend_pct >= 0 ? 'bg-emerald-50' : 'bg-red-50'
                  }`}>
                    {advanced.trend_pct >= 0
                      ? <TrendingUp className="w-[18px] h-[18px] text-emerald-600" />
                      : <TrendingDown className="w-[18px] h-[18px] text-red-600" />
                    }
                  </div>
                  <div>
                    <p className="text-[12px] text-gray-400">Novos Leads (semana)</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-bold text-[#27273D] tabular-nums">{advanced.new_this_week}</p>
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${
                        advanced.trend_pct >= 0
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700'
                      }`}>
                        {advanced.trend_pct >= 0 ? '+' : ''}{advanced.trend_pct}%
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 tabular-nums">
                  Semana passada: {advanced.new_last_week}
                </p>
              </div>
            </div>

            {/* ── Atendentes + Tags ── */}
            <div className={`grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 transition-all duration-700 ease-out delay-[400ms] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

              {/* Performance por Atendente */}
              <div className="bg-white rounded-2xl p-4 lg:p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-[15px] font-semibold text-[#27273D]">Performance por Atendente</h2>
                    <p className="text-[12px] text-gray-400 mt-0.5">Leads atribuídos + mensagens (7d)</p>
                  </div>
                  <div className="w-9 h-9 bg-[#6366f1]/8 rounded-lg flex items-center justify-center">
                    <UserCheck className="w-4 h-4 text-[#6366f1]" />
                  </div>
                </div>

                {advanced.agents.length === 0 ? (
                  <div className="text-center py-6">
                    <UserX className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-[13px] text-gray-400">Nenhum lead atribuído ainda</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {advanced.agents.map((agent) => {
                      const pct = (agent.leads / maxAgentLeads) * 100;
                      return (
                        <div key={agent.user_id}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-[#6366f1]/15 flex items-center justify-center text-[#6366f1] text-[10px] font-bold">
                                {agent.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                              </div>
                              <span className="text-[13px] font-medium text-gray-700">{agent.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] text-gray-400 tabular-nums">{agent.messages_week} msg</span>
                              <span className="text-[12px] font-semibold text-[#6366f1] bg-[#6366f1]/10 px-2 py-0.5 rounded-md tabular-nums">
                                {agent.leads} leads
                              </span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#6366f1] rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}

                    {/* Não atribuídos */}
                    {advanced.unassigned_leads > 0 && (
                      <div className="pt-2 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-[10px] font-bold">
                              ?
                            </div>
                            <span className="text-[13px] text-gray-400">Sem atribuição</span>
                          </div>
                          <span className="text-[12px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md tabular-nums">
                            {advanced.unassigned_leads} leads
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Leads por Tag */}
              <div className="bg-white rounded-2xl p-4 lg:p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-[15px] font-semibold text-[#27273D]">Leads por Tag</h2>
                    <p className="text-[12px] text-gray-400 mt-0.5">Distribuição das tags mais usadas</p>
                  </div>
                  <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center">
                    <Hash className="w-4 h-4 text-purple-600" />
                  </div>
                </div>

                {advanced.tags.length === 0 ? (
                  <div className="text-center py-6">
                    <Hash className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-[13px] text-gray-400">Nenhuma tag utilizada</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {advanced.tags.map((tag) => {
                      const pct = (tag.count / maxTagCount) * 100;
                      const tc = tagColorMap[tag.color] || tagColorMap.blue;
                      return (
                        <div key={tag.name}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <Hash className="w-3 h-3 text-gray-400" />
                              <span className="text-[13px] text-gray-600">{tag.name}</span>
                            </div>
                            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${tc.bg} ${tc.text}`}>
                              {tag.count}
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ease-out ${
                                tag.color === 'green' ? 'bg-emerald-500' :
                                tag.color === 'red' ? 'bg-red-500' :
                                tag.color === 'purple' ? 'bg-purple-500' :
                                tag.color === 'amber' ? 'bg-amber-500' :
                                tag.color === 'pink' ? 'bg-pink-500' :
                                tag.color === 'cyan' ? 'bg-cyan-500' :
                                'bg-blue-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Resumo rodapé ── */}
        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 transition-all duration-700 ease-out delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {[
            { label: 'Mensagens hoje', value: stats.messages_today, icon: MessageSquare, color: 'text-[#6366f1]', bg: 'bg-[#6366f1]/8' },
            { label: 'Matriculados', value: stats.status_counts['convertido'] || 0, icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Em Matrícula', value: stats.status_counts['negociando'] || 0, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Qualificados', value: stats.status_counts['qualificado'] || 0, icon: Activity, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="bg-white rounded-2xl p-3 lg:p-4 border border-gray-100 flex items-center gap-3 lg:gap-4">
                <div className={`w-9 h-9 lg:w-10 lg:h-10 ${item.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 lg:w-[18px] lg:h-[18px] ${item.color}`} />
                </div>
                <div>
                  <p className={`text-lg lg:text-xl font-bold tabular-nums ${item.color}`}>{item.value}</p>
                  <p className="text-[11px] lg:text-[12px] text-gray-400">{item.label}</p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </AppLayout>
  );
}