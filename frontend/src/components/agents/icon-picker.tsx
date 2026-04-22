'use client';

import { AGENT_ICONS } from '@/lib/agent-icons';
import { cn } from '@/lib/utils';

export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 p-2 border rounded-lg bg-card">
      {AGENT_ICONS.map(({ name, icon: Icon, label }) => (
        <button
          key={name}
          type="button"
          onClick={() => onChange(name)}
          className={cn(
            'w-full aspect-square rounded-lg flex items-center justify-center transition-all',
            value === name
              ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background'
              : 'hover:bg-muted text-muted-foreground hover:text-foreground',
          )}
          title={label}
        >
          <Icon className="w-5 h-5" />
        </button>
      ))}
    </div>
  );
}
