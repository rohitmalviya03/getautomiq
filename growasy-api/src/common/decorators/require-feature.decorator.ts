import { SetMetadata } from '@nestjs/common';
import { PlanFeatureKey } from '../constants/plan-features.constant';

export const FEATURES_KEY = 'requiredFeatures';

/**
 * Declares which tier-gated feature(s) a route requires for the caller's active
 * organization. Enforced by FeatureGuard. Mirrors the @RequirePermissions
 * convention — use them together (permission = who, feature = which plan).
 */
export const RequireFeature = (...features: PlanFeatureKey[]) =>
  SetMetadata(FEATURES_KEY, features);
