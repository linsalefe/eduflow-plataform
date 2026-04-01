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
  MessageSquare, Zap, Award, Users,
  Settings, Bot, Wrench, Plus, ChevronDown, ChevronUp, Trash2, Save, Loader2,
} from 'lucide-react';
import { KPICard } from '@/components/dashboard/kpi-card';
import CampaignTab from '@/components/voice-ai/campaign-tab';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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

interface AgentTool {
  id: number;
  name: string;
  display_name: string;
  description: string;
  when_to_use: string;
  is_active: boolean;
  is_system: boolean;
  method: string | null;
  webhook_url: string | null;
  parameters: any[];
  post_action_stage?: string;
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
      <span className="text-xs font-bold w-8 text-right tabular-nums">{score}</span>
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
                <TabsTrigger value="agent" className="gap-1.5">
                  <Bot className="w-4 h-4" />
                  Agente
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
        ) : tab === 'campaigns' ? (
          <CampaignTab />
        ) : (
          <AgentTab />
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Total" value={dashboard.total_calls} icon={PhoneCall} />
        <KPICard label="Atendidas" value={`${dashboard.answer_rate}%`} icon={PhoneForwarded} previousValue={`${dashboard.answered_calls} chamadas`} />
        <KPICard label="Score Médio" value={dashboard.avg_score} icon={Target} />
        <KPICard label="Agendados" value={outcomes.scheduled || 0} icon={Calendar} previousValue={`${((outcomes.scheduled || 0) / total * 100).toFixed(0)}% do total`} />
        <KPICard label="Latência" value={`${dashboard.avg_latency_ms}ms`} icon={Clock} />
        <KPICard label="Duração" value={`${Math.round(dashboard.avg_duration_seconds / 60)}min`} icon={Activity} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <TableRow key={call.id} onClick={() => onSelectCall(call.id)} className="cursor-pointer">
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

        {call.campaign && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Gravação</p>
            <audio controls className="w-full" preload="none">
              <source src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/voice-ai-el/calls/${call.id}/audio`} type="audio/mpeg" />
            </audio>
          </div>
        )}

        {call.summary && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Resumo</p>
            <p className="text-[var(--font-size-body)] text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">{call.summary}</p>
          </div>
        )}

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

// ============================================================
// AGENT TAB
// ============================================================

function AgentTab() {
  const [subTab, setSubTab] = useState<'tools' | 'personality' | 'variables'>('tools');
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [loadingTools, setLoadingTools] = useState(true);
  const [showNewTool, setShowNewTool] = useState(false);
  const [expandedTool, setExpandedTool] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [personality, setPersonality] = useState({
    agent_name: '',
    voice: '',
    system_prompt: '',
    agent_id: '',
  });
  const [loadingPersonality, setLoadingPersonality] = useState(true);
  const [savingPersonality, setSavingPersonality] = useState(false);
  const [elevenlabsAgents, setElevenlabsAgents] = useState<{ agent_id: string; name: string }[]>([]);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = { Authorization: `Bearer ${token}` };

  const fetchTools = async () => {
    try {
      const res = await api.get('/voice-ai/agent-tools', { headers });
      setTools(res.data);
    } catch {
      toast.error('Erro ao buscar ferramentas');
    } finally {
      setLoadingTools(false);
    }
  };

  useEffect(() => {
    fetchTools();
    api.get('/voice-ai/agent-tools/elevenlabs-agents', { headers })
      .then(res => setElevenlabsAgents(res.data))
      .catch(() => toast.error('Erro ao buscar agentes ElevenLabs'));
    setLoadingPersonality(false);
  }, []);

  const toggleTool = async (tool: AgentTool) => {
    setSavingId(tool.id);
    try {
      await api.patch(`/voice-ai/agent-tools/${tool.id}`, { is_active: !tool.is_active }, { headers });
      setTools(prev => prev.map(t => t.id === tool.id ? { ...t, is_active: !t.is_active } : t));
      toast.success(tool.is_active ? 'Ferramenta desativada' : 'Ferramenta ativada');
    } catch {
      toast.error('Erro ao atualizar ferramenta');
    } finally {
      setSavingId(null);
    }
  };

  const deleteTool = async (tool: AgentTool) => {
    if (!confirm(`Remover a ferramenta "${tool.display_name}"?`)) return;
    try {
      await api.delete(`/voice-ai/agent-tools/${tool.id}`, { headers });
      setTools(prev => prev.filter(t => t.id !== tool.id));
      toast.success('Ferramenta removida');
    } catch {
      toast.error('Erro ao remover ferramenta');
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 w-fit">
        {[
          { key: 'tools', label: 'Ferramentas', icon: Wrench },
          { key: 'personality', label: 'Personalidade', icon: Bot },
          { key: 'variables', label: 'Variáveis', icon: Settings },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSubTab(key as any)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              subTab === key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* FERRAMENTAS */}
      {subTab === 'tools' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Ferramentas do Agente</p>
              <p className="text-xs text-muted-foreground mt-0.5">Controle o que o agente pode fazer durante as ligações</p>
            </div>
            <Button size="sm" onClick={() => setShowNewTool(true)} className="gap-1.5">
              <Plus className="w-4 h-4" />
              Nova Ferramenta
            </Button>
          </div>

          {loadingTools ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Card key={i} className="p-5">
                  <Skeleton className="h-5 w-40 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {tools.map(tool => (
                <Card key={tool.id} className={`overflow-hidden transition-all ${tool.is_active ? '' : 'opacity-60'}`}>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-foreground">{tool.display_name}</span>
                          {tool.is_system && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                              padrão
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{tool.description}</p>
                        {tool.when_to_use && (
                          <p className="text-xs text-primary/70 mt-1.5 flex items-start gap-1">
                            <span className="font-medium flex-shrink-0">Quando usar:</span>
                            <span className="ml-1">{tool.when_to_use}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!tool.is_system && (
                          <>
                            <button
                              onClick={() => setExpandedTool(expandedTool === tool.id ? null : tool.id)}
                              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                            >
                              {expandedTool === tool.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => deleteTool(tool)}
                              className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <div className="flex items-center gap-2">
                          {savingId === tool.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          ) : (
                            <Switch
                              checked={tool.is_active}
                              onCheckedChange={() => toggleTool(tool)}
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {!tool.is_system && expandedTool === tool.id && (
                      <div className="mt-4 pt-4 border-t border-border space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configurações Avançadas</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Método HTTP</Label>
                            <p className="text-sm font-mono text-foreground mt-1">{tool.method || '-'}</p>
                          </div>
                          <div>
                            <Label className="text-xs">Webhook URL</Label>
                            <p className="text-xs font-mono text-muted-foreground mt-1 truncate">{tool.webhook_url || 'Não configurado'}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Dropdown de estágio para tool de agendamento */}
                    {tool.name === 'schedule_meeting' && (
                      <div className="mt-4 pt-4 border-t border-border">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Após agendar, mover lead para</p>
                        <StageSelector tool={tool} headers={headers} onUpdate={(stage) => {
                          setTools(prev => prev.map(t => t.id === tool.id ? { ...t, post_action_stage: stage } : t));
                        }} />
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PERSONALIDADE */}
      {subTab === 'personality' && (
        <Card className="p-6">
          {loadingPersonality ? (
            <div className="space-y-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Agente</p>
                <p className="text-xs text-muted-foreground mb-2">Selecione qual agente do ElevenLabs deseja configurar</p>
                <select
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  value={personality.agent_id || ''}
                  onChange={async e => {
                    const agentId = e.target.value;
                    if (!agentId) return;
                    try {
                      const res = await api.get(`/voice-ai/agent-tools/elevenlabs-agents/${agentId}`, { headers });
                      setPersonality(p => ({
                        ...p,
                        agent_id: agentId,
                        agent_name: res.data.name,
                        voice: res.data.voice_id,
                        system_prompt: res.data.system_prompt,
                      }));
                    } catch {
                      toast.error('Erro ao carregar agente');
                    }
                  }}
                >
                  <option value="">Selecionar agente...</option>
                  {elevenlabsAgents.map(a => (
                    <option key={a.agent_id} value={a.agent_id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Voz (Voice ID)</p>
                <p className="text-xs text-muted-foreground mb-2">ID da voz no ElevenLabs</p>
                <Input
                  placeholder="Ex: gAzaYtjDCyG4vCelULMb"
                  value={personality.voice}
                  onChange={e => setPersonality(p => ({ ...p, voice: e.target.value }))}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Instruções do Agente (System Prompt)</p>
                <p className="text-xs text-muted-foreground mb-2">Como o agente deve se comportar durante as ligações</p>
                <Textarea
                  rows={12}
                  className="font-mono text-xs resize-none"
                  value={personality.system_prompt}
                  onChange={e => setPersonality(p => ({ ...p, system_prompt: e.target.value }))}
                />
              </div>
              <Button
                onClick={async () => {
                  if (!personality.agent_id) {
                    toast.error('Selecione um agente primeiro');
                    return;
                  }
                  setSavingPersonality(true);
                  try {
                    await api.put(
                      `/voice-ai/agent-tools/elevenlabs-agents/${personality.agent_id}`,
                      { agent_name: personality.agent_name, voice: personality.voice, system_prompt: personality.system_prompt },
                      { headers }
                    );
                    toast.success('Agente atualizado no ElevenLabs!');
                  } catch {
                    toast.error('Erro ao salvar no ElevenLabs');
                  } finally {
                    setSavingPersonality(false);
                  }
                }}
                disabled={savingPersonality}
                className="w-full gap-1.5"
              >
                {savingPersonality ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar no ElevenLabs
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* VARIÁVEIS */}
      {subTab === 'variables' && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-foreground">Variáveis Dinâmicas</p>
            <p className="text-xs text-muted-foreground mt-0.5">Informações que o agente recebe automaticamente ao iniciar cada ligação</p>
          </div>
          <div className="space-y-3">
            {[
              { name: '{{lead_name}}', description: 'Nome do lead capturado no CRM', source: 'CRM automático' },
              { name: '{{lead_phone}}', description: 'Número de telefone do lead', source: 'CRM automático' },
              { name: '{{product_interest}}', description: 'Produto ou serviço de interesse', source: 'CRM automático' },
              { name: '{{caller_id}}', description: 'Número de telefone detectado automaticamente', source: 'Sistema' },
            ].map(variable => (
              <Card key={variable.name} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-primary">{variable.name}</code>
                    <p className="text-xs text-foreground mt-1.5">{variable.description}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Origem: {variable.source}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                    ativo
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center pt-2">
            Mais variáveis serão adicionadas conforme novas integrações forem ativadas.
          </p>
        </div>
      )}

      {/* MODAL: Nova Ferramenta */}
      <NewToolDialog
        open={showNewTool}
        onClose={() => setShowNewTool(false)}
        onCreated={(tool) => {
          setTools(prev => [...prev, tool]);
          setShowNewTool(false);
          toast.success('Ferramenta criada com sucesso!');
        }}
        headers={headers}
      />
    </div>
  );
}

// ============================================================
// STAGE SELECTOR
// ============================================================

function StageSelector({ tool, headers, onUpdate }: {
  tool: AgentTool;
  headers: any;
  onUpdate: (stage: string) => void;
}) {
  const [stages, setStages] = useState<{ slug: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/voice-ai/agent-tools/pipeline-stages', { headers })
      .then(res => setStages(res.data))
      .catch(() => {});
  }, []);

  const handleChange = async (slug: string) => {
    setSaving(true);
    try {
      await api.patch(`/voice-ai/agent-tools/${tool.id}`, { post_action_stage: slug }, { headers });
      onUpdate(slug);
      toast.success('Estágio configurado!');
    } catch {
      toast.error('Erro ao salvar estágio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm"
        value={(tool as any).post_action_stage || ''}
        onChange={e => handleChange(e.target.value)}
        disabled={saving}
      >
        <option value="">Selecionar estágio...</option>
        {stages.map(s => (
          <option key={s.slug} value={s.slug}>{s.name}</option>
        ))}
      </select>
      {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
    </div>
  );
}

// ============================================================
// NEW TOOL DIALOG
// ============================================================

function NewToolDialog({ open, onClose, onCreated, headers }: {
  open: boolean;
  onClose: () => void;
  onCreated: (tool: AgentTool) => void;
  headers: any;
}) {
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState({
    display_name: '',
    description: '',
    when_to_use: '',
    method: 'POST',
    webhook_url: '',
  });

  const handleSave = async () => {
    if (!form.display_name || !form.description) {
      toast.error('Nome e descrição são obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/voice-ai/agent-tools', form, { headers });
      onCreated(res.data);
      setForm({ display_name: '', description: '', when_to_use: '', method: 'POST', webhook_url: '' });
    } catch {
      toast.error('Erro ao criar ferramenta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-primary" />
            Nova Ferramenta
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs font-medium">Nome da Ferramenta *</Label>
            <Input
              className="mt-1.5"
              placeholder="Ex: Consultar Plano do Cliente"
              value={form.display_name}
              onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs font-medium">O que essa ferramenta faz? *</Label>
            <Textarea
              className="mt-1.5 resize-none"
              rows={3}
              placeholder="Descreva o que o agente fará ao usar essa ferramenta..."
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs font-medium">Quando usar?</Label>
            <Input
              className="mt-1.5"
              placeholder="Ex: Quando o lead perguntar sobre o plano atual..."
              value={form.when_to_use}
              onChange={e => setForm(p => ({ ...p, when_to_use: e.target.value }))}
            />
          </div>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Configurações avançadas
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showAdvanced && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div>
                <Label className="text-xs font-medium">Método HTTP</Label>
                <select
                  className="mt-1.5 w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  value={form.method}
                  onChange={e => setForm(p => ({ ...p, method: e.target.value }))}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </div>
              <div>
                <Label className="text-xs font-medium">Webhook URL</Label>
                <Input
                  className="mt-1.5 font-mono text-xs"
                  placeholder="https://api.exemplo.com/v1/..."
                  value={form.webhook_url}
                  onChange={e => setForm(p => ({ ...p, webhook_url: e.target.value }))}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Criar Ferramenta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}