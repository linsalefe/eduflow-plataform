'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartCard } from '@/components/dashboard/chart-card';
import { chartTooltipStyle, chartGridStyle } from '@/lib/chart-config';

interface DailyMessagesChartProps {
  data: { date: string; day: string; count: number }[];
  messagesWeek: number;
  loading?: boolean;
}

export function DailyMessagesChart({ data, messagesWeek, loading = false }: DailyMessagesChartProps) {
  return (
    <ChartCard
      title="Mensagens na semana"
      description={`${messagesWeek} nos últimos 7 dias`}
      loading={loading}
    >
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="msgGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...chartGridStyle} vertical={false} />
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            allowDecimals={false}
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
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#msgGradient)"
            animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}