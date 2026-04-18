'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Video, Pencil, GitBranch, ChevronLeft, ChevronRight, X } from 'lucide-react';

const STORAGE_KEY = 'eduflow_whats_new_v1';
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

const slides = [
  {
    icon: Video,
    title: 'Envie Vídeos pelo WhatsApp',
    description:
      'Agora você pode enviar e receber vídeos diretamente pelas conversas. Os vídeos são armazenados por 24h com thumbnail automático para economizar espaço.',
    badge: 'NOVO',
    badgeClass: 'bg-green-100 text-green-700',
    iconClass: 'bg-green-100 text-green-600',
  },
  {
    icon: Pencil,
    title: 'Edite Notas na Pipeline',
    description:
      'Clique em qualquer lead na pipeline e edite as observações diretamente. Sem precisar sair da página — rápido e prático.',
    badge: 'NOVO',
    badgeClass: 'bg-blue-100 text-blue-700',
    iconClass: 'bg-blue-100 text-blue-600',
  },
  {
    icon: GitBranch,
    title: 'Funis de Vendas com IA',
    description:
      'Crie funis personalizados para cada área: comercial, financeiro, suporte. Vincule canais e agentes de IA específicos para cada funil com automações independentes.',
    badge: 'NOVO',
    badgeClass: 'bg-purple-100 text-purple-700',
    iconClass: 'bg-purple-100 text-purple-600',
  },
];

function shouldShow(): boolean {
  if (typeof window === 'undefined') return false;
  const value = localStorage.getItem(STORAGE_KEY);
  if (!value) return true;
  if (value === 'dismissed') return false;
  const timestamp = Number(value);
  if (isNaN(timestamp)) return true;
  return Date.now() - timestamp < TWENTY_FOUR_HOURS;
}

export function WhatsNewModal() {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    setVisible(shouldShow());
    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'dismissed');
    setVisible(false);
  };

  const close = () => setVisible(false);

  const goTo = (index: number) => {
    if (animating || index === current) return;
    setDirection(index > current ? 'right' : 'left');
    setAnimating(true);
    setTimeout(() => {
      setCurrent(index);
      setAnimating(false);
    }, 200);
  };

  const next = () => {
    if (current === slides.length - 1) {
      close();
    } else {
      goTo(current + 1);
    }
  };

  const prev = () => {
    if (current > 0) goTo(current - 1);
  };

  const slide = slides[current];
  const Icon = slide.icon;
  const isLast = current === slides.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Close button */}
        <button
          onClick={close}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2 px-6 pt-6 pb-2">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-bold text-gray-900">Novidades do EduFlow</h2>
        </div>

        {/* Slide content */}
        <div className="px-6 py-6 min-h-[220px] flex items-center">
          <div
            className={`w-full transition-all duration-200 ease-in-out ${
              animating
                ? direction === 'right'
                  ? 'opacity-0 translate-x-4'
                  : 'opacity-0 -translate-x-4'
                : 'opacity-100 translate-x-0'
            }`}
          >
            <div className="flex flex-col items-center text-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${slide.iconClass}`}>
                <Icon className="w-7 h-7" />
              </div>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${slide.badgeClass}`}>
                {slide.badge}
              </span>
              <h3 className="text-xl font-bold text-gray-900">{slide.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed max-w-sm">{slide.description}</p>
            </div>
          </div>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 pb-4">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === current ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-6">
          <button
            onClick={dismiss}
            className="text-gray-400 text-sm hover:text-gray-600 transition-colors"
          >
            Não mostrar novamente
          </button>
          <div className="flex gap-2">
            {current > 0 && (
              <button
                onClick={prev}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
            )}
            <button
              onClick={next}
              className="flex items-center gap-1 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
            >
              {isLast ? (
                'Entendi!'
              ) : (
                <>
                  Próximo
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
