import { useEffect, useRef, useState } from 'react';
import { usersApi } from '@/lib/auth-api';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Runs once on app mount. The access token never survives a reload (it's
 * memory-only by design), so we probe `/users/me`; the api-client's
 * 401-refresh-retry logic transparently exchanges the httpOnly refresh
 * cookie for a fresh access token if the session is still valid, or leaves
 * us logged out if it isn't. Returns true once the check has settled so
 * routing can hold its first decision until we actually know.
 */
export function useBootstrapAuth(): boolean {
  const ran = useRef(false);
  const [ready, setReady] = useState(false);
  const setUserProfile = useAuthStore((s) => s.setUserProfile);
  const markUnauthenticated = useAuthStore((s) => s.markUnauthenticated);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const profile = await usersApi.me();
        setUserProfile(profile);
      } catch {
        markUnauthenticated();
      } finally {
        setReady(true);
      }
    })();
  }, [setUserProfile, markUnauthenticated]);

  return ready;
}
