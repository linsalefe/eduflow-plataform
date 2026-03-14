'use client';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus, LucideIcon } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  previousValue?: string;
  loading?: boolean;
  className?: string;
}

export function KPICard({
  label,
  value,
  icon: Icon,
  trend,
  trendValue,
  previousValue,
  loading = false,
  className,
}: KPICardProps) {
  if (loading) return <KPICardSkeleton />;

  const trendConfig = {
    up: { icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    down: { icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
    neutral: { icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted' },
  };

  const trendInfo = trend ? trendConfig[trend] : null;
  const TrendIcon = trendInfo?.icon;

  return (
    <Card
      className={cn(
        'p-[var(--card-pad,16px)] shadow-[var(--shadow-xs)] border border-border hover:shadow-[var(--shadow-sm)] transition-shadow',
        className
      )}
    >
      {/* Header: label + icon */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[var(--font-size-caption)] text-muted-foreground font-medium">
          {label}
        </span>
        {Icon && (
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
          </div>
        )}
      </div>

      {/* Value */}
      <p className="text-[var(--font-size-h1)] font-bold text-foreground tabular-nums leading-tight">
        {value}
      </p>

      {/* Trend + comparison */}
      {(trendValue || previousValue) && (
        <div className="flex items-center gap-2 mt-2">
          {trendValue && trendInfo && TrendIcon && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded',
                trendInfo.color,
                trendInfo.bg
              )}
            >
              <TrendIcon className="h-3 w-3" />
              {trendValue}
            </span>
          )}
          {previousValue && (
            <span className="text-[var(--font-size-caption)] text-muted-foreground">
              vs. {previousValue}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

function KPICardSkeleton() {
  return (
    <Card className="p-[var(--card-pad,16px)]">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-20 mb-2" />
      <Skeleton className="h-3 w-32" />
    </Card>
  );
}