// test/export-image.test.js
// PER-47: exporting the traced brocade as a PNG. The scene and the painter are
// pure (the painter is handed a 2D context), so they are executed here against
// the real GRID and a recording fake context. What only a browser can show —
// the pixels themselves, font fallback, the download — is a manual check.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildExportScene, paintScene, CJK_FONT_STACK } from '../src/export-image.js';
import { createSelection } from '../src/selection.js';
import { DIRECTIONS, SIZE, CENTER } from '../src/geometry.js';
import { GRID } from '../src/grid-data.js';
import { pathToThreadGeometry } from '../src/thread-path.js';

const dir = (id) => DIRECTIONS.find((d) => d.id === id);

// Committed lines the way the app builds them, through the real selection.
function trace(start, dirIds) {
  const selection = createSelection(GRID);
  assert.ok(selection.pickStart(start));
  for (const id of dirIds) assert.ok(selection.addLine(dir(id)), `addLine ${id}`);
  return selection.allLines();
}

test('scene: all 841 cells carry the GRID character exactly as sourced', () => {
  const scene = buildExportScene(GRID, []);
  assert.equal(scene.cells.length, SIZE * SIZE);
  for (const cell of scene.cells) {
    assert.equal(cell.ch, GRID[cell.row][cell.col], `cell ${cell.row},${cell.col}`);
  }
  // Every coordinate appears once: nothing dropped, nothing doubled.
  assert.equal(new Set(scene.cells.map((c) => `${c.row},${c.col}`)).size, SIZE * SIZE);
});

test('scene: traced cells are marked on the path; 心 is its own inert kind', () => {
  // A route along the centre row that ends beside 心, never on it.
  const lines = trace({ row: 14, col: 0 }, ['e', 's', 'e', 'n']);
  const scene = buildExportScene(GRID, lines);
  const traced = new Set(lines.flatMap((l) => l.cells).map((c) => `${c.row},${c.col}`));
  for (const cell of scene.cells) {
    const key = `${cell.row},${cell.col}`;
    if (cell.row === CENTER.row && cell.col === CENTER.col) {
      assert.equal(cell.kind, 'center', '心 is drawn as the centre, with its halo');
      assert.equal(cell.ch, '心');
      assert.equal(traced.has(key), false, 'geometry never puts 心 on a line');
    } else {
      assert.equal(cell.kind, traced.has(key) ? 'path' : 'plain', `cell ${key}`);
    }
  }
  assert.equal(scene.cells.filter((c) => c.kind === 'path').length, traced.size);
});

test('scene: the thread is the committed path, reconnected at pivots like the page', () => {
  const lines = trace({ row: 2, col: 3 }, ['e', 'se', 's', 'w']);
  const scene = buildExportScene(GRID, lines);
  assert.deepEqual(scene.thread, pathToThreadGeometry(lines, scene.layout, { idPrefix: 'export' }));
  assert.equal(scene.thread.segments.length, 4);
  assert.equal(scene.thread.pivots.length, 3);
  // The first strand starts on the start cell's centre, in image coordinates.
  const first = scene.cells.find((c) => c.row === 2 && c.col === 3);
  assert.deepEqual(scene.thread.segments[0].from, { x: first.x + scene.pitch / 2, y: first.y + scene.pitch / 2 });
});

test('scene: an untraced cloth has no thread', () => {
  const scene = buildExportScene(GRID, []);
  assert.equal(scene.thread.segments.length, 0);
  assert.equal(scene.thread.start, null);
});

// A 2D context that records what is asked of it. Only the calls and property
// writes the painter makes are needed; gradients record their colour stops.
function recordingContext() {
  const calls = [];
  const state = {};
  const gradient = (kind) => {
    const g = { kind, stops: [] };
    g.addColorStop = (offset, color) => g.stops.push({ offset, color });
    return g;
  };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (prop === 'createLinearGradient') return (...a) => gradient('linear');
      if (prop === 'createRadialGradient') return (...a) => gradient('radial');
      if (prop in target) return target[prop];
      return (...args) => calls.push({ op: prop, args, state: { ...target } });
    },
    set(target, prop, value) {
      target[prop] = value;
      calls.push({ op: 'set', prop, value });
      return true;
    },
  });
  return ctx;
}

const glyphCalls = (ctx) => ctx.calls.filter((c) => c.op === 'fillText');

test('paint: every glyph drawn is the GRID character, row by row, in the CJK stack', () => {
  const lines = trace({ row: 2, col: 3 }, ['e', 'se', 's', 'w']);
  const ctx = recordingContext();
  paintScene(ctx, buildExportScene(GRID, lines));
  const drawn = glyphCalls(ctx).map((c) => c.args[0]);
  assert.deepEqual(drawn, GRID.flatMap((row) => [...row]), 'all 841, unaltered, in order');
  for (const call of glyphCalls(ctx)) {
    assert.ok(call.state.font.endsWith(CJK_FONT_STACK), `font is the CJK stack: ${call.state.font}`);
  }
  assert.equal(
    CJK_FONT_STACK,
    '"Noto Serif TC", "PMingLiU", "MingLiU", "Microsoft JhengHei", "SimSun", serif',
    'the same stack the page uses for the grid',
  );
});

