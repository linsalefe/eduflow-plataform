'use client';

import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCheck, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import api from '@/lib/api';
import { formatDate } from '@/lib/inbox-constants';
import type {
  ChannelInfo,
  Contact,
  ContactTag,
  ExactLeadResult,
  Message,
  TeamUser,
} from '@/types/conversations';

/* ------------------------------------------------------------------ */
/*  Context shape                                                      */
/* ------------------------------------------------------------------ */

interface ConversationsContextType {
  // Auth
  user: any;

  // Channels
  channels: ChannelInfo[];
  activeChannel: ChannelInfo | null;
  setActiveChannel: (ch: ChannelInfo | null) => void;
  showChannelMenu: boolean;
  setShowChannelMenu: (v: boolean) => void;

  // Contacts
  contacts: Contact[];
  selectedContact: Contact | null;
  setSelectedContact: (c: Contact | null) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  profilePics: Record<string, string | null>;
  setProfilePics: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;

  // Messages
  messages: Message[];
  newMessage: string;
  setNewMessage: (v: string) => void;
  sending: boolean;
  loadingMessages: boolean;
  groupedMessages: { date: string; msgs: Message[] }[];

  // Search
  search: string;
  handleSearchChange: (value: string) => void;
  exactLeadResults: ExactLeadResult[];
  showLeadSuggestions: boolean;
  setShowLeadSuggestions: (v: boolean) => void;
  searchingLeads: boolean;
  selectExactLead: (lead: ExactLeadResult) => void;

  // Filters
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  tagFilter: number[];
  setTagFilter: React.Dispatch<React.SetStateAction<number[]>>;
  unreadFilter: boolean;
  setUnreadFilter: (v: boolean) => void;
  aiFilter: 'all' | 'on' | 'off';
  setAiFilter: (v: 'all' | 'on' | 'off') => void;
  assignFilter: 'all' | 'mine' | 'unassigned' | number;
  setAssignFilter: (v: 'all' | 'mine' | 'unassigned' | number) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  filteredContacts: Contact[];
  hasActiveFilters: boolean;
  clearAllFilters: () => void;

  // Bulk
  selectedBulk: Set<string>;
  setSelectedBulk: React.Dispatch<React.SetStateAction<Set<string>>>;
  showBulkStatus: boolean;
  setShowBulkStatus: (v: boolean) => void;
  showBulkTag: boolean;
  setShowBulkTag: (v: boolean) => void;
  toggleBulkSelect: (waId: string) => void;
  selectAllVisible: () => void;
  bulkUpdateStatus: (status: string) => Promise<void>;
  bulkAddTag: (tagId: number) => Promise<void>;

  // CRM Panel
  showCRM: boolean;
  setShowCRM: (v: boolean) => void;
  showStatusMenu: boolean;
  setShowStatusMenu: (v: boolean) => void;
  showTagMenu: boolean;
  setShowTagMenu: (v: boolean) => void;
  allTags: ContactTag[];
  newTagName: string;
  setNewTagName: (v: string) => void;
  newTagColor: string;
  setNewTagColor: (v: string) => void;
  editingNotes: boolean;
  setEditingNotes: (v: boolean) => void;
  notesValue: string;
  setNotesValue: (v: string) => void;
  togglingAI: boolean;
  teamUsers: TeamUser[];
  showAssignMenu: boolean;
  setShowAssignMenu: (v: boolean) => void;

  // CRM Handlers
  toggleAI: () => Promise<void>;
  updateLeadStatus: (status: string) => Promise<void>;
  saveNotes: () => Promise<void>;
  addTag: (tagId: number) => Promise<void>;
  removeTag: (tagId: number) => Promise<void>;
  createTag: () => Promise<void>;
  assignContact: (userId: number | null) => Promise<void>;

  // Chat handlers
  handleSend: () => Promise<void>;
  handleKeyPress: (e: React.KeyboardEvent) => void;
  onEmojiClick: (emojiData: any) => void;
  handleFileUpload: (file: File, type: 'image' | 'document') => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  isRecording: boolean;
  recordingTime: number;
  showEmojiPicker: boolean;
  setShowEmojiPicker: (v: boolean) => void;
  showAttachMenu: boolean;
  setShowAttachMenu: (v: boolean) => void;
  showScrollDown: boolean;
  setShowScrollDown: (v: boolean) => void;

