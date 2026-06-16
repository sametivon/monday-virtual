'use client';

import { useRef, useState } from 'react';
import { Permission, UploadKind, type WorldManifest, ObjectType } from '@mvs/shared';
import { api } from '@/lib/api';
import { sendSlideGoto } from '@/realtime/useSpaceSocket';
import { useSessionStore } from '@/stores/sessionStore';
import { useSlideStore } from '@/stores/slideStore';

/**
 * Presenter slide controls (Phase 2): upload a deck of images to the space's
 * main SCREEN and step through them, synced to everyone via `slide:goto`. Only
 * presenters (PRESENT permission) see it, and only when a screen exists. A live
 * screen-share takes over the screen surface; slides resume when it stops.
 */
export function SlidesControl({ manifest, onDeckChanged }: { manifest: WorldManifest; onDeckChanged: () => void }) {
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
    useSlideStore.getState().setIndex(screen.id, next); // optimistic
    sendSlideGoto(screen.id, next);
  };

  const onPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      // Upload all picked images in order, then bind the deck to the screen.
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        urls.push(await api.uploadAsset(UploadKind.SLIDE, file));
      }
      await api.setDeck(manifest.spaceId, screen.id, urls);
      useSlideStore.getState().setIndex(screen.id, 0);
      sendSlideGoto(screen.id, 0);
      onDeckChanged(); // reload manifest so config.slides is in sync
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute bottom-28 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-black/55 px-3 py-2 text-sm backdrop-blur">
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
          className="rounded-lg bg-white/10 px-3 py-1.5 transition hover:bg-white/20 disabled:opacity-50"
        >
          {busy ? 'Uploading…' : '📑 Upload slides'}
        </button>
      ) : (
        <>
          <button
            onClick={() => goto(index - 1)}
            disabled={index <= 0}
            className="rounded-lg bg-white/10 px-3 py-1.5 transition hover:bg-white/20 disabled:opacity-30"
          >
            ‹ Prev
          </button>
          <span className="px-1 text-xs text-white/70">
            Slide {index + 1} / {slides.length}
          </span>
          <button
            onClick={() => goto(index + 1)}
            disabled={index >= slides.length - 1}
            className="rounded-lg bg-white/10 px-3 py-1.5 transition hover:bg-white/20 disabled:opacity-30"
          >
            Next ›
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="ml-1 rounded-lg px-2 py-1.5 text-white/50 transition hover:text-white disabled:opacity-50"
            title="Replace deck"
          >
            {busy ? '…' : '↻'}
          </button>
        </>
      )}
      {error && <span className="text-xs text-red-400">⚠️ {error}</span>}
    </div>
  );
}
