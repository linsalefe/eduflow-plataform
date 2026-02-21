'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import AppLayout from '@/components/AppLayout';
import { toast } from 'sonner';
import api from '@/lib/api';
import {
  PhoneCall, PhoneOff, PhoneForwarded, Calendar, Clock, TrendingUp,
  BarChart3, Activity, Target, AlertTriangle, Play, Square, 
  ChevronDown, ChevronRight, RefreshCw, Search, Filter,
  MessageSquare, Zap, Award, Volume2, X
} from 'lucide-react';

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
// HELPER COMPONENTS
// ============================================================

function StatCard({ icon: Icon, label, value, sub, color = 'indigo' }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  const colors: Record<string, string> = {
    indigo: 'from-indigo-500/20 to-indigo-600/10 text-indigo-400 border-indigo-500/20',
    green: 'from-emerald-500/20 to-emerald-600/10 text-emerald-400 border-emerald-500/20',
    amber: 'from-amber-500/20 to-amber-600/10 text-amber-400 border-amber-500/20',
    red: 'from-red-500/20 to-red-600/10 text-red-400 border-red-500/20',
    cyan: 'from-cyan-500/20 to-cyan-600/10 text-cyan-400 border-cyan-500/20',
    purple: 'from-purple-500/20 to-purple-600/10 text-purple-400 border-purple-500/20',
  };

  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-5`}>
      <div className="flex items-center justify-between mb-3">
        <Icon className="w-5 h-5 opacity-70" />
        <span className="text-[11px] font-medium uppercase tracking-wider opacity-60">{label}</span>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const styles: Record<string, string> = {
    qualified: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    scheduled: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    transferred: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    follow_up: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    not_qualified: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    no_answer: 'bg-red-500/20 text-red-400 border-red-500/30',
    busy: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  const labels: Record<string, string> = {
    qualified: 'Qualificado',
    scheduled: 'Agendado',
    transferred: 'Transferido',
    follow_up: 'Follow-up',
    not_qualified: 'Não Qualificado',
    no_answer: 'Não Atendeu',
    busy: 'Ocupado',
    error: 'Erro',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${styles[outcome] || 'bg-gray-500/20 text-gray-400'}`}>
      {labels[outcome] || outcome}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold text-white w-8 text-right">{score}</span>
    </div>
  );
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
  const [tab, setTab] = useState<'dashboard' | 'calls'>('dashboard');
  const [filterOutcome, setFilterOutcome] = useState('');
  const [showDetail, setShowDetail] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = { Authorization: `Bearer ${token}` };

  // Fetch dashboard
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get('/voice-ai-el/dashboard?days=7', { headers });
      setDashboard(res.data);
    } catch (e) {
      toast.error('Erro ao buscar dashboard');
    }
  }, []);

  // Fetch calls
  const fetchCalls = useCallback(async () => {
    try {
      const params: any = { limit: 50, offset: 0 };
      if (filterOutcome) params.outcome = filterOutcome;
      const res = await api.get('/voice-ai-el/calls', { headers, params });
      setCalls(res.data.calls);
      setTotalCalls(res.data.total);
    } catch (e) {
      toast.error('Erro ao buscar chamadas');
    }
  }, [filterOutcome]);

  // Fetch call detail
  const fetchCallDetail = async (callId: number) => {
    try {
      const res = await api.get(`/voice-ai-el/calls/${callId}`, { headers });
      setSelectedCall(res.data);
      setShowDetail(true);
    } catch (e) {
      toast.error('Erro ao buscar detalhes');
    }
  };

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchDashboard(), fetchCalls()]);
      setLoading(false);
    };
    if (user) load();
  }, [user]);

  useEffect(() => {
    if (user) fetchCalls();
  }, [filterOutcome]);

  // Refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchDashboard(), fetchCalls()]);
    setRefreshing(false);
  };

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(handleRefresh, 30000);
    return () => clearInterval(interval);
  }, []);

  if (authLoading || !user) return null;

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto bg-[#0a0f1a]">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0a0f1a]/95 backdrop-blur border-b border-white/[0.06] px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <PhoneCall className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">Voice AI</h1>
                <p className="text-sm text-gray-500">Ligações automáticas com IA</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Tabs */}
              <div className="flex bg-white/5 rounded-xl p-1">
                <button
                  onClick={() => setTab('dashboard')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'dashboard' ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-400 hover:text-white'}`}
                >
                  <BarChart3 className="w-4 h-4 inline mr-2" />Dashboard
                </button>
                <button
                  onClick={() => setTab('calls')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'calls' ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-400 hover:text-white'}`}
                >
                  <PhoneCall className="w-4 h-4 inline mr-2" />Chamadas
                </button>
              </div>

              <button
                onClick={handleRefresh}
                className={`p-2.5 rounded-xl bg-white/5 text-gray-400 hover:text-white transition-all ${refreshing ? 'animate-spin' : ''}`}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tab === 'dashboard' ? (
            <DashboardView dashboard={dashboard} />
          ) : (
            <CallsListView
              calls={calls}
              total={totalCalls}
              filterOutcome={filterOutcome}
              setFilterOutcome={setFilterOutcome}
              onSelectCall={fetchCallDetail}
            />
          )}
        </div>

        {/* Call Detail Modal */}
        {showDetail && selectedCall && (
          <CallDetailModal
            detail={selectedCall}
            onClose={() => { setShowDetail(false); setSelectedCall(null); }}
          />
        )}
      </div>
    </AppLayout>
  );
}

