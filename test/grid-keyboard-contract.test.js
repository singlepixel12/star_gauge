// test/grid-keyboard-contract.test.js
// Guards PER-48: the 29×29 grid is reachable and usable from the keyboard.
// Before this, the 841 cells were plain divs with click handlers — no tab stop,
// no roles, no way to reach the point where the compass even appears.
//
// What is *executed* here: src/grid-navigation.js, in full. That module exists
// precisely so the three claims that matter can be run rather than pattern
// matched — that arrow movement is orthogonal and one cell at a time, that it
// is bounded at all four selvedges rather than wrapping, and that exactly one
// of the 841 cells is in the tab order after *any* sequence of keys, clicks and
// activations. The centre's inertness is executed too, through src/selection.js.
//
// What is *parsed* here: index.html, src/app.js and styles.css, in the manner of
// grid-surface-contract.test.js — for the wiring a pure module cannot hold: the
// single delegated listener, the single tabindex writer, the single focus() call,
// and the ARIA structure.
//
// WHAT THIS FILE CANNOT COVER — needs manual validation.
// There is no DOM and no screen reader here (no jsdom, no playwright —
// deliberately: vanilla site, no build step, no dependencies). NVDA has NOT been
// run against this. These remain manual checks, served over HTTP:
//   * NVDA (and JAWS) on Windows: that #grid is announced as a grid, that row
//     and column position is spoken as the reader arrows about, that each cell
//     is voiced in a Chinese voice while the instructions are voiced in English,
//     and that the centre's description is read out.
//   * that the role="row" wrappers survive `display: contents` in the browser's
//     accessibility tree (historically inconsistent across engines) — if any
//     engine drops them, the fallback is real row boxes, not English labels.
//   * that Tab moves from the focused cell straight to the compass, and that
//     arrow keys inside the compass are the browser's business, not the grid's.
//   * that the gold focus ring is visible on every fill it can land on —
//     including over a traced cell, the junction, and the centre's halo.
//   * PER-53, the real DOM tab order (the tests below simulate app.js's writes,
//     not the browser):
//       1. Arrow three cells right, Tab to the compass, Shift+Tab back: focus
//          lands on the arrowed-to cell.
//       2. Arrow away, click another cell, then Tab: focus leaves the grid in
//          one press.
//       3. The focus ring is drawn on the cell that actually has focus,
//          including 心.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appJs, functionBody, assertOwnedBy } from '../test-support/app-source.js';

import {
  ACTIVATION_KEYS, CENTER_NOTE, INITIAL_CELL,
  arrowStep, createRovingFocus, isActivationKey, keyAction,
} from '../src/grid-navigation.js';
import { CENTER, SIZE, isCenter } from '../src/geometry.js';
import { createSelection } from '../src/selection.js';
import { GRID } from '../src/grid-data.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const cssClean = css.replace(/\/\*[\s\S]*?\*\//g, '');

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

// A grid cell as app.js literally names one: buildGrid's `el`, positionCompass's
// `cell`, or a `cellEls[…][…]` lookup. Literal names only — no alias resolution.
const CELL = String.raw`(?:(?<![\w$.])(?:el|cell)|cellEls\[[^\]\r\n]+\]\[[^\]\r\n]+\])`;

// --- what a key means ----------------------------------------------------

test('grid-navigation: the four arrows are orthogonal, one cell, and nothing else', () => {
  assert.deepEqual(arrowStep('ArrowUp'), { dr: -1, dc: 0 });
  assert.deepEqual(arrowStep('ArrowDown'), { dr: 1, dc: 0 });
  assert.deepEqual(arrowStep('ArrowLeft'), { dr: 0, dc: -1 });
  assert.deepEqual(arrowStep('ArrowRight'), { dr: 0, dc: 1 });
  for (const key of ARROWS) {
    const { dr, dc } = arrowStep(key);
    // Exactly one axis moves, by exactly one cell: no diagonal, no jump. The
    // diagonals belong to the compass, which extends a line by seven.
    assert.equal(Math.abs(dr) + Math.abs(dc), 1, `${key} moves on one axis only`);
  }
});

test('grid-navigation: every other key is left for the rest of the page', () => {
  // Tab above all: the compass has to stay one Tab away from the grid.
  const notOurs = [
    'Tab', 'Escape', 'Home', 'End', 'PageUp', 'PageDown', 'a', '心',
    'ArrowUpLeft', 'arrowup', 'ARROWUP', 'Up', 'Down', 'Left', 'Right', '',
  ];
  for (const key of notOurs) {
    assert.equal(arrowStep(key), null, `${key || '(empty)'} is not an arrow step`);
    assert.equal(isActivationKey(key), false, `${key || '(empty)'} does not activate`);
    assert.equal(keyAction(key, { row: 5, col: 5 }), null, `${key || '(empty)'} is not the grid's key`);
  }
});

