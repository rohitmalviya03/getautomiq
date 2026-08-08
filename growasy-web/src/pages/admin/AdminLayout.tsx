import { NavLink, Outlet, Link } from 'react-router-dom';
import {
  ShieldCheck,
  LayoutDashboard,
  Building2,
  Users,
  ScrollText,
  ArrowLeft,
  IndianRupee,
  LifeBuoy,
  TrendingUp,
  Ticket,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

const TABS = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/customers', label: 'Customers', icon: Building2, end: false },
  { to: '/admin/traffic', label: 'Traffic', icon: TrendingUp, end: false },
  { to: '/admin/tickets', label: 'Tickets', icon: LifeBuoy, end: false },
  { to: '/admin/pricing', label: 'Pricing', icon: IndianRupee, end: false },
  { to: '/admin/coupons', label: 'Coupons', icon: Ticket, end: false },
  { to: '/admin/users', label: 'Users', icon: Users, end: false },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText, end: false },
];

export function AdminLayout() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-600 text-white shadow-glow">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="font-display text-base font-bold text-slate-900 dark:text-white">Admin console</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Automiq platform owner</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 dark:text-slate-400 sm:inline">{user?.email}</span>
            <Link
              to="/dashboard"
              className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" /> Back to app
            </Link>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 sm:px-5">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-brand-500 text-brand-600 dark:text-brand-300'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
