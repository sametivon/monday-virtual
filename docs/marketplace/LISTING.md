# monday.com Marketplace — Listing Kit

Everything needed to fill in the marketplace submission form, prepared ahead of
time (submission itself is deliberately NOT part of this kit — Sam pulls the
trigger). Copy is aligned with the marketing site (`(marketing)/home/content.ts`)
so the listing, the landing page, and the in-app voice all match.

---

## App identity

| Field | Value |
|---|---|
| **App name** | MondayVirtual |
| **Tagline** (short) | Your team's virtual office inside monday.com |
| **Category** | Team collaboration / Communication |
| **Pricing** | Free during launch; tiered plans later (plan gating is scaffolded via `DEFAULT_PLAN`, dormant until flipped) |
| **Icon** | `docs/marketplace/assets/icon-512.png` / `icon-256.png` (violet doorway mark) |
| **Support URL** | https://mondayvirtual.eu/#faq |
| **Website** | https://mondayvirtual.eu |
| **Privacy / GDPR** | Data export + erasure built in (admin GDPR tools); EU hosting (Neon eu-central, Render Frankfurt) |

## Short description (~140 chars)

> Give your remote team a real office: walk over to talk, present on a huge
> stage, sketch on whiteboards — without leaving monday.com.

## Long description

**MondayVirtual turns your monday.com workspace into a place.**

Remote teams don't lack meetings — they lack *presence*: the tap on the
shoulder, the overheard conversation, the feeling that work happens somewhere.
MondayVirtual gives every monday.com account a walkable 3D office where your
team is simply *around*.

- **Walk over and talk.** Proximity voice connects people who stand near each
  other — conversations start and end like they do in a real office. No links,
  no scheduling, no "can everyone hear me?"
- **Meet around a table.** Sit at a meeting table to join its private
  full-volume room. Stand up to leave. That's the whole UX.
- **Present like it matters.** A raked amphitheater with a stage-dominating
  screen: share your live screen or upload slides, raise hands, react, and
  export attendance afterwards.
- **Your boards, on the walls.** Pin live monday boards as dashboards in the
  office — status breakdowns update on their own cadence.
- **Sketch together.** Multiplayer whiteboards, saved with the room.
- **Make it yours.** Company logo, palette, and product name — white-labeled
  for your workspace, managed by your admins.
- **Events built in.** Schedule town halls and trainings, take RSVPs (with
  calendar invites), send reminders, and auto-mark attendance when registered
  people walk in while it's live.

Installs in minutes: add the app, open it from any board or workspace, and your
Lobby + Auditorium are already furnished. Works in the monday.com panel or as a
full-window pop-out.

## Key features (form bullets)

1. Walkable 3D office with proximity voice & video
2. Amphitheater with live screen share, slides, and raise-hand
3. Live monday boards as in-world dashboards
4. Multiplayer whiteboards
5. Events: RSVP, calendar invites, reminders, attendance export
6. White-label branding per workspace
7. GDPR tools: data export & erasure
8. Analytics: presence heatmaps & space utilization

## Screenshots (5 required)

Captured at 1920×1080 via `node scripts/screenshot-listing.cjs` (dev stack up).
**Capture on a real GPU** — headless SwiftShader washes out emissive surfaces
(the harness is for framing; final captures should come from Sam's machine or
`--headful` mode).

| # | File | Scene | Caption |
|---|---|---|---|
| 1 | `listing-1-lobby.png` | Lobby wide shot, avatars near a table | "Your team, simply around — walk over and talk." |
| 2 | `listing-2-auditorium.png` | Amphitheater bowl from the back row | "Present on a stage that feels like one." |
| 3 | `listing-3-presenting.png` | Stage view with live screen content | "Share your screen or slides — huge, visible from every seat." |
| 4 | `listing-4-launcher.png` | Space launcher with branded cards | "Installed in minutes. Lobby and Auditorium included." |
| 5 | `listing-5-events.png` | Events panel with an upcoming event | "Town halls with RSVPs, reminders, and attendance." |

## Submission checklist

- [ ] Screenshots re-captured on a real GPU after final visual pass
- [ ] `APP_TRIAL_URL` decided (monday dev center field)
- [ ] Support email set up (suggest: support@mondayvirtual.eu)
- [ ] Privacy policy + Terms pages published on mondayvirtual.eu
- [ ] Monetization: keep free at launch (devs keep 100% until $200k lifetime,
      then 85/15 — verified 2026-07); flip `DEFAULT_PLAN` + subscribe webhooks
      when pricing goes live
- [ ] Redirect/OAuth URLs in the monday app match production (already done for
      mondayvirtual.eu)
- [ ] Review monday marketplace listing guidelines for current asset sizes
