// test/controls-contract.test.js
// Guards the controls-bar contract introduced by PER-14: the Colour regions
// control is a deliberately styled native button toggle rather than default
// browser furniture, the status copy keeps its role and its exact wording while
// losing the inline bold serif, and the sticky bar lays out as one row on
// desktop and exactly two rows on a phone.
//
// What is *executed* here: the toggle's state transition, which lives in
// src/controls.js precisely so it can be run rather than pattern-matched.
//
// What is *parsed* here: index.html and styles.css, read as declarations rather
// than as loose text, so a rule has to actually say what we claim it says.
//
// WHAT THIS FILE CANNOT COVER — needs manual/browser validation.
// This repo has no DOM implementation and no CSS engine (no jsdom, no
// playwright — deliberately: vanilla site, no build step, no dependencies), so
// nothing below computes a layout. These remain manual checks:
//   * pixel-level rendering at 320px, 375px and 600px viewport widths — that
//     the bar really is one row / two rows there, and that nothing overflows,
//     clips or overlaps. We can assert the grid template and that no wrap is
//     declared; we cannot measure the resulting boxes.
//   * assistive-technology behaviour — that a screen reader announces the
//     toggle's pressed state and re-announces the role="status" copy. We can
//     assert the attributes that make that possible, not the announcement.
//   * real focus-visible / hover / active painting, and the 44px touch target
//     as measured once font metrics have settled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { nextRegionsState, isPressed, pressedAttr } from '../src/controls.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

// --- tiny HTML helpers ---------------------------------------------------

// Whole element, opening tag through closing tag, e.g. <button id="undo" ...>...</button>
function element(source, id) {
  const m = source.match(new RegExp(`<([a-z]+)\\s[^>]*id="${id}"[\\s\\S]*?<\\/\\1>`, 'i'));
  assert.ok(m, `expected an element with id="${id}"`);
  return m[0];
}

// The controls bar only, so "still in the markup somewhere" cannot pass for it.
function controlsSection() {
  const m = html.match(/<section class="controls"[\s\S]*?<\/section>/);
  assert.ok(m, '.controls section present');
  return m[0];
}

const VOID_TAGS = new Set(['input', 'br', 'img', 'hr', 'meta', 'link']);

// Direct element children of a section — the things the grid template has to
// place. The spans nested inside the toggle are not grid items.
function directChildCount(section) {
  const inner = section
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^<section[^>]*>/, '')
    .replace(/<\/section>$/, '');
  let depth = 0;
  let count = 0;
  for (const m of inner.matchAll(/<(\/?)([a-z]+)[^>]*?(\/?)>/gi)) {
    if (m[1] === '/') { depth--; continue; }
    if (depth === 0) count++;
    if (m[3] !== '/' && !VOID_TAGS.has(m[2].toLowerCase())) depth++;
  }
  return count;
}

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
// (gradients, minmax) are not separators; whitespace is normalised.
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

function mediaBody(query) {
  const found = blocks(cssClean).filter((b) => b.prelude === query);
  assert.equal(found.length, 1, `expected exactly one ${query} block`);
  return found[0].body;
}

// Track list of a grid-template-*, split on top-level whitespace only, so
// minmax(0, 1fr) counts as a single track.
function tracks(value) {
  const out = [];
  let depth = 0;
  let buf = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (buf) out.push(buf);
      buf = '';
    } else buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

// --- markup --------------------------------------------------------------

test('index.html: Colour regions is a native button toggle, not a checkbox', () => {
  const controls = controlsSection();
  // Checked against the whole document too: the checkbox must be gone, not moved.
  assert.doesNotMatch(html, /<input[^>]*id="regions-toggle"/, 'the native checkbox is gone');
  assert.doesNotMatch(html, /type="checkbox"/, 'no checkbox anywhere in the page');
  assert.doesNotMatch(controls, /<label[^>]*class="[^"]*\btoggle\b/, 'the wrapping label is gone');
  const toggle = element(controls, 'regions-toggle');
  assert.match(toggle, /^<button\s/, 'the toggle is a <button>');
  assert.match(toggle, /type="button"/, 'type="button", so it never submits');
  assert.match(toggle, /aria-pressed="false"/, 'starts unpressed, matching the untinted grid');
});

test('index.html: the toggle keeps its visible label and stylized caveat', () => {
  const toggle = element(controlsSection(), 'regions-toggle');
  assert.match(toggle, /Colour regions/, 'label still reads "Colour regions"');
  assert.match(toggle, /\(stylized\)/, 'the approximation caveat travels with the label');
});

