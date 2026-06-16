# Ready Player Me (realistic) avatars

> **⚠️ DORMANT (2026-06-16).** The realistic-avatar *creator UI* has been removed
> from the avatar picker. Ready Player Me shut down its standalone developer
> service (Jan 31 2026), and the evaluated replacement (Avaturn) moved to a
> paid-only SDK ($800/mo) that conflicts with this project's $0 constraint — so
> we ship **Character-only** for now.
>
> What stays: the *rendering* layer (`HumanoidAvatar`, the `customModelUrl` branch
> in `Avatar.tsx`, and `apps/web/public/avatars/rpm-animations.glb`) is fully
> intact and provider-agnostic. It is simply unreachable from the UI because the
> picker no longer produces a `customModelUrl`. To revive realistic avatars, add a
> new creator UI that writes `customModelUrl` (any rigged .glb whose bone names
> match the shared animation library) — no render-layer changes needed. The
> sections below document how that library was built.

Players can wear a realistic [Ready Player Me](https://readyplayer.me) (RPM) avatar
instead of a stylized KayKit character. This doc explains the one asset you need
to drop in, and how the pieces fit.

## Status — already built ✅

`apps/web/public/avatars/rpm-animations.glb` is **built and committed** (idle /
walk / run / wave). RPM avatars animate out of the box; you don't need to do
anything. The rest of this section documents how it was made and how to rebuild
it (e.g. to add a sit clip later).

RPM avatars ship as a **bare rigged mesh with no animations**, so the clips come
from this one shared own-origin file. If it's ever missing, RPM avatars still
load — they just stand static, and KayKit characters (the default) are
unaffected. There is **no sit clip** in the RPM pack, so `X`-to-sit keeps an RPM
avatar in idle (built-in fallback) — that's expected, not a bug.

## How it was built (and how to rebuild)

The RPM **animation library** clips aren't armature-rigged GLBs — they store
node-transform animations on a bone hierarchy (`Hips`/`Spine`/`LeftArm`/…) whose
names match the RPM avatar skeleton. So the merge happens at the glTF level (by
node name), **not** in Blender: `scripts/merge-rpm-animations.mjs` takes the idle
file as the base scene and copies each other clip's animation channels onto it,
renaming the animations to `idle`/`walk`/`run`/`wave`. (Blender treats these as
loose Empties with no armature, which makes a clean multi-clip export fiddly —
the glTF-level merge is deterministic and binds 0-skip by name.)

### The four source clips (verified against the repo)

Under `masculine/glb/` in <https://github.com/readyplayerme/animation-library>,
in **category subfolders** (`idle/`, `locomotion/`, `expression/`):

| State | File | Folder | Raw download |
|-------|------|--------|-----------------|
| idle  | `M_Standing_Idle_001.glb`        | `idle/`       | [raw](https://github.com/readyplayerme/animation-library/raw/master/masculine/glb/idle/M_Standing_Idle_001.glb) |
| walk  | `M_Walk_001.glb`                 | `locomotion/` | [raw](https://github.com/readyplayerme/animation-library/raw/master/masculine/glb/locomotion/M_Walk_001.glb) |
| run   | `M_Run_001.glb`                  | `locomotion/` | [raw](https://github.com/readyplayerme/animation-library/raw/master/masculine/glb/locomotion/M_Run_001.glb) |
| wave  | `M_Standing_Expressions_013.glb` | `expression/` | [raw](https://github.com/readyplayerme/animation-library/raw/master/masculine/glb/expression/M_Standing_Expressions_013.glb) |

> The wave is the one judgement call — no clip is literally named "wave";
> `M_Standing_Expressions_013` is a greeting gesture. To swap it, drop a
> different gesture GLB in and edit the `CLIPS` table in the merge script.

### Rebuild command

Put the four GLBs in a folder (e.g. `~/Downloads`), then:

```bash
# one-off install of the merge tool (not added to the repo)
mkdir -p /tmp/gltf-tools && (cd /tmp/gltf-tools && npm i @gltf-transform/core@^4 --no-save && echo '{"type":"module"}' > package.json)
cp scripts/merge-rpm-animations.mjs /tmp/gltf-tools/merge.mjs
(cd /tmp/gltf-tools && node merge.mjs "$HOME/Downloads" "<repo-root>")
```

On Windows PowerShell the equivalent lives in this session's history; the script
itself is cross-platform. To **add a sit clip** later: grab a sitting GLB from
[Mixamo](https://www.mixamo.com) (export "Without Skin", format glTF/GLB), add a
`['sit', 'Sitting.glb']` row to the `CLIPS` array, and rerun.

### Verify the result

```
node scripts/inspect-rpm-anims.cjs
```

Prints the clip names in the GLB and which state each maps to (idle/walk/run/wave
→ dedicated clips; sit → idle fallback). The in-world load is covered by
`scripts/browser-test-rpm.cjs` (asserts the library loaded: `clips=4`).

## How players use it

- Lobby ▸ **🧑‍🎨 Customize avatar** ▸ **🧑 Realistic** tab.
- **✨ Create your avatar** opens the RPM creator in an iframe; when they finish,
  RPM posts the model URL back and we capture it automatically.
- Or paste an RPM `.glb` URL directly (e.g. `https://models.readyplayer.me/<id>.glb`).
- Save → the URL is stored in `avatarConfig.customModelUrl`, rides the presence
  handshake, and everyone in the room sees the realistic avatar.

### RPM subdomain

The creator iframe uses `NEXT_PUBLIC_RPM_SUBDOMAIN` (defaults to `demo`, which
works out of the box). To brand it (your own avatar catalog / logo), create a
free RPM developer subdomain at <https://studio.readyplayer.me> and set:

```
NEXT_PUBLIC_RPM_SUBDOMAIN=yourbrand
```

## How it works in code

- `apps/web/src/engine/HumanoidAvatar.tsx` — loads the external glTF by URL,
  binds the shared clip library onto its skeleton with a per-avatar mixer, and
  runs the same idle/walk/run/wave/sit state machine as KayKit. Tolerates a
  missing animation library (static pose) and a broken URL (renders nothing,
  never crashes the scene).
- `apps/web/src/engine/Avatar.tsx` — picks the body: `customModelUrl` → humanoid,
  else the KayKit `KayKitBody`. The nameplate/overlays are shared.
- Clip-name matching is substring + normalized, so the exact RPM clip names
  don't have to be perfect — they just need to contain idle/walk/run/wave/sit.

> **Why a shared animation GLB and not a CDN?** Same rule as every other asset
> here: we serve avatars and their animations from our own origin, never a
> runtime CDN. The RPM *model* URL is the one exception (it's the user's chosen
> avatar, fetched from RPM's model host with permissive CORS).
