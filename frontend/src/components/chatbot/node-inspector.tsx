'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trash2, Plus, X, AlertTriangle, ArrowRight, Check, ChevronsUpDown } from 'lucide-react';
import { type Node } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { NODE_META, type NodeKind } from './node-catalog';
import api from '@/lib/api';
import { getAgentIcon } from '@/lib/agent-icons';

export interface KanbanCol { key: string; label: string; }
export interface UserOpt { id: number; name: string; }
export interface PipelineOpt {
  id: number;
  name: string;
  is_default: boolean;
  columns: KanbanCol[];
}

interface InspectorProps {
  node: Node;
  onChange: (newData: Record<string, any>) => void;
  onDelete: () => void;
  kanbanColumns: KanbanCol[];  // fallback/compat
  users: UserOpt[];
  pipelines: PipelineOpt[];
  channelId?: number | null;
  // Para o ConditionForm descobrir variáveis disponíveis no fluxo
  flowNodes?: any[];
  flowEdges?: any[];
}

export function NodeInspector({ node, onChange, onDelete, kanbanColumns, users, pipelines, channelId, flowNodes, flowEdges }: InspectorProps) {
  const kind = (node.type || 'message') as NodeKind;
  const meta = NODE_META[kind];
  const data = (node.data || {}) as Record<string, any>;
  const Icon = meta.icon;

  const update = (patch: Record<string, any>) => onChange({ ...data, ...patch });

  return (
    <div className="w-[340px] flex-shrink-0 border-l border-border bg-card flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.colorClass}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Editando</div>
          <div className="text-sm font-semibold truncate">{meta.label}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {kind === 'trigger' && <TriggerForm data={data} update={update} pipelines={pipelines} />}
        {kind === 'message' && <MessageForm data={data} update={update} />}
        {kind === 'buttons' && <ButtonsForm data={data} update={update} />}
        {kind === 'input' && <InputForm data={data} update={update} />}
        {kind === 'condition' && (
          <ConditionForm
            data={data}
            update={update}
            nodeId={node.id}
            flowNodes={flowNodes}
            flowEdges={flowEdges}
          />
        )}
        {kind === 'tag' && <TagForm data={data} update={update} />}
        {kind === 'move_stage' && <StageForm data={data} update={update} kanbanColumns={kanbanColumns} pipelines={pipelines} />}
        {kind === 'handoff' && <HandoffForm data={data} update={update} kanbanColumns={kanbanColumns} users={users} pipelines={pipelines} />}
        {kind === 'delay' && <DelayForm data={data} update={update} />}
        {kind === 'http_request' && <HttpRequestForm data={data} update={update} />}
        {kind === 'webhook_out' && <WebhookOutForm data={data} update={update} />}
        {kind === 'transfer_to_agent' && <TransferToAgentForm data={data} update={update} channelId={channelId} />}
        {kind === 'end' && <p className="text-sm text-muted-foreground">Este nó encerra o fluxo. Sem configurações.</p>}
        <VarHint kind={kind} />
      </div>

      <div className="p-4 border-t border-border">
        <Button
          variant="outline" size="sm"
          className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4 mr-2" /> Excluir este nó
        </Button>
      </div>
    </div>
  );
}

function VarHint({ kind }: { kind: NodeKind }) {
  if (!['message', 'buttons', 'input', 'handoff'].includes(kind)) return null;
  return (
    <div className="rounded-lg bg-muted/50 border border-border p-3 text-[11px] text-muted-foreground leading-relaxed">
      <p className="font-medium text-foreground mb-1">Variáveis disponíveis</p>
      <p>
        Use <code className="bg-background px-1 py-0.5 rounded">{'{nome}'}</code> e{' '}
        <code className="bg-background px-1 py-0.5 rounded">{'{telefone}'}</code> do contato,
        além das que você capturar com nós <strong>Captura</strong>.
      </p>
    </div>
  );
}

