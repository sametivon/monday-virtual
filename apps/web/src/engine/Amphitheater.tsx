'use client';

import { useMemo } from 'react';
import { ExtrudeGeometry, Shape } from 'three';
import type { Amphitheater as Bowl } from '@mvs/shared';
import { onFloorClick } from './floorClick';

/**
 * Renders the raked amphitheater bowl as nested SOLID steps: each terrace is an
 * annular sector extruded from the ground up to its height, from its inner
 * radius out to the bowl edge. Stacked, taller/narrower terraces sit on shorter/
 * wider ones → a real staircase bowl. The exposed band of step i (height
 * (i+1)·riser) is where seat row i sits, matching `bowlHeight()` in @mvs/shared
 * (used by movement) so avatars walk the steps.
 *
 * Authored in the Shape's XY plane then laid flat with rotateX(-90°): a world
 * fan angle `a` (seats use x=sin a, z=cos a) maps to shape angle φ = a − π/2, so
 * the sector covers exactly the seating fan.
 */
function terraceGeometry(
  innerR: number,
  outerR: number,
  thetaStart: number,
  thetaLength: number,
  height: number,
): ExtrudeGeometry {
  const seg = 64;
  const shape = new Shape();
  shape.moveTo(Math.cos(thetaStart) * outerR, Math.sin(thetaStart) * outerR);
  for (let i = 1; i <= seg; i++) {
    const t = thetaStart + (thetaLength * i) / seg;
    shape.lineTo(Math.cos(t) * outerR, Math.sin(t) * outerR);
  }
  for (let i = seg; i >= 0; i--) {
    const t = thetaStart + (thetaLength * i) / seg;
    shape.lineTo(Math.cos(t) * innerR, Math.sin(t) * innerR);
  }
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function Amphitheater({
  bowl,
  carpetColor = '#37333c',
}: {
  bowl: Bowl;
  carpetColor?: string;
  /** Kept for call-site compatibility; the bowl no longer glows (S3). */
  accentColor?: string;
}) {
  const [cx, cz] = bowl.center;
  const thetaStart = -bowl.halfArc - Math.PI / 2;
  const thetaLength = 2 * bowl.halfArc;
  const outerR = bowl.innerRadius + bowl.rowDepth * bowl.rows;

  const steps = useMemo(() => {
    const out: { geo: ExtrudeGeometry; lipInner: number; y: number }[] = [];
    for (let i = 0; i < bowl.rows; i++) {
      const innerR = bowl.innerRadius + bowl.rowDepth * i;
      const y = (i + 1) * bowl.riser;
      out.push({ geo: terraceGeometry(innerR, outerR, thetaStart, thetaLength, y), lipInner: innerR, y });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bowl.innerRadius, bowl.rowDepth, bowl.riser, bowl.rows, bowl.halfArc]);

  return (
    <group position={[cx, 0, cz]}>
      {steps.map((step, i) => (
        <mesh
          key={i}
          geometry={step.geo}
          receiveShadow
          castShadow
          onClick={(e) => {
            e.stopPropagation();
            onFloorClick(e.point.x, e.point.z);
          }}
        >
          <meshStandardMaterial color={carpetColor} roughness={0.92} metalness={0.04} />
        </mesh>
      ))}
      {/* Pale step nosing on each leading edge — wayfinding through material
          contrast, not glow (S3). */}
      {steps.map((step, i) => (
        <mesh key={`lip-${i}`} position={[0, step.y + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[step.lipInner, step.lipInner + 0.09, 64, 1, thetaStart, thetaLength]} />
          <meshStandardMaterial color="#8f887b" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
