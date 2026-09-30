// test/completion-moment.test.js
// Guards PER-22's completion transition. The application is a dependency-free
// browser module, so these tests exercise the pure milestone predicate and the
// source/CSS contracts that keep the DOM behavior one-shot and non-obscuring.
//
// PER-51: app.js is shared by nearly every ticket, so the source assertions
// are scoped to what PER-22 (and PER-45's reverse reading) own, and say where a
// thing lives rather than how many times the whole file mentions it.
//
// WHAT THIS FILE CANNOT COVER — needs manual validation.
// There is no DOM, layout engine or animation clock here (no jsdom, no
// playwright — deliberately: vanilla site, no build step, no dependencies).
// These remain manual checks, served over HTTP:
//   * that the poem card really scrolls into view once, centred, after the
//     fourth strand has finished drawing — and not before, nor twice;
//   * that the warmed frame covers neither reading and shifts nothing, on a
//     phone as on a desktop;
//   * that a resize or orientation change mid-draw drops the pending reveal
//     rather than scrolling later, and that reduced motion reveals at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { appJs, functionBody, assertOwnedBy, clickHandler } from '../test-support/app-source.js';

import { isQuatrainMilestone } from '../src/milestone.js';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const milestoneJs = readFileSync(new URL('../src/milestone.js', import.meta.url), 'utf8');
const cssClean = css.replace(/\/\*[\s\S]*?\*\//g, '');

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cssClean.match(new RegExp(`${escaped}\\s*\\{([^{}]*)\\}`));
  assert.ok(match, `expected CSS rule ${selector}`);
  return match[1];
}

const renderBody = functionBody(appJs, 'render');
const startRevealBody = functionBody(appJs, 'startCompletionReveal');
const clearPendingBody = functionBody(appJs, 'clearPendingReveal');
const revealBody = functionBody(appJs, 'revealCompletedPoem');
const compassHandler = appJs.slice(
  appJs.indexOf("btn.addEventListener('click'"),
  appJs.indexOf("btn.addEventListener('mouseenter'"),
);


test('milestone predicate celebrates only forward quatrain boundaries', () => {
  for (const [previous, next] of [[3, 4], [7, 8], [11, 12]]) {
    assert.equal(isQuatrainMilestone(previous, next), true, `${previous} -> ${next}`);
  }
  for (const [previous, next] of [
    [0, 0], [0, 1], [1, 2], [3, 3], [4, 4], [4, 3], [5, 4], [4, 5], [7, 7],
  ]) {
    assert.equal(isQuatrainMilestone(previous, next), false, `${previous} -> ${next}`);
  }
});

test('milestone.js is the unchanged pure module restored for PER-22', () => {
  // The rejected implementation is the source of truth for this deliberately
  // preserved predicate. SHA-1 is Git's blob identity, so this catches edits to
  // comments/API as well as edits to the expression itself.
  const gitText = milestoneJs.replace(/\r\n/g, '\n');
  assert.equal(
    createHash('sha1')
      .update(`blob ${Buffer.byteLength(gitText)}\0${gitText}`)
      .digest('hex'),
    '7f53e16cf62ccccaec64e7a31f950167bdb3029c',
  );
  assert.match(milestoneJs, /export function isQuatrainMilestone\(previousCount, nextCount\)/);
});

test('only a successful compass commit requests the completion reveal', () => {
  assert.match(compassHandler, /const before = selection\.lineCount\(\);/);
  assert.match(compassHandler, /const added = selection\.addLine\(dir\);/);
  assert.match(
    compassHandler,
    /const revealCompletion = added && isQuatrainMilestone\(before, selection\.lineCount\(\)\);/,
    'the reveal requires both addLine success and a milestone transition',
  );
  assert.match(
    compassHandler,
    /render\(\{ animateNewest: added, revealCompletion \}\);/,
    'completion and newest-strand intents travel together from the commit path',
  );
  // A path restored from the address (PER-43) names animateNewest as well, but
  // only to turn it off. So every render call that asks for the strand draw
  // must live in the compass commit path — owned, not counted (PER-51).
  assertOwnedBy(/render\(\{(?![^}]*animateNewest:\s*false\b)[^}]*animateNewest[^}]*\}\)/, [compassHandler],
    'no other path requests the newest-strand animation');
  // The restored render is the one place completion is asked for outside a live
  // commit, and it decides from the path itself rather than from a milestone.
  assert.match(
    functionBody(appJs, 'renderRestoredPath'),
    /render\(\{ animateNewest: false, revealCompletion: selection\.canExtract\(\) \}\)/,
    'a restored quatrain controls its own reveal, without animating',
  );
});

