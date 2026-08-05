import { apiClient } from '@/lib/api-client';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TicketCategory =
  | 'BILLING'
  | 'INSTAGRAM_CONNECTION'
  | 'AUTOMATIONS'
  | 'BUG'
  | 'FEATURE_REQUEST'
  | 'OTHER';

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  BILLING: 'Billing & plans',
  INSTAGRAM_CONNECTION: 'Instagram connection',
  AUTOMATIONS: 'Automations & DMs',
  BUG: 'Something is broken',
  FEATURE_REQUEST: 'Feature request',
  OTHER: 'Something else',
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

interface PersonRef {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface Ticket {
  id: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  lastCustomerReplyAt: string | null;
  organization: { id: string; name: string; slug: string } | null;
  createdBy: PersonRef | null;
  assignedTo: PersonRef | null;
  messageCount?: number;
}

export interface TicketMessage {
  id: string;
  body: string;
  /** Admin-only note. The customer endpoint never returns these. */
  isInternal: boolean;
  createdAt: string;
  authorUserId: string | null;
  authorName: string | null;
}

export type TicketDetail = Ticket & { messages: TicketMessage[] };

export interface CreateTicketInput {
  subject: string;
  message: string;
  category?: TicketCategory;
  contactEmail?: string;
  contactPhone?: string;
}

export const supportApi = {
  create: (body: CreateTicketInput) => apiClient.post<Ticket>('/support/tickets', body),
  list: () => apiClient.get<Ticket[]>('/support/tickets'),
  detail: (id: string) => apiClient.get<TicketDetail>(`/support/tickets/${id}`),
  reply: (id: string, message: string) =>
    apiClient.post<TicketMessage>(`/support/tickets/${id}/reply`, { message }),
  close: (id: string) => apiClient.post<Ticket>(`/support/tickets/${id}/close`),
};
