'use client';

import { useState, useEffect, useRef } from 'react';
import {
  User, Mail, Lock, Shield, Camera, CreditCard, AlertTriangle,
  Building2, Phone, Bell, BellOff, Loader2, Check,
} from 'lucide-react';
import AppShell from '@/components/app-shell';
import api from '@/lib/api';
import { toast } from 'sonner';

/* ── Types ────────────────────────────────────────────────── */

interface Profile {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  notify_email: boolean;
  notify_sound: boolean;
}

interface SubscriptionInfo {
  plan: string;
  subscription_status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

interface CompanyInfo {
  name: string;
  owner_phone: string | null;
  logo_url: string | null;
}

/* ── Helpers ──────────────────────────────────────────────── */

const planLabel: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
  basic: 'Basic',
};

const planColor: Record<string, string> = {
  starter: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
  basic: 'bg-gray-100 text-gray-600',
};

const statusLabel: Record<string, { text: string; cls: string }> = {
  active: { text: 'Ativo', cls: 'bg-green-100 text-green-700' },
  canceling: { text: 'Cancelando', cls: 'bg-amber-100 text-amber-700' },
  canceled: { text: 'Cancelado', cls: 'bg-red-100 text-red-700' },
  past_due: { text: 'Pagamento pendente', cls: 'bg-red-100 text-red-700' },
  manual: { text: 'Manual', cls: 'bg-gray-100 text-gray-600' },
};

