'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import api from '@/lib/api';
import {
  LayoutDashboard,
  MessageCircle,
  Users,
  LogOut,
  Zap,
  Radio,
  PhoneIncoming,
  FileText,
  BarChart3,
  PhoneCall,
  GitBranch,
  Calendar,
  Sparkles,
  Search,
  Download,
  TrendingUp,
  Target,
  DollarSign,
  Shield,
  Bot,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import NotificationBell from './NotificationBell';
import CommandPalette from './CommandPalette';

/* ============================================================
   FEATURE MAP — rota → feature flag
   ============================================================ */
const featureMap: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/conversations': 'conversas',
  '/pipeline': 'pipeline',
  '/contatos': 'contatos',
  '/financeiro': 'financeiro',
  '/dashboard-roi': 'campanhas',
  '/landing-pages': 'landing_pages',
  '/relatorios': 'relatorios',
  '/users': 'usuarios',
  '/automacoes': 'automacoes',
  '/tarefas': 'tarefas',
  '/configuracoes/metas': 'dashboard',
  '/ai-config': 'ai_whatsapp',
  '/voice-ai': 'voice_ai',
  '/voice-inbound': 'voice_inbound',
  '/agenda': 'agenda',
  '/canais': 'conversas',
  '/configuracoes/agentes': 'agentes_ia',
};

/* ============================================================
   MENU GROUPS
   ============================================================ */
const menuGroups = [
  {
    label: 'Principal',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard,
        color: 'text-blue-600', bg: 'bg-blue-500/10' },
      { href: '/conversations', label: 'Conversas', icon: MessageCircle, hasBadge: true,
        color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
      { href: '/pipeline', label: 'Pipeline', icon: GitBranch,
        color: 'text-violet-600', bg: 'bg-violet-500/10' },
      { href: '/contatos', label: 'Contatos', icon: Users,
        color: 'text-amber-600', bg: 'bg-amber-500/10' },
      { href: '/financeiro', label: 'Financeiro', icon: DollarSign,
        color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { href: '/dashboard-roi', label: 'Campanhas', icon: BarChart3,
        color: 'text-rose-600', bg: 'bg-rose-500/10' },
      { href: '/landing-pages', label: 'Landing Pages', icon: FileText,
        color: 'text-sky-600', bg: 'bg-sky-500/10' },
      { href: '/relatorios', label: 'Relatórios', icon: Download,
        color: 'text-slate-600', bg: 'bg-slate-500/10' },
    ],
  },
  {
    label: 'Configurações',
    items: [
      { href: '/users', label: 'Usuários', icon: Users,
        color: 'text-gray-600', bg: 'bg-gray-500/10' },
      { href: '/automacoes', label: 'Automações', icon: Zap,
        color: 'text-amber-600', bg: 'bg-amber-500/10' },
      { href: '/tarefas', label: 'Tarefas', icon: Target, hasTaskBadge: true,
        color: 'text-orange-600', bg: 'bg-orange-500/10' },
      { href: '/configuracoes/metas', label: 'Metas', icon: TrendingUp,
        color: 'text-primary', bg: 'bg-primary/10' },
      { href: '/voice-ai', label: 'Voice AI', icon: PhoneCall,
        color: 'text-indigo-600', bg: 'bg-indigo-500/10' },
      { href: '/voice-inbound', label: 'Atendimento IA', icon: PhoneIncoming,
        color: 'text-emerald-600', bg: 'bg-emerald-500/10' },  
      { href: '/agenda', label: 'Agenda', icon: Calendar,
        color: 'text-teal-600', bg: 'bg-teal-500/10' },
      { href: '/canais', label: 'Canais', icon: Radio,
        color: 'text-cyan-600', bg: 'bg-cyan-500/10' },
      { href: '/ai-config', label: 'Config. IA', icon: Sparkles,
        color: 'text-purple-600', bg: 'bg-purple-500/10' },
      { href: '/configuracoes/agentes', label: 'Agentes IA', icon: Bot,
        color: 'text-fuchsia-600', bg: 'bg-fuchsia-500/10' },
    ],
  },
];

/* ============================================================
   PAGE TITLES — para breadcrumb
   ============================================================ */
