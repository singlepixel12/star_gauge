// test/readings.test.js
// PER-45: the reverse reading. The cloth is reversible, so the poem card shows
// one traced thread read both ways — and the backward reading is derived text,
// never a second selection. These tests run the transform over a real trace
// taken from the real GRID, because the thing worth guarding is that the
// reverse is the exact character stream you get by walking the committed thread
// from its endpoint back to its start.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GRID } from '../src/grid-data.js';
import { DIRECTIONS, isCenter } from '../src/geometry.js';
import { createSelection } from '../src/selection.js';
import { reverseReading } from '../src/readings.js';

const EAST = DIRECTIONS.find((d) => d.id === 'e');

// Four eastward lines from the top-left cell: the pivot rule puts them at
// columns 0-6, 7-13, 14-20 and 21-27 of row 0, so a full quatrain fits along
// one edge of the cloth without ever reaching the inert centre.
function eastwardQuatrain() {
  const selection = createSelection(GRID);
  assert.equal(selection.pickStart({ row: 0, col: 0 }), true);
  for (let i = 0; i < 4; i++) {
    assert.equal(selection.addLine(EAST), true, `line ${i + 1} commits`);
  }
  return selection;
}

const codePoints = (line) => Array.from(line);

test('a real four-line trace reverses line order and characters', () => {
  const selection = eastwardQuatrain();
  const forward = selection.extractedLines();
  const reverse = reverseReading(forward);

  assert.equal(forward.length, 4, 'four forward lines');
  assert.equal(reverse.length, 4, 'four reverse lines');
  for (const line of [...forward, ...reverse]) {
    assert.equal(codePoints(line).length, 7, `seven code points in ${line}`);
  }

  assert.equal(reverse[0], codePoints(forward[3]).reverse().join(''), 'reverse 1 is forward 4 backwards');
  assert.equal(reverse[3], codePoints(forward[0]).reverse().join(''), 'reverse 4 is forward 1 backwards');
});

test('the flattened reverse reading is the flattened forward reading backwards', () => {
  const forward = eastwardQuatrain().extractedLines();
  // The whole point of the feature: 28 characters read one way, the same 28
  // read the other. Joined without separators, one is the other's mirror.
  assert.equal(
    reverseReading(forward).join(''),
    codePoints(forward.join('')).reverse().join(''),
  );
});

test('the transform does not mutate its input and is its own inverse', () => {
  const forward = eastwardQuatrain().extractedLines();
  const snapshot = [...forward];

  const reverse = reverseReading(forward);
  assert.deepEqual(forward, snapshot, 'the source array is untouched');
  assert.notEqual(reverse, forward, 'a fresh array comes back');

  assert.deepEqual(reverseReading(reverse), snapshot, 'reversing twice restores the forward reading');
  assert.deepEqual(forward, snapshot, 'and still without mutating anything');
});

test('the inert centre is nowhere in the trace either reading is derived from', () => {
  const selection = eastwardQuatrain();
  for (const line of selection.allLines()) {
    for (const cell of line.cells) {
      assert.equal(isCenter(cell), false, `${cell.row},${cell.col} is not the centre`);
    }
  }
  // The centre is a *coordinate*, not a glyph: 心 occurs elsewhere on the cloth
  // as an ordinary character, so only [14][14] is excluded — checked above by
  // isCenter(). isValidLine() enforces that upstream, which is why the
  // transform needs no rule about the centre at all.
  assert.equal(isCenter({ row: 14, col: 14 }), true, 'the centre is the one excluded cell');
  assert.equal(GRID[14][14], '心', 'and 心 is what sits there');
});

test('empty and single-line readings', () => {
  assert.deepEqual(reverseReading([]), [], 'nothing traced yet reverses to nothing');

  const selection = createSelection(GRID);
  selection.pickStart({ row: 0, col: 0 });
  selection.addLine(EAST);
  const forward = selection.extractedLines();
  assert.equal(forward.length, 1);
  // Live from line one: a partial trace has a reverse reading too.
  assert.deepEqual(reverseReading(forward), [codePoints(forward[0]).reverse().join('')]);
});

test('more than one quatrain reverses the whole trace, not each block of four', () => {
  // Eight lines: the eastward quatrain along row 0, down the far column, then
  // back west along row 7. The reverse must start from line 8 and run back to
  // line 1 — reversing each block of four independently would put line 4 first
  // and misrepresent the thread.
  const SOUTH = DIRECTIONS.find((d) => d.id === 's');
  const WEST = DIRECTIONS.find((d) => d.id === 'w');
  const selection = eastwardQuatrain();
  assert.equal(selection.addLine(SOUTH), true);
  for (let i = 0; i < 3; i++) assert.equal(selection.addLine(WEST), true, `west line ${i + 1}`);

  const forward = selection.extractedLines();
  assert.equal(forward.length, 8, 'two quatrains committed');

  const reverse = reverseReading(forward);
  assert.equal(reverse[0], codePoints(forward[7]).reverse().join(''), 'the last line read first');
  assert.equal(reverse[7], codePoints(forward[0]).reverse().join(''), 'the first line read last');
  assert.equal(
    reverse.join(''),
    codePoints(forward.join('')).reverse().join(''),
    'one continuous backward reading across both quatrains',
  );
});

test('reversal counts code points, not UTF-16 units', () => {
  // The grid is BMP today, but a variant character from a CJK extension plane is
  // a surrogate pair: index-based reversal would split it into two broken halves.
  const astral = '\u{20000}\u{2000B}\u{20089}';
  assert.equal(astral.length, 6, 'three characters, six UTF-16 units');
  const [reversed] = reverseReading([astral]);
  assert.deepEqual(codePoints(reversed), codePoints(astral).reverse());
  assert.equal(reversed, '\u{20089}\u{2000B}\u{20000}');
});
