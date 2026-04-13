'use client';

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
  Target,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import AppShell from "@/components/app-shell";
import ActivityTimeline from '@/components/ActivityTimeline';
import { ConversationsProvider, useConversations } from '@/components/conversations/conversations-provider';
import { Suspense, useState } from 'react';
import { leadStatuses, tagColors, getInitials, getAvatarColor, formatTime, formatFullDate, formatRecordingTime, getStatusConfig, getTagColorConfig } from '@/lib/inbox-constants';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

export default function ConversationsPage() {
  return (
    <Suspense>
      <ConversationsProvider>
        <ConversationsContent />
      </ConversationsProvider>
    </Suspense>
  );
}

function ConversationsContent() {
  const {
    user,
    channels, activeChannel, setActiveChannel, showChannelMenu, setShowChannelMenu,
    contacts, selectedContact, setSelectedContact, loading, setLoading, profilePics, setProfilePics,
    newMessage, setNewMessage, sending, loadingMessages, groupedMessages,
    search, handleSearchChange, exactLeadResults, showLeadSuggestions, setShowLeadSuggestions, selectExactLead,
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
    getStatusIcon,
  } = useConversations();

  const [showCRMMobile, setShowCRMMobile] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

  return (
    <AppShell fullWidth>
      <div className="flex h-full overflow-hidden">
        {/* ============================================================ */}
        {/* SIDEBAR CONTATOS                                             */}
        {/* ============================================================ */}
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
                  <button onClick={() => { handleSearchChange(''); }} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2">
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

                <div>
                  <p className="text-[10px] font-semibold text-[#8696a0] uppercase tracking-wider mb-1.5">Atendente</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setAssignFilter(assignFilter === 'mine' ? 'all' : 'mine')}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                        assignFilter === 'mine' ? 'bg-primary/20 text-[#60a5fa]' : 'bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]'
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
                          assignFilter === u.id ? 'bg-primary/20 text-[#60a5fa]' : 'bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full bg-primary/30 flex items-center justify-center text-[#60a5fa] text-[7px] font-bold">
                          {u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        {u.name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>

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
                        <div className="h-3.5 bg-[#2a3942] rounded-md animate-pulse" style={{ width: `${70 + (i % 3) * 20}px` }} />
                        <div className="h-2.5 bg-[#2a3942] rounded-md animate-pulse w-10" />
                      </div>
                      <div className="h-3 bg-[#2a3942]/60 rounded-md animate-pulse" style={{ width: `${100 + (i % 4) * 25}px` }} />
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
                            <p className="font-normal text-[15px] truncate text-[#e9edef]">
                              {contact.ai_active && "🤖 "}{contact.name || contact.wa_id}
                            </p>
                            <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                              {contact.assigned_to && (() => {
                                const assignedUser = teamUsers.find(u => u.id === contact.assigned_to);
                                return assignedUser ? (
                                  <div className="w-5 h-5 rounded-full bg-primary/30 flex items-center justify-center text-[#60a5fa] text-[8px] font-bold" title={assignedUser.name}>
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
                        <button key={s.value} onClick={() => bulkUpdateStatus(s.value)} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#e9edef] hover:bg-[#182229] transition-colors">
                          <span className={`w-2 h-2 rounded-full ${s.color}`} />
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

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
                          <button key={tag.id} onClick={() => bulkAddTag(tag.id)} className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-[#182229] transition-colors ${tc.text}`}>
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

        {/* ============================================================ */}
        {/* CHAT AREA                                                    */}
        {/* ============================================================ */}
        <div className={`${selectedContact ? 'flex' : 'hidden lg:flex'} flex-1 flex-col min-w-0 overflow-hidden`}>
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
                    className={`hidden xl:flex p-2 rounded-full transition-all duration-200 ${showCRM ? 'bg-[#2a3942] text-[#00a884]' : 'hover:bg-[#2a3942] text-[#8696a0]'}`}
                    title="Painel CRM" aria-label="Painel CRM"
                  >
                    <User className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setShowCRMMobile(true)}
                    className="xl:hidden p-2 rounded-full hover:bg-[#2a3942] text-[#8696a0] hover:text-[#00a884] transition-all duration-200"
                    title="Informações do Lead" aria-label="Informações do Lead"
                  >
                    <User className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-1 overflow-hidden">
                {/* Messages Area */}
                <div className="flex-1 flex flex-col min-w-0">
                  <div
                    ref={chatContainerRef}
                    onScroll={() => {
                      const c = chatContainerRef.current;
                      if (c) setShowScrollDown(c.scrollHeight - c.scrollTop - c.clientHeight > 150);
                    }}
                    className="flex-1 overflow-y-auto px-[4%] py-4 space-y-1 bg-[#0b141a] relative"
                    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='p' width='40' height='40' patternUnits='userSpaceOnUse'%3E%3Cpath d='M20 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z' fill='%23111b21' fill-opacity='0.6'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='200' height='200' fill='url(%23p)'/%3E%3C/svg%3E\")" }}
                  >

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
                                  {msg.direction === 'outbound' ? (
                                    <span className="absolute -right-2 top-0 w-0 h-0 border-t-[8px] border-t-[#005c4b] border-r-[8px] border-r-transparent" />
                                  ) : (
                                    <span className="absolute -left-2 top-0 w-0 h-0 border-t-[8px] border-t-[#202c33] border-l-[8px] border-l-transparent" />
                                  )}

                                  {(() => {
                                    const isLocal = msg.content.startsWith('local:');
                                    const isMedia = msg.content.startsWith('media:');
                                    if (!isLocal && !isMedia) return <p className="text-[14.2px] whitespace-pre-wrap break-words leading-[19px]">{msg.content}</p>;
                                    const parts = msg.content.split('|');
                                    const ref = parts[0].replace('local:', '').replace('media:', '');
                                    const mime = parts[1] || '';
                                    const caption = parts[2] || '';
                                    const src = isLocal
                                      ? `${apiUrl}/media/local/${ref}`
                                      : `${apiUrl}/media/${ref}?channel_id=${activeChannel?.id || 1}`;
                                    if (msg.type === 'image') return (
                                      <>
                                        <img src={src} alt={caption || 'Imagem'} className="max-w-[280px] rounded-md serviçor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(src, '_blank')} />
                                        {caption && <p className="text-[13px] mt-1 whitespace-pre-wrap">{caption}</p>}
                                      </>
                                    );
                                    if (msg.type === 'audio') return (
                                      <audio controls className="max-w-[280px]">
                                        <source src={src} type={mime || 'audio/ogg'} />
                                      </audio>
                                    );
                                    if (msg.type === 'video') return (
                                      <video controls className="max-w-[280px] rounded-md">
                                        <source src={src} type={mime || 'video/mp4'} />
                                      </video>
                                    );
                                    if (msg.type === 'sticker') return (
                                      <img src={src} alt="Sticker" className="w-32 h-32" />
                                    );
                                    if (msg.type === 'document') return (
                                      <a href={src} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 ${msg.direction === 'outbound' ? 'text-[#8fdfcc]' : 'text-[#53bdeb]'} underline text-sm`}>
                                        📄 {caption || 'Documento'}
                                      </a>
                                    );
                                    return <p className="text-[14.2px] whitespace-pre-wrap break-words leading-[19px]">{msg.content}</p>;
                                  })()}

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

                    {showScrollDown && (
                      <button
                        onClick={() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); setShowScrollDown(false); }}
                        aria-label="Rolar para baixo"
                        className="sticky bottom-4 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#202c33] border border-[#2a3942] rounded-full flex items-center justify-center shadow-lg hover:bg-[#2a3942] transition-all z-10"
                      >
                        <ChevronDown className="w-5 h-5 text-[#8696a0]" />
                      </button>
                    )}
                  </div>

                  {/* Composer */}
                  <div className="px-3 py-2 bg-[#202c33]">
                    {isRecording ? (
                      <div className="flex items-center gap-3">
                        <button onClick={cancelRecording} aria-label="Cancelar gravação" className="p-2 rounded-full hover:bg-[#2a3942] text-red-400 hover:text-red-300 transition-all" title="Cancelar gravação">
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
                        <button onClick={stopRecording} aria-label="Enviar áudio" className="flex items-center justify-center w-[42px] h-[42px] bg-[#00a884] rounded-full text-white hover:bg-[#06cf9c] active:scale-95 transition-all flex-shrink-0" title="Enviar áudio">
                          <Send className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-end gap-2">
                        <div className="relative" ref={emojiPickerRef}>
                          <button onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowAttachMenu(false); }} className={`p-2 rounded-full transition-all ${showEmojiPicker ? 'text-[#00a884]' : 'text-[#8696a0] hover:text-[#e9edef]'}`} title="Emoji">
                            <Smile className="w-6 h-6" />
                          </button>
                          {showEmojiPicker && (
                            <div className="absolute bottom-12 left-0 z-50">
                              <EmojiPicker onEmojiClick={onEmojiClick} theme={'dark' as any} width={320} height={400} searchPlaceHolder="Pesquisar emoji" previewConfig={{ showPreview: false }} />
                            </div>
                          )}
                        </div>

                        <div className="relative" ref={attachMenuRef}>
                          <button onClick={() => { setShowAttachMenu(!showAttachMenu); setShowEmojiPicker(false); }} className={`p-2 rounded-full transition-all ${showAttachMenu ? 'text-[#00a884] rotate-45' : 'text-[#8696a0] hover:text-[#e9edef]'}`} title="Anexar">
                            <Paperclip className="w-6 h-6 transition-transform" />
                          </button>
                          {showAttachMenu && (
                            <div className="absolute bottom-12 left-0 z-50 bg-[#233138] rounded-xl border border-[#2a3942] shadow-xl overflow-hidden min-w-[180px]">
                              <button onClick={() => { imageInputRef.current?.click(); setShowAttachMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#182229] transition-colors text-left">
                                <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center"><ImageIcon className="w-4 h-4 text-white" /></div>
                                <span className="text-[14px] text-[#e9edef]">Fotos e vídeos</span>
                              </button>
                              <button onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#182229] transition-colors text-left">
                                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center"><FileText className="w-4 h-4 text-white" /></div>
                                <span className="text-[14px] text-[#e9edef]">Documento</span>
                              </button>
                            </div>
                          )}
                          <input ref={imageInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file, 'image'); e.target.value = ''; }} />
                          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file, 'document'); e.target.value = ''; }} />
                        </div>

                        <textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={handleKeyPress} placeholder="Digite uma mensagem" rows={1} className="flex-1 px-3 py-2.5 bg-[#2a3942] rounded-lg text-[14px] text-[#e9edef] placeholder:text-[#8696a0] resize-none focus:outline-none transition-all" />

                        {newMessage.trim() ? (
                          <button onClick={handleSend} disabled={sending} className="flex items-center justify-center w-[42px] h-[42px] bg-[#00a884] rounded-full text-white hover:bg-[#06cf9c] active:scale-95 transition-all disabled:opacity-40 flex-shrink-0">
                            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                          </button>
                        ) : (
                          <button onClick={startRecording} className="flex items-center justify-center w-[42px] h-[42px] rounded-full text-[#8696a0] hover:text-[#e9edef] transition-all flex-shrink-0" title="Gravar áudio">
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
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${selectedContact.ai_active ? "border-[#00a884]/30 bg-[#00a884]/10" : "border-[#2a3942] bg-[#202c33]"}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[16px]">{selectedContact.ai_active ? "🤖" : "👤"}</span>
                            <span className={`text-[13px] font-medium ${selectedContact.ai_active ? "text-[#00a884]" : "text-[#8696a0]"}`}>
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
                          <button onClick={() => setShowAssignMenu(!showAssignMenu)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-[#2a3942] bg-[#202c33] hover:bg-[#2a3942] transition-all">
                            <div className="flex items-center gap-2">
                              {selectedContact.assigned_to ? (
                                <>
                                  <div className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-[#60a5fa] text-[9px] font-bold">
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
                              <button onClick={() => assignContact(null)} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#182229] transition-colors text-left">
                                <User className="w-4 h-4 text-[#8696a0]" />
                                <span className="text-[13px] text-[#8696a0]">Ninguém</span>
                              </button>
                              {teamUsers.map(u => (
                                <button key={u.id} onClick={() => assignContact(u.id)} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#182229] transition-colors text-left">
                                  <div className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-[#60a5fa] text-[9px] font-bold">
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
                                <button key={s.value} onClick={() => updateLeadStatus(s.value)} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#182229] transition-colors text-left">
                                  <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                                  <span className="text-[13px] text-[#e9edef]">{s.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Valor do Lead */}
                      <div className="pb-4 border-b border-[#2a3942]">
                        <p className="text-[11px] font-semibold text-[#8696a0] uppercase tracking-wider mb-2">Valor do Lead</p>
                        <p className="text-lg font-bold text-emerald-400">
                          {(selectedContact.deal_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
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
                                <button key={tag.id} onClick={() => { addTag(tag.id); setShowTagMenu(false); }} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium ${tc.bg} ${tc.text} hover:opacity-80 transition-opacity`}>
                                  {tag.name}
                                </button>
                              );
                            })}

                            <div className="pt-2 border-t border-[#2a3942]">
                              <p className="text-[10px] text-[#8696a0] uppercase font-semibold mb-1.5 tracking-wider">Criar nova tag</p>
                              <input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Nome da tag" className="w-full px-2.5 py-1.5 text-[12px] text-[#e9edef] bg-[#2a3942] border border-[#3b4a54] rounded-lg outline-none focus:border-[#00a884] transition-colors" />
                              <div className="flex gap-1.5 mt-2">
                                {tagColors.map(c => (
                                  <button key={c.value} onClick={() => setNewTagColor(c.value)} className={`w-5 h-5 rounded-full ${c.bg} transition-all ${newTagColor === c.value ? 'ring-2 ring-offset-1 ring-offset-[#202c33] ring-[#00a884] scale-110' : 'hover:scale-105'}`} />
                                ))}
                              </div>
                              <button onClick={() => { createTag(); setShowTagMenu(false); }} disabled={!newTagName.trim()} className="w-full mt-2.5 px-2.5 py-1.5 bg-[#00a884] text-[#111b21] text-[11px] font-medium rounded-lg disabled:opacity-40 hover:bg-[#06cf9c] transition-colors">
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
                            <button onClick={() => setEditingNotes(true)} className="text-[12px] text-[#00a884] font-medium hover:text-[#06cf9c] transition-colors">Editar</button>
                          )}
                        </div>

                        {editingNotes ? (
                          <div>
                            <textarea value={notesValue} onChange={(e) => setNotesValue(e.target.value)} rows={4} className="w-full px-3 py-2.5 text-[13px] text-[#e9edef] bg-[#2a3942] border border-[#3b4a54] rounded-xl outline-none focus:border-[#00a884] resize-none transition-all" placeholder="Adicione notas sobre este lead..." />
                            <div className="flex gap-2 mt-2">
                              <button onClick={saveNotes} className="px-3.5 py-1.5 bg-[#00a884] text-[#111b21] text-[11px] font-medium rounded-lg hover:bg-[#06cf9c] transition-colors">Salvar</button>
                              <button onClick={() => { setEditingNotes(false); setNotesValue(selectedContact.notes || ''); }} className="px-3.5 py-1.5 text-[#8696a0] text-[11px] font-medium rounded-lg hover:bg-[#202c33] transition-colors">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-[#202c33] rounded-xl p-3 min-h-[60px] border border-[#2a3942]">
                            <p className="text-[13px] text-[#8696a0] whitespace-pre-wrap leading-relaxed">{selectedContact.notes || 'Sem notas'}</p>
                          </div>
                        )}
                      </div>

                      {/* Criar Tarefa */}
                      <div>
                        <button
                          onClick={() => {
                            const params = new URLSearchParams({ contact: selectedContact.wa_id, name: selectedContact.name || '' });
                            window.open(`/tarefas?new=1&${params.toString()}`, '_self');
                          }}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-primary/20 text-[#60a5fa] text-[12px] font-medium rounded-xl hover:bg-primary/30 transition-colors border border-primary/20"
                        >
                          <Target className="w-4 h-4" />
                          Criar Tarefa para este Lead
                        </button>
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
                <button onClick={() => { setShowNewChat(false); setSelectedTemplate(null); }} aria-label="Fechar" className="p-1.5 hover:bg-[#2a3942] rounded-lg transition-colors">
                  <X className="w-5 h-5 text-[#8696a0]" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-[#8696a0] mb-1.5">Telefone do lead</label>
                  <input type="text" value={newChatPhone} onChange={e => setNewChatPhone(e.target.value)} placeholder="5583988001234" className="w-full px-4 py-2.5 bg-[#2a3942] border border-[#3b4a54] rounded-lg text-sm text-[#e9edef] placeholder:text-[#8696a0] focus:border-[#00a884] outline-none transition-all" />
                  <p className="text-[11px] text-[#8696a0] mt-1">DDD + número com 9 (sem espaços)</p>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#8696a0] mb-1.5">Nome do lead</label>
                  <input type="text" value={newChatName} onChange={e => setNewChatName(e.target.value)} placeholder="Maria Silva" className="w-full px-4 py-2.5 bg-[#2a3942] border border-[#3b4a54] rounded-lg text-sm text-[#e9edef] placeholder:text-[#8696a0] focus:border-[#00a884] outline-none transition-all" />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#8696a0] mb-1.5">Template da mensagem</label>
                  {loadingTemplates ? (
                    <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 text-[#00a884] animate-spin" /></div>
                  ) : templates.length === 0 ? (
                    <button onClick={loadTemplates} className="w-full py-2.5 border border-dashed border-[#3b4a54] rounded-lg text-sm text-[#8696a0] hover:border-[#00a884] hover:text-[#00a884] transition-colors">Carregar templates disponíveis</button>
                  ) : (
                    <div className="space-y-2">
                      {templates.map((t: any) => (
                        <button key={t.name} onClick={() => selectTemplate(t)} className={`w-full text-left px-3.5 py-2.5 rounded-lg border text-sm transition-all ${selectedTemplate?.name === t.name ? 'border-[#00a884] bg-[#00a884]/10 text-[#00a884]' : 'border-[#2a3942] text-[#e9edef] hover:border-[#3b4a54] hover:bg-[#202c33]'}`}>
                          <p className="font-medium text-[13px]">{t.name.replace(/_/g, ' ')}</p>
                          <p className="text-[11px] text-[#8696a0] mt-0.5">{t.language} • {t.parameters.length} variáveis</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedTemplate && selectedTemplate.parameters.length > 0 && (
                  <div className="space-y-3 pt-1">
                    <p className="text-[11px] font-semibold text-[#8696a0] uppercase tracking-wider">Preencher variáveis</p>
                    {selectedTemplate.parameters.map((p: string, i: number) => (
                      <div key={i}>
                        <label className="block text-[11px] text-[#8696a0] mb-1">{p} ({`{{${i + 1}}}`})</label>
                        <input type="text" value={templateParams[i] || ''} onChange={e => updateParam(i, e.target.value)} placeholder={`Valor para ${p}`} className="w-full px-3 py-2 bg-[#2a3942] border border-[#3b4a54] rounded-lg text-sm text-[#e9edef] placeholder:text-[#8696a0] focus:border-[#00a884] outline-none transition-all" />
                      </div>
                    ))}
                  </div>
                )}

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
                  <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                ) : (
                  <><Send className="w-4 h-4" /> Enviar template</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* MODAL CRM MOBILE */}
        {showCRMMobile && selectedContact && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 xl:hidden" onClick={() => setShowCRMMobile(false)}>
            <div
              className="absolute bottom-0 left-0 right-0 bg-[#111b21] rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up"
              onClick={e => e.stopPropagation()}
            >
              {/* Handle bar + header */}
              <div className="sticky top-0 bg-[#111b21] pt-3 pb-2 px-5 flex items-center justify-between border-b border-[#2a3942] rounded-t-2xl z-10">
                <div className="w-10 h-1 rounded-full bg-[#3b4a54] mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
                <h3 className="text-[15px] font-semibold text-[#e9edef] mt-2">Informações do Lead</h3>
                <button onClick={() => setShowCRMMobile(false)} className="p-1.5 hover:bg-[#2a3942] rounded-lg transition-colors mt-2">
                  <X className="w-5 h-5 text-[#8696a0]" />
                </button>
              </div>

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
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${selectedContact.ai_active ? "border-[#00a884]/30 bg-[#00a884]/10" : "border-[#2a3942] bg-[#202c33]"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[16px]">{selectedContact.ai_active ? "🤖" : "👤"}</span>
                      <span className={`text-[13px] font-medium ${selectedContact.ai_active ? "text-[#00a884]" : "text-[#8696a0]"}`}>
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
                    <button onClick={() => setShowAssignMenu(!showAssignMenu)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-[#2a3942] bg-[#202c33] hover:bg-[#2a3942] transition-all">
                      <div className="flex items-center gap-2">
                        {selectedContact.assigned_to ? (
                          <>
                            <div className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-[#60a5fa] text-[9px] font-bold">
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
                        <button onClick={() => assignContact(null)} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#182229] transition-colors text-left">
                          <User className="w-4 h-4 text-[#8696a0]" />
                          <span className="text-[13px] text-[#8696a0]">Ninguém</span>
                        </button>
                        {teamUsers.map(u => (
                          <button key={u.id} onClick={() => assignContact(u.id)} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#182229] transition-colors text-left">
                            <div className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-[#60a5fa] text-[9px] font-bold">
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
                          <button key={s.value} onClick={() => updateLeadStatus(s.value)} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#182229] transition-colors text-left">
                            <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                            <span className="text-[13px] text-[#e9edef]">{s.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Valor do Lead */}
                <div className="pb-4 border-b border-[#2a3942]">
                  <p className="text-[11px] font-semibold text-[#8696a0] uppercase tracking-wider mb-2">Valor do Lead</p>
                  <p className="text-lg font-bold text-emerald-400">
                    {(selectedContact.deal_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
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
                          <button key={tag.id} onClick={() => { addTag(tag.id); setShowTagMenu(false); }} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium ${tc.bg} ${tc.text} hover:opacity-80 transition-opacity`}>
                            {tag.name}
                          </button>
                        );
                      })}

                      <div className="pt-2 border-t border-[#2a3942]">
                        <p className="text-[10px] text-[#8696a0] uppercase font-semibold mb-1.5 tracking-wider">Criar nova tag</p>
                        <input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Nome da tag" className="w-full px-2.5 py-1.5 text-[12px] text-[#e9edef] bg-[#2a3942] border border-[#3b4a54] rounded-lg outline-none focus:border-[#00a884] transition-colors" />
                        <div className="flex gap-1.5 mt-2">
                          {tagColors.map(c => (
                            <button key={c.value} onClick={() => setNewTagColor(c.value)} className={`w-5 h-5 rounded-full ${c.bg} transition-all ${newTagColor === c.value ? 'ring-2 ring-offset-1 ring-offset-[#202c33] ring-[#00a884] scale-110' : 'hover:scale-105'}`} />
                          ))}
                        </div>
                        <button onClick={() => { createTag(); setShowTagMenu(false); }} disabled={!newTagName.trim()} className="w-full mt-2.5 px-2.5 py-1.5 bg-[#00a884] text-[#111b21] text-[11px] font-medium rounded-lg disabled:opacity-40 hover:bg-[#06cf9c] transition-colors">
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
                      <button onClick={() => setEditingNotes(true)} className="text-[12px] text-[#00a884] font-medium hover:text-[#06cf9c] transition-colors">Editar</button>
                    )}
                  </div>

                  {editingNotes ? (
                    <div>
                      <textarea value={notesValue} onChange={(e) => setNotesValue(e.target.value)} rows={4} className="w-full px-3 py-2.5 text-[13px] text-[#e9edef] bg-[#2a3942] border border-[#3b4a54] rounded-xl outline-none focus:border-[#00a884] resize-none transition-all" placeholder="Adicione notas sobre este lead..." />
                      <div className="flex gap-2 mt-2">
                        <button onClick={saveNotes} className="px-3.5 py-1.5 bg-[#00a884] text-[#111b21] text-[11px] font-medium rounded-lg hover:bg-[#06cf9c] transition-colors">Salvar</button>
                        <button onClick={() => { setEditingNotes(false); setNotesValue(selectedContact.notes || ''); }} className="px-3.5 py-1.5 text-[#8696a0] text-[11px] font-medium rounded-lg hover:bg-[#202c33] transition-colors">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#202c33] rounded-xl p-3 min-h-[60px] border border-[#2a3942]">
                      <p className="text-[13px] text-[#8696a0] whitespace-pre-wrap leading-relaxed">{selectedContact.notes || 'Sem notas'}</p>
                    </div>
                  )}
                </div>

                {/* Criar Tarefa */}
                <div>
                  <button
                    onClick={() => {
                      const params = new URLSearchParams({ contact: selectedContact.wa_id, name: selectedContact.name || '' });
                      window.open(`/tarefas?new=1&${params.toString()}`, '_self');
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-primary/20 text-[#60a5fa] text-[12px] font-medium rounded-xl hover:bg-primary/30 transition-colors border border-primary/20"
                  >
                    <Target className="w-4 h-4" />
                    Criar Tarefa para este Lead
                  </button>
                </div>

                {/* Timeline */}
                <div>
                  <p className="text-[11px] font-semibold text-[#8696a0] uppercase tracking-wider mb-2">Atividades</p>
                  <ActivityTimeline contactWaId={selectedContact.wa_id} />
                </div>

              </div>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}