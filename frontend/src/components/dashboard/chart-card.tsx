'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Period = '7d' | '30d' | '90d' | '12m';

interface ChartCardProps {
  title: string;
  description?: string;
  periods?: Period[];
  defaultPeriod?: Period;
  onPeriodChange?: (period: Period) => void;
  children: React.ReactNode;
  loading?: boolean;
  className?: string;
  actions?: React.ReactNode;
}

const periodLabels: Record<Period, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
  '12m': '12 meses',
};

export function ChartCard({
  title,
  description,
  periods,
  defaultPeriod = '30d',
  onPeriodChange,
  children,
  loading = false,
  className,
  actions,
}: ChartCardProps) {
  const [activePeriod, setActivePeriod] = useState<Period>(defaultPeriod);

  const handlePeriodChange = (period: Period) => {
    setActivePeriod(period);
    onPeriodChange?.(period);
  };

  if (loading) return <ChartCardSkeleton />;

  return (
    <Card
      className={cn(
        'p-[var(--card-pad,16px)] shadow-[var(--shadow-xs)] border border-border',
        className
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[var(--font-size-body)] font-semibold text-foreground">
            {title}
          </h3>
          {description && (
            <p className="text-[var(--font-size-caption)] text-muted-foreground mt-0.5">
              {description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {periods && periods.length > 0 && (
            <div className="flex items-center bg-muted rounded-lg p-0.5">
              {periods.map((period) => (
                <button
                  key={period}
                  onClick={() => handlePeriodChange(period)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
                    activePeriod === period
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {periodLabels[period]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="w-full">{children}</div>
    </Card>
  );
}

function ChartCardSkeleton() {
  return (
    <Card className="p-[var(--card-pad,16px)]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <Skeleton className="h-4 w-32 mb-1" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-7 w-40 rounded-lg" />
      </div>
      <Skeleton className="h-[200px] w-full rounded-lg" />
    </Card>
  );
}