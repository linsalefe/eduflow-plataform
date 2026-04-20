'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import AppShell from '@/components/app-shell';
import api from '@/lib/api';
import { toast } from 'sonner';
import { FlaskConical, ThumbsUp, ThumbsDown, Pencil, Loader2, MessageSquare, ChevronRight } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { getInitials, getAvatarColor, formatFullDate } from '@/lib/inbox-constants';

// ── Types ───────────────────────────────────────────────
interface LabStats {
  total_feedback: number;
  up: number;
  down: number;
  edit: number;
  approval_rate: number;
  eligible_for_fewshot: number;
  recent_edits: Array<{
    id: number;
    contact_wa_id: string;
    corrected_response: string;
    created_at: string | null;
  }>;
}

interface ConversationItem {
  contact_wa_id: string;
  contact_name: string;
  profile_picture_url: string | null;
  last_message_at: string | null;
  ai_message_count: number;
  feedback_total: number;
  feedback_up: number;
  feedback_down: number;
  feedback_edit: number;
}

type FilterType = 'all' | 'unreviewed' | 'reviewed' | 'edits';

const FILTERS: Array<{ value: FilterType; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'unreviewed', label: 'Não revisadas' },
  { value: 'reviewed', label: 'Revisadas' },
  { value: 'edits', label: 'Com correções' },
];

// ── Content component ───────────────────────────────────
export function LabListContent() {
  const { user } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<LabStats | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingList, setLoadingList] = useState(true);

  // Gate: apenas admin
  useEffect(() => {
    if (user && user.role !== 'admin') router.push('/dashboard');
  }, [user, router]);

  // Carrega stats (uma vez)
  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    (async () => {
      try {
        const res = await api.get('/ai-lab/stats');
        setStats(res.data);
      } catch {
        toast.error('Erro ao carregar estatísticas do laboratório');
      } finally {
        setLoadingStats(false);
      }
    })();
  }, [user]);

  // Carrega lista (sempre que filtro muda)
  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    setLoadingList(true);
    (async () => {
      try {
        const res = await api.get('/ai-lab/conversations', {
          params: { filter, limit: 50, offset: 0 },
        });
        setConversations(res.data.items || []);
      } catch {
        toast.error('Erro ao carregar conversas');
        setConversations([]);
      } finally {
        setLoadingList(false);
      }
    })();
  }, [filter, user]);

  if (!user) return null;
  if (user.role !== 'admin') return null;

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <FlaskConical className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Laboratório do agente</h1>
          <p className="text-sm text-gray-500">
            Revise as respostas da IA e ensine ela a responder melhor
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total de avaliações"
          value={loadingStats ? null : stats?.total_feedback ?? 0}
        />
        <StatCard
          label="Aprovações"
          value={loadingStats ? null : stats?.up ?? 0}
          hint={stats && stats.total_feedback > 0 ? `${Math.round(stats.approval_rate * 100)}% de aprovação` : undefined}
          accent="green"
          icon={<ThumbsUp className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="Problemas"
          value={loadingStats ? null : stats?.down ?? 0}
          accent="red"
          icon={<ThumbsDown className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="Correções"
          value={loadingStats ? null : stats?.edit ?? 0}
          hint={stats && stats.eligible_for_fewshot > 0 ? `${stats.eligible_for_fewshot} treinando a IA` : undefined}
          accent="blue"
          icon={<Pencil className="w-3.5 h-3.5" />}
        />
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.value
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loadingList ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Nenhuma conversa nesta visão"
            description={
              filter === 'all'
                ? 'Assim que a IA conversar com leads, as conversas aparecerão aqui para revisão.'
                : 'Troque o filtro acima para ver outras conversas.'
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {conversations.map((c) => (
              <ConversationRow key={c.contact_wa_id} conversation={c} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────
function StatCard({
  label, value, hint, accent, icon,
}: {
  label: string;
  value: number | null;
  hint?: string;
  accent?: 'green' | 'red' | 'blue';
  icon?: React.ReactNode;
}) {
  const accentColor =
    accent === 'green' ? 'text-emerald-600' :
    accent === 'red' ? 'text-red-600' :
    accent === 'blue' ? 'text-primary' : 'text-gray-900';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-gray-500">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-semibold mt-1 ${accentColor}`}>
        {value === null ? <span className="text-gray-300">&mdash;</span> : value}
      </p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function ConversationRow({ conversation: c }: { conversation: ConversationItem }) {
  const initials = getInitials(c.contact_name || c.contact_wa_id);
  const avatarColor = getAvatarColor(c.contact_name || c.contact_wa_id);
  const dateLabel = c.last_message_at ? formatFullDate(c.last_message_at) : 'sem mensagens';

  return (
    <li>
      <Link
        href={`/configuracoes/agentes/laboratorio/${encodeURIComponent(c.contact_wa_id)}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        {c.profile_picture_url ? (
          <img
            src={c.profile_picture_url}
            alt={c.contact_name}
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-xs flex-shrink-0 bg-gradient-to-b ${avatarColor}`}
          >
            {initials}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {c.contact_name || c.contact_wa_id}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {dateLabel} &middot; {c.ai_message_count} {c.ai_message_count === 1 ? 'msg da IA' : 'msgs da IA'}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {c.feedback_total === 0 ? (
            <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-gray-100 text-gray-500">
              não revisada
            </span>
          ) : (
            <>
              {c.feedback_up > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-50 text-emerald-700">
                  {c.feedback_up}
                </span>
              )}
              {c.feedback_down > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-red-50 text-red-700">
                  {c.feedback_down}
                </span>
              )}
              {c.feedback_edit > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-blue-50 text-blue-700">
                  {c.feedback_edit}
                </span>
              )}
            </>
          )}
          <ChevronRight className="w-4 h-4 text-gray-400 ml-1" />
        </div>
      </Link>
    </li>
  );
}

// ── Page default export ─────────────────────────────────
export default function LabListPage() {
  return (
    <AppShell>
      <LabListContent />
    </AppShell>
  );
}
