import { PublicShell } from '@/components/public/PublicShell';
import { WaitlistForm } from '@/components/public/WaitlistForm';
import { useSeo } from '@/lib/use-seo';

const PERKS = [
  'Early access before public launch',
  'Founding-member pricing locked in',
  'Priority onboarding & support',
];

export function WaitlistPage() {
  useSeo(
    'Join the Waitlist | Automiq — Instagram DM Automation',
    'Get early access to Automiq — automate Instagram comments, DMs and lead capture. Join the waitlist for founding-member pricing.',
  );

  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <div className="text-center">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-fuchsia-600">
            Early access
          </span>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
            Join the Automiq waitlist
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-lg text-slate-600 dark:text-slate-300">
            We’re onboarding creators and businesses in batches. Drop your email and we’ll save your
            spot — plus lock in founding-member perks.
          </p>
        </div>

        <ul className="mx-auto mt-8 flex max-w-md flex-col gap-2">
          {PERKS.map((p) => (
            <li key={p} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span className="brand-gradient h-1.5 w-1.5 rounded-full" />
              {p}
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-8 max-w-md">
          <WaitlistForm />
        </div>
      </div>
    </PublicShell>
  );
}