function getInitials(name: string) {
  return name
    ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

/* ── Component ────────────────────────────────────────────── */

export default function ContaPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);

  // Profile form
  const [name, setName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Company form
  const [companyName, setCompanyName] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);

  // Cancel modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [canceling, setCanceling] = useState(false);

  // File refs
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  /* ── Load data ─────────────────────────────────────────── */

  const fetchData = async () => {
    try {
      const [meRes, subRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/stripe/subscription-status'),
      ]);
      const p = meRes.data as Profile;
      setProfile(p);
      setName(p.name);
      setSubscription(subRes.data);

      if (p.role === 'admin' || p.role === 'superadmin') {
        try {
          const compRes = await api.get('/auth/company');
          setCompany(compRes.data);
          setCompanyName(compRes.data.name || '');
          setCompanyPhone(compRes.data.owner_phone || '');
        } catch {
          // ignore
        }
      }
    } catch {
      toast.error('Erro ao carregar dados da conta');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  /* ── Handlers ──────────────────────────────────────────── */

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await api.patch('/auth/profile', { name });
      setProfile((prev) => prev ? { ...prev, ...res.data } : prev);
      toast.success('Perfil atualizado');
    } catch {
      toast.error('Erro ao salvar perfil');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleNotification = async (field: 'notify_email' | 'notify_sound', value: boolean) => {
    try {
      const res = await api.patch('/auth/profile', { [field]: value });
      setProfile((prev) => prev ? { ...prev, ...res.data } : prev);
      toast.success('Notificação atualizada');
    } catch {
      toast.error('Erro ao atualizar notificação');
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Senhas não conferem');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Nova senha deve ter pelo menos 6 caracteres');
      return;
    }
    setSavingPassword(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success('Senha alterada com sucesso');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erro ao alterar senha');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/auth/upload-avatar', fd);
      setProfile((prev) => prev ? { ...prev, avatar_url: res.data.avatar_url } : prev);
      toast.success('Foto atualizada');
    } catch {
      toast.error('Erro ao enviar foto');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/auth/upload-logo', fd);
      setCompany((prev) => prev ? { ...prev, logo_url: res.data.logo_url } : prev);
      toast.success('Logo atualizada');
    } catch {
      toast.error('Erro ao enviar logo');
    }
  };

  const handleSaveCompany = async () => {
    setSavingCompany(true);
    try {
      const res = await api.patch('/auth/company', {
        name: companyName,
        owner_phone: companyPhone,
      });
      setCompany(res.data);
      toast.success('Dados da empresa atualizados');
    } catch {
      toast.error('Erro ao salvar dados da empresa');
    } finally {
      setSavingCompany(false);
    }
  };

  const handleCancelSubscription = async () => {
    setCanceling(true);
    try {
      await api.post('/stripe/cancel-subscription');
      toast.success('Assinatura será cancelada no fim do período');
      setShowCancelModal(false);
      const subRes = await api.get('/stripe/subscription-status');
      setSubscription(subRes.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erro ao cancelar assinatura');
    } finally {
      setCanceling(false);
    }
  };

  /* ── Skeleton ──────────────────────────────────────────── */

  const Skeleton = ({ className = '' }: { className?: string }) => (
    <div className={`animate-pulse bg-gray-200 rounded-xl ${className}`} />
  );

  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

  /* ── Render ────────────────────────────────────────────── */

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6 pb-8">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold text-foreground">Minha Conta</h1>
          <p className="text-sm text-gray-400 mt-1">Gerencie seu perfil, segurança e plano.</p>
        </div>

        {loading ? (
          <div className="space-y-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-40" />
            <Skeleton className="h-32" />
          </div>
        ) : profile ? (
          <>
            {/* ── Seção 1: Perfil ──────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:p-6 space-y-5">
              <h2 className="text-base font-semibold text-foreground">Perfil</h2>

              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  {profile.avatar_url ? (
                    <img
                      src={`${apiUrl}${profile.avatar_url}`}
                      alt="Avatar"
                      className="w-20 h-20 rounded-full object-cover border-2 border-gray-100"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xl">
                      {getInitials(profile.name)}
                    </div>
                  )}
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-7 h-7 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5 text-gray-600" />
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold text-foreground truncate">{profile.name}</p>
                  <p className="text-sm text-gray-400 truncate">{profile.email}</p>
                  <span className="inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary capitalize">
                    {profile.role}
                  </span>
                </div>
              </div>

              {/* Name input */}
              <div>
                <label className="text-[13px] font-medium text-gray-600 block mb-1.5">Nome completo</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              {/* Email readonly */}
              <div>
                <label className="text-[13px] font-medium text-gray-600 block mb-1.5">Email</label>
                <div className="relative">
                  <input
                    type="email"
                    value={profile.email}
                    disabled
                    className="w-full px-3 py-2 pl-9 rounded-xl border border-gray-100 bg-gray-50 text-sm text-gray-400 cursor-not-allowed"
                  />
                  <Lock className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-[13px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Salvar alterações
              </button>
            </div>

            {/* ── Seção 2: Segurança ───────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:p-6 space-y-4">
              <h2 className="text-base font-semibold text-foreground">Alterar Senha</h2>

              <div>
                <label className="text-[13px] font-medium text-gray-600 block mb-1.5">Senha atual</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[13px] font-medium text-gray-600 block mb-1.5">Nova senha</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-medium text-gray-600 block mb-1.5">Confirmar nova senha</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <button
                onClick={handleChangePassword}
                disabled={savingPassword || !currentPassword || !newPassword}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-[13px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                Alterar senha
              </button>
            </div>

            {/* ── Seção 3: Notificações ────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:p-6 space-y-4">
              <h2 className="text-base font-semibold text-foreground">Notificações</h2>

              <ToggleRow
                icon={Mail}
                label="Receber notificações por email"
                checked={profile.notify_email}
                onChange={(v) => {
                  setProfile((prev) => prev ? { ...prev, notify_email: v } : prev);
                  handleToggleNotification('notify_email', v);
                }}
              />
              <ToggleRow
                icon={profile.notify_sound ? Bell : BellOff}
                label="Som de notificação no portal"
                checked={profile.notify_sound}
                onChange={(v) => {
                  setProfile((prev) => prev ? { ...prev, notify_sound: v } : prev);
                  handleToggleNotification('notify_sound', v);
                }}
              />
            </div>

            {/* ── Seção 4: Dados da Empresa ────────────────── */}
            {isAdmin && company && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:p-6 space-y-5">
                <h2 className="text-base font-semibold text-foreground">Dados da Empresa</h2>

                <div className="flex items-center gap-4">
                  <div className="relative flex-shrink-0">
                    {company.logo_url ? (
                      <img
                        src={`${apiUrl}${company.logo_url}`}
                        alt="Logo"
                        className="w-16 h-16 rounded-xl object-cover border border-gray-100"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center">
                        <Building2 className="w-7 h-7 text-gray-400" />
                      </div>
                    )}
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className="absolute -bottom-1 -right-1 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                    >
                      <Camera className="w-3 h-3 text-gray-600" />
                    </button>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{company.name}</p>
                    <p className="text-xs text-gray-400">Logo da empresa</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[13px] font-medium text-gray-600 block mb-1.5">Nome da empresa</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[13px] font-medium text-gray-600 block mb-1.5">Telefone</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={companyPhone}
                        onChange={(e) => setCompanyPhone(e.target.value)}
                        className="w-full px-3 py-2 pl-9 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                      <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSaveCompany}
                  disabled={savingCompany}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-[13px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {savingCompany ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar
                </button>
              </div>
            )}

            {/* ── Seção 5: Meu Plano ──────────────────────── */}
            {subscription && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:p-6 space-y-4">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-gray-500" />
                  Meu Plano
                </h2>

                <div className="flex flex-wrap items-center gap-3">
                  <span className={`text-sm font-semibold px-3 py-1 rounded-lg ${planColor[subscription.plan] || planColor.basic}`}>
                    {planLabel[subscription.plan] || subscription.plan}
                  </span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${(statusLabel[subscription.subscription_status] || statusLabel.manual).cls}`}>
                    {(statusLabel[subscription.subscription_status] || statusLabel.manual).text}
                  </span>
                </div>

                {subscription.current_period_end && subscription.subscription_status !== 'canceling' && (
                  <p className="text-sm text-gray-500">
                    Próxima cobrança: <span className="font-medium text-foreground">{formatDate(subscription.current_period_end)}</span>
                  </p>
                )}

                {subscription.subscription_status === 'canceling' && (
                  <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Assinatura será cancelada</p>
                      {subscription.current_period_end && (
                        <p className="text-xs text-amber-600 mt-0.5">
                          Acesso ativo até {formatDate(subscription.current_period_end)}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {subscription.subscription_status === 'manual' && (
                  <p className="text-sm text-gray-400">Plano gerenciado pela equipe EduFlow.</p>
                )}

                {subscription.subscription_status === 'active' && !subscription.cancel_at_period_end && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-[13px] font-medium hover:bg-red-50 transition-colors"
                  >
                    Cancelar assinatura
                  </button>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* ── Modal de cancelamento ────────────────────────── */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Tem certeza?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Seu acesso continuará até o fim do período atual. Após isso, a conta será desativada.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white text-[13px] font-medium hover:bg-primary/90 transition-colors"
              >
                Manter plano
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={canceling}
                className="flex-1 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-[13px] font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {canceling ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

/* ── Toggle Row ───────────────────────────────────────────── */

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-gray-200'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
