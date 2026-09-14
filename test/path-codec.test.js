// test/path-codec.test.js — PER-43: the traced path as a shareable fragment.
// Everything here runs in Node with no DOM at all, which is the point: the
// codec has to be pure to be testable, and testable to be trusted with the one
// thing that now outlives a reload.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GRID } from '../src/grid-data.js';
import { DIRECTIONS, lineCells, isCenter } from '../src/geometry.js';
import { createSelection } from '../src/selection.js';
import { encodePath, decodePath, PATH_VERSION } from '../src/path-codec.js';

const codecJs = readFileSync(new URL('../src/path-codec.js', import.meta.url), 'utf8');
const selectionJs = readFileSync(new URL('../src/selection.js', import.meta.url), 'utf8');

const dir = (id) => DIRECTIONS.find((d) => d.id === id);

// A start with all eight first lines available: far enough from every edge for
// seven cells, and no ray from it crosses the inert centre.
const OPEN_START = { row: 7, col: 8 };

// Traces a path the way the compass does, so the tests compare the codec
// against live tracing rather than against themselves.
function trace(start, ids) {
  const selection = createSelection(GRID);
  assert.equal(selection.pickStart(start), true, 'test start is pickable');
  for (const id of ids) assert.equal(selection.addLine(dir(id)), true, `test line ${id}`);
  return selection;
}

const isEmpty = (selection, message) => {
  assert.equal(selection.lineCount(), 0, message);
  assert.equal(selection.currentAnchor(), null, message);
  assert.deepEqual(selection.path(), { start: null, directions: [] }, message);
  assert.equal(encodePath(selection.path()), '', message);
};

// --- what a selection offers the codec -----------------------------------

test('path() reports the start and the ordered ids, and nothing else', () => {
  const selection = trace({ row: 10, col: 10 }, ['e', 's', 'w', 'n']);
  assert.deepEqual(selection.path(), {
    start: { row: 10, col: 10 },
    directions: ['e', 's', 'w', 'n'],
  });
});

test('path() is a snapshot: mutating it cannot reach back into the selection', () => {
  const selection = trace(OPEN_START, ['e']);
  const snapshot = selection.path();
  snapshot.start.row = 99;
  snapshot.directions.push('n');
  assert.deepEqual(selection.path(), { start: OPEN_START, directions: ['e'] });
});

test('undo and reset shorten the path in step with the lines', () => {
  const selection = trace({ row: 10, col: 10 }, ['e', 's']);
  selection.undo();
  assert.deepEqual(selection.path(), { start: { row: 10, col: 10 }, directions: ['e'] });
  selection.undo();
  assert.deepEqual(selection.path(), { start: { row: 10, col: 10 }, directions: [] });
  selection.undo();
  assert.deepEqual(selection.path(), { start: null, directions: [] });

  const other = trace({ row: 10, col: 10 }, ['e', 's', 'w', 'n']);
  other.reset();
  assert.deepEqual(other.path(), { start: null, directions: [] });
});

test('only the eight canonical directions are committed, so every id is nameable', () => {
  const selection = createSelection(GRID);
  selection.pickStart(OPEN_START);
  assert.equal(selection.addLine({ dr: 0, dc: 0 }), false, 'a zero step is not a direction');
  assert.equal(selection.addLine({ dr: 0, dc: 2 }), false, 'nor a two-cell stride');
  assert.equal(selection.addLine({ dr: 1 }), false, 'nor half an object');
  assert.equal(selection.addLine(null), false, 'nor nothing at all');
  assert.equal(selection.lineCount(), 0);
  assert.deepEqual(selection.path().directions, []);
});

