'use client';

import { useState, useEffect } from 'react';
import { Bot, Save, Info, Zap, ChevronDown, MessageSquare, RotateCcw, ArrowRight } from 'lucide-react';
import AppShell from "@/components/app-shell";;
import api from '@/lib/api';

const AGENTS = [
  { key: 'whatsapp', label: 'Nat WhatsApp', description: 'Qualificação automática via WhatsApp' },
  { key: 'voice', label: 'Nat Voice', description: 'Ligação automática de qualificação' },
  { key: 'followup', label: 'Follow-up', description: 'Confirmação e lembretes de reunião' },
  { key: 'reactivation', label: 'Reativação', description: 'Recupera leads frios e no-shows' },
  { key: 'briefing', label: 'Briefing', description: 'Resumo do lead antes da reunião' },
];

const TRIGGER_AGENTS = [
  { key: 'followup', label: 'Follow-up' },
  { key: 'reactivation', label: 'Reativação' },
  { key: 'whatsapp', label: 'Nat WhatsApp' },
  { key: 'voice', label: 'Nat Voice' },
];

const VARIABLES_INFO = 'Variáveis disponíveis: {nome}, {data}, {hora}, {interesse}, {empresa}';

const DEFAULT_MESSAGES = {
  followup: {
    confirmation: 'Oi {nome}! 😊 Ficou confirmado o nosso bate-papo para *{data} às {hora}*. Qualquer dúvida pode me chamar aqui. Até lá! 👋',
    reminder_d1: 'Oi {nome}! 😊 Só passando para lembrar que amanhã temos nosso bate-papo agendado para às {hora}. Te espero lá!',
    reminder_d0: 'Oi {nome}! 🎯 Daqui a pouco temos nosso bate-papo! Esteja à vontade para tirar todas as suas dúvidas. Até já! 😊',
  },
  reactivation: {
    no_show: 'Oi {nome}! Vi que não conseguiu no horário combinado. Sem problemas! Quer remarcar? 😊',
    no_answer: 'Oi {nome}! Tentei te contatar algumas vezes mas não consegui falar. Posso te ajudar de outra forma?',
    cold: 'Oi {nome}! Tudo bem? Passando para saber se ainda tem interesse. Posso te contar mais detalhes? 😊',
  },
  briefing: {
    prompt: 'Gere um briefing objetivo sobre o lead para a consultora usar na reunião. Destaque motivação, perfil e principais pontos de atenção. Seja direto e prático.',
  },
};

interface KanbanColumn {
  key: string;
  label: string;
  color: string;
  order: number;
}

interface KanbanTrigger {
  agent: string;
  delay: number;
  active: boolean;
}

interface AgentMessages {
  followup: { confirmation: string; reminder_d1: string; reminder_d0: string };
  reactivation: { no_show: string; no_answer: string; cold: string };
  briefing: { prompt: string };
}

