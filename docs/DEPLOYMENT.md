# Deployment (M6)

Three services + two data stores + LiveKit Cloud. The web client is static-ish
(Vercel); api and realtime are long-running Node processes (Railway/Render —
NOT Vercel, they hold WebSockets). Self-hosters: use `infra/docker` images +
`infra/k8s` kustomize instead.

## 1. Data stores
- **Postgres** — [Neon](https://neon.tech) free tier. Create project → copy the
  pooled connection string → `DATABASE_URL`. Apply schema:
  `DATABASE_URL=<prod-url> pnpm --filter @mvs/db exec prisma db push` (use
  `migrate deploy` once migrations are adopted).
- **Redis** — [Upstash](https://upstash.com) free tier (standard Redis protocol
  works with the Socket.IO adapter). Copy the `rediss://` URL → `REDIS_URL`.

## 2. api + realtime (Railway or Render)
Create **two services from this same repo**:

| | api | realtime |
|---|---|---|
| Build | `pnpm install && pnpm turbo build --filter=@mvs/api` | `…--filter=@mvs/realtime` |
| Start | `node apps/api/dist/main.js` | `node apps/realtime/dist/main.js` |
| Port | 4000 (`API_PORT`) | 4001 (`REALTIME_PORT`) |

Env for both: `NODE_ENV=production`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `WEB_PUBLIC_URL=<vercel url>` (CORS).
api additionally: `MONDAY_CLIENT_ID/SECRET`, `MONDAY_SIGNING_SECRET`,
`MONDAY_OAUTH_REDIRECT_URI=<api url>/auth/monday/callback`, `LIVEKIT_URL/API_KEY/API_SECRET`.
Generate FRESH prod secrets (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) — never reuse dev values.

Alternatively build the `infra/docker/Dockerfile.api` / `Dockerfile.realtime`
images and deploy anywhere containers run.

## 3. web (Vercel)
Import the GitHub repo → Root Directory `apps/web` (pnpm monorepo
auto-detected; `transpilePackages` handles `@mvs/shared`). Env:
`NEXT_PUBLIC_API_URL=<api url>`, `NEXT_PUBLIC_REALTIME_URL=<realtime url>`.

## 4. monday app
Developer Center → both features → Custom URL → the Vercel URL. OAuth redirect
URL → `<api url>/auth/monday/callback`.

## 5. Observability (optional, env-gated)
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` — create a Sentry project, set the
  DSNs, and add `@sentry/nextjs` + `@sentry/node` wiring (deliberately not
  vendored while unused).
- `OTEL_EXPORTER_OTLP_ENDPOINT` — point at any OTLP collector.

## 6. Smoke test after deploy
1. `<api url>/health` → `{"db":"up"}`; `<realtime url>/health` → 200.
2. Open the monday board view → lobby loads → enter space → second browser
   with a prod dev-token is NOT possible (signing secrets differ) — test with a
   colleague's monday account instead.
3. Voice: two users, mic on, walk apart — fade confirms LiveKit + spatial path.
