import { useEditorStore } from '@/stores/editorStore';
import { usePlayerStore } from '@/stores/playerStore';

/**
 * Floor/ground click behaviour, shared by every walkable surface. In edit mode
 * with an object selected, a floor click repositions that object; otherwise it
 * is the normal click-to-walk target.
 */
export function onFloorClick(x: number, z: number): void {
  const editor = useEditorStore.getState();
  if (editor.editing && editor.selectedId) {
    editor.requestMove(x, z);
    return;
  }
  usePlayerStore.getState().set({ target: [x, z] });
}
