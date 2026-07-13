'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import {
  Armchair,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  Hand,
  Images,
  Mic,
  MicOff,
  MonitorUp,
  RotateCw,
  SmilePlus,
  Video,
  VideoOff,
  VolumeX,
} from 'lucide-react';
import {
  AvatarAnimation,
  Permission,
  UploadKind,
  ObjectType,
  type SceneObjectDTO,
  type WorldManifest,
} from '@mvs/shared';
import { api } from '@/lib/api';
import { media, useMediaStore } from '@/media/mediaController';
import { sendHandRaise, sendReaction, sendSlideGoto } from '@/realtime/useSpaceSocket';
import { useSessionStore } from '@/stores/sessionStore';
import { usePlayerStore } from '@/stores/playerStore';
import { remoteTransforms, usePresenceStore } from '@/stores/presenceStore';
import { useSlideStore } from '@/stores/slideStore';
import { Button, IconButton, SPRING, Spinner, Tooltip, toast } from '@/ui/primitives';

const EMOJIS = ['👏', '❤️', '😂', '🎉', '👍'];

/**
 * The single bottom control dock for a space: proximity voice + mic/present,
 * raise-hand + emoji reactions (popover), nearest-seat, and presenter slide
 * controls. One glass surface, one icon language, tooltips everywhere.
 */
export function SpaceDock({
  manifest,
  onDeckChanged,
}: {
  manifest: WorldManifest;
  onDeckChanged: () => void;
}) {
  const me = useSessionStore((s) => s.me);
  const notice = useMediaStore((s) => s.notice);

  // Media notices (mic blocked in iframe etc.) surface through the global
  // toast stack instead of a bespoke banner.
  useEffect(() => {
    if (!notice) return;
    toast.info(notice, 8000);
    useMediaStore.setState({ notice: null });
  }, [notice]);

  if (!me) return null;

  return (
    <div className="glass-strong absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-xl px-2.5 py-2 text-brand-text">
      <MediaSegment />
      <Divider />
      <ReactionsSegment />
      <SeatSegment manifest={manifest} />
      <SlidesSegment manifest={manifest} onDeckChanged={onDeckChanged} />
    </div>
  );
}

function Divider() {
  return <span className="mx-0.5 h-6 w-px shrink-0 bg-line/12" aria-hidden="true" />;
}

// ── Media: proximity voice / mic / present (or table controls) ───────────────
function MediaSegment() {
  const { mode, tableLabel, micEnabled, camEnabled, screenEnabled, voiceCount, error } =
    useMediaStore();

  if (mode === 'off') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 text-xs text-brand-text/50">
        <VolumeX size={13} strokeWidth={1.75} aria-hidden="true" />
        {error ? 'Voice unavailable' : 'Voice off'}
      </span>
    );
  }
  if (mode === 'connecting') {
    return (
      <span className="inline-flex items-center gap-2 px-2 text-xs text-brand-text/55">
        <Spinner size={12} />
        Connecting voice…
      </span>
    );
  }

  const inTable = mode === 'table';
  return (
    <>
      <span className="px-1.5 text-xs font-medium text-brand-text/55">
        {inTable ? (tableLabel ?? 'Meeting') : 'Nearby'} · {voiceCount + 1}
      </span>
      <Tooltip label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}>
        <IconButton
          icon={micEnabled ? Mic : MicOff}
          aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
          active={micEnabled}
          variant="ghost"
          size="sm"
          onClick={() => void media.toggleMic()}
        />
      </Tooltip>
      {inTable && (
        <Tooltip label={camEnabled ? 'Turn camera off' : 'Turn camera on'}>
          <IconButton
            icon={camEnabled ? Video : VideoOff}
            aria-label={camEnabled ? 'Turn camera off' : 'Turn camera on'}
            active={camEnabled}
            variant="ghost"
            size="sm"
            onClick={() => void media.toggleCamera()}
          />
        </Tooltip>
      )}
      <Tooltip label={screenEnabled ? 'Stop presenting' : 'Present your screen'}>
        <IconButton
          icon={MonitorUp}
          aria-label={screenEnabled ? 'Stop presenting' : 'Present your screen'}
          active={screenEnabled}
          variant="ghost"
          size="sm"
          onClick={() => void media.toggleScreenShare()}
        />
      </Tooltip>
      {inTable && (
        <Button variant="danger" size="sm" icon={DoorOpen} onClick={() => void media.leaveTable()}>
          Leave table
        </Button>
      )}
    </>
  );
}

