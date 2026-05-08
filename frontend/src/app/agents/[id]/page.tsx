'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ChevronLeft, Save, Trash2, Loader2, Upload, FileText,
  Radio, Unplug, Settings, Workflow, Plus, X,
} from 'lucide-react';
import AppShell from '@/components/app-shell';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import { fetchAvailableTools } from '@/lib/workflow-tools-api';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getAgentIcon } from '@/lib/agent-icons';
import { IconPicker } from '@/components/agents/icon-picker';

interface Agent {
  id: number;
  name: string;
  icon: string;
  channel_id: number | null;
  channel_name: string | null;
  is_enabled: boolean;
  system_prompt: string | null;
  model: string;
  temperature: string;
  max_tokens: number;
  knowledge_docs_count: number;
  // F2.C — biblioteca de Workflow
  tools: string[] | null;
  outcomes: string[] | null;
  is_workflow_capable: boolean;
}

interface ToolDescriptor {
  name: string;
  description: string;
  is_action: boolean;
}

interface KnowledgeDoc {
  title: string;
  chunks: number;
  total_tokens: number;
  created_at: string | null;
}

interface ChannelOption {
  id: number;
  name: string;
}

const MODELS = [
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5', label: 'GPT-5' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
];

function AgentDetailContent() {
  const router = useRouter();
  const params = useParams();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Form state (general tab)
  const [form, setForm] = useState({
    name: '',
    icon: 'Bot',
    system_prompt: '',
    model: 'gpt-5-mini',
    temperature: '0.7',
    max_tokens: 500,
    is_enabled: true,
  });
  const initialForm = useRef(form);

  // Knowledge state
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Channel state
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [attachingChannel, setAttachingChannel] = useState(false);

  // Delete agent state
  const [showDeleteAgent, setShowDeleteAgent] = useState(false);

  const fetchAgent = useCallback(async () => {
    try {
      const res = await api.get(`/agents/${agentId}`);
      setAgent(res.data);
      const f = {
        name: res.data.name,
        icon: res.data.icon || 'Bot',
        system_prompt: res.data.system_prompt || '',
        model: res.data.model,
        temperature: res.data.temperature,
        max_tokens: res.data.max_tokens,
        is_enabled: res.data.is_enabled,
      };
      setForm(f);
      initialForm.current = f;
    } catch {
      toast.error('Agente nao encontrado');
      router.push('/agents');
    }
  }, [agentId, router]);

  const fetchKnowledge = useCallback(async () => {
    try {
      const res = await api.get(`/agents/${agentId}/knowledge`);
      setDocuments(res.data);
    } catch {
      // silent
    }
  }, [agentId]);

  const fetchChannels = useCallback(async () => {
    try {
      const [chRes, agRes] = await Promise.all([
        api.get('/channels'),
        api.get('/agents'),
      ]);
      setChannels(chRes.data.map((c: any) => ({ id: c.id, name: c.name })));
      setAllAgents(agRes.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchAgent(), fetchKnowledge(), fetchChannels()])
      .finally(() => setLoading(false));
  }, [fetchAgent, fetchKnowledge, fetchChannels]);

  const hasChanges = JSON.stringify(form) !== JSON.stringify(initialForm.current);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Nome do agente obrigatorio');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/agents/${agentId}`, {
        name: form.name.trim(),
        icon: form.icon,
        system_prompt: form.system_prompt || null,
        model: form.model,
        temperature: form.temperature,
        max_tokens: form.max_tokens,
        is_enabled: form.is_enabled,
      });
      toast.success('Agente salvo');
      initialForm.current = { ...form };
      await fetchAgent();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm(initialForm.current);
  };

  const handleDeleteAgent = async () => {
    try {
      await api.delete(`/agents/${agentId}`);
      toast.success('Agente excluido');
      router.push('/agents');
    } catch {
      toast.error('Erro ao excluir agente');
    }
  };

  // Knowledge
  const handleUpload = async () => {
    if (!uploadFile || !uploadTitle.trim()) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('title', uploadTitle.trim());
      formData.append('file', uploadFile);
      await api.post(`/agents/${agentId}/knowledge`, formData);
      toast.success('Documento enviado');
      setUploadTitle('');
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchKnowledge();
      await fetchAgent();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erro ao enviar documento');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (title: string) => {
    try {
      await api.delete(`/agents/${agentId}/knowledge/${encodeURIComponent(title)}`);
      toast.success('Documento excluido');
      setDeletingDoc(null);
      await fetchKnowledge();
      await fetchAgent();
    } catch {
      toast.error('Erro ao excluir documento');
    }
  };

  // Channel
  const freeChannels = channels.filter((ch) => {
    const taken = allAgents.find((a) => a.channel_id === ch.id);
    return !taken || taken.id === agent?.id;
  });

  const handleAttachChannel = async () => {
    if (!selectedChannel) return;
    setAttachingChannel(true);
    try {
      await api.put(`/agents/${agentId}`, { channel_id: Number(selectedChannel) });
      toast.success('Canal associado');
      setSelectedChannel('');
      await fetchAgent();
      await fetchChannels();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erro ao associar canal');
    } finally {
      setAttachingChannel(false);
    }
  };

  const handleDetachChannel = async () => {
    setAttachingChannel(true);
    try {
      await api.put(`/agents/${agentId}`, { channel_id: null });
      toast.success('Canal desconectado');
      await fetchAgent();
      await fetchChannels();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erro ao desconectar canal');
    } finally {
      setAttachingChannel(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <Skeleton className="h-5 w-40" />
        <div className="flex items-center gap-4">
          <Skeleton className="w-14 h-14 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  if (!agent) return null;

  const AgentIcon = getAgentIcon(form.icon);

  return (
    <div className="max-w-5xl mx-auto pb-8 space-y-6">
      {/* Breadcrumb */}
      <button
        onClick={() => router.push('/agents')}
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Voltar para agentes
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
            <AgentIcon className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{agent.name}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <span>{agent.model}</span>
              <span className="text-muted-foreground/40">|</span>
              <span>{agent.channel_name || 'Sem canal'}</span>
              <span className="text-muted-foreground/40">|</span>
              <span className={agent.is_enabled ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                {agent.is_enabled ? 'Ativo' : 'Inativo'}
              </span>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setShowDeleteAgent(true)}>
          <Trash2 className="w-4 h-4 mr-2" />
          Excluir
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="general">
            <Settings className="w-4 h-4 mr-2" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            <FileText className="w-4 h-4 mr-2" />
            Base de Conhecimento
            {agent.knowledge_docs_count > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
                {agent.knowledge_docs_count}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="channel">
            <Radio className="w-4 h-4 mr-2" />
            Canal
          </TabsTrigger>
          <TabsTrigger value="workflow">
            <Workflow className="w-4 h-4 mr-2" />
            Workflow
            {agent.is_workflow_capable && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-mono">
                {(agent.tools || []).length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ====== GENERAL TAB ====== */}
        <TabsContent value="general" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuracoes do agente</CardTitle>
              <CardDescription>Personalize o comportamento e o modelo utilizado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Name + Icon */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-4">
                <div className="space-y-2">
                  <Label htmlFor="agent-name">Nome do agente</Label>
                  <Input
                    id="agent-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Icone</Label>
                  <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
                </div>
              </div>

              {/* System Prompt */}
              <div className="space-y-2">
                <Label htmlFor="agent-prompt">Prompt do sistema</Label>
                <Textarea
                  id="agent-prompt"
                  rows={8}
                  value={form.system_prompt}
                  onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                  className="font-mono text-sm resize-y"
                  placeholder="Instrucoes de comportamento, tom de voz e persona do agente..."
                />
                <p className="text-xs text-muted-foreground">
                  Instrucoes de comportamento, tom de voz e persona do agente.
                </p>
              </div>

              {/* Model / Temperature / Max Tokens */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODELS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-temp">Temperatura</Label>
                  <Input
                    id="agent-temp"
                    value={form.temperature}
                    onChange={(e) => setForm({ ...form, temperature: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-tokens">Max Tokens</Label>
                  <Input
                    id="agent-tokens"
                    type="number"
                    min={100}
                    max={8000}
                    value={form.max_tokens}
                    onChange={(e) => setForm({ ...form, max_tokens: Number(e.target.value) })}
                  />
                </div>
              </div>

              {/* Status toggle */}
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                <div>
                  <p className="font-medium text-sm">Agente ativo</p>
                  <p className="text-xs text-muted-foreground">Quando desativado, o agente nao responde mensagens.</p>
                </div>
                <Switch
                  checked={form.is_enabled}
                  onCheckedChange={(checked) => setForm({ ...form, is_enabled: checked })}
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={handleReset} disabled={!hasChanges}>
                  Descartar
                </Button>
                <Button onClick={handleSave} disabled={!hasChanges || saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Salvar alteracoes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== KNOWLEDGE TAB ====== */}
        <TabsContent value="knowledge" className="mt-6 space-y-4">
          {/* Upload */}
          <Card>
            <CardHeader>
              <CardTitle>Adicionar documento</CardTitle>
              <CardDescription>
                Envie arquivos de texto que o agente vai usar como contexto ao responder.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="upload-title">Titulo do documento</Label>
                  <Input
                    id="upload-title"
                    placeholder="Ex: Politica de trocas"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.csv"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="flex-1"
                  />
                  <Button onClick={handleUpload} disabled={!uploadFile || !uploadTitle.trim() || uploading}>
                    {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    Enviar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Formatos aceitos: .txt, .md, .csv
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Documents list */}
          <Card>
            <CardHeader>
              <CardTitle>Documentos indexados</CardTitle>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum documento enviado ainda.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Envie documentos acima para o agente usar como base de conhecimento.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {documents.map((doc) => (
                    <div key={doc.title} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{doc.title}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {doc.chunks} chunks &middot; {(doc.total_tokens || 0).toLocaleString()} tokens
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                        onClick={() => setDeletingDoc(doc.title)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== CHANNEL TAB ====== */}
        <TabsContent value="channel" className="mt-6">
          {agent.channel_id ? (
            <Card>
              <CardHeader>
                <CardTitle>Canal conectado</CardTitle>
                <CardDescription>
                  Este agente esta associado ao canal abaixo e responde mensagens nele.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Radio className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-medium text-sm">{agent.channel_name}</p>
                      <p className="text-xs text-muted-foreground">Canal ativo e conectado.</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDetachChannel}
                    disabled={attachingChannel}
                  >
                    {attachingChannel && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Desconectar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Conectar a um canal</CardTitle>
                <CardDescription>
                  Associe este agente a um canal para comecar a responder mensagens automaticamente.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {freeChannels.length === 0 ? (
                  <div className="text-center py-8">
                    <Unplug className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Nenhum canal disponivel. Todos ja estao associados a outros agentes.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-2">
                      <Label>Canal disponivel</Label>
                      <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                        <SelectTrigger><SelectValue placeholder="Selecione um canal..." /></SelectTrigger>
                        <SelectContent>
                          {freeChannels.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleAttachChannel} disabled={!selectedChannel || attachingChannel}>
                      {attachingChannel && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Associar canal
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ====== WORKFLOW TAB (F2.C) ====== */}
        <TabsContent value="workflow" className="mt-6">
          <WorkflowAgentTab agent={agent} onSaved={fetchAgent} />
        </TabsContent>
      </Tabs>

      {/* Delete Agent Dialog */}
      <AlertDialog open={showDeleteAgent} onOpenChange={setShowDeleteAgent}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao remove o agente e todos os documentos de knowledge associados. Nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAgent} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Knowledge Doc Dialog */}
      <AlertDialog open={deletingDoc !== null} onOpenChange={(open) => !open && setDeletingDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>
              O documento &ldquo;{deletingDoc}&rdquo; e todos os seus chunks serao removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingDoc && handleDeleteDoc(deletingDoc)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// F2.C — Aba Workflow do detalhe do agente
// ============================================================
function WorkflowAgentTab({
  agent,
  onSaved,
}: {
  agent: Agent;
  onSaved: () => Promise<void> | void;
}) {
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [loadingTools, setLoadingTools] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estado local editável (espelha agent.tools / agent.outcomes)
  const [enabled, setEnabled] = useState<boolean>(agent.is_workflow_capable);
  const [selectedTools, setSelectedTools] = useState<string[]>(agent.tools || []);
  const [outcomes, setOutcomes] = useState<string[]>(
    agent.outcomes && agent.outcomes.length > 0 ? agent.outcomes : ['ok', 'fail']
  );
  const [newOutcome, setNewOutcome] = useState('');
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  // Carrega tools disponíveis
  useEffect(() => {
    let cancelled = false;
    fetchAvailableTools()
      .then((t) => { if (!cancelled) setTools(t); })
      .catch(() => { if (!cancelled) setTools([]); })
      .finally(() => { if (!cancelled) setLoadingTools(false); });
    return () => { cancelled = true; };
  }, []);

  // Sincroniza com agent quando muda externamente
  useEffect(() => {
    setEnabled(agent.is_workflow_capable);
    setSelectedTools(agent.tools || []);
    setOutcomes(
      agent.outcomes && agent.outcomes.length > 0 ? agent.outcomes : ['ok', 'fail']
    );
  }, [agent.id, agent.is_workflow_capable, agent.tools, agent.outcomes]);

  const toggleTool = (name: string) => {
    setSelectedTools((cur) =>
      cur.includes(name) ? cur.filter((t) => t !== name) : [...cur, name]
    );
  };

  const addOutcome = () => {
    const v = newOutcome.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!v) return;
    if (outcomes.includes(v)) return;
    setOutcomes([...outcomes, v]);
    setNewOutcome('');
  };

  const removeOutcome = (idx: number) => {
    if (outcomes.length <= 1) return;
    setOutcomes(outcomes.filter((_, i) => i !== idx));
  };

  const enableWorkflow = async () => {
    setSaving(true);
    try {
      await api.put(`/agents/${agent.id}`, {
        tools: [],
        outcomes: ['ok', 'fail'],
      });
      await onSaved();
      toast.success('Agente habilitado pro Workflow');
    } catch {
      toast.error('Falha ao habilitar');
    } finally {
      setSaving(false);
    }
  };

  const saveConfig = async () => {
    if (outcomes.length === 0) {
      toast.error('Configure pelo menos 1 outcome');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/agents/${agent.id}`, {
        tools: selectedTools,
        outcomes: outcomes,
      });
      await onSaved();
      toast.success('Configuração de Workflow salva');
    } catch {
      toast.error('Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const disableWorkflow = async () => {
    setSaving(true);
    try {
      await api.put(`/agents/${agent.id}`, {
        tools: ['__clear__'],
        outcomes: ['__clear__'],
      });
      await onSaved();
      setShowDisableConfirm(false);
      toast.success('Agente removido da biblioteca de Workflow');
    } catch {
      toast.error('Falha ao remover');
    } finally {
      setSaving(false);
    }
  };

  // Estado: agente nunca foi habilitado pra Workflow
  if (!enabled) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
            <Workflow className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Habilitar para Workflow</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Permite que este agente seja referenciado em fluxos do editor visual,
              executando ações no CRM (mensagens, tags, tarefas, etc).
            </p>
          </div>
          <Button onClick={enableWorkflow} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Workflow className="w-4 h-4 mr-2" />
            Habilitar agora
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Estado: agente já é workflow-capable, mostrar editor
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Tools */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Ferramentas disponíveis pro agente</Label>
              <span className="text-xs text-muted-foreground">{selectedTools.length} de {tools.length}</span>
            </div>
            {loadingTools ? (
              <div className="text-xs text-muted-foreground italic py-3">Carregando…</div>
            ) : tools.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-3 px-3 rounded border bg-muted/20">
                Nenhuma tool disponível pro seu plano.
              </div>
            ) : (
              <div className="space-y-1 border rounded-md p-2 max-h-72 overflow-y-auto">
                {tools.map((t) => {
                  const checked = selectedTools.includes(t.name);
                  return (
                    <label
                      key={t.name}
                      className={`flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${checked ? 'bg-emerald-500/10' : 'hover:bg-accent'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTool(t.name)}
                        className="mt-0.5 accent-emerald-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs font-mono font-medium">{t.name}</code>
                          {t.is_action && (
                            <span className="text-[9px] uppercase font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400 px-1 py-0.5 rounded">
                              ação
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{t.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Outcomes */}
          <div className="space-y-2">
            <Label>Saídas possíveis (outcomes)</Label>
            <div className="space-y-1">
              {outcomes.map((o, idx) => (
                <div key={`${o}-${idx}`} className="flex items-center gap-2 bg-muted/30 rounded px-2 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <code className="text-xs font-mono flex-1">{o}</code>
                  <button
                    type="button"
                    onClick={() => removeOutcome(idx)}
                    disabled={outcomes.length <= 1}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                    title={outcomes.length <= 1 ? 'Pelo menos 1 outcome' : 'Remover'}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-1">
                <Input
                  value={newOutcome}
                  onChange={(e) => setNewOutcome(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOutcome(); } }}
                  placeholder="ex: qualificado"
                  className="h-8 text-xs"
                />
                <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={addOutcome}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Cada outcome vira um handle de saída quando o agente é usado em workflow.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowDisableConfirm(true)}
          disabled={saving}
        >
          Remover da biblioteca
        </Button>
        <Button onClick={saveConfig} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Salvar configuração
        </Button>
      </div>

      <AlertDialog open={showDisableConfirm} onOpenChange={setShowDisableConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da biblioteca de Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              Workflows que referenciam este agente vão parar de funcionar.
              Você pode reabilitar depois — as configurações serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={disableWorkflow} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AgentDetailPage() {
  return (
    <AppShell>
      <AgentDetailContent />
    </AppShell>
  );
}
