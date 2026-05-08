// frontend/src/lib/workflow-tools-api.ts
import api from '@/lib/api';

export interface ToolDescriptor {
  name: string;
  description: string;
  is_action: boolean;
}

export interface TestAgentRequest {
  agent_id?: number;             // F2.C.3 — modo Salvo
  prompt?: string;               // opcional quando agent_id está setado
  model?: string;
  tools?: string[];
  outcomes?: string[];
  contact_id?: number;
  user_message?: string;
}

export interface TestAgentResponse {
  ok: boolean;
  outcome: string;
  agent_text: string;
  tool_calls: Array<{ name: string; args?: Record<string, any>; result?: any }>;
  tokens_in: number;
  tokens_out: number;
  error?: string | null;
  used_contact_id?: number | null;
  note?: string;
}

export async function fetchAvailableTools(): Promise<ToolDescriptor[]> {
  const res = await api.get<{ tools: ToolDescriptor[] }>('/workflow-tools/available');
  return res.data.tools || [];
}

export async function testAgentPrompt(body: TestAgentRequest): Promise<TestAgentResponse> {
  const res = await api.post<TestAgentResponse>('/workflow-tools/test', body);
  return res.data;
}

// F2.C.3 — Lista agentes da biblioteca (com tools setado)
export interface WorkflowAgentSummary {
  id: number;
  name: string;
  icon: string | null;
  model: string | null;
  has_tools: boolean;
  tools_count: number;
  outcomes_count: number;
  channel_id: number | null;
  channel_name: string | null;
  is_isolated: boolean;
}

export interface WorkflowAgentDetail extends WorkflowAgentSummary {
  system_prompt: string | null;
  temperature: string | null;
  max_tokens: number | null;
  tools: string[];
  outcomes: string[];
}

export async function fetchWorkflowEligibleAgents(): Promise<WorkflowAgentSummary[]> {
  const res = await api.get<WorkflowAgentSummary[]>('/agents/workflow-eligible');
  return res.data || [];
}

export async function fetchWorkflowAgentDetail(id: number): Promise<WorkflowAgentDetail> {
  const res = await api.get<WorkflowAgentDetail>(`/agents/workflow-eligible/${id}`);
  return res.data;
}
