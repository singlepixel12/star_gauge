// src/selection.js — pivot-rule connected-path state. No DOM. Grid is injected.
import { lineCells, isValidLine, isCenter } from './geometry.js';

export function createSelection(grid) {
  let startCell = null;   // the very first anchor (before any lines)
  const lines = [];       // each: { cells: [{row,col}×7], chars: string[7] }

  const isPivot = () => lines.length > 0;

  function currentAnchor() {
    if (lines.length > 0) return { ...lines[lines.length - 1].cells[6] };
    return startCell ? { ...startCell } : null;
  }

  function pickStart(cell) {
    if (lines.length > 0 || startCell !== null) return false;
    if (isCenter(cell)) return false;
    startCell = { row: cell.row, col: cell.col };
    return true;
  }

  function addLine(dir) {
    const anchor = currentAnchor();
    if (!anchor) return false;
    const cells = lineCells(anchor, dir, isPivot());
    if (!isValidLine(cells)) return false;
    lines.push({ cells, chars: cells.map((c) => grid[c.row][c.col]) });
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

  return {
    pickStart, addLine, undo, reset, isPivot,
    currentAnchor, lineCount, canExtract, linesNeeded, allLines, extractedLines,
  };
}
