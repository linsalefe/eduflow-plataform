'use client';

import { useEffect, useState } from 'react';
import {
  GitBranch, Tag, FileText, Bot, Clock, Loader2,
} from 'lucide-react';
import api from '@/lib/api';

interface Activity {
  id: number;
  type: string;
  description: string;
  metadata: string | null;
  created_at: string | null;
}

const typeConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  status_change: { icon: GitBranch, color: 'text-amber-400', bg: 'bg-amber-400/15' },
  tag_added: { icon: Tag, color: 'text-emerald-400', bg: 'bg-emerald-400/15' },
  tag_removed: { icon: Tag, color: 'text-red-400', bg: 'bg-red-400/15' },
  note: { icon: FileText, color: 'text-blue-400', bg: 'bg-blue-400/15' },
  ai_toggle: { icon: Bot, color: 'text-purple-400', bg: 'bg-purple-400/15' },
};

const defaultConfig = { icon: Clock, color: 'text-[#8696a0]', bg: 'bg-[#8696a0]/15' };

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function ActivityTimeline({ contactWaId }: { contactWaId: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contactWaId) return;
    setLoading(true);
    api.get(`/contacts/${contactWaId}/activities?limit=30`)
      .then(res => setActivities(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [contactWaId]);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-4 h-4 text-[#8696a0] animate-spin" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-6">
        <Clock className="w-6 h-6 text-[#3b4a54] mx-auto mb-1.5" />
        <p className="text-[12px] text-[#8696a0]">Nenhuma atividade registrada</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-[#2a3942]" />

      <div className="space-y-0.5">
        {activities.map((activity) => {
          const cfg = typeConfig[activity.type] || defaultConfig;
          const Icon = cfg.icon;

          return (
            <div key={activity.id} className="flex items-start gap-2.5 px-1 py-2 relative">
              {/* Icon */}
              <div className={`w-[30px] h-[30px] rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0 z-10`}>
                <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-[12px] text-[#e9edef] leading-snug">{activity.description}</p>
                {activity.created_at && (
                  <p className="text-[10px] text-[#8696a0] mt-0.5">{formatTimeAgo(activity.created_at)}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}