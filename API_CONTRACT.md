# Growasy cross-repo contract

Polyrepo: `growasy-api` (NestJS REST API + Prisma/MySQL, source of truth for the data
model), `growasy-worker` (BullMQ background workers), `growasy-web` (React/Vite
frontend). This document is the seam between them — the API is already built;
worker and web are built against what's documented here.

## Response envelope (growasy-api)

Every REST response is wrapped by a global interceptor/filter — clients should
never need endpoint-specific parsing:

```json
// success
{ "success": true, "data": { ... }, "meta": { ... }, "timestamp": "2026-07-16T12:00:00.000Z" }
// failure
{ "success": false, "error": { "code": "STRING_CODE", "message": "human readable" }, "timestamp": "...", "path": "/api/v1/..." }
```

HTTP status codes are meaningful (200/201/400/401/403/404/409/429/500) — don't only
branch on `success`.

## Auth contract (implemented, stable)

Base path: `/api/v1`. Bearer token in `Authorization: Bearer <accessToken>` for
protected routes. Refresh token lives in an `httpOnly` cookie (`growasy_rt`,
`path=/`) set automatically by `/auth/register`, `/auth/login`, `/auth/refresh` —
browser clients don't touch it directly, just call `/auth/refresh` with
`credentials: 'include'` when the access token expires (15 min default).

| Method & Path | Auth | Body | Notes |
| --- | --- | --- | --- |
| `POST /auth/register` | Public | `{ email, password, firstName, lastName, organizationName? }` | Auto-login; returns `{ user, tokens }` |
| `POST /auth/login` | Public | `{ email, password, rememberMe? }` | Returns `{ user, organizations[], tokens }` |
| `POST /auth/refresh` | Cookie | — | Returns `{ tokens: { accessToken, expiresIn } }` |
| `POST /auth/logout` | Bearer | — | |
| `POST /auth/logout-all` | Bearer | — | |
| `GET /auth/sessions` | Bearer | — | Active devices/sessions list |
| `DELETE /auth/sessions/:id` | Bearer | — | |
| `POST /auth/forgot-password` | Public | `{ email }` | Always 200, never reveals if the account exists |
| `POST /auth/reset-password` | Public | `{ token, newPassword }` | |
| `POST /auth/verify-email` | Public | `{ token }` | |
| `POST /auth/resend-verification` | Bearer | — | |
| `GET /users/me` | Bearer | — | `{ id, email, firstName, lastName, avatarUrl, status, isEmailVerified, createdAt, organizations[] }` |
| `PATCH /users/me` | Bearer | `{ firstName?, lastName?, avatarUrl? }` | |
| `GET /organizations/me` | Bearer | — | `[{ organization: {...}, role: { id, name, slug } }]` |
| `GET /organizations/:id` | Bearer | — | 403 unless caller is a member |
| `GET /organizations/me/usage` | Bearer + `x-organization-id` | — | Plan usage vs limits for the active org (below) |
| `GET /contacts` | Bearer + `x-organization-id` (`contact:read`) | query: `instagramAccountId?`, `search?`, `cursor?`, `limit?` | Cursor-paginated `{ data:[Contact], meta:{ nextCursor, limit, hasMore } }` |
| `GET /contacts/:id` | Bearer + `x-organization-id` (`contact:read`) | — | One contact |
| `GET /contacts/export.csv` | Bearer + `x-organization-id` (`contact:export`) | query: `instagramAccountId?` | Raw `text/csv` attachment (not the JSON envelope) |
| `GET /analytics/overview` | Bearer + `x-organization-id` (`analytics:read`) | query: `days?` (1-90, default 30) | `{ rangeDays, totals:{ commentsProcessed, matched, dmsSent, contactsReached, matchRate, dmDeliveryRate }, dmsPerDay:[{date,count}], outcomeBreakdown:[{outcome,count}], topRules:[{ruleId,name,dmsSent}], usage:{dmsUsedThisMonth,dmsLimit} }` — aggregated from `ProcessedComment` + `UsageTracking` |

`GET /organizations/me/usage` returns `{ planName, accountsUsed, accountsLimit, activeRulesUsed,
activeRulesLimit, dmsUsedThisMonth, dmsLimit, billingCycleAnchor, period }`. A limit of `-1`
means unlimited; `period` is the `"YYYY-MM"` usage window. Powers the dashboard usage widget.

