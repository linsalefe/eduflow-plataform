'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

interface FunnelHeroProps {
  statusCounts: Record<string, number>;
  totalContacts: number;
}

const STAGES = [
  { key: 'novo',          label: 'Novos',       accent: 'blue' },
  { key: 'em_contato',    label: 'Em contato',  accent: 'neutral' },
  { key: 'qualificado',   label: 'Qualificados',accent: 'neutral' },
  { key: 'negociando',    label: 'Negociando',  accent: 'neutral' },
  { key: 'matriculado',   label: 'Vendidos',    accent: 'green' },
] as const;

const STAGE_STYLE: Record<string, { bg: string; border: string; title: string; subtitle: string }> = {
  blue:    { bg: '#E6F1FB', border: '#B5D4F4', title: '#042C53', subtitle: '#185FA5' },
  green:   { bg: '#E1F5EE', border: '#9FE1CB', title: '#04342C', subtitle: '#0F6E56' },
  neutral: { bg: 'var(--color-background-secondary, #F1EFE8)', border: 'transparent', title: 'var(--foreground)', subtitle: 'var(--muted-foreground)' },
};

export function FunnelHero({ statusCounts, totalContacts }: FunnelHeroProps) {
  const router = useRouter();

  const total = STAGES.reduce((sum, s) => sum + (statusCounts[s.key] || 0), 0);
  const converted = statusCounts['matriculado'] || 0;
  const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : '0';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-card border border-border/60 rounded-xl p-4 lg:p-5"
    >
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="text-[16px] font-medium text-foreground">Funil de vendas</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {totalContacts} leads no total
          </p>
        </div>
        <button
          onClick={() => router.push('/pipeline')}
          className="text-[12px] text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-3 py-1 transition-colors"
        >
          Abrir pipeline
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {STAGES.map((stage) => {
          const count = statusCounts[stage.key] || 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const style = STAGE_STYLE[stage.accent];

          return (
            <div
              key={stage.key}
              className="rounded-lg p-3"
              style={{
                background: style.bg,
                border: stage.accent === 'neutral' ? '1px solid transparent' : `0.5px solid ${style.border}`,
              }}
            >
              <p className="text-[11px] leading-none mb-1.5" style={{ color: style.subtitle }}>
                {stage.label}
              </p>
              <p className="text-[24px] font-medium leading-none tabular-nums" style={{ color: style.title }}>
                {count}
              </p>
              <p className="text-[10px] mt-1.5 leading-none" style={{ color: style.subtitle }}>
                {pct}%
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
        <span className="text-[12px] text-muted-foreground">Taxa de conversão</span>
        <span className="text-[13px] font-medium tabular-nums">
          {conversionRate}% · {converted} de {total}
        </span>
      </div>
    </motion.div>
  );
}
