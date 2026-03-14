'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      className={cn('flex flex-col items-center justify-center py-20 px-4', className)}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Branded illustration container */}
      <div className="relative mb-6">
        {/* Background glow */}
        <div className="absolute inset-0 w-24 h-24 bg-primary/10 rounded-full blur-xl" />

        {/* Concentric circles */}
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 rounded-full border border-primary/10" />
          <div className="absolute inset-2 rounded-full border border-primary/[0.07]" />
          <div className="absolute inset-4 rounded-full bg-primary/[0.05]" />

          {/* Icon center */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm">
              <Icon className="h-6 w-6 text-primary" strokeWidth={1.75} />
            </div>
          </div>
        </div>
      </div>

      <h3 className="text-[15px] font-semibold text-foreground mb-1.5 text-center">
        {title}
      </h3>
      {description && (
        <p className="text-[var(--font-size-caption)] text-muted-foreground text-center max-w-[360px] leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} size="sm" className="mt-5 shadow-sm">
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}