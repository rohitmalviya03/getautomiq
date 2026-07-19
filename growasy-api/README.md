# growasy-api

REST API for Growasy — an Instagram Automation SaaS platform (ManyChat-style). NestJS + Prisma + MySQL + Redis/BullMQ.

This module currently ships the **platform foundation** (config, security, logging, error handling, RBAC, Swagger, the full data model) and the **Auth module** end-to-end. Remaining modules (Instagram Accounts, Automation Engine, Contacts, Conversations, Analytics, Subscriptions, Admin Panel, Notifications, Audit Logs) build on this foundation and are delivered incrementally — see the root `README.md` for the overall roadmap.

## Architecture

- **Framework**: NestJS 10, modular monolith — each business domain is a self-contained Nest module (`src/modules/*`) with its own controller/service/DTOs, importable independently.
- **Data**: Prisma ORM against MySQL 8. Every table uses UUID primary keys, `createdAt`/`updatedAt`, and soft delete (`deletedAt`) where the domain calls for it. Full schema: [`prisma/schema.prisma`](prisma/schema.prisma).
- **Auth**: JWT access tokens (short-lived, 15m) + rotating refresh tokens (httpOnly cookie, 7d / 30d with "remember me"), with reuse detection — a refresh token used twice revokes the session. Sessions are DB-backed so logout/suspension take effect immediately instead of waiting for token expiry.
- **RBAC**: Every organization gets four seeded system roles (Owner/Admin/Editor/Viewer) with a permission catalog (`src/common/constants/permissions.constant.ts`). Routes declare requirements with `@RequirePermissions(...)`; `PermissionsGuard` resolves them against the caller's membership in the organization named by the `x-organization-id` header (supports users belonging to multiple orgs — agencies managing several client workspaces).
- **Background jobs**: `growasy-api` is a producer-only BullMQ client (`src/queues`) — it enqueues jobs (e.g. verification emails) onto Redis queues that `growasy-worker` consumes. The API never does slow I/O (sending mail, calling the Meta API) inline in a request.
- **Errors & responses**: a global `AllExceptionsFilter` normalizes every error (Nest HTTP exceptions, Prisma errors, unknown errors) into `{ success: false, error: { code, message } }`; a global `ResponseInterceptor` wraps every success into `{ success: true, data, meta? }`. Clients never need to branch on response shape per-endpoint.

## Getting started

```bash
cp .env.example .env        # fill in secrets — JWT_ACCESS_SECRET/JWT_REFRESH_SECRET must be 32+ chars
npm install
npx prisma generate
npx prisma migrate deploy   # applies prisma/migrations/*
npx prisma db seed          # seeds the permission catalog + billing plans
npm run start:dev
```

The API listens on `http://localhost:4000`. Swagger/OpenAPI docs (non-production only) are at `http://localhost:4000/docs`.

Fastest full-stack local setup (MySQL + Redis + Mailhog + api + worker + web behind one nginx origin) is via the root `infra/docker-compose.yml` — see the root README.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run start:dev` | Watch-mode dev server |
| `npm run build` | Compile to `dist/` |
| `npm run lint` | ESLint (+ Prettier) |
| `npm test` | Unit tests (Jest) |
| `npm run test:e2e` | End-to-end tests against a real MySQL + Redis (see CI workflow for a working example with service containers) |
| `npx prisma studio` | Browse the database |
| `npx prisma migrate dev` | Create + apply a new migration while developing |

## API contract (Auth module)

All routes are versioned under `/api/v1`. Every response is wrapped: `{ success, data, meta?, timestamp }` on success, `{ success: false, error: { code, message }, timestamp, path }` on failure.

| Method & Path | Auth | Description |
| --- | --- | --- |
| `POST /api/v1/auth/register` | Public | Create user + a default organization (seeded roles, 14-day Starter trial), auto-login |
| `POST /api/v1/auth/login` | Public | Email/password login, sets refresh cookie |
| `POST /api/v1/auth/refresh` | Public (cookie) | Rotates the refresh token, issues a new access token |
| `POST /api/v1/auth/logout` | Bearer | Revokes the current session |
| `POST /api/v1/auth/logout-all` | Bearer | Revokes every session for the user |
| `GET /api/v1/auth/sessions` | Bearer | Lists active sessions/devices |
| `DELETE /api/v1/auth/sessions/:id` | Bearer | Revokes one session remotely |
| `POST /api/v1/auth/forgot-password` | Public | Always returns 200; enqueues a reset email if the account exists |
| `POST /api/v1/auth/reset-password` | Public | Consumes the reset token, revokes all sessions |
| `POST /api/v1/auth/verify-email` | Public | Consumes the verification token, activates the account |
| `POST /api/v1/auth/resend-verification` | Bearer | Re-sends the verification email |
| `GET /api/v1/users/me` | Bearer | Profile + organization memberships |
| `PATCH /api/v1/users/me` | Bearer | Update name/avatar |
| `GET /api/v1/organizations/me` | Bearer | Organizations the caller belongs to |

Full request/response schemas are in Swagger (`/docs`) once the server is running — that's the source of truth for `growasy-web` API client generation.

## Deployment

**Docker (recommended):**

```bash
docker build -t growasy-api .
docker run -p 4000:4000 --env-file .env growasy-api
```

The image runs `node dist/main.js` as a non-root user with a built-in `HEALTHCHECK`. Run `npx prisma migrate deploy` as a release step before starting new containers (the compose file in `infra/` does this via its `command:` override).

**PM2 (single VPS, no container orchestration yet):**

```bash
npm run build
pm2 start ecosystem.config.js --env production
```

Runs in Node cluster mode across all CPU cores — safe because the API is stateless (sessions live in MySQL/Redis, not process memory), so PM2/Docker/k8s can all scale it horizontally without sticky sessions.

**Reverse proxy / TLS**: see `infra/nginx/prod.conf.template` (Let's Encrypt via certbot, HSTS, upstream pointed at however many API instances you run).

## Security notes

- Passwords: bcrypt, configurable cost factor (`BCRYPT_SALT_ROUNDS`, default 12).
- Login lockout: 5 failed attempts locks the account for 15 minutes.
- Refresh token reuse detection: a stolen-and-replayed refresh token revokes the whole session instead of silently succeeding.
- Rate limiting: global `ThrottlerModule` (`THROTTLE_LIMIT` requests / `THROTTLE_TTL_SECONDS`).
- `helmet`, `compression`, strict CORS allowlist (`CORS_ORIGINS`), cookies are `httpOnly` + `secure` in production.
- All Prisma queries are parameterized (no raw string interpolation) — SQL injection is not a valid attack surface here by construction.
- `npm audit` currently reports transitive vulnerabilities in `multer`/`qs` (via `@nestjs/platform-express`'s Express 4 dependency) and in `webpack`/`tmp` (via `@nestjs/cli`, build-time tooling only). Fixing them requires the NestJS 11 major upgrade (`npm audit fix --force`), which is a deliberate framework-wide decision to make separately, not something to pull in silently mid-feature-build. None are reachable in this app's current runtime surface (no file-upload endpoints yet; the CLI/webpack ones never run in production).
