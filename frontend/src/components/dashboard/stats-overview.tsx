'use client';

import { Users, UserPlus, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { KPICard } from '@/components/dashboard/kpi-card';

interface StatsOverviewProps {
  totalContacts: number;
  newToday: number;
  inboundToday: number;
  outboundToday: number;
  loading?: boolean;
}

const cards = [
  { key: 'totalContacts', label: 'Total de contatos', icon: Users },
  { key: 'newToday', label: 'Novos hoje', icon: UserPlus },
  { key: 'inboundToday', label: 'Recebidas hoje', icon: ArrowDownLeft },
  { key: 'outboundToday', label: 'Enviadas hoje', icon: ArrowUpRight },
] as const;

export function StatsOverview({
  totalContacts,
  newToday,
  inboundToday,
  outboundToday,
  loading = false,
}: StatsOverviewProps) {
  const values: Record<string, number> = {
    totalContacts,
    newToday,
    inboundToday,
    outboundToday,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      {cards.map((card, i) => (
        <KPICard
          key={card.key}
          label={card.label}
          value={values[card.key]}
          icon={card.icon}
          loading={loading}
          index={i}
        />
      ))}
    </div>
  );
}