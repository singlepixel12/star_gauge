// src/controls.js — pure state logic for the controls bar. No DOM access:
// app.js reads the attribute off the button, asks here for the next state, and
// writes both the attribute and the body class from the one object it gets
// back. Keeping the transition here is what makes it executable in tests.

/** aria-pressed is the toggle's state, so only the literal "true" is on. */
export function isPressed(ariaPressedValue) {
  return ariaPressedValue === 'true';
}

/** The single place a boolean becomes the aria-pressed attribute string. */
export function pressedAttr(on) {
  return on ? 'true' : 'false';
}

/**
 * Next state for the Colour-regions toggle.
 * @param {string|null} currentAriaPressed value of aria-pressed before the click
 * @returns {{on: boolean, ariaPressed: string}} the same state twice over — the
 *   boolean for body.show-regions and the string for the attribute — so the two
 *   are derived together and cannot drift apart.
 */
export function nextRegionsState(currentAriaPressed) {
  const on = !isPressed(currentAriaPressed);
  return { on, ariaPressed: pressedAttr(on) };
}
