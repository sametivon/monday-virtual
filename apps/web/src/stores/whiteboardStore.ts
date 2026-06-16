import { create } from 'zustand';
import type { WhiteboardDrawOp } from '@mvs/shared';
import { api } from '@/lib/api';

interface BoardState {
  ops: WhiteboardDrawOp[];
  loaded: boolean;
  /** Bumped on every applied op — canvas surfaces redraw off this. */
  version: number;
}

interface WhiteboardStoreState {
  boards: Record<string, BoardState>;
  /** Apply one op (local echo or remote broadcast). Idempotent by op.id. */
  apply: (objectId: string, op: WhiteboardDrawOp) => void;
  /** Fetch history once per board (no-op if already loaded/loading). */
  ensureLoaded: (objectId: string) => void;
  reset: () => void;
}

const EMPTY: BoardState = { ops: [], loaded: false, version: 0 };
const loading = new Set<string>();

export const useWhiteboardStore = create<WhiteboardStoreState>((set, get) => ({
  boards: {},

  apply: (objectId, op) =>
    set((s) => {
      const board = s.boards[objectId] ?? EMPTY;
      if (board.ops.some((o) => o.id === op.id)) return s; // replay/echo dup
      return {
        boards: {
          ...s.boards,
          [objectId]: { ...board, ops: [...board.ops, op], version: board.version + 1 },
        },
      };
    }),

  ensureLoaded: (objectId) => {
    if (get().boards[objectId]?.loaded || loading.has(objectId)) return;
    loading.add(objectId);
    api
      .whiteboardOps(objectId)
      .then((history) =>
        set((s) => {
          const board = s.boards[objectId] ?? EMPTY;
          // History first, then any live ops that raced in (apply dedupes ids,
          // but a manual merge keeps causal order for erase/clear).
          const liveIds = new Set(history.map((o) => o.id));
          const live = board.ops.filter((o) => !liveIds.has(o.id));
          return {
            boards: {
              ...s.boards,
              [objectId]: { ops: [...history, ...live], loaded: true, version: board.version + 1 },
            },
          };
        }),
      )
      .catch(() => undefined) // surface stays empty; next open retries
      .finally(() => loading.delete(objectId));
  },

  reset: () => {
    loading.clear();
    set({ boards: {} });
  },
}));

type StrokeOp = Extract<WhiteboardDrawOp, { kind: 'stroke' }>;
type StickyOp = Extract<WhiteboardDrawOp, { kind: 'sticky' }>;
type ShapeOp = Extract<WhiteboardDrawOp, { kind: 'shape' }>;
type TextOp = Extract<WhiteboardDrawOp, { kind: 'text' }>;

export interface BoardContent {
  strokes: StrokeOp[];
  stickies: StickyOp[];
  shapes: ShapeOp[];
  texts: TextOp[];
}

/** Replay the op log into drawable content (erase/clear tombstone earlier ops). */
export function materialize(ops: WhiteboardDrawOp[]): BoardContent {
  const strokes = new Map<string, StrokeOp>();
  const stickies = new Map<string, StickyOp>();
  const shapes = new Map<string, ShapeOp>();
  const texts = new Map<string, TextOp>();
  for (const op of ops) {
    switch (op.kind) {
      case 'stroke':
        strokes.set(op.id, op);
        break;
      case 'sticky':
        stickies.set(op.id, op);
        break;
      case 'shape':
        shapes.set(op.id, op);
        break;
      case 'text':
        texts.set(op.id, op);
        break;
      case 'erase':
        strokes.delete(op.targetId);
        stickies.delete(op.targetId);
        shapes.delete(op.targetId);
        texts.delete(op.targetId);
        break;
      case 'clear':
        strokes.clear();
        stickies.clear();
        shapes.clear();
        texts.clear();
        break;
    }
  }
  return {
    strokes: [...strokes.values()],
    stickies: [...stickies.values()],
    shapes: [...shapes.values()],
    texts: [...texts.values()],
  };
}

/** Sticky note side length as a fraction of board width (mirrors draw.ts). */
const STICKY_SIZE = 0.13;

/**
 * Find the topmost piece of content under a normalized (x, y) point, for the
 * stroke-level eraser. Returns its op id, or null. `aspect` = board width/height
 * so the pick tolerance is a true circle in screen space (x and y are scaled by
 * different pixel counts). Drawn last = on top, so we scan newest-first.
 */
export function hitTest(content: BoardContent, x: number, y: number, aspect = 1.6): string | null {
  const tol = 0.012; // pick radius in normalized-width units
  const dist = (ax: number, ay: number, bx: number, by: number) =>
    Math.hypot(ax - bx, (ay - by) / aspect); // y normalized by height → divide to compare in width units

  // Texts and stickies are box hits; check them (newest first) before lines.
  for (let i = content.texts.length - 1; i >= 0; i--) {
    const t = content.texts[i]!;
    const h = t.size * 1.4;
    const w = Math.max(0.06, t.text.length * t.size * 0.3);
    if (x >= t.x - 0.01 && x <= t.x + w && y >= t.y - 0.01 && y <= t.y + h * aspect) return t.id;
  }
  for (let i = content.stickies.length - 1; i >= 0; i--) {
    const s = content.stickies[i]!;
    const side = STICKY_SIZE;
    if (x >= s.x && x <= s.x + side && y >= s.y && y <= s.y + side * aspect) return s.id;
  }

  for (let i = content.shapes.length - 1; i >= 0; i--) {
    if (shapeHit(content.shapes[i]!, x, y, tol, dist)) return content.shapes[i]!.id;
  }

  for (let i = content.strokes.length - 1; i >= 0; i--) {
    const stroke = content.strokes[i]!;
    const pts = stroke.points;
    for (let j = 1; j < pts.length; j++) {
      if (segDist(x, y, pts[j - 1]!, pts[j]!, aspect) < tol + stroke.size) return stroke.id;
    }
  }
  return null;
}

type ShapeOpT = Extract<WhiteboardDrawOp, { kind: 'shape' }>;
type DistFn = (ax: number, ay: number, bx: number, by: number) => number;

function shapeHit(s: ShapeOpT, x: number, y: number, tol: number, dist: DistFn): boolean {
  const minX = Math.min(s.x1, s.x2);
  const maxX = Math.max(s.x1, s.x2);
  const minY = Math.min(s.y1, s.y2);
  const maxY = Math.max(s.y1, s.y2);
  if (s.shape === 'line' || s.shape === 'arrow') {
    return segDistN(x, y, s.x1, s.y1, s.x2, s.y2, dist) < tol + s.size;
  }
  // rect / ellipse: filled = inside the box; outline = near the box edge.
  const inside = x >= minX && x <= maxX && y >= minY && y <= maxY;
  if (s.filled) return inside;
  const nearEdge =
    inside &&
    (Math.abs(x - minX) < tol ||
      Math.abs(x - maxX) < tol ||
      Math.abs(y - minY) < tol ||
      Math.abs(y - maxY) < tol);
  // Allow a small outside band too so the thin outline is easy to hit.
  const band =
    x >= minX - tol && x <= maxX + tol && y >= minY - tol && y <= maxY + tol && !inside;
  return nearEdge || band;
}

/** Point-to-segment distance for stroke points ([x,y] tuples). */
function segDist(px: number, py: number, a: [number, number], b: [number, number], aspect: number): number {
  return segDistN(px, py, a[0], a[1], b[0], b[1], (ax, ay, bx, by) =>
    Math.hypot(ax - bx, (ay - by) / aspect),
  );
}

function segDistN(px: number, py: number, x1: number, y1: number, x2: number, y2: number, dist: DistFn): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}
