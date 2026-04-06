'use client';

import { Phone, MessageCircle, Clock, Sparkles, ArrowRight } from 'lucide-react';
import { Lead } from './kanban-card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface KanbanColumn {
  key: string;
  label: string;
  color: string;
  order: number;
}

interface LeadDetailSheetProps {
  lead: Lead | null;
  columns: KanbanColumn[];
  onClose: () => void;
  onMove: (waId: string, newStatus: string) => void;
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

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

export function LeadDetailSheet({ lead, columns, onClose, onMove }: LeadDetailSheetProps) {
  if (!lead) return null;

  const currentCol = columns.find((c) => c.key === lead.lead_status);
  const currentIdx = columns.findIndex((c) => c.key === lead.lead_status);
  const nextCol = currentIdx < columns.length - 1 ? columns[currentIdx + 1] : null;

  return (
    <Sheet open={!!lead} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 ring-2 ring-background">
              <AvatarFallback
                className="text-lg font-bold text-white"
                style={{ backgroundColor: currentCol?.color || 'var(--primary)' }}
              >
                {(lead.name || '?')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-[16px] truncate">{lead.name || 'Sem nome'}</SheetTitle>
              <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
                <Phone className="w-3 h-3" /> +{lead.wa_id}
              </p>
            </div>
            {currentCol && (
              <Badge
                className="text-[11px] font-semibold border-0 flex-shrink-0"
                style={{
                  backgroundColor: `${currentCol.color}18`,
                  color: currentCol.color,
                }}
              >
                {currentCol.label}
              </Badge>
            )}
          </div>
        </SheetHeader>

        {/* Funnel progress */}
        <div className="py-4 px-1">
          <FunnelProgress columns={columns} currentStatus={lead.lead_status} />
        </div>

        <Separator />

        <div className="space-y-5 py-5">
          {/* Quick advance button */}
          {nextCol && (
            <Button
              onClick={() => onMove(lead.wa_id, nextCol.key)}
              className="w-full h-10 font-medium shadow-sm"
              style={{
                backgroundColor: nextCol.color,
                color: 'white',
              }}
            >
              Avançar para {nextCol.label}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}

          {/* Info cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-muted/50 border border-border/50">
              <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Entrada</p>
                <p className="text-[12px] text-foreground font-medium tabular-nums">
                  {formatDate(lead.created_at)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-muted/50 border border-border/50">
              <Sparkles className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">IA Ativa</p>
                <p className="text-[12px] text-foreground font-medium">
                  {lead.ai_active ? (
                    <span className="text-purple-600">Sim</span>
                  ) : (
                    'Não'
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

          {/* Notes */}
          {lead.notes && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Observações
              </p>
              <p className="text-[13px] text-muted-foreground bg-muted/50 rounded-lg px-4 py-3 border border-border/50 leading-relaxed">
                {lead.notes}
              </p>
            </div>
          )}

          {/* Move to */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Mover para
            </p>
            <div className="grid grid-cols-3 gap-2">
              {columns.map((col) => {
                const isCurrent = lead.lead_status === col.key;
                return (
                  <button
                    key={col.key}
                    onClick={() => onMove(lead.wa_id, col.key)}
                    disabled={isCurrent}
                    className="py-2 rounded-lg text-[11px] font-medium border transition-all duration-200 disabled:serviçor-default hover:not-disabled:scale-[1.02] hover:not-disabled:shadow-sm"
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
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <Button asChild className="flex-1">
            <a href={`/conversations?wa_id=${lead.wa_id}`}>
              <MessageCircle className="w-4 h-4 mr-2" />
              Abrir Conversa
            </a>
          </Button>
          <Button asChild variant="outline" className="bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600 hover:text-white">
            <a href={`https://wa.me/${lead.wa_id}`} target="_blank">
              <Phone className="w-4 h-4 mr-2" />
              WhatsApp
            </a>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}