test('paint: 心 keeps its vermillion glyph and halo, never the traced wash', () => {
  // Lines on either side of the centre row, so the path passes close by.
  const lines = trace({ row: 13, col: 8 }, ['e', 'se', 'sw']);
  const ctx = recordingContext();
  paintScene(ctx, buildExportScene(GRID, lines));
  // 心 also occurs elsewhere in the cloth ([0,21], [8,2], [24,13]); only the
  // centre one is inert, so it is found by position, not by character.
  const heart = glyphCalls(ctx)[CENTER.row * SIZE + CENTER.col];
  assert.equal(heart.args[0], '心');
  assert.equal(heart.state.fillStyle, '#b5402c', 'vermillion ink');
  assert.match(heart.state.font, /^700 /, 'bold, as on the page');
  const others = glyphCalls(ctx).filter((c) => c !== heart);
  assert.ok(others.every((c) => c.state.fillStyle === '#241a11'), 'every other glyph is ink');

  // The centre cell's ground is the radial halo, not a flat or gold-washed fill.
  const scene = buildExportScene(GRID, lines);
  const centre = scene.cells.find((c) => c.kind === 'center');
  const ground = ctx.calls.filter((c) => c.op === 'fillRect' && c.args[0] === centre.x && c.args[1] === centre.y);
  assert.equal(ground.length, 1, 'the centre cell is filled once');
  assert.equal(ground[0].state.fillStyle.kind, 'radial', 'with the halo gradient');
  assert.deepEqual(ground[0].state.fillStyle.stops.map((s) => s.color), ['#f7dcd1', '#f2c7ba', '#fcf8ee']);
});

// The recorded calls grouped into drawn paths: everything from a beginPath to
// the stroke() or fill() that finishes it, with the state at that moment.
function paths(ctx) {
  const out = [];
  let current = null;
  for (const call of ctx.calls) {
    if (call.op === 'beginPath') current = { ops: [] };
    else if (current && ['moveTo', 'lineTo', 'arc'].includes(call.op)) current.ops.push(call);
    else if (current && (call.op === 'stroke' || call.op === 'fill')) {
      out.push({ ...current, paint: call.op, state: call.state });
      current = null;
    }
  }
  return out;
}

const arcAt = (path) => path.ops.length === 1 && path.ops[0].op === 'arc' && path.ops[0].args;

test('paint: the gold thread, its pivots, start ring and endpoint are drawn over the glyphs', () => {
  const lines = trace({ row: 2, col: 3 }, ['e', 'se', 's', 'w']);
  const scene = buildExportScene(GRID, lines);
  const ctx = recordingContext();
  paintScene(ctx, scene);
  const drawn = paths(ctx);
  const pitch = scene.pitch;

  // One stroked polyline per segment, through exactly the segment's points.
  const strands = drawn.filter((p) => p.paint === 'stroke' && p.ops[0]?.op === 'moveTo');
  assert.equal(strands.length, scene.thread.segments.length);
  strands.forEach((strand, i) => {
    const pts = strand.ops.map((o) => ({ x: o.args[0], y: o.args[1] }));
    assert.deepEqual(pts, scene.thread.segments[i].points, `segment ${i} runs through its cells`);
    assert.deepEqual(strand.ops.map((o) => o.op), ['moveTo', ...Array(pts.length - 1).fill('lineTo')]);
    // Soft gold deepening to gold ink along the way it was traced, as on the page.
    const g = strand.state.strokeStyle;
    assert.equal(g.kind, 'linear');
    assert.deepEqual(g.stops, [
      { offset: 0, color: 'rgba(240, 207, 98, 0.9)' },
      { offset: 1, color: 'rgba(122, 90, 16, 0.95)' },
    ]);
    assert.equal(strand.state.lineWidth, Math.max(2.5, pitch * 0.1));
    assert.equal(strand.state.lineCap, 'round');
    assert.equal(strand.state.lineJoin, 'round');
    assert.equal(strand.state.globalCompositeOperation, 'multiply', 'glyphs read through the thread');
  });

  const rings = drawn.filter((p) => arcAt(p));
  const ringAt = (pt, r) => rings.filter((p) => {
    const [x, y, radius] = arcAt(p);
    return x === pt.x && y === pt.y && radius === r;
  });
  for (const pivot of scene.thread.pivots) {
    const [knot] = ringAt(pivot, pitch * 0.3);
    assert.ok(knot, `pivot knot at ${pivot.row},${pivot.col}`);
    assert.equal(knot.paint, 'stroke');
    assert.equal(knot.state.strokeStyle, '#b5402c');
  }
  const { start, end } = scene.thread;
  const [outer] = ringAt(start, pitch * 0.4);
  const [inner] = ringAt(start, pitch * 0.26);
  assert.equal(outer?.state.strokeStyle, '#b5402c', 'vermillion outer start ring');
  assert.equal(inner?.state.strokeStyle, '#a87b1e', 'gold inner start ring');
  const [head] = ringAt(end, Math.max(2.5, pitch * 0.085));
  assert.equal(head?.paint, 'fill', 'the endpoint is a filled head');
  assert.equal(head.state.fillStyle, '#b5402c');

  // All of it after the last glyph, so the thread lies over the cloth.
  const lastGlyph = ctx.calls.findLastIndex((c) => c.op === 'fillText');
  const firstPath = ctx.calls.findIndex((c) => c.op === 'beginPath');
  assert.ok(firstPath > lastGlyph, 'thread painted after the cells');
});

test('paint: an untraced cloth paints no thread at all', () => {
  const ctx = recordingContext();
  paintScene(ctx, buildExportScene(GRID, []));
  assert.equal(paths(ctx).length, 0);
});
