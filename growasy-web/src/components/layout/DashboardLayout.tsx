import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { ReconnectBanner } from '@/components/layout/ReconnectBanner';
import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner';
import { PendingPaymentBanner } from '@/components/billing/PendingPaymentBanner';

export function DashboardLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <ImpersonationBanner />
      <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="hidden w-64 shrink-0 lg:block">
        <Sidebar />
      </div>

      <AnimatePresence>
        {mobileNavOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
              className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed inset-y-0 left-0 z-40 w-64 lg:hidden"
            >
              <div className="relative h-full">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="focus-ring absolute right-3 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Close navigation menu"
                >
                  <X className="h-4 w-4" />
                </button>
                <Sidebar onNavigate={() => setMobileNavOpen(false)} />
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setMobileNavOpen(true)} />
        <div className="flex-1 overflow-y-auto">
          <PendingPaymentBanner />
          <ReconnectBanner />
          <main className="px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
      </div>
    </div>
  );
}
