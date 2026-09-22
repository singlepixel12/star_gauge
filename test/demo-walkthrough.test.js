// test/demo-walkthrough.test.js
// Guards PER-46's "Show me one" walkthrough: a first visitor can watch a whole
// quatrain emerge without knowing how, and can take the cloth over at any point
// with one action.
//
// What is *executed* here: the path itself, played through src/selection.js
// exactly as the app plays it, so "four valid lines that never touch 心" is
// proved rather than asserted about.
//
// What is *parsed* here: src/app.js, index.html and styles.css, because this
// repo has no DOM implementation (no jsdom, no playwright — vanilla site, no
// build step). These remain manual checks: that the steps really are paced
// apart on screen, that the strand draw and the quatrain reveal read as one
// sequence, and that a real tap mid-walkthrough lands as the visitor's start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GRID } from '../src/grid-data.js';
import { DIRECTIONS, LINE_LENGTH, isCenter, inGrid } from '../src/geometry.js';
import { createSelection } from '../src/selection.js';
import { isQuatrainMilestone } from '../src/milestone.js';
import {
  DEMO_PATH, DEMO_FIRST_STEP_MS, DEMO_STEP_MS, demoSteps, demoStepDelay,
} from '../src/demo.js';

const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const demoJs = readFileSync(new URL('../src/demo.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const cssClean = css.replace(/\/\*[\s\S]*?\*\//g, '');

// Body of a top-level function declaration, through the next top-level
// function — the same source-contract technique the sibling suites use.
function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start > -1, `expected a function ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(?:async )?function /);
  return next === -1 ? rest : rest.slice(0, next);
}

// --- the path, played ----------------------------------------------------

test('the steps are the visitor’s own two moves: one start, then directions', () => {
  const steps = demoSteps();
  assert.equal(steps.length, 1 + DEMO_PATH.directions.length);
  assert.deepEqual(steps[0], { kind: 'start', row: DEMO_PATH.start.row, col: DEMO_PATH.start.col });
  for (const step of steps.slice(1)) {
    assert.equal(step.kind, 'direction');
    assert.ok(DIRECTIONS.some((d) => d.id === step.id), `${step.id} is a real compass direction`);
  }
  assert.equal(steps.filter((s) => s.kind === 'direction').length, 4, 'four lines — a whole quatrain');
});

test('played through the real selection, the walkthrough yields one full quatrain', () => {
  const selection = createSelection(GRID);
  const dir = (id) => DIRECTIONS.find((d) => d.id === id);
  let before = 0;
  let milestones = 0;
  for (const step of demoSteps()) {
    if (step.kind === 'start') {
      assert.equal(selection.pickStart({ row: step.row, col: step.col }), true, 'the start is legal');
      continue;
    }
    before = selection.lineCount();
    assert.equal(selection.addLine(dir(step.id)), true, `line ${step.id} commits`);
    if (isQuatrainMilestone(before, selection.lineCount())) milestones++;
  }
  assert.equal(selection.lineCount(), 4);
  assert.equal(selection.canExtract(), true, 'the walkthrough ends on a copyable poem');
  assert.equal(milestones, 1, 'exactly one completion moment, on the last step');

  const lines = selection.extractedLines();
  assert.equal(lines.length, 4);
  for (const line of lines) {
    assert.equal([...line].length, LINE_LENGTH, '7 characters, counted as codepoints');
    assert.doesNotMatch(line, /\s/, 'no whitespace crept into the traced text');
  }
});

test('the demonstrated path stays on the cloth and never touches the inert 心', () => {
  const selection = createSelection(GRID);
  const dir = (id) => DIRECTIONS.find((d) => d.id === id);
  const steps = demoSteps();
  selection.pickStart({ row: steps[0].row, col: steps[0].col });
  for (const step of steps.slice(1)) selection.addLine(dir(step.id));

  const cells = selection.allLines().flatMap((l) => l.cells);
  assert.equal(cells.length, 28, 'four lines of seven');
  for (const cell of cells) {
    assert.equal(inGrid(cell), true);
    assert.equal(isCenter(cell), false, '心 lends meaning to the whole and belongs to no line');
  }
  // The pivot rule: no character is repeated across a line boundary.
  assert.equal(new Set(cells.map((c) => `${c.row},${c.col}`)).size, 28, 'no cell traced twice');
  // And the loop closes around the middle of the cloth, so the ring the
  // visitor watches being drawn encircles the heart it never crosses.
  const rows = cells.map((c) => c.row);
  const cols = cells.map((c) => c.col);
  assert.ok(Math.min(...rows) < 14 && Math.max(...rows) > 14, 'the ring spans the centre row');
  assert.ok(Math.min(...cols) < 14 && Math.max(...cols) > 14, 'the ring spans the centre column');
});

test('pacing leaves each strand time to be drawn before the next step', () => {
  assert.equal(demoStepDelay(0), 0, 'the first step opens immediately');
  assert.equal(demoStepDelay(1), DEMO_FIRST_STEP_MS);
  for (const index of [2, 3, 4]) assert.equal(demoStepDelay(index), DEMO_STEP_MS);
  // PER-23 draws the newest strand over 1.2s; a step landing inside that would
  // stack two draws on top of each other.
  assert.ok(DEMO_STEP_MS > 1200, 'a line finishes drawing before the next begins');
  assert.match(css, /\.thread \.strand-drawing[^}]*1\.2s/, 'sanity: the 1.2s strand draw is still what we pace against');
  const total = demoSteps().reduce((ms, _step, index) => ms + demoStepDelay(index), 0);
  assert.ok(total < 30000, 'a real poem emerges well inside the first 30 seconds');
});

// --- honesty about what this is -----------------------------------------

test('the path is presented as a demonstration, never as a documented reading', () => {
  assert.match(demoJs, /NOT a documented historical reading/,
    'the module says plainly what it is not');
  const invite = html.match(/<p class="demo-invite">[\s\S]*?<\/p>/);
  assert.ok(invite, 'the invitation is in the markup');
  assert.match(invite[0], /demonstration path/i, 'the visitor is told it is a demonstration');
  assert.match(invite[0], /not a documented historical reading/i, 'and told what it is not');
  // These read the copy a visitor is actually shown. A source comment is not a
  // claim made to anyone — it is where the reasoning for the caveat lives — so
  // comments come out first, and the caveat itself comes out after, so it
  // cannot match the very claims it disavows.
  const copy = invite[0]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/not a documented historical reading/i, '');
  for (const claim of [/\bhistorical reading\b(?!\s*[—-])/, /documented reading of/, /Su Hui'?s own/]) {
    assert.doesNotMatch(copy, claim, 'no scholarly claim is made for the path');
  }
});

// --- driven through the page's own controls ------------------------------

test('the walkthrough presses the real controls rather than adding a render path', () => {
  assert.match(appJs, /import \{ demoSteps, demoStepDelay \} from '\.\/demo\.js';/);
  const play = functionBody(appJs, 'playDemoStep');
  assert.match(play, /cellEls\[step\.row\]\[step\.col\]\.click\(\)/, 'a start is a tap on the cell');
  assert.match(play, /compassBtns\.get\(step\.id\)\.click\(\)/, 'a line is a press on the compass');
  assert.doesNotMatch(play, /selection\.|render\(/, 'it never reaches past the controls');
  // The one animating call site still belongs to the compass handler: the
  // walkthrough inherits the strand draw and the quatrain reveal instead of
  // asking for its own.
  assert.equal((appJs.match(/render\(\{[^}]*animateNewest[^}]*\}\)/g) ?? []).length, 1);
  assert.doesNotMatch(functionBody(appJs, 'startDemo'), /animateNewest|revealCompletion/);
});

test('trusted interaction stops the walkthrough without letting synthetic steps stop themselves', () => {
  const interrupt = functionBody(appJs, 'onVisitorAction');
  assert.match(interrupt, /!event\.isTrusted/, 'synthetic demo clicks cannot interrupt it');
  assert.match(interrupt, /demoBtn\.contains\(event\.target\)/, 'the skip button owns its deliberate stop');
  assert.match(interrupt, /compassEl\.contains\(event\.target\)/, 'a compass click can continue from the visible partial path');
  assert.match(interrupt, /cancelDemo\(\{ clearSelection \}\)/);
  assert.match(interrupt, /render\(\);/);
  assert.match(functionBody(appJs, 'cancelDemo'), /endDemo\(\);/);
  assert.match(functionBody(appJs, 'endDemo'), /clearTimeout\(demoTimer\)/);
  assert.match(functionBody(appJs, 'endDemo'), /demoActive = false/);
  assert.match(functionBody(appJs, 'endDemo'), /demoGeneration\+\+/);
  assert.match(appJs, /document\.addEventListener\('click', onVisitorAction, true\)/,
    'click activation covers mouse, keyboard, screen-reader and voice-control input');
});

test('first-visit startup is guarded, persisted and outside render', () => {
  assert.match(appJs, /const DEMO_STORAGE_KEY = 'star-gauge:demonstration-seen';/);
  assert.match(appJs, /let demoStartupAttempted = false;/);
  const startup = functionBody(appJs, 'maybeStartDemo');
  assert.match(startup, /demoStartupAttempted/);
  assert.match(startup, /hasSeenDemo\(\)/);
  assert.match(startup, /window\.location\.hash/);
  assert.match(startup, /markDemoSeen\(\);\s*startDemo\(\{ automatic: true \}\)/s);
  assert.match(functionBody(appJs, 'hasSeenDemo'), /try \{[\s\S]*localStorage\.getItem/);
  assert.match(functionBody(appJs, 'markDemoSeen'), /try \{[\s\S]*localStorage\.setItem/);
  assert.match(appJs, /buildCompass\(\);\s*\r?\nrender\(\);\s*\r?\nmaybeStartDemo\(\);/);
  assert.doesNotMatch(functionBody(appJs, 'render'), /maybeStartDemo/);
  assert.doesNotMatch(appJs.slice(appJs.indexOf('new ResizeObserver')), /startDemo/);
});

test('Undo and Reset explicitly invalidate pending walkthrough work', () => {
  assert.match(
    appJs,
    /undoBtn\.addEventListener\('click', \(\) => \{[\s\S]*?if \(demoRunning\(\)\) cancelDemo\(\{ clearSelection: true \}\);[\s\S]*?selection\.undo\(\);\s*render\(\);\s*\}\);/,
  );
  assert.match(
    appJs,
    /resetBtn\.addEventListener\('click', \(\) => \{[\s\S]*?cancelDemo\(\{ clearSelection: true \}\);[\s\S]*?selection\.reset\(\);\s*render\(\);\s*\}\);/,
  );
  assert.match(functionBody(appJs, 'startDemo'), /demoActive && generation === demoGeneration/,
    'scheduled callbacks are generation-guarded');
  assert.doesNotMatch(appJs, /setInterval/);
});

test('reduced motion reaches the end state synchronously', () => {
  const start = functionBody(appJs, 'startDemo');
  assert.match(start, /if \(REDUCED_MOTION\) return play\(next\);/,
    'remaining steps run without waiting');
  const timerAt = start.indexOf('setTimeout');
  const reducedAt = start.indexOf('if (REDUCED_MOTION)');
  assert.ok(reducedAt > -1 && reducedAt < timerAt, 'no step is scheduled before the reduced-motion branch');
  assert.match(start, /demoActive = true/);
  assert.match(cssClean, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.demo-button[^{]*\{[^}]*transition:\s*none/,
    'the button itself also stops transitioning');
});

// --- where it sits on the page ------------------------------------------

test('the invitation is part of the introduction, not a fourth control', () => {
  const controls = html.match(/<section class="controls"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(controls, /id="demo"/, 'the sticky bar still places exactly its own four items');
  const invite = html.indexOf('class="demo-invite"');
  assert.ok(html.indexOf('class="tagline"') < invite, 'it follows the instruction it illustrates');
  assert.ok(invite < html.indexOf('<details class="about">'), 'and precedes the fuller context');
  assert.ok(invite < html.indexOf('class="controls"'), 'the whole hero still reads before the controls');
  const button = html.match(/<button id="demo"[\s\S]*?<\/button>/)[0];
  assert.match(button, /type="button"/, 'it never submits');
  assert.match(button, /aria-describedby="demo-note"/, 'the caveat is part of its announced description');
  assert.doesNotMatch(button, /\bdisabled\b/, 'the walkthrough is available from the first paint');
});

test('the invitation keeps the hero quiet and meets the touch-target floor', () => {
  // The traced golds are reserved for the thread itself (PER-12), so the hero's
  // one new control borrows the outline colours, not --gold-soft/--gold-glow.
  const hero = cssClean.slice(cssClean.indexOf('.opening {'), cssClean.indexOf('.controls {'));
  assert.ok(hero.includes('.demo-button'), 'the button is styled with the rest of the opening');
  assert.doesNotMatch(hero, /--gold-soft|--gold-glow/);
  assert.match(cssClean, /@media \(pointer: coarse\)[\s\S]*\.demo-button[^{]*\{[^}]*min-height:\s*44px/,
    'coarse pointers get the same 44px floor the controls keep');
  assert.match(cssClean, /\.demo-button:focus-visible\s*\{[^}]*outline:/, 'keyboard focus is visible');
  assert.match(cssClean, /\.demo-invite\s*\{[^}]*flex-wrap:\s*wrap/, 'the caveat wraps under the button on a phone');
});
