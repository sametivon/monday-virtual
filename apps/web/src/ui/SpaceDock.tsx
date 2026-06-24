'use client';

import { useRef, useState } from 'react';
import { Permission, UploadKind, ObjectType, type WorldManifest } from '@mvs/shared';
import { api } from '@/lib/api';
import { media, useMediaStore } from '@/media/mediaController';
import { sendHandRaise, sendReaction, sendSlideGoto } from '@/realtime/useSpaceSocket';
import { useSessionStore } from '@/stores/sessionStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useSlideStore } from '@/stores/slideStore';

const EMOJIS = ['👏', '❤️', '😂', '🎉', '👍'];

/**
 * The single bottom control dock for a space: proximity voice + mic/present,
 * raise-hand + emoji reactions (in a popover so they don't crowd the bar), and
 * presenter slide controls. Replaces the three separate floating bars that used
 * to stack on top of each other.
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

  if (!me) return null;

  return (
    <>
      {notice && (
        <div className="absolute bottom-24 left-1/2 w-max max-w-md -translate-x-1/2 rounded-lg bg-amber-500/95 px-4 py-2 text-sm text-black shadow-lg">
          {notice}
        </div>
      )}
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl bg-black/55 px-3 py-2 shadow-xl ring-1 ring-white/10 backdrop-blur">
        <MediaSegment />
        <Divider />
        <ReactionsSegment />
        <SlidesSegment manifest={manifest} onDeckChanged={onDeckChanged} />
      </div>
    </>
  );
}

function Divider() {
  return <span className="mx-0.5 h-6 w-px shrink-0 bg-white/15" />;
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm transition ${
        on ? 'bg-brand-primary text-white shadow-inner' : 'bg-white/10 hover:bg-white/20'
      }`}
    >
      {label}
    </button>
  );
}

// ── Media: proximity voice / mic / present (or table controls) ───────────────
function MediaSegment() {
  const { mode, tableLabel, micEnabled, camEnabled, screenEnabled, voiceCount, error } =
    useMediaStore();

  if (mode === 'off') {
    return (
      <span className="px-2 text-xs text-white/50">
        {error ? `voice unavailable: ${error}` : '🔇 voice off'}
      </span>
    );
  }
  if (mode === 'connecting') {
    return <span className="px-2 text-xs text-white/60">connecting voice…</span>;
  }

  const inTable = mode === 'table';
  return (
    <>
      <span className="px-1 text-xs text-white/60">
        {inTable ? `🟣 ${tableLabel ?? 'Meeting'}` : '🔊 nearby'} · {voiceCount + 1}
      </span>
      <Toggle on={micEnabled} onClick={() => void media.toggleMic()} label={micEnabled ? '🎤 On' : '🎤 Off'} />
      {inTable ? (
        <>
          <Toggle on={camEnabled} onClick={() => void media.toggleCamera()} label={camEnabled ? '📷 On' : '📷 Off'} />
          <Toggle on={screenEnabled} onClick={() => void media.toggleScreenShare()} label={screenEnabled ? '🖥️ Sharing' : '🖥️ Share'} />
          <button
            onClick={() => void media.leaveTable()}
            className="rounded-lg bg-red-500/70 px-3 py-1.5 text-sm transition hover:bg-red-500"
          >
            Leave
          </button>
        </>
      ) : (
        <Toggle
          on={screenEnabled}
          onClick={() => void media.toggleScreenShare()}
          label={screenEnabled ? '🖥️ Presenting' : '🖥️ Present'}
        />
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
      <button
        onClick={() => sendHandRaise(!raised)}
        title={raised ? 'Lower hand' : 'Raise hand'}
        className={`rounded-lg px-2.5 py-1.5 text-lg transition ${
          raised ? 'bg-brand-primary' : 'bg-white/10 hover:bg-white/20'
        }`}
      >
        ✋
      </button>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          title="React"
          className={`rounded-lg px-2.5 py-1.5 text-lg transition ${
            open ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'
          }`}
        >
          😊
        </button>
        {open && (
          <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-black/80 px-2 py-1.5 shadow-xl ring-1 ring-white/10 backdrop-blur">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  sendReaction(emoji);
                  setOpen(false);
                }}
                className="rounded-lg px-2 py-1 text-xl transition hover:bg-white/15"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
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
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
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
    } catch (e) {
      setError((e as Error).message);
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
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm transition hover:bg-white/20 disabled:opacity-50"
        >
          {busy ? 'Uploading…' : '📑 Slides'}
        </button>
      ) : (
        <>
          <button
            onClick={() => goto(index - 1)}
            disabled={index <= 0}
            className="rounded-lg bg-white/10 px-2.5 py-1.5 text-sm transition hover:bg-white/20 disabled:opacity-30"
          >
            ‹
          </button>
          <span className="px-1 text-xs text-white/70">
            {index + 1}/{slides.length}
          </span>
          <button
            onClick={() => goto(index + 1)}
            disabled={index >= slides.length - 1}
            className="rounded-lg bg-white/10 px-2.5 py-1.5 text-sm transition hover:bg-white/20 disabled:opacity-30"
          >
            ›
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded-lg px-2 py-1.5 text-sm text-white/50 transition hover:text-white disabled:opacity-50"
            title="Replace deck"
          >
            {busy ? '…' : '↻'}
          </button>
        </>
      )}
      {error && <span className="px-1 text-xs text-red-400">⚠️ {error}</span>}
    </>
  );
}
