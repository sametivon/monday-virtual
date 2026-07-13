'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { Mesh, type Group } from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { AvatarConfigSchema } from '@mvs/shared';
import { AVATAR_MODELS } from '@/engine/Avatar';
import { applyAvatarLook, defaultPartsFor, PART_LABELS, slotsFor, type GearSlots } from '@/engine/avatarLook';
import { UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { Button, Modal } from '@/ui/primitives';

const COLORS = ['#6c5ce7', '#00b894', '#0984e3', '#e17055', '#fdcb6e', '#e84393', '#d63031', '#2d3436'];

/** The office roster (S5). Legacy KayKit ids alias these files and are not
    offered — old saved configs render fine, new picks are people. */
const OFFICE_IDS = ['suit_m', 'suit_w', 'formal_w', 'casual_m', 'casual_w', 'hoodie_m', 'jacket_m', 'jacket_w'];
const CHOICES = OFFICE_IDS.map((id) => [id, AVATAR_MODELS[id]!] as const);

const SLOT_LABELS: Record<keyof GearSlots, string> = {
  headgear: 'Headgear',
  cape: 'Cape',
  mainHand: 'Main hand',
  offHand: 'Off hand',
};
const SLOT_ORDER: (keyof GearSlots)[] = ['headgear', 'cape', 'mainHand', 'offHand'];
/** Only the legacy KayKit bodies have toggleable gear attachments. */
const LEGACY_GEAR_IDS = new Set(['knight', 'mage', 'rogue', 'barbarian', 'rogue_hooded']);

/**
 * Avatar customizer (lives on the lobby page). Builds the modular KayKit look:
 * a character model plus per-slot gear and a cape color. The result persists to
 * the user's avatarConfig and rides the presence handshake so everyone sees it.
 *
 * NOTE: the rendering layer still supports an external-glTF body via
 * `avatarConfig.customModelUrl` (see HumanoidAvatar) — that path is intentionally
 * provider-agnostic and dormant. The realistic-avatar *creator* UI was removed
 * when Ready Player Me shut down and Avaturn moved to a paid-only SDK; this
 * picker no longer produces a customModelUrl, but old saved ones still render.
 */
export function AvatarPicker() {
  const [open, setOpen] = useState(false);
  const me = useSessionStore((s) => s.me);
  const current = (me?.user.avatarConfig ?? {}) as {
    modelId?: string;
    color?: string;
    parts?: string[];
  };
  const initialModel =
    current.modelId && OFFICE_IDS.includes(current.modelId) ? current.modelId : 'suit_m';
  const [modelId, setModelId] = useState(initialModel);
  const [color, setColor] = useState(current.color ?? COLORS[0]!);
  const [parts, setParts] = useState<string[]>(current.parts ?? defaultPartsFor(initialModel));
  const [saving, setSaving] = useState(false);

  if (!me) return null;

  const slots = slotsFor(modelId);

  const pickCharacter = (id: string) => {
    setModelId(id);
    setParts(defaultPartsFor(id)); // gear is per-character; start from its default kit
  };

  const equippedIn = (options: string[]) => parts.find((p) => options.includes(p)) ?? null;

  const equip = (options: string[], choice: string | null) =>
    setParts((prev) => [...prev.filter((p) => !options.includes(p)), ...(choice ? [choice] : [])]);

  const save = async () => {
    setSaving(true);
    try {
      const config = AvatarConfigSchema.parse({
        modelId,
        color,
        accessories: [],
        parts,
      });
      await api.updateAvatar(config);
      useSessionStore.getState().patchUser({ avatarConfig: config });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button variant="ghost" icon={UserRound} onClick={() => setOpen(true)}>
        Avatar
      </Button>
    );
  }

  return (
    <Modal title="Your avatar" size="lg" onClose={() => setOpen(false)}>
      <div className="flex min-h-0 gap-6 p-5">
          <div className="flex w-64 shrink-0 flex-col">
            <div
              className="h-[420px] overflow-hidden rounded-lg border border-line/10"
              style={{ background: 'radial-gradient(ellipse at 50% 35%, #ffffff 0%, #efe9df 75%)' }}
            >
              <ModelPreview modelId={modelId} parts={parts} color={color} />
            </div>
            <div className="mt-2 text-center text-xs text-brand-text/45">drag to rotate</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-brand-text/55">Character</div>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {CHOICES.map(([id, m]) => (
                <Chip key={id} active={modelId === id} onClick={() => pickCharacter(id)}>
                  {m.label}
                </Chip>
              ))}
            </div>

            {LEGACY_GEAR_IDS.has(modelId) && SLOT_ORDER.map((slot) => {
              const options = slots[slot];
              if (options.length === 0) return null;
              const equipped = equippedIn(options);
              return (
                <div key={slot} className="mb-4">
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-brand-text/55">{SLOT_LABELS[slot]}</div>
                  <div className="flex flex-wrap gap-2">
                    <Chip active={equipped === null} onClick={() => equip(options, null)}>
                      None
                    </Chip>
                    {options.map((part) => (
                      <Chip key={part} active={equipped === part} onClick={() => equip(options, part)}>
                        {PART_LABELS[part] ?? part}
                      </Chip>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-brand-text/55">Accent color</div>
            <div className="mb-6 flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  aria-label={`Accent color ${c}`}
                  className={`h-8 w-8 rounded-full transition ${
                    color === c
                      ? 'ring-2 ring-brand-primary ring-offset-2 ring-offset-brand-surface'
                      : 'opacity-75 hover:opacity-100'
                  }`}
                />
              ))}
            </div>

            <Button variant="accent" className="w-full" loading={saving} onClick={() => void save()}>
              Save avatar
            </Button>
          </div>
      </div>
    </Modal>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? 'border-transparent bg-brand-primary text-white shadow-e1'
          : 'border-line/15 bg-brand-surface text-brand-text/75 hover:border-brand-primary/40 hover:text-brand-text'
      }`}
    >
      {children}
    </button>
  );
}

/** Face the camera at rest — KayKit models are authored looking down +Z. */
const FACE_CAMERA = 0;

function ModelPreview({ modelId, parts, color }: { modelId: string; parts: string[]; color: string }) {
  // Rotation lives in refs so dragging never re-renders the canvas. No
  // auto-spin: a front-facing pose you can drag beats staring at a cape.
  const rotation = useRef(FACE_CAMERA);
  const dragging = useRef(false);

  return (
    <div
      className="h-full w-full cursor-grab active:cursor-grabbing"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (dragging.current) rotation.current += e.movementX * 0.012;
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerLeave={() => (dragging.current = false)}
    >
      <Canvas camera={{ position: [0, 0.1, 4.2], fov: 38 }} dpr={1.5}>
        <ambientLight intensity={1.0} />
        <directionalLight position={[2.5, 4, 4]} intensity={1.6} />
        <directionalLight position={[-3, 2, -3]} intensity={0.5} color="#cdd3ff" />
        <hemisphereLight args={['#ffffff', '#c9c0b2', 0.55]} />
        <Suspense fallback={null}>
          <PreviewModel key={modelId} modelId={modelId} parts={parts} color={color} rotation={rotation} />
        </Suspense>
      </Canvas>
    </div>
  );
}

function PreviewModel({
  modelId,
  parts,
  color,
  rotation,
}: {
  modelId: string;
  parts: string[];
  color: string;
  rotation: React.MutableRefObject<number>;
}) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF((AVATAR_MODELS[modelId] ?? AVATAR_MODELS.default!).file);

  const model = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    clone.traverse((n) => {
      if (n instanceof Mesh) n.castShadow = false;
    });
    return clone;
  }, [scene]);

  // Gear + cape color follow the controls live (in place — recloning would
  // detach the animation mixer's bindings).
  applyAvatarLook(model, modelId, parts, color);

  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    (window as unknown as { __previewModel?: unknown }).__previewModel = model;
  }

  const { actions } = useAnimations(animations, group);

  useFrame(() => {
    if (group.current) group.current.rotation.y = rotation.current;
    const idle = actions['Idle'];
    if (idle && !idle.isRunning()) idle.play();
  });

  // Shift down so the chest sits at the camera's eye line (office characters
  // stand ~1.85 tall; legacy KayKit + hat topped out around 2.4).
  return (
    <group ref={group} position={[0, -0.9, 0]}>
      <primitive object={model} />
    </group>
  );
}
