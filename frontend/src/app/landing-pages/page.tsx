'use client';
import { useEffect, useState, useRef } from 'react';
import {
  Plus, FileText, Trash2, Loader2, Copy, Pencil,
  Eye, ChevronDown, ChevronRight,
  ArrowUp, ArrowDown, ToggleLeft, ToggleRight, X,
  BarChart3, Info, List, Users, Award, MessageSquareQuote,
  HelpCircle, Megaphone, Palette, FormInput,
  ExternalLink, Save, ArrowLeft, Play, Upload, ImageIcon, Trash2 as TrashIcon, Tags
} from 'lucide-react';
import { toast } from 'sonner';
import AppShell from "@/components/app-shell";;
import ConfirmModal from '@/components/ConfirmModal';
import api from '@/lib/api';

// ═══════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════

interface LandingPage {
  id: number;
  channel_id: number;
  slug: string;
  title: string;
  template: string;
  config: any;
  is_active: boolean;
  tag?: string;
  pipeline_stage?: string;
  whatsapp_message?: string;
  created_at: string;
}

interface Channel {
  id: number;
  name: string;
}

interface Section {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  locked?: boolean;
  data: any;
}

interface FormField {
  id: string;
  label: string;
  type: 'text' | 'tel' | 'email' | 'select';
  required: boolean;
  enabled: boolean;
  options?: string[];
}

interface LPConfig {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  heroImageUrl: string;
  headingFont: string;
  bodyFont: string;
  formFields: FormField[];
  sections: Section[];
}

// ═══════════════════════════════════════════
// FONTES DISPONÍVEIS
// ═══════════════════════════════════════════

const fontOptions = [
  { id: 'Playfair Display', label: 'Playfair Display', type: 'serif', preview: 'Elegante e clássica' },
  { id: 'Montserrat', label: 'Montserrat', type: 'sans-serif', preview: 'Moderna e versátil' },
  { id: 'Poppins', label: 'Poppins', type: 'sans-serif', preview: 'Clean e geométrica' },
  { id: 'Raleway', label: 'Raleway', type: 'sans-serif', preview: 'Leve e sofisticada' },
  { id: 'Lora', label: 'Lora', type: 'serif', preview: 'Editorial e refinada' },
  { id: 'Bebas Neue', label: 'Bebas Neue', type: 'sans-serif', preview: 'Bold e impactante' },
  { id: 'DM Sans', label: 'DM Sans', type: 'sans-serif', preview: 'Minimalista e neutra' },
  { id: 'Bitter', label: 'Bitter', type: 'serif', preview: 'Forte e legível' },
  { id: 'Space Grotesk', label: 'Space Grotesk', type: 'sans-serif', preview: 'Futurista e técnica' },
  { id: 'Merriweather', label: 'Merriweather', type: 'serif', preview: 'Tradicional e confiável' },
];

// ═══════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════

const defaultFormFields: FormField[] = [
  { id: 'name', label: 'Nome completo', type: 'text', required: true, enabled: true },
  { id: 'phone', label: 'WhatsApp', type: 'tel', required: true, enabled: true },
  { id: 'email', label: 'E-mail', type: 'email', required: false, enabled: true },
  { id: 'age', label: 'Idade', type: 'text', required: false, enabled: false },
  { id: 'city', label: 'Cidade', type: 'text', required: false, enabled: false },
  { id: 'interest', label: 'Interesse', type: 'select', required: false, enabled: false, options: [] },
  { id: 'source', label: 'Como conheceu?', type: 'select', required: false, enabled: false, options: ['Google', 'Instagram', 'Indicação', 'Facebook', 'Outro'] },
];

