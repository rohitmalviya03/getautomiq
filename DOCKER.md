# Docker: dev and prod, side by side

Two compose files, one command shape. Nothing to edit when you switch between them —
the stacks use different project names, so their containers, networks and volumes are
completely separate and can both exist on the same machine.

| | dev | prod |
|---|---|---|
| File | `docker-compose.dev.yml` | `docker-compose.yml` |
| Project name | `growasy-dev` | `growasy` |
| Config from | `growasy-api/.env`, `growasy-worker/.env` (the ones you already use) | root `.env` (from `.env.example`) |
| Code | bind-mounted from the host, hot reload | baked into the image at build time |
| Web | Vite dev server + HMR | React build served by nginx (also the edge/reverse proxy) |
| Edge | none — Vite proxies `/api` straight to the API | nginx on 80/443 |
| Extras | Mailpit, Adminer | — |
| Hardening | off | `read_only`, `cap_drop: ALL`, resource limits |
| Migrations | applied automatically when `api` starts | one-shot step in `scripts/deploy.sh` |

## Quick start

```powershell
# dev
.\scripts\dc.ps1 dev up -d --build
.\scripts\dc.ps1 dev logs -f api

# prod (on the VPS, or locally to smoke-test the real images)
.\scripts\dc.ps1 prod up -d --build
```

On Linux/macOS/Git Bash use `./scripts/dc.sh dev up -d --build` — same arguments.

Both scripts are thin pass-throughs: everything after `dev`/`prod` goes to `docker compose`
unchanged, so `ps`, `logs -f web`, `exec api sh`, `restart worker`, `down -v` all work as
documented upstream. If you'd rather type it out:

```powershell
docker compose -f docker-compose.dev.yml up -d      # dev
docker compose up -d                                # prod (default file)
```

## What runs where (dev)

| Service | URL / port | Notes |
|---|---|---|
| web | http://localhost:5173 | Vite dev server, HMR |
| api | http://localhost:4000/api/health | NestJS, `nest start --watch`; debugger on 9229 |
| worker | http://localhost:4100/health | BullMQ consumer, `tsx watch` |
| mysql | `localhost:3333` (root / `123456`) | same port + credentials as the `.env.example` files |
| redis | `localhost:6379` | no password, matching dev config |
| mailpit | http://localhost:8025 | catches every outgoing email; SMTP on 1025 |
| adminer | http://localhost:8080 | opt-in: add `--profile tools` |

Those ports are exactly what the per-service `.env.example` files already point at, which is
the whole trick: **the same `.env` works for native `npm run dev` and for the docker dev
stack.** Inside the network the compose file overrides only the host-facing values
(`DATABASE_URL`, `REDIS_HOST`, `SMTP_HOST`) to the container names — and those overrides win,
because process env beats the `.env` file in both `@nestjs/config` and `dotenv`.

Override any published port without touching the file:

```powershell
$env:DEV_WEB_PORT = "5174"; .\scripts\dc.ps1 dev up -d
```

(All knobs are `DEV_`-prefixed so the production `.env` in this directory can never leak into
the dev stack — compose auto-loads `.env` for variable interpolation regardless of `-f`.)

## Common tasks (dev)

```powershell
# create a migration — the generated SQL lands in your working tree via the bind mount
.\scripts\dc.ps1 dev exec api npx prisma migrate dev --name add_something

# apply pending migrations (also runs automatically on api start)
.\scripts\dc.ps1 dev exec api npx prisma migrate deploy

# seed
.\scripts\dc.ps1 dev exec api npm run prisma:seed

# shell in a container
.\scripts\dc.ps1 dev exec api sh

# after changing package.json — rebuild AND recreate the node_modules volume
.\scripts\dc.ps1 dev up -d --build -V

# stop (keeps data)                    # wipe the dev database + redis
.\scripts\dc.ps1 dev down              .\scripts\dc.ps1 dev down -v
```

Prisma Studio works from the host against the container DB — MySQL is published on 3333, so
`npm run prisma:studio` in `growasy-api/` just works.

## Things worth knowing

- **`node_modules` is a container-only volume.** The host copy is Windows/glibc; the container
  needs the musl build (its Prisma query engine won't run on Alpine otherwise). That volume is
  seeded from the image the first time it's created — so after any dependency change, pass
  `-V` (`--renew-anon-volumes`) as shown above, or the container keeps the old modules.
- **`dist/` is written into your working tree** by the API container's watch build. It's
  gitignored. It is deliberately not a volume: `nest --watch` deletes and recreates that
  directory, which fails with `EBUSY` on a mount point.
- **File watching uses polling** (`CHOKIDAR_USEPOLLING`, `TSC_WATCHFILE`) because inotify
  events don't cross a Windows/macOS bind mount. Slightly more CPU, but reloads are reliable.
- **`vite.config.ts` reads `VITE_PROXY_TARGET`** — unset for native dev (defaults to
  `http://localhost:4000`), set to `http://api:4000` in the dev stack.
- **The dev stages live in the same Dockerfiles**, before the `runner` stage, so the default
  build target — what CI and the prod compose use — is still the production image.
- **Dev containers run as root** (prod runs as the unprivileged `node` user). On Windows and
  macOS that's invisible. On a Linux host, files the container writes into the bind mount —
  `dist/`, new migration folders — come out root-owned; `sudo chown -R $USER:$USER .` fixes it,
  or add `user: "${UID}:${GID}"` to the service.

## Production

Unchanged from before: `cp .env.example .env`, edit it, then `./scripts/deploy.sh` (pull →
migrate → roll → health-check), which is also what the GitHub Actions workflow runs over SSH.
`./scripts/dc.sh prod …` is just a convenience wrapper for ad-hoc compose commands against
that stack.
