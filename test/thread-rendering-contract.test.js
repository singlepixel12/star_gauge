// test/thread-rendering-contract.test.js
// Guards the gold-thread rendering contract tightened by PER-24: the start of
// every strand must read at a glance, without losing the direction cue, the
// glyph legibility that mix-blend-mode gives us, or the Colour-regions cascade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

// Body of the first rule whose selector matches exactly, e.g. rule('.thread')
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`${escaped}\\s*\\{([^{}]*)\\}`));
  assert.ok(m, `expected a rule for "${selector}"`);
  return m[1];
}

test('styles.css: the thread overlay keeps its multiply blend', () => {
  assert.match(
    rule('.thread'),
    /mix-blend-mode:\s*multiply/,
    'multiply on the overlay root is what lets ink glyphs read through the thread',
  );
});

test('styles.css: strand gradient keeps distinct soft-to-ink stop colours', () => {
  assert.match(rule('.thread .strand-from'), /stop-color:\s*var\(--gold-soft\)/, 'start stop is the soft gold');
  assert.match(rule('.thread .strand-to'), /stop-color:\s*var\(--gold-ink\)/, 'end stop is the deep gold ink');
});

test('styles.css: the strand start is opaque enough to read, the end still deeper', () => {
  const from = rule('.thread .strand-from').match(/stop-opacity:\s*(\.?\d*\.?\d+)/);
  const to = rule('.thread .strand-to').match(/stop-opacity:\s*(\.?\d*\.?\d+)/);
  assert.ok(from && to, 'both gradient stops declare a stop-opacity');
  const fromOpacity = Number.parseFloat(from[1]);
  const toOpacity = Number.parseFloat(to[1]);
  assert.equal(fromOpacity, 0.9, 'strand start reads immediately (PER-24: was .45)');
  assert.equal(toOpacity, 0.95, 'strand end is unchanged');
  assert.ok(fromOpacity < toOpacity, 'the gradient still deepens start -> end, so direction reads');
  assert.ok(toOpacity < 1, 'the thread stays translucent so the glyph underneath survives');
});

test('styles.css: strands stay unfilled with round caps and joins', () => {
  const strand = rule('.thread .strand');
  assert.match(strand, /fill:\s*none/, 'a filled polyline would black out the cells it encloses');
  assert.match(strand, /stroke-linecap:\s*round/, 'round caps keep the thread ends soft');
  assert.match(strand, /stroke-linejoin:\s*round/, 'round joins keep the pivots from spiking');
});

test('src/app.js: strand stroke width still scales with cell pitch above a floor', () => {
  assert.match(
    appJs,
    /'stroke-width':\s*Math\.max\(2\.5,\s*pitch \* 0\.1\)/,
    'stroke width is unchanged by PER-24 — visibility comes from opacity, not weight',
  );
});

test('styles.css: default and mobile cell/glyph sizes are unchanged', () => {
  const root = rule(':root');
  assert.match(root, /--cell:\s*36px/, 'default cell pitch stays 36px');
  assert.match(root, /--glyph:\s*22px/, 'default glyph size stays 22px');
  const mobile = css.match(/@media \(max-width: 600px\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(mobile, 'mobile media query exists');
  assert.match(mobile[1], /--cell:\s*30px/, 'mobile cell pitch stays 30px');
  assert.match(mobile[1], /--glyph:\s*18px/, 'mobile glyph size stays 18px');
});

test('styles.css: traced cells keep the faint gold wash in both plain and regions mode', () => {
  assert.match(
    rule('.cell.in-line'),
    /background:\s*var\(--gold-wash\)/,
    'a traced cell is a faint wash, so the thread gradient is what the eye follows',
  );
  assert.match(
    rule('.show-regions .cell.in-line'),
    /background:\s*var\(--gold-wash\)/,
    'the same wash must win over every region tint',
  );
});

test('styles.css: .show-regions .cell.in-line is declared after all six region tints', () => {
  const inLine = css.indexOf('.show-regions .cell.in-line');
  assert.ok(inLine > -1, 'the regions-mode path highlight exists');
  for (const region of ['r-center', 'r-band-inner', 'r-band-mid', 'r-band-outer', 'r-band-far', 'r-border']) {
    const tint = css.indexOf(`.show-regions .cell.${region}`);
    assert.ok(tint > -1, `region tint .${region} exists`);
    assert.ok(tint < inLine, `.show-regions .cell.in-line must come after .${region} to win the cascade`);
  }
});
