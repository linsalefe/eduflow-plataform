'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import AppShell from '@/components/app-shell';
import { toast } from 'sonner';
import api from '@/lib/api';
import {
  PhoneIncoming, Clock, MessageSquare, BarChart3,
  Filter, ChevronRight, Phone, Bot, Shield,
  X, User, Headphones,
} from 'lucide-react';
import { KPICard } from '@/components/dashboard/kpi-card';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
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

// ============================================================
// TYPES
// ============================================================

interface DashboardData {
  period_days: number;
  total_calls: number;
  avg_duration_seconds: number;
  avg_latency_ms: number;
  outcomes: Record<string, number>;
  by_agent: Record<string, number>;
  daily: { date: string; total: number }[];
}

interface CallData {
  id: number;
  from_number: string;
  source: string;
  status: string;
  outcome: string;
  summary: string;
  duration_seconds: number;
  total_turns: number;
  avg_latency_ms: number;
  created_at: string;
}

interface CallDetail {
  call: CallData & { campaign: string };
  transcript: {
    role: string;
    text: string;
    timestamp: string;
  }[];
}

// ============================================================
// HELPERS
// ============================================================

const OUTCOME_LABELS: Record<string, string> = {
  resolved: 'Resolvido',
  unresolved: 'Não Resolvido',
  completed: 'Concluído',
  support_completed: 'Suporte OK',
};

