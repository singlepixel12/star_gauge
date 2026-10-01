// test/grid-surface-contract.test.js
// Guards the woven-cloth surface introduced by PER-27. The grid used to be 841
// identical flat fills; it is now one broad, low-frequency silk sheen laid
// across the whole bolt, each cell showing its own slice of a single
// non-repeating gradient.
//
// What is *executed* here: the positioning arithmetic, which lives in
// src/silk.js precisely so it can be run rather than pattern-matched — all 841
// coordinate assignments, and the resulting pixel offsets at both cell sizes.
// Also executed: the legibility maths. The sheen is composited over every fill
// it can ever sit on and the WCAG contrast against --ink is measured, so "glyph
// legibility wins" is a number rather than a claim. And a real traced quatrain
// is run through src/selection.js, so the states this stylesheet has to keep
// working are the states the app actually produces.
//
// What is *parsed* here: styles.css and src/app.js, read as declarations rather
// than as loose text, in the manner of controls-contract.test.js.
//
// WHAT THIS FILE CANNOT COVER — needs manual/browser validation.
// There is no CSS engine and no DOM here (no jsdom, no playwright — deliberately:
// vanilla site, no build step, no dependencies), so nothing below rasterises a
// pixel. These remain manual checks, with a path traced rather than on an empty
// grid, at --cell: 36px and at 30px, and with Colour regions both off and on:
//   * that the sheen reads as woven silk rather than as a visible gradient or a
//     dirty smear — bands crossing the cloth, no seam at any cell edge;
//   * that no shimmer or moire appears at fractional device pixel ratios
//     (1.25x, 1.5x, 1.75x) or while the viewport is panned;
//   * that the gold thread, the vermillion junction and the centre 心 halo all
//     still sit clearly on top of the new surface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appJs, functionBody } from '../test-support/app-source.js';

import { SHEEN_SPAN, GRID_GAP_PX, silkCoord, silkVars } from '../src/silk.js';
import { SIZE, DIRECTIONS, isCenter } from '../src/geometry.js';
import { REGION_IDS, regionAt } from '../src/regions.js';
import { createSelection } from '../src/selection.js';
import { GRID } from '../src/grid-data.js';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const cssClean = css.replace(/\/\*[\s\S]*?\*\//g, '');

// --- tiny CSS reader (same technique as controls-contract.test.js) -------

// Top-level blocks of `source`, as { prelude, body }.
function blocks(source) {
  const out = [];
  let depth = 0;
  let start = 0;
  let preludeEnd = -1;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') {
      if (depth === 0) preludeEnd = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        out.push({
          prelude: source.slice(start, preludeEnd).trim().replace(/\s+/g, ' '),
          body: source.slice(preludeEnd + 1, i),
        });
        start = i + 1;
      }
    }
  }
  return out;
}

// Declarations of one rule body, as property -> value. Semicolons inside parens
// (gradients) are not separators; whitespace is normalised.
function declarations(body) {
  const map = new Map();
  let depth = 0;
  let buf = '';
  const flush = () => {
    const d = buf.trim();
    buf = '';
    const i = d.indexOf(':');
    if (i > 0) map.set(d.slice(0, i).trim(), d.slice(i + 1).trim().replace(/\s+/g, ' '));
  };
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ';' && depth === 0) flush();
    else buf += ch;
  }
  flush();
  return map;
}

// The one rule whose selector list contains `selector` exactly, within `source`.
function rule(selector, source = cssClean) {
  const found = blocks(source).filter(
    (b) => !b.prelude.startsWith('@') && b.prelude.split(',').map((s) => s.trim()).includes(selector),
  );
  assert.equal(found.length, 1, `expected exactly one rule for ${selector}`);
  return declarations(found[0].body);
}

function mediaBody(query) {
  const found = blocks(cssClean).filter((b) => b.prelude === query);
  assert.equal(found.length, 1, `expected exactly one ${query} block`);
  return found[0].body;
}

const root = rule(':root');
const cell = rule('.cell');

// --- colour maths --------------------------------------------------------
// Enough sRGB to answer one question: after the sheen is composited over a
// fill, can the ink still be read on it?

