'use client';

import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import {
  Send,
  Search,
  MessageCircle,
  Check,
  CheckCheck,
  Clock,
  XCircle,
  ArrowLeft,
  Plus,
  X,
  User,
  Phone,
  Calendar,
  ChevronDown,
  Radio,
  Loader2,
  Smile,
  Paperclip,
  Mic,
  Image as ImageIcon,
  FileText,
  SlidersHorizontal,
  Bot,
  Hash,
  Users,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import AppLayout from '@/components/AppLayout';
import ActivityTimeline from '@/components/ActivityTimeline';
import { useAuth } from '@/contexts/auth-context';
import api from '@/lib/api';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

interface ChannelInfo {
  id: number;
  name: string;
  phone_number: string;
}

interface ContactTag {
  id: number;
  name: string;
  color: string;
}

interface ExactLeadResult {
  id: number;
  exact_id: number;
  name: string;
  phone1: string | null;
  sub_source: string | null;
  stage: string | null;
}

interface Contact {
  wa_id: string;
  name: string;
  lead_status: string;
  notes: string | null;
  ai_active: boolean;
  last_message: string;
  last_message_time: string | null;
  direction: string | null;
  tags: ContactTag[];
  unread: number;
  created_at: string | null;
  channel_id: number | null;
  assigned_to: number | null;
}

interface TeamUser {
  id: number;
  name: string;
  role: string;
}

interface Message {
  id: number;
  wa_message_id: string;
  direction: string;
  type: string;
  content: string;
  timestamp: string;
  status: string;
  sent_by_ai: boolean;
}

const leadStatuses = [
  { value: 'novo', label: 'Novo', color: 'bg-blue-500', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  { value: 'em_contato', label: 'Em contato', color: 'bg-amber-500', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  { value: 'qualificado', label: 'Qualificado', color: 'bg-purple-500', bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  { value: 'negociando', label: 'Negociando', color: 'bg-cyan-500', bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  { value: 'convertido', label: 'Convertido', color: 'bg-emerald-500', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  { value: 'perdido', label: 'Perdido', color: 'bg-red-500', bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
];

const tagColors = [
  { value: 'blue', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  { value: 'green', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  { value: 'red', bg: 'bg-red-500/20', text: 'text-red-400' },
  { value: 'purple', bg: 'bg-purple-500/20', text: 'text-purple-400' },
  { value: 'amber', bg: 'bg-amber-500/20', text: 'text-amber-400' },
  { value: 'pink', bg: 'bg-pink-500/20', text: 'text-pink-400' },
  { value: 'cyan', bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
];

export default function ConversationsPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChannelInfo | null>(null);
  const [showChannelMenu, setShowChannelMenu] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [tagFilter, setTagFilter] = useState<number[]>([]);
  const [unreadFilter, setUnreadFilter] = useState(false);
  const [aiFilter, setAiFilter] = useState<'all' | 'on' | 'off'>('all');
  const [assignFilter, setAssignFilter] = useState<'all' | 'mine' | 'unassigned' | number>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showCRM, setShowCRM] = useState(true);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [allTags, setAllTags] = useState<ContactTag[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('blue');
  const [editingNotes, setEditingNotes] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [togglingAI, setTogglingAI] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [selectedBulk, setSelectedBulk] = useState<Set<string>>(new Set());
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [showBulkTag, setShowBulkTag] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [exactLeadResults, setExactLeadResults] = useState<ExactLeadResult[]>([]);
  const [showLeadSuggestions, setShowLeadSuggestions] = useState(false);
  const [searchingLeads, setSearchingLeads] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [profilePics, setProfilePics] = useState<Record<string, string | null>>({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [showAssignMenu, setShowAssignMenu] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const loadedPicsRef = useRef<Set<string>>(new Set());
  const prevMsgCountRef = useRef<number>(0);
  const isTabFocusedRef = useRef<boolean>(true);
  const notifAudioRef = useRef<HTMLAudioElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Inicializar áudio de notificação
  useEffect(() => {
    notifAudioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1pbJF/f3R1eYiNjI2Uf39sZnJ+goOHkZaOgHVqcHuDh4qPkpCIe3FrbnZ+hIuRk5KOh31zbHB3gIeMkZOTj4d9c21udoCGi5KUk4+Ie3Jtb3eAhouRlJOPiHxybnB4gIaMkZSTj4h7cm5wd4CGjJGUk4+IfHJub3iAho2RlJOQiHxybm94f4aNkZSTkId9cm5vd4CGjZGUk5CIfXJub3eAho2RlJOQiHxybm94f4aNkZSTkIh8cm5veICGjZKUk5CIfHJub3h/ho2SlJOQiHxybm94f4aNkpSTkIh8cm5veICGjZKUk5CIfHJucHh/ho2SlJOQiHxybm94gIaNkpSTkIh8cm5veICGjZKVk5CIfHJucHh/ho2SlJOPiHxybm94gIaNkpSUkIh8cW5veICHjZKUk5CIfHFucHmAho2SlJSQiHxybm94gIeNkpSTkIh8cm5veICGjZKVk5GIfHFub3mAho6SlJSQiHxxbm94gIeOkpWUkIh8cW1veYCHjpKVlJCIfHFub3mAh46SlZSQiHxxbm94gIeOk5WUkIl8cG1weYCHj5OVlJCJe3FtcHmBh4+TlZSQiXxxbXB5gIePk5WVkIl7cW1veYCHj5OVlZCJfHBtcHmBh4+UlZWQiXxwbXB5gIeQlJaVkIl7cG1weYGHkJSWlZCJe3FtcHmAh5CUlpWRiXtwbXB5gYeQlJaWkIl7cG1xeYCIkJSWlpGJe3BtcHqBh5GUlpaRiXtwbHB6gYiRlZaWkYl7cGxxeoCIkZWWlpGJe3BscXqBiJGVl5aRiXtwbHF6gYiRlZeXkYl6cGxxeoGIkpaXl5GJe3BscXqBiJKWl5eRiXtwbHF6gYiSlpeXkol6b2xxeoGIkpeYl5KJe29scXuBiZKXmJeSiXtvbHF7gYmTl5iXkol6b2xxe4GJk5eYl5KKem9scXuCiZOXmJiSinpvbHF7gYmTmJiYkop6b2txe4KJk5iYmJKKem9rcXyCiZOYmZiSinpva3F8gomUmJmYk4p5b2txfIKJlJmZmJOKeW9rcXyCipSZmZmTinpva3F8gomUmZqZk4p5b2txfIKKlJmamZOKem9rcXyCipSZmpqTi3luanJ8goqVmpqak4t5bmtzfIKKlZqampOLem5rc3yCi5WampuTi3luanN8g4uWmpubk4t5bmtzfYOLlpucm5OLeW5qc32Di5abnJyTjHluanN9g4uWm5ycl');
    notifAudioRef.current.volume = 0.3;
  }, []);

  // Detectar foco da aba
  useEffect(() => {
    const onFocus = () => { isTabFocusedRef.current = true; setUnreadCount(0); };
    const onBlur = () => { isTabFocusedRef.current = false; };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); };
  }, []);

  // Atualizar título da aba com contador
  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) Conversas - EduFlow` : 'Conversas - EduFlow';
  }, [unreadCount]);

  useEffect(() => {
    loadChannels();
    loadTags();
    loadTeamUsers();
  }, []);

  useEffect(() => {
    if (activeChannel) {
      loadContacts();
      const interval = setInterval(loadContacts, 5000);
      return () => clearInterval(interval);
    }
  }, [activeChannel]);

  useEffect(() => {
    if (selectedContact) {
      prevMsgCountRef.current = 0;
      setShowScrollDown(false);
      setLoadingMessages(true);
      setMessages([]);
      loadMessages(selectedContact.wa_id);
      api.post(`/contacts/${selectedContact.wa_id}/read`);
      setNotesValue(selectedContact.notes || '');
      const interval = setInterval(() => loadMessages(selectedContact.wa_id), 3000);
      return () => clearInterval(interval);
    }
  }, [selectedContact]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowScrollDown(false);
    } else if (messages.length > 0) {
      setShowScrollDown(true);
    }
  }, [messages]);

  const loadChannels = async () => {
    try {
      const res = await api.get('/channels');
      setChannels(res.data);
      if (res.data.length > 0 && !activeChannel) {
        setActiveChannel(res.data[0]);
      }
    } catch (err) {
      // silent
    }
  };

  const loadContacts = async () => {
    try {
      const params = activeChannel ? `?channel_id=${activeChannel.id}` : '';
      const res = await api.get(`/contacts${params}`);
      setContacts(res.data);
      if (selectedContact) {
        const updated = res.data.find((c: Contact) => c.wa_id === selectedContact.wa_id);
        if (updated) setSelectedContact(updated);
      }
      // Carregar fotos de perfil dos contatos novos
      if (activeChannel) {
        res.data.forEach((c: Contact) => {
          if (!loadedPicsRef.current.has(c.wa_id)) {
            loadedPicsRef.current.add(c.wa_id);
            loadProfilePic(c.wa_id);
          }
        });
      }
    } catch (err) {
      toast.error('Erro ao carregar contatos');
    } finally {
      setLoading(false);
    }
  };

  const loadProfilePic = async (waId: string) => {
    try {
      const channelId = activeChannel?.id || 1;
      const res = await api.get(`/contacts/${waId}/picture?channel_id=${channelId}`);
      setProfilePics(prev => ({ ...prev, [waId]: res.data.profilePictureUrl || null }));
    } catch {
      setProfilePics(prev => ({ ...prev, [waId]: null }));
    }
  };

  const loadMessages = async (waId: string) => {
    try {
      const res = await api.get(`/contacts/${waId}/messages`);
      const newMsgs: Message[] = res.data;

      // Detectar novas mensagens inbound
      if (prevMsgCountRef.current > 0 && newMsgs.length > prevMsgCountRef.current) {
        const newOnes = newMsgs.slice(prevMsgCountRef.current);
        const hasInbound = newOnes.some(m => m.direction === 'inbound');
        if (hasInbound) {
          // Tocar som se a aba não estiver em foco
          if (!isTabFocusedRef.current) {
            setUnreadCount(prev => prev + newOnes.filter(m => m.direction === 'inbound').length);
            try { notifAudioRef.current?.play(); } catch {}
          }
        }
      }
      prevMsgCountRef.current = newMsgs.length;

      setMessages(newMsgs);
      setLoadingMessages(false);
    } catch (err) {
      setLoadingMessages(false);
      // silent
    }
  };

  const loadTags = async () => {
    try {
      const res = await api.get('/tags');
      setAllTags(res.data);
    } catch (err) {
      // silent
    }
  };

  const loadTeamUsers = async () => {
    try {
      const res = await api.get('/users/list');
      setTeamUsers(res.data);
    } catch {
      // silent
    }
  };

  const assignContact = async (userId: number | null) => {
    if (!selectedContact) return;
    try {
      await api.patch(`/contacts/${selectedContact.wa_id}/assign`, { assigned_to: userId });
      toast.success(userId ? 'Contato atribuído' : 'Atribuição removida');
      setSelectedContact({ ...selectedContact, assigned_to: userId });
      setShowAssignMenu(false);
      loadContacts();
    } catch {
      toast.error('Erro ao atribuir contato');
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedContact || !activeChannel || sending) return;
    setSending(true);
    try {
      await api.post('/send/text', {
        to: selectedContact.wa_id,
        text: newMessage,
        channel_id: activeChannel.id,
      });
      setNewMessage('');
      await loadMessages(selectedContact.wa_id);
      await loadContacts();
    } catch (err) {
      toast.error('Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const toggleAI = async () => {
    if (!selectedContact) return;
    setTogglingAI(true);
    try {
      const newValue = !selectedContact.ai_active;
      await api.patch(`/ai/contacts/${selectedContact.wa_id}/toggle`, { ai_active: newValue });
      setSelectedContact({ ...selectedContact, ai_active: newValue });
      toast.success(newValue ? 'IA ativada' : 'IA desativada');
      loadContacts();
    } catch (err) {
      toast.error("Erro ao alternar IA");
    } finally {
      setTogglingAI(false);
    }
  };

  const updateLeadStatus = async (status: string) => {
    if (!selectedContact) return;
    try {
      await api.patch(`/contacts/${selectedContact.wa_id}`, { lead_status: status });
      setShowStatusMenu(false);
      toast.success('Status atualizado');
      await loadContacts();
    } catch (err) { toast.error('Erro ao atualizar status'); }
  };

  const saveNotes = async () => {
    if (!selectedContact) return;
    try {
      await api.patch(`/contacts/${selectedContact.wa_id}`, { notes: notesValue });
      toast.success('Notas salvas');
      setEditingNotes(false);
      await loadContacts();
    } catch (err) { toast.error('Erro ao salvar notas'); }
  };

  const addTag = async (tagId: number) => {
    if (!selectedContact) return;
    try {
      await api.post(`/contacts/${selectedContact.wa_id}/tags/${tagId}`);
      toast.success('Tag adicionada');
      await loadContacts();
    } catch (err) { toast.error('Erro ao adicionar tag'); }
  };

  const removeTag = async (tagId: number) => {
    if (!selectedContact) return;
    try {
      await api.delete(`/contacts/${selectedContact.wa_id}/tags/${tagId}`);
      toast.success('Tag removida');
      await loadContacts();
    } catch (err) { toast.error('Erro ao remover tag'); }
  };

  const createTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const res = await api.post('/tags', { name: newTagName, color: newTagColor });
      toast.success('Tag criada');
      setAllTags([...allTags, res.data]);
      setNewTagName('');
      if (selectedContact) await addTag(res.data.id);
    } catch (err) { toast.error('Erro ao criar tag'); }
  };

  const loadTemplates = async () => {
    if (!activeChannel) return;
    setLoadingTemplates(true);
    try {
      const res = await api.get(`/channels/${activeChannel.id}/templates`);
      setTemplates(res.data);
    } catch (err) { toast.error('Erro ao carregar templates'); }
    finally { setLoadingTemplates(false); }
  };

  const selectTemplate = (t: any) => {
    setSelectedTemplate(t);
    setTemplateParams(new Array(t.parameters.length).fill(''));
  };

  const updateParam = (index: number, value: string) => {
    const newParams = [...templateParams];
    newParams[index] = value;
    setTemplateParams(newParams);
  };

  const getPreview = () => {
    if (!selectedTemplate) return '';
    let text = selectedTemplate.body;
    templateParams.forEach((p, i) => {
      text = text.replace(`{{${i + 1}}}`, p || `[Variável ${i + 1}]`);
    });
    return text;
  };

  const handleNewChat = async () => {
    if (!newChatPhone.trim() || !newChatName.trim() || !activeChannel || !selectedTemplate) return;
    setSendingTemplate(true);
    try {
      const phone = newChatPhone.replace(/\D/g, '');
      await api.post('/send/template', {
        to: phone,
        template_name: selectedTemplate.name,
        language: selectedTemplate.language,
        channel_id: activeChannel.id,
        parameters: templateParams.length > 0 ? templateParams : [],
        contact_name: newChatName,
      });
      setShowNewChat(false);
      setNewChatPhone('');
      setNewChatName('');
      setSelectedTemplate(null);
      setTemplateParams([]);
      await loadContacts();
    } catch (err) {
      toast.error('Erro ao enviar template');
    } finally {
      setSendingTemplate(false);
    }
  };

  const searchExactLeads = async (query: string) => {
    if (query.length < 2) {
      setExactLeadResults([]);
      setShowLeadSuggestions(false);
      return;
    }
    setSearchingLeads(true);
    try {
      const res = await api.get('/exact-leads', { params: { search: query, limit: 8 } });
      setExactLeadResults(res.data);
      setShowLeadSuggestions(true);
    } catch (err) {
      toast.error('Erro ao buscar leads');
    } finally {
      setSearchingLeads(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    searchExactLeads(value);
  };

  const selectExactLead = (lead: ExactLeadResult) => {
    setShowLeadSuggestions(false);
    setSearch('');
    setNewChatPhone(lead.phone1 || '');
    setNewChatName(lead.name || '');
    setShowNewChat(true);
  };

  // Fechar emoji picker e menu de anexo ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const onEmojiClick = (emojiData: any) => {
    setNewMessage(prev => prev + emojiData.emoji);
  };

  const handleFileUpload = async (file: File, type: 'image' | 'document') => {
    if (!selectedContact || !activeChannel) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('to', selectedContact.wa_id);
      formData.append('channel_id', String(activeChannel.id));
      formData.append('type', type);
      await api.post('/send/media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadMessages(selectedContact.wa_id);
      await loadContacts();
    } catch (err) {
      toast.error('Erro ao enviar arquivo');
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg; codecs=opus' });
        if (audioBlob.size > 0 && selectedContact && activeChannel) {
          const formData = new FormData();
          formData.append('file', audioBlob, 'audio.ogg');
          formData.append('to', selectedContact.wa_id);
          formData.append('channel_id', String(activeChannel.id));
          formData.append('type', 'audio');
          try {
            await api.post('/send/media', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            await loadMessages(selectedContact.wa_id);
            await loadContacts();
          } catch (err) {
            toast.error('Erro ao enviar áudio');
          }
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      toast.error('Erro ao acessar microfone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setRecordingTime(0);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = () => {
        mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setRecordingTime(0);
  };

  const formatRecordingTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  const getAvatarColor = (name: string) => {
    const c = ['from-blue-500 to-blue-600','from-purple-500 to-purple-600','from-emerald-500 to-emerald-600','from-orange-500 to-orange-600','from-pink-500 to-pink-600','from-cyan-500 to-cyan-600','from-indigo-500 to-indigo-600'];
    return c[name.charCodeAt(0) % c.length];
  };
  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const formatDate = (ts: string) => {
    const d = new Date(ts); const t = new Date();
    if (d.toDateString() === t.toDateString()) return 'Hoje';
    const y = new Date(t); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR');
  };
  const formatFullDate = (ts: string) => new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const getStatusIcon = (s: string) => {
    switch (s) {
      case 'sent': return <CheckCheck className="w-3.5 h-3.5 text-[#b3d1cb]" />;
      case 'delivered': return <CheckCheck className="w-3.5 h-3.5 text-[#b3d1cb]" />;
      case 'read': return <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />;
      default: return <Clock className="w-3.5 h-3.5 text-[#b3d1cb]" />;
    }
  };
  const getStatusConfig = (s: string) => leadStatuses.find(x => x.value === s) || leadStatuses[0];
  const getTagColorConfig = (c: string) => tagColors.find(x => x.value === c) || tagColors[0];

  const filteredContacts = contacts.filter(c => {
    const ms = c.name.toLowerCase().includes(search.toLowerCase()) || c.wa_id.includes(search);
    const mst = statusFilter === 'todos' || c.lead_status === statusFilter;
    const mtag = tagFilter.length === 0 || c.tags.some(t => tagFilter.includes(t.id));
    const mur = !unreadFilter || c.unread > 0;
    const mai = aiFilter === 'all' || (aiFilter === 'on' ? c.ai_active : !c.ai_active);
    const masn = assignFilter === 'all'
      || (assignFilter === 'mine' && c.assigned_to === user?.id)
      || (assignFilter === 'unassigned' && !c.assigned_to)
      || (typeof assignFilter === 'number' && c.assigned_to === assignFilter);
    return ms && mst && mtag && mur && mai && masn;
  });

  const hasActiveFilters = tagFilter.length > 0 || unreadFilter || aiFilter !== 'all' || assignFilter !== 'all';

  const clearAllFilters = () => {
    setStatusFilter('todos');
    setTagFilter([]);
    setUnreadFilter(false);
    setAiFilter('all');
    setAssignFilter('all');
    setShowFilters(false);
  };

  const toggleBulkSelect = (waId: string) => {
    setSelectedBulk(prev => {
      const next = new Set(prev);
      if (next.has(waId)) next.delete(waId);
      else next.add(waId);
      return next;
    });
  };

  const selectAllVisible = () => {
    if (selectedBulk.size === filteredContacts.length) {
      setSelectedBulk(new Set());
    } else {
      setSelectedBulk(new Set(filteredContacts.map(c => c.wa_id)));
    }
  };

  const bulkUpdateStatus = async (status: string) => {
    try {
      await api.post('/contacts/bulk-update', { wa_ids: Array.from(selectedBulk), lead_status: status });
      toast.success(`${selectedBulk.size} contatos atualizados`);
      setSelectedBulk(new Set());
      setShowBulkStatus(false);
      loadContacts();
    } catch { toast.error('Erro ao atualizar contatos'); }
  };

  const bulkAddTag = async (tagId: number) => {
    try {
      await api.post('/contacts/bulk-tag', { wa_ids: Array.from(selectedBulk), tag_id: tagId });
      toast.success(`Tag adicionada a ${selectedBulk.size} contatos`);
      setSelectedBulk(new Set());
      setShowBulkTag(false);
      loadContacts();
    } catch { toast.error('Erro ao adicionar tag'); }
  };

  const groupedMessages: { date: string; msgs: Message[] }[] = [];
  messages.forEach((msg) => {
    const date = formatDate(msg.timestamp);
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === date) last.msgs.push(msg);
    else groupedMessages.push({ date, msgs: [msg] });
  });

  return (
    <AppLayout fullWidth>
      <div className="flex h-full">

        {/* SIDEBAR CONTATOS */}
        <div className={`${selectedContact ? 'hidden lg:flex' : 'flex'} w-full lg:w-[350px] flex-col border-r border-[#2a3942] bg-[#111b21] flex-shrink-0`}>

          <div className="px-4 py-3 space-y-3">

            {/* Header WPP + Channel Selector */}
            <div className="flex items-center justify-between">
              <div className="relative flex-1">
                <button
                  onClick={() => setShowChannelMenu(!showChannelMenu)}
                  className="flex items-center gap-2.5 text-left group"
                >
                  <div className="w-10 h-10 bg-[#6b7b8a] rounded-full flex items-center justify-center">
                    <Radio className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[15px] font-medium text-[#e9edef] leading-tight group-hover:text-white transition-colors">{activeChannel?.name || 'Selecionar canal'}</p>
                    <p className="text-[12px] text-[#8696a0] leading-tight">
                      {activeChannel ? `+${(activeChannel.phone_number || '').replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, '$1 $2 $3-$4')}` : 'Nenhum canal'}
                    </p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-[#8696a0] transition-transform duration-200 ${showChannelMenu ? 'rotate-180' : ''}`} />
                </button>

                {showChannelMenu && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[#233138] rounded-lg border border-[#2a3942] shadow-xl z-20 overflow-hidden">
                    {channels.map(ch => (
                      <button
                        key={ch.id}
                        onClick={() => { setActiveChannel(ch); setShowChannelMenu(false); setSelectedContact(null); setLoading(true); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#182229] transition-colors text-left ${activeChannel?.id === ch.id ? 'bg-[#2a3942]' : ''}`}
                      >
                        <div className={`w-2 h-2 rounded-full ${activeChannel?.id === ch.id ? 'bg-[#00a884]' : 'bg-[#8696a0]'}`} />
                        <div>
                          <p className="text-sm font-medium text-[#e9edef]">{ch.name}</p>
                          <p className="text-[11px] text-[#8696a0]">+{ch.phone_number}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowNewChat(true)}
                className="p-2 rounded-full hover:bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef] transition-all"
                title="Nova conversa" aria-label="Nova conversa"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8696a0]" />
                <input
                  type="text"
                  placeholder="Pesquisar ou começar uma nova conversa"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => { if (exactLeadResults.length > 0) setShowLeadSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowLeadSuggestions(false), 200)}
                  className="w-full pl-10 pr-8 py-2 bg-[#202c33] rounded-lg text-[13px] text-[#e9edef] placeholder:text-[#8696a0] focus:outline-none transition-all"
                />
                {search && (
                  <button onClick={() => { setSearch(''); setExactLeadResults([]); setShowLeadSuggestions(false); }} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    <XCircle className="w-4 h-4 text-[#8696a0] hover:text-[#e9edef] transition-colors" />
                  </button>
                )}
              </div>

              {showLeadSuggestions && exactLeadResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#233138] rounded-lg border border-[#2a3942] shadow-xl z-30 max-h-[300px] overflow-y-auto">
                  <div className="px-3 py-2 border-b border-[#2a3942]">
                    <p className="text-[10px] font-semibold text-[#8696a0] uppercase tracking-wider">Leads Pós (Exact Spotter)</p>
                  </div>
                  {exactLeadResults.map(lead => (
                    <button
                      key={lead.id}
                      onMouseDown={() => selectExactLead(lead)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#182229] transition-colors text-left border-b border-[#2a3942]/50 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#00a884] flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
                        {lead.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#e9edef] truncate">{lead.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-[#8696a0]">{lead.phone1 || 'Sem telefone'}</span>
                          {lead.sub_source && <span className="text-[10px] px-1.5 py-0.5 bg-[#00a884]/20 text-[#00a884] rounded">{lead.sub_source}</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Status Filter */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
              <button
                onClick={() => setStatusFilter('todos')}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${
                  statusFilter === 'todos'
                    ? 'bg-[#00a884] text-[#111b21]'
                    : 'bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]'
                }`}
              >
                Todos ({contacts.length})
              </button>

              {leadStatuses.map(s => {
                const count = contacts.filter(c => c.lead_status === s.value).length;
                if (count === 0) return null;
                return (
                  <button
                    key={s.value}
                    onClick={() => setStatusFilter(s.value)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${
                      statusFilter === s.value
                        ? `${s.bg} ${s.text}`
                        : 'bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]'
                    }`}
                  >
                    {s.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Advanced Filters Toggle + Counter */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                  showFilters || hasActiveFilters
                    ? 'bg-[#00a884]/20 text-[#00a884]'
                    : 'text-[#8696a0] hover:bg-[#202c33]'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filtros
                {hasActiveFilters && (
                  <span className="w-4 h-4 bg-[#00a884] text-[#111b21] text-[9px] font-bold rounded-full flex items-center justify-center">
                    {(tagFilter.length > 0 ? 1 : 0) + (unreadFilter ? 1 : 0) + (aiFilter !== 'all' ? 1 : 0)}
                  </span>
                )}
              </button>
              <span className="text-[11px] text-[#8696a0] tabular-nums">
                {filteredContacts.length} contato{filteredContacts.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Advanced Filters Panel */}
            {showFilters && (
              <div className="space-y-2.5 pb-1">
                {/* Tag filter */}
                {allTags.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-[#8696a0] uppercase tracking-wider mb-1.5">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allTags.map(tag => {
                        const tc = getTagColorConfig(tag.color);
                        const isActive = tagFilter.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => setTagFilter(prev => isActive ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                              isActive ? `${tc.bg} ${tc.text}` : 'bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]'
                            }`}
                          >
                            <Hash className="w-2.5 h-2.5" />
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Quick filters row */}
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => setUnreadFilter(!unreadFilter)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                      unreadFilter ? 'bg-[#00a884]/20 text-[#00a884]' : 'bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]'
                    }`}
                  >
                    <MessageCircle className="w-3 h-3" />
                    Não lidos
                  </button>
                  <button
                    onClick={() => setAiFilter(aiFilter === 'on' ? 'all' : 'on')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                      aiFilter === 'on' ? 'bg-purple-500/20 text-purple-400' : 'bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]'
                    }`}
                  >
                    <Bot className="w-3 h-3" />
                    IA ativa
                  </button>
                  <button
                    onClick={() => setAiFilter(aiFilter === 'off' ? 'all' : 'off')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                      aiFilter === 'off' ? 'bg-red-500/20 text-red-400' : 'bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]'
                    }`}
                  >
                    <Bot className="w-3 h-3" />
                    IA off
                  </button>
                </div>

                {/* Assign filter */}
                <div>
                  <p className="text-[10px] font-semibold text-[#8696a0] uppercase tracking-wider mb-1.5">Atendente</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setAssignFilter(assignFilter === 'mine' ? 'all' : 'mine')}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                        assignFilter === 'mine' ? 'bg-[#6366f1]/20 text-[#818cf8]' : 'bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]'
                      }`}
                    >
                      <User className="w-3 h-3" />
                      Meus leads
                    </button>
                    <button
                      onClick={() => setAssignFilter(assignFilter === 'unassigned' ? 'all' : 'unassigned')}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                        assignFilter === 'unassigned' ? 'bg-amber-500/20 text-amber-400' : 'bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]'
                      }`}
                    >
                      <Users className="w-3 h-3" />
                      Sem atribuição
                    </button>
                    {teamUsers.filter(u => u.id !== user?.id).map(u => (
                      <button
                        key={u.id}
                        onClick={() => setAssignFilter(assignFilter === u.id ? 'all' : u.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                          assignFilter === u.id ? 'bg-[#6366f1]/20 text-[#818cf8]' : 'bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full bg-[#6366f1]/30 flex items-center justify-center text-[#818cf8] text-[7px] font-bold">
                          {u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        {u.name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clear all */}
                {hasActiveFilters && (
                  <button
                    onClick={clearAllFilters}
                    className="text-[11px] text-[#8696a0] hover:text-red-400 transition-colors"
                  >
                    ✕ Limpar filtros
                  </button>
                )}
              </div>
            )}

          </div>

          {/* Contacts List */}
          <div className="flex-1 overflow-y-auto border-t border-[#2a3942]">
            {loading ? (
              <div className="space-y-0 p-1">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-3" style={{ opacity: 1 - i * 0.08 }}>
                    <div className="w-[49px] h-[49px] bg-[#2a3942] rounded-full flex-shrink-0 animate-pulse" />
                    <div className="flex-1 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className={`h-3.5 bg-[#2a3942] rounded-md animate-pulse`} style={{ width: `${70 + (i % 3) * 20}px` }} />
                        <div className="h-2.5 bg-[#2a3942] rounded-md animate-pulse w-10" />
                      </div>
                      <div className={`h-3 bg-[#2a3942]/60 rounded-md animate-pulse`} style={{ width: `${100 + (i % 4) * 25}px` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48">
                <MessageCircle className="w-8 h-8 mb-2 text-[#3b4a54]" />
                <p className="text-sm text-[#8696a0]">Nenhuma conversa</p>
              </div>
            ) : (
              <div>
                {/* Select all row */}
                <button
                  onClick={selectAllVisible}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium text-[#8696a0] hover:bg-[#202c33] transition-colors border-b border-[#222d34]"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                    selectedBulk.size > 0 && selectedBulk.size === filteredContacts.length
                      ? 'bg-[#00a884] border-[#00a884]'
                      : selectedBulk.size > 0
                        ? 'bg-[#00a884]/40 border-[#00a884]'
                        : 'border-[#3b4a54]'
                  }`}>
                    {selectedBulk.size > 0 && <Check className="w-3 h-3 text-white" />}
                  </div>
                  {selectedBulk.size > 0
                    ? `${selectedBulk.size} selecionado${selectedBulk.size > 1 ? 's' : ''}`
                    : 'Selecionar todos'}
                </button>

                {filteredContacts.map((contact) => {
                  const st = getStatusConfig(contact.lead_status);
                  const isSelected = selectedContact?.wa_id === contact.wa_id;
                  const isBulkSelected = selectedBulk.has(contact.wa_id);
                  return (
                    <div
                      key={contact.wa_id}
                      className={`w-full flex items-center gap-0 text-left transition-all duration-150 ${
                        isSelected ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleBulkSelect(contact.wa_id); }}
                        className="pl-2 pr-0.5 py-3 flex items-center flex-shrink-0"
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                          isBulkSelected
                            ? 'bg-[#00a884] border-[#00a884]'
                            : 'border-[#3b4a54] hover:border-[#8696a0]'
                        }`}>
                          {isBulkSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </button>

                      {/* Contact row */}
                      <button
                        onClick={() => setSelectedContact(contact)}
                        className="flex-1 flex items-center gap-3 pr-3 py-3"
                      >
                      <div className="relative flex-shrink-0">
                        {profilePics[contact.wa_id] ? (
                          <img src={profilePics[contact.wa_id]!} alt="" className="w-[49px] h-[49px] rounded-full object-cover" onError={() => setProfilePics(prev => ({ ...prev, [contact.wa_id]: null }))} />
                        ) : (
                          <div className={`w-[49px] h-[49px] rounded-full bg-gradient-to-br ${getAvatarColor(contact.name)} flex items-center justify-center text-white font-semibold text-sm`}>
                            {getInitials(contact.name || contact.wa_id)}
                          </div>
                        )}
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 ${st.color} rounded-full border-2 border-[#111b21]`} />
                      </div>

                      <div className="flex-1 min-w-0 border-b border-[#222d34] py-0.5">
                        <div className="flex items-center justify-between">
                          <p className={`font-normal text-[15px] truncate ${isSelected ? 'text-[#e9edef]' : 'text-[#e9edef]'}`}>
                            {contact.ai_active && "🤖 "}{contact.name || contact.wa_id}
                          </p>
                          <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                            {contact.assigned_to && (() => {
                              const assignedUser = teamUsers.find(u => u.id === contact.assigned_to);
                              return assignedUser ? (
                                <div className="w-5 h-5 rounded-full bg-[#6366f1]/30 flex items-center justify-center text-[#818cf8] text-[8px] font-bold" title={assignedUser.name}>
                                  {assignedUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                </div>
                              ) : null;
                            })()}
                            {contact.last_message_time && (
                              <span className={`text-[11px] tabular-nums ${contact.unread > 0 ? 'text-[#00a884]' : 'text-[#8696a0]'}`}>
                                {formatTime(contact.last_message_time)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-0.5">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            {contact.tags.length > 0 && (
                              <div className="flex gap-0.5">
                                {contact.tags.slice(0, 2).map(tag => {
                                  const tc = getTagColorConfig(tag.color);
                                  return <span key={tag.id} className={`w-2 h-2 rounded-full ${tc.bg}`} />;
                                })}
                              </div>
                            )}
                            <p className="text-[13px] text-[#8696a0] truncate">
                              {contact.direction === 'outbound' && '✓✓ '}
                              {contact.last_message || 'Sem mensagens'}
                            </p>
                          </div>

                          {contact.unread > 0 && (
                            <span className="min-w-[20px] h-5 px-1.5 bg-[#00a884] text-[#111b21] text-[11px] font-bold rounded-full flex items-center justify-center flex-shrink-0 ml-1">
                              {contact.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bulk Actions Bar */}
          {selectedBulk.size > 0 && (
            <div className="px-3 py-2.5 bg-[#1a2730] border-t border-[#2a3942]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-[#e9edef]">
                  {selectedBulk.size} selecionado{selectedBulk.size > 1 ? 's' : ''}
                </span>
                <button onClick={() => setSelectedBulk(new Set())} className="text-[11px] text-[#8696a0] hover:text-red-400 transition-colors">
                  Cancelar
                </button>
              </div>
              <div className="flex gap-1.5 relative">
                {/* Status button */}
                <div className="relative">
                  <button
                    onClick={() => { setShowBulkStatus(!showBulkStatus); setShowBulkTag(false); }}
                    className="px-3 py-1.5 bg-[#00a884]/20 text-[#00a884] text-[11px] font-medium rounded-lg hover:bg-[#00a884]/30 transition-colors"
                  >
                    Mover status
                  </button>
                  {showBulkStatus && (
                    <div className="absolute bottom-full left-0 mb-1.5 bg-[#233138] rounded-lg border border-[#2a3942] shadow-xl z-50 py-1 min-w-[140px]">
                      {leadStatuses.map(s => (
                        <button
                          key={s.value}
                          onClick={() => bulkUpdateStatus(s.value)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#e9edef] hover:bg-[#182229] transition-colors"
                        >
                          <span className={`w-2 h-2 rounded-full ${s.color}`} />
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tag button */}
                <div className="relative">
                  <button
                    onClick={() => { setShowBulkTag(!showBulkTag); setShowBulkStatus(false); }}
                    className="px-3 py-1.5 bg-purple-500/20 text-purple-400 text-[11px] font-medium rounded-lg hover:bg-purple-500/30 transition-colors"
                  >
                    Adicionar tag
                  </button>
                  {showBulkTag && allTags.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-1.5 bg-[#233138] rounded-lg border border-[#2a3942] shadow-xl z-50 py-1 min-w-[140px]">
                      {allTags.map(tag => {
                        const tc = getTagColorConfig(tag.color);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => bulkAddTag(tag.id)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-[#182229] transition-colors ${tc.text}`}
                          >
                            <Hash className="w-3 h-3" />
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
        <div className={`${selectedContact ? 'flex' : 'hidden lg:flex'} flex-1 flex-col min-w-0`}>
          {selectedContact ? (
            <>
              {/* Chat Header */}
              <div className="px-4 py-2.5 border-b border-[#2a3942] bg-[#202c33] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedContact(null)} aria-label="Voltar para lista" className="lg:hidden p-1.5 hover:bg-[#2a3942] rounded-lg transition-colors">
                    <ArrowLeft className="w-5 h-5 text-[#8696a0]" />
                  </button>

                  {profilePics[selectedContact.wa_id] ? (
                    <img src={profilePics[selectedContact.wa_id]!} alt="" className="w-10 h-10 rounded-full object-cover" onError={() => setProfilePics(prev => ({ ...prev, [selectedContact.wa_id]: null }))} />
                  ) : (
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(selectedContact.name)} flex items-center justify-center text-white font-semibold text-xs`}>
                      {getInitials(selectedContact.name || selectedContact.wa_id)}
                    </div>
                  )}

                  <div>
                    <p className="font-normal text-[15px] text-[#e9edef]">{selectedContact.name || selectedContact.wa_id}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-[#8696a0]">+{selectedContact.wa_id}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-md ${getStatusConfig(selectedContact.lead_status).bg} ${getStatusConfig(selectedContact.lead_status).text}`}>
                        {getStatusConfig(selectedContact.lead_status).label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botão Ligar + botão CRM */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const phone = selectedContact?.wa_id || '';
                      window.dispatchEvent(new CustomEvent('eduflow-call', { detail: { phone } }));
                    }}
                    className="p-2 rounded-full hover:bg-[#2a3942] text-[#8696a0] hover:text-[#00a884] transition-all duration-200"
                    title="Ligar para o lead" aria-label="Ligar para o lead"
                  >
                    <Phone className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => setShowCRM(!showCRM)}
                    className={`p-2 rounded-full transition-all duration-200 ${
                      showCRM
                        ? 'bg-[#2a3942] text-[#00a884]'
                        : 'hover:bg-[#2a3942] text-[#8696a0]'
                    }`}
                    title="Painel CRM" aria-label="Painel CRM"
                  >
                    <User className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-1 overflow-hidden">

                {/* Messages */}
                <div className="flex-1 flex flex-col min-w-0">
                  <div
                    ref={chatContainerRef}
                    onScroll={() => {
                      const c = chatContainerRef.current;
                      if (c) setShowScrollDown(c.scrollHeight - c.scrollTop - c.clientHeight > 150);
                    }}
                    className="flex-1 overflow-y-auto px-[4%] py-4 space-y-1 bg-[#0b141a] relative" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'p\' width=\'40\' height=\'40\' patternUnits=\'userSpaceOnUse\'%3E%3Cpath d=\'M20 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z\' fill=\'%23111b21\' fill-opacity=\'0.6\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=\'200\' height=\'200\' fill=\'url(%23p)\'/%3E%3C/svg%3E")' }}>

                    {loadingMessages ? (
                      <div className="space-y-3 py-4">
                        {[
                          { dir: 'in', w: '55%' },
                          { dir: 'in', w: '35%' },
                          { dir: 'out', w: '45%' },
                          { dir: 'in', w: '60%' },
                          { dir: 'out', w: '40%' },
                          { dir: 'out', w: '50%' },
                        ].map((s, i) => (
                          <div key={i} className={`flex ${s.dir === 'out' ? 'justify-end' : 'justify-start'}`}>
                            <div
                              className={`rounded-xl animate-pulse ${s.dir === 'out' ? 'bg-[#005c4b]/40' : 'bg-[#202c33]/80'}`}
                              style={{ width: s.w, height: `${32 + (i % 3) * 12}px`, opacity: 1 - i * 0.1 }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                    <>
                    {groupedMessages.map((group) => (
                      <div key={group.date}>
                        <div className="flex justify-center my-3">
                          <span className="px-3 py-1.5 bg-[#182229] rounded-lg text-[12px] text-[#8696a0] shadow-sm font-normal">
                            {group.date}
                          </span>
                        </div>

                        {group.msgs.map((msg) => (
                          <div key={msg.id} className={`flex mb-1 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[65%] px-2.5 py-1.5 shadow-sm relative ${
                              msg.direction === 'outbound'
                                ? 'bg-[#005c4b] text-[#e9edef] rounded-lg rounded-tr-none'
                                : 'bg-[#202c33] text-[#e9edef] rounded-lg rounded-tl-none'
                            }`}>
                              {/* Tail */}
                              {msg.direction === 'outbound' ? (
                                <span className="absolute -right-2 top-0 w-0 h-0 border-t-[8px] border-t-[#005c4b] border-r-[8px] border-r-transparent" />
                              ) : (
                                <span className="absolute -left-2 top-0 w-0 h-0 border-t-[8px] border-t-[#202c33] border-l-[8px] border-l-transparent" />
                              )}
                              {msg.type === 'image' && msg.content.startsWith('media:') ? (
                                <img
                                  src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api'}/media/${msg.content.split('|')[0].replace('media:', '')}?channel_id=${activeChannel?.id || 1}`}
                                  alt={msg.content.split('|')[2] || 'Imagem'}
                                  className="max-w-[280px] rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => window.open(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api'}/media/${msg.content.split('|')[0].replace('media:', '')}?channel_id=${activeChannel?.id || 1}`, '_blank')}
                                />
                              ) : msg.type === 'audio' && msg.content.startsWith('media:') ? (
                                <audio controls className="max-w-[280px]">
                                  <source src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api'}/media/${msg.content.split('|')[0].replace('media:', '')}?channel_id=${activeChannel?.id || 1}`} type={msg.content.split('|')[1] || 'audio/ogg'} />
                                </audio>
                              ) : msg.type === 'video' && msg.content.startsWith('media:') ? (
                                <video controls className="max-w-[280px] rounded-md">
                                  <source src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api'}/media/${msg.content.split('|')[0].replace('media:', '')}?channel_id=${activeChannel?.id || 1}`} type={msg.content.split('|')[1] || 'video/mp4'} />
                                </video>
                              ) : msg.type === 'sticker' && msg.content.startsWith('media:') ? (
                                <img
                                  src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api'}/media/${msg.content.split('|')[0].replace('media:', '')}?channel_id=${activeChannel?.id || 1}`}
                                  alt="Sticker"
                                  className="w-32 h-32"
                                />
                              ) : msg.type === 'document' && msg.content.startsWith('media:') ? (
                                <a
                                  href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api'}/media/${msg.content.split('|')[0].replace('media:', '')}?channel_id=${activeChannel?.id || 1}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`flex items-center gap-2 ${msg.direction === 'outbound' ? 'text-[#8fdfcc]' : 'text-[#53bdeb]'} underline text-sm`}
                                >
                                  📄 {msg.content.split('|')[2] || 'Documento'}
                                </a>
                              ) : (
                                <p className="text-[14.2px] whitespace-pre-wrap break-words leading-[19px]">{msg.content}</p>
                              )}

                              <div className="flex items-center justify-end gap-1 mt-0.5">
                                {msg.sent_by_ai && <span className={`text-[10px] font-medium ${msg.direction === 'outbound' ? 'text-[#ffffff99]' : 'text-[#8696a0]'}`}>🤖 Nat</span>}
                                <span className={`text-[11px] tabular-nums ${msg.direction === 'outbound' ? 'text-[#ffffff99]' : 'text-[#8696a0]'}`}>{formatTime(msg.timestamp)}</span>
                                {msg.direction === 'outbound' && getStatusIcon(msg.status)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                    </>
                    )}

                    {/* Botão scroll para baixo */}
                    {showScrollDown && (
                      <button
                        onClick={() => {
                          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                          setShowScrollDown(false);
                        }}
                        aria-label="Rolar para baixo" className="sticky bottom-4 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#202c33] border border-[#2a3942] rounded-full flex items-center justify-center shadow-lg hover:bg-[#2a3942] transition-all z-10"
                      >
                        <ChevronDown className="w-5 h-5 text-[#8696a0]" />
                      </button>
                    )}
                  </div>

                  {/* Input */}
                  <div className="px-3 py-2 bg-[#202c33]">
                    {isRecording ? (
                      /* Modo gravação */
                      <div className="flex items-center gap-3">
                        <button
                          onClick={cancelRecording}
                          aria-label="Cancelar gravação"
                          className="p-2 rounded-full hover:bg-[#2a3942] text-red-400 hover:text-red-300 transition-all"
                          title="Cancelar gravação"
                        >
                          <X className="w-5 h-5" />
                        </button>
                        <div className="flex-1 flex items-center gap-3 px-4 py-2.5 bg-[#2a3942] rounded-lg">
                          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                          <span className="text-[14px] text-[#e9edef] tabular-nums font-mono">{formatRecordingTime(recordingTime)}</span>
                          <div className="flex-1 flex items-center gap-0.5">
                            {[...Array(20)].map((_, i) => (
                              <div key={i} className="w-1 bg-[#00a884] rounded-full animate-pulse" style={{ height: `${Math.random() * 16 + 4}px`, animationDelay: `${i * 0.05}s` }} />
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={stopRecording}
                          aria-label="Enviar áudio"
                          className="flex items-center justify-center w-[42px] h-[42px] bg-[#00a884] rounded-full text-white hover:bg-[#06cf9c] active:scale-95 transition-all flex-shrink-0"
                          title="Enviar áudio"
                        >
                          <Send className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      /* Modo normal */
                      <div className="flex items-end gap-2">
                        {/* Emoji button */}
                        <div className="relative" ref={emojiPickerRef}>
                          <button
                            onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowAttachMenu(false); }}
                            className={`p-2 rounded-full transition-all ${showEmojiPicker ? 'text-[#00a884]' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                            title="Emoji"
                          >
                            <Smile className="w-6 h-6" />
                          </button>
                          {showEmojiPicker && (
                            <div className="absolute bottom-12 left-0 z-50">
                              <EmojiPicker
                                onEmojiClick={onEmojiClick}
                                theme={'dark' as any}
                                width={320}
                                height={400}
                                searchPlaceHolder="Pesquisar emoji"
                                previewConfig={{ showPreview: false }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Attach button */}
                        <div className="relative" ref={attachMenuRef}>
                          <button
                            onClick={() => { setShowAttachMenu(!showAttachMenu); setShowEmojiPicker(false); }}
                            className={`p-2 rounded-full transition-all ${showAttachMenu ? 'text-[#00a884] rotate-45' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                            title="Anexar"
                          >
                            <Paperclip className="w-6 h-6 transition-transform" />
                          </button>
                          {showAttachMenu && (
                            <div className="absolute bottom-12 left-0 z-50 bg-[#233138] rounded-xl border border-[#2a3942] shadow-xl overflow-hidden min-w-[180px]">
                              <button
                                onClick={() => { imageInputRef.current?.click(); setShowAttachMenu(false); }}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#182229] transition-colors text-left"
                              >
                                <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                                  <ImageIcon className="w-4 h-4 text-white" />
                                </div>
                                <span className="text-[14px] text-[#e9edef]">Fotos e vídeos</span>
                              </button>
                              <button
                                onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#182229] transition-colors text-left"
                              >
                                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                                  <FileText className="w-4 h-4 text-white" />
                                </div>
                                <span className="text-[14px] text-[#e9edef]">Documento</span>
                              </button>
                            </div>
                          )}
                          <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file, 'image');
                              e.target.value = '';
                            }}
                          />
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file, 'document');
                              e.target.value = '';
                            }}
                          />
                        </div>

                        {/* Text input */}
                        <textarea
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyDown={handleKeyPress}
                          placeholder="Digite uma mensagem"
                          rows={1}
                          className="flex-1 px-3 py-2.5 bg-[#2a3942] rounded-lg text-[14px] text-[#e9edef] placeholder:text-[#8696a0] resize-none focus:outline-none transition-all"
                        />

                        {/* Mic or Send */}
                        {newMessage.trim() ? (
                          <button
                            onClick={handleSend}
                            disabled={sending}
                            className="flex items-center justify-center w-[42px] h-[42px] bg-[#00a884] rounded-full text-white hover:bg-[#06cf9c] active:scale-95 transition-all disabled:opacity-40 flex-shrink-0"
                          >
                            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                          </button>
                        ) : (
                          <button
                            onClick={startRecording}
                            className="flex items-center justify-center w-[42px] h-[42px] rounded-full text-[#8696a0] hover:text-[#e9edef] transition-all flex-shrink-0"
                            title="Gravar áudio"
                          >
                            <Mic className="w-6 h-6" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* CRM PANEL */}
                {showCRM && (
                  <div className="w-[300px] border-l border-[#2a3942] bg-[#111b21] overflow-y-auto flex-shrink-0 hidden xl:block">
                    <div className="p-5 space-y-6">

                      {/* Perfil */}
                      <div className="text-center pb-5 border-b border-[#2a3942]">
                        {profilePics[selectedContact.wa_id] ? (
                          <img src={profilePics[selectedContact.wa_id]!} alt="" className="w-16 h-16 rounded-full object-cover shadow-md mx-auto" onError={() => setProfilePics(prev => ({ ...prev, [selectedContact.wa_id]: null }))} />
                        ) : (
                          <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${getAvatarColor(selectedContact.name)} flex items-center justify-center text-white font-bold text-xl shadow-md mx-auto`}>
                            {getInitials(selectedContact.name || selectedContact.wa_id)}
                          </div>
                        )}
                        <p className="font-semibold text-[#e9edef] mt-3 text-[15px]">{selectedContact.name || selectedContact.wa_id}</p>
                        <div className="flex items-center justify-center gap-1.5 mt-1.5 text-[#8696a0]">
                          <Phone className="w-3.5 h-3.5" />
                          <span className="text-[12px]">+{selectedContact.wa_id}</span>
                        </div>
                        {selectedContact.created_at && (
                          <div className="flex items-center justify-center gap-1.5 mt-1 text-[#8696a0]">
                            <Calendar className="w-3.5 h-3.5" />
                            <span className="text-[11px]">Desde {formatFullDate(selectedContact.created_at)}</span>
                          </div>
                        )}
                      </div>

                      {/* Toggle IA */}
                      <div className="pb-4 border-b border-[#2a3942]">
                        <p className="text-[11px] font-semibold text-[#8696a0] uppercase tracking-wider mb-2">Agente IA (Nat)</p>
                        <button
                          onClick={toggleAI}
                          disabled={togglingAI}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
                            selectedContact.ai_active ? "border-[#00a884]/30 bg-[#00a884]/10" : "border-[#2a3942] bg-[#202c33]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[16px]">{selectedContact.ai_active ? "🤖" : "👤"}</span>
                            <span className={`text-[13px] font-medium ${
                              selectedContact.ai_active ? "text-[#00a884]" : "text-[#8696a0]"
                            }`}>
                              {selectedContact.ai_active ? "IA Ativa" : "IA Desligada"}
                            </span>
                          </div>
                          <div className={`w-10 h-5 rounded-full transition-all ${selectedContact.ai_active ? "bg-[#00a884]" : "bg-[#3b4a54]"} relative`}>
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${selectedContact.ai_active ? "left-5" : "left-0.5"}`} />
                          </div>
                        </button>
                      </div>

                      {/* Atribuído a */}
                      <div className="pb-4 border-b border-[#2a3942]">
                        <p className="text-[11px] font-semibold text-[#8696a0] uppercase tracking-wider mb-2">Atribuído a</p>
                        <div className="relative">
                          <button
                            onClick={() => setShowAssignMenu(!showAssignMenu)}
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-[#2a3942] bg-[#202c33] hover:bg-[#2a3942] transition-all"
                          >
                            <div className="flex items-center gap-2">
                              {selectedContact.assigned_to ? (
                                <>
                                  <div className="w-6 h-6 rounded-full bg-[#6366f1]/30 flex items-center justify-center text-[#818cf8] text-[9px] font-bold">
                                    {teamUsers.find(u => u.id === selectedContact.assigned_to)?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                                  </div>
                                  <span className="text-[13px] text-[#e9edef]">
                                    {teamUsers.find(u => u.id === selectedContact.assigned_to)?.name || `#${selectedContact.assigned_to}`}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <User className="w-4 h-4 text-[#8696a0]" />
                                  <span className="text-[13px] text-[#8696a0]">Ninguém</span>
                                </>
                              )}
                            </div>
                            <ChevronDown className={`w-4 h-4 text-[#8696a0] transition-transform ${showAssignMenu ? 'rotate-180' : ''}`} />
                          </button>

                          {showAssignMenu && (
                            <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#233138] rounded-xl border border-[#2a3942] shadow-lg z-10 overflow-hidden">
                              <button
                                onClick={() => assignContact(null)}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#182229] transition-colors text-left"
                              >
                                <User className="w-4 h-4 text-[#8696a0]" />
                                <span className="text-[13px] text-[#8696a0]">Ninguém</span>
                              </button>
                              {teamUsers.map(u => (
                                <button
                                  key={u.id}
                                  onClick={() => assignContact(u.id)}
                                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#182229] transition-colors text-left"
                                >
                                  <div className="w-6 h-6 rounded-full bg-[#6366f1]/30 flex items-center justify-center text-[#818cf8] text-[9px] font-bold">
                                    {u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                  </div>
                                  <span className="text-[13px] text-[#e9edef]">{u.name}</span>
                                  <span className="text-[10px] text-[#8696a0] ml-auto">{u.role}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status do Lead */}
                      <div>
                        <p className="text-[11px] font-semibold text-[#8696a0] uppercase tracking-wider mb-2">Status do Lead</p>
                        <div className="relative">
                          <button
                            onClick={() => setShowStatusMenu(!showStatusMenu)}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border ${getStatusConfig(selectedContact.lead_status).border} ${getStatusConfig(selectedContact.lead_status).bg} transition-all hover:shadow-sm`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-2.5 h-2.5 rounded-full ${getStatusConfig(selectedContact.lead_status).color}`} />
                              <span className={`text-[13px] font-medium ${getStatusConfig(selectedContact.lead_status).text}`}>
                                {getStatusConfig(selectedContact.lead_status).label}
                              </span>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-[#8696a0] transition-transform duration-200 ${showStatusMenu ? 'rotate-180' : ''}`} />
                          </button>

                          {showStatusMenu && (
                            <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#233138] rounded-xl border border-[#2a3942] shadow-lg z-10 overflow-hidden">
                              {leadStatuses.map(s => (
                                <button
                                  key={s.value}
                                  onClick={() => updateLeadStatus(s.value)}
                                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#182229] transition-colors text-left"
                                >
                                  <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                                  <span className="text-[13px] text-[#e9edef]">{s.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Tags */}
                      <div>
                        <p className="text-[11px] font-semibold text-[#8696a0] uppercase tracking-wider mb-2">Tags</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {selectedContact.tags.map(tag => {
                            const tc = getTagColorConfig(tag.color);
                            return (
                              <span key={tag.id} className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg ${tc.bg} ${tc.text}`}>
                                {tag.name}
                                <button onClick={() => removeTag(tag.id)} aria-label="Remover tag" className="hover:opacity-60 transition-opacity">
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            );
                          })}
                        </div>

                        <button onClick={() => setShowTagMenu(!showTagMenu)} className="flex items-center gap-1 text-[12px] text-[#00a884] hover:text-[#06cf9c] font-medium transition-colors">
                          <Plus className="w-3.5 h-3.5" /> Adicionar tag
                        </button>

                        {showTagMenu && (
                          <div className="mt-2 bg-[#202c33] rounded-xl p-3 space-y-2 border border-[#2a3942]">
                            {allTags.filter(t => !selectedContact.tags.find(ct => ct.id === t.id)).map(tag => {
                              const tc = getTagColorConfig(tag.color);
                              return (
                                <button
                                  key={tag.id}
                                  onClick={() => { addTag(tag.id); setShowTagMenu(false); }}
                                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium ${tc.bg} ${tc.text} hover:opacity-80 transition-opacity`}
                                >
                                  {tag.name}
                                </button>
                              );
                            })}

                            <div className="pt-2 border-t border-[#2a3942]">
                              <p className="text-[10px] text-[#8696a0] uppercase font-semibold mb-1.5 tracking-wider">Criar nova tag</p>
                              <input
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                placeholder="Nome da tag"
                                className="w-full px-2.5 py-1.5 text-[12px] text-[#e9edef] bg-[#2a3942] border border-[#3b4a54] rounded-lg outline-none focus:border-[#00a884] transition-colors"
                              />
                              <div className="flex gap-1.5 mt-2">
                                {tagColors.map(c => (
                                  <button
                                    key={c.value}
                                    onClick={() => setNewTagColor(c.value)}
                                    className={`w-5 h-5 rounded-full ${c.bg} transition-all ${newTagColor === c.value ? 'ring-2 ring-offset-1 ring-offset-[#202c33] ring-[#00a884] scale-110' : 'hover:scale-105'}`}
                                  />
                                ))}
                              </div>
                              <button
                                onClick={() => { createTag(); setShowTagMenu(false); }}
                                disabled={!newTagName.trim()}
                                className="w-full mt-2.5 px-2.5 py-1.5 bg-[#00a884] text-[#111b21] text-[11px] font-medium rounded-lg disabled:opacity-40 hover:bg-[#06cf9c] transition-colors"
                              >
                                Criar tag
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Notes */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] font-semibold text-[#8696a0] uppercase tracking-wider">Notas</p>
                          {!editingNotes && (
                            <button onClick={() => setEditingNotes(true)} className="text-[12px] text-[#00a884] font-medium hover:text-[#06cf9c] transition-colors">
                              Editar
                            </button>
                          )}
                        </div>

                        {editingNotes ? (
                          <div>
                            <textarea
                              value={notesValue}
                              onChange={(e) => setNotesValue(e.target.value)}
                              rows={4}
                              className="w-full px-3 py-2.5 text-[13px] text-[#e9edef] bg-[#2a3942] border border-[#3b4a54] rounded-xl outline-none focus:border-[#00a884] resize-none transition-all"
                              placeholder="Adicione notas sobre este lead..."
                            />
                            <div className="flex gap-2 mt-2">
                              <button onClick={saveNotes} className="px-3.5 py-1.5 bg-[#00a884] text-[#111b21] text-[11px] font-medium rounded-lg hover:bg-[#06cf9c] transition-colors">
                                Salvar
                              </button>
                              <button onClick={() => { setEditingNotes(false); setNotesValue(selectedContact.notes || ''); }} className="px-3.5 py-1.5 text-[#8696a0] text-[11px] font-medium rounded-lg hover:bg-[#202c33] transition-colors">
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-[#202c33] rounded-xl p-3 min-h-[60px] border border-[#2a3942]">
                            <p className="text-[13px] text-[#8696a0] whitespace-pre-wrap leading-relaxed">{selectedContact.notes || 'Sem notas'}</p>
                          </div>
                        )}
                      </div>

                      {/* Timeline */}
                      <div>
                        <p className="text-[11px] font-semibold text-[#8696a0] uppercase tracking-wider mb-2">Atividades</p>
                        <ActivityTimeline contactWaId={selectedContact.wa_id} />
                      </div>

                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#222e35]">
              <div className="w-20 h-20 bg-[#2a3942] rounded-full flex items-center justify-center mb-5">
                <MessageCircle className="w-9 h-9 text-[#8696a0]" />
              </div>
              <p className="text-[28px] font-light text-[#e9edef]">EduFlow</p>
              <p className="text-sm mt-2 text-[#8696a0]">Selecione uma conversa para começar</p>
              <div className="mt-6 w-[500px] h-[1px] bg-[#2a3942]" />
              <p className="text-[13px] mt-4 text-[#8696a0]">🔒 Suas mensagens são gerenciadas com segurança</p>
            </div>
          )}
        </div>

        {/* MODAL NOVA CONVERSA */}
        {showNewChat && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowNewChat(false)}>
            <div className="bg-[#111b21] rounded-lg p-6 w-full max-w-lg shadow-2xl mx-4 max-h-[90vh] overflow-y-auto border border-[#2a3942]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-normal text-[#e9edef]">Nova Conversa</h2>
                <button onClick={() => { setShowNewChat(false); setSelectedTemplate(null); setTemplateParams([]); }} aria-label="Fechar" className="p-1.5 hover:bg-[#2a3942] rounded-lg transition-colors">
                  <X className="w-5 h-5 text-[#8696a0]" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-[#8696a0] mb-1.5">Telefone do lead</label>
                  <input
                    type="text"
                    value={newChatPhone}
                    onChange={e => setNewChatPhone(e.target.value)}
                    placeholder="5583988001234"
                    className="w-full px-4 py-2.5 bg-[#2a3942] border border-[#3b4a54] rounded-lg text-sm text-[#e9edef] placeholder:text-[#8696a0] focus:border-[#00a884] outline-none transition-all"
                  />
                  <p className="text-[11px] text-[#8696a0] mt-1">DDD + número com 9 (sem espaços)</p>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#8696a0] mb-1.5">Nome do lead</label>
                  <input
                    type="text"
                    value={newChatName}
                    onChange={e => setNewChatName(e.target.value)}
                    placeholder="Maria Silva"
                    className="w-full px-4 py-2.5 bg-[#2a3942] border border-[#3b4a54] rounded-lg text-sm text-[#e9edef] placeholder:text-[#8696a0] focus:border-[#00a884] outline-none transition-all"
                  />
                </div>

                {/* Seletor de Template */}
                <div>
                  <label className="block text-[13px] font-medium text-[#8696a0] mb-1.5">Template da mensagem</label>
                  {loadingTemplates ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 text-[#00a884] animate-spin" />
                    </div>
                  ) : templates.length === 0 ? (
                    <button
                      onClick={loadTemplates}
                      className="w-full py-2.5 border border-dashed border-[#3b4a54] rounded-lg text-sm text-[#8696a0] hover:border-[#00a884] hover:text-[#00a884] transition-colors"
                    >
                      Carregar templates disponíveis
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {templates.map((t: any) => (
                        <button
                          key={t.name}
                          onClick={() => selectTemplate(t)}
                          className={`w-full text-left px-3.5 py-2.5 rounded-lg border text-sm transition-all ${
                            selectedTemplate?.name === t.name
                              ? 'border-[#00a884] bg-[#00a884]/10 text-[#00a884]'
                              : 'border-[#2a3942] text-[#e9edef] hover:border-[#3b4a54] hover:bg-[#202c33]'
                          }`}
                        >
                          <p className="font-medium text-[13px]">{t.name.replace(/_/g, ' ')}</p>
                          <p className="text-[11px] text-[#8696a0] mt-0.5">{t.language} • {t.parameters.length} variáveis</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Parâmetros do template */}
                {selectedTemplate && selectedTemplate.parameters.length > 0 && (
                  <div className="space-y-3 pt-1">
                    <p className="text-[11px] font-semibold text-[#8696a0] uppercase tracking-wider">Preencher variáveis</p>
                    {selectedTemplate.parameters.map((p: string, i: number) => (
                      <div key={i}>
                        <label className="block text-[11px] text-[#8696a0] mb-1">{p} ({'{{'}{i + 1}{'}}'})</label>
                        <input
                          type="text"
                          value={templateParams[i] || ''}
                          onChange={e => updateParam(i, e.target.value)}
                          placeholder={`Valor para ${p}`}
                          className="w-full px-3 py-2 bg-[#2a3942] border border-[#3b4a54] rounded-lg text-sm text-[#e9edef] placeholder:text-[#8696a0] focus:border-[#00a884] outline-none transition-all"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Preview */}
                {selectedTemplate && (
                  <div className="bg-[#0b141a] rounded-lg p-4">
                    <p className="text-[10px] font-semibold text-[#8696a0] uppercase mb-2 tracking-wider">Prévia da mensagem</p>
                    <div className="bg-[#005c4b] rounded-lg px-3.5 py-2.5">
                      <p className="text-[13px] text-[#e9edef] whitespace-pre-wrap leading-relaxed">{getPreview()}</p>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleNewChat}
                disabled={sendingTemplate || !newChatPhone.trim() || !newChatName.trim() || !selectedTemplate}
                className="w-full mt-6 py-3 bg-[#00a884] text-[#111b21] font-medium rounded-lg hover:bg-[#06cf9c] active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2"
              >
                {sendingTemplate ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Enviar template
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}