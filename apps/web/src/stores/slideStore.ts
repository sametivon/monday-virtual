import { create } from 'zustand';

/**
 * Active slide index per SCREEN object. The deck (image URLs) lives in the
 * object's scene config (manifest); only the live-changing index is tracked
 * here, fed by the `slide:goto` socket event so every viewer stays in sync.
 */
interface SlideState {
  /** objectId → current slide index. */
  index: Record<string, number>;
  setIndex: (objectId: string, index: number) => void;
  reset: () => void;
}

export const useSlideStore = create<SlideState>((set) => ({
  index: {},
  setIndex: (objectId, index) =>
    set((s) => ({ index: { ...s.index, [objectId]: index } })),
  reset: () => set({ index: {} }),
}));