function parseColor(value) {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = value.trim().match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]*\.?\d+))?\s*\)$/i);
  assert.ok(rgba, `cannot parse colour "${value}"`);
  return {
    r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]),
    a: rgba[4] === undefined ? 1 : Number(rgba[4]),
  };
}

function over(top, bottom) {
  return {
    r: top.a * top.r + (1 - top.a) * bottom.r,
    g: top.a * top.g + (1 - top.a) * bottom.g,
    b: top.a * top.b + (1 - top.a) * bottom.b,
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Every rgba() stop of a sheen gradient token, with its alpha and position.
function stopsOf(value, label) {
  assert.ok(value, `${label} is declared`);
  const stops = [...value.matchAll(/rgba?\([^)]*\)\s*([\d.]+)%/g)].map((m) => ({
    color: parseColor(m[0].slice(0, m[0].lastIndexOf(')') + 1)),
    at: Number(m[1]),
  }));
  assert.ok(stops.length >= 4, `${label} has enough stops to read as light across cloth`);
  return stops;
}

// The default, full-strength sheen: what the plain grid wears.
function sheenStops() {
  return stopsOf(root.get('--silk-sheen'), ':root --silk-sheen');
}

// The damped sheen: what Colour-regions mode swaps in (PER-37).
function dampedStops() {
  return stopsOf(root.get('--silk-sheen-regions'), ':root --silk-sheen-regions');
}

// Straight-line distance in sRGB. Crude next to a real colour-difference
// metric, but it is the right shape for the two questions here — are two bands
// still as far apart as they were, and does one band still read as one colour.
function rgbDistance(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

// --- the positioning arithmetic -----------------------------------------

test('silk.js: every one of the 841 cells gets a normalised cloth coordinate', () => {
  assert.equal(SIZE, 29, 'the cloth is 29 cells square');
  let count = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const vars = silkVars(r, c);
      assert.deepEqual(Object.keys(vars).sort(), ['--silk-x', '--silk-y'],
        `cell ${r},${c} gets exactly the two coordinate properties`);
      // x is the column and y is the row — transposing them would rotate the
      // sheen against the cloth and is invisible on a symmetric grid.
      assert.equal(vars['--silk-x'], silkCoord(c), `cell ${r},${c}: x follows the column`);
      assert.equal(vars['--silk-y'], silkCoord(r), `cell ${r},${c}: y follows the row`);
      for (const value of Object.values(vars)) {
        const pct = Number.parseFloat(value);
        assert.match(value, /^\d+(\.\d+)?%$/, `cell ${r},${c}: coordinates are percentages, never px`);
        assert.ok(pct >= 0 && pct <= 100, `cell ${r},${c}: ${value} stays on the cloth`);
      }
      count++;
    }
  }
  assert.equal(count, 841, 'all 841 cells covered');
});

test('silk.js: the coordinates run 0% to 100% across the 28 intervals, monotonically', () => {
  assert.equal(silkCoord(0), '0%', 'the first cell is the start of the gradient');
  assert.equal(silkCoord(SIZE - 1), '100%', 'the last cell is the end of it');
  assert.equal(silkCoord(14), '50%', 'the centre column/row is mid-cloth');
  let previous = -1;
  for (let i = 0; i < SIZE; i++) {
    const pct = Number.parseFloat(silkCoord(i));
    assert.ok(pct > previous, `cell ${i} advances along the cloth`);
    previous = pct;
  }
  for (const bad of [-1, SIZE, 1.5, '3', NaN]) {
    assert.throws(() => silkCoord(bad), RangeError, `${String(bad)} is not a cell index`);
  }
});

