'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  badge,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <motion.div
      className={cn('flex items-start justify-between', className)}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-[var(--font-size-h1)] font-bold text-foreground tracking-tight">
            {title}
          </h1>
          {badge && (
            <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="text-[var(--font-size-caption)] text-muted-foreground mt-1 max-w-lg">
            {description}
          </p>
        )}
      </div>
      {(actions || children) && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions || children}
        </div>
      )}
    </motion.div>
  );
}