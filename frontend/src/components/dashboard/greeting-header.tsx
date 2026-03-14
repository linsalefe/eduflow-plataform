'use client';

import { useAuth } from '@/contexts/auth-context';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function GreetingHeader() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div>
      <p className="text-[var(--font-size-caption)] text-muted-foreground mb-0.5">
        {getGreeting()},
      </p>
      <h1 className="text-[var(--font-size-h1)] font-semibold text-foreground tracking-tight">
        {user.name.split(' ')[0]}
      </h1>
    </div>
  );
}