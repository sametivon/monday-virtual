import { AOI_CELL_SIZE, AOI_RADIUS } from '@mvs/shared';

/** A point with an id on the XZ plane. */
export interface AoiPoint {
  id: string;
  x: number;
  z: number;
}

/** Integer cell coordinate of a world XZ position. */
export function cellCoord(x: number, z: number): [number, number] {
  return [Math.floor(x / AOI_CELL_SIZE), Math.floor(z / AOI_CELL_SIZE)];
}

/** Cell coordinate as a single string key for the spatial hash. */
function cellKey(x: number, z: number): string {
  const [cx, cz] = cellCoord(x, z);
  return `${cx},${cz}`;
}

/**
 * The 3×3 block of cell coordinates centred on (cx, cz). A mover at its own
 * cell is of interest to recipients in exactly these cells (and vice-versa, by
 * symmetry), so a mover's tick update is emitted to the cell rooms of this
 * block. Used for cross-node interest management: the Socket.IO Redis adapter
 * fans each cell-room emit to subscribed sockets on every node.
 */
export function neighborCells(cx: number, cz: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) out.push([cx + dx, cz + dz]);
  }
  return out;
}

/**
 * Server-side area-of-interest via a uniform spatial hash. Buckets every
 * candidate point into a grid cell of side AOI_CELL_SIZE (≥ AOI_RADIUS), so a
 * recipient's interest set is the union of its own cell and the 8 neighbours
 * (the 3×3 block guarantees every point within AOI_RADIUS is included). For
 * each recipient we then return the ids of candidates within AOI_RADIUS.
 *
 * This is O(recipients × points-in-neighbourhood) rather than
 * O(recipients × points), which is the whole point at scale: in a crowded
 * space each 3×3 block holds only a local cluster, not the entire room.
 *
 * Returned: recipientId → Set of candidate ids visible to that recipient
 * (EXCLUDING the recipient itself — a player never needs its own echo).
 */
export function computeInterest(
  recipients: AoiPoint[],
  candidates: AoiPoint[],
): Map<string, Set<string>> {
  // Bucket candidates into grid cells.
  const grid = new Map<string, AoiPoint[]>();
  for (const c of candidates) {
    const key = cellKey(c.x, c.z);
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(c);
  }

  const r2 = AOI_RADIUS * AOI_RADIUS;
  const result = new Map<string, Set<string>>();

  for (const rec of recipients) {
    const cx = Math.floor(rec.x / AOI_CELL_SIZE);
    const cz = Math.floor(rec.z / AOI_CELL_SIZE);
    const visible = new Set<string>();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = grid.get(`${cx + dx},${cz + dz}`);
        if (!bucket) continue;
        for (const c of bucket) {
          if (c.id === rec.id) continue;
          const ddx = c.x - rec.x;
          const ddz = c.z - rec.z;
          if (ddx * ddx + ddz * ddz <= r2) visible.add(c.id);
        }
      }
    }
    result.set(rec.id, visible);
  }
  return result;
}
