'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DollarSign, Users, CalendarCheck,
  Save, Loader2, TrendingUp,
} from 'lucide-react';
import AppShell from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import api from '@/lib/api';
import { toast } from 'sonner';

export default function MetasPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [monthlyGoal, setMonthlyGoal] = useState('');
  const [monthlyLeadGoal, setMonthlyLeadGoal] = useState('');
  const [monthlyScheduleGoal, setMonthlyScheduleGoal] = useState('');

  useEffect(() => {
    if (!user) return;
    loadGoals();
  }, [user]);

  const loadGoals = async () => {
    try {
      const res = await api.get('/tenant/goals');
      const data = res.data;
      setMonthlyGoal(data.monthly_goal ? String(data.monthly_goal) : '');
      setMonthlyLeadGoal(data.monthly_lead_goal ? String(data.monthly_lead_goal) : '');
      setMonthlyScheduleGoal(data.monthly_schedule_goal ? String(data.monthly_schedule_goal) : '');
    } catch {
      toast.error('Erro ao carregar metas');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/tenant/goals', {
        monthly_goal: parseFloat(monthlyGoal) || 0,
        monthly_lead_goal: parseInt(monthlyLeadGoal) || 0,
        monthly_schedule_goal: parseInt(monthlyScheduleGoal) || 0,
      });
      toast.success('Metas atualizadas com sucesso!');
    } catch {
      toast.error('Erro ao salvar metas');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto py-8 px-4">

        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
            <TrendingUp className="h-6 w-6 text-primary" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold text-foreground tracking-tight">Metas Mensais</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Configure suas metas para acompanhar pelo Jarvis e dashboard
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">

            {/* Meta de Faturamento */}
            <div className="group rounded-2xl border border-border bg-card p-6 hover:border-emerald-500/30 hover:shadow-sm transition-all duration-200">
              <div className="flex items-center gap-3.5 mb-5">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 flex items-center justify-center border border-emerald-500/10">
                  <DollarSign className="h-5 w-5 text-emerald-600" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-foreground">Meta de Faturamento</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Valor em reais que deseja faturar no mês</p>
                </div>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] font-medium text-muted-foreground">R$</span>
                <input
                  type="number"
                  value={monthlyGoal}
                  onChange={(e) => setMonthlyGoal(e.target.value)}
                  placeholder="30000"
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-border bg-background text-foreground text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition-all"
                />
              </div>
            </div>

            {/* Meta de Leads */}
            <div className="group rounded-2xl border border-border bg-card p-6 hover:border-blue-500/30 hover:shadow-sm transition-all duration-200">
              <div className="flex items-center gap-3.5 mb-5">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/15 to-blue-500/5 flex items-center justify-center border border-blue-500/10">
                  <Users className="h-5 w-5 text-blue-600" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-foreground">Meta de Leads</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Quantidade de leads que deseja captar no mês</p>
                </div>
              </div>
              <input
                type="number"
                value={monthlyLeadGoal}
                onChange={(e) => setMonthlyLeadGoal(e.target.value)}
                placeholder="200"
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all"
              />
            </div>

            {/* Meta de Agendamentos */}
            <div className="group rounded-2xl border border-border bg-card p-6 hover:border-violet-500/30 hover:shadow-sm transition-all duration-200">
              <div className="flex items-center gap-3.5 mb-5">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500/15 to-violet-500/5 flex items-center justify-center border border-violet-500/10">
                  <CalendarCheck className="h-5 w-5 text-violet-600" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-foreground">Meta de Agendamentos</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Quantidade de reuniões e ligações agendadas no mês</p>
                </div>
              </div>
              <input
                type="number"
                value={monthlyScheduleGoal}
                onChange={(e) => setMonthlyScheduleGoal(e.target.value)}
                placeholder="50"
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground text-[15px] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/40 transition-all"
              />
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-[14px] font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2.5 shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/25 mt-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" strokeWidth={2} />
              )}
              {saving ? 'Salvando...' : 'Salvar Metas'}
            </button>

          </div>
        )}
      </div>
    </AppShell>
  );
}