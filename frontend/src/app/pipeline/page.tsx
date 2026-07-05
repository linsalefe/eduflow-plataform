'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Users, UserPlus, MessageCircle, CheckCircle, XCircle,
  RefreshCw, Search, Sparkles, FileText, Settings2,
  GripVertical, Trash2, Plus, X, Save, AlertTriangle, Loader2,
  MoreVertical, Check, Tag as TagIcon,
} from 'lucide-react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { motion } from 'framer-motion';
import AppShell from '@/components/app-shell';
import api from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { KanbanColumn } from '@/components/pipeline/kanban-column';
import { KanbanCard, Lead } from '@/components/pipeline/kanban-card';
import { LeadDetailSheet } from '@/components/pipeline/lead-detail-sheet';
import { KanbanSkeleton } from '@/components/skeletons/kanban-skeleton';
import ConfirmModal from '@/components/ConfirmModal';

interface ColumnConfig {
  key: string;
  label: string;
  color: string;
  order: number;
}

interface PipelineInfo {
  id: number;
  name: string;
  columns: ColumnConfig[];
  is_default: boolean;
  order: number;
}

const ICON_MAP: Record<string, any> = {
  novo: UserPlus,
  em_contato: MessageCircle,
  qualificado: Sparkles,
  em_matricula: FileText,
  negociando: FileText,
  convertido: CheckCircle,
  perdido: XCircle,
};

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'novo', label: 'Novos Leads', color: '#1D4ED8', order: 0 },
  { key: 'em_contato', label: 'Em Contato', color: '#f59e0b', order: 1 },
  { key: 'qualificado', label: 'Qualificados', color: '#8b5cf6', order: 2 },
  { key: 'em_matricula', label: 'Em Negociação', color: '#06b6d4', order: 3 },
  { key: 'convertido', label: 'Convertidos', color: '#10b981', order: 4 },
  { key: 'perdido', label: 'Perdidos', color: '#ef4444', order: 5 },
];

const PRESET_COLORS = [
  '#1D4ED8', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#3b82f6', '#ef4444',
  '#f97316', '#84cc16', '#14b8a6', '#64748b',
];

// === Filter types & constants ===
type IAFilter = 'all' | 'on' | 'off';
type PeriodFilter = 'all' | 'today' | '7d' | '30d';

interface FilterState {
  tagIds: number[];
  channelId: number | null;
  aiStatus: IAFilter;
  period: PeriodFilter;
}

interface ChannelOption {
  id: number;
  name: string;
}

