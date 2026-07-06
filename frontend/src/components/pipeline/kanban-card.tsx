'use client';

import { Clock, Sparkles } from 'lucide-react';

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
  pipeline_id: number | null;
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
  return `${diffD}d`;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(100,100,100,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

function sanitizeNotes(notes: string | null): string | null {
  if (!notes) return null;
  const trimmed = notes.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return null;
  if (trimmed.length < 3) return null;
  return trimmed;
}

export function KanbanCard({ lead, onClick, isDragging = false }: KanbanCardProps) {
  const time = lead.updated_at
    ? getRelativeTime(lead.updated_at)
    : lead.created_at
    ? getRelativeTime(lead.created_at)
    : '';

  const visibleTags = lead.tags?.slice(0, 2) ?? [];
  const extraTags = (lead.tags?.length ?? 0) - visibleTags.length;
  const notes = sanitizeNotes(lead.notes);

  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl cursor-grab active:cursor-grabbing select-none bg-card border transition-all duration-150 ${
        isDragging
          ? 'opacity-90 scale-[0.98] shadow-xl shadow-black/15 rotate-[1.5deg] border-primary'
          : 'border-border/70 shadow-sm hover:border-primary hover:-translate-y-0.5 hover:shadow-md'
      }`}
    >
      <div className="p-3 space-y-2">
        {/* Row 1: Name + IA */}
        <div className="flex items-start justify-between gap-2">
          <p
            className="text-[13px] font-semibold text-foreground truncate leading-snug"
            title={lead.name || 'Sem nome'}
          >
            {lead.name || 'Sem nome'}
          </p>
          {lead.ai_active && (
            <span
              className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary"
              title="IA ativa"
            >
              <Sparkles className="w-3 h-3" />
              <span className="text-[10px] font-semibold">IA</span>
            </span>
          )}
        </div>

        {/* Row 2: Time */}
        {time && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{time}</span>
          </div>
        )}

        {/* Row 3: Notes */}
        {notes && (
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed line-clamp-1">
            {notes}
          </p>
        )}

        {/* Row 4: Tags */}
        {visibleTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {visibleTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center h-[18px] px-2 rounded-full text-[10px] font-semibold"
                style={{
                  backgroundColor: hexToRgba(tag.color, 0.14),
                  color: tag.color,
                }}
              >
                {tag.name}
              </span>
            ))}
            {extraTags > 0 && (
              <span className="text-[10px] text-muted-foreground">+{extraTags}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
