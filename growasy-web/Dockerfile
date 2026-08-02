# syntax=docker/dockerfile:1
#
# growasy-web — React + Vite SPA compiled to static assets, served by nginx.
#
# In production this same image is used as the EDGE `nginx` service: the compose
# file mounts the full reverse-proxy config (./nginx/default.conf) over the
# baked-in SPA-only config, so this one image both hosts the SPA and proxies /api.
# Built standalone (no mount) it still serves the SPA on its own.

ARG NODE_VERSION=22

# ---------- deps ----------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ---------- build ----------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
# Baked into the bundle at build time — the API base path the SPA calls.
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- dev ----------
# Vite dev server for docker-compose.dev.yml — no nginx, no bundle: the SPA is
# served from source with HMR, and /api is proxied to the api container (see
# VITE_PROXY_TARGET in vite.config.ts). Source is bind-mounted at run time.
# Kept BEFORE `runner` so the default build target remains the nginx image.
FROM node:${NODE_VERSION}-alpine AS dev
WORKDIR /app
ENV NODE_ENV=development \
    CHOKIDAR_USEPOLLING=true
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 5173
# --host binds 0.0.0.0 so the port is reachable from outside the container.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---------- runner: static assets on nginx ----------
FROM nginx:1.27-alpine AS runner
# Baked, SPA-only default (overridden by the mounted edge config in production).
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# /healthz is a cheap 200 endpoint defined in the nginx config (no SPA HTML).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
