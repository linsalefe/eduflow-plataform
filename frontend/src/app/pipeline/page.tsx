'use client';
import { useEffect, useState, useRef } from 'react';
import {
  Users, UserPlus, MessageCircle, GraduationCap, CheckCircle, XCircle,
  Loader2, RefreshCw, Phone, Mail, Clock, ArrowRight, Search,
  Sparkles, FileText, ChevronRight, Settings2, GripVertical, Trash2,
  Plus, X, Save, AlertTriangle
} from 'lucide-react';
import AppShell from '@/components/app-shell';
import api from '@/lib/api';

interface Lead {
  wa_id: string;
  name: string;
  lead_status: string;
  notes: string | null;
  ai_active: boolean;
  channel_id: number;
  created_at: string;
  updated_at: string;
  tags: { id: number; name: string; color: string }[];
}

interface KanbanColumn {
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
  matriculado: CheckCircle,
  convertido: CheckCircle,
  perdido: XCircle,
};

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { key: 'novo', label: 'Novos Leads', color: '#6366f1', order: 0 },
  { key: 'em_contato', label: 'Em Contato', color: '#f59e0b', order: 1 },
  { key: 'qualificado', label: 'Qualificados', color: '#8b5cf6', order: 2 },
  { key: 'em_matricula', label: 'Em Matrícula', color: '#06b6d4', order: 3 },
  { key: 'matriculado', label: 'Matriculados', color: '#10b981', order: 4 },
  { key: 'perdido', label: 'Perdidos', color: '#ef4444', order: 5 },
];

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#3b82f6', '#ef4444',
  '#f97316', '#84cc16', '#14b8a6', '#64748b',
];

