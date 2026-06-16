'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SceneObjectDTO, WhiteboardDrawOp } from '@mvs/shared';
import { sendWhiteboardOp } from '@/realtime/useSpaceSocket';
import { hitTest, materialize, useWhiteboardStore } from '@/stores/whiteboardStore';
import { drawBoard, drawShape } from '@/whiteboard/draw';

const PEN_COLORS = ['#2d3436', '#d63031', '#0984e3', '#00b894', '#e17055', '#6c5ce7'];
const STICKY_COLORS = ['#ffeaa7', '#fab1a0', '#a7e9ff', '#b8f7c8'];
const SIZES: { label: string; value: number }[] = [
  { label: 'S', value: 0.002 },
  { label: 'M', value: 0.004 },
  { label: 'L', value: 0.008 },
];

// Logical drawing surface; ops store normalized 0..1 coordinates.
const W = 1600;
const H = 1000;

type Tool = 'pen' | 'sticky' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'eraser';
type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow';
const SHAPE_TOOLS: ShapeKind[] = ['rect', 'ellipse', 'line', 'arrow'];
const SHAPE_ICON: Record<ShapeKind, string> = { rect: '▭', ellipse: '◯', line: '╱', arrow: '↗' };
const isShapeTool = (t: Tool): t is ShapeKind => (SHAPE_TOOLS as string[]).includes(t);
/** Default font size (relative to board width) for the text tool. */
const TEXT_SIZE = 0.028;

/**
 * Collaborative whiteboard (Phase 2): freehand strokes + sticky notes, synced
 * live over the space socket and replayed from the persisted op log. The
 * in-world 3D board renders the same content as a texture.
 */
