'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, Circle, Clock, AlertTriangle, Plus, X, Calendar,
  User, Flag, FileText, Loader2, Filter, Phone, Mail, Users,
  MessageCircle, Trash2, Edit3, ChevronDown, ListTodo, Target,
} from 'lucide-react';
import AppShell from "@/components/app-shell";;
import ConfirmModal from '@/components/ConfirmModal';
import api from '@/lib/api';
import { toast } from 'sonner';

interface Task {
  id: number;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  due_date: string;
  due_time: string | null;
  status: string;
  contact_wa_id: string | null;
  contact_name: string | null;
  assigned_to: number;
  assigned_name: string | null;
  created_by: number;
  creator_name: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface TaskStats {
  today: number;
  overdue: number;
  completed_week: number;
  total_pending: number;
}

interface UserOption {
  id: number;
  name: string;
}

const TYPE_MAP: Record<string, { label: string; icon: any; color: string }> = {
  follow_up: { label: 'Follow-up', icon: MessageCircle, color: 'text-blue-600' },
  call: { label: 'Ligação', icon: Phone, color: 'text-green-600' },
  meeting: { label: 'Reunião', icon: Users, color: 'text-purple-600' },
  email: { label: 'E-mail', icon: Mail, color: 'text-amber-600' },
  other: { label: 'Outro', icon: FileText, color: 'text-gray-500' },
};

const PRIORITY_MAP: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  alta: { label: 'Alta', color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
  media: { label: 'Média', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  baixa: { label: 'Baixa', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', dot: 'bg-gray-400' },
};

const FILTER_TABS = [
  { key: 'today', label: 'Hoje', icon: Clock },
  { key: 'overdue', label: 'Atrasadas', icon: AlertTriangle },
  { key: 'week', label: 'Próx. 7 dias', icon: Calendar },
  { key: 'all', label: 'Todas', icon: ListTodo },
  { key: 'completed', label: 'Concluídas', icon: CheckCircle2 },
];

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function isOverdue(task: Task): boolean {
  if (task.status !== 'pending') return false;
  const today = new Date().toISOString().split('T')[0];
  return task.due_date < today;
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split('T')[0];
}

export default function TarefasPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats>({ today: 0, overdue: 0, completed_week: 0, total_pending: 0 });
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('today');
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [completing, setCompleting] = useState<number | null>(null);

  // Form
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'follow_up',
    priority: 'media',
    due_date: new Date().toISOString().split('T')[0],
    due_time: '',
    contact_wa_id: '',
    assigned_to: 0,
  });

  const fetchTasks = useCallback(async () => {
    try {
      let params: any = {};
      if (activeFilter === 'completed') {
        params.status = 'completed';
      } else if (activeFilter !== 'all') {
        params.filter = activeFilter;
      }
      const res = await api.get('/tasks', { params });
      setTasks(res.data);
    } catch {
      toast.error('Erro ao carregar tarefas');
    }
  }, [activeFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/tasks/stats');
      setStats(res.data);
    } catch {}
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get('/users/list');
      setUsers(res.data);
      if (res.data.length > 0 && form.assigned_to === 0) {
        setForm(f => ({ ...f, assigned_to: res.data[0].id }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([fetchTasks(), fetchStats(), fetchUsers()]).finally(() => setLoading(false));
  }, [fetchTasks, fetchStats, fetchUsers]);

  useEffect(() => {
    fetchTasks();
  }, [activeFilter, fetchTasks]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') {
      const contactWaId = params.get('contact') || '';
      const contactName = params.get('name') || '';
      setForm(f => ({
        ...f,
        contact_wa_id: contactWaId,
        title: contactName ? `Follow-up com ${contactName}` : '',
      }));
      setShowModal(true);
      window.history.replaceState({}, '', '/tarefas');
    }
  }, []);

  // ── Actions ─────────────────────────────────────────

  const handleSave = async () => {
    if (!form.title.trim()) return toast.error('Título é obrigatório');
    if (!form.due_date) return toast.error('Data é obrigatória');
    if (!form.assigned_to) return toast.error('Responsável é obrigatório');

    try {
      const payload = {
        ...form,
        contact_wa_id: form.contact_wa_id || null,
        due_time: form.due_time || null,
      };

      if (editingTask) {
        await api.patch(`/tasks/${editingTask.id}`, payload);
        toast.success('Tarefa atualizada!');
      } else {
        await api.post('/tasks', payload);
        toast.success('Tarefa criada!');
      }
      setShowModal(false);
      setEditingTask(null);
      resetForm();
      fetchTasks();
      fetchStats();
    } catch {
      toast.error('Erro ao salvar tarefa');
    }
  };

