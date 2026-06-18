'use client';

import { Clock, Sparkles, User } from 'lucide-react';

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
  deal_value?: number;
  assigned_to_name?: string | null;
  assigned_to_initials?: string | null;
  profile_picture_url?: string | null;
}

export type Density = 'compact' | 'detailed';

interface KanbanCardProps {
  lead: Lead;
  color: string;
  onClick: () => void;
  isDragging?: boolean;
  density?: Density;
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

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export function KanbanCard({ lead, color, onClick, isDragging = false, density = 'detailed' }: KanbanCardProps) {
  const time = lead.updated_at
    ? getRelativeTime(lead.updated_at)
    : lead.created_at
    ? getRelativeTime(lead.created_at)
    : '';

  const initials = getInitials(lead.name);
  const isDetailed = density === 'detailed';
  const visibleTags = isDetailed ? (lead.tags?.slice(0, 4) ?? []) : [];
  const extraTags = (lead.tags?.length ?? 0) - visibleTags.length;
  const hasDealValue = isDetailed && lead.deal_value && lead.deal_value > 0;
  const hasAssigned = isDetailed && lead.assigned_to_name;

  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl cursor-grab active:cursor-grabbing select-none group transition-all duration-200 bg-card border border-border/60 ${
        isDragging
          ? 'opacity-90 scale-[0.97] shadow-xl shadow-black/15 rotate-[1.5deg]'
          : 'hover:shadow-md hover:-translate-y-0.5'
      }`}
    >
      <div className="p-3 space-y-2">
        {/* Row 1: Avatar + Name + Value/Time */}
        <div className="flex items-start gap-2.5">
          {/* Avatar */}
          <div className="flex-shrink-0 w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center text-[11px] font-medium"
            style={{ background: '#E6F1FB', color: '#0C447C' }}
          >
            {lead.profile_picture_url ? (
              <img
                src={lead.profile_picture_url}
                alt={lead.name}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.textContent = initials; }}
              />
            ) : (
              initials
            )}
          </div>

          {/* Name + time */}
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

          {/* Deal value (detailed only) or AI badge */}
          <div className="flex-shrink-0 flex items-center gap-1.5">
            {hasDealValue && (
              <span className="text-[11px] font-semibold text-emerald-600 whitespace-nowrap">
                {formatBRL(lead.deal_value!)}
              </span>
            )}
            {lead.ai_active && (
              <div
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted"
                title="IA ativa"
              >
                <Sparkles className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground">IA</span>
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Tags (detailed only) */}
        {visibleTags.length > 0 && (
          <div className="flex items-center gap-1.5 pl-[42px] flex-wrap">
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

        {/* Row 3: Footer — Assigned + AI badge (detailed only) */}
        {hasAssigned && (
          <div className="flex items-center justify-between pl-[42px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-semibold">
                {lead.assigned_to_initials || '?'}
              </div>
              <span className="text-[10px] text-gray-500 truncate">
                {lead.assigned_to_name}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
