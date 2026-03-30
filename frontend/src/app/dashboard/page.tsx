'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare, Activity, Clock, Target,
  TrendingUp, TrendingDown, Users,
} from 'lucide-react';
import AppShell from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import api from '@/lib/api';
import { toast } from 'sonner';

import { GreetingHeader } from '@/components/dashboard/greeting-header';
import { StatsOverview } from '@/components/dashboard/stats-overview';
import { HeroChart } from '@/components/dashboard/hero-chart';
import { StatusDistribution } from '@/components/dashboard/status-distribution';
import { AgentPerformance } from '@/components/dashboard/agent-performance';
import { TagDistribution } from '@/components/dashboard/tag-distribution';
import { KPICard } from '@/components/dashboard/kpi-card';
import { EmptyState } from '@/components/ui/empty-state';
import { DashboardSkeleton } from '@/components/skeletons/dashboard-skeleton';
import { JarvisButton } from '@/components/jarvis/jarvis-button';

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
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadStats();
      const interval = setInterval(loadStats, 60000);
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
    } catch {
      toast.error('Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !user) return null;

  return (
    <AppShell>
      <div className="space-y-4 lg:space-y-6 max-w-7xl mx-auto pb-6" data-density="high">
        {/* Greeting */}
        <GreetingHeader />

        {/* Loading state */}
        {loading || !stats ? (
          <DashboardSkeleton />
        ) : (
          <>
            {/* Empty state for new accounts */}
            {stats.total_contacts === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="Bem-vindo ao EduFlow!"
                description="Para começar a receber mensagens e acompanhar seus leads, conecte seu primeiro canal do WhatsApp."
                actionLabel="Conectar canal"
                onAction={() => router.push('/canais')}
              />
            ) : (
              <>
                {/* Hero Chart — full width, elemento dominante */}
                <HeroChart
                  data={stats.daily_messages}
                  totalWeek={stats.messages_week}
                  trendPct={advanced?.trend_pct}
                />

                {/* KPI Cards com stagger animation */}
                <StatsOverview
                  totalContacts={stats.total_contacts}
                  newToday={stats.new_today}
                  inboundToday={stats.inbound_today}
                  outboundToday={stats.outbound_today}
                />

                {/* Status + Tags */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                  <StatusDistribution
                    statusCounts={stats.status_counts}
                    totalContacts={stats.total_contacts}
                  />
                  {advanced && <TagDistribution tags={advanced.tags} />}
                </div>

                {/* Advanced metrics */}
                {advanced && (
                  <>
                    {/* KPI Row: Conversion + Response Time + Trend */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
                      <KPICard
                        label="Taxa de Conversão"
                        value={`${advanced.conversion_rate}%`}
                        icon={Target}
                        trend={advanced.conversion_rate > 0 ? 'up' : 'neutral'}
                        previousValue={`${advanced.converted} de ${advanced.total}`}
                        index={0}
                      />
                      <KPICard
                        label="Tempo Médio de Resposta"
                        value={formatResponseTime(advanced.avg_response_minutes)}
                        icon={Clock}
                        index={1}
                      />
                      <KPICard
                        label="Novos Leads (semana)"
                        value={advanced.new_this_week}
                        icon={advanced.trend_pct >= 0 ? TrendingUp : TrendingDown}
                        trend={advanced.trend_pct >= 0 ? 'up' : 'down'}
                        trendValue={`${advanced.trend_pct >= 0 ? '+' : ''}${advanced.trend_pct}%`}
                        previousValue={`${advanced.new_last_week} sem. passada`}
                        index={2}
                      />
                    </div>

                    {/* Agents */}
                    <AgentPerformance
                      agents={advanced.agents}
                      unassignedLeads={advanced.unassigned_leads}
                    />
                  </>
                )}

                {/* Summary footer */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                  <KPICard
                    label="Mensagens hoje"
                    value={stats.messages_today}
                    icon={MessageSquare}
                    index={0}
                  />
                  <KPICard
                    label="Convertidos"
                    value={stats.status_counts['convertido'] || 0}
                    icon={Users}
                    index={1}
                  />
                  <KPICard
                    label="Em Negociação"
                    value={stats.status_counts['negociando'] || 0}
                    icon={TrendingUp}
                    index={2}
                  />
                  <KPICard
                    label="Qualificados"
                    value={stats.status_counts['qualificado'] || 0}
                    icon={Activity}
                    index={3}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
      
      {/* Jarvis — Voice Assistant */}
      <JarvisButton />
    </AppShell>
  );
}