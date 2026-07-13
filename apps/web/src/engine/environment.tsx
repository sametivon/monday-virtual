'use client';

import { Environment } from '@react-three/drei';

/**
 * Image-based lighting: maps the scene's `environment.skybox` preset string
 * (long defined in configs, never rendered until now) to a locally-hosted HDRI.
 * Several presets share a file — two 1k HDRs cover the moods without bloating
 * the bundle. ALWAYS local files, never drei's `preset=` (that fetches a CDN
 * at runtime, which we don't allow in production).
 *
 * The HDRI feeds reflections/material response only (background stays the
 * room's color) — it's what makes standard materials stop looking like matte
 * plastic.
 */
const SKYBOX_FILES: Record<string, string> = {
  studio: '/hdri/studio.hdr',
  city: '/hdri/interior.hdr',
  apartment: '/hdri/interior.hdr',
  warehouse: '/hdri/studio.hdr',
  sunset: '/hdri/interior.hdr',
};

export function SceneEnvironment({ skybox }: { skybox: string }) {
  const files = SKYBOX_FILES[skybox] ?? SKYBOX_FILES.studio!;
  return <Environment files={files} environmentIntensity={0.55} />;
}
