'use client';

import {
  useEffect, useState, useCallback, useRef, useMemo,
} from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge, useReactFlow,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
  type OnNodesChange, type OnEdgesChange,
  BackgroundVariant, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft, Loader2, CheckCircle2, CircleAlert, Rocket, Pause,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  nodeTypes, createDefaultNodeData, type NodeKind, NodePalette,
} from '@/components/chatbot/node-catalog';
import {
  NodeInspector, type KanbanCol, type UserOpt,
} from '@/components/chatbot/node-inspector';

interface Flow {
  id: number;
  name: string;
  description: string | null;
  graph: { nodes: Node[]; edges: Edge[] };
  is_published: boolean;
  version: number;
}

const AUTOSAVE_DELAY_MS = 1500;

function EditorInner({ flowId }: { flowId: number }) {
  const router = useRouter();
  const { screenToFlowPosition } = useReactFlow();

  const [flow, setFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [nameDraft, setNameDraft] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [kanbanColumns, setKanbanColumns] = useState<KanbanCol[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrapping = useRef(true);

  // ── Load ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [flowRes, kbRes, usersRes] = await Promise.all([
          api.get(`/chatbot/flows/${flowId}`),
          api.get('/tenant/kanban-columns').catch(() => ({ data: [] })),
          api.get('/users/list').catch(() => ({ data: [] })),
        ]);

        const f: Flow = flowRes.data;
        const graph = f.graph || { nodes: [], edges: [] };

        let initialNodes: Node[] = Array.isArray(graph.nodes) ? graph.nodes : [];
        const initialEdges: Edge[] = Array.isArray(graph.edges) ? graph.edges : [];

        if (initialNodes.length === 0) {
          initialNodes = [{
            id: `trigger_${Date.now()}`,
            type: 'trigger',
            position: { x: 260, y: 120 },
            data: createDefaultNodeData('trigger'),
          }];
        }

        setFlow(f);
        setNameDraft(f.name);
        setNodes(initialNodes);
        setEdges(initialEdges);
        setKanbanColumns(Array.isArray(kbRes.data) ? kbRes.data : []);
        setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      } catch (err: unknown) {
        const e = err as { response?: { status?: number } };
        if (e.response?.status === 403) {
          toast.error('Chatbot não está habilitado');
          router.push('/dashboard');
        } else if (e.response?.status === 404) {
          toast.error('Chatbot não encontrado');
          router.push('/chatbot');
        } else {
          toast.error('Erro ao carregar chatbot');
          router.push('/chatbot');
        }
      } finally {
        setLoading(false);
        setTimeout(() => { bootstrapping.current = false; }, 100);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  // ── Dirty tracking ────────────────────────────────────
  const handleNodesChange: OnNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    if (bootstrapping.current) return;
    const significant = changes.some((c) =>
      c.type === 'add' || c.type === 'remove' ||
      (c.type === 'position' && !c.dragging) ||
      c.type === 'replace'
    );
    if (significant) setIsDirty(true);
  }, [onNodesChange]);

  const handleEdgesChange: OnEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
    if (bootstrapping.current) return;
    setIsDirty(true);
  }, [onEdgesChange]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({
      ...params,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    }, eds));
    setIsDirty(true);
  }, [setEdges]);

  // ── Drag-and-drop ─────────────────────────────────────
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/reactflow') as NodeKind;
    if (!kind) return;

    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const newNode: Node = {
      id: `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: kind,
      position,
      data: createDefaultNodeData(kind),
    };
    setNodes((nds) => nds.concat(newNode));
    setIsDirty(true);
    setSelectedId(newNode.id);
  }, [screenToFlowPosition, setNodes]);

  // ── Selection ─────────────────────────────────────────
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedId(node.id), []);
  const onPaneClick = useCallback(() => setSelectedId(null), []);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) || null,
    [nodes, selectedId],
  );

  // ── Inspector updates ─────────────────────────────────
  const updateSelectedNodeData = useCallback((newData: Record<string, any>) => {
    if (!selectedId) return;
    const clean = { ...newData };
    if (clean.stage === '__none__') clean.stage = '';

    setNodes((nds) =>
      nds.map((n) => (n.id === selectedId ? { ...n, data: { ...clean } } : n)),
    );
    if (selectedNode?.type === 'buttons' && Array.isArray(clean.buttons)) {
      const validIds = new Set<string>((clean.buttons as any[]).map((b: any) => b.id));
      setEdges((eds) =>
        eds.filter((e) => e.source !== selectedId || !e.sourceHandle || validIds.has(e.sourceHandle)),
      );
    }
    setIsDirty(true);
  }, [selectedId, selectedNode, setNodes, setEdges]);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
    setIsDirty(true);
  }, [selectedId, setNodes, setEdges]);

  // ── Auto-save ─────────────────────────────────────────
  const saveDraft = useCallback(async (showToast = false) => {
    if (!flow || saving) return;
    setSaving(true);
    try {
      const payload: any = { graph: { nodes, edges } };
      if (nameDraft.trim() && nameDraft.trim() !== flow.name) payload.name = nameDraft.trim();
      await api.put(`/chatbot/flows/${flow.id}`, payload);
      setIsDirty(false);
      setLastSaved(new Date());
      if (showToast) toast.success('Salvo');
      if (payload.name) setFlow((f) => (f ? { ...f, name: payload.name } : f));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }, [flow, nodes, edges, nameDraft, saving]);

  useEffect(() => {
    if (bootstrapping.current || !isDirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveDraft(); }, AUTOSAVE_DELAY_MS);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [nodes, edges, nameDraft, isDirty, saveDraft]);

  // ── beforeunload ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── Publish / Unpublish ───────────────────────────────
  const handlePublish = async () => {
    if (!flow) return;
    setPublishing(true);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await saveDraft();
      await api.post(`/chatbot/flows/${flow.id}/publish`);
      setFlow((f) => (f ? { ...f, is_published: true, version: f.version + 1 } : f));
      toast.success('Chatbot publicado!');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'Erro ao publicar');
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!flow) return;
    setPublishing(true);
    try {
      await api.post(`/chatbot/flows/${flow.id}/unpublish`);
      setFlow((f) => (f ? { ...f, is_published: false } : f));
      toast.success('Chatbot despublicado');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'Erro ao despublicar');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <header className="flex-shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => router.push('/chatbot')} className="h-9 w-9">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Input
            value={nameDraft}
            onChange={(e) => { setNameDraft(e.target.value); setIsDirty(true); }}
            className="h-9 font-medium text-[15px] max-w-[320px] border-transparent hover:border-border focus:border-border"
            placeholder="Nome do chatbot"
          />
          <SaveStatus saving={saving} dirty={isDirty} lastSaved={lastSaved} />
        </div>
        <div className="flex items-center gap-2">
          {flow?.is_published ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-full bg-emerald-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Publicado &middot; v{flow.version}
              </span>
              <Button variant="outline" size="sm" onClick={handleUnpublish} disabled={publishing}>
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Pause className="w-4 h-4 mr-1" /> Despublicar</>}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={handlePublish} disabled={publishing} className="gap-1.5">
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Rocket className="w-4 h-4" /> Publicar</>}
            </Button>
          )}
        </div>
      </header>

      {/* Mobile guard */}
      <div className="lg:hidden flex-1 flex items-center justify-center p-8 text-center">
        <div className="max-w-sm">
          <div className="text-5xl mb-4">🖥</div>
          <h3 className="text-lg font-semibold mb-2">Abra em um computador</h3>
          <p className="text-sm text-muted-foreground">
            O editor do chatbot precisa de uma tela maior pra você desenhar os fluxos com conforto.
          </p>
        </div>
      </div>

      {/* Workspace (desktop) */}
      <div className="hidden lg:flex flex-1 min-h-0 overflow-hidden">
        <NodePalette />

        <div className="flex-1 min-w-0 relative" ref={reactFlowWrapper} onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            defaultEdgeOptions={{
              animated: true,
              style: { strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
            }}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              position="bottom-right"
              nodeStrokeWidth={3}
              pannable
              zoomable
              style={{ background: 'var(--card)' }}
            />
          </ReactFlow>
        </div>

        {selectedNode && (
          <NodeInspector
            node={selectedNode}
            onChange={updateSelectedNodeData}
            onDelete={deleteSelectedNode}
            kanbanColumns={kanbanColumns}
            users={users}
          />
        )}
      </div>
    </div>
  );
}

function SaveStatus({ saving, dirty, lastSaved }: { saving: boolean; dirty: boolean; lastSaved: Date | null }) {
  if (saving) return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</span>;
  if (dirty) return <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400"><CircleAlert className="w-3.5 h-3.5" /> Não salvo</span>;
  if (lastSaved) return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Salvo</span>;
  return null;
}

export default function ChatbotEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const rawId = params?.id;
  const flowId = useMemo(() => {
    const s = Array.isArray(rawId) ? rawId[0] : rawId;
    const n = s ? parseInt(s, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  }, [rawId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (user.features?.chatbot !== true) {
      toast.error('Chatbot não está habilitado');
      router.push('/dashboard');
    }
  }, [authLoading, user, router]);

  if (authLoading || !flowId) {
    return <div className="h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <ReactFlowProvider>
      <EditorInner flowId={flowId} />
    </ReactFlowProvider>
  );
}
