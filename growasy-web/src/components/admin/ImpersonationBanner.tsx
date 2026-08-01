import { Eye, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Shown app-wide while a super-admin is viewing the app as a customer. "Exit"
 * does a full navigation to /admin: because impersonation state is memory-only,
 * the reload ends it and the admin's intact httpOnly cookie restores their session.
 */
export function ImpersonationBanner() {
  const impersonation = useAuthStore((s) => s.impersonation);
  if (!impersonation) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950 shadow">
      <Eye className="h-4 w-4 shrink-0" />
      <span className="truncate">
        Viewing as <strong>{impersonation.organizationName}</strong> ({impersonation.userEmail})
      </span>
      <button
        type="button"
        onClick={() => window.location.assign('/admin/customers')}
        className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-amber-950/10 px-3 py-1 text-xs font-bold uppercase tracking-wide hover:bg-amber-950/20"
      >
        <LogOut className="h-3.5 w-3.5" /> Exit
      </button>
    </div>
  );
}
