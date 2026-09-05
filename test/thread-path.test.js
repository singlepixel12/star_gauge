// test/thread-path.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellCenter, pointsToAttr, pathToThreadGeometry } from '../src/thread-path.js';
import { createSelection } from '../src/selection.js';
import { DIRECTIONS } from '../src/geometry.js';
import { GRID } from '../src/grid-data.js';

// A simple square layout: cell (0,0) centred at (10,10), 40px pitch.
const LAYOUT = { originX: 10, originY: 10, stepX: 40, stepY: 40, width: 1200, height: 1200 };

const dir = (id) => DIRECTIONS.find((d) => d.id === id);

// Builds committed lines the way the app does, through the real selection.
function trace(start, dirIds) {
  const selection = createSelection(GRID);
  assert.ok(selection.pickStart(start));
  for (const id of dirIds) assert.ok(selection.addLine(dir(id)), `addLine ${id}`);
  return selection.allLines();
}

test('an empty path draws nothing but still reports the viewport size', () => {
  const geo = pathToThreadGeometry([], LAYOUT);
  assert.deepEqual(geo.segments, []);
  assert.deepEqual(geo.pivots, []);
  assert.equal(geo.start, null);
  assert.equal(geo.end, null);
  assert.equal(geo.width, 1200);
  assert.equal(geo.height, 1200);
});

test('missing or malformed input is tolerated rather than thrown', () => {
  for (const input of [undefined, null, [], [{}], [{ cells: [] }]]) {
    const geo = pathToThreadGeometry(input, LAYOUT);
    assert.deepEqual(geo.segments, []);
    assert.equal(geo.start, null);
  }
});

test('cellCenter maps row/col onto the layout grid', () => {
  assert.deepEqual(cellCenter({ row: 0, col: 0 }, LAYOUT), { x: 10, y: 10 });
  assert.deepEqual(cellCenter({ row: 3, col: 2 }, LAYOUT), { x: 90, y: 130 });
  assert.deepEqual(cellCenter({ row: 28, col: 28 }, LAYOUT), { x: 1130, y: 1130 });
});

test('a horizontal line maps to seven points along one row', () => {
  const geo = pathToThreadGeometry(trace({ row: 5, col: 2 }, ['e']), LAYOUT);
  assert.equal(geo.segments.length, 1);
  const [seg] = geo.segments;
  assert.equal(seg.points.length, 7);
  assert.ok(seg.points.every((p) => p.y === 10 + 5 * 40));
  assert.deepEqual(seg.points.map((p) => p.x), [90, 130, 170, 210, 250, 290, 330]);
  assert.deepEqual(seg.from, { x: 90, y: 210 });
  assert.deepEqual(seg.to, { x: 330, y: 210 });
});

test('a vertical line maps to seven points down one column', () => {
  const [seg] = pathToThreadGeometry(trace({ row: 2, col: 5 }, ['s']), LAYOUT).segments;
  assert.ok(seg.points.every((p) => p.x === 10 + 5 * 40));
  assert.deepEqual(seg.points.map((p) => p.y), [90, 130, 170, 210, 250, 290, 330]);
});

test('a diagonal line steps in both axes at once', () => {
  const [seg] = pathToThreadGeometry(trace({ row: 0, col: 0 }, ['se']), LAYOUT).segments;
  assert.deepEqual(
    seg.points,
    [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: 10 + i * 40, y: 10 + i * 40 })),
  );
});

test('a north-west line runs backwards through both axes', () => {
  const [seg] = pathToThreadGeometry(trace({ row: 10, col: 10 }, ['nw']), LAYOUT).segments;
  assert.deepEqual(seg.from, { x: 410, y: 410 });
  assert.deepEqual(seg.to, { x: 410 - 6 * 40, y: 410 - 6 * 40 });
});

