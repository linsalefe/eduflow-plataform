'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import api from '@/lib/api';
import {
  PhoneCall, PhoneOff, Play, Pause, Square, Plus, Search,
  ChevronRight, Clock, CheckCircle2, XCircle, Loader2, Users,
  X, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';

// ============================================================
// TYPES
// ============================================================

interface ContactItem {
  id: number;
  name: string;
  wa_id: string;
  lead_status: string;
  tags: { id: number; name: string; color: string }[];
}

interface Campaign {
  id: number;
  name: string;
  status: string;
  total_items: number;
  completed_items: number;
  failed_items: number;
  created_at: string;
  started_at: string;
  completed_at: string;
}

interface CampaignItem {
  id: number;
  contact_id: number;
  contact_name: string;
  phone_number: string;
  resolved_variables: Record<string, string>;
  status: string;
  attempt_count: number;
  outcome: string;
  duration_seconds: number;
  summary: string;
  call_id: number | null;
  started_at: string;
  completed_at: string;
}

interface CampaignDetail {
  campaign: Campaign & { dynamic_variables: Record<string, any> };
  items: CampaignItem[];
}

interface DynVar {
  name: string;
  source: string;
  value: string;
}

// ============================================================
// HELPERS
// ============================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Aguardando', color: 'bg-muted text-muted-foreground', icon: Clock },
  running: { label: 'Em execução', color: 'bg-blue-50 text-blue-700', icon: Loader2 },
  paused: { label: 'Pausada', color: 'bg-amber-50 text-amber-700', icon: Pause },
  completed: { label: 'Concluída', color: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  cancelled: { label: 'Cancelada', color: 'bg-red-50 text-red-700', icon: XCircle },
};

const ITEM_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: 'bg-muted text-muted-foreground' },
  calling: { label: 'Ligando...', color: 'bg-blue-50 text-blue-700' },
  completed: { label: 'Concluída', color: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'Falhou', color: 'bg-red-50 text-red-700' },
  skipped: { label: 'Pulado', color: 'bg-muted text-muted-foreground' },
};

