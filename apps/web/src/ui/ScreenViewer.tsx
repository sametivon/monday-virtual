'use client';

import { useEffect, useRef } from 'react';
import { Minimize2, MonitorOff } from 'lucide-react';
import type { SceneObjectDTO } from '@mvs/shared';
import { useScreenShareTile } from '@/media/useScreenShare';
import { useSlideStore } from '@/stores/slideStore';
import { Button } from '@/ui/primitives';

/**
 * Fullscreen viewer for a stage SCREEN: click a screen in-world and the live
 * share (or current slide) opens as a whole, filling the window — so you can
 * actually read a presentation from any seat instead of squinting at the 3D
 * panel. Reliable HTML overlay (NOT a camera move). "Exit fullscreen" / Esc
 * closes it.
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
    // Content-viewing surface: intentionally dark (ink at 95%), like a cinema.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-text/95 backdrop-blur-sm">
      <Button
        variant="ghost"
        icon={Minimize2}
        onClick={onClose}
        className="absolute left-4 top-4 z-10"
      >
        Exit fullscreen
      </Button>
      {tile ? (
        <video ref={videoRef} autoPlay playsInline muted className="max-h-full max-w-full object-contain" />
      ) : slideUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slideUrl} alt="Current slide" className="max-h-full max-w-full object-contain" />
      ) : (
        // Hand-rolled empty state: EmptyState's ink text would vanish on the
        // dark viewer, so this block is white-tinted on purpose.
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white/80">
            <MonitorOff size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <p className="font-display text-lg text-white/90">Nobody is presenting right now</p>
          <p className="text-sm text-white/55">When someone shares their screen, it shows here.</p>
        </div>
      )}
    </div>
  );
}