test('later segments reconnect through the pivot the selection omits', () => {
  const lines = trace({ row: 5, col: 2 }, ['e', 's']);
  // The selection really does omit the junction from the second line.
  assert.deepEqual(lines[1].cells[0], { row: 6, col: 8 });
  assert.notDeepEqual(lines[1].cells[0], lines[0].cells[6]);

  const geo = pathToThreadGeometry(lines, LAYOUT);
  assert.equal(geo.segments[0].points.length, 7);
  assert.equal(geo.segments[1].points.length, 8, 'pivot prepended');
  // The second segment starts exactly where the first one ended: no gap.
  assert.deepEqual(geo.segments[1].points[0], geo.segments[0].points[6]);
  assert.deepEqual(geo.segments[1].points[0], cellCenter(lines[0].cells[6], LAYOUT));
  assert.deepEqual(geo.segments[1].points[1], cellCenter(lines[1].cells[0], LAYOUT));
});

test('every joint between committed lines becomes a pivot knot', () => {
  const lines = trace({ row: 14, col: 2 }, ['e', 'ne', 'e', 's']);
  const geo = pathToThreadGeometry(lines, LAYOUT);
  assert.equal(geo.segments.length, 4);
  // Three interior joints for four lines; the fourth endpoint is the live head.
  assert.equal(geo.pivots.length, 3);
  geo.pivots.forEach((pivot, i) => {
    const cell = lines[i].cells[6];
    assert.deepEqual(pivot, { row: cell.row, col: cell.col, ...cellCenter(cell, LAYOUT) });
  });
  const tail = lines[3].cells[6];
  assert.deepEqual(geo.end, { row: tail.row, col: tail.col, ...cellCenter(tail, LAYOUT) });
});

test('the start marker is the first cell of the first line', () => {
  const geo = pathToThreadGeometry(trace({ row: 5, col: 2 }, ['e', 's']), LAYOUT);
  assert.deepEqual(geo.start, { row: 5, col: 2, x: 90, y: 210 });
});

test('a start picked before the first line still gets a marker', () => {
  const geo = pathToThreadGeometry([], LAYOUT, { start: { row: 3, col: 4 } });
  assert.deepEqual(geo.start, { row: 3, col: 4, x: 170, y: 130 });
  assert.deepEqual(geo.segments, []);
  assert.equal(geo.end, null, 'no thread yet, so no head');
});

test('committed lines win over a stale start option', () => {
  const geo = pathToThreadGeometry(trace({ row: 5, col: 2 }, ['e']), LAYOUT, {
    start: { row: 20, col: 20 },
  });
  assert.deepEqual(geo.start, { row: 5, col: 2, x: 90, y: 210 });
});

test('each segment gets its own gradient id, prefixable for the host page', () => {
  const geo = pathToThreadGeometry(trace({ row: 5, col: 2 }, ['e', 's', 'w']), LAYOUT);
  assert.deepEqual(geo.segments.map((s) => s.gradientId), [
    'thread-gradient-0', 'thread-gradient-1', 'thread-gradient-2',
  ]);
  const prefixed = pathToThreadGeometry(trace({ row: 5, col: 2 }, ['e']), LAYOUT, { idPrefix: 'x' });
  assert.equal(prefixed.segments[0].gradientId, 'x-gradient-0');
});

test('the gradient runs from the segment start to its end, so direction reads', () => {
  const east = pathToThreadGeometry(trace({ row: 5, col: 2 }, ['e']), LAYOUT).segments[0];
  const west = pathToThreadGeometry(trace({ row: 5, col: 8 }, ['w']), LAYOUT).segments[0];
  assert.deepEqual(east.from, west.to);
  assert.deepEqual(east.to, west.from);
});

test('pointsToAttr renders an SVG points string, trimming float noise', () => {
  assert.equal(pointsToAttr([{ x: 1, y: 2 }, { x: 3, y: 4 }]), '1,2 3,4');
  assert.equal(pointsToAttr([{ x: 0.1 + 0.2, y: 1.2345 }]), '0.3,1.23');
  assert.equal(pointsToAttr([]), '');
});

test('fractional layout values survive into the points and the attribute', () => {
  const layout = { originX: 18.5, originY: 18.5, stepX: 30.25, stepY: 30.25, width: 900.5, height: 900.5 };
  const [seg] = pathToThreadGeometry(trace({ row: 1, col: 1 }, ['e']), layout).segments;
  assert.deepEqual(seg.points[0], { x: 48.75, y: 48.75 });
  assert.deepEqual(seg.points[1], { x: 79, y: 48.75 });
  assert.equal(seg.pointsAttr.split(' ')[0], '48.75,48.75');
  assert.equal(seg.pointsAttr.split(' ').length, 7);
  assert.equal(pathToThreadGeometry([], layout).width, 900.5);
});