test('completion is a separate render intent and owns the compass scroll suppression', () => {
  // Both intents are named and off by default; any other option a later ticket
  // gives render() is its own business (PER-51).
  assert.match(
    appJs,
    /function render\(\{(?=[^}]*\banimateNewest = false\b)(?=[^}]*\brevealCompletion = false\b)[^}]*\} = \{\}\)/,
  );
  assert.match(
    renderBody,
    /positionCompass\(anchor, \{ scroll: !revealCompletion \}\)/,
    'the completion render repositions the compass without scrolling it',
  );
  assert.match(renderBody, /drawThread\(\{ animateNewest \}\)/);
  assert.match(renderBody, /if \(revealCompletion\) startCompletionReveal\(\);/);
  assert.match(renderBody, /else endCompletionMoment\(\);/);
  assert.doesNotMatch(renderBody, /scrollIntoView/, 'ordinary render never owns the poem scroll');
});

test('normal completion waits for the newest strand, with a fallback and cancellation', () => {
  assert.match(startRevealBody, /threadEl\.querySelector\('\.strand-drawing'\)/);
  assert.match(startRevealBody, /strand\.addEventListener\('animationend', onStrandDrawn, \{ once: true \}\)/);
  assert.match(startRevealBody, /revealTimer = setTimeout\(onStrandDrawn, REVEAL_FALLBACK_MS\)/);
  assert.match(appJs, /const REVEAL_FALLBACK_MS = 1600/);
  assert.match(clearPendingBody, /clearTimeout\(revealTimer\)/);
  assert.match(clearPendingBody, /removeEventListener\('animationend', onStrandDrawn\)/);
  assert.match(revealBody, /if \(generation !== revealGeneration\) return/);
  assert.match(revealBody, /clearPendingReveal\(\)/);
});

test('the poem scroll is one-shot, centered, and motion-aware', () => {
  assertOwnedBy(/poemCardEl\.scrollIntoView/, [revealBody], 'the poem scroll belongs to the reveal alone');
  assert.equal((revealBody.match(/poemCardEl\.scrollIntoView/g) ?? []).length, 1, 'and happens once there');
  assert.match(
    revealBody,
    /poemCardEl\.scrollIntoView\(\{ block: 'center', behavior: REDUCED_MOTION \? 'auto' : 'smooth' \}\)/,
  );
  assert.match(startRevealBody, /if \(REDUCED_MOTION\) return revealCompletedPoem\(generation\);/);
  assert.match(appJs, /const poemCardEl = poemZhEl\.closest\('\.poem-chinese'\);/);
  assert.match(appJs, /poemCardEl\.classList\.add\('is-complete'\)/);
  assert.match(appJs, /poemCardEl\.classList\.remove\('is-complete'\)/);
});

