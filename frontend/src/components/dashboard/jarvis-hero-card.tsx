'use client';

import { motion } from 'framer-motion';
import { Mic, Play } from 'lucide-react';

export function JarvisHeroCard() {
  const handleOpen = () => {
    window.dispatchEvent(new CustomEvent('jarvis:open'));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-[#378ADD]/50 bg-[#E6F1FB] px-5 py-4 sm:px-6 sm:py-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Ícone */}
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-[#1D4ED8] shadow-sm">
          <Mic className="h-6 w-6 text-white" strokeWidth={2} />
        </div>

        {/* Texto */}
        <div className="flex-1 min-w-0">
          <h2 className="text-[16px] sm:text-[17px] font-medium text-[#042C53] leading-tight">
            Pergunte ao Jarvis
          </h2>
          <p className="mt-1 text-[13px] sm:text-[14px] text-[#185FA5] leading-relaxed">
            &ldquo;Quais meus leads quentes?&rdquo; &middot; &ldquo;Tarefas de hoje?&rdquo; &middot; &ldquo;Pr&oacute;ximas reuni&otilde;es?&rdquo;
          </p>
        </div>

        {/* Botão */}
        <button
          onClick={handleOpen}
          className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-[#1E40AF] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/40 focus:ring-offset-2 focus:ring-offset-[#E6F1FB]"
          aria-label="Abrir o Jarvis e falar agora"
        >
          <Play className="h-3.5 w-3.5 fill-white" strokeWidth={2.5} />
          Falar agora
        </button>
      </div>
    </motion.div>
  );
}
