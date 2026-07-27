import { Menu } from 'lucide-react';
import { OrgSwitcher } from '@/components/layout/OrgSwitcher';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { UserMenu } from '@/components/layout/UserMenu';

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="glass sticky top-0 z-20 flex h-16 items-center justify-between border-x-0 border-t-0 border-b px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <OrgSwitcher />
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
