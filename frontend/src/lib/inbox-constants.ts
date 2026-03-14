/**
 * Inbox Constants & Utility Functions
 * Constantes estáticas e funções puras extraídas do page.tsx
 */

export const leadStatuses = [
  { value: 'novo', label: 'Novo', color: 'bg-blue-500', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  { value: 'em_contato', label: 'Em contato', color: 'bg-amber-500', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  { value: 'qualificado', label: 'Qualificado', color: 'bg-purple-500', bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  { value: 'negociando', label: 'Negociando', color: 'bg-cyan-500', bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  { value: 'convertido', label: 'Convertido', color: 'bg-emerald-500', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  { value: 'perdido', label: 'Perdido', color: 'bg-red-500', bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
];

export const tagColors = [
  { value: 'blue', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  { value: 'green', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  { value: 'red', bg: 'bg-red-500/20', text: 'text-red-400' },
  { value: 'purple', bg: 'bg-purple-500/20', text: 'text-purple-400' },
  { value: 'amber', bg: 'bg-amber-500/20', text: 'text-amber-400' },
  { value: 'pink', bg: 'bg-pink-500/20', text: 'text-pink-400' },
  { value: 'cyan', bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
];

export function getInitials(name: string): string {
  return name ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : '??';
}

export function getAvatarColor(name: string): string {
  const c = [
    'from-blue-500 to-blue-600',
    'from-purple-500 to-purple-600',
    'from-emerald-500 to-emerald-600',
    'from-orange-500 to-orange-600',
    'from-pink-500 to-pink-600',
    'from-cyan-500 to-cyan-600',
    'from-indigo-500 to-indigo-600',
  ];
  return c[(name || '').charCodeAt(0) % c.length];
}

export function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(ts: string): string {
  const d = new Date(ts);
  const t = new Date();
  if (d.toDateString() === t.toDateString()) return 'Hoje';
  const y = new Date(t);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR');
}

export function formatFullDate(ts: string): string {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function formatRecordingTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function getStatusConfig(s: string) {
  return leadStatuses.find(x => x.value === s) || leadStatuses[0];
}

export function getTagColorConfig(c: string) {
  return tagColors.find(x => x.value === c) || tagColors[0];
}
