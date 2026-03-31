'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import AppShell from '@/components/app-shell';
import { toast } from 'sonner';
import api from '@/lib/api';
import {
  PhoneCall, PhoneOff, PhoneForwarded, Calendar, Clock, TrendingUp,
  BarChart3, Activity, Target, RefreshCw, Filter,
  MessageSquare, Zap, Award, X, Users,
} from 'lucide-react';
import { KPICard } from '@/components/dashboard/kpi-card';
import CampaignTab from '@/components/voice-ai/campaign-tab';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

// ============================================================
// TYPES
// ============================================================

interface DashboardData {
  period_days: number;
  total_calls: number;
  answered_calls: number;
  answer_rate: number;
  avg_score: number;
  avg_latency_ms: number;
  avg_duration_seconds: number;
  outcomes: Record<string, number>;
  daily: { date: string; total: number; scheduled: number; qualified: number }[];
  by_course: { course: string; total: number; avg_score: number }[];
}

interface CallData {
  id: number;
  campaign: string | null;
  lead_name: string;
  to_number: string;
  course: string;
  status: string;
  fsm_state: string;
  outcome: string;
  score: number;
  duration_seconds: number;
  total_turns: number;
  avg_latency_ms: number;
  attempt_number: number;
  handoff_type: string;
  summary: string;
  collected_fields: Record<string, string>;
  objections: string[];
  tags: string[];
  started_at: string;
  ended_at: string;
  created_at: string;
}

interface CallDetail {
  call: CallData;
  transcript: {
    role: string;
    text: string;
    state: string;
    latency_ms: number;
    action: string;
    barge_in: boolean;
    timestamp: string;
  }[];
  qa: {
    script_adherence: number;
    clarity_score: number;
    fields_completion: number;
    overall_score: number;
    notes: string;
  } | null;
}

// ============================================================
// HELPERS
// ============================================================

const OUTCOME_LABELS: Record<string, string> = {
  qualified: 'Qualificado',
  scheduled: 'Agendado',
  transferred: 'Transferido',
  follow_up: 'Follow-up',
  not_qualified: 'Não Qualificado',
  no_answer: 'Não Atendeu',
  busy: 'Ocupado',
  error: 'Erro',
};

const OUTCOME_STYLES: Record<string, string> = {
  qualified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  transferred: 'bg-purple-50 text-purple-700 border-purple-200',
  follow_up: 'bg-amber-50 text-amber-700 border-amber-200',
  not_qualified: 'bg-muted text-muted-foreground border-border',
  no_answer: 'bg-red-50 text-red-700 border-red-200',
  busy: 'bg-orange-50 text-orange-700 border-orange-200',
  error: 'bg-red-50 text-red-700 border-red-200',
};

function OutcomeBadge({ outcome }: { outcome: string }) {
  return (
    <Badge variant="outline" className={`text-[11px] font-semibold ${OUTCOME_STYLES[outcome] || 'bg-muted text-muted-foreground'}`}>
      {OUTCOME_LABELS[outcome] || outcome}
    </Badge>
  );
}

