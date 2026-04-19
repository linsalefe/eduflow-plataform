'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

interface LatestLead {
  wa_id: string;
  name: string | null;
  channel_name?: string | null;
  lead_status?: string | null;
  created_at?: string | null;
}

interface LatestLeadsTableProps {
  leads: LatestLead[];
}

const STATUS_PILL: Record<string, { bg: string; text: string; label: string }> = {
  novo:         { bg: 'var(--color-background-secondary, #F1EFE8)', text: 'var(--muted-foreground)', label: 'Novo' },
  em_contato:   { bg: '#E6F1FB', text: '#0C447C', label: 'Em contato' },
  qualificado:  { bg: '#E1F5EE', text: '#085041', label: 'Qualificado' },
  negociando:   { bg: '#E1F5EE', text: '#085041', label: 'Negociando' },
  matriculado:  { bg: '#E1F5EE', text: '#085041', label: 'Vendido' },
  perdido:      { bg: 'var(--color-background-secondary, #F1EFE8)', text: 'var(--muted-foreground)', label: 'Perdido' },
};

function getInitials(name: string | null): string {
  if (!name) return '??';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || '??';
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}d`;
}

export function LatestLeadsTable({ leads }: LatestLeadsTableProps) {
  const router = useRouter();
  const shown = leads.slice(0, 5);

  if (shown.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="bg-card border border-border/60 rounded-xl p-4 lg:p-5"
    >
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h3 className="text-[14px] font-medium text-foreground">Últimos leads</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {shown.length} mais recentes
          </p>
        </div>
        <button
          onClick={() => router.push('/contatos')}
          className="text-[11px] text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-2.5 py-1 transition-colors"
        >
          Ver todos
        </button>
      </div>

      <div className="divide-y divide-border/60">
        {shown.map((lead) => {
          const status = lead.lead_status || 'novo';
          const pill = STATUS_PILL[status] || STATUS_PILL.novo;
          return (
            <div
              key={lead.wa_id}
              className="grid grid-cols-[28px_1fr_auto_auto_auto] gap-3 items-center py-2 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded-md transition-colors"
              onClick={() => router.push(`/conversations?contact=${lead.wa_id}`)}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium"
                style={{ background: '#E6F1FB', color: '#0C447C' }}
              >
                {getInitials(lead.name)}
              </div>
              <p className="text-[13px] text-foreground truncate">{lead.name || 'Sem nome'}</p>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                {lead.channel_name || 'WhatsApp'}
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap"
                style={{ background: pill.bg, color: pill.text }}
              >
                {pill.label}
              </span>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                {timeAgo(lead.created_at)}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