// ─── Modal de Gerenciamento de Colunas ───────────────────────────────────────
function KanbanSettingsModal({
  columns,
  leads,
  onClose,
  onSaved,
}: {
  columns: KanbanColumn[];
  leads: Lead[];
  onClose: () => void;
  onSaved: (cols: KanbanColumn[]) => void;
}) {
  const [items, setItems] = useState<KanbanColumn[]>([...columns]);
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const leadsInColumn = (key: string) => leads.filter(l => l.lead_status === key).length;

  const generateKey = (label: string) =>
    label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    const key = generateKey(newLabel);
    if (items.find(i => i.key === key)) return;
    const newCol: KanbanColumn = { key, label: newLabel.trim(), color: newColor, order: items.length };
    setItems(prev => [...prev, newCol]);
    setNewLabel('');
    setNewColor('#6366f1');
  };

  const handleDelete = (key: string) => {
    if (leadsInColumn(key) > 0) {
      setDeleteConfirm(key);
      return;
    }
    setItems(prev => prev.filter(i => i.key !== key).map((i, idx) => ({ ...i, order: idx })));
  };

  const confirmDelete = (key: string) => {
    setItems(prev => prev.filter(i => i.key !== key).map((i, idx) => ({ ...i, order: idx })));
    setDeleteConfirm(null);
  };

  const handleLabelChange = (key: string, label: string) => {
    setItems(prev => prev.map(i => i.key === key ? { ...i, label } : i));
  };

  const handleColorChange = (key: string, color: string) => {
    setItems(prev => prev.map(i => i.key === key ? { ...i, color } : i));
  };

  // Drag reorder
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
      onSaved(items);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-indigo-600" />
            <h2 className="text-[15px] font-bold text-gray-900">Configurar Colunas</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lista de colunas */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {items.map((col, idx) => (
            <div
              key={col.key}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={() => setDragIdx(null)}
              className={`flex items-center gap-3 p-3 rounded-xl border bg-gray-50 transition-all ${dragIdx === idx ? 'opacity-50 scale-[0.98]' : 'hover:border-gray-200'}`}
            >
              <GripVertical className="w-4 h-4 text-gray-300 cursor-grab flex-shrink-0" />

              {/* Color picker */}
              <div className="relative flex-shrink-0">
                <input
                  type="color"
                  value={col.color}
                  onChange={e => handleColorChange(col.key, e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="w-7 h-7 rounded-lg border-2 border-white shadow-sm" style={{ backgroundColor: col.color }} />
              </div>

              {/* Label */}
              <input
                type="text"
                value={col.label}
                onChange={e => handleLabelChange(col.key, e.target.value)}
                className="flex-1 text-[13px] font-medium text-gray-700 bg-transparent border-none outline-none focus:bg-white focus:border focus:border-indigo-200 focus:rounded-lg px-2 py-1 transition-all"
              />

              {/* Leads count */}
              {leadsInColumn(col.key) > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">
                  {leadsInColumn(col.key)} leads
                </span>
              )}

              {/* Delete */}
              <button
                onClick={() => handleDelete(col.key)}
                className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Adicionar nova coluna */}
        <div className="px-6 py-4 border-t border-gray-100">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Nova Coluna</p>
          <div className="flex items-center gap-2">
            {/* Color presets */}
            <div className="relative flex-shrink-0">
              <input
                type="color"
                value={newColor}
                onChange={e => setNewColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <div className="w-8 h-8 rounded-lg border-2 border-white shadow-sm cursor-pointer" style={{ backgroundColor: newColor }} />
            </div>
            <input
              type="text"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Nome da coluna..."
              className="flex-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 text-gray-700"
            />
            <button
              onClick={handleAdd}
              disabled={!newLabel.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-[12px] font-medium hover:bg-indigo-700 disabled:opacity-40 transition-all flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar
            </button>
          </div>

          {/* Cores preset */}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className="w-5 h-5 rounded-md border-2 transition-all"
                style={{ backgroundColor: c, borderColor: newColor === c ? '#374151' : 'transparent' }}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <p className="text-[11px] text-gray-400">Arraste para reordenar · Clique na cor para alterar</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-600 hover:bg-gray-100 transition-all">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>

      {/* Confirm delete modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-[15px] font-bold text-gray-900">Excluir coluna?</p>
                <p className="text-[12px] text-gray-500">
                  {leadsInColumn(deleteConfirm)} leads serão afetados
                </p>
              </div>
            </div>
            <p className="text-[13px] text-gray-600 mb-5">
              Os leads desta coluna não serão excluídos, mas ficarão sem coluna definida no pipeline.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-xl text-[13px] text-gray-600 border border-gray-200 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => confirmDelete(deleteConfirm)}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-medium bg-red-500 text-white hover:bg-red-600"
              >
                Excluir mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [columns, setColumns] = useState<KanbanColumn[]>(DEFAULT_COLUMNS);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [draggedWaId, setDraggedWaId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const loadLeads = async () => {
    try {
      const res = await api.get('/contacts');
      setLeads(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const res = await api.get('/tenant/kanban-columns');
        const sorted = [...res.data].sort((a: any, b: any) => a.order - b.order);
        setColumns(sorted);
      } catch {
        // usa DEFAULT_COLUMNS
      }
      loadLeads();
    };
    init();
    const interval = setInterval(loadLeads, 15000);
    return () => clearInterval(interval);
  }, []);

  const moveLead = async (waId: string, newStatus: string) => {
    setLeads(prev => prev.map(l => l.wa_id === waId ? { ...l, lead_status: newStatus } : l));
    if (selectedLead?.wa_id === waId) {
      setSelectedLead(prev => prev ? { ...prev, lead_status: newStatus } : null);
    }
    try {
      await api.patch(`/contacts/${waId}`, { lead_status: newStatus });
    } catch (err) {
      console.error(err);
      loadLeads();
    }
  };

  const handleDragStart = (e: React.DragEvent, waId: string) => {
    setDraggedWaId(waId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', waId);
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedWaId(null);
    setDropTarget(null);
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '1';
  };

  const handleDragOver = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(columnKey);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      setDropTarget(null);
    }
  };

  const handleDrop = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    setDropTarget(null);
    const waId = e.dataTransfer.getData('text/plain');
    if (waId && draggedWaId) {
      const lead = leads.find(l => l.wa_id === waId);
      if (lead && lead.lead_status !== columnKey) moveLead(waId, columnKey);
    }
    setDraggedWaId(null);
  };

  const getLeadsByStatus = (status: string) =>
    leads
      .filter(l => l.lead_status === status)
      .filter(l => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (l.name || '').toLowerCase().includes(s) || l.wa_id.includes(s);
      });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <AppShell>
      <div className="flex-1 bg-[#f8f9fb] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-4 lg:px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex items-start lg:items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md flex-shrink-0">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg lg:text-xl font-bold text-[#27273D]">Pipeline</h1>
                <p className="text-[12px] text-gray-400">Funil de matrículas · {leads.length} leads</p>
              </div>
            </div>

            <div className="flex items-center gap-2 lg:gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar lead..."
                  className="pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-[13px] bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 w-40 lg:w-52"
                />
              </div>
              <button
                onClick={() => setShowSettings(true)}
                className="p-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-indigo-600 hover:border-indigo-200 transition-all"
                title="Configurar colunas"
              >
                <Settings2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setLoading(true); loadLeads(); }}
                className="p-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-indigo-600 hover:border-indigo-200 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Stats pills */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
            {columns.map(col => {
              const count = leads.filter(l => l.lead_status === col.key).length;
              return (
                <div key={col.key} className="flex items-center gap-2 px-3 py-1.5 rounded-lg flex-shrink-0" style={{ backgroundColor: `${col.color}20` }}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                  <span className="text-[12px] font-medium" style={{ color: col.color }}>
                    {col.label}: {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 overflow-x-auto p-4 lg:p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : (
            <div className="flex gap-4 h-full min-w-max">
              {columns.map(col => {
                const colLeads = getLeadsByStatus(col.key);
                const Icon = ICON_MAP[col.key] || Users;
                const isDropping = dropTarget === col.key && draggedWaId !== null;

                return (
                  <div key={col.key} className="w-[280px] flex flex-col">
                    {/* Column Header */}
                    <div
                      className="px-4 py-3 rounded-t-2xl border border-b-0"
                      style={{ backgroundColor: `${col.color}18`, borderColor: `${col.color}40` }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" style={{ color: col.color }} />
                          <span className="text-[13px] font-semibold" style={{ color: col.color }}>{col.label}</span>
                        </div>
                        <span
                          className="text-[12px] font-bold px-2 py-0.5 rounded-full"
                          style={{ color: col.color, backgroundColor: `${col.color}25` }}
                        >
                          {colLeads.length}
                        </span>
                      </div>
                    </div>

                    {/* Drop Zone */}
                    <div
                      className="flex-1 border border-t-0 rounded-b-2xl p-2.5 space-y-2.5 overflow-y-auto transition-all duration-200"
                      style={isDropping
                        ? { boxShadow: `0 0 0 2px ${col.color}`, backgroundColor: `${col.color}08`, borderColor: `${col.color}40` }
                        : { backgroundColor: 'rgba(255,255,255,0.5)', borderColor: `${col.color}40` }
                      }
                      onDragOver={e => handleDragOver(e, col.key)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => handleDrop(e, col.key)}
                    >
                      {isDropping && colLeads.length === 0 && (
                        <div className="border-2 border-dashed rounded-xl p-4 text-center" style={{ borderColor: col.color }}>
                          <p className="text-[12px] font-medium" style={{ color: col.color }}>Soltar aqui</p>
                        </div>
                      )}

                      {!isDropping && colLeads.length === 0 && (
                        <div className="text-center py-10 text-gray-300">
                          <Icon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p className="text-[12px]">Nenhum lead</p>
                        </div>
                      )}

                      {colLeads.map(lead => (
                        <div
                          key={lead.wa_id}
                          draggable
                          onDragStart={e => handleDragStart(e, lead.wa_id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => setSelectedLead(lead)}
                          className={`bg-white rounded-xl border border-gray-100 p-3.5 cursor-grab active:cursor-grabbing hover:border-gray-200 hover:shadow-sm transition-all select-none ${draggedWaId === lead.wa_id ? 'opacity-50 scale-[0.98]' : ''}`}
                        >
                          <div className="flex items-center gap-2.5 mb-2">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0" style={{ backgroundColor: col.color }}>
                              {(lead.name || '?')[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-gray-800 truncate">{lead.name || 'Sem nome'}</p>
                              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                                <Phone className="w-3 h-3" />+{lead.wa_id}
                              </p>
                            </div>
                          </div>
                          {lead.tags && lead.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {lead.tags.slice(0, 3).map(tag => (
                                <span key={tag.id} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{tag.name}</span>
                              ))}
                            </div>
                          )}
                          {lead.notes && (
                            <p className="text-[11px] text-gray-400 line-clamp-2 mb-2">{lead.notes}</p>
                          )}
                          <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                            <span className="text-[10px] text-gray-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />{formatDate(lead.created_at)}
                            </span>
                            {lead.ai_active && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">🤖 IA</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Lead Detail */}
        {selectedLead && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedLead(null)}>
            <div className="bg-white rounded-2xl w-full lg:w-[500px] max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="p-6 space-y-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                      <span className="text-lg font-bold text-indigo-600">{(selectedLead.name || '?')[0].toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-[16px] font-bold text-gray-900">{selectedLead.name || 'Sem nome'}</p>
                      <p className="text-[12px] text-gray-400 flex items-center gap-1.5">
                        <Phone className="w-3 h-3" /> +{selectedLead.wa_id}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedLead(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase">Entrada</p>
                      <p className="text-[12px] text-gray-700 font-medium">{formatDate(selectedLead.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50">
                    <Sparkles className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase">IA Ativa</p>
                      <p className="text-[12px] text-gray-700 font-medium">{selectedLead.ai_active ? 'Sim' : 'Não'}</p>
                    </div>
                  </div>
                </div>

                {selectedLead.tags && selectedLead.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLead.tags.map(tag => (
                      <span key={tag.id} className="text-[11px] px-2 py-1 rounded-lg bg-gray-100 text-gray-600 font-medium">{tag.name}</span>
                    ))}
                  </div>
                )}

                {selectedLead.notes && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Observações</p>
                    <p className="text-[13px] text-gray-600 bg-gray-50 rounded-xl px-4 py-3">{selectedLead.notes}</p>
                  </div>
                )}

                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Mover para</p>
                  <div className="grid grid-cols-3 gap-2">
                    {columns.map(col => (
                      <button
                        key={col.key}
                        onClick={() => moveLead(selectedLead.wa_id, col.key)}
                        disabled={moving === selectedLead.wa_id || selectedLead.lead_status === col.key}
                        className="py-2 rounded-xl text-[11px] font-medium border transition-all disabled:opacity-50"
                        style={selectedLead.lead_status === col.key
                          ? { backgroundColor: `${col.color}18`, borderColor: `${col.color}40`, color: col.color }
                          : { backgroundColor: '#f9fafb', borderColor: '#e5e7eb', color: '#6b7280' }
                        }
                      >
                        {col.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <a
                    href="/conversations"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0f1b2d] text-white text-[13px] font-medium hover:bg-[#1a2d42] transition-all"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Abrir Conversa
                  </a>
                  <a
                    href={`https://wa.me/${selectedLead.wa_id}`}
                    target="_blank"
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-[13px] font-medium hover:bg-emerald-600 transition-all"
                  >
                    <Phone className="w-4 h-4" />
                    WhatsApp
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal configurações */}
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