`GET /health` is the one exception to the `/api/v1` base path — it's version-neutral
(`/api/health`, no `/v1`) since health checks/load balancers shouldn't need to track API
versions. Returns `{ status, database, uptime }`.

## Instagram Accounts contract (implemented, stable)

Uses the **"Instagram API with Instagram Login"** flow — connects an Instagram
Business/Creator account **directly**, no Facebook Page required. (The earlier
Facebook-Login/Page-selection flow was removed.)

All routes require Bearer auth **plus** the `x-organization-id` header, and are
permission-gated (`instagram_account:connect` / `:read` / `:disconnect` — Owner/Admin
have all three, Editor/Viewer have `:read` only).

Two-step connect flow — one login connects exactly one account (no page selection):

| Method & Path | Body | Returns |
| --- | --- | --- |
| `GET /instagram/oauth/url` | optional query `?accountId=<id>` | `{ url, state }` — redirect the browser to `url` (points at `https://www.instagram.com/oauth/authorize`); `state` is a signed 10-min CSRF token already embedded in the url. Pass `accountId` to **reconnect** an existing account: the callback then requires the same Instagram identity to return, and refreshes that row instead of creating a new one. |
| `POST /instagram/oauth/callback` | `{ code, state }` (from Instagram's redirect query params) | **The connected account directly** (public account fields below). The server does the full exchange server-side: code → short-lived token → long-lived (~60-day) token → profile → save. |

Management:

| Method & Path | Returns |
| --- | --- |
| `GET /instagram/accounts` | Array of connected accounts (never includes access tokens) |
| `GET /instagram/accounts/:id` | One account |
| `DELETE /instagram/accounts/:id` | `{ disconnected: true }` (soft delete, status → DISCONNECTED) |
| `POST /instagram/accounts/:id/sync` | Account with refreshed profile fields from the Graph API; a dead token flips status to ERROR |

Account object shape: `{ id, instagramBusinessId, facebookPageId (null in this flow),
username, name, profilePictureUrl, status:
'CONNECTED'|'NEEDS_RECONNECT'|'TOKEN_EXPIRED'|'REVOKED'|'DISCONNECTED'|'ERROR',
connectedByUserId, lastSyncedAt, createdAt, updatedAt }`.

`NEEDS_RECONNECT` is set proactively by a daily cron in `growasy-api` when a token
is within 3 days of expiry, and reactively by `growasy-worker` when a DM send hits a
dead token (Graph code 190). The web app shows a **Reconnect** button for any
non-`CONNECTED` account, which calls `GET /instagram/oauth/url?accountId=<id>`.

OAuth scopes requested: `instagram_business_basic`, `instagram_business_manage_messages`,
`instagram_business_manage_comments` (overridable via `META_OAUTH_SCOPES`). Token
exchange hosts: `api.instagram.com/oauth/access_token` (code→token) and
`graph.instagram.com` (long-lived token + `/me` profile).

Error cases the frontend must handle: **503** when
`META_APP_ID`/`META_APP_SECRET`/`META_REDIRECT_URI` env vars are unset (show a "not
configured" callout, not a crash); **403** when the plan's Instagram-account limit is
reached (message includes the plan name — show an upgrade prompt); **409** when the
account is already connected (to this or another workspace); **401** on
expired/invalid `state` (restart the flow); **502** when the Instagram API itself errors.

The frontend redirect route is `META_REDIRECT_URI` (default
`/settings/instagram/callback` in the web app) — it receives `?code=...&state=...` from
Instagram and must POST them to `/instagram/oauth/callback`. This exact URL must also be
registered in the Meta app's Instagram-login OAuth redirect URIs.

## Instagram webhook contract (Meta → growasy-api, machine-to-machine)

Version-neutral, unauthenticated endpoints at `/webhook/instagram` (no `/v1`, not in
Swagger). Security is the verify token + HMAC signature, not Bearer auth. This is the
**fast path only** — the API does no DB or Meta API work here; it validates and enqueues.

| Method & Path | Purpose | Behavior |
| --- | --- | --- |
| `GET /webhook/instagram` | Meta verification handshake | Reads `hub.mode`/`hub.verify_token`/`hub.challenge`. If `hub.verify_token` equals `META_WEBHOOK_VERIFY_TOKEN` and mode is `subscribe`, echoes `hub.challenge` as `text/plain`; otherwise **403**. |
| `POST /webhook/instagram` | Event receiver | Verifies the `X-Hub-Signature-256` HMAC (SHA256 of the raw body with `INSTAGRAM_APP_SECRET`); **401** if invalid. Otherwise enqueues one `webhook-processing` job per comment change and returns **200** `{ received: true }` immediately. |

## Instagram comment → DM automation contract (implemented)

Rule CRUD lives in `growasy-api` (`/automations/rules`, Bearer + `x-organization-id`,
permission-gated); the **execution engine lives entirely in `growasy-worker`** across the
two queues below. `growasy-api` never runs automation logic in-process — it only produces
`webhook-processing` jobs. The worker reads accounts/rules and writes the
`processed_comments` ledger via its own Prisma client against the same MySQL database.

Multi-org requests (everything outside Auth/Users/Organizations, once those
modules exist) require an `x-organization-id` header naming the active
organization; `growasy-web` should let the user pick from `organizations[]`
returned by login/`/users/me` and persist the selection.

Full live schema (source of truth once the server is running): `growasy-api`
Swagger UI at `/docs`.

## BullMQ queue contract (growasy-worker consumes; growasy-api produces)

Redis connection: `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`, same instance
for both services. Queue/job names must match exactly — defined once in
`growasy-api/src/queues/queue-names.constant.ts`, mirror in
`growasy-worker/src/queues/queue-names.constant.ts`.

Queue `mail`:

| Job name | Payload | Expected behavior |
| --- | --- | --- |
| `send-verification-email` | `{ toEmail, firstName, verificationUrl }` | Send a transactional email with a link to `verificationUrl` (the web app's `/verify-email?token=...` route) |
| `send-password-reset-email` | `{ toEmail, firstName, resetUrl }` | Send a transactional email with a link to `resetUrl` (`/reset-password?token=...`) |
| `send-welcome-email` | `{ toEmail, firstName }` | Sent once, right after successful email verification |

Queue `webhook-processing` (produced by `growasy-api`'s webhook receiver, consumed by
`growasy-worker` — stage 1: dedup + rule matching):

| Job name | Payload | Expected behavior |
| --- | --- | --- |
| `process-instagram-comment` | `{ commentId, mediaId, commentText, commenterId, commenterUsername, instagramBusinessAccountId, rawEventTimestamp }` | Dedup on `commentId` via `processed_comments`; resolve the CONNECTED account by `instagramBusinessAccountId`; skip self-comments and non-CONNECTED accounts; find the first ACTIVE `COMMENT_KEYWORD` rule whose keyword trigger (and optional `mediaId` filter) matches; **on match, upsert a `Contact` (CRM lead)** and enqueue `execute-automation` with `source: comment`. All terminal outcomes write a `processed_comments` row (idempotent). |
| `process-instagram-message` | `{ messageId, text, senderId, isStoryReply, instagramBusinessAccountId, rawEventTimestamp }` | Incoming DM / story reply (Instagram `messages` field). Dedup on `messageId`; match ACTIVE `DM_KEYWORD` rules; on match upsert a `Contact` and enqueue `execute-automation` with `source: message` (the DM is sent to `recipient.id = senderId`, not a comment). |

Job id is `wh-<commentId>` for queue-level dedup. Producer default job options:
`attempts: 4`, exponential backoff.

Queue `automation-execution` (produced **and** consumed by `growasy-worker` — stage 2:
DM send):

| Job name | Payload | Expected behavior |
| --- | --- | --- |
| `execute-automation` | `{ ruleId, source, eventId, commenterId, recipientId, mediaId, instagramAccountId }` | `source` is `comment` or `message`. Enforce the per-commenter 24h DM rate limit + the org's **monthly DM plan limit** (`plan.limits.maxMessagesPerMonth` vs `UsageTracking(MESSAGES_SENT, "YYYY-MM")`); decrypt the account token; run the rule's actions — `SEND_DM` sends via `recipient.comment_id = eventId` (comment source) or `recipient.id = recipientId` (message source); `REPLY_COMMENT` (public reply) only runs for `comment` source. Each sent DM atomically increments `UsageTracking`. Monthly limit hit → outcome `plan_limit_reached`, DM skipped, one BILLING `Notification` per org per month. Success → `dm_sent`. Dead token (Graph code 190) → account `NEEDS_RECONNECT`, no retry. Other errors → rethrow. The account is subscribed to `comments,messages` webhook fields on connect. |

Job id is `ax-<commentId>-<ruleId>`. Queue default job options: `attempts: 3`,
exponential backoff. Structured pino log per outcome (`duplicate` / `no_match` /
`matched` / `rate_limited` / `plan_limit_reached` / `dm_sent` / `needs_reconnect` /
`failed`) with `commentId`, `accountId`, `ruleId`, `organizationId`, `outcome`, `timestamp`.

## Plan limits & usage enforcement

Limits live on each org's `Subscription → Plan.limits` (JSON: `maxInstagramAccounts`,
`maxAutomations`, `maxMessagesPerMonth`, …; `-1` = unlimited). Enforcement is centralized
in `growasy-api`'s `PlanLimitsService` (the worker mirrors the DM check with its own Prisma
helper). All limit rejections use the standard error envelope with a machine-readable `code`:

| Trigger | HTTP | `error.code` |
| --- | --- | --- |
| Connecting an account over the account cap (`POST /instagram/oauth/callback`) | 403 | `PLAN_ACCOUNT_LIMIT_REACHED` |
| Creating an ACTIVE rule over the automation cap (`POST /automations/rules`) | 403 | `PLAN_RULE_LIMIT_REACHED` |
| Calling a route gated by `@RequireFeature(...)` on a tier that lacks it | 403 | `PLAN_FEATURE_LOCKED` |

Feature gating uses `@RequireFeature(feature)` + the global `FeatureGuard` (mirrors
`@RequirePermissions`); tier→feature map: `analytics` (PROFESSIONAL+), `white_label` (AGENCY+).
Monthly DM usage resets implicitly (the `"YYYY-MM"` period key), and a daily `@Cron`
(`BillingCycleCron`) rolls each subscription's `currentPeriodStart/End` forward once its period
ends. No subscription on file (fresh dev org) ⇒ limits are **not** enforced.

`growasy-worker` requires two extra env vars for this pipeline: `DATABASE_URL` (same
MySQL as the API) and `ENCRYPTION_KEY` (must equal the API's), plus optional
`META_GRAPH_API_VERSION` / `INSTAGRAM_GRAPH_BASE`.

Reserved (not yet produced): `instagram-sync`.

Local dev: `growasy-api` and `growasy-worker` both point `SMTP_HOST`/`SMTP_PORT`
at the `mailhog` service in `infra/docker-compose.yml` (web UI at
`http://localhost:8025`) — no real mail provider needed to develop against.

## Prisma schema (data model growasy-web should expect)

`growasy-api/prisma/schema.prisma` is the single source of truth for the data
model across the whole platform (Users, Organizations, Roles/Permissions,
InstagramAccounts, AutomationRules/Triggers/Actions, Contacts, Conversations,
Messages, WebhookEvents, Subscriptions/Plans/Invoices, Notifications,
AuditLogs, etc.) — read it directly rather than having entities re-described
here; it will drift otherwise. Conventions: UUID (`char(36)`) primary keys,
`createdAt`/`updatedAt` on everything, `deletedAt` soft-delete where the domain
calls for it.

## Environment / ports (local dev)

| Service | Port | Notes |
| --- | --- | --- |
| `growasy-api` | 4000 | `growasy-api/.env.example` |
| `growasy-worker` | — | no HTTP port, background process only |
| `growasy-web` | 5173 (Vite dev) / 80 (built, served by its own nginx container) | `VITE_API_BASE_URL` build/env arg points at `/api/v1` behind the shared nginx, or `http://localhost:4000/api/v1` when running `growasy-api` directly |
| `mysql` | 3306 | |
| `redis` | 6379 | |
| `mailhog` | 1025 (SMTP) / 8025 (web UI) | |
| `infra` nginx | 8080 | fronts both `web` and `api` on one origin so cookies behave like production |