  // New chat modal
  showNewChat: boolean;
  setShowNewChat: (v: boolean) => void;
  newChatPhone: string;
  setNewChatPhone: (v: string) => void;
  newChatName: string;
  setNewChatName: (v: string) => void;
  sendingTemplate: boolean;
  templates: any[];
  selectedTemplate: any;
  setSelectedTemplate: (t: any) => void;
  templateParams: string[];
  loadingTemplates: boolean;
  loadTemplates: () => Promise<void>;
  selectTemplate: (t: any) => void;
  updateParam: (index: number, value: string) => void;
  getPreview: () => string;
  handleNewChat: () => Promise<void>;

  // Refs
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  emojiPickerRef: React.RefObject<HTMLDivElement | null>;
  attachMenuRef: React.RefObject<HTMLDivElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;

  // Misc
  mounted: boolean;
  getStatusIcon: (s: string) => React.ReactNode;
  loadContacts: () => Promise<void>;
}

const ConversationsContext = createContext<ConversationsContextType | null>(null);

export function useConversations() {
  const ctx = useContext(ConversationsContext);
  if (!ctx) throw new Error('useConversations must be used within ConversationsProvider');
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // ── Channels ──────────────────────────────────────────────────────
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChannelInfo | null>(null);
  const [showChannelMenu, setShowChannelMenu] = useState(false);

  // ── Contacts ──────────────────────────────────────────────────────
  const [contacts, setContacts] = useState<Contact[]>([]);
  const searchParams = useSearchParams();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [profilePics, setProfilePics] = useState<Record<string, string | null>>({});

  // ── Messages ──────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // ── Search ────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [exactLeadResults, setExactLeadResults] = useState<ExactLeadResult[]>([]);
  const [showLeadSuggestions, setShowLeadSuggestions] = useState(false);
  const [searchingLeads, setSearchingLeads] = useState(false);

  // ── Filters ───────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState('todos');
  const [tagFilter, setTagFilter] = useState<number[]>([]);
  const [unreadFilter, setUnreadFilter] = useState(false);
  const [aiFilter, setAiFilter] = useState<'all' | 'on' | 'off'>('all');
  const [assignFilter, setAssignFilter] = useState<'all' | 'mine' | 'unassigned' | number>('all');
  const [showFilters, setShowFilters] = useState(false);

  // ── Bulk ──────────────────────────────────────────────────────────
  const [selectedBulk, setSelectedBulk] = useState<Set<string>>(new Set());
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [showBulkTag, setShowBulkTag] = useState(false);

  // ── CRM Panel ─────────────────────────────────────────────────────
  const [showCRM, setShowCRM] = useState(true);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [allTags, setAllTags] = useState<ContactTag[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('blue');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [togglingAI, setTogglingAI] = useState(false);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [showAssignMenu, setShowAssignMenu] = useState(false);

  // ── Chat UI ───────────────────────────────────────────────────────
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // ── New Chat Modal ────────────────────────────────────────────────
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // ── Misc ──────────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const loadedPicsRef = useRef<Set<string>>(new Set());
  const prevMsgCountRef = useRef<number>(0);
  const isTabFocusedRef = useRef<boolean>(true);
  const notifAudioRef = useRef<HTMLAudioElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  /* ================================================================ */
  /*  Effects                                                          */
  /* ================================================================ */

  useEffect(() => { setMounted(true); }, []);

  // Inicializar áudio de notificação
  useEffect(() => {
    notifAudioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1pbJF/f3R1eYiNjI2Uf39sZnJ+goOHkZaOgHVqcHuDh4qPkpCIe3FrbnZ+hIuRk5KOh31zbHB3gIeMkZOTj4d9c21udoCGi5KUk4+Ie3Jtb3eAhouRlJOPiHxybnB4gIaMkZSTj4h7cm5wd4CGjJGUk4+IfHJub3iAho2RlJOQiHxybm94f4aNkZSTkId9cm5vd4CGjZGUk5CIfXJub3eAho2RlJOQiHxybm94f4aNkZSTkIh8cm5veICGjZKUk5CIfHJub3h/ho2SlJOQiHxybm94f4aNkZSTkIh8cm5veICGjZKUk5CIfHJucHh/ho2SlJOQiHxybm94gIaNkpSTkIh8cm5veICGjZKVk5CIfHJucHh/ho2SlJOPiHxybm94gIaNkpSUkIh8cW5veICHjZKUk5CIfHFucHmAho2SlJSQiHxybm94gIeNkpSTkIh8cm5veICGjZKVk5GIfHFub3mAho6SlJSQiHxxbm94gIeOkpWUkIh8cW1veYCHjpKVlJCIfHFub3mAh46SlZSQiHxxbm94gIeOk5WUkIl8cG1weYCHj5OVlJCJe3FtcHmBh4+TlZSQiXxxbXB5gIePk5WVkIl7cW1veYCHj5OVlZCJfHBtcHmBh4+UlZWQiXxwbXB5gIeQlJaVkIl7cG1weYGHkJSWlZCJe3FtcHmAh5CUlpWRiXtwbXB5gYeQlJaWkIl7cG1xeYCIkJSWlpGJe3BtcHqBh5GUlpaRiXtwbHB6gYiRlZaWkYl7cGxxeoCIkZWWlpGJe3BscXqBiJGVl5aRiXtwbHF6gYiRlZeXkYl6cGxxeoGIkpaXl5GJe3BscXqBiJKWl5eRiXtwbHF6gYiSlpeXkol6b2xxeoGIkpeYl5KJe29scXuBiZKXmJeSiXtvbHF7gYmTl5iXkol6b2xxe4GJk5eYl5KKem9scXuCiZOXmJiSinpvbHF7gYmTmJiYkop6b2txe4KJk5iYmJKKem9rcXyCiZOYmZiSinpva3F8gomUmJmYk4p5b2txfIKJlJmZmJOKeW9rcXyCipSZmZmTinpva3F8gomUmZqZk4p5b2txfIKKlJmamZOKem9rcXyCipSZmpqTi3luanJ8goqVmpqak4t5bmtzfIKKlZqampOLem5rc3yCi5WampuTi3luanN8g4uWmpubk4t5bmtzfYOLlpucm5OLeW5qc32Di5abnJyTjHluanN9g4uWm5ycl');
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

  // Carregar dados iniciais
  useEffect(() => {
    loadChannels();
    loadTags();
    loadTeamUsers();
  }, []);

  // Polling de contatos
  useEffect(() => {
    if (activeChannel) {
      loadContacts();
      const interval = setInterval(loadContacts, 15000);
      return () => clearInterval(interval);
    }
  }, [activeChannel]);

  // Auto-selecionar contato via query param ?wa_id=
  useEffect(() => {
    const waIdParam = searchParams.get('wa_id');
    if (waIdParam && contacts.length > 0 && !selectedContact) {
      const found = contacts.find((c) => c.wa_id === waIdParam);
      if (found) setSelectedContact(found);
    }
  }, [contacts, searchParams]);

  // Carregar mensagens ao selecionar contato
  useEffect(() => {
    if (selectedContact) {
      prevMsgCountRef.current = 0;
      setShowScrollDown(false);
      setLoadingMessages(true);
      setMessages([]);
      loadMessages(selectedContact.wa_id);
      api.post(`/contacts/${selectedContact.wa_id}/read`);
      setNotesValue(selectedContact.notes || '');
      const interval = setInterval(() => loadMessages(selectedContact.wa_id), 10000);
      return () => clearInterval(interval);
    }
  }, [selectedContact]);

  // Scroll automático em novas mensagens
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

  /* ================================================================ */
  /*  Data loaders                                                     */
  /* ================================================================ */

  const loadChannels = async () => {
    try {
      const res = await api.get('/channels');
      setChannels(res.data);
      const messagingChannels = res.data.filter((ch: ChannelInfo) => ch.type === 'whatsapp' || ch.type === 'instagram');
      if (messagingChannels.length > 0 && !activeChannel) {
        setActiveChannel(messagingChannels[0]);
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

      if (prevMsgCountRef.current > 0 && newMsgs.length > prevMsgCountRef.current) {
        const newOnes = newMsgs.slice(prevMsgCountRef.current);
        const hasInbound = newOnes.some(m => m.direction === 'inbound');
        if (hasInbound) {
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

  /* ================================================================ */
  /*  CRM Handlers                                                     */
  /* ================================================================ */

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

  /* ================================================================ */
  /*  Chat Handlers                                                    */
  /* ================================================================ */

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

  /* ================================================================ */
  /*  Search                                                           */
  /* ================================================================ */

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

  /* ================================================================ */
  /*  New Chat Modal                                                   */
  /* ================================================================ */

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

  /* ================================================================ */
  /*  Filters & Bulk                                                   */
  /* ================================================================ */

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

  /* ================================================================ */
  /*  Computed                                                         */
  /* ================================================================ */

  const groupedMessages: { date: string; msgs: Message[] }[] = [];
  messages.forEach((msg) => {
    const date = formatDate(msg.timestamp);
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === date) last.msgs.push(msg);
    else groupedMessages.push({ date, msgs: [msg] });
  });

  const getStatusIcon = (s: string) => {
    switch (s) {
      case 'sent': return <CheckCheck className="w-3.5 h-3.5 text-[#b3d1cb]" />;
      case 'delivered': return <CheckCheck className="w-3.5 h-3.5 text-[#b3d1cb]" />;
      case 'read': return <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />;
      default: return <Clock className="w-3.5 h-3.5 text-[#b3d1cb]" />;
    }
  };

  /* ================================================================ */
  /*  Context value                                                    */
  /* ================================================================ */

  const value: ConversationsContextType = {
    user,
    channels, activeChannel, setActiveChannel, showChannelMenu, setShowChannelMenu,
    contacts, selectedContact, setSelectedContact, loading, setLoading, profilePics, setProfilePics,
    messages, newMessage, setNewMessage, sending, loadingMessages, groupedMessages,
    search, handleSearchChange, exactLeadResults, showLeadSuggestions, setShowLeadSuggestions, searchingLeads, selectExactLead,
    statusFilter, setStatusFilter, tagFilter, setTagFilter, unreadFilter, setUnreadFilter,
    aiFilter, setAiFilter, assignFilter, setAssignFilter, showFilters, setShowFilters,
    filteredContacts, hasActiveFilters, clearAllFilters,
    selectedBulk, setSelectedBulk, showBulkStatus, setShowBulkStatus, showBulkTag, setShowBulkTag,
    toggleBulkSelect, selectAllVisible, bulkUpdateStatus, bulkAddTag,
    showCRM, setShowCRM, showStatusMenu, setShowStatusMenu, showTagMenu, setShowTagMenu,
    allTags, newTagName, setNewTagName, newTagColor, setNewTagColor,
    editingNotes, setEditingNotes, notesValue, setNotesValue, togglingAI, teamUsers, showAssignMenu, setShowAssignMenu,
    toggleAI, updateLeadStatus, saveNotes, addTag, removeTag, createTag, assignContact,
    handleSend, handleKeyPress, onEmojiClick, handleFileUpload, startRecording, stopRecording, cancelRecording,
    isRecording, recordingTime, showEmojiPicker, setShowEmojiPicker, showAttachMenu, setShowAttachMenu,
    showScrollDown, setShowScrollDown,
    showNewChat, setShowNewChat, newChatPhone, setNewChatPhone, newChatName, setNewChatName,
    sendingTemplate, templates, selectedTemplate, setSelectedTemplate, templateParams, loadingTemplates,
    loadTemplates, selectTemplate, updateParam, getPreview, handleNewChat,
    messagesEndRef, emojiPickerRef, attachMenuRef, fileInputRef, imageInputRef, chatContainerRef,
    mounted, getStatusIcon, loadContacts,
  };

  return (
    <ConversationsContext.Provider value={value}>
      {children}
    </ConversationsContext.Provider>
  );
}
