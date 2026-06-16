import { describe, expect, it } from 'vitest';
import { AOI_CELL_SIZE, AOI_RADIUS } from '@mvs/shared';
import { cellCoord, computeInterest, neighborCells, type AoiPoint } from '../aoi';

const p = (id: string, x: number, z: number): AoiPoint => ({ id, x, z });

describe('computeInterest (server-side AOI)', () => {
  it('includes candidates within AOI_RADIUS and excludes those beyond', () => {
    const me = p('me', 0, 0);
    const near = p('near', AOI_RADIUS - 1, 0); // just inside
    const far = p('far', AOI_RADIUS * 3, 0); // far cell, well outside
    const interest = computeInterest([me], [me, near, far]);
    const visible = interest.get('me')!;
    expect(visible.has('near')).toBe(true);
    expect(visible.has('far')).toBe(false);
  });

  it('never includes the recipient itself', () => {
    const me = p('me', 5, 5);
    const interest = computeInterest([me], [me]);
    expect(interest.get('me')!.has('me')).toBe(false);
  });

  it('excludes a point just past the radius even when in a neighbour cell', () => {
    // Diagonal distance just over AOI_RADIUS but the point lands in the 3×3 block.
    const me = p('me', 0, 0);
    const justOut = p('justOut', AOI_RADIUS * 0.8, AOI_RADIUS * 0.8); // dist ≈ 1.13·R
    const interest = computeInterest([me], [me, justOut]);
    expect(interest.get('me')!.has('justOut')).toBe(false);
  });

  it('is symmetric for two mutually-near players', () => {
    const a = p('a', 0, 0);
    const b = p('b', 3, 4); // 5m apart
    const interest = computeInterest([a, b], [a, b]);
    expect(interest.get('a')!.has('b')).toBe(true);
    expect(interest.get('b')!.has('a')).toBe(true);
  });

  it('partitions distant clusters — players in far cells never see each other', () => {
    const cluster1 = [p('a1', 0, 0), p('a2', 2, 2)];
    const cluster2 = [p('b1', AOI_RADIUS * 5, 0), p('b2', AOI_RADIUS * 5 + 2, 2)];
    const all = [...cluster1, ...cluster2];
    const interest = computeInterest(all, all);
    expect(interest.get('a1')!.has('a2')).toBe(true);
    expect(interest.get('a1')!.has('b1')).toBe(false);
    expect(interest.get('b1')!.has('b2')).toBe(true);
    expect(interest.get('b1')!.has('a1')).toBe(false);
  });
});

describe('cellCoord / neighborCells (cross-node cell rooms)', () => {
  it('maps positions to integer cells (floor division), including negatives', () => {
    expect(cellCoord(0, 0)).toEqual([0, 0]);
    expect(cellCoord(AOI_CELL_SIZE * 1.5, AOI_CELL_SIZE * 2.9)).toEqual([1, 2]);
    expect(cellCoord(-1, -1)).toEqual([-1, -1]); // floor, not trunc
    expect(cellCoord(-AOI_CELL_SIZE, 0)).toEqual([-1, 0]);
  });

  it('neighborCells returns the 3×3 block around a cell', () => {
    const block = neighborCells(0, 0);
    expect(block).toHaveLength(9);
    expect(block).toContainEqual([0, 0]);
    expect(block).toContainEqual([-1, -1]);
    expect(block).toContainEqual([1, 1]);
    expect(block).not.toContainEqual([2, 0]);
  });

  it('a recipient receives a mover iff the recipient cell is in the mover 3×3 block (room model)', () => {
    // Replicates the tick targeting: mover emits to neighborCells(moverCell);
    // recipient subscribes to its own cell. Visible iff recipientCell ∈ block.
    const visibleViaRooms = (mover: [number, number], recipient: [number, number]) => {
      const [mx, mz] = cellCoord(mover[0], mover[1]);
      const [rx, rz] = cellCoord(recipient[0], recipient[1]);
      return neighborCells(mx, mz).some(([cx, cz]) => cx === rx && cz === rz);
    };
    // Same cell — visible.
    expect(visibleViaRooms([1, 1], [2, 2])).toBe(true);
    // Adjacent cell — visible.
    expect(visibleViaRooms([0, 0], [AOI_CELL_SIZE + 1, 0])).toBe(true);
    // Two cells apart — not visible.
    expect(visibleViaRooms([0, 0], [AOI_CELL_SIZE * 2 + 1, 0])).toBe(false);
    // Symmetric.
    expect(visibleViaRooms([AOI_CELL_SIZE + 1, 0], [0, 0])).toBe(true);
  });
});
