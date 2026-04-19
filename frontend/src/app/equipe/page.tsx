'use client';

import AppShell from '@/components/app-shell';
import { UsersContent } from '../users/page';

export default function EquipePage() {
  return (
    <AppShell>
      <div className="max-w-7xl mx-auto pb-6">
        <UsersContent />
      </div>
    </AppShell>
  );
}
