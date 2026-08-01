import type { WFNode, WFEdge, WorkflowNodeType } from '@/lib/workflows-api';

export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  /** Builds a fresh graph (new node ids) each time it's applied. */
  build: () => { nodes: WFNode[]; edges: WFEdge[] };
}

function node(type: WorkflowNodeType, config: Record<string, unknown>, x: number, y: number): WFNode {
  return { id: crypto.randomUUID(), type, config, positionX: x, positionY: y };
}
function edge(s: WFNode, t: WFNode, sourceHandle?: string): WFEdge {
  return { sourceNodeId: s.id, targetNodeId: t.id, sourceHandle: sourceHandle ?? null };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: 'lead-capture',
    name: 'Lead capture (email)',
    description: 'DM keyword → greet → collect their email into your CRM → thank-you.',
    build: () => {
      const trigger = node('TRIGGER', { triggerType: 'DM_KEYWORD', matchType: 'CONTAINS', keywords: ['guide', 'freebie'] }, 60, 200);
      const greet = node('SEND_MESSAGE', { text: 'Hey! 👋 Happy to send that over.' }, 300, 200);
      const collect = node('COLLECT_INPUT', { inputType: 'email', prompt: "What's the best email to send it to?", maxAttempts: 3 }, 540, 200);
      const tag = node('ACTION', { action: 'ADD_TAG', tagName: 'lead' }, 780, 200);
      const thanks = node('SEND_MESSAGE', { text: 'Thanks! Sent it to {{email}} 📩' }, 1020, 200);
      const end = node('END', {}, 1260, 200);
      return {
        nodes: [trigger, greet, collect, tag, thanks, end],
        edges: [edge(trigger, greet), edge(greet, collect), edge(collect, tag), edge(tag, thanks), edge(thanks, end)],
      };
    },
  },
  {
    key: 'faq-branch',
    name: 'FAQ router (branch)',
    description: 'Ask what they need, wait for the reply, then branch to pricing or a human handoff.',
    build: () => {
      const trigger = node('TRIGGER', { triggerType: 'DM_KEYWORD', matchType: 'CONTAINS', keywords: ['info', 'help'] }, 60, 240);
      const ask = node('SEND_MESSAGE', { text: 'Sure! Reply PRICING for plans, or anything else to reach our team.' }, 300, 240);
      const wait = node('WAIT_REPLY', {}, 540, 240);
      const cond = node('CONDITION', { matchType: 'CONTAINS', keywords: ['pricing', 'price', 'cost'] }, 780, 240);
      const pricing = node('SEND_MESSAGE', { text: 'Our plans start at ₹149/mo — here you go 👉' }, 1040, 120);
      const endYes = node('END', {}, 1300, 120);
      const human = node('SEND_MESSAGE', { text: 'Got it — a team member will jump in shortly 🙌' }, 1040, 360);
      const handoff = node('HANDOFF', { note: 'Non-pricing FAQ' }, 1300, 360);
      const endNo = node('END', {}, 1540, 360);
      return {
        nodes: [trigger, ask, wait, cond, pricing, endYes, human, handoff, endNo],
        edges: [
          edge(trigger, ask),
          edge(ask, wait),
          edge(wait, cond),
          edge(cond, pricing, 'match'),
          edge(pricing, endYes),
          edge(cond, human, 'else'),
          edge(human, handoff),
          edge(handoff, endNo),
        ],
      };
    },
  },
  {
    key: 'comment-to-dm',
    name: 'Comment → DM + delayed link',
    description: 'Comment keyword → instant DM → wait 1 minute → send the link.',
    build: () => {
      const trigger = node('TRIGGER', { triggerType: 'COMMENT_KEYWORD', matchType: 'CONTAINS', keywords: ['link'] }, 60, 200);
      const dm = node('SEND_MESSAGE', { text: 'Just sent you a DM! 📩' }, 300, 200);
      const delay = node('DELAY', { amount: 1, unit: 'minutes' }, 540, 200);
      const link = node('SEND_MESSAGE', { text: "Here's the link you asked for 👉 https://your-link.com" }, 780, 200);
      const end = node('END', {}, 1020, 200);
      return {
        nodes: [trigger, dm, delay, link, end],
        edges: [edge(trigger, dm), edge(dm, delay), edge(delay, link), edge(link, end)],
      };
    },
  },
];
