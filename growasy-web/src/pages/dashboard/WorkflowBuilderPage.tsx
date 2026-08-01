import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Save, Rocket, Pause, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { FullPageSpinner } from '@/components/ui/FullPageSpinner';
import { useToast } from '@/components/ui/toast-context';
import { WorkflowCanvas, NODE_META, type LinkFrom } from '@/components/workflows/WorkflowCanvas';
import {
  workflowsApi,
  type WFNode,
  type WFEdge,
  type WorkflowNodeType,
  type WorkflowDetail,
} from '@/lib/workflows-api';
import { ApiError } from '@/lib/api-client';

const MATCH_TYPES = ['CONTAINS', 'EXACT', 'STARTS_WITH', 'REGEX', 'ANY'] as const;
const TRIGGER_TYPES = [
  { value: 'DM_KEYWORD', label: 'DM keyword' },
  { value: 'COMMENT_KEYWORD', label: 'Comment keyword' },
  { value: 'STORY_REPLY', label: 'Story reply' },
] as const;

const PALETTE: WorkflowNodeType[] = [
  'SEND_MESSAGE',
  'WAIT_REPLY',
  'CONDITION',
  'COLLECT_INPUT',
  'DELAY',
  'ACTION',
  'HANDOFF',
  'END',
];

function defaultConfig(type: WorkflowNodeType): Record<string, unknown> {
  switch (type) {
    case 'SEND_MESSAGE':
      return { text: '' };
    case 'DELAY':
      return { amount: 5, unit: 'minutes' };
    case 'CONDITION':
      return { matchType: 'CONTAINS', keywords: [] };
    case 'COLLECT_INPUT':
      return { inputType: 'email', prompt: "What's your email?", maxAttempts: 3 };
    case 'ACTION':
      return { action: 'ADD_TAG', tagName: '' };
    case 'HANDOFF':
      return { note: '' };
    default:
      return {};
  }
}

