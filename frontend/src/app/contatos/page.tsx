'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Trash2, Pencil, Loader2, Phone, User,
  CheckCircle, Upload, X,
} from 'lucide-react';
import AppShell from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import api from '@/lib/api';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableSkeleton } from '@/components/skeletons/table-skeleton';
import ConfirmModal from '@/components/ConfirmModal';

const STAGES = [
  { key: 'novo', label: 'Novos Leads' },
  { key: 'em_contato', label: 'Em Contato' },
  { key: 'qualificado', label: 'Qualificados' },
  { key: 'negociando', label: 'Em Negociação' },
  { key: 'convertido', label: 'Convertidos' },
  { key: 'perdido', label: 'Perdidos' },
];

const STAGE_STYLES: Record<string, string> = {
  novo: 'bg-blue-50 text-blue-700 border-blue-200',
  em_contato: 'bg-amber-50 text-amber-700 border-amber-200',
  qualificado: 'bg-purple-50 text-purple-700 border-purple-200',
  negociando: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  convertido: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  perdido: 'bg-red-50 text-red-700 border-red-200',
};

interface Contact {
  wa_id: string;
  name: string;
  lead_status: string;
  notes: string | null;
  channel_id: number | null;
  created_at: string | null;
  ai_active: boolean;
}

const getCourse = (notes: string | null) => {
  try {
    const parsed = JSON.parse(notes || '{}');
    return parsed.course || '';
  } catch {
    return '';
  }
};

const formatPhone = (wa_id: string) => {
  const num = wa_id.replace(/^55/, '');
  if (num.length === 11) return `(${num.slice(0, 2)}) ${num.slice(2, 7)}-${num.slice(7)}`;
  return wa_id;
};

export default function ContatosPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCourse, setFormCourse] = useState('');
  const [formChannelId, setFormChannelId] = useState<string>('');
  const [channels, setChannels] = useState<any[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadContacts();
      loadChannels();
    }
  }, [user]);

  const loadContacts = async () => {
    try {
      const res = await api.get('/contacts?limit=1000');
      setContacts(res.data);
    } catch {
      toast.error('Erro ao carregar contatos');
    } finally {
      setLoading(false);
    }
  };

  const loadChannels = async () => {
    try {
      const res = await api.get('/channels');
      setChannels(res.data);
      if (res.data.length > 0) setFormChannelId(String(res.data[0].id));
    } catch {}
  };

  const openCreate = () => {
    setEditContact(null);
    setFormName('');
    setFormPhone('');
    setFormCourse('');
    if (channels.length > 0) setFormChannelId(String(channels[0].id));
    setShowModal(true);
  };

  const openEdit = (c: Contact) => {
    setEditContact(c);
    setFormName(c.name || '');
    setFormPhone(c.wa_id.replace(/^55/, ''));
    setFormCourse(getCourse(c.notes));
    setFormChannelId(String(c.channel_id || (channels.length > 0 ? channels[0].id : '')));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return toast.error('Informe o nome');
    if (!editContact && !formPhone.trim()) return toast.error('Informe o telefone');
    setSaving(true);
    try {
      if (editContact) {
        await api.patch(`/contacts/${editContact.wa_id}`, {
          name: formName,
          notes: JSON.stringify({ course: formCourse }),
        });
        toast.success('Contato atualizado');
      } else {
        await api.post('/contacts', {
          name: formName,
          phone: formPhone,
          course: formCourse,
          channel_id: Number(formChannelId),
        });
        toast.success('Contato criado');
      }
      setShowModal(false);
      loadContacts();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Erro ao salvar contato');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/contacts/${deleteTarget.wa_id}`);
      toast.success('Contato excluído');
      setDeleteTarget(null);
      loadContacts();
    } catch {
      toast.error('Erro ao excluir contato');
    } finally {
      setDeleting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    toast.loading('Importando contatos...');
    try {
      const res = await api.post('/contacts/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.dismiss();
      toast.success(`${res.data.imported} contatos importados`);
      loadContacts();
    } catch (err: any) {
      toast.dismiss();
      toast.error(err?.response?.data?.detail || 'Erro ao importar');
    }
    e.target.value = '';
  };

  const columns: ColumnDef<Contact, any>[] = [
    {
      accessorKey: 'name',
      header: 'Nome',
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-[12px] font-bold">
                {(c.name || c.wa_id).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-[13px] font-medium text-foreground">{c.name || c.wa_id}</p>
              {c.ai_active && (
                <p className="text-[11px] text-emerald-500">IA ativa</p>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'wa_id',
      header: 'Telefone',
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground font-mono tabular-nums">
          {formatPhone(row.original.wa_id)}
        </span>
      ),
    },
    {
      id: 'course',
      header: 'Serviço',
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground">
          {getCourse(row.original.notes) || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'lead_status',
      header: 'Estágio',
      cell: ({ row }) => {
        const status = row.original.lead_status;
        const label = STAGES.find((s) => s.key === status)?.label || status;
        return (
          <Badge
            variant="outline"
            className={`text-[11px] font-medium ${STAGE_STYLES[status] || 'bg-muted text-muted-foreground'}`}
          >
            {label}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Criado em',
      cell: ({ row }) => (
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {row.original.created_at
            ? new Date(row.original.created_at + 'Z').toLocaleDateString('pt-BR')
            : '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex items-center gap-1 justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(c);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(c);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];

  if (authLoading || !user) return null;

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto pb-10" data-density="medium">
        <PageHeader
          title="Contatos"
          description={`${contacts.length} contatos no CRM`}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild className="serviçor-pointer">
                <label>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={handleImport}
                    className="hidden"
                  />
                </label>
              </Button>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Novo contato
              </Button>
            </div>
          }
        />

        {loading ? (
          <TableSkeleton columns={5} rows={10} />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={User}
            title="Nenhum contato ainda"
            description="Crie seu primeiro contato ou importe uma planilha para começar."
            actionLabel="Novo contato"
            onAction={openCreate}
          />
        ) : (
          <DataTable
            columns={columns}
            data={contacts}
            searchPlaceholder="Buscar por nome ou telefone..."
            searchKey="name"
          />
        )}
      </div>

      {/* Modal criar/editar */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editContact ? 'Editar contato' : 'Novo contato'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nome completo"
              />
            </div>

            {!editContact && (
              <div className="space-y-1.5">
                <Label>WhatsApp</Label>
                <Input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="83988046720"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Serviço de interesse</Label>
              <Input
                value={formCourse}
                onChange={(e) => setFormCourse(e.target.value)}
                placeholder="Ex: Pós-graduação em Psicologia"
              />
            </div>

            {!editContact && channels.length > 1 && (
              <div className="space-y-1.5">
                <Label>Canal WhatsApp</Label>
                <Select value={formChannelId} onValueChange={setFormChannelId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o canal" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Salvando...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {editContact ? 'Salvar' : 'Criar contato'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal confirmar delete */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Excluir contato"
        message={`Tem certeza que deseja excluir ${deleteTarget?.name || 'este contato'}? Todas as mensagens serão removidas.`}
        confirmLabel={deleting ? 'Excluindo...' : 'Excluir'}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </AppShell>
  );
}