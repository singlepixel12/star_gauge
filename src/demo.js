// src/demo.js — the "Show me one" walkthrough path. Pure; no DOM.
//
// NOT a documented historical reading. No curated reading is recorded in this
// project's sources — the plan file carries the grid rows, not a poem — and
// presenting an arbitrary trace as a known reading would be a claim about a
// real cultural artifact that we cannot support. So this is an illustrative
// path and the page says so in as many words, the way the colour regions say
// "(stylized)".
//
// It is chosen for what it demonstrates: four lines that turn at every
// junction and close a ring around the middle of the cloth, so a first visitor
// sees a pivot, a whole quatrain, and the inert 心 left untouched inside the
// loop. The characters are whatever the grid holds along it.
export const DEMO_PATH = Object.freeze({
  start: Object.freeze({ row: 10, col: 10 }),
  directions: Object.freeze(['e', 's', 'w', 'n']),
});

// A committed strand draws over 1.2s (PER-23), so the steps are spaced wider
// than that: each line finishes being drawn before the next one begins, and
// the fourth lands on the quatrain reveal with nothing queued behind it. The
// first gap is shorter — nothing is being drawn yet, only the start knot
// waiting for a direction.
export const DEMO_FIRST_STEP_MS = 900;
export const DEMO_STEP_MS = 1400;

// The walkthrough as data: the same two moves a visitor makes, in order, so
// the app can play it by pressing its own controls rather than by driving the
// selection or the renderer behind their back.
export function demoSteps(path = DEMO_PATH) {
  return [
    { kind: 'start', row: path.start.row, col: path.start.col },
    ...path.directions.map((id) => ({ kind: 'direction', id })),
  ];
}

// How long to wait before playing the step at `index`. The first step opens
// immediately: a walkthrough that starts by doing nothing reads as broken.
export function demoStepDelay(index) {
  if (index <= 0) return 0;
  return index === 1 ? DEMO_FIRST_STEP_MS : DEMO_STEP_MS;
}
