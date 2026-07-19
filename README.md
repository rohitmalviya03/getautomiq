# Growasy — Instagram Automation SaaS

A ManyChat-style platform: connect Instagram Business accounts, build visual automation
workflows (keyword-triggered comment replies and DMs), manage contacts/conversations,
track analytics, and run it all as a multi-tenant SaaS with subscriptions, RBAC, and an
admin panel.

This is being built as an enterprise-grade, production-oriented codebase — not a demo —
designed to eventually support 100,000+ users and millions of automation events.
Modules are delivered incrementally, each one complete (schema + API + tests + docs +
deploy instructions) before the next starts.

## Repository layout (polyrepo)

Each service is an independently deployable repo with its own toolchain, CI, and
Dockerfile. They share nothing at the code level except a documented contract — see
[`API_CONTRACT.md`](API_CONTRACT.md).

| Repo | Stack | Purpose |
| --- | --- | --- |
| [`growasy-api`](growasy-api/) | NestJS, Prisma, MySQL, Redis/BullMQ (producer), JWT/Passport | REST API — the source of truth for the data model and business logic |
| [`growasy-worker`](growasy-worker/) | Node.js, TypeScript, BullMQ (consumer), Prisma, nodemailer | Background job processing: transactional email, plus the Instagram comment→DM automation engine (`webhook-processing` + `automation-execution` queues). `instagram-sync` remains a reserved queue name for an upcoming module. |
| [`growasy-web`](growasy-web/) | React, Vite, TypeScript, TailwindCSS, TanStack Query, Zustand, React Hook Form + Zod, Framer Motion | The dashboard SPA end users interact with |
| [`infra`](infra/) | Docker Compose, nginx | Local/staging orchestration wiring all of the above together, plus a production nginx reference config |

## What's built so far

**Foundation (all modules build on this):**
- Full Prisma/MySQL schema covering every domain in the product spec — Users,
  Organizations, Roles/Permissions, Instagram Accounts, Automation Rules/Triggers/Actions
  (+ templates + execution logs), Contacts/Tags/Conversations/Messages, Webhook Events,
  API/Activity/Audit logs, Plans/Subscriptions/Invoices/Payments/Usage Tracking,
  Notifications, System Settings/Feature Flags, Support Tickets. See
  [`growasy-api/prisma/schema.prisma`](growasy-api/prisma/schema.prisma).
- Global API infrastructure: config validation (zod), structured logging (pino), a global
  exception filter + response envelope, Swagger/OpenAPI, helmet/rate-limiting/CORS,
  cursor-based pagination helper.
- BullMQ queue contract between `growasy-api` (producer) and `growasy-worker` (consumer).

**Auth module (complete):** registration (auto-provisions an organization with seeded
RBAC roles and a Starter trial subscription), login with brute-force lockout, JWT access
+ rotating refresh tokens with reuse detection, remember-me, session management
(list/revoke devices, logout-everywhere), email verification, password reset, and a
permissions guard for the rest of the platform to build on
(`@RequirePermissions(...)` + `x-organization-id` header for multi-org/agency support).
Unit + e2e tests included.

**Users & Organizations (minimal, in support of Auth):** profile view/edit, list/get
organizations the caller belongs to.

**`growasy-worker` (complete for this phase):** a standalone BullMQ consumer for the
`mail` queue — sends verification, password-reset, and welcome emails via nodemailer
with real branded HTML/text templates. Dependency-free `/health` endpoint for container
orchestration. The `instagram-sync`, `automation-execution`, and `webhook-processing`
queues are reserved names only — no processors yet, they arrive with the modules that
need them.

**`growasy-web` (complete for this phase):** the full auth flow (login, register,
forgot/reset password, verify email) wired against the real API contract — client-side
Zod validation mirrors the backend's `class-validator` rules exactly, not approximated.
An authenticated dashboard shell: sidebar, organization switcher (multi-org/agency
support, sends `x-organization-id` on every call already), dark/light mode, profile
editing, session management (list/revoke devices, logout-everywhere). Deliberately does
*not* have nav links or pages for modules that don't exist on the backend yet
(Instagram accounts, automations, contacts, analytics, billing) — no fake data, no dead
links.

## What's next

Everything else in the product spec — Instagram OAuth/account connection, the automation
builder (triggers/actions/visual workflow), comment/DM webhook processing, contacts,
conversations, analytics dashboards, subscription billing (payment gateway integration
was explicitly deferred — the data model exists but no processor is wired up yet), the
admin panel, and notifications — is built module-by-module from here, each following the
same bar: schema → API → tests → docs → deploy instructions, no placeholder code.

## Running everything locally

```bash
cd infra
cp .env.example .env   # if present; otherwise the defaults in docker-compose.yml are fine for local dev
docker compose up --build
```

This starts MySQL, Redis, Mailhog (catches outbound email so you don't need a real SMTP
provider in dev — UI at http://localhost:8025), `growasy-api`, `growasy-worker`,
`growasy-web`, and an nginx reverse proxy fronting everything at
**http://localhost:8080**. Swagger docs at `http://localhost:8080/docs`.

Alternatively, run any single service on its own — each repo's README has standalone
`npm install && npm run start:dev`-style instructions and its own `.env.example`.

## Cross-repo contract

[`API_CONTRACT.md`](API_CONTRACT.md) documents the REST API surface, response envelope,
BullMQ queue/job names and payloads, and local ports. Treat it as the seam between
repos — when a new backend module ships, extend that document before frontend/worker
work depends on it.

## Conventions used throughout

- **Data**: UUID primary keys, `createdAt`/`updatedAt` on every table, soft delete
  (`deletedAt`) where the domain calls for it, explicit join tables (never Prisma's
  implicit many-to-many) so relations stay auditable and soft-deletable.
- **Multi-tenancy**: everything hangs off `Organization`; a user can belong to multiple
  organizations (agencies managing several client workspaces) and switches between them
  via the `x-organization-id` header, validated server-side against real membership on
  every request — never trust a client-supplied org id without that check.
- **RBAC**: four system roles seeded per organization (Owner/Admin/Editor/Viewer) against
  a shared permission catalog; routes declare requirements, a guard resolves them.
- **Errors & responses**: one envelope shape everywhere (`{success, data|error}`), so
  no client (web or worker) needs endpoint-specific parsing.
- **Background work**: anything slow or third-party (email, future: Meta Graph API calls)
  goes through a BullMQ queue, never inline in a request — the API stays fast and
  horizontally scalable regardless of queue backlog.
