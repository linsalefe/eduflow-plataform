'use client';

import { Hash } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Tag {
  name: string;
  color: string;
  count: number;
}

const tagBarColors: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  amber: 'bg-amber-500',
  pink: 'bg-pink-500',
  cyan: 'bg-cyan-500',
};

const tagBadgeColors: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-700' },
  green: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  red: { bg: 'bg-red-100', text: 'text-red-700' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-700' },
  cyan: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
};

interface TagDistributionProps {
  tags: Tag[];
  loading?: boolean;
}

export function TagDistribution({ tags, loading = false }: TagDistributionProps) {
  if (loading) {
    return (
      <Card className="p-[var(--card-pad,16px)]">
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-10" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const maxCount = Math.max(...tags.map((t) => t.count), 1);

  return (
    <Card className="p-[var(--card-pad,16px)] shadow-[var(--shadow-xs)] border border-border">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-[var(--font-size-body)] font-semibold text-foreground">Leads por Tag</h3>
          <p className="text-[var(--font-size-caption)] text-muted-foreground mt-0.5">Distribuição das tags mais usadas</p>
        </div>
        <div className="h-9 w-9 bg-purple-50 rounded-lg flex items-center justify-center">
          <Hash className="h-4 w-4 text-purple-600" strokeWidth={1.75} />
        </div>
      </div>

      {tags.length === 0 ? (
        <div className="text-center py-6">
          <Hash className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">Nenhuma tag utilizada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tags.map((tag) => {
            const pct = (tag.count / maxCount) * 100;
            const badge = tagBadgeColors[tag.color] || tagBadgeColors.blue;
            const bar = tagBarColors[tag.color] || 'bg-blue-500';
            return (
              <div key={tag.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Hash className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[13px] text-muted-foreground">{tag.name}</span>
                  </div>
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${badge.bg} ${badge.text}`}>
                    {tag.count}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${bar} rounded-full transition-all duration-700 ease-out`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}