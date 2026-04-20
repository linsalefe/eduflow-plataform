'use client';

import { useState } from 'react';
import { Brain, X, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import type { AIMemory } from '@/types/conversations';

interface MemoryPanelProps {
  waId: string;
  memory: AIMemory | null | undefined;
  updatedAt: string | null | undefined;
  onUpdate: (newMemory: AIMemory, updatedAt: string | null) => void;
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffMin = Math.round((now - then) / 60000);
    if (diffMin < 1) return 'agora mesmo';
    if (diffMin < 60) return `há ${diffMin} min`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `há ${diffH}h`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 30) return `há ${diffD} dia${diffD > 1 ? 's' : ''}`;
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return 'nunca';
  }
}

function countItems(mem: AIMemory | null | undefined): number {
  if (!mem) return 0;
  return (
    (mem.personal_facts?.length || 0) +
    (mem.preferences?.length || 0) +
    (mem.objections?.length || 0) +
    (mem.journey_context ? 1 : 0)
  );
}

export function MemoryPanel({ waId, memory, updatedAt, onUpdate }: MemoryPanelProps) {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  const canEdit = user?.role === 'admin';
  const total = countItems(memory);
  const factsCount = memory?.personal_facts?.length || 0;
  const prefsCount = memory?.preferences?.length || 0;
  const objsCount = memory?.objections?.length || 0;
  const hasJourney = Boolean(memory?.journey_context);

  return (
    <>
      <div className="pb-4 border-b border-[#2a3942]">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-[#8696a0] uppercase tracking-wider flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5" /> Memória da IA
          </p>
          {canEdit && (
            <button
              onClick={() => setModalOpen(true)}
              className="text-[12px] text-[#00a884] font-medium hover:text-[#06cf9c] transition-colors"
            >
              {total > 0 ? 'Editar' : 'Adicionar'}
            </button>
          )}
        </div>

        {total === 0 ? (
          <div className="bg-[#202c33] rounded-xl p-3 border border-[#2a3942]">
            <p className="text-[12px] text-[#8696a0] italic">
              Ainda não há memória deste lead.
            </p>
            <p className="text-[11px] text-[#6b7680] mt-1">
              A IA extrai automaticamente a partir das conversas.
            </p>
          </div>
        ) : (
          <div className="bg-[#202c33] rounded-xl p-3 border border-[#2a3942] space-y-1.5">
            <div className="flex items-center gap-3 text-[12px] text-[#e9edef] flex-wrap">
              {factsCount > 0 && <span>{factsCount} fato{factsCount > 1 ? 's' : ''}</span>}
              {prefsCount > 0 && <span className="text-[#8696a0]">&middot;</span>}
              {prefsCount > 0 && <span>{prefsCount} preferência{prefsCount > 1 ? 's' : ''}</span>}
              {objsCount > 0 && <span className="text-[#8696a0]">&middot;</span>}
              {objsCount > 0 && <span>{objsCount} objeç{objsCount > 1 ? 'ões' : 'ão'}</span>}
            </div>

            {hasJourney && (
              <p className="text-[11.5px] text-[#8696a0] italic leading-relaxed line-clamp-2">
                &ldquo;{memory!.journey_context}&rdquo;
              </p>
            )}

            <p className="text-[10.5px] text-[#6b7680]">
              Atualizada {formatRelativeTime(updatedAt)}
            </p>
          </div>
        )}
      </div>

      {modalOpen && (
        <MemoryEditModal
          waId={waId}
          initial={memory || {}}
          onClose={() => setModalOpen(false)}
          onSaved={(newMem, newUpdatedAt) => {
            onUpdate(newMem, newUpdatedAt);
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}

// ── Modal de edição ───────────────────────────────────

interface MemoryEditModalProps {
  waId: string;
  initial: AIMemory;
  onClose: () => void;
  onSaved: (mem: AIMemory, updatedAt: string | null) => void;
}

function MemoryEditModal({ waId, initial, onClose, onSaved }: MemoryEditModalProps) {
  const [facts, setFacts] = useState<string[]>(initial.personal_facts || []);
  const [prefs, setPrefs] = useState<string[]>(initial.preferences || []);
  const [objs, setObjs] = useState<string[]>(initial.objections || []);
  const [journey, setJourney] = useState<string>(initial.journey_context || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/contacts/${encodeURIComponent(waId)}/ai-memory`, {
        personal_facts: facts,
        preferences: prefs,
        objections: objs,
        journey_context: journey,
      });
      onSaved(res.data.ai_memory, res.data.ai_memory_updated_at);
      toast.success('Memória atualizada');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      const detail = err?.response?.data?.detail || 'Erro ao salvar memória';
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#111b21] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-[#2a3942]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[#2a3942] sticky top-0 bg-[#111b21]">
          <h3 className="text-[15px] font-semibold text-[#e9edef] flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#00a884]" />
            Memória da IA
          </h3>
          <button onClick={onClose} className="text-[#8696a0] hover:text-[#e9edef]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <StringList label="Fatos sobre o lead" placeholder="ex: dono de transportadora" items={facts} onChange={setFacts} />
          <StringList label="Preferências" placeholder="ex: prefere conversar à noite" items={prefs} onChange={setPrefs} />
          <StringList label="Objeções conhecidas" placeholder="ex: achou o preço alto" items={objs} onChange={setObjs} />

          <div>
            <label className="text-[11px] font-semibold text-[#8696a0] uppercase tracking-wider">
              Momento atual na jornada
            </label>
            <textarea
              value={journey}
              onChange={(e) => setJourney(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="ex: pediu tempo pra pensar, disse que voltaria"
              className="w-full mt-1.5 px-3 py-2.5 bg-[#202c33] border border-[#2a3942] rounded-xl text-[13px] text-[#e9edef] placeholder:text-[#6b7680] focus:outline-none focus:border-[#00a884] resize-none"
            />
            <p className="text-[10px] text-[#6b7680] mt-1">{journey.length}/500</p>
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-[#2a3942] sticky bottom-0 bg-[#111b21]">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-[#00a884] text-[#111b21] font-medium rounded-xl hover:bg-[#06cf9c] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar memória
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 text-[#8696a0] border border-[#2a3942] rounded-xl hover:bg-[#202c33]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponent: lista editável ──────────────────────

function StringList({
  label, placeholder, items, onChange,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [newItem, setNewItem] = useState('');
  const MAX_ITEMS = 10;

  const addItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed || items.length >= MAX_ITEMS) return;
    onChange([...items, trimmed]);
    setNewItem('');
  };

  const removeAt = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <label className="text-[11px] font-semibold text-[#8696a0] uppercase tracking-wider">
        {label} <span className="text-[#6b7680] normal-case font-normal">({items.length}/{MAX_ITEMS})</span>
      </label>

      {items.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 bg-[#202c33] px-3 py-2 rounded-lg border border-[#2a3942]">
              <span className="flex-1 text-[13px] text-[#e9edef] leading-snug">{item}</span>
              <button onClick={() => removeAt(i)} className="text-[#8696a0] hover:text-red-400 flex-shrink-0 mt-0.5" aria-label="Remover">
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length < MAX_ITEMS && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
            placeholder={placeholder}
            maxLength={200}
            className="flex-1 px-3 py-2 bg-[#202c33] border border-[#2a3942] rounded-lg text-[13px] text-[#e9edef] placeholder:text-[#6b7680] focus:outline-none focus:border-[#00a884]"
          />
          <button onClick={addItem} disabled={!newItem.trim()} className="px-3 py-2 bg-[#2a3942] text-[#e9edef] rounded-lg hover:bg-[#374248] disabled:opacity-40 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
