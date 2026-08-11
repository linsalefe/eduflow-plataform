'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Download, FileSpreadsheet, Users, MessageSquare, GitBranch, Bot,
  Loader2, CheckCircle, Filter, Lock, Shuffle, AlertTriangle, Radio, ArrowDown,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';
import AppShell from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { AnimatedNumber } from '@/components/dashboard/animated-number';
import { chartTooltipStyle } from '@/lib/chart-config';
import api from '@/lib/api';
import { toast } from 'sonner';

/* ── Types (espelham GET /api/reports/overview) ───────────── */

type Granularity = 'daily' | 'weekly' | 'monthly';

interface Bucket { bucket: string; count: number }

type StageOutcome = 'won' | 'lost' | 'open';

interface AcquisitionFunnelRow {
  source: string;
  entered: number;
  /** contagem por key de coluna do pipeline; 'outros' agrupa status órfãos */
  stages: Record<string, number>;
  won: number;
  lost: number;
  open: number;
  win_rate: number;
}

interface Overview {
  period: { start: string; end: string; granularity: Granularity };
  leads_in: { total: number; series: Bucket[] };
  /** Canal de aquisição (de onde o lead veio). */
  leads_by_acquisition: { source: string; count: number }[];
  /** Breakdown técnico: instância/canal em que o contato foi criado. */
  leads_by_channel: {
    channel_id: number | null;
    channel_type: string;
    channel_name: string;
    count: number;
  }[];
  leads_by_program: { program: string; count: number }[];
  funnel_by_acquisition: {
    columns: { key: string; label: string; color: string; outcome: StageOutcome }[];
    rows: AcquisitionFunnelRow[];
    note: string;
  };
  leads_by_user: { user_id: number | null; user_name: string; count: number }[];
  pipeline_snapshot: {
    columns: { key: string; label: string; color: string; count: number; deal_value_sum: number }[];
    others: { count: number; deal_value_sum: number; statuses: string[] };
    by_channel: { channel_type: string; status_key: string; count: number }[];
    by_user: { user_id: number | null; status_key: string; count: number }[];
  };
  stage_movements: {
    coverage_note: string;
    total: number;
    series: Bucket[];
    top_transitions: { from: string; to: string; count: number }[];
    /** Ausente quando não houve nenhuma movimentação registrada no período. */
    by_acquisition?: { source: string; movements: number }[];
  };
  messages: {
    inbound: number;
    outbound: number;
    ai: number;
    manual_or_automation: number;
    series: { bucket: string; inbound: number; outbound: number }[];
  };
  phase2_placeholders: string[];
}

/* ── Datas — sempre no referencial America/Sao_Paulo ───────── */
/* O backend filtra em horário de SP; se usássemos o fuso do browser, um
   acesso de fora do Brasil deslocaria os presets em um dia. */

const SP_TZ = 'America/Sao_Paulo';

function todaySP(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SP_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtISO(d);
}

function isValidISO(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISO(s).getTime());
}

/** Rótulo curto do bucket, conforme a granularidade. */
function bucketLabel(iso: string, granularity: Granularity): string {
  const d = parseISO(iso);
  if (granularity === 'monthly') {
    const month = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'short' })
      .format(d).replace('.', '');
    return `${month}/${String(d.getUTCFullYear()).slice(2)}`;
  }
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })
    .format(d);
}

/* ── Presets de período ───────────────────────────────────── */

const PRESETS: { id: string; label: string; range: (today: string) => [string, string] }[] = [
  { id: 'hoje', label: 'Hoje', range: (t) => [t, t] },
  { id: '7d', label: '7 dias', range: (t) => [addDays(t, -6), t] },
  { id: '30d', label: '30 dias', range: (t) => [addDays(t, -29), t] },
  { id: 'mes', label: 'Este mês', range: (t) => [`${t.slice(0, 7)}-01`, t] },
];

const GRANULARITIES: { id: Granularity; label: string }[] = [
  { id: 'daily', label: 'Diário' },
  { id: 'weekly', label: 'Semanal' },
  { id: 'monthly', label: 'Mensal' },
];

const UNASSIGNED_COLOR = 'var(--muted-foreground)';
const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: '#25D366',
  instagram: '#E1306C',
  desconhecido: '#94a3b8',
};

