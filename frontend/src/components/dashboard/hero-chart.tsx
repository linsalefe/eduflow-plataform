'use client';

import {
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { chartTooltipStyle } from '@/lib/chart-config';
import { AnimatedNumber } from './animated-number';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface HeroChartProps {
  data: { date: string; day: string; count: number }[];
  totalWeek: number;
  trendPct?: number;
}

export function HeroChart({ data, totalWeek, trendPct }: HeroChartProps) {
  const isUp = (trendPct ?? 0) >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <Card className="relative overflow-hidden border border-border shadow-[var(--shadow-xs)]">
        {/* Gradient background overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-transparent pointer-events-none" />

        {/* Content overlay */}
        <div className="relative z-10 p-6 pb-0">
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-[var(--font-size-caption)] text-muted-foreground font-medium mb-1">
                Mensagens na semana
              </p>
              <div className="flex items-baseline gap-3">
                <span className="text-[32px] font-bold text-foreground tabular-nums leading-none">
                  <AnimatedNumber value={totalWeek} duration={1000} />
                </span>
                {trendPct !== undefined && (
                  <span className={`inline-flex items-center gap-1 text-[13px] font-semibold ${
                    isUp ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {isUp ? '+' : ''}{trendPct}% vs. semana anterior
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Chart — bleeds to card edges */}
        <div className="relative z-0 -mx-px">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="heroGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                dy={10}
              />
              <Tooltip
                contentStyle={chartTooltipStyle.contentStyle}
                labelStyle={chartTooltipStyle.labelStyle}
                itemStyle={chartTooltipStyle.itemStyle}
                formatter={(value: number) => [value, 'Mensagens']}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--primary)"
                strokeWidth={2.5}
                fill="url(#heroGradient)"
                animationDuration={1200}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </motion.div>
  );
}