test('grid-navigation: Enter and Space choose the focused cell, and move nothing', () => {
  assert.deepEqual([...ACTIVATION_KEYS], ['Enter', ' ', 'Spacebar']);
  for (const key of ACTIVATION_KEYS) {
    assert.equal(isActivationKey(key), true, `${JSON.stringify(key)} activates`);
    const action = keyAction(key, { row: 3, col: 27 });
    assert.deepEqual(action, { type: 'activate', cell: { row: 3, col: 27 } });
  }
  // 'Spacebar' is the legacy value; ' ' is the modern one. Both, or older
  // browsers silently lose the space bar.
  assert.ok(ACTIVATION_KEYS.includes(' ') && ACTIVATION_KEYS.includes('Spacebar'));
});

test('grid-navigation: movement is bounded at all four selvedges, never wrapping', () => {
  const edges = [
    // [cell, key] pairs that push straight off the cloth.
    ...Array.from({ length: SIZE }, (_, c) => [{ row: 0, col: c }, 'ArrowUp']),
    ...Array.from({ length: SIZE }, (_, c) => [{ row: SIZE - 1, col: c }, 'ArrowDown']),
    ...Array.from({ length: SIZE }, (_, r) => [{ row: r, col: 0 }, 'ArrowLeft']),
    ...Array.from({ length: SIZE }, (_, r) => [{ row: r, col: SIZE - 1 }, 'ArrowRight']),
  ];
  assert.equal(edges.length, 4 * SIZE, 'every edge cell is pushed outward');
  for (const [cell, key] of edges) {
    const action = keyAction(key, cell);
    // Still the grid's key — app.js calls preventDefault on it, so the page
    // does not scroll out from under a reader pressing against the edge — but
    // the focus stays exactly where it was.
    assert.equal(action.type, 'move', `${key} at ${cell.row},${cell.col} is still handled`);
    assert.equal(action.moved, false, `${key} at ${cell.row},${cell.col} moves nothing`);
    assert.deepEqual(action.to, cell, 'and lands back on the same cell, not on the far edge');
  }
});

test('grid-navigation: from all 841 cells, every arrow stays on the cloth', () => {
  let moves = 0;
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      for (const key of ARROWS) {
        const { to, moved } = keyAction(key, { row, col });
        assert.ok(to.row >= 0 && to.row < SIZE, `${key} keeps the row on the grid`);
        assert.ok(to.col >= 0 && to.col < SIZE, `${key} keeps the column on the grid`);
        const step = Math.abs(to.row - row) + Math.abs(to.col - col);
        assert.equal(step, moved ? 1 : 0, `${key} from ${row},${col} moves one cell or none`);
        moves++;
      }
    }
  }
  assert.equal(moves, 841 * 4, 'all 841 cells, all four arrows');
});

test('grid-navigation: junk is rejected rather than silently clamped', () => {
  for (const bad of [null, undefined, {}, { row: 0 }, { row: -1, col: 0 }, { row: 0, col: SIZE },
    { row: 1.5, col: 0 }, { row: '0', col: '0' }, [0, 0]]) {
    assert.throws(() => keyAction('ArrowUp', bad), RangeError, `${JSON.stringify(bad)} is not a cell`);
  }
});

// --- the centre: navigable, never selectable ----------------------------

test('grid-navigation: the centre 心 can be arrowed into and straight back out of', () => {
  assert.deepEqual(CENTER, { row: 14, col: 14 });
  assert.equal(GRID[CENTER.row][CENTER.col], '心', 'the inert heart is where geometry says');
  // Approached from each side, the centre is an ordinary stop for the focus.
  for (const [from, key] of [
    [{ row: 13, col: 14 }, 'ArrowDown'], [{ row: 15, col: 14 }, 'ArrowUp'],
    [{ row: 14, col: 13 }, 'ArrowRight'], [{ row: 14, col: 15 }, 'ArrowLeft'],
  ]) {
    const { to, moved } = keyAction(key, from);
    assert.equal(moved, true, `${key} from ${from.row},${from.col} moves`);
    assert.ok(isCenter(to), 'and lands on the centre: it is never skipped over');
  }
  const roving = createRovingFocus(CENTER);
  assert.ok(isCenter(roving.active()), 'the centre is a legitimate resting place for the tab stop');
  assert.equal(roving.handleKey('ArrowRight').moved, true, 'and the reader can leave it again');
});

