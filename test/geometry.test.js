// test/geometry.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECTIONS, SIZE, LINE_LENGTH, CENTER,
  inGrid, isCenter, lineCells, isValidLine, validDirectionsFrom,
} from '../src/geometry.js';

test('there are 8 named directions and grid constants', () => {
  assert.equal(DIRECTIONS.length, 8);
  for (const d of DIRECTIONS) {
    assert.ok(d.id && typeof d.arrow === 'string');
    assert.ok([-1, 0, 1].includes(d.dr) && [-1, 0, 1].includes(d.dc));
  }
  assert.equal(SIZE, 29);
  assert.equal(LINE_LENGTH, 7);
  assert.deepEqual(CENTER, { row: 14, col: 14 });
});

test('first line includes its anchor: 7 cells east from (0,0)', () => {
  const cells = lineCells({ row: 0, col: 0 }, { dr: 0, dc: 1 }, false);
  assert.equal(cells.length, 7);
  assert.deepEqual(cells[0], { row: 0, col: 0 });
  assert.deepEqual(cells[6], { row: 0, col: 6 });
});

test('pivot line skips its anchor: 7 cells east from junction (0,6)', () => {
  const cells = lineCells({ row: 0, col: 6 }, { dr: 0, dc: 1 }, true);
  assert.deepEqual(cells[0], { row: 0, col: 7 });   // one step onward
  assert.deepEqual(cells[6], { row: 0, col: 13 });  // junction char not repeated
});

test('lineCells returns null when the run leaves the grid', () => {
  assert.equal(lineCells({ row: 0, col: 25 }, { dr: 0, dc: 1 }, false), null);
  assert.equal(lineCells({ row: 0, col: 22 }, { dr: 0, dc: 1 }, true), null); // 23..29 off-grid
});

test('isValidLine rejects a run through the centre', () => {
  const first = lineCells({ row: 14, col: 8 }, { dr: 0, dc: 1 }, false); // cols 8..14 hits centre
  assert.equal(isValidLine(first), false);
  const pivot = lineCells({ row: 14, col: 13 }, { dr: 0, dc: 1 }, true); // cols 14..20 hits centre
  assert.equal(isValidLine(pivot), false);
});

test('isValidLine accepts a clean run that stops just short of centre', () => {
  const cells = lineCells({ row: 14, col: 7 }, { dr: 0, dc: 1 }, false); // cols 7..13
  assert.equal(isValidLine(cells), true);
});

test('validDirectionsFrom a corner yields 3 inward runs, first-line and pivot', () => {
  assert.equal(validDirectionsFrom({ row: 0, col: 0 }, false).length, 3); // E, S, SE
  assert.equal(validDirectionsFrom({ row: 0, col: 0 }, true).length, 3);
});

test('every cell always has at least one valid pivot direction (no dead ends)', () => {
  for (let r = 0; r < 29; r++) {
    for (let c = 0; c < 29; c++) {
      if (r === 14 && c === 14) continue;
      assert.ok(validDirectionsFrom({ row: r, col: c }, true).length >= 1, `dead end at (${r},${c})`);
    }
  }
});
