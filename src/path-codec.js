// src/path-codec.js — the traced path as a fragment of text, and back again.
// Pure: no browser globals are touched here, only strings and a selection.
//
// Grammar, strict ASCII, versioned so a later reading rule can add "v2" without
// ever mis-reading a v1 link:
//
//   #v1;<row>,<col>            a picked start with no lines yet
//   #v1;<row>,<col>;<id>,<id>  …and the turns taken, in order
//
// Nothing is trimmed, lower-cased or guessed at. A fragment either says exactly
// one path in exactly this form, or it says nothing and the reader starts on an
// empty cloth — a half-read path would be a poem the author never traced.
import { directionById, SIZE } from './geometry.js';
import { createSelection } from './selection.js';

export const PATH_VERSION = 'v1';

// A whole decimal number with no sign, no padding, no spaces: "7", never "+7",
// "07" or " 7". Coordinates are bounded by the grid, checked by pickStart.
const NUMBER = /^(?:0|[1-9][0-9]*)$/;

// A grid of the right shape holding nothing at all. encodePath replays a
// candidate fragment through the very state machine the compass drives, and
// that machine reads the cloth only to keep the text of each line — which an
// encode has no use for and must never store. A blank cloth of the same 29×29
// shape therefore answers every geometric question identically, while leaving
// the codec with no way to learn a single glyph of the poem.
const NEUTRAL_GRID = Array.from({ length: SIZE }, () => new Array(SIZE).fill(''));

/**
 * The fragment for a selection's path() snapshot, '#...' or '' when nothing has
 * been traced. The empty string is what clears the fragment from the address.
 *
 * Encoding is deliberately no more permissive than decoding: a snapshot is
 * written out only once the fragment it would produce has been replayed
 * successfully against a blank cloth. So a start off the grid or on the inert
 * centre, and a sequence of turns that runs off the edge or over the centre
 * partway through, all encode as '' rather than as an address that would read
 * back as an empty cloth. Whatever this writes, decodePath restores exactly.
 */
export function encodePath(path) {
  const start = path?.start;
  if (!start || !Number.isInteger(start.row) || !Number.isInteger(start.col)) return '';
  const directions = path.directions ?? [];
  if (!Array.isArray(directions)) return '';
  // A direction with no canonical id could not be replayed, so a path carrying
  // one is not written out at all rather than written out wrong. Canonical ids
  // are also the only tokens that cannot disturb the ',' and ';' separators.
  if (!directions.every((id) => directionById(id))) return '';
  // Coordinates are written in the one form the grammar admits, or not at all.
  const row = String(start.row);
  const col = String(start.col);
  if (!NUMBER.test(row) || !NUMBER.test(col)) return '';

  const head = `#${PATH_VERSION};${row},${col}`;
  const fragment = directions.length === 0 ? head : `${head};${directions.join(',')}`;
  // The one question that matters: can this be walked back? If the blank cloth
  // refuses it anywhere, the real one would too, and nothing is written.
  return replay(fragment, NEUTRAL_GRID) ? fragment : '';
}

/**
 * The selection a fragment describes, replayed move by move through the same
 * state machine the compass drives: pickStart once, then addLine per id. Every
 * rule — bounds, the inert centre, the pivot offset — is therefore enforced by
 * the code that enforces it for a live trace, and no cell is ever built here.
 *
 * Always returns a selection. Anything malformed, out of bounds, off the grid,
 * on the centre, or refused partway through yields a *fresh* empty one, so a
 * valid prefix of a broken fragment is discarded whole.
 */
export function decodePath(fragment, grid) {
  const replayed = replay(fragment, grid);
  return replayed ?? createSelection(grid);
}

function replay(fragment, grid) {
  if (typeof fragment !== 'string') return null;
  if (fragment === '' || fragment === '#') return null; // nothing traced
  if (!fragment.startsWith('#')) return null;

  const parts = fragment.slice(1).split(';');
  if (parts.length < 2 || parts.length > 3) return null;
  if (parts[0] !== PATH_VERSION) return null;

  const coords = parts[1].split(',');
  if (coords.length !== 2 || !coords.every((n) => NUMBER.test(n))) return null;

  const selection = createSelection(grid);
  if (!selection.pickStart({ row: Number(coords[0]), col: Number(coords[1]) })) return null;

  if (parts.length === 2) return selection; // a start, no lines yet

  const ids = parts[2].split(',');
  for (const id of ids) {
    const direction = directionById(id);
    if (!direction) return null;
    if (!selection.addLine(direction)) return null;
  }
  return selection;
}
