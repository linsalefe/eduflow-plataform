'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Zap, Plus, Trash2, ToggleLeft, ToggleRight,
  Loader2, ChevronDown, ChevronUp, Clock,
  CheckCircle, Pencil, X, Copy, Link
} from 'lucide-react';
import AppShell from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import api from '@/lib/api';

const STAGES = [
  { key: 'novo', label: 'Novos Leads' },
  { key: 'em_contato', label: 'Em Contato' },
  { key: 'qualificado', label: 'Qualificados' },
  { key: 'negociando', label: 'Em Negociação' },
  { key: 'convertido', label: 'Convertidos' },
  { key: 'perdido', label: 'Perdidos' },
];

const STAGE_COLORS: Record<string, string> = {
  novo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  em_contato: 'bg-amber-50 text-amber-700 border-amber-200',
  qualificado: 'bg-purple-50 text-purple-700 border-purple-200',
  negociando: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  convertido: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  perdido: 'bg-red-50 text-red-700 border-red-200',
};

interface Step {
  id?: number;
  step_order: number;
  delay_minutes: number;
  delay_unit: 'minutes' | 'hours' | 'days';
  message: string;
}

interface Flow {
  id: number;
  name: string;
  stage: string;
  channel_id: number | null;
  is_active: boolean;
  created_at: string;
  steps: Step[];
}

interface Stats {
  total_flows: number;
  active_flows: number;
  sent_today: number;
}

interface QueueItem {
  contact_wa_id: string;
  contact_name: string;
  current_step: number;
  status: string;
  next_send_at: string | null;
  sent_at: string | null;
  error_message: string | null;
}

interface QueueData {
  pending: QueueItem[];
  history: QueueItem[];
}

interface Webhook {
  id: number;
  name: string;
  channel_id: number;
  channel_name: string;
  welcome_message: string;
  is_active: boolean;
  url: string;
}

const emptyStep = (): Step => ({ step_order: 1, delay_minutes: 60, delay_unit: 'hours', message: '' });