const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/conversations': 'Conversas',
  '/pipeline': 'Pipeline',
  '/contatos': 'Contatos',
  '/financeiro': 'Financeiro',
  '/dashboard-roi': 'Campanhas',
  '/landing-pages': 'Landing Pages',
  '/relatorios': 'Relatórios',
  '/users': 'Usuários',
  '/automacoes': 'Automações',
  '/voice-inbound': 'Atendimento por Voz',
  '/tarefas': 'Tarefas',
  '/configuracoes/metas': 'Metas Mensais',
  '/voice-ai': 'Voice AI',
  '/agenda': 'Agenda',
  '/canais': 'Canais',
  '/ai-config': 'Config. IA',
  '/configuracoes/agentes': 'Agentes IA',
  '/admin': 'Painel Admin',
};

/* ============================================================
   SIDEBAR NAV CONTENT (extracted for reuse in mobile sheet)
   ============================================================ */
function SidebarNavContent({
  unreadCount,
  taskCount,
  onNavigate,
}: {
  unreadCount: number;
  taskCount: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, hasFeature } = useAuth();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const getInitials = (name: string) =>
    name
      ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
      : '??';

  const openSearch = () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true })
    );
  };

  return (
    <>
      <SidebarHeader className="p-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Image
            src="/logo-icon-color.png"
            alt="EduFlow"
            width={32}
            height={32}
            className="object-contain flex-shrink-0"
          />
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-semibold text-[15px] tracking-widest uppercase leading-tight text-foreground">
              EduFlow
            </span>
            <span className="text-[10px] text-muted-foreground font-medium tracking-wide">
              Hub
            </span>
          </div>
        </div>

        {/* Search button */}
        <button
          onClick={openSearch}
          className="sidebar-search mt-3 w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-200
                     bg-muted/30 hover:bg-muted/60 border border-border/50 text-muted-foreground"
        >
          <Search className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-left text-[13px] group-data-[collapsible=icon]:hidden">
            Buscar...
          </span>
          <kbd className="px-1.5 py-0.5 bg-background text-muted-foreground text-[10px] font-medium rounded border border-border group-data-[collapsible=icon]:hidden">
            ⌘K
          </kbd>
        </button>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {/* Superadmin */}
        {user?.role === 'superadmin' && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground sidebar-group-label-line">
              Superadmin
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === '/admin'}
                  tooltip="Painel Admin"
                  className={pathname === '/admin' ? 'sidebar-item-active' : ''}
                >
                  <Link href="/admin" onClick={onNavigate}>
                    <Shield className="w-[18px] h-[18px]" />
                    <span>Painel Admin</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* Menu groups */}
        {menuGroups.map((group) => {
          const visibleItems = group.items.filter((item) =>
            hasFeature(featureMap[item.href] || 'dashboard')
          );
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground sidebar-group-label-line">
                {group.label}
              </SidebarGroupLabel>
              <SidebarMenu>
                {visibleItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  const Icon = item.icon;
                  const showBadge = (item as any).hasBadge && unreadCount > 0;
                  const showTaskBadge = (item as any).hasTaskBadge && taskCount > 0;

                  const itemColor = (item as any).color || 'text-muted-foreground';
                  const itemBg = (item as any).bg || 'bg-muted/50';

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                        className={isActive ? 'sidebar-item-active' : ''}
                      >
                        <Link href={item.href} onClick={onNavigate}>
                          <div className={`sidebar-icon-wrap ${isActive ? itemBg : ''}`}>
                            <Icon
                              className={`w-[18px] h-[18px] sidebar-icon-colored transition-colors duration-150 ${
                                isActive ? itemColor : 'text-muted-foreground/70'
                              }`}
                              strokeWidth={isActive ? 2 : 1.75}
                            />
                          </div>
                          <span className={`flex-1 ${isActive ? 'font-medium' : ''}`}>
                            {item.label}
                          </span>
                          {showBadge && (
                            <span className="ml-auto flex items-center gap-1.5">
                              <span className="sidebar-badge-dot bg-emerald-500 badge-unread" />
                              <span className="text-[11px] font-semibold text-emerald-600 tabular-nums">
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </span>
                            </span>
                          )}
                          {showTaskBadge && (
                            <span className="ml-auto flex items-center gap-1.5">
                              <span className="sidebar-badge-dot bg-amber-500 badge-unread" />
                              <span className="text-[11px] font-semibold text-amber-600 tabular-nums">
                                {taskCount > 99 ? '99+' : taskCount}
                              </span>
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        {/* User info */}
        {user && (
          <div className="sidebar-user-card flex items-center gap-3 px-2 py-2 rounded-lg bg-muted/30 cursor-default">
            <Avatar className="h-9 w-9 flex-shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-medium text-foreground truncate leading-tight">
                {user.name}
              </p>
              <p className="text-[11px] text-muted-foreground truncate leading-tight">
                {user.email}
              </p>
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors text-[13px]"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">Sair</span>
        </button>
      </SidebarFooter>
    </>
  );
}

/* ============================================================
   APP SHELL — Main component
   ============================================================ */
interface AppShellProps {
  children: React.ReactNode;
  fullWidth?: boolean;
}

function AppShellInner({ children, fullWidth = false }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);

  const pageTitle = pageTitles[pathname] || 'EduFlow';
  const { theme, toggleTheme } = useTheme();

  /* --- Fetch badges --- */
  const fetchUnread = useCallback(async () => {
    try {
      const res = await api.get('/contacts', { params: { limit: 200 } });
      const contacts = res.data;
      const count = contacts.filter((c: any) => c.unread > 0).length;
      setUnreadCount(count);
    } catch {
      // silent
    }
  }, []);

  const fetchTaskCount = useCallback(async () => {
    try {
      const res = await api.get('/tasks/stats');
      setTaskCount(res.data.today + res.data.overdue);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchUnread();
    fetchTaskCount();
    const interval = setInterval(() => {
      fetchUnread();
      fetchTaskCount();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchUnread, fetchTaskCount]);

  return (
    <>
      {/* Desktop Sidebar */}
      <Sidebar collapsible="icon" className="hidden lg:flex">
        <SidebarNavContent unreadCount={unreadCount} taskCount={taskCount} />
      </Sidebar>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between h-14 px-4 lg:px-6 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile menu */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0">
                <SidebarProvider defaultOpen={true}>
                  <Sidebar collapsible="none" className="w-full border-0">
                    <SidebarNavContent
                      unreadCount={unreadCount}
                      taskCount={taskCount}
                      onNavigate={() => setMobileOpen(false)}
                    />
                  </Sidebar>
                </SidebarProvider>
              </SheetContent>
            </Sheet>

            {/* Desktop sidebar toggle */}
            <SidebarTrigger className="hidden lg:flex" />

            {/* Breadcrumb / Page title */}
            <Separator orientation="vertical" className="h-5 hidden lg:block" />
            <h1 className="text-sm font-medium text-foreground">{pageTitle}</h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Search trigger */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hidden sm:flex"
                  onClick={() => {
                    document.dispatchEvent(
                      new KeyboardEvent('keydown', {
                        key: 'k',
                        metaKey: true,
                        ctrlKey: true,
                        bubbles: true,
                      })
                    );
                  }}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Buscar (⌘K)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={toggleTheme}
                >
                  {theme === 'dark' ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              </TooltipContent>
            </Tooltip>

            <NotificationBell />
          </div>
        </header>

        {/* Page content */}
        <main
          className={`flex-1 min-h-0 ${
            fullWidth ? 'overflow-hidden' : 'overflow-y-auto px-4 lg:px-6 py-4 lg:py-6'
          }`}
        >
          {children}
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette />
    </>
  );
}

/* ============================================================
   EXPORTED WRAPPER — with SidebarProvider + Auth guard
   ============================================================ */
export default function AppShell({ children, fullWidth = false }: AppShellProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground animate-pulse">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  /* Read persisted sidebar state */
  const defaultOpen = typeof window !== 'undefined'
    ? localStorage.getItem('sidebar-open') !== 'false'
    : true;

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      onOpenChange={(open) => {
        localStorage.setItem('sidebar-open', String(open));
      }}
    >
      <AppShellInner fullWidth={fullWidth}>{children}</AppShellInner>
    </SidebarProvider>
  );
}