test('grid-navigation: activating the centre selects nothing, and says why', () => {
  // The refusal itself is selection.js's (unchanged); what PER-48 adds is the
  // explanation, and it has to be the explanation the project has always given.
  const selection = createSelection(GRID);
  const action = keyAction('Enter', CENTER);
  assert.equal(action.type, 'activate');
  assert.equal(selection.pickStart(action.cell), false, 'Enter on the centre picks no start');
  assert.equal(selection.currentAnchor(), null, 'and leaves the selection empty');

  assert.match(CENTER_NOTE, /心/, 'the announcement names the character');
  assert.match(CENTER_NOTE, /every reading/i, 'it belongs to every reading');
  assert.match(CENTER_NOTE, /\bnone\b/i, 'and to none');
  assert.match(CENTER_NOTE, /never chosen|never be chosen|never selectable/i, 'and it can never be chosen');
  // The same idea the page already tells sighted readers, so the two cannot drift.
  assert.match(html, /belongs to every reading\s*\n?\s*and to none/,
    'index.html says the same of the centre');
});

test('grid-navigation: the initial tab stop is a real, non-centre cell', () => {
  assert.deepEqual(INITIAL_CELL, { row: 0, col: 0 });
  assert.equal(isCenter(INITIAL_CELL), false, 'the reader never lands on the inert cell first');
  assert.equal(GRID[INITIAL_CELL.row][INITIAL_CELL.col], '琴', 'the first character of the cloth');
  assert.equal(createRovingFocus().tabIndexFor(INITIAL_CELL), 0, 'and it is the default stop');
});

// --- exactly one tab stop, always ---------------------------------------

// The invariant, counted over all 841 cells rather than argued about.
function assertOneTabStop(roving, when) {
  let stops = 0;
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const value = roving.tabIndexFor({ row, col });
      assert.ok(value === 0 || value === -1, `${when}: cell ${row},${col} is 0 or -1`);
      if (value === 0) stops++;
    }
  }
  assert.equal(stops, 1, `${when}: exactly one of the 841 cells is in the tab order`);
  assert.equal(roving.tabIndexFor(roving.active()), 0, `${when}: and it is the active cell`);
}

test('roving focus: exactly one tab stop, through a long run of keys and clicks', () => {
  const roving = createRovingFocus();
  assertOneTabStop(roving, 'on build');

  // A deterministic walk that pounds the edges, crosses the centre, activates
  // repeatedly, and interleaves clicks (focusOn) with arrows.
  const keys = [...ARROWS, ...ACTIVATION_KEYS, 'Tab', 'Escape', 'Home', 'x'];
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  for (let i = 0; i < 4000; i++) {
    const key = keys[next() % keys.length];
    const before = roving.active();
    const action = roving.handleKey(key);
    // handleKey only reports; a real move is applied through focusOn, exactly
    // as app.js's focusCell → setTabStop does (PER-53).
    assert.deepEqual(roving.active(), before, `${key}: handleKey itself moves nothing`);
    if (action?.type === 'move' && action.moved) {
      assert.deepEqual(roving.focusOn(action.to), { from: before, to: action.to },
        `${key}: the move is applied as exactly one pair of flips`);
    }
    if (action === null || action.type === 'activate') {
      // Neither a key we do not own nor an activation may move the tab stop:
      // choosing a cell is not a navigation, and Tab must stay the browser's.
      assert.deepEqual(roving.active(), before, `${key} left the tab stop alone`);
    }
    assertOneTabStop(roving, `after ${key}`);
    if (i % 37 === 0) {
      // A click anywhere on the cloth, including the centre.
      const cell = { row: next() % SIZE, col: next() % SIZE };
      const flip = roving.focusOn(cell);
      assert.deepEqual(roving.active(), cell, 'a click moves the tab stop to the clicked cell');
      if (flip) {
        assert.deepEqual(flip.to, cell, 'and reports the cell taking the stop');
        assert.notDeepEqual(flip.from, flip.to, 'paired with the one losing it');
      }
      assertOneTabStop(roving, 'after a click');
    }
  }
});

// PER-53: the model and the DOM must not diverge. This mirrors app.js exactly —
// buildGrid stamps every cell from tabIndexFor, setTabStop applies only the two
// flips focusOn reports, onGridKeyDown asks handleKey what the key means and
// then goes through focusCell → setTabStop, and onCellClick goes through
// setTabStop — and counts the *simulated DOM*, not the model.
function simulatedApp(initial) {
  const roving = createRovingFocus(initial);
  const dom = Array.from({ length: SIZE }, (_, row) =>
    Array.from({ length: SIZE }, (_, col) => roving.tabIndexFor({ row, col })));
  let flips = 0;
  const setTabStop = (cell) => {
    const moved = roving.focusOn(cell);
    if (!moved) return;
    dom[moved.from.row][moved.from.col] = -1;
    dom[moved.to.row][moved.to.col] = 0;
    flips++;
  };
  let focused = roving.active();
  return {
    roving,
    flips: () => flips,
    focused: () => ({ ...focused }),
    key(key) {
      setTabStop(focused);
      const action = roving.handleKey(key);
      if (action?.type === 'move' && action.moved) {
        setTabStop(action.to);
        focused = action.to;
      }
      return action;
    },
    click(cell) {
      setTabStop(cell);
      focused = { ...cell };
    },
    assertDomOneTabStop(when) {
      const stops = [];
      for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
          if (dom[row][col] === 0) stops.push({ row, col });
        }
      }
      assert.equal(stops.length, 1, `${when}: exactly one DOM cell has tabIndex 0`);
      assert.deepEqual(stops[0], roving.active(), `${when}: and it is the active cell`);
      assert.deepEqual(stops[0], focused, `${when}: which is the cell that has focus`);
    },
  };
}

