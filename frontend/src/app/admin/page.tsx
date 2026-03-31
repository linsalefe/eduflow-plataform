'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import {
  Building2, Users, MessageCircle, Plus, Power, Settings2,
  ChevronDown, ChevronUp, Shield, Eye, EyeOff, Loader2, X,
  Check, AlertTriangle, Bot
} from 'lucide-react';

interface Tenant {
  id: number;
  name: string;
  slug: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string | null;
  plan: string;
  status: string;
  is_active: boolean;
  max_users: number;
  max_channels: number;
  features: Record<string, boolean>;
  agent_plan_flags?: Record<string, boolean>;
  notes: string | null;
  user_count: number;
  contact_count: number;
  created_at: string;
}

const AGENT_LABELS: Record<string, string> = {
  whatsapp: 'Nat WhatsApp',
  voice: 'Nat Voice',
  followup: 'Follow-up',
  reactivation: 'Reativação',
  briefing: 'Briefing',
};

const FEATURE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  conversas: 'Conversas',
  pipeline: 'Pipeline',
  financeiro: 'Financeiro',
  landing_pages: 'Landing Pages',
  campanhas: 'Campanhas',
  relatorios: 'Relatórios',
  usuarios: 'Usuários',
  automacoes: 'Automações',
  tarefas: 'Tarefas',
  voice_ai: 'Voice AI',
  ai_whatsapp: 'IA WhatsApp',
  ai_audio_response: 'Áudio IA (WhatsApp)',
  voice_inbound: 'Atendimento IA (Voz)',
  agenda: 'Agenda',
  contatos: 'Contatos',
  agentes_ia: 'Agentes IA',
};

