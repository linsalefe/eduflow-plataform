'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/app-shell';
import api from '@/lib/api';
import { ArrowLeft, User, Phone, Mail, Calendar, Tag, MessageCircle, Search, Loader2, ExternalLink } from 'lucide-react';

interface Submission {
  id: number;
  name: string;
  phone: string;
  email: string;
  course: string;
  utm_source: string;
  utm_campaign: string;
  created_at: string;
  contact: {
    wa_id: string;
    lead_status: string;
    ai_active: boolean;
    notes: string;
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  novo: 'bg-indigo-50 text-indigo-700',
  ia_atendendo: 'bg-amber-50 text-amber-700',
  qualificado: 'bg-purple-50 text-purple-700',
  agendamento: 'bg-cyan-50 text-cyan-700',
  reuniao_realizada: 'bg-emerald-50 text-emerald-700',
  desqualificado: 'bg-red-50 text-red-700',
  em_contato: 'bg-amber-50 text-amber-700',
  convertido: 'bg-emerald-50 text-emerald-700',
  perdido: 'bg-red-50 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  ia_atendendo: 'IA Atendendo',
  qualificado: 'Qualificado',
  agendamento: 'Agendamento',
  reuniao_realizada: 'Reunião Realizada',
  desqualificado: 'Desqualificado',
  em_contato: 'Em Contato',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

export default function LeadsPage() {
  const params = useParams();
  const router = useRouter();
  const pageId = params.id as string;

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<Submission | null>(null);
  const [pageTitle, setPageTitle] = useState('');

  useEffect(() => {
    fetchData();
  }, [pageId]);

  const fetchData = async () => {
    try {
      const [subsRes, pageRes] = await Promise.all([
        api.get(`/landing-pages/${pageId}/submissions`),
        api.get(`/landing-pages/${pageId}`),
      ]);
      setSubmissions(subsRes.data);
      setPageTitle(pageRes.data.title);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = submissions.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.phone.includes(search) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (d: string) => {
    if (!d) return '-';
    const date = new Date(d);
    return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const parseNotes = (notes: string) => {
    try {
      return JSON.parse(notes);
    } catch {
      return null;
    }
  };

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => router.push('/landing-pages')} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div className="flex-1">
            <p className="text-sm text-gray-400">Landing Page</p>
            <h1 className="text-xl font-bold text-gray-900">{pageTitle || 'Leads'}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary px-3 py-1.5 rounded-xl text-sm font-semibold">
              {submissions.length} lead{submissions.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou email..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary"
          />
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-20">
            <User className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">{search ? 'Nenhum lead encontrado' : 'Nenhum lead preencheu este formulário'}</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-[1fr_140px_140px_120px_100px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>Lead</span>
              <span>Telefone</span>
              <span>Origem</span>
              <span>Data</span>
              <span>Status</span>
            </div>

            <div className="divide-y divide-gray-50">
              {filtered.map(s => (
                <div
                  key={s.id}
                  onClick={() => setSelectedLead(s)}
                  className="grid grid-cols-[1fr_140px_140px_120px_100px] gap-4 px-5 py-3.5 hover:bg-gray-50 serviçor-pointer transition-colors items-center"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                    {s.email && <p className="text-xs text-gray-400 truncate">{s.email}</p>}
                  </div>
                  <p className="text-sm text-gray-600">{s.phone}</p>
                  <p className="text-xs text-gray-500">{s.utm_source || 'direto'}</p>
                  <p className="text-xs text-gray-500">{formatDate(s.created_at).split(' ')[0]}</p>
                  <div>
                    {s.contact ? (
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[s.contact.lead_status] || 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[s.contact.lead_status] || s.contact.lead_status}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Sem contato</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal de detalhes */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedLead(null)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-800">{selectedLead.name}</h3>
              <button onClick={() => setSelectedLead(null)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 text-xl leading-none">&times;</button>
            </div>

            <div className="space-y-4">
              {/* Info básica */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{selectedLead.phone}</span>
                </div>
                {selectedLead.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{selectedLead.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{formatDate(selectedLead.created_at)}</span>
                </div>
                {selectedLead.utm_source && (
                  <div className="flex items-center gap-3">
                    <Tag className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">Origem: {selectedLead.utm_source}</span>
                    {selectedLead.utm_campaign && <span className="text-xs text-gray-400">/ {selectedLead.utm_campaign}</span>}
                  </div>
                )}
              </div>

              {/* Status do contato */}
              {selectedLead.contact && (
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Status no CRM</p>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[selectedLead.contact.lead_status] || 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABELS[selectedLead.contact.lead_status] || selectedLead.contact.lead_status}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${selectedLead.contact.ai_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      IA {selectedLead.contact.ai_active ? 'Ativa' : 'Desligada'}
                    </span>
                  </div>
                </div>
              )}

              {/* Notas / Dados coletados */}
              {selectedLead.contact?.notes && parseNotes(selectedLead.contact.notes) && (
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Dados Coletados</p>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    {Object.entries(parseNotes(selectedLead.contact.notes) || {}).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-xs text-gray-500 capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-gray-800 font-medium text-right max-w-[60%]">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botão abrir conversa */}
              {selectedLead.contact?.wa_id && (
                <div className="pt-4 border-t border-gray-100">
                  <button
                    onClick={() => router.push(`/conversations?wa_id=${selectedLead.contact!.wa_id}`)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" /> Abrir Conversa
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}