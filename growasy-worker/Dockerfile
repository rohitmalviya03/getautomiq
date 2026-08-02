# syntax=docker/dockerfile:1
#
# growasy-worker — BullMQ consumer (NestJS libs, no HTTP API beyond /health).
# `npm run build` runs `prisma generate && tsc`, so the Prisma client + engine
# are produced during the build stage on the same musl Alpine base as the runner.
#
# Same principles as growasy-api: cached installs, prod-only runtime deps,
# unprivileged `node` user, small final image.

ARG NODE_VERSION=22

# ---------- deps ----------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
# `postinstall` runs `prisma generate`; the schema is needed for it to succeed.
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ---------- dev ----------
# Hot-reload image for docker-compose.dev.yml (`tsx watch`). Source is
# bind-mounted at run time; node_modules stays a container-only volume.
# Kept BEFORE `runner` so the default build target remains production.
FROM node:${NODE_VERSION}-alpine AS dev
WORKDIR /app
RUN apk add --no-cache openssl wget
# tsx's watcher is chokidar — polling is required across a bind mount.
ENV NODE_ENV=development \
    HEALTH_PORT=4100 \
    CHOKIDAR_USEPOLLING=true
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Seed the container-only node_modules volume with the musl Prisma engine.
RUN npx prisma generate
EXPOSE 4100
CMD ["npm", "run", "dev"]

# ---------- build ----------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --omit=dev

# ---------- runner ----------
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HEALTH_PORT=4100
RUN apk add --no-cache openssl wget

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

RUN chown -R node:node /app
USER node

EXPOSE 4100

# Liveness: the worker's tiny /health server (also pings Redis).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:4100/health || exit 1

CMD ["node", "dist/index.js"]