test('roving focus: the DOM tab stop follows arrows, clicks, and arrows then a click (PER-53)', () => {
  // Arrows alone: each real move flips exactly one pair.
  const app = simulatedApp({ row: 10, col: 10 });
  app.assertDomOneTabStop('on build');
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight']) {
    app.key(key);
    app.assertDomOneTabStop(`after ${key}`);
  }
  assert.deepEqual(app.roving.active(), { row: 10, col: 13 }, 'three cells right');
  assert.equal(app.flips(), 3, 'one pair of flips per arrow');

  // Arrows, then a click elsewhere: the arrowed-from cells do not keep a stop.
  app.click({ row: 2, col: 5 });
  app.assertDomOneTabStop('after arrows then a click');
  app.key('ArrowDown');
  app.assertDomOneTabStop('after a click then an arrow');

  // Clicks alone, including a click on the stop itself (no flips).
  const clicks = simulatedApp();
  for (const cell of [{ row: 5, col: 5 }, { row: 5, col: 5 }, { row: 28, col: 0 }, CENTER]) {
    clicks.click(cell);
    clicks.assertDomOneTabStop(`after a click on ${cell.row},${cell.col}`);
  }
  assert.equal(clicks.flips(), 3, 'a click on the current stop writes nothing');

  // Through the centre and out again: navigable, and the DOM keeps up.
  const centre = simulatedApp({ row: 14, col: 12 });
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp']) {
    centre.key(key);
    centre.assertDomOneTabStop(`crossing the centre, after ${key}`);
  }
  centre.click({ row: 0, col: 0 });
  centre.assertDomOneTabStop('clicking away after crossing the centre');

  // Selvedge: the arrow is still the grid's, but nothing is written.
  const edge = simulatedApp({ row: 0, col: 28 });
  for (const key of ['ArrowUp', 'ArrowRight']) {
    const action = edge.key(key);
    assert.equal(action.type, 'move', `${key} at the selvedge is consumed`);
    assert.equal(action.moved, false, `${key} at the selvedge moves nothing`);
    edge.assertDomOneTabStop(`after ${key} at the selvedge`);
  }
  assert.equal(edge.flips(), 0, 'a selvedge arrow causes no tab-index flips');

  // Activation and Tab leave the DOM alone too.
  for (const key of ['Enter', ' ', 'Tab']) edge.key(key);
  edge.assertDomOneTabStop('after Enter, Space and Tab');
  assert.equal(edge.flips(), 0, 'neither activation nor Tab writes a tabindex');
});

test('roving focus: a long run of arrows and clicks never leaves two DOM tab stops (PER-53)', () => {
  const app = simulatedApp();
  const keys = [...ARROWS, ...ACTIVATION_KEYS, 'Tab', 'Escape'];
  let seed = 53;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  for (let i = 0; i < 1500; i++) {
    if (i % 5 === 0) app.click({ row: next() % SIZE, col: next() % SIZE });
    else app.key(keys[next() % keys.length]);
    app.assertDomOneTabStop(`step ${i}`);
  }
});

test('roving focus: a move reports exactly the two cells whose tabindex changes', () => {
  const roving = createRovingFocus({ row: 10, col: 10 });
  const action = roving.handleKey('ArrowRight');
  assert.deepEqual(action.from, { row: 10, col: 10 }, 'the cell losing the stop');
  assert.deepEqual(action.to, { row: 10, col: 11 }, 'the cell taking it');
  // The key is only reported; applying it is focusOn's, which hands app.js the
  // same pair to flip (PER-53).
  assert.deepEqual(roving.focusOn(action.to), { from: action.from, to: action.to },
    'applying the move reports the same two cells');
  assert.equal(roving.tabIndexFor(action.from), -1);
  assert.equal(roving.tabIndexFor(action.to), 0);
  // Nothing to change when the stop is already there — app.js writes no
  // attributes at all in that case.
  assert.equal(roving.focusOn({ row: 10, col: 11 }), null, 'a click on the stop is a no-op');
  const up = roving.handleKey('ArrowUp');
  assert.equal(up.moved, true);
  roving.focusOn(up.to);
  assert.deepEqual(roving.active(), { row: 9, col: 11 });
  // The returned coordinates are copies: callers cannot reach in and move the
  // stop by mutating them.
  const active = roving.active();
  active.row = 0;
  assert.deepEqual(roving.active(), { row: 9, col: 11 }, 'the stop is not reachable by mutation');
});

