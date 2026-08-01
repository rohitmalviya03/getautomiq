import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Workflow as WorkflowIcon, Plus, Play, Pause, Trash2, Circle, Lock } from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toast-context';
import { workflowsApi, type WorkflowStatus } from '@/lib/workflows-api';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '@/lib/workflow-templates';
import { instagramApi } from '@/lib/instagram-api';
import { organizationsApi } from '@/lib/organizations-api';
import { planRank, PLAN_RANK } from '@/lib/plans';
import { ApiError } from '@/lib/api-client';

const STATUS_STYLE: Record<WorkflowStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  PAUSED: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  ARCHIVED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export function WorkflowsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [pendingTemplate, setPendingTemplate] = useState<WorkflowTemplate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const usageQuery = useQuery({
    queryKey: ['organizations', 'usage'],
    queryFn: organizationsApi.getUsage,
  });
  const rank = usageQuery.data ? planRank(usageQuery.data.planName) : Infinity;
  const canAccess = rank >= PLAN_RANK.GROWTH;

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list(),
    enabled: canAccess,
  });
  const { data: accounts } = useQuery({
    queryKey: ['instagram', 'accounts'],
    queryFn: instagramApi.listAccounts,
    enabled: canAccess,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const wf = await workflowsApi.create({ name: name.trim(), instagramAccountId: accountId });
      if (pendingTemplate) await workflowsApi.saveGraph(wf.id, pendingTemplate.build());
      return wf;
    },
    onSuccess: (wf) => {
      setCreating(false);
      setName('');
      setPendingTemplate(null);
      navigate(`/workflows/${wf.id}`);
    },
    onError: (e) =>
      showToast({ variant: 'error', title: 'Could not create workflow', description: e instanceof ApiError ? e.message : undefined }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: WorkflowStatus }) =>
      status === 'ACTIVE' ? workflowsApi.pause(id) : workflowsApi.publish(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (e) =>
      showToast({ variant: 'error', title: 'Action failed', description: e instanceof ApiError ? e.message : undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workflowsApi.remove(id),
    onSuccess: async () => {
      setDeleteId(null);
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
      showToast({ variant: 'success', title: 'Workflow deleted' });
    },
  });

  const openCreate = () => {
    setPendingTemplate(null);
    setName('');
    setAccountId(accounts?.[0]?.id ?? '');
    setCreating(true);
  };

  const openTemplate = (t: WorkflowTemplate) => {
    setPendingTemplate(t);
    setName(t.name);
    setAccountId(accounts?.[0]?.id ?? '');
    setCreating(true);
  };

  // Visual workflows are a Growth-and-above feature (API-enforced too).
  if (usageQuery.data && !canAccess) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-2xl">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
              <Lock className="h-6 w-6" />
            </span>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Workflows are a Growth feature</h1>
            <p className="max-w-md text-slate-500 dark:text-slate-400">
              The visual workflow builder — multi-step flows with waits, branches, delays and CRM capture — is
              available on the <strong>Growth</strong> plan and above.
            </p>
            <Link to="/billing">
              <Button>Upgrade to Growth</Button>
            </Link>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Workflows</h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Visual, multi-step flows — trigger, message, branch, and more.
            </p>
          </div>
          <Button onClick={openCreate} disabled={!accounts || accounts.length === 0}>
            <Plus className="h-4 w-4" /> New workflow
          </Button>
        </div>

        {accounts && accounts.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Connect an Instagram account first — workflows run on a specific account.
          </div>
        ) : null}

        {/* Templates — see one, then make it your own */}
        {accounts && accounts.length > 0 ? (
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Start from a template
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {WORKFLOW_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => openTemplate(t)}
                  className="group rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-brand-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
                >
                  <p className="flex items-center gap-2 font-semibold text-slate-800 group-hover:text-brand-700 dark:text-slate-100">
                    <WorkflowIcon className="h-4 w-4 text-brand-500" /> {t.name}
                  </p>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-300">
                    <Plus className="h-3 w-3" /> Use this
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !workflows || workflows.length === 0 ? (
          <EmptyState
            icon={WorkflowIcon}
            title="No workflows yet"
            description="Build your first visual flow — a keyword trigger that sends an automated DM."
            action={accounts && accounts.length > 0 ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> New workflow</Button> : undefined}
          />
        ) : (
          <div className="space-y-3">
            {workflows.map((w) => (
              <Card key={w.id} className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => navigate(`/workflows/${w.id}`)}
                    className="flex min-w-0 items-center gap-3 text-left"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                      <WorkflowIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium text-slate-800 dark:text-slate-100">{w.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[w.status]}`}>
                          {w.status}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-slate-400">
                        @{w.accountUsername} · {w.nodeCount} nodes · {w.runCount} runs
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={statusMutation.isPending && statusMutation.variables?.id === w.id}
                      onClick={() => statusMutation.mutate({ id: w.id, status: w.status })}
                    >
                      {w.status === 'ACTIVE' ? (
                        <>
                          <Pause className="h-4 w-4" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" /> Activate
                        </>
                      )}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/workflows/${w.id}`)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteId(w.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      {creating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setCreating(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900 dark:text-white">
              <Circle className="h-4 w-4 text-brand-500" /> New workflow
            </h2>
            <div className="mt-4 space-y-3">
              <div>
                <Label htmlFor="wf-name">Name</Label>
                <Input id="wf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Welcome flow" autoFocus />
              </div>
              <div>
                <Label htmlFor="wf-acc">Instagram account</Label>
                <select
                  id="wf-acc"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {accounts?.map((a) => (
                    <option key={a.id} value={a.id}>
                      @{a.username}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!name.trim() || !accountId}
                isLoading={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                Create &amp; open
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete this workflow?"
        description="In-flight runs stop and the flow is archived. This can't be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </PageTransition>
  );
}
