'use client';
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import ConfirmModal from '@/components/ConfirmModal';
import { Calendar, Clock, Phone, User, GraduationCap, Plus, X, ChevronLeft, ChevronRight, Bot, UserCheck, Trash2, Edit3, Check, Ban } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

interface Schedule {
  id: number;
  type: string;
  contact_wa_id: string;
  contact_name: string;
  phone: string;
  course: string;
  scheduled_date: string;
  scheduled_time: string;
  scheduled_at: string;
  status: string;
  notes: string;
  created_at: string;
}

interface Stats {
  pending: number;
  today: number;
  completed: number;
  cancelled: number;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pendente', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  completed: { label: 'Concluído', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  failed: { label: 'Falhou', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  cancelled: { label: 'Cancelado', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' },
};

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function AgendaPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0, today: 0, completed: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [filter, setFilter] = useState<string>('all');

  // Form
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCourse, setFormCourse] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formType, setFormType] = useState('voice_ai');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = { Authorization: `Bearer ${token}` };

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch(`${API}/schedules?limit=500`, { headers });
      if (res.ok) setSchedules(await res.json());
    } catch { toast.error('Erro ao carregar dados'); }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/schedules/stats`, { headers });
      if (res.ok) setStats(await res.json());
    } catch { toast.error('Erro ao carregar dados'); }
  }, []);

  useEffect(() => {
    Promise.all([fetchSchedules(), fetchStats()]).finally(() => setLoading(false));
    const interval = setInterval(() => { fetchSchedules(); fetchStats(); }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { firstDay, daysInMonth };
  };

  const getSchedulesForDate = (dateStr: string) => {
    return schedules.filter(s => s.scheduled_date === dateStr);
  };

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));

  const openNewSchedule = (date?: string) => {
    setEditingSchedule(null);
    setFormName('');
    setFormPhone('');
    setFormCourse('');
    setFormDate(date || new Date().toISOString().split('T')[0]);
    setFormTime('10:00');
    setFormType('voice_ai');
    setFormNotes('');
    setShowModal(true);
  };

  const openEditSchedule = (s: Schedule) => {
    setEditingSchedule(s);
    setFormName(s.contact_name);
    setFormPhone(s.phone);
    setFormCourse(s.course);
    setFormDate(s.scheduled_date);
    setFormTime(s.scheduled_time);
    setFormType(s.type);
    setFormNotes(s.notes);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formPhone || !formDate || !formTime) return;
    setSaving(true);
    try {
      const phoneClean = formPhone.replace(/\D/g, '');
      if (editingSchedule) {
        await fetch(`${API}/schedules/${editingSchedule.id}`, {
          method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduled_date: formDate, scheduled_time: formTime, notes: formNotes, type: formType }),
        });
      } else {
        await fetch(`${API}/schedules`, {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_wa_id: phoneClean, contact_name: formName, phone: phoneClean,
            course: formCourse, scheduled_date: formDate, scheduled_time: formTime,
            type: formType, notes: formNotes,
          }),
        });
      }
      setShowModal(false);
      fetchSchedules();
      fetchStats();
      toast.success(editingSchedule ? 'Agendamento atualizado' : 'Agendamento criado');
    } catch { toast.error('Erro ao salvar agendamento'); }
    finally { setSaving(false); }
  };

  const handleCancel = async (id: number) => {
    setConfirmAction({
      title: 'Cancelar agendamento',
      message: 'Tem certeza que deseja cancelar este agendamento?',
      onConfirm: async () => {
        await fetch(`${API}/schedules/${id}`, {
          method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled' }),
        });
        toast.success('Agendamento cancelado');
        fetchSchedules();
        fetchStats();
        setConfirmAction(null);
      },
    });
  };

  const handleDelete = async (id: number) => {
    setConfirmAction({
      title: 'Deletar agendamento',
      message: 'Tem certeza que deseja deletar este agendamento permanentemente?',
      onConfirm: async () => {
        await fetch(`${API}/schedules/${id}`, { method: 'DELETE', headers });
        toast.success('Agendamento deletado');
        fetchSchedules();
        fetchStats();
        setConfirmAction(null);
      },
    });
  };

  const today = new Date().toISOString().split('T')[0];
  const { firstDay, daysInMonth } = getDaysInMonth(currentMonth);

  const filteredSchedules = schedules.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'today') return s.scheduled_date === today;
    if (filter === 'pending') return s.status === 'pending';
    if (filter === 'voice_ai') return s.type === 'voice_ai';
    if (filter === 'consultant') return s.type === 'consultant';
    return s.status === filter;
  }).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  const selectedDaySchedules = selectedDate ? getSchedulesForDate(selectedDate) : [];

  return (
    <AppLayout>
      <div className="px-4 lg:px-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-gray-800">Agenda</h1>
            <p className="text-sm text-gray-500">Agendamentos de ligações da IA e consultoras</p>
          </div>
          <button onClick={() => openNewSchedule()} className="flex items-center gap-2 px-4 py-2.5 bg-[#6366f1] text-white rounded-xl hover:bg-[#5558e6] transition-colors text-sm font-medium w-fit">
            <Plus className="w-4 h-4" /> Novo Agendamento
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
          {[
            { label: 'Hoje', value: stats.today, color: 'text-[#6366f1]', bg: 'bg-[#6366f1]/10' },
            { label: 'Pendentes', value: stats.pending, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Concluídos', value: stats.completed, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Cancelados', value: stats.cancelled, color: 'text-gray-500', bg: 'bg-gray-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-3 lg:p-4`}>
              <p className={`text-xl lg:text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[11px] lg:text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* View Toggle */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button onClick={() => setView('calendar')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'calendar' ? 'bg-[#6366f1] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <Calendar className="w-4 h-4 inline mr-1.5" />Calendário
          </button>
          <button onClick={() => setView('list')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'list' ? 'bg-[#6366f1] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <Clock className="w-4 h-4 inline mr-1.5" />Lista
          </button>
          <div className="ml-auto">
            <select value={filter} onChange={e => setFilter(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
              <option value="all">Todos</option>
              <option value="today">Hoje</option>
              <option value="pending">Pendentes</option>
              <option value="completed">Concluídos</option>
              <option value="cancelled">Cancelados</option>
              <option value="voice_ai">Voice AI</option>
              <option value="consultant">Consultora</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-[#6366f1] border-t-transparent rounded-full animate-spin" /></div>
        ) : view === 'calendar' ? (
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Calendar */}
            <div className="flex-1 bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
                <h3 className="text-lg font-semibold text-gray-800">{MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h3>
                <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-2">
                {WEEKDAYS.map(d => <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{d}</div>)}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const daySchedules = getSchedulesForDate(dateStr);
                  const isToday = dateStr === today;
                  const isSelected = dateStr === selectedDate;
                  const hasPending = daySchedules.some(s => s.status === 'pending');

                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(dateStr === selectedDate ? null : dateStr)}
                      className={`relative p-2 rounded-lg text-sm transition-all min-h-[60px] flex flex-col items-center ${
                        isSelected ? 'bg-[#6366f1] text-white' :
                        isToday ? 'bg-[#6366f1]/10 text-[#6366f1] font-bold' :
                        'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span>{day}</span>
                      {daySchedules.length > 0 && (
                        <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                          {daySchedules.slice(0, 3).map(s => (
                            <div key={s.id} className={`w-1.5 h-1.5 rounded-full ${
                              s.status === 'pending' ? (isSelected ? 'bg-white' : 'bg-amber-400') :
                              s.status === 'completed' ? (isSelected ? 'bg-emerald-200' : 'bg-emerald-400') :
                              (isSelected ? 'bg-gray-300' : 'bg-gray-300')
                            }`} />
                          ))}
                          {daySchedules.length > 3 && (
                            <span className={`text-[9px] ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>+{daySchedules.length - 3}</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Side panel */}
            <div className="w-[380px] bg-white rounded-xl border border-gray-200 p-5 max-h-[600px] overflow-y-auto">
              {selectedDate ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-800">{formatDate(selectedDate)}</h4>
                    <button onClick={() => openNewSchedule(selectedDate)} className="p-1.5 bg-[#6366f1]/10 text-[#6366f1] rounded-lg hover:bg-[#6366f1]/20">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {selectedDaySchedules.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-10">Nenhum agendamento neste dia</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedDaySchedules.sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time)).map(s => (
                        <ScheduleCard key={s.id} schedule={s} onEdit={openEditSchedule} onCancel={handleCancel} onDelete={handleDelete} />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16">
                  <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Selecione um dia no calendário</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* List View */
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {filteredSchedules.length === 0 ? (
              <p className="text-center text-gray-400 py-16">Nenhum agendamento encontrado</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredSchedules.map(s => (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.type === 'voice_ai' ? 'bg-[#6366f1]/10' : 'bg-pink-50'}`}>
                      {s.type === 'voice_ai' ? <Bot className="w-5 h-5 text-[#6366f1]" /> : <UserCheck className="w-5 h-5 text-pink-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{s.contact_name || s.phone}</p>
                      <p className="text-xs text-gray-400">{s.course}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-700">{formatDate(s.scheduled_date)}</p>
                      <p className="text-xs text-gray-400">{s.scheduled_time}</p>
                    </div>
                    <div className={`px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_MAP[s.status]?.bg || 'bg-gray-50'} ${STATUS_MAP[s.status]?.color || 'text-gray-500'}`}>
                      {STATUS_MAP[s.status]?.label || s.status}
                    </div>
                    <div className="flex gap-1">
                      {s.status === 'pending' && (
                        <>
                          <button onClick={() => openEditSchedule(s)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600"><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => handleCancel(s.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500"><Ban className="w-4 h-4" /></button>
                        </>
                      )}
                      <button onClick={() => handleDelete(s.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-800">{editingSchedule ? 'Editar Agendamento' : 'Novo Agendamento'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="space-y-4">
              {!editingSchedule && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Nome do Lead</label>
                    <input value={formName} onChange={e => setFormName(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#6366f1]" placeholder="Nome completo" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Telefone *</label>
                    <input value={formPhone} onChange={e => setFormPhone(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#6366f1]" placeholder="5581999999999" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Curso</label>
                    <input value={formCourse} onChange={e => setFormCourse(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#6366f1]" placeholder="Ex: Psicologia Hospitalar" />
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Data *</label>
                  <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#6366f1]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Horário *</label>
                  <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#6366f1]" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Tipo</label>
                <div className="flex gap-2">
                  <button onClick={() => setFormType('voice_ai')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${formType === 'voice_ai' ? 'border-[#6366f1] bg-[#6366f1]/10 text-[#6366f1]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    <Bot className="w-4 h-4" /> Voice AI
                  </button>
                  <button onClick={() => setFormType('consultant')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${formType === 'consultant' ? 'border-pink-400 bg-pink-50 text-pink-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    <UserCheck className="w-4 h-4" /> Consultora
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Notas</label>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#6366f1] resize-none" placeholder="Observações..." />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSave} disabled={saving || !formPhone || !formDate || !formTime} className="flex-1 px-4 py-2.5 bg-[#6366f1] text-white rounded-xl text-sm font-medium hover:bg-[#5558e6] disabled:opacity-50 transition-colors">
                {saving ? 'Salvando...' : editingSchedule ? 'Atualizar' : 'Agendar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Confirm Modal */}
      {confirmAction && (
        <ConfirmModal
          open={!!confirmAction}
          title={confirmAction.title}
          message={confirmAction.message}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </AppLayout>
  );
}

function ScheduleCard({ schedule: s, onEdit, onCancel, onDelete }: { schedule: Schedule; onEdit: (s: Schedule) => void; onCancel: (id: number) => void; onDelete: (id: number) => void }) {
  return (
    <div className={`p-3.5 rounded-xl border ${s.status === 'cancelled' ? 'opacity-50' : ''} ${STATUS_MAP[s.status]?.bg || 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.type === 'voice_ai' ? 'bg-[#6366f1]/10' : 'bg-pink-50'}`}>
            {s.type === 'voice_ai' ? <Bot className="w-4 h-4 text-[#6366f1]" /> : <UserCheck className="w-4 h-4 text-pink-500" />}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">{s.contact_name || s.phone}</p>
            <p className="text-[11px] text-gray-400">{s.type === 'voice_ai' ? 'Voice AI (Nat)' : 'Consultora'}</p>
          </div>
        </div>
        <span className="text-sm font-semibold text-gray-700">{s.scheduled_time}</span>
      </div>

      {s.course && (
        <div className="flex items-center gap-1.5 mb-2">
          <GraduationCap className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs text-gray-500">{s.course}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-2">
        <Phone className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs text-gray-500">{s.phone}</span>
      </div>

      {s.notes && <p className="text-xs text-gray-400 mb-2 italic">{s.notes}</p>}

      {s.status === 'pending' && (
        <div className="flex gap-1.5 mt-2 pt-2 border-t border-gray-200/50">
          <button onClick={() => onEdit(s)} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:bg-white/60 rounded-lg transition-colors">
            <Edit3 className="w-3 h-3" /> Editar
          </button>
          <button onClick={() => onCancel(s.id)} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-red-400 hover:bg-red-50/60 rounded-lg transition-colors">
            <Ban className="w-3 h-3" /> Cancelar
          </button>
        </div>
      )}
    </div>
  );
}