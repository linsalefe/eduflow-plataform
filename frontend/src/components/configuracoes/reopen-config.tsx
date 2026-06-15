'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Save, X } from 'lucide-react';
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

interface ReopenConfig {
  enabled: boolean;
  from_statuses: string[];
  to_status: string;
  cooldown_days: number;
}

const DEFAULT_CONFIG: ReopenConfig = {
  enabled: false,
  from_statuses: ['matriculado', 'perdido'],
  to_status: 'novo',
  cooldown_days: 7,
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(100,100,100,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function PipelineContent() {
  const [config, setConfig] = useState<ReopenConfig>(DEFAULT_CONFIG);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfgRes, colRes] = await Promise.all([
        api.get('/tenant/reopen-config'),
        api.get('/tenant/kanban-columns'),
      ]);
      setConfig({ ...DEFAULT_CONFIG, ...cfgRes.data });
      setColumns(
        [...(colRes.data || [])].sort(
          (a: KanbanColumn, b: KanbanColumn) => a.order - b.order
        )
      );
    } catch {
      toast.error('Erro ao carregar configuracao');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (config.from_statuses.length === 0) {
      toast.error('Selecione pelo menos uma coluna de origem');
      return;
    }
    if (!config.to_status) {
      toast.error('Selecione a coluna de destino');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/tenant/reopen-config', config);
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

  if (columns.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-sm">Nenhuma coluna configurada no pipeline.</p>
        <p className="text-xs mt-1">
          Configure as colunas na tela de Pipeline antes de usar esta funcionalidade.
        </p>
      </div>
    );
  }

  // Colunas disponiveis para destino (excluindo as de origem)
  const availableToColumns = columns.filter(
    (c) => !config.from_statuses.includes(c.key)
  );

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
          </p>
        </div>

        {/* Toggle */}
        <div className="flex items-center justify-between py-3 border-y border-border">
          <div>
            <p className="text-[13px] font-medium text-foreground">Ativar reabertura</p>
            <p className="text-[11px] text-muted-foreground">
              Vale para todos os canais. So reabre quando o cliente envia mensagem.
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
              // Nao pode selecionar a coluna de destino
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
                  {selected && (
                    <X className="w-3 h-3 ml-0.5 opacity-60" />
                  )}
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
            value={config.to_status}
            onValueChange={(v) =>
              setConfig((p) => ({
                ...p,
                to_status: v,
                // Remover da from_statuses se estava la
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

        {/* Cooldown */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            So reabrir apos
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={365}
              value={config.cooldown_days}
              onChange={(e) =>
                setConfig((p) => ({
                  ...p,
                  cooldown_days: Math.max(0, parseInt(e.target.value) || 0),
                }))
              }
              className="w-24 h-9"
            />
            <span className="text-[13px] text-muted-foreground">dias sem contato</span>
          </div>
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
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Recarregar
          </Button>
        </div>
      </div>
    </div>
  );
}
