'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import AppShell from '@/components/app-shell';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AutomacoesContent } from '../automacoes/page';
import { VoiceAIContent } from '../voice-ai/page';
import { AIConfigContent } from '../ai-config/page';
import { AgentesContent } from '../configuracoes/agentes/page';

const TABS = [
  { value: 'config-ia', label: 'Config. IA' },
  { value: 'agentes', label: 'Agentes IA' },
  { value: 'automacoes', label: 'Automações' },
  { value: 'voice-ai', label: 'Voice AI' },
];

function AutomacaoIAInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = searchParams.get('tab') || TABS[0].value;

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="max-w-7xl mx-auto pb-6">
      <div className="mb-5">
        <h1 className="text-[22px] font-medium text-foreground">Automação e IA</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Configure sua IA, agentes, automações e ligações por voz
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-5">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="config-ia" className="mt-0">
          <AIConfigContent />
        </TabsContent>

        <TabsContent value="agentes" className="mt-0">
          <AgentesContent />
        </TabsContent>

        <TabsContent value="automacoes" className="mt-0">
          <AutomacoesContent />
        </TabsContent>

        <TabsContent value="voice-ai" className="mt-0">
          <VoiceAIContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AutomacaoIAPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-4">Carregando...</div>}>
        <AutomacaoIAInner />
      </Suspense>
    </AppShell>
  );
}
