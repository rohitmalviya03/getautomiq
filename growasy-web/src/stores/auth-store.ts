import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUserView, Organization, UserProfile } from '@/types/api';

export interface AuthSession {
  user: AuthUserView;
  organizations: Organization[];
  accessToken: string;
}

/** Set while a super-admin is viewing the app as a customer. Memory-only. */
export interface ImpersonationState {
  organizationId: string;
  organizationName: string;
  userEmail: string;
}

interface AuthState {
  /** Populated after login/register/refresh + /users/me. Null while logged out. */
  user: AuthUserView | null;
  organizations: Organization[];
  activeOrganizationId: string | null;
  /** In-memory only — deliberately excluded from the persisted slice below. */
  accessToken: string | null;
  /**
   * Non-null while impersonating a customer. Memory-only (never persisted), so any
   * full page reload ends impersonation and restores the admin via the intact
   * httpOnly refresh cookie — this is exactly how "Exit" works.
   */
  impersonation: ImpersonationState | null;
  /**
   * 'unknown' until the initial silent-refresh-on-load attempt resolves, so the
   * router can hold routing decisions until we actually know the auth state.
   */
  status: 'unknown' | 'authenticated' | 'unauthenticated';

  setSession: (session: AuthSession) => void;
  setAccessToken: (accessToken: string) => void;
  setUserProfile: (profile: UserProfile) => void;
  setActiveOrganizationId: (organizationId: string) => void;
  startImpersonation: (args: {
    accessToken: string;
    user: AuthUserView;
    organization: { id: string; name: string; slug: string };
    userEmail: string;
  }) => void;
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
      impersonation: null,
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
            isSuperAdmin: profile.isSuperAdmin,
            status: profile.status,
            organizationId: state.activeOrganizationId ?? organizations[0]?.id ?? '',
          },
          organizations,
          status: 'authenticated',
          activeOrganizationId: pickActiveOrgId(organizations, get().activeOrganizationId),
        }));
      },

      setActiveOrganizationId: (organizationId) => set({ activeOrganizationId: organizationId }),

      startImpersonation: ({ accessToken, user, organization, userEmail }) =>
        set({
          accessToken,
          user,
          organizations: [
            { id: organization.id, name: organization.name, slug: organization.slug, role: 'owner' },
          ],
          activeOrganizationId: organization.id,
          impersonation: {
            organizationId: organization.id,
            organizationName: organization.name,
            userEmail,
          },
          status: 'authenticated',
        }),

      markUnauthenticated: () => set({ status: 'unauthenticated' }),

      clear: () =>
        set({
          user: null,
          organizations: [],
          accessToken: null,
          impersonation: null,
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
