import type { WhiteboardDrawOp } from '@mvs/shared';
import type { BoardContent } from '@/stores/whiteboardStore';

type ShapeOp = Extract<WhiteboardDrawOp, { kind: 'shape' }>;

/**
 * Draw one shape (rect/ellipse/line/arrow). Pulled out so the modal can paint a
 * live preview while dragging with the same geometry the committed op will use.
 */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Pick<ShapeOp, 'shape' | 'color' | 'size' | 'filled' | 'x1' | 'y1' | 'x2' | 'y2'>,
  width: number,
  height: number,
): void {
  const x1 = shape.x1 * width;
  const y1 = shape.y1 * height;
  const x2 = shape.x2 * width;
  const y2 = shape.y2 * height;
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = Math.max(1, shape.size * width);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (shape.shape) {
    case 'rect': {
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      if (shape.filled) ctx.fillRect(x, y, w, h);
      else ctx.strokeRect(x, y, w, h);
      break;
    }
    case 'ellipse': {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
      if (shape.filled) ctx.fill();
      else ctx.stroke();
      break;
    }
    case 'line': {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      break;
    }
    case 'arrow': {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // Arrowhead: two barbs at a fixed angle off the line direction.
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = Math.max(ctx.lineWidth * 3.5, 0.02 * width);
      const spread = Math.PI / 7;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(angle - spread), y2 - head * Math.sin(angle - spread));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(angle + spread), y2 - head * Math.sin(angle + spread));
      ctx.stroke();
      break;
    }
  }
}

/**
 * Render materialized board content onto a 2D canvas. Shared by the modal
 * (interactive surface) and the in-world 3D board (CanvasTexture), so both
 * always draw the exact same picture. Coordinates are normalized 0..1.
 */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  content: BoardContent,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f5f6f8';
  ctx.fillRect(0, 0, width, height);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of content.strokes) {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = Math.max(1, stroke.size * width);
    ctx.beginPath();
    stroke.points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x * width, y * height);
      else ctx.lineTo(x * width, y * height);
    });
    ctx.stroke();
  }

  for (const shape of content.shapes) drawShape(ctx, shape, width, height);

  for (const t of content.texts) {
    ctx.fillStyle = t.color;
    ctx.font = `${Math.round(t.size * width)}px sans-serif`;
    ctx.textBaseline = 'top';
    t.text.split('\n').forEach((line, i) => {
      ctx.fillText(line, t.x * width, t.y * height + i * t.size * width * 1.25);
    });
  }

  const noteW = 0.13 * width;
  const noteH = 0.13 * width;
  const fontSize = Math.round(0.016 * width);
  for (const sticky of content.stickies) {
    const x = sticky.x * width;
    const y = sticky.y * height;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 0.004 * width;
    ctx.shadowOffsetY = 0.002 * width;
    ctx.fillStyle = sticky.color;
    ctx.fillRect(x, y, noteW, noteH);
    ctx.restore();
    ctx.fillStyle = '#26303a';
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = 'top';
    wrapText(ctx, sticky.text, x + 0.012 * width, y + 0.012 * width, noteW - 0.024 * width, fontSize * 1.25, 6);
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const words = text.split(/\s+/);
  let line = '';
  let lines = 0;
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (ctx.measureText(probe).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = word;
      if (++lines >= maxLines) return;
    } else {
      line = probe;
    }
  }
  if (line) ctx.fillText(line, x, y + lines * lineHeight);
}