test('pickStart refuses malformed, fractional and out-of-grid cells', () => {
  for (const cell of [
    null, undefined, {}, { row: 0 }, { col: 0 },
    { row: '0', col: 0 }, { row: 1.5, col: 2 }, { row: NaN, col: 0 },
    { row: -1, col: 0 }, { row: 0, col: -1 }, { row: 29, col: 0 }, { row: 0, col: 29 },
    { row: 14, col: 14 },
  ]) {
    const selection = createSelection(GRID);
    assert.equal(selection.pickStart(cell), false, `refused ${JSON.stringify(cell)}`);
    isEmpty(selection, `no start taken from ${JSON.stringify(cell)}`);
  }
});

// --- encoding -------------------------------------------------------------

test('an empty selection encodes as nothing, so the address carries no fragment', () => {
  assert.equal(encodePath(createSelection(GRID).path()), '');
  assert.equal(encodePath(null), '');
  assert.equal(encodePath(undefined), '');
  assert.equal(encodePath({ start: null, directions: [] }), '');
});

test('a picked start with no lines yet is representable on its own', () => {
  const selection = createSelection(GRID);
  selection.pickStart({ row: 0, col: 28 });
  assert.equal(encodePath(selection.path()), '#v1;0,28');
  assert.equal(PATH_VERSION, 'v1');
});

test('a traced path encodes as version, start and ordered ids', () => {
  assert.equal(encodePath(trace({ row: 10, col: 10 }, ['e', 's', 'w', 'n']).path()), '#v1;10,10;e,s,w,n');
  assert.equal(encodePath(trace(OPEN_START, ['ne']).path()), '#v1;7,8;ne');
});