/* Cores por canal de aquisição. As chaves espelham os valores que o backend
   deriva em `_contact_acquisition_sq`; qualquer outro valor (utm de campanha
   solta) cai no fallback. */
const ACQUISITION_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  facebook: '#1877F2',
  'meta ads': '#1877F2',
  manychat: '#00A6FF',
  'landing page': '#8B5CF6',
  'whatsapp direto': '#25D366',
  direto: '#25D366',
  desconhecido: '#94a3b8',
};

function acquisitionColor(source: string): string {
  return ACQUISITION_COLORS[source] ?? 'var(--primary)';
}

const PROGRAM_LABELS: Record<string, string> = {
  highschool: 'High School',
  camp: 'Camp',
};

/* Origens que não são informação de aquisição de verdade: são o fallback de
   quem entrou sem UTM e sem landing page. Um tenant só com essas origens não
   tem o que analisar aqui, e o card diz isso em vez de simular um insight. */
function isFallbackSource(source: string): boolean {
  return source === 'desconhecido' || / direto$/.test(source);
}

/** Intensidade da célula do heatmap. Raiz quadrada para que valores baixos
    ainda apareçam quando existe um outlier dominando o máximo. */
function heatAlpha(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return 0.06 + Math.sqrt(count / max) * 0.34;
}

const OUTCOME_LABELS: Record<StageOutcome, string> = {
  won: 'Ganho',
  lost: 'Perda',
  open: 'Em aberto',
};

/* ── Exports (mantidos da versão anterior) ────────────────── */

const reports = [
  {
    id: 'contacts',
    title: 'Relatório de Contatos',
    description: 'Todos os contatos com status, tags, atribuição, notas e contagem de mensagens.',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    endpoint: '/export/contacts',
    filters: ['status'] as string[],
  },
  {
    id: 'pipeline',
    title: 'Relatório do Pipeline',
    description: 'Funil de vendas com uma aba para cada etapa e resumo com percentuais.',
    icon: GitBranch,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    endpoint: '/export/pipeline',
    filters: [] as string[],
  },
  {
    id: 'messages',
    title: 'Relatório de Mensagens',
    description: 'Histórico de mensagens enviadas e recebidas com contato, tipo e conteúdo.',
    icon: MessageSquare,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    endpoint: '/export/messages',
    filters: ['days'] as string[],
  },
];

const daysOptions = [
  { value: 7, label: 'Últimos 7 dias' },
  { value: 14, label: 'Últimos 14 dias' },
  { value: 30, label: 'Últimos 30 dias' },
  { value: 60, label: 'Últimos 60 dias' },
  { value: 90, label: 'Últimos 90 dias' },
];

/* Cards que dependem de dados que o schema ainda não guarda. Não exibem
   número nenhum — inventar aqui seria pior do que não mostrar. */
const PHASE2_CARDS = [
  {
    id: 'atendimentos_por_sdr',
    title: 'Atendimentos por SDR',
    reason: 'As mensagens não registram qual atendente enviou.',
    icon: Users,
  },
  {
    id: 'tempo_por_sdr',
    title: 'Tempo de resposta por SDR',
    reason: 'Depende da mesma identificação de quem enviou.',
    icon: MessageSquare,
  },
  {
    id: 'ligacoes',
    title: 'Ligações',
    reason: 'O registro de chamadas ainda não está sendo gravado.',
    icon: Radio,
  },
];

/* ── Componente principal ─────────────────────────────────── */

