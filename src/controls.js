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

// --- Reset safeguard (PER-49) ---------------------------------------------

/** The Reset button's resting label, restored on every cancel and after reset. */
export const RESET_LABEL = 'Reset';
/** What the same button says while it is waiting for the second press. */
export const RESET_CONFIRM_LABEL = 'Reset again';
/** Said once through #progress when Reset asks, never through a dialog. */
export const RESET_CONFIRM_MESSAGE = 'Press Reset again to clear this trace. Press Escape to keep it.';

/**
 * A start alone, or a single line, is quicker to retrace than to confirm, so
 * only a trace of two or more committed lines is worth asking about.
 */
export function resetNeedsConfirmation(lineCount) {
  return lineCount >= 2;
}

/**
 * What one Reset activation does.
 * @param {{pending: boolean, lineCount: number}} state whether Reset is already
 *   waiting for its second press, and how many lines are committed
 * @returns {'reset'|'confirm'} clear the trace now, or ask first
 */
export function nextResetStep({ pending, lineCount }) {
  return pending || !resetNeedsConfirmation(lineCount) ? 'reset' : 'confirm';
}