const FILTERS_STORAGE_KEY = 'eduflow:pipeline:filters';
const DEFAULT_FILTERS: FilterState = {
  tagIds: [],
  channelId: null,
  aiStatus: 'all',
  period: 'all',
};

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddLead, setShowAddLead] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', phone: '', email: '', notes: '' });
  const [savingLead, setSavingLead] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Multi-pipeline state
  const [pipelines, setPipelines] = useState<PipelineInfo[]>([]);
  const [activePipeline, setActivePipeline] = useState<PipelineInfo | null>(null);
  const [showCreatePipeline, setShowCreatePipeline] = useState(false);
  const [showRenamePipeline, setShowRenamePipeline] = useState(false);
  const [showDeletePipeline, setShowDeletePipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState('');
  const [savingPipeline, setSavingPipeline] = useState(false);
  const [showPipelineMenu, setShowPipelineMenu] = useState(false);

  // === Filtros ===
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [tagsDropdownOpen, setTagsDropdownOpen] = useState(false);

  const loadLeads = useCallback(async () => {
    try {
      const params: any = {};
      if (activePipeline) params.pipeline_id = activePipeline.id;
      if (filters.channelId) params.channel_id = filters.channelId;
      const res = await api.get('/contacts', { params });
      setLeads(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activePipeline, filters.channelId]);

  // Initial load: fetch pipelines
  useEffect(() => {
    const init = async () => {
      try {
        const res = await api.get('/pipelines');
        const sorted = [...res.data].sort((a: any, b: any) => a.order - b.order);
        setPipelines(sorted);
        const def = sorted.find((p: any) => p.is_default) || sorted[0];
        if (def) {
          setActivePipeline(def);
          setColumns(def.columns.sort((a: any, b: any) => a.order - b.order));
        }
      } catch {
        // fallback: load from old endpoint
        try {
          const res = await api.get('/tenant/kanban-columns');
          const sorted = [...res.data].sort((a: any, b: any) => a.order - b.order);
          setColumns(sorted);
        } catch {
          // use DEFAULT_COLUMNS
        }
      }
    };
    init();
  }, []);

  // Reload leads when activePipeline changes
  useEffect(() => {
    if (activePipeline) {
      setLoading(true);
      loadLeads();
    }
  }, [activePipeline, loadLeads]);

  // Polling interval
  useEffect(() => {
    const interval = setInterval(loadLeads, 15000);
    return () => clearInterval(interval);
  }, [loadLeads]);

  // Load filters from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setFilters({ ...DEFAULT_FILTERS, ...parsed });
      }
    } catch {
      // ignore malformed storage
    }
  }, []);

  // Persist filters to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // ignore quota errors
    }
  }, [filters]);

  // Load channels for filter dropdown
  useEffect(() => {
    api
      .get('/channels')
      .then((res) => setChannels(res.data || []))
      .catch(() => setChannels([]));
  }, []);

  const switchPipeline = (pipeline: PipelineInfo) => {
    setActivePipeline(pipeline);
    setColumns(pipeline.columns.sort((a: any, b: any) => a.order - b.order));
  };

  const createPipeline = async () => {
    if (!newPipelineName.trim()) return;
    setSavingPipeline(true);
    try {
      const res = await api.post('/pipelines', { name: newPipelineName.trim() });
      const newP = res.data;
      setPipelines(prev => [...prev, newP]);
      setActivePipeline(newP);
      setColumns((newP.columns || []).sort((a: any, b: any) => a.order - b.order));
      setShowCreatePipeline(false);
      setNewPipelineName('');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao criar funil');
    } finally {
      setSavingPipeline(false);
    }
  };

  const renamePipeline = async () => {
    if (!activePipeline || !newPipelineName.trim()) return;
    setSavingPipeline(true);
    try {
      await api.put(`/pipelines/${activePipeline.id}`, { name: newPipelineName.trim() });
      setPipelines(prev => prev.map(p => p.id === activePipeline.id ? { ...p, name: newPipelineName.trim() } : p));
      setActivePipeline(prev => prev ? { ...prev, name: newPipelineName.trim() } : null);
      setShowRenamePipeline(false);
      setNewPipelineName('');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao renomear');
    } finally {
      setSavingPipeline(false);
    }
  };

  const deletePipeline = async () => {
    if (!activePipeline || activePipeline.is_default) return;
    setSavingPipeline(true);
    try {
      await api.delete(`/pipelines/${activePipeline.id}`);
      const remaining = pipelines.filter(p => p.id !== activePipeline.id);
      setPipelines(remaining);
      const def = remaining.find(p => p.is_default) || remaining[0];
      if (def) switchPipeline(def);
      setShowDeletePipeline(false);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao excluir');
    } finally {
      setSavingPipeline(false);
    }
  };

  const moveLead = async (waId: string, newStatus: string) => {
    setLeads((prev) =>
      prev.map((l) => (l.wa_id === waId ? { ...l, lead_status: newStatus } : l))
    );
    if (selectedLead?.wa_id === waId) {
      setSelectedLead((prev) => (prev ? { ...prev, lead_status: newStatus } : null));
    }
    try {
      await api.patch(`/contacts/${waId}`, {
        lead_status: newStatus,
        channel_id: filters.channelId || null,
      });
    } catch (err) {
      console.error(err);
      loadLeads();
    }
  };

  const onDragEnd = (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;
    const lead = leads.find((l) => l.wa_id === draggableId);
    if (lead && lead.lead_status !== destination.droppableId) {
      moveLead(draggableId, destination.droppableId);
    }
  };

  // === Filtros derivados ===
  const availableTags = useMemo(() => {
    const map = new Map<number, { id: number; name: string; color: string }>();
    leads.forEach((l) => {
      (l.tags || []).forEach((t) => {
        if (!map.has(t.id)) map.set(t.id, t);
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [leads]);

  const periodMs = (period: PeriodFilter): number | null => {
    switch (period) {
      case 'today': return 24 * 60 * 60 * 1000;
      case '7d': return 7 * 24 * 60 * 60 * 1000;
      case '30d': return 30 * 24 * 60 * 60 * 1000;
      default: return null;
    }
  };

  const matchesFilters = useCallback(
    (lead: Lead): boolean => {
      // Search (nome ou wa_id)
      if (search) {
        const s = search.toLowerCase();
        const inName = (lead.name || '').toLowerCase().includes(s);
        const inWa = lead.wa_id.includes(s);
        if (!inName && !inWa) return false;
      }
      // Tags (lógica OR)
      if (filters.tagIds.length > 0) {
        const leadTagIds = new Set((lead.tags || []).map((t) => t.id));
        const hasAny = filters.tagIds.some((id) => leadTagIds.has(id));
        if (!hasAny) return false;
      }
      // Canal
      if (filters.channelId !== null && lead.channel_id !== filters.channelId) return false;
      // IA
      if (filters.aiStatus === 'on' && !lead.ai_active) return false;
      if (filters.aiStatus === 'off' && lead.ai_active) return false;
      // Período (created_at)
      const ms = periodMs(filters.period);
      if (ms !== null && lead.created_at) {
        const created = new Date(lead.created_at).getTime();
        if (Date.now() - created > ms) return false;
      }
      return true;
    },
    [search, filters]
  );

  const getLeadsByStatus = (status: string) =>
    leads.filter((l) => l.lead_status === status).filter(matchesFilters);

  const totalFiltered = leads.filter(matchesFilters).length;

  const activeFilterCount =
    filters.tagIds.length +
    (filters.channelId !== null ? 1 : 0) +
    (filters.aiStatus !== 'all' ? 1 : 0) +
    (filters.period !== 'all' ? 1 : 0);

  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  return (
    <AppShell>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col" data-density="medium">
        {/* Header */}
        <div className="px-4 lg:px-6 py-4 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-start lg:items-center justify-between gap-3 flex-wrap">
            <PageHeader
              title="Pipeline"
              description="Funil de vendas"
              badge={`${totalFiltered} leads`}
              className="mb-0"
            />
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar lead..."
                  className="pl-9 h-9 w-40 lg:w-52"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => setShowSettings(true)}
                title="Configurar colunas"
              >
                <Settings2 className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                className="h-9"
                onClick={() => setShowAddLead(true)}
              >
                <UserPlus className="w-4 h-4 mr-1.5" />
                Novo Lead
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  setLoading(true);
                  loadLeads();
                }}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Pipeline Tabs */}
          {pipelines.length > 0 && (
            <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1">
              {pipelines.map(p => (
                <button
                  key={p.id}
                  onClick={() => switchPipeline(p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                    activePipeline?.id === p.id
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {p.name}
                  {p.is_default && <span className="text-[10px] opacity-70">(Principal)</span>}
                </button>
              ))}
              {pipelines.length < 10 && (
                <button
                  onClick={() => { setNewPipelineName(''); setShowCreatePipeline(true); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] font-medium text-muted-foreground hover:bg-muted transition-all whitespace-nowrap flex-shrink-0 border border-dashed border-border"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo Funil
                </button>
              )}
              {/* Pipeline actions menu */}
              {activePipeline && (
                <div className="relative flex-shrink-0 ml-1">
                  <button
                    onClick={() => setShowPipelineMenu(!showPipelineMenu)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {showPipelineMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowPipelineMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-lg border border-border py-1 w-44">
                        <button
                          onClick={() => {
                            setNewPipelineName(activePipeline.name);
                            setShowRenamePipeline(true);
                            setShowPipelineMenu(false);
                          }}
                          className="w-full px-3 py-2 text-left text-[13px] text-foreground hover:bg-muted transition-colors"
                        >
                          Renomear funil
                        </button>
                        {!activePipeline.is_default && (
                          <button
                            onClick={() => {
                              setShowDeletePipeline(true);
                              setShowPipelineMenu(false);
                            }}
                            className="w-full px-3 py-2 text-left text-[13px] text-red-600 hover:bg-red-50 transition-colors"
                          >
                            Excluir funil
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">
              Filtros
            </span>

            {/* Tags multi-select */}
            <div className="relative">
              <button
                onClick={() => setTagsDropdownOpen(!tagsDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border border-border bg-card hover:bg-muted transition-colors"
              >
                <TagIcon className="w-3.5 h-3.5" />
                Tags
                {filters.tagIds.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-1">
                    {filters.tagIds.length}
                  </Badge>
                )}
              </button>
              {tagsDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setTagsDropdownOpen(false)}
                  />
                  <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-lg border border-border py-1 w-56 max-h-64 overflow-y-auto">
                    {availableTags.length === 0 ? (
                      <div className="px-3 py-2 text-[12px] text-muted-foreground">
                        Nenhuma tag disponível
                      </div>
                    ) : (
                      availableTags.map((tag) => {
                        const checked = filters.tagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() =>
                              setFilters((prev) => ({
                                ...prev,
                                tagIds: checked
                                  ? prev.tagIds.filter((id) => id !== tag.id)
                                  : [...prev.tagIds, tag.id],
                              }))
                            }
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-muted transition-colors"
                          >
                            <div
                              className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                                checked ? 'bg-primary border-primary' : 'border-border'
                              }`}
                            >
                              {checked && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className="flex-1 truncate">{tag.name}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Canal */}
            <select
              value={filters.channelId ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  channelId: e.target.value ? parseInt(e.target.value) : null,
                }))
              }
              className="px-3 py-1.5 rounded-lg text-[12px] border border-border bg-card hover:bg-muted transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Todos os canais</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>{ch.name}</option>
              ))}
            </select>

            {/* IA */}
            <select
              value={filters.aiStatus}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  aiStatus: e.target.value as IAFilter,
                }))
              }
              className="px-3 py-1.5 rounded-lg text-[12px] border border-border bg-card hover:bg-muted transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">IA: Todos</option>
              <option value="on">IA: Ativa</option>
              <option value="off">IA: Inativa</option>
            </select>

            {/* Período */}
            <select
              value={filters.period}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  period: e.target.value as PeriodFilter,
                }))
              }
              className="px-3 py-1.5 rounded-lg text-[12px] border border-border bg-card hover:bg-muted transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">Período: Todos</option>
              <option value="today">Hoje</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
            </select>

            {/* Clear */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors ml-auto"
              >
                <X className="w-3.5 h-3.5" />
                Limpar ({activeFilterCount})
              </button>
            )}
          </div>

        </div>

        {/* Board */}
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4 lg:p-6">
          {loading ? (
            <KanbanSkeleton columns={columns.length} />
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="flex gap-3 h-full w-full">
                {columns.map((col, i) => {
                  const Icon = ICON_MAP[col.key] || Users;
                  return (
                    <KanbanColumn
                      key={col.key}
                      columnKey={col.key}
                      label={col.label}
                      color={col.color}
                      icon={Icon}
                      leads={getLeadsByStatus(col.key)}
                      onCardClick={setSelectedLead}
                      index={i}
                    />
                  );
                })}
              </div>
            </DragDropContext>
          )}
        </div>

        {/* Lead detail sheet */}
        <LeadDetailSheet
          lead={selectedLead}
          columns={columns}
          onClose={() => setSelectedLead(null)}
          onMove={moveLead}
          pipelines={pipelines.map(p => ({ id: p.id, name: p.name, is_default: p.is_default }))}
          activePipelineId={activePipeline?.id}
          onMoveToPipeline={async (waId, pipelineId) => {
            try {
              await api.patch(`/contacts/${waId}`, {
                pipeline_id: pipelineId,
                lead_status: 'novo',
                channel_id: filters.channelId || null,
              });
              setSelectedLead(null);
              loadLeads();
            } catch (err: any) {
              alert(err.response?.data?.detail || 'Erro ao mover lead');
            }
          }}
        />

        {/* Add Lead Modal */}
        {showAddLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowAddLead(false)}>
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-gray-800">Novo Lead</h3>
                <button onClick={() => setShowAddLead(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 text-xl leading-none">&times;</button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Nome *</label>
                  <input value={newLead.name} onChange={(e) => setNewLead(prev => ({ ...prev, name: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary" placeholder="Nome completo" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">WhatsApp *</label>
                  <input value={newLead.phone} onChange={(e) => setNewLead(prev => ({ ...prev, phone: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary" placeholder="5583999999999" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">E-mail</label>
                  <input value={newLead.email} onChange={(e) => setNewLead(prev => ({ ...prev, email: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary" placeholder="email@exemplo.com" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Observações</label>
                  <textarea value={newLead.notes} onChange={(e) => setNewLead(prev => ({ ...prev, notes: e.target.value }))} rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary resize-none" placeholder="Informações adicionais..." />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowAddLead(false)} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">Cancelar</button>
                <button
                  disabled={savingLead || !newLead.name.trim() || !newLead.phone.trim()}
                  onClick={async () => {
                    setSavingLead(true);
                    try {
                      await api.post('/contacts', { name: newLead.name, phone: newLead.phone, email: newLead.email });
                      setShowAddLead(false);
                      setNewLead({ name: '', phone: '', email: '', notes: '' });
                      loadLeads();
                    } catch (err: any) {
                      alert(err.response?.data?.detail || 'Erro ao criar lead');
                    } finally {
                      setSavingLead(false);
                    }
                  }}
                  className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {savingLead ? 'Salvando...' : 'Criar Lead'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Pipeline Modal */}
        {showCreatePipeline && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreatePipeline(false)}>
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-gray-800">Novo Funil</h3>
                <button onClick={() => setShowCreatePipeline(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 text-xl leading-none">&times;</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Nome do funil *</label>
                  <input
                    value={newPipelineName}
                    onChange={(e) => setNewPipelineName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createPipeline()}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary"
                    placeholder="Ex: Funil Pós-Venda"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-gray-400">
                  Será criado com colunas padrão. Você pode personalizar depois em Configurações.
                </p>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowCreatePipeline(false)} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">Cancelar</button>
                <button
                  disabled={savingPipeline || !newPipelineName.trim()}
                  onClick={createPipeline}
                  className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {savingPipeline ? 'Criando...' : 'Criar Funil'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rename Pipeline Modal */}
        {showRenamePipeline && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowRenamePipeline(false)}>
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-gray-800">Renomear Funil</h3>
                <button onClick={() => setShowRenamePipeline(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 text-xl leading-none">&times;</button>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Nome do funil</label>
                <input
                  value={newPipelineName}
                  onChange={(e) => setNewPipelineName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && renamePipeline()}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary"
                  autoFocus
                />
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowRenamePipeline(false)} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">Cancelar</button>
                <button
                  disabled={savingPipeline || !newPipelineName.trim()}
                  onClick={renamePipeline}
                  className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {savingPipeline ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Pipeline Modal */}
        {showDeletePipeline && activePipeline && !activePipeline.is_default && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowDeletePipeline(false)}>
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">Excluir Funil</h3>
                <button onClick={() => setShowDeletePipeline(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 text-xl leading-none">&times;</button>
              </div>
              <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl mb-4">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-[13px] text-red-700">
                  <p className="font-semibold mb-1">Tem certeza?</p>
                  <p>Todos os leads de &quot;{activePipeline.name}&quot; serão movidos para o Pipeline Principal com status &quot;Novo&quot;.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowDeletePipeline(false)} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">Cancelar</button>
                <button
                  disabled={savingPipeline}
                  onClick={deletePipeline}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {savingPipeline ? 'Excluindo...' : 'Excluir Funil'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Settings modal */}
        {showSettings && (
          <KanbanSettingsModal
            columns={columns}
            leads={leads}
            onClose={() => setShowSettings(false)}
            onSaved={(cols) => {
              setColumns(cols);
              if (activePipeline) {
                setPipelines(prev => prev.map(p => p.id === activePipeline.id ? { ...p, columns: cols } : p));
                setActivePipeline(prev => prev ? { ...prev, columns: cols } : null);
              }
            }}
            pipelineId={activePipeline?.id}
          />
        )}
      </div>
    </AppShell>
  );
}

/* ============================================================
   KANBAN SETTINGS MODAL
   ============================================================ */
function KanbanSettingsModal({
  columns,
  leads,
  onClose,
  onSaved,
  pipelineId,
}: {
  columns: ColumnConfig[];
  leads: Lead[];
  onClose: () => void;
  onSaved: (cols: ColumnConfig[]) => void;
  pipelineId?: number;
}) {
  const [items, setItems] = useState<ColumnConfig[]>([...columns]);
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#1D4ED8');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [aiOffStatuses, setAiOffStatuses] = useState<string[]>([]);

  useEffect(() => {
    api.get('/tenant/ai-off-statuses').then((res) => setAiOffStatuses(res.data || [])).catch(() => {});
  }, []);

  const toggleAiOff = (key: string) => {
    setAiOffStatuses((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const leadsInColumn = (key: string) => leads.filter((l) => l.lead_status === key).length;

  const generateKey = (label: string) =>
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    const key = generateKey(newLabel);
    if (items.find((i) => i.key === key)) return;
    setItems((prev) => [...prev, { key, label: newLabel.trim(), color: newColor, order: prev.length }]);
    setNewLabel('');
    setNewColor('#1D4ED8');
  };

  const handleDelete = (key: string) => {
    if (leadsInColumn(key) > 0) {
      setDeleteConfirm(key);
      return;
    }
    setItems((prev) => prev.filter((i) => i.key !== key).map((i, idx) => ({ ...i, order: idx })));
  };

  const confirmDelete = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key).map((i, idx) => ({ ...i, order: idx })));
    setDeleteConfirm(null);
  };

  const handleLabelChange = (key: string, label: string) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, label } : i)));
  };

  const handleColorChange = (key: string, color: string) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, color } : i)));
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const reordered = [...items];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    setItems(reordered.map((i, n) => ({ ...i, order: n })));
    setDragIdx(idx);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (pipelineId) {
        await api.put(`/pipelines/${pipelineId}/columns`, items);
      } else {
        await api.put('/tenant/kanban-columns', items);
      }
      await api.put('/tenant/ai-off-statuses', aiOffStatuses);
      onSaved(items);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={true} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              Configurar Colunas
            </DialogTitle>
          </DialogHeader>

          {/* Column list */}
          <div className="flex-1 overflow-y-auto space-y-2 py-2">
            {items.map((col, idx) => (
              <div
                key={col.key}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={() => setDragIdx(null)}
                className={`flex items-center gap-3 p-3 rounded-lg border bg-muted/50 transition-all ${
                  dragIdx === idx ? 'opacity-50 scale-[0.98]' : 'hover:border-border'
                }`}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab flex-shrink-0" />
                <div className="relative flex-shrink-0">
                  <input
                    type="color"
                    value={col.color}
                    onChange={(e) => handleColorChange(col.key, e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div
                    className="w-7 h-7 rounded-lg border-2 border-background shadow-sm"
                    style={{ backgroundColor: col.color }}
                  />
                </div>
                <Input
                  value={col.label}
                  onChange={(e) => handleLabelChange(col.key, e.target.value)}
                  className="flex-1 h-8 text-[13px] bg-transparent border-none shadow-none focus-visible:ring-0"
                />
                {leadsInColumn(col.key) > 0 && (
                  <Badge variant="secondary" className="text-[11px] flex-shrink-0">
                    {leadsInColumn(col.key)} leads
                  </Badge>
                )}
                <Button
                  variant={aiOffStatuses.includes(col.key) ? "default" : "ghost"}
                  size="icon"
                  className={`h-7 w-7 flex-shrink-0 ${aiOffStatuses.includes(col.key) ? 'bg-red-500 hover:bg-red-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => toggleAiOff(col.key)}
                  title={aiOffStatuses.includes(col.key) ? 'IA será desligada neste estágio' : 'Clique para desligar IA neste estágio'}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                  onClick={() => handleDelete(col.key)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Add new column */}
          <div className="border-t border-border pt-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Nova Coluna
            </p>
            <div className="flex items-center gap-2">
              <div className="relative flex-shrink-0">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div
                  className="w-8 h-8 rounded-lg border-2 border-background shadow-sm cursor-pointer"
                  style={{ backgroundColor: newColor }}
                />
              </div>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="Nome da coluna..."
                className="flex-1 h-9"
              />
              <Button size="sm" onClick={handleAdd} disabled={!newLabel.trim()}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Adicionar
              </Button>
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className="w-5 h-5 rounded-md border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: newColor === c ? 'var(--foreground)' : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <p className="text-[11px] text-muted-foreground flex-1">
              Arraste para reordenar
            </p>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <ConfirmModal
        open={!!deleteConfirm}
        title="Excluir coluna?"
        message={`${deleteConfirm ? leadsInColumn(deleteConfirm) : 0} leads serão afetados. Os leads não serão excluídos, mas ficarão sem coluna no pipeline.`}
        confirmLabel="Excluir mesmo assim"
        onConfirm={() => deleteConfirm && confirmDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
        variant="danger"
      />
    </>
  );
}
