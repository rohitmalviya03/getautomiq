# Deploying Automiq to Railway (API + Worker + MySQL + Redis) + Vercel (Web)

Testing / staging deployment. The **web** goes on Vercel (static), everything
stateful and long-running goes on **Railway**.

```
Vercel:   web  ──────────────►  Railway: api ──► MySQL
                                          └────► Redis ──► worker
```

`api` and `worker` share the **same** MySQL + Redis. `web` only talks to `api`
over HTTPS.

---

## 0) Generate your secrets first

Run locally and keep the output handy (you'll paste into Railway):

```bash
node -e "const c=require('crypto');\
console.log('JWT_ACCESS_SECRET =', c.randomBytes(32).toString('base64url'));\
console.log('JWT_REFRESH_SECRET=', c.randomBytes(32).toString('base64url'));\
console.log('ENCRYPTION_KEY    =', c.randomBytes(32).toString('hex'));\
console.log('META_WEBHOOK_VERIFY_TOKEN =', c.randomBytes(12).toString('hex'));"
```

> ⚠️ **`ENCRYPTION_KEY` must be identical in `api` and `worker`** (it decrypts the
> same Instagram tokens). Copy the *same* value into both services.

---

## 1) Create the project + databases on Railway

1. **railway.app → New Project → Deploy from GitHub repo →** `getautomiq`.
2. **+ New → Database → Add MySQL**  (service name: `MySQL`)
3. **+ New → Database → Add Redis**  (service name: `Redis`)

Railway auto-exposes connection variables you'll reference with `${{ ... }}`.

---

## 2) API service

- **+ New → GitHub Repo → getautomiq**, then in the service's **Settings**:
  - **Root Directory:** `growasy-api`
  - Railway auto-detects the `Dockerfile`.
- Add a **public domain** (Settings → Networking → Generate Domain). This is your
  API URL, e.g. `https://api-production-xxxx.up.railway.app`.

### API → Variables

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `API_PREFIX` | `api` |
| `API_VERSION` | `v1` |
| `DATABASE_URL` | `${{MySQL.MYSQL_URL}}` |
| `REDIS_HOST` | `${{Redis.REDISHOST}}` |
| `REDIS_PORT` | `${{Redis.REDISPORT}}` |
| `REDIS_PASSWORD` | `${{Redis.REDISPASSWORD}}` |
| `JWT_ACCESS_SECRET` | *(generated)* |
| `JWT_REFRESH_SECRET` | *(generated)* |
| `JWT_ACCESS_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `JWT_REFRESH_REMEMBER_EXPIRES_IN` | `30d` |
| `BCRYPT_SALT_ROUNDS` | `12` |
| `ENCRYPTION_KEY` | *(generated — SAME in worker)* |
| `CORS_ORIGINS` | *(your Vercel URL, e.g. `https://automiq.vercel.app`)* |
| `WEB_APP_URL` | *(same Vercel URL)* |
| `META_REDIRECT_URI` | `<vercel-url>/settings/instagram/callback` |
| `INSTAGRAM_APP_ID` | *(Meta dashboard → Instagram → API setup)* |
| `INSTAGRAM_APP_SECRET` | *(Meta dashboard)* |
| `META_WEBHOOK_VERIFY_TOKEN` | *(generated)* |
| `META_GRAPH_API_VERSION` | `v20.0` |
| `THROTTLE_TTL_SECONDS` | `60` |
| `THROTTLE_LIMIT` | `100` |
| `EMAIL_VERIFICATION_TOKEN_TTL_HOURS` | `24` |
| `PASSWORD_RESET_TOKEN_TTL_MINUTES` | `60` |
| `MAIL_FROM` | `Automiq <no-reply@automiq.app>` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | *(your SMTP — optional for testing)* |

> **Don't set `PORT`** — Railway injects it and the app binds to it automatically.

---

## 3) Worker service

- **+ New → GitHub Repo → getautomiq** (same repo again), **Settings**:
  - **Root Directory:** `growasy-worker`
  - No public domain needed (it's a background worker).

### Worker → Variables

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{MySQL.MYSQL_URL}}` |
| `REDIS_HOST` | `${{Redis.REDISHOST}}` |
| `REDIS_PORT` | `${{Redis.REDISPORT}}` |
| `REDIS_PASSWORD` | `${{Redis.REDISPASSWORD}}` |
| `ENCRYPTION_KEY` | *(SAME value as API)* |
| `META_GRAPH_API_VERSION` | `v20.0` |
| `INSTAGRAM_GRAPH_BASE` | `https://graph.instagram.com` |
| `WEBHOOK_PROCESSING_CONCURRENCY` | `10` |
| `AUTOMATION_EXECUTION_CONCURRENCY` | `5` |
| `WEB_APP_URL` | *(your Vercel URL)* |
| `MAIL_FROM` | `Automiq <no-reply@automiq.app>` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | *(your SMTP — optional)* |

---

## 4) Create the schema + seed the plans

The recent features (lead capture, link tracking, plan tiers) were applied with
`prisma db push`, so use **db push** (applies the full current `schema.prisma`),
then seed:

In the **API service → ⋯ → Shell** (or a one-off `railway run`):

```bash
npx prisma db push
npx prisma db seed
```

This creates every table and seeds permissions + the Free / Starter / Growth /
Agency plans.

---

## 5) Web on Vercel

1. **vercel.com → Add New → Project →** import `getautomiq`.
2. **Root Directory:** `growasy-web`  (Framework auto-detects **Vite**; `vercel.json` handles SPA routing).
3. **Environment Variables:**

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://<your-railway-api-domain>/api/v1` |

4. **Deploy** → note the Vercel URL.

> Vite bakes env vars at **build time** — set `VITE_API_BASE_URL` **before**
> deploying, and redeploy if the API URL changes.

---

## 6) Cross-wire the URLs (do this once both are live)

Back on Railway (**api** and **worker**), set to the real Vercel URL:
- `WEB_APP_URL` = `https://<vercel-url>`
- `CORS_ORIGINS` = `https://<vercel-url>`
- `META_REDIRECT_URI` = `https://<vercel-url>/settings/instagram/callback`

In the **Meta app dashboard**:
- **Webhooks → callback URL:** `https://<railway-api-domain>/api/webhook/instagram`
- **Verify token:** your `META_WEBHOOK_VERIFY_TOKEN`
- **Instagram → OAuth redirect URI:** `https://<vercel-url>/settings/instagram/callback`

Redeploy the affected services after changing variables.

---

## Quick checklist

- [ ] MySQL + Redis added
- [ ] API service: root `growasy-api`, all vars set, public domain generated
- [ ] Worker service: root `growasy-worker`, `ENCRYPTION_KEY` **matches** API
- [ ] `prisma db push` + `prisma db seed` run in API shell
- [ ] Vercel web: root `growasy-web`, `VITE_API_BASE_URL` → Railway API
- [ ] `WEB_APP_URL` / `CORS_ORIGINS` / `META_REDIRECT_URI` point to Vercel URL
- [ ] Meta dashboard webhook + redirect updated