test('silk.js: each slice lands on its own cell across the 1px gutters at 36px and 30px alike', () => {
  // The grid has 1px gaps, so the mural is 29 cell boxes plus 28 gutters wide.
  // CSS background-position percentages resolve against (cell - imageSize),
  // which must therefore advance by cell + gap between adjacent cell origins.
  assert.equal(SHEEN_SPAN, 'calc(2900% + 28px)', 'the JS span includes every gutter');
  assert.equal(GRID_GAP_PX, 1, 'the surface contract matches .grid gap: 1px');
  for (const cellPx of [36, 30]) {
    const imageSize = SIZE * cellPx + (SIZE - 1) * GRID_GAP_PX;
    for (let i = 0; i < SIZE; i++) {
      const p = Number.parseFloat(silkCoord(i)) / 100;
      const offset = (cellPx - imageSize) * p;
      const expected = -i * (cellPx + GRID_GAP_PX);
      assert.ok(
        Math.abs(offset - expected) < 0.1,
        `--cell: ${cellPx}px, index ${i}: slice offset ${offset} should be ${expected}`,
      );
    }
  }
});

test('src/app.js: buildGrid stamps the coordinates on every cell, and nothing else', () => {
  const body = functionBody(appJs, 'buildGrid');
  assert.match(appJs, /import \{ silkVars \} from '\.\/silk\.js'/, 'the mapping comes from the pure module');
  assert.match(body, /silkVars\(r, c\)/, 'each cell is given its own row/column position');
  assert.match(body, /setProperty\(prop, value\)/, 'written as custom properties, not as inline backgrounds');
  assert.doesNotMatch(body, /Math\.random/,
    'the texture is one continuous sheen, never per-cell randomness');
  assert.doesNotMatch(body, /background/i,
    'no cell paints its own background from script — the gradient stays in the stylesheet');
  // Still inside the 29x29 build loop, so all 841 cells are reached.
  assert.match(body, /for \(let r = 0; r < 29; r\+\+\)[\s\S]*for \(let c = 0; c < 29; c\+\+\)/,
    'the coordinates are stamped inside the full 29x29 loop');
});

// --- the surface itself --------------------------------------------------

test('styles.css: a cell is a fill plus one shared, non-repeating sheen', () => {
  assert.equal(cell.has('background'), false,
    'no background shorthand on .cell: it would reset the sheen layers set here');
  assert.equal(cell.get('background-color'), 'var(--cell-fill)', 'the fill is its own layer');
  assert.equal(cell.get('--cell-fill'), 'var(--cell-bg)', 'and its base is the old near-white silk');
  assert.equal(cell.get('background-image'), 'var(--silk-sheen)',
    'every cell paints the one shared sheen, not a texture of its own');
  assert.equal(cell.get('background-repeat'), 'no-repeat', 'nothing tiles inside a cell');
  assert.equal(cell.get('background-size'), 'var(--sheen-span) var(--sheen-span)',
    'the image is the whole cloth in both axes');
  assert.equal(cell.get('background-position'), 'var(--silk-x, 50%) var(--silk-y, 50%)',
    'and the cell shows only its own slice of it');
  for (const prop of ['background-size', 'background-position']) {
    assert.doesNotMatch(cell.get(prop), /px/,
      `${prop} stays proportional, so 36px and 30px cells need no separate rule`);
  }
});

test('styles.css: --sheen-span agrees with src/silk.js', () => {
  assert.equal(root.get('--sheen-span'), SHEEN_SPAN,
    'CSS sizing and the JS offsets must be derived from the same span, or the mural tears');
});

