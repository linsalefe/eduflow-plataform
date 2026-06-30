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

// Classificação por nome (heurística v1). O tipo explícito por coluna vem no próximo passo.
const LOST_HINTS = ['perdido', 'perdida', 'desqualific', 'descartad', 'cancelad', 'recusad', 'lost'];
const WON_HINTS = ['convertido', 'fechado', 'ganho', 'ganha', 'matriculad', 'vendid', 'venda', 'won'];

type StageType = 'active' | 'won' | 'lost';
function classify(key: string): StageType {
  const k = (key || '').toLowerCase();
  if (LOST_HINTS.some((h) => k.includes(h))) return 'lost';
  if (WON_HINTS.some((h) => k.includes(h))) return 'won';
  return 'active';
}

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

  const cols = useMemo(
    () => (selected?.columns ? [...selected.columns].sort((a, b) => a.order - b.order) : []),
    [selected]
  );

  const all = cols.map((c) => ({
    ...c,
    type: classify(c.key),
    count: data?.stages?.[c.key]?.count ?? 0,
    value: data?.stages?.[c.key]?.value ?? 0,
  }));
  const active = all.filter((s) => s.type === 'active');
  const won = all.filter((s) => s.type === 'won');
  const lost = all.filter((s) => s.type === 'lost');

  const activeTotal = active.reduce((s, x) => s + x.count, 0);
  const wonTotal = won.reduce((s, x) => s + x.count, 0);
  const lostTotal = lost.reduce((s, x) => s + x.count, 0);
  const closedTotal = wonTotal + lostTotal;
  const maxActive = Math.max(1, ...active.map((s) => s.count));
  const decided = wonTotal + lostTotal;
  const winRate = decided > 0 ? ((wonTotal / decided) * 100).toFixed(1) : null;
  const hasValue = (data?.total_value ?? 0) > 0;

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
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[16px] font-medium text-foreground">Funil de vendas</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {activeTotal} ativos · {closedTotal} encerrados{hasValue ? ` · ${brl(data?.total_value ?? 0)}` : ''}
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
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-6 rounded bg-muted/40 animate-pulse" />)}
        </div>
      ) : active.length === 0 && closedTotal === 0 ? (
        <p className="text-[13px] text-muted-foreground py-6 text-center">
          Esse funil ainda não tem leads.
        </p>
      ) : (
        <>
          {/* Funil ativo: barras proporcionais, na ordem do funil */}
          {active.length > 0 ? (
            <div className="space-y-2">
              {active.map((s) => {
                const pct = activeTotal > 0 ? Math.round((s.count / activeTotal) * 100) : 0;
                const width = (s.count / maxActive) * 100;
                return (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-[12px] text-foreground w-28 lg:w-36 truncate flex-shrink-0">{s.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden min-w-[40px]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${width}%`, backgroundColor: s.color, opacity: 0.85 }}
                      />
                    </div>
                    <span className="text-[13px] font-medium tabular-nums text-foreground w-10 text-right flex-shrink-0">{s.count}</span>
                    {hasValue && (
                      <span className="text-[11px] tabular-nums text-muted-foreground w-20 text-right flex-shrink-0 hidden sm:inline">{brl(s.value)}</span>
                    )}
                    <span className="text-[11px] tabular-nums text-muted-foreground w-9 text-right flex-shrink-0">{pct}%</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground py-2">Nenhum lead em estágio ativo.</p>
          )}

          {/* Encerrados: ganhos + perdidos, compactos e apagados */}
          {closedTotal > 0 && (
            <div className="mt-4 pt-3 border-t border-border/60">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Encerrados</span>
                {winRate !== null && (
                  <span className="text-[12px] text-muted-foreground">
                    Taxa de ganho · <span className="font-medium text-foreground tabular-nums">{winRate}%</span> ({wonTotal} de {decided})
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[...won, ...lost].map((s) => (
                  <span
                    key={s.key}
                    className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2 py-1"
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    {s.label}
                    <span className="font-medium text-foreground tabular-nums">{s.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
