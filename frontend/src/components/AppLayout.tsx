'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Menu } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';
import NotificationBell from './NotificationBell';

export default function AppLayout({ children, fullWidth = false }: { children: React.ReactNode; fullWidth?: boolean }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fb]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 text-[#6366f1] animate-spin" />
          <p className="text-sm text-gray-400 animate-pulse">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-[#f8f9fb] overflow-hidden">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header - só para páginas normais (não fullWidth) */}
        {!fullWidth && (
          <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#0f1b2d] border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Abrir menu"
                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>
              <span className="text-white font-semibold text-[15px] tracking-wide">EduFlow</span>
            </div>
            <NotificationBell />
          </div>
        )}

        {/* Botão hamburger flutuante - para páginas fullWidth (como Conversas) */}
        {fullWidth && (
          <button
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu"
            className="lg:hidden fixed top-3 left-3 z-40 p-2 bg-[#0f1b2d] text-gray-400 hover:text-white rounded-xl shadow-lg border border-white/[0.06] transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Desktop notification header */}
        <div className="hidden lg:flex items-center justify-end px-6 py-2 bg-[#f8f9fb] flex-shrink-0">
          <div className="bg-[#0f1b2d] rounded-xl">
            <NotificationBell />
          </div>
        </div>

        <main className={`flex-1 flex flex-col overflow-hidden transition-all duration-200 ${fullWidth ? '' : 'px-4 lg:px-6 pb-4 lg:pb-6'}`}>
          {children}
        </main>
      </div>

      {/* Busca Global */}
      <CommandPalette />
    </div>
  );
}