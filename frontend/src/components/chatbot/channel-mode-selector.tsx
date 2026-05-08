'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles, Workflow, CircleSlash, Loader2, AlertTriangle, ChevronRight, Bot,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export type OperationMode = 'ai' | 'chatbot' | 'none';

export interface ChannelModeState {
  operation_mode: OperationMode;
  active_chatbot_flow_id: number | null;
  active_chatbot_flow_name?: string | null;
}

export interface PublishedFlow {
  id: number;
  name: string;
}

type Backend409Detail =
  | {
      code: 'isolated_ai_active';
      message: string;
      ai_config: { id: number; name: string; model?: string };
      requires_confirmation: true;
    }
  | {
      code: 'channel_in_chatbot_mode';
      message: string;
      channel: { id: number; name: string; operation_mode: string; active_chatbot_flow_id: number | null };
      requires_confirmation: true;
    };

interface PendingTransition {
  nextMode: OperationMode;
  finalFlowId: number | null;
  detail: Backend409Detail;
}

interface Props {
  channelId: number;
  channelName: string;
  mode: ChannelModeState;
  publishedFlows: PublishedFlow[];
  onChange: (next: ChannelModeState) => void;
}

const MODES: {
  value: OperationMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
  iconColor: string;
}[] = [
  {
    value: 'ai',
    label: 'IA',
    icon: Sparkles,
    activeClass: 'bg-white shadow-sm text-violet-700 dark:text-violet-300',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    value: 'chatbot',
    label: 'Workflow',
    icon: Workflow,
    activeClass: 'bg-white shadow-sm text-indigo-700 dark:text-indigo-300',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
  },
  {
    value: 'none',
    label: 'Nenhum',
    icon: CircleSlash,
    activeClass: 'bg-white shadow-sm text-gray-700 dark:text-gray-300',
    iconColor: 'text-gray-500',
  },
];

export function ChannelModeSelector({
  channelId, channelName, mode, publishedFlows, onChange,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingTransition | null>(null);
  const hasPublished = publishedFlows.length > 0;

  const apply = async (nextMode: OperationMode, flowId?: number | null) => {
    if (saving) return;

    if (nextMode === 'chatbot' && !flowId && !hasPublished) {
      toast.error('Publique um workflow antes de ativar neste canal');
      return;
    }

    let finalFlowId: number | null = null;
    if (nextMode === 'chatbot') {
      finalFlowId = flowId ?? mode.active_chatbot_flow_id ?? publishedFlows[0]?.id ?? null;
      if (!finalFlowId) return;
    }

    // Tenta primeiro SEM force; backend retorna 409 com detalhes se houver conflito
    await applyMode(nextMode, finalFlowId, false);
  };

  const applyMode = async (nextMode: OperationMode, finalFlowId: number | null, force: boolean) => {
    setSaving(true);
    try {
      const res = await api.put(`/chatbot/channels/${channelId}/mode`, {
        operation_mode: nextMode,
        active_chatbot_flow_id: nextMode === 'chatbot' ? finalFlowId : null,
        force,
      });
      const chosenFlow = publishedFlows.find((f) => f.id === finalFlowId);
      onChange({
        operation_mode: res.data.operation_mode,
        active_chatbot_flow_id: res.data.active_chatbot_flow_id,
        active_chatbot_flow_name: chosenFlow?.name ?? null,
      });
      toast.success('Modo atualizado');
      setPending(null);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: any } } };
      const status = e.response?.status;
      const detail = e.response?.data?.detail;
      if (status === 409 && detail && typeof detail === 'object' && detail.requires_confirmation) {
        setPending({ nextMode, finalFlowId, detail: detail as Backend409Detail });
        setSaving(false);
        return;
      }
      const msg = typeof detail === 'string' ? detail : 'Erro ao atualizar modo';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const confirmPending = async () => {
    if (!pending) return;
    await applyMode(pending.nextMode, pending.finalFlowId, true);
  };

  const cancelPending = () => setPending(null);

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-border/50">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-gray-600 dark:text-muted-foreground">
            Modo de operação
          </span>
          {saving && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
        </div>

        <div
          role="tablist"
          aria-label={`Modo de operação de ${channelName}`}
          className="inline-flex rounded-lg bg-gray-100 dark:bg-muted p-1 gap-0.5"
        >
          {MODES.map((m) => {
            const active = mode.operation_mode === m.value;
            const Icon = m.icon;
            return (
              <button
                key={m.value}
                role="tab"
                aria-selected={active}
                onClick={() => apply(m.value)}
                disabled={saving}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md transition-all whitespace-nowrap',
                  active
                    ? m.activeClass
                    : 'text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground',
                  saving && 'opacity-60 cursor-not-allowed',
                )}
              >
                <Icon className={cn('w-3.5 h-3.5', active ? m.iconColor : '')} />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {mode.operation_mode === 'chatbot' && (
        <div className="mt-3">
          {hasPublished ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-gray-500 dark:text-muted-foreground">Fluxo ativo:</span>
              <select
                value={mode.active_chatbot_flow_id || ''}
                onChange={(e) => apply('chatbot', Number(e.target.value))}
                disabled={saving}
                className="px-2.5 py-1 text-[12px] bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border rounded-md text-gray-700 dark:text-foreground focus:outline-none focus:border-primary cursor-pointer disabled:opacity-60"
              >
                {publishedFlows.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <Link href="/workflows" className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline">
                Gerenciar <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          ) : (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-800 dark:text-amber-200 leading-snug">
                Você não tem workflows publicados.{' '}
                <Link href="/workflows" className="font-semibold underline">Criar um agora &rarr;</Link>
              </div>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && cancelPending()}>
        <AlertDialogContent>
          {pending?.detail.code === 'isolated_ai_active' && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-blue-600" />
                  Desativar o agente IA atual?
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">
                    Este canal tem o agente IA <strong className="font-semibold text-foreground">{pending.detail.ai_config.name}</strong> ativo.
                  </span>
                  <span className="block">
                    Ao ativar o workflow, o agente IA vai ser desativado e parar de responder.
                    Você pode reabilitá-lo depois pela tela de Agentes.
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={cancelPending}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmPending} className="bg-emerald-600 hover:bg-emerald-700">
                  Sim, ativar workflow
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {pending?.detail.code === 'channel_in_chatbot_mode' && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <Workflow className="w-5 h-5 text-emerald-600" />
                  Desativar o workflow atual?
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">
                    Este canal está rodando um workflow. Ao trocar pra modo &ldquo;Agente IA&rdquo;,
                    o workflow vai ser desativado e as sessões em andamento canceladas.
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={cancelPending}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmPending} className="bg-emerald-600 hover:bg-emerald-700">
                  Sim, trocar pra IA
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
