# growasy-web

The dashboard SPA for Growasy — an Instagram Automation SaaS platform (ManyChat-style). React 18 + Vite + TypeScript + TailwindCSS, talking to [`growasy-api`](../growasy-api).

This pass ships the **platform foundation for the frontend**: the full Auth flow (login, register, forgot/reset password, email verification) and an authenticated dashboard shell (profile, sessions/devices, organization switcher, dark mode). Everything else in the product spec (Instagram accounts, automations, contacts, conversations, analytics, billing) is deliberately **not** stubbed here — see `API_CONTRACT.md` at the repo root and `growasy-api/README.md` for what's built server-side; this app only links to pages backed by a real API.

## Architecture

- **Framework**: React 18 + Vite + TypeScript, routed with React Router v6.
- **Server state**: TanStack Query (react-query v5) for anything that comes from the API (profile, sessions, organization detail) — handles caching, loading/error state, and mutations with optimistic cache updates.
- **Client/auth state**: Zustand (`src/stores/auth-store.ts`), not React Context. Reasoning: the API client (`src/lib/api-client.ts`) needs synchronous, non-React access to the current access token and active organization id on every `fetch` call (including from a 401-retry path that isn't inside a component). Zustand exposes `useAuthStore.getState()` for that without prop-drilling a context ref or lifting the client above the provider tree. Zustand's `persist` middleware also makes "persist only `activeOrganizationId`, never the token" a one-line `partialize` instead of manual `localStorage` bookkeeping.
- **Forms**: React Hook Form + Zod (`@hookform/resolvers/zod`). Every schema in `src/schemas/auth.schemas.ts` mirrors the exact `class-validator` rules in `growasy-api/src/modules/{auth,users}/dto/*.ts` (password regex, length limits) so client-side and server-side validation never disagree.
- **Styling**: TailwindCSS, `darkMode: 'class'`, a small hand-rolled UI kit (`src/components/ui`) — no component library dependency.
- **Motion**: Framer Motion for page-mount transitions and the toast stack; used sparingly (fades/slides on mount, not on every interaction).
- **Toasts**: a small Context + `<Toaster/>` (`src/components/ui/toast-context.tsx`, `Toaster.tsx`) instead of a library — the feature surface needed (queue of dismissible, auto-expiring toasts) is ~60 lines.
- **Charts**: Recharts is installed per the platform's mandated stack but intentionally unused in this pass — there's no analytics module yet, and no fake charts belong on a real dashboard.

## Auth flow / token refresh

- The **access token lives in memory only** (inside the Zustand store, never written to `localStorage`/`sessionStorage`). Reloading the tab always starts with `accessToken: null`.
- The **refresh token is an `httpOnly` cookie** (`growasy_rt`) set by the API on register/login/refresh. JS never reads or writes it directly; every request uses `credentials: 'include'` so the browser attaches it automatically.
- On mount, `useBootstrapAuth` (`src/hooks/use-bootstrap-auth.ts`) calls `GET /users/me`. With no access token yet, that call 401s, which the API client's refresh logic (below) transparently resolves using the refresh cookie — so a page reload while the refresh cookie is still valid re-establishes the session without a visible flash of the login page (route rendering is held behind `status !== 'unknown'`, see `ProtectedRoute`/`PublicOnlyRoute`).
- `src/lib/api-client.ts` is the single place that knows about the envelope and refresh dance:
  1. Every request attaches `Authorization: Bearer <accessToken>` (if present) and `x-organization-id: <activeOrganizationId>` (if present — not required by any endpoint yet, but wired now so module-scoped endpoints work without a client migration once they ship).
  2. On a `401` from a protected endpoint, it calls `POST /auth/refresh` **once** (concurrent 401s share a single in-flight refresh via a module-level promise, so a burst of requests doesn't fire a burst of refreshes).
  3. If refresh succeeds, the original request is retried once with the new token.
  4. If refresh fails, auth state is cleared (`useAuthStore.getState().clear()`) and an `unauthorizedHandler` callback (wired in `App.tsx` to `useNavigate`) sends the user to `/login` — unless they're already on a public auth route, so a cold visit to `/register` isn't hijacked by the bootstrap probe's inevitable 401.
- Public auth endpoints (`/auth/login`, `/auth/register`, `/auth/refresh` itself, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`) are excluded from the refresh-retry path — a 401 from `/auth/login` means "wrong password," not "expired session."
- Every response is unwrapped from the `{ success, data, error }` envelope centrally; callers get `data` directly or a thrown `ApiError` with `.code`/`.message`/`.status`.

## Getting started

```bash
cp .env.example .env    # VITE_API_BASE_URL — defaults to http://localhost:4000/api/v1
npm install
npm run dev
```

The app runs on `http://localhost:5173` and expects `growasy-api` running at `VITE_API_BASE_URL`. Fastest full-stack local setup (MySQL + Redis + Mailhog + api + worker + web behind one nginx origin, so cookies behave like production) is the root `infra/docker-compose.yml` — see the root README.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | `tsc --noEmit` then `vite build` to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint (+ Prettier), auto-fixing |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm test` | Vitest (Testing Library) — unit + component tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:cov` | Vitest with coverage |

## Testing

`src/test/` — Vitest + React Testing Library, jsdom environment:

- `schemas.test.ts` — Zod validation for login/register/reset-password, including the exact password-complexity regex mirrored from `RegisterDto`/`ResetPasswordDto`.
- `api-client.test.ts` — envelope unwrapping, header attachment (`Authorization`, `x-organization-id`), the 401 → refresh → retry flow (single retry, new token used on retry), the "refresh also fails → clear state + unauthorized handler" path, and confirms public auth endpoints skip the refresh dance entirely.
- `login-page.test.tsx` — renders `LoginPage`, asserts client-side validation errors block submission, and that a valid submit calls `authApi.login` with the right payload and updates the auth store.

## Deployment

**Docker (recommended for the bundled `infra/docker-compose.yml` topology):**

```bash
docker build --build-arg VITE_API_BASE_URL=/api/v1 -t growasy-web .
docker run -p 8081:80 growasy-web
```

Multi-stage build: `node:20-alpine` installs deps and runs `vite build` (the `VITE_API_BASE_URL` build `ARG` is baked into the static bundle, since Vite env vars are compile-time, not runtime), then an `nginx:1.27-alpine` stage serves `dist/` with SPA fallback (`try_files $uri $uri/ /index.html` in `nginx.conf`) and a `HEALTHCHECK`.

**Static hosting (S3+CloudFront, Vercel, Netlify):** since the platform's infra spec calls out the frontend deploying separately from the API, `npm run build` output in `dist/` is a plain static bundle — upload it as-is to any static host/CDN. Two things every host needs to replicate:
1. SPA fallback — unknown paths (e.g. `/reset-password`) must serve `index.html`, not 404.
2. `VITE_API_BASE_URL` is baked in at build time — run `npm run build` once per target environment (or per-environment CI job) with the right value, rather than trying to swap it at runtime.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Base URL of `growasy-api`, including `/api/v1`, e.g. `http://localhost:4000/api/v1` in dev or `/api/v1` when served behind the same nginx origin as the API (see `infra/`). |
