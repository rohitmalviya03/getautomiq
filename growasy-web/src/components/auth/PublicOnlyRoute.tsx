import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { FullPageSpinner } from '@/components/ui/FullPageSpinner';

/** Sends already-authenticated users away from /login, /register, etc. */
export function PublicOnlyRoute() {
  const status = useAuthStore((s) => s.status);

  if (status === 'unknown') {
    return <FullPageSpinner />;
  }

  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
