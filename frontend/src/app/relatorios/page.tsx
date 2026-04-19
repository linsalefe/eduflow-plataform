'use client';

import { useState, useEffect } from 'react';
import {
  Download, FileSpreadsheet, Users, UserPlus, MessageSquare,
  TrendingUp, GitBranch, Bot, Clock, CheckCircle2,
  Loader2, CheckCircle, Filter, ArrowUpRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import AppShell from '@/components/app-shell';
import api from '@/lib/api';
import { toast } from 'sonner';

/* ── Types ────────────────────────────────────────────────── */

interface DashboardStats {
  total_contacts: number;
  new_today: number;
  messages_today: number;
  inbound_today: number;
  outbound_today: number;
  messages_week: number;
  status_counts: Record<string, number>;
  daily_messages: { date: string; day: string; count: number }[];
}

interface KanbanStats {
  total: number;
  em_atendimento_ia: number;
  aguardando_humano: number;
  finalizado: number;
  human_took_over: number;
}

/* ── Pipeline config ──────────────────────────────────────── */

const pipelineStages: { key: string; label: string; color: string }[] = [
  { key: 'novo', label: 'Novo', color: '#6366f1' },
  { key: 'em_contato', label: 'Em Contato', color: '#f59e0b' },
  { key: 'qualificado', label: 'Qualificado', color: '#8b5cf6' },
  { key: 'em_matricula', label: 'Em Matrícula', color: '#06b6d4' },
  { key: 'negociando', label: 'Negociando', color: '#06b6d4' },
  { key: 'matriculado', label: 'Matriculado', color: '#10b981' },
  { key: 'convertido', label: 'Convertido', color: '#10b981' },
  { key: 'perdido', label: 'Perdido', color: '#ef4444' },
];

/* ── Export reports config ────────────────────────────────── */

const reports = [
  {
    id: 'contacts',
    title: 'Relatório de Contatos',
    description: 'Todos os contatos com status, tags, atribuição, notas e contagem de mensagens.',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    endpoint: '/export/contacts',
    filters: ['status'],
  },
  {
    id: 'pipeline',
    title: 'Relatório do Pipeline',
    description: 'Funil de vendas com uma aba para cada etapa e resumo com percentuais.',
    icon: GitBranch,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    endpoint: '/export/pipeline',
    filters: [],
  },
  {
    id: 'messages',
    title: 'Relatório de Mensagens',
    description: 'Histórico de mensagens enviadas e recebidas com contato, tipo e conteúdo.',
    icon: MessageSquare,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    endpoint: '/export/messages',
    filters: ['days'],
  },
];

const statusOptions = [
  { value: '', label: 'Todos os status' },
  { value: 'novo', label: 'Novo Lead' },
  { value: 'em_contato', label: 'Em Contato' },
  { value: 'qualificado', label: 'Qualificado' },
  { value: 'negociando', label: 'Em Negociação' },
  { value: 'convertido', label: 'Convertido' },
  { value: 'perdido', label: 'Perdido' },
];

const daysOptions = [
  { value: 7, label: 'Últimos 7 dias' },
  { value: 14, label: 'Últimos 14 dias' },
  { value: 30, label: 'Últimos 30 dias' },
  { value: 60, label: 'Últimos 60 dias' },
  { value: 90, label: 'Últimos 90 dias' },
];

/* ── Component ────────────────────────────────────────────── */

export function RelatoriosContent() {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [kanban, setKanban] = useState<KanbanStats | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [daysFilter, setDaysFilter] = useState(7);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/stats'),
      api.get('/kanban/stats'),
    ])
      .then(([dashRes, kanbanRes]) => {
        setDashboard(dashRes.data);
        setKanban(kanbanRes.data);
      })
      .catch(() => {
        toast.error('Erro ao carregar dados dos relatórios');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async (report: typeof reports[0]) => {
    setDownloading(report.id);
    try {
      const params = new URLSearchParams();
      if (report.filters.includes('status') && statusFilter) {
        params.append('status', statusFilter);
      }
      if (report.filters.includes('days')) {
        params.append('days', daysFilter.toString());
      }
      const url = `${report.endpoint}${params.toString() ? '?' + params.toString() : ''}`;
      const response = await api.get(url, { responseType: 'blob' });

      const contentDisposition = response.headers['content-disposition'];
      let filename = `relatorio_${report.id}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename=(.+)/);
        if (match) filename = match[1];
      }

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setDownloaded((prev) => [...prev.filter((id) => id !== report.id), report.id]);
      toast.success(`${report.title} baixado com sucesso`);
    } catch {
      toast.error('Erro ao gerar relatório');
    } finally {
      setDownloading(null);
    }
  };

  const totalPipeline = dashboard
    ? Object.values(dashboard.status_counts).reduce((a, b) => a + b, 0)
    : 0;

  /* ── Skeleton ─────────────────────────────────────────── */

  const Skeleton = ({ className = '' }: { className?: string }) => (
    <div className={`animate-pulse bg-gray-200 rounded-xl ${className}`} />
  );

  /* ── Render ───────────────────────────────────────────── */

  return (
      <div className="max-w-6xl mx-auto space-y-8 pb-8">
        {/* Header */}
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold text-foreground">Relatórios</h1>
          <p className="text-sm text-gray-400 mt-1">
            Acompanhe métricas, funil e exporte dados da plataforma.
          </p>
        </div>

        {/* ── Seção 1: KPIs ──────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))
          ) : dashboard ? (
            <>
              <KpiCard
                icon={Users}
                label="Total de Contatos"
                value={dashboard.total_contacts}
                color="blue"
              />
              <KpiCard
                icon={UserPlus}
                label="Novos Hoje"
                value={dashboard.new_today}
                color="green"
              />
              <KpiCard
                icon={MessageSquare}
                label="Mensagens Hoje"
                value={dashboard.messages_today}
                color="purple"
                sub={`${dashboard.inbound_today} recebidas · ${dashboard.outbound_today} enviadas`}
              />
              <KpiCard
                icon={TrendingUp}
                label="Mensagens na Semana"
                value={dashboard.messages_week}
                color="amber"
              />
            </>
          ) : null}
        </div>

        {/* ── Seção 2: Pipeline ──────────────────────────── */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">Pipeline</h2>
          {loading ? (
            <Skeleton className="h-32" />
          ) : dashboard ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {pipelineStages.map((stage) => {
                const count = dashboard.status_counts[stage.key] ?? 0;
                const pct = totalPipeline > 0 ? (count / totalPipeline) * 100 : 0;
                return (
                  <div
                    key={stage.key}
                    className="bg-white rounded-2xl border border-gray-100 p-4"
                  >
                    <p className="text-2xl font-bold" style={{ color: stage.color }}>
                      {count}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{stage.label}</p>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: stage.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* ── Seção 3: Conversas IA ──────────────────────── */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">Conversas IA</h2>
          {loading ? (
            <Skeleton className="h-24" />
          ) : kanban ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <MiniCard
                icon={Bot}
                label="Em Atendimento IA"
                value={kanban.em_atendimento_ia}
                color="blue"
              />
              <MiniCard
                icon={Clock}
                label="Aguardando Humano"
                value={kanban.aguardando_humano}
                color="amber"
              />
              <MiniCard
                icon={CheckCircle2}
                label="Finalizados"
                value={kanban.finalizado}
                color="green"
              />
            </div>
          ) : null}
          {kanban && (
            <p className="text-xs text-gray-400 mt-2">
              <ArrowUpRight className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
              Humano assumiu: <span className="font-medium text-gray-600">{kanban.human_took_over}</span>
            </p>
          )}
        </div>

        {/* ── Seção 4: Gráfico de Mensagens ──────────────── */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">
            Mensagens — Últimos 7 dias
          </h2>
          {loading ? (
            <Skeleton className="h-[280px]" />
          ) : dashboard?.daily_messages ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dashboard.daily_messages}>
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 12, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 12,
                      fontSize: 13,
                    }}
                    labelFormatter={(label) => `${label}`}
                    formatter={(value: number) => [value, 'Mensagens']}
                  />
                  <Bar dataKey="count" fill="#1D4ED8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>

        {/* ── Seção 5: Exportar Relatórios ────────────────── */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">Exportar Relatórios</h2>
          <div className="space-y-4">
            {reports.map((report) => {
              const Icon = report.icon;
              const isDownloading = downloading === report.id;
              const isDownloaded = downloaded.includes(report.id);

              return (
                <div
                  key={report.id}
                  className="bg-white rounded-2xl border border-gray-100 p-5 lg:p-6 hover:border-gray-200 hover:shadow-sm transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div
                        className={`w-11 h-11 ${report.bg} rounded-xl flex items-center justify-center flex-shrink-0`}
                      >
                        <Icon className={`w-5 h-5 ${report.color}`} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-[15px] font-semibold text-foreground">
                          {report.title}
                        </h3>
                        <p className="text-[13px] text-gray-400 mt-0.5 leading-relaxed">
                          {report.description}
                        </p>

                        {report.filters.length > 0 && (
                          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                            <Filter className="w-3.5 h-3.5 text-gray-400" />
                            {report.filters.includes('status') && (
                              <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="text-[12px] px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-primary"
                              >
                                {statusOptions.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            )}
                            {report.filters.includes('days') && (
                              <select
                                value={daysFilter}
                                onChange={(e) => setDaysFilter(Number(e.target.value))}
                                className="text-[12px] px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-primary"
                              >
                                {daysOptions.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDownload(report)}
                      disabled={isDownloading}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium transition-all flex-shrink-0 ${
                        isDownloading
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : isDownloaded
                            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            : 'bg-primary text-white hover:bg-primary/90'
                      }`}
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Gerando...
                        </>
                      ) : isDownloaded ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Baixado
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Exportar Excel
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mt-4">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-medium text-gray-600">Formato dos relatórios</p>
                <p className="text-[12px] text-gray-400 mt-1 leading-relaxed">
                  Os relatórios são gerados em formato Excel (.xlsx) com cabeçalhos coloridos,
                  linhas alternadas e múltiplas abas. Compatível com Excel, Google Sheets e
                  LibreOffice.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}

export default function RelatoriosPage() {
  return (
    <AppShell>
      <RelatoriosContent />
    </AppShell>
  );
}

/* ── Sub-components ───────────────────────────────────────── */

const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   icon: 'text-blue-600' },
  green:  { bg: 'bg-green-50',  text: 'text-green-700',  icon: 'text-green-600' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-600' },
  amber:  { bg: 'bg-amber-50',  text: 'text-amber-700',  icon: 'text-amber-600' },
};

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
  sub?: string;
}) {
  const c = colorMap[color] ?? colorMap.blue;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
        <div>
          <p className={`text-2xl font-bold ${c.text}`}>{value.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
      {sub && <p className="text-[11px] text-gray-400 mt-2">{sub}</p>}
    </div>
  );
}

function MiniCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  const c = colorMap[color] ?? colorMap.blue;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
      <div className={`w-9 h-9 ${c.bg} rounded-lg flex items-center justify-center`}>
        <Icon className={`w-4 h-4 ${c.icon}`} />
      </div>
      <div>
        <p className={`text-xl font-bold ${c.text}`}>{value}</p>
        <p className="text-[11px] text-gray-500">{label}</p>
      </div>
    </div>
  );
}
