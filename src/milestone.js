// src/milestone.js — when a committed-line count deserves the quatrain seal.
// Pure; no DOM. The seal marks the *transition* into a completed quatrain, not
// the state of being in one, so re-rendering a settled selection stays quiet.

// True only when the line count moves forward onto a new multiple of four.
// Deliberately false for: the initial render (0 -> 0), any ordinary move
// (3 -> 4 is the only celebrated step of the first quatrain), undo, and reset —
// including undo out of a completed quatrain and back (5 -> 4 must not fire).
// Re-committing a fourth line after an undo (3 -> 4) does fire again: the user
// completed the quatrain a second time, and the payoff belongs to the act.
export function isQuatrainMilestone(previousCount, nextCount) {
  return (
    Number.isInteger(previousCount) &&
    Number.isInteger(nextCount) &&
    nextCount > previousCount &&
    nextCount > 0 &&
    nextCount % 4 === 0
  );
}
