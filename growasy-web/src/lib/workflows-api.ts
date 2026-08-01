import { apiClient } from '@/lib/api-client';

export type WorkflowStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export type WorkflowNodeType =
  | 'TRIGGER'
  | 'SEND_MESSAGE'
  | 'WAIT_REPLY'
  | 'CONDITION'
  | 'COLLECT_INPUT'
  | 'DELAY'
  | 'ACTION'
  | 'HANDOFF'
  | 'END';

export interface WFNode {
  id: string;
  type: WorkflowNodeType;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
}

export interface WFEdge {
  id?: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string | null;
  label?: string | null;
  config?: Record<string, unknown>;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  priority: number;
  version: number;
  instagramAccountId: string;
  accountUsername: string;
  nodeCount: number;
  runCount: number;
  updatedAt: string;
  createdAt: string;
}

export interface WorkflowDetail {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  priority: number;
  version: number;
  instagramAccountId: string;
  accountUsername: string;
  nodes: WFNode[];
  edges: WFEdge[];
}

export const workflowsApi = {
  list: (instagramAccountId?: string) =>
    apiClient.get<WorkflowSummary[]>(
      `/workflows${instagramAccountId ? `?instagramAccountId=${instagramAccountId}` : ''}`,
    ),
  get: (id: string) => apiClient.get<WorkflowDetail>(`/workflows/${id}`),
  create: (body: { name: string; instagramAccountId: string; description?: string }) =>
    apiClient.post<WorkflowDetail>('/workflows', body),
  update: (id: string, body: { name?: string; description?: string; priority?: number }) =>
    apiClient.patch<WorkflowDetail>(`/workflows/${id}`, body),
  saveGraph: (id: string, body: { nodes: WFNode[]; edges: WFEdge[] }) =>
    apiClient.put<WorkflowDetail>(`/workflows/${id}/graph`, body),
  publish: (id: string) => apiClient.post<WorkflowDetail>(`/workflows/${id}/publish`),
  pause: (id: string) => apiClient.post<WorkflowDetail>(`/workflows/${id}/pause`),
  remove: (id: string) => apiClient.delete<{ id: string }>(`/workflows/${id}`),
};
