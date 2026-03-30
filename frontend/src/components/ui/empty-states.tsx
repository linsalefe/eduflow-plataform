import {
  Users, MessageCircle, GitBranch, Target,
  Zap, BarChart3, DollarSign, Calendar, Radio,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export function EmptyContatos({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={Users}
      title="Nenhum contato ainda"
      description="Crie seu primeiro contato ou importe uma planilha para começar a gerenciar seus leads."
      actionLabel="Novo contato"
      onAction={onAction}
    />
  );
}

export function EmptyConversas({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={MessageCircle}
      title="Nenhuma conversa"
      description="As conversas aparecerão aqui quando seus leads enviarem mensagens pelo WhatsApp ou Instagram."
      actionLabel="Conectar canal"
      onAction={onAction}
    />
  );
}

export function EmptyPipeline({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={GitBranch}
      title="Pipeline vazio"
      description="Adicione leads ao pipeline para acompanhar o funil de vendas da sua instituição."
      actionLabel="Adicionar lead"
      onAction={onAction}
    />
  );
}

export function EmptyTarefas({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={Target}
      title="Nenhuma tarefa"
      description="Crie tarefas para organizar follow-ups, ligações e reuniões do time comercial."
      actionLabel="Nova tarefa"
      onAction={onAction}
    />
  );
}

export function EmptyAutomacoes({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={Zap}
      title="Nenhum fluxo criado"
      description="Crie sequências automáticas de mensagens para follow-up de leads por estágio."
      actionLabel="Novo fluxo"
      onAction={onAction}
    />
  );
}

export function EmptyRelatorios({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={BarChart3}
      title="Nenhum relatório gerado"
      description="Gere relatórios de contatos, pipeline, mensagens e performance dos agentes."
      actionLabel="Gerar relatório"
      onAction={onAction}
    />
  );
}

export function EmptyFinanceiro({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={DollarSign}
      title="Nenhuma entrada neste mês"
      description="Registre vendas e pagamentos para acompanhar a receita da sua instituição."
      actionLabel="Registrar venda"
      onAction={onAction}
    />
  );
}

export function EmptyAgenda({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={Calendar}
      title="Nenhum agendamento"
      description="Agende ligações da Voice AI ou reuniões com consultoras para seus leads."
      actionLabel="Novo agendamento"
      onAction={onAction}
    />
  );
}

export function EmptyCanais({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={Radio}
      title="Nenhum canal conectado"
      description="Conecte seu WhatsApp, Instagram ou Messenger para começar a receber mensagens."
      actionLabel="Conectar canal"
      onAction={onAction}
    />
  );
}