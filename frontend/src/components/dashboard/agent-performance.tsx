'use client';

import { UserCheck, UserX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Agent {
  user_id: number;
  name: string;
  leads: number;
  messages_week: number;
}

interface AgentPerformanceProps {
  agents: Agent[];
  unassignedLeads: number;
  loading?: boolean;
}

export function AgentPerformance({ agents, unassignedLeads, loading = false }: AgentPerformanceProps) {
  if (loading) {
    return (
      <Card className="p-[var(--card-pad,16px)]">
        <Skeleton className="h-4 w-44 mb-4" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const maxLeads = Math.max(...agents.map((a) => a.leads), 1);

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <Card className="p-[var(--card-pad,16px)] shadow-[var(--shadow-xs)] border border-border">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-[var(--font-size-body)] font-semibold text-foreground">Performance por Atendente</h3>
          <p className="text-[var(--font-size-caption)] text-muted-foreground mt-0.5">Leads atribuídos + mensagens (7d)</p>
        </div>
        <div className="h-9 w-9 bg-primary/10 rounded-lg flex items-center justify-center">
          <UserCheck className="h-4 w-4 text-primary" strokeWidth={1.75} />
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="text-center py-6">
          <UserX className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">Nenhum lead atribuído ainda</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => {
            const pct = (agent.leads / maxLeads) * 100;
            return (
              <div key={agent.user_id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold">
                      {getInitials(agent.name)}
                    </div>
                    <span className="text-[13px] font-medium text-foreground">{agent.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground tabular-nums">{agent.messages_week} msg</span>
                    <span className="text-[12px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-md tabular-nums">
                      {agent.leads} leads
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}

          {unassignedLeads > 0 && (
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-[10px] font-bold">
                    ?
                  </div>
                  <span className="text-[13px] text-muted-foreground">Sem atribuição</span>
                </div>
                <span className="text-[12px] font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-md tabular-nums">
                  {unassignedLeads} leads
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}