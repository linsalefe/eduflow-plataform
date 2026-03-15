'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Target, DollarSign, Users, CalendarCheck, Save, Loader2,
  TrendingUp, Pencil, Check, X, ChevronRight, Sparkles,
} from 'lucide-react';
import AppShell from '@/components/app-shell';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import { toast } from 'sonner';

/* ============================================================
   PROGRESS RING — SVG circular indicator
   ============================================================ */
function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 8,
  color = 'var(--primary)',
  bgColor = 'var(--border)',
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(progress, 100) / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={bgColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Progress ring */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.3 }}
      />
    </svg>
  );
}

/* ============================================================
   ANIMATED COUNTER
   ============================================================ */
function AnimatedValue({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    let start: number | null = null;
    const duration = 800;
    const animate = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);

  return <>{prefix}{display.toLocaleString('pt-BR')}{suffix}</>;
}

/* ============================================================
   GOAL CARD — Card individual de meta com ring e edição inline
   ============================================================ */
interface GoalCardProps {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  ringColor: string;
  title: string;
  description: string;
  currentValue: number;
  goalValue: string;
  onGoalChange: (v: string) => void;
  format: (v: number) => string;
  placeholder: string;
  prefix?: string;
  index: number;
}

function GoalCard({
  icon: Icon,
  iconColor,
  iconBg,
  ringColor,
  title,
  description,
  currentValue,
  goalValue,
  onGoalChange,
  format,
  placeholder,
  prefix,
  index,
}: GoalCardProps) {
  const [editing, setEditing] = useState(false);
  const goal = parseFloat(goalValue) || 0;
  const progress = goal > 0 ? Math.round((currentValue / goal) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <Card className="p-5 shadow-[var(--shadow-xs)] border border-border hover:shadow-[var(--shadow-sm)] transition-all duration-200">
        <div className="flex items-start gap-5">

          {/* Progress ring + percentage */}
          <div className="relative flex-shrink-0">
            <ProgressRing progress={progress} size={96} strokeWidth={7} color={ringColor} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[20px] font-bold text-foreground tabular-nums leading-none">
                {goal > 0 ? <AnimatedValue value={progress} suffix="%" /> : '—'}
              </span>
              {goal > 0 && (
                <span className="text-[10px] text-muted-foreground mt-0.5">concluído</span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className={`h-7 w-7 rounded-lg ${iconBg} flex items-center justify-center`}>
                <Icon className={`h-3.5 w-3.5 ${iconColor}`} strokeWidth={1.75} />
              </div>
              <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
            </div>
            <p className="text-[12px] text-muted-foreground mb-3">{description}</p>

            {/* Current vs Goal */}
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">Atual</p>
                <p className="text-[18px] font-bold text-foreground tabular-nums leading-tight">
                  {format(currentValue)}
                </p>
              </div>

              <div className="text-right">
                <p className="text-[11px] text-muted-foreground mb-0.5">Meta</p>
                {editing ? (
                  <div className="flex items-center gap-1.5">
                    {prefix && (
                      <span className="text-[13px] text-muted-foreground">{prefix}</span>
                    )}
                    <input
                      type="number"
                      value={goalValue}
                      onChange={(e) => onGoalChange(e.target.value)}
                      placeholder={placeholder}
                      autoFocus
                      className="w-24 text-right text-[16px] font-bold tabular-nums bg-transparent border-b-2 border-primary/40 focus:border-primary outline-none py-0.5 text-foreground transition-colors"
                      onKeyDown={(e) => { if (e.key === 'Enter') setEditing(false); }}
                    />
                    <button
                      onClick={() => setEditing(false)}
                      className="p-1 hover:bg-muted rounded-md transition-colors"
                    >
                      <Check className="h-3.5 w-3.5 text-primary" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditing(true)}
                    className="group flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                  >
                    <span className="text-[18px] font-bold text-foreground tabular-nums leading-tight">
                      {goal > 0 ? format(goal) : '—'}
                    </span>
                    <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {goal > 0 && (
              <div className="mt-3">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: ringColor }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(progress, 100)}%` }}
                    transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
                  />
                </div>
                {goal > 0 && currentValue < goal && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Faltam <span className="font-semibold text-foreground">{format(goal - currentValue)}</span> para bater a meta
                  </p>
                )}
                {currentValue >= goal && goal > 0 && (
                  <p className="text-[11px] text-emerald-600 font-medium mt-1.5 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Meta atingida!
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

/* ============================================================
   MAIN PAGE
   ============================================================ */
export default function MetasPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Goal values (editable)
  const [monthlyGoal, setMonthlyGoal] = useState('');
  const [monthlyLeadGoal, setMonthlyLeadGoal] = useState('');
  const [monthlyScheduleGoal, setMonthlyScheduleGoal] = useState('');

  // Current progress values (from API)
  const [currentRevenue, setCurrentRevenue] = useState(0);
  const [currentLeads, setCurrentLeads] = useState(0);
  const [currentSchedules, setCurrentSchedules] = useState(0);

  useEffect(() => {
    if (!user) return;
    loadGoals();
    loadProgress();
  }, [user]);

  const loadGoals = async () => {
    try {
      const res = await api.get('/tenant/goals');
      const data = res.data;
      setMonthlyGoal(data.monthly_goal ? String(data.monthly_goal) : '');
      setMonthlyLeadGoal(data.monthly_lead_goal ? String(data.monthly_lead_goal) : '');
      setMonthlyScheduleGoal(data.monthly_schedule_goal ? String(data.monthly_schedule_goal) : '');
    } catch {
      // silently fail — goals might not exist yet
    } finally {
      setLoading(false);
    }
  };

  const loadProgress = async () => {
    try {
      // Try to get current values from dashboard stats
      const [statsRes, advRes] = await Promise.all([
        api.get('/dashboard/stats').catch(() => null),
        api.get('/dashboard/advanced').catch(() => null),
      ]);

      if (statsRes?.data) {
        setCurrentLeads(statsRes.data.new_today || 0);
      }
      if (advRes?.data) {
        setCurrentLeads(advRes.data.new_this_week || 0);
      }

      // Try financial data
      const finRes = await api.get('/financial/entries').catch(() => null);
      if (finRes?.data) {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const revenue = finRes.data
          .filter((e: any) => e.type === 'income' && new Date(e.date) >= monthStart)
          .reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
        setCurrentRevenue(revenue);
      }
    } catch {
      // Use zeros if can't load
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
      toast.success('Metas atualizadas!');
    } catch {
      toast.error('Erro ao salvar metas');
    } finally {
      setSaving(false);
    }
  };

  // Month context
  const now = new Date();
  const monthName = now.toLocaleDateString('pt-BR', { month: 'long' });
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();
  const monthProgress = Math.round((now.getDate() / daysInMonth) * 100);

  const formatCurrency = (v: number) => {
    if (v >= 1000) return `R$ ${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
    return `R$ ${v.toLocaleString('pt-BR')}`;
  };

  if (!user) return null;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto py-6 px-4" data-density="low">

        <PageHeader
          title="Metas Mensais"
          description={`${monthName.charAt(0).toUpperCase() + monthName.slice(1)} — ${daysLeft} dias restantes`}
          badge={`${monthProgress}% do mês`}
        />

        {loading ? (
          <div className="space-y-4 mt-6">
            {[1, 2, 3].map(i => (
              <Card key={i} className="p-5">
                <div className="flex items-start gap-5">
                  <Skeleton className="h-24 w-24 rounded-full" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-4 mt-6">

            {/* Month progress bar */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="px-5 py-3.5 shadow-[var(--shadow-xs)] border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] text-muted-foreground font-medium">Progresso do mês</span>
                  <span className="text-[12px] text-foreground font-semibold tabular-nums">{now.getDate()}/{daysInMonth} dias</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary/40 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${monthProgress}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </div>
              </Card>
            </motion.div>

            {/* Goal cards */}
            <GoalCard
              icon={DollarSign}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-500/10"
              ringColor="#059669"
              title="Faturamento"
              description="Meta de receita mensal"
              currentValue={currentRevenue}
              goalValue={monthlyGoal}
              onGoalChange={setMonthlyGoal}
              format={formatCurrency}
              placeholder="30000"
              prefix="R$"
              index={0}
            />

            <GoalCard
              icon={Users}
              iconColor="text-primary"
              iconBg="bg-primary/10"
              ringColor="var(--primary)"
              title="Captação de Leads"
              description="Novos leads no mês"
              currentValue={currentLeads}
              goalValue={monthlyLeadGoal}
              onGoalChange={setMonthlyLeadGoal}
              format={(v) => v.toLocaleString('pt-BR')}
              placeholder="200"
              index={1}
            />

            <GoalCard
              icon={CalendarCheck}
              iconColor="text-violet-600"
              iconBg="bg-violet-500/10"
              ringColor="#7c3aed"
              title="Agendamentos"
              description="Reuniões e ligações agendadas"
              currentValue={currentSchedules}
              goalValue={monthlyScheduleGoal}
              onGoalChange={setMonthlyScheduleGoal}
              format={(v) => v.toLocaleString('pt-BR')}
              placeholder="50"
              index={2}
            />

            {/* Save button */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
            >
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full h-11 shadow-sm"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {saving ? 'Salvando...' : 'Salvar Metas'}
              </Button>
            </motion.div>
          </div>
        )}
      </div>
    </AppShell>
  );
}