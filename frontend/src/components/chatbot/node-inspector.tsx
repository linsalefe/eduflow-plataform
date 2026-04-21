'use client';

import { Trash2, Plus, X } from 'lucide-react';
import { type Node } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { NODE_META, type NodeKind } from './node-catalog';

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
}

export function NodeInspector({ node, onChange, onDelete, kanbanColumns, users, pipelines }: InspectorProps) {
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
        {kind === 'trigger' && <TriggerForm data={data} update={update} />}
        {kind === 'message' && <MessageForm data={data} update={update} />}
        {kind === 'buttons' && <ButtonsForm data={data} update={update} />}
        {kind === 'input' && <InputForm data={data} update={update} />}
        {kind === 'condition' && <ConditionForm data={data} update={update} />}
        {kind === 'tag' && <TagForm data={data} update={update} />}
        {kind === 'move_stage' && <StageForm data={data} update={update} kanbanColumns={kanbanColumns} pipelines={pipelines} />}
        {kind === 'handoff' && <HandoffForm data={data} update={update} kanbanColumns={kanbanColumns} users={users} pipelines={pipelines} />}
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

function TriggerForm({ data, update }: { data: any; update: (p: any) => void }) {
  return (
    <>
      <div className="space-y-2">
        <Label>Quando acionar</Label>
        <Select value={data.mode || 'any_message'} onValueChange={(v) => update({ mode: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any_message">Qualquer primeira mensagem</SelectItem>
            <SelectItem value="keyword">Palavra-chave</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {data.mode === 'keyword' && (
        <div className="space-y-2">
          <Label htmlFor="kw">Palavra-chave</Label>
          <Input id="kw" value={data.keyword || ''} onChange={(e) => update({ keyword: e.target.value })} placeholder="ex: menu, oi, boleto" />
          <p className="text-[11px] text-muted-foreground">Aceita quando a palavra aparece em qualquer lugar da mensagem.</p>
        </div>
      )}
    </>
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

function ConditionForm({ data, update }: { data: any; update: (p: any) => void }) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="cd-var">Variável</Label>
        <Input id="cd-var" value={data.variable || ''} onChange={(e) => update({ variable: e.target.value })} placeholder="ex: opcao_escolhida" />
      </div>
      <div className="space-y-2">
        <Label>Operador</Label>
        <Select value={data.operator || 'equals'} onValueChange={(v) => update({ operator: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="equals">igual a</SelectItem>
            <SelectItem value="not_equals">diferente de</SelectItem>
            <SelectItem value="contains">contém</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cd-val">Valor</Label>
        <Input id="cd-val" value={data.value || ''} onChange={(e) => update({ value: e.target.value })} placeholder="ex: Boleto" />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Saídas: <span className="text-emerald-600 dark:text-emerald-400 font-medium">verdadeiro</span> e <span className="text-rose-600 dark:text-rose-400 font-medium">falso</span>.
      </p>
    </>
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
