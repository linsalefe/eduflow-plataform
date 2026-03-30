'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Check, CheckCheck, X, UserPlus, MessageCircle, AlertTriangle, GitBranch, Bot, Target } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string | null;
  is_read: boolean;
  link: string | null;
  contact_wa_id: string | null;
  created_at: string | null;
}

const typeConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  new_lead: { icon: UserPlus, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  lead_reply: { icon: MessageCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  task_overdue: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10' },
  status_change: { icon: GitBranch, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ai_handoff: { icon: Bot, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  task_created: { icon: Target, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
};

const defaultType = { icon: Bell, color: 'text-gray-500', bg: 'bg-gray-500/10' };

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = useCallback(async () => {
    try {
      const [notifRes, countRes] = await Promise.all([
        api.get('/notifications?limit=20'),
        api.get('/notifications/unread-count'),
      ]);
      setNotifications(notifRes.data);
      setUnreadCount(countRes.data.count);
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Fechar ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAsRead = async (id: number) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const markAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const handleClick = (notif: Notification) => {
    if (!notif.is_read) markAsRead(notif.id);
    if (notif.link) {
      router.push(notif.link);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-400 hover:text-white hover:bg-white/[0.06] rounded-xl transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] bg-[#1a2d42] border border-white/[0.08] rounded-2xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-white">Notificações</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-[11px] text-[#00a884] hover:text-[#06cf9c] font-medium transition-colors flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Marcar todas
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 text-gray-500 hover:text-white rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Nenhuma notificação</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const cfg = typeConfig[notif.type] || defaultType;
                const Icon = cfg.icon;

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleClick(notif)}
                    className={`flex items-start gap-3 px-4 py-3 serviçor-pointer transition-colors border-b border-white/[0.04] ${
                      notif.is_read
                        ? 'hover:bg-white/[0.02]'
                        : 'bg-white/[0.03] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-[13px] leading-snug ${notif.is_read ? 'text-gray-400' : 'text-white font-medium'}`}>
                          {notif.title}
                        </p>
                        {!notif.is_read && (
                          <span className="w-2 h-2 rounded-full bg-[#00a884] flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                      {notif.message && (
                        <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-1">{notif.message}</p>
                      )}
                      {notif.created_at && (
                        <p className="text-[11px] text-gray-600 mt-1">{timeAgo(notif.created_at)}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}