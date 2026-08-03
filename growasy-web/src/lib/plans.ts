/**
 * Plan ranking + sales contact.
 *
 * The pricing catalogue itself (names, prices, features, discounts) is no longer
 * hardcoded here — it lives in the database, is edited from the admin console,
 * and is fetched with `usePlans()` from `@/lib/pricing-api`. Only the things
 * that describe *code behaviour* rather than commercial terms stay in the app.
 */
export type { PlanKey } from '@/lib/pricing-api';

/** Where "Contact Sales" buttons point. Must stay a mailbox that actually exists. */
export const SALES_EMAIL = 'hello@getautomiq.online';

/**
 * Plan tiers ranked low→high. Gates which app features/menu items a plan unlocks:
 * an item requiring rank N shows only when the current plan's rank ≥ N.
 */
export const PLAN_RANK = { FREE: 0, STARTER: 1, GROWTH: 2, PROFESSIONAL: 3, AGENCY: 4 } as const;

/**
 * Maps a plan *name* (from GET /organizations/me/usage) to a rank. Unknown / no
 * subscription → Infinity so nothing is hidden (fail-open).
 *
 * Names are matched case-insensitively because they are admin-editable now; a
 * renamed plan simply falls through to Infinity rather than locking anyone out.
 */
export function planRank(planName: string | null | undefined): number {
  if (!planName) return Infinity;
  const byName: Record<string, number> = {
    free: 0,
    starter: 1,
    growth: 2,
    pro: 3,
    professional: 3,
    agency: 4,
    enterprise: 4,
  };
  return byName[planName.trim().toLowerCase()] ?? Infinity;
}
