'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import AppShell from '@/components/app-shell';
import api from '@/lib/api';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Bot } from 'lucide-react';
import { getInitials, getAvatarColor, formatTime } from '@/lib/inbox-constants';
import { FeedbackBar, FeedbackData, FeedbackSavePayload } from '@/components/ai-lab/feedback-bar';

// ── Types ───────────────────────────────────────────────
interface LabMessage {
  id: number;
  direction: 'inbound' | 'outbound';
  sent_by_ai: boolean;
  content: string | null;
  timestamp: string | null;
  feedback: FeedbackData | null;
}

interface ContactSummary {
  wa_id: string;
  name: string | null;
  profile_picture_url: string | null;
  lead_status: string | null;
}

interface ConversationDetail {
  contact: ContactSummary;
  messages: LabMessage[];
}

// ── Content ─────────────────────────────────────────────
function LabReviewContent() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams<{ contactId: string }>();
  const contactId = decodeURIComponent(params.contactId);

  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingMessageId, setSavingMessageId] = useState<number | null>(null);

  // Gate admin
  useEffect(() => {
    if (user && user.role !== 'admin') router.push('/dashboard');
  }, [user, router]);

  // Fetch detalhes
  const loadDetail = useCallback(async () => {
    try {
      const res = await api.get(`/ai-lab/conversations/${encodeURIComponent(contactId)}`, {
        params: { limit: 200 },
      });
      setDetail(res.data);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number } };
      if (err?.response?.status === 404) {
        toast.error('Conversa nao encontrada');
        router.push('/configuracoes/agentes/laboratorio');
      } else {
        toast.error('Erro ao carregar conversa');
      }
    } finally {
      setLoading(false);
    }
  }, [contactId, router]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    loadDetail();
  }, [user, loadDetail]);

  // Build context_snippet: ultimas 5 msgs ANTES da atual
  const buildContextSnippet = useCallback(
    (targetMessageId: number): Array<{ role: 'user' | 'assistant'; content: string }> => {
      if (!detail) return [];
      const idx = detail.messages.findIndex((m) => m.id === targetMessageId);
      if (idx < 0) return [];
      const before = detail.messages.slice(Math.max(0, idx - 5), idx);
      return before
        .filter((m) => m.content && m.content.trim().length > 0)
        .map((m) => ({
          role: m.sent_by_ai ? ('assistant' as const) : ('user' as const),
          content: m.content as string,
        }));
    },
    [detail]
  );

  // Salvar feedback
  const handleSaveFeedback = useCallback(
    async (messageId: number, payload: FeedbackSavePayload) => {
      setSavingMessageId(messageId);
      try {
        const snippet = buildContextSnippet(messageId);
        const res = await api.post('/ai-lab/feedback', {
          message_id: messageId,
          rating: payload.rating,
          reason: payload.reason,
          corrected_response: payload.corrected_response,
          context_snippet: snippet.length > 0 ? snippet : undefined,
        });
        const saved = res.data as FeedbackData & { has_embedding: boolean };

        setDetail((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    feedback: {
                      id: saved.id,
                      rating: saved.rating,
                      reason: saved.reason,
                      corrected_response: saved.corrected_response,
                    },
                  }
                : m
            ),
          };
        });

        const ratingLabel =
          payload.rating === 'up' ? 'Aprovacao salva' :
          payload.rating === 'down' ? 'Problema registrado' :
          'Correcao salva — a IA vai aprender com isso';
        toast.success(ratingLabel);
      } catch {
        toast.error('Erro ao salvar avaliacao');
      } finally {
        setSavingMessageId(null);
      }
    },
    [buildContextSnippet]
  );

  // Deletar feedback
  const handleDeleteFeedback = useCallback(
    async (messageId: number, feedbackId: number) => {
      setSavingMessageId(messageId);
      try {
        await api.delete(`/ai-lab/feedback/${feedbackId}`);
        setDetail((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === messageId ? { ...m, feedback: null } : m
            ),
          };
        });
        toast.success('Avaliacao removida');
      } catch {
        toast.error('Erro ao remover avaliacao');
      } finally {
        setSavingMessageId(null);
      }
    },
    []
  );

  // Contagem de feedbacks
  const feedbackCounts = useMemo(() => {
    if (!detail) return { up: 0, down: 0, edit: 0 };
    const out = { up: 0, down: 0, edit: 0 };
    for (const m of detail.messages) {
      if (m.feedback?.rating === 'up') out.up++;
      else if (m.feedback?.rating === 'down') out.down++;
      else if (m.feedback?.rating === 'edit') out.edit++;
    }
    return out;
  }, [detail]);

  if (!user) return null;
  if (user.role !== 'admin') return null;

  const contactName = detail?.contact?.name || detail?.contact?.wa_id || contactId;

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-4">
      {/* Header compacto */}
      <div className="flex items-center gap-3">
        <Link
          href="/configuracoes/agentes/laboratorio"
          className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>

        {detail?.contact && (
          <>
            {detail.contact.profile_picture_url ? (
              <img
                src={detail.contact.profile_picture_url}
                alt={detail.contact.name || ''}
                className="w-9 h-9 rounded-full object-cover"
              />
            ) : (
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-medium text-xs bg-gradient-to-br ${getAvatarColor(contactName)}`}
              >
                {getInitials(contactName)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {detail.contact.name || detail.contact.wa_id}
              </p>
              <p className="text-xs text-gray-500">
                Revisando respostas da IA
                {feedbackCounts.up + feedbackCounts.down + feedbackCounts.edit > 0 && (
                  <>
                    {' \u00b7 '}
                    {feedbackCounts.up > 0 && <span className="text-emerald-600">{feedbackCounts.up} aprovadas </span>}
                    {feedbackCounts.down > 0 && <span className="text-red-600">{feedbackCounts.down} problemas </span>}
                    {feedbackCounts.edit > 0 && <span className="text-primary">{feedbackCounts.edit} correcoes</span>}
                  </>
                )}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Chat area (estilo WhatsApp dark) */}
      <div className="bg-[#0b141a] rounded-xl p-4 min-h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        ) : !detail || detail.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#8696a0]">
            <Bot className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">Nenhuma mensagem encontrada para esta conversa.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {detail.messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                saving={savingMessageId === msg.id}
                onSave={(payload) => handleSaveFeedback(msg.id, payload)}
                onDelete={(fbId) => handleDeleteFeedback(msg.id, fbId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MessageBubble ────────────────────────────────────────
function MessageBubble({
  message,
  saving,
  onSave,
  onDelete,
}: {
  message: LabMessage;
  saving: boolean;
  onSave: (payload: FeedbackSavePayload) => Promise<void>;
  onDelete: (feedbackId: number) => Promise<void>;
}) {
  const isOutbound = message.direction === 'outbound';
  const content = message.content || '';
  const isMedia = content.startsWith('local:') || content.startsWith('media:');
  const displayText = isMedia ? '[midia]' : content;

  return (
    <div>
      <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`max-w-[70%] px-2.5 py-1.5 shadow-sm relative rounded-lg ${
            isOutbound
              ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-none'
              : 'bg-[#202c33] text-[#e9edef] rounded-tl-none'
          }`}
        >
          <p className="text-[13.5px] whitespace-pre-wrap break-words leading-[19px]">
            {displayText}
          </p>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            {message.sent_by_ai && (
              <span className="text-[10px] font-medium text-[#ffffff99]">Nat</span>
            )}
            <span
              className={`text-[10px] tabular-nums ${
                isOutbound ? 'text-[#ffffff99]' : 'text-[#8696a0]'
              }`}
            >
              {message.timestamp ? formatTime(message.timestamp) : ''}
            </span>
          </div>
        </div>
      </div>

      {/* FeedbackBar somente em msgs da IA */}
      {message.sent_by_ai && (
        <FeedbackBar
          messageId={message.id}
          currentFeedback={message.feedback}
          defaultAiResponse={message.content || ''}
          saving={saving}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

// ── Default export ──────────────────────────────────────
export default function LabReviewPage() {
  return (
    <AppShell>
      <LabReviewContent />
    </AppShell>
  );
}
