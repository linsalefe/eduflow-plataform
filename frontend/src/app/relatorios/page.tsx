'use client';

import { useState } from 'react';
import {
  Download, FileSpreadsheet, Users, GitBranch, MessageSquare,
  Loader2, CheckCircle, Calendar, Filter,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import { toast } from 'sonner';

const reports = [
  {
    id: 'contacts',
    title: 'Relatório de Contatos',
    description: 'Todos os contatos com status, tags, atribuição, notas e contagem de mensagens.',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    endpoint: '/export/contacts',
    filters: ['status'],
    sheets: ['Contatos', 'Resumo'],
  },
  {
    id: 'pipeline',
    title: 'Relatório do Pipeline',
    description: 'Funil de matrículas com uma aba para cada etapa e resumo com percentuais.',
    icon: GitBranch,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    endpoint: '/export/pipeline',
    filters: [],
    sheets: ['Resumo do Funil', 'Novo Lead', 'Em Contato', 'Qualificado', 'Em Matrícula', 'Matriculado', 'Perdido'],
  },
  {
    id: 'messages',
    title: 'Relatório de Mensagens',
    description: 'Histórico de mensagens enviadas e recebidas com contato, tipo e conteúdo.',
    icon: MessageSquare,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    endpoint: '/export/messages',
    filters: ['days'],
    sheets: ['Mensagens', 'Resumo'],
  },
];

const statusOptions = [
  { value: '', label: 'Todos os status' },
  { value: 'novo', label: 'Novo Lead' },
  { value: 'em_contato', label: 'Em Contato' },
  { value: 'qualificado', label: 'Qualificado' },
  { value: 'negociando', label: 'Em Matrícula' },
  { value: 'convertido', label: 'Matriculado' },
  { value: 'perdido', label: 'Perdido' },
];

const daysOptions = [
  { value: 7, label: 'Últimos 7 dias' },
  { value: 14, label: 'Últimos 14 dias' },
  { value: 30, label: 'Últimos 30 dias' },
  { value: 60, label: 'Últimos 60 dias' },
  { value: 90, label: 'Últimos 90 dias' },
];

export default function RelatoriosPage() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [daysFilter, setDaysFilter] = useState(7);

  const handleDownload = async (report: typeof reports[0]) => {
    setDownloading(report.id);

    try {
      const params = new URLSearchParams();
      if (report.filters.includes('status') && statusFilter) {
        params.append('status', statusFilter);
      }
      if (report.filters.includes('days')) {
        params.append('days', daysFilter.toString());
      }

      const url = `${report.endpoint}${params.toString() ? '?' + params.toString() : ''}`;

      const response = await api.get(url, { responseType: 'blob' });

      const contentDisposition = response.headers['content-disposition'];
      let filename = `relatorio_${report.id}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename=(.+)/);
        if (match) filename = match[1];
      }

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setDownloaded(prev => [...prev.filter(id => id !== report.id), report.id]);
      toast.success(`${report.title} baixado com sucesso`);
    } catch (err) {
      toast.error('Erro ao gerar relatório');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-8">

        {/* Header */}
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold text-[#27273D]">Relatórios</h1>
          <p className="text-sm text-gray-400 mt-1">Exporte dados da plataforma em planilhas Excel formatadas.</p>
        </div>

        {/* Cards */}
        <div className="space-y-4">
          {reports.map((report) => {
            const Icon = report.icon;
            const isDownloading = downloading === report.id;
            const isDownloaded = downloaded.includes(report.id);

            return (
              <div
                key={report.id}
                className="bg-white rounded-2xl border border-gray-100 p-5 lg:p-6 hover:border-gray-200 hover:shadow-sm transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">

                  {/* Icon + Info */}
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`w-11 h-11 ${report.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-5 h-5 ${report.color}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-[15px] font-semibold text-[#27273D]">{report.title}</h3>
                      <p className="text-[13px] text-gray-400 mt-0.5 leading-relaxed">{report.description}</p>

                      {/* Abas */}
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {report.sheets.map(sheet => (
                          <span
                            key={sheet}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-500"
                          >
                            {sheet}
                          </span>
                        ))}
                      </div>

                      {/* Filtros */}
                      {report.filters.length > 0 && (
                        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                          <Filter className="w-3.5 h-3.5 text-gray-400" />

                          {report.filters.includes('status') && (
                            <select
                              value={statusFilter}
                              onChange={(e) => setStatusFilter(e.target.value)}
                              className="text-[12px] px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20 focus:border-[#6366f1]"
                            >
                              {statusOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          )}

                          {report.filters.includes('days') && (
                            <select
                              value={daysFilter}
                              onChange={(e) => setDaysFilter(Number(e.target.value))}
                              className="text-[12px] px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20 focus:border-[#6366f1]"
                            >
                              {daysOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Download Button */}
                  <button
                    onClick={() => handleDownload(report)}
                    disabled={isDownloading}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium transition-all flex-shrink-0 ${
                      isDownloading
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : isDownloaded
                          ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                          : 'bg-[#6366f1] text-white hover:bg-[#4f46e5]'
                    }`}
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Gerando...
                      </>
                    ) : isDownloaded ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Baixado
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Exportar Excel
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Info */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-medium text-gray-600">Formato dos relatórios</p>
              <p className="text-[12px] text-gray-400 mt-1 leading-relaxed">
                Os relatórios são gerados em formato Excel (.xlsx) com cabeçalhos coloridos, 
                linhas alternadas e múltiplas abas. Compatível com Excel, Google Sheets e LibreOffice.
              </p>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}