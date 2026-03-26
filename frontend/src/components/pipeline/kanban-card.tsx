'use client';

import { Phone, Clock, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
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

function getRelativeTime(d: string): string {
  const now = new Date();
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  if (diffH < 24) return `${diffH}h`;
  if (diffD < 7) return `${diffD}d`;
  return `${diffD}d`;
}

export function KanbanCard({ lead, color, onClick, isDragging = false }: KanbanCardProps) {
  const time = lead.updated_at ? getRelativeTime(lead.updated_at) : lead.created_at ? getRelativeTime(lead.created_at) : '';

  return (
    <Card
      onClick={onClick}
      className={`relative overflow-hidden cursor-grab active:cursor-grabbing border border-border transition-all duration-200 select-none group ${
        isDragging
          ? 'opacity-80 scale-[0.97] shadow-lg shadow-black/10 rotate-[1.5deg]'
          : 'hover:shadow-md hover:-translate-y-0.5'
      }`}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg"
        style={{ backgroundColor: color }}
      />

      <div className="p-2.5 pl-3.5">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7 flex-shrink-0">
            <AvatarFallback
              className="text-[11px] font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {(lead.name || '?')[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-foreground truncate">
              {lead.name || 'Sem nome'}
            </p>
            <div className="flex items-center gap-2">
              {time && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />{time}
                </span>
              )}
            </div>
          </div>
          {lead.ai_active && (
            <div className="flex-shrink-0 h-5 w-5 rounded-md bg-purple-50 flex items-center justify-center" title="IA ativa">
              <Sparkles className="w-2.5 h-2.5 text-purple-500" />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}