test('styles.css: the sheen is one broad low-frequency gradient, not a pattern', () => {
  const sheen = root.get('--silk-sheen');
  assert.match(sheen, /^linear-gradient\(/, 'a single gradient, one move rather than several');
  assert.doesNotMatch(sheen, /repeating-/, 'nothing repeating: a repeat would put a period in the cloth');
  assert.equal((sheen.match(/gradient\(/g) || []).length, 1, 'exactly one gradient in the token');
  assert.doesNotMatch(sheen, /px/, 'no pixel-scale stop can alias at fractional device pixels');
  const stops = sheenStops();
  assert.equal(stops[0].at, 0, 'the gradient starts at the edge of the cloth');
  assert.equal(stops.at(-1).at, 100, 'and ends at the far edge');
  for (let i = 1; i < stops.length; i++) {
    const step = stops[i].at - stops[i - 1].at;
    assert.ok(step > 0, 'stops advance');
    // 15% of a 29-cell span is >4 cells: a band, not a stripe.
    assert.ok(step >= 15, `stop ${i} is ${step}% along — bands must stay broader than a few cells`);
  }
  // Light and shade both present, or it is a tint rather than a sheen.
  const lit = stops.filter((s) => luminance(s.color) > 0.6);
  const shade = stops.filter((s) => luminance(s.color) < 0.6);
  assert.ok(lit.length >= 2 && shade.length >= 2, 'the cloth is raked by light and shade');
  assert.doesNotMatch(cssClean, /\.cell[^{}]*\{[^{}]*repeating-linear-gradient/,
    'no cell-level repeating pattern anywhere');
});

test('styles.css: the sheen cannot cost a glyph its legibility, on any fill it sits on', () => {
  const ink = parseColor(root.get('--ink'));
  const fills = new Map([
    ['--cell-bg', root.get('--cell-bg')],
    ['--gold-wash', root.get('--gold-wash')],
    ['--gold-glow', root.get('--gold-glow')],
  ]);
  // Every one of the six region colours is a fill the sheen has to sit on too.
  for (const id of REGION_IDS) {
    fills.set(`r-${id}`, rule(`.show-regions .cell.r-${id}`).get('--cell-fill'));
  }
  for (const [name, value] of fills) {
    assert.ok(value, `${name} has a colour`);
    const base = parseColor(value);
    const plain = contrast(base, ink);
    for (const stop of sheenStops()) {
      const lit = over(stop.color, base);
      const ratio = contrast(lit, ink);
      assert.ok(ratio >= 7, `${name} under sheen stop at ${stop.at}%: contrast ${ratio.toFixed(1)} must stay >= 7:1 (AAA)`);
      // A sheen, not a wash: it may not swing the surface far from its own colour.
      assert.ok(
        Math.abs(ratio - plain) / plain < 0.12,
        `${name} at ${stop.at}%: the sheen shifts contrast by ${(100 * Math.abs(ratio - plain) / plain).toFixed(1)}% — it must stay subtle`,
      );
      assert.ok(stop.color.a <= 0.3, `sheen stop at ${stop.at}% keeps its alpha low`);
    }
  }
});

// --- damped in Colour-regions mode (PER-37) ------------------------------
// The sheen is decoration; the six region tints are a signal. At full strength
// the wash was lightening each tint and varying one band along its length, so
// regions mode wears the same cloth at lower amplitude. The numbers below are
// the ones the ticket argued from, run rather than asserted in prose.

test('styles.css: Colour-regions mode swaps the shared token and does nothing else', () => {
  const regions = rule('.show-regions');
  assert.equal(regions.get('--silk-sheen'), 'var(--silk-sheen-regions)',
    'regions mode re-points the one shared token');
  assert.equal(regions.size, 1,
    'and that is the whole move: one declaration on the body, no second surface to keep in step');

  // The swap is a token, so nothing downstream changes shape: .cell still paints
  // var(--silk-sheen) and every region tint and state still sets a fill only.
  assert.equal(cell.get('background-image'), 'var(--silk-sheen)',
    'the cell keeps the one indirection and never learns which mode it is in');
  assert.equal(cell.get('background-color'), 'var(--cell-fill)', 'the fill is still its own layer');
  for (const block of blocks(cssClean)) {
    if (!block.prelude.split(',').some((s) => s.trim().startsWith('.show-regions'))) continue;
    const decls = declarations(block.body);
    assert.equal(decls.has('background'), false,
      `${block.prelude} must not use the shorthand — it would drop the cloth out from under the cell`);
    assert.equal(decls.has('background-image'), false,
      `${block.prelude} must not paint its own image; damping is a token swap, not a second layer`);
  }
  assert.ok(root.get('--silk-sheen').includes('rgba(255, 253, 246, .30)'),
    'the default token keeps its full-strength stops: regions off must not regress');
});

test('styles.css: the damped sheen is the same cloth at lower amplitude', () => {
  const full = root.get('--silk-sheen');
  const damped = root.get('--silk-sheen-regions');

  // Same rake, or the bands would cross the grid at a different angle in the two
  // modes and toggling regions would look like a different weave.
  const angle = (v) => v.match(/^linear-gradient\((-?[\d.]+deg)/);
  assert.ok(angle(damped), 'the damped token is a linear-gradient with an explicit angle');
  assert.equal(angle(damped)[1], angle(full)[1], 'both modes are raked at the same angle');

  const a = sheenStops();
  const b = dampedStops();
  assert.equal(b.length, a.length, 'same number of stops');
  const ratios = [];
  for (let i = 0; i < a.length; i++) {
    assert.equal(b[i].at, a[i].at, `stop ${i} sits at the same point along the cloth`);
    for (const ch of ['r', 'g', 'b']) {
      assert.equal(b[i].color[ch], a[i].color[ch], `stop ${i} keeps its colour; only the alpha moves`);
    }
    assert.ok(b[i].color.a < a[i].color.a, `stop ${i} is damped`);
    ratios.push(b[i].color.a / a[i].color.a);
  }
  // Damped in step: one stop pulled down further than the others would change
  // the gradient's shape, not just its strength.
  const spread = Math.max(...ratios) - Math.min(...ratios);
  assert.ok(spread <= 0.1, `all stops scale together (ratios span ${spread.toFixed(3)})`);
  assert.ok(Math.min(...ratios) >= 0.3 && Math.max(...ratios) <= 0.6,
    'damped to roughly half strength: enough to matter, not enough to erase the cloth');

  // Still a lit cloth, not a flat fill — the texture has to survive the damping.
  assert.ok(Math.max(...b.map((s) => s.color.a)) >= 0.08, 'the brightest damped stop is still visible light');
  const lit = b.filter((s) => luminance(s.color) > 0.6);
  const shade = b.filter((s) => luminance(s.color) < 0.6);
  assert.ok(lit.length >= 2 && shade.length >= 2, 'the damped cloth is still raked by light and shade');

  // The structural contract of the default token, kept by its twin.
  assert.doesNotMatch(damped, /repeating-/, 'nothing repeating: a repeat would put a period in the cloth');
  assert.equal((damped.match(/gradient\(/g) || []).length, 1, 'exactly one gradient in the token');
  assert.doesNotMatch(damped, /px/, 'no pixel-scale stop can alias at fractional device pixels');
  for (let i = 1; i < b.length; i++) {
    assert.ok(b[i].at - b[i - 1].at >= 15, `damped stop ${i} stays a band, not a stripe`);
  }
});

test('styles.css: under the damped sheen the six bands keep their separation and their colour', () => {
  const ink = parseColor(root.get('--ink'));
  const fills = REGION_IDS.map((id) => ({
    id: `r-${id}`,
    color: parseColor(rule(`.show-regions .cell.r-${id}`).get('--cell-fill')),
  }));
  const full = sheenStops();
  const damped = dampedStops();
  const worst = (stops, fn) => Math.max(...stops.map(fn));

  for (const { id, color } of fills) {
    const flat = contrast(color, ink);
    const shift = (stops) => worst(stops, (s) => Math.abs(contrast(over(s.color, color), ink) - flat) / flat);
    const before = shift(full);
    const after = shift(damped);
    assert.ok(after < before / 2,
      `${id}: the wash shifts contrast by ${(100 * after).toFixed(1)}%, less than half the ${(100 * before).toFixed(1)}% it did`);
    assert.ok(after < 0.05, `${id}: the tint is within 5% of its own unlit value`);

    // "One band reads as one colour along its length" — the part of the ticket
    // that mattered. Measured as the spread between the lightest and darkest
    // point of the cloth composited over the same tint.
    const range = (stops) => worst(stops, (x) => worst(stops, (y) => rgbDistance(over(x.color, color), over(y.color, color))));
    assert.ok(range(damped) < range(full) / 2,
      `${id}: varies by ${range(damped).toFixed(1)} sRGB along the cloth, less than half of ${range(full).toFixed(1)}`);
    assert.ok(range(damped) < 16, `${id}: and stays inside a narrow band end to end`);
  }

  // Adjacent bands: the delta between neighbouring tints is what makes six
  // bands read as six. The ticket measured ~30% of it lost at the sheen's
  // brightest; the damped wash has to give most of that back.
  const brightest = (stops) => stops.reduce((x, y) => (x.color.a > y.color.a ? x : y));
  for (let i = 0; i < fills.length - 1; i++) {
    const [x, y] = [fills[i], fills[i + 1]];
    const bare = rgbDistance(x.color, y.color);
    assert.ok(bare > 0, `${x.id} and ${y.id} are different colours to begin with`);
    const kept = (stops) => {
      const s = brightest(stops).color;
      return rgbDistance(over(s, x.color), over(s, y.color)) / bare;
    };
    assert.ok(kept(damped) > kept(full),
      `${x.id}/${y.id}: damping returns separation the full sheen was taking`);
    assert.ok(kept(damped) >= 0.85,
      `${x.id}/${y.id}: keeps ${(100 * kept(damped)).toFixed(0)}% of its separation at the sheen's brightest`);
  }
});

test('styles.css: the damped sheen keeps every fill it sits on AAA-legible too', () => {
  // Same check as the full-strength sheen, over the fills regions mode can show:
  // the six tints, the centre's plain silk, and a traced path crossing them.
  const ink = parseColor(root.get('--ink'));
  const fills = new Map([
    ['--cell-bg', root.get('--cell-bg')],
    ['--gold-wash', root.get('--gold-wash')],
    ['--gold-glow', root.get('--gold-glow')],
  ]);
  for (const id of REGION_IDS) {
    fills.set(`r-${id}`, rule(`.show-regions .cell.r-${id}`).get('--cell-fill'));
  }
  for (const [name, value] of fills) {
    const base = parseColor(value);
    for (const stop of dampedStops()) {
      const ratio = contrast(over(stop.color, base), ink);
      assert.ok(ratio >= 7, `${name} under damped stop at ${stop.at}%: contrast ${ratio.toFixed(1)} must stay >= 7:1 (AAA)`);
      assert.ok(stop.color.a <= 0.3, `damped stop at ${stop.at}% keeps its alpha low`);
    }
  }
  // The gold thread's two fills have to stay apart from every tint underneath
  // them, or a traced cell would vanish into its region in regions mode.
  const wash = parseColor(root.get('--gold-wash'));
  const glow = parseColor(root.get('--gold-glow'));
  for (const id of REGION_IDS) {
    const tint = parseColor(rule(`.show-regions .cell.r-${id}`).get('--cell-fill'));
    for (const stop of dampedStops()) {
      for (const [label, traced] of [['--gold-wash', wash], ['--gold-glow', glow]]) {
        assert.ok(rgbDistance(over(stop.color, traced), over(stop.color, tint)) >= 8,
          `${label} stays distinguishable from r-${id} at the damped stop at ${stop.at}%`);
      }
    }
  }
});

// --- what the surface must not break ------------------------------------

test('styles.css: the six colour regions keep their exact colours, now as fills', () => {
  const expected = {
    'r-center': '#f0d5cd',
    'r-band-inner': '#f1decb',
    'r-band-mid': '#e6e3c8',
    'r-band-outer': '#d9e0d5',
    'r-band-far': '#dcd6e0',
    'r-border': '#e8dcc0',
  };
  assert.deepEqual(REGION_IDS.map((id) => `r-${id}`).sort(), Object.keys(expected).sort(),
    'exactly the six meaningful regions, unchanged');
  for (const [region, colour] of Object.entries(expected)) {
    const tint = rule(`.show-regions .cell.${region}`);
    assert.equal(tint.get('--cell-fill'), colour, `${region} keeps its colour`);
    assert.equal(tint.has('background'), false, `${region} must not use the shorthand and drop the sheen`);
    assert.equal(tint.has('background-image'), false, `${region} tints the fill only`);
  }
});

test('styles.css: selection states re-point the fill and keep the sheen and their edges', () => {
  const inLine = rule('.cell.in-line');
  assert.equal(inLine.get('--cell-fill'), 'var(--gold-wash)', 'a traced cell is still the faint gold wash');
  assert.equal(inLine.get('font-weight'), '600', 'and still sets its glyph heavier');
  assert.equal(inLine.has('background'), false, 'without resetting the cloth under it');

  const preview = rule('.cell.preview');
  assert.equal(preview.get('--cell-fill'), 'var(--gold-glow)', 'a previewed cell still glows gold');
  assert.match(preview.get('box-shadow'), /inset 0 0 0 2px var\(--gold\)/, 'and keeps its inset border');
  assert.equal(preview.has('background'), false, 'sheen survives the preview');

  const junction = rule('.cell.junction');
  assert.match(junction.get('outline'), /3px solid var\(--vermillion\)/, 'the junction keeps its vermillion ring');
  assert.equal(junction.get('outline-offset'), '-3px', 'drawn inside the cell');
  assert.equal(junction.get('z-index'), '1', 'and stacked above its neighbours');

  const hover = rule('.cell:not(.center):not(.in-line):not(.junction):not(.preview):hover',
    mediaBody('@media (hover: hover)'));
  assert.equal(hover.get('--cell-fill'), 'var(--gold-glow)', 'hover also only re-points the fill');
  assert.equal(hover.has('background'), false, 'hover does not blank the sheen either');
});

test('styles.css: state fills still win over the region tints', () => {
  // Specificity first: the hover rule's four :not()s are what keep it above the
  // (0,3,0) region tints, and .show-regions state rules match them and come later.
  for (const state of ['in-line', 'preview']) {
    const stateAt = cssClean.indexOf(`.show-regions .cell.${state}`);
    assert.ok(stateAt > -1, `.show-regions .cell.${state} exists`);
    for (const id of REGION_IDS) {
      const tintAt = cssClean.indexOf(`.show-regions .cell.r-${id}`);
      assert.ok(tintAt > -1, `region tint r-${id} exists`);
      assert.ok(tintAt < stateAt, `.show-regions .cell.${state} must be declared after r-${id}`);
    }
  }
  assert.equal(rule('.show-regions .cell.in-line').get('--cell-fill'), 'var(--gold-wash)',
    'the traced wash wins over any region colour');
  assert.equal(rule('.show-regions .cell.preview').get('--cell-fill'), 'var(--gold-glow)',
    'so does the preview glow');
  assert.match(
    cssClean,
    /\.cell:not\(\.center\):not\(\.in-line\):not\(\.junction\):not\(\.preview\):hover/,
    'the four separate :not()s are kept: collapsing them would drop below the region tints',
  );
});

test('styles.css: the centre 心 keeps its halo and resets the sheen sizing', () => {
  const center = rule('.cell.center');
  assert.equal(center.get('background-image'), 'var(--center-glow)', 'the halo is the centre cell\'s own image');
  assert.equal(center.get('background-size'), 'auto',
    'without this the 29-cell sizing would blow the halo up into a flat patch');
  assert.equal(center.get('background-position'), 'center', 'and it is centred on the cell, not sliced');
  assert.equal(center.get('color'), 'var(--vermillion)', 'still vermillion');
  assert.equal(center.get('cursor'), 'default', 'still inert');
  assert.match(root.get('--center-glow'), /^radial-gradient\(circle at center/, 'the halo itself is untouched');
  // In regions mode the halo must not mix with the r-center tint.
  assert.equal(rule('.show-regions .cell.r-center.center').get('--cell-fill'), 'var(--cell-bg)',
    'the centre keeps the plain silk fill under its halo in regions mode');
});

test('styles.css: the gutter weave, selvedge and cell pitches are untouched', () => {
  const grid = rule('.grid');
  assert.equal(grid.get('gap'), '1px', 'the 1px gutter is intact');
  assert.equal(grid.get('background-color'), 'var(--line)', 'the woven ground still shows in the gutters');
  assert.equal((grid.get('background-image').match(/repeating-linear-gradient/g) || []).length, 2,
    'both warp and weft gradients of the gutter weave survive');
  assert.match(grid.get('border-image'), /repeating-linear-gradient\(45deg/, 'the twill selvedge survives');
  assert.equal(grid.get('padding'), '2px', 'and the bound inner seam');
  assert.match(grid.get('box-shadow'), /var\(--selvedge-seam\)/, 'including the seam line');
  assert.equal(grid.get('grid-template-columns'), 'repeat(29, var(--cell))', 'still 29 columns of --cell');

  assert.equal(root.get('--cell'), '36px', 'default cell pitch stays 36px');
  assert.equal(root.get('--glyph'), '22px', 'default glyph size stays 22px');
  const mobileRoot = rule(':root', mediaBody('@media (max-width: 600px)'));
  assert.equal(mobileRoot.get('--cell'), '30px', 'mobile cell pitch stays 30px');
  assert.equal(mobileRoot.get('--glyph'), '18px', 'mobile glyph size stays 18px');
  // Both sizes are served by the same proportional surface — no size-specific
  // override may creep in, or the two would drift apart.
  assert.doesNotMatch(mediaBody('@media (max-width: 600px)'), /--silk-sheen|--sheen-span|background-position/,
    'the mobile query needs no surface override of its own');
});

test('styles.css: the gold thread still multiplies over the new surface', () => {
  assert.equal(rule('.thread').get('mix-blend-mode'), 'multiply',
    'the sheen sits under the thread; multiply is what keeps the ink readable through it');
  assert.equal(rule('.cell').get('transition'), 'background-color .08s ease',
    'only the fill transitions — the sheen must never animate');
  assert.match(mediaBody('@media (prefers-reduced-motion: reduce)'), /\.cell[^{]*\{[^}]*transition:\s*none/,
    'reduced motion still stills the cells');
});

// --- traced, not empty ---------------------------------------------------

test('a real traced quatrain sits on the cloth without disturbing it', () => {
  // The acceptance criterion asks for a traced path rather than an empty grid.
  // No DOM here, so this traces a genuine quatrain through src/selection.js and
  // checks the surface contract against the cells the app would actually class.
  const selection = createSelection(GRID);
  const dir = (id) => DIRECTIONS.find((d) => d.id === id);
  // A square walked clockwise from mid-cloth: four valid lines that stay on the
  // grid, cross several regions, and never touch the centre.
  assert.equal(selection.pickStart({ row: 10, col: 10 }), true, 'a start off the centre');
  for (const id of ['e', 's', 'w', 'n']) {
    assert.equal(selection.addLine(dir(id)), true, `line ${id} committed`);
  }
  assert.equal(selection.lineCount(), 4, 'a full quatrain traced');

  const traced = selection.allLines().flatMap((l) => l.cells);
  assert.equal(traced.length, 28, 'four lines of seven cells');
  const seen = new Set();
  for (const c of traced) {
    assert.equal(isCenter(c), false, 'the inert 心 is never traced, so its halo is never a path cell');
    // Each traced cell still carries its own slice of the one sheen: the
    // highlight follows the thread across the cloth instead of restarting.
    const vars = silkVars(c.row, c.col);
    assert.equal(vars['--silk-x'], silkCoord(c.col));
    assert.equal(vars['--silk-y'], silkCoord(c.row));
    seen.add(`${vars['--silk-x']}|${vars['--silk-y']}`);
    // And whatever region it crosses, the traced fill is what it wears.
    assert.ok(REGION_IDS.includes(regionAt(c.row, c.col)), 'every traced cell has a region');
  }
  assert.ok(seen.size > 1, 'the traced path crosses more than one point of the sheen');

  // The fills those 28 cells take, composited under the sheen, must still read.
  const ink = parseColor(root.get('--ink'));
  for (const fill of [root.get('--gold-wash'), root.get('--gold-glow')]) {
    for (const stop of sheenStops()) {
      assert.ok(contrast(over(stop.color, parseColor(fill)), ink) >= 7,
        `traced fill ${fill} stays AAA-legible under the sheen stop at ${stop.at}%`);
    }
  }
});
