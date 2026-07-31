import { OrgPlanTier } from '@prisma/client';

/**
 * Machine-readable, tier-gated feature keys (distinct from Plan.features, which
 * holds marketing bullet strings). Used by @RequireFeature + FeatureGuard and
 * PlanLimitsService.hasFeature() to gate premium capabilities.
 */
export const PLAN_FEATURES = {
  ANALYTICS: 'analytics',
  WHITE_LABEL: 'white_label',
  /** Owning more than one workspace (the agency/multi-brand use case). */
  MULTIPLE_WORKSPACES: 'multiple_workspaces',
  /** AI DM Agent (Growth and above). */
  AI_DM_AGENT: 'ai_dm_agent',
} as const;

export type PlanFeatureKey = (typeof PLAN_FEATURES)[keyof typeof PLAN_FEATURES];

/** Which tiers unlock each feature. */
export const FEATURE_TIER_MATRIX: Record<PlanFeatureKey, OrgPlanTier[]> = {
  [PLAN_FEATURES.ANALYTICS]: [
    OrgPlanTier.STARTER,
    OrgPlanTier.GROWTH,
    OrgPlanTier.PROFESSIONAL,
    OrgPlanTier.AGENCY,
    OrgPlanTier.ENTERPRISE,
  ],
  [PLAN_FEATURES.WHITE_LABEL]: [OrgPlanTier.AGENCY, OrgPlanTier.ENTERPRISE],
  [PLAN_FEATURES.MULTIPLE_WORKSPACES]: [OrgPlanTier.GROWTH, OrgPlanTier.AGENCY, OrgPlanTier.ENTERPRISE],
  [PLAN_FEATURES.AI_DM_AGENT]: [
    OrgPlanTier.GROWTH,
    OrgPlanTier.PROFESSIONAL,
    OrgPlanTier.AGENCY,
    OrgPlanTier.ENTERPRISE,
  ],
};