// --- the wiring in app.js ------------------------------------------------

test('src/app.js: one delegated keydown listener, on the grid and nowhere else', () => {
  // Scoped to what PER-48 owns (PER-51). Other tickets may listen for keys on
  // the document — PER-49's Reset safeguard does — so they are not counted or
  // listed. What the grid needs from each of them is checked on each one
  // instead: none may take a key away from the grid.
  assert.equal((appJs.match(/addEventListener\('keydown', onGridKeyDown\)/g) ?? []).length, 1,
    'the grid key handler is attached exactly once');
  assert.match(appJs, /gridEl\.addEventListener\('keydown', onGridKeyDown\)/,
    'and it is delegated on #grid, not on 841 cells and not on the document');
  // #grid itself has exactly one keydown listener: a second handler on gridEl
  // would be a second owner of the grid's keys. The document/window listeners
  // other tickets add are not on #grid and stay allowed (checked below).
  const gridKeydowns = [...appJs.matchAll(/gridEl\.addEventListener\('keydown', ([^\r\n]*)/g)];
  assert.equal(gridKeydowns.length, 1, `#grid has exactly one keydown listener (found ${gridKeydowns.length})`);
  assert.match(gridKeydowns[0][1], /^onGridKeyDown\)/, 'and it is onGridKeyDown');
  assert.doesNotMatch(appJs, /gridEl\.onkeydown\s*=/, 'nor is one slipped in as an onkeydown property');
  assert.doesNotMatch(functionBody(appJs, 'buildGrid'), /addEventListener\('key/,
    'no cell gets a key listener of its own');
  // The document and window may listen for keys, but never take one the grid
  // owns: each handler is named, so its body can be read, and that body neither
  // consumes a key nor reaches into the grid's tab stop.
  assert.doesNotMatch(appJs, /(?:document|window)\.onkey\w+\s*=/,
    'global key handlers go through addEventListener, where they are checked');
  const globals = [...appJs.matchAll(
    /\b(?:document|window)\s*\.\s*addEventListener\s*\(\s*(['"`])key\w*\1\s*,\s*([^\r\n]*)/g)]
    .map(([at, , rest]) => [at, rest]);
  assert.ok(globals.some((m) => /^onResetGuardAction\b/.test(m[1])), 'sanity: the Reset safeguard is seen');
  for (const [at, rest] of globals) {
    const named = rest.match(/^([\w$]+)\s*[,)]/);
    assert.ok(named, `${at.trim()}: its handler is a named function, so it can be checked`);
    const handler = functionBody(appJs, named[1]);
    for (const forbidden of ['preventDefault', 'stopPropagation', 'stopImmediatePropagation',
      'roving', 'setTabStop', '.tabIndex']) {
      assert.ok(!handler.includes(forbidden), `${named[1]} does not touch ${forbidden}`);
    }
    assert.doesNotMatch(handler, /\.returnValue\s*=\s*false/,
      `${named[1]} does not consume a key through the legacy returnValue`);
  }
  const body = functionBody(appJs, 'onGridKeyDown');
  assert.match(body, /closest\('\.cell'\)/, 'the handler only answers to grid cells');
  assert.match(body, /gridEl\.contains\(cellEl\)/, 'and only to cells inside this grid');
  assert.match(body, /event\.altKey \|\| event\.ctrlKey \|\| event\.metaKey/,
    'modified keys are left to the browser and the screen reader');
  assert.match(body, /if \(!action\) return;\s*\n\s*event\.preventDefault\(\);/,
    'preventDefault happens only for keys the grid actually owns — Tab is untouched');
  assert.match(body, /roving\.handleKey\(event\.key\)/, 'the meaning of the key comes from the pure module');
  // No direction/line logic in the key path: the compass alone extends a line.
  for (const forbidden of ['addLine', 'DIRECTIONS', 'lineCells', 'isPivot']) {
    assert.ok(!body.includes(forbidden), `the key handler does not touch ${forbidden}`);
  }
});

test('src/app.js: the compass keeps its own keyboard behaviour, untouched', () => {
  // Native buttons: Enter/Space activate them, Tab moves between them, and the
  // grid's arrow handling is out of reach because #compass is a sibling of #grid.
  assert.match(html, /<div id="compass" class="compass" hidden><\/div>/, 'the compass markup is unchanged');
  assert.ok(html.indexOf('id="compass"') > html.indexOf('id="grid"'),
    'the compass follows the grid in DOM order, so Tab from a cell reaches it');
  const build = functionBody(appJs, 'buildCompass');
  assert.match(build, /btn\.type = 'button'/, 'still native buttons');
  assert.match(build, /btn\.setAttribute\('aria-label', `extend line \$\{DIR_WORDS\[id\]\}`\)/,
    'still the spoken direction names');
  assert.doesNotMatch(build, /tabIndex|tabindex/, 'the compass buttons keep the natural tab order');
  assert.doesNotMatch(build, /keydown|preventDefault/, 'and no key handling of their own was added');
  assert.match(cssClean, /:root \{ --compass-btn: 44px; \}/, 'the 44px coarse-pointer target survives');
});

test('src/app.js: buildGrid builds an ARIA grid of rows and gridcells', () => {
  const body = functionBody(appJs, 'buildGrid');
  assert.match(body, /rowEl\.setAttribute\('role', 'row'\)/, 'a row group per line of the cloth');
  assert.match(body, /rowEl\.className = 'grid-row'/, 'carrying the display: contents hook');
  assert.match(body, /el\.setAttribute\('role', 'gridcell'\)/, 'and a gridcell per character');
  assert.match(body, /rowEl\.appendChild\(el\)/, 'cells are appended to their row');
  assert.match(body, /gridEl\.appendChild\(rowEl\)/, 'and rows to the grid');
  assert.match(body, /el\.dataset\.row = r;\s*\n\s*el\.dataset\.col = c;/,
    'each cell carries its coordinates for the delegated handler');
  assert.match(body, /el\.tabIndex = roving\.tabIndexFor\(\{ row: r, col: c \}\)/,
    'the initial tab order comes from the roving module, so exactly one cell gets 0');
  assert.match(html, /<div id="grid" class="grid" lang="zh-Hant" role="grid"/, '#grid declares role="grid"');
});

test('src/app.js: the tab stop has exactly one writer, and it is selection-independent', () => {
  // Every write to a cell's tabindex is buildGrid's initial stamp or the pair
  // setTabStop flips. If one appears anywhere else, the invariant has a second
  // owner. Asserted by where the writes live, not by counting the file (PER-51).
  // By property or by attribute: a setAttribute('tabindex', …) on a cell would
  // be a second writer too.
  assertOwnedBy(new RegExp(String.raw`${CELL}\s*\.\s*(?:tabIndex\s*=(?!=)|setAttribute\s*\(\s*['"\x60]tab[iI]ndex['"\x60])`),
    [functionBody(appJs, 'buildGrid'), functionBody(appJs, 'setTabStop')],
    'only buildGrid and setTabStop write a cell tabindex, by property or by attribute');
  assert.equal((functionBody(appJs, 'buildGrid').match(/\.tabIndex\s*=/g) ?? []).length, 1,
    'buildGrid stamps each cell once');
  const setter = functionBody(appJs, 'setTabStop');
  assert.match(setter, /roving\.focusOn\(cell\)/, 'the module decides where the stop goes');
  assert.match(setter, /if \(!moved\) return;/, 'and nothing is written when it has not moved');
  assert.match(setter, /cellEls\[moved\.from\.row\]\[moved\.from\.col\]\.tabIndex = -1;/);
  assert.match(setter, /cellEls\[moved\.to\.row\]\[moved\.to\.col\]\.tabIndex = 0;/);
  // render / undo / reset must not touch it: the tab stop is where the reader
  // is, not a function of what has been selected.
  // Nor may the grid's own key and click paths: they go through setTabStop.
  for (const name of ['render', 'drawThread', 'positionCompass', 'previewLine',
    'onGridKeyDown', 'onCellClick', 'focusCell']) {
    assert.doesNotMatch(functionBody(appJs, name), /tabIndex/, `${name} does not move the tab stop`);
  }
  // Both handlers may now also cancel a pending walkthrough (PER-46). What this
  // test protects is unchanged: neither one touches the tab stop, so the
  // reader's place in the grid survives an undo and a reset.
  for (const handler of ['undoBtn', 'resetBtn']) {
    // The whole handler, however long: PER-49 put Reset's question in front of it.
    const listener = appJs.match(new RegExp(`${handler}\\.addEventListener\\('click', \\(\\) => \\{[\\s\\S]*?\\n\\}\\);`))[0];
    assert.match(listener, /selection\.(?:undo|reset)\(\);/, `${handler} still goes through the selection`);
    assert.match(listener, /render\(\);/, `${handler} still re-renders`);
    assert.doesNotMatch(listener, /tabIndex/, `${handler} still does not move the tab stop`);
  }
});

test('src/app.js: focus is moved only to follow an arrow key, never to announce', () => {
  // Every programmatic focus of a cell is focusCell's — ownership, not a count
  // of every .focus() in the shared file (PER-51) — and none of the grid's own
  // paths reaches for focus any other way.
  assertOwnedBy(new RegExp(String.raw`${CELL}\s*\.\s*focus\s*\(`), [functionBody(appJs, 'focusCell')],
    'the only programmatic focus of a cell is the arrow-key move');
  for (const name of ['onGridKeyDown', 'onCellClick', 'setTabStop', 'buildGrid', 'render', 'statusMessage']) {
    assert.doesNotMatch(functionBody(appJs, name), /\.focus\(/, `${name} moves no focus`);
  }
  const body = functionBody(appJs, 'focusCell');
  assert.match(body, /setTabStop\(cell\);\s*\n\s*cellEls\[cell\.row\]\[cell\.col\]\.focus\(\)/,
    'the one call is the arrow-key move, and it moves the tab stop with it');
  assert.doesNotMatch(body, /scrollIntoView/,
    'the browser’s own focus scrolling is left to it, so it cannot fight positionCompass');
  // Nothing may focus the live region, or the compass, to make itself heard.
  assert.doesNotMatch(appJs, /progressEl\.focus|compassEl\.focus|\.focus\(\)\s*;?\s*\/\/ announce/,
    'announcements never move focus');
  assert.doesNotMatch(functionBody(appJs, 'announce'), /focus/, 'announce only writes text');
});

test('src/app.js: the click handler is attached to every cell, centre included', () => {
  // Codex review fix: buildGrid used to only wire the listener in the `else`
  // branch of the isCenter check, so a click on 心 did nothing at all — even
  // though onCellClick already handles the centre (moves the tab stop,
  // announces CENTER_NOTE, returns before touching selection). The fix moves
  // the addEventListener call out from behind that branch.
  const body = functionBody(appJs, 'buildGrid');
  assert.doesNotMatch(body, /\}\s*else\s*\{\s*el\.addEventListener\('click'/,
    'the click listener must not live in an else that excludes the centre');
  // The isCenter block still marks the cell — class and description — but the
  // click wiring itself is outside that if/else entirely, so it runs for
  // every one of the 841 cells unconditionally.
  const centerBlock = body.match(/if \(isCenter\(\{ row: r, col: c \}\)\) \{([\s\S]*?)\r?\n\s*\}\r?\n/);
  assert.ok(centerBlock, 'buildGrid still special-cases the centre for class/description');
  assert.match(centerBlock[1], /el\.classList\.add\('center'\)/, 'centre class preserved');
  assert.match(centerBlock[1], /el\.setAttribute\('aria-describedby', 'center-note'\)/,
    'centre aria-describedby preserved');
  assert.doesNotMatch(centerBlock[1], /addEventListener/,
    'the centre-only block itself no longer contains the click wiring');
  assert.match(body, /\r?\n\s*el\.addEventListener\('click', \(event\) => onCellClick\(r, c, event\)\);\s*\r?\n\s*rowEl\.appendChild\(el\);/,
    'the click listener is the last thing attached to every cell, right before it joins its row');
  assert.equal((body.match(/addEventListener\('click'/g) ?? []).length, 1,
    'exactly one click-wiring call site inside buildGrid, applied to every cell');
});

test('src/app.js: click and Enter/Space run the same start-selection logic', () => {
  const body = functionBody(appJs, 'onCellClick');
  // The event is threaded through so a real click can take over a running
  // walkthrough (PER-46); the demo's own synthetic clicks are untrusted.
  assert.match(functionBody(appJs, 'buildGrid'), /el\.addEventListener\('click', \(event\) => onCellClick\(r, c, event\)\)/,
    'click calls it');
  assert.match(functionBody(appJs, 'onGridKeyDown'),
    /if \(action\.type === 'activate'\) onCellClick\(action\.cell\.row, action\.cell\.col\)/,
    'Enter/Space call the very same function — no second copy of the rule');
  assert.match(body, /setTabStop\(\{ row, col \}\)/, 'either way the tab stop follows the chosen cell');
  assert.match(body, /if \(isCenter\(\{ row, col \}\)\) return announce\(CENTER_NOTE\)/,
    'the centre is answered before anything is picked');
  assert.match(body, /if \(selection\.pickStart\(\{ row, col \}\)\) render\(\)/,
    'and the start still goes through selection.pickStart');
  assert.match(body, /else announce\(statusMessage\(\)\)/,
    'an existing start is not replaced; the status says where to go instead');
  assertOwnedBy(/pickStart/, [body], 'one pickStart call site in the app, and it is onCellClick');
});

test('src/app.js: #progress is still the one announcement surface', () => {
  assert.match(html, /<span id="progress" class="progress" role="status">/, 'the live region is unchanged');
  assertOwnedBy(/progressEl\.textContent/, [functionBody(appJs, 'announce')], 'written in exactly one place');
  assert.match(functionBody(appJs, 'announce'), /progressEl\.textContent = text;/, 'and that place is announce()');
  assert.match(functionBody(appJs, 'render'), /announce\(statusMessage\(\)\)/, 'render announces the state');
  // No second live region was introduced for the keyboard.
  assert.equal((html.match(/role="status"/g) ?? []).length, 1, 'still one role="status" on the page');
  assert.doesNotMatch(html, /aria-live/, 'and no extra aria-live region');
  // Nor one added from script by the keyboard work — scoped to the functions
  // PER-48 wrote rather than swept across the shared file (PER-51).
  for (const name of ['buildGrid', 'setTabStop', 'focusCell', 'onGridKeyDown', 'onCellClick', 'announce']) {
    assert.doesNotMatch(functionBody(appJs, name), /aria-live|'role', 'status'/, `${name} adds no live region`);
  }
});

test('the pure modules carry no URL, hash or history behaviour', () => {
  // PER-48 originally swept app.js too, to prove the keyboard work introduced
  // no URL behaviour. PER-43 has since landed and app.js is now, correctly, one
  // of the two places that *does* read and write the fragment (with
  // path-codec.js). So app.js is out of this sweep — but the rest of it is
  // worth more than it was: it now asserts the layering PER-43 chose, that URL
  // handling never leaks down into the pure geometry, selection or navigation
  // modules. Those three answer questions about the cloth, not about the page.
  for (const source of ['grid-navigation.js', 'selection.js', 'geometry.js']) {
    const text = readFileSync(new URL(`../src/${source}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /location\b|history\b|pushState|replaceState|window\.hash|#\{/,
      `${source} neither reads nor writes the URL`);
  }
  assert.doesNotMatch(html, /href="#/, 'and no in-page fragment links were added');
});

// --- the stylesheet ------------------------------------------------------

test('styles.css: the row wrappers are semantic only, and the focus ring is its own state', () => {
  assert.match(cssClean, /\.grid-row \{ display: contents; \}/,
    'display: contents keeps all 841 cells as direct children of the CSS grid');
  const focus = cssClean.match(/\.cell:focus-visible \{([^}]*)\}/);
  assert.ok(focus, 'a focus-visible treatment exists for cells');
  assert.match(focus[1], /outline: 3px solid var\(--gold-ink\)/, 'gold ink, not the junction’s vermillion');
  assert.match(focus[1], /outline-offset: 2px/, 'drawn outside the cell, where the junction ring is inside');
  assert.match(focus[1], /z-index: 2/, 'above the junction’s z-index: 1, so the ring is never clipped');
  // :focus-visible, not :focus — a pointer tap must not leave a ring behind.
  assert.doesNotMatch(cssClean, /\.cell:focus \{/, 'no bare :focus ring on cells');
  // Declared after the states it must out-rank at equal specificity.
  const at = (selector) => cssClean.indexOf(selector);
  for (const state of ['.cell.in-line', '.cell.junction', '.cell.preview']) {
    assert.ok(at(state) > -1 && at(state) < at('.cell:focus-visible'),
      `${state} is declared before .cell:focus-visible, so focus stays visible on it`);
  }
  // The grid's own geometry is untouched by the wrappers (PER-27 surface).
  const grid = cssClean.match(/\.grid \{([\s\S]*?)\n\}/)[1];
  assert.match(grid, /grid-template-columns: repeat\(29, var\(--cell\)\)/, 'still 29 columns of --cell');
  assert.match(grid, /gap: 1px/, 'still the 1px gutter');
});

test('styles.css: the helper copy is hidden by clipping, not removed from the page', () => {
  const vh = cssClean.match(/\.visually-hidden \{([^}]*)\}/);
  assert.ok(vh, '.visually-hidden exists');
  assert.match(vh[1], /position: absolute/, 'taken out of flow, so the grid layout is unchanged');
  assert.match(vh[1], /width: 1px/);
  assert.match(vh[1], /height: 1px/);
  assert.match(vh[1], /clip-path: inset\(50%\)/, 'clipped rather than hidden');
  // display:none / visibility:hidden / hidden would drop it from the
  // accessibility tree, taking the aria-labelledby and aria-describedby with it.
  assert.doesNotMatch(vh[1], /display: none|visibility: hidden/, 'still exposed to a screen reader');
  for (const id of ['grid-name', 'grid-instructions', 'center-note']) {
    assert.match(html, new RegExp(`id="${id}" class="visually-hidden"`), `#${id} uses the utility`);
    assert.doesNotMatch(html, new RegExp(`id="${id}"[^>]*\\shidden`), `#${id} is not [hidden]`);
  }
});

test('index.html: the instructions name the three keys a reader needs', () => {
  const instructions = html.match(/id="grid-instructions"[^>]*>([\s\S]*?)<\/p>/)[1];
  assert.match(instructions, /arrow keys/i, 'arrows move');
  assert.match(instructions, /Enter or Space/i, 'Enter or Space chooses the start');
  assert.match(instructions, /Tab/, 'Tab leaves the grid for the compass');
  assert.match(instructions, /compass/i, 'and says what Tab reaches');
  assert.match(html, /id="center-note"[^>]*>[\s\S]*?every reading[\s\S]*?<\/p>/,
    'the centre has its own description');
});