test('layouts with different x and y pitch are handled independently', () => {
  const layout = { originX: 5, originY: 100, stepX: 10, stepY: 50 };
  assert.deepEqual(cellCenter({ row: 2, col: 3 }, layout), { x: 35, y: 200 });
});

test('geometry scales with the layout — responsive redraw needs no new path', () => {
  const lines = trace({ row: 3, col: 3 }, ['e', 'se']);
  const big = pathToThreadGeometry(lines, LAYOUT);
  const half = pathToThreadGeometry(lines, {
    originX: 5, originY: 5, stepX: 20, stepY: 20, width: 600, height: 600,
  });
  assert.equal(big.segments.length, half.segments.length);
  big.segments.forEach((seg, i) => {
    assert.equal(seg.points.length, half.segments[i].points.length);
    seg.points.forEach((p, j) => {
      assert.equal(half.segments[i].points[j].x, p.x / 2);
      assert.equal(half.segments[i].points[j].y, p.y / 2);
    });
  });
  assert.equal(half.pivots[0].x, big.pivots[0].x / 2);
  assert.equal(half.start.y, big.start.y / 2);
});

test('a path that doubles back keeps every visit as its own point', () => {
  // Out and back: the second line retraces the first line's cells westward.
  const lines = trace({ row: 10, col: 4 }, ['e', 'w']);
  const geo = pathToThreadGeometry(lines, LAYOUT);
  const revisited = cellCenter({ row: 10, col: 9 }, LAYOUT);
  const hits = geo.segments
    .flatMap((s) => s.points)
    .filter((p) => p.x === revisited.x && p.y === revisited.y);
  assert.equal(hits.length, 2, 'a cell visited twice is drawn twice, not deduped');
  assert.equal(
    geo.segments.flatMap((s) => s.points).length, 7 + 8,
    'no points dropped for overlapping cells',
  );
});

test('a self-crossing path is drawn, not rejected — geometry is display only', () => {
  // Round the block and back along the opening line: lines 1 and 5 share cells.
  const lines = trace({ row: 10, col: 4 }, ['e', 'n', 'w', 's', 'e']);
  assert.deepEqual(lines[4].cells, lines[0].cells, 'the fifth line retraces the first');

  const geo = pathToThreadGeometry(lines, LAYOUT);
  assert.equal(geo.segments.length, 5);
  assert.equal(geo.pivots.length, 4);
  assert.deepEqual(geo.segments[4].points.slice(1), geo.segments[0].points);
  assert.deepEqual(geo.start, { row: 10, col: 4, ...cellCenter({ row: 10, col: 4 }, LAYOUT) });
  assert.deepEqual(geo.end, { row: 10, col: 10, ...cellCenter({ row: 10, col: 10 }, LAYOUT) });
});

test('the input lines and layout are never mutated', () => {
  const lines = trace({ row: 5, col: 2 }, ['e', 's']);
  const linesBefore = structuredClone(lines);
  const layout = { ...LAYOUT };
  Object.freeze(layout);
  Object.freeze(lines);
  lines.forEach((l) => { Object.freeze(l); Object.freeze(l.cells); l.cells.forEach(Object.freeze); });

  pathToThreadGeometry(lines, layout);

  assert.deepEqual(lines, linesBefore);
  assert.deepEqual(layout, LAYOUT);
});

test('returned points are fresh objects, safe for the caller to adjust', () => {
  const lines = trace({ row: 5, col: 2 }, ['e', 's']);
  const geo = pathToThreadGeometry(lines, LAYOUT);
  const a = pathToThreadGeometry(lines, LAYOUT);
  geo.segments[0].points[0].x = -999;
  geo.pivots[0].y = -999;
  geo.start.x = -999;
  assert.equal(a.segments[0].points[0].x, 90, 'a second call is unaffected');
  assert.notEqual(geo.segments[1].points[0].x, -999, 'segments do not share point objects');
});
