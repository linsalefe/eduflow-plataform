'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import AppShell from '@/components/app-shell';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ContaContent } from './conta/page';
import { IntegracoesContent } from '../integracoes/page';
import { SuporteContent } from '../suporte/page';
import { MensagensProntasContent } from './mensagens-prontas/page';

const TABS = [
  { value: 'conta', label: 'Minha conta' },
  { value: 'mensagens-prontas', label: 'Mensagens prontas' },
  { value: 'integracoes', label: 'Integrações' },
  { value: 'suporte', label: 'Central de ajuda' },
];

function ConfiguracoesInner() {
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
        <h1 className="text-[22px] font-medium text-foreground">Configurações</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Sua conta, mensagens prontas, integrações e central de ajuda
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

        <TabsContent value="conta" className="mt-0">
          <ContaContent />
        </TabsContent>

        <TabsContent value="mensagens-prontas" className="mt-0">
          <MensagensProntasContent />
        </TabsContent>

        <TabsContent value="integracoes" className="mt-0">
          <IntegracoesContent />
        </TabsContent>

        <TabsContent value="suporte" className="mt-0">
          <SuporteContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ConfiguracoesPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-4">Carregando...</div>}>
        <ConfiguracoesInner />
      </Suspense>
    </AppShell>
  );
}