const defaultSections: Section[] = [
  {
    id: 'hero',
    label: 'Hero (Topo)',
    icon: 'Megaphone',
    enabled: true,
    locked: true,
    data: { title: '', subtitle: '', ctaText: 'Quero me inscrever' },
  },
  {
    id: 'stats',
    label: 'Números de Impacto',
    icon: 'BarChart3',
    enabled: true,
    data: {
      items: [
        { value: '500', suffix: '+', label: 'Clientes' },
        { value: '98', suffix: '%', label: 'Satisfação' },
        { value: '10', suffix: '+', label: 'Anos de experiência' },
        { value: '15', suffix: '+', label: 'Programas' },
      ],
    },
  },
  {
    id: 'about',
    label: 'Sobre',
    icon: 'Info',
    enabled: true,
    data: {
      sectionTitle: 'Sobre o Programa',
      description: '',
      highlights: [
        { label: 'Duração', value: '' },
        { label: 'Formato', value: '' },
        { label: 'Certificação', value: '' },
      ],
    },
  },
  {
    id: 'topics',
    label: 'Tópicos / Grade',
    icon: 'List',
    enabled: true,
    data: { sectionTitle: 'O que você vai aprender', items: [''] },
  },
  {
    id: 'audience',
    label: 'Público-Alvo',
    icon: 'Users',
    enabled: true,
    data: { sectionTitle: 'Para quem é', items: [''] },
  },
  {
    id: 'differentials',
    label: 'Diferenciais',
    icon: 'Award',
    enabled: true,
    data: {
      sectionTitle: 'Por que nos escolher',
      items: [{ icon: 'award', title: '', desc: '' }],
    },
  },
  {
    id: 'testimonials',
    label: 'Depoimentos',
    icon: 'MessageSquareQuote',
    enabled: false,
    data: {
      sectionTitle: 'O que dizem sobre nós',
      items: [{ name: '', role: '', text: '' }],
    },
  },
  {
    id: 'faq',
    label: 'FAQ',
    icon: 'HelpCircle',
    enabled: true,
    data: {
      sectionTitle: 'Dúvidas Frequentes',
      items: [{ q: '', a: '' }],
    },
  },
  {
    id: 'video',
    label: 'Vídeo',
    icon: 'Play',
    enabled: false,
    data: {
      sectionTitle: 'Conheça mais',
      youtubeUrl: '',
    },
  },
  {
    id: 'cta_final',
    label: 'CTA Final',
    icon: 'Megaphone',
    enabled: true,
    locked: true,
    data: { title: 'Não perca essa oportunidade', subtitle: 'As vagas são limitadas. Garanta seu lugar agora.' },
  },
];

const getDefaultConfig = (): LPConfig => ({
  primaryColor: '#1D4ED8',
  secondaryColor: '#10b981',
  logoUrl: '',
  heroImageUrl: '',
  headingFont: 'Playfair Display',
  bodyFont: 'Inter',
  formFields: JSON.parse(JSON.stringify(defaultFormFields)),
  sections: JSON.parse(JSON.stringify(defaultSections)),
});

const iconComponents: Record<string, any> = {
  Megaphone, BarChart3, Info, List, Users, Award, MessageSquareQuote, HelpCircle, Play,
};

// ═══════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════

export default function LandingPagesPage() {
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {},
  });

  const [editorMode, setEditorMode] = useState<'list' | 'editor'>('list');
  const [editingPage, setEditingPage] = useState<LandingPage | null>(null);
  const [saving, setSaving] = useState(false);
