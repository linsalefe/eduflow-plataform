'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Target, DollarSign, Users, CalendarCheck, Save, Loader2 } from 'lucide-react';
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
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Metas Mensais</h1>
            <p className="text-sm text-muted-foreground">
              Configure suas metas para acompanhar pelo Jarvis e dashboard
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">

            {/* Meta de Faturamento */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <DollarSign className="h-4.5 w-4.5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-foreground">Meta de Faturamento</p>
                  <p className="text-[12px] text-muted-foreground">Valor em reais que deseja faturar no mês</p>
                </div>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <input
                  type="number"
                  value={monthlyGoal}
                  onChange={(e) => setMonthlyGoal(e.target.value)}
                  placeholder="30000"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                />
              </div>
            </div>

            {/* Meta de Leads */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Users className="h-4.5 w-4.5 text-blue-500" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-foreground">Meta de Leads</p>
                  <p className="text-[12px] text-muted-foreground">Quantidade de leads que deseja captar no mês</p>
                </div>
              </div>
              <input
                type="number"
                value={monthlyLeadGoal}
                onChange={(e) => setMonthlyLeadGoal(e.target.value)}
                placeholder="200"
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
            </div>

            {/* Meta de Agendamentos */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <CalendarCheck className="h-4.5 w-4.5 text-violet-500" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-foreground">Meta de Agendamentos</p>
                  <p className="text-[12px] text-muted-foreground">Quantidade de reuniões/ligações agendadas no mês</p>
                </div>
              </div>
              <input
                type="number"
                value={monthlyScheduleGoal}
                onChange={(e) => setMonthlyScheduleGoal(e.target.value)}
                placeholder="50"
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? 'Salvando...' : 'Salvar Metas'}
            </button>

          </div>
        )}
      </div>
    </AppShell>
  );
}