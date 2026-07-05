// test/regions.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGION_IDS, regionAt } from '../src/regions.js';

test('centre cell maps to center region', () => {
  assert.equal(regionAt(14, 14), 'center');
});

test('the four grid corners map to the border region', () => {
  for (const [r, c] of [[0, 0], [0, 28], [28, 0], [28, 28]]) {
    assert.equal(regionAt(r, c), 'border');
  }
});

test('every one of the 841 cells maps to a known region id', () => {
  const ids = new Set(REGION_IDS);
  for (let r = 0; r < 29; r++) {
    for (let c = 0; c < 29; c++) {
      assert.ok(ids.has(regionAt(r, c)), `(${r},${c}) -> ${regionAt(r, c)}`);
    }
  }
});

test('there are five colour bands plus the centre', () => {
  assert.equal(REGION_IDS.length, 6);
});
