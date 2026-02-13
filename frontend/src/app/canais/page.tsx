'use client';
import { useEffect, useState } from 'react';
import {
  MessageSquare, Plus, Loader2, Trash2, Wifi, WifiOff, Phone,
  QrCode, ExternalLink, X
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';

interface ChannelItem {
  id: number;
  name: string;
  phone_number: string | null;
  type: string;
  provider: string;
  is_active: boolean;
  is_connected: boolean;
  instance_name: string | null;
  page_id: string | null;
  instagram_id: string | null;
}

const channelTypes = [
  {
    type: 'whatsapp',
    provider: 'evolution',
    label: 'WhatsApp',
    subtitle: 'Conecte via QR Code usando Evolution API',
    color: '#25D366',
    bg: 'bg-green-50',
    border: 'border-green-200',
    logo: (
      <svg viewBox="0 0 32 32" className="w-10 h-10">
        <circle cx="16" cy="16" r="16" fill="#25D366"/>
        <path d="M23.3 8.7A10.4 10.4 0 0 0 7.6 21.5L6 26l4.6-1.5a10.4 10.4 0 0 0 12.7-16.8zM16 24.3a8.6 8.6 0 0 1-4.4-1.2l-.3-.2-3.2 1 1.1-3.1-.2-.3A8.7 8.7 0 1 1 16 24.3zm4.8-6.5c-.3-.1-1.6-.8-1.8-.9-.3-.1-.5-.1-.6.1-.2.3-.7.9-.8 1.1-.2.1-.3.2-.6 0-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.4.2-.3.2-.5c0-.2 0-.3-.1-.5s-.6-1.6-.9-2.1c-.2-.6-.5-.5-.6-.5h-.6c-.2 0-.5.1-.8.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.6-.7 1.9-1.3.2-.6.2-1.2.2-1.3 0-.1-.2-.2-.5-.4z" fill="white"/>
      </svg>
    ),
  },
  {
    type: 'whatsapp',
    provider: 'official',
    label: 'WhatsApp Business',
    subtitle: 'API Oficial da Meta via Cloud API',
    color: '#075E54',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    logo: (
      <svg viewBox="0 0 32 32" className="w-10 h-10">
        <circle cx="16" cy="16" r="16" fill="#075E54"/>
        <path d="M23.3 8.7A10.4 10.4 0 0 0 7.6 21.5L6 26l4.6-1.5a10.4 10.4 0 0 0 12.7-16.8zM16 24.3a8.6 8.6 0 0 1-4.4-1.2l-.3-.2-3.2 1 1.1-3.1-.2-.3A8.7 8.7 0 1 1 16 24.3zm4.8-6.5c-.3-.1-1.6-.8-1.8-.9-.3-.1-.5-.1-.6.1-.2.3-.7.9-.8 1.1-.2.1-.3.2-.6 0-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.4.2-.3.2-.5c0-.2 0-.3-.1-.5s-.6-1.6-.9-2.1c-.2-.6-.5-.5-.6-.5h-.6c-.2 0-.5.1-.8.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.6-.7 1.9-1.3.2-.6.2-1.2.2-1.3 0-.1-.2-.2-.5-.4z" fill="white"/>
        <text x="16" y="13" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold">B</text>
      </svg>
    ),
  },
  {
    type: 'instagram',
    provider: 'meta',
    label: 'Instagram',
    subtitle: 'Automatize as mensagens do Direct',
    color: '#E4405F',
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    logo: (
      <svg viewBox="0 0 32 32" className="w-10 h-10">
        <defs>
          <linearGradient id="ig" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFC107"/>
            <stop offset="50%" stopColor="#F44336"/>
            <stop offset="100%" stopColor="#9C27B0"/>
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#ig)"/>
        <rect x="7" y="7" width="18" height="18" rx="5" stroke="white" strokeWidth="1.8" fill="none"/>
        <circle cx="16" cy="16" r="4.5" stroke="white" strokeWidth="1.8" fill="none"/>
        <circle cx="22" cy="10" r="1.3" fill="white"/>
      </svg>
    ),
  },
  {
    type: 'messenger',
    provider: 'meta',
    label: 'Messenger',
    subtitle: 'Atenda clientes pelo Messenger da Página',
    color: '#0084FF',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    logo: (
      <svg viewBox="0 0 32 32" className="w-10 h-10">
        <circle cx="16" cy="16" r="16" fill="#0084FF"/>
        <path d="M16 7C11 7 7 10.7 7 15.3c0 2.6 1.3 4.9 3.3 6.4v3.3l3.1-1.7c.8.2 1.7.3 2.6.3 5 0 9-3.7 9-8.3S21 7 16 7zm.9 11.2l-2.3-2.5-4.5 2.5 5-5.3 2.4 2.5 4.4-2.5-4.9 5.3z" fill="white"/>
      </svg>
    ),
  },
];

const typeColors: Record<string, string> = {
  whatsapp: '#25D366',
  instagram: '#E4405F',
  messenger: '#0084FF',
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedType, setSelectedType] = useState<typeof channelTypes[0] | null>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPhoneId, setFormPhoneId] = useState('');
  const [formToken, setFormToken] = useState('');
  const [formWabaId, setFormWabaId] = useState('');
  const [formInstanceName, setFormInstanceName] = useState('');
  const [formInstanceToken, setFormInstanceToken] = useState('');
  const [formPageId, setFormPageId] = useState('');
  const [formInstagramId, setFormInstagramId] = useState('');
  const [formAccessToken, setFormAccessToken] = useState('');

  const loadChannels = async () => {
    try {
      const res = await api.get('/channels');
      setChannels(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadChannels(); }, []);

  const resetForm = () => {
    setFormName('');
    setFormPhone('');
    setFormPhoneId('');
    setFormToken('');
    setFormWabaId('');
    setFormInstanceName('');
    setFormInstanceToken('');
    setFormPageId('');
    setFormInstagramId('');
    setFormAccessToken('');
  };

  const selectChannelType = (ct: typeof channelTypes[0]) => {
    setSelectedType(ct);
    setShowNewModal(false);
    setShowConfigModal(true);
    resetForm();
    setFormName(ct.label);
  };

  const saveChannel = async () => {
    if (!selectedType) return;
    setSaving(true);
    try {
      await api.post('/channels', {
        name: formName,
        type: selectedType.type,
        provider: selectedType.provider,
        phone_number: formPhone || null,
        phone_number_id: formPhoneId || null,
        whatsapp_token: formToken || null,
        waba_id: formWabaId || null,
        instance_name: formInstanceName || null,
        instance_token: formInstanceToken || null,
        page_id: formPageId || null,
        instagram_id: formInstagramId || null,
        access_token: formAccessToken || null,
      });
      setShowConfigModal(false);
      resetForm();
      loadChannels();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar canal');
    } finally {
      setSaving(false);
    }
  };

  const deleteChannel = async (id: number) => {
    if (!confirm('Tem certeza que deseja remover este canal?')) return;
    try {
      await api.delete(`/channels/${id}`);
      loadChannels();
    } catch (err) {
      console.error(err);
    }
  };

  const getProviderLabel = (ch: ChannelItem) => {
    if (ch.provider === 'evolution') return 'Evolution API';
    if (ch.provider === 'meta') return 'Meta Graph API';
    return 'API Oficial';
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6 pb-8">

        {/* Header Ajustado */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Canais</h1>
            <p className="text-sm text-gray-500 mt-2 max-w-md leading-relaxed">
              Conecte WhatsApp, Instagram e Messenger ao seu CRM para centralizar seu atendimento.
            </p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#6366f1] text-white text-[13px] font-semibold hover:bg-[#5558e6] transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Novo Canal
          </button>
        </div>

        {/* Channels List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-[#6366f1] animate-spin" />
          </div>
        ) : channels.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Nenhum canal conectado</h3>
            <p className="text-sm text-gray-400 mb-6">Conecte seu primeiro canal para começar a receber mensagens</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="px-6 py-2.5 rounded-xl bg-[#6366f1] text-white text-[13px] font-medium hover:bg-[#5558e6] transition-all"
            >
              Conectar Canal
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {channels.map(ch => (
              <div key={ch.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-sm transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                      style={{ backgroundColor: `${typeColors[ch.type] || '#6366f1'}15` }}
                    >
                      {ch.type === 'whatsapp' && '💬'}
                      {ch.type === 'instagram' && '📸'}
                      {ch.type === 'messenger' && '💬'}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[15px] font-semibold text-gray-900">{ch.name}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium uppercase">
                          {ch.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[12px] text-gray-400">{getProviderLabel(ch)}</span>
                        {ch.phone_number && (
                          <span className="text-[12px] text-gray-400 flex items-center gap-1">
                            <Phone className="w-3 h-3" /> +{ch.phone_number}
                          </span>
                        )}
                        {ch.instance_name && (
                          <span className="text-[12px] text-gray-400">Instância: {ch.instance_name}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                      ch.is_connected ? 'bg-emerald-50' : 'bg-red-50'
                    }`}>
                      {ch.is_connected ? (
                        <>
                          <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-[12px] font-medium text-emerald-700">Conectado</span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="w-3.5 h-3.5 text-red-500" />
                          <span className="text-[12px] font-medium text-red-700">Desconectado</span>
                        </>
                      )}
                    </div>

                    <button
                      onClick={() => deleteChannel(ch.id)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal: Choose Channel Type */}
        {showNewModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowNewModal(false)}>
            <div className="bg-white rounded-2xl w-[600px] max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Qual canal deseja conectar?</h2>
                    <p className="text-[13px] text-gray-400 mt-1">Escolha o tipo de canal para configurar</p>
                  </div>
                  <button onClick={() => setShowNewModal(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {channelTypes.map((ct, i) => (
                    <button
                      key={i}
                      onClick={() => selectChannelType(ct)}
                      className={`relative p-5 rounded-xl border-2 ${ct.border} ${ct.bg} text-left hover:shadow-md transition-all group`}
                    >
                      {/* Logo em vez de Emoji */}
                      <div className="mb-3">{ct.logo}</div>

                      {/* Label */}
                      <h3 className="text-[14px] font-bold text-gray-900 mb-1">{ct.label}</h3>
                      <p className="text-[11px] text-gray-500 leading-relaxed">{ct.subtitle}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Configure Channel */}
        {showConfigModal && selectedType && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowConfigModal(false)}>
            <div className="bg-white rounded-2xl w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="p-6 space-y-5">
                {/* Header Centralizado com Logo SVG */}
                <div className="text-center">
                  <div className="flex justify-center mb-3">{selectedType.logo}</div>
                  <h2 className="text-lg font-bold text-gray-900">Configurar {selectedType.label}</h2>
                  <p className="text-[13px] text-gray-400 mt-1">{selectedType.subtitle}</p>
                </div>

                {/* Name */}
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Nome do Canal</label>
                  <input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="Ex: WhatsApp Principal"
                  />
                </div>

                {/* WhatsApp Official fields */}
                {selectedType.type === 'whatsapp' && selectedType.provider === 'official' && (
                  <>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Número do telefone</label>
                      <input
                        value={formPhone}
                        onChange={e => setFormPhone(e.target.value)}
                        className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="5583988046720"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Phone Number ID</label>
                      <input
                        value={formPhoneId}
                        onChange={e => setFormPhoneId(e.target.value)}
                        className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="ID do Meta Business"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Token de Acesso</label>
                      <input
                        value={formToken}
                        onChange={e => setFormToken(e.target.value)}
                        type="password"
                        className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="Token do WhatsApp Cloud API"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">WABA ID (opcional)</label>
                      <input
                        value={formWabaId}
                        onChange={e => setFormWabaId(e.target.value)}
                        className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="WhatsApp Business Account ID"
                      />
                    </div>
                  </>
                )}

                {/* WhatsApp Evolution fields */}
                {selectedType.type === 'whatsapp' && selectedType.provider === 'evolution' && (
                  <>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Nome da Instância</label>
                      <input
                        value={formInstanceName}
                        onChange={e => setFormInstanceName(e.target.value)}
                        className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="minha-instancia"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Token da Instância</label>
                      <input
                        value={formInstanceToken}
                        onChange={e => setFormInstanceToken(e.target.value)}
                        type="password"
                        className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="Token da Evolution API"
                      />
                    </div>
                    <div className="bg-green-50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <QrCode className="w-4 h-4 text-green-600" />
                        <span className="text-[12px] font-semibold text-green-700">Conexão via QR Code</span>
                      </div>
                      <p className="text-[11px] text-green-600">
                        Após salvar, você poderá escanear o QR Code para conectar o WhatsApp.
                      </p>
                    </div>
                  </>
                )}

                {/* Instagram fields */}
                {selectedType.type === 'instagram' && (
                  <>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Page ID (Facebook)</label>
                      <input
                        value={formPageId}
                        onChange={e => setFormPageId(e.target.value)}
                        className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="ID da Página do Facebook"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Instagram Business ID</label>
                      <input
                        value={formInstagramId}
                        onChange={e => setFormInstagramId(e.target.value)}
                        className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="ID do Instagram Business"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Access Token</label>
                      <input
                        value={formAccessToken}
                        onChange={e => setFormAccessToken(e.target.value)}
                        type="password"
                        className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="Token da Graph API"
                      />
                    </div>
                    <div className="bg-pink-50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <ExternalLink className="w-4 h-4 text-pink-600" />
                        <span className="text-[12px] font-semibold text-pink-700">Conectar com Instagram</span>
                      </div>
                      <p className="text-[11px] text-pink-600">
                        Em breve: botão de login OAuth para conectar automaticamente sem preencher campos.
                      </p>
                    </div>
                  </>
                )}

                {/* Messenger fields */}
                {selectedType.type === 'messenger' && (
                  <>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Page ID (Facebook)</label>
                      <input
                        value={formPageId}
                        onChange={e => setFormPageId(e.target.value)}
                        className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="ID da Página do Facebook"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Access Token</label>
                      <input
                        value={formAccessToken}
                        onChange={e => setFormAccessToken(e.target.value)}
                        type="password"
                        className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="Page Access Token"
                      />
                    </div>
                    <div className="bg-blue-50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <ExternalLink className="w-4 h-4 text-blue-600" />
                        <span className="text-[12px] font-semibold text-blue-700">Conectar com Messenger</span>
                      </div>
                      <p className="text-[11px] text-blue-600">
                        Em breve: botão de login OAuth para conectar automaticamente sem preencher campos.
                      </p>
                    </div>
                  </>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setShowConfigModal(false); resetForm(); }}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveChannel}
                    disabled={saving || !formName}
                    className="flex-1 py-2.5 rounded-xl bg-[#6366f1] text-white text-[13px] font-medium hover:bg-[#5558e6] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {saving ? 'Salvando...' : 'Conectar Canal'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}