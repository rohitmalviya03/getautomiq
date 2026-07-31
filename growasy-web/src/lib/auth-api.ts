import { apiClient } from '@/lib/api-client';
import type {
  LoginResponse,
  MessageResponse,
  RegisterResponse,
  SessionView,
  UserProfile,
  UserPublicProfile,
} from '@/types/api';

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName?: string;
  /** Chosen plan tier (from the pricing page); backend puts the org on it. */
  plan?: 'FREE' | 'STARTER' | 'GROWTH' | 'PROFESSIONAL' | 'AGENCY';
}

export interface LoginPayload {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    apiClient.post<RegisterResponse>('/auth/register', payload),

  login: (payload: LoginPayload) => apiClient.post<LoginResponse>('/auth/login', payload),

  logout: () => apiClient.post<{ loggedOut: true }>('/auth/logout'),

  logoutAll: () => apiClient.post<{ loggedOut: true }>('/auth/logout-all'),

  sessions: () => apiClient.get<SessionView[]>('/auth/sessions'),

  revokeSession: (sessionId: string) =>
    apiClient.delete<{ revoked: true }>(`/auth/sessions/${sessionId}`),

  forgotPassword: (email: string) =>
    apiClient.post<MessageResponse>('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    apiClient.post<MessageResponse>('/auth/reset-password', { token, newPassword }),

  verifyEmail: (token: string) =>
    apiClient.post<{ verified: true }>('/auth/verify-email', { token }),

  resendVerification: () => apiClient.post<MessageResponse>('/auth/resend-verification'),
};

export const usersApi = {
  me: () => apiClient.get<UserProfile>('/users/me'),
  updateMe: (payload: UpdateProfilePayload) =>
    apiClient.patch<UserPublicProfile>('/users/me', payload),
};