const OUTCOME_STYLES: Record<string, string> = {
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  unresolved: 'bg-red-50 text-red-700 border-red-200',
  completed: 'bg-blue-50 text-blue-700 border-blue-200',
  support_completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const AGENT_LABELS: Record<string, string> = {
  inbound_support: 'Lia — Suporte',
  inbound_retention: 'Maria — Retenção',
};

const AGENT_STYLES: Record<string, string> = {
  inbound_support: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  inbound_retention: 'bg-amber-50 text-amber-700 border-amber-200',
};

function OutcomeBadge({ outcome }: { outcome: string }) {
  return (
    <Badge variant="outline" className={`text-[11px] font-semibold ${OUTCOME_STYLES[outcome] || 'bg-muted text-muted-foreground'}`}>
      {OUTCOME_LABELS[outcome] || outcome}
    </Badge>
  );
}

function AgentBadge({ source }: { source: string }) {
  return (
    <Badge variant="outline" className={`text-[11px] font-semibold ${AGENT_STYLES[source] || 'bg-muted text-muted-foreground'}`}>
      {AGENT_LABELS[source] || source}
    </Badge>
  );
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '-';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatPhone(phone: string): string {
  if (!phone) return '-';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 13) {
    return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  }
  return phone;
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function VoiceInboundPage() {
  const { user, loading: authLoading } = useAuth();

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [calls, setCalls] = useState<CallData[]>([]);
  const [totalCalls, setTotalCalls] = useState(0);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState('all');

  // Detail sheet
  const [selectedCall, setSelectedCall] = useState<CallDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch data
  useEffect(() => {
    if (authLoading || !user) return;
    fetchData();
  }, [user, authLoading, agentFilter]);

  async function fetchData() {
    setLoading(true);
    try {
      const [dashRes, callsRes] = await Promise.all([
        api.get('/voice-inbound/dashboard?days=30'),
        api.get(`/voice-inbound/calls?limit=50&agent=${agentFilter === 'all' ? '' : agentFilter}`),
      ]);
      setDashboard(dashRes.data);
      setCalls(callsRes.data.calls);
      setTotalCalls(callsRes.data.total);
    } catch (err) {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(callId: number) {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const res = await api.get(`/voice-inbound/calls/${callId}`);
      setSelectedCall(res.data);
    } catch {
      toast.error('Erro ao carregar detalhes');
    } finally {
      setDetailLoading(false);
    }
  }

  if (authLoading) return null;

  return (
    <AppShell>
      <div className="flex flex-col gap-6 p-4 md:p-6 max-w-[1400px] mx-auto">
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <PageHeader
            title="Atendimento por Voz"
            description="Chamadas recebidas atendidas pelos agentes de IA"
          />
        </div>

        {/* KPIs */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : dashboard && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              label="Total de Chamadas"
              value={dashboard.total_calls}
              icon={PhoneIncoming}
              index={0}
            />
            <KPICard
              label="Duração Média"
              value={formatDuration(dashboard.avg_duration_seconds)}
              icon={Clock}
              index={1}
            />
            <KPICard
              label="Suporte (Lia)"
              value={dashboard.by_agent?.inbound_support || 0}
              icon={Headphones}
              index={2}
            />
            <KPICard
              label="Retenção (Maria)"
              value={dashboard.by_agent?.inbound_retention || 0}
              icon={Shield}
              index={3}
            />
          </div>
        )}

        {/* FILTROS + TABELA */}
        <Card className="border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Chamadas Recebidas</h3>
              <Badge variant="secondary" className="text-xs">{totalCalls}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Filtrar por agente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os agentes</SelectItem>
                  <SelectItem value="support">Lia — Suporte</SelectItem>
                  <SelectItem value="retention">Maria — Retenção</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : calls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <PhoneIncoming className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhuma chamada inbound registrada</p>
              <p className="text-xs mt-1">Quando clientes ligarem, as chamadas aparecerão aqui</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold">Telefone</TableHead>
                  <TableHead className="text-xs font-semibold">Agente</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold">Duração</TableHead>
                  <TableHead className="text-xs font-semibold">Turnos</TableHead>
                  <TableHead className="text-xs font-semibold">Data</TableHead>
                  <TableHead className="text-xs font-semibold w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow
                    key={call.id}
                    className="serviçor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => openDetail(call.id)}
                  >
                    <TableCell className="text-sm font-medium">{formatPhone(call.from_number)}</TableCell>
                    <TableCell><AgentBadge source={call.source} /></TableCell>
                    <TableCell><OutcomeBadge outcome={call.outcome} /></TableCell>
                    <TableCell className="text-sm tabular-nums">{formatDuration(call.duration_seconds)}</TableCell>
                    <TableCell className="text-sm tabular-nums">{call.total_turns}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(call.created_at)}</TableCell>
                    <TableCell>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* DETAIL SHEET */}
        <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <PhoneIncoming className="w-5 h-5" />
                Detalhes da Chamada
              </SheetTitle>
            </SheetHeader>

            {detailLoading ? (
              <div className="mt-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : selectedCall && (
              <div className="mt-6 space-y-5">
                {/* Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-[11px] text-muted-foreground font-medium mb-1">Telefone</p>
                    <p className="text-sm font-semibold">{formatPhone(selectedCall.call.from_number)}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-[11px] text-muted-foreground font-medium mb-1">Agente</p>
                    <AgentBadge source={selectedCall.call.source} />
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-[11px] text-muted-foreground font-medium mb-1">Duração</p>
                    <p className="text-sm font-semibold">{formatDuration(selectedCall.call.duration_seconds)}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-[11px] text-muted-foreground font-medium mb-1">Status</p>
                    <OutcomeBadge outcome={selectedCall.call.outcome} />
                  </div>
                </div>

                {/* Resumo */}
                {selectedCall.call.summary && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Resumo</p>
                      <p className="text-sm leading-relaxed">{selectedCall.call.summary}</p>
                    </div>
                  </>
                )}

                {/* Transcrição */}
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                    Transcrição ({selectedCall.transcript.length} mensagens)
                  </p>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                    {selectedCall.transcript.map((turn, i) => (
                      <div
                        key={i}
                        className={`flex gap-2 ${turn.role === 'user' ? '' : 'flex-row-reverse'}`}
                      >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          turn.role === 'user'
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {turn.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                        </div>
                        <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                          turn.role === 'user'
                            ? 'bg-muted text-foreground'
                            : 'bg-indigo-50 text-indigo-900'
                        }`}>
                          {turn.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </AppShell>
  );
}