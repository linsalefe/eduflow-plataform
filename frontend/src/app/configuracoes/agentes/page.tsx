'use client';

import { useState, useEffect } from 'react';
import { Bot, Save, Info } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';

const AGENTS = [
  { key: 'whatsapp', label: 'Nat WhatsApp', description: 'Qualificação automática via WhatsApp' },
  { key: 'voice', label: 'Nat Voice', description: 'Ligação automática de qualificação' },
  { key: 'followup', label: 'Follow-up', description: 'Confirmação e lembretes de reunião' },
  { key: 'reactivation', label: 'Reativação', description: 'Recupera leads frios e no-shows' },
  { key: 'briefing', label: 'Briefing', description: 'Resumo do lead antes da reunião' },
];

export default function AgentesPage() {
  const [planFlags, setPlanFlags] = useState<Record<string, boolean>>({});
  const [agentFlags, setAgentFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [planRes, flagsRes] = await Promise.all([
          api.get('/tenant/agent-plan-flags'),
          api.get('/tenant/agent-flags'),
        ]);
        setPlanFlags(planRes.data);
        setAgentFlags(flagsRes.data);
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/tenant/agent-flags', agentFlags);
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
      <AppLayout>
        <div className="p-6 flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-[#6366f1] border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  const content = (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#6366f1]/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-[#818cf8]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Agentes IA</h1>
            <p className="text-sm text-gray-500">Configure quais agentes estão ativos no seu funil</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-[#6366f1] hover:bg-[#5558e3] text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
        </button>
      </div>

      {/* Agentes */}
      <div className="space-y-3">
        {AGENTS.map((agent) => {
          const available = planFlags[agent.key] ?? false;
          const active = agentFlags[agent.key] ?? false;

          return (
            <div
              key={agent.key}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all
                ${available
                  ? 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.1]'
                  : 'bg-white/[0.01] border-white/[0.03] opacity-50'
                }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center
                  ${active && available ? 'bg-[#6366f1]/20' : 'bg-white/[0.04]'}`}>
                  <Bot className={`w-4 h-4 ${active && available ? 'text-[#818cf8]' : 'text-gray-500'}`} />
                </div>
                <div>
                  <p className={`text-sm font-medium ${available ? 'text-white' : 'text-gray-500'}`}>
                    {agent.label}
                  </p>
                  <p className="text-xs text-gray-500">{agent.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {!available && (
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    <Info className="w-3 h-3" />
                    <span>Indisponível no plano</span>
                  </div>
                )}
                <button
                  onClick={() => handleToggle(agent.key)}
                  disabled={!available}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200
                    ${active && available ? 'bg-[#6366f1]' : 'bg-white/[0.1]'}
                    ${!available ? 'cursor-not-allowed' : 'cursor-pointer'}`}
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

      {/* Info */}
      <p className="mt-6 text-xs text-gray-600 flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5" />
        Agentes indisponíveis dependem do seu plano. Entre em contato para fazer upgrade.
      </p>
    </div>
  );

  return <AppLayout>{content}</AppLayout>;
}