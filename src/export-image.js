// src/export-image.js — the traced brocade as a still image (PER-47). No DOM.
//
// Two pure steps: buildExportScene() describes what to draw from the grid and
// the committed lines alone, and paintScene() draws that description onto a 2D
// context it is handed. The app supplies the canvas, waits for fonts and saves
// the PNG; nothing here reads or writes page state, so exporting is a snapshot.
//
// The glyphs are GRID's own values, cell for cell — never retyped, never
// normalised. Colour regions are deliberately absent: they are a stylized
// approximation (see regions.js), and an exported image travels without the
// "(stylized)" label that makes them honest on the page.
import { SIZE, isCenter } from './geometry.js';
import { pathToThreadGeometry } from './thread-path.js';

export const EXPORT_PITCH = 40;   // px between cell centres
export const EXPORT_GAP = 1;      // px gutter between cells, like the page's weave
export const EXPORT_MARGIN = 24;  // px of silk around the cloth

// The grid's font stack from styles.css, verbatim. The glyphs are rasterized
// into the PNG, so whoever opens it needs none of these fonts installed.
export const CJK_FONT_STACK = '"Noto Serif TC", "PMingLiU", "MingLiU", "Microsoft JhengHei", "SimSun", serif';

// styles.css custom properties the image is painted in. The app may pass the
// live computed values; these are the same values, for when it cannot.
export const DEFAULT_PALETTE = {
  silk: '#f3e8d0',
  weave: '#cbb078',
  cellBg: '#fcf8ee',
  ink: '#241a11',
  vermillion: '#b5402c',
  gold: '#a87b1e',
  goldInk: '#7a5a10',
  goldSoft: '#f0cf62',
  goldWash: '#f8eed4',
  // --center-glow's three stops: the halo behind the inert 心.
  centerGlow: ['#f7dcd1', '#f2c7ba', '#fcf8ee'],
};

// The glyph sits at the same share of the cell as on the page (22px in 36px).
const GLYPH_RATIO = 22 / 36;

export function buildExportScene(grid, lines, options = {}) {
  const pitch = options.pitch ?? EXPORT_PITCH;
  const margin = options.margin ?? EXPORT_MARGIN;
  const side = margin * 2 + SIZE * pitch;
  const layout = {
    originX: margin + pitch / 2,
    originY: margin + pitch / 2,
    stepX: pitch,
    stepY: pitch,
    width: side,
    height: side,
  };

  const traced = new Set();
  for (const line of Array.isArray(lines) ? lines : []) {
    for (const c of line?.cells ?? []) traced.add(`${c.row},${c.col}`);
  }

  const cells = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      cells.push({
        row, col,
        ch: grid[row][col],
        // 心 is checked first: it is inert whatever a caller passes in.
        kind: isCenter({ row, col }) ? 'center' : traced.has(`${row},${col}`) ? 'path' : 'plain',
        x: margin + col * pitch,
        y: margin + row * pitch,
      });
    }
  }

  // The same geometry the page overlay draws, so the image cannot disagree
  // with the screen about where the thread runs or where it pivots.
  const thread = pathToThreadGeometry(lines, layout, { idPrefix: 'export' });

  return { width: side, height: side, pitch, layout, cells, thread };
}

// radial-gradient(circle at center, a 0%, b 46%, c 74%) over a square cell:
// CSS sizes a circle to the farthest corner, i.e. half the diagonal.
function centerHalo(ctx, cx, cy, inner, p) {
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, (inner / 2) * Math.SQRT2);
  const [a, b, c] = p.centerGlow;
  halo.addColorStop(0, a);
  halo.addColorStop(0.46, b);
  halo.addColorStop(0.74, c);
  return halo;
}

export function glyphFont(scene, weight = 400) {
  return `${weight} ${Math.round(scene.pitch * GLYPH_RATIO)}px ${CJK_FONT_STACK}`;
}

// Paints the scene onto `ctx` (a CanvasRenderingContext2D sized to the scene).
export function paintScene(ctx, scene, palette = DEFAULT_PALETTE) {
  const p = { ...DEFAULT_PALETTE, ...palette };
  const { pitch } = scene;
  const inner = pitch - EXPORT_GAP;

  ctx.fillStyle = p.silk;
  ctx.fillRect(0, 0, scene.width, scene.height);
  // The ruled weave shows through the one-pixel gutters between cells.
  const cloth = scene.cells[0];
  ctx.fillStyle = p.weave;
  ctx.fillRect(cloth.x - EXPORT_GAP, cloth.y - EXPORT_GAP, pitch * SIZE + EXPORT_GAP, pitch * SIZE + EXPORT_GAP);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const cell of scene.cells) {
    const cx = cell.x + inner / 2;
    const cy = cell.y + inner / 2;
    const isHeart = cell.kind === 'center';
    ctx.fillStyle = isHeart ? centerHalo(ctx, cx, cy, inner, p) : cell.kind === 'path' ? p.goldWash : p.cellBg;
    ctx.fillRect(cell.x, cell.y, inner, inner);
    ctx.font = glyphFont(scene, isHeart ? 700 : cell.kind === 'path' ? 600 : 400);
    ctx.fillStyle = isHeart ? p.vermillion : p.ink;
    ctx.fillText(cell.ch, cx, cy);
  }

  paintThread(ctx, scene.thread, pitch, p);
}

// '#rrggbb' at an opacity, for the strand's stop-opacity values.
function rgba(hex, alpha) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function ring(ctx, point, r) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
}

// The page's #thread overlay, drawn the same way: a multiply blend so the ink
// glyphs read through, one gradient per strand running start -> end (the
// .strand-from/.strand-to stops), vermillion pivot knots, the double start
// ring and a filled head. Sizes are the ones drawThread() uses in src/app.js.
function paintThread(ctx, thread, pitch, p) {
  if (thread.segments.length === 0 && !thread.start) return;
  ctx.globalCompositeOperation = 'multiply';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const seg of thread.segments) {
    const gradient = ctx.createLinearGradient(seg.from.x, seg.from.y, seg.to.x, seg.to.y);
    gradient.addColorStop(0, rgba(p.goldSoft, 0.9));
    gradient.addColorStop(1, rgba(p.goldInk, 0.95));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(2.5, pitch * 0.1);
    ctx.beginPath();
    seg.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.stroke();
  }

  ctx.strokeStyle = p.vermillion;
  ctx.lineWidth = 2;
  for (const pivot of thread.pivots) {
    ring(ctx, pivot, pitch * 0.3);
    ctx.stroke();
  }
  if (thread.start) {
    ctx.strokeStyle = p.vermillion;
    ctx.lineWidth = 2.5;
    ring(ctx, thread.start, pitch * 0.4);
    ctx.stroke();
    ctx.strokeStyle = p.gold;
    ctx.lineWidth = 1.5;
    ring(ctx, thread.start, pitch * 0.26);
    ctx.stroke();
  }
  if (thread.end) {
    ctx.fillStyle = p.vermillion;
    ring(ctx, thread.end, Math.max(2.5, pitch * 0.085));
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
