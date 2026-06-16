# Architecture — Monday Virtual Spaces

White-label, multi-tenant 3D virtual workspace embedded in monday.com.

## Three transport planes (never conflated)

1. **Control plane (HTTPS)** — `apps/api` (NestJS REST + future GraphQL BFF). Auth, tenant/scene/object config, Monday data proxy, media-token issuance, admin.
2. **State plane (WSS, Socket.IO)** — `apps/realtime`. Avatar position, presence, chat, reactions, raise-hand, whiteboard ops. Scaled horizontally via the **Redis Socket.IO adapter**.
3. **Media plane (WebRTC)** — **LiveKit Cloud**. Voice/video/screen-share. Our API only mints scoped, TTL-limited tokens; spatial audio is computed client-side from avatar distance.

```
monday.com (iframe) → web (Next.js/R3F) → api (NestJS) → Postgres/Redis/S3
                              │  └────────→ realtime (Socket.IO + Redis)
                              └───────────→ LiveKit Cloud (SFU)
```

## Multi-tenancy

Shared DB / shared schema / **row-level isolation via mandatory `tenantId`**. Enforced by:
- `forTenant(tenantId)` Prisma extension in [`packages/db`](../packages/db/src/tenant-scope.ts) — auto-injects `tenantId` into every read/write on tenant-owned models.
- Tenant-namespaced Socket.IO rooms + LiveKit rooms (`${tenantId}:${spaceId}`), so cross-tenant traffic is structurally impossible.
- Object-storage keys prefixed `tenants/{tenantId}/`.

## Scenes are data

A `Space.sceneConfig` + its `SceneObject[]` is a "world manifest" validated by the shared zod schemas in [`packages/shared/src/scene`](../packages/shared/src/scene/index.ts). The R3F engine renders **any** scene from this data; adding a room/object = inserting rows, not shipping code. Per-type defaults live in [`packages/config`](../packages/config/src/index.ts).

## Source of truth

[`packages/shared`](../packages/shared) holds all cross-cutting contracts: enums, RBAC permissions, DTOs, scene/object zod schemas, and the **typed Socket.IO event maps**. Both client and servers import it, so payloads can never drift.

## Security

RBAC (6 roles → permission sets), JWT sessions (access + refresh), AES-256-GCM encryption of Monday tokens at rest, Redis-backed rate limiting, append-only `AuditLog` + `AnalyticsEvent`, no hardcoded secrets (all via validated env). See ARCHITECTURE §14 in the design doc.

## Packages & apps

| Path | Role |
|---|---|
| `packages/shared` | Types, zod schemas, RBAC, socket contracts, scene config |
| `packages/db` | Prisma schema + multi-tenant client (`forTenant`) + seed |
| `packages/config` | Scene presets per space type, branding helpers |
| `apps/api` | NestJS control plane (auth, spaces, media, monday, me, health) |
| `apps/realtime` | NestJS + Socket.IO gateway (presence, movement, chat) |
| `apps/web` | Next.js iframe client (R3F engine, Monday bridge, HUD) |
