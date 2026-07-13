'use client';

import { useEffect, useState } from 'react';
import {
  Armchair,
  Circle,
  CircleDot,
  Clapperboard,
  LayoutDashboard,
  Link2,
  Monitor,
  PenLine,
  PencilRuler,
  Table2,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { ObjectType, Permission, type SceneObjectDTO, type WorldManifest } from '@mvs/shared';
import { api } from '@/lib/api';
import { useEditorStore } from '@/stores/editorStore';
import { useSessionStore } from '@/stores/sessionStore';
import { Button, Panel, toast } from '@/ui/primitives';

/** Object types a user can drop from the palette (spawn points are data, not props). */
const PALETTE: { type: ObjectType; label: string; icon: LucideIcon }[] = [
  { type: ObjectType.SCREEN, label: 'Screen', icon: Monitor },
  { type: ObjectType.WHITEBOARD, label: 'Whiteboard', icon: PenLine },
  { type: ObjectType.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
  { type: ObjectType.MEETING_TABLE, label: 'Table', icon: CircleDot },
  { type: ObjectType.CHAIR, label: 'Chair', icon: Armchair },
  { type: ObjectType.DESK, label: 'Desk', icon: Table2 },
  { type: ObjectType.PORTAL, label: 'Portal', icon: Circle },
  { type: ObjectType.LINK, label: 'Link', icon: Link2 },
  { type: ObjectType.VIDEO, label: 'Video', icon: Clapperboard },
];

/**
 * Drag-and-drop scene editor (space:edit). Toggle edit mode, then: click an
 * object to select it, click the floor to move it, tweak rotation/scale, delete
 * it, or drop a new object from the palette. Transform edits apply optimistically
 * and persist in the background; add/delete refetch the manifest.
 */
export function EditorPanel({
  manifest,
  onChanged,
  onPatchTransform,
}: {
  manifest: WorldManifest;
  onChanged: () => void;
  onPatchTransform: (objectId: string, transform: SceneObjectDTO['transform']) => void;
}) {
  const me = useSessionStore((s) => s.me);
  const editing = useEditorStore((s) => s.editing);
  const selectedId = useEditorStore((s) => s.selectedId);
  const pendingMove = useEditorStore((s) => s.pendingMove);
  const [busy, setBusy] = useState(false);
  const [liveScale, setLiveScale] = useState<number | null>(null);

  const canEdit = me?.permissions.includes(Permission.SPACE_EDIT) ?? false;
  const selected = manifest.objects.find((o) => o.id === selectedId) ?? null;

  // Add / delete change the object SET, so they refetch the manifest.
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Transform edits (move/scale/rotate): update locally for an instant response,
  // then persist in the background — no await, no full-scene refetch, no avatar
  // teleport.
  const saveTransform = (objectId: string, transform: SceneObjectDTO['transform']) => {
    onPatchTransform(objectId, transform);
    void api
      .updateObject(manifest.spaceId, objectId, { transform })
      .catch((e) => toast.error((e as Error).message));
  };

  // Consume a floor-click move request: reposition the selected object, keep y/rotation/scale.
  useEffect(() => {
    if (!pendingMove || !editing) return;
    const obj = manifest.objects.find((o) => o.id === pendingMove.objectId);
    useEditorStore.getState().clearPendingMove();
    if (!obj) return;
    const t = obj.transform;
    saveTransform(obj.id, {
      position: [pendingMove.x, t.position[1], pendingMove.z],
      rotation: t.rotation,
      scale: t.scale,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMove?.ts]);

  if (!canEdit) return null;

  if (!editing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        icon={PencilRuler}
        className="absolute right-4 top-16"
        onClick={() => useEditorStore.getState().setEditing(true)}
      >
        Edit scene
      </Button>
    );
  }

  const updateTransform = (patch: Partial<{ rotationY: number; scale: number }>) => {
    if (!selected) return;
    const t = selected.transform;
    const rotation: [number, number, number] =
      patch.rotationY !== undefined ? [t.rotation[0], patch.rotationY, t.rotation[2]] : t.rotation;
    const s = patch.scale ?? t.scale[0];
    saveTransform(selected.id, { position: t.position, rotation, scale: [s, s, s] });
  };

  // Live preview while dragging the scale slider — local only (no network),
  // so the object resizes in real time; the network save happens on release.
  const previewScale = (s: number) => {
    if (!selected) return;
    const t = selected.transform;
    onPatchTransform(selected.id, { position: t.position, rotation: t.rotation, scale: [s, s, s] });
  };

  return (
    <Panel variant="glass-strong" className="absolute right-4 top-16 w-64 text-sm">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-medium text-brand-text">
          <PencilRuler size={14} strokeWidth={1.75} aria-hidden="true" />
          Scene editor
        </span>
        <Button variant="subtle" size="sm" onClick={() => useEditorStore.getState().setEditing(false)}>
          Done
        </Button>
      </div>

      {selected ? (
        <div className="mb-3 rounded-md bg-brand-bg p-2.5">
          <div className="mb-1 text-xs text-brand-text/60">
            Selected:{' '}
            <span className="font-medium text-brand-text">
              {(selected.config as { label?: string }).label ?? selected.type}
            </span>
          </div>
          <p className="mb-2 text-xs text-brand-text/55">Click the floor to move it.</p>

          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-brand-text/55">
            Rotation
          </label>
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
            style={{ accentColor: 'var(--brand-primary)' }}
          />

          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-brand-text/55">
            Scale ·{' '}
            <span className="normal-case tabular-nums text-brand-text">
              {(liveScale ?? selected.transform.scale[0]).toFixed(1)}×
            </span>
          </label>
          <input
            key={`scale-${selected.id}`}
            type="range"
            min={0.3}
            max={20}
            step={0.1}
            defaultValue={selected.transform.scale[0]}
            // Live resize while dragging; persist on release.
            onChange={(e) => {
              const s = Number(e.currentTarget.value);
              setLiveScale(s);
              previewScale(s);
            }}
            onPointerUp={(e) => {
              setLiveScale(null);
              updateTransform({ scale: Number(e.currentTarget.value) });
            }}
            className="mb-3 w-full"
            style={{ accentColor: 'var(--brand-primary)' }}
          />

          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            className="w-full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api.deleteObject(manifest.spaceId, selected.id);
                useEditorStore.getState().select(null);
              })
            }
          >
            Delete object
          </Button>
        </div>
      ) : (
        <p className="mb-3 text-xs text-brand-text/55">
          Click an object to select it, or add one below.
        </p>
      )}

      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-brand-text/55">
        Add object
      </div>
      <div className="grid grid-cols-2 gap-1">
        {PALETTE.map((p) => (
          <Button
            key={p.type}
            variant="ghost"
            size="sm"
            icon={p.icon}
            disabled={busy}
            className="justify-start"
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
          >
            {p.label}
          </Button>
        ))}
      </div>
    </Panel>
  );
}
