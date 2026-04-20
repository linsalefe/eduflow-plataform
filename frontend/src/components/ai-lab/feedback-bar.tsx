'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Pencil, Loader2, X } from 'lucide-react';

// ── Types ──────────────────────────────────────────────
export interface FeedbackData {
  id: number;
  rating: 'up' | 'down' | 'edit';
  reason: string | null;
  corrected_response: string | null;
}

export interface FeedbackSavePayload {
  rating: 'up' | 'down' | 'edit';
  reason?: string;
  corrected_response?: string;
}

interface FeedbackBarProps {
  messageId: number;
  currentFeedback: FeedbackData | null;
  defaultAiResponse: string;
  saving: boolean;
  onSave: (payload: FeedbackSavePayload) => Promise<void>;
  onDelete: (feedbackId: number) => Promise<void>;
}

const REASONS: Array<{ value: string; label: string }> = [
  { value: 'tom_errado', label: 'tom errado' },
  { value: 'info_errada', label: 'info errada' },
  { value: 'avancou_rapido', label: 'avancou rapido' },
  { value: 'parou_cedo', label: 'parou cedo' },
  { value: 'outro', label: 'outro' },
];

// ── Component ──────────────────────────────────────────
export function FeedbackBar({
  messageId,
  currentFeedback,
  defaultAiResponse,
  saving,
  onSave,
  onDelete,
}: FeedbackBarProps) {
  const [expanded, setExpanded] = useState<'none' | 'down' | 'edit'>('none');
  const [reason, setReason] = useState<string>(currentFeedback?.reason || '');
  const [correctedText, setCorrectedText] = useState<string>(
    currentFeedback?.corrected_response || defaultAiResponse || ''
  );

  const activeRating = currentFeedback?.rating;

  const closeExpanded = () => {
    setExpanded('none');
    setReason(currentFeedback?.reason || '');
    setCorrectedText(currentFeedback?.corrected_response || defaultAiResponse || '');
  };

  const handleQuickUp = async () => {
    await onSave({ rating: 'up' });
    setExpanded('none');
  };

  const handleSaveDown = async () => {
    if (!reason) return;
    await onSave({ rating: 'down', reason });
    setExpanded('none');
  };

  const handleSaveEdit = async () => {
    const trimmed = correctedText.trim();
    if (!trimmed) return;
    await onSave({ rating: 'edit', corrected_response: trimmed });
    setExpanded('none');
  };

  const handleUndo = async () => {
    if (!currentFeedback) return;
    await onDelete(currentFeedback.id);
    setExpanded('none');
  };

  const baseBtn =
    'px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border inline-flex items-center gap-1';
  const inactiveBtn = 'bg-transparent text-[#8696a0] border-[#2a3942] hover:border-[#374248]';
  const activeUp = 'bg-emerald-900/40 text-emerald-300 border-emerald-700';
  const activeDown = 'bg-red-900/40 text-red-300 border-red-700';
  const activeEdit = 'bg-blue-900/40 text-blue-300 border-blue-700';

  return (
    <div className="mt-1 max-w-[72%] ml-auto">
      <div className="bg-[#1a2520] rounded-lg px-2.5 py-2">
        {/* 3 botoes — sempre visiveis */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            disabled={saving}
            onClick={activeRating === 'up' ? handleUndo : handleQuickUp}
            className={`${baseBtn} ${activeRating === 'up' ? activeUp : inactiveBtn}`}
            title={activeRating === 'up' ? 'Clique para desfazer' : 'Aprovar resposta'}
          >
            <ThumbsUp className="w-3 h-3" />
            Gostei
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => setExpanded(expanded === 'down' ? 'none' : 'down')}
            className={`${baseBtn} ${activeRating === 'down' || expanded === 'down' ? activeDown : inactiveBtn}`}
          >
            <ThumbsDown className="w-3 h-3" />
            Problema
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => setExpanded(expanded === 'edit' ? 'none' : 'edit')}
            className={`${baseBtn} ${activeRating === 'edit' || expanded === 'edit' ? activeEdit : inactiveBtn}`}
          >
            <Pencil className="w-3 h-3" />
            Eu teria dito assim
          </button>

          {activeRating && expanded === 'none' && (
            <button
              type="button"
              disabled={saving}
              onClick={handleUndo}
              className="ml-auto text-[10px] text-[#8696a0] hover:text-[#e9edef] underline"
            >
              {saving ? 'removendo...' : 'desfazer'}
            </button>
          )}
        </div>

        {/* Bloco expandido DOWN */}
        {expanded === 'down' && (
          <div className="mt-2 pt-2 border-t border-[#2a3942]">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] text-[#8696a0]">Qual foi o problema?</p>
              <button
                onClick={closeExpanded}
                className="text-[#8696a0] hover:text-[#e9edef]"
                aria-label="Fechar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex gap-1 flex-wrap mb-2">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  disabled={saving}
                  onClick={() => setReason(r.value)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] border transition-colors ${
                    reason === r.value
                      ? 'bg-red-900/40 text-red-300 border-red-700'
                      : 'bg-[#2a3942] text-[#e9edef] border-[#2a3942] hover:border-[#374248]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleSaveDown}
              disabled={saving || !reason}
              className="w-full py-1.5 bg-primary text-white text-xs font-medium rounded-md hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Salvar avaliacao
            </button>
          </div>
        )}

        {/* Bloco expandido EDIT */}
        {expanded === 'edit' && (
          <div className="mt-2 pt-2 border-t border-[#2a3942]">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] text-[#8696a0]">Como voce responderia?</p>
              <button
                onClick={closeExpanded}
                className="text-[#8696a0] hover:text-[#e9edef]"
                aria-label="Fechar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              value={correctedText}
              onChange={(e) => setCorrectedText(e.target.value)}
              rows={3}
              placeholder="Escreva como a IA deveria ter respondido..."
              className="w-full bg-[#0b141a] border border-[#378ADD] rounded-md px-2.5 py-2 text-[12.5px] text-[#e9edef] placeholder:text-[#4a5a64] focus:outline-none focus:ring-1 focus:ring-[#378ADD] resize-none"
            />
            <div className="flex gap-1.5 mt-2">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={saving || !correctedText.trim()}
                className="flex-1 py-1.5 bg-primary text-white text-xs font-medium rounded-md hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                Salvar correcao
              </button>
              <button
                type="button"
                onClick={closeExpanded}
                disabled={saving}
                className="px-3 py-1.5 bg-transparent text-[#8696a0] border border-[#2a3942] rounded-md text-xs hover:border-[#374248]"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Preview do feedback salvo quando fechado */}
        {activeRating === 'down' && expanded === 'none' && currentFeedback?.reason && (
          <p className="mt-1.5 text-[10.5px] text-red-300/80">
            Motivo: {REASONS.find((r) => r.value === currentFeedback.reason)?.label || currentFeedback.reason}
          </p>
        )}
        {activeRating === 'edit' && expanded === 'none' && currentFeedback?.corrected_response && (
          <p className="mt-1.5 text-[10.5px] text-blue-300/80 italic line-clamp-2">
            &ldquo;{currentFeedback.corrected_response}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}
