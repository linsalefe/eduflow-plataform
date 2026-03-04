'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Zap, Plus, Trash2, ToggleLeft, ToggleRight,
  Loader2, ChevronDown, ChevronUp, Clock, MessageSquare,
  CheckCircle, XCircle, Pencil, X, Copy, Link
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import api from '@/lib/api';

const STAGES = [
  { key: 'novo', label: 'Novos Leads' },
  { key: 'em_contato', label: 'Em Contato' },
  { key: 'qualificado', label: 'Qualificados' },
  { key: 'negociando', label: 'Em Matrícula' },
  { key: 'convertido', label: 'Matriculados' },
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
  next_send_at: string;
}

const emptyStep = (): Step => ({ step_order: 1, delay_minutes: 60, delay_unit: 'hours', message: '' });

export default function AutomacoesPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [queue, setQueue] = useState<Record<number, QueueItem[]>>({});
  const [loadingQueue, setLoadingQueue] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editFlow, setEditFlow] = useState<Flow | null>(null);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [channels, setChannels] = useState<any[]>([]);
  const [webhookUrls, setWebhookUrls] = useState<Record<number, string>>({});
  const [loadingWebhook, setLoadingWebhook] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formStage, setFormStage] = useState('novo');
  const [formSteps, setFormSteps] = useState<Step[]>([emptyStep()]);
  const [formChannelId, setFormChannelId] = useState<number>(0);

  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (!authLoading && !user) router.push('/login'); }, [user, authLoading, router]);
  useEffect(() => { if (user) loadData(); }, [user]);
  useEffect(() => { if (user) loadChannels(); }, [user]);

  const loadData = async () => {
    try {
      const [flowsRes, statsRes] = await Promise.all([
        api.get('/automations'),
        api.get('/automations/stats'),
      ]);
      setFlows(flowsRes.data);
      setStats(statsRes.data);
    } catch {
      toast.error('Erro ao carregar automações');
    } finally {
      setLoading(false);
    }
  };

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

  const closeModal = () => {
    setShowModal(false);
    setEditFlow(null);
  };

  const addStep = () => {
    setFormSteps(prev => [
      ...prev,
      { step_order: prev.length + 1, delay_minutes: 24, delay_unit: 'hours' as const, message: '' },
    ]);
  };

  const removeStep = (index: number) => {
    setFormSteps(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_order: i + 1 })));
  };

  const updateStep = (index: number, field: keyof Step, value: any) => {
    setFormSteps(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    if (!formName.trim()) return toast.error('Dê um nome ao fluxo');
    if (formSteps.some(s => !s.message.trim())) return toast.error('Preencha todas as mensagens');

    setSaving(true);
    try {
      if (editFlow) {
        await api.put(`/automations/${editFlow.id}`, {
          name: formName,
          stage: formStage,
          channel_id: formChannelId,
          steps: formSteps.map(s => ({
            ...s,
            delay_minutes: toMinutes(s.delay_minutes, s.delay_unit),
          })),
        });
        toast.success('Fluxo atualizado');
      } else {
        await api.post('/automations', {
          name: formName,
          stage: formStage,
          channel_id: formChannelId,
          steps: formSteps.map(s => ({
            ...s,
            delay_minutes: toMinutes(s.delay_minutes, s.delay_unit),
          })),
        });
        toast.success('Fluxo criado');
      }
      closeModal();
      loadData();
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
    if (expanded === flow.id) {
      setExpanded(null);
      return;
    }
    setExpanded(flow.id);
    if (queue[flow.id]) return;
    setLoadingQueue(flow.id);
    try {
      const res = await api.get(`/automations/${flow.id}/queue`);
      setQueue(prev => ({ ...prev, [flow.id]: res.data }));
    } catch {
      setQueue(prev => ({ ...prev, [flow.id]: [] }));
    } finally {
      setLoadingQueue(null);
    }
  };

  const formatDelay = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h${minutes % 60 > 0 ? ` ${minutes % 60}min` : ''}`;
    const days = Math.floor(minutes / 1440);
    const remaining = minutes % 1440;
    return remaining > 0 ? `${days}d ${Math.floor(remaining / 60)}h` : `${days} dia${days > 1 ? 's' : ''}`;
  };

  const toMinutes = (value: number, unit: string) => {
    if (unit === 'minutes') return value;
    if (unit === 'hours') return value * 60;
    return value * 1440;
  };

  const fromMinutes = (minutes: number): { value: number; unit: 'minutes' | 'hours' | 'days' } => {
    if (minutes % 1440 === 0) return { value: minutes / 1440, unit: 'days' };
    if (minutes % 60 === 0) return { value: minutes / 60, unit: 'hours' };
    return { value: minutes, unit: 'minutes' };
  };

  const loadChannels = async () => {
    try {
      const res = await api.get('/channels');
      setChannels(res.data.filter((c: any) => c.provider === 'evolution' || c.type === 'whatsapp'));
    } catch {}
  };

  const loadWebhookUrl = async (channelId: number) => {
    if (webhookUrls[channelId]) return;
    setLoadingWebhook(channelId);
    try {
      const res = await api.get(`/webhook/lead-url/${channelId}`);
      setWebhookUrls(prev => ({ ...prev, [channelId]: res.data.url }));
    } catch {
      toast.error('Erro ao gerar URL');
    } finally {
      setLoadingWebhook(null);
    }
  };

  const copyUrl = (channelId: number, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(channelId);
    toast.success('URL copiada!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" /></div>;
  if (!user) return null;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto pb-10">

        {/* Header */}
        <div className={`flex items-center justify-between transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div>
            <p className="text-sm text-gray-400 mb-0.5">Fluxos automáticos</p>
            <h1 className="text-xl lg:text-2xl font-semibold text-[#27273D] tracking-tight">Automações</h1>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#6366f1] text-white text-sm font-medium rounded-xl hover:bg-[#4f46e5] hover:shadow-lg hover:shadow-[#6366f1]/20 active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            Novo fluxo
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className={`grid grid-cols-3 gap-4 transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            {[
              { label: 'Total de fluxos', value: stats.total_flows, color: 'text-[#27273D]' },
              { label: 'Fluxos ativos', value: stats.active_flows, color: 'text-emerald-600' },
              { label: 'Enviados hoje', value: stats.sent_today, color: 'text-[#6366f1]' },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Lista de fluxos */}
        <div className={`space-y-3 transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-[#6366f1] animate-spin" /></div>
          ) : flows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
              <Zap className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-400">Nenhum fluxo criado</p>
              <p className="text-xs text-gray-300 mt-1">Clique em "Novo fluxo" para começar</p>
            </div>
          ) : (
            flows.map(flow => (
              <div key={flow.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {/* Card header */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Toggle */}
                  <button onClick={() => toggleActive(flow)} className="flex-shrink-0">
                    {flow.is_active
                      ? <ToggleRight className="w-8 h-8 text-[#6366f1]" />
                      : <ToggleLeft className="w-8 h-8 text-gray-300" />
                    }
                  </button>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold text-[#27273D]">{flow.name}</p>
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

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(flow)} className="p-2 text-gray-400 hover:text-[#6366f1] hover:bg-[#6366f1]/5 rounded-lg transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteFlow(flow)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleExpand(flow)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                      {expanded === flow.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Steps expandidos + Fila */}
                {expanded === flow.id && (
                  <div className="px-5 pb-4 border-t border-gray-50">
                    {/* Sequência */}
                    <div className="mt-4 space-y-3">
                      {flow.steps.map((step, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-7 h-7 rounded-full bg-[#6366f1]/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-[11px] font-bold text-[#6366f1]">{i + 1}</span>
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
                        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 text-[#6366f1] animate-spin" /></div>
                      ) : !queue[flow.id] || queue[flow.id].length === 0 ? (
                        <div className="text-center py-4 text-gray-400">
                          <p className="text-[12px]">Nenhum lead na fila</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {queue[flow.id].map((item, i) => (
                            <div key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl border border-gray-100">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-[#6366f1]/10 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[11px] font-bold text-[#6366f1]">{item.contact_name.charAt(0).toUpperCase()}</span>
                                </div>
                                <div>
                                  <p className="text-[13px] font-medium text-[#27273D]">{item.contact_name}</p>
                                  <p className="text-[11px] text-gray-400">Mensagem {item.current_step}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="flex items-center gap-1 text-[11px] text-gray-500">
                                  <Clock className="w-3 h-3" />
                                  <span>{new Date(item.next_send_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Webhook LP Externa */}
        {channels.length > 0 && (
          <div className={`transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#6366f1]/10 flex items-center justify-center">
                    <Link className="w-4 h-4 text-[#6366f1]" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#27273D]">Integração LP Externa</p>
                    <p className="text-[12px] text-gray-400">Cole a URL no formulário da sua landing page</p>
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 space-y-3">
                {channels.map(channel => (
                  <div key={channel.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-gray-600">{channel.name}</span>
                      {!webhookUrls[channel.id] && (
                        <button
                          onClick={() => loadWebhookUrl(channel.id)}
                          disabled={loadingWebhook === channel.id}
                          className="text-[12px] text-[#6366f1] hover:underline flex items-center gap-1 disabled:opacity-40"
                        >
                          {loadingWebhook === channel.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          Gerar URL
                        </button>
                      )}
                    </div>
                    {webhookUrls[channel.id] && (
                      <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-100 px-3 py-2.5">
                        <p className="flex-1 text-[12px] text-gray-500 truncate font-mono">{webhookUrls[channel.id]}</p>
                        <button
                          onClick={() => copyUrl(channel.id, webhookUrls[channel.id])}
                          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[#6366f1] text-white text-[12px] font-medium rounded-lg hover:bg-[#4f46e5] transition-all active:scale-95"
                        >
                          {copiedId === channel.id ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedId === channel.id ? 'Copiado' : 'Copiar'}
                        </button>
                      </div>
                    )}
                    <p className="text-[11px] text-gray-400">
                      Campos aceitos: <code className="bg-gray-100 px-1 rounded">name</code>, <code className="bg-gray-100 px-1 rounded">phone</code>, <code className="bg-gray-100 px-1 rounded">course</code>, <code className="bg-gray-100 px-1 rounded">email</code>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal criar/editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-[15px] font-semibold text-[#27273D]">
                {editFlow ? 'Editar fluxo' : 'Novo fluxo'}
              </h2>
              <button onClick={closeModal} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* Nome */}
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Nome do fluxo</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Ex: Follow-up Sem Contato"
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#6366f1] focus:bg-white transition-all"
                />
              </div>

              {/* Estágio */}
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Quando o lead entrar em</label>
                <select
                  value={formStage}
                  onChange={e => setFormStage(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-[#6366f1] focus:bg-white transition-all cursor-pointer"
                >
                  {STAGES.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Canal */}
              {channels.length > 1 && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Canal WhatsApp</label>
                  <select value={formChannelId} onChange={e => setFormChannelId(Number(e.target.value))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-[#6366f1] focus:bg-white transition-all cursor-pointer">
                    {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {/* Steps */}
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-3">Sequência de mensagens</label>
                <div className="space-y-4">
                  {formSteps.map((step, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-gray-500">Mensagem {i + 1}</span>
                        {formSteps.length > 1 && (
                          <button onClick={() => removeStep(i)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Delay */}
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-[12px] text-gray-500">Enviar após</span>
                        <input
                          type="number"
                          min={1}
                          value={step.delay_minutes}
                          onChange={e => updateStep(i, 'delay_minutes', parseInt(e.target.value) || 1)}
                          className="w-16 px-2 py-1 bg-white border border-gray-200 rounded-lg text-[13px] text-center text-gray-800 focus:outline-none focus:border-[#6366f1] transition-all"
                        />
                        <select
                          value={step.delay_unit}
                          onChange={e => updateStep(i, 'delay_unit', e.target.value)}
                          className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-[13px] text-gray-700 focus:outline-none focus:border-[#6366f1] transition-all cursor-pointer"
                        >
                          <option value="minutes">Minutos</option>
                          <option value="hours">Horas</option>
                          <option value="days">Dias</option>
                        </select>
                      </div>

                      {/* Mensagem */}
                      <textarea
                        value={step.message}
                        onChange={e => updateStep(i, 'message', e.target.value)}
                        placeholder={`Oi {nome}, tudo bem? 👋`}
                        rows={3}
                        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-[13px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#6366f1] transition-all resize-none"
                      />
                      <p className="text-[11px] text-gray-400">Use <code className="bg-gray-200 px-1 rounded">{'{nome}'}</code> para o nome do lead</p>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addStep}
                  className="mt-3 w-full py-2.5 border border-dashed border-gray-200 rounded-xl text-[13px] text-gray-400 hover:border-[#6366f1] hover:text-[#6366f1] hover:bg-[#6366f1]/5 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar próxima mensagem
                </button>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={closeModal} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-[13px] font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-[#6366f1] text-white rounded-xl text-[13px] font-medium hover:bg-[#4f46e5] active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {saving ? 'Salvando...' : editFlow ? 'Salvar alterações' : 'Criar fluxo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}