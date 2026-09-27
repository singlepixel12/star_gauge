// src/readings.js — derived readings of an already-traced path. Pure, no DOM.
//
// The cloth is reversible: every thread through it reads backwards as well as
// forwards. That is a *reading* of one trace, not a second trace — so this is a
// presentation transform over selection.extractedLines() and nothing more. It
// never touches geometry, the grid, rhyme or the selection's own state, and the
// result must never be fed back to addLine() or pathToThreadGeometry(): the
// seven-character groups it produces are not segments, and their pivots are not
// where the reverse groups' boundaries fall.
export function reverseReading(lines) {
  // Reading the whole trace from its endpoint back to its start: the last line
  // first, and each line's characters in reverse. Code points, not UTF-16 code
  // units — Array.from() iterates by code point, so a character outside the BMP
  // (the CJK extensions the grid could draw on) cannot be split into surrogates.
  return Array.from(lines, (line) => Array.from(line).reverse().join('')).reverse();
}
