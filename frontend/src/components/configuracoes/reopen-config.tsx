'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, X, Check } from 'lucide-react';
import api from '@/lib/api';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface KanbanColumn {
  key: string;
  label: string;
  color: string;
  order: number;
}

interface PipelineInfo {
  id: number;
  name: string;
  is_default: boolean;
  columns: KanbanColumn[];
}

interface ReopenConfig {
  enabled: boolean;
  from_statuses: string[];
  to_status: string;
  cooldown_seconds: number;
}

const EMPTY_CONFIG: ReopenConfig = {
  enabled: false,
  from_statuses: [],
  to_status: '',
  cooldown_seconds: 604800,
};

const UNIT_OPTIONS = [
  { value: '1', label: 'segundos' },
  { value: '60', label: 'minutos' },
  { value: '3600', label: 'horas' },
  { value: '86400', label: 'dias' },
] as const;

/** Decomposes seconds into the largest exact unit, falling back to seconds. */
function decompose(totalSeconds: number): { value: number; factor: number } {
  if (totalSeconds === 0) return { value: 0, factor: 86400 };
  for (const f of [86400, 3600, 60]) {
    if (totalSeconds % f === 0) return { value: totalSeconds / f, factor: f };
  }
  return { value: totalSeconds, factor: 1 };
}