export function WhiteboardModal({ object, onClose }: { object: SceneObjectDTO; onClose: () => void }) {
  const objectId = object.id;
  const label = (object.config as { label?: string }).label ?? 'Whiteboard';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(PEN_COLORS[0]!);
  const [size, setSize] = useState(SIZES[1]!.value);
  const [filled, setFilled] = useState(false);
  const [stickyDraft, setStickyDraft] = useState<{ x: number; y: number } | null>(null);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number } | null>(null);
  /** Ops authored locally this session — what Undo walks back. */
  const myOps = useRef<string[]>([]);

  const version = useWhiteboardStore((s) => s.boards[objectId]?.version ?? 0);
  const ensureLoaded = useWhiteboardStore((s) => s.ensureLoaded);
  useEffect(() => ensureLoaded(objectId), [ensureLoaded, objectId]);

  // The committed picture; the in-progress stroke draws on top live.
  const redraw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const ops = useWhiteboardStore.getState().boards[objectId]?.ops ?? [];
    drawBoard(ctx, materialize(ops), W, H);
  }, [objectId]);
  useEffect(redraw, [redraw, version]);

  const toNorm = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    ];
  };

  const stroke = useRef<[number, number][] | null>(null);
  const shapeStart = useRef<[number, number] | null>(null);
  /** Hit-test once per pointer position; erase whatever the eraser passes over. */
  const eraseAt = (x: number, y: number) => {
    const ops = useWhiteboardStore.getState().boards[objectId]?.ops ?? [];
    const targetId = hitTest(materialize(ops), x, y, W / H);
    if (targetId) commit({ kind: 'erase', id: crypto.randomUUID(), targetId });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [x, y] = toNorm(e);
    if (tool === 'sticky') {
      setStickyDraft({ x: Math.min(x, 0.86), y: Math.min(y, 0.8) });
      return;
    }
    if (tool === 'text') {
      setTextDraft({ x: Math.min(x, 0.9), y: Math.min(y, 0.92) });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'eraser') {
      eraseAt(x, y);
      shapeStart.current = [x, y]; // reuse as "eraser is down" flag
      return;
    }
    if (isShapeTool(tool)) {
      shapeStart.current = [x, y];
      return;
    }
    stroke.current = [[x, y]];
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [x, y] = toNorm(e);

    if (tool === 'eraser') {
      if (shapeStart.current) eraseAt(x, y);
      return;
    }

    // Shape drag: redraw the committed picture, then a live preview on top.
    if (isShapeTool(tool) && shapeStart.current) {
      const [sx, sy] = shapeStart.current;
      redraw();
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) drawShape(ctx, { shape: tool, color, size, filled, x1: sx, y1: sy, x2: x, y2: y }, W, H);
      return;
    }

    const points = stroke.current;
    if (!points) return;
    const [lx, ly] = points[points.length - 1]!;
    if (Math.hypot(x - lx, y - ly) < 0.003) return; // decimate
    points.push([x, y]);

    // Live segment on top of the committed picture.
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, size * W);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lx * W, ly * H);
      ctx.lineTo(x * W, y * H);
      ctx.stroke();
    }
  };

  const commit = (op: WhiteboardDrawOp) => {
    myOps.current.push(op.id);
    sendWhiteboardOp(objectId, op);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'eraser') {
      shapeStart.current = null;
      return;
    }

    if (isShapeTool(tool) && shapeStart.current) {
      const [sx, sy] = shapeStart.current;
      shapeStart.current = null;
      const [x, y] = toNorm(e);
      // Ignore an accidental click with no drag.
      if (Math.hypot(x - sx, y - sy) < 0.005) {
        redraw();
        return;
      }
      commit({
        kind: 'shape',
        id: crypto.randomUUID(),
        shape: tool,
        color,
        size,
        filled,
        x1: sx,
        y1: sy,
        x2: x,
        y2: y,
      });
      return;
    }

    const points = stroke.current;
    stroke.current = null;
    if (!points || points.length < 2) {
      redraw(); // drop the dot; keep surface in sync
      return;
    }
    commit({ kind: 'stroke', id: crypto.randomUUID(), color, size, points: points.slice(0, 1500) });
  };

  const placeSticky = (text: string) => {
    if (stickyDraft && text.trim()) {
      commit({
        kind: 'sticky',
        id: crypto.randomUUID(),
        x: stickyDraft.x,
        y: stickyDraft.y,
        color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)]!,
        text: text.trim().slice(0, 300),
      });
    }
    setStickyDraft(null);
  };

  const placeText = (text: string) => {
    if (textDraft && text.trim()) {
      commit({
        kind: 'text',
        id: crypto.randomUUID(),
        x: textDraft.x,
        y: textDraft.y,
        color,
        size: TEXT_SIZE,
        text: text.trim().slice(0, 300),
      });
    }
    setTextDraft(null);
  };

  const undo = () => {
    const targetId = myOps.current.pop();
    if (targetId) commit({ kind: 'erase', id: crypto.randomUUID(), targetId });
  };

  const clear = () => commit({ kind: 'clear', id: crypto.randomUUID() });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-white/10 bg-brand-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-lg font-semibold">🖊️ {label}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <ToolButton active={tool === 'pen'} onClick={() => setTool('pen')}>✏️ Pen</ToolButton>
            {SHAPE_TOOLS.map((s) => (
              <ToolButton key={s} active={tool === s} onClick={() => setTool(s)} title={s}>
                {SHAPE_ICON[s]}
              </ToolButton>
            ))}
            <ToolButton active={tool === 'text'} onClick={() => setTool('text')}>🔤 Text</ToolButton>
            <ToolButton active={tool === 'sticky'} onClick={() => setTool('sticky')}>🗒️ Sticky</ToolButton>
            <ToolButton active={tool === 'eraser'} onClick={() => setTool('eraser')}>🧽 Erase</ToolButton>
            <div className="mx-1 h-5 w-px bg-white/15" />
            {PEN_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`h-6 w-6 rounded-full ${color === c ? 'ring-2 ring-white' : 'opacity-70 hover:opacity-100'}`}
              />
            ))}
            <div className="mx-1 h-5 w-px bg-white/15" />
            {SIZES.map((s) => (
              <ToolButton key={s.label} active={size === s.value} onClick={() => setSize(s.value)}>
                {s.label}
              </ToolButton>
            ))}
            {isShapeTool(tool) && (tool === 'rect' || tool === 'ellipse') && (
              <ToolButton active={filled} onClick={() => setFilled((f) => !f)} title="Fill shape">
                {filled ? '▰ Filled' : '▱ Outline'}
              </ToolButton>
            )}
            <div className="mx-1 h-5 w-px bg-white/15" />
            <ToolButton onClick={undo}>↩ Undo</ToolButton>
            <ToolButton onClick={clear}>🗑 Clear</ToolButton>
            <button onClick={onClose} className="ml-2 text-white/60 hover:text-white">✕</button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 p-3">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            className={`w-full rounded-lg ${
              tool === 'eraser'
                ? 'cursor-cell'
                : tool === 'sticky' || tool === 'text'
                  ? 'cursor-copy'
                  : 'cursor-crosshair'
            }`}
            style={{ aspectRatio: `${W} / ${H}`, touchAction: 'none' }}
          />
          {stickyDraft && (
            <StickyEditor
              x={stickyDraft.x}
              y={stickyDraft.y}
              onCommit={placeSticky}
              onCancel={() => setStickyDraft(null)}
            />
          )}
          {textDraft && (
            <TextEditor
              x={textDraft.x}
              y={textDraft.y}
              color={color}
              onCommit={placeText}
              onCancel={() => setTextDraft(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StickyEditor({
  x,
  y,
  onCommit,
  onCancel,
}: {
  x: number;
  y: number;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  // Programmatic focus — the autoFocus attribute is unreliable when the
  // window itself isn't focused (background tabs, headless tests).
  useEffect(() => ref.current?.focus(), []);
  return (
    <div
      className="absolute z-10 rounded-md bg-[#ffeaa7] p-2 shadow-lg"
      style={{ left: `calc(${x * 100}% )`, top: `calc(${y * 100}%)` }}
    >
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onCommit(text);
          }
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Type, Enter to post"
        className="h-20 w-44 resize-none bg-transparent text-sm text-[#26303a] outline-none placeholder:text-[#26303a]/50"
      />
    </div>
  );
}

function TextEditor({
  x,
  y,
  color,
  onCommit,
  onCancel,
}: {
  x: number;
  y: number;
  color: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <textarea
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      // No onBlur-commit: the click that opens the editor would itself blur it
      // before typing. Commit on Enter (Shift+Enter for newline), like stickies.
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onCommit(text);
        }
        if (e.key === 'Escape') onCancel();
      }}
      placeholder="Type, Enter to add"
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, color }}
      className="absolute z-10 h-16 w-56 resize-none rounded border border-white/30 bg-white/90 px-1 text-lg font-semibold outline-none placeholder:text-black/30"
    />
  );
}

function ToolButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-lg px-2.5 py-1 text-sm transition ${
        active ? 'bg-brand-primary' : 'bg-white/10 hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  );
}
