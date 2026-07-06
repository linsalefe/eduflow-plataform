'use client';

import { useState } from 'react';
import { Phone, MessageCircle, Clock, Sparkles, ArrowRight, Pencil, X } from 'lucide-react';
import { Lead } from './kanban-card';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

interface KanbanColumn {
  key: string;
  label: string;
  color: string;
  order: number;
}

interface PipelineOption {
  id: number;
  name: string;
  is_default: boolean;
}

interface LeadDetailSheetProps {
  lead: Lead | null;
  columns: KanbanColumn[];
  onClose: () => void;
  onMove: (waId: string, newStatus: string) => void;
  pipelines?: PipelineOption[];
  activePipelineId?: number;
  onMoveToPipeline?: (waId: string, pipelineId: number) => void;
  onUpdate?: (lead: Lead) => void;
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

function darken(hex: string, amt: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/* Funnel progress indicator */
function FunnelProgress({
  columns,
  currentStatus,
}: {
  columns: KanbanColumn[];
  currentStatus: string;
}) {
  const currentIdx = columns.findIndex((c) => c.key === currentStatus);

  return (
    <div className="flex items-center gap-1 w-full">
      {columns.map((col, i) => {
        const isCurrent = col.key === currentStatus;
        const isPast = i < currentIdx;

        return (
          <div key={col.key} className="flex items-center flex-1 min-w-0">
            {/* Step dot */}
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div
                className="w-3 h-3 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: isCurrent || isPast ? col.color : 'var(--muted)',
                  boxShadow: isCurrent ? `0 0 0 3px ${col.color}40` : 'none',
                  transform: isCurrent ? 'scale(1.3)' : 'scale(1)',
                }}
              />
              <span
                className="text-[9px] font-medium text-center leading-tight max-w-[56px] truncate"
                style={{ color: isCurrent ? col.color : 'var(--muted-foreground)' }}
              >
                {col.label}
              </span>
            </div>
            {/* Connector line */}
            {i < columns.length - 1 && (
              <div
                className="flex-1 h-[2px] mx-0.5 rounded-full transition-colors duration-300"
                style={{
                  backgroundColor: isPast ? col.color : 'var(--border)',
                  opacity: isPast ? 0.5 : 1,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function LeadDetailSheet({ lead, columns, onClose, onMove, pipelines, activePipelineId, onMoveToPipeline, onUpdate }: LeadDetailSheetProps) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');

  if (!lead) return null;

  const currentCol = columns.find((c) => c.key === lead.lead_status);
  const currentIdx = columns.findIndex((c) => c.key === lead.lead_status);
  const nextCol = currentIdx < columns.length - 1 ? columns[currentIdx + 1] : null;
  const accent = currentCol?.color || '#1D4ED8';

  return (
    <Dialog open={!!lead} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="p-0 gap-0 overflow-hidden sm:max-w-6xl max-h-[92vh] rounded-2xl border-0 ring-1 ring-foreground/10"
      >
        <div className="flex flex-col max-h-[92vh]">
          {/* Header band */}
          <div
            className="relative px-6 pt-6 pb-5 text-white flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${accent} 0%, ${darken(accent, 0.24)} 100%)` }}
          >
            <DialogClose asChild>
              <button
                className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                aria-label="Fechar"
              >
                <X className="w-[18px] h-[18px]" />
              </button>
            </DialogClose>

            <div className="flex items-center gap-4 pr-10">
              <div className="w-14 h-14 rounded-2xl bg-white/20 ring-2 ring-white/30 flex items-center justify-center text-xl font-bold flex-shrink-0">
                {(lead.name || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-[19px] font-bold text-white truncate leading-tight">
                  {lead.name || 'Sem nome'}
                </DialogTitle>
                <DialogDescription className="text-[12.5px] text-white/85 flex items-center gap-1.5 mt-1">
                  <Phone className="w-3.5 h-3.5" /> +{lead.wa_id}
                </DialogDescription>
              </div>
              {currentCol && (
                <span className="hidden sm:inline-flex items-center h-7 px-3 rounded-full text-[11.5px] font-semibold bg-white/20 text-white flex-shrink-0">
                  {currentCol.label}
                </span>
              )}
            </div>
          </div>

          {/* Funnel progress */}
          <div className="px-6 py-4 border-b border-border bg-card flex-shrink-0">
            <FunnelProgress columns={columns} currentStatus={lead.lead_status} />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* Quick advance button */}
            {nextCol && (
              <Button
                onClick={() => onMove(lead.wa_id, nextCol.key)}
                className="w-full h-11 font-semibold shadow-sm mb-5 text-white"
                style={{ backgroundColor: nextCol.color }}
              >
                Avançar para {nextCol.label}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              {/* LEFT column — info & actions */}
              <div className="space-y-5">
                {/* Info cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-muted/50 border border-border/60">
                    <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">Entrada</p>
                      <p className="text-[12px] text-foreground font-medium tabular-nums truncate">
                        {formatDate(lead.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-muted/50 border border-border/60">
                    <Sparkles className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">IA Ativa</p>
                      <p className="text-[12px] font-medium">
                        {lead.ai_active ? (
                          <span className="text-primary">Sim</span>
                        ) : (
                          <span className="text-foreground">Não</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Tags */}
                {lead.tags && lead.tags.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Tags
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {lead.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                          style={{
                            backgroundColor: `${tag.color}18`,
                            color: tag.color,
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Move to stage */}
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Mover para
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {columns.map((col) => {
                      const isCurrent = lead.lead_status === col.key;
                      return (
                        <button
                          key={col.key}
                          onClick={() => onMove(lead.wa_id, col.key)}
                          disabled={isCurrent}
                          className="py-2 px-2 rounded-lg text-[11px] font-medium border transition-all duration-200 disabled:cursor-default enabled:hover:scale-[1.02] enabled:hover:shadow-sm text-center leading-tight"
                          style={
                            isCurrent
                              ? {
                                  backgroundColor: `${col.color}18`,
                                  borderColor: `${col.color}40`,
                                  color: col.color,
                                }
                              : {
                                  backgroundColor: 'var(--muted)',
                                  borderColor: 'var(--border)',
                                  color: 'var(--muted-foreground)',
                                }
                          }
                        >
                          {col.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Move to another pipeline */}
                {pipelines && pipelines.length > 1 && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Mover para outro funil
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {pipelines.filter(p => p.id !== activePipelineId).map(p => (
                        <button
                          key={p.id}
                          onClick={() => onMoveToPipeline?.(lead!.wa_id, p.id)}
                          className="py-2 px-3 rounded-lg text-[11px] font-medium border border-border bg-muted text-muted-foreground hover:border-primary hover:text-primary transition-all text-center leading-tight"
                        >
                          {p.name}
                          {p.is_default && <span className="text-[9px] opacity-60 ml-1">(Principal)</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT column — notes */}
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Observações
                  </p>
                  {!editingNotes && lead.notes && (
                    <button
                      onClick={() => { setNotesValue(lead.notes || ''); setEditingNotes(true); }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {editingNotes ? (
                  <div className="flex flex-col flex-1 gap-2">
                    <textarea
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      rows={8}
                      autoFocus
                      placeholder="Adicione observações sobre este lead..."
                      className="flex-1 min-h-[180px] text-[13px] text-foreground bg-muted/50 rounded-xl px-4 py-3 border border-border/60 leading-relaxed w-full resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await api.patch(`/api/contacts/${lead.wa_id}`, { notes: notesValue });
                            const updatedLead = { ...lead, notes: notesValue };
                            if (onUpdate) {
                              onUpdate(updatedLead);
                            }
                            lead.notes = notesValue;
                            setEditingNotes(false);
                          } catch (err) {
                            console.error('Failed to save notes:', err);
                          }
                        }}
                      >
                        Salvar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingNotes(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : lead.notes ? (
                  <p className="flex-1 min-h-[180px] text-[13px] text-foreground/80 bg-muted/50 rounded-xl px-4 py-3 border border-border/60 leading-relaxed whitespace-pre-wrap">
                    {lead.notes}
                  </p>
                ) : (
                  <button
                    onClick={() => { setNotesValue(''); setEditingNotes(true); }}
                    className="flex-1 min-h-[180px] flex items-center justify-center text-[12px] text-primary hover:text-primary/80 font-medium rounded-xl border border-dashed border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    + Adicionar observação
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex gap-2 px-6 py-4 border-t border-border bg-muted/40 flex-shrink-0">
            <Button asChild className="flex-1">
              <a href={`/conversations?wa_id=${lead.wa_id}&channel_id=${lead.channel_id}`}>
                <MessageCircle className="w-4 h-4 mr-2" />
                Abrir Conversa
              </a>
            </Button>
            <Button asChild variant="outline" className="flex-1 bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600 hover:text-white">
              <a href={`https://wa.me/${lead.wa_id}`} target="_blank">
                <Phone className="w-4 h-4 mr-2" />
                WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
