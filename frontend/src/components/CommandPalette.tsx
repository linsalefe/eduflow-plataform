'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, X, User, MessageCircle, LayoutDashboard, GitBranch,
  BarChart3, FileText, Users, Zap, PhoneCall, Calendar, Radio,
  ArrowRight, Command, Hash,
} from 'lucide-react';
import api from '@/lib/api';

interface ContactResult {
  wa_id: string;
  name: string;
  lead_status: string;
  tags: { id: number; name: string; color: string }[];
}

interface PageResult {
  label: string;
  href: string;
  icon: string;
}

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard, MessageCircle, GitBranch, BarChart3,
  FileText, Users, Zap, PhoneCall, Calendar, Radio,
};

const statusColors: Record<string, string> = {
  novo: 'bg-blue-500',
  em_contato: 'bg-amber-500',
  qualificado: 'bg-purple-500',
  negociando: 'bg-cyan-500',
  convertido: 'bg-emerald-500',
  perdido: 'bg-red-500',
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<ContactResult[]>([]);
  const [pages, setPages] = useState<PageResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>(null);
  const router = useRouter();

  // Total items for keyboard navigation
  const allItems = [
    ...pages.map(p => ({ type: 'page' as const, ...p })),
    ...contacts.map(c => ({ type: 'contact' as const, ...c })),
  ];

  // Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setContacts([]);
      setPages([]);
      setActiveIndex(0);
    }
  }, [open]);

  // Search with debounce
  const doSearch = useCallback(async (term: string) => {
    if (term.length < 2) {
      setContacts([]);
      setPages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/search?q=${encodeURIComponent(term)}`);
      setContacts(res.data.contacts || []);
      setPages(res.data.pages || []);
      setActiveIndex(0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const navigate = (item: typeof allItems[0]) => {
    setOpen(false);
    if (item.type === 'page') {
      router.push((item as PageResult & { type: 'page' }).href);
    } else {
      router.push(`/conversations?contact=${(item as ContactResult & { type: 'contact' }).wa_id}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && allItems[activeIndex]) {
      e.preventDefault();
      navigate(allItems[activeIndex]);
    }
  };

  if (!open) return null;

  const hasResults = contacts.length > 0 || pages.length > 0;
  const showEmpty = query.length >= 2 && !loading && !hasResults;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in zoom-in-95 slide-in-from-top-2 duration-200">

        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar contatos, páginas..."
            className="flex-1 text-[15px] text-gray-800 placeholder:text-gray-400 outline-none bg-transparent"
            aria-label="Busca global"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Limpar" className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-400 text-[11px] font-medium rounded-md border border-gray-200">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[340px] overflow-y-auto">

          {/* Loading */}
          {loading && query.length >= 2 && (
            <div className="px-4 py-8 text-center">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-[#6366f1] rounded-full animate-spin mx-auto" />
            </div>
          )}

          {/* Empty */}
          {showEmpty && (
            <div className="px-4 py-8 text-center">
              <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-[13px] text-gray-400">Nenhum resultado para "{query}"</p>
            </div>
          )}

          {/* Pages */}
          {pages.length > 0 && (
            <div className="px-2 pt-2 pb-1">
              <p className="px-2 pb-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Páginas</p>
              {pages.map((page, i) => {
                const Icon = iconMap[page.icon] || LayoutDashboard;
                const idx = i;
                return (
                  <button
                    key={page.href}
                    data-index={idx}
                    onClick={() => navigate({ type: 'page', ...page })}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                      activeIndex === idx ? 'bg-[#6366f1]/8 text-[#6366f1]' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      activeIndex === idx ? 'bg-[#6366f1]/15' : 'bg-gray-100'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-[13px] font-medium flex-1">{page.label}</span>
                    <ArrowRight className={`w-3.5 h-3.5 transition-opacity ${activeIndex === idx ? 'opacity-100' : 'opacity-0'}`} />
                  </button>
                );
              })}
            </div>
          )}

          {/* Contacts */}
          {contacts.length > 0 && (
            <div className="px-2 pt-2 pb-2">
              <p className="px-2 pb-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Contatos</p>
              {contacts.map((contact, i) => {
                const idx = pages.length + i;
                const initials = contact.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                return (
                  <button
                    key={contact.wa_id}
                    data-index={idx}
                    onClick={() => navigate({ type: 'contact', ...contact })}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                      activeIndex === idx ? 'bg-[#6366f1]/8' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-800 truncate">{contact.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-gray-400">+{contact.wa_id}</span>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusColors[contact.lead_status] || 'bg-gray-400'}`} />
                        {contact.tags.slice(0, 2).map(tag => (
                          <span key={tag.id} className="flex items-center gap-0.5 text-[10px] text-gray-400">
                            <Hash className="w-2.5 h-2.5" />{tag.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ArrowRight className={`w-3.5 h-3.5 text-[#6366f1] transition-opacity flex-shrink-0 ${activeIndex === idx ? 'opacity-100' : 'opacity-0'}`} />
                  </button>
                );
              })}
            </div>
          )}

          {/* Default state */}
          {!loading && query.length < 2 && (
            <div className="px-4 py-6 text-center">
              <p className="text-[13px] text-gray-400">Digite pelo menos 2 caracteres para buscar</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px]">↑↓</kbd>
            <span>navegar</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px]">Enter</kbd>
            <span>abrir</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px]">Esc</kbd>
            <span>fechar</span>
          </div>
        </div>
      </div>
    </div>
  );
}