# MondayVirtual — Design Direction

One identity across every surface: **light, precise, quiet, confident.**
Warm paper, ink text, violet as the single brand voice, amber as the rare warm
accent. The marketing site, the app chrome, and the 3D scenes are the same
product; nothing is allowed to read as "game asset" or "admin panel".

## 2D tokens (app + marketing)

Defined in `apps/web/src/app/globals.css` (+ `tailwind.config.ts`); brand
colors are white-labelable per tenant, semantic colors are fixed.

| Token | Value | Notes |
|---|---|---|
| paper (bg) | `#faf7f2` | app + marketing ground |
| surface | `#ffffff` | cards, panels |
| paper-2 | `#f3eee6` | wells, rails |
| ink (text) | `#211c29` | 12.6:1 on paper |
| primary | `#6c5ce7` | violet — the brand voice |
| secondary | `#0a9a6e` | |
| accent | `#e8a33d` | warm, used sparingly |
| success / warning / danger | `#0a9a6e` / `#b0861f` / `#c0392b` | fixed, never white-labeled |
| line | hairline `rgba(ink, ~.12)` | borders everywhere |
| radius | 8 / 12 / 16 / 22 | sm→xl |
| shadows | e1 / e2 / e3 | quiet elevation |
| display face | serif stack | headings only |
| text face | Inter | via next/font |

Brand colors are stored as RGB channel triplets (`--brand-primary-rgb`) so
Tailwind alpha modifiers work. Glass recipes: `.glass` / `.glass-strong`.

## 3D scene tokens

Scenes are data (`packages/config` presets) rendered by `apps/web/src/engine`.
Prop colors live in `engine/palette.ts` (SCENE.*).

### Light temperatures
| Role | Value |
|---|---|
| Key (directional) | `#fff3e2` warm neutral, tinted by `interior.lightColor` |
| Hemisphere fill | sky `#f6efe4` / ground `#b7ab99` |
| Fixture lens | `#ffedd6`–`#ffe8cd` (per scene `lightColor`) |

### Fixture rule (hard)
`toneMapped: false` is **reserved for content surfaces** — live video and
slide textures. Architecture (light panels, trims, signs) is always
tone-mapped, `emissiveIntensity ≤ 0.6`. A light source is a designed fixture
(housing + lens), never a bare glowing plane.

### Scene material palette
| Material | Value |
|---|---|
| plaster wall | `#e7ddcc` (lobby) / `#cfc4b2` washed (auditorium) |
| light oak floor | wood texture, `roughness ≥ 0.9` (no glare hotspots) |
| walnut | `#6b4f39` — slats, stage, table legs, sofa frames |
| ink hardware | `#2b2731` — screens shells, fixtures, pedestals |
| graphite upholstery | `#3d3844` — auditorium seats |
| oat fabric | `#b7ad9c` — lounge sofas |
| rug | `#e3dccc` |
| charcoal carpet | `#37333c` — auditorium floor/terraces |

### Accent-in-scene rules (hard)
- At most **3 accent elements per scene**; never continuous strips; never
  outlines around architecture.
- `emissive ≤ 0.35` on accent elements.
- Approved slots: portal ring, stage front hairline, meeting-table rim,
  wayfinding text.
- Bloom is *earned*: only content screens and the portal may cross the bloom
  threshold.
- `interior.accentColor` is overwritten by the tenant brand accent at manifest
  build (white-labeling); design for "any tasteful hue here".

### In-scene typography
All drei `<Text>` uses `engine/font.ts` → `/fonts/inter-medium.woff`
(troika reads woff v1, NOT woff2). Labels are light paper pills (ink text,
depthTest ON, ~18m fade); avatar nameplates share the language (depthTest off
— you find people through walls).

### Avatars
CC0 Quaternius office/casual people (`public/avatars/office/*.glb`), built by
`scripts/build-avatars.mjs` (keeps Idle/Walk/Run/Wave, synthesizes Sit, prunes
combat clips). Legacy KayKit ids remap to office equivalents in
`engine/Avatar.tsx`. Fantasy models are not offered in the picker.

### Performance tiers (`engine/perfTier.ts`)
Start **medium**, earn high on sustained headroom (never degrade a first
impression): high = IBL + bloom/vignette + PCSS soft shadows + dpr 1.5;
medium = IBL + postFX, plain shadows, dpr ≤ 1.5; low = bare pipeline, dpr 1.
Post-processing runs `multisampling: 0`. Bulk geometry (theater seats) is
instanced (`engine/TheaterSeating.tsx`, 5 draw calls for ~435 seats).

### Camera containment
The camera never leaves the room shell: OrbitControls `maxDistance 44`,
`maxPolarAngle 0.55π`, and `CameraRig` clamps below `interior.wallHeight`
(above the back-face-culled ceiling, fixtures appear to float over the floor).

### Shell
The 3D canvas is a **contained viewport**: paper surround, hairline border,
16px radius, soft shadow (`(app)/space/[spaceId]/page.tsx`). The scene is a
window into a space, not a void bleeding to the screen edges.
