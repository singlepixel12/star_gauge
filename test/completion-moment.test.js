// test/completion-moment.test.js
// PER-22: completing a quatrain has to land as a deliberate moment. The seal is
// decorative and non-blocking by construction, so these guard both the pure
// milestone predicate and the structural promises that keep it out of the way:
// no scrolling owner, no pointer capture, no layout impact, live output intact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isQuatrainMilestone } from '../src/milestone.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

// The body of a CSS rule, sliced out so assertions cannot accidentally match a
// declaration belonging to some other selector.
function ruleBody(source, selector) {
  const m = source.match(new RegExp(`\\n${selector}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `expected a "${selector}" rule`);
  return m[1];
}

// The seal helpers, isolated from the rest of app.js.
function sealSource() {
  const start = appJs.indexOf('function showSeal');
  const end = appJs.indexOf('function render()');
  assert.ok(start > -1 && end > start, 'the seal helpers precede render()');
  return appJs.slice(start, end);
}

test('milestone: only a forward step onto a multiple of four celebrates', () => {
  assert.equal(isQuatrainMilestone(3, 4), true, 'the fourth line is the payoff');
  assert.equal(isQuatrainMilestone(7, 8), true, 'and again at eight');
  assert.equal(isQuatrainMilestone(11, 12), true, 'and at twelve');
});

test('milestone: ordinary moves do not celebrate', () => {
  for (const [prev, next] of [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [8, 9]]) {
    assert.equal(isQuatrainMilestone(prev, next), false, `${prev} -> ${next} is not a milestone`);
  }
});

test('milestone: the initial render is silent', () => {
  assert.equal(isQuatrainMilestone(0, 0), false, 'first paint with nothing traced');
  assert.equal(isQuatrainMilestone(4, 4), false, 'a re-render of a settled quatrain');
});

test('milestone: undo and reset never celebrate', () => {
  assert.equal(isQuatrainMilestone(5, 4), false, 'undo back into a completed quatrain');
  assert.equal(isQuatrainMilestone(4, 3), false, 'undo out of one');
  assert.equal(isQuatrainMilestone(8, 0), false, 'reset');
  assert.equal(isQuatrainMilestone(4, 0), false, 'reset from exactly one quatrain');
});

test('milestone: re-committing the fourth line after an undo celebrates again', () => {
  // 4 -> 3 (undo) is silent, and the fresh 3 -> 4 earns the seal a second time.
  assert.equal(isQuatrainMilestone(4, 3), false);
  assert.equal(isQuatrainMilestone(3, 4), true);
});

test('index.html: the seal ships hidden, decorative, and outside the grid viewport', () => {
  const m = html.match(/<div id="completion-moment"[\s\S]*?<\/div>/);
  assert.ok(m, 'the seal element exists');
  const el = m[0];
  const openingTag = el.slice(0, el.indexOf('>') + 1);
  assert.match(openingTag, /\shidden(\s|>)/, 'it starts hidden');
  assert.match(openingTag, /aria-hidden="true"/, 'it is decoration; #progress does the announcing');
  assert.match(el, /id="completion-caption"/, 'it carries a caption slot');

  const viewportEnd = html.indexOf('</section>', html.indexOf('class="grid-viewport"'));
  assert.ok(
    html.indexOf('id="completion-moment"') > viewportEnd,
    'the seal lives outside .grid-viewport / .grid-frame, so the pan box cannot clip it',
  );
});

test('index.html: #progress stays the accessible announcement', () => {
  assert.match(html, /<span id="progress"[^>]*role="status"/, 'progress keeps role=status');
});

test('styles.css: the seal cannot move layout, capture pointers, or be scrolled to', () => {
  const rule = ruleBody(css, '\\.completion-moment');
  assert.match(rule, /position:\s*fixed/, 'fixed — no layout impact, nothing to scroll into view');
  assert.match(rule, /pointer-events:\s*none/, 'the compass underneath stays usable for line five');
  assert.match(rule, /z-index:\s*\d+/, 'stacking is controlled explicitly');
  assert.match(rule, /max-width:\s*min\(/, 'width stays responsive on narrow screens');
});

test('styles.css: the grid viewport cap and compass positioning are untouched', () => {
  assert.match(css, /\.grid-viewport\s*\{[^}]*max-height:\s*74vh/, '.grid-viewport keeps its 74vh cap');
  assert.match(css, /\.compass\s*\{[^}]*position:\s*absolute/, 'the compass is still absolutely positioned');
});

test('styles.css: reduced motion shows the seal with no transition, transform or animation', () => {
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/);
  assert.ok(block, 'the reduced-motion media query exists');
  const reduced = block[0];
  assert.ok(reduced.includes('.completion-moment'), 'the seal is covered by it');
  const overrides = reduced.slice(reduced.indexOf('.completion-moment'));
  assert.match(overrides, /transition:\s*none/, 'no transition');
  assert.match(overrides, /animation:\s*none/, 'no animation');
  assert.match(overrides, /transform:\s*none/, 'no transform');
  assert.match(
    overrides,
    /\.completion-moment\.is-showing/,
    'the shown state is overridden too, so the seal still becomes visible',
  );
});

test('src/app.js: the seal is driven by the milestone transition, not by the current count', () => {
  assert.match(appJs, /import \{ isQuatrainMilestone \} from '\.\/milestone\.js'/, 'uses the pure predicate');
  assert.match(appJs, /isQuatrainMilestone\(lastLineCount, n\)/, 'compares the previous count with the new one');
  assert.match(appJs, /lastLineCount = n/, 'the previous count is carried forward');
});

test('src/app.js: the seal never scrolls anything and never moves the compass', () => {
  const seal = sealSource();
  for (const banned of ['scrollIntoView', 'scrollTo', 'scrollBy', 'positionCompass']) {
    assert.ok(!seal.includes(banned), `the seal must not call ${banned}`);
  }
});

test('src/app.js: reduced motion is honoured through the existing constant', () => {
  assert.match(
    appJs,
    /const REDUCED_MOTION = matchMedia\('\(prefers-reduced-motion: reduce\)'\)/,
    'the existing REDUCED_MOTION constant is still the single source',
  );
  assert.ok(sealSource().includes('REDUCED_MOTION'), 'the seal branches on it');
});

test('src/app.js: the live poem output still appears from the first committed line', () => {
  assert.match(appJs, /outputEl\.hidden = n === 0/, 'output is revealed from line one, unchanged');
  assert.match(
    appJs,
    /poemZhEl\.textContent = selection\.extractedLines\(\)\.join\('\\n'\)/,
    'the poem keeps building live on every render',
  );
});
