'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import AppShell from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import api from '@/lib/api';
import { toast } from 'sonner';

import { GreetingHeader } from '@/components/dashboard/greeting-header';
import { JarvisHeroCard } from '@/components/dashboard/jarvis-hero-card';
import { FunnelHero } from '@/components/dashboard/funnel-hero';
import { LatestLeadsTable } from '@/components/dashboard/latest-leads-table';
import { SourceBreakdown } from '@/components/dashboard/source-breakdown';
import { TagDistribution } from '@/components/dashboard/tag-distribution';
import { KPICard } from '@/components/dashboard/kpi-card';
import { EmptyState } from '@/components/ui/empty-state';
import { DashboardSkeleton } from '@/components/skeletons/dashboard-skeleton';
import { WhatsNewModal } from '@/components/dashboard/whats-new-modal';

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

interface Contact {
  wa_id: string;
  name: string | null;
  lead_status?: string | null;
  channel_id?: number | null;
  created_at?: string | null;
}

interface Channel {
  id: number;
  name: string;
  type?: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [advanced, setAdvanced] = useState<AdvancedStats | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadAll();
      const interval = setInterval(loadAll, 60000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const loadAll = async () => {
    try {
      const [statsRes, advRes, contactsRes, channelsRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/dashboard/advanced'),
        api.get('/contacts').catch(() => ({ data: [] })),
        api.get('/channels').catch(() => ({ data: [] })),
      ]);
      setStats(statsRes.data);
      setAdvanced(advRes.data);
      setContacts(Array.isArray(contactsRes.data) ? contactsRes.data : []);
      setChannels(Array.isArray(channelsRes.data) ? channelsRes.data : []);
    } catch {
      toast.error('Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !user) return null;

  const channelNameById = new Map(channels.map((c) => [c.id, c.name]));

  const latestLeads = [...contacts]
    .sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    })
    .slice(0, 5)
    .map((c) => ({
      wa_id: c.wa_id,
      name: c.name,
      lead_status: c.lead_status,
      created_at: c.created_at,
      channel_name: c.channel_id ? channelNameById.get(c.channel_id) || 'WhatsApp' : 'WhatsApp',
    }));

  const sourceMap = new Map<string, number>();
  for (const c of contacts) {
    const name = c.channel_id ? channelNameById.get(c.channel_id) || 'Outros' : 'Outros';
    sourceMap.set(name, (sourceMap.get(name) || 0) + 1);
  }
  const sources = Array.from(sourceMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <AppShell>
      <WhatsNewModal />
      <div className="space-y-4 lg:space-y-5 max-w-7xl mx-auto pb-6" data-density="high">
        <GreetingHeader />

        {loading || !stats ? (
          <DashboardSkeleton />
        ) : (
          <>
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
                <JarvisHeroCard />

                <FunnelHero />

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KPICard label="Total de contatos" value={stats.total_contacts} index={0} />
                  <KPICard label="Novos hoje" value={stats.new_today} index={1} />
                  <KPICard label="Recebidas hoje" value={stats.inbound_today} index={2} />
                  <KPICard label="Enviadas hoje" value={stats.outbound_today} index={3} />
                </div>

                <LatestLeadsTable leads={latestLeads} />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                  <SourceBreakdown sources={sources} />
                  {advanced && advanced.tags && advanced.tags.length > 0 && (
                    <TagDistribution tags={advanced.tags} />
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
