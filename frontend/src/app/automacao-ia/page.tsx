'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import AppShell from '@/components/app-shell';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AutomacoesContent } from '../automacoes/page';
import { VoiceAIContent } from '../voice-ai/page';
import { AIConfigContent } from '../ai-config/page';
import { AgentesContent } from '../configuracoes/agentes/page';
import { useAuth } from '@/contexts/auth-context';
import { LabListContent } from '../configuracoes/agentes/laboratorio/page';

const TABS = [
  { value: 'config-ia', label: 'Config. IA' },
  { value: 'agentes', label: 'Agentes IA' },
  { value: 'automacoes', label: 'Automações' },
  { value: 'voice-ai', label: 'Voice AI' },
  { value: 'laboratorio', label: 'Laboratório', adminOnly: true },
];

function AutomacaoIAInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);
  const activeTab = searchParams.get('tab') || TABS[0].value;
  const effectiveTab = visibleTabs.some((t) => t.value === activeTab)
    ? activeTab
    : TABS[0].value;

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

      <Tabs value={effectiveTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-5">
          {visibleTabs.map((tab) => (
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

        {isAdmin && (
          <TabsContent value="laboratorio" className="mt-0">
            <LabListContent />
          </TabsContent>
        )}
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