function unitLabel(factor: number, n: number): string {
  const map: Record<number, [string, string]> = {
    1: ['segundo', 'segundos'],
    60: ['minuto', 'minutos'],
    3600: ['hora', 'horas'],
    86400: ['dia', 'dias'],
  };
  const [singular, plural] = map[factor] || ['segundo', 'segundos'];
  return n === 1 ? singular : plural;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(100,100,100,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function PipelineContent() {
  const [pipelines, setPipelines] = useState<PipelineInfo[]>([]);
  const [activePipeline, setActivePipeline] = useState<PipelineInfo | null>(null);
  const [allConfigs, setAllConfigs] = useState<Record<string, ReopenConfig>>({});
  const [config, setConfig] = useState<ReopenConfig>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // UI-only state for the cooldown input
  const [cdValue, setCdValue] = useState(7);
  const [cdFactor, setCdFactor] = useState(86400);

  useEffect(() => {
    loadData();
  }, []);

  /** Sync cdValue/cdFactor from a config's cooldown_seconds */
  const applyCooldown = (cfg: ReopenConfig) => {
    const { value, factor } = decompose(cfg.cooldown_seconds);
    setCdValue(value);
    setCdFactor(factor);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [pipRes, cfgRes] = await Promise.all([
        api.get('/pipelines'),
        api.get('/tenant/reopen-config'),
      ]);
      const sorted = [...(pipRes.data || [])].sort(
        (a: PipelineInfo, b: PipelineInfo) => (a.is_default ? -1 : b.is_default ? 1 : 0)
      );
      setPipelines(sorted);
      const cfgs = cfgRes.data || {};
      setAllConfigs(cfgs);

      const def = sorted.find((p: PipelineInfo) => p.is_default) || sorted[0];
      if (def) {
        setActivePipeline(def);
        const merged = { ...EMPTY_CONFIG, ...(cfgs[String(def.id)] || {}) };
        setConfig(merged);
        applyCooldown(merged);
      }
    } catch {
      toast.error('Erro ao carregar configuracao');
    } finally {
      setLoading(false);
    }
  };

  const switchPipeline = (p: PipelineInfo) => {
    setActivePipeline(p);
    const merged = { ...EMPTY_CONFIG, ...(allConfigs[String(p.id)] || {}) };
    setConfig(merged);
    applyCooldown(merged);
  };

  const handleSave = async () => {
    if (!activePipeline) return;
    if (config.enabled) {
      if (config.from_statuses.length === 0) {
        toast.error('Selecione pelo menos uma coluna de origem');
        return;
      }
      if (!config.to_status) {
        toast.error('Selecione a coluna de destino');
        return;
      }
    }
    setSaving(true);
    try {
      const cooldown_seconds = cdValue * cdFactor;
      const res = await api.patch('/tenant/reopen-config', {
        pipeline_id: activePipeline.id,
        config: { ...config, cooldown_seconds },
      });
      setAllConfigs(res.data.reopen_config || {});
      toast.success('Configuracao salva');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const toggleFromStatus = (key: string) => {
    setConfig((prev) => ({
      ...prev,
      from_statuses: prev.from_statuses.includes(key)
        ? prev.from_statuses.filter((s) => s !== key)
        : [...prev.from_statuses, key],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-sm">Nenhuma pipeline configurada.</p>
        <p className="text-xs mt-1">
          Crie uma pipeline na tela de Pipeline antes de usar esta funcionalidade.
        </p>
      </div>
    );
  }

  const columns = activePipeline
    ? [...(activePipeline.columns || [])].sort((a, b) => a.order - b.order)
    : [];

  // Summary phrase
  const totalSeconds = cdValue * cdFactor;
  const summaryPhrase =
    totalSeconds === 0
      ? 'Reabre assim que o cliente mandar qualquer mensagem.'
      : `Reabre ${cdValue} ${unitLabel(cdFactor, cdValue)} apos a ultima mensagem do cliente.`;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div>
          <h3 className="text-[15px] font-semibold text-foreground">
            Reabertura automatica de leads
          </h3>
          <p className="text-[13px] text-muted-foreground mt-1">
            Quando um lead em coluna final voltar a mandar mensagem apos um periodo sem
            contato, ele e movido automaticamente para o inicio do funil.
            Configuracao por pipeline.
          </p>
        </div>

        {/* Pipeline selector */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Pipeline
          </p>
          <div className="flex flex-wrap gap-2">
            {pipelines.map((p) => {
              const isActive = activePipeline?.id === p.id;
              const hasRule = allConfigs[String(p.id)]?.enabled;
              return (
                <button
                  key={p.id}
                  onClick={() => switchPipeline(p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {p.name}
                  {p.is_default && (
                    <span className="text-[10px] opacity-70">(Principal)</span>
                  )}
                  {hasRule && !isActive && (
                    <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Reabertura ativa" />
                  )}
                  {hasRule && isActive && (
                    <Check className="w-3 h-3 opacity-70" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {columns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Esta pipeline nao tem colunas configuradas.</p>
          </div>
        ) : (
          <>
            {/* Toggle */}
            <div className="flex items-center justify-between py-3 border-y border-border">
              <div>
                <p className="text-[13px] font-medium text-foreground">
                  Ativar reabertura nesta pipeline
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Vale para todos os canais que usam esta pipeline.
                  So reabre quando o cliente envia mensagem.
                </p>
              </div>
              <Switch
                checked={config.enabled}
                onCheckedChange={(v) => setConfig((p) => ({ ...p, enabled: v }))}
              />
            </div>

            {/* From statuses */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Reabrir leads que estejam em
              </p>
              <div className="flex flex-wrap gap-2">
                {columns.map((col) => {
                  const selected = config.from_statuses.includes(col.key);
                  const disabled = col.key === config.to_status;
                  return (
                    <button
                      key={col.key}
                      onClick={() => !disabled && toggleFromStatus(col.key)}
                      disabled={disabled}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={
                        selected
                          ? {
                              backgroundColor: hexToRgba(col.color, 0.15),
                              borderColor: hexToRgba(col.color, 0.4),
                              color: col.color,
                            }
                          : {
                              backgroundColor: 'var(--muted)',
                              borderColor: 'var(--border)',
                              color: 'var(--muted-foreground)',
                            }
                      }
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: col.color }}
                      />
                      {col.label}
                      {selected && <X className="w-3 h-3 ml-0.5 opacity-60" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* To status */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Mover para
              </p>
              <Select
                value={config.to_status || undefined}
                onValueChange={(v) =>
                  setConfig((p) => ({
                    ...p,
                    to_status: v,
                    from_statuses: p.from_statuses.filter((s) => s !== v),
                  }))
                }
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Selecionar coluna..." />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((col) => (
                    <SelectItem key={col.key} value={col.key}>
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: col.color }}
                        />
                        {col.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cooldown — number + unit selector */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                So reabrir apos
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={cdValue}
                  onChange={(e) => setCdValue(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-24 h-9"
                />
                <Select
                  value={String(cdFactor)}
                  onValueChange={(v) => setCdFactor(Number(v))}
                >
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[13px] text-muted-foreground">sem contato</span>
              </div>
              <p className="text-[13px] font-medium text-foreground mt-2">
                {summaryPhrase}
              </p>
            </div>

            {/* Save */}
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving} size="sm">
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-1.5" />
                )}
                Salvar
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
