'use client';
import { useEffect, useState } from 'react';
import { Plus, FileText, ExternalLink, Trash2, ToggleLeft, ToggleRight, Loader2, Copy, Eye, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import ConfirmModal from '@/components/ConfirmModal';
import api from '@/lib/api';

interface LandingPage {
  id: number;
  channel_id: number;
  slug: string;
  title: string;
  template: string;
  config: any;
  is_active: boolean;
  created_at: string;
}

interface Channel {
  id: number;
  name: string;
}

const templates = [
  { id: 'curso', label: 'Curso / Pós-Graduação', description: 'Ideal para divulgar cursos de pós-graduação e especializações' },
  { id: 'vestibular', label: 'Vestibular / Processo Seletivo', description: 'Perfeito para campanhas de vestibular e inscrições' },
  { id: 'evento', label: 'Evento / Palestra', description: 'Para divulgar eventos, workshops e palestras da instituição' },
];

export default function LandingPagesPage() {
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPage, setEditingPage] = useState<LandingPage | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [template, setTemplate] = useState('curso');
  const [channelId, setChannelId] = useState<number>(0);

  // Config state
  const [heroTitle, setHeroTitle] = useState('');
  const [heroSubtitle, setHeroSubtitle] = useState('');
  const [ctaText, setCtaText] = useState('Quero me inscrever');
  const [primaryColor, setPrimaryColor] = useState('#6366f1');
  const [logoUrl, setLogoUrl] = useState('');
  const [courseName, setCourseName] = useState('');
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} });

  const fetchPages = async () => {
    try {
      const res = await api.get('/landing-pages');
      setPages(res.data);
    } catch (err) {
      toast.error('Erro na operação');
    } finally {
      setLoading(false);
    }
  };

  const fetchChannels = async () => {
    try {
      const res = await api.get('/channels');
      setChannels(res.data);
      if (res.data.length > 0 && channelId === 0) {
        setChannelId(res.data[0].id);
      }
    } catch (err) {
      toast.error('Erro na operação');
    }
  };

  useEffect(() => {
    fetchPages();
    fetchChannels();
  }, []);

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  };

  const openCreate = () => {
    setEditingPage(null);
    setTitle('');
    setSlug('');
    setTemplate('curso');
    setHeroTitle('');
    setHeroSubtitle('');
    setCtaText('Quero me inscrever');
    setPrimaryColor('#6366f1');
    setLogoUrl('');
    setCourseName('');
    if (channels.length > 0) setChannelId(channels[0].id);
    setShowModal(true);
  };

  const openEdit = (page: LandingPage) => {
    setEditingPage(page);
    setTitle(page.title);
    setSlug(page.slug);
    setTemplate(page.template);
    setChannelId(page.channel_id);
    setHeroTitle(page.config?.heroTitle || '');
    setHeroSubtitle(page.config?.heroSubtitle || '');
    setCtaText(page.config?.ctaText || 'Quero me inscrever');
    setPrimaryColor(page.config?.primaryColor || '#6366f1');
    setLogoUrl(page.config?.logoUrl || '');
    setCourseName(page.config?.courseName || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!title || !slug || !channelId) return;
    setSaving(true);

    const config = { heroTitle, heroSubtitle, ctaText, primaryColor, logoUrl, courseName };
    const payload = { title, slug, template, channel_id: channelId, config };

    try {
      if (editingPage) {
        await api.put(`/landing-pages/${editingPage.id}`, payload);
      } else {
        await api.post('/landing-pages', payload);
      }
      setShowModal(false);
      fetchPages();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    setConfirmModal({
      open: true,
      title: 'Remover landing page',
      message: 'Tem certeza que deseja remover esta landing page?',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, open: false }));
        try {
          await api.delete(`/landing-pages/${id}`);
          toast.success('Landing page removida');
          fetchPages();
        } catch (err) {
          toast.error('Erro ao remover');
        }
      },
    });
  };

  const handleToggle = async (page: LandingPage) => {
    try {
      await api.put(`/landing-pages/${page.id}`, { is_active: !page.is_active });
      fetchPages();
    } catch (err) {
      toast.error('Erro na operação');
    }
  };

  const copyUrl = (slug: string) => {
    const url = `${window.location.origin}/lp/${slug}`;
    navigator.clipboard.writeText(url);
    setCopied(slug);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Landing Pages</h1>
            <p className="text-sm text-gray-500 mt-1">Crie páginas de captura para seus cursos e campanhas</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#6366f1] text-white rounded-xl hover:bg-[#4f46e5] transition-all text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Nova Landing Page
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-[#6366f1] animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && pages.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">Nenhuma landing page criada</h3>
            <p className="text-sm text-gray-400 mt-1 mb-6">Crie sua primeira página de captura para começar a receber leads</p>
            <button
              onClick={openCreate}
              className="px-5 py-2.5 bg-[#6366f1] text-white rounded-xl hover:bg-[#4f46e5] transition-all text-sm font-medium"
            >
              Criar Landing Page
            </button>
          </div>
        )}

        {/* Cards grid */}
        {!loading && pages.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {pages.map((page) => (
              <div key={page.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-all">
                {/* Status badge */}
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${page.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                    {page.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {templates.find(t => t.id === page.template)?.label || page.template}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-base font-semibold text-gray-800 mb-1">{page.title}</h3>
                <p className="text-xs text-gray-400 mb-4">/lp/{page.slug}</p>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-50">
                  <button
                    onClick={() => openEdit(page)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-all"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={() => copyUrl(page.slug)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-all"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copied === page.slug ? 'Copiado!' : 'Copiar URL'}
                  </button>
                  <button
                    onClick={() => handleToggle(page)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-all ml-auto"
                  >
                    {page.is_active ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(page.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal Criar/Editar */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-6">
                {editingPage ? 'Editar Landing Page' : 'Nova Landing Page'}
              </h2>

              <div className="space-y-5">
                {/* Básico */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Título</label>
                    <input
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        if (!editingPage) setSlug(generateSlug(e.target.value));
                      }}
                      placeholder="Ex: Pós em Saúde Mental"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/10 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Slug (URL)</label>
                    <input
                      value={slug}
                      onChange={(e) => setSlug(generateSlug(e.target.value))}
                      placeholder="pos-saude-mental"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/10 outline-none"
                    />
                  </div>
                </div>

                {/* Canal */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Canal (WhatsApp)</label>
                  <select
                    value={channelId}
                    onChange={(e) => setChannelId(Number(e.target.value))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/10 outline-none"
                  >
                    {channels.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Template */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Template</label>
                  <div className="grid grid-cols-3 gap-3">
                    {templates.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTemplate(t.id)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          template === t.id
                            ? 'border-[#6366f1] bg-[#6366f1]/5 ring-2 ring-[#6366f1]/20'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <p className="text-sm font-medium text-gray-800">{t.label}</p>
                        <p className="text-xs text-gray-400 mt-1">{t.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <hr className="border-gray-100" />

                {/* Config da LP */}
                <p className="text-sm font-semibold text-gray-700">Conteúdo da Página</p>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Nome do Curso</label>
                  <input
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="Ex: Pós-Graduação em Saúde Mental Infantojuvenil"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/10 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Título Principal (Hero)</label>
                  <input
                    value={heroTitle}
                    onChange={(e) => setHeroTitle(e.target.value)}
                    placeholder="Ex: Transforme sua carreira com a melhor pós-graduação"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/10 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Subtítulo</label>
                  <textarea
                    value={heroSubtitle}
                    onChange={(e) => setHeroSubtitle(e.target.value)}
                    placeholder="Ex: Aprenda com os melhores professores e tenha certificação reconhecida pelo MEC"
                    rows={2}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/10 outline-none resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Texto do Botão</label>
                    <input
                      value={ctaText}
                      onChange={(e) => setCtaText(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/10 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Cor Principal</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                      />
                      <input
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/10 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">URL do Logo (opcional)</label>
                  <input
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://exemplo.com/logo.png"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/10 outline-none"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 mt-8 pt-5 border-t border-gray-100">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !title || !slug || !channelId}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#6366f1] text-white rounded-xl hover:bg-[#4f46e5] transition-all text-sm font-medium disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingPage ? 'Salvar Alterações' : 'Criar Landing Page'}
                </button>
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