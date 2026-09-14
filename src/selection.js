// src/selection.js — pivot-rule connected-path state. No DOM. Grid is injected.
import { lineCells, isValidLine, isCenter, inGrid, canonicalDirection } from './geometry.js';

// A cell has to be a pair of whole numbers before anything geometric is asked
// of it: a decoded URL can offer {row: '3'}, {row: 1.5} or nothing at all, and
// those must be refused here rather than indexed into the grid.
function isCell(cell) {
  return !!cell && Number.isInteger(cell.row) && Number.isInteger(cell.col);
}

export function createSelection(grid) {
  let startCell = null;   // the very first anchor (before any lines)
  const lines = [];       // each: { cells: [{row,col}×7], chars: string[7], dirId }

  const isPivot = () => lines.length > 0;

  function currentAnchor() {
    if (lines.length > 0) return { ...lines[lines.length - 1].cells[6] };
    return startCell ? { ...startCell } : null;
  }

  function pickStart(cell) {
    if (lines.length > 0 || startCell !== null) return false;
    if (!isCell(cell)) return false;
    if (!inGrid(cell)) return false;
    if (isCenter(cell)) return false;
    startCell = { row: cell.row, col: cell.col };
    return true;
  }

  function addLine(dir) {
    const anchor = currentAnchor();
    if (!anchor) return false;
    // Only one of the eight compass directions can be committed, because only
    // those have an id — and the id is what path() hands to the URL.
    const canonical = canonicalDirection(dir);
    if (!canonical) return false;
    const cells = lineCells(anchor, canonical, isPivot());
    if (!isValidLine(cells)) return false;
    lines.push({
      cells,
      chars: cells.map((c) => grid[c.row][c.col]),
      dirId: canonical.id,
    });
    return true;
  }

  function undo() {
    if (lines.length > 0) { lines.pop(); return; }
    startCell = null;
  }

  function reset() { lines.length = 0; startCell = null; }

  const lineCount = () => lines.length;
  const canExtract = () => lines.length >= 4 && lines.length % 4 === 0;
  const linesNeeded = () =>
    lines.length < 4 ? 4 - lines.length : (4 - (lines.length % 4)) % 4;
  const allLines = () => lines.map((l) => ({ cells: l.cells.map((c) => ({ ...c })) }));
  const extractedLines = () => lines.map((l) => l.chars.join(''));

  // An immutable snapshot of the trace in the only terms worth storing: where
  // it began, and the ordered ids of the turns it took. Cells and characters
  // are left out on purpose — they are replayed from these two, never carried.
  // The ids travel with the lines, so undo and reset shorten this in step.
  const path = () => ({
    start: startCell ? { ...startCell } : null,
    directions: lines.map((l) => l.dirId),
  });

  return {
    pickStart, addLine, undo, reset, isPivot,
    currentAnchor, lineCount, canExtract, linesNeeded, allLines, extractedLines,
    path,
  };
}
