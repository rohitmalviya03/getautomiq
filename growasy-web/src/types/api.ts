/**
 * Shapes mirrored from `API_CONTRACT.md` and the growasy-api DTOs/services.
 * Keep in sync with growasy-api/src/modules/{auth,users,organizations}.
 */

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
  timestamp: string;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
  };
  timestamp: string;
  path: string;
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

export interface AuthTokens {
  accessToken: string;
  /** Duration string as configured server-side, e.g. "15m" — not an epoch/ISO value. */
  expiresIn: string;
}

/** The `user` object returned by /auth/register and /auth/login. */
export interface AuthUserView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isEmailVerified: boolean;
  status: string;
  organizationId: string;
  /** Only populated after GET /users/me (login/register omit it). Gates the admin panel. */
  isSuperAdmin?: boolean;
}

/** Normalized organization shape used throughout growasy-web. */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface RegisterResponse {
  user: AuthUserView;
  tokens: AuthTokens;
}

export interface LoginResponse {
  user: AuthUserView;
  organizations: Array<{ id: string; name: string; slug: string; role: string }>;
  tokens: AuthTokens;
}

export interface RefreshResponse {
  tokens: AuthTokens;
}

export interface MessageResponse {
  message: string;
}

/** Fields shared by GET /users/me and PATCH /users/me. */
export interface UserPublicProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  status: string;
  isEmailVerified: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
}

/** GET /users/me — PATCH /users/me returns just UserPublicProfile (no organizations). */
export interface UserProfile extends UserPublicProfile {
  organizations: Array<{
    organization: {
      id: string;
      name: string;
      slug: string;
      [key: string]: unknown;
    };
    role: { id: string; name: string; slug: string };
  }>;
}

export type InstagramAccountStatus =
  | 'CONNECTED'
  | 'NEEDS_RECONNECT'
  | 'TOKEN_EXPIRED'
  | 'REVOKED'
  | 'DISCONNECTED'
  | 'ERROR';

/** GET /instagram/accounts — public fields only, never includes access tokens. */
export interface InstagramAccount {
  id: string;
  instagramBusinessId: string;
  /** null under the Instagram Login flow; only set by the legacy FB-Page flow. */
  facebookPageId: string | null;
  username: string;
  name: string | null;
  profilePictureUrl: string | null;
  status: InstagramAccountStatus;
  connectedByUserId: string;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /instagram/oauth/url */
export interface OAuthUrlResponse {
  url: string;
  state: string;
}

/** GET /instagram/accounts/:id/media — a post or reel for the automation picker. */
export interface InstagramMedia {
  id: string;
  caption: string | null;
  mediaType: string; // IMAGE | VIDEO | CAROUSEL_ALBUM
  mediaProductType: string | null; // FEED | REELS | STORY
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
}

// ---- Automations (comment → DM rules) -----------------------------------

export type TriggerMatchType = 'ANY' | 'EXACT' | 'STARTS_WITH' | 'CONTAINS' | 'REGEX';
export type AutomationStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
/** Trigger source: a post/reel comment, a direct message, or a story reply. */
export type TriggerType = 'COMMENT_KEYWORD' | 'DM_KEYWORD' | 'STORY_REPLY' | 'STORY_MENTION';

/** Flattened rule shape returned by /automations/rules. */
export interface AutomationRule {
  id: string;
  instagramAccountId: string;
  name: string;
  status: AutomationStatus;
  triggerTypes: TriggerType[];
  matchType: TriggerMatchType;
  keywords: string[];
  dmText: string;
  replyText: string | null;
  /** Posts the rule is limited to. Empty = every post on the account. */
  mediaIds: string[];
  /** @deprecated First entry of `mediaIds`, kept for older callers. */
  mediaId: string | null;
  maxDmsPerUserPer24h: number | null;
  /** Lead-capture flow: parse the contact's next DM reply as an email. */
  collectEmail: boolean;
  emailSuccessMessage: string | null;
  emailFailureMessage: string | null;
  triggeredCount: number;
  createdAt: string;
  updatedAt: string;
}

/** GET /analytics/overview */
export interface AnalyticsOverview {
  rangeDays: number;
  totals: {
    commentsProcessed: number;
    matched: number;
    dmsSent: number;
    contactsReached: number;
    matchRate: number; // 0..1
    dmDeliveryRate: number; // 0..1
  };
  dmsPerDay: { date: string; count: number }[];
  outcomeBreakdown: { outcome: string; count: number }[];
  topRules: { ruleId: string | null; name: string; dmsSent: number }[];
  usage: { dmsUsedThisMonth: number; dmsLimit: number };
}

/** A CRM contact (lead) captured when an automation engages someone. */
export interface Contact {
  id: string;
  instagramAccountId: string;
  instagramScopedId: string;
  username: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  isSubscribed: boolean;
  lastInteractionAt: string | null;
  createdAt: string;
}

/** POST/PATCH /automations/rules body. */
export interface AutomationRulePayload {
  instagramAccountId?: string;
  name: string;
  triggerTypes?: TriggerType[];
  matchType: TriggerMatchType;
  keywords: string[];
  dmText: string;
  replyText?: string;
  mediaIds?: string[];
  maxDmsPerUserPer24h?: number;
  collectEmail?: boolean;
  emailSuccessMessage?: string;
  emailFailureMessage?: string;
  status?: AutomationStatus;
}

// ---- Link tracking -------------------------------------------------------

/** A trackable short link. */
export interface TrackedLink {
  id: string;
  slug: string;
  shortUrl: string;
  destinationUrl: string;
  title: string | null;
  instagramAccountId: string | null;
  clickCount: number;
  uniqueClickCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /links/:id/stats — a link plus its click analytics. */
export interface TrackedLinkStats extends TrackedLink {
  rangeDays: number;
  clicksInRange: number;
  clicksPerDay: { date: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
}

/** POST /links body. */
export interface CreateLinkPayload {
  destinationUrl: string;
  title?: string;
  slug?: string;
  instagramAccountId?: string;
}

/** PATCH /links/:id body. */
export interface UpdateLinkPayload {
  destinationUrl?: string;
  title?: string;
  isActive?: boolean;
}

/** GET /auth/sessions */
export interface SessionView {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  isRememberMe: boolean;
  lastUsedAt: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}
