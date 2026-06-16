# Launch runbook — production deploy ($0 stack)

Step-by-step to take Monday Virtual Spaces live on a **fully free** stack:

| Piece | Host | Free tier |
|---|---|---|
| Web (Next.js: app + marketing) | **Vercel** | Hobby — free |
| API (NestJS REST) | **Render** web service | Free (sleeps after ~15 min idle) |
| Realtime (Socket.IO presence) | **Render** web service | Free (sleeps after ~15 min idle) |
| Postgres | **Neon** | Free (0.5 GB, no card) |
| Redis | **Upstash** | Free (256 MB / 500k cmds, no card) |
| Object storage | **Cloudflare R2** | Free (10 GB, no card) |
| Media (optional) | **LiveKit Cloud** | Free dev tier |

> **Cold start trade-off:** Render free instances sleep after ~15 min idle → the
> first request after idle waits ~30–50s. Mitigated in step 9 (keep-alive ping).
> Upgrade either service to Starter ($7/mo) later to remove sleep entirely.

Config already in the repo: [`render.yaml`](../render.yaml), [`vercel.json`](../vercel.json),
[`.env.production.example`](../.env.production.example), the Prisma baseline migration
(`packages/db/prisma/migrations/`), and the CI migrate job in
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

---

## 1. Git
The repo is not yet version-controlled.
```bash
git init && git add -A && git commit -m "Initial production-ready commit"
git branch -M main
# create a GitHub repo, then:
git remote add origin git@github.com:<you>/monday-virtual-office.git
git push -u origin main
```
`.env` is gitignored — your local secrets stay local. Generate **fresh** secrets for prod (step 3).

## 2. Provision the free data stores
- **Neon** (neon.tech): new project → copy BOTH connection strings:
  - **Pooled** (host contains `-pooler`) → `DATABASE_URL`
  - **Direct** (no `-pooler`) → `DIRECT_DATABASE_URL` (migrations only)
- **Upstash** (upstash.com): new Redis DB → copy the **`rediss://`** (TLS) URL → `REDIS_URL`
- **Cloudflare R2**: create a bucket `mvs-assets`, an R2 API token (access key + secret), note the S3 endpoint `https://<account>.r2.cloudflarestorage.com`, and enable a public bucket URL / custom domain → fill the `S3_*` vars
- **LiveKit Cloud** (optional): project → `LIVEKIT_URL` (wss), API key + secret

## 3. Generate fresh production secrets
```bash
openssl rand -hex 32   # JWT_SECRET        (use the SAME value on api AND realtime)
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY    (must be exactly 64 hex chars)
```
Never reuse the dev values from `.env`.

## 4. Run the database baseline migration
Against the fresh Neon DB (uses the **direct** URL):
```bash
cd packages/db
DIRECT_DATABASE_URL="<neon-direct-url>" DATABASE_URL="<neon-pooled-url>" \
  pnpm exec prisma migrate deploy
# optional: seed a demo tenant
DATABASE_URL="<neon-pooled-url>" pnpm exec prisma db seed
```
Verify: `prisma migrate status` → "Database schema is up to date!". (CI also runs this
on every push via the `migrate` job — set `DATABASE_URL` + `DIRECT_DATABASE_URL` repo secrets.)

## 5. Deploy the API + realtime to Render
- Render → **New → Blueprint** → point at the repo. It reads [`render.yaml`](../render.yaml)
  and creates `mvs-api` + `mvs-realtime`.
- For EACH service, set the env vars marked `sync: false` (see
  [`.env.production.example`](../.env.production.example) for the exact list and sources).
  - `JWT_SECRET` **must be byte-identical** on both services.
  - `WEB_PUBLIC_URL` = your Vercel URL (step 6) — you'll set this after step 6, or set a
    placeholder now and update once Vercel is live.
  - `MONDAY_OAUTH_REDIRECT_URI` = `https://mvs-api.onrender.com/auth/monday/callback`
