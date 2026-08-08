import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';

/**
 * Fires a page-view beacon on every route change.
 *
 * Deliberately fire-and-forget: analytics must never delay a render or surface
 * an error to the visitor, so failures are swallowed. The server derives the
 * visitor identity from the request itself — nothing identifying is sent from
 * here, and there is no cookie or local storage involved.
 */
export function usePageTracking(): void {
  const location = useLocation();
  // React 18 StrictMode mounts effects twice in development; without this the
  // same view would be counted twice on every navigation.
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const path = location.pathname;
    if (lastPath.current === path) return;
    lastPath.current = path;

    void apiClient
      .post('/analytics/track', {
        path,
        // Only the first navigation of a session has an external referrer; after
        // that document.referrer is our own page, which the server discards.
        referrer: document.referrer || undefined,
      })
      .catch(() => {
        /* never let tracking break the page */
      });
  }, [location.pathname]);
}
