'use client';

import { Clock, Sparkles, MessageCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';

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

/** Retorna null se a nota for JSON cru ou vazia */
function sanitizeNotes(notes: string | null): string | null {
  if (!notes) return null;
  const trimmed = notes.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return null;
  if (trimmed.length < 3) return null;
  return trimmed;
}

export function KanbanCard({ lead, color, onClick, isDragging = false }: KanbanCardProps) {
  const time =
    lead.updated_at
      ? getRelativeTime(lead.updated_at)
      : lead.created_at
      ? getRelativeTime(lead.created_at)
      : '';

  const initials = getInitials(lead.name);
  const avatarBg = hexToRgba(color, 0.15);
  const visibleTags = lead.tags?.slice(0, 2) ?? [];
  const extraTags = (lead.tags?.length ?? 0) - visibleTags.length;
  const notes = sanitizeNotes(lead.notes);

  return (
    <Card
      onClick={onClick}
      className={`relative overflow-hidden serviçor-grab active:serviçor-grabbing border border-border/60 bg-card transition-all duration-200 select-none group ${
        isDragging
          ? 'opacity-80 scale-[0.97] shadow-lg shadow-black/10 rotate-[1.5deg]'
          : 'hover:shadow-md hover:border-border hover:-translate-y-0.5'
      }`}
    >
      {/* Accent bar esquerda */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg"
        style={{ backgroundColor: color }}
      />

      <div className="p-2.5 pl-[14px] space-y-2">

        {/* ── Linha 1: Avatar + Nome ── */}
        <div className="flex items-start gap-2">
          {/* Avatar compacto */}
          <div
            className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold leading-none mt-[1px]"
            style={{ backgroundColor: avatarBg, color }}
          >
            {initials}
          </div>

          {/* 
            Nome sem truncate/line-clamp: usa break-words para quebrar
            naturalmente. A largura total da coluna limita o texto.
          */}
          <p
            className="flex-1 min-w-0 text-[11.5px] font-semibold text-foreground leading-[1.35] break-words"
            title={lead.name || 'Sem nome'}
          >
            {lead.name || 'Sem nome'}
          </p>
        </div>

        {/* ── Linha 2: Nota (somente se não for JSON) ── */}
        {notes && (
          <div className="flex items-start gap-1 pl-[32px]">
            <MessageCircle className="w-2.5 h-2.5 text-muted-foreground/50 flex-shrink-0 mt-[1px]" />
            <p className="text-[10px] text-muted-foreground leading-snug line-clamp-1">
              {notes}
            </p>
          </div>
        )}

        {/* ── Linha 3: Tags ── */}
        {visibleTags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap pl-[32px]">
            {visibleTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center h-[14px] px-1.5 rounded-full text-[9px] font-medium leading-none"
                style={{
                  backgroundColor: hexToRgba(tag.color, 0.15),
                  color: tag.color,
                }}
              >
                {tag.name}
              </span>
            ))}
            {extraTags > 0 && (
              <span className="text-[9px] text-muted-foreground">+{extraTags}</span>
            )}
          </div>
        )}

        {/* ── Linha 4 (rodapé): IA badge + Tempo ── */}
        <div className="flex items-center justify-between pl-[32px]">
          {lead.ai_active ? (
            <div
              className="flex items-center gap-1 h-4 px-1.5 rounded-full"
              style={{ backgroundColor: hexToRgba('#9333ea', 0.1) }}
              title="IA ativa"
            >
              <Sparkles className="w-2.5 h-2.5 text-purple-500" />
              <span className="text-[9px] font-medium text-purple-500 leading-none">IA</span>
            </div>
          ) : (
            <span />
          )}

          {time && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
              <Clock className="w-2.5 h-2.5" />
              {time}
            </span>
          )}
        </div>

      </div>
    </Card>
  );
}