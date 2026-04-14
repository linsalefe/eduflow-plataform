'use client';

import { Clock, Sparkles, MessageCircle } from 'lucide-react';

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

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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

export function KanbanCard({ lead, color, onClick, isDragging = false }: KanbanCardProps) {
  const time = lead.updated_at
    ? getRelativeTime(lead.updated_at)
    : lead.created_at
    ? getRelativeTime(lead.created_at)
    : '';

  const initials = getInitials(lead.name);
  const visibleTags = lead.tags?.slice(0, 2) ?? [];
  const extraTags = (lead.tags?.length ?? 0) - visibleTags.length;
  const notes = sanitizeNotes(lead.notes);

  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl cursor-grab active:cursor-grabbing select-none group transition-all duration-200 ${
        isDragging
          ? 'opacity-90 scale-[0.97] shadow-xl shadow-black/15 rotate-[1.5deg]'
          : 'hover:shadow-lg hover:-translate-y-0.5'
      }`}
      style={{
        background: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${hexToRgba(color, 0.15)}`,
      }}
    >
      {/* Top accent gradient */}
      <div
        className="absolute top-0 left-3 right-3 h-[2px] rounded-full"
        style={{
          background: `linear-gradient(90deg, ${color}, ${hexToRgba(color, 0.3)})`,
        }}
      />

      <div className="p-3 space-y-2.5">
        {/* Row 1: Avatar + Name + Time */}
        <div className="flex items-center gap-2.5">
          <div
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold"
            style={{
              background: `linear-gradient(135deg, ${hexToRgba(color, 0.2)}, ${hexToRgba(color, 0.08)})`,
              color,
            }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-gray-900 truncate" title={lead.name || 'Sem nome'}>
              {lead.name || 'Sem nome'}
            </p>
            {time && (
              <span className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5">
                <Clock className="w-2.5 h-2.5" />
                {time}
              </span>
            )}
          </div>
          {lead.ai_active && (
            <div
              className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg"
              style={{
                background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.12), rgba(147, 51, 234, 0.04))',
              }}
              title="IA ativa"
            >
              <Sparkles className="w-3 h-3 text-purple-500" />
              <span className="text-[10px] font-semibold text-purple-500">IA</span>
            </div>
          )}
        </div>

        {/* Row 2: Notes */}
        {notes && (
          <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-1 pl-[42px]">
            {notes}
          </p>
        )}

        {/* Row 3: Tags */}
        {visibleTags.length > 0 && (
          <div className="flex items-center gap-1.5 pl-[42px]">
            {visibleTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center h-[18px] px-2 rounded-md text-[10px] font-medium"
                style={{
                  backgroundColor: hexToRgba(tag.color, 0.12),
                  color: tag.color,
                }}
              >
                {tag.name}
              </span>
            ))}
            {extraTags > 0 && (
              <span className="text-[10px] text-gray-400">+{extraTags}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}