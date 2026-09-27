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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ACTIVATION_KEYS, CENTER_NOTE, INITIAL_CELL,
  arrowStep, createRovingFocus, isActivationKey, keyAction,
} from '../src/grid-navigation.js';
import { CENTER, SIZE, isCenter } from '../src/geometry.js';
import { createSelection } from '../src/selection.js';
import { GRID } from '../src/grid-data.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const cssClean = css.replace(/\/\*[\s\S]*?\*\//g, '');

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

// Body of a top-level `function name(` declaration, up to the next one.
function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start > -1, `expected a function ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(?:async )?function /);
  return next === -1 ? rest : rest.slice(0, next);
}

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

test('roving focus: a move reports exactly the two cells whose tabindex changes', () => {
  const roving = createRovingFocus({ row: 10, col: 10 });
  const action = roving.handleKey('ArrowRight');
  assert.deepEqual(action.from, { row: 10, col: 10 }, 'the cell losing the stop');
  assert.deepEqual(action.to, { row: 10, col: 11 }, 'the cell taking it');
  assert.equal(roving.tabIndexFor(action.from), -1);
  assert.equal(roving.tabIndexFor(action.to), 0);
  // Nothing to change when the stop is already there — app.js writes no
  // attributes at all in that case.
  assert.equal(roving.focusOn({ row: 10, col: 11 }), null, 'a click on the stop is a no-op');
  assert.equal(roving.handleKey('ArrowUp').moved, true);
  assert.deepEqual(roving.active(), { row: 9, col: 11 });
  // The returned coordinates are copies: callers cannot reach in and move the
  // stop by mutating them.
  const active = roving.active();
  active.row = 0;
  assert.deepEqual(roving.active(), { row: 9, col: 11 }, 'the stop is not reachable by mutation');
});

// --- the wiring in app.js ------------------------------------------------

test('src/app.js: one delegated keydown listener, on the grid and nowhere else', () => {
  const listeners = appJs.match(/addEventListener\('key\w+'/g) ?? [];
  assert.deepEqual(listeners, ["addEventListener('keydown'"], 'exactly one key listener in the app');
  assert.match(appJs, /gridEl\.addEventListener\('keydown', onGridKeyDown\)/,
    'and it is delegated on #grid, not on 841 cells and not on the document');
  assert.doesNotMatch(appJs, /(?:document|window)\.addEventListener\('key/,
    'no global key handler: arrow keys outside the grid are not ours');
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
  // Three writes in the whole app: buildGrid's initial stamp, and the pair
  // setTabStop flips. If a fourth appears, the invariant has a second owner.
  const writes = appJs.match(/\.tabIndex\s*=/g) ?? [];
  assert.equal(writes.length, 3, 'only buildGrid and setTabStop write a cell tabindex');
  const setter = functionBody(appJs, 'setTabStop');
  assert.match(setter, /roving\.focusOn\(cell\)/, 'the module decides where the stop goes');
  assert.match(setter, /if \(!moved\) return;/, 'and nothing is written when it has not moved');
  assert.match(setter, /cellEls\[moved\.from\.row\]\[moved\.from\.col\]\.tabIndex = -1;/);
  assert.match(setter, /cellEls\[moved\.to\.row\]\[moved\.to\.col\]\.tabIndex = 0;/);
  // render / undo / reset must not touch it: the tab stop is where the reader
  // is, not a function of what has been selected.
  for (const name of ['render', 'drawThread', 'positionCompass', 'previewLine']) {
    assert.doesNotMatch(functionBody(appJs, name), /tabIndex/, `${name} does not move the tab stop`);
  }
  // Both handlers may now also cancel a pending walkthrough (PER-46). What this
  // test protects is unchanged: neither one touches the tab stop, so the
  // reader's place in the grid survives an undo and a reset.
  for (const handler of ['undoBtn', 'resetBtn']) {
    const from = appJs.indexOf(`${handler}.addEventListener('click'`);
    const listener = appJs.slice(from, from + 260);
    assert.match(listener, /selection\.(?:undo|reset)\(\);/, `${handler} still goes through the selection`);
    assert.match(listener, /render\(\);/, `${handler} still re-renders`);
    assert.doesNotMatch(listener, /tabIndex/, `${handler} still does not move the tab stop`);
  }
});

test('src/app.js: focus is moved only to follow an arrow key, never to announce', () => {
  const calls = appJs.match(/\.focus\(\)/g) ?? [];
  assert.equal(calls.length, 1, 'exactly one programmatic focus call in the app');
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
  assert.match(appJs, /el\.addEventListener\('click', \(event\) => onCellClick\(r, c, event\)\)/, 'click calls it');
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
  assert.equal((appJs.match(/pickStart/g) ?? []).length, 1, 'one pickStart call site in the app');
});

test('src/app.js: #progress is still the one announcement surface', () => {
  assert.match(html, /<span id="progress" class="progress" role="status">/, 'the live region is unchanged');
  assert.equal((appJs.match(/progressEl\.textContent/g) ?? []).length, 1, 'written in exactly one place');
  assert.match(functionBody(appJs, 'announce'), /progressEl\.textContent = text;/, 'and that place is announce()');
  assert.match(functionBody(appJs, 'render'), /announce\(statusMessage\(\)\)/, 'render announces the state');
  // No second live region was introduced for the keyboard.
  assert.equal((html.match(/role="status"/g) ?? []).length, 1, 'still one role="status" on the page');
  assert.doesNotMatch(html, /aria-live/, 'and no extra aria-live region');
  assert.doesNotMatch(appJs, /setAttribute\('aria-live'/, 'nor one added from script');
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
