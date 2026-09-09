// test/thread-animation.test.js
// Guards the "drawn, not appearing" thread contract from PER-23. drawThread()
// rebuilds the entire SVG overlay on every call, so the only thing that keeps
// old strands from re-animating is *which* call asks for animation and *which*
// single strand gets the class. Both live in source rather than in reachable
// runtime state, so — like output-contract.test.js — this is a source contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

// Body of a top-level `function name(` declaration, up to the next one.
function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start > -1, `expected a function ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(?:async )?function /);
  return next === -1 ? rest : rest.slice(0, next);
}

const CSS_NO_COMMENTS = css.replace(/\/\*[\s\S]*?\*\//g, '');

// Declaration blocks whose selector starts with `.thread`. The regex matches
// innermost brace pairs, so rules nested in @media are found on their own.
function threadRules() {
  const found = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(CSS_NO_COMMENTS)) !== null) {
    const selector = m[1].trim().split('\n').pop().trim();
    if (selector.startsWith('.thread')) found.push({ selector, body: m[2] });
  }
  assert.ok(found.length > 0, 'expected .thread rules in styles.css');
  return found;
}

test('drawThread and render default to no animation', () => {
  assert.match(
    appJs,
    /function drawThread\(\{\s*animateNewest = false\s*\} = \{\}\)/,
    'drawThread takes an explicit animateNewest intent, off by default',
  );
  assert.match(
    appJs,
    /function render\(\{\s*animateNewest = false\s*\} = \{\}\)/,
    'render takes the same intent, off by default',
  );
  assert.match(
    functionBody(appJs, 'render'),
    /drawThread\(\{\s*animateNewest\s*\}\)/,
    'render forwards the intent to drawThread rather than deciding for itself',
  );
});

test('only a successful addLine asks for animation', () => {
  const handler = appJs.match(/btn\.addEventListener\('click',[\s\S]*?\n {4}\}\);/);
  assert.ok(handler, 'compass buttons have a click handler');
  assert.match(handler[0], /=\s*selection\.addLine\(dir\)/, "the handler keeps addLine's success flag");
  assert.match(
    handler[0],
    /render\(\{\s*animateNewest:\s*added\s*\}\)/,
    'animation is requested only when the line was actually committed',
  );

  // Exactly one call site in the whole file may request animation.
  const requests = appJs.match(/render\(\{[^}]*animateNewest[^}]*\}\)/g) ?? [];
  assert.equal(requests.length, 1, 'no other call site turns animation on');
});

test('undo, reset, start and the initial render do not animate', () => {
  assert.match(
    appJs,
    /undoBtn\.addEventListener\('click', \(\) => \{ selection\.undo\(\); render\(\); \}\)/,
    'undo re-renders the thread in its final state',
  );
  assert.match(
    appJs,
    /resetBtn\.addEventListener\('click', \(\) => \{ selection\.reset\(\); render\(\); \}\)/,
    'reset re-renders without animation',
  );
  assert.match(functionBody(appJs, 'onCellClick'), /render\(\);/, 'picking a start does not animate');
  assert.match(
    appJs,
    /buildCompass\(\);\s*\r?\nrender\(\);/,
    'the initial render draws the (empty) thread without animation',
  );
});

test('the resize redraw only re-measures', () => {
  const observer = appJs.match(/new ResizeObserver\(\(\) => \{[\s\S]*?\}\)\.observe\(gridEl\)/);
  assert.ok(observer, 'a ResizeObserver redraws the thread');
  assert.match(observer[0], /drawThread\(\);/, 'resize calls drawThread with no intent');
  assert.doesNotMatch(observer[0], /animateNewest/, 'resize never requests animation');
});

test('drawThread marks only the newest segment, and only a strand', () => {
  const draw = functionBody(appJs, 'drawThread');
  assert.match(draw, /geo\.segments\.length - 1/, 'the newest segment is identified by index');
  assert.match(draw, /seg\.index === newestIndex/, 'the class is keyed off that index');
  assert.match(
    draw,
    /class: drawNewest && isNewest \? 'strand strand-drawing' : 'strand'/,
    'older strands render final; only the newest carries the drawing class',
  );
  assert.equal(
    (appJs.match(/strand-drawing/g) ?? []).length,
    1,
    'nothing else — knots, cells, the thread root — gets the drawing class',
  );
  assert.match(draw, /pathLength: '1'/, 'dash units are normalised so all 8 directions take equal time');
});

test('the JS gate honours REDUCED_MOTION', () => {
  assert.match(
    functionBody(appJs, 'drawThread'),
    /animateNewest && !REDUCED_MOTION/,
    'the class is withheld outright under prefers-reduced-motion',
  );
  assert.match(
    appJs,
    /const REDUCED_MOTION = matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/,
    'REDUCED_MOTION still reads the media query',
  );
});

test('styles.css: the strand is drawn by a stroke-dash animation', () => {
  assert.match(
    CSS_NO_COMMENTS,
    /@keyframes thread-draw\s*\{\s*from\s*\{\s*stroke-dashoffset:\s*1;\s*\}\s*to\s*\{\s*stroke-dashoffset:\s*0;\s*\}\s*\}/,
    'thread-draw runs the dash offset from 1 (hidden) to 0 (complete)',
  );
  const rule = CSS_NO_COMMENTS.match(/\.thread \.strand-drawing\s*\{([^}]*)\}/);
  assert.ok(rule, '.thread .strand-drawing rule exists');
  assert.match(rule[1], /stroke-dasharray:\s*1;/, 'one dash unit spans the whole segment');
  assert.match(rule[1], /stroke-dashoffset:\s*1;/, 'the strand starts hidden');
  const anim = rule[1].match(/animation:\s*thread-draw\s+([\d.]+)s[^;]*;/);
  assert.ok(anim, 'the rule runs the thread-draw animation');
  const seconds = Number.parseFloat(anim[1]);
  assert.ok(seconds >= 0.8 && seconds <= 2, `draw should read as deliberate but not slow; got ${seconds}s`);
  assert.match(anim[0], /\bboth\b/, 'fill-mode both keeps the strand consistent before and after');
});

test('styles.css: prefers-reduced-motion disables the draw', () => {
  const block = CSS_NO_COMMENTS.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/);
  assert.ok(block, 'the reduced-motion media block is still present');
  // Matches .cell wherever it sits in the selector list: PER-14 joins the
  // controls to this rule, so pinning ".cell {" alone would fail on a change
  // that widens reduced-motion cover rather than removing it.
  assert.match(block[0], /\.cell[^{]*\{[^}]*transition:\s*none/, 'the pre-existing cell rule survives');
  const rule = block[0].match(/\.thread \.strand-drawing\s*\{([^}]*)\}/);
  assert.ok(rule, 'reduced motion targets the drawing strand');
  assert.match(rule[1], /animation:\s*none/, 'no animation under reduced motion');
  assert.match(rule[1], /stroke-dashoffset:\s*0/, 'the strand is shown complete, not hidden');
});

test('styles.css: no new stacking context on .thread or its children', () => {
  // mix-blend-mode: multiply on .thread only works while .thread and its
  // children stay in the root stacking context; these properties would isolate
  // them and the ink glyphs would stop reading through the gold.
  const banned = /(?<![-\w])(transform|filter|backdrop-filter|will-change|isolation|perspective|opacity|contain)\s*:/;
  for (const rule of threadRules()) {
    assert.doesNotMatch(rule.body, banned, `${rule.selector} must not create a stacking context`);
  }
  const keyframes = CSS_NO_COMMENTS.match(/@keyframes thread-draw\s*\{[\s\S]*?\n\}/);
  assert.ok(keyframes, 'thread-draw keyframes exist');
  assert.doesNotMatch(keyframes[0], banned, 'the keyframes animate stroke properties only');
  assert.match(
    CSS_NO_COMMENTS,
    /\.thread\s*\{[^}]*mix-blend-mode:\s*multiply/,
    'the load-bearing multiply blend is untouched',
  );
});