// ── Reactions: raise hand + emoji popover ────────────────────────────────────
function ReactionsSegment() {
  const me = useSessionStore((s) => s.me);
  const raised = usePresenceStore((s) => (me ? Boolean(s.hands[me.user.id]) : false));
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip label={raised ? 'Lower hand' : 'Raise hand'}>
        <IconButton
          icon={Hand}
          aria-label={raised ? 'Lower hand' : 'Raise hand'}
          active={raised}
          variant="ghost"
          size="sm"
          onClick={() => sendHandRaise(!raised)}
        />
      </Tooltip>
      <div className="relative">
        <Tooltip label="React">
          <IconButton
            icon={SmilePlus}
            aria-label="React with an emoji"
            variant="ghost"
            size="sm"
            onClick={() => setOpen((v) => !v)}
          />
        </Tooltip>
        <AnimatePresence>
          {open && (
            <m.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={SPRING}
              className="glass-strong absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-0.5 rounded-md px-1.5 py-1"
            >
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    sendReaction(emoji);
                    setOpen(false);
                  }}
                  className="rounded-sm px-1.5 py-1 text-lg transition hover:bg-line/8"
                  aria-label={`React ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// ── Seat: one tap into the nearest free seat ─────────────────────────────────
function SeatSegment({ manifest }: { manifest: WorldManifest }) {
  // Reactive only to my animation (sitting?) — chair math runs on click.
  const sitting = usePlayerStore((s) => s.animation === AvatarAnimation.SIT);
  const chairs = manifest.objects.filter((o) => o.type === ObjectType.CHAIR);
  if (chairs.length === 0) return null;

  const seatMe = () => {
    const store = usePlayerStore.getState();
    if (sitting) {
      store.set({ animation: AvatarAnimation.IDLE });
      return;
    }
    const [px, , pz] = store.position;
    // A seat is taken if any remote player is (headed) within ~0.8m of it.
    const taken = (c: SceneObjectDTO) => {
      const [cx, , cz] = c.transform.position;
      for (const t of remoteTransforms.values()) {
        if (Math.hypot(t.target.x - cx, t.target.z - cz) < 0.8) return true;
      }
      return false;
    };
    let best: SceneObjectDTO | null = null;
    let bestD = Infinity;
    for (const c of chairs) {
      if (taken(c)) continue;
      const d = Math.hypot(c.transform.position[0] - px, c.transform.position[2] - pz);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) {
      toast.info('All seats are taken right now.');
      return;
    }
    const { position } = best.transform;
    const sitRotation =
      (best.config as { sitRotation?: number }).sitRotation ?? best.transform.rotation[1];
    store.set({
      position: [position[0], position[1], position[2]],
      rotation: sitRotation,
      animation: AvatarAnimation.SIT,
      target: null,
    });
  };

  return (
    <>
      <Divider />
      <Tooltip label={sitting ? 'Stand up' : 'Take the nearest seat'}>
        <IconButton
          icon={Armchair}
          aria-label={sitting ? 'Stand up' : 'Take the nearest seat'}
          active={sitting}
          variant="ghost"
          size="sm"
          onClick={seatMe}
        />
      </Tooltip>
    </>
  );
}

// ── Slides: presenter-only upload + step through a deck ──────────────────────
function SlidesSegment({
  manifest,
  onDeckChanged,
}: {
  manifest: WorldManifest;
  onDeckChanged: () => void;
}) {
  const me = useSessionStore((s) => s.me);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const screen = manifest.objects.find((o) => o.type === ObjectType.SCREEN);
  const liveIndex = useSlideStore((s) => (screen ? s.index[screen.id] : undefined));

  if (!me?.permissions.includes(Permission.PRESENT) || !screen) return null;

  const config = screen.config as { slides?: string[]; slideIndex?: number };
  const slides = config.slides ?? [];
  const index = liveIndex ?? config.slideIndex ?? 0;

  const goto = (next: number) => {
    if (next < 0 || next >= slides.length) return;
    useSlideStore.getState().setIndex(screen.id, next);
    sendSlideGoto(screen.id, next);
  };

  const onPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        urls.push(await api.uploadAsset(UploadKind.SLIDE, file));
      }
      await api.setDeck(manifest.spaceId, screen.id, urls);
      useSlideStore.getState().setIndex(screen.id, 0);
      sendSlideGoto(screen.id, 0);
      onDeckChanged();
      toast.success(`Deck uploaded — ${urls.length} slide${urls.length === 1 ? '' : 's'}.`);
    } catch (e) {
      toast.error(`Slide upload failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Divider />
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => void onPicked(e.target.files)}
      />
      {slides.length === 0 ? (
        <Button
          variant="ghost"
          size="sm"
          icon={Images}
          loading={busy}
          onClick={() => fileRef.current?.click()}
        >
          Slides
        </Button>
      ) : (
        <>
          <Tooltip label="Previous slide">
            <IconButton
              icon={ChevronLeft}
              aria-label="Previous slide"
              variant="ghost"
              size="sm"
              disabled={index <= 0}
              onClick={() => goto(index - 1)}
            />
          </Tooltip>
          <span className="px-0.5 text-xs tabular-nums text-brand-text/60">
            {index + 1}/{slides.length}
          </span>
          <Tooltip label="Next slide">
            <IconButton
              icon={ChevronRight}
              aria-label="Next slide"
              variant="ghost"
              size="sm"
              disabled={index >= slides.length - 1}
              onClick={() => goto(index + 1)}
            />
          </Tooltip>
          <Tooltip label="Replace deck">
            <IconButton
              icon={RotateCw}
              aria-label="Replace deck"
              variant="subtle"
              size="sm"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            />
          </Tooltip>
        </>
      )}
    </>
  );
}