test('non-completion rerenders and resize cancel pending completion work', () => {
  assert.match(renderBody, /if \(revealCompletion\) startCompletionReveal\(\);\s*else endCompletionMoment\(\);/s);
  const observer = appJs.match(/new ResizeObserver\(\(\) => \{[\s\S]*?\}\)\.observe\(gridEl\)/)?.[0];
  assert.ok(observer, 'the grid resize observer remains present');
  assert.match(observer, /clearPendingReveal\(\);/, 'resize drops a listener/timer for the replaced strand');
  assert.match(observer, /drawThread\(\);/);
  assert.match(observer, /positionCompass\(anchor, \{ scroll: false \}\)/);
  // Each handler is read whole (PER-51): what it does before its render is not
  // this file's concern, only that it ends in a plain, non-completing render.
  for (const [name, call] of [['undoBtn', 'undo'], ['resetBtn', 'reset']]) {
    const handler = clickHandler(name);
    assert.match(handler, new RegExp(String.raw`selection\.${call}\(\);\s*render\(\);`),
      `${call} re-renders the thread in its final state, ending any pending completion`);
    assert.doesNotMatch(handler, /revealCompletion|animateNewest/, `${call} never asks for the reveal`);
  }
  // PER-49: the first Reset press on a longer trace only asks, so a pending
  // completion is left alone; the confirmed reset's render() is what ends it.
  const resetHandler = clickHandler('resetBtn');
  const askAt = resetHandler.indexOf("=== 'confirm'");
  assert.ok(askAt > -1, 'Reset asks before clearing a longer trace');
  const confirmBranch = resetHandler.slice(askAt, resetHandler.indexOf('}', askAt));
  assert.doesNotMatch(confirmBranch, /render\(|endCompletionMoment|clearPendingReveal/);
  assert.doesNotMatch(functionBody(appJs, 'askResetConfirmation'), /REDUCED_MOTION|setTimeout|animat/,
    'the question adds no motion of its own');
});

test('live output remains available from line one', () => {
  assert.match(renderBody, /outputEl\.hidden = n === 0;/);
  const outputAt = renderBody.indexOf('outputEl.hidden = n === 0;');
  // PER-45 reads the trace into a local first and writes both readings from it;
  // the forward <pre> is still what the completion moment scrolls to.
  const poemAt = renderBody.indexOf("poemZhEl.textContent = extractedLines.join('\\n');");
  const reverseAt = renderBody.indexOf("poemReverseEl.textContent = reverseReading(extractedLines).join('\\n');");
  const completionBranchAt = renderBody.indexOf('if (selection.canExtract())');
  assert.ok(outputAt > -1 && poemAt > outputAt, 'render keeps the live poem after revealing output');
  assert.ok(reverseAt > poemAt, 'the reverse reading is written alongside it, forward first');
  assert.ok(reverseAt < completionBranchAt, 'both readings are populated before completion-only prompt state');
  assert.ok(poemAt < completionBranchAt, 'poem text is populated before completion-only prompt state');
  assert.doesNotMatch(renderBody.slice(0, poemAt), /if \(selection\.canExtract\(\)\)/);
});

test('the reverse reading rides inside the one completion card and adds no second moment', () => {
  // The forward <pre> still names the completion target, and the reverse <pre>
  // lives in the same .poem-chinese card — so PER-22's single scroll lands on
  // content that is already whole in both directions.
  assert.match(appJs, /const poemCardEl = poemZhEl\.closest\('\.poem-chinese'\);/);
  const card = html.match(/<div class="card poem-chinese">[\s\S]*?<\/div>\s*<div class="card prompt-block">/);
  assert.ok(card, 'the poem card is still followed by the prompt card');
  assert.match(card[0], /id="poem-zh"/, 'the forward reading is in the completion card');
  assert.match(card[0], /id="poem-zh-reverse"/, 'and so is the reverse reading');

  // Nothing new moves, times out, covers or celebrates.
  // Scoped to the paths the completion moment owns (PER-51), rather than a
  // count of every scroll in the shared file: the render that writes both
  // readings and the reveal that follows it add no scroll beyond the poem's one.
  for (const [name, body] of [['render', renderBody], ['startCompletionReveal', startRevealBody],
    ['clearPendingReveal', clearPendingBody], ['endCompletionMoment', functionBody(appJs, 'endCompletionMoment')]]) {
    assert.doesNotMatch(body, /scrollIntoView/, `${name} scrolls nothing`);
  }
  assert.equal((revealBody.match(/\.scrollIntoView\(/g) ?? []).length, 1, 'the reveal scrolls the poem card and nothing else');
  assertOwnedBy(/classList\.add\('is-complete'\)/, [revealBody], 'only the reveal warms the card');
  assert.doesNotMatch(appJs, /poemReverseEl\.(?:scrollIntoView|classList)/);
  // The reverse <pre> is only ever written to, synchronously, in render(): it
  // is never handed to a timer or a listener of its own. Matched per statement,
  // so the timers PER-22 already owns further down the file cannot trip this.
  for (const statement of appJs.match(/^.*\bpoemReverseEl\b.*$/gm) ?? []) {
    assert.doesNotMatch(statement, /setTimeout|setInterval|addEventListener|requestAnimationFrame/, statement);
  }
  for (const selector of ['.poem-readings', '.reading', '.reading-label']) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rules = cssClean.match(new RegExp(`${escaped}[^{}]*\\{[^{}]*\\}`, 'g')) ?? [];
    assert.ok(rules.length > 0, `expected rules for ${selector}`);
    for (const body of rules) {
      assert.doesNotMatch(body, /animation|position\s*:\s*(?:fixed|absolute)/, `${selector} stays static`);
    }
  }
  assert.doesNotMatch(cssClean, /\.poem-readings::(?:before|after)|\.reading::(?:before|after)/);
});

test('.poem-chinese.is-complete still covers neither reading', () => {
  // Frame only: border-color and box-shadow cost no layout, so nothing shifts
  // or is obscured when the card warms — with two readings in it as with one.
  const declared = cssRule('.poem-chinese.is-complete')
    .split(';')
    .map((d) => d.split(':')[0].trim())
    .filter(Boolean);
  assert.deepEqual(declared, ['border-color', 'box-shadow']);
});

test('reduced motion removes card motion and the completion has no covering element', () => {
  const reduced = cssClean.slice(cssClean.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(
    reduced,
    /\.poem-chinese, \.poem-chinese\.is-complete\s*\{[^}]*transition:\s*none;[^}]*animation:\s*none;[^}]*transform:\s*none;/,
  );
  const completionRule = cssRule('.poem-chinese.is-complete');
  assert.doesNotMatch(completionRule, /position\s*:\s*(?:fixed|absolute)/);
  assert.doesNotMatch(cssClean, /\.poem-chinese\.is-complete::(?:before|after)/);
  assert.doesNotMatch(html, /completion-moment|id="completion|class="[^"]*completion/);
});

test('completion preserves the existing responsive output and sticky controls', () => {
  const controls = cssRule('.controls');
  assert.match(controls, /position:\s*sticky/);
  assert.match(controls, /top:\s*\.4rem/);
  assert.match(controls, /z-index:\s*20/);
  assert.match(cssClean, /@media \(max-width: 600px\)[\s\S]*\.controls\s*\{[^}]*grid-template-columns/);
  assert.match(cssClean, /@media \(max-width: 600px\)[\s\S]*\.opening\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(cssClean, /\.poem-chinese\s*\{[^}]*grid-column:\s*1 \/ -1/);
  assert.doesNotMatch(cssClean, /#completion-moment|\.completion-overlay/);
});
