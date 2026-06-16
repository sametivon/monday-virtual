# monday.com App Setup (M1)

You have a monday.com developer account but no app yet. These are the steps to wire the app surface + OAuth so the web client loads inside monday.com.

## 1. Create the app
1. monday.com → avatar → **Developers** → **Build App** → create app "Virtual Spaces".
2. Note the **Client ID** and **Client Secret** → put into `.env` as `MONDAY_CLIENT_ID` / `MONDAY_CLIENT_SECRET`. ⚠️ The **Client Secret is what monday signs the iframe sessionToken with** — it is required for seamless auth.
3. Copy the **Signing Secret** → `.env` `MONDAY_SIGNING_SECRET` (used to verify board webhooks, and as a fallback for locally generated dev tokens).

## 2. OAuth scopes — REQUIRED for board data
Request the minimum needed:
- `me:read`, `users:read`, `account:read`, `boards:read`
- (`boards:write` only if/when write-back is added — not in MVP)

Then **install the app on the account** (Developer Center → app → Install). Preview mode (`install_id: -2` in the sessionToken) does **not** grant scopes, and without granted scopes every seamless API call fails with "Not authenticated".

Set the redirect URL to `MONDAY_OAUTH_REDIRECT_URI` (default `http://localhost:4000/auth/monday/callback` in dev).

## 3. Feature surfaces (where the app appears)
Add **two features**, both pointing at the web client URL (`http://localhost:3000` in dev, the prod domain in prod):
- **Board View** — appears as a view inside a board.
- **Workspace / Full-screen feature** — the primary launcher (Workspace ▸ Apps ▸ Virtual Spaces).

> The in-product app is served at the **site root `/`** (the lobby). The public
> marketing landing page lives at **`/home`** (route group `(marketing)`), so the
> monday feature URLs stay the bare origin — do **not** add a path. In prod, the
> domain root rewrites to `/home` for public visitors; monday loads the app at `/`.

## 4. Auth flow (already implemented in `apps/api`)
- **Seamless (iframe):** web asks the monday SDK for a `sessionToken` → `POST /api/auth/session` verifies it with the **client secret** (signing secret accepted as fallback) → upserts Tenant (by `mondayAccountId`) + User (by `mondayUserId`) → returns app JWTs. The client also fetches `me { name email }` via the SDK and sends it as a cosmetic `profile` (the token carries no name/email; ids stay token-verified).
- **OAuth (server-side board reads):** `POST /api/auth/monday/callback` exchanges the code for an access token; the encrypted token is stored per-tenant in `MondayOAuthToken` and used by `GET /api/monday/boards/:id`.

### 4b. The board-data path (important platform fact)
**View sessionTokens are NOT accepted as server-side monday API tokens** — even with scopes configured and the app installed, monday's GraphQL replies "Not authenticated" (verified live, 2026-06-13). Board data therefore flows over the **client-side seamless channel**: the iframe calls `monday.api(...)` and monday executes the query under the app's granted scopes (`apps/web/src/monday/boardApi.ts`). Server-side board reads (pop-out tabs, webhooks, background jobs) require the OAuth path — planned Phase 3.

## 5. Local testing without monday.com
Run `pnpm dev:token` — it signs a 12-hour dev sessionToken with the `MONDAY_SIGNING_SECRET` from `.env` and prints a ready-to-open URL (`http://localhost:3000/?devSessionToken=<jwt>`).

> The value after `devSessionToken=` is a **JWT signed with** the signing secret — never the signing secret itself. The web client uses this URL token only when no iframe sessionToken is available.

## 6. Going live
- Host web on Vercel; set the feature URLs to the Vercel domain.
- Ensure the app's iframe domain is allowed by our CSP `frame-ancestors https://*.monday.com` (already set in `apps/web/next.config.mjs`).
- Submit for monday marketplace review when ready (Phase 2+).
