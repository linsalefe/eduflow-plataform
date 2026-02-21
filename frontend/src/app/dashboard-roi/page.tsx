'use client';
import { useEffect, useState } from 'react';
import {
  BarChart3, TrendingUp, Users, Target, DollarSign,
  Loader2, ArrowUpRight, Filter, Globe, Megaphone, FileText,
  PieChart
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { toast } from 'sonner';
import api from '@/lib/api';

interface ROIData {
  total_leads: number;
  by_source: { source: string; total: number }[];
  by_campaign: { campaign: string; total: number }[];
  by_page: { title: string; slug: string; total: number }[];
  by_day: { day: string; total: number }[];
  funnel: Record<string, number>;
}

const sourceIcons: Record<string, string> = {
  meta: '📘', google: '🔍', instagram: '📸', tiktok: '🎵',
  linkedin: '💼', email: '📧', whatsapp: '💬', direto: '🌐',
};

const statusLabels: Record<string, string> = {
  novo: 'Novos', em_contato: 'Em contato', qualificado: 'Qualificados',
  negociando: 'Negociando', convertido: 'Matriculados', perdido: 'Perdidos',
};

const statusColors: Record<string, string> = {
  novo: '#6366f1', em_contato: '#f59e0b', qualificado: '#8b5cf6',
  negociando: '#06b6d4', convertido: '#10b981', perdido: '#ef4444',
};

export default function DashboardROIPage() {
  const [data, setData] = useState<ROIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/landing-pages/dashboard/roi');
        setData(res.data);
      } catch (err) {
        toast.error('Erro na operação');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading || !data) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 text-[#6366f1] animate-spin" />
        </div>
      </AppLayout>
    );
  }

  const maxDay = Math.max(...data.by_day.map(d => d.total), 1);
  const totalFunnel = Object.values(data.funnel).reduce((a, b) => a + b, 0);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-8">

        {/* Header */}
        <div className={`transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Dashboard de Campanhas</h1>
          <p className="text-sm text-gray-400 mt-1">Acompanhe o ROI das suas landing pages e campanhas</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total de Leads', value: data.total_leads, icon: Users, color: '#6366f1', bg: 'bg-indigo-50' },
            { label: 'Origens ativas', value: data.by_source.length, icon: Globe, color: '#06b6d4', bg: 'bg-cyan-50' },
            { label: 'Campanhas', value: data.by_campaign.length, icon: Megaphone, color: '#f59e0b', bg: 'bg-amber-50' },
            { label: 'Landing Pages', value: data.by_page.length, icon: FileText, color: '#10b981', bg: 'bg-emerald-50' },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-2xl p-5 border border-gray-100 hover:shadow-sm transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center`}>
                  <card.icon className="w-[18px] h-[18px]" style={{ color: card.color }} />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-gray-900 tabular-nums">{card.value}</p>
              <p className="text-[13px] text-gray-400 mt-0.5">{card.label}</p>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Leads por dia */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900">Leads por dia</h2>
                <p className="text-sm text-gray-400 mt-0.5">Últimos 30 dias</p>
              </div>
              <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-[#6366f1]" />
              </div>
            </div>

            {data.by_day.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                Nenhum lead registrado nos últimos 30 dias
              </div>
            ) : (
              <div className="flex items-end gap-1 h-48">
                {data.by_day.map((day, i) => {
                  const pct = (day.total / maxDay) * 100;
                  const date = new Date(day.day + 'T12:00:00');
                  const label = `${date.getDate()}/${date.getMonth() + 1}`;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group cursor-default">
                      <span className="text-[10px] font-semibold text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                        {day.total}
                      </span>
                      <div className="w-full bg-gray-50 rounded-md overflow-hidden" style={{ height: '130px' }}>
                        <div
                          className="w-full bg-[#6366f1] rounded-md transition-all duration-300 group-hover:bg-[#4f46e5]"
                          style={{
                            height: `${Math.max(pct, day.total > 0 ? 8 : 2)}%`,
                            marginTop: `${100 - Math.max(pct, day.total > 0 ? 8 : 2)}%`,
                          }}
                        />
                      </div>
                      <span className="text-[9px] text-gray-400 tabular-nums">{label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Por origem */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900">Por origem</h2>
                <p className="text-sm text-gray-400 mt-0.5">utm_source</p>
              </div>
              <div className="w-9 h-9 bg-cyan-50 rounded-lg flex items-center justify-center">
                <Globe className="w-4 h-4 text-cyan-600" />
              </div>
            </div>

            {data.by_source.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhuma origem registrada</p>
            ) : (
              <div className="space-y-3">
                {data.by_source.map((s) => {
                  const pct = data.total_leads > 0 ? (s.total / data.total_leads) * 100 : 0;
                  return (
                    <div key={s.source}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{sourceIcons[s.source.toLowerCase()] || '🌐'}</span>
                          <span className="text-[13px] font-medium text-gray-700 capitalize">{s.source}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-400">{pct.toFixed(0)}%</span>
                          <span className="text-[11px] font-bold text-[#6366f1] bg-indigo-50 px-1.5 py-0.5 rounded-md tabular-nums">{s.total}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#6366f1] rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Por campanha */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900">Por campanha</h2>
                <p className="text-sm text-gray-400 mt-0.5">utm_campaign</p>
              </div>
              <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
                <Megaphone className="w-4 h-4 text-amber-600" />
              </div>
            </div>

            {data.by_campaign.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhuma campanha registrada</p>
            ) : (
              <div className="space-y-3">
                {data.by_campaign.map((c) => {
                  const pct = data.total_leads > 0 ? (c.total / data.total_leads) * 100 : 0;
                  return (
                    <div key={c.campaign} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                          <Target className="w-4 h-4 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-[13px] font-medium text-gray-800">{c.campaign}</p>
                          <p className="text-[11px] text-gray-400">{pct.toFixed(0)}% dos leads</p>
                        </div>
                      </div>
                      <span className="text-lg font-bold text-gray-900 tabular-nums">{c.total}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Por landing page */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900">Por Landing Page</h2>
                <p className="text-sm text-gray-400 mt-0.5">Leads por página</p>
              </div>
              <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
                <FileText className="w-4 h-4 text-emerald-600" />
              </div>
            </div>

            {data.by_page.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhuma landing page com leads</p>
            ) : (
              <div className="space-y-3">
                {data.by_page.map((p) => {
                  const pct = data.total_leads > 0 ? (p.total / data.total_leads) * 100 : 0;
                  return (
                    <div key={p.slug} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <FileText className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-[13px] font-medium text-gray-800">{p.title}</p>
                          <p className="text-[11px] text-gray-400">/lp/{p.slug}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-bold text-gray-900 tabular-nums">{p.total}</span>
                        <p className="text-[11px] text-gray-400">leads</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </AppLayout>
  );
}