test('index.html: Undo and Reset keep their ids, type and disabled start', () => {
  const controls = controlsSection();
  for (const id of ['undo', 'reset']) {
    const btn = element(controls, id);
    assert.match(btn, /type="button"/, `#${id} is a plain button`);
    assert.match(btn, /\bdisabled\b/, `#${id} starts disabled, as before`);
  }
});

test('index.html: status keeps role=status and its exact opening copy', () => {
  const status = element(controlsSection(), 'progress');
  assert.match(status, /role="status"/, 'status stays a polite live region');
  assert.match(status, /class="[^"]*\bprogress\b/, 'status keeps the .progress hook');
  assert.match(status, />Tap a character to begin\.</, 'opening copy is unchanged');
});

test('index.html: the bar holds exactly the four grid items the template places', () => {
  assert.equal(directChildCount(controlsSection()), 4, 'Undo, Reset, toggle, status');
  // The page starts untinted: the body carries no state class of its own.
  assert.doesNotMatch(html, /<body[^>]*class=/, 'no show-regions baked into the markup');
});

// --- the toggle state machine, actually run ------------------------------

test('src/controls.js: false -> true and true -> false, string and boolean agreeing', () => {
  const on = nextRegionsState('false');
  assert.deepEqual(on, { on: true, ariaPressed: 'true' }, 'an unpressed click turns regions on');
  assert.equal(on.ariaPressed, String(on.on), 'the attribute is that boolean, spelled out');

  const off = nextRegionsState('true');
  assert.deepEqual(off, { on: false, ariaPressed: 'false' }, 'a pressed click turns regions off');
  assert.equal(off.ariaPressed, String(off.on), 'the attribute is that boolean, spelled out');
});

test('src/controls.js: only the literal "true" counts as pressed', () => {
  assert.equal(isPressed('true'), true);
  for (const bogus of ['false', '', 'TRUE', 'yes', null, undefined]) {
    assert.equal(isPressed(bogus), false, `${bogus} is not a pressed state`);
    // A missing or malformed attribute must not latch the toggle off.
    assert.equal(nextRegionsState(bogus).on, true, `${bogus} still turns on when clicked`);
  }
  assert.equal(pressedAttr(true), 'true');
  assert.equal(pressedAttr(false), 'false');
});

test('src/controls.js: repeated clicks alternate, reading back what was written', () => {
  // Exactly how the button behaves: aria-pressed *is* the store, so each click
  // is fed the string the previous click wrote.
  const start = element(controlsSection(), 'regions-toggle').match(/aria-pressed="([^"]*)"/)[1];
  assert.equal(start, pressedAttr(false), 'the markup starts from the module’s off value');

  let attr = start;
  const visibility = [];
  for (let click = 0; click < 4; click++) {
    const state = nextRegionsState(attr);
    // Live equality: the class flag and the announced attribute are one state.
    assert.equal(state.ariaPressed, String(state.on), `click ${click + 1} is self-consistent`);
    visibility.push(state.on);
    attr = state.ariaPressed;
  }
  assert.deepEqual(visibility, [true, false, true, false], 'strict alternation');
  assert.equal(attr, start, 'two clicks return the button to its initial attribute');
});

