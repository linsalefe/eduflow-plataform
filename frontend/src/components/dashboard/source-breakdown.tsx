'use client';

import { motion } from 'framer-motion';

interface SourceItem {
  name: string;
  count: number;
}

interface SourceBreakdownProps {
  sources: SourceItem[];
}

export function SourceBreakdown({ sources }: SourceBreakdownProps) {
  if (sources.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className="bg-card border border-border/60 rounded-xl p-4 lg:p-5"
    >
      <h3 className="text-[14px] font-medium text-foreground mb-3">Origem dos leads</h3>
      <div className="divide-y divide-border/60">
        {sources.map((s) => (
          <div key={s.name} className="flex items-center justify-between py-2">
            <span className="text-[12px] text-muted-foreground">{s.name}</span>
            <span className="text-[12px] font-medium tabular-nums">{s.count}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
