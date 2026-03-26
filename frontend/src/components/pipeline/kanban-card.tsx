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

function getRelativeTime(d: string): string {
  const now = new Date();
  const date = new Date(d);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  if (diffH < 24) return `${diffH}h`;
  if (diffD < 7) return `${diffD}d`;
  return formatDate(d);
}

export function KanbanCard({ lead, color, onClick, isDragging = false }: KanbanCardProps) {
  return (
    <Card
      onClick={onClick}
      className={`relative overflow-hidden cursor-grab active:cursor-grabbing border border-border transition-all duration-200 select-none group ${
        isDragging
          ? 'opacity-80 scale-[0.97] shadow-lg shadow-black/10 rotate-[1.5deg]'
          : 'hover:shadow-md hover:-translate-y-0.5'
      }`}
    >
      {/* Left color accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg"
        style={{ backgroundColor: color }}
      />

      <div className="p-3.5 pl-4">
        {/* Avatar + Name */}
        <div className="flex items-center gap-2.5 mb-2">
          <Avatar className="h-8 w-8 flex-shrink-0 ring-2 ring-background">
            <AvatarFallback
              className="text-[12px] font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {(lead.name || '?')[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground truncate">
              {lead.name || 'Sem nome'}
            </p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3" />+{lead.wa_id}
            </p>
          </div>
          {lead.ai_active && (
            <div className="flex-shrink-0 h-6 w-6 rounded-md bg-purple-50 flex items-center justify-center" title="IA ativa">
              <Sparkles className="w-3 h-3 text-purple-500" />
            </div>
          )}
        </div>

        {/* Tags */}
        {lead.tags && lead.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {lead.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  backgroundColor: `${tag.color}18`,
                  color: tag.color,
                }}
              >
                {tag.name}
              </span>
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
          <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2 leading-relaxed">
            {(() => {
              try {
                const parsed = JSON.parse(lead.notes);
                return Object.entries(parsed)
                  .filter(([_, v]) => v && v !== 'null')
                  .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
                  .join(' · ') || '';
              } catch {
                return lead.notes;
              }
            })()}
          </p>
        )}

        {/* Footer: relative time */}
        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1 tabular-nums">
            <Clock className="w-3 h-3" />
            {getRelativeTime(lead.updated_at)}
          </span>
        </div>
      </div>
    </Card>
  );
}