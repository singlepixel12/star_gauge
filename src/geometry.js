// src/geometry.js — pure geometry, no DOM.
export const SIZE = 29;
export const LINE_LENGTH = 7;
export const CENTER = { row: 14, col: 14 };

// Named for the compass UI. Order: clockwise from north.
export const DIRECTIONS = [
  { id: 'n',  dr: -1, dc: 0,  arrow: '↑' },
  { id: 'ne', dr: -1, dc: 1,  arrow: '↗' },
  { id: 'e',  dr: 0,  dc: 1,  arrow: '→' },
  { id: 'se', dr: 1,  dc: 1,  arrow: '↘' },
  { id: 's',  dr: 1,  dc: 0,  arrow: '↓' },
  { id: 'sw', dr: 1,  dc: -1, arrow: '↙' },
  { id: 'w',  dr: 0,  dc: -1, arrow: '←' },
  { id: 'nw', dr: -1, dc: -1, arrow: '↖' },
];

export function inGrid({ row, col }) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

export function isCenter({ row, col }) {
  return row === CENTER.row && col === CENTER.col;
}

// The 7 cells of a line. skipAnchor=false: first line, cells = anchor..anchor+6d.
// skipAnchor=true: pivot line, cells = anchor+1d..anchor+7d (junction NOT repeated).
export function lineCells(anchor, dir, skipAnchor) {
  const offset = skipAnchor ? 1 : 0;
  const cells = [];
  for (let i = 0; i < LINE_LENGTH; i++) {
    const cell = {
      row: anchor.row + dir.dr * (i + offset),
      col: anchor.col + dir.dc * (i + offset),
    };
    if (!inGrid(cell)) return null;
    cells.push(cell);
  }
  return cells;
}

export function isValidLine(cells) {
  if (!cells || cells.length !== LINE_LENGTH) return false;
  return cells.every((c) => inGrid(c) && !isCenter(c));
}

export function validDirectionsFrom(anchor, skipAnchor) {
  return DIRECTIONS.filter((dir) => isValidLine(lineCells(anchor, dir, skipAnchor)));
}
