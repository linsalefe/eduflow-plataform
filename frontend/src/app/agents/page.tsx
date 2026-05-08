'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Loader2, ChevronRight, Unplug, FileText,
} from 'lucide-react';
import AppShell from '@/components/app-shell';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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

interface ChannelOption {
  id: number;
  name: string;
}

function AgentsContent() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Create form
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('Bot');
  const [formChannelId, setFormChannelId] = useState<string>('none');

  const fetchAgents = useCallback(async () => {
    try {
      const res = await api.get('/agents');
      setAgents(res.data);
    } catch {
      toast.error('Erro ao carregar agentes');
    }
  }, []);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await api.get('/channels');
      setChannels(res.data.map((c: any) => ({ id: c.id, name: c.name })));
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchAgents(), fetchChannels()]).finally(() => setLoading(false));
  }, [fetchAgents, fetchChannels]);

  const freeChannels = channels.filter((ch) => !agents.find((a) => a.channel_id === ch.id));

  const openCreate = () => {
    setFormName('');
    setFormIcon('Bot');
    setFormChannelId('none');
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!formName.trim()) {
      toast.error('Nome do agente obrigatorio');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/agents', {
        name: formName.trim(),
        icon: formIcon,
        channel_id: formChannelId === 'none' ? null : Number(formChannelId),
      });
      toast.success('Agente criado');
      setDialogOpen(false);
      router.push(`/agents/${res.data.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Erro ao criar agente');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto pb-8">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[200px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Agentes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Crie e gerencie seus agentes de IA
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Novo Agente
        </Button>
      </div>

      {/* Empty state */}
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          {(() => { const BotIcon = getAgentIcon('Bot'); return <BotIcon className="w-16 h-16 text-muted-foreground/30 mb-4" />; })()}
          <h3 className="text-lg font-medium text-foreground mb-1">Nenhum agente criado</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Crie seu primeiro agente de IA para comecar a automatizar atendimentos.
          </p>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Criar primeiro agente
          </Button>
        </div>
      ) : (
        /* Card grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const AgentIcon = getAgentIcon(agent.icon);
            return (
              <Card
                key={agent.id}
                className="hover:border-primary/40 transition-all cursor-pointer group"
                onClick={() => router.push(`/agents/${agent.id}`)}
              >
                <CardContent className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <AgentIcon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground truncate">{agent.name}</h3>
                        <p className="text-xs text-muted-foreground">{agent.model}</p>
                      </div>
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${agent.is_enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                  </div>

                  {/* Metadata */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Canal</span>
                      {agent.channel_name ? (
                        <span className="text-foreground font-medium truncate ml-2">{agent.channel_name}</span>
                      ) : (
                        <span className="text-muted-foreground/60 flex items-center gap-1 text-xs">
                          <Unplug className="w-3 h-3" /> Sem canal
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Documentos</span>
                      <span className="text-foreground font-medium flex items-center gap-1">
                        <FileText className="w-3 h-3 text-muted-foreground" />
                        {agent.knowledge_docs_count}
                      </span>
                    </div>
                  </div>

                  {/* F2.C — Badges de uso */}
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    {agent.channel_id && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
                        Canal
                      </span>
                    )}
                    {agent.is_workflow_capable && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        Biblioteca · {(agent.tools || []).length} tools
                      </span>
                    )}
                    {!agent.channel_id && !agent.is_workflow_capable && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
                        Não atribuído
                      </span>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                    <span className={`text-xs font-medium ${agent.is_enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                      {agent.is_enabled ? 'Ativo' : 'Inativo'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Agente</DialogTitle>
            <DialogDescription>
              Crie o agente e configure os detalhes na tela dedicada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">Nome</Label>
              <Input
                id="agent-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Agente WhatsApp Principal"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>

            <div className="space-y-2">
              <Label>Icone</Label>
              <IconPicker value={formIcon} onChange={setFormIcon} />
            </div>

            <div className="space-y-2">
              <Label>Canal (opcional)</Label>
              <Select value={formChannelId} onValueChange={setFormChannelId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem canal</SelectItem>
                  {freeChannels.map((ch) => (
                    <SelectItem key={ch.id} value={String(ch.id)}>{ch.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving || !formName.trim()}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar agente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AgentsPage() {
  return (
    <AppShell>
      <AgentsContent />
    </AppShell>
  );
}