function TriggerForm({
  data,
  update,
  pipelines = [],
}: {
  data: any;
  update: (p: any) => void;
  pipelines?: PipelineOpt[];
}) {
  const selectedPipelineId =
    data.pipeline_id ??
    pipelines.find((p) => p.is_default)?.id ??
    pipelines[0]?.id ??
    null;
  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) ?? null;
  const columns = selectedPipeline?.columns ?? [];

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Quando acionar</Label>
        <Select
          value={data.mode || 'any_message'}
          onValueChange={(v) => update({ mode: v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any_message">Qualquer primeira mensagem</SelectItem>
            <SelectItem value="keyword">Palavra-chave</SelectItem>
            <SelectItem value="stage_change">Mudança de estágio do funil</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.mode === 'keyword' && (
        <div className="space-y-1">
          <Label>Palavra-chave</Label>
          <Input
            value={data.keyword || ''}
            onChange={(e) => update({ keyword: e.target.value })}
            placeholder="ex: menu, oi, boleto"
          />
        </div>
      )}

      {data.mode === 'stage_change' && (
        <>
          {pipelines.length > 1 && (
            <div className="space-y-1">
              <Label>Pipeline</Label>
              <Select
                value={String(selectedPipelineId ?? '')}
                onValueChange={(v) =>
                  update({ pipeline_id: Number(v), stage_from: '', stage_to: '' })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label>De (estágio de origem)</Label>
            <Select
              value={data.stage_from || '__any__'}
              onValueChange={(v) =>
                update({ stage_from: v === '__any__' ? '' : v })
              }
            >
              <SelectTrigger><SelectValue placeholder="Qualquer estágio" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Qualquer estágio</SelectItem>
                {columns.map((c: any) => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Para (estágio destino) <span className="text-red-500">*</span></Label>
            <Select
              value={data.stage_to || ''}
              onValueChange={(v) => update({ stage_to: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o estágio destino" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c: any) => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!data.stage_to && (
              <p className="text-xs text-amber-600">
                Selecione um estágio destino — sem isso o gatilho nunca dispara.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MessageForm({ data, update }: { data: any; update: (p: any) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="msg-text">Mensagem</Label>
      <Textarea id="msg-text" value={data.text || ''} onChange={(e) => update({ text: e.target.value })} placeholder="Olá {nome}! Como posso ajudar?" rows={6} className="resize-none" />
    </div>
  );
}

function ButtonsForm({ data, update }: { data: any; update: (p: any) => void }) {
  const buttons: Array<{ id: string; label: string }> = data.buttons || [];
  const updateBtn = (idx: number, label: string) => {
    const next = [...buttons]; next[idx] = { ...next[idx], label }; update({ buttons: next });
  };
  const addBtn = () => {
    if (buttons.length >= 10) return;
    update({ buttons: [...buttons, { id: `b_${Math.random().toString(36).slice(2, 8)}`, label: `Opção ${buttons.length + 1}` }] });
  };
  const removeBtn = (idx: number) => update({ buttons: buttons.filter((_, i) => i !== idx) });

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="bt-text">Pergunta / Texto</Label>
        <Textarea id="bt-text" value={data.text || ''} onChange={(e) => update({ text: e.target.value })} placeholder="Escolha uma opção:" rows={3} className="resize-none" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Botões ({buttons.length})</Label>
          {buttons.length < 10 && (
            <Button size="sm" variant="ghost" onClick={addBtn} className="h-7 px-2 text-xs"><Plus className="w-3 h-3 mr-1" /> Adicionar</Button>
          )}
        </div>
        <div className="space-y-1.5">
          {buttons.map((btn, idx) => (
            <div key={btn.id} className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground font-mono w-5 text-center">{idx + 1}</span>
              <Input value={btn.label} onChange={(e) => updateBtn(idx, e.target.value)} placeholder="Texto do botão" className="h-8 text-sm" />
              <Button size="icon" variant="ghost" onClick={() => removeBtn(idx)} className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive" disabled={buttons.length <= 1}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Ligue cada botão ao nó seguinte arrastando da bolinha à direita.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cap">Guardar escolha em (opcional)</Label>
        <Input id="cap" value={data.capture_to || ''} onChange={(e) => update({ capture_to: e.target.value })} placeholder="ex: opcao_escolhida" />
      </div>
      <div className="space-y-2">
        <Label>Modo de exibição</Label>
        <Select
          value={data.display_mode || 'native'}
          onValueChange={(v) => update({ display_mode: v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="native">Botões interativos (WhatsApp)</SelectItem>
            <SelectItem value="numbered">Lista numerada (compatível com todos)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {(data.display_mode || 'native') === 'native'
            ? 'Usa botões clicáveis do WhatsApp. Se falhar ou tiver mais de 3 opções, cai automaticamente pra lista numerada.'
            : 'Envia sempre texto numerado. Funciona em qualquer versão do WhatsApp, inclusive grupos.'}
        </p>
      </div>
    </>
  );
}

function InputForm({ data, update }: { data: any; update: (p: any) => void }) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="ip-prompt">Pergunta</Label>
        <Textarea id="ip-prompt" value={data.prompt || ''} onChange={(e) => update({ prompt: e.target.value })} placeholder="Qual seu CPF?" rows={3} className="resize-none" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ip-var">Guardar em (variável)</Label>
        <Input id="ip-var" value={data.variable || ''} onChange={(e) => update({ variable: e.target.value })} placeholder="ex: cpf, email" />
        <p className="text-[11px] text-muted-foreground">
          Use depois como <code className="bg-muted px-1 py-0.5 rounded">{`{${data.variable || 'variavel'}}`}</code>.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Tipo de validação</Label>
        <Select value={data.validation || 'text'} onValueChange={(v) => update({ validation: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Texto livre</SelectItem>
            <SelectItem value="email">E-mail</SelectItem>
            <SelectItem value="cpf">CPF</SelectItem>
            <SelectItem value="phone">Telefone</SelectItem>
            <SelectItem value="number">Número</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ip-err">Mensagem de erro (se inválido)</Label>
        <Input id="ip-err" value={data.error_message || ''} onChange={(e) => update({ error_message: e.target.value })} placeholder="Formato inválido." />
      </div>
    </>
  );
}

type SuggestionItem = string | { value: string; label: string };

type FlowVariable = {
  name: string;
  label: string;
  category: 'contact' | 'captured' | 'flow';
  source_node_id: string | null;
  value_suggestions: SuggestionItem[];
  value_type?: 'text' | 'select' | 'user_id' | 'boolean' | 'datetime';
};

/**
 * Normaliza qualquer entry de value_suggestions ({string} ou {value,label})
 * para um par {value, label}. Usado pra renderizar Combobox uniformemente.
 */
function normalizeSuggestion(s: SuggestionItem): { value: string; label: string } {
  if (typeof s === 'string') return { value: s, label: s };
  return { value: String(s.value), label: s.label || String(s.value) };
}

const ALL_OPERATORS: Array<{ value: string; label: string }> = [
  { value: 'equals',       label: 'igual a' },
  { value: 'not_equals',   label: 'diferente de' },
  { value: 'contains',     label: 'contém' },
  { value: 'starts_with',  label: 'começa com' },
  { value: 'ends_with',    label: 'termina com' },
  { value: 'is_empty',     label: 'está vazio' },
  { value: 'is_not_empty', label: 'não está vazio' },
  { value: 'older_than',   label: 'há mais de' },
  { value: 'newer_than',   label: 'há menos de' },
];

const NO_VALUE_OPERATORS = new Set(['is_empty', 'is_not_empty']);
const TEMPORAL_OPERATORS = new Set(['older_than', 'newer_than']);

function operatorsForVariable(v?: FlowVariable): typeof ALL_OPERATORS {
  if (!v) return ALL_OPERATORS;

  const t = v.value_type || 'text';
  if (v.name === 'contact.tags') {
    return ALL_OPERATORS.filter((op) =>
      ['contains', 'is_empty', 'is_not_empty'].includes(op.value)
    );
  }
  if (t === 'datetime') {
    return ALL_OPERATORS.filter((op) =>
      ['older_than', 'newer_than', 'is_empty', 'is_not_empty'].includes(op.value)
    );
  }
  if (t === 'boolean') {
    return ALL_OPERATORS.filter((op) =>
      ['equals', 'not_equals'].includes(op.value)
    );
  }
  return ALL_OPERATORS.filter((op) => !TEMPORAL_OPERATORS.has(op.value));
}

const BOOLEAN_OPTIONS: { value: string; label: string }[] = [
  { value: 'true',  label: 'Sim' },
  { value: 'false', label: 'Não' },
];

const DURATION_UNITS: { value: string; label: string }[] = [
  { value: 'minutes', label: 'minutos' },
  { value: 'hours',   label: 'horas' },
  { value: 'days',    label: 'dias' },
];

function ConditionForm({
  data,
  update,
  nodeId,
  flowNodes,
  flowEdges,
}: {
  data: any;
  update: (p: any) => void;
  nodeId: string;
  flowNodes?: any[];
  flowEdges?: any[];
}) {
  const [variables, setVariables] = useState<FlowVariable[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [valueOpen, setValueOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchVars = async () => {
      if (!flowNodes || !flowEdges) return;
      setLoading(true);
      try {
        const res = await api.post('/chatbot/flow-variables', {
          graph: { nodes: flowNodes, edges: flowEdges },
          node_id: nodeId,
        });
        if (!cancelled) setVariables(res.data?.variables || []);
      } catch {
        if (!cancelled) setVariables([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchVars();
    return () => { cancelled = true; };
  }, [flowNodes, flowEdges, nodeId]);

  const selectedVar = variables.find((v) => v.name === data.variable);
  const operators = operatorsForVariable(selectedVar);

  // Auto-corrigir operador se ficou inválido depois de trocar a variável.
  useEffect(() => {
    if (!selectedVar) return;
    const validOps = operators.map((o) => o.value);
    if (data.operator && !validOps.includes(data.operator)) {
      update({ operator: validOps[0] });
    }
  }, [selectedVar?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const op = data.operator || 'equals';
  const isTemporal = TEMPORAL_OPERATORS.has(op);
  const showValueField = !NO_VALUE_OPERATORS.has(op);

  const contactVars = variables.filter((v) => v.category === 'contact');
  const flowVars = variables.filter((v) => v.category === 'flow');
  const capturedVars = variables.filter((v) => v.category === 'captured');

  return (
    <div className="space-y-3">
      {/* Variável */}
      <div className="space-y-1.5">
        <Label>Variável a comparar</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between font-normal"
            >
              {selectedVar ? (
                <span className="truncate">{selectedVar.label}</span>
              ) : (
                <span className="text-muted-foreground">
                  {loading ? 'Carregando...' : 'Selecione uma variável'}
                </span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar variável..." />
              <CommandList>
                <CommandEmpty>Nenhuma variável encontrada.</CommandEmpty>
                {contactVars.length > 0 && (
                  <CommandGroup heading="Dados do contato">
                    {contactVars.map((v) => (
                      <CommandItem
                        key={v.name}
                        value={`${v.name} ${v.label}`}
                        onSelect={() => {
                          update({ variable: v.name, value: '' });
                          setOpen(false);
                        }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${data.variable === v.name ? 'opacity-100' : 'opacity-0'}`} />
                        <div className="flex flex-col">
                          <span>{v.label}</span>
                          <span className="text-xs text-muted-foreground">{v.name}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {flowVars.length > 0 && (
                  <CommandGroup heading="Estado do fluxo">
                    {flowVars.map((v) => (
                      <CommandItem
                        key={v.name}
                        value={`${v.name} ${v.label}`}
                        onSelect={() => {
                          update({ variable: v.name, value: '' });
                          setOpen(false);
                        }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${data.variable === v.name ? 'opacity-100' : 'opacity-0'}`} />
                        <div className="flex flex-col">
                          <span>{v.label}</span>
                          <span className="text-xs text-muted-foreground">{v.name}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {capturedVars.length > 0 && (
                  <CommandGroup heading="Capturado no fluxo">
                    {capturedVars.map((v) => (
                      <CommandItem
                        key={v.name}
                        value={`${v.name} ${v.label}`}
                        onSelect={() => {
                          update({ variable: v.name, value: '' });
                          setOpen(false);
                        }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${data.variable === v.name ? 'opacity-100' : 'opacity-0'}`} />
                        <div className="flex flex-col">
                          <span>{v.label}</span>
                          <span className="text-xs text-muted-foreground">{v.name}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {capturedVars.length === 0 && flowVars.length === 0 && !loading && (
          <p className="text-[11px] text-muted-foreground">
            Para usar variáveis capturadas, adicione um nó <strong>Captura</strong> ou{' '}
            <strong>Botões</strong> antes desta condição.
          </p>
        )}
      </div>

      {/* Operador */}
      <div className="space-y-1.5">
        <Label>Operador</Label>
        <Select
          value={op}
          onValueChange={(v) => update({ operator: v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {operators.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Valor — varia por value_type / operador */}
      {showValueField && <ValueField selectedVar={selectedVar} data={data} update={update} valueOpen={valueOpen} setValueOpen={setValueOpen} nodeId={nodeId} isTemporal={isTemporal} />}

      <p className="text-[11px] text-muted-foreground">
        Saídas do nó: <span className="text-emerald-600 font-medium">verdadeiro</span> e{' '}
        <span className="text-rose-600 font-medium">falso</span>.
      </p>
    </div>
  );
}

// =======================================================
// ValueField — render do campo Valor adaptado ao tipo
// =======================================================
function ValueField({
  selectedVar, data, update, valueOpen, setValueOpen, nodeId, isTemporal,
}: {
  selectedVar?: FlowVariable;
  data: any;
  update: (p: any) => void;
  valueOpen: boolean;
  setValueOpen: (b: boolean) => void;
  nodeId: string;
  isTemporal: boolean;
}) {
  const valueType = selectedVar?.value_type || 'text';

  // Operador temporal — UI de duração (número + unidade)
  if (isTemporal) {
    const duration = (data.value && typeof data.value === 'object')
      ? data.value
      : { amount: '', unit: 'minutes' };
    return (
      <div className="space-y-1.5">
        <Label>Tempo</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min={1}
            value={duration.amount ?? ''}
            onChange={(e) => update({
              value: { amount: Number(e.target.value || 0), unit: duration.unit || 'minutes' }
            })}
            placeholder="ex: 48"
            className="w-24"
          />
          <Select
            value={duration.unit || 'minutes'}
            onValueChange={(u) => update({
              value: { amount: duration.amount || 0, unit: u }
            })}
          >
            <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DURATION_UNITS.map((u) => (
                <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  // Boolean — combobox fixo Sim/Não
  if (valueType === 'boolean') {
    const opts = (selectedVar?.value_suggestions?.length ? selectedVar.value_suggestions.map(normalizeSuggestion) : BOOLEAN_OPTIONS);
    return (
      <div className="space-y-1.5">
        <Label>Valor</Label>
        <Select
          value={data.value || ''}
          onValueChange={(v) => update({ value: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {opts.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // Tem sugestões -> Combobox estrito
  const sugs = (selectedVar?.value_suggestions || []).map(normalizeSuggestion);
  if (sugs.length > 0) {
    const selected = sugs.find((s) => s.value === data.value);
    return (
      <div className="space-y-1.5">
        <Label>Valor</Label>
        <Popover open={valueOpen} onOpenChange={setValueOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" role="combobox" aria-expanded={valueOpen} className="w-full justify-between font-normal">
              {selected ? <span className="truncate">{selected.label}</span> : <span className="text-muted-foreground">Selecione um valor</span>}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar..." />
              <CommandList>
                <CommandEmpty>Nenhum valor encontrado.</CommandEmpty>
                <CommandGroup>
                  {sugs.map((s) => (
                    <CommandItem
                      key={s.value}
                      value={`${s.value} ${s.label}`}
                      onSelect={() => { update({ value: s.value }); setValueOpen(false); }}
                    >
                      <Check className={`mr-2 h-4 w-4 ${data.value === s.value ? 'opacity-100' : 'opacity-0'}`} />
                      <div className="flex flex-col">
                        <span>{s.label}</span>
                        {s.label !== s.value && (<span className="text-xs text-muted-foreground">{s.value}</span>)}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // Default: input texto livre
  return (
    <div className="space-y-1.5">
      <Label htmlFor="cd-val">Valor</Label>
      <Input
        id="cd-val"
        value={typeof data.value === 'string' ? data.value : ''}
        onChange={(e) => update({ value: e.target.value })}
        placeholder="Digite o valor a comparar"
      />
    </div>
  );
}

function TagForm({ data, update }: { data: any; update: (p: any) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="tg">Nome da tag</Label>
      <Input id="tg" value={data.tag_name || ''} onChange={(e) => update({ tag_name: e.target.value })} placeholder="ex: Pediu Boleto" />
      <p className="text-[11px] text-muted-foreground">Se não existir, é criada automaticamente.</p>
    </div>
  );
}

// ============================================================
// MOVE STAGE — cascata Pipeline → Estágio
// ============================================================
function StageForm({
  data, update, kanbanColumns, pipelines,
}: { data: any; update: (p: any) => void; kanbanColumns: KanbanCol[]; pipelines: PipelineOpt[] }) {
  return <PipelineStageCascade data={data} update={update} pipelines={pipelines} fallbackColumns={kanbanColumns} />;
}

function HandoffForm({
  data, update, kanbanColumns, users, pipelines,
}: { data: any; update: (p: any) => void; kanbanColumns: KanbanCol[]; users: UserOpt[]; pipelines: PipelineOpt[] }) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="ho-title">Título da tarefa</Label>
        <Input id="ho-title" value={data.task_title || ''} onChange={(e) => update({ task_title: e.target.value })} placeholder="Atender {nome}" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ho-desc">Descrição (opcional)</Label>
        <Textarea id="ho-desc" value={data.task_description || ''} onChange={(e) => update({ task_description: e.target.value })} placeholder="Contexto..." rows={3} className="resize-none" />
        <p className="text-[11px] text-muted-foreground">Variáveis capturadas são anexadas automaticamente.</p>
      </div>
      <div className="space-y-2">
        <Label>Atribuir para</Label>
        <Select value={data.assigned_to_user_id ? String(data.assigned_to_user_id) : ''} onValueChange={(v) => update({ assigned_to_user_id: Number(v) })}>
          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
          <SelectContent>{users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Prioridade</Label>
        <Select value={data.priority || 'media'} onValueChange={(v) => update({ priority: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Mover o contato para (opcional)</Label>
        <PipelineStageCascade
          data={data}
          update={update}
          pipelines={pipelines}
          fallbackColumns={kanbanColumns}
          allowNone
        />
      </div>
    </>
  );
}


// ============================================================
// DELAY
// ============================================================
function DelayForm({ data, update }: { data: any; update: (p: any) => void }) {
  const amount = data.amount ?? 1;
  const unit = data.unit ?? 'minutes';

  const unitLabel: Record<string, string> = {
    minutes: amount === 1 ? 'minuto' : 'minutos',
    hours: amount === 1 ? 'hora' : 'horas',
    days: amount === 1 ? 'dia' : 'dias',
  };

  return (
    <>
      <div className="space-y-2">
        <Label>Aguardar</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={999}
            value={amount}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              update({ amount: isNaN(v) || v < 1 ? 1 : v });
            }}
            className="w-24"
          />
          <Select value={unit} onValueChange={(v) => update({ unit: v })}>
            <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">Minutos</SelectItem>
              <SelectItem value="hours">Horas</SelectItem>
              <SelectItem value="days">Dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="rounded-lg bg-muted/50 border border-border p-3 text-[11px] text-muted-foreground leading-relaxed">
        <p className="font-medium text-foreground mb-1">Como funciona</p>
        <p>
          O fluxo pausa aqui e retoma automaticamente depois de <strong>{amount} {unitLabel[unit]}</strong>.
          Durante a espera, novas mensagens do contato não avançam o fluxo.
        </p>
      </div>
    </>
  );
}


// ============================================================
// HTTP REQUEST
// ============================================================
function HttpRequestForm({ data, update }: { data: any; update: (p: any) => void }) {
  const method = (data.method || 'GET').toUpperCase();
  const headers: Array<{ key: string; value: string }> = data.headers || [];
  const bodyMode = data.body_mode || 'none';
  const prefix = data.response_var_prefix || 'http';

  const addHeader = () => update({ headers: [...headers, { key: '', value: '' }] });
  const updateHeader = (i: number, field: 'key' | 'value', v: string) => {
    const next = [...headers];
    next[i] = { ...next[i], [field]: v };
    update({ headers: next });
  };
  const removeHeader = (i: number) => update({ headers: headers.filter((_: any, idx: number) => idx !== i) });

  return (
    <>
      <div className="space-y-2">
        <Label>Método</Label>
        <Select value={method} onValueChange={(v) => update({ method: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="http-url">URL</Label>
        <Input
          id="http-url"
          value={data.url || ''}
          onChange={(e) => update({ url: e.target.value })}
          placeholder="https://api.exemplo.com/clientes/{cpf}"
          className="font-mono text-xs"
        />
        <p className="text-[11px] text-muted-foreground">
          Use <code className="bg-muted px-1 py-0.5 rounded">{'{variavel}'}</code> pra interpolar valores capturados.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Headers</Label>
          <Button size="sm" variant="ghost" onClick={addHeader} className="h-7 px-2 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Adicionar
          </Button>
        </div>
        {headers.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic">Nenhum header configurado</p>
        )}
        <div className="space-y-1.5">
          {headers.map((h: any, i: number) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={h.key}
                onChange={(e) => updateHeader(i, 'key', e.target.value)}
                placeholder="Authorization"
                className="h-8 text-xs font-mono flex-1"
              />
              <Input
                value={h.value}
                onChange={(e) => updateHeader(i, 'value', e.target.value)}
                placeholder="Bearer abc..."
                className="h-8 text-xs font-mono flex-1"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => removeHeader(i)}
                className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {method !== 'GET' && method !== 'DELETE' && (
        <>
          <div className="space-y-2">
            <Label>Corpo da requisição</Label>
            <Select value={bodyMode} onValueChange={(v) => update({ body_mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem corpo</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="text">Texto / form</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {bodyMode !== 'none' && (
            <div className="space-y-2">
              <Label htmlFor="http-body">
                {bodyMode === 'json' ? 'Corpo JSON' : 'Corpo'}
              </Label>
              <Textarea
                id="http-body"
                value={data.body || ''}
                onChange={(e) => update({ body: e.target.value })}
                placeholder={bodyMode === 'json' ? '{"nome":"{nome}","cpf":"{cpf}"}' : 'chave=valor&outra=teste'}
                rows={5}
                className="font-mono text-xs resize-none"
              />
              <p className="text-[11px] text-muted-foreground">
                Variáveis funcionam também aqui. JSON deve ser válido depois da interpolação.
              </p>
            </div>
          )}
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="http-prefix">Prefixo das variáveis de resposta</Label>
        <Input
          id="http-prefix"
          value={prefix}
          onChange={(e) => update({ response_var_prefix: e.target.value.replace(/[^a-zA-Z_]/g, '') })}
          placeholder="http"
          className="font-mono text-xs"
        />
        <div className="text-[11px] text-muted-foreground leading-relaxed space-y-0.5">
          <p>Após a execução você pode usar:</p>
          <ul className="pl-3 space-y-0.5">
            <li>• <code className="bg-muted px-1 rounded">{`{${prefix}_status}`}</code> — código HTTP</li>
            <li>• <code className="bg-muted px-1 rounded">{`{${prefix}_ok}`}</code> — &quot;true&quot; se 2xx</li>
            <li>• <code className="bg-muted px-1 rounded">{`{${prefix}_response_raw}`}</code> — body cru</li>
            <li>• <code className="bg-muted px-1 rounded">{`{${prefix}_response.campo}`}</code> — acessa JSON</li>
          </ul>
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 border border-border p-3 text-[11px] text-muted-foreground leading-relaxed">
        <p className="font-medium text-foreground mb-1">Dois caminhos de saída</p>
        <p>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">Sucesso</span>:
          resposta 2xx sem erro de conexão.
          <br />
          <span className="text-rose-600 dark:text-rose-400 font-medium">Erro</span>:
          4xx, 5xx, timeout ou falha de rede.
        </p>
      </div>
    </>
  );
}


// ============================================================
// WEBHOOK OUT
// ============================================================
function WebhookOutForm({ data, update }: { data: any; update: (p: any) => void }) {
  const mode = data.payload_mode || 'auto';
  const headers: Array<{ key: string; value: string }> = data.headers || [];

  const addHeader = () => update({ headers: [...headers, { key: '', value: '' }] });
  const updateHeader = (i: number, field: 'key' | 'value', v: string) => {
    const next = [...headers];
    next[i] = { ...next[i], [field]: v };
    update({ headers: next });
  };
  const removeHeader = (i: number) => update({ headers: headers.filter((_: any, idx: number) => idx !== i) });

  const autoPreview = JSON.stringify({
    event: data.event_name || 'chatbot_event',
    session_id: 123,
    contact: { name: '{nome}', wa_id: '{telefone}' },
    variables: { '...': 'variáveis capturadas no fluxo' },
    timestamp: '2026-04-21T15:30:00Z',
  }, null, 2);

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="wh-url">URL do endpoint</Label>
        <Input
          id="wh-url"
          value={data.url || ''}
          onChange={(e) => update({ url: e.target.value })}
          placeholder="https://seu-servidor.com/webhook"
          className="font-mono text-xs"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="wh-event">Nome do evento</Label>
        <Input
          id="wh-event"
          value={data.event_name || ''}
          onChange={(e) => update({ event_name: e.target.value.replace(/\s+/g, '_') })}
          placeholder="lead_pediu_boleto"
          className="font-mono text-xs"
        />
        <p className="text-[11px] text-muted-foreground">
          Identifica esse evento no lado do cliente. Use snake_case.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Payload</Label>
        <Select value={mode} onValueChange={(v) => update({ payload_mode: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Automático (recomendado)</SelectItem>
            <SelectItem value="custom">Customizado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === 'auto' ? (
        <div className="space-y-2">
          <Label className="text-[11px] text-muted-foreground">Preview do JSON que será enviado</Label>
          <pre className="text-[10px] bg-muted/50 border border-border rounded-md p-2 overflow-x-auto font-mono max-h-[200px] overflow-y-auto">
{autoPreview}
          </pre>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="wh-custom">JSON customizado</Label>
          <Textarea
            id="wh-custom"
            value={data.custom_payload || ''}
            onChange={(e) => update({ custom_payload: e.target.value })}
            placeholder={'{"cliente":"{nome}","telefone":"{telefone}","cpf":"{cpf}"}'}
            rows={6}
            className="font-mono text-xs resize-none"
          />
          <p className="text-[11px] text-muted-foreground">
            Variáveis funcionam aqui. JSON deve ser válido depois da interpolação.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Headers adicionais</Label>
          <Button size="sm" variant="ghost" onClick={addHeader} className="h-7 px-2 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Adicionar
          </Button>
        </div>
        {headers.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic">
            Nenhum header — Content-Type: application/json já vai por padrão
          </p>
        )}
        <div className="space-y-1.5">
          {headers.map((h: any, i: number) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={h.key}
                onChange={(e) => updateHeader(i, 'key', e.target.value)}
                placeholder="X-API-Key"
                className="h-8 text-xs font-mono flex-1"
              />
              <Input
                value={h.value}
                onChange={(e) => updateHeader(i, 'value', e.target.value)}
                placeholder="abc123..."
                className="h-8 text-xs font-mono flex-1"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => removeHeader(i)}
                className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 border border-border p-3 text-[11px] text-muted-foreground leading-relaxed">
        <p className="font-medium text-foreground mb-1">Fire-and-forget</p>
        <p>
          O fluxo continua imediatamente, sem esperar resposta. Se o endpoint falhar,
          o erro é registrado no log do servidor e o fluxo <strong>não é interrompido</strong>.
          Para tratar erro no fluxo, use <strong>HTTP Request</strong>.
        </p>
      </div>
    </>
  );
}


// ============================================================
// TRANSFER TO AGENT
// ============================================================
function TransferToAgentForm({ data, update, channelId }: { data: any; update: (p: any) => void; channelId?: number | null }) {
  return (
    <>
      <AgentPreviewForChannel channelId={channelId} />

      <div className="space-y-2">
        <Label>Tempo de atuação do agente</Label>
        <div className="flex items-center gap-2 mt-1">
          <Input
            type="number"
            min={1}
            max={1440}
            value={data.timeout_minutes ?? 60}
            onChange={(e) => update({ timeout_minutes: Math.max(1, parseInt(e.target.value) || 60) })}
            className="w-24 font-mono"
          />
          <span className="text-sm text-muted-foreground">minutos sem resposta</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Após esse tempo sem mensagem do lead, o agente desativa e a próxima mensagem volta para o workflow.
        </p>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md border">
        <p className="font-medium text-foreground mb-1">Como funciona</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Ao executar este nó, o workflow encerra</li>
          <li>O agente assume o atendimento imediatamente</li>
          <li>Variáveis coletadas no workflow ficam disponíveis para o agente</li>
          <li>Você pode desligar o agente a qualquer momento pela conversa</li>
        </ul>
      </div>
    </>
  );
}

function AgentPreviewForChannel({ channelId }: { channelId?: number | null }) {
  const [agent, setAgent] = useState<{ id: number; name: string; icon: string; is_enabled: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!channelId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await api.get('/agents');
        const found = res.data.find((a: any) => a.channel_id === channelId);
        setAgent(found ?? null);
      } catch {
        setAgent(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [channelId]);

  if (loading) {
    return <div className="h-16 rounded-md bg-muted/50 animate-pulse" />;
  }

  if (!agent) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-md border border-warning/30 bg-warning/10">
        <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Canal sem agente associado</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Este workflow não vai conseguir transferir o atendimento.
          </p>
          <Link href="/agents" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2 font-medium">
            Configurar agente agora <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    );
  }

  const Icon = getAgentIcon(agent.icon);

  return (
    <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/30">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">Agente que vai assumir</p>
        <p className="text-sm font-medium text-foreground truncate">{agent.name}</p>
      </div>
      {!agent.is_enabled && (
        <span className="text-xs text-warning font-medium">Desativado</span>
      )}
    </div>
  );
}

// ============================================================
// Componente reusável: Pipeline + Stage em cascata
// ============================================================
function PipelineStageCascade({
  data, update, pipelines, fallbackColumns, allowNone = false,
}: {
  data: any;
  update: (p: any) => void;
  pipelines: PipelineOpt[];
  fallbackColumns: KanbanCol[];
  allowNone?: boolean;
}) {
  // Determina pipeline selecionado (ou default)
  const selectedPipelineId: number | null = data.pipeline_id
    ? Number(data.pipeline_id)
    : null;

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) || null;

  // Colunas disponíveis: do pipeline escolhido, OU do default se nenhum escolhido, OU fallback
  const columns: KanbanCol[] =
    selectedPipeline?.columns?.length
      ? selectedPipeline.columns
      : pipelines.find((p) => p.is_default)?.columns || fallbackColumns;

  const hasPipelines = pipelines.length > 0;
  const multiplePipelines = pipelines.length > 1;

  const handlePipelineChange = (v: string) => {
    if (v === '__default__') {
      // Voltar pro default = remove pipeline_id e limpa stage
      const next = { ...data };
      delete next.pipeline_id;
      next.stage = allowNone ? '' : next.stage;
      update(next);
      return;
    }
    const pid = Number(v);
    update({ ...data, pipeline_id: pid, stage: '' }); // limpa stage ao trocar pipeline
  };

  const handleStageChange = (v: string) => {
    if (v === '__none__') {
      update({ ...data, stage: '' });
      return;
    }
    update({ ...data, stage: v });
  };

  return (
    <div className="space-y-2">
      {multiplePipelines && (
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Pipeline</Label>
          <Select
            value={selectedPipelineId ? String(selectedPipelineId) : '__default__'}
            onValueChange={handlePipelineChange}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">Pipeline do contato (atual)</SelectItem>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}{p.is_default ? ' (padrão)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">
          {multiplePipelines ? 'Estágio' : 'Mover para'}
        </Label>
        {columns.length > 0 ? (
          <Select
            value={data.stage || (allowNone ? '__none__' : '')}
            onValueChange={handleStageChange}
          >
            <SelectTrigger>
              <SelectValue placeholder={allowNone ? 'Não mover' : 'Selecione...'} />
            </SelectTrigger>
            <SelectContent>
              {allowNone && <SelectItem value="__none__">Não mover</SelectItem>}
              {columns.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={data.stage || ''}
            onChange={(e) => update({ ...data, stage: e.target.value })}
            placeholder={hasPipelines ? 'Selecione um pipeline primeiro' : 'ex: em_contato'}
            disabled={multiplePipelines && !selectedPipeline}
          />
        )}
      </div>
    </div>
  );
}