function ScoreBar({ score, light = false }: { score: number; light?: boolean }) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 h-2 ${light ? 'bg-muted' : 'bg-muted/50'} rounded-full overflow-hidden`}>
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold w-8 text-right tabular-nums ${light ? 'text-foreground' : 'text-foreground'}`}>{score}</span>
    </div>
  );
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '-';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function VoiceAIPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [calls, setCalls] = useState<CallData[]>([]);
  const [totalCalls, setTotalCalls] = useState(0);
  const [selectedCall, setSelectedCall] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('dashboard');
  const [filterOutcome, setFilterOutcome] = useState('all');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = { Authorization: `Bearer ${token}` };

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get('/voice-ai-el/dashboard?days=7', { headers });
      setDashboard(res.data);
    } catch {
      toast.error('Erro ao buscar dashboard');
    }
  }, []);

  const fetchCalls = useCallback(async () => {
    try {
      const params: any = { limit: 50, offset: 0 };
      if (filterOutcome && filterOutcome !== 'all') params.outcome = filterOutcome;
      const res = await api.get('/voice-ai-el/calls', { headers, params });
      setCalls(res.data.calls);
      setTotalCalls(res.data.total);
    } catch {
      toast.error('Erro ao buscar chamadas');
    }
  }, [filterOutcome]);

  const fetchCallDetail = async (callId: number) => {
    try {
      const res = await api.get(`/voice-ai-el/calls/${callId}`, { headers });
      setSelectedCall(res.data);
    } catch {
      toast.error('Erro ao buscar detalhes');
    }
  };

  useEffect(() => {
    if (user) {
      Promise.all([fetchDashboard(), fetchCalls()]).finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchCalls();
  }, [filterOutcome]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchDashboard(), fetchCalls()]);
    setRefreshing(false);
  };

  useEffect(() => {
    const interval = setInterval(handleRefresh, 30000);
    return () => clearInterval(interval);
  }, []);

  if (authLoading || !user) return null;

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto space-y-6 pb-10" data-density="medium">
        {/* Header */}
        <div className="flex items-center justify-between">
          <PageHeader
            title="Voice AI"
            description="Ligações automáticas com IA"
            className="mb-0"
          />
          <div className="flex items-center gap-3">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="dashboard" className="gap-1.5">
                  <BarChart3 className="w-4 h-4" />
                  Dashboard
                </TabsTrigger>
                <TabsTrigger value="calls" className="gap-1.5">
                  <PhoneCall className="w-4 h-4" />
                  Chamadas
                </TabsTrigger>
                <TabsTrigger value="campaigns" className="gap-1.5">
                  <Users className="w-4 h-4" />
                  Campanhas
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <VoiceAISkeleton />
        ) : tab === 'dashboard' ? (
          <DashboardView dashboard={dashboard} />
        ) : tab === 'calls' ? (
          <CallsListView
            calls={calls}
            total={totalCalls}
            filterOutcome={filterOutcome}
            setFilterOutcome={setFilterOutcome}
            onSelectCall={fetchCallDetail}
          />
        ) : (
          <CampaignTab />
        )}

        {/* Call Detail Sheet */}
        <Sheet open={!!selectedCall} onOpenChange={(open) => !open && setSelectedCall(null)}>
          <SheetContent className="w-full sm:max-w-[540px] overflow-y-auto">
            {selectedCall && <CallDetailContent detail={selectedCall} />}
          </SheetContent>
        </Sheet>
      </div>
    </AppShell>
  );
}

// ============================================================
// SKELETON
// ============================================================

function VoiceAISkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-3 w-16 mb-3" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-24 mt-2" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6"><Skeleton className="h-[200px] w-full" /></Card>
        <Card className="p-6"><Skeleton className="h-[200px] w-full" /></Card>
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD VIEW
// ============================================================

