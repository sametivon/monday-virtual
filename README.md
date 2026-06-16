# Monday Virtual Spaces

A white-label, multi-tenant **3D virtual workspace** SaaS embedded inside monday.com as a custom app. Users launch from a Monday workspace, drop into a 3D environment as an avatar, walk around, hold spatial-audio/video meetings, attend auditorium presentations, share screens, collaborate, chat, and surface live Monday board data on in-world screens.

The same platform reskins into different products purely via configuration: Virtual Office, Training Center, Real-Estate Hub, Conference Venue, Community Space.

> Architecture & roadmap: see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). This README covers getting the monorepo running.

## Tech stack

| Layer | Tech |
|---|---|
| Web client | Next.js 15, React 19, TypeScript, TailwindCSS, React Three Fiber, Three.js, Zustand, Framer Motion |
| API / BFF | NestJS, REST + GraphQL, Prisma |
| Realtime (state) | NestJS + Socket.IO over Redis adapter |
| Media | LiveKit (WebRTC SFU) |
| Data | PostgreSQL, Redis, S3-compatible object storage |
| Auth | Monday OAuth + sessionToken, JWT |
| Infra | Docker, Kubernetes-ready, AWS-compatible |

## Monorepo layout

```
apps/
  web/        Next.js iframe client (3D engine + UI)
  api/        NestJS REST + GraphQL BFF (control plane)
  realtime/   NestJS + Socket.IO gateway (state plane)
packages/
  shared/     Shared TS types, zod schemas, socket event contracts
  db/         Prisma schema, migrations, seed, client
  config/     Tenant/scene/branding config loaders
infra/
  docker/     Dockerfiles + docker-compose (local full stack)
  k8s/        Kustomize base + overlays (self-host path)
```

## Prerequisites

- Node.js >= 22
- pnpm >= 10 (`corepack enable` to get it)
- Docker (for local Postgres + Redis + MinIO)

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env        # then fill in secrets

# 3. Start local infra (Postgres, Redis, MinIO)
pnpm docker:up

# 4. Generate Prisma client + apply schema + seed a demo tenant
pnpm db:generate
pnpm db:push
pnpm db:seed

# 5. Run all apps (web :3000, api :4000, realtime :4001)
pnpm dev
```

## Common scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Run web + api + realtime in watch mode (Turborepo) |
| `pnpm build` | Build all packages and apps |
| `pnpm typecheck` | Type-check the whole monorepo |
| `pnpm lint` | Lint all packages |
| `pnpm test` | Run all tests |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:migrate` | Create/apply a dev migration |

## Status

**MVP complete** — M0 Foundation · M1 Monday app + auth · M2 3D engine + avatars · M3 Realtime presence · M4 Proximity media · M5 Chat · M6 Polish + perf — all ✅, each verified with automated two-user browser tests (`scripts/browser-test-*.cjs`).

The world: GLTF avatars (idle/walk/run/wave/sit), WASD + click-to-move, **G** wave, **X** sit, follow camera, designed Lobby from data. Presence on a 10Hz server tick with interpolation. Proximity voice (spatial falloff + stereo pan), meeting-table sub-rooms with camera/screen-share. Chat with Space/Global/DM scopes, @mentions, unread badges, persisted history. 60fps validated on software GL.

Next: **Phase 2** — white-label onboarding, auditorium, Monday-data screens, whiteboard, admin scene editor. Deploying: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md).

> Note: local Postgres maps to host port **5433** (not 5432) to avoid clashing with other local instances — `DATABASE_URL` in `.env.example` already reflects this.
