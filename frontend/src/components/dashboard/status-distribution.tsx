'use client';

import { Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const statusLabels: Record<string, string> = {
  novo: 'Novos Leads',
  em_contato: 'Em Contato',
  qualificado: 'Qualificados',
  negociando: 'Em Negociação',
  convertido: 'Convertidos',
  perdido: 'Perdidos',
};

const statusColors: Record<string, { bg: string; text: string; bar: string; dot: string }> = {
  novo: { bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-500', dot: 'bg-blue-500' },
  em_contato: { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-500', dot: 'bg-amber-500' },
  qualificado: { bg: 'bg-purple-50', text: 'text-purple-700', bar: 'bg-purple-500', dot: 'bg-purple-500' },
  negociando: { bg: 'bg-cyan-50', text: 'text-cyan-700', bar: 'bg-cyan-500', dot: 'bg-cyan-500' },
  convertido: { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  perdido: { bg: 'bg-red-50', text: 'text-red-700', bar: 'bg-red-500', dot: 'bg-red-500' },
};

interface StatusDistributionProps {
  statusCounts: Record<string, number>;
  totalContacts: number;
  loading?: boolean;
}

export function StatusDistribution({ statusCounts, totalContacts, loading = false }: StatusDistributionProps) {
  if (loading) {
    return (
      <Card className="p-[var(--card-pad,16px)]">
        <Skeleton className="h-4 w-36 mb-4" />
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-[var(--card-pad,16px)] shadow-[var(--shadow-xs)] border border-border">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-[var(--font-size-body)] font-semibold text-foreground">Funil de Vendas</h3>
          <p className="text-[var(--font-size-caption)] text-muted-foreground mt-0.5">
            <span className="font-semibold text-foreground">{totalContacts}</span> contatos
          </p>
        </div>
        <div className="h-9 w-9 bg-purple-50 rounded-lg flex items-center justify-center">
          <Activity className="h-4 w-4 text-purple-600" strokeWidth={1.75} />
        </div>
      </div>

      <div className="space-y-3.5">
        {Object.entries(statusLabels).map(([key, label]) => {
          const count = statusCounts[key] || 0;
          const pct = totalContacts > 0 ? (count / totalContacts) * 100 : 0;
          const colors = statusColors[key];
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                  <span className="text-[13px] text-muted-foreground">{label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${colors.bg} ${colors.text}`}>
                    {count}
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full ${colors.bar} rounded-full transition-all duration-700 ease-out`}
                  style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}