/**
 * Pricing plans — single source of truth for the marketing landing page and the
 * in-app Plans page. `key` matches the backend OrgPlanTier so the choice can be
 * carried through registration and the current plan highlighted.
 */
export type PlanKey = 'FREE' | 'STARTER' | 'GROWTH' | 'PROFESSIONAL' | 'AGENCY';

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
      '1 team member',
      'Comment → DM + story replies',
      'Unlimited keyword rules',
      'Basic analytics',
    ],
  },
  {
    key: 'STARTER',
    tag: 'Starter',
    subtitle: 'For creators & small businesses.',
    priceMonthly: '₹149',
    priceYearly: '₹1,430',
    cta: 'Start Free Trial',
    features: [
      '2 Instagram accounts',
      '5,000 DMs / month',
      '1 team member',
      'Unlimited contacts + CRM',
      'Email capture',
      'AI caption & hashtag tools',
      'Link tracking + CSV export',
      'No Automiq branding',
    ],
  },
  {
    key: 'GROWTH',
    tag: 'Growth',
    subtitle: 'For businesses generating leads every day.',
    priceMonthly: '₹499',
    priceYearly: '₹4,790',
    cta: 'Start Growing',
    popular: true,
    bestValue: true,
    inherits: 'Everything in Starter, plus:',
    features: [
      '5 Instagram accounts',
      '20,000 DMs / month',
      '5 team members',
      'AI DM Agent',
      'Visual workflow builder',
      'Post-wise analytics',
      'Broadcast / bulk DM',
      'Multiple workspaces · priority queue',
    ],
  },
  {
    key: 'PROFESSIONAL',
    tag: 'Pro',
    subtitle: 'For scaling teams & power users.',
    priceMonthly: '₹999',
    priceYearly: '₹9,590',
    cta: 'Choose Pro',
    inherits: 'Everything in Growth, plus:',
    features: [
      '10 Instagram accounts',
      '50,000 DMs / month',
      '10 team members',
      'AI DM Agent + custom training',
      'A/B testing',
      'Revenue attribution',
      'API access',
    ],
  },
  {
    key: 'AGENCY',
    tag: 'Agency',
    subtitle: 'For agencies managing multiple clients.',
    priceMonthly: 'Custom',
    priceYearly: 'Custom',
    cta: 'Contact Sales',
    contactSales: true,
    inherits: 'Everything in Pro, plus:',
    features: [
      '15 Instagram accounts',
      '100,000 DMs / month',
      'Unlimited team',
      'White-label reports',
      'Agency dashboard',
      'Dedicated manager',
    ],
  },
];

/**
 * Plan tiers ranked low→high. Gates which app features/menu items a plan unlocks:
 * an item requiring rank N shows only when the current plan's rank ≥ N.
 */
export const PLAN_RANK = { FREE: 0, STARTER: 1, GROWTH: 2, PROFESSIONAL: 3, AGENCY: 4 } as const;

/**
 * Maps a plan *name* (from GET /organizations/me/usage) to a rank. Unknown / no
 * subscription → Infinity so nothing is hidden (fail-open).
 */
export function planRank(planName: string | null | undefined): number {
  if (!planName) return Infinity;
  const byName: Record<string, number> = {
    Free: 0,
    Starter: 1,
    Growth: 2,
    Pro: 3,
    Professional: 3,
    Agency: 4,
    Enterprise: 4,
  };
  return byName[planName] ?? Infinity;
}
