import { useState, useRef, useEffect } from 'react';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

export function OrgSwitcher() {
  const organizations = useAuthStore((s) => s.organizations);
  const activeOrganizationId = useAuthStore((s) => s.activeOrganizationId);
  const setActiveOrganizationId = useAuthStore((s) => s.setActiveOrganizationId);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeOrg = organizations.find((o) => o.id === activeOrganizationId);

  if (organizations.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <span className="max-w-[10rem] truncate">{activeOrg?.name ?? 'Select organization'}</span>
        {organizations.length > 1 ? (
          <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        ) : null}
      </button>

      {open && organizations.length > 1 ? (
        <ul
          role="listbox"
          className="absolute left-0 z-20 mt-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {organizations.map((org) => (
            <li key={org.id}>
              <button
                type="button"
                role="option"
                aria-selected={org.id === activeOrganizationId}
                onClick={() => {
                  setActiveOrganizationId(org.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <span className="flex flex-col">
                  <span className="truncate font-medium">{org.name}</span>
                  <span className="text-xs capitalize text-slate-400">{org.role}</span>
                </span>
                {org.id === activeOrganizationId ? (
                  <Check className="h-4 w-4 text-brand-600" aria-hidden="true" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