export function WorkflowBuilderPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [nodes, setNodes] = useState<WFNode[]>([]);
  const [edges, setEdges] = useState<WFEdge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkingFrom, setLinkingFrom] = useState<LinkFrom | null>(null);
  const dirty = useRef(false);
  const [status, setStatus] = useState<WorkflowDetail['status']>('DRAFT');
  const [meta, setMeta] = useState<{ name: string; account: string }>({ name: '', account: '' });

  const { data, isLoading } = useQuery({ queryKey: ['workflow', id], queryFn: () => workflowsApi.get(id) });

  const hydrate = (wf: WorkflowDetail) => {
    setNodes(wf.nodes);
    setEdges(wf.edges);
    setStatus(wf.status);
    setMeta({ name: wf.name, account: wf.accountUsername });
    dirty.current = false;
  };

  useEffect(() => {
    if (data && !dirty.current) hydrate(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLinkingFrom(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const markDirty = () => {
    dirty.current = true;
  };

  const saveMutation = useMutation({
    mutationFn: () => workflowsApi.saveGraph(id, { nodes, edges }),
    onSuccess: (wf) => {
      hydrate(wf);
      showToast({ variant: 'success', title: 'Saved' });
    },
    onError: (e) => showToast({ variant: 'error', title: 'Save failed', description: e instanceof ApiError ? e.message : undefined }),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      await workflowsApi.saveGraph(id, { nodes, edges }); // publish validates the persisted graph
      return workflowsApi.publish(id);
    },
    onSuccess: (wf) => {
      hydrate(wf);
      showToast({ variant: 'success', title: 'Workflow is live 🚀' });
    },
    onError: (e) => showToast({ variant: 'error', title: 'Could not publish', description: e instanceof ApiError ? e.message : undefined }),
  });

  const pauseMutation = useMutation({
    mutationFn: () => workflowsApi.pause(id),
    onSuccess: (wf) => hydrate(wf),
  });

  // --- graph editing --------------------------------------------------------

  const addNode = (type: WorkflowNodeType) => {
    const offset = nodes.length * 24;
    const node: WFNode = {
      id: crypto.randomUUID(),
      type,
      config: defaultConfig(type),
      positionX: 300 + offset,
      positionY: 300 + offset,
    };
    setNodes((n) => [...n, node]);
    setSelectedId(node.id);
    markDirty();
  };

  const moveNode = (nodeId: string, x: number, y: number) => {
    setNodes((n) => n.map((nd) => (nd.id === nodeId ? { ...nd, positionX: x, positionY: y } : nd)));
    markDirty();
  };

  const updateConfig = (nodeId: string, patch: Record<string, unknown>) => {
    setNodes((n) => n.map((nd) => (nd.id === nodeId ? { ...nd, config: { ...nd.config, ...patch } } : nd)));
    markDirty();
  };

  const completeLink = (targetId: string) => {
    if (!linkingFrom || linkingFrom.nodeId === targetId) {
      setLinkingFrom(null);
      return;
    }
    const { nodeId: src, handle } = linkingFrom;
    setEdges((es) => {
      // Replace any existing edge leaving this specific port (a node — or a Condition
      // branch — has one outgoing edge per handle).
      const without = es.filter(
        (e) => !(e.sourceNodeId === src && (e.sourceHandle ?? undefined) === (handle ?? undefined)),
      );
      return [...without, { sourceNodeId: src, targetNodeId: targetId, sourceHandle: handle ?? null }];
    });
    setLinkingFrom(null);
    markDirty();
  };

  const deleteEdge = (index: number) => {
    setEdges((es) => es.filter((_, i) => i !== index));
    markDirty();
  };

  const deleteNode = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (node?.type === 'TRIGGER') {
      showToast({ variant: 'info', title: 'The Trigger cannot be removed' });
      return;
    }
    setNodes((n) => n.filter((nd) => nd.id !== nodeId));
    setEdges((es) => es.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId));
    setSelectedId(null);
    markDirty();
  };

  if (isLoading) return <FullPageSpinner />;

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/workflows')} className="text-slate-500 hover:text-brand-600">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">{meta.name}</p>
            <p className="text-xs text-slate-400">
              @{meta.account} ·{' '}
              <span className={status === 'ACTIVE' ? 'text-emerald-500' : 'text-slate-400'}>{status}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" isLoading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            <Save className="h-4 w-4" /> Save
          </Button>
          {status === 'ACTIVE' ? (
            <Button variant="secondary" size="sm" isLoading={pauseMutation.isPending} onClick={() => pauseMutation.mutate()}>
              <Pause className="h-4 w-4" /> Pause
            </Button>
          ) : (
            <Button variant="primary" size="sm" isLoading={publishMutation.isPending} onClick={() => publishMutation.mutate()}>
              <Rocket className="h-4 w-4" /> Publish
            </Button>
          )}
        </div>
      </div>

      {/* Palette */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/50">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Add</span>
        {PALETTE.map((type) => {
          const meta = NODE_META[type];
          const Icon = meta.icon;
          return (
            <button
              key={type}
              type="button"
              onClick={() => addNode(type)}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded text-white ${meta.dot}`}>
                <Icon className="h-2.5 w-2.5" />
              </span>
              {meta.label}
            </button>
          );
        })}
      </div>

      {linkingFrom ? (
        <div className="bg-emerald-500 px-4 py-1.5 text-center text-xs font-semibold text-white">
          Click a target node to connect — or press Esc to cancel
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Canvas */}
        <div className="min-w-0 flex-1">
          <WorkflowCanvas
            nodes={nodes}
            edges={edges}
            selectedId={selectedId}
            linkingFrom={linkingFrom}
            onSelect={setSelectedId}
            onMove={moveNode}
            onStartLink={(nodeId, handle) => setLinkingFrom({ nodeId, handle })}
            onCompleteLink={completeLink}
            onDeleteEdge={deleteEdge}
          />
        </div>

        {/* Config panel */}
        <div className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {!selected ? (
            <div className="mt-10 text-center text-sm text-slate-400">
              <p>Select a node to configure it.</p>
              <p className="mt-2 text-xs">
                Drag from a node’s right dot to connect. Click an edge to delete it.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                  {selected.type.replace('_', ' ')}
                </h3>
                {selected.type !== 'TRIGGER' ? (
                  <Button variant="ghost" size="sm" onClick={() => deleteNode(selected.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                ) : null}
              </div>

              <NodeConfigBody node={selected} onChange={(p) => updateConfig(selected.id, p)} />
              {selected.type === 'CONDITION' ? (
                <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-400 dark:bg-slate-800/50">
                  Connect the <span className="font-semibold text-emerald-500">green</span> dot for a match and the{' '}
                  <span className="font-semibold text-amber-500">amber</span> dot for everything else.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const INPUT_CLS =
  'focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

function NodeConfigBody({ node, onChange }: { node: WFNode; onChange: (patch: Record<string, unknown>) => void }) {
  const c = node.config as Record<string, unknown>;

  if (node.type === 'TRIGGER') return <TriggerConfig node={node} onChange={onChange} />;

  if (node.type === 'SEND_MESSAGE') {
    return (
      <div>
        <Label htmlFor="msg">Message</Label>
        <textarea
          id="msg"
          rows={5}
          value={String(c.text ?? '')}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Hey! Thanks for reaching out 👋"
          className={INPUT_CLS}
        />
        <p className="mt-1 text-xs text-slate-400">Use {'{{triggerText}}'} or {'{{lastReply}}'} to echo the contact.</p>
      </div>
    );
  }

  if (node.type === 'DELAY') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="amt">Wait</Label>
          <Input id="amt" type="number" min={1} value={Number(c.amount ?? 5)} onChange={(e) => onChange({ amount: Number(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor="unit">Unit</Label>
          <select id="unit" className={INPUT_CLS} value={String(c.unit ?? 'minutes')} onChange={(e) => onChange({ unit: e.target.value })}>
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
        </div>
      </div>
    );
  }

  if (node.type === 'WAIT_REPLY') {
    return <p className="text-sm text-slate-400">Pauses the flow until this contact sends their next DM. Their reply becomes {'{{lastReply}}'}.</p>;
  }

  if (node.type === 'CONDITION') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-slate-400">Branches on the contact’s last reply.</p>
        <div>
          <Label htmlFor="cmt">Match type</Label>
          <select id="cmt" className={INPUT_CLS} value={String(c.matchType ?? 'CONTAINS')} onChange={(e) => onChange({ matchType: e.target.value })}>
            {MATCH_TYPES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="ckw">Keywords (comma-separated)</Label>
          <Input
            id="ckw"
            value={((c.keywords as string[]) ?? []).join(', ')}
            onChange={(e) => onChange({ keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            placeholder="yes, sure, ok"
          />
        </div>
      </div>
    );
  }

  if (node.type === 'COLLECT_INPUT') {
    return (
      <div className="space-y-3">
        <div>
          <Label htmlFor="it">Collect</Label>
          <select id="it" className={INPUT_CLS} value={String(c.inputType ?? 'email')} onChange={(e) => onChange({ inputType: e.target.value })}>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
          </select>
        </div>
        <div>
          <Label htmlFor="pr">Prompt message</Label>
          <textarea id="pr" rows={2} value={String(c.prompt ?? '')} onChange={(e) => onChange({ prompt: e.target.value })} className={INPUT_CLS} placeholder="What's your email?" />
        </div>
        <div>
          <Label htmlFor="rt">Retry message</Label>
          <Input id="rt" value={String(c.retryMessage ?? '')} onChange={(e) => onChange({ retryMessage: e.target.value })} placeholder="Hmm, that doesn't look right — try again?" />
        </div>
        <div>
          <Label htmlFor="ma">Max attempts</Label>
          <Input id="ma" type="number" min={1} value={Number(c.maxAttempts ?? 3)} onChange={(e) => onChange({ maxAttempts: Number(e.target.value) })} />
        </div>
      </div>
    );
  }

  if (node.type === 'ACTION') {
    const action = String(c.action ?? 'ADD_TAG');
    return (
      <div className="space-y-3">
        <div>
          <Label htmlFor="act">Action</Label>
          <select id="act" className={INPUT_CLS} value={action} onChange={(e) => onChange({ action: e.target.value })}>
            <option value="ADD_TAG">Add tag</option>
            <option value="SUBSCRIBE">Subscribe</option>
            <option value="UNSUBSCRIBE">Unsubscribe</option>
            <option value="SEND_LINK">Send link</option>
          </select>
        </div>
        {action === 'ADD_TAG' ? (
          <div>
            <Label htmlFor="tn">Tag name</Label>
            <Input id="tn" value={String(c.tagName ?? '')} onChange={(e) => onChange({ tagName: e.target.value })} placeholder="lead" />
          </div>
        ) : null}
        {action === 'SEND_LINK' ? (
          <>
            <div>
              <Label htmlFor="lt">Message</Label>
              <Input id="lt" value={String(c.text ?? '')} onChange={(e) => onChange({ text: e.target.value })} placeholder="Here's the link:" />
            </div>
            <div>
              <Label htmlFor="lu">URL</Label>
              <Input id="lu" value={String(c.url ?? '')} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…" />
            </div>
          </>
        ) : null}
      </div>
    );
  }

  if (node.type === 'HANDOFF') {
    return (
      <div>
        <Label htmlFor="note">Note for your team</Label>
        <textarea id="note" rows={3} value={String(c.note ?? '')} onChange={(e) => onChange({ note: e.target.value })} className={INPUT_CLS} placeholder="Needs a human — pricing question" />
        <p className="mt-1 text-xs text-slate-400">Pauses the flow and notifies you.</p>
      </div>
    );
  }

  return <p className="text-sm text-slate-400">Marks the flow complete. No configuration.</p>;
}

function TriggerConfig({ node, onChange }: { node: WFNode; onChange: (patch: Record<string, unknown>) => void }) {
  const cfg = node.config as { triggerType?: string; matchType?: string; keywords?: string[] };
  const selectClass =
    'focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="tt">When</Label>
        <select id="tt" className={selectClass} value={cfg.triggerType ?? 'DM_KEYWORD'} onChange={(e) => onChange({ triggerType: e.target.value })}>
          {TRIGGER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="mt">Match</Label>
        <select id="mt" className={selectClass} value={cfg.matchType ?? 'CONTAINS'} onChange={(e) => onChange({ matchType: e.target.value })}>
          {MATCH_TYPES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      {cfg.matchType !== 'ANY' ? (
        <div>
          <Label htmlFor="kw">Keywords (comma-separated)</Label>
          <Input
            id="kw"
            value={(cfg.keywords ?? []).join(', ')}
            onChange={(e) =>
              onChange({ keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
            }
            placeholder="price, info, link"
          />
        </div>
      ) : null}
    </div>
  );
}