test('the fragment carries coordinates and ids only — never a character of the cloth', () => {
  const fragment = encodePath(trace({ row: 10, col: 10 }, ['e', 's', 'w', 'n']).path());
  assert.match(fragment, /^#[a-z0-9;,]+$/, 'plain ASCII: no glyphs, no escaping to undo');
  const poem = decodePath(fragment, GRID).extractedLines().join('');
  for (const char of poem) assert.ok(!fragment.includes(char), `${char} is replayed, not stored`);
});

test('a direction with no canonical id is never written out', () => {
  assert.equal(encodePath({ start: { row: 1, col: 1 }, directions: ['east'] }), '');
  assert.equal(encodePath({ start: { row: 1, col: 1 }, directions: ['e', undefined] }), '');
  assert.equal(encodePath({ start: { row: 1.5, col: 1 }, directions: [] }), '');
});

// --- decoding -------------------------------------------------------------

test('every direction id survives the round trip, geometry intact', () => {
  for (const direction of DIRECTIONS) {
    const fragment = `#v1;${OPEN_START.row},${OPEN_START.col};${direction.id}`;
    const decoded = decodePath(fragment, GRID);
    assert.equal(decoded.lineCount(), 1, `${direction.id} replayed`);
    assert.deepEqual(
      decoded.allLines()[0].cells,
      lineCells(OPEN_START, direction, false),
      `${direction.id} lands on the same seven cells as a live trace`,
    );
    assert.equal(encodePath(decoded.path()), fragment, `${direction.id} re-encodes unchanged`);
  }
});

test('a traced quatrain round-trips to the same cells and the same Chinese', () => {
  const traced = trace({ row: 10, col: 10 }, ['e', 's', 'w', 'n']);
  const decoded = decodePath(encodePath(traced.path()), GRID);
  assert.deepEqual(decoded.allLines(), traced.allLines());
  assert.deepEqual(decoded.extractedLines(), traced.extractedLines());
  assert.deepEqual(decoded.currentAnchor(), traced.currentAnchor());
  assert.equal(decoded.canExtract(), true, 'a restored quatrain knows it is complete');
  for (const line of decoded.extractedLines()) {
    assert.equal([...line].length, 7, 'seven characters to the line');
  }
  for (const cell of decoded.allLines().flatMap((l) => l.cells)) {
    assert.equal(isCenter(cell), false, 'the inert 心 is never replayed into a line');
  }
});

test('a start-only fragment restores just the start', () => {
  const decoded = decodePath('#v1;7,8', GRID);
  assert.equal(decoded.lineCount(), 0);
  assert.deepEqual(decoded.currentAnchor(), OPEN_START);
  assert.equal(decoded.isPivot(), false, 'the next line still includes its start cell');
});

test('the pivot rule is replayed, not re-derived: no repeated boundary character', () => {
  const decoded = decodePath('#v1;10,10;e,s', GRID);
  const [first, second] = decoded.extractedLines();
  const cells = decoded.allLines();
  assert.deepEqual(cells[0].cells[6], { row: 10, col: 16 });
  assert.deepEqual(cells[1].cells[0], { row: 11, col: 16 }, 'one step past the junction');
  assert.notEqual(second[0], first[6]);
});

test('nothing, and a bare hash, are simply an empty cloth', () => {
  for (const fragment of ['', '#']) isEmpty(decodePath(fragment, GRID), `"${fragment}" is empty`);
});

test('malformed fragments fail quietly to empty, without throwing', () => {
  const rejected = [
    'v1;7,8;e',        // no leading hash
    '#v2;7,8;e',       // a version this build cannot read
    '#V1;7,8',         // version is case-sensitive
    '#;7,8',           // no version at all
    '#v1',             // truncated: no coordinates
    '#v1;',            // truncated: empty coordinates
    '#v1;7,8;e;n',     // one separator too many
    '#v1;7,8;',        // trailing separator, no ids
    '#v1;7,8;e,',      // empty id token
    '#v1;7,8;,e',      // empty id token, leading
    '#v1;7,8;E',       // ids are lower-case, with no aliases
    '#v1;7,8;east',
    '#v1;7,8;en',
    '#v1;7,8;e n',
    '#v1;7,8;e n,s',
    '#v1;7,8;e,s ',    // no trimming: a stray space is malformed
    '#v1; 7,8',        // nor in the coordinates
    '#v1;7, 8',
    '#v1;07,8',        // no padding
    '#v1;+7,8',        // no sign
    '#v1;7.0,8',       // no fractions
    '#v1;-1,8',        // (the minus never even reaches the bounds check)
    '#v1;7',           // one coordinate
    '#v1;7,8,9',       // three
    '#v1;seven,eight',
    '#v1;7,8;e#v1;7,8;e',
    '#v1;0x1,8',
    '#v1;٧,٨',         // digits, but not the ones the grammar allows
  ];
  for (const fragment of rejected) {
    isEmpty(decodePath(fragment, GRID), `refused ${fragment}`);
  }
});

test('a fragment that is not a string is refused like any other rubbish', () => {
  for (const value of [null, undefined, 0, 7, {}, [], ['#v1;7,8'], true, Symbol('#v1;7,8')]) {
    isEmpty(decodePath(value, GRID), `refused ${String(value)}`);
  }
});

test('coordinates off the grid, and the inert centre, are refused', () => {
  for (const fragment of ['#v1;29,0', '#v1;0,29', '#v1;29,29', '#v1;100,100', '#v1;14,14', '#v1;14,14;e']) {
    isEmpty(decodePath(fragment, GRID), `refused ${fragment}`);
  }
});

test('a line that leaves the cloth, or crosses the centre, takes the whole path with it', () => {
  isEmpty(decodePath('#v1;0,0;n', GRID), 'straight off the top edge');
  isEmpty(decodePath('#v1;28,28;se', GRID), 'off the far corner');
  isEmpty(decodePath('#v1;8,8;se', GRID), 'a diagonal that would land on 心');
});

test('a later direction being refused discards the valid prefix, atomically', () => {
  // Three lines east from (0,0) are all good; the fourth runs off the top.
  const prefix = decodePath('#v1;0,0;e,e,e', GRID);
  assert.equal(prefix.lineCount(), 3, 'the prefix really is valid on its own');
  isEmpty(decodePath('#v1;0,0;e,e,e,n', GRID), 'so the refusal cannot leave three lines behind');
  isEmpty(decodePath('#v1;10,10;e,s,w,n,zz', GRID), 'nor can an unreadable id leave a quatrain');
  isEmpty(decodePath('#v1;10,10;e,s,w,n,', GRID), 'nor a trailing separator after a full quatrain');
});

test('an absurdly long fragment is refused rather than replayed', () => {
  // Refused by the cloth itself, on the third line east: a fragment is bounded
  // by where the lines can go, never by a count the encoder does not share.
  isEmpty(decodePath(`#v1;10,10;${new Array(5000).fill('e').join(',')}`, GRID), 'no unbounded replay');
});

test('a long but valid trace round-trips: the codec has no line limit of its own', () => {
  // Four lines east, south, west and north return the anchor to where they
  // found it, so this circuit can be walked for as long as the reader likes.
  // Whatever encodePath is willing to write, decodePath must be able to replay.
  const ids = [];
  while (ids.length < 257) ids.push(...['e', 's', 'w', 'n']);
  ids.length = 257; // past the old ceiling, and not a whole number of quatrains

  const traced = trace({ row: 10, col: 10 }, ids);
  const fragment = encodePath(traced.path());
  const decoded = decodePath(fragment, GRID);

  assert.equal(decoded.lineCount(), 257, 'every line came back');
  assert.deepEqual(decoded.path(), traced.path());
  assert.deepEqual(decoded.allLines(), traced.allLines());
  assert.deepEqual(decoded.extractedLines(), traced.extractedLines());
  assert.equal(encodePath(decoded.path()), fragment, 're-encodes unchanged');
});

// --- the promises the codec makes to the rest of the app ------------------

test('decodePath always hands back a usable selection, never null', () => {
  for (const fragment of ['', '#nonsense', '#v1;7,8', '#v1;10,10;e,s,w,n']) {
    const decoded = decodePath(fragment, GRID);
    assert.equal(typeof decoded.pickStart, 'function');
    assert.equal(typeof decoded.addLine, 'function');
    assert.equal(typeof decoded.path, 'function');
  }
});

test('each decode is a fresh selection, sharing nothing with the last', () => {
  const first = decodePath('#v1;10,10;e', GRID);
  const second = decodePath('#v1;10,10;e', GRID);
  second.undo();
  second.undo();
  assert.equal(first.lineCount(), 1, 'the first is untouched');
  assert.equal(second.currentAnchor(), null);
});

test('replay goes through pickStart and addLine, never straight to cells', () => {
  // The codec may name the two entry points and nothing else of the state
  // machine: building a line by hand would sidestep the pivot rule, the bounds
  // and the inert centre, which are exactly what makes a fragment safe to trust.
  assert.match(codecJs, /selection\.pickStart\(\{ row: Number\(coords\[0\]\), col: Number\(coords\[1\]\) \}\)/);
  assert.match(codecJs, /selection\.addLine\(direction\)/);
  assert.equal((codecJs.match(/\.pickStart\(/g) ?? []).length, 1, 'a start is picked exactly once');
  assert.doesNotMatch(codecJs, /lineCells|isValidLine|cells\s*[:=]|chars/, 'no cell is ever built here');
  assert.match(codecJs, /createSelection\(grid\)/, 'and the grid is injected, never imported');
});

test('the codec and the state machine are DOM-free', () => {
  // Node has no DOM, so every test above already proves the codec runs without
  // one; this keeps a future edit from reaching for the address directly
  // instead of being handed the fragment.
  for (const [name, source] of [['path-codec.js', codecJs], ['selection.js', selectionJs]]) {
    assert.doesNotMatch(
      source,
      /\b(?:document|window|location|history|localStorage|sessionStorage|globalThis)\b/,
      `${name} touches no browser global`,
    );
  }
});

test('decoding leaves the canonical 841 characters exactly as they were', () => {
  const before = JSON.stringify(GRID);
  decodePath('#v1;10,10;e,s,w,n', GRID);
  decodePath('#v1;0,0;e,e,e,n', GRID); // one that fails partway through
  decodePath('#v1;14,14', GRID);
  assert.equal(JSON.stringify(GRID), before, 'the cloth is read-only to the codec');
  assert.equal(GRID.length, 29);
  assert.equal(GRID.flat().length, 841);
  assert.equal(GRID[14][14], '心');
});

// --- encoding and decoding share one domain -------------------------------
// A fragment the encoder is willing to write but the decoder throws away is a
// shared link that opens on an empty cloth. So encodePath refuses exactly what
// decodePath refuses: it replays every snapshot before writing it out.

test('a start off the grid is never written out', () => {
  for (const start of [
    { row: 29, col: 0 }, { row: 0, col: 29 }, { row: 29, col: 29 },
    { row: 100, col: 100 }, { row: -1, col: 0 }, { row: 0, col: -1 },
  ]) {
    assert.equal(encodePath({ start, directions: [] }), '', `refused ${JSON.stringify(start)}`);
    assert.equal(encodePath({ start, directions: ['e'] }), '', `refused ${JSON.stringify(start)} with a line`);
  }
});

test('the inert centre is never written out as a start', () => {
  assert.equal(encodePath({ start: { row: 14, col: 14 }, directions: [] }), '');
  assert.equal(encodePath({ start: { row: 14, col: 14 }, directions: ['e'] }), '');
});

test('turns that cannot be walked are not written out, however well-formed', () => {
  // Each of these is perfect ASCII by the grammar, and refused by the cloth.
  assert.equal(encodePath({ start: { row: 0, col: 0 }, directions: ['n'] }), '', 'off the top edge');
  assert.equal(encodePath({ start: { row: 28, col: 28 }, directions: ['se'] }), '', 'off the far corner');
  assert.equal(encodePath({ start: { row: 8, col: 8 }, directions: ['se'] }), '', 'a diagonal onto 心');
  assert.equal(encodePath({ start: { row: 0, col: 0 }, directions: ['e', 'e', 'e', 'n'] }), '', 'refused on the fourth line');
  assert.equal(encodePath({ start: { row: 0, col: 0 }, directions: ['e', 'e', 'e'] }), '#v1;0,0;e,e,e', 'but the walkable prefix is fine on its own');
});

test('directions have to be a list of ids before anything is written', () => {
  assert.equal(encodePath({ start: OPEN_START, directions: 'e' }), '', 'not a string of them');
  assert.equal(encodePath({ start: OPEN_START, directions: ['e,s'] }), '', 'and no id may carry a separator');
  assert.equal(encodePath({ start: OPEN_START, directions: ['e;n'] }), '');
});

test('whatever encodePath writes, decodePath replays back to the same path', () => {
  // The property the two functions exist to keep, swept over every start on the
  // cloth and every direction, valid and invalid alike.
  let written = 0;
  for (let row = -1; row <= 29; row++) {
    for (let col = -1; col <= 29; col++) {
      for (const direction of DIRECTIONS) {
        const path = { start: { row, col }, directions: [direction.id, direction.id] };
        const fragment = encodePath(path);
        if (fragment === '') continue;
        written++;
        const decoded = decodePath(fragment, GRID);
        assert.deepEqual(decoded.path(), path, `${fragment} replays to itself`);
        assert.equal(encodePath(decoded.path()), fragment, `${fragment} re-encodes unchanged`);
      }
    }
  }
  assert.ok(written > 1000, `the sweep found real paths to write (${written})`);
});

test('encoding reads the geometry of the cloth, never a character of it', () => {
  const before = JSON.stringify(GRID);
  encodePath(trace({ row: 10, col: 10 }, ['e', 's', 'w', 'n']).path());
  encodePath({ start: { row: 29, col: 0 }, directions: [] });
  assert.equal(JSON.stringify(GRID), before, 'the cloth is untouched by an encode');
  // …and the fragment could have been written with no cloth to hand at all.
  assert.doesNotMatch(codecJs, /grid-data/, 'the canonical 841 are never imported here');
});