const OUTCOME_LABELS: Record<string, string> = {
  qualified: 'Qualificado',
  scheduled: 'Agendado',
  not_qualified: 'Não Qualificado',
  no_answer: 'Não Atendeu',
  completed: 'Completada',
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return '-';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`text-[11px] font-semibold gap-1 ${config.color}`}>
      <Icon className={`w-3 h-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {config.label}
    </Badge>
  );
}

function CustomCheckbox({ checked }: { checked: boolean }) {
  return (
    <div
      className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
        checked ? 'bg-primary border-primary' : 'border-muted-foreground/30'
      }`}
    >
      {checked && (
        <svg
          className="h-3 w-3 text-primary-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function CampaignTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<CampaignDetail | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = { Authorization: `Bearer ${token}` };

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await api.get('/voice-ai-el/campaigns', { headers });
      setCampaigns(res.data.campaigns);
    } catch {
      toast.error('Erro ao buscar campanhas');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = async (id: number) => {
    try {
      const res = await api.get(`/voice-ai-el/campaigns/${id}`, { headers });
      setSelectedDetail(res.data);
    } catch {
      toast.error('Erro ao buscar detalhes');
    }
  };

  const handleAction = async (campaignId: number, action: string) => {
    try {
      await api.post(`/voice-ai-el/campaigns/${campaignId}/action`, { action }, { headers });
      toast.success(action === 'start' ? 'Campanha iniciada!' : action === 'pause' ? 'Campanha pausada' : 'Campanha cancelada');
      fetchCampaigns();
      if (selectedDetail?.campaign.id === campaignId) {
        fetchDetail(campaignId);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erro na ação');
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Auto-refresh para campanhas em execução
  useEffect(() => {
    const hasRunning = campaigns.some(c => c.status === 'running');
    if (!hasRunning) return;
    const interval = setInterval(() => {
      fetchCampaigns();
      if (selectedDetail && selectedDetail.campaign.status === 'running') {
        fetchDetail(selectedDetail.campaign.id);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [campaigns, selectedDetail]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {campaigns.length} campanha{campaigns.length !== 1 ? 's' : ''}
        </span>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          Nova Campanha
        </Button>
      </div>

      {/* Campaigns List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={PhoneOff}
          title="Nenhuma campanha"
          description="Crie sua primeira campanha de ligações selecionando contatos."
        />
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const progress = c.total_items > 0
              ? Math.round(((c.completed_items + c.failed_items) / c.total_items) * 100)
              : 0;

            return (
              <Card
                key={c.id}
                className="p-4 cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => fetchDetail(c.id)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <PhoneCall className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.total_items} contato{c.total_items !== 1 ? 's' : ''} · {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={c.status} />
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>

                {/* Progress bar */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground tabular-nums w-16 text-right">
                    {c.completed_items}/{c.total_items}
                  </span>
                </div>

                {/* Action buttons */}
                {(c.status === 'pending' || c.status === 'paused' || c.status === 'running') && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                    {(c.status === 'pending' || c.status === 'paused') && (
                      <Button
                        size="sm"
                        variant="default"
                        className="gap-1.5 h-8"
                        onClick={(e) => { e.stopPropagation(); handleAction(c.id, 'start'); }}
                      >
                        <Play className="w-3.5 h-3.5" />
                        {c.status === 'paused' ? 'Retomar' : 'Iniciar'}
                      </Button>
                    )}
                    {c.status === 'running' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-8"
                        onClick={(e) => { e.stopPropagation(); handleAction(c.id, 'pause'); }}
                      >
                        <Pause className="w-3.5 h-3.5" />
                        Pausar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 h-8 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleAction(c.id, 'cancel'); }}
                    >
                      <Square className="w-3.5 h-3.5" />
                      Cancelar
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Campaign Dialog */}
      <CreateCampaignDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => { setShowCreate(false); fetchCampaigns(); }}
        headers={headers}
      />

      {/* Campaign Detail Sheet */}
      <Sheet open={!!selectedDetail} onOpenChange={(open) => !open && setSelectedDetail(null)}>
        <SheetContent className="w-full sm:max-w-[600px] overflow-y-auto">
          {selectedDetail && (
            <CampaignDetailView
              detail={selectedDetail}
              onAction={(action) => handleAction(selectedDetail.campaign.id, action)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ============================================================
// CREATE CAMPAIGN DIALOG
// ============================================================

function CreateCampaignDialog({
  open, onOpenChange, onCreated, headers,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
  headers: Record<string, string>;
}) {
  const [step, setStep] = useState<'contacts' | 'config'>('contacts');
  const [name, setName] = useState('');
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dynVars, setDynVars] = useState<DynVar[]>([{ name: 'nome', source: 'contact_name', value: '' }]);
  const [creating, setCreating] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('contacts');
      setName('');
      setSelectedIds([]);
      setSearchTerm('');
      setDynVars([{ name: 'nome', source: 'contact_name', value: '' }]);
      fetchContacts();
    }
  }, [open]);

  const fetchContacts = async () => {
    setLoadingContacts(true);
    try {
      const res = await api.get('/contacts?limit=200', { headers });
      const list = res.data.contacts || res.data;
      setContacts(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Erro ao buscar contatos');
    } finally {
      setLoadingContacts(false);
    }
  };

  const toggleContact = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(c => c.id));
    }
  };

  const filtered = contacts.filter(c =>
    (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.wa_id || '').includes(searchTerm)
  );

  const addVar = () => setDynVars([...dynVars, { name: '', source: 'fixed', value: '' }]);
  const removeVar = (i: number) => setDynVars(dynVars.filter((_, idx) => idx !== i));
  const updateVar = (i: number, field: keyof DynVar, val: string) => {
    const updated = [...dynVars];
    updated[i] = { ...updated[i], [field]: val };
    setDynVars(updated);
  };

  const handleCreate = async () => {
    if (!name.trim()) return toast.error('Digite o nome da campanha');
    if (selectedIds.length === 0) return toast.error('Selecione pelo menos um contato');

    const dynamicVariables: Record<string, any> = {};
    for (const v of dynVars) {
      if (!v.name.trim()) continue;
      const entry: any = { source: v.source };
      if (v.source === 'fixed' && v.value) entry.value = v.value;
      dynamicVariables[v.name.trim()] = entry;
    }

    setCreating(true);
    try {
      await api.post('/voice-ai-el/campaigns', {
        name: name.trim(),
        contact_ids: selectedIds,
        dynamic_variables: dynamicVariables,
      }, { headers });
      toast.success('Campanha criada!');
      onCreated();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Erro ao criar campanha';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === 'contacts' ? 'Selecionar Contatos' : 'Configurar Campanha'}
          </DialogTitle>
        </DialogHeader>

        {step === 'contacts' ? (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou número..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Select all */}
            <div className="flex items-center justify-between px-1">
              <button
                onClick={toggleAll}
                className="text-xs text-primary hover:underline"
              >
                {selectedIds.length === filtered.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
              <span className="text-xs text-muted-foreground">
                {selectedIds.length} selecionado{selectedIds.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Contacts list */}
            <div className="flex-1 overflow-y-auto border rounded-lg divide-y max-h-[400px]">
              {loadingContacts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Nenhum contato encontrado
                </div>
              ) : (
                filtered.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer select-none"
                    onClick={() => toggleContact(contact.id)}
                  >
                    <CustomCheckbox checked={selectedIds.includes(contact.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {contact.name || 'Sem nome'}
                      </p>
                      <p className="text-xs text-muted-foreground">{contact.wa_id}</p>
                    </div>
                    {contact.tags?.length > 0 && (
                      <div className="flex gap-1">
                        {contact.tags.slice(0, 2).map(t => (
                          <Badge key={t.id} variant="outline" className="text-[10px]">
                            {t.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Campaign name */}
            <div>
              <Label>Nome da Campanha</Label>
              <Input
                placeholder="Ex: Reengajamento Março"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5"
              />
            </div>

            <Separator />

            {/* Dynamic Variables */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Label>Variáveis Dinâmicas</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Configure as variáveis que o agente de voz usa no script
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={addVar} className="gap-1 h-7">
                  <Plus className="w-3 h-3" /> Variável
                </Button>
              </div>

              <div className="space-y-3">
                {dynVars.map((v, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                    <div className="flex-1 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Nome da variável</Label>
                          <Input
                            placeholder="ex: nome"
                            value={v.name}
                            onChange={(e) => updateVar(i, 'name', e.target.value)}
                            className="mt-1 h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Fonte</Label>
                          <Select value={v.source} onValueChange={(val) => updateVar(i, 'source', val)}>
                            <SelectTrigger className="mt-1 h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="contact_name">Nome do contato</SelectItem>
                              <SelectItem value="contact_wa_id">Número WhatsApp</SelectItem>
                              <SelectItem value="tag">Primeira tag</SelectItem>
                              <SelectItem value="fixed">Valor fixo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {v.source === 'fixed' && (
                        <div>
                          <Label className="text-xs">Valor</Label>
                          <Input
                            placeholder="ex: Intercâmbio Esportivo"
                            value={v.value}
                            onChange={(e) => updateVar(i, 'value', e.target.value)}
                            className="mt-1 h-8 text-sm"
                          />
                        </div>
                      )}
                    </div>
                    {dynVars.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 mt-5 text-muted-foreground hover:text-destructive"
                        onClick={() => removeVar(i)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-sm text-foreground">
                <strong>{selectedIds.length}</strong> contato{selectedIds.length !== 1 ? 's' : ''} selecionado{selectedIds.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="pt-3 border-t">
          {step === 'contacts' ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                onClick={() => setStep('config')}
                disabled={selectedIds.length === 0}
                className="gap-1.5"
              >
                Próximo
                <ChevronRight className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep('contacts')}>Voltar</Button>
              <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                Criar Campanha
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// CAMPAIGN DETAIL VIEW (Sheet)
// ============================================================

function CampaignDetailView({
  detail,
  onAction,
}: {
  detail: CampaignDetail;
  onAction: (action: string) => void;
}) {
  const { campaign, items } = detail;
  const progress = campaign.total_items > 0
    ? Math.round(((campaign.completed_items + campaign.failed_items) / campaign.total_items) * 100)
    : 0;

  return (
    <>
      <SheetHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <PhoneCall className="h-5 w-5 text-primary" />
          </div>
          <div>
            <SheetTitle>{campaign.name}</SheetTitle>
            <p className="text-xs text-muted-foreground">
              {campaign.total_items} contatos · Criada em {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString('pt-BR') : ''}
            </p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge status={campaign.status} />
        </div>
      </SheetHeader>

      <Separator />

      <div className="space-y-5 py-5">
        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Progresso</span>
            <span className="text-xs font-bold text-foreground tabular-nums">{progress}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">
              {campaign.completed_items} concluída{campaign.completed_items !== 1 ? 's' : ''}
            </span>
            {campaign.failed_items > 0 && (
              <span className="text-xs text-destructive">
                {campaign.failed_items} falha{campaign.failed_items !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-foreground tabular-nums">{campaign.total_items}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Total</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-emerald-600 tabular-nums">{campaign.completed_items}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Concluídas</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-destructive tabular-nums">{campaign.failed_items}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Falhas</p>
          </div>
        </div>

        {/* Actions */}
        {(campaign.status === 'pending' || campaign.status === 'paused' || campaign.status === 'running') && (
          <div className="flex items-center gap-2">
            {(campaign.status === 'pending' || campaign.status === 'paused') && (
              <Button size="sm" className="gap-1.5" onClick={() => onAction('start')}>
                <Play className="w-3.5 h-3.5" />
                {campaign.status === 'paused' ? 'Retomar' : 'Iniciar Ligações'}
              </Button>
            )}
            {campaign.status === 'running' && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onAction('pause')}>
                <Pause className="w-3.5 h-3.5" />
                Pausar
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => onAction('cancel')}
            >
              <Square className="w-3.5 h-3.5" />
              Cancelar
            </Button>
          </div>
        )}

        <Separator />

        {/* Items List */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Contatos na fila
          </p>
          <div className="space-y-2">
            {items.map((item) => {
              const itemStatus = ITEM_STATUS[item.status] || ITEM_STATUS.pending;
              return (
                <div key={item.id} className="p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {item.contact_name || 'Sem nome'}
                      </p>
                      <Badge variant="outline" className={`text-[10px] ${itemStatus.color}`}>
                        {itemStatus.label}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{item.phone_number}</span>
                  </div>

                  {item.outcome && (
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>{OUTCOME_LABELS[item.outcome] || item.outcome}</span>
                      {item.duration_seconds > 0 && (
                        <span className="tabular-nums">{formatDuration(item.duration_seconds)}</span>
                      )}
                    </div>
                  )}

                  {item.summary && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{item.summary}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}