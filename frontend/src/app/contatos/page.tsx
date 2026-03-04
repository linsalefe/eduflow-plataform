'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Plus, Trash2, Pencil, X, Loader2,
  Phone, User, BookOpen, ChevronDown, Filter,
  CheckCircle, AlertCircle, Upload
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import api from '@/lib/api';

const STAGES = [
  { key: 'all', label: 'Todos' },
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

interface Contact {
  wa_id: string;
  name: string;
  lead_status: string;
  notes: string | null;
  channel_id: number | null;
  created_at: string | null;
  ai_active: boolean;
}

export default function ContatosPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [mounted, setMounted] = useState(false);

  // Modal criar/editar
  const [showModal, setShowModal] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCourse, setFormCourse] = useState('');
  const [formChannelId, setFormChannelId] = useState<number>(0);
  const [channels, setChannels] = useState<any[]>([]);

  // Modal confirmar delete
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (!authLoading && !user) router.push('/login'); }, [user, authLoading, router]);
  useEffect(() => { if (user) { loadContacts(); loadChannels(); } }, [user]);

  const loadContacts = async () => {
    try {
      const res = await api.get('/contacts?limit=1000');
      setContacts(res.data);
    } catch {
      toast.error('Erro ao carregar contatos');
    } finally {
      setLoading(false);
    }
  };

  const loadChannels = async () => {
    try {
      const res = await api.get('/channels');
      setChannels(res.data);
      if (res.data.length > 0) setFormChannelId(res.data[0].id);
    } catch {}
  };

  const getCourse = (notes: string | null) => {
    try {
      const parsed = JSON.parse(notes || '{}');
      return parsed.course || '';
    } catch { return ''; }
  };

  const filtered = contacts.filter(c => {
    const matchSearch = !search ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.wa_id.includes(search);
    const matchStage = stageFilter === 'all' || c.lead_status === stageFilter;
    return matchSearch && matchStage;
  });

  const openCreate = () => {
    setEditContact(null);
    setFormName('');
    setFormPhone('');
    setFormCourse('');
    if (channels.length > 0) setFormChannelId(channels[0].id);
    setShowModal(true);
  };

  const openEdit = (c: Contact) => {
    setEditContact(c);
    setFormName(c.name || '');
    setFormPhone(c.wa_id.replace(/^55/, ''));
    setFormCourse(getCourse(c.notes));
    setFormChannelId(c.channel_id || (channels.length > 0 ? channels[0].id : 0));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return toast.error('Informe o nome');
    if (!formPhone.trim()) return toast.error('Informe o telefone');
    setSaving(true);
    try {
      if (editContact) {
        await api.patch(`/contacts/${editContact.wa_id}`, {
          name: formName,
          notes: JSON.stringify({ course: formCourse }),
        });
        toast.success('Contato atualizado');
      } else {
        await api.post('/contacts', {
          name: formName,
          phone: formPhone,
          course: formCourse,
          channel_id: formChannelId,
        });
        toast.success('Contato criado');
      }
      setShowModal(false);
      loadContacts();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Erro ao salvar contato');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/contacts/${deleteTarget.wa_id}`);
      toast.success('Contato excluído');
      setDeleteTarget(null);
      loadContacts();
    } catch {
      toast.error('Erro ao excluir contato');
    } finally {
      setDeleting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    toast.loading('Importando contatos...');
    try {
      const res = await api.post('/contacts/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.dismiss();
      toast.success(`${res.data.imported} contatos importados`);
      loadContacts();
    } catch (err: any) {
      toast.dismiss();
      toast.error(err?.response?.data?.detail || 'Erro ao importar');
    }
    e.target.value = '';
  };

  const formatPhone = (wa_id: string) => {
    const num = wa_id.replace(/^55/, '');
    if (num.length === 11) return `(${num.slice(0,2)}) ${num.slice(2,7)}-${num.slice(7)}`;
    return wa_id;
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" /></div>;
  if (!user) return null;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl mx-auto pb-10">

        {/* Header */}
        <div className={`flex items-center justify-between transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div>
            <p className="text-sm text-gray-400 mb-0.5">CRM</p>
            <h1 className="text-xl lg:text-2xl font-semibold text-[#27273D] tracking-tight">Contatos</h1>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 active:scale-[0.98] transition-all cursor-pointer">
              <Upload className="w-4 h-4" />
              Importar
              <input type="file" accept=".xlsx,.csv" onChange={handleImport} className="hidden" />
            </label>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#6366f1] text-white text-sm font-medium rounded-xl hover:bg-[#4f46e5] hover:shadow-lg hover:shadow-[#6366f1]/20 active:scale-[0.98] transition-all"
            >
              <Plus className="w-4 h-4" />
              Novo contato
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className={`flex flex-col sm:flex-row gap-3 transition-all duration-700 delay-75 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-100 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#6366f1] transition-all"
            />
          </div>
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-[#6366f1] transition-all cursor-pointer"
          >
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>

        {/* Stats */}
        <div className={`flex items-center gap-2 text-[12px] text-gray-400 transition-all duration-700 delay-100 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <span className="font-medium text-[#27273D]">{filtered.length}</span> contatos encontrados
          {search && <span>· busca: "<span className="text-[#6366f1]">{search}</span>"</span>}
        </div>

        {/* Tabela */}
        <div className={`bg-white rounded-2xl border border-gray-100 overflow-hidden transition-all duration-700 delay-150 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-[#6366f1] animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <User className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-400">Nenhum contato encontrado</p>
              <p className="text-xs text-gray-300 mt-1">Clique em "Novo contato" para adicionar</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Nome</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Telefone</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Curso</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Estágio</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Criado em</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(c => (
                  <tr key={c.wa_id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#6366f1]/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[12px] font-bold text-[#6366f1]">{(c.name || c.wa_id).charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="text-[13px] font-medium text-[#27273D]">{c.name || c.wa_id}</p>
                          {c.ai_active && <p className="text-[11px] text-emerald-500">IA ativa</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <p className="text-[13px] text-gray-500 font-mono">{formatPhone(c.wa_id)}</p>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <p className="text-[13px] text-gray-500">{getCourse(c.notes) || '—'}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${STAGE_COLORS[c.lead_status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {STAGES.find(s => s.key === c.lead_status)?.label || c.lead_status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <p className="text-[12px] text-gray-400">
                        {c.created_at ? new Date(c.created_at + 'Z').toLocaleDateString('pt-BR') : '—'}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-[#6366f1] hover:bg-[#6366f1]/5 rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setDeleteTarget(c)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal criar/editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-[15px] font-semibold text-[#27273D]">{editContact ? 'Editar contato' : 'Novo contato'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Nome</label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Nome completo" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#6366f1] focus:bg-white transition-all" />
              </div>
              {!editContact && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">WhatsApp</label>
                  <input type="tel" value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="83988046720" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#6366f1] focus:bg-white transition-all" />
                </div>
              )}
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Curso de interesse</label>
                <input type="text" value={formCourse} onChange={e => setFormCourse(e.target.value)} placeholder="Ex: Pós-graduação em Psicologia" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#6366f1] focus:bg-white transition-all" />
              </div>
              {!editContact && channels.length > 1 && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Canal WhatsApp</label>
                  <select value={formChannelId} onChange={e => setFormChannelId(Number(e.target.value))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-[#6366f1] focus:bg-white transition-all cursor-pointer">
                    {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-[13px] font-medium text-gray-500 hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-[#6366f1] text-white rounded-xl text-[13px] font-medium hover:bg-[#4f46e5] active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {saving ? 'Salvando...' : editContact ? 'Salvar' : 'Criar contato'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar delete */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-gray-100 p-6" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <h2 className="text-[15px] font-semibold text-[#27273D] text-center mb-1">Excluir contato</h2>
            <p className="text-[13px] text-gray-400 text-center mb-5">Tem certeza que deseja excluir <strong>{deleteTarget.name}</strong>? Todas as mensagens serão removidas.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-[13px] font-medium text-gray-500 hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-[13px] font-medium hover:bg-red-600 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}