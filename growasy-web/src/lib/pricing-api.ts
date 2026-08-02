import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

/**
 * The pricing catalogue now lives in the database and is edited from the admin
 * console, so every surface that shows a price reads it from here instead of a
 * hardcoded constant. `FALLBACK_PLANS` is only a first-paint placeholder (and a
 * safety net if the API is unreachable) — the server response always wins.
 */

export type PlanKey = 'FREE' | 'STARTER' | 'GROWTH' | 'PROFESSIONAL' | 'AGENCY';
export type PurchasableKey = 'STARTER' | 'GROWTH' | 'PROFESSIONAL';
export type BillingCycle = 'monthly' | 'yearly';

/** All money is in minor units (paise). ₹499 = 49900. */
export interface CyclePrice {
  listPrice: number;
  amountDue: number;
  discount: number;
  promoLabel: string | null;
}

export interface PlanLimits {
  maxInstagramAccounts?: number;
  maxAutomations?: number;
  maxMessagesPerMonth?: number;
  maxContacts?: number;
  maxTeamMembers?: number;
  aiAgent?: boolean;
}

export interface ServerPlan {
  tier: PlanKey;
  name: string;
  tag: string;
  subtitle: string | null;
  ctaLabel: string | null;
  inheritsLabel: string | null;
  isPopular: boolean;
  isBestValue: boolean;
  contactSales: boolean;
  purchasable: boolean;
  sortOrder: number;
  currency: string;
  features: string[];
  limits: PlanLimits | null;
  monthly: CyclePrice;
  yearly: CyclePrice;
}

export interface DiscountLine {
  type: 'PERCENT' | 'FLAT';
  value: number;
  amount: number;
  label: string;
}

/** Server-computed price breakdown for a checkout (POST /billing/quote). */
export interface PriceQuote {
  tier: PurchasableKey;
  planName: string;
  cycle: BillingCycle;
  currency: string;
  listPrice: number;
  promo: DiscountLine | null;
  coupon: (DiscountLine & { code: string }) | null;
  totalDiscount: number;
  amountDue: number;
  /** Discounts covered the whole price — activation happens without a payment. */
  free: boolean;
}

export const pricingApi = {
  plans: () => apiClient.get<ServerPlan[]>('/plans'),
};

/**
 * Formats minor units for display: 49900 → "₹499". Whole rupees when the amount
 * is round (prices are almost always set that way), two decimals otherwise.
 */
export function formatMoney(minorUnits: number, currency = 'INR'): string {
  const major = minorUnits / 100;
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;
  const body = Number.isInteger(major)
    ? major.toLocaleString('en-IN')
    : major.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${body}`;
}

/** The price actually charged for a cycle, and the struck-through original. */
export function cycleOf(plan: ServerPlan, cycle: BillingCycle): CyclePrice {
  return cycle === 'yearly' ? plan.yearly : plan.monthly;
}

/** Whether a plan is free (₹0 list price on both cycles). */
export function isFreePlan(plan: ServerPlan): boolean {
  return plan.monthly.listPrice === 0 && plan.yearly.listPrice === 0 && !plan.contactSales;
}

/**
 * The catalogue every pricing surface should use.
 *
 * `placeholderData` keeps the landing page painting instantly (and correctly for
 * the common case) while the request is in flight, instead of flashing skeletons
 * above the fold. `staleTime` is short so an admin price change shows up on the
 * next navigation rather than being cached for the session.
 */
export function usePlans() {
  return useQuery<ServerPlan[]>({
    queryKey: ['plans'],
    queryFn: pricingApi.plans,
    placeholderData: FALLBACK_PLANS,
    staleTime: 60_000,
    retry: 1,
  });
}

function cyclePrice(listPrice: number): CyclePrice {
  return { listPrice, amountDue: listPrice, discount: 0, promoLabel: null };
}

/**
 * Mirrors the values in growasy-api/prisma/seed.ts. Only used until the first
 * successful /plans response — never for anything that charges money.
 */
export const FALLBACK_PLANS: ServerPlan[] = [
  {
    tier: 'FREE',
    name: 'Free',
    tag: 'Free',
    subtitle: 'Perfect for trying Automiq.',
    ctaLabel: 'Get Started Free',
    inheritsLabel: null,
    isPopular: false,
    isBestValue: false,
    contactSales: false,
    purchasable: false,
    sortOrder: 0,
    currency: 'INR',
    features: [
      '1 Instagram account',
      '500 automated DMs / month',
      '1 team member',
      'Comment → DM + story replies',
      'Unlimited keyword rules',
      'Basic analytics',
    ],
    limits: null,
    monthly: cyclePrice(0),
    yearly: cyclePrice(0),
  },
  {
    tier: 'STARTER',
    name: 'Starter',
    tag: 'Starter',
    subtitle: 'For creators & small businesses.',
    ctaLabel: 'Start Free Trial',
    inheritsLabel: null,
    isPopular: false,
    isBestValue: false,
    contactSales: false,
    purchasable: true,
    sortOrder: 1,
    currency: 'INR',
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
    limits: null,
    monthly: cyclePrice(14900),
    yearly: cyclePrice(143000),
  },
  {
    tier: 'GROWTH',
    name: 'Growth',
    tag: 'Growth',
    subtitle: 'For businesses generating leads every day.',
    ctaLabel: 'Start Growing',
    inheritsLabel: 'Everything in Starter, plus:',
    isPopular: true,
    isBestValue: true,
    contactSales: false,
    purchasable: true,
    sortOrder: 2,
    currency: 'INR',
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
    limits: null,
    monthly: cyclePrice(49900),
    yearly: cyclePrice(479000),
  },
  {
    tier: 'PROFESSIONAL',
    name: 'Pro',
    tag: 'Pro',
    subtitle: 'For scaling teams & power users.',
    ctaLabel: 'Choose Pro',
    inheritsLabel: 'Everything in Growth, plus:',
    isPopular: false,
    isBestValue: false,
    contactSales: false,
    purchasable: true,
    sortOrder: 3,
    currency: 'INR',
    features: [
      '10 Instagram accounts',
      '50,000 DMs / month',
      '10 team members',
      'AI DM Agent + custom training',
      'A/B testing',
      'Revenue attribution',
      'API access',
    ],
    limits: null,
    monthly: cyclePrice(99900),
    yearly: cyclePrice(959000),
  },
  {
    tier: 'AGENCY',
    name: 'Agency',
    tag: 'Agency',
    subtitle: 'For agencies managing multiple clients.',
    ctaLabel: 'Contact Sales',
    inheritsLabel: 'Everything in Pro, plus:',
    isPopular: false,
    isBestValue: false,
    contactSales: true,
    purchasable: false,
    sortOrder: 4,
    currency: 'INR',
    features: [
      '15 Instagram accounts',
      '100,000 DMs / month',
      'Unlimited team',
      'White-label reports',
      'Agency dashboard',
      'Dedicated manager',
    ],
    limits: null,
    monthly: cyclePrice(0),
    yearly: cyclePrice(0),
  },
];
