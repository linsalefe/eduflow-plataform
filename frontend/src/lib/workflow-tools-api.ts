// frontend/src/lib/workflow-tools-api.ts
import api from '@/lib/api';

export interface ToolDescriptor {
  name: string;
  description: string;
  is_action: boolean;
}

export interface TestAgentRequest {
  prompt: string;
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
  const res = await api.get<{ tools: ToolDescriptor[] }>('/api/workflow-tools/available');
  return res.data.tools || [];
}

export async function testAgentPrompt(body: TestAgentRequest): Promise<TestAgentResponse> {
  const res = await api.post<TestAgentResponse>('/api/workflow-tools/test', body);
  return res.data;
}