export function RelatoriosContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const today = useMemo(() => todaySP(), []);
  const defaultRange = useMemo(() => PRESETS[2].range(today), [today]);

  const urlStart = searchParams.get('start');
  const urlEnd = searchParams.get('end');
  const urlGran = searchParams.get('gran');

  const start = isValidISO(urlStart) ? urlStart : defaultRange[0];
  const end = isValidISO(urlEnd) ? urlEnd : defaultRange[1];
  const granularity: Granularity =
    urlGran === 'weekly' || urlGran === 'monthly' || urlGran === 'daily' ? urlGran : 'daily';

  const rangeInvalid = start > end;

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* Aquisição = de onde o lead veio; instância = por qual canal/número ele
     entrou. São perguntas diferentes e o mesmo card serve as duas. */
  const [channelView, setChannelView] = useState<'acquisition' | 'instance'>('acquisition');
  const [acqSort, setAcqSort] = useState<'win_rate' | 'entered'>('win_rate');

  // Exports
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [daysFilter, setDaysFilter] = useState(7);

  /* Estado na URL — preserva outros params (ex.: ?tab= da página Marketing). */
  const setParams = useCallback(
    (next: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(next).forEach(([k, v]) => params.set(k, v));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const activePreset = useMemo(() => {
    const found = PRESETS.find((p) => {
      const [s, e] = p.range(today);
      return s === start && e === end;
    });
    return found?.id ?? null;
  }, [start, end, today]);

  useEffect(() => {
    if (rangeInvalid) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    api
      .get<Overview>('/reports/overview', { params: { start, end, granularity } })
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        const detail = err?.response?.data?.detail;
        const msg = typeof detail === 'string' ? detail : 'Erro ao carregar os indicadores';
        setLoadError(msg);
        setData(null);
        toast.error(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [start, end, granularity, rangeInvalid]);

  const handleDownload = async (report: typeof reports[0]) => {
    setDownloading(report.id);
    try {
      const params = new URLSearchParams();
      if (report.filters.includes('status') && statusFilter) params.append('status', statusFilter);
      if (report.filters.includes('days')) params.append('days', daysFilter.toString());
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

  /* ── Derivações de exibição ─────────────────────────────── */

  const leadsSeries = useMemo(
    () => (data?.leads_in.series ?? []).map((b) => ({ ...b, label: bucketLabel(b.bucket, granularity) })),
    [data, granularity],
  );

  const movementsSeries = useMemo(
    () => (data?.stage_movements.series ?? []).map((b) => ({ ...b, label: bucketLabel(b.bucket, granularity) })),
    [data, granularity],
  );

  /* Agrupa canais por tipo (categoria) para as barras; os nomes das
     instâncias ficam no tooltip. */
  const channelBars = useMemo(() => {
    const byType = new Map<string, { type: string; count: number; names: string[] }>();
    (data?.leads_by_channel ?? []).forEach((c) => {
      const entry = byType.get(c.channel_type) ?? { type: c.channel_type, count: 0, names: [] };
      entry.count += c.count;
      entry.names.push(`${(c.channel_name || '').trim() || 'Sem nome'} (${c.count})`);
      byType.set(c.channel_type, entry);
    });
    return Array.from(byType.values()).sort((a, b) => b.count - a.count);
  }, [data]);

  /* ── Canal de aquisição ──────────────────────────────────── */

  const acquisitionBars = useMemo(
    () =>
      (data?.leads_by_acquisition ?? []).map((a) => ({
        ...a,
        color: acquisitionColor(a.source),
      })),
    [data],
  );

  /* Todas as origens do período são fallback => o tenant não tem rastreio de
     aquisição. O card avisa em vez de exibir uma barra única sem significado. */
  const acquisitionUntracked = useMemo(
    () => acquisitionBars.length > 0 && acquisitionBars.every((a) => isFallbackSource(a.source)),
    [acquisitionBars],
  );

  const programRows = useMemo(
    () => (data?.leads_by_program ?? []).filter((p) => p.program !== 'nenhum' && p.count > 0),
    [data],
  );

  /* Colunas da matriz: as do pipeline, mais 'outros' só quando alguma linha
     tem status órfão — senão a tabela ganha uma coluna sempre vazia. */
  const acqColumns = useMemo(() => {
    const cols = data?.funnel_by_acquisition?.columns ?? [];
    const rows = data?.funnel_by_acquisition?.rows ?? [];
    const hasOthers = rows.some((r) => (r.stages?.outros ?? 0) > 0);
    return hasOthers
      ? [...cols, { key: 'outros', label: 'Outros', color: '#94a3b8', outcome: 'open' as StageOutcome }]
      : cols;
  }, [data]);

  const acqRows = useMemo(() => {
    const rows = [...(data?.funnel_by_acquisition?.rows ?? [])];
    rows.sort((a, b) =>
      acqSort === 'entered'
        ? b.entered - a.entered || b.win_rate - a.win_rate
        : b.win_rate - a.win_rate || b.entered - a.entered,
    );
    return rows;
  }, [data, acqSort]);

  /* Máximo global da matriz — a intensidade compara células entre si, não
     dentro da linha, para que um canal grande não pareça igual a um pequeno. */
  const acqCellMax = useMemo(
    () =>
      acqRows.reduce(
        (max, r) => acqColumns.reduce((m, c) => Math.max(m, r.stages?.[c.key] ?? 0), max),
        0,
      ),
    [acqRows, acqColumns],
  );

  const movementsBySource = useMemo(() => {
    const map = new Map<string, number>();
    (data?.stage_movements.by_acquisition ?? []).forEach((m) => map.set(m.source, m.movements));
    return map;
  }, [data]);

  const userBars = useMemo(
    () =>
      (data?.leads_by_user ?? []).map((u) => ({
        name: (u.user_name || '').trim() || `#${u.user_id}`,
        count: u.count,
        unassigned: u.user_id === null,
      })),
    [data],
  );

  const funnelRows = useMemo(() => {
    if (!data) return [];
    const rows = data.pipeline_snapshot.columns.map((c) => ({
      key: c.key,
      label: c.label,
      color: c.color,
      count: c.count,
      isOthers: false as boolean,
      statuses: [] as string[],
    }));
    const others = data.pipeline_snapshot.others;
    if (others.count > 0 || others.statuses.length > 0) {
      rows.push({
        key: '__outros__',
        label: 'Outros',
        color: '#94a3b8',
        count: others.count,
        isOthers: true,
        statuses: others.statuses,
      });
    }
    return rows;
  }, [data]);

  const funnelMax = useMemo(
    () => funnelRows.reduce((max, r) => Math.max(max, r.count), 0),
    [funnelRows],
  );

  const aiPct = useMemo(() => {
    if (!data) return 0;
    const total = data.messages.ai + data.messages.manual_or_automation;
    return total > 0 ? Math.round((data.messages.ai / total) * 100) : 0;
  }, [data]);

  const leadsEmpty = !loading && data !== null && data.leads_in.total === 0;
  const messagesEmpty = !loading && data !== null && data.messages.inbound + data.messages.outbound === 0;

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <TooltipProvider delayDuration={200}>
      <div className="max-w-7xl mx-auto space-y-6 pb-8">
        {/* ── Header + filtros ────────────────────────────── */}
        <div className="space-y-4">
          <div>
            <h1 className="text-xl lg:text-2xl font-semibold text-foreground">Relatórios</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Indicadores por período, funil e exportações.
            </p>
          </div>

          <Card className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              {/* Presets + range custom */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => {
                    const isActive = activePreset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          const [s, e] = p.range(today);
                          setParams({ start: s, end: e });
                        }}
                        className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">De</span>
                    <input
                      type="date"
                      value={start}
                      max="2100-12-31"
                      onChange={(e) => e.target.value && setParams({ start: e.target.value })}
                      className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">Até</span>
                    <input
                      type="date"
                      value={end}
                      max="2100-12-31"
                      onChange={(e) => e.target.value && setParams({ end: e.target.value })}
                      className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                </div>
              </div>

              {/* Granularidade */}
              <div className="flex gap-1.5">
                {GRANULARITIES.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setParams({ gran: g.id })}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                      granularity === g.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {rangeInvalid && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                A data inicial não pode ser posterior à data final. Ajuste o período para ver os indicadores.
              </div>
            )}
          </Card>
        </div>

        {/* ── 1. KPIs ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-3 w-24 mb-3" />
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-3 w-28" />
              </Card>
            ))
          ) : data ? (
            <>
              <KpiCard
                icon={Users}
                label="Leads no período"
                value={data.leads_in.total}
                sub="Contatos criados no intervalo"
                accent="text-blue-600"
                bg="bg-blue-50"
              />
              <KpiCard
                icon={MessageSquare}
                label="Mensagens"
                value={data.messages.inbound + data.messages.outbound}
                sub={`${data.messages.inbound.toLocaleString('pt-BR')} recebidas · ${data.messages.outbound.toLocaleString('pt-BR')} enviadas`}
                accent="text-emerald-600"
                bg="bg-emerald-50"
              />
              <KpiCard
                icon={Bot}
                label="Enviadas pela IA"
                value={aiPct}
                suffix="%"
                sub={`${data.messages.ai.toLocaleString('pt-BR')} IA · ${data.messages.manual_or_automation.toLocaleString('pt-BR')} Manual/Automação`}
                accent="text-purple-600"
                bg="bg-purple-50"
              />
              <KpiCard
                icon={Shuffle}
                label="Movimentações de etapa"
                value={data.stage_movements.total}
                sub="Cobertura parcial"
                accent="text-amber-600"
                bg="bg-amber-50"
              />
            </>
          ) : null}
        </div>

        {/* ── 2. Leads ao longo do tempo ──────────────────── */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-foreground">Leads novos</h2>
            <span className="text-[12px] text-muted-foreground">
              {GRANULARITIES.find((g) => g.id === granularity)?.label}
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : leadsEmpty ? (
            <EmptyBlock message="Nenhum lead novo neste período." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={leadsSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  minTickGap={16}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={36}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                />
                <RTooltip
                  contentStyle={chartTooltipStyle.contentStyle}
                  labelStyle={chartTooltipStyle.labelStyle}
                  itemStyle={chartTooltipStyle.itemStyle}
                  formatter={(value: number) => [value, 'Leads']}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#leadsGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* ── 3. Canal de aquisição | Responsável ─────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-foreground">
                {channelView === 'acquisition' ? 'Leads por canal de aquisição' : 'Leads por instância'}
              </h2>
              <div className="flex gap-1">
                {([
                  ['acquisition', 'Aquisição'],
                  ['instance', 'Instância'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setChannelView(id)}
                    className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
                      channelView === id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground mb-4">
              {channelView === 'acquisition'
                ? 'De onde o lead veio: UTM da landing page, origem registrada na criação e, na falta das duas, o canal de entrada.'
                : 'Instância/número em que o contato foi criado — não necessariamente onde é atendido hoje.'}
            </p>

            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : channelView === 'instance' ? (
              channelBars.length === 0 ? (
                <EmptyBlock message="Nenhum lead novo neste período." />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(160, channelBars.length * 56)}>
                  <BarChart data={channelBars} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="type"
                      axisLine={false}
                      tickLine={false}
                      width={90}
                      tick={{ fontSize: 12, fill: 'var(--foreground)' }}
                    />
                    <RTooltip
                      cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                      contentStyle={chartTooltipStyle.contentStyle}
                      labelStyle={chartTooltipStyle.labelStyle}
                      formatter={(value: number, _n, item) => [
                        `${value} — ${(item?.payload?.names ?? []).join(', ')}`,
                        'Leads',
                      ]}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={22}>
                      {channelBars.map((c) => (
                        <Cell key={c.type} fill={CHANNEL_COLORS[c.type] ?? 'var(--primary)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            ) : acquisitionBars.length === 0 ? (
              <EmptyBlock message="Nenhum lead novo neste período." />
            ) : (
              <>
                {acquisitionUntracked && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <p className="text-[12px] leading-relaxed text-muted-foreground">
                      Nenhum lead deste período traz origem rastreada — não há UTM de campanha
                      nem registro de landing page. O que aparece abaixo é só o canal de entrada.
                    </p>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={Math.max(160, acquisitionBars.length * 44)}>
                  <BarChart data={acquisitionBars} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="source"
                      axisLine={false}
                      tickLine={false}
                      width={110}
                      tick={{ fontSize: 12, fill: 'var(--foreground)' }}
                    />
                    <RTooltip
                      cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                      contentStyle={chartTooltipStyle.contentStyle}
                      labelStyle={chartTooltipStyle.labelStyle}
                      formatter={(value: number) => [value, 'Leads']}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20}>
                      {acquisitionBars.map((a) => (
                        <Cell key={a.source} fill={a.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-[15px] font-semibold text-foreground mb-1">Leads por responsável</h2>
            <p className="text-[12px] text-muted-foreground mb-4">
              Baseado na atribuição do lead. Leads sem responsável aparecem em cinza.
            </p>
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : userBars.length === 0 ? (
              <EmptyBlock message="Nenhum lead novo neste período." />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, userBars.length * 44)}>
                <BarChart data={userBars} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    width={110}
                    tick={{ fontSize: 12, fill: 'var(--foreground)' }}
                  />
                  <RTooltip
                    cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                    contentStyle={chartTooltipStyle.contentStyle}
                    labelStyle={chartTooltipStyle.labelStyle}
                    formatter={(value: number) => [value, 'Leads']}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={18}>
                    {userBars.map((u, i) => (
                      <Cell key={`${u.name}-${i}`} fill={u.unassigned ? UNASSIGNED_COLOR : 'var(--primary)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        {/* ── 3b. Programa (só quando o tenant usa LPs de programa) ── */}
        {!loading && programRows.length > 0 && (
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold text-foreground mb-1">Leads por programa</h2>
            <p className="text-[12px] text-muted-foreground mb-3">
              Programa da landing page que originou o lead. É uma dimensão separada do canal
              de aquisição — um lead de High School pode ter vindo por qualquer canal.
            </p>
            <div className="flex flex-wrap gap-2">
              {programRows.map((p) => (
                <div
                  key={p.program}
                  className="flex items-baseline gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
                >
                  <span className="text-[13px] text-foreground">
                    {PROGRAM_LABELS[p.program] ?? p.program}
                  </span>
                  <span className="text-[15px] font-semibold tabular-nums text-foreground">
                    {p.count.toLocaleString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── 3c. Funil por canal de aquisição (matriz) ───── */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 className="text-[15px] font-semibold text-foreground">Funil por canal de aquisição</h2>
            <Badge variant="secondary">Etapa atual (snapshot)</Badge>
          </div>
          <p className="text-[12px] text-muted-foreground mb-4">
            Leads que <strong className="font-medium text-foreground">entraram no período</strong>,
            cruzados com a etapa em que estão <strong className="font-medium text-foreground">hoje</strong>.
            Não é o caminho percorrido: um lead aparece só na etapa atual dele.
          </p>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : acqColumns.length === 0 ? (
            <EmptyBlock message="Nenhuma etapa configurada no pipeline deste tenant." />
          ) : acqRows.length === 0 ? (
            <EmptyBlock message="Nenhum lead novo neste período." />
          ) : (
            <>
              {acquisitionUntracked && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    Este tenant ainda não rastreia origem de aquisição, então a tabela tem uma
                    linha só. A distribuição por etapa continua válida; a comparação entre
                    canais, não.
                  </p>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-medium text-muted-foreground">
                        Canal
                      </th>
                      <SortableTh
                        label="Entrada"
                        active={acqSort === 'entered'}
                        onClick={() => setAcqSort('entered')}
                      />
                      {acqColumns.map((c) => (
                        <th
                          key={c.key}
                          className="px-2 py-2 text-center font-medium text-muted-foreground"
                        >
                          <span className="flex items-center justify-center gap-1.5">
                            <span
                              className="inline-block h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: c.color }}
                            />
                            <span className="max-w-[110px] truncate" title={c.label}>{c.label}</span>
                          </span>
                          <span className="mt-0.5 block text-[10px] font-normal uppercase tracking-wide opacity-70">
                            {OUTCOME_LABELS[c.outcome]}
                          </span>
                        </th>
                      ))}
                      {movementsBySource.size > 0 && (
                        <th className="px-2 py-2 text-right font-medium text-muted-foreground">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help underline decoration-dotted">Movim.</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              Mudanças de etapa registradas no período. Cobertura parcial: só o que
                              foi movido manualmente no CRM.
                            </TooltipContent>
                          </Tooltip>
                        </th>
                      )}
                      <SortableTh
                        label="Conversão"
                        active={acqSort === 'win_rate'}
                        onClick={() => setAcqSort('win_rate')}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {acqRows.map((r) => (
                      <tr key={r.source} className="border-b border-border/60 last:border-0">
                        <td className="sticky left-0 z-10 bg-card px-2 py-2">
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: acquisitionColor(r.source) }}
                            />
                            <span className="truncate text-foreground" title={r.source}>{r.source}</span>
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums text-foreground">
                          {r.entered.toLocaleString('pt-BR')}
                        </td>
                        {acqColumns.map((c) => {
                          const n = r.stages?.[c.key] ?? 0;
                          return (
                            <td key={c.key} className="px-1 py-1 text-center">
                              <span
                                className={`block rounded-md py-1.5 tabular-nums ${
                                  n > 0 ? 'text-foreground' : 'text-muted-foreground/50'
                                }`}
                                style={
                                  n > 0
                                    ? {
                                        backgroundColor: `color-mix(in srgb, ${c.color} ${
                                          heatAlpha(n, acqCellMax) * 100
                                        }%, transparent)`,
                                      }
                                    : undefined
                                }
                              >
                                {n > 0 ? n.toLocaleString('pt-BR') : '—'}
                              </span>
                            </td>
                          );
                        })}
                        {movementsBySource.size > 0 && (
                          <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                            {(movementsBySource.get(r.source) ?? 0).toLocaleString('pt-BR')}
                          </td>
                        )}
                        <td className="px-2 py-2 text-right">
                          <span className="block font-semibold tabular-nums text-foreground">
                            {(r.win_rate * 100).toFixed(1).replace('.', ',')}%
                          </span>
                          <span className="block text-[11px] tabular-nums text-muted-foreground">
                            {r.won} ganho{r.won === 1 ? '' : 's'} · {r.lost} perdido
                            {r.lost === 1 ? '' : 's'} · {r.open} aberto{r.open === 1 ? '' : 's'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Ganho e perda são inferidos do nome de cada etapa do pipeline — o sistema não tem
                um campo próprio para isso. Se alguma etapa estiver classificada errado acima,
                renomeá-la corrige a conta.
              </p>
            </>
          )}
        </Card>

        {/* ── 4. Funil (snapshot) ─────────────────────────── */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 className="text-[15px] font-semibold text-foreground">Funil do pipeline</h2>
            <Badge variant="secondary">Snapshot atual</Badge>
          </div>
          <p className="text-[12px] text-muted-foreground mb-4">
            Estado atual de todos os leads do funil — não filtrado pelo período selecionado.
          </p>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : funnelRows.length === 0 ? (
            <EmptyBlock message="Nenhuma etapa configurada no pipeline deste tenant." />
          ) : (
            <div className={`space-y-2 ${funnelRows.length > 12 ? 'max-h-[520px] overflow-y-auto pr-1' : ''}`}>
              {funnelRows.map((row) => {
                const pct = funnelMax > 0 ? (row.count / funnelMax) * 100 : 0;
                const bar = (
                  <div className="flex items-center gap-3">
                    <span className="w-[38%] shrink-0 truncate text-[13px] text-foreground" title={row.label}>
                      {row.label}
                    </span>
                    <div className="h-6 flex-1 rounded-md bg-muted overflow-hidden">
                      <motion.div
                        className="h-full rounded-md"
                        style={{ backgroundColor: row.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-[13px] font-semibold tabular-nums text-foreground">
                      {row.count.toLocaleString('pt-BR')}
                    </span>
                  </div>
                );

                if (!row.isOthers) return <div key={row.key}>{bar}</div>;

                return (
                  <Tooltip key={row.key}>
                    <TooltipTrigger asChild>
                      <div className="cursor-help border-t border-border pt-2">{bar}</div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      {row.statuses.length > 0
                        ? `Status fora das colunas do pipeline: ${row.statuses.join(', ')}`
                        : 'Nenhum status fora das colunas do pipeline.'}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── 5. Movimentações de etapa ───────────────────── */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 className="text-[15px] font-semibold text-foreground">Movimentações de etapa</h2>
            <Badge variant="outline">Cobertura parcial</Badge>
          </div>
          <p className="text-[12px] text-muted-foreground mb-4">
            Só mudanças feitas manualmente no CRM são registradas. Movimentações por automações,
            chatbot e agentes não aparecem aqui.
          </p>
          {loading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : !data || data.stage_movements.total === 0 ? (
            <EmptyBlock message="Nenhuma movimentação registrada neste período." />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={movementsSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    minTickGap={16}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={36}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  />
                  <RTooltip
                    cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                    contentStyle={chartTooltipStyle.contentStyle}
                    labelStyle={chartTooltipStyle.labelStyle}
                    formatter={(value: number) => [value, 'Movimentações']}
                  />
                  <Bar dataKey="count" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              <div>
                <p className="text-[12px] font-medium text-muted-foreground mb-2">
                  Transições mais frequentes
                </p>
                <div className="space-y-1.5">
                  {data.stage_movements.top_transitions.map((t) => (
                    <div key={`${t.from}->${t.to}`} className="flex items-center gap-2 text-[13px]">
                      <span className="truncate text-muted-foreground">{t.from}</span>
                      <span className="text-muted-foreground/60">→</span>
                      <span className="truncate text-foreground">{t.to}</span>
                      <span className="ml-auto shrink-0 font-semibold tabular-nums text-foreground">
                        {t.count.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* ── 6. Fase 2 ───────────────────────────────────── */}
        <div>
          <h2 className="text-[15px] font-semibold text-foreground mb-3">Em breve</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PHASE2_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.id} className="p-4 opacity-60" aria-disabled="true">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[13px] font-medium text-foreground">{card.title}</p>
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                        {card.reason}
                      </p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1.5">
                        Requer atualização de dados (Fase 2)
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* ── 7. Exportações ──────────────────────────────── */}
        <div>
          <h2 className="text-[15px] font-semibold text-foreground mb-3">Exportar relatórios</h2>
          <div className="space-y-4">
            {reports.map((report) => {
              const Icon = report.icon;
              const isDownloading = downloading === report.id;
              const isDownloaded = downloaded.includes(report.id);

              return (
                <Card key={report.id} className="p-5 transition-all hover:shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="flex flex-1 items-start gap-4">
                      <div className={`h-11 w-11 ${report.bg} flex shrink-0 items-center justify-center rounded-xl`}>
                        <Icon className={`h-5 w-5 ${report.color}`} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-[15px] font-semibold text-foreground">{report.title}</h3>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                          {report.description}
                        </p>

                        {report.filters.length > 0 && (
                          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                            {report.filters.includes('status') && (
                              <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                              >
                                <option value="">Todos os status</option>
                                {(data?.pipeline_snapshot.columns ?? []).map((c) => (
                                  <option key={c.key} value={c.key}>{c.label}</option>
                                ))}
                              </select>
                            )}
                            {report.filters.includes('days') && (
                              <select
                                value={daysFilter}
                                onChange={(e) => setDaysFilter(Number(e.target.value))}
                                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                              >
                                {daysOptions.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
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
                      className={`flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-medium transition-all ${
                        isDownloading
                          ? 'cursor-not-allowed bg-muted text-muted-foreground'
                          : isDownloaded
                            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                      }`}
                    >
                      {isDownloading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" />Gerando...</>
                      ) : isDownloaded ? (
                        <><CheckCircle className="h-4 w-4" />Baixado</>
                      ) : (
                        <><Download className="h-4 w-4" />Exportar Excel</>
                      )}
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[13px] font-medium text-foreground">Formato dos relatórios</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  Os relatórios são gerados em formato Excel (.xlsx) com cabeçalhos coloridos,
                  linhas alternadas e múltiplas abas. Compatível com Excel, Google Sheets e
                  LibreOffice.
                </p>
              </div>
            </div>
          </div>
        </div>

        {loadError && !loading && (
          <p className="text-[12px] text-destructive">{loadError}</p>
        )}
        {messagesEmpty && !loading && (
          <p className="text-[12px] text-muted-foreground">
            Sem mensagens registradas no período selecionado.
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}

export default function RelatoriosPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando...</div>}>
        <RelatoriosContent />
      </Suspense>
    </AppShell>
  );
}

/* ── Sub-componentes ──────────────────────────────────────── */

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  suffix,
  accent,
  bg,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sub?: string;
  suffix?: string;
  accent: string;
  bg: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <Card className="p-4">
        <div className="flex items-start justify-between">
          <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}>
            <Icon className={`h-4 w-4 ${accent}`} />
          </div>
        </div>
        <p className="mt-2 text-[28px] font-bold leading-none tabular-nums text-foreground">
          <AnimatedNumber value={value} />
          {suffix}
        </p>
        {sub && <p className="mt-2 text-[11px] text-muted-foreground">{sub}</p>}
      </Card>
    </motion.div>
  );
}

/** Cabeçalho de coluna clicável da matriz de aquisição. */
function SortableTh({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <th className="px-2 py-2 text-right font-medium text-muted-foreground">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
          active ? 'text-foreground' : ''
        }`}
      >
        {label}
        <ArrowDown className={`h-3 w-3 ${active ? 'opacity-100' : 'opacity-0'}`} />
      </button>
    </th>
  );
}

function EmptyBlock({ message }: { message: string }) {
  return (
    <div className="flex h-[160px] items-center justify-center rounded-lg border border-dashed border-border">
      <p className="text-[13px] text-muted-foreground">{message}</p>
    </div>
  );
}
