'use client';

import { inStageZone, type SceneConfig } from '@mvs/shared';
import { remoteTransforms } from '@/stores/presenceStore';
import { usePlayerStore } from '@/stores/playerStore';

type SpatialConfig = SceneConfig['spatialAudio'];
type Stage = SceneConfig['stage'];

interface Voice {
  sink: HTMLAudioElement; // Chrome quirk: a remote WebRTC track must feed a media element before WebAudio hears it
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  panner: StereoPannerNode;
  /** Last computed targets — what the spatial math decided, regardless of
   * AudioContext state (suspended contexts freeze AudioParam values). */
  targetVolume: number;
  targetPan: number;
}

const UPDATE_MS = 100; // 10Hz — matches the presence tick; gains ramp between updates

/**
 * Spatial audio (M4): every remote voice runs through gain + stereo-pan nodes
 * driven by avatar distance and bearing (LiveKit participant identity ===
 * presence userId). In table mode (`setSpatial(false)`) falloff is bypassed —
 * everyone at the table is full volume, per ARCHITECTURE §media.
 */
export class SpatialAudioGraph {
  private ctx: AudioContext | null = null;
  private readonly voices = new Map<string, Voice>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private spatial = true;

  constructor(
    private config: SpatialConfig,
    /** Optional presenter stage: speakers inside it bypass distance falloff. */
    private stage?: Stage,
  ) {}

  /** Browsers gate AudioContext on a user gesture; resume on the first click. */
  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const resume = () => void this.ctx?.resume();
      window.addEventListener('pointerdown', resume, { once: true });
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  addVoice(userId: string, mediaTrack: MediaStreamTrack): void {
    this.removeVoice(userId);
    const ctx = this.ensureCtx();
    const stream = new MediaStream([mediaTrack]);

    const sink = new Audio();
    sink.srcObject = stream;
    sink.muted = true; // audible path is the WebAudio graph, not this element

    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    source.connect(gain).connect(panner).connect(ctx.destination);

    this.voices.set(userId, { sink, source, gain, panner, targetVolume: 1, targetPan: 0 });
    if (!this.timer) this.timer = setInterval(this.update, UPDATE_MS);
  }

  removeVoice(userId: string): void {
    const v = this.voices.get(userId);
    if (!v) return;
    v.source.disconnect();
    v.sink.srcObject = null;
    this.voices.delete(userId);
    if (this.voices.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Table mode bypasses distance falloff (full volume, centered). */
  setSpatial(enabled: boolean): void {
    this.spatial = enabled;
    this.update();
  }

  /** Current per-user computed gains — used by tests and the debug overlay. */
  debugGains(): Record<string, number> {
    return Object.fromEntries([...this.voices].map(([id, v]) => [id, v.targetVolume]));
  }

  dispose(): void {
    for (const id of [...this.voices.keys()]) this.removeVoice(id);
    void this.ctx?.close();
    this.ctx = null;
  }

  private update = (): void => {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const me = usePlayerStore.getState();

    for (const [userId, v] of this.voices) {
      let volume = 1;
      let pan = 0;

      if (this.spatial) {
        const t = remoteTransforms.get(userId);
        if (!t) {
          volume = 0; // in the room but not in presence → inaudible
        } else if (this.stage && inStageZone(this.stage, t.target.x, t.target.z)) {
          // On stage = presenting: full volume for the whole space, centered.
          volume = 1;
          pan = 0;
        } else {
          // Use the authoritative tick target, NOT the render-interpolated
          // `current`: the frame loop (which advances `current`) freezes in
          // backgrounded tabs, but audio must keep tracking positions.
          const dx = t.target.x - me.position[0];
          const dz = t.target.z - me.position[2];
          const distance = Math.hypot(dx, dz);
          volume = this.volumeFor(distance);
          // Bearing relative to the avatar's facing; soften so voices never
          // collapse fully into one ear.
          pan = clamp(Math.sin(Math.atan2(dx, dz) - me.rotation), -1, 1) * 0.7;
        }
      }

      v.targetVolume = volume;
      v.targetPan = pan;
      // Short ramps avoid zipper noise between updates.
      v.gain.gain.setTargetAtTime(volume, now, 0.05);
      v.panner.pan.setTargetAtTime(pan, now, 0.05);
    }
  };

  private volumeFor(distance: number): number {
    const { minDistance, maxDistance, rolloff } = this.config;
    if (distance <= minDistance) return 1;
    if (distance >= maxDistance) return 0;
    const t = (distance - minDistance) / (maxDistance - minDistance);
    switch (rolloff) {
      case 'linear':
        return 1 - t;
      case 'exponential':
        return (1 - t) ** 2;
      case 'inverse':
      default:
        return (1 - t) / (1 + 3 * t); // inverse-like, smooth to zero at max
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
