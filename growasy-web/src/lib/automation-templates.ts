import {
  Mail,
  MessageSquareReply,
  Link2,
  Tag,
  Sparkles,
  Hand,
  type LucideIcon,
} from 'lucide-react';
import type { AutomationFormValues } from '@/schemas/automation.schemas';

/**
 * Ready-made automations. Each template pre-fills the builder form with sensible
 * defaults for a common use case; the user picks one, tweaks the copy/keywords,
 * and saves. Purely client-side — `values` is merged over the empty form (minus
 * the Instagram account, which is chosen at open time).
 */
export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Short trigger label shown on the card. */
  badge: string;
  values: Partial<AutomationFormValues>;
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'comment-to-dm-link',
    name: 'Comment → DM a link',
    description:
      'When someone comments a keyword on your post, auto-reply publicly and DM them your link.',
    icon: Link2,
    badge: 'Comment',
    values: {
      name: 'Comment to DM link',
      triggerTypes: ['COMMENT_KEYWORD'],
      matchType: 'CONTAINS',
      keywords: 'link, info',
      dmText: "Hey {{username}}! Here's the link you asked for 👉 https://your-link.com",
      replyText: 'Just sent you a DM! 📩',
    },
  },
  {
    id: 'dm-keyword-link',
    name: 'DM keyword → send link',
    description: 'Someone DMs you a keyword and instantly gets your link or resource back.',
    icon: MessageSquareReply,
    badge: 'DM',
    values: {
      name: 'DM keyword auto-reply',
      triggerTypes: ['DM_KEYWORD'],
      matchType: 'CONTAINS',
      keywords: 'link, price, info',
      dmText: "Here you go 👉 https://your-link.com\n\nLet me know if you need anything else!",
    },
  },
  {
    id: 'lead-magnet-email',
    name: 'Comment → collect email',
    description:
      'Run a lead magnet: comment a keyword, we ask for their email in the DM and save it to Contacts.',
    icon: Mail,
    badge: 'Comment',
    values: {
      name: 'Free guide lead magnet',
      triggerTypes: ['COMMENT_KEYWORD'],
      matchType: 'CONTAINS',
      keywords: 'guide, freebie',
      dmText: 'Want the free guide? 📩 Drop your best email below and I’ll send it right over!',
      replyText: 'Check your DMs 📩',
      collectEmail: true,
      emailSuccessMessage: 'Awesome — check your inbox! 🎉',
      emailFailureMessage: "Hmm, that doesn't look like an email. Mind trying again?",
    },
  },
  {
    id: 'price-request',
    name: 'Comment "price" → send details',
    description: 'Auto-DM your pricing or catalog whenever someone asks for the price on a post.',
    icon: Tag,
    badge: 'Comment',
    values: {
      name: 'Price request responder',
      triggerTypes: ['COMMENT_KEYWORD'],
      matchType: 'CONTAINS',
      keywords: 'price, cost, how much',
      dmText:
        "Thanks for your interest, {{username}}! 💜 Here are the details you asked for: https://your-link.com/pricing",
      replyText: 'Sent you the details in a DM! 📩',
    },
  },
  {
    id: 'story-reply-responder',
    name: 'Story reply → auto DM',
    description: 'Send an automatic DM to anyone who replies to your story — no keyword needed.',
    icon: Sparkles,
    badge: 'Story reply',
    values: {
      name: 'Story reply responder',
      triggerTypes: ['STORY_REPLY'],
      matchType: 'ANY',
      keywords: '',
      dmText: 'Thanks for replying to my story! 💜 Here’s something for you: https://your-link.com',
    },
  },
  {
    id: 'welcome-dm',
    name: 'DM "hi" → welcome message',
    description: 'Greet new people who DM you with a warm welcome and a link to get started.',
    icon: Hand,
    badge: 'DM',
    values: {
      name: 'Welcome DM',
      triggerTypes: ['DM_KEYWORD'],
      matchType: 'CONTAINS',
      keywords: 'hi, hello, info',
      dmText:
        'Hey {{username}}! 👋 Thanks for reaching out. Here’s everything you need to get started: https://your-link.com',
    },
  },
];

export function findTemplate(id: string | null | undefined): AutomationTemplate | undefined {
  if (!id) return undefined;
  return AUTOMATION_TEMPLATES.find((t) => t.id === id);
}
