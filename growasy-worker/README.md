# growasy-worker

Background job worker for Growasy — an Instagram Automation SaaS platform (ManyChat-style).
Plain Node.js + TypeScript, **not** a NestJS app: this is a lightweight BullMQ queue consumer
with no HTTP API surface of its own, so a full web framework would be unjustified weight.

This module currently ships the **platform foundation** (env validation, structured logging,
graceful shutdown, health probe) and the **`mail` queue processor** end-to-end. Other queues
(`instagram-sync`, `automation-execution`, `webhook-processing`) are reserved names — see
[API_CONTRACT.md](../API_CONTRACT.md) — and are deliberately not implemented yet; their modules
land in later passes.

## How it fits into the polyrepo

`growasy-api` (NestJS REST API) is a **producer-only** BullMQ client: when a user registers,
requests a password reset, etc., it enqueues a job onto a named Redis queue and returns
immediately — it never sends mail inline in a request. `growasy-worker` is the **consumer**:
it connects to the same Redis instance, picks up jobs from the `mail` queue, and does the
actual slow I/O (SMTP delivery).

The two repos are independently deployable and scaled, and they only agree on one thing: the
queue/job names and payload shapes documented in
[`../API_CONTRACT.md`](../API_CONTRACT.md#bullmq-queue-contract-growasy-worker-consumes-growasy-api-produces).
`src/queues/queue-names.constant.ts` in this repo is a byte-for-byte mirror of the same file in
`growasy-api` — if one changes, the other must change with it, or nothing connects.

```
growasy-api  --enqueue-->  Redis (BullMQ)  --consume-->  growasy-worker  --SMTP-->  inbox
```

## Architecture

- **Entry point**: `src/index.ts` — validates env, opens one shared `ioredis` connection
  (configured per BullMQ's requirements: `maxRetriesPerRequest: null`, `enableReadyCheck: false`),
  starts the `mail` queue `Worker`, starts the `/health` HTTP server, and wires
  `SIGTERM`/`SIGINT` to close both cleanly before exiting — required for zero-downtime deploys
  and rolling restarts.
- **Queue processor**: `src/queues/mail.processor.ts` — `createMailWorker()` builds a BullMQ
  `Worker` for the `mail` queue with concurrency 5. Dispatch logic (job name → handler) is
  factored into a standalone `dispatchMailJob()` function so it's unit-testable without a live
  Redis connection. Errors are **rethrown**, never swallowed — BullMQ's own retry/backoff
  (`attempts: 5` + exponential backoff, set as default job options by the producer) takes over
  from there; this worker does not duplicate or override that policy.
- **Mail**: `src/mail/mail.service.ts` wraps one pooled `nodemailer` SMTP transporter built
  from `SMTP_*` env vars and exposes one method per job type. Templates live in
  `src/mail/templates/*.template.ts` as pure functions returning `{ subject, html, text }`; a
  shared `renderLayout()` helper (`src/mail/templates/layout.ts`) keeps the branded HTML shell
  (table-based markup for email-client compatibility) consistent, and user-supplied strings
  (e.g. `firstName`) are HTML-escaped before interpolation.
- **Health**: `src/health/health-server.ts` — a dependency-free `http` server (no Express) with
  a single `GET /health` route that pings the shared Redis connection and returns
  `{ status: 'ok'|'degraded', redis: 'up'|'down' }` (200 / 503).
- **Config**: `src/config/env.ts` — a `zod` schema + `validateEnv()`, deliberately mirroring the
  *style* of `growasy-api/src/config/env.validation.ts` (not imported — separate repo, separate
  deploy).
- **Logging**: `src/logger/logger.ts` — a single process-wide `pino` logger; pretty-printed in
  development, raw NDJSON otherwise.

## Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `REDIS_HOST` | `localhost` | Same Redis instance `growasy-api` produces jobs to |
| `REDIS_PORT` | `6379` | |
| `REDIS_PASSWORD` | *(empty)* | |
| `SMTP_HOST` | `localhost` | Point at `mailhog` in local dev (see root `infra/docker-compose.yml`) |
| `SMTP_PORT` | `1025` | `465` is treated as implicit TLS; everything else negotiates STARTTLS or runs plaintext |
| `SMTP_USER` | *(empty)* | Omitted from transporter auth if blank |
| `SMTP_PASSWORD` | *(empty)* | |
| `MAIL_FROM` | `Growasy <no-reply@growasy.app>` | |
| `WEB_APP_URL` | `http://localhost:5173` | Defensive fallback only — job payloads already carry fully-formed URLs |
| `HEALTH_PORT` | `4100` | `/health` probe port; not part of the API contract (this service has no public API) |

See [`.env.example`](.env.example) for a ready-to-copy file.

## Local development

```bash
cp .env.example .env        # defaults work out of the box against local Redis + mailhog
npm install
npm run dev                 # tsx watch, restarts on file change
```

Fastest full-stack local setup (MySQL + Redis + Mailhog + api + worker + web behind one nginx
origin) is via the root `infra/docker-compose.yml` — see the root README. Mailhog's web UI
(`http://localhost:8025`) shows every email this worker sends in dev, no real SMTP provider
needed.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Watch-mode dev process (`tsx watch`) |
| `npm run build` | Compile to `dist/` (`tsc`) |
| `npm start` | Run the compiled build (`node dist/index.js`) |
| `npm run lint` | ESLint (+ Prettier), auto-fix |
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:cov` | Unit tests with coverage |

## Deployment

**Docker (recommended):**

```bash
docker build -t growasy-worker .
docker run --env-file .env growasy-worker
```

The image runs `node dist/index.js` as a non-root user with a built-in `HEALTHCHECK` against
`/health`. It exposes no ports other than the health probe — this is not a web service.

**Horizontal scaling**: this worker is a stateless, horizontally-scalable queue consumer. It
keeps no state outside Redis (BullMQ) and the outbound SMTP connection, so running any number of
replicas is safe — BullMQ distributes jobs across all connected workers on the same queue, each
job is processed exactly once (per its retry semantics), and there's no coordination needed
between replicas. Scale by running more containers/pods, not by raising in-process concurrency
past a sane per-instance number (default 5).

## Testing notes

- `mail.service.spec.ts` mocks `nodemailer.createTransport` and asserts `sendMail` is called with
  the correct `to`/`subject`/HTML (including the verification/reset URL and HTML-escaping of
  user input), without ever touching a real SMTP server.
- `mail.processor.spec.ts` tests `dispatchMailJob()` — the job-name → handler switch — against a
  fake `Job` and a mocked `MailService`, without needing a live Redis connection.
- `health-server.spec.ts` spins up the real `http.Server` on an ephemeral port with a fake
  `ioredis` client to exercise the actual request/response path.
- `env.spec.ts` covers defaulting, numeric coercion, and rejection of invalid `NODE_ENV`.

No test in this suite requires a live Redis or SMTP server, so CI stays fast; a Redis service
container would only be needed if an integration-level test against a real BullMQ queue is added
later.
