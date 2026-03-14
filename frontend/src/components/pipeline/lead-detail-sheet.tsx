'use client';

import { Phone, MessageCircle, Clock, Sparkles } from 'lucide-react';
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

export function LeadDetailSheet({ lead, columns, onClose, onMove }: LeadDetailSheetProps) {
  if (!lead) return null;

  const currentCol = columns.find((c) => c.key === lead.lead_status);

  return (
    <Sheet open={!!lead} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback
                className="text-lg font-bold text-white"
                style={{ backgroundColor: currentCol?.color || 'var(--primary)' }}
              >
                {(lead.name || '?')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle className="text-[16px]">{lead.name || 'Sem nome'}</SheetTitle>
              <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
                <Phone className="w-3 h-3" /> +{lead.wa_id}
              </p>
            </div>
          </div>
        </SheetHeader>

        <Separator />

        <div className="space-y-5 py-5">
          {/* Info cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Entrada</p>
                <p className="text-[12px] text-foreground font-medium tabular-nums">
                  {formatDate(lead.created_at)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
              <Sparkles className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">IA Ativa</p>
                <p className="text-[12px] text-foreground font-medium">
                  {lead.ai_active ? 'Sim' : 'Não'}
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
                  <Badge key={tag.id} variant="secondary" className="text-[11px]">
                    {tag.name}
                  </Badge>
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
              <p className="text-[13px] text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
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
              {columns.map((col) => (
                <button
                  key={col.key}
                  onClick={() => onMove(lead.wa_id, col.key)}
                  disabled={lead.lead_status === col.key}
                  className="py-2 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-50"
                  style={
                    lead.lead_status === col.key
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
              ))}
            </div>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <Button asChild className="flex-1">
            <a href="/conversations">
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