// ============================================================
// DASHBOARD VIEW
// ============================================================

function DashboardView({ dashboard }: { dashboard: DashboardData | null }) {
  if (!dashboard) return <p className="text-gray-500">Sem dados</p>;

  const outcomes = dashboard.outcomes || {};
  const total = dashboard.total_calls || 1;

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={PhoneCall} label="Total" value={dashboard.total_calls} sub="últimos 7 dias" color="indigo" />
        <StatCard icon={PhoneForwarded} label="Atendidas" value={`${dashboard.answer_rate}%`} sub={`${dashboard.answered_calls} chamadas`} color="green" />
        <StatCard icon={Target} label="Score Médio" value={dashboard.avg_score} sub="de qualificação" color="purple" />
        <StatCard icon={Calendar} label="Agendados" value={outcomes.scheduled || 0} sub={`${((outcomes.scheduled || 0) / total * 100).toFixed(0)}% do total`} color="cyan" />
        <StatCard icon={Clock} label="Latência" value={`${dashboard.avg_latency_ms}ms`} sub="resposta média" color="amber" />
        <StatCard icon={Activity} label="Duração" value={`${Math.round(dashboard.avg_duration_seconds / 60)}min`} sub="média por chamada" color="red" />
      </div>

      {/* Outcomes & Daily Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Outcomes Breakdown */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Award className="w-4 h-4 text-indigo-400" />
            Resultados das Chamadas
          </h3>
          <div className="space-y-3">
            {Object.entries(outcomes).map(([key, count]) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <OutcomeBadge outcome={key} />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${(count / total) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-white w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Daily Activity */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Chamadas por Dia
          </h3>
          <div className="space-y-2">
            {dashboard.daily.map((day) => {
              const maxTotal = Math.max(...dashboard.daily.map(d => d.total), 1);
              return (
                <div key={day.date} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-20 flex-shrink-0">
                    {new Date(day.date + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}
                  </span>
                  <div className="flex-1 h-6 bg-white/5 rounded-lg overflow-hidden flex">
                    <div
                      className="h-full bg-indigo-500/60 rounded-l-lg"
                      style={{ width: `${(day.total / maxTotal) * 100}%` }}
                    />
                    {day.scheduled > 0 && (
                      <div
                        className="h-full bg-emerald-500/60"
                        style={{ width: `${(day.scheduled / maxTotal) * 100}%` }}
                      />
                    )}
                  </div>
                  <span className="text-xs font-bold text-white w-6 text-right">{day.total}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/[0.06]">
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="w-3 h-3 rounded bg-indigo-500/60" /> Total
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="w-3 h-3 rounded bg-emerald-500/60" /> Agendados
            </span>
          </div>
        </div>
      </div>

      {/* By Course */}
      {dashboard.by_course.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Performance por Curso
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboard.by_course.map((c) => (
              <div key={c.course} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4">
                <p className="text-sm font-medium text-white mb-2 truncate">{c.course}</p>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{c.total} chamadas</span>
                  <span className="font-bold text-white">Score: {c.avg_score}</span>
                </div>
                <ScoreBar score={c.avg_score} />
              </div>
            ))}
          </div>
        </div>
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
  const outcomeOptions = ['', 'qualified', 'scheduled', 'transferred', 'follow_up', 'not_qualified', 'no_answer'];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={filterOutcome}
            onChange={(e) => setFilterOutcome(e.target.value)}
            className="bg-transparent text-sm text-gray-300 outline-none"
          >
            <option value="">Todos os resultados</option>
            {outcomeOptions.filter(Boolean).map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <span className="text-sm text-gray-500">{total} chamadas</span>
      </div>

      {/* Table */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Lead</th>
              <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Curso</th>
              <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Resultado</th>
              <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Score</th>
              <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Duração</th>
              <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Turnos</th>
              <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Data</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr
                key={call.id}
                onClick={() => onSelectCall(call.id)}
                className="border-b border-white/[0.03] hover:bg-white/[0.03] cursor-pointer transition-colors"
              >
                <td className="px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-white">{call.lead_name || 'N/A'}</p>
                    <p className="text-[11px] text-gray-500">{call.to_number}</p>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-300">{call.course || '-'}</td>
                <td className="px-5 py-3.5">{call.outcome ? <OutcomeBadge outcome={call.outcome} /> : <span className="text-gray-600 text-xs">{call.status}</span>}</td>
                <td className="px-5 py-3.5 w-36"><ScoreBar score={call.score || 0} /></td>
                <td className="px-5 py-3.5 text-sm text-gray-400">{call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, '0')}` : '-'}</td>
                <td className="px-5 py-3.5 text-sm text-gray-400">{call.total_turns || 0}</td>
                <td className="px-5 py-3.5 text-[11px] text-gray-500">{call.created_at ? new Date(call.created_at).toLocaleString('pt-BR') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {calls.length === 0 && (
          <div className="py-16 text-center text-gray-600">
            <PhoneOff className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhuma chamada encontrada</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CALL DETAIL MODAL
// ============================================================

function CallDetailModal({ detail, onClose }: { detail: CallDetail; onClose: () => void }) {
  const { call, transcript, qa } = detail;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[85vh] bg-[#111827] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 lg:px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <PhoneCall className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{call.lead_name || 'Lead'}</h2>
              <p className="text-xs text-gray-500">{call.to_number} · {call.course}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {call.outcome && <OutcomeBadge outcome={call.outcome} />}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white/[0.03] rounded-xl p-3 text-center">
              <p className="text-xl lg:text-2xl font-bold text-white">{call.score}</p>
              <p className="text-[10px] text-gray-500 uppercase">Score</p>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-3 text-center">
              <p className="text-xl lg:text-2xl font-bold text-white">{call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, '0')}` : '-'}</p>
              <p className="text-[10px] text-gray-500 uppercase">Duração</p>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-3 text-center">
              <p className="text-xl lg:text-2xl font-bold text-white">{call.total_turns}</p>
              <p className="text-[10px] text-gray-500 uppercase">Turnos</p>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-3 text-center">
              <p className="text-xl lg:text-2xl font-bold text-white">{call.avg_latency_ms || '-'}ms</p>
              <p className="text-[10px] text-gray-500 uppercase">Latência</p>
            </div>
          </div>


          {/* Audio Player */}
          {call.campaign && (
            <div className="bg-white/[0.03] rounded-xl p-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3 flex items-center gap-2">
                🎙️ Gravação da Ligação
              </h4>
              <audio controls className="w-full" preload="none">
                <source src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/voice-ai-el/calls/${call.id}/audio`} type="audio/mpeg" />
              </audio>
            </div>
          )}
          {/* Summary */}
          {call.summary && (
            <div className="bg-white/[0.03] rounded-xl p-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Resumo</h4>
              <p className="text-sm text-gray-300 whitespace-pre-line">{call.summary}</p>
            </div>
          )}

          {/* Collected Fields */}
          {call.collected_fields && Object.keys(call.collected_fields).length > 0 && (
            <div className="bg-white/[0.03] rounded-xl p-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Dados Coletados</h4>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(call.collected_fields).map(([key, val]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-gray-500 capitalize">{key.replace('_', ' ')}</span>
                    <span className="text-white font-medium">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transcript */}
          {transcript && transcript.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3 flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5" /> Transcrição
              </h4>
              <div className="space-y-2">
                {transcript.map((turn, i) => (
                  <div
                    key={i}
                    className={`flex ${turn.role === 'user' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${turn.role === 'user' ? 'bg-white/[0.06] rounded-bl-md' : 'bg-indigo-500/20 rounded-br-md'}`}>
                      <p className="text-sm text-gray-200">{turn.text}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-600">{turn.state}</span>
                        {turn.latency_ms && <span className="text-[10px] text-gray-600">{turn.latency_ms}ms</span>}
                        {turn.barge_in && <span className="text-[10px] text-red-400">barge-in</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* QA Score */}
          {qa && (
            <div className="bg-white/[0.03] rounded-xl p-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3">QA Automático</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-gray-500 mb-1">Aderência ao Roteiro</p>
                  <ScoreBar score={Math.round((qa.script_adherence || 0) * 100)} />
                </div>
                <div>
                  <p className="text-[11px] text-gray-500 mb-1">Clareza</p>
                  <ScoreBar score={Math.round((qa.clarity_score || 0) * 100)} />
                </div>
                <div>
                  <p className="text-[11px] text-gray-500 mb-1">Campos Completos</p>
                  <ScoreBar score={Math.round((qa.fields_completion || 0) * 100)} />
                </div>
                <div>
                  <p className="text-[11px] text-gray-500 mb-1">Score Geral</p>
                  <ScoreBar score={Math.round((qa.overall_score || 0) * 100)} />
                </div>
              </div>
              {qa.notes && <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-white/[0.06]">{qa.notes}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}