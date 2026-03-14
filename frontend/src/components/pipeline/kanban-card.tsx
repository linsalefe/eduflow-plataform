'use client';

import { Phone, Clock, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Lead {
  wa_id: string;
  name: string;
  lead_status: string;
  notes: string | null;
  ai_active: boolean;
  channel_id: number;
  created_at: string;
  updated_at: string;
  tags: Tag[];
}

interface KanbanCardProps {
  lead: Lead;
  color: string;
  onClick: () => void;
  isDragging?: boolean;
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export function KanbanCard({ lead, color, onClick, isDragging = false }: KanbanCardProps) {
  return (
    <Card
      onClick={onClick}
      className={`p-3.5 cursor-grab active:cursor-grabbing border border-border hover:border-border/80 hover:shadow-[var(--shadow-sm)] transition-all select-none ${
        isDragging ? 'opacity-60 scale-[0.98] shadow-[var(--shadow-lg)] rotate-[2deg]' : ''
      }`}
    >
      {/* Avatar + Name */}
      <div className="flex items-center gap-2.5 mb-2">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback
            className="text-[12px] font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {(lead.name || '?')[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground truncate">
            {lead.name || 'Sem nome'}
          </p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Phone className="w-3 h-3" />+{lead.wa_id}
          </p>
        </div>
      </div>

      {/* Tags */}
      {lead.tags && lead.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {lead.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-5 font-medium"
            >
              {tag.name}
            </Badge>
          ))}
          {lead.tags.length > 3 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
              +{lead.tags.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Notes preview */}
      {lead.notes && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">
          {lead.notes}
        </p>
      )}

      {/* Footer: date + AI badge */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1 tabular-nums">
          <Clock className="w-3 h-3" />
          {formatDate(lead.created_at)}
        </span>
        {lead.ai_active && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-purple-50 text-purple-600 border-0">
            <Sparkles className="w-3 h-3 mr-0.5" />
            IA
          </Badge>
        )}
      </div>
    </Card>
  );
}