function DashboardView({ dashboard }: { dashboard: DashboardData | null }) {
  if (!dashboard) return <EmptyState icon={PhoneOff} title="Sem dados" description="Nenhum dado de chamadas disponível." />;

  const outcomes = dashboard.outcomes || {};
  const total = dashboard.total_calls || 1;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Total" value={dashboard.total_calls} icon={PhoneCall} />
        <KPICard label="Atendidas" value={`${dashboard.answer_rate}%`} icon={PhoneForwarded} previousValue={`${dashboard.answered_calls} chamadas`} />
        <KPICard label="Score Médio" value={dashboard.avg_score} icon={Target} />
        <KPICard label="Agendados" value={outcomes.scheduled || 0} icon={Calendar} previousValue={`${((outcomes.scheduled || 0) / total * 100).toFixed(0)}% do total`} />
        <KPICard label="Latência" value={`${dashboard.avg_latency_ms}ms`} icon={Clock} />
        <KPICard label="Duração" value={`${Math.round(dashboard.avg_duration_seconds / 60)}min`} icon={Activity} />
      </div>

      {/* Outcomes & Daily */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Outcomes */}
        <Card className="p-6 shadow-[var(--shadow-xs)]">
          <h3 className="text-[var(--font-size-body)] font-semibold text-foreground mb-4 flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" />
            Resultados das Chamadas
          </h3>
          <div className="space-y-3">
            {Object.entries(outcomes).map(([key, count]) => (
              <div key={key} className="flex items-center justify-between">
                <OutcomeBadge outcome={key} />
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(count / total) * 100}%` }} />
                  </div>
                  <span className="text-[var(--font-size-body)] font-bold text-foreground w-8 text-right tabular-nums">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Daily Activity */}
        <Card className="p-6 shadow-[var(--shadow-xs)]">
          <h3 className="text-[var(--font-size-body)] font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            Chamadas por Dia
          </h3>
          <div className="space-y-2">
            {dashboard.daily.map((day) => {
              const maxTotal = Math.max(...dashboard.daily.map(d => d.total), 1);
              return (
                <div key={day.date} className="flex items-center gap-3">
                  <span className="text-[var(--font-size-caption)] text-muted-foreground w-20 flex-shrink-0">
                    {new Date(day.date + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}
                  </span>
                  <div className="flex-1 h-6 bg-muted rounded-lg overflow-hidden flex">
                    <div className="h-full bg-primary/60 rounded-l-lg" style={{ width: `${(day.total / maxTotal) * 100}%` }} />
                    {day.scheduled > 0 && (
                      <div className="h-full bg-emerald-500/60" style={{ width: `${(day.scheduled / maxTotal) * 100}%` }} />
                    )}
                  </div>
                  <span className="text-[var(--font-size-caption)] font-bold text-foreground w-6 text-right tabular-nums">{day.total}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-3 h-3 rounded bg-primary/60" /> Total
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-3 h-3 rounded bg-emerald-500/60" /> Agendados
            </span>
          </div>
        </Card>
      </div>

      {/* By Course */}
      {dashboard.by_course.length > 0 && (
        <Card className="p-6 shadow-[var(--shadow-xs)]">
          <h3 className="text-[var(--font-size-body)] font-semibold text-foreground mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Performance por Serviço
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboard.by_course.map((c) => (
              <Card key={c.course} className="p-4 bg-muted/30">
                <p className="text-[var(--font-size-body)] font-medium text-foreground mb-2 truncate">{c.course}</p>
                <div className="flex items-center justify-between text-[var(--font-size-caption)] text-muted-foreground mb-1">
                  <span>{c.total} chamadas</span>
                  <span className="font-bold text-foreground">Score: {c.avg_score}</span>
                </div>
                <ScoreBar score={c.avg_score} light />
              </Card>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// CALLS LIST VIEW
// ============================================================

function CallsListView({ calls, total, filterOutcome, setFilterOutcome, onSelectCall }: {
  calls: CallData[];
  total: number;
  filterOutcome: string;
  setFilterOutcome: (v: string) => void;
  onSelectCall: (id: number) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={filterOutcome} onValueChange={setFilterOutcome}>
          <SelectTrigger className="w-[200px] h-9">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Filtrar resultado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os resultados</SelectItem>
            <SelectItem value="qualified">Qualificado</SelectItem>
            <SelectItem value="scheduled">Agendado</SelectItem>
            <SelectItem value="transferred">Transferido</SelectItem>
            <SelectItem value="follow_up">Follow-up</SelectItem>
            <SelectItem value="not_qualified">Não Qualificado</SelectItem>
            <SelectItem value="no_answer">Não Atendeu</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[var(--font-size-caption)] text-muted-foreground">{total} chamadas</span>
      </div>

      {/* Table */}
      <Card className="overflow-hidden shadow-[var(--shadow-xs)]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-[var(--font-size-caption)] font-semibold">Lead</TableHead>
              <TableHead className="text-[var(--font-size-caption)] font-semibold">Serviço</TableHead>
              <TableHead className="text-[var(--font-size-caption)] font-semibold">Resultado</TableHead>
              <TableHead className="text-[var(--font-size-caption)] font-semibold">Score</TableHead>
              <TableHead className="text-[var(--font-size-caption)] font-semibold">Duração</TableHead>
              <TableHead className="text-[var(--font-size-caption)] font-semibold">Turnos</TableHead>
              <TableHead className="text-[var(--font-size-caption)] font-semibold">Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.map((call) => (
              <TableRow
                key={call.id}
                onClick={() => onSelectCall(call.id)}
                className="cursor-pointer"
              >
                <TableCell>
                  <div>
                    <p className="text-[var(--font-size-body)] font-medium text-foreground">{call.lead_name || 'N/A'}</p>
                    <p className="text-[11px] text-muted-foreground">{call.to_number}</p>
                  </div>
                </TableCell>
                <TableCell className="text-[var(--font-size-body)] text-muted-foreground">{call.course || '-'}</TableCell>
                <TableCell>
                  {call.outcome ? <OutcomeBadge outcome={call.outcome} /> : <span className="text-muted-foreground text-xs">{call.status}</span>}
                </TableCell>
                <TableCell className="w-36"><ScoreBar score={call.score || 0} light /></TableCell>
                <TableCell className="text-[var(--font-size-body)] text-muted-foreground tabular-nums">{formatDuration(call.duration_seconds)}</TableCell>
                <TableCell className="text-[var(--font-size-body)] text-muted-foreground tabular-nums">{call.total_turns || 0}</TableCell>
                <TableCell className="text-[var(--font-size-caption)] text-muted-foreground tabular-nums">{call.created_at ? new Date(call.created_at).toLocaleString('pt-BR') : '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {calls.length === 0 && (
          <EmptyState icon={PhoneOff} title="Nenhuma chamada encontrada" description="Ajuste os filtros ou aguarde novas chamadas." />
        )}
      </Card>
    </div>
  );
}

// ============================================================
// CALL DETAIL (inside Sheet)
// ============================================================

function CallDetailContent({ detail }: { detail: CallDetail }) {
  const { call, transcript, qa } = detail;

  return (
    <>
      <SheetHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <PhoneCall className="h-5 w-5 text-primary" />
          </div>
          <div>
            <SheetTitle>{call.lead_name || 'Lead'}</SheetTitle>
            <p className="text-[var(--font-size-caption)] text-muted-foreground">{call.to_number} · {call.course}</p>
          </div>
        </div>
        {call.outcome && <div className="mt-2"><OutcomeBadge outcome={call.outcome} /></div>}
      </SheetHeader>

      <Separator />

      <div className="space-y-5 py-5">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Score', value: call.score },
            { label: 'Duração', value: formatDuration(call.duration_seconds) },
            { label: 'Turnos', value: call.total_turns },
            { label: 'Latência', value: `${call.avg_latency_ms || '-'}ms` },
          ].map((stat) => (
            <div key={stat.label} className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground uppercase">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Audio */}
        {call.campaign && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Gravação
            </p>
            <audio controls className="w-full" preload="none">
              <source src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/voice-ai-el/calls/${call.id}/audio`} type="audio/mpeg" />
            </audio>
          </div>
        )}

        {/* Summary */}
        {call.summary && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Resumo</p>
            <p className="text-[var(--font-size-body)] text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">{call.summary}</p>
          </div>
        )}

        {/* Collected Fields */}
        {call.collected_fields && Object.keys(call.collected_fields).length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Dados Coletados</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(call.collected_fields).map(([key, val]) => (
                <div key={key} className="flex justify-between text-[var(--font-size-body)] bg-muted/50 rounded-lg px-3 py-2">
                  <span className="text-muted-foreground capitalize">{key.replace('_', ' ')}</span>
                  <span className="text-foreground font-medium">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transcript */}
        {transcript && transcript.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5" /> Transcrição
            </p>
            <div className="space-y-2">
              {transcript.map((turn, i) => (
                <div key={i} className={`flex ${turn.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${turn.role === 'user' ? 'bg-muted rounded-bl-sm' : 'bg-primary/10 rounded-br-sm'}`}>
                    <p className="text-[var(--font-size-body)] text-foreground">{turn.text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">{turn.state}</span>
                      {turn.latency_ms > 0 && <span className="text-[10px] text-muted-foreground tabular-nums">{turn.latency_ms}ms</span>}
                      {turn.barge_in && <span className="text-[10px] text-destructive">barge-in</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QA Score */}
        {qa && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">QA Automático</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Aderência ao Roteiro', value: qa.script_adherence },
                { label: 'Clareza', value: qa.clarity_score },
                { label: 'Campos Completos', value: qa.fields_completion },
                { label: 'Score Geral', value: qa.overall_score },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-[11px] text-muted-foreground mb-1">{item.label}</p>
                  <ScoreBar score={Math.round((item.value || 0) * 100)} light />
                </div>
              ))}
            </div>
            {qa.notes && (
              <p className="text-[var(--font-size-caption)] text-muted-foreground mt-3 pt-3 border-t border-border">{qa.notes}</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}