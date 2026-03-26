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

/** Gera as iniciais a partir do nome completo (máx 2 letras) */
function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Cria uma cor de fundo suave derivada do accent color da coluna */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(100,100,100,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
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

  return (
    <Card
      onClick={onClick}
      className={`relative overflow-hidden cursor-grab active:cursor-grabbing border border-border/60 bg-card transition-all duration-200 select-none group ${
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

      <div className="p-3 pl-4 space-y-2.5">
        {/* Linha 1: Avatar + Nome + IA badge */}
        <div className="flex items-start gap-2.5">
          {/* Avatar com iniciais */}
          <div
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold leading-none"
            style={{ backgroundColor: avatarBg, color }}
          >
            {initials}
          </div>

          {/* Nome (até 2 linhas) + IA */}
          <div className="flex-1 min-w-0 pt-0.5">
            <p
              className="text-[12.5px] font-semibold text-foreground leading-snug line-clamp-2"
              title={lead.name || 'Sem nome'}
            >
              {lead.name || 'Sem nome'}
            </p>
          </div>

          {/* IA badge */}
          {lead.ai_active && (
            <div
              className="flex-shrink-0 mt-0.5 h-5 px-1.5 rounded-full flex items-center gap-1"
              style={{ backgroundColor: hexToRgba('#9333ea', 0.1) }}
              title="IA ativa"
            >
              <Sparkles className="w-2.5 h-2.5 text-purple-500" />
              <span className="text-[9px] font-medium text-purple-500 leading-none">IA</span>
            </div>
          )}
        </div>

        {/* Linha 2: Nota (se houver) */}
        {lead.notes && (
          <div className="flex items-start gap-1.5 pl-[2px]">
            <MessageCircle className="w-3 h-3 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
            <p className="text-[10.5px] text-muted-foreground leading-snug line-clamp-1">
              {lead.notes}
            </p>
          </div>
        )}

        {/* Linha 3: Tags + Tempo */}
        <div className="flex items-center justify-between gap-1.5 pl-[2px]">
          {/* Tags */}
          <div className="flex items-center gap-1 flex-wrap">
            {visibleTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center h-4 px-1.5 rounded-full text-[9px] font-medium leading-none"
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

          {/* Tempo */}
          {time && (
            <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
              <Clock className="w-2.5 h-2.5" />
              {time}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}