export default function AgentesPage() {
  const [planFlags, setPlanFlags] = useState<Record<string, boolean>>({});
  const [agentFlags, setAgentFlags] = useState<Record<string, boolean>>({});
  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumn[]>([]);
  const [kanbanTriggers, setKanbanTriggers] = useState<Record<string, KanbanTrigger>>({});
  const [agentMessages, setAgentMessages] = useState<AgentMessages>(DEFAULT_MESSAGES);
  const [pipelineMoves, setPipelineMoves] = useState<Record<string, string>>({ on_first_contact: 'em_contato', on_schedule_call: 'qualificado' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [planRes, flagsRes, columnsRes, triggersRes, messagesRes, movesRes] = await Promise.all([
          api.get('/tenant/agent-plan-flags'),
          api.get('/tenant/agent-flags'),
          api.get('/tenant/kanban-columns'),
          api.get('/tenant/kanban-triggers'),
          api.get('/tenant/agent-messages'),
          api.get('/tenant/agent-pipeline-moves'),
        ]);
        setPlanFlags(planRes.data);
        setAgentFlags(flagsRes.data);
        const sorted = [...columnsRes.data].sort((a: KanbanColumn, b: KanbanColumn) => a.order - b.order);
        setKanbanColumns(sorted);
        setKanbanTriggers(triggersRes.data || {});
        
        const msgs = messagesRes.data || {};
        setAgentMessages({
          followup: { ...DEFAULT_MESSAGES.followup, ...(msgs.followup || {}) },
          reactivation: { ...DEFAULT_MESSAGES.reactivation, ...(msgs.reactivation || {}) },
          briefing: { ...DEFAULT_MESSAGES.briefing, ...(msgs.briefing || {}) },
        });

        setPipelineMoves(movesRes.data || { on_first_contact: 'em_contato', on_schedule_call: 'qualificado' });
      } catch (err) {
        console.error('Erro ao carregar configurações de agentes', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleToggle = (key: string) => {
    if (!planFlags[key]) return;
    setAgentFlags(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTriggerChange = (columnKey: string, field: keyof KanbanTrigger, value: any) => {
    setKanbanTriggers(prev => ({
      ...prev,
      [columnKey]: {
        agent: prev[columnKey]?.agent || '',
        delay: prev[columnKey]?.delay || 0,
        active: prev[columnKey]?.active || false,
        [field]: value,
      },
    }));
  };

  const handleMessageChange = (agent: keyof AgentMessages, field: string, value: string) => {
    setAgentMessages(prev => ({
      ...prev,
      [agent]: { ...prev[agent], [field]: value },
    }));
  };

  const handleReset = (agent: keyof AgentMessages, field: string) => {
    const defaultValue = (DEFAULT_MESSAGES[agent] as any)[field];
    handleMessageChange(agent, field, defaultValue);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        api.put('/tenant/agent-flags', agentFlags),
        api.put('/tenant/kanban-triggers', kanbanTriggers),
        api.put('/tenant/agent-messages', agentMessages),
        api.put('/tenant/agent-pipeline-moves', pipelineMoves),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Erro ao salvar', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="p-6 flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  const MessageField = ({
    label, value, agent, field, rows = 3
  }: {
    label: string; value: string; agent: keyof AgentMessages; field: string; rows?: number;
  }) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-500">{label}</label>
        <button
          onClick={() => handleReset(agent, field)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Restaurar padrão
        </button>
      </div>
      <textarea
        value={value}
        onChange={e => handleMessageChange(agent, field, e.target.value)}
        rows={rows}
        className="w-full px-3 py-2.5 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 leading-relaxed"
      />
    </div>
  );

  const content = (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-[#60a5fa]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Agentes IA</h1>
            <p className="text-sm text-gray-500">Configure quais agentes estão ativos no seu funil</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-[#5558e3] text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : saved ? 'Salvo! ✓' : 'Salvar'}
        </button>
      </div>

      {/* ── Seção 1: Toggles dos agentes ── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Agentes ativos</h2>
        <div className="space-y-2">
          {AGENTS.map((agent) => {
            const available = planFlags[agent.key] ?? false;
            const active = agentFlags[agent.key] ?? false;
            return (
              <div
                key={agent.key}
                className={`flex items-center justify-between p-4 rounded-xl border transition-all
                  ${available ? 'bg-white border-gray-100 hover:border-gray-200' : 'bg-gray-50 border-gray-100 opacity-50'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${active && available ? 'bg-primary/10' : 'bg-gray-100'}`}>
                    <Bot className={`w-4 h-4 ${active && available ? 'text-[#60a5fa]' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${available ? 'text-gray-900' : 'text-gray-400'}`}>{agent.label}</p>
                    <p className="text-xs text-gray-500">{agent.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {!available && (
                    <div className="hidden sm:flex items-center gap-1 text-xs text-gray-400">
                      <Info className="w-3 h-3" />
                      <span>Indisponível no plano</span>
                    </div>
                  )}
                  <button
                    onClick={() => handleToggle(agent.key)}
                    disabled={!available}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200
                      ${active && available ? 'bg-primary' : 'bg-gray-200'}
                      ${!available ? 'serviçor-not-allowed' : 'serviçor-pointer'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200
                      ${active && available ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-gray-400 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />
          Agentes indisponíveis dependem do seu plano. Entre em contato para fazer upgrade.
        </p>
      </div>

      {/* ── Seção 2: Triggers por coluna do Kanban ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-gray-700">Triggers do Pipeline</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Configure qual agente é acionado automaticamente quando um lead entra em cada coluna do pipeline.
        </p>
        {kanbanColumns.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">Nenhuma coluna configurada no pipeline.</div>
        ) : (
          <div className="space-y-2">
            {kanbanColumns.map((col) => {
              const trigger = kanbanTriggers[col.key];
              const isActive = trigger?.active || false;
              const selectedAgent = trigger?.agent || '';
              const delay = trigger?.delay || 0;
              return (
                <div key={col.key} className={`rounded-xl border transition-all ${isActive ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="flex items-center gap-3 p-4">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                    <p className="text-sm font-medium text-gray-700 flex-1 min-w-0 truncate">{col.label}</p>
                    {isActive && <span className="text-gray-300 text-xs flex-shrink-0">→</span>}
                    <div className="relative flex-shrink-0">
                      <select
                        value={selectedAgent}
                        onChange={e => handleTriggerChange(col.key, 'agent', e.target.value)}
                        disabled={!isActive}
                        className={`appearance-none text-xs font-medium px-3 py-1.5 pr-7 rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-200
                          ${isActive ? 'bg-white border-gray-200 text-gray-700 serviçor-pointer' : 'bg-gray-100 border-transparent text-gray-400 serviçor-not-allowed'}`}
                      >
                        <option value="">Nenhum agente</option>
                        {TRIGGER_AGENTS.map(a => (
                          <option key={a.key} value={a.key} disabled={!(planFlags[a.key] ?? false)}>
                            {a.label}{!(planFlags[a.key] ?? false) ? ' (indisponível)' : ''}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                    {isActive && selectedAgent && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <input
                          type="number" min={0} max={1440} value={delay}
                          onChange={e => handleTriggerChange(col.key, 'delay', Number(e.target.value))}
                          className="w-14 text-xs text-center border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        <span className="text-xs text-gray-400">min</span>
                      </div>
                    )}
                    <button
                      onClick={() => handleTriggerChange(col.key, 'active', !isActive)}
                      className={`relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${isActive ? 'bg-amber-400' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-gray-400 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />
          O campo "min" define o atraso em minutos antes do agente ser acionado. Use 0 para disparar imediatamente.
        </p>
      </div>

      {/* ── Seção 3: Movimentação Automática ── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ArrowRight className="w-4 h-4 text-emerald-500" />
          <h2 className="text-sm font-semibold text-gray-700">Movimentação Automática</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Configure para qual coluna do pipeline a IA move o lead automaticamente em cada etapa.
        </p>
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">Primeiro contato da IA</label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-32">Mover lead para →</span>
              <div className="relative flex-1">
                <select
                  value={pipelineMoves.on_first_contact || ''}
                  onChange={e => setPipelineMoves(prev => ({ ...prev, on_first_contact: e.target.value }))}
                  className="w-full appearance-none text-sm font-medium px-3 py-2 pr-8 rounded-xl border border-gray-200 bg-white text-gray-700 serviçor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="">Não mover</option>
                  {kanbanColumns.map(col => (
                    <option key={col.key} value={col.key}>{col.label}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">Reunião agendada pela IA</label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-32">Mover lead para →</span>
              <div className="relative flex-1">
                <select
                  value={pipelineMoves.on_schedule_call || ''}
                  onChange={e => setPipelineMoves(prev => ({ ...prev, on_schedule_call: e.target.value }))}
                  className="w-full appearance-none text-sm font-medium px-3 py-2 pr-8 rounded-xl border border-gray-200 bg-white text-gray-700 serviçor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="">Não mover</option>
                  {kanbanColumns.map(col => (
                    <option key={col.key} value={col.key}>{col.label}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-400 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />
          Selecione "Não mover" se não quiser que a IA altere a coluna do lead nessa etapa.
        </p>
      </div>

      {/* ── Seção 4: Mensagens dos agentes ── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-4 h-4 text-indigo-500" />
          <h2 className="text-sm font-semibold text-gray-700">Mensagens dos Agentes</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">{VARIABLES_INFO}</p>

        <div className="space-y-4">

          {/* Follow-up */}
          {(planFlags['followup']) && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-700">📋 Follow-up</p>
              <MessageField label="Confirmação (enviada logo após qualificação)" value={agentMessages.followup.confirmation} agent="followup" field="confirmation" rows={3} />
              <MessageField label="Lembrete D-1 (dia anterior às 9h)" value={agentMessages.followup.reminder_d1} agent="followup" field="reminder_d1" rows={2} />
              <MessageField label="Lembrete D-0 (2h antes da reunião)" value={agentMessages.followup.reminder_d0} agent="followup" field="reminder_d0" rows={2} />
            </div>
          )}

          {/* Reativação */}
          {(planFlags['reactivation']) && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-700">🔄 Reativação</p>
              <MessageField label="No-show (lead não apareceu na reunião)" value={agentMessages.reactivation.no_show} agent="reactivation" field="no_show" rows={2} />
              <MessageField label="Sem resposta (após múltiplas tentativas)" value={agentMessages.reactivation.no_answer} agent="reactivation" field="no_answer" rows={2} />
              <MessageField label="Lead frio (7 dias sem movimentação)" value={agentMessages.reactivation.cold} agent="reactivation" field="cold" rows={2} />
            </div>
          )}

          {/* Briefing */}
          {(planFlags['briefing']) && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-700">✨ Briefing</p>
              <MessageField label="Prompt para geração do briefing (enviado à consultora 15min antes)" value={agentMessages.briefing.prompt} agent="briefing" field="prompt" rows={4} />
            </div>
          )}

          {!planFlags['followup'] && !planFlags['reactivation'] && !planFlags['briefing'] && (
            <div className="text-center py-8 text-gray-400 text-sm">
              Nenhum agente disponível no seu plano para configurar mensagens.
            </div>
          )}

        </div>
      </div>

    </div>
  );

  return <AppShell>{content}</AppShell>;
}