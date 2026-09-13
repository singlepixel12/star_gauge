// src/silk.js — where a cell sits on the cloth. Pure, no DOM.
//
// PER-27's silk sheen is ONE broad gradient spanning the whole 29×29 bolt, not a
// pattern repeated inside each cell. Every cell paints that same non-repeating
// gradient scaled to the complete grid extent — 29 cell boxes plus the 28 one-pixel
// gutters between them — and slides its own slice into view with a
// background-position percentage, so the highlight bands run unbroken from cell
// to cell and across the gaps.
//
// The grid's gap is part of the mural geometry. If `p = index / 28`, then CSS
// background-position resolves as
//   offset = (cell − (29·cell + 28·gap)) × p
//          = −index × (cell + gap)
// so the image advances by the actual distance between adjacent cell origins at
// both --cell: 36px and --cell: 30px. There is no pixel-scale period to alias and
// nothing for the browser to resample per cell size.
import { SIZE } from './geometry.js';

export const GRID_GAP_PX = 1;

// Kept in step with --sheen-span in styles.css (test/grid-surface-contract.test.js
// asserts the two agree): 29 cells plus the 28 one-pixel gutters between them.
export const SHEEN_SPAN = `calc(${SIZE * 100}% + ${(SIZE - 1) * GRID_GAP_PX}px)`;

// 0 → '0%', 14 → '50%', 28 → '100%'. Normalised over the 28 intervals between
// cell centres-of-slice, so the ends of the cloth are the ends of the gradient.
export function silkCoord(index) {
  if (!Number.isInteger(index) || index < 0 || index >= SIZE) {
    throw new RangeError(`silkCoord: index must be an integer in 0..${SIZE - 1}, got ${index}`);
  }
  // Trimmed to 4 decimals: enough that the slice lands within a small fraction of
  // a pixel at the far edge, short enough to keep the inline style readable.
  return `${Number(((index * 100) / (SIZE - 1)).toFixed(4))}%`;
}

// The two custom properties a cell needs, as property -> value.
export function silkVars(row, col) {
  return { '--silk-x': silkCoord(col), '--silk-y': silkCoord(row) };
}
