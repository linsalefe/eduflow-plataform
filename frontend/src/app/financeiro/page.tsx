'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingUp, Users, BookOpen,
  Plus, Trash2, Loader2, Filter, X, Calendar,
} from 'lucide-react';
import AppShell from "@/components/app-shell";;
import ConfirmModal from '@/components/ConfirmModal';
import api from '@/lib/api';
import { toast } from 'sonner';

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
      toast.success(form.type === 'matricula' ? 'Matrícula registrada!' : 'Entrada registrada!');
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
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-emerald-600" />
              Financeiro
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Controle de matrículas e receita</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Seletor de mês */}
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="text-sm bg-transparent outline-none text-gray-700"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="text-sm bg-transparent outline-none text-gray-700"
              >
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors text-sm font-medium shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Registrar Matrícula
            </button>
          </div>
        </div>

        {/* Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500">Receita do Mês</p>
                <DollarSign className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.revenue)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500">Receita Líquida</p>
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.net_revenue)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500">Matrículas</p>
                <Users className="w-5 h-5 text-indigo-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{summary.total_enrollments}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500">Ticket Médio</p>
                <BookOpen className="w-5 h-5 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.avg_ticket)}</p>
            </div>
          </div>
        )}

        {/* Receita por Curso */}
        {summary && summary.by_course.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Receita por Curso</h3>
            <div className="space-y-2">
              {summary.by_course.map((item, i) => {
                const maxRevenue = Math.max(...summary.by_course.map(c => c.revenue));
                const width = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-40 truncate">{item.course}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full flex items-center justify-end px-2"
                        style={{ width: `${Math.max(width, 8)}%` }}
                      >
                        <span className="text-[11px] text-white font-medium">{formatCurrency(item.revenue)}</span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 w-16 text-right">{item.count} matr.</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tabela de Entradas */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Entradas do Mês</h3>
          </div>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-10">
              <DollarSign className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Nenhuma entrada neste mês</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-[11px] text-gray-400 uppercase border-b border-gray-100">
                  <th className="px-5 py-3">Contato</th>
                  <th className="px-5 py-3">Tipo</th>
                  <th className="px-5 py-3">Curso</th>
                  <th className="px-5 py-3">Valor</th>
                  <th className="px-5 py-3">Responsável</th>
                  <th className="px-5 py-3">Data</th>
                  <th className="px-5 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 text-sm text-gray-700 font-medium">{entry.contact_name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        entry.type === 'matricula'
                          ? 'bg-emerald-100 text-emerald-700'
                          : entry.type === 'cancelamento'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {entry.type === 'matricula' ? 'Matrícula' : entry.type === 'cancelamento' ? 'Cancelamento' : 'Pagamento'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">{entry.course || '—'}</td>
                    <td className="px-5 py-3 text-sm font-semibold text-gray-900">{formatCurrency(entry.value)}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{entry.created_by_name}</td>
                    <td className="px-5 py-3 text-xs text-gray-400">{entry.created_at ? formatDate(entry.created_at) : '—'}</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => setDeleteId(entry.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal Criar Entrada */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Registrar Entrada</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Tipo */}
              <div className="flex gap-2">
                {['matricula', 'pagamento', 'cancelamento'].map(t => (
                  <button
                    key={t}
                    onClick={() => setForm({ ...form, type: t })}
                    className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-colors ${
                      form.type === t
                        ? t === 'cancelamento'
                          ? 'bg-red-50 border-red-300 text-red-700'
                          : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {t === 'matricula' ? 'Matrícula' : t === 'cancelamento' ? 'Cancelamento' : 'Pagamento'}
                  </button>
                ))}
              </div>

              {/* Contato */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Contato *</label>
                <input
                  type="text"
                  placeholder="Buscar por nome ou telefone..."
                  value={contactSearch}
                  onChange={(e) => {
                    setContactSearch(e.target.value);
                    setForm({ ...form, contact_wa_id: '' });
                  }}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-emerald-400"
                />
                {contactSearch && !form.contact_wa_id && (
                  <div className="mt-1 max-h-32 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
                    {filteredContacts.slice(0, 8).map(c => (
                      <button
                        key={c.wa_id}
                        onClick={() => {
                          setForm({ ...form, contact_wa_id: c.wa_id });
                          setContactSearch(c.name);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-gray-700">{c.name}</span>
                        <span className="text-gray-400 ml-2 text-xs">{c.wa_id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Valor */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Valor (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-emerald-400"
                />
              </div>

              {/* Curso */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Curso</label>
                <input
                  type="text"
                  placeholder="Ex: Pós-graduação em Psicologia"
                  value={form.course}
                  onChange={(e) => setForm({ ...form, course: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-emerald-400"
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Descrição</label>
                <input
                  type="text"
                  placeholder="Observação opcional..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-emerald-400"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={handleSubmit} className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors">
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}

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