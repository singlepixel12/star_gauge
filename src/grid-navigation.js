// src/grid-navigation.js — keyboard navigation over the 29×29 cloth. No DOM.
//
// Deliberately separate from ./geometry.js. Geometry answers what makes a valid
// *poem line*: seven characters, eight directions, the pivot rule, the inert
// centre. This answers something much smaller — what one key press does to the
// reader's focus. Nothing here knows about directions, lines or the selection,
// because moving the focus ring commits nothing: the compass is still the only
// place a line is drawn.
import { SIZE, inGrid } from './geometry.js';

// Four arrows, orthogonal only. Diagonals are the *compass's* language (↖ ↗ ↘ ↙
// extend a line by seven characters); handing the same gesture to focus movement
// would teach the reader that the two controls mean the same thing.
const ARROW_STEPS = new Map([
  ['ArrowUp', { dr: -1, dc: 0 }],
  ['ArrowDown', { dr: 1, dc: 0 }],
  ['ArrowLeft', { dr: 0, dc: -1 }],
  ['ArrowRight', { dr: 0, dc: 1 }],
]);

// ' ' is the modern KeyboardEvent.key for the space bar; 'Spacebar' is the
// legacy value older Edge/IE still send. Both mean what Enter means here:
// choose the character the focus is on.
export const ACTIVATION_KEYS = Object.freeze(['Enter', ' ', 'Spacebar']);

// Where the grid's single tab stop sits before the reader has touched it: the
// first character of the cloth, and not the centre.
export const INITIAL_CELL = Object.freeze({ row: 0, col: 0 });

// Spoken through #progress when Enter or Space lands on the centre. The glyph
// is carried with its English gloss, exactly as the opening seal's aria-label
// does it: the announcement surface is English (PER-29), so a bare 心 would be
// voiced by an English synthesiser with nothing to explain it.
export const CENTER_NOTE =
  '心, the heart at the centre of the cloth, belongs to every reading and to none. '
  + 'It can be moved through but never chosen. Move to any other character to begin.';

const clamp = (index) => Math.min(SIZE - 1, Math.max(0, index));
const same = (a, b) => a.row === b.row && a.col === b.col;

function requireCell(cell) {
  const ok = cell !== null && typeof cell === 'object'
    && Number.isInteger(cell.row) && Number.isInteger(cell.col) && inGrid(cell);
  if (!ok) throw new RangeError(`not a cell of the ${SIZE}×${SIZE} grid: ${JSON.stringify(cell)}`);
  return { row: cell.row, col: cell.col };
}

export function isActivationKey(key) {
  return ACTIVATION_KEYS.includes(key);
}

/** The one-cell step an arrow key asks for, or null for every other key. */
export function arrowStep(key) {
  return ARROW_STEPS.get(key) ?? null;
}

/**
 * What a key press at `from` means, with no side effects.
 *
 * @returns {null
 *   | {type: 'activate', cell: {row: number, col: number}}
 *   | {type: 'move', from: object, to: object, moved: boolean}}
 *   null for every key the grid does not own — Tab above all, so the compass
 *   stays exactly one Tab away and the reader's Tab is never swallowed.
 *   A 'move' is still returned at the selvedge, with moved: false: the arrow
 *   *was* the grid's to handle (the page must not scroll out from under it),
 *   the focus simply stays where it is. Bounded, never wrapping — the far edge
 *   of the cloth is not next to the near one.
 */
export function keyAction(key, from) {
  const at = requireCell(from);
  if (isActivationKey(key)) return { type: 'activate', cell: at };
  const step = arrowStep(key);
  if (!step) return null;
  const to = { row: clamp(at.row + step.dr), col: clamp(at.col + step.dc) };
  return { type: 'move', from: at, to, moved: !same(at, to) };
}

/**
 * The roving tab stop: one coordinate, and the two cells whose tabindex has to
 * change whenever it moves. Holding it here rather than in the DOM is what
 * makes "exactly one grid cell is in the tab order" an invariant a test can
 * execute — app.js only ever applies the pair of flips this reports.
 *
 * The centre is a legitimate resting place: it is navigable, and only
 * *activation* refuses it (see CENTER_NOTE).
 */
export function createRovingFocus(initial = INITIAL_CELL) {
  let active = requireCell(initial);
  return {
    active: () => ({ ...active }),

    /** 0 for the single tab stop, -1 for the other 840 cells. */
    tabIndexFor: (cell) => (same(requireCell(cell), active) ? 0 : -1),

    /**
     * Move the tab stop to `cell` — what a click, or a keypress on a cell the
     * stop had drifted from, asks for.
     * @returns {{from: object, to: object}|null} the two cells to re-flag, or
     *   null when the stop is already there and no attribute need change.
     */
    focusOn(cell) {
      const to = requireCell(cell);
      if (same(active, to)) return null;
      const from = active;
      active = to;
      return { from, to };
    },

    /** keyAction() at the current stop, advancing the stop on a real move. */
    handleKey(key) {
      const action = keyAction(key, active);
      if (action?.type === 'move' && action.moved) active = action.to;
      return action;
    },
  };
}
