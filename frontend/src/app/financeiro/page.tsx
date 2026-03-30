'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingUp, Users, BookOpen,
  Plus, Trash2, Loader2, Calendar, X,
} from 'lucide-react';
import AppShell from '@/components/app-shell';
import ConfirmModal from '@/components/ConfirmModal';
import api from '@/lib/api';
import { toast } from 'sonner';
import { KPICard } from '@/components/dashboard/kpi-card';
import { PageHeader } from '@/components/ui/page-header';
import { ChartCard } from '@/components/dashboard/chart-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface Entry {
  id: number;
  contact_wa_id: string;
  contact_name: string;
  type: string;
  value: number;
  description: string | null;
  course: string | null;
  created_by: number;
  created_by_name: string;
  created_at: string | null;
}

interface Summary {
  month: number;
  year: number;
  revenue: number;
  cancellations: number;
  net_revenue: number;
  total_enrollments: number;
  avg_ticket: number;
  by_course: { course: string; revenue: number; count: number }[];
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function FinanceiroPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [form, setForm] = useState({
    contact_wa_id: '',
    type: 'matricula',
    value: '',
    description: '',
    course: '',
  });

  const [contacts, setContacts] = useState<{ wa_id: string; name: string }[]>([]);
  const [contactSearch, setContactSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, summaryRes] = await Promise.all([
        api.get('/financial/entries', { params: { month, year } }),
        api.get('/financial/summary', { params: { month, year } }),
      ]);
      setEntries(entriesRes.data);
      setSummary(summaryRes.data);
    } catch {
      toast.error('Erro ao carregar dados financeiros');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await api.get('/contacts', { params: { limit: 200 } });
      setContacts(res.data.map((c: any) => ({ wa_id: c.wa_id, name: c.name || c.wa_id })));
    } catch {}
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const handleSubmit = async () => {
    if (!form.contact_wa_id || !form.value) {
      toast.error('Selecione um contato e informe o valor');
      return;
    }
    try {
      await api.post('/financial/entries', {
        ...form,
        value: parseFloat(form.value),
      });
      toast.success(form.type === 'matricula' ? 'Venda registrada!' : 'Entrada registrada!');
      setShowModal(false);
      setForm({ contact_wa_id: '', type: 'matricula', value: '', description: '', course: '' });
      setContactSearch('');
      fetchData();
    } catch {
      toast.error('Erro ao registrar entrada');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/financial/entries/${deleteId}`);
      toast.success('Entrada removida');
      setDeleteId(null);
      fetchData();
    } catch {
      toast.error('Erro ao remover');
    }
  };

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.wa_id.includes(contactSearch)
  );

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto space-y-6 pb-10" data-density="medium">
        <PageHeader
          title="Financeiro"
          description="Controle de vendas e receita"
          actions={
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="text-sm bg-transparent outline-none text-foreground"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="text-sm bg-transparent outline-none text-foreground"
                >
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <Button onClick={() => setShowModal(true)} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-2" />
                Registrar Venda
              </Button>
            </div>
          }
        />

        {/* KPI Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-[var(--card-pad,16px)]">
                <Skeleton className="h-3 w-24 mb-3" />
                <Skeleton className="h-8 w-28" />
              </Card>
            ))}
          </div>
        ) : summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KPICard
              label="Receita do Mês"
              value={formatCurrency(summary.revenue)}
              icon={DollarSign}
            />
            <KPICard
              label="Receita Líquida"
              value={formatCurrency(summary.net_revenue)}
              icon={TrendingUp}
            />
            <KPICard
              label="Vendas"
              value={summary.total_enrollments}
              icon={Users}
            />
            <KPICard
              label="Ticket Médio"
              value={formatCurrency(summary.avg_ticket)}
              icon={BookOpen}
            />
          </div>
        )}

        {/* Revenue by Course */}
        {summary && summary.by_course.length > 0 && (
          <ChartCard title="Receita por Serviço">
            <div className="space-y-2">
              {summary.by_course.map((item, i) => {
                const maxRevenue = Math.max(...summary.by_course.map(c => c.revenue));
                const width = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[13px] text-muted-foreground w-40 truncate">{item.course}</span>
                    <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full flex items-center justify-end px-2"
                        style={{ width: `${Math.max(width, 8)}%` }}
                      >
                        <span className="text-[11px] text-white font-medium">{formatCurrency(item.revenue)}</span>
                      </div>
                    </div>
                    <span className="text-[var(--font-size-caption)] text-muted-foreground w-16 text-right tabular-nums">
                      {item.count} matr.
                    </span>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        )}

        {/* Entries Table */}
        <Card className="overflow-hidden shadow-[var(--shadow-xs)]">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[var(--font-size-body)] font-semibold text-foreground">Entradas do Mês</h3>
          </div>
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="Nenhuma entrada neste mês"
              description="Registre uma venda ou pagamento para começar."
              actionLabel="Registrar Venda"
              onAction={() => setShowModal(true)}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-[var(--font-size-caption)] font-semibold">Contato</TableHead>
                  <TableHead className="text-[var(--font-size-caption)] font-semibold">Tipo</TableHead>
                  <TableHead className="text-[var(--font-size-caption)] font-semibold">Serviço</TableHead>
                  <TableHead className="text-[var(--font-size-caption)] font-semibold">Valor</TableHead>
                  <TableHead className="text-[var(--font-size-caption)] font-semibold">Responsável</TableHead>
                  <TableHead className="text-[var(--font-size-caption)] font-semibold">Data</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-[var(--font-size-body)] font-medium text-foreground">
                      {entry.contact_name}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-medium ${
                          entry.type === 'matricula'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : entry.type === 'cancelamento'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        {entry.type === 'matricula' ? 'Venda' : entry.type === 'cancelamento' ? 'Cancelamento' : 'Pagamento'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[var(--font-size-body)] text-muted-foreground">
                      {entry.course || '—'}
                    </TableCell>
                    <TableCell className="text-[var(--font-size-body)] font-semibold text-foreground tabular-nums">
                      {formatCurrency(entry.value)}
                    </TableCell>
                    <TableCell className="text-[var(--font-size-body)] text-muted-foreground">
                      {entry.created_by_name}
                    </TableCell>
                    <TableCell className="text-[var(--font-size-caption)] text-muted-foreground tabular-nums">
                      {entry.created_at ? formatDate(entry.created_at) : '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteId(entry.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Create Entry Dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar Entrada</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Type selector */}
            <div className="flex gap-2">
              {['matricula', 'pagamento', 'cancelamento'].map(t => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, type: t })}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    form.type === t
                      ? t === 'cancelamento'
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {t === 'matricula' ? 'Venda' : t === 'cancelamento' ? 'Cancelamento' : 'Pagamento'}
                </button>
              ))}
            </div>

            {/* Contact search */}
            <div className="space-y-1.5">
              <Label>Contato *</Label>
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={contactSearch}
                onChange={(e) => {
                  setContactSearch(e.target.value);
                  setForm({ ...form, contact_wa_id: '' });
                }}
              />
              {contactSearch && !form.contact_wa_id && (
                <div className="max-h-32 overflow-y-auto bg-card border border-border rounded-lg shadow-lg">
                  {filteredContacts.slice(0, 8).map(c => (
                    <button
                      key={c.wa_id}
                      onClick={() => {
                        setForm({ ...form, contact_wa_id: c.wa_id });
                        setContactSearch(c.name);
                      }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      <span className="text-foreground">{c.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{c.wa_id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Value */}
            <div className="space-y-1.5">
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>

            {/* Course */}
            <div className="space-y-1.5">
              <Label>Serviço</Label>
              <Input
                placeholder="Ex: Pós-graduação em Psicologia"
                value={form.course}
                onChange={(e) => setForm({ ...form, course: e.target.value })}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input
                placeholder="Observação opcional..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} className="bg-emerald-600 hover:bg-emerald-700">
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <ConfirmModal
        open={deleteId !== null}
        title="Remover entrada"
        message="Tem certeza? O valor será revertido no contato."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </AppShell>
  );
}