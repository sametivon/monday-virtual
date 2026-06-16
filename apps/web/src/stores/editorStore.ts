import { create } from 'zustand';

/**
 * Scene-editor UI state (space:edit only). When `editing` is on, clicking an
 * object selects it instead of triggering its normal interaction, and clicking
 * the floor repositions the selected object instead of click-to-walk.
 */
/** A requested in-world move from a floor click; the page persists + clears it. */
export interface PendingMove {
  objectId: string;
  x: number;
  z: number;
  /** Nonce so identical coordinates still trigger a fresh move. */
  ts: number;
}

interface EditorState {
  editing: boolean;
  selectedId: string | null;
  pendingMove: PendingMove | null;
  toggle: () => void;
  setEditing: (on: boolean) => void;
  select: (id: string | null) => void;
  /** Floor click in edit mode: request the selected object move to (x,z). */
  requestMove: (x: number, z: number) => void;
  clearPendingMove: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  editing: false,
  selectedId: null,
  pendingMove: null,
  toggle: () => set((s) => ({ editing: !s.editing, selectedId: null, pendingMove: null })),
  setEditing: (on) => set({ editing: on, selectedId: null, pendingMove: null }),
  select: (id) => set({ selectedId: id }),
  requestMove: (x, z) => {
    const { selectedId } = get();
    if (!selectedId) return;
    set({ pendingMove: { objectId: selectedId, x, z, ts: Date.now() } });
  },
  clearPendingMove: () => set({ pendingMove: null }),
}));