  const handleComplete = async (id: number) => {
    setCompleting(id);
    try {
      await api.patch(`/tasks/${id}/complete`);
      toast.success('Tarefa concluída!');
      fetchTasks();
      fetchStats();
    } catch {
      toast.error('Erro ao concluir tarefa');
    } finally {
      setCompleting(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/tasks/${deleteId}`);
      toast.success('Tarefa deletada');
      setDeleteId(null);
      fetchTasks();
      fetchStats();
    } catch {
      toast.error('Erro ao deletar');
    }
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || '',
      type: task.type,
      priority: task.priority,
      due_date: task.due_date,
      due_time: task.due_time || '',
      contact_wa_id: task.contact_wa_id || '',
      assigned_to: task.assigned_to,
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setForm({
      title: '',
      description: '',
      type: 'follow_up',
      priority: 'media',
      due_date: new Date().toISOString().split('T')[0],
      due_time: '',
      contact_wa_id: '',
      assigned_to: users.length > 0 ? users[0].id : 0,
    });
  };

  const openNew = () => {
    setEditingTask(null);
    resetForm();
    setShowModal(true);
  };

  // ── Render ──────────────────────────────────────────

  if (loading) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex-1 bg-background min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Target className="w-7 h-7 text-primary" />
                Tarefas
              </h1>
              <p className="text-sm text-gray-500 mt-1">Gerencie as atividades do time comercial</p>
            </div>
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Nova Tarefa
            </button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Pendentes Hoje', value: stats.today, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Atrasadas', value: stats.overdue, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
              { label: 'Concluídas (semana)', value: stats.completed_week, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Total Pendentes', value: stats.total_pending, icon: ListTodo, color: 'text-amber-600', bg: 'bg-amber-50' },
            ].map((card) => (
              <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{card.label}</span>
                  <div className={`w-9 h-9 ${card.bg} rounded-lg flex items-center justify-center`}>
                    <card.icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-2">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1 overflow-x-auto">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeFilter === tab.key
                    ? 'bg-primary text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.key === 'overdue' && stats.overdue > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                    activeFilter === tab.key ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700'
                  }`}>
                    {stats.overdue}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Task List */}
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <ListTodo className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Nenhuma tarefa encontrada</p>
                <p className="text-sm text-gray-400 mt-1">
                  {activeFilter === 'today' ? 'Nenhuma tarefa para hoje' :
                   activeFilter === 'overdue' ? 'Nenhuma tarefa atrasada 🎉' :
                   'Crie uma nova tarefa para começar'}
                </p>
              </div>
            ) : (
              tasks.map((task) => {
                const typeInfo = TYPE_MAP[task.type] || TYPE_MAP.other;
                const priorityInfo = PRIORITY_MAP[task.priority] || PRIORITY_MAP.media;
                const TypeIcon = typeInfo.icon;
                const overdue = isOverdue(task);

                return (
                  <div
                    key={task.id}
                    className={`bg-white rounded-xl border p-4 flex items-start gap-3 group transition-all hover:shadow-sm ${
                      overdue ? 'border-red-200 bg-red-50/30' : 'border-gray-200'
                    } ${task.status === 'completed' ? 'opacity-60' : ''}`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => task.status === 'pending' && handleComplete(task.id)}
                      disabled={task.status === 'completed' || completing === task.id}
                      className="mt-0.5 flex-shrink-0"
                    >
                      {completing === task.id ? (
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      ) : task.status === 'completed' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300 hover:text-primary transition-colors serviçor-pointer" />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`font-medium text-gray-900 ${task.status === 'completed' ? 'line-through text-gray-400' : ''}`}>
                          {task.title}
                        </p>
                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button onClick={() => openEdit(task)} className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteId(task.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {task.description && (
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{task.description}</p>
                      )}

                      {/* Meta */}
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                        {/* Tipo */}
                        <span className={`flex items-center gap-1 ${typeInfo.color}`}>
                          <TypeIcon className="w-3.5 h-3.5" />
                          {typeInfo.label}
                        </span>

                        {/* Prioridade */}
                        <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${priorityInfo.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${priorityInfo.dot}`} />
                          <span className={priorityInfo.color}>{priorityInfo.label}</span>
                        </span>

                        {/* Data */}
                        <span className={`flex items-center gap-1 ${overdue ? 'text-red-600 font-medium' : isToday(task.due_date) ? 'text-blue-600' : 'text-gray-500'}`}>
                          <Calendar className="w-3.5 h-3.5" />
                          {isToday(task.due_date) ? 'Hoje' : formatDate(task.due_date)}
                          {task.due_time && ` às ${task.due_time}`}
                        </span>

                        {/* Responsável */}
                        {task.assigned_name && (
                          <span className="flex items-center gap-1 text-gray-500">
                            <User className="w-3.5 h-3.5" />
                            {task.assigned_name}
                          </span>
                        )}

                        {/* Contato */}
                        {task.contact_name && (
                          <span className="flex items-center gap-1 text-primary">
                            <MessageCircle className="w-3.5 h-3.5" />
                            {task.contact_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Modal Criar/Editar ─────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {/* Título */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="Ex: Ligar para o João sobre venda"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Detalhes adicionais..."
                  rows={2}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none"
                />
              </div>

              {/* Tipo + Prioridade */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select
                    value={form.type}
                    onChange={e => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none bg-white"
                  >
                    {Object.entries(TYPE_MAP).map(([key, { label }]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none bg-white"
                  >
                    {Object.entries(PRIORITY_MAP).map(([key, { label }]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Data + Hora */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm({ ...form, due_date: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                  <input
                    type="time"
                    value={form.due_time}
                    onChange={e => setForm({ ...form, due_time: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  />
                </div>
              </div>

              {/* Responsável */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Responsável *</label>
                <select
                  value={form.assigned_to}
                  onChange={e => setForm({ ...form, assigned_to: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none bg-white"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              {/* Contato (wa_id) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contato (opcional)</label>
                <input
                  type="text"
                  value={form.contact_wa_id}
                  onChange={e => setForm({ ...form, contact_wa_id: e.target.value })}
                  placeholder="Número WhatsApp do contato (ex: 5583999999999)"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2.5 text-sm font-medium text-white bg-primary hover:bg-primary rounded-xl transition-colors"
              >
                {editingTask ? 'Salvar' : 'Criar Tarefa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Confirmação Delete ────────────────── */}
      <ConfirmModal
        open={deleteId !== null}
        title="Deletar Tarefa"
        message="Tem certeza que deseja deletar esta tarefa?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </AppShell>
  );
}