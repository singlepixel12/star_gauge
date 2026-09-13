// test/compass-legibility.test.js
// Guards the open compass rose introduced by PER-26. The compass floats over the
// eight cells it is asking the reader to choose between, so its one hard job is
// to stay out of their way: no opaque plate over a character, no arrow parked on
// top of one, and none of that bought by giving up the affordances the control
// already had (the click-through hole, the 44px coarse target, a real focus
// ring, a disabled state that reads as disabled).
//
// What is *parsed* here: styles.css, read as declarations rather than as loose
// text, so a rule has to actually say what we claim it says — plus the compass
// layout array in src/app.js, because the rim placement below is keyed off DOM
// order and would silently point the wrong way if that array were reordered.
//
// WHAT THIS FILE CANNOT COVER — needs manual/browser validation.
// There is no DOM implementation and no CSS engine in this repo (no jsdom, no
// playwright — deliberately: vanilla site, no build step, no dependencies), so
// nothing below computes a layout or a painted pixel. These remain manual:
//   * that a character under a compass button is *actually* legible at 100%
//     zoom — we can prove every fill is transparent or faint and that each arrow
//     is aligned outward, not that the rendered result reads cleanly.
//   * real hover / :focus-visible / :disabled painting, and the 44px target as
//     measured once font metrics have settled.
//   * that the rose still reads as one compass at a glance rather than eight
//     loose rings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DIRECTIONS } from '../src/geometry.js';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

// --- tiny CSS parser -----------------------------------------------------
// Enough for this stylesheet: no braces inside strings, at-rules one level deep.

const cssClean = css.replace(/\/\*[\s\S]*?\*\//g, '');

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

function selectorsOf(prelude) {
  return prelude.split(',').map((s) => s.trim());
}

// Every style rule in the sheet, flattened out of its at-rules and tagged with
// the at-rule context it was found under ('' for top level).
function allRules(source = cssClean, context = '') {
  const out = [];
  for (const b of blocks(source)) {
    if (b.prelude.startsWith('@')) out.push(...allRules(b.body, `${context} ${b.prelude}`.trim()));
    else out.push({ ...b, context });
  }
  return out;
}

// Declarations of one rule body, as property -> value. Semicolons inside parens
// (gradients, shadows) are not separators; whitespace is normalised.
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
    (b) => !b.prelude.startsWith('@') && selectorsOf(b.prelude).includes(selector),
  );
  assert.equal(found.length, 1, `expected exactly one rule for ${selector}`);
  return declarations(found[0].body);
}

// Every top-level rule whose selector list contains `selector`, cascaded in
// source order. Some states are split across rules (the shared hover/focus tint,
// then the focus-only ring), so the contract is about what the element ends up
// with, not about which rule happened to say it.
function cascaded(selector) {
  const found = allRules().filter((r) => !r.context && selectorsOf(r.prelude).includes(selector));
  assert.ok(found.length >= 1, `expected at least one rule for ${selector}`);
  const map = new Map();
  for (const r of found) for (const [k, v] of declarations(r.body)) map.set(k, v);
  return map;
}

function mediaBody(query) {
  const found = blocks(cssClean).filter((b) => b.prelude === query);
  assert.equal(found.length, 1, `expected exactly one ${query} block`);
  return found[0].body;
}

