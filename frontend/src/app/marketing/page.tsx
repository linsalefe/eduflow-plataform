'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import AppShell from '@/components/app-shell';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LandingPagesContent } from '../landing-pages/page';
import { RelatoriosContent } from '../relatorios/page';

const TABS = [
  { value: 'landing-pages', label: 'Landing Pages' },
  { value: 'relatorios', label: 'Relatórios' },
];

function MarketingInner() {
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
        <h1 className="text-[22px] font-medium text-foreground">Marketing</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Landing pages e relatórios
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

        <TabsContent value="landing-pages" className="mt-0">
          <LandingPagesContent />
        </TabsContent>

        <TabsContent value="relatorios" className="mt-0">
          <RelatoriosContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function MarketingPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-4">Carregando...</div>}>
        <MarketingInner />
      </Suspense>
    </AppShell>
  );
}
