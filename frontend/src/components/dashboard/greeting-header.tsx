'use client';

import { useAuth } from '@/contexts/auth-context';
import { motion } from 'framer-motion';

function getGreetingData(): { text: string; emoji: string } {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Bom dia', emoji: '☀️' };
  if (h < 18) return { text: 'Boa tarde', emoji: '🌤️' };
  return { text: 'Boa noite', emoji: '🌙' };
}

function getDayContext(): string {
  const day = new Date().getDay();
  if (day === 1) return 'Vamos começar a semana bem.';
  if (day === 5) return 'Último dia útil da semana.';
  if (day === 6 || day === 0) return 'Aproveite o fim de semana.';
  return 'Aqui está o resumo do seu dia.';
}

export function GreetingHeader() {
  const { user } = useAuth();
  if (!user) return null;

  const { text, emoji } = getGreetingData();
  const firstName = user.name.split(' ')[0];
  const context = getDayContext();

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg">{emoji}</span>
        <p className="text-[var(--font-size-body)] text-muted-foreground">
          {text},
        </p>
      </div>
      <h1 className="text-[var(--font-size-h1)] font-bold tracking-tight">
        <span className="text-foreground">{firstName}</span>
      </h1>
      <p className="text-[var(--font-size-caption)] text-muted-foreground mt-0.5">
        {context}
      </p>
    </motion.div>
  );
}