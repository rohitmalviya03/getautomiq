import { OrgPlanTier } from '@prisma/client';

/**
 * Machine-readable, tier-gated feature keys (distinct from Plan.features, which
 * holds marketing bullet strings). Used by @RequireFeature + FeatureGuard and
 * PlanLimitsService.hasFeature() to gate premium capabilities.
 */
export const PLAN_FEATURES = {
  ANALYTICS: 'analytics',
  /** Per-post / per-reel performance breakdown (Growth and above). */
  POST_ANALYTICS: 'post_analytics',
  /** Visual workflow builder + engine (Growth and above). */
  WORKFLOWS: 'workflows',
  WHITE_LABEL: 'white_label',
  /** Owning more than one workspace (the agency/multi-brand use case). */
  MULTIPLE_WORKSPACES: 'multiple_workspaces',
  /** AI DM Agent (Growth and above). */
  AI_DM_AGENT: 'ai_dm_agent',
  /** Tying reported sales back to the automation that earned them (Pro and above). */
  REVENUE_ATTRIBUTION: 'revenue_attribution',
  /** Issuing API keys and calling the public API with them (Pro and above). */
  API_ACCESS: 'api_access',
  /** More than one DM wording per automation, with per-variant results (Pro and above). */
  AB_TESTING: 'ab_testing',
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
  // Post-wise analytics + the visual workflow builder are Growth and above only.
  [PLAN_FEATURES.POST_ANALYTICS]: [
    OrgPlanTier.GROWTH,
    OrgPlanTier.PROFESSIONAL,
    OrgPlanTier.AGENCY,
    OrgPlanTier.ENTERPRISE,
  ],
  [PLAN_FEATURES.WORKFLOWS]: [
    OrgPlanTier.GROWTH,
    OrgPlanTier.PROFESSIONAL,
    OrgPlanTier.AGENCY,
    OrgPlanTier.ENTERPRISE,
  ],
  // Sold on the pricing page as Professional-tier features, so Growth does not
  // get them even though it sits above Starter.
  [PLAN_FEATURES.REVENUE_ATTRIBUTION]: [
    OrgPlanTier.PROFESSIONAL,
    OrgPlanTier.AGENCY,
    OrgPlanTier.ENTERPRISE,
  ],
  [PLAN_FEATURES.API_ACCESS]: [
    OrgPlanTier.PROFESSIONAL,
    OrgPlanTier.AGENCY,
    OrgPlanTier.ENTERPRISE,
  ],
  [PLAN_FEATURES.AB_TESTING]: [
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
