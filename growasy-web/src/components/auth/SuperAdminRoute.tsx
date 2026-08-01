import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { FullPageSpinner } from '@/components/ui/FullPageSpinner';

/**
 * Gates the /admin area to platform owners. Cosmetic only — the real enforcement
 * is the API's SuperAdminGuard; this just avoids rendering a panel the user can't
 * use. `isSuperAdmin` is populated from GET /users/me during bootstrap.
 */
export function SuperAdminRoute() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  if (status === 'unknown') {
    return <FullPageSpinner />;
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }
  if (!user?.isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
