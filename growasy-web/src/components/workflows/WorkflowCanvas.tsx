import { useCallback, useEffect, useRef, useState } from 'react';
import { Zap, MessageSquare, Flag, Clock, GitBranch, Mail, Tag, UserRound } from 'lucide-react';
import type { WFNode, WFEdge, WorkflowNodeType } from '@/lib/workflows-api';

export const NODE_W = 190;
export const NODE_H = 68;

export const NODE_META: Record<
  WorkflowNodeType,
  { label: string; icon: typeof Zap; ring: string; dot: string }
> = {
  TRIGGER: { label: 'Trigger', icon: Zap, ring: 'border-brand-400', dot: 'bg-brand-500' },
  SEND_MESSAGE: { label: 'Send Message', icon: MessageSquare, ring: 'border-sky-400', dot: 'bg-sky-500' },
  WAIT_REPLY: { label: 'Wait for Reply', icon: Clock, ring: 'border-indigo-400', dot: 'bg-indigo-500' },
  CONDITION: { label: 'Condition', icon: GitBranch, ring: 'border-amber-400', dot: 'bg-amber-500' },
  COLLECT_INPUT: { label: 'Collect Input', icon: Mail, ring: 'border-teal-400', dot: 'bg-teal-500' },
  DELAY: { label: 'Delay', icon: Clock, ring: 'border-violet-400', dot: 'bg-violet-500' },
  ACTION: { label: 'Action', icon: Tag, ring: 'border-fuchsia-400', dot: 'bg-fuchsia-500' },
  HANDOFF: { label: 'Handoff', icon: UserRound, ring: 'border-rose-400', dot: 'bg-rose-500' },
  END: { label: 'End', icon: Flag, ring: 'border-slate-400', dot: 'bg-slate-500' },
};

function nodeSummary(node: WFNode): string {
  const c = node.config as Record<string, unknown>;
  if (node.type === 'TRIGGER') {
    const kw = (c.keywords as string[]) ?? [];
    return kw.length ? `"${kw.join('", "')}"` : (c.matchType === 'ANY' ? 'any message' : 'no keywords');
  }
  if (node.type === 'SEND_MESSAGE') return (c.text as string)?.slice(0, 40) || 'no message';
  return '';
}

/** Vertical offset of an output port for a given branch handle. */
function handleY(node: WFNode, handle?: string | null): number {
  if (node.type === 'CONDITION') {
    if (handle === 'match') return node.positionY + NODE_H * 0.34;
    if (handle === 'else') return node.positionY + NODE_H * 0.68;
  }
  return node.positionY + NODE_H / 2;
}

