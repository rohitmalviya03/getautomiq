# syntax=docker/dockerfile:1
#
# growasy-api — NestJS + Prisma. Multi-stage build:
#   deps  → full dependency graph (needed to compile + generate the Prisma client)
#   build → prisma generate + nest build, then prune to production-only deps
#   runner→ tiny Alpine image with just node_modules (prod) + dist + prisma
#
# Why this shape:
#  * BuildKit cache mounts keep `npm ci` fast across builds (layer caching).
#  * The Prisma client + query engine are generated in `build` on the SAME musl
#    Alpine base as the runner, so the engine binary matches at runtime.
#  * The runner ships production dependencies only → small, low attack surface.
#  * Runs as the built-in unprivileged `node` user (uid 1000), never root.

ARG NODE_VERSION=22

# ---------- deps ----------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
# Prisma needs openssl on Alpine (musl) to run its query engine.
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ---------- dev ----------
# Hot-reload image, used ONLY by docker-compose.dev.yml. At run time the compose
# file bind-mounts ./growasy-api over /app (keeping node_modules as a
# container-only volume), so edits on the host restart Nest with no rebuild.
#
# Deliberately placed BEFORE `runner` so the Dockerfile's default target — what
# `docker compose build` / CI use with no `target:` — stays the production image.
FROM node:${NODE_VERSION}-alpine AS dev
WORKDIR /app
RUN apk add --no-cache openssl wget
# tsc's/chokidar's inotify watchers don't see events across a Windows or macOS
# bind mount, so polling is the only reliable change detection in a container.
ENV NODE_ENV=development \
    PORT=4000 \
    TSC_WATCHFILE=PriorityPollingInterval \
    TSC_WATCHDIRECTORY=DynamicPriorityPolling \
    CHOKIDAR_USEPOLLING=true
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client here so the container-only node_modules volume is
# seeded with the musl engine on first start (the host's is Windows/glibc).
RUN npx prisma generate
# 4000 = HTTP, 9229 = node inspector (`npm run start:debug`).
EXPOSE 4000 9229
CMD ["npm", "run", "start:dev"]

# ---------- build ----------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client (engine baked into node_modules/.prisma), compile TS.
RUN npx prisma generate && npm run build
# Drop devDependencies — keeps @prisma/client + the generated engine, removes the rest.
RUN npm prune --omit=dev

# ---------- runner ----------
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000
RUN apk add --no-cache openssl wget

# Copy only what the process needs at runtime.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

# node:alpine ships an unprivileged `node` user (uid/gid 1000). Own the app dir.
RUN chown -R node:node /app
USER node

EXPOSE 4000

# Liveness: the VERSION_NEUTRAL, @Public() health route (global prefix = "api").
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:4000/api/health || exit 1

# Migrations are NOT run here — they run as a one-shot step in deploy.sh so app
# containers can be scaled/restarted freely without racing on schema changes.
CMD ["node", "dist/main.js"]
