import { create } from 'zustand';

export type PerfTier = 'high' | 'medium' | 'low';

interface PerfTierState {
  tier: PerfTier;
  up: () => void;
  down: () => void;
  floor: () => void;
}

const ORDER: PerfTier[] = ['low', 'medium', 'high'];

/**
 * Visual-quality tier, driven by drei's PerformanceMonitor in SceneCanvas.
 * high/medium render IBL + post-processing; low is the bare pipeline so weak
 * GPUs keep their framerate. STARTS AT MEDIUM and earns high on sustained
 * headroom — first impression is never janky (perf inversion, S1). DPR
 * mapping stays in SceneCanvas — this store only gates visual richness.
 */
export const usePerfTier = create<PerfTierState>((set) => ({
  tier: 'medium',
  up: () => set((s) => ({ tier: ORDER[Math.min(ORDER.indexOf(s.tier) + 1, 2)]! })),
  down: () => set((s) => ({ tier: ORDER[Math.max(ORDER.indexOf(s.tier) - 1, 0)]! })),
  floor: () => set({ tier: 'low' }),
}));
