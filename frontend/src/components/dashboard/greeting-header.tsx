'use client';

import { useAuth } from '@/contexts/auth-context';

function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function GreetingHeader() {
  const { user } = useAuth();
  const firstName = (user?.name || '').split(' ')[0] || 'você';

  return (
    <div className="pt-1">
      <h1 className="text-[22px] font-medium text-foreground">
        {greetingByHour()}, {firstName}
      </h1>
    </div>
  );
}
