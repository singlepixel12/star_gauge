// test/selection.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSelection } from '../src/selection.js';

// Injectable fake grid: 29×29 of distinct CJK chars so extracted text is checkable.
function fakeGrid() {
  return Array.from({ length: 29 }, (_, r) =>
    Array.from({ length: 29 }, (_, c) => String.fromCharCode(0x4e00 + r * 29 + c)),
  );
}
const at = (g, cell) => g[cell.row][cell.col];

test('pickStart works once, rejects the centre cell', () => {
  const s = createSelection(fakeGrid());
  assert.equal(s.pickStart({ row: 14, col: 14 }), false); // 心 is inert
  assert.equal(s.pickStart({ row: 0, col: 0 }), true);
  assert.equal(s.pickStart({ row: 5, col: 5 }), false);   // already started
});

test('first line includes the start; pivot line does not repeat the junction', () => {
  const g = fakeGrid();
  const s = createSelection(g);
  s.pickStart({ row: 0, col: 0 });
  assert.equal(s.addLine({ dr: 0, dc: 1 }), true);  // cells (0,0)..(0,6)
  assert.equal(s.addLine({ dr: 1, dc: 0 }), true);  // pivot at (0,6): cells (1,6)..(7,6)
  const [l1, l2] = s.extractedLines();
  assert.equal(l1[0], at(g, { row: 0, col: 0 }));
  assert.equal(l1[6], at(g, { row: 0, col: 6 }));
  assert.equal(l2[0], at(g, { row: 1, col: 6 }));           // starts ONE STEP past junction
  assert.notEqual(l2[0], l1[6]);                            // no boundary repeat
  assert.deepEqual(s.currentAnchor(), { row: 7, col: 6 });  // junction = last cell of line 2
});

test('addLine rejects invalid directions and leaves state untouched', () => {
  const s = createSelection(fakeGrid());
  s.pickStart({ row: 0, col: 0 });
  assert.equal(s.addLine({ dr: -1, dc: 0 }), false); // off-grid
  assert.equal(s.lineCount(), 0);
});

test('canExtract true only at multiples of 4; linesNeeded counts the gap', () => {
  const s = createSelection(fakeGrid());
  s.pickStart({ row: 0, col: 0 });
  assert.equal(s.linesNeeded(), 4);
  // Straight east run along row 0 for the first 4 lines (never nears the
  // centre), then turn south for the 5th — avoids the centre-collision that
  // an alternating east/south path from (0,0) would hit exactly on line 5.
  s.addLine({ dr: 0, dc: 1 });  // 1
  s.addLine({ dr: 0, dc: 1 });  // 2
  s.addLine({ dr: 0, dc: 1 });  // 3
  assert.equal(s.canExtract(), false);
  assert.equal(s.linesNeeded(), 1);
  s.addLine({ dr: 0, dc: 1 });  // 4
  assert.equal(s.canExtract(), true);
  assert.equal(s.linesNeeded(), 0);
  s.addLine({ dr: 1, dc: 0 });  // 5
  assert.equal(s.canExtract(), false);
  assert.equal(s.linesNeeded(), 3);
});

test('undo pops one line; with none left it clears the start', () => {
  const s = createSelection(fakeGrid());
  s.pickStart({ row: 0, col: 0 });
  s.addLine({ dr: 0, dc: 1 });
  s.addLine({ dr: 1, dc: 0 });
  s.undo();
  assert.equal(s.lineCount(), 1);
  assert.deepEqual(s.currentAnchor(), { row: 0, col: 6 });
  s.undo();
  assert.equal(s.lineCount(), 0);
  assert.deepEqual(s.currentAnchor(), { row: 0, col: 0 }); // back to picked start
  s.undo();
  assert.equal(s.currentAnchor(), null);                    // start cleared
});

test('reset clears everything and allows a fresh pickStart', () => {
  const s = createSelection(fakeGrid());
  s.pickStart({ row: 0, col: 0 });
  s.addLine({ dr: 0, dc: 1 });
  s.reset();
  assert.equal(s.lineCount(), 0);
  assert.equal(s.currentAnchor(), null);
  assert.equal(s.pickStart({ row: 3, col: 3 }), true);
});
