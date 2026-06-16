'use client';

import { Text } from '@react-three/drei';
import { AvatarAnimation, type SceneObjectDTO } from '@mvs/shared';
import { useEditorStore } from '@/stores/editorStore';
import { usePlayerStore } from '@/stores/playerStore';
import { OBJECT_RENDERERS, type ObjectRendererProps } from './objects/renderers';

/**
 * Dispatches a scene object to its type renderer (registry in
 * ./objects/renderers) and owns the shared interaction plumbing: hover cursor,
 * click routing, and the engine-local `sit` action. Unknown types fall back to
 * a labeled box so bad data degrades visibly instead of invisibly.
 */
export function SceneObjectMesh({
  object,
  onInteract,
}: {
  object: SceneObjectDTO;
  onInteract: (id: string) => void;
}) {
  const { position, rotation, scale } = object.transform;
  const Renderer = OBJECT_RENDERERS[object.type] ?? FallbackBox;
  const editing = useEditorStore((s) => s.editing);
  const selected = useEditorStore((s) => s.selectedId === object.id);

  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        if (editing) {
          // In edit mode a click selects the object; the floor handler then
          // repositions it. Normal interaction is suppressed.
          useEditorStore.getState().select(object.id);
          return;
        }
        handleInteraction(object);
        onInteract(object.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = editing ? 'move' : 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    >
      <Renderer object={object} />
      {editing && <SelectionGizmo selected={selected} />}
    </group>
  );
}

/** A wireframe footprint + ring shown around editable objects (highlighted when selected). */
function SelectionGizmo({ selected }: { selected: boolean }) {
  const color = selected ? '#d9a441' : '#6c5ce7';
  return (
    <group position={[0, 0.02, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[selected ? 1.1 : 0.9, selected ? 1.25 : 1.0, 32]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.9 : 0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Engine-local interactions; everything else is the host page's concern. */
function handleInteraction(object: SceneObjectDTO) {
  const action = object.interaction?.onClick;

  if (action === 'sit' || (object.type === 'CHAIR' && action !== 'none')) {
    const { position, rotation } = object.transform;
    const sitRotation = (object.config as { sitRotation?: number }).sitRotation ?? rotation[1];
    usePlayerStore.getState().set({
      position: [position[0], position[1], position[2]],
      rotation: sitRotation,
      animation: AvatarAnimation.SIT,
      target: null,
    });
  }

  if (action === 'openLink') {
    const { url } = object.config as { url?: string };
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function FallbackBox({ object }: ObjectRendererProps) {
  const label = (object.config as { label?: string }).label ?? object.type;
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.6, 1, 0.2]} />
        <meshStandardMaterial color="#888888" />
      </mesh>
      <Text position={[0, 0.8, 0]} fontSize={0.22} color="#ffffff" anchorX="center">
        {label}
      </Text>
    </group>
  );
}
