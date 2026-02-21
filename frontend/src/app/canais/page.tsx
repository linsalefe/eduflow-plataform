'use client';
import { useEffect, useState, useRef } from 'react';
import {
  MessageSquare, Plus, Loader2, Trash2, Wifi, WifiOff, Phone,
  QrCode, X, RefreshCw, LogOut
} from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import ConfirmModal from '@/components/ConfirmModal';
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

const typeColors: Record<string, string> = {
  whatsapp: '#25D366',
  instagram: '#E4405F',
  messenger: '#0084FF',
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [formName, setFormName] = useState('');

  // QR Code
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrInstanceName, setQrInstanceName] = useState('');
  const [qrStatus, setQrStatus] = useState<'loading' | 'scanning' | 'connected' | 'error'>('loading');
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} });
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const loadChannels = async () => {
    try {
      const res = await api.get('/channels');
      setChannels(res.data);
    } catch (err) {
      toast.error('Erro na operação');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChannels();
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // ============================================================
  // CRIAR INSTÂNCIA EVOLUTION
  // ============================================================
  const createEvolutionInstance = async () => {
    if (!formName.trim()) return;
    setSaving(true);

    try {
      const res = await api.post('/evolution/instances', {
        name: formName,
        purpose: 'commercial',
      });

      const { instance_name, qrcode } = res.data;
      setQrInstanceName(instance_name);
      setShowNewModal(false);

      // Extrair base64 do QR code
      const base64 = qrcode?.base64 || qrcode?.qrcode?.base64 || null;
      if (base64) {
        setQrCode(base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`);
        setQrStatus('scanning');
      } else {
        // Buscar QR code separadamente
        await fetchQRCode(instance_name);
      }

      setShowQRModal(true);
      startPolling(instance_name);
    } catch (err: any) {
      toast.error('Erro na operação');
      alert('Erro ao criar instância: ' + (err?.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // BUSCAR QR CODE
  // ============================================================
  const fetchQRCode = async (instanceName: string) => {
    try {
      setQrStatus('loading');
      const res = await api.get(`/evolution/instances/${instanceName}/qrcode`);
      const base64 = res.data?.base64 || res.data?.qrcode?.base64 || res.data?.code || null;
      
      if (base64) {
        setQrCode(base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`);
        setQrStatus('scanning');
      }
    } catch (err) {
      toast.error('Erro ao buscar QR code');
      setQrStatus('error');
    }
  };

  // ============================================================
  // POLLING DE STATUS
  // ============================================================
  const startPolling = (instanceName: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/evolution/instances/${instanceName}/status`);
        if (res.data.is_connected) {
          setQrStatus('connected');
          if (pollingRef.current) clearInterval(pollingRef.current);
          loadChannels();

          // Fechar modal após 2s
          setTimeout(() => {
            setShowQRModal(false);
            setQrCode(null);
            setFormName('');
          }, 2000);
        }
      } catch (err) {
        // silent polling error
      }
    }, 3000);
  };

  // ============================================================
  // DELETAR CANAL
  // ============================================================
  const deleteChannel = (ch: ChannelItem) => {
    setConfirmModal({
      open: true,
      title: 'Remover canal',
      message: `Remover o canal "${ch.name}"? Isso desconectará o WhatsApp.`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, open: false }));
        try {
          if (ch.provider === 'evolution' && ch.instance_name) {
            await api.delete(`/evolution/instances/${ch.instance_name}`);
          } else {
            await api.delete(`/channels/${ch.id}`);
          }
          toast.success('Canal removido');
          loadChannels();
        } catch (err) {
          toast.error('Erro ao remover canal');
        }
      },
    });
  };

  // ============================================================
  // DESCONECTAR (LOGOUT)
  // ============================================================
  const logoutChannel = (ch: ChannelItem) => {
    setConfirmModal({
      open: true,
      title: 'Desconectar WhatsApp',
      message: `Desconectar o WhatsApp de "${ch.name}"?`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, open: false }));
        try {
          if (ch.provider === 'evolution' && ch.instance_name) {
            await api.post(`/evolution/instances/${ch.instance_name}/logout`);
            toast.success('WhatsApp desconectado');
            loadChannels();
          }
        } catch (err) {
          toast.error('Erro ao desconectar');
        }
      },
    });
  };

  // ============================================================
  // RECONECTAR (NOVO QR CODE)
  // ============================================================
  const reconnectChannel = async (ch: ChannelItem) => {
    if (!ch.instance_name) return;
    setQrInstanceName(ch.instance_name);
    setShowQRModal(true);
    await fetchQRCode(ch.instance_name);
    startPolling(ch.instance_name);
  };

  const getProviderLabel = (ch: ChannelItem) => {
    if (ch.provider === 'evolution') return 'Evolution API';
    if (ch.provider === 'meta') return 'Meta Graph API';
    return 'API Oficial';
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6 pb-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Canais</h1>
            <p className="text-sm text-gray-500 mt-2 max-w-md leading-relaxed">
              Conecte seu WhatsApp para atendimento e IA. Cada conta tem direito a 2 instâncias.
            </p>
          </div>
          <button
            onClick={() => { setShowNewModal(true); setFormName(''); }}
            disabled={channels.filter(c => c.provider === 'evolution').length >= 2}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#6366f1] text-white text-[13px] font-semibold hover:bg-[#5558e6] transition-all shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <p className="text-sm text-gray-400 mb-6">Conecte seu primeiro WhatsApp para começar</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="px-6 py-2.5 rounded-xl bg-[#6366f1] text-white text-[13px] font-medium hover:bg-[#5558e6] transition-all"
            >
              Conectar WhatsApp
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {channels.map(ch => (
              <div key={ch.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-sm transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${typeColors[ch.type] || '#6366f1'}15` }}
                    >
                      <svg viewBox="0 0 32 32" className="w-7 h-7">
                        <circle cx="16" cy="16" r="16" fill="#25D366"/>
                        <path d="M23.3 8.7A10.4 10.4 0 0 0 7.6 21.5L6 26l4.6-1.5a10.4 10.4 0 0 0 12.7-16.8zM16 24.3a8.6 8.6 0 0 1-4.4-1.2l-.3-.2-3.2 1 1.1-3.1-.2-.3A8.7 8.7 0 1 1 16 24.3zm4.8-6.5c-.3-.1-1.6-.8-1.8-.9-.3-.1-.5-.1-.6.1-.2.3-.7.9-.8 1.1-.2.1-.3.2-.6 0-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.4.2-.3.2-.5c0-.2 0-.3-.1-.5s-.6-1.6-.9-2.1c-.2-.6-.5-.5-.6-.5h-.6c-.2 0-.5.1-.8.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.6-.7 1.9-1.3.2-.6.2-1.2.2-1.3 0-.1-.2-.2-.5-.4z" fill="white"/>
                      </svg>
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

                  <div className="flex items-center gap-2">
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

                    {/* Reconectar (se desconectado e Evolution) */}
                    {!ch.is_connected && ch.provider === 'evolution' && ch.instance_name && (
                      <button
                        onClick={() => reconnectChannel(ch)}
                        className="p-2 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-all"
                        title="Reconectar" aria-label="Reconectar"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                    )}

                    {/* Desconectar (se conectado e Evolution) */}
                    {ch.is_connected && ch.provider === 'evolution' && (
                      <button
                        onClick={() => logoutChannel(ch)}
                        className="p-2 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-50 transition-all"
                        title="Desconectar WhatsApp" aria-label="Desconectar WhatsApp"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => deleteChannel(ch)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                      title="Remover canal" aria-label="Remover canal"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal: Novo Canal */}
        {showNewModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowNewModal(false)}>
            <div className="bg-white rounded-2xl w-[440px] shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Conectar WhatsApp</h2>
                    <p className="text-[13px] text-gray-400 mt-1">Escaneie o QR Code para conectar</p>
                  </div>
                  <button onClick={() => setShowNewModal(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-green-50 rounded-xl p-4 flex items-start gap-3">
                  <svg viewBox="0 0 32 32" className="w-8 h-8 flex-shrink-0 mt-0.5">
                    <circle cx="16" cy="16" r="16" fill="#25D366"/>
                    <path d="M23.3 8.7A10.4 10.4 0 0 0 7.6 21.5L6 26l4.6-1.5a10.4 10.4 0 0 0 12.7-16.8zM16 24.3a8.6 8.6 0 0 1-4.4-1.2l-.3-.2-3.2 1 1.1-3.1-.2-.3A8.7 8.7 0 1 1 16 24.3zm4.8-6.5c-.3-.1-1.6-.8-1.8-.9-.3-.1-.5-.1-.6.1-.2.3-.7.9-.8 1.1-.2.1-.3.2-.6 0-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.4.2-.3.2-.5c0-.2 0-.3-.1-.5s-.6-1.6-.9-2.1c-.2-.6-.5-.5-.6-.5h-.6c-.2 0-.5.1-.8.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.6-.7 1.9-1.3.2-.6.2-1.2.2-1.3 0-.1-.2-.2-.5-.4z" fill="white"/>
                  </svg>
                  <div>
                    <p className="text-[13px] font-semibold text-green-800">WhatsApp via Evolution API</p>
                    <p className="text-[11px] text-green-600 mt-0.5">Conexão automática via QR Code. Sem precisar de API oficial.</p>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Nome do Canal</label>
                  <input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="Ex: WhatsApp Comercial"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowNewModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={createEvolutionInstance}
                    disabled={saving || !formName.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-[#25D366] text-white text-[13px] font-medium hover:bg-[#1fb855] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                    {saving ? 'Criando...' : 'Gerar QR Code'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: QR Code */}
        {showQRModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { setShowQRModal(false); if (pollingRef.current) clearInterval(pollingRef.current); }}>
            <div className="bg-white rounded-2xl w-[400px] shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">
                    {qrStatus === 'connected' ? 'Conectado!' : 'Escaneie o QR Code'}
                  </h2>
                  <button
                    onClick={() => { setShowQRModal(false); if (pollingRef.current) clearInterval(pollingRef.current); }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* QR Code Display */}
                <div className="flex flex-col items-center">
                  {qrStatus === 'loading' && (
                    <div className="w-64 h-64 flex items-center justify-center bg-gray-50 rounded-2xl">
                      <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    </div>
                  )}

                  {qrStatus === 'scanning' && qrCode && (
                    <>
                      <div className="bg-white p-3 rounded-2xl border-2 border-green-200">
                        <img src={qrCode} alt="QR Code WhatsApp" className="w-60 h-60 rounded-lg" />
                      </div>
                      <div className="flex items-center gap-2 mt-4 text-amber-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-[13px] font-medium">Aguardando leitura do QR Code...</span>
                      </div>
                    </>
                  )}

                  {qrStatus === 'connected' && (
                    <div className="w-64 h-64 flex flex-col items-center justify-center bg-emerald-50 rounded-2xl">
                      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                        <Wifi className="w-8 h-8 text-emerald-600" />
                      </div>
                      <p className="text-lg font-bold text-emerald-700">WhatsApp Conectado!</p>
                      <p className="text-[13px] text-emerald-500 mt-1">Tudo pronto para usar</p>
                    </div>
                  )}

                  {qrStatus === 'error' && (
                    <div className="w-64 h-64 flex flex-col items-center justify-center bg-red-50 rounded-2xl">
                      <p className="text-sm text-red-600 mb-3">Erro ao gerar QR Code</p>
                      <button
                        onClick={() => fetchQRCode(qrInstanceName)}
                        className="px-4 py-2 rounded-lg bg-red-100 text-red-700 text-[13px] font-medium hover:bg-red-200 transition-all flex items-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Tentar novamente
                      </button>
                    </div>
                  )}
                </div>

                {qrStatus === 'scanning' && (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <p className="text-[12px] font-semibold text-gray-700">Como conectar:</p>
                    <p className="text-[11px] text-gray-500">1. Abra o WhatsApp no celular</p>
                    <p className="text-[11px] text-gray-500">2. Toque em ⋮ Menu → Aparelhos Conectados</p>
                    <p className="text-[11px] text-gray-500">3. Toque em "Conectar aparelho"</p>
                    <p className="text-[11px] text-gray-500">4. Aponte a câmera para o QR Code acima</p>
                  </div>
                )}

                {/* Refresh QR button */}
                {qrStatus === 'scanning' && (
                  <button
                    onClick={() => fetchQRCode(qrInstanceName)}
                    className="w-full py-2.5 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Atualizar QR Code
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel="Remover"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, open: false }))}
      />
    </AppLayout>
  );
}