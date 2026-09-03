// src/thread-path.js — pure "gold thread" geometry. No DOM, no measurement.
//
// The selection stores each committed line as its own 7 cells, and — per the
// pivot rule in CLAUDE.md — a line after the first *omits* the junction it
// pivots on (it starts one step onward). Drawn naively that leaves a gap in the
// thread at every pivot, so each later segment is reconnected here by
// prepending the previous line's last cell. That prepended point is geometry
// only: it never changes the extracted characters.

const DECIMALS = 2;

function round(n) {
  // Keeps the SVG "points" attribute short and free of float noise, without
  // rounding the numeric points callers may want for markers.
  return Number.parseFloat(n.toFixed(DECIMALS));
}

// Centre of a cell in the coordinate space described by `layout`:
//   originX/originY — centre of cell (0,0)
//   stepX/stepY     — distance between the centres of adjacent columns/rows
export function cellCenter(cell, layout) {
  return {
    x: layout.originX + cell.col * layout.stepX,
    y: layout.originY + cell.row * layout.stepY,
  };
}

// [{x,y}, …] -> "x,y x,y …" for an SVG <polyline points="…">
export function pointsToAttr(points) {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
}

function marker(cell, layout) {
  return { row: cell.row, col: cell.col, ...cellCenter(cell, layout) };
}

function cellsOf(line) {
  return Array.isArray(line?.cells) ? line.cells : [];
}

// lines   — [{ cells: [{row,col}, …] }, …] as produced by selection.allLines()
// layout  — { originX, originY, stepX, stepY, width?, height? }
// options — { start?: {row,col}, idPrefix?: string }
//
// Returns a plain description of what to draw; nothing here knows about SVG
// elements, only about numbers and ids.
export function pathToThreadGeometry(lines, layout, options = {}) {
  const src = (Array.isArray(lines) ? lines : []).filter((l) => cellsOf(l).length > 0);
  const idPrefix = options.idPrefix ?? 'thread';

  const segments = [];
  const pivots = [];

  src.forEach((line, i) => {
    const cells = cellsOf(line);
    const previous = i > 0 ? cellsOf(src[i - 1]) : null;
    // Reconnect across the omitted pivot: line N+1 is drawn from line N's end.
    const through = previous ? [previous[previous.length - 1], ...cells] : cells;
    const points = through.map((cell) => cellCenter(cell, layout));
    const from = points[0];
    const to = points[points.length - 1];

    segments.push({
      index: i,
      // Direction is shown by a per-segment gradient running start -> end, so a
      // static render still reads as "the thread flows this way".
      gradientId: `${idPrefix}-gradient-${i}`,
      points,
      pointsAttr: pointsToAttr(points),
      from: { ...from },
      to: { ...to },
    });

    if (i < src.length - 1) pivots.push(marker(cells[cells.length - 1], layout));
  });

  const startCell = src.length > 0 ? cellsOf(src[0])[0] : options.start ?? null;
  const lastLine = src.length > 0 ? cellsOf(src[src.length - 1]) : null;

  return {
    width: layout.width ?? 0,
    height: layout.height ?? 0,
    segments,
    pivots,
    start: startCell ? marker(startCell, layout) : null,
    end: lastLine ? marker(lastLine[lastLine.length - 1], layout) : null,
  };
}
