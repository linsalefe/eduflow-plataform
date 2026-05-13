'use client';

import { useState, useEffect, useRef } from 'react';
import {
  MessageSquareText, Plus, Pencil, Trash2, Loader2, ShieldAlert, Variable,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/* ─── Tipos ───────────────────────────────────────────── */

interface QuickReply {
  id: number;
  shortcut: string;
  content: string;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

const VARIABLES = [
  { key: '{primeiro_nome}', label: 'Primeiro nome', desc: 'Primeiro nome do contato' },
  { key: '{nome}', label: 'Nome completo', desc: 'Nome completo do contato' },
  { key: '{telefone}', label: 'Telefone', desc: 'Telefone do contato' },
];

/* ─── Conteúdo principal (exportado para uso na tab) ─── */

export function MensagensProntasContent() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<QuickReply[]>([]);

  // Modal de criação/edição
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QuickReply | null>(null);
  const [shortcut, setShortcut] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // AlertDialog de delete
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ─── Load inicial ─── */
  useEffect(() => {
    (async () => {
      try {
        const [meRes, listRes] = await Promise.all([
          api.get('/auth/me'),
          api.get('/quick-replies'),
        ]);
        setUser(meRes.data);
        setList(listRes.data);
      } catch (err) {
        console.error(err);
        toast.error('Erro ao carregar mensagens prontas');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  /* ─── Reload ─── */
  const reload = async () => {
    try {
      const res = await api.get('/quick-replies');
      setList(res.data);
    } catch {
      toast.error('Erro ao recarregar lista');
    }
  };

  /* ─── Abrir modal ─── */
  const openCreate = () => {
    setEditing(null);
    setShortcut('');
    setContent('');
    setModalOpen(true);
  };

  const openEdit = (qr: QuickReply) => {
    setEditing(qr);
    setShortcut(qr.shortcut);
    setContent(qr.content);
    setModalOpen(true);
  };

  /* ─── Inserir variável no cursor ─── */
  const insertVariable = (variable: string) => {
    const el = contentRef.current;
    if (!el) return;
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = content.slice(0, start) + variable + content.slice(end);
    setContent(next);
    // restaurar foco e posição após o token inserido
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + variable.length;
      el.setSelectionRange(pos, pos);
    });
  };

  /* ─── Salvar (create/update) ─── */
  const handleSave = async () => {
    if (!shortcut.trim()) {
      toast.error('Informe o atalho');
      return;
    }
    if (!content.trim()) {
      toast.error('Informe o conteúdo');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/quick-replies/${editing.id}`, { shortcut, content });
        toast.success('Mensagem atualizada');
      } else {
        await api.post('/quick-replies', { shortcut, content });
        toast.success('Mensagem criada');
      }
      setModalOpen(false);
      await reload();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Erro ao salvar';
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  /* ─── Deletar ─── */
  const confirmDelete = async () => {
    if (!deletingId) return;
    setDeleting(true);
    try {
      await api.delete(`/quick-replies/${deletingId}`);
      toast.success('Mensagem removida');
      setDeletingId(null);
      await reload();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Erro ao remover';
      toast.error(detail);
    } finally {
      setDeleting(false);
    }
  };

  /* ─── Render ─── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Bloqueio para não-admin
  if (!isAdmin) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-amber-600 mb-3" />
        <h3 className="text-base font-medium text-amber-900">Acesso restrito</h3>
        <p className="text-sm text-amber-800 mt-1">
          Apenas administradores podem gerenciar as mensagens prontas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Mensagens prontas</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Atalhos rápidos para respostas frequentes. Digite <code className="px-1 py-0.5 rounded bg-muted text-[12px]">/</code> no inbox para usar.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          Nova mensagem
        </Button>
      </div>

      {/* Lista */}
      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center">
          <MessageSquareText className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <h3 className="text-base font-medium">Nenhuma mensagem pronta ainda</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Crie atalhos para respostas que sua equipe envia com frequência.
            Exemplo: <code className="px-1 py-0.5 rounded bg-background border text-[12px]">/saudacao</code>, <code className="px-1 py-0.5 rounded bg-background border text-[12px]">/preco</code>, <code className="px-1 py-0.5 rounded bg-background border text-[12px]">/agendamento</code>.
          </p>
          <Button onClick={openCreate} variant="outline" className="mt-4">
            <Plus className="h-4 w-4 mr-1.5" />
            Criar primeira mensagem
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((qr) => (
            <div
              key={qr.id}
              className="group rounded-lg border border-border bg-background p-4 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="text-[13px] font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                      /{qr.shortcut}
                    </code>
                  </div>
                  <p className="text-sm text-foreground mt-2 line-clamp-2 whitespace-pre-wrap">
                    {qr.content}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(qr)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingId(qr.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar mensagem pronta' : 'Nova mensagem pronta'}
            </DialogTitle>
            <DialogDescription>
              Atalho com texto reutilizável. Variáveis são substituídas pelos dados do contato no momento do envio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="qr-shortcut">Atalho</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-mono">/</span>
                <Input
                  id="qr-shortcut"
                  value={shortcut}
                  onChange={(e) => setShortcut(e.target.value)}
                  placeholder="ex: saudacao"
                  maxLength={50}
                  autoComplete="off"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Letras minúsculas, números, _ e -. Sem espaços (serão convertidos em _).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qr-content">Conteúdo</Label>
              <Textarea
                id="qr-content"
                ref={contentRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Ex: Olá {primeiro_nome}, tudo bem? Sou da equipe e estou aqui para ajudar!"
                rows={6}
                maxLength={4000}
                className="font-mono text-[13px]"
              />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  {content.length}/4000 caracteres
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Variable className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-[12px]">Inserir variável</Label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    title={v.desc}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-background hover:bg-blue-50 hover:border-blue-200 text-[12px] font-mono text-foreground transition-colors"
                  >
                    {v.key}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editing ? 'Salvar alterações' : 'Criar mensagem'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de delete */}
      <AlertDialog open={deletingId !== null} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mensagem pronta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O atalho não estará mais disponível no inbox.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── Página standalone (rota direta opcional) ─── */
export default function MensagensProntasPage() {
  return (
    <div className="max-w-7xl mx-auto p-6">
      <MensagensProntasContent />
    </div>
  );
}
