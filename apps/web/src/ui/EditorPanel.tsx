'use client';

import { useEffect, useState } from 'react';
import { ObjectType, Permission, type WorldManifest } from '@mvs/shared';
import { api } from '@/lib/api';
import { useEditorStore } from '@/stores/editorStore';
import { useSessionStore } from '@/stores/sessionStore';

/** Object types a user can drop from the palette (spawn points are data, not props). */
const PALETTE: { type: ObjectType; label: string }[] = [
  { type: ObjectType.SCREEN, label: '🖥️ Screen' },
  { type: ObjectType.WHITEBOARD, label: '🖊️ Whiteboard' },
  { type: ObjectType.DASHBOARD, label: '📊 Dashboard' },
  { type: ObjectType.MEETING_TABLE, label: '🟤 Table' },
  { type: ObjectType.CHAIR, label: '🪑 Chair' },
  { type: ObjectType.DESK, label: '🖥️ Desk' },
  { type: ObjectType.PORTAL, label: '🌀 Portal' },
  { type: ObjectType.LINK, label: '🔗 Link' },
  { type: ObjectType.VIDEO, label: '🎬 Video' },
];

/**
 * Drag-and-drop scene editor (space:edit). Toggle edit mode, then: click an
 * object to select it, click the floor to move it, tweak rotation/scale, delete
 * it, or drop a new object from the palette. Persists via the object CRUD
 * endpoints; the page reloads the manifest after each change.
 */
export function EditorPanel({ manifest, onChanged }: { manifest: WorldManifest; onChanged: () => void }) {
  const me = useSessionStore((s) => s.me);
  const editing = useEditorStore((s) => s.editing);
  const selectedId = useEditorStore((s) => s.selectedId);
  const pendingMove = useEditorStore((s) => s.pendingMove);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEdit = me?.permissions.includes(Permission.SPACE_EDIT) ?? false;
  const selected = manifest.objects.find((o) => o.id === selectedId) ?? null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Consume a floor-click move request: persist the new position, keep y/rotation.
  useEffect(() => {
    if (!pendingMove || !editing) return;
    const obj = manifest.objects.find((o) => o.id === pendingMove.objectId);
    useEditorStore.getState().clearPendingMove();
    if (!obj) return;
    const t = obj.transform;
    void run(() =>
      api.updateObject(manifest.spaceId, obj.id, {
        transform: { position: [pendingMove.x, t.position[1], pendingMove.z], rotation: t.rotation, scale: t.scale },
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMove?.ts]);

  if (!canEdit) return null;

  if (!editing) {
    return (
      <button
        onClick={() => useEditorStore.getState().setEditing(true)}
        className="absolute right-4 top-16 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm backdrop-blur transition hover:border-brand-primary"
      >
        ✏️ Edit scene
      </button>
    );
  }

  const updateTransform = (patch: Partial<{ rotationY: number; scale: number }>) => {
    if (!selected) return;
    const t = selected.transform;
    const rotation: [number, number, number] =
      patch.rotationY !== undefined ? [t.rotation[0], patch.rotationY, t.rotation[2]] : t.rotation;
    const s = patch.scale ?? t.scale[0];
    void run(() =>
      api.updateObject(manifest.spaceId, selected.id, {
        transform: { position: t.position, rotation, scale: [s, s, s] },
      }),
    );
  };

  return (
    <div className="absolute right-4 top-16 w-64 rounded-xl border border-brand-primary/40 bg-black/70 p-3 text-sm backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">✏️ Scene editor</span>
        <button
          onClick={() => useEditorStore.getState().setEditing(false)}
          className="rounded bg-white/10 px-2 py-0.5 text-xs transition hover:bg-white/20"
        >
          Done
        </button>
      </div>

      {selected ? (
        <div className="mb-3 rounded-lg bg-white/5 p-2">
          <div className="mb-2 text-xs text-white/60">
            Selected: <span className="text-white">{(selected.config as { label?: string }).label ?? selected.type}</span>
          </div>
          <p className="mb-2 text-xs text-white/40">Click the floor to move it.</p>

          <label className="mb-1 block text-xs text-white/60">Rotation</label>
          <input
            key={`rot-${selected.id}`}
            type="range"
            min={0}
            max={Math.PI * 2}
            step={0.05}
            defaultValue={selected.transform.rotation[1]}
            // Persist on release, not on every drag tick, to avoid PATCH spam.
            onPointerUp={(e) => updateTransform({ rotationY: Number(e.currentTarget.value) })}
            className="mb-2 w-full"
          />

          <label className="mb-1 block text-xs text-white/60">Scale</label>
          <input
            key={`scale-${selected.id}`}
            type="range"
            min={0.4}
            max={2.5}
            step={0.05}
            defaultValue={selected.transform.scale[0]}
            onPointerUp={(e) => updateTransform({ scale: Number(e.currentTarget.value) })}
            className="mb-3 w-full"
          />

          <button
            onClick={() =>
              void run(async () => {
                await api.deleteObject(manifest.spaceId, selected.id);
                useEditorStore.getState().select(null);
              })
            }
            disabled={busy}
            className="w-full rounded-lg bg-red-500/70 py-1.5 text-xs transition hover:bg-red-500 disabled:opacity-50"
          >
            🗑 Delete object
          </button>
        </div>
      ) : (
        <p className="mb-3 text-xs text-white/50">Click an object to select it, or add one below.</p>
      )}

      <div className="mb-1 text-xs text-white/60">Add object</div>
      <div className="grid grid-cols-2 gap-1">
        {PALETTE.map((p) => (
          <button
            key={p.type}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                // Drop a little in front of the rear wall, at the room center-ish.
                // Server fills per-type default config (required fields, label).
                const created = await api.createObject(manifest.spaceId, {
                  type: p.type,
                  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                });
                useEditorStore.getState().select(created.id);
              })
            }
            className="rounded-lg bg-white/10 px-2 py-1.5 text-left text-xs transition hover:bg-white/20 disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-2 text-xs text-red-400">⚠️ {error}</p>}
    </div>
  );
}