const [activeTab, setActiveTab] = useState<'sections' | 'form' | 'visual' | 'crm'>('sections');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [channelId, setChannelId] = useState<number>(0);
  const [lpTag, setLpTag] = useState('');
  const [pipelineStage, setPipelineStage] = useState('');
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [kanbanColumns, setKanbanColumns] = useState<{key: string; label: string}[]>([]);
  const [config, setConfig] = useState<LPConfig>(getDefaultConfig());

  const fetchPages = async () => {
    try {
      const res = await api.get('/landing-pages');
      setPages(res.data);
    } catch {
      toast.error('Erro ao carregar landing pages');
    } finally {
      setLoading(false);
    }
  };

  const fetchChannels = async () => {
    try {
      const res = await api.get('/channels');
      setChannels(res.data);
      if (res.data.length > 0 && channelId === 0) setChannelId(res.data[0].id);
    } catch {
      toast.error('Erro ao carregar canais');
    }
  };

  useEffect(() => { fetchPages(); fetchChannels(); fetchKanbanColumns(); }, []);

  const fetchKanbanColumns = async () => {
    try {
      const res = await api.get('/tenant/kanban-columns');
      setKanbanColumns(res.data);
    } catch {
      console.error('Erro ao carregar estágios');
    }
  };

  const generateSlug = (text: string) =>
    text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const copyUrl = (s: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/lp/${s}`);
    setCopied(s);
    setTimeout(() => setCopied(''), 2000);
  };

  const openCreate = () => {
    setEditingPage(null);
    setTitle('');
    setLpTag('');
    setPipelineStage('');
    setWhatsappMessage('');
    if (channels.length > 0) setChannelId(channels[0].id);
    setConfig(getDefaultConfig());
    setActiveTab('sections');
    setExpandedSection(null);
    setEditorMode('editor');
  };

  const openEdit = (page: LandingPage) => {
    setEditingPage(page);
    setTitle(page.title);
    setSlug(page.slug);
    setLpTag(page.tag || '');
    setPipelineStage(page.pipeline_stage || '');
    setWhatsappMessage(page.whatsapp_message || '');
    setChannelId(page.channel_id);

    const saved = page.config || {};
    const merged = getDefaultConfig();
    merged.primaryColor = saved.primaryColor || merged.primaryColor;
    merged.secondaryColor = saved.secondaryColor || merged.secondaryColor;
    merged.logoUrl = saved.logoUrl || '';
    merged.heroImageUrl = saved.heroImageUrl || '';
    merged.headingFont = saved.headingFont || merged.headingFont;
    merged.bodyFont = saved.bodyFont || merged.bodyFont;
    if (saved.formFields) merged.formFields = saved.formFields;
    if (saved.sections) {
      const savedIds = saved.sections.map((s: any) => s.id);
      const newSections = defaultSections.filter(ds => !savedIds.includes(ds.id));
      // Inserir novas seções antes do cta_final
      const ctaIndex = saved.sections.findIndex((s: any) => s.id === 'cta_final');
      if (ctaIndex >= 0 && newSections.length > 0) {
        const before = saved.sections.slice(0, ctaIndex);
        const after = saved.sections.slice(ctaIndex);
        merged.sections = [...before, ...newSections, ...after];
      } else {
        merged.sections = [...saved.sections, ...newSections];
      }
    }

    setConfig(merged);
    setActiveTab('sections');
    setExpandedSection(null);
    setEditorMode('editor');
  };

  const handleSave = async () => {
    if (!title || !slug || !channelId) {
      toast.error('Preencha título, slug e canal');
      return;
    }
    setSaving(true);
    const payload = { title, slug, template: 'custom', channel_id: channelId, config, tag: lpTag || null, pipeline_stage: pipelineStage || null, whatsapp_message: whatsappMessage || null };
    try {
      if (editingPage) {
        await api.put(`/landing-pages/${editingPage.id}`, payload);
        toast.success('Landing page atualizada!');
      } else {
        await api.post('/landing-pages', payload);
        toast.success('Landing page criada!');
      }
      setEditorMode('list');
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
      message: 'Tem certeza que deseja remover esta landing page? Essa ação não pode ser desfeita.',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, open: false }));
        try {
          await api.delete(`/landing-pages/${id}`);
          toast.success('Landing page removida');
          fetchPages();
        } catch { toast.error('Erro ao remover'); }
      },
    });
  };

  const handleToggleActive = async (page: LandingPage) => {
    try {
      await api.put(`/landing-pages/${page.id}`, { is_active: !page.is_active });
      fetchPages();
    } catch { toast.error('Erro na operação'); }
  };

  const toggleSection = (sectionId: string) => {
    setConfig(prev => ({
      ...prev,
      sections: prev.sections.map(s =>
        s.id === sectionId && !s.locked ? { ...s, enabled: !s.enabled } : s
      ),
    }));
  };

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const newSections = [...config.sections];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSections.length) return;
    if (newSections[index].id === 'hero' || newSections[targetIndex].id === 'hero') return;
    if (newSections[index].id === 'cta_final' || newSections[targetIndex].id === 'cta_final') return;
    [newSections[index], newSections[targetIndex]] = [newSections[targetIndex], newSections[index]];
    setConfig(prev => ({ ...prev, sections: newSections }));
  };

  const updateSectionData = (sectionId: string, newData: any) => {
    setConfig(prev => ({
      ...prev,
      sections: prev.sections.map(s =>
        s.id === sectionId ? { ...s, data: { ...s.data, ...newData } } : s
      ),
    }));
  };

  // ═══════════════════════════════════════════
  // RENDER: LISTA
  // ═══════════════════════════════════════════

  if (editorMode === 'list') {
    return (
      <AppShell>
        <div className="p-6 max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Landing Pages</h1>
              <p className="text-sm text-gray-500 mt-1">Crie páginas de captura para seus programas e campanhas</p>
            </div>
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 transition-all text-sm font-medium">
              <Plus className="w-4 h-4" />
              Nova Landing Page
            </button>
          </div>

          {loading && (
            <div className="flex justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}

          {!loading && pages.length === 0 && (
            <div className="text-center py-20">
              <FileText className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Nenhuma landing page criada</p>
              <p className="text-sm text-gray-400 mt-1">Clique em &quot;Nova Landing Page&quot; para começar</p>
            </div>
          )}

          {!loading && pages.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pages.map(page => (
                <div key={page.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{page.title}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">/lp/{page.slug}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${page.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                      {page.is_active ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 pt-3 border-t border-gray-50">
                    <button onClick={() => openEdit(page)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5 rounded-lg transition-all">
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button onClick={() => window.open(`/lp/${page.slug}`, '_blank')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-all">
                      <ExternalLink className="w-3.5 h-3.5" /> Ver
                    </button>
                    <button onClick={() => window.location.href = `/landing-pages/${page.id}/leads`} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all">
                      <Users className="w-3.5 h-3.5" /> Leads
                    </button>
                    <button onClick={() => handleToggleActive(page)} className="flex items-center px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-lg transition-all ml-auto">
                      {page.is_active ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleDelete(page.id)} className="flex items-center px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <ConfirmModal open={confirmModal.open} title={confirmModal.title} message={confirmModal.message} confirmLabel="Remover" onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(prev => ({ ...prev, open: false }))} />
      </AppShell>
    );
  }

  // ═══════════════════════════════════════════
  // RENDER: EDITOR
  // ═══════════════════════════════════════════

  return (
    <AppShell>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Montserrat:wght@400;700;900&family=Poppins:wght@400;600;700&family=Raleway:wght@400;600;700&family=Lora:wght@400;700&family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=Bitter:wght@400;700&family=Space+Grotesk:wght@400;600;700&family=Merriweather:wght@400;700;900&display=swap" rel="stylesheet" />
      <div className="h-[calc(100vh-64px)] flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-3">
            <button onClick={() => setEditorMode('list')} className="p-2 hover:bg-gray-100 rounded-lg transition-all">
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </button>
            <div>
              <input value={title} onChange={(e) => { setTitle(e.target.value); if (!editingPage) setSlug(generateSlug(e.target.value)); }} placeholder="Nome da Landing Page" className="text-lg font-bold text-gray-900 border-none outline-none bg-transparent placeholder:text-gray-300 w-full" />
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-xs text-gray-400">/lp/</span>
                <input value={slug} onChange={(e) => setSlug(generateSlug(e.target.value))} placeholder="slug-da-pagina" className="text-xs text-gray-500 border-none outline-none bg-transparent placeholder:text-gray-300" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select value={channelId} onChange={(e) => setChannelId(Number(e.target.value))} className="text-xs px-3 py-2 border border-gray-200 rounded-lg outline-none">
              {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {editingPage && (
              <button onClick={() => window.open(`/lp/${slug}`, '_blank')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200 transition-all">
                <Eye className="w-3.5 h-3.5" /> Preview
              </button>
            )}
            <button onClick={handleSave} disabled={saving || !title || !slug || !channelId} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all text-xs font-medium disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-gray-100 bg-gray-50/50">
          {([
            { id: 'sections' as const, label: 'Seções', icon: List },
            { id: 'form' as const, label: 'Formulário', icon: FormInput },
            { id: 'visual' as const, label: 'Visual', icon: Palette },
            { id: 'crm' as const, label: 'CRM', icon: Tags },
          ]).map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all ${activeTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <Icon className="w-3.5 h-3.5" /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">

            {/* TAB: SEÇÕES */}
            {activeTab === 'sections' && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 mb-4">Ative/desative e reordene as seções. Clique para expandir e editar o conteúdo.</p>
                {config.sections.map((section, index) => {
                  const IconComp = iconComponents[section.icon] || FileText;
                  const isExpanded = expandedSection === section.id;
                  return (
                    <div key={section.id} className={`border rounded-xl transition-all ${section.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50/50 opacity-60'}`}>
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => moveSection(index, 'up')} disabled={index === 0 || section.id === 'hero'} className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-0 transition-all">
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button onClick={() => moveSection(index, 'down')} disabled={index === config.sections.length - 1 || section.id === 'cta_final'} className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-0 transition-all">
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                        <button onClick={() => setExpandedSection(isExpanded ? null : section.id)} className="flex items-center gap-3 flex-1 text-left">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${section.enabled ? 'bg-primary/10' : 'bg-gray-100'}`}>
                            <IconComp className={`w-4 h-4 ${section.enabled ? 'text-primary' : 'text-gray-400'}`} />
                          </div>
                          <span className={`text-sm font-medium ${section.enabled ? 'text-gray-800' : 'text-gray-400'}`}>{section.label}</span>
                          {section.locked && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">fixo</span>}
                        </button>
                        <div className="flex items-center gap-2">
                          {!section.locked && (
                            <button onClick={() => toggleSection(section.id)} className="transition-all">
                              {section.enabled ? <ToggleRight className="w-6 h-6 text-primary" /> : <ToggleLeft className="w-6 h-6 text-gray-300" />}
                            </button>
                          )}
                          <button onClick={() => setExpandedSection(isExpanded ? null : section.id)} className="p-1 text-gray-400 hover:text-gray-600 transition-all">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                          <SectionEditor section={section} onUpdate={(data) => updateSectionData(section.id, data)} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB: FORMULÁRIO */}
            {activeTab === 'form' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-400 mb-4">Escolha quais campos aparecerão no formulário de captura.</p>
                {config.formFields.map((field) => (
                  <div key={field.id} className={`flex items-center gap-4 p-4 border rounded-xl transition-all ${field.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50/50 opacity-60'}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{field.label}</span>
                        {field.required && <span className="text-[10px] font-bold text-red-400 bg-red-50 px-1.5 py-0.5 rounded">obrigatório</span>}
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{field.type}</span>
                      </div>
                    </div>
                    {!field.required ? (
                      <button onClick={() => setConfig(prev => ({ ...prev, formFields: prev.formFields.map(f => f.id === field.id ? { ...f, enabled: !f.enabled } : f) }))}>
                        {field.enabled ? <ToggleRight className="w-6 h-6 text-primary" /> : <ToggleLeft className="w-6 h-6 text-gray-300" />}
                      </button>
                    ) : (
                      <span className="text-[10px] text-gray-300">sempre ativo</span>
                    )}
                  </div>
                ))}
                {config.formFields.filter(f => f.type === 'select' && f.enabled).map(field => (
                  <div key={`opts-${field.id}`} className="p-4 border border-dashed border-gray-200 rounded-xl mt-2">
                    <p className="text-xs font-medium text-gray-600 mb-2">Opções para &quot;{field.label}&quot;</p>
                    <div className="space-y-2">
                      {(field.options || []).map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input value={opt} onChange={(e) => { const newOpts = [...(field.options || [])]; newOpts[i] = e.target.value; setConfig(prev => ({ ...prev, formFields: prev.formFields.map(f => f.id === field.id ? { ...f, options: newOpts } : f) })); }} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary" />
                          <button onClick={() => { const newOpts = (field.options || []).filter((_, idx) => idx !== i); setConfig(prev => ({ ...prev, formFields: prev.formFields.map(f => f.id === field.id ? { ...f, options: newOpts } : f) })); }} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => setConfig(prev => ({ ...prev, formFields: prev.formFields.map(f => f.id === field.id ? { ...f, options: [...(f.options || []), ''] } : f) }))} className="text-xs text-primary font-medium hover:underline">
                        + Adicionar opção
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB: CRM */}
            {activeTab === 'crm' && (
              <div className="space-y-5">
                <p className="text-xs text-gray-400 mb-4">Configure a automação de CRM ao receber um lead por esta landing page.</p>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Tag aplicada ao lead</label>
                  <input
                    value={lpTag}
                    onChange={(e) => setLpTag(e.target.value)}
                    placeholder="Ex: lp-gv-sports"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary"
                  />
                  <p className="text-xs text-gray-400 mt-1">Tag criada automaticamente se não existir.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Mover lead para estágio</label>
                  <select
                    value={pipelineStage}
                    onChange={(e) => setPipelineStage(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary bg-white"
                  >
                    <option value="">Padrão (novo)</option>
                    {kanbanColumns.map(col => (
                      <option key={col.key} value={col.key}>{col.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Mensagem WhatsApp ao lead</label>
                  <textarea
                    value={whatsappMessage}
                    onChange={(e) => setWhatsappMessage(e.target.value)}
                    placeholder="Ex: Olá {nome}, recebemos sua inscrição! Em breve entraremos em contato 🎯"
                    rows={4}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">Use <strong>{'{nome}'}</strong> para personalizar com o nome do lead.</p>
                </div>
              </div>
            )}

            {/* TAB: VISUAL */}
            {activeTab === 'visual' && (
              <div className="space-y-5">
                <p className="text-xs text-gray-400 mb-4">Configure as cores e imagens da sua landing page.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Cor Principal</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={config.primaryColor} onChange={(e) => setConfig(prev => ({ ...prev, primaryColor: e.target.value }))} className="w-10 h-10 rounded-lg border border-gray-200 serviçor-pointer" />
                      <input value={config.primaryColor} onChange={(e) => setConfig(prev => ({ ...prev, primaryColor: e.target.value }))} className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Cor Secundária</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={config.secondaryColor} onChange={(e) => setConfig(prev => ({ ...prev, secondaryColor: e.target.value }))} className="w-10 h-10 rounded-lg border border-gray-200 serviçor-pointer" />
                      <input value={config.secondaryColor} onChange={(e) => setConfig(prev => ({ ...prev, secondaryColor: e.target.value }))} className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Logo</label>
                  <ImageUploader
                    value={config.logoUrl}
                    onChange={(url) => setConfig(prev => ({ ...prev, logoUrl: url }))}
                    label="Arraste ou clique para subir o logo"
                    hint="Recomendado: 500 x 500px · PNG com fundo transparente"
                    previewHeight="h-16"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Imagem de fundo do Hero</label>
                  <ImageUploader
                    value={config.heroImageUrl}
                    onChange={(url) => setConfig(prev => ({ ...prev, heroImageUrl: url }))}
                    label="Arraste ou clique para subir a imagem do Hero"
                    hint="Recomendado: 1920 x 1080px · JPG ou PNG"
                    previewHeight="h-40"
                    previewFit="cover"
                  />
                </div>

                <hr className="border-gray-100" />
                <p className="text-sm font-semibold text-gray-700">Tipografia</p>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Fonte dos Títulos</label>
                  <div className="grid grid-cols-2 gap-2">
                    {fontOptions.filter(f => ['Playfair Display', 'Montserrat', 'Bebas Neue', 'Lora', 'Raleway', 'Bitter', 'Poppins', 'Space Grotesk', 'Merriweather'].includes(f.id)).map(f => (
                      <button
                        key={f.id}
                        onClick={() => setConfig(prev => ({ ...prev, headingFont: f.id }))}
                        className={`p-3 rounded-xl border text-left transition-all ${config.headingFont === f.id ? 'border-primary bg-primary/5 ring-2 ring-[#1D4ED8]/20' : 'border-gray-200 hover:border-gray-300'}`}
                      >
                        <p className="text-base font-bold text-gray-800" style={{ fontFamily: `'${f.id}', ${f.type}` }}>{f.label}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{f.preview}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Fonte do Corpo</label>
                  <div className="grid grid-cols-2 gap-2">
                    {fontOptions.filter(f => ['Inter', 'DM Sans', 'Poppins', 'Raleway', 'Montserrat', 'Space Grotesk'].includes(f.id)).concat([{ id: 'Inter', label: 'Inter', type: 'sans-serif', preview: 'Padrão e profissional' }]).filter((f, i, arr) => arr.findIndex(x => x.id === f.id) === i).map(f => (
                      <button
                        key={f.id}
                        onClick={() => setConfig(prev => ({ ...prev, bodyFont: f.id }))}
                        className={`p-3 rounded-xl border text-left transition-all ${config.bodyFont === f.id ? 'border-primary bg-primary/5 ring-2 ring-[#1D4ED8]/20' : 'border-gray-200 hover:border-gray-300'}`}
                      >
                        <p className="text-sm font-medium text-gray-800" style={{ fontFamily: `'${f.id}', ${f.type}` }}>{f.label}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{f.preview}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
      <ConfirmModal open={confirmModal.open} title={confirmModal.title} message={confirmModal.message} confirmLabel="Remover" onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(prev => ({ ...prev, open: false }))} />
    </AppShell>
  );
}

// ═══════════════════════════════════════════
// EDITOR DE SEÇÃO
// ═══════════════════════════════════════════

function SectionEditor({ section, onUpdate }: { section: Section; onUpdate: (data: any) => void }) {
  const d = section.data;

  switch (section.id) {
    case 'hero':
      return (
        <div className="space-y-3">
          <InputField label="Título principal" value={d.title} onChange={(v) => onUpdate({ title: v })} placeholder="Ex: Forme o craque do futuro" />
          <TextareaField label="Subtítulo" value={d.subtitle} onChange={(v) => onUpdate({ subtitle: v })} placeholder="Ex: Programa completo para crianças de 5 a 15 anos" />
          <InputField label="Texto do botão" value={d.ctaText} onChange={(v) => onUpdate({ ctaText: v })} placeholder="Ex: Quero uma vaga" />
        </div>
      );

    case 'stats':
      return (
        <div className="space-y-3">
          {d.items.map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <input value={item.value} onChange={(e) => { const items = [...d.items]; items[i] = { ...items[i], value: e.target.value }; onUpdate({ items }); }} placeholder="500" className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary text-center" />
              <input value={item.suffix} onChange={(e) => { const items = [...d.items]; items[i] = { ...items[i], suffix: e.target.value }; onUpdate({ items }); }} placeholder="+" className="w-12 px-2 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary text-center" />
              <input value={item.label} onChange={(e) => { const items = [...d.items]; items[i] = { ...items[i], label: e.target.value }; onUpdate({ items }); }} placeholder="Clientes ativos" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary" />
              {d.items.length > 1 && (
                <button onClick={() => onUpdate({ items: d.items.filter((_: any, idx: number) => idx !== i) })} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ))}
          {d.items.length < 6 && (
            <button onClick={() => onUpdate({ items: [...d.items, { value: '', suffix: '+', label: '' }] })} className="text-xs text-primary font-medium hover:underline">+ Adicionar stat</button>
          )}
        </div>
      );

    case 'about':
      return (
        <div className="space-y-3">
          <InputField label="Título da seção" value={d.sectionTitle} onChange={(v) => onUpdate({ sectionTitle: v })} placeholder="Sobre o Programa" />
          <TextareaField label="Descrição" value={d.description} onChange={(v) => onUpdate({ description: v })} placeholder="Descreva seu programa, serviço ou serviço..." rows={4} />
          <p className="text-xs font-medium text-gray-500 mt-2">Destaques</p>
          {d.highlights.map((h: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <input value={h.label} onChange={(e) => { const hl = [...d.highlights]; hl[i] = { ...hl[i], label: e.target.value }; onUpdate({ highlights: hl }); }} placeholder="Label (ex: Duração)" className="w-36 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary" />
              <input value={h.value} onChange={(e) => { const hl = [...d.highlights]; hl[i] = { ...hl[i], value: e.target.value }; onUpdate({ highlights: hl }); }} placeholder="Valor (ex: 12 meses)" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary" />
              {d.highlights.length > 1 && (
                <button onClick={() => onUpdate({ highlights: d.highlights.filter((_: any, idx: number) => idx !== i) })} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ))}
          {d.highlights.length < 5 && (
            <button onClick={() => onUpdate({ highlights: [...d.highlights, { label: '', value: '' }] })} className="text-xs text-primary font-medium hover:underline">+ Adicionar destaque</button>
          )}
        </div>
      );

    case 'topics':
      return (
        <div className="space-y-3">
          <InputField label="Título da seção" value={d.sectionTitle} onChange={(v) => onUpdate({ sectionTitle: v })} placeholder="O que você vai aprender" />
          {d.items.map((item: string, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <input value={item} onChange={(e) => { const items = [...d.items]; items[i] = e.target.value; onUpdate({ items }); }} placeholder={`Tópico ${i + 1}`} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary" />
              {d.items.length > 1 && (
                <button onClick={() => onUpdate({ items: d.items.filter((_: any, idx: number) => idx !== i) })} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ))}
          <button onClick={() => onUpdate({ items: [...d.items, ''] })} className="text-xs text-primary font-medium hover:underline">+ Adicionar tópico</button>
        </div>
      );

    case 'audience':
      return (
        <div className="space-y-3">
          <InputField label="Título da seção" value={d.sectionTitle} onChange={(v) => onUpdate({ sectionTitle: v })} placeholder="Para quem é" />
          {d.items.map((item: string, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <input value={item} onChange={(e) => { const items = [...d.items]; items[i] = e.target.value; onUpdate({ items }); }} placeholder={`Perfil ${i + 1}`} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary" />
              {d.items.length > 1 && (
                <button onClick={() => onUpdate({ items: d.items.filter((_: any, idx: number) => idx !== i) })} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ))}
          <button onClick={() => onUpdate({ items: [...d.items, ''] })} className="text-xs text-primary font-medium hover:underline">+ Adicionar perfil</button>
        </div>
      );

    case 'differentials':
      return (
        <div className="space-y-3">
          <InputField label="Título da seção" value={d.sectionTitle} onChange={(v) => onUpdate({ sectionTitle: v })} placeholder="Por que nos escolher" />
          {d.items.map((item: any, i: number) => (
            <div key={i} className="p-3 border border-gray-100 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <select value={item.icon} onChange={(e) => { const items = [...d.items]; items[i] = { ...items[i], icon: e.target.value }; onUpdate({ items }); }} className="w-28 px-2 py-2 border border-gray-200 rounded-lg text-xs outline-none">
                  {['award', 'users', 'book', 'zap', 'target', 'clock', 'star', 'trending'].map(ic => <option key={ic} value={ic}>{ic}</option>)}
                </select>
                <input value={item.title} onChange={(e) => { const items = [...d.items]; items[i] = { ...items[i], title: e.target.value }; onUpdate({ items }); }} placeholder="Título do diferencial" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary" />
                {d.items.length > 1 && (
                  <button onClick={() => onUpdate({ items: d.items.filter((_: any, idx: number) => idx !== i) })} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                )}
              </div>
              <input value={item.desc} onChange={(e) => { const items = [...d.items]; items[i] = { ...items[i], desc: e.target.value }; onUpdate({ items }); }} placeholder="Descrição breve" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary" />
            </div>
          ))}
          {d.items.length < 9 && (
            <button onClick={() => onUpdate({ items: [...d.items, { icon: 'star', title: '', desc: '' }] })} className="text-xs text-primary font-medium hover:underline">+ Adicionar diferencial</button>
          )}
        </div>
      );

    case 'testimonials':
      return (
        <div className="space-y-3">
          <InputField label="Título da seção" value={d.sectionTitle} onChange={(v) => onUpdate({ sectionTitle: v })} placeholder="O que dizem sobre nós" />
          {d.items.map((item: any, i: number) => (
            <div key={i} className="p-3 border border-gray-100 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <input value={item.name} onChange={(e) => { const items = [...d.items]; items[i] = { ...items[i], name: e.target.value }; onUpdate({ items }); }} placeholder="Nome" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary" />
                <input value={item.role} onChange={(e) => { const items = [...d.items]; items[i] = { ...items[i], role: e.target.value }; onUpdate({ items }); }} placeholder="Cargo / Contexto" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary" />
                {d.items.length > 1 && (
                  <button onClick={() => onUpdate({ items: d.items.filter((_: any, idx: number) => idx !== i) })} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                )}
              </div>
              <textarea value={item.text} onChange={(e) => { const items = [...d.items]; items[i] = { ...items[i], text: e.target.value }; onUpdate({ items }); }} placeholder="Depoimento" rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary resize-none" />
            </div>
          ))}
          {d.items.length < 6 && (
            <button onClick={() => onUpdate({ items: [...d.items, { name: '', role: '', text: '' }] })} className="text-xs text-primary font-medium hover:underline">+ Adicionar depoimento</button>
          )}
        </div>
      );

    case 'faq':
      return (
        <div className="space-y-3">
          <InputField label="Título da seção" value={d.sectionTitle} onChange={(v) => onUpdate({ sectionTitle: v })} placeholder="Dúvidas Frequentes" />
          {d.items.map((item: any, i: number) => (
            <div key={i} className="p-3 border border-gray-100 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <input value={item.q} onChange={(e) => { const items = [...d.items]; items[i] = { ...items[i], q: e.target.value }; onUpdate({ items }); }} placeholder="Pergunta" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary" />
                {d.items.length > 1 && (
                  <button onClick={() => onUpdate({ items: d.items.filter((_: any, idx: number) => idx !== i) })} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                )}
              </div>
              <textarea value={item.a} onChange={(e) => { const items = [...d.items]; items[i] = { ...items[i], a: e.target.value }; onUpdate({ items }); }} placeholder="Resposta" rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary resize-none" />
            </div>
          ))}
          {d.items.length < 10 && (
            <button onClick={() => onUpdate({ items: [...d.items, { q: '', a: '' }] })} className="text-xs text-primary font-medium hover:underline">+ Adicionar pergunta</button>
          )}
        </div>
      );

    case 'cta_final':
      return (
        <div className="space-y-3">
          <InputField label="Título" value={d.title} onChange={(v) => onUpdate({ title: v })} placeholder="Não perca essa oportunidade" />
          <TextareaField label="Subtítulo" value={d.subtitle} onChange={(v) => onUpdate({ subtitle: v })} placeholder="As vagas são limitadas..." />
        </div>
      );

    case 'video':
      return (
        <div className="space-y-3">
          <InputField label="Título da seção" value={d.sectionTitle} onChange={(v) => onUpdate({ sectionTitle: v })} placeholder="Conheça mais" />
          <InputField label="URL do YouTube" value={d.youtubeUrl} onChange={(v) => onUpdate({ youtubeUrl: v })} placeholder="https://www.youtube.com/watch?v=..." />
          {d.youtubeUrl && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-400 mb-2">Preview:</p>
              <div className="aspect-video rounded-lg overflow-hidden bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${d.youtubeUrl.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1] || ''}`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                  allowFullScreen
                />
              </div>
            </div>
          )}
        </div>
      );

    default:
      return <p className="text-xs text-gray-400">Editor não disponível.</p>;
  }
}

// ═══════════════════════════════════════════
// COMPONENTES AUXILIARES
// ═══════════════════════════════════════════

function InputField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary transition-all" />
    </div>
  );
}

function TextareaField({ label, value, onChange, placeholder, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary resize-none transition-all" />
    </div>
  );
}

function ImageUploader({ value, onChange, label, hint, previewHeight = 'h-16', previewFit = 'contain' }: {
  value: string; onChange: (url: string) => void; label: string; hint?: string; previewHeight?: string; previewFit?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      toast.error('Formato não suportado. Use JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem muito grande. Máximo 5MB.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/landing-pages/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(res.data.url);
      toast.success('Imagem enviada!');
    } catch {
      toast.error('Erro ao enviar imagem');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  if (value) {
    return (
      <div className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
        <div className={`${previewHeight} w-full flex items-center justify-center p-3`}>
          <img src={value} alt="Preview" className={`max-h-full max-w-full ${previewFit === 'cover' ? 'w-full h-full object-cover' : 'object-contain'}`} />
        </div>
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-3">
          <button
            onClick={() => inputRef.current?.click()}
            className="px-3 py-1.5 bg-white text-gray-800 rounded-lg text-xs font-medium hover:bg-gray-100 transition-all"
          >
            Trocar
          </button>
          <button
            onClick={() => onChange('')}
            className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 transition-all"
          >
            Remover
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-6 text-center serviçor-pointer transition-all ${
        dragOver ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-xs text-gray-500">Enviando...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <Upload className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-[10px] text-gray-400">{hint || 'JPG, PNG ou WEBP · Máx 5MB'}</p>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
    </div>
  );
}