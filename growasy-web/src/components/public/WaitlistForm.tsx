import { useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const ROLES = ['Creator / influencer', 'Small business', 'Agency', 'Other'];

/** URL-encodes a flat object for a Netlify form POST. */
function encode(data: Record<string, string>): string {
  return Object.keys(data)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(data[k]))
    .join('&');
}

/**
 * Join-the-waitlist form powered entirely by Netlify Forms — submissions land in
 * the Netlify dashboard (Forms tab), no backend required. Must match the hidden
 * detection form in index.html (name="waitlist", same fields).
 */
export function WaitlistForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(ROLES[0]);
  const [botField, setBotField] = useState(''); // honeypot — humans leave blank
  const [status, setStatus] = useState<Status>('idle');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('submitting');
    try {
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encode({ 'form-name': 'waitlist', name, email, role, 'bot-field': botField }),
      });
      if (!res.ok) throw new Error('submit failed');
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center dark:border-green-900 dark:bg-green-950/40">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
        <h3 className="mt-3 font-display text-xl font-bold text-slate-900 dark:text-white">
          You’re on the list! 🎉
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600 dark:text-slate-300">
          Thanks{name ? `, ${name.split(' ')[0]}` : ''} — we’ll email you the moment your spot opens
          up.
        </p>
      </div>
    );
  }

  return (
    <form
      name="waitlist"
      data-netlify="true"
      netlify-honeypot="bot-field"
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white/80 p-6 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]"
    >
      {/* honeypot (hidden from humans) */}
      <p className="hidden">
        <label>
          Don’t fill this out: <input name="bot-field" value={botField} onChange={(e) => setBotField(e.target.value)} />
        </label>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="wl-name">Name</Label>
          <Input id="wl-name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </div>
        <div>
          <Label htmlFor="wl-role">I’m a…</Label>
          <select
            id="wl-role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="focus-ring w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="wl-email">Email</Label>
        <Input
          id="wl-email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
        />
      </div>

      {status === 'error' ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          Something went wrong. Please try again in a moment.
        </p>
      ) : null}

      <Button type="submit" className="w-full justify-center" disabled={status === 'submitting'}>
        {status === 'submitting' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Joining…
          </>
        ) : (
          'Join the waitlist'
        )}
      </Button>
      <p className="text-center text-xs text-slate-400">
        No spam. We’ll only email you about your spot.
      </p>
    </form>
  );
}
