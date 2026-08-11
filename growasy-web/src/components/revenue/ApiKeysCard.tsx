import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toast-context';
import { revenueApi, type ApiKeySummary, type IssuedApiKey } from '@/lib/revenue-api';
import { ApiError } from '@/lib/api-client';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Issues and revokes the keys a creator's store uses to report sales.
 *
 * A new key's plaintext is shown once, right here, and never again — so the
 * panel is built around that moment: the value stays on screen with a copy
 * button until the creator dismisses it.
 */
export function ApiKeysCard() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeySummary | null>(null);

  const keysQuery = useQuery({
    queryKey: ['revenue', 'api-keys'],
    queryFn: revenueApi.apiKeys,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['revenue', 'api-keys'] });

  const createMutation = useMutation({
    mutationFn: () => revenueApi.createApiKey(name.trim()),
    onSuccess: (key) => {
      setIssued(key);
      setName('');
      setCopied(false);
      invalidate();
    },
    onError: (err) =>
      showToast({
        title: 'Could not create key',
        description: err instanceof ApiError ? err.message : 'Something went wrong',
        variant: 'error',
      }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revenueApi.revokeApiKey(id),
    onSuccess: () => {
      showToast({ title: 'Key revoked', variant: 'success' });
      setRevokeTarget(null);
      invalidate();
    },
    onError: () => showToast({ title: 'Could not revoke key', variant: 'error' }),
  });

  const copyKey = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.key);
      setCopied(true);
    } catch {
      showToast({ title: 'Copy failed — select the key and copy it manually', variant: 'error' });
    }
  };

  const keys = keysQuery.data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report sales automatically</CardTitle>
        <CardDescription>
          Give your store a key and have it tell Automiq about every sale. Then revenue lands
          against the automation that earned it, with no typing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {issued ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
              Copy this key now — you will not be able to see it again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-800 dark:bg-slate-900 dark:text-slate-100">
                {issued.key}
              </code>
              <Button type="button" variant="secondary" onClick={copyKey}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="mt-2"
              onClick={() => setIssued(null)}
            >
              I've saved it
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) createMutation.mutate();
            }}
          >
            <div className="min-w-[12rem] flex-1">
              <Label htmlFor="keyName">Key name</Label>
              <Input
                id="keyName"
                placeholder="Shopify store"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>
            <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
              <Plus className="mr-1.5 h-4 w-4" /> Create key
            </Button>
          </form>
        )}

        {keys.length > 0 ? (
          <ul className="divide-y divide-slate-200/70 dark:divide-white/10">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {key.name}
                    {key.revokedAt ? (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-normal text-slate-500 dark:bg-white/10 dark:text-slate-400">
                        revoked
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                    {key.keyPrefix}…{' · '}
                    {key.lastUsedAt
                      ? `last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                      : 'never used'}
                  </p>
                </div>
                {key.revokedAt ? null : (
                  <button
                    type="button"
                    onClick={() => setRevokeTarget(key)}
                    className="focus-ring rounded-md p-1.5 text-slate-400 hover:text-rose-600"
                    aria-label={`Revoke ${key.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            No keys yet.
          </p>
        )}

        <details className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-white/5">
          <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-200">
            How to send us a sale
          </summary>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            Call this from your order-confirmation hook. Send the buyer's email — that is how we
            find the lead your automation created. <code>value</code> is in paise, so ₹499 is{' '}
            <code>49900</code>. Send your own <code>externalId</code> and retries won't count the
            sale twice.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
            {`curl -X POST ${API_BASE}/public/conversions \\
  -H "Authorization: Bearer amq_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "value": 49900,
    "currency": "INR",
    "email": "buyer@example.com",
    "externalId": "order_1234"
  }'`}
          </pre>
        </details>
      </CardContent>

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke this key?"
        description={`Anything still using "${revokeTarget?.name ?? ''}" will stop being able to report sales. Sales already recorded are kept.`}
        confirmLabel="Revoke"
        variant="danger"
        isLoading={revokeMutation.isPending}
        onConfirm={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
        onCancel={() => setRevokeTarget(null)}
      />
    </Card>
  );
}