function edgePath(s: WFNode, t: WFNode, handle?: string | null): string {
  const x1 = s.positionX + NODE_W;
  const y1 = handleY(s, handle);
  const x2 = t.positionX;
  const y2 = t.positionY + NODE_H / 2;
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export interface LinkFrom {
  nodeId: string;
  handle?: string;
}

interface Props {
  nodes: WFNode[];
  edges: WFEdge[];
  selectedId: string | null;
  linkingFrom: LinkFrom | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onStartLink: (nodeId: string, handle?: string) => void;
  onCompleteLink: (targetId: string) => void;
  onDeleteEdge: (index: number) => void;
}

export function WorkflowCanvas({
  nodes,
  edges,
  selectedId,
  linkingFrom,
  onSelect,
  onMove,
  onStartLink,
  onCompleteLink,
  onDeleteEdge,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; offX: number; offY: number } | null>(null);
  const [, force] = useState(0);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!drag.current || !surfaceRef.current) return;
      const rect = surfaceRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - drag.current.offX + surfaceRef.current.scrollLeft;
      const y = e.clientY - rect.top - drag.current.offY + surfaceRef.current.scrollTop;
      onMove(drag.current.id, Math.max(0, x), Math.max(0, y));
    },
    [onMove],
  );

  const endDrag = useCallback(() => {
    drag.current = null;
    force((n) => n + 1);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', endDrag);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', endDrag);
    };
  }, [onMouseMove, endDrag]);

  const byId = (id: string) => nodes.find((n) => n.id === id);

  return (
    <div
      ref={surfaceRef}
      onClick={() => onSelect(null)}
      className="relative h-full w-full overflow-auto bg-slate-50 dark:bg-slate-950"
      style={{
        backgroundImage:
          'radial-gradient(circle, rgba(148,163,184,0.25) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }}
    >
      <div className="relative" style={{ width: 2400, height: 1400 }}>
        {/* edges */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {edges.map((e, i) => {
            const s = byId(e.sourceNodeId);
            const t = byId(e.targetNodeId);
            if (!s || !t) return null;
            const stroke = e.sourceHandle === 'match' ? '#10b981' : e.sourceHandle === 'else' ? '#f59e0b' : '#94a3b8';
            return (
              <g key={e.id ?? `${e.sourceNodeId}-${e.targetNodeId}-${i}`}>
                <path
                  d={edgePath(s, t, e.sourceHandle)}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={2}
                  markerEnd="url(#wf-arrow)"
                  className="pointer-events-auto cursor-pointer hover:stroke-red-400"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onDeleteEdge(i);
                  }}
                />
              </g>
            );
          })}
          <defs>
            <marker id="wf-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" fill="#94a3b8" />
            </marker>
          </defs>
        </svg>

        {/* nodes */}
        {nodes.map((node) => {
          const meta = NODE_META[node.type];
          const Icon = meta.icon;
          const selected = node.id === selectedId;
          const isLinkTarget = linkingFrom && linkingFrom.nodeId !== node.id;
          return (
            <div
              key={node.id}
              className={`absolute select-none rounded-xl border-2 bg-white shadow-sm dark:bg-slate-900 ${meta.ring} ${
                selected ? 'ring-2 ring-brand-500/50' : ''
              } ${isLinkTarget ? 'cursor-copy ring-2 ring-emerald-400/60' : ''}`}
              style={{ left: node.positionX, top: node.positionY, width: NODE_W, height: NODE_H }}
              onMouseDown={(e) => {
                if (linkingFrom) return; // in link mode, click selects target instead of dragging
                const rect = surfaceRef.current?.getBoundingClientRect();
                if (!rect || !surfaceRef.current) return;
                drag.current = {
                  id: node.id,
                  offX: e.clientX - rect.left - node.positionX + surfaceRef.current.scrollLeft,
                  offY: e.clientY - rect.top - node.positionY + surfaceRef.current.scrollTop,
                };
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (linkingFrom && linkingFrom.nodeId !== node.id) {
                  onCompleteLink(node.id);
                } else {
                  onSelect(node.id);
                }
              }}
            >
              <div className="flex h-full flex-col justify-center px-3">
                <div className="flex items-center gap-1.5">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-md text-white ${meta.dot}`}>
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{meta.label}</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">{nodeSummary(node)}</p>
              </div>

              {/* input port (left) */}
              {node.type !== 'TRIGGER' ? (
                <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800" />
              ) : null}

              {/* output ports (right) — click to start a connection.
                  CONDITION exposes two: a green "match" and an amber "else". */}
              {node.type === 'CONDITION' ? (
                (['match', 'else'] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    title={h === 'match' ? 'When it matches' : 'Otherwise'}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartLink(node.id, h);
                    }}
                    className={`absolute -right-2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border-2 ${
                      linkingFrom?.nodeId === node.id && linkingFrom?.handle === h
                        ? 'border-brand-500 bg-brand-500'
                        : h === 'match'
                          ? 'border-emerald-400 bg-white dark:bg-slate-800'
                          : 'border-amber-400 bg-white dark:bg-slate-800'
                    }`}
                    style={{ top: h === 'match' ? '34%' : '68%' }}
                  />
                ))
              ) : node.type !== 'END' ? (
                <button
                  type="button"
                  title="Drag a connection from here"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartLink(node.id);
                  }}
                  className={`absolute -right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border-2 ${
                    linkingFrom?.nodeId === node.id
                      ? 'border-emerald-500 bg-emerald-500'
                      : 'border-slate-300 bg-white hover:border-brand-500 dark:border-slate-600 dark:bg-slate-800'
                  }`}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
