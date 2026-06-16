'use client';

import { useMemo } from 'react';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { useTexture } from '@react-three/drei';

/**
 * CC0 PBR texture sets (ambientCG, served from our own origin — never a
 * runtime CDN). useTexture caches one Texture per URL and `repeat` lives on
 * the Texture, so every surface gets cloned maps with its own tiling.
 */
export function useTiledPbr(
  base: 'wood' | 'carpet' | 'fabric',
  repeatX: number,
  repeatY: number,
): { map: Texture; normalMap: Texture; roughnessMap: Texture } {
  const maps = useTexture({
    map: `/textures/${base}_color.jpg`,
    normalMap: `/textures/${base}_normal.jpg`,
    roughnessMap: `/textures/${base}_rough.jpg`,
  });

  return useMemo(() => {
    const clone = (tex: Texture, srgb: boolean) => {
      const t = tex.clone();
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
      t.repeat.set(repeatX, repeatY);
      if (srgb) t.colorSpace = SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };
    return {
      map: clone(maps.map, true),
      normalMap: clone(maps.normalMap, false),
      roughnessMap: clone(maps.roughnessMap, false),
    };
  }, [maps, repeatX, repeatY]);
}

/**
 * Procedural hex-pattern carpet (venue style: gold linework on deep navy) —
 * drawn once on a canvas, tiled across the floor. Zero download, crisp at
 * any scale, and recolorable per tenant/scene.
 */
export function useHexCarpetTexture(
  background: string,
  line: string,
  repeatX: number,
  repeatY: number,
): CanvasTexture {
  return useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);

    // Subtle mottling so the carpet doesn't read as flat plastic.
    for (let i = 0; i < 1400; i++) {
      const x = (i * 1031) % size;
      const y = (i * 733) % size;
      ctx.fillStyle = (i & 1) === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(x, y, 2, 2);
    }

    const r = size / 8; // hex radius → 4×~3.5 hexes per tile
    const hexW = Math.sqrt(3) * r;
    ctx.strokeStyle = line;
    ctx.lineWidth = size / 110;
    ctx.globalAlpha = 0.85;
    for (let row = -1; row * 1.5 * r < size + 2 * r; row++) {
      for (let col = -1; col * hexW < size + hexW; col++) {
        const cx = col * hexW + (row % 2 ? hexW / 2 : 0);
        const cy = row * 1.5 * r;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + (i * Math.PI) / 3;
          const px = cx + r * Math.cos(a);
          const py = cy + r * Math.sin(a);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    const tex = new CanvasTexture(canvas);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [background, line, repeatX, repeatY]);
}