// Split a value on top-level separators, so rgba(...) survives intact.
function splitTopLevel(value, sep = ',') {
  const out = [];
  let depth = 0;
  let buf = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      out.push(buf.trim());
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

// --- colour opacity ------------------------------------------------------
// The legibility invariant is about alpha, so custom properties are resolved
// back to the literal they hold. Anything we cannot read as translucent counts
// as opaque: an unreadable value must fail this file, not slip through it.

const rootVars = rule(':root');

function resolveColour(value) {
  let v = value.trim();
  for (let i = 0; i < 5 && v.startsWith('var(') && v.endsWith(')'); i++) {
    const name = splitTopLevel(v.slice(4, -1))[0].trim();
    const held = (rootVars.get(name) || '').trim();
    if (!held) break;
    v = held;
  }
  return v;
}

function alphaOf(value) {
  const v = resolveColour(value).toLowerCase();
  if (v === 'none' || v === 'transparent') return 0;
  const m = v.match(/^rgba?\(([^)]*)\)$/);
  if (m) {
    const parts = splitTopLevel(m[1].replace(/\//g, ',')).map((s) => s.trim());
    return parts.length > 3 ? Number.parseFloat(parts[3]) : 1;
  }
  return 1; // hex, keyword, gradient, unreadable: treat as a solid plate
}

// --- the compass rules ---------------------------------------------------

// Every rule that paints a compass button, in any at-rule context.
const buttonRules = allRules().filter((r) =>
  selectorsOf(r.prelude).some((s) => /^\.compass\b/.test(s) && /\bbutton\b/.test(s)),
);

// A fill faint enough that a 22px ink glyph still reads through it. The compass
// this replaces sat at .92, which is what PER-26 is about.
const MAX_FILL_ALPHA = 0.35;

test('styles.css: the compass keeps its geometry, hole and pointer-events contract', () => {
  const compass = rule('.compass');
  assert.equal(compass.get('position'), 'absolute', 'still positioned over the junction cell');
  assert.equal(compass.get('z-index'), '10', 'still above the thread overlay');
  assert.equal(compass.get('display'), 'grid');
  for (const axis of ['grid-template-columns', 'grid-template-rows']) {
    assert.equal(
      compass.get(axis),
      'repeat(3, var(--compass-btn, 38px))',
      `${axis}: the 3x3 rose at the 38px desktop default`,
    );
  }
  assert.equal(compass.get('gap'), '2px', 'unchanged spacing between buttons');
  assert.equal(
    compass.get('pointer-events'),
    'none',
    'the container never swallows clicks — the hole must reach the junction cell',
  );
  assert.equal(
    rule('.compass button').get('pointer-events'),
    'auto',
    'the buttons themselves stay clickable',
  );
  assert.equal(rule('.compass .hole').get('visibility'), 'hidden', 'the centre stays a hole');
});

test('styles.css: no compass button paints an opaque plate over a character', () => {
  assert.ok(buttonRules.length >= 4, 'base, rim placement, hover/focus and disabled rules found');
  let fills = 0;
  for (const r of buttonRules) {
    const d = declarations(r.body);
    for (const prop of ['background', 'background-color', 'background-image']) {
      if (!d.has(prop)) continue;
      fills++;
      const value = d.get(prop);
      const alpha = alphaOf(value);
      assert.ok(
        alpha <= MAX_FILL_ALPHA,
        `${r.prelude} { ${prop}: ${value} } — alpha ${alpha} hides the character underneath`,
      );
    }
  }
  assert.ok(fills >= 1, 'at least one fill declaration was actually inspected');
  // The resting state matters most: an unhovered compass is what the reader
  // stares at while choosing, so it carries no fill at all.
  assert.equal(alphaOf(rule('.compass button').get('background')), 0, 'the resting button is open');
  // And the two opaque values PER-26 removed are gone from the compass rules.
  for (const r of buttonRules) {
    assert.doesNotMatch(r.body, /rgba\(243, 232, 208, \.92\)/, 'the old silk disc is gone');
    assert.doesNotMatch(r.body, /background:\s*var\(--gold-glow\)/, 'the opaque hover fill is gone');
  }
});

test('styles.css: the button is a ring, not a disc with a drop shadow', () => {
  const base = rule('.compass button');
  assert.match(base.get('border'), /^[\d.]+px solid /, 'a drawn rim keeps the compass geometry');
  assert.equal(base.get('border-radius'), '50%', 'still a circle');
  for (const layer of splitTopLevel(base.get('box-shadow'))) {
    // `inset` may lead the layer; the two lengths after it are the offsets.
    const [x, y] = layer.replace(/^inset\s+/, '').split(/\s+/);
    assert.equal(x, '0', `box-shadow layer "${layer}" has no x offset — it hugs the rim`);
    assert.equal(y, '0', `box-shadow layer "${layer}" has no y offset — it hugs the rim`);
    const colour = layer.match(/(rgba?\([^)]*\)|var\(--[\w-]+\)|#[0-9a-f]{3,8})/i);
    assert.ok(colour, `box-shadow layer "${layer}" names a colour`);
    assert.ok(
      alphaOf(colour[1]) <= 0.6,
      `box-shadow layer "${layer}" stays translucent, so it cannot act as a fill`,
    );
  }
});

test('styles.css: each arrow is pushed to the rim it points at, off the glyph', () => {
  const base = rule('.compass button');
  assert.equal(base.get('display'), 'flex', 'flex is what makes the alignment below bite');
  assert.equal(base.get('align-items'), 'center', 'neutral fallback');
  assert.equal(base.get('justify-content'), 'center', 'neutral fallback');

  // The CSS reads placement off the 3x3 position, so the DOM order it assumes is
  // part of the contract. buildCompass() in src/app.js owns that order.
  const layout = JSON.parse(appJs.match(/const layout = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
  assert.deepEqual(
    layout,
    ['nw', 'n', 'ne', 'w', null, 'e', 'sw', 's', 'se'],
    'compass DOM order is unchanged; the nth-child rim rules depend on it',
  );

  // :nth-child(An+B) against a 1-based position.
  const matchesNth = (formula, i) => {
    const f = formula.replace(/\s+/g, '');
    const m = f.match(/^([+-]?\d*)n([+-]\d+)?$/);
    if (!m) return Number.parseInt(f, 10) === i;
    const a = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : Number.parseInt(m[1], 10);
    const b = m[2] ? Number.parseInt(m[2], 10) : 0;
    if (a === 0) return i === b;
    return (i - b) % a === 0 && (i - b) / a >= 0;
  };
  const positionRules = buttonRules
    .filter((r) => selectorsOf(r.prelude).some((s) => s.includes(':nth-child(')))
    .map((r) => ({
      prelude: r.prelude,
      decls: declarations(r.body),
      matches: (i) =>
        selectorsOf(r.prelude).some((s) => {
          const formulas = [...s.matchAll(/:nth-child\(([^)]*)\)/g)].map((m) => m[1]);
          return formulas.length > 0 && formulas.every((f) => matchesNth(f, i));
        }),
    }));
  assert.ok(positionRules.length >= 6, 'three columns and three rows of rim placement');

  // Outward: the sign of the direction vector *is* the alignment.
  const OUTWARD = { '-1': 'flex-start', 0: 'center', 1: 'flex-end' };
  for (const [index, id] of layout.entries()) {
    const position = index + 1;
    if (id === null) {
      // The hole is a <span>, so `.compass button` rules never reach it anyway.
      assert.equal(position, 5, 'the hole is the centre of the 3x3');
      continue;
    }
    const dir = DIRECTIONS.find((d) => d.id === id);
    assert.ok(dir, `${id} is a real direction`);
    for (const [prop, delta] of [['justify-content', dir.dc], ['align-items', dir.dr]]) {
      const matched = positionRules.filter((r) => r.matches(position) && r.decls.has(prop));
      assert.equal(matched.length, 1, `${id}: exactly one rule sets its ${prop}`);
      assert.equal(
        matched[0].decls.get(prop),
        OUTWARD[String(delta)],
        `${id} (dr ${dir.dr}, dc ${dir.dc}): its arrow sits on the rim it points at`,
      );
    }
  }
});

test('styles.css: the arrow stays readable over ink without a plate under it', () => {
  const base = rule('.compass button');
  assert.match(base.get('font-size'), /rem$/, 'arrow size still scales with the root font');
  const size = Number.parseFloat(base.get('font-size'));
  assert.ok(size <= 1, `the arrow is no bigger than before (${base.get('font-size')} <= 1rem)`);
  assert.ok(size >= 0.7, 'but not shrunk into illegibility');
  assert.ok(base.has('color'), 'the arrow has its own ink');
  assert.match(
    base.get('text-shadow'),
    /var\(--cell-bg\)/,
    'a halo in the cell colour is what replaces the silk plate',
  );
  // Padding must not pull the arrow back off the rim it is aligned to.
  assert.ok(Number.parseFloat(base.get('padding')) <= 4, 'the arrow still reaches the rim');
});

test('styles.css: hover and focus tint the rose without refilling it', () => {
  const hover = cascaded('.compass button:hover:not(:disabled)');
  assert.ok(hover.has('background') || hover.has('border-color'), 'hover is visible at all');
  assert.ok(alphaOf(hover.get('background') || 'none') <= MAX_FILL_ALPHA, 'hover stays see-through');

  const focus = cascaded('.compass button:focus-visible');
  assert.match(focus.get('outline'), /^\d+px solid /, 'a real, visible keyboard focus ring');
  assert.notEqual(focus.get('outline'), 'none');
  assert.ok(focus.has('outline-offset'), 'held clear of the rim');
  assert.ok(
    alphaOf(focus.get('background') || 'none') <= MAX_FILL_ALPHA,
    'a focused button is still see-through',
  );
});

test('styles.css: disabled directions still read as disabled', () => {
  const disabled = rule('.compass button:disabled');
  assert.equal(disabled.get('cursor'), 'not-allowed', 'disabled semantics kept');
  const opacity = Number.parseFloat(disabled.get('opacity'));
  assert.ok(opacity < 1, 'and it reads as unavailable');
  assert.ok(opacity >= 0.2, 'without vanishing now that there is no fill left to fade');
  assert.ok(
    disabled.has('border-style') || disabled.has('border'),
    'the rim itself changes, so the state is not carried by opacity alone',
  );
});

test('styles.css: touch targets and compass clearance are untouched by the restyle', () => {
  assert.equal(
    rule(':root', mediaBody('@media (pointer: coarse)')).get('--compass-btn'),
    '44px',
    'coarse pointers keep a 44px compass button',
  );
  assert.equal(
    rule('.grid-frame').get('padding'),
    '56px',
    'the frame padding that lets the compass sit over an edge cell',
  );
});
