'use client';
import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import api from '@/lib/api';

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Conectando sua conta...');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setMessage('Autorização negada. Tente novamente.');
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('Código de autorização não recebido.');
      return;
    }

    const channelType = state || 'instagram';
    const channelName = channelType === 'instagram' ? 'Instagram' : 'Messenger';

    const exchange = async () => {
      try {
        const res = await api.post('/oauth/meta/callback', {
          code,
          channel_type: channelType,
          channel_name: channelName,
        });

        if (res.data.status === 'connected') {
          setStatus('success');
          setMessage(`${channelName} conectado com sucesso!`);
          setTimeout(() => router.push('/canais'), 2000);
        }
      } catch (err: any) {
        const detail = err?.response?.data?.detail || 'Erro ao conectar. Tente novamente.';
        setStatus('error');
        setMessage(detail);
      }
    };

    exchange();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center">
      <div className="bg-white rounded-2xl p-10 shadow-lg border border-gray-100 text-center max-w-md">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 text-[#6366f1] animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 mb-2">Conectando...</h2>
            <p className="text-sm text-gray-400">{message}</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 mb-2">Conectado!</h2>
            <p className="text-sm text-gray-400">{message}</p>
            <p className="text-[12px] text-gray-300 mt-2">Redirecionando...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 mb-2">Erro</h2>
            <p className="text-sm text-gray-400 mb-4">{message}</p>
            <button
              onClick={() => router.push('/canais')}
              className="px-6 py-2.5 rounded-xl bg-[#6366f1] text-white text-[13px] font-medium hover:bg-[#5558e6] transition-all"
            >
              Voltar para Canais
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center"><Loader2 className="w-12 h-12 text-[#6366f1] animate-spin" /></div>}>
      <CallbackContent />
    </Suspense>
  );
}