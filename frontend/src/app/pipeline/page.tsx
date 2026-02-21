'use client';
import { useEffect, useState, useRef } from 'react';
import {
  Users, UserPlus, MessageCircle, GraduationCap, CheckCircle, XCircle,
  Loader2, RefreshCw, Phone, Mail, Clock, ArrowRight, Search,
  Sparkles, FileText, ChevronRight
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
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

const columns = [
  { key: 'novo', label: 'Novos Leads', icon: UserPlus, color: '#6366f1', bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', badge: 'bg-indigo-100' },
  { key: 'em_contato', label: 'Em Contato', icon: MessageCircle, color: '#f59e0b', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100' },
  { key: 'qualificado', label: 'Qualificados', icon: Sparkles, color: '#8b5cf6', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100' },
  { key: 'negociando', label: 'Em Matrícula', icon: FileText, color: '#06b6d4', bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', badge: 'bg-cyan-100' },
  { key: 'convertido', label: 'Matriculados', icon: CheckCircle, color: '#10b981', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100' },
  { key: 'perdido', label: 'Perdidos', icon: XCircle, color: '#ef4444', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100' },
];

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [draggedWaId, setDraggedWaId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

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
    loadLeads();
    const interval = setInterval(loadLeads, 15000);
    return () => clearInterval(interval);
  }, []);

  const moveLead = async (waId: string, newStatus: string) => {
    // Optimistic update
    setLeads(prev => prev.map(l => l.wa_id === waId ? { ...l, lead_status: newStatus } : l));
    if (selectedLead?.wa_id === waId) {
      setSelectedLead(prev => prev ? { ...prev, lead_status: newStatus } : null);
    }

    try {
      await api.patch(`/contacts/${waId}`, { lead_status: newStatus });
    } catch (err) {
      console.error(err);
      loadLeads(); // Revert on error
    }
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, waId: string) => {
    setDraggedWaId(waId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', waId);
    // Make drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedWaId(null);
    setDropTarget(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const handleDragOver = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(columnKey);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the column container itself
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDropTarget(null);
    }
  };

  const handleDrop = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    setDropTarget(null);
    const waId = e.dataTransfer.getData('text/plain');
    if (waId && draggedWaId) {
      const lead = leads.find(l => l.wa_id === waId);
      if (lead && lead.lead_status !== columnKey) {
        moveLead(waId, columnKey);
      }
    }
    setDraggedWaId(null);
  };

  const getLeadsByStatus = (status: string) => {
    return leads
      .filter(l => l.lead_status === status)
      .filter(l => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (l.name || '').toLowerCase().includes(s) || l.wa_id.includes(s);
      });
  };

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const totalLeads = leads.length;

  return (
    <AppLayout>
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
                <p className="text-[12px] text-gray-400">
                  Funil de matrículas · {totalLeads} leads
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 lg:gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar lead..."
                  className="pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-[13px] bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 w-40 lg:w-52"
                />
              </div>

              <button
                onClick={() => { setLoading(true); loadLeads(); }}
                className="p-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-indigo-600 hover:border-indigo-200 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Stats pills */}
          <div className="flex gap-3 mt-4 overflow-x-auto">
            {columns.map(col => {
              const count = leads.filter(l => l.lead_status === col.key).length;
              return (
                <div key={col.key} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${col.badge} flex-shrink-0`}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                  <span className={`text-[12px] font-medium ${col.text}`}>
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
                const Icon = col.icon;
                const isDropping = dropTarget === col.key && draggedWaId !== null;

                return (
                  <div key={col.key} className="w-[280px] flex flex-col">
                    {/* Column Header */}
                    <div className={`px-4 py-3 rounded-t-2xl ${col.bg} border ${col.border} border-b-0`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" style={{ color: col.color }} />
                          <span className={`text-[13px] font-semibold ${col.text}`}>{col.label}</span>
                        </div>
                        <span className={`text-[12px] font-bold ${col.text} ${col.badge} px-2 py-0.5 rounded-full`}>
                          {colLeads.length}
                        </span>
                      </div>
                    </div>

                    {/* Drop Zone */}
                    <div
                      className={`flex-1 border ${col.border} border-t-0 rounded-b-2xl p-2.5 space-y-2.5 overflow-y-auto transition-all duration-200 ${
                        isDropping
                          ? 'bg-opacity-100 ring-2 ring-offset-1'
                          : 'bg-white/50'
                      }`}
                      style={isDropping ? { boxShadow: `0 0 0 2px ${col.color}`, backgroundColor: `${col.color}08` } : {}}
                      onDragOver={(e) => handleDragOver(e, col.key)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, col.key)}
                    >
                      {/* Drop indicator */}
                      {isDropping && colLeads.length === 0 && (
                        <div
                          className="border-2 border-dashed rounded-xl p-4 text-center transition-all"
                          style={{ borderColor: col.color }}
                        >
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
                          onDragStart={(e) => handleDragStart(e, lead.wa_id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => setSelectedLead(lead)}
                          className={`bg-white rounded-xl border border-gray-100 p-3.5 cursor-grab active:cursor-grabbing hover:border-gray-200 hover:shadow-sm transition-all select-none ${
                            draggedWaId === lead.wa_id ? 'opacity-50 scale-[0.98]' : ''
                          }`}
                        >
                          {/* Name + Avatar */}
                          <div className="flex items-center gap-2.5 mb-2">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0"
                              style={{ backgroundColor: col.color }}
                            >
                              {(lead.name || '?')[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-gray-800 truncate">
                                {lead.name || 'Sem nome'}
                              </p>
                              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                +{lead.wa_id}
                              </p>
                            </div>
                          </div>

                          {/* Tags */}
                          {lead.tags && lead.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {lead.tags.slice(0, 3).map(tag => (
                                <span key={tag.id} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Notes preview */}
                          {lead.notes && (
                            <p className="text-[11px] text-gray-400 line-clamp-2 mb-2">{lead.notes}</p>
                          )}

                          {/* Footer */}
                          <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                            <span className="text-[10px] text-gray-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(lead.created_at)}
                            </span>
                            {lead.ai_active && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">
                                🤖 IA
                              </span>
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
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelectedLead(null)}>
            <div className="bg-white rounded-2xl w-[calc(100vw-2rem)] lg:w-[500px] max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="p-6 space-y-5">

                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                      <span className="text-lg font-bold text-indigo-600">
                        {(selectedLead.name || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-[16px] font-bold text-gray-900">{selectedLead.name || 'Sem nome'}</p>
                      <p className="text-[12px] text-gray-400 flex items-center gap-1.5">
                        <Phone className="w-3 h-3" /> +{selectedLead.wa_id}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedLead(null)} aria-label="Fechar" className="text-gray-400 hover:text-gray-600 text-xl">×</button>
                </div>

                {/* Info */}
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

                {/* Tags */}
                {selectedLead.tags && selectedLead.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLead.tags.map(tag => (
                      <span key={tag.id} className="text-[11px] px-2 py-1 rounded-lg bg-gray-100 text-gray-600 font-medium">
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Notes */}
                {selectedLead.notes && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Observações</p>
                    <p className="text-[13px] text-gray-600 bg-gray-50 rounded-xl px-4 py-3">{selectedLead.notes}</p>
                  </div>
                )}

                {/* Move Status */}
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Mover para</p>
                  <div className="grid grid-cols-3 gap-2">
                    {columns.map(col => (
                      <button
                        key={col.key}
                        onClick={() => moveLead(selectedLead.wa_id, col.key)}
                        disabled={moving === selectedLead.wa_id || selectedLead.lead_status === col.key}
                        className={`py-2 rounded-xl text-[11px] font-medium border transition-all ${
                          selectedLead.lead_status === col.key
                            ? `${col.bg} ${col.border} ${col.text}`
                            : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                        } disabled:opacity-50`}
                      >
                        {col.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
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
      </div>
    </AppLayout>
  );
}