test('src/app.js: the click handler applies both DOM writes from that one state', () => {
  assert.doesNotMatch(appJs, /regionsToggle\.checked/, 'no checkbox .checked reads remain');
  assert.match(
    appJs,
    /import \{ nextRegionsState \} from '\.\/controls\.js';/,
    'the app takes the transition from the tested module',
  );
  assert.match(
    appJs,
    /regionsToggle\.addEventListener\('click',\s*\(\) =>\s*applyRegionsState\(nextRegionsState\(regionsToggle\.getAttribute\('aria-pressed'\)\)\)\)/,
    'click reads aria-pressed, asks the module, applies what comes back',
  );
  // Both writes destructure the same object, so they cannot be handed different states.
  assert.match(
    appJs,
    /function applyRegionsState\(\{ on, ariaPressed \}\) \{\s*regionsToggle\.setAttribute\('aria-pressed', ariaPressed\);\s*document\.body\.classList\.toggle\('show-regions', on\);\s*\}/,
    'one state object drives the attribute and the body class',
  );
  // And no second, hand-rolled copy of the transition anywhere in the app.
  assert.doesNotMatch(appJs, /aria-pressed'\)\s*!==\s*'true'/, 'the transition is not re-derived inline');
  assert.equal(
    appJs.match(/classList\.toggle\('show-regions'/g).length,
    1,
    'exactly one place writes .show-regions',
  );
});

// --- status copy, in full ------------------------------------------------

test('src/app.js: every status message is present in full, character for character', () => {
  // The complete set: one assignment, four branches, each quoted whole.
  assert.equal(
    appJs.match(/progressEl\.textContent/g).length,
    1,
    'the status is written in exactly one place',
  );
  const messages = [
    "'Tap a character to begin.'",
    "'Now choose a direction on the compass — the line will run 7 characters.'",
    "`${n} lines — ${n / 4} quatrain${n === 4 ? '' : 's'} complete. Extend by 4 or copy the prompt.`",
    "`${n} line${n === 1 ? '' : 's'} — add ${needed} more to complete the quatrain.`",
  ];
  for (const copy of messages) {
    assert.ok(appJs.includes(copy), `status copy preserved exactly: ${copy}`);
  }
  // The opening message is the same string the markup ships with, so the first
  // render cannot silently rewrite what the page has already announced.
  const initial = element(controlsSection(), 'progress').match(/>([^<]*)</)[1];
  assert.equal(initial, 'Tap a character to begin.');
  assert.ok(appJs.includes(`'${initial}'`), 'the app re-states the markup copy verbatim');
});

test('src/app.js: the prompt-side status keeps its full wording too', () => {
  assert.ok(
    appJs.includes("`Add ${needed} more line${needed === 1 ? '' : 's'} to complete the quatrain.`"),
    'the output card’s waiting message is unchanged',
  );
});

// --- layout contract -----------------------------------------------------
// Parsed as declarations. Reminder: this proves what the stylesheet *says*.
// Whether 320/375/600px really render as one row / two rows is a manual check.

test('styles.css: the bar is an explicit grid, still sticky, one track per item', () => {
  const controls = rule('.controls');
  assert.equal(controls.get('position'), 'sticky', 'the bar stays sticky');
  assert.equal(controls.get('display'), 'grid', 'layout is an explicit grid, not wrap-and-hope');
  const template = controls.get('grid-template-columns');
  assert.equal(template, 'auto auto auto minmax(0, 1fr)', 'three controls, then the status');
  assert.equal(
    tracks(template).length,
    directChildCount(controlsSection()),
    'desktop: one track per child, so the bar is a single row',
  );
  assert.equal(controls.get('align-items'), 'center');
});

test('styles.css: nothing in the bar can wrap or spill into an unplanned row', () => {
  const controlsRules = allRules().filter((r) => selectorsOf(r.prelude).includes('.controls'));
  assert.ok(controlsRules.length >= 3, 'base, phone and narrow-phone rules all checked');
  for (const r of controlsRules) {
    const d = declarations(r.body);
    const where = r.context ? `${r.context} .controls` : '.controls';
    for (const forbidden of ['flex-wrap', 'flex-flow', 'grid-template-rows', 'grid-auto-rows']) {
      assert.equal(d.has(forbidden), false, `${where} must not declare ${forbidden}`);
    }
    if (d.has('display')) assert.equal(d.get('display'), 'grid', `${where} stays a grid`);
  }
});

test('styles.css: the sticky bar is a silk panel, not a flat seam', () => {
  const controls = rule('.controls');
  assert.equal(controls.has('border-bottom'), false, 'the flat silk seam is gone');
  assert.ok(controls.has('border-radius'), 'the bar is a contained, rounded panel');
  assert.match(controls.get('background'), /^radial-gradient/, 'silk gradient, matching the body');
  assert.match(controls.get('box-shadow'), /inset/, 'inset highlight plus a soft shadow');
});

test('styles.css: long status copy is bounded, never pushing the bar wider', () => {
  // The overflow-safe pair: a 1fr track allowed to shrink below its content,
  // and a status box that allows it. Without both, a long message widens the page.
  const progress = rule('.progress');
  assert.equal(progress.get('min-width'), '0', 'the status may shrink below its text');
  for (const [label, template] of [
    ['desktop', rule('.controls').get('grid-template-columns')],
    ['phone', rule('.controls', mediaBody('@media (max-width: 600px)')).get('grid-template-columns')],
  ]) {
    assert.equal(tracks(template).at(-1), 'minmax(0, 1fr)', `${label}: the status track can shrink`);
  }
  // The label is the one nowrap element, which is why the narrow-phone query
  // takes its caveat out of the layout rather than letting it push the row out.
  assert.equal(rule('.toggle-text').get('white-space'), 'nowrap');
});

test('styles.css: mobile keeps the bar to exactly two rows', () => {
  const mobile = mediaBody('@media (max-width: 600px)');
  const template = rule('.controls', mobile).get('grid-template-columns');
  assert.equal(template, 'auto auto minmax(0, 1fr)', 'row one holds Undo, Reset and the toggle');
  assert.equal(tracks(template).length, 3, 'three tracks');
  assert.equal(rule('.progress', mobile).get('grid-column'), '1 / -1', 'the status spans row two');
  // Four items, three tracks, the fourth spanning the full width: two rows, no more.
  assert.equal(directChildCount(controlsSection()) - tracks(template).length, 1);
});

test('styles.css: the narrowest phones tighten the row instead of adding a third', () => {
  const narrow = mediaBody('@media (max-width: 380px)');
  const controls = rule('.controls', narrow);
  assert.equal(controls.has('grid-template-columns'), false, 'no re-flow of the tracks');
  assert.ok(controls.has('gap') && controls.has('padding'), 'it tightens spacing instead');
  assert.ok(rule('.controls button', narrow).has('padding'), 'and the button padding');
  // The caveat is clipped out of the layout but stays in the accessible name.
  const hint = rule('.controls .toggle .hint', narrow);
  assert.equal(hint.get('clip-path'), 'inset(50%)', 'visually hidden, not removed');
  assert.equal(hint.get('position'), 'absolute');
  assert.equal(hint.get('width'), '1px');
  assert.notEqual(hint.get('display'), 'none', 'never dropped from the accessibility tree');
});

test('styles.css: the toggle has a persistent, non-colour-only pressed state', () => {
  const pressed = rule('.toggle[aria-pressed="true"]');
  assert.match(pressed.get('box-shadow'), /inset/, 'a pressed button also sits inset');
  assert.ok(pressed.has('border-color'), 'and its border changes, not just the fill');
  assert.equal(rule('.toggle-mark::before').get('content'), '"\\2713"', 'the swatch carries a tick');
  const mark = rule('.toggle[aria-pressed="true"] .toggle-mark');
  assert.ok(mark.has('background') && mark.has('color'), 'the tick becomes visible when pressed');
  // The selector keys off the very attribute app.js writes, so state and paint agree.
  assert.ok(css.includes(`[aria-pressed="${pressedAttr(true)}"]`), 'styled off the real attribute');
});

test('styles.css: action buttons have hover, active, focus and disabled states', () => {
  assert.ok(rule('.controls button:hover:not(:disabled)').has('background'), 'hover state');
  assert.ok(rule('.controls button:active:not(:disabled)').has('transform'), 'active state');
  const focus = rule('.controls button:focus-visible');
  assert.match(focus.get('outline'), /^\d+px solid /, 'a real, visible keyboard focus ring');
  assert.notEqual(focus.get('outline'), 'none');
  assert.ok(focus.has('outline-offset'), 'held clear of the button edge');
  const disabled = rule('.controls button:disabled');
  assert.equal(disabled.get('cursor'), 'not-allowed', 'disabled semantics kept');
  assert.ok(disabled.has('opacity'), 'and it reads as unavailable');
});

test('styles.css: status copy reads as its own panel, not bold inline serif', () => {
  const progress = rule('.progress');
  const font = progress.get('font');
  assert.match(font, /^400 /, 'normal weight — no longer shouted in bold');
  assert.match(font, /var\(--ui\)$/, 'in the UI face, not the poem serif');
  assert.equal(progress.has('font-weight'), false, 'no stray weight override');
  assert.equal(progress.get('border-radius'), '999px', 'pill panel treatment');
  assert.match(css, /--ui: system-ui/, 'the UI font stack is a variable, not inlined');
});

test('styles.css: coarse-pointer targets meet 44px', () => {
  const coarse = mediaBody('@media (pointer: coarse)');
  assert.equal(rule('.controls button', coarse).get('min-height'), '44px', 'touch target floor');
  assert.equal(rule(':root', coarse).get('--compass-btn'), '44px', 'and the compass matches');
});

test('styles.css: reduced motion drops the button animation', () => {
  const reduced = mediaBody('@media (prefers-reduced-motion: reduce)');
  const covering = blocks(reduced).filter((b) => selectorsOf(b.prelude).includes('.controls button'));
  assert.equal(covering.length, 1, 'buttons are covered by the reduced-motion query');
  assert.equal(declarations(covering[0].body).get('transition'), 'none', 'transitions dropped');
  assert.equal(
    rule('.controls button:active:not(:disabled)', reduced).get('transform'),
    'none',
    'and the press nudge is dropped too',
  );
  // Mirrors REDUCED_MOTION in src/app.js, which swaps smooth scrolling for auto.
  assert.match(appJs, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
});
