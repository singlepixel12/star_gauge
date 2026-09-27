// test/completion-moment.test.js
// Guards PER-22's completion transition. The application is a dependency-free
// browser module, so these tests exercise the pure milestone predicate and the
// source/CSS contracts that keep the DOM behavior one-shot and non-obscuring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { isQuatrainMilestone } from '../src/milestone.js';

const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const milestoneJs = readFileSync(new URL('../src/milestone.js', import.meta.url), 'utf8');
const cssClean = css.replace(/\/\*[\s\S]*?\*\//g, '');

// Body of a top-level function declaration, through the next top-level
// function. This is the same intentionally small source-contract technique
// used by thread-animation.test.js.
function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start > -1, `expected a function ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(?:async )?function /);
  return next === -1 ? rest : rest.slice(0, next);
}

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
  assert.equal(
    (appJs.match(/render\(\{[^}]*animateNewest[^}]*\}\)/g) ?? []).length,
    1,
    'no other path requests the newest-strand animation',
  );
});

test('completion is a separate render intent and owns the compass scroll suppression', () => {
  assert.match(
    appJs,
    /function render\(\{\s*animateNewest = false,\s*revealCompletion = false\s*\} = \{\}\)/,
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
  assert.equal((appJs.match(/poemCardEl\.scrollIntoView/g) ?? []).length, 1);
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
  assert.match(appJs, /undoBtn\.addEventListener\('click', \(\) => \{ selection\.undo\(\); render\(\); \}\)/);
  assert.match(appJs, /resetBtn\.addEventListener\('click', \(\) => \{ selection\.reset\(\); render\(\); \}\)/);
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
  assert.equal((appJs.match(/\.scrollIntoView\(/g) ?? []).length, 2, 'only the compass and the poem scroll');
  assert.equal((appJs.match(/classList\.add\('is-complete'\)/g) ?? []).length, 1);
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
