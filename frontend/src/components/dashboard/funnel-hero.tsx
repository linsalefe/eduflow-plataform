'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface ColumnConfig { key: string; label: string; color: string; order: number; }
interface PipelineInfo { id: number; name: string; columns: ColumnConfig[]; is_default: boolean; order: number; }
interface FunnelData {
  pipeline_id: number | null;
  stages: Record<string, { count: number; value: number }>;
  total_count: number;
  total_value: number;
}

const STORAGE_KEY = 'eduflow:dashboard:funnel:pipeline';
const WON_KEYS = new Set(['convertido', 'matriculado', 'ganho', 'vendido', 'fechado', 'venda', 'won']);

const brl = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n || 0);

export function FunnelHero() {
  const router = useRouter();
  const [pipelines, setPipelines] = useState<PipelineInfo[]>([]);
  const [selected, setSelected] = useState<PipelineInfo | null>(null);
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  // Carrega pipelines (uma vez) e escolhe a inicial
  useEffect(() => {
    api.get('/pipelines')
      .then((res) => {
        const sorted = [...(res.data || [])].sort((a: any, b: any) => a.order - b.order);
        setPipelines(sorted);
        let initial = sorted.find((p: any) => p.is_default) || sorted[0] || null;
        try {
          const savedId = Number(localStorage.getItem(STORAGE_KEY));
          const saved = sorted.find((p: any) => p.id === savedId);
          if (saved) initial = saved;
        } catch { /* ignore */ }
        setSelected(initial);
      })
      .catch(() => setSelected(null))
      .finally(() => setLoading(false));
  }, []);

  // Recarrega os números quando a pipeline muda
  useEffect(() => {
    if (!selected) return;
    api.get('/dashboard/funnel', { params: { pipeline_id: selected.id } })
      .then((res) => setData(res.data))
      .catch(() => setData(null));
  }, [selected]);

  const columns = useMemo(
    () => (selected?.columns ? [...selected.columns].sort((a, b) => a.order - b.order) : []),
    [selected]
  );

  const total = data?.total_count ?? 0;
  const wonCol = columns.find((c) => WON_KEYS.has(c.key.toLowerCase()));
  const wonCount = wonCol ? (data?.stages?.[wonCol.key]?.count ?? 0) : 0;
  const conversion = wonCol && total > 0 ? ((wonCount / total) * 100).toFixed(1) : null;

  const onChange = (v: string) => {
    const p = pipelines.find((x) => String(x.id) === v);
    if (p) {
      setSelected(p);
      try { localStorage.setItem(STORAGE_KEY, String(p.id)); } catch { /* ignore */ }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-card border border-border/60 rounded-xl p-4 lg:p-5"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[16px] font-medium text-foreground">Funil de vendas</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {total} leads · {brl(data?.total_value ?? 0)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pipelines.length > 1 && selected && (
            <Select value={String(selected.id)} onValueChange={onChange}>
              <SelectTrigger className="h-8 w-[170px] text-[12px]">
                <SelectValue placeholder="Funil" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <button
            onClick={() => router.push('/pipeline')}
            className="text-[12px] text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-3 py-1 transition-colors whitespace-nowrap"
          >
            Abrir pipeline
          </button>
        </div>
      </div>

      {loading || !selected ? (
        <div className="h-[88px] rounded-lg bg-muted/40 animate-pulse" />
      ) : columns.length === 0 ? (
        <p className="text-[13px] text-muted-foreground py-6 text-center">
          Esse funil ainda não tem colunas configuradas.
        </p>
      ) : (
        <>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}
          >
            {columns.map((col) => {
              const count = data?.stages?.[col.key]?.count ?? 0;
              const value = data?.stages?.[col.key]?.value ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={col.key} className="rounded-lg p-3 bg-background-secondary/40 border border-border/50">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                    <p className="text-[11px] leading-none text-muted-foreground truncate">{col.label}</p>
                  </div>
                  <p className="text-[24px] font-medium leading-none tabular-nums text-foreground">{count}</p>
                  <p className="text-[11px] mt-1.5 leading-none text-muted-foreground tabular-nums">{brl(value)}</p>
                  <p className="text-[10px] mt-1 leading-none text-muted-foreground/70">{pct}%</p>
                </div>
              );
            })}
          </div>

          {conversion !== null && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
              <span className="text-[12px] text-muted-foreground">Taxa de conversão</span>
              <span className="text-[13px] font-medium tabular-nums">
                {conversion}% · {wonCount} de {total}
              </span>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
