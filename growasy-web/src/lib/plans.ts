/**
 * Pricing plans — single source of truth for the marketing landing page and the
 * in-app Plans page. `key` matches the backend OrgPlanTier so the choice can be
 * carried through registration and the current plan highlighted.
 */
export type PlanKey = 'FREE' | 'STARTER' | 'GROWTH' | 'AGENCY';

export interface Plan {
  key: PlanKey;
  tag: string;
  subtitle: string;
  /** Display strings. `priceYearly` is the annual total (≈20% off = 2 months free). */
  priceMonthly: string;
  priceYearly: string;
  cta: string;
  popular?: boolean;
  bestValue?: boolean;
  /** Sales-led plan — hides price + feature list, shows a "Contact Sales" CTA. */
  contactSales?: boolean;
  /** Optional "Everything in X" lead line shown above the feature list. */
  inherits?: string;
  features: string[];
}

/** Where "Contact Sales" buttons point. */
export const SALES_EMAIL = 'sales@getautomiq.com';

export const PLANS: Plan[] = [
  {
    key: 'FREE',
    tag: 'Free',
    subtitle: 'Perfect for trying Automiq.',
    priceMonthly: '₹0',
    priceYearly: '₹0',
    cta: 'Get Started Free',
    features: [
      '1 Instagram account',
      '500 automated DMs / month',
      'Comment → DM',
      'Story reply automation',
      'Unlimited keyword rules',
      'Ready-made templates',
      'Basic analytics',
    ],
  },
  {
    key: 'STARTER',
    tag: 'Starter',
    subtitle: 'Perfect for creators & small businesses.',
    priceMonthly: '₹799',
    priceYearly: '₹7,690',
    cta: 'Start Free Trial',
    features: [
      '2 Instagram accounts',
      '5,000 automated DMs / month',
      'Unlimited contacts',
      'CRM',
      'Email capture',
      'AI caption generator',
      'AI hashtag generator',
      'Link tracking',
      'Export contacts',
      'Analytics dashboard',
      'Priority email support',
    ],
  },
  {
    key: 'GROWTH',
    tag: 'Growth',
    subtitle: 'Built for businesses that generate leads every day.',
    priceMonthly: '₹1,499',
    priceYearly: '₹14,390',
    cta: 'Start Growing',
    popular: true,
    bestValue: true,
    inherits: 'Everything in Starter',
    features: [
      '5 Instagram accounts',
      '20,000 automated DMs / month',
      'Team members (5)',
      'Advanced analytics',
      'Workflow templates',
      'Multiple workspaces',
      'Custom fields',
      'Priority queue',
    ],
  },
  {
    key: 'AGENCY',
    tag: 'Agency',
    subtitle: 'Built for agencies managing multiple clients.',
    priceMonthly: 'Custom',
    priceYearly: 'Custom',
    cta: 'Contact Sales',
    contactSales: true,
    inherits: 'Everything in Growth, plus:',
    features: [
      'White-label reports',
      'Agency dashboard',
      'Unlimited team & workspaces',
      'Premium support',
    ],
  },
];

/**
 * Plan tiers ranked low→high. Gates which app features/menu items a plan unlocks:
 * an item requiring rank N shows only when the current plan's rank ≥ N.
 */
export const PLAN_RANK = { FREE: 0, STARTER: 1, GROWTH: 2, AGENCY: 3 } as const;

/**
 * Maps a plan *name* (from GET /organizations/me/usage) to a rank. Unknown / no
 * subscription → Infinity so nothing is hidden (fail-open).
 */
export function planRank(planName: string | null | undefined): number {
  if (!planName) return Infinity;
  const byName: Record<string, number> = {
    Free: 0,
    Starter: 1,
    Pro: 1,
    Professional: 1,
    Growth: 2,
    Agency: 3,
    Enterprise: 3,
  };
  return byName[planName] ?? Infinity;
}

/** Pay-as-you-go DM top-ups. Bought on top of any plan; never expire. */
export const DM_ADDONS: { dms: string; price: string }[] = [
  { dms: '1,000', price: '₹299' },
  { dms: '5,000', price: '₹999' },
  { dms: '10,000', price: '₹1,799' },
  { dms: '25,000', price: '₹3,999' },
];
