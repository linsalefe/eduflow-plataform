'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, User, MessageCircle, LayoutDashboard, GitBranch,
  BarChart3, FileText, Users, Zap, PhoneCall, Calendar, Radio,
  Hash, Loader2,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
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
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>(null);
  const router = useRouter();

  // Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setContacts([]);
      setPages([]);
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
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  const navigateTo = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  const hasResults = contacts.length > 0 || pages.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Buscar contatos, páginas..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {/* Loading */}
        {loading && query.length >= 2 && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty */}
        {!loading && query.length >= 2 && !hasResults && (
          <CommandEmpty>Nenhum resultado para "{query}"</CommandEmpty>
        )}

        {/* Default hint */}
        {!loading && query.length < 2 && (
          <div className="py-6 text-center">
            <p className="text-[13px] text-muted-foreground">
              Digite pelo menos 2 caracteres para buscar
            </p>
          </div>
        )}

        {/* Pages */}
        {pages.length > 0 && (
          <CommandGroup heading="Páginas">
            {pages.map((page) => {
              const Icon = iconMap[page.icon] || LayoutDashboard;
              return (
                <CommandItem
                  key={page.href}
                  value={`page-${page.label}`}
                  onSelect={() => navigateTo(page.href)}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-[13px] font-medium">{page.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Separator */}
        {pages.length > 0 && contacts.length > 0 && <CommandSeparator />}

        {/* Contacts */}
        {contacts.length > 0 && (
          <CommandGroup heading="Contatos">
            {contacts.map((contact) => {
              const initials = contact.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              return (
                <CommandItem
                  key={contact.wa_id}
                  value={`contact-${contact.name}-${contact.wa_id}`}
                  onSelect={() => navigateTo(`/conversations?contact=${contact.wa_id}`)}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[11px] font-semibold flex-shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {contact.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground">
                        +{contact.wa_id}
                      </span>
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          statusColors[contact.lead_status] || 'bg-muted-foreground'
                        }`}
                      />
                      {contact.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag.id}
                          className="flex items-center gap-0.5 text-[10px] text-muted-foreground"
                        >
                          <Hash className="w-2.5 h-2.5" />
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}