'use client';

import { useEffect, useRef } from 'react';
import type { SceneObjectDTO } from '@mvs/shared';
import { useScreenShareTile } from '@/media/useScreenShare';
import { useSlideStore } from '@/stores/slideStore';

/**
 * Fullscreen viewer for a stage SCREEN: click a screen in-world and the live
 * share (or current slide) opens as a whole, filling the window — so you can
 * actually read a presentation from any seat instead of squinting at the 3D
 * panel. Reliable HTML overlay (NOT a camera move). "Zoom out" / Esc closes it.
 */
export function ScreenViewer({ object, onClose }: { object: SceneObjectDTO; onClose: () => void }) {
  const tile = useScreenShareTile();
  const videoRef = useRef<HTMLVideoElement>(null);

  const config = object.config as { slides?: string[]; slideIndex?: number };
  const slides = config.slides ?? [];
  const liveIndex = useSlideStore((s) => s.index[object.id]);
  const slideUrl =
    slides.length > 0 ? slides[Math.min(liveIndex ?? config.slideIndex ?? 0, slides.length - 1)] : undefined;

  // Attach the live screen-share track to the overlay's <video>.
  useEffect(() => {
    const el = videoRef.current;
    const track = tile?.track;
    if (track && el) {
      track.attach(el);
      return () => {
        track.detach(el);
      };
    }
  }, [tile?.track]);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm">
      <button
        onClick={onClose}
        className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-red-600"
      >
        🔍 Zoom out
      </button>
      {tile ? (
        <video ref={videoRef} autoPlay playsInline muted className="max-h-full max-w-full object-contain" />
      ) : slideUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slideUrl} alt="Current slide" className="max-h-full max-w-full object-contain" />
      ) : (
        <div className="text-center text-white/60">
          <div className="text-3xl">🖥️</div>
          <p className="mt-3 text-sm">Nobody is presenting right now.</p>
          <p className="mt-1 text-xs text-white/40">When someone shares their screen, it shows here.</p>
        </div>
      )}
    </div>
  );
}
