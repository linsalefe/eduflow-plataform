'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Users, UserPlus, MessageCircle, CheckCircle, XCircle,
  RefreshCw, Search, Sparkles, FileText, Settings2,
  GripVertical, Trash2, Plus, X, Save, AlertTriangle, Loader2,
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

  const loadLeads = useCallback(async () => {
    try {
      const res = await api.get('/contacts');
      setLeads(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await api.get('/tenant/kanban-columns');
        const sorted = [...res.data].sort((a: any, b: any) => a.order - b.order);
        setColumns(sorted);
      } catch {
        // use DEFAULT_COLUMNS
      }
      loadLeads();
    };
    init();
    const interval = setInterval(loadLeads, 15000);
    return () => clearInterval(interval);
  }, [loadLeads]);

  const moveLead = async (waId: string, newStatus: string) => {
    setLeads((prev) =>
      prev.map((l) => (l.wa_id === waId ? { ...l, lead_status: newStatus } : l))
    );
    if (selectedLead?.wa_id === waId) {
      setSelectedLead((prev) => (prev ? { ...prev, lead_status: newStatus } : null));
    }
    try {
      await api.patch(`/contacts/${waId}`, { lead_status: newStatus });
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

  const getLeadsByStatus = (status: string) =>
    leads
      .filter((l) => l.lead_status === status)
      .filter((l) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (l.name || '').toLowerCase().includes(s) || l.wa_id.includes(s);
      });

  const totalFiltered = search
    ? leads.filter((l) => {
        const s = search.toLowerCase();
        return (l.name || '').toLowerCase().includes(s) || l.wa_id.includes(s);
      }).length
    : leads.length;

  return (
    <AppShell>
      <div className="flex-1 overflow-hidden flex flex-col" data-density="medium">
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

          {/* Stats pills */}
          <motion.div
            className="flex gap-2 mt-4 overflow-x-auto pb-1"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            {columns.map((col) => {
              const count = getLeadsByStatus(col.key).length;
              return (
                <div
                  key={col.key}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg flex-shrink-0 border transition-colors"
                  style={{
                    backgroundColor: `${col.color}0a`,
                    borderColor: `${col.color}20`,
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: col.color }}
                  />
                  <span className="text-[12px] font-medium tabular-nums text-foreground">
                    {col.label}
                  </span>
                  <span
                    className="text-[12px] font-bold tabular-nums"
                    style={{ color: col.color }}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
          </motion.div>
        </div>

        {/* Board */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 lg:p-6">
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

        {/* Settings modal */}
        {showSettings && (
          <KanbanSettingsModal
            columns={columns}
            leads={leads}
            onClose={() => setShowSettings(false)}
            onSaved={setColumns}
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
}: {
  columns: ColumnConfig[];
  leads: Lead[];
  onClose: () => void;
  onSaved: (cols: ColumnConfig[]) => void;
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
      await api.put('/tenant/kanban-columns', items);
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
                <GripVertical className="w-4 h-4 text-muted-foreground/50 serviçor-grab flex-shrink-0" />
                <div className="relative flex-shrink-0">
                  <input
                    type="color"
                    value={col.color}
                    onChange={(e) => handleColorChange(col.key, e.target.value)}
                    className="absolute inset-0 opacity-0 serviçor-pointer w-full h-full"
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
                  className="absolute inset-0 opacity-0 serviçor-pointer w-full h-full"
                />
                <div
                  className="w-8 h-8 rounded-lg border-2 border-background shadow-sm serviçor-pointer"
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