import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Wrench, RotateCcw, Gift, CalendarClock, Send, MailCheck, Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';
import { adminApi } from '@/lib/admin-api';
import { PLAN_TIERS } from '@/pages/admin/admin-format';
import { ApiError } from '@/lib/api-client';

const selectCls =
  'focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

export function AdminActionsCard({
  customerId,
  ownerId,
  ownerPending,
}: {
  customerId: string;
  ownerId: string;
  ownerPending: boolean;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'customer', customerId] });
  const onErr = (e: unknown) =>
    showToast({ variant: 'error', title: 'Action failed', description: e instanceof ApiError ? e.message : undefined });

  const [bonus, setBonus] = useState(1000);
  const [compTier, setCompTier] = useState('GROWTH');
  const [compDays, setCompDays] = useState(30);
  const [msgTitle, setMsgTitle] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');

  const resetUsage = useMutation({
    mutationFn: () => adminApi.adjustUsage(customerId, { action: 'reset' }),
    onSuccess: async () => {
      await refresh();
      showToast({ variant: 'success', title: 'DM usage reset to 0' });
    },
    onError: onErr,
  });
  const grantUsage = useMutation({
    mutationFn: () => adminApi.adjustUsage(customerId, { action: 'grant', amount: bonus }),
    onSuccess: async () => {
      await refresh();
      showToast({ variant: 'success', title: `Freed up ${bonus.toLocaleString()} DMs` });
    },
    onError: onErr,
  });
  const comp = useMutation({
    mutationFn: () => adminApi.comp(customerId, { tier: compTier, days: compDays }),
    onSuccess: async () => {
      await refresh();
      showToast({ variant: 'success', title: `Comped ${compTier} for ${compDays} days` });
    },
    onError: onErr,
  });
  const sendEmail = useMutation({
    mutationFn: () =>
      adminApi.emailCustomer(customerId, {
        subject: mailSubject.trim(),
        body: mailBody.trim(),
      }),
    onSuccess: ({ to }) => {
      setMailSubject('');
      setMailBody('');
      showToast({ variant: 'success', title: 'Email queued', description: `Sending to ${to}` });
    },
    onError: onErr,
  });

  const notify = useMutation({
    mutationFn: () => adminApi.notifyCustomer(customerId, { title: msgTitle.trim(), body: msgBody.trim() || undefined }),
    onSuccess: () => {
      setMsgTitle('');
      setMsgBody('');
      showToast({ variant: 'success', title: 'Message sent to the customer' });
    },
    onError: onErr,
  });
  const verify = useMutation({
    mutationFn: () => adminApi.verifyEmail(ownerId),
    onSuccess: async () => {
      await refresh();
      showToast({ variant: 'success', title: 'Owner email verified' });
    },
    onError: onErr,
  });

  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <Wrench className="h-4 w-4" /> Admin actions
        </h2>

        {/* Usage */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">DM usage</p>
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="secondary" size="sm" isLoading={resetUsage.isPending} onClick={() => resetUsage.mutate()}>
              <RotateCcw className="h-4 w-4" /> Reset to 0
            </Button>
            <div className="flex items-end gap-1.5">
              <div>
                <Label htmlFor="bonus">Grant DMs</Label>
                <Input
                  id="bonus"
                  type="number"
                  min={1}
                  value={bonus}
                  onChange={(e) => setBonus(Number(e.target.value))}
                  className="w-28"
                />
              </div>
              <Button variant="secondary" size="sm" isLoading={grantUsage.isPending} onClick={() => grantUsage.mutate()}>
                <Gift className="h-4 w-4" /> Grant
              </Button>
            </div>
          </div>
        </div>

        {/* Comp */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Comp a plan (free)</p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="ctier">Tier</Label>
              <select id="ctier" className={selectCls} value={compTier} onChange={(e) => setCompTier(e.target.value)}>
                {PLAN_TIERS.filter((t) => t !== 'FREE').map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="cdays">Days</Label>
              <Input id="cdays" type="number" min={1} value={compDays} onChange={(e) => setCompDays(Number(e.target.value))} className="w-24" />
            </div>
            <Button variant="secondary" size="sm" isLoading={comp.isPending} onClick={() => comp.mutate()}>
              <CalendarClock className="h-4 w-4" /> Comp
            </Button>
          </div>
        </div>

        {/* Verify email */}
        {ownerPending ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Account</p>
            <Button variant="secondary" size="sm" isLoading={verify.isPending} onClick={() => verify.mutate()}>
              <MailCheck className="h-4 w-4" /> Verify owner email
            </Button>
          </div>
        ) : null}

        {/* Message */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Message the customer</p>
          <Input value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} placeholder="Title" />
          <textarea
            value={msgBody}
            onChange={(e) => setMsgBody(e.target.value)}
            placeholder="Optional message body"
            rows={2}
            className="focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!msgTitle.trim() || notify.isPending}
            isLoading={notify.isPending}
            onClick={() => notify.mutate()}
          >
            <Send className="h-4 w-4" /> Send notification
          </Button>
        </div>

        {/* Email — leaves the app and lands in the owner's inbox, unlike the
            in-app notification above. */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Email the customer
          </p>
          <div>
            <Label htmlFor="mailSubject">Subject</Label>
            <Input
              id="mailSubject"
              value={mailSubject}
              onChange={(e) => setMailSubject(e.target.value)}
              placeholder="About your Automiq account"
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor="mailBody">Message</Label>
            <textarea
              id="mailBody"
              value={mailBody}
              onChange={(e) => setMailBody(e.target.value)}
              placeholder="Write the message. Leave a blank line to start a new paragraph."
              rows={5}
              maxLength={5000}
              className="focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              disabled={
                mailSubject.trim().length < 3 || !mailBody.trim() || sendEmail.isPending
              }
              isLoading={sendEmail.isPending}
              onClick={() => sendEmail.mutate()}
            >
              <Mail className="h-4 w-4" /> Send email
            </Button>
            <span className="text-xs text-slate-400">
              Goes to the workspace owner. Replies come back to us.
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