export default function AutomacoesPage() {
  const [activeTab, setActiveTab] = useState<'fluxos' | 'webhooks'>('fluxos');

  // Fluxos
  const [flows, setFlows] = useState<Flow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editFlow, setEditFlow] = useState<Flow | null>(null);
  const [saving, setSaving] = useState(false);
  const [queue, setQueue] = useState<Record<number, QueueData>>({});
  const [loadingQueue, setLoadingQueue] = useState<number | null>(null);

  // Form fluxo
  const [formName, setFormName] = useState('');
  const [formStage, setFormStage] = useState('novo');
  const [formSteps, setFormSteps] = useState<Step[]>([emptyStep()]);
  const [formChannelId, setFormChannelId] = useState<number>(0);

  // Webhooks
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(true);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [editWebhook, setEditWebhook] = useState<Webhook | null>(null);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [kanbanColumns, setKanbanColumns] = useState<{key: string; label: string}[]>([]);

  // Form webhook
  const [wName, setWName] = useState('');
  const [wMessage, setWMessage] = useState('')
  const [wChannelId, setWChannelId] = useState<number>(0);
  const [channels, setChannels] = useState<any[]>([]);

  const [mounted, setMounted] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (!authLoading && !user) router.push('/login'); }, [user, authLoading, router]);
  useEffect(() => {
    if (user) {
      loadFlows();
      loadWebhooks();
      loadChannels();
      loadKanbanColumns();
    }
  }, [user]);

  const loadFlows = async () => {
    try {
      const [flowsRes, statsRes] = await Promise.all([
        api.get('/automations'),
        api.get('/automations/stats'),
      ]);
      setFlows(flowsRes.data);
      setStats(statsRes.data);
    } catch {
      toast.error('Erro ao carregar fluxos');
    } finally {
      setLoading(false);
    }
  };

  const loadWebhooks = async () => {
    setLoadingWebhooks(true);
    try {
      const res = await api.get('/webhooks');
      setWebhooks(res.data);
    } catch {
      toast.error('Erro ao carregar webhooks');
    } finally {
      setLoadingWebhooks(false);
    }
  };

  const loadChannels = async () => {
    try {
      const res = await api.get('/channels');
      setChannels(res.data);
      if (res.data.length > 0) setWChannelId(res.data[0].id);
    } catch {}
  };

  const loadKanbanColumns = async () => {
    try {
      const res = await api.get('/tenant/kanban-columns');
      setKanbanColumns(res.data);
    } catch {}
  };

  // ── Fluxos ─────────────────────────────────────────────

  const openCreate = () => {
    setEditFlow(null);
    setFormName('');
    setFormStage('novo');
    setFormSteps([emptyStep()]);
    if (channels.length > 0) setFormChannelId(channels[0].id);
    setShowModal(true);
  };

  const openEdit = (flow: Flow) => {
    setEditFlow(flow);
    setFormName(flow.name);
    setFormStage(flow.stage);
    setFormSteps(flow.steps.length > 0 ? flow.steps.map(s => ({ ...s, ...fromMinutes(s.delay_minutes) })) : [emptyStep()]);
    setFormChannelId(flow.channel_id || (channels.length > 0 ? channels[0].id : 0));
    setShowModal(true);
  };

  const addStep = () => {
    setFormSteps(prev => [...prev, { step_order: prev.length + 1, delay_minutes: 1440, delay_unit: 'days', message: '' }]);
  };

  const removeStep = (index: number) => {
    setFormSteps(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_order: i + 1 })));
  };

  const updateStep = (index: number, field: keyof Step, value: any) => {
    setFormSteps(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const toMinutes = (value: number, unit: string) => {
    if (unit === 'minutes') return value;
    if (unit === 'hours') return value * 60;
    return value * 1440;
  };

  const fromMinutes = (minutes: number): { delay_minutes: number; delay_unit: 'minutes' | 'hours' | 'days' } => {
    if (minutes % 1440 === 0) return { delay_minutes: minutes / 1440, delay_unit: 'days' };
    if (minutes % 60 === 0) return { delay_minutes: minutes / 60, delay_unit: 'hours' };
    return { delay_minutes: minutes, delay_unit: 'minutes' };
  };

  const formatDelay = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h${minutes % 60 > 0 ? ` ${minutes % 60}min` : ''}`;
    const days = Math.floor(minutes / 1440);
    const remaining = minutes % 1440;
    return remaining > 0 ? `${days}d ${Math.floor(remaining / 60)}h` : `${days} dia${days > 1 ? 's' : ''}`;
  };

  const handleSaveFlow = async () => {
    if (!formName.trim()) return toast.error('Dê um nome ao fluxo');
    if (formSteps.some(s => !s.message.trim())) return toast.error('Preencha todas as mensagens');
    setSaving(true);
    try {
      const payload = {
        name: formName,
        stage: formStage,
        channel_id: formChannelId,
        steps: formSteps.map(s => ({ ...s, delay_minutes: toMinutes(s.delay_minutes, s.delay_unit) })),
      };
      if (editFlow) {
        await api.put(`/automations/${editFlow.id}`, payload);
        toast.success('Fluxo atualizado');
      } else {
        await api.post('/automations', payload);
        toast.success('Fluxo criado');
      }
      setShowModal(false);
      loadFlows();
    } catch {
      toast.error('Erro ao salvar fluxo');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (flow: Flow) => {
    try {
      await api.put(`/automations/${flow.id}`, { is_active: !flow.is_active });
      setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, is_active: !f.is_active } : f));
      toast.success(flow.is_active ? 'Fluxo pausado' : 'Fluxo ativado');
    } catch {
      toast.error('Erro ao atualizar fluxo');
    }
  };

  const deleteFlow = async (flow: Flow) => {
    if (!confirm(`Excluir o fluxo "${flow.name}"?`)) return;
    try {
      await api.delete(`/automations/${flow.id}`);
      setFlows(prev => prev.filter(f => f.id !== flow.id));
      toast.success('Fluxo excluído');
    } catch {
      toast.error('Erro ao excluir fluxo');
    }
  };

  const toggleExpand = async (flow: Flow) => {
    if (expanded === flow.id) { setExpanded(null); return; }
    setExpanded(flow.id);
    if (queue[flow.id]) return;
    setLoadingQueue(flow.id);
    try {
      const res = await api.get(`/automations/${flow.id}/queue`);
      setQueue(prev => ({ ...prev, [flow.id]: res.data }));
    } catch {
      setQueue(prev => ({ ...prev, [flow.id]: { pending: [], history: [] } }));
    } finally {
      setLoadingQueue(null);
    }
  };

  // ── Webhooks ───────────────────────────────────────────

  const openCreateWebhook = () => {
    setEditWebhook(null);
    setWName('');
    setWMessage('');
    if (channels.length > 0) setWChannelId(channels[0].id);
    setShowWebhookModal(true);
  };

  const openEditWebhook = (w: Webhook) => {
    setEditWebhook(w);
    setWName(w.name);
    setWMessage(w.welcome_message);
    setWChannelId(w.channel_id);
    setShowWebhookModal(true);
  };

  const handleSaveWebhook = async () => {
    if (!wName.trim()) return toast.error('Dê um nome ao webhook');
    if (!wMessage.trim()) return toast.error('Escreva a mensagem de boas-vindas');
    setSavingWebhook(true);
    try {
      if (editWebhook) {
        await api.put(`/webhooks/${editWebhook.id}`, { name: wName, welcome_message: wMessage, is_active: editWebhook.is_active });
        toast.success('Webhook atualizado');
      } else {
        await api.post('/webhooks', { name: wName, channel_id: wChannelId, welcome_message: wMessage });
        toast.success('Webhook criado');
      }
      setShowWebhookModal(false);
      loadWebhooks();
    } catch {
      toast.error('Erro ao salvar webhook');
    } finally {
      setSavingWebhook(false);
    }
  };

  const toggleWebhook = async (w: Webhook) => {
    try {
      await api.put(`/webhooks/${w.id}`, { is_active: !w.is_active });
      setWebhooks(prev => prev.map(wh => wh.id === w.id ? { ...wh, is_active: !wh.is_active } : wh));
      toast.success(w.is_active ? 'Webhook pausado' : 'Webhook ativado');
    } catch {
      toast.error('Erro ao atualizar webhook');
    }
  };

  const deleteWebhook = async (w: Webhook) => {
    if (!confirm(`Excluir o webhook "${w.name}"?`)) return;
    try {
      await api.delete(`/webhooks/${w.id}`);
      setWebhooks(prev => prev.filter(wh => wh.id !== w.id));
      toast.success('Webhook excluído');
    } catch {
      toast.error('Erro ao excluir webhook');
    }
  };

  const copyUrl = (id: number, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success('URL copiada!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;
  if (!user) return null;

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl mx-auto pb-10">

        {/* Header */}
        <div className={`flex items-center justify-between transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div>
            <p className="text-sm text-gray-400 mb-0.5">Fluxos automáticos</p>
            <h1 className="text-xl lg:text-2xl font-semibold text-foreground tracking-tight">Automações</h1>
          </div>
          <button
            onClick={activeTab === 'fluxos' ? openCreate : openCreateWebhook}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            {activeTab === 'fluxos' ? 'Novo fluxo' : 'Novo webhook'}
          </button>
        </div>

        {/* Tabs */}
        <div className={`flex gap-1 bg-gray-100 rounded-xl p-1 w-fit transition-all duration-700 delay-75 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          {[
            { key: 'fluxos', label: 'Fluxos de Follow-up', icon: Zap },
            { key: 'webhooks', label: 'Webhooks LP Externa', icon: Link },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── ABA FLUXOS ─────────────────────────────────── */}
        {activeTab === 'fluxos' && (
          <>
            {stats && (
              <div className={`grid grid-cols-3 gap-4 transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                {[
                  { label: 'Total de fluxos', value: stats.total_flows, color: 'text-foreground' },
                  { label: 'Fluxos ativos', value: stats.active_flows, color: 'text-emerald-600' },
                  { label: 'Enviados hoje', value: stats.sent_today, color: 'text-primary' },
                ].map((s, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
              ) : flows.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
                  <Zap className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-400">Nenhum fluxo criado</p>
                  <p className="text-xs text-gray-300 mt-1">Clique em "Novo fluxo" para começar</p>
                </div>
              ) : (
                flows.map(flow => (
                  <div key={flow.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="flex items-center gap-4 px-5 py-4">
                      <button onClick={() => toggleActive(flow)} className="flex-shrink-0">
                        {flow.is_active ? <ToggleRight className="w-8 h-8 text-primary" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[14px] font-semibold text-foreground">{flow.name}</p>
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${STAGE_COLORS[flow.stage] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {STAGES.find(s => s.key === flow.stage)?.label || flow.stage}
                          </span>
                          {flow.is_active && (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                              Ativo
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-gray-400 mt-0.5">{flow.steps.length} mensagem{flow.steps.length !== 1 ? 's' : ''} na sequência</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openEdit(flow)} className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => deleteFlow(flow)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        <button onClick={() => toggleExpand(flow)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                          {expanded === flow.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {expanded === flow.id && (
                      <div className="px-5 pb-4 border-t border-gray-50">
                        <div className="mt-4 space-y-3">
                          {flow.steps.map((step, i) => (
                            <div key={i} className="flex gap-3">
                              <div className="flex flex-col items-center">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[11px] font-bold text-primary">{i + 1}</span>
                                </div>
                                {i < flow.steps.length - 1 && <div className="w-px flex-1 bg-gray-100 my-1" />}
                              </div>
                              <div className="flex-1 pb-2">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                                  <span className="text-[12px] text-gray-500">Enviar após <strong className="text-gray-700">{formatDelay(step.delay_minutes)}</strong></span>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                  <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{step.message}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Fila */}
                        <div className="mt-5 pt-4 border-t border-gray-100">
                          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Fila de envio</p>
                          {loadingQueue === flow.id ? (
                            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 text-primary animate-spin" /></div>
                          ) : !queue[flow.id] || queue[flow.id].pending.length === 0 ? (
                            <div className="text-center py-3"><p className="text-[12px] text-gray-400">Nenhum lead na fila</p></div>
                          ) : (
                            <div className="space-y-2">
                              {queue[flow.id].pending.map((item, i) => (
                                <div key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl border border-gray-100">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                      <span className="text-[11px] font-bold text-primary">{item.contact_name.charAt(0).toUpperCase()}</span>
                                    </div>
                                    <div>
                                      <p className="text-[13px] font-medium text-foreground">{item.contact_name}</p>
                                      <p className="text-[11px] text-gray-400">Mensagem {item.current_step}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 text-[11px] text-gray-500">
                                    <Clock className="w-3 h-3" />
                                    <span>{item.next_send_at ? new Date(item.next_send_at + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Histórico */}
                        {queue[flow.id]?.history && queue[flow.id].history.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-100">
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Histórico de envios</p>
                            <div className="space-y-2">
                              {queue[flow.id].history.map((item, i) => (
                                <div key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl border border-gray-100">
                                  <div className="flex items-center gap-2.5">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${item.status === 'completed' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                                      {item.status === 'completed'
                                        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                        : <X className="w-3.5 h-3.5 text-red-400" />}
                                    </div>
                                    <div>
                                      <p className="text-[13px] font-medium text-foreground">{item.contact_name}</p>
                                      <p className="text-[11px] text-gray-400">{item.error_message || `Mensagem ${item.current_step} enviada`}</p>
                                    </div>
                                  </div>
                                  <div className="text-[11px] text-gray-500">
                                    {item.sent_at ? new Date(item.sent_at + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* ── ABA WEBHOOKS ───────────────────────────────── */}
        {activeTab === 'webhooks' && (
          <div className="space-y-3">
            {loadingWebhooks ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
            ) : webhooks.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
                <Link className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-400">Nenhum webhook criado</p>
                <p className="text-xs text-gray-300 mt-1">Clique em "Novo webhook" para começar</p>
              </div>
            ) : (
              webhooks.map(w => (
                <div key={w.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="flex items-start gap-4">
                    <button onClick={() => toggleWebhook(w)} className="flex-shrink-0 mt-0.5">
                      {w.is_active ? <ToggleRight className="w-8 h-8 text-primary" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
                    </button>
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-[14px] font-semibold text-foreground">{w.name}</p>
                            <span className="text-[11px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md">{w.channel_name}</span>
                            {w.is_active && (
                              <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                                Ativo
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditWebhook(w)} className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => deleteWebhook(w)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>

                      {/* Mensagem */}
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Mensagem de boas-vindas</p>
                        <p className="text-[13px] text-gray-700 whitespace-pre-wrap">{w.welcome_message}</p>
                      </div>

                      {/* URL */}
                      <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-100 px-3 py-2.5">
                        <p className="flex-1 text-[12px] text-gray-500 truncate font-mono">{w.url}</p>
                        <button
                          onClick={() => copyUrl(w.id, w.url)}
                          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] font-medium rounded-lg hover:bg-primary/90 transition-all active:scale-95"
                        >
                          {copiedId === w.id ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedId === w.id ? 'Copiado' : 'Copiar'}
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-400">
                        Campos aceitos: <code className="bg-gray-100 px-1 rounded">name</code>, <code className="bg-gray-100 px-1 rounded">phone</code>, <code className="bg-gray-100 px-1 rounded">course</code>, <code className="bg-gray-100 px-1 rounded">email</code>
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── MODAL FLUXO ──────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-[15px] font-semibold text-foreground">{editFlow ? 'Editar fluxo' : 'Novo fluxo'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Nome do fluxo</label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Follow-up Sem Contato" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-all" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Quando o lead entrar em</label>
                <select value={formStage} onChange={e => setFormStage(e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-primary focus:bg-white transition-all serviçor-pointer">
                  {(kanbanColumns.length > 0 ? kanbanColumns : STAGES).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              {channels.length > 1 && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Canal WhatsApp</label>
                  <select value={formChannelId} onChange={e => setFormChannelId(Number(e.target.value))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-primary focus:bg-white transition-all serviçor-pointer">
                    {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-3">Sequência de mensagens</label>
                <div className="space-y-4">
                  {formSteps.map((step, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-gray-500">Mensagem {i + 1}</span>
                        {formSteps.length > 1 && <button onClick={() => removeStep(i)} className="p-1 text-gray-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-[12px] text-gray-500">Enviar após</span>
                        <input type="number" min={1} value={step.delay_minutes} onChange={e => updateStep(i, 'delay_minutes', parseInt(e.target.value) || 1)} className="w-16 px-2 py-1 bg-white border border-gray-200 rounded-lg text-[13px] text-center text-gray-800 focus:outline-none focus:border-primary transition-all" />
                        <select value={step.delay_unit} onChange={e => updateStep(i, 'delay_unit', e.target.value)} className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-[13px] text-gray-700 focus:outline-none focus:border-primary transition-all serviçor-pointer">
                          <option value="minutes">Minutos</option>
                          <option value="hours">Horas</option>
                          <option value="days">Dias</option>
                        </select>
                      </div>
                      <textarea value={step.message} onChange={e => updateStep(i, 'message', e.target.value)} placeholder={`Oi {nome}, tudo bem? 👋`} rows={3} className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-[13px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary transition-all resize-none" />
                      <p className="text-[11px] text-gray-400">Use <code className="bg-gray-200 px-1 rounded">{'{nome}'}</code> para o nome do lead</p>
                    </div>
                  ))}
                </div>
                <button onClick={addStep} className="mt-3 w-full py-2.5 border border-dashed border-gray-200 rounded-xl text-[13px] text-gray-400 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2">
                  <Plus className="w-3.5 h-3.5" />Adicionar próxima mensagem
                </button>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-[13px] font-medium text-gray-500 hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={handleSaveFlow} disabled={saving} className="flex-1 py-2.5 bg-primary text-white rounded-xl text-[13px] font-medium hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {saving ? 'Salvando...' : editFlow ? 'Salvar alterações' : 'Criar fluxo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL WEBHOOK ─────────────────────────────────── */}
      {showWebhookModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowWebhookModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-[15px] font-semibold text-foreground">{editWebhook ? 'Editar webhook' : 'Novo webhook'}</h2>
              <button onClick={() => setShowWebhookModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Nome</label>
                <input type="text" value={wName} onChange={e => setWName(e.target.value)} placeholder="Ex: Formulário Site Principal" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-all" />
              </div>
              {!editWebhook && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Canal WhatsApp</label>
                  <select value={wChannelId} onChange={e => setWChannelId(Number(e.target.value))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-primary focus:bg-white transition-all serviçor-pointer">
                    {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Mensagem de boas-vindas</label>
                <textarea value={wMessage} onChange={e => setWMessage(e.target.value)} placeholder={`Oi {nome}, vi que você se interessou! 👋`} rows={4} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-[13px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-all resize-none" />
                <p className="text-[11px] text-gray-400 mt-1">Use <code className="bg-gray-200 px-1 rounded">{'{nome}'}</code> para o nome do lead</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowWebhookModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-[13px] font-medium text-gray-500 hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={handleSaveWebhook} disabled={savingWebhook} className="flex-1 py-2.5 bg-primary text-white rounded-xl text-[13px] font-medium hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                {savingWebhook ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {savingWebhook ? 'Salvando...' : editWebhook ? 'Salvar alterações' : 'Criar webhook'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}