import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUserView, Organization, UserProfile } from '@/types/api';

export interface AuthSession {
  user: AuthUserView;
  organizations: Organization[];
  accessToken: string;
}

interface AuthState {
  /** Populated after login/register/refresh + /users/me. Null while logged out. */
  user: AuthUserView | null;
  organizations: Organization[];
  activeOrganizationId: string | null;
  /** In-memory only — deliberately excluded from the persisted slice below. */
  accessToken: string | null;
  /**
   * 'unknown' until the initial silent-refresh-on-load attempt resolves, so the
   * router can hold routing decisions until we actually know the auth state.
   */
  status: 'unknown' | 'authenticated' | 'unauthenticated';

  setSession: (session: AuthSession) => void;
  setAccessToken: (accessToken: string) => void;
  setUserProfile: (profile: UserProfile) => void;
  setActiveOrganizationId: (organizationId: string) => void;
  markUnauthenticated: () => void;
  clear: () => void;
}

function pickActiveOrgId(organizations: Organization[], preferredId: string | null): string | null {
  if (preferredId && organizations.some((o) => o.id === preferredId)) {
    return preferredId;
  }
  return organizations[0]?.id ?? null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      organizations: [],
      activeOrganizationId: null,
      accessToken: null,
      status: 'unknown',

      setSession: ({ user, organizations, accessToken }) => {
        set({
          user,
          organizations,
          accessToken,
          status: 'authenticated',
          activeOrganizationId: pickActiveOrgId(organizations, get().activeOrganizationId),
        });
      },

      setAccessToken: (accessToken) => set({ accessToken, status: 'authenticated' }),

      setUserProfile: (profile) => {
        const organizations: Organization[] = profile.organizations.map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
          role: m.role.slug,
        }));
        set((state) => ({
          user: {
            id: profile.id,
            email: profile.email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            isEmailVerified: profile.isEmailVerified,
            status: profile.status,
            organizationId: state.activeOrganizationId ?? organizations[0]?.id ?? '',
          },
          organizations,
          status: 'authenticated',
          activeOrganizationId: pickActiveOrgId(organizations, get().activeOrganizationId),
        }));
      },

      setActiveOrganizationId: (organizationId) => set({ activeOrganizationId: organizationId }),

      markUnauthenticated: () => set({ status: 'unauthenticated' }),

      clear: () =>
        set({
          user: null,
          organizations: [],
          accessToken: null,
          status: 'unauthenticated',
        }),
    }),
    {
      name: 'growasy-auth',
      // Only the active organization selection survives a reload. The access
      // token is intentionally never persisted (memory-only); the refresh
      // token is an httpOnly cookie the browser manages, invisible to JS.
      partialize: (state) => ({ activeOrganizationId: state.activeOrganizationId }),
    },
  ),
);

export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}

export function getActiveOrganizationId(): string | null {
  return useAuthStore.getState().activeOrganizationId;
}
