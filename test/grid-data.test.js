// test/grid-data.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRID, CENTER } from '../src/grid-data.js';

test('grid is 29 rows', () => {
  assert.equal(GRID.length, 29);
});

test('every row has 29 columns of single characters', () => {
  GRID.forEach((row, r) => {
    assert.equal(row.length, 29, `row ${r} has ${row.length} cells`);
    for (const ch of row) {
      assert.equal([...ch].length, 1, `cell "${ch}" in row ${r} must be one character`);
    }
  });
});

test('grid has 841 characters total', () => {
  assert.equal(GRID.flat().length, 841);
});

test('centre is 心 at [14][14]', () => {
  assert.deepEqual(CENTER, { row: 14, col: 14 });
  assert.equal(GRID[14][14], '心');
});

test('spot-check known cells (guards against row drift)', () => {
  assert.equal(GRID[0][0], '琴');   // first cell
  assert.equal(GRID[0][28], '仁');  // end of row 0
  assert.equal(GRID[28][0], '親');  // start of row 28
  assert.equal(GRID[28][28], '津'); // last cell
});
