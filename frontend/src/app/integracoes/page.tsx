'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/app-shell';
import api from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Mail,
  Calendar,
  FileSpreadsheet,
  Video,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface ToolkitInfo {
  toolkit: string;
  name: string;
  description: string;
  icon: string;
}

interface ConnectionStatus {
  toolkit: string;
  name: string;
  connected: boolean;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  mail: <Mail className="h-6 w-6 text-red-500" />,
  calendar: <Calendar className="h-6 w-6 text-blue-500" />,
  sheet: <FileSpreadsheet className="h-6 w-6 text-green-600" />,
  video: <Video className="h-6 w-6 text-purple-500" />,
  mailchimp: <Mail className="h-6 w-6 text-yellow-500" />,
  sendgrid: <Mail className="h-6 w-6 text-blue-400" />,
};

export default function IntegracoesPage() {
  const [toolkits, setToolkits] = useState<ToolkitInfo[]>([]);
  const [connections, setConnections] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [supportedRes, connectionsRes] = await Promise.all([
        api.get('/integrations/supported'),
        api.get('/integrations/connections'),
      ]);
      setToolkits(supportedRes.data);
      const map: Record<string, boolean> = {};
      (connectionsRes.data as ConnectionStatus[]).forEach((c) => {
        map[c.toolkit] = c.connected;
      });
      setConnections(map);
    } catch (err) {
      console.error('Erro ao carregar integrações:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleConnect = async (toolkit: string) => {
    setConnecting(toolkit);
    try {
      const res = await api.post(`/integrations/connect/${toolkit}`);
      if (res.data.redirect_url) {
        window.open(res.data.redirect_url, '_blank', 'width=600,height=700');
        // Re-checar conexão após 10 segundos
        setTimeout(() => {
          fetchData();
          setConnecting(null);
        }, 10000);
      }
    } catch (err) {
      console.error('Erro ao conectar:', err);
      setConnecting(null);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Integrações"
            description="Conecte suas ferramentas para automatizar tarefas"
          />
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchData(); }}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {toolkits.map((tk) => {
              const isConnected = connections[tk.toolkit] || false;
              const isConnecting = connecting === tk.toolkit;

              return (
                <Card key={tk.toolkit}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {ICON_MAP[tk.icon] || <Mail className="h-6 w-6" />}
                        <div>
                          <CardTitle className="text-base">{tk.name}</CardTitle>
                          <CardDescription className="text-sm mt-0.5">
                            {tk.description}
                          </CardDescription>
                        </div>
                      </div>
                      {isConnected ? (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Conectado
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-muted-foreground">
                          <XCircle className="w-3 h-3 mr-1" />
                          Desconectado
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={() => handleConnect(tk.toolkit)}
                      disabled={isConnected || isConnecting}
                      variant={isConnected ? 'outline' : 'default'}
                      className="w-full"
                      size="sm"
                    >
                      {isConnecting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Conectando...
                        </>
                      ) : isConnected ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Conectado
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Conectar
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
