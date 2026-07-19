import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Instagram,
  Bot,
  Users,
  BarChart3,
  Link2,
  Wand2,
  Images,
  CreditCard,
  UserCog,
  MonitorSmartphone,
  Building2,
} from 'lucide-react';
import { organizationsApi } from '@/lib/organizations-api';
import { planRank, PLAN_RANK } from '@/lib/plans';

/** `minRank` gates an item to a plan tier (omitted = every plan, incl. Free). */
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/instagram/accounts', label: 'Instagram', icon: Instagram, end: false },
  { to: '/automations', label: 'Automations', icon: Bot, end: false },
  { to: '/content', label: 'Content', icon: Images, end: false },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, end: false },
  { to: '/contacts', label: 'Contacts', icon: Users, end: false, minRank: PLAN_RANK.STARTER },
  { to: '/links', label: 'Links', icon: Link2, end: false, minRank: PLAN_RANK.STARTER },
  { to: '/tools', label: 'Free tools', icon: Wand2, end: false, minRank: PLAN_RANK.STARTER },
  { to: '/billing', label: 'Plans & billing', icon: CreditCard, end: false },
  { to: '/settings', label: 'Profile & Settings', icon: UserCog, end: false },
  { to: '/sessions', label: 'Sessions & Devices', icon: MonitorSmartphone, end: false },
  { to: '/organization', label: 'Organization', icon: Building2, end: false },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  // Current plan drives which items appear. Fail-open (show all) while loading or
  // if usage can't be read, so nothing is wrongly hidden.
  const usageQuery = useQuery({
    queryKey: ['organizations', 'usage'],
    queryFn: organizationsApi.getUsage,
    staleTime: 5 * 60 * 1000,
  });
  const rank = usageQuery.data ? planRank(usageQuery.data.planName) : Infinity;
  const items = NAV_ITEMS.filter((item) => (item.minRank ?? 0) <= rank);

  return (
    <div className="glass flex h-full flex-col border-y-0 border-l-0 border-r">
      <div className="flex h-16 items-center gap-2.5 px-6">
        <div className="brand-gradient-animated flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-glow">
          <Bot className="h-5 w-5" aria-hidden="true" />
        </div>
        <span className="brand-gradient-text font-display text-xl font-bold tracking-tight">
          Automiq
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `focus-ring group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'brand-gradient text-white shadow-glow'
                  : 'text-slate-600 hover:bg-white/60 hover:text-brand-700 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
              }`
            }
          >
            <Icon
              className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110"
              aria-hidden="true"
            />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 pb-4">
        <p className="text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">
          Made with 💜 by Automiq
        </p>
      </div>
    </div>
  );
}
