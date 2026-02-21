'use client';

import Link from 'next/link';
import { Home, ArrowLeft, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="relative mb-6">
          <span className="text-[120px] lg:text-[160px] font-bold text-[#6366f1]/10 leading-none select-none">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 bg-[#6366f1]/10 rounded-2xl flex items-center justify-center">
              <Search className="w-8 h-8 text-[#6366f1]" />
            </div>
          </div>
        </div>

        <h1 className="text-xl lg:text-2xl font-bold text-gray-800 mb-2">
          Página não encontrada
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          A página que você está procurando não existe ou foi movida.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-5 py-2.5 bg-[#6366f1] text-white rounded-xl text-sm font-medium hover:bg-[#5558e6] transition-colors"
          >
            <Home className="w-4 h-4" />
            Ir para Dashboard
          </Link>
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}