- Render injects `$PORT`; the env schemas map it automatically — don't set the port vars.
- Note the two service URLs: `https://mvs-api.onrender.com`, `https://mvs-realtime.onrender.com`.

## 6. Deploy the web app to Vercel
- Vercel → **New Project** → import the repo. It reads [`vercel.json`](../vercel.json)
  (build via turbo, output `apps/web/.next`).
- Set **Environment Variables** (Production) — these are inlined at BUILD time:
  - `NEXT_PUBLIC_API_URL` = `https://mvs-api.onrender.com`
  - `NEXT_PUBLIC_REALTIME_URL` = `https://mvs-realtime.onrender.com`
  - `NEXT_PUBLIC_LIVEKIT_URL` = your LiveKit wss URL (or leave blank to disable media)
  - `NEXT_PUBLIC_SENTRY_DSN` (optional)
  > The web build FAILS on purpose if these still point at localhost (guard in
  > `apps/web/src/lib/env.ts`) — that's the safety net.
- Add your domain `mondayvirtual.eu` in Vercel → DNS.
- Go back to Render and set `WEB_PUBLIC_URL` on both services to the final Vercel URL
  (e.g. `https://mondayvirtual.eu`), then redeploy them so CORS allows the real origin.

## 7. Routing: app vs marketing (do NOT rewrite the apex)
- The **app** is served at `/` (lobby) and `/space/[id]`. monday's iframe loads the bare
  origin, so the monday feature URL stays `https://mondayvirtual.eu` with **no path**.
- The **marketing page** is at `/home` (indexable; sitemap + canonical point there).
- **Do not** add an apex `/`→`/home` rewrite — it would make the monday iframe load the
  landing page instead of the app. Market the `/home` URL directly (and it's what search
  results surface). Optionally add a small banner/link from `/home` → "Open in monday.com".

## 8. Register / point the monday app
Follow [`MONDAY_APP_SETUP.md`](MONDAY_APP_SETUP.md), with prod URLs:
- Both feature surfaces (Board View + Workspace) → `https://mondayvirtual.eu`
- OAuth redirect → `https://mvs-api.onrender.com/auth/monday/callback`
- Scopes `me:read users:read account:read boards:read`, then **Install on the account**
  (preview mode doesn't grant scopes).
- Put `MONDAY_CLIENT_ID` / `MONDAY_CLIENT_SECRET` / `MONDAY_SIGNING_SECRET` into the
  Render `mvs-api` env.

## 9. Keep-alive (mitigate Render cold starts)
Free Render services sleep when idle. Set a free monitor to ping both health endpoints
every ~10 min:
- cron-job.org or UptimeRobot → GET `https://mvs-api.onrender.com/health` and
  `https://mvs-realtime.onrender.com/health` every 10 minutes.
This keeps them warm during the day. (Upgrade to Starter $7/mo to remove sleep entirely.)

## 10. Smoke test
- `GET https://mvs-api.onrender.com/health` → `{"db":"up","redis":"up"}`
- `GET https://mvs-realtime.onrender.com/health` → `{"redis":"up"}`
- Open a board in monday → the Virtual Spaces view loads → enter the Lobby → you appear.
- Second user (a colleague's monday account) → both see each other move.
- Mic on for both, walk apart → spatial audio fades (confirms LiveKit, if configured).

## 11. Final marketing wiring (needs your content)
- Replace `APP_TRIAL_URL` in `apps/web/src/app/(marketing)/home/page.tsx` with the real
  monday Marketplace listing/install URL once the app is published.
- Replace the placeholder testimonials with real beta quotes.
- Re-run `node scripts/rasterize-og.cjs` if you change `og.svg`.

---

### Alternative: self-host (Docker / K8s)
The `infra/` Dockerfiles + Kustomize manifests remain the self-host path (a VPS or your
own cluster) — see [`DEPLOYMENT.md`](DEPLOYMENT.md). Not needed for the free stack above.