const PLAN_COLORS: Record<string, string> = {
  basic: 'bg-gray-500/20 text-gray-300',
  pro: 'bg-indigo-500/20 text-indigo-300',
  enterprise: 'bg-amber-500/20 text-amber-300',
};

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toast, setToast] = useState<{ type: string; msg: string } | null>(null);

  const fetchTenants = useCallback(async () => {
    try {
      const res = await api.get('/admin/tenants');
      setTenants(res.data);
    } catch {
      showToast('error', 'Erro ao carregar tenants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role !== 'superadmin') {
      router.push('/dashboard');
      return;
    }
    fetchTenants();
  }, [user, router, fetchTenants]);

  const showToast = (type: string, msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleTenant = async (id: number) => {
    try {
      const res = await api.patch(`/admin/tenants/${id}/toggle`);
      showToast('success', res.data.message);
      fetchTenants();
    } catch {
      showToast('error', 'Erro ao alterar status');
    }
  };

  const toggleAgentPlanFlag = async (tenantId: number, agent: string, current: boolean) => {
    try {
      await api.patch(`/admin/tenants/${tenantId}/plan-flags`, {
        [agent]: !current,
      });
      fetchTenants();
    } catch {
      showToast('error', 'Erro ao atualizar agente');
    }
  };

  const toggleFeature = async (tenantId: number, feature: string, current: boolean) => {
    try {
      await api.patch(`/admin/tenants/${tenantId}/features`, {
        features: { [feature]: !current },
      });
      fetchTenants();
    } catch {
      showToast('error', 'Erro ao atualizar feature');
    }
  };

  if (user?.role !== 'superadmin') return null;

  return (
    <div className="min-h-screen bg-[#0a1120] text-white">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-medium shadow-2xl transition-all ${
          toast.type === 'success' ? 'bg-emerald-500/90' : 'bg-red-500/90'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="border-b border-white/[0.06] bg-[#0f1b2d]">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Painel Superadmin</h1>
              <p className="text-xs text-gray-500">Gerenciamento de clientes EduFlow</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Cliente
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-[#0f1b2d] border border-white/[0.06] rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tenants.length}</p>
                <p className="text-xs text-gray-500">Clientes</p>
              </div>
            </div>
          </div>
          <div className="bg-[#0f1b2d] border border-white/[0.06] rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tenants.reduce((s, t) => s + t.user_count, 0)}</p>
                <p className="text-xs text-gray-500">Usuários totais</p>
              </div>
            </div>
          </div>
          <div className="bg-[#0f1b2d] border border-white/[0.06] rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tenants.reduce((s, t) => s + t.contact_count, 0)}</p>
                <p className="text-xs text-gray-500">Contatos totais</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tenant List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {tenants.map((tenant) => (
              <div key={tenant.id} className="bg-[#0f1b2d] border border-white/[0.06] rounded-2xl overflow-hidden">
                {/* Tenant Row */}
                <div
                  className="flex items-center justify-between p-5 serviçor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpandedId(expandedId === tenant.id ? null : tenant.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${tenant.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-[15px]">{tenant.name}</h3>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${PLAN_COLORS[tenant.plan] || PLAN_COLORS.basic}`}>
                          {tenant.plan}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {tenant.owner_name} · {tenant.owner_email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="hidden md:flex items-center gap-6 text-xs text-gray-400">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> {tenant.user_count} usuários
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MessageCircle className="w-3.5 h-3.5" /> {tenant.contact_count} contatos
                      </span>
                    </div>
                    {expandedId === tenant.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedId === tenant.id && (
                  <div className="border-t border-white/[0.06] p-5 space-y-6">
                    {/* Actions */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleTenant(tenant.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                          tenant.is_active
                            ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                        }`}
                      >
                        <Power className="w-4 h-4" />
                        {tenant.is_active ? 'Desativar Conta' : 'Ativar Conta'}
                      </button>
                    </div>

                    {/* Features Grid */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                        <Settings2 className="w-4 h-4" /> Módulos Ativos
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                          const enabled = tenant.features?.[key] !== false;
                          return (
                            <button
                              key={key}
                              onClick={() => toggleFeature(tenant.id, key, enabled)}
                              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                                enabled
                                  ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                                  : 'bg-white/[0.02] text-gray-600 border border-white/[0.04]'
                              }`}
                            >
                              {enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Agentes IA */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                        <Bot className="w-4 h-4" /> Agentes IA
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {Object.entries(AGENT_LABELS).map(([key, label]) => {
                          const enabled = tenant.agent_plan_flags?.[key] ?? false;
                          return (
                            <button
                              key={key}
                              onClick={() => toggleAgentPlanFlag(tenant.id, key, enabled)}
                              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                                enabled
                                  ? 'bg-violet-500/10 text-violet-300 border border-violet-500/20'
                                  : 'bg-white/[0.02] text-gray-600 border border-white/[0.04]'
                              }`}
                            >
                              {enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Editable Info */}
                    <EditTenantInfo tenant={tenant} onSaved={fetchTenants} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateTenantModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchTenants(); showToast('success', 'Cliente criado com sucesso!'); }}
        />
      )}
    </div>
  );
}


function CreateTenantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '', slug: '', owner_name: '', owner_email: '', owner_phone: '',
    owner_password: '', plan: 'basic', max_users: 5, max_channels: 2, notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (field === 'name') {
      const slug = value.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      setForm(prev => ({ ...prev, slug }));
    }
  };

  const handleSubmit = async () => {
    if (!form.name || !form.owner_name || !form.owner_email || !form.owner_password) {
      setError('Preencha todos os campos obrigatórios');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/admin/tenants', form);
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao criar cliente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1b2d] border border-white/[0.06] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <h2 className="text-lg font-bold">Novo Cliente</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-500/10 text-red-400 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {error}
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Nome da Empresa *</label>
            <input
              value={form.name}
              onChange={e => handleChange('name', e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
              placeholder="Ex: Escola de Futebol SP"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Slug (URL)</label>
            <input
              value={form.slug}
              onChange={e => handleChange('slug', e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white font-mono outline-none focus:border-indigo-500/50"
              placeholder="escola-futebol-sp"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Nome do Responsável *</label>
              <input
                value={form.owner_name}
                onChange={e => handleChange('owner_name', e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Telefone</label>
              <input
                value={form.owner_phone}
                onChange={e => handleChange('owner_phone', e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Email do Responsável *</label>
            <input
              type="email"
              value={form.owner_email}
              onChange={e => handleChange('owner_email', e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
              placeholder="admin@empresa.com"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Senha Inicial *</label>
            <input
              type="password"
              value={form.owner_password}
              onChange={e => handleChange('owner_password', e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Plano</label>
              <select
                value={form.plan}
                onChange={e => handleChange('plan', e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
              >
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Máx. Usuários</label>
              <input
                type="number"
                value={form.max_users}
                onChange={e => handleChange('max_users', parseInt(e.target.value))}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Máx. Canais</label>
              <input
                type="number"
                value={form.max_channels}
                onChange={e => handleChange('max_channels', parseInt(e.target.value))}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Observações</label>
            <textarea
              value={form.notes}
              onChange={e => handleChange('notes', e.target.value)}
              rows={2}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 resize-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 rounded-xl text-sm font-medium transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Criar Cliente
          </button>
        </div>
      </div>
    </div>
  );
}


function EditTenantInfo({ tenant, onSaved }: { tenant: Tenant; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    plan: tenant.plan,
    max_users: tenant.max_users,
    max_channels: tenant.max_channels,
    owner_name: tenant.owner_name,
    owner_email: tenant.owner_email,
    owner_phone: tenant.owner_phone || '',
    notes: tenant.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/tenants/${tenant.id}`, form);
      onSaved();
      setEditing(false);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-gray-600 mb-1">Slug</p>
            <p className="text-gray-300 font-mono">{tenant.slug}</p>
          </div>
          <div>
            <p className="text-gray-600 mb-1">Telefone</p>
            <p className="text-gray-300">{tenant.owner_phone || '—'}</p>
          </div>
          <div>
            <p className="text-gray-600 mb-1">Máx. Usuários</p>
            <p className="text-gray-300">{tenant.max_users}</p>
          </div>
          <div>
            <p className="text-gray-600 mb-1">Máx. Canais</p>
            <p className="text-gray-300">{tenant.max_channels}</p>
          </div>
          <div>
            <p className="text-gray-600 mb-1">Plano</p>
            <p className="text-gray-300 capitalize">{tenant.plan}</p>
          </div>
          <div>
            <p className="text-gray-600 mb-1">Criado em</p>
            <p className="text-gray-300">{new Date(tenant.created_at).toLocaleDateString('pt-BR')}</p>
          </div>
          <div className="col-span-2">
            <p className="text-gray-600 mb-1">Observações</p>
            <p className="text-gray-300">{tenant.notes || '—'}</p>
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="mt-4 flex items-center gap-2 px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-xs text-gray-300 font-medium transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" /> Editar Informações
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-[10px] text-gray-500 mb-1 block">Plano</label>
          <select
            value={form.plan}
            onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
          >
            <option value="basic">Basic</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 mb-1 block">Máx. Usuários</label>
          <input
            type="number"
            value={form.max_users}
            onChange={e => setForm(f => ({ ...f, max_users: parseInt(e.target.value) || 0 }))}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 mb-1 block">Máx. Canais</label>
          <input
            type="number"
            value={form.max_channels}
            onChange={e => setForm(f => ({ ...f, max_channels: parseInt(e.target.value) || 0 }))}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 mb-1 block">Telefone</label>
          <input
            value={form.owner_phone}
            onChange={e => setForm(f => ({ ...f, owner_phone: e.target.value }))}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 mb-1 block">Responsável</label>
          <input
            value={form.owner_name}
            onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 mb-1 block">Email</label>
          <input
            value={form.owner_email}
            onChange={e => setForm(f => ({ ...f, owner_email: e.target.value }))}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
          />
        </div>
        <div className="col-span-2">
          <label className="text-[10px] text-gray-500 mb-1 block">Observações</label>
          <input
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 rounded-xl text-xs font-medium transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Salvar
        </button>
        <button
          onClick={() => setEditing(false)}
          className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}