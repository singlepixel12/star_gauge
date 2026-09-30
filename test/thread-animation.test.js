// test/thread-animation.test.js
// Guards the "drawn, not appearing" thread contract from PER-23. drawThread()
// rebuilds the entire SVG overlay on every call, so the only thing that keeps
// old strands from re-animating is *which* call asks for animation and *which*
// single strand gets the class. Both live in source rather than in reachable
// runtime state, so — like output-contract.test.js — this is a source contract.
//
// PER-51: app.js is shared by nearly every ticket, so the assertions below are
// scoped to what PER-23 owns — the compass commit, the render intent, the
// strand-drawing class — and say where a thing lives rather than how many
// times the whole file mentions it.
//
// WHAT THIS FILE CANNOT COVER — needs manual validation.
// There is no DOM and no SVG renderer here (no jsdom, no playwright —
// deliberately: vanilla site, no build step, no dependencies). These remain
// manual checks, served over HTTP:
//   * that the newest strand is visibly drawn from its start cell outward, in
//     about the same time in all eight directions, and older strands do not
//     redraw on undo, reset, resize or a restored link;
//   * that the gold still reads through the ink (mix-blend-mode: multiply) in
//     the browsers we target;
//   * that prefers-reduced-motion really shows the strand complete at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appJs, functionBody, assertOwnedBy, clickHandler } from '../test-support/app-source.js';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

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
  // PER-22 adds a second, independent intent (revealCompletion); the animation
  // intent must stay separate from it and stay off by default.
  assert.match(
    appJs,
    /function render\(\{\s*animateNewest = false,[^}]*\} = \{\}\)/,
    'render takes the same intent, off by default',
  );
  assert.match(
    functionBody(appJs, 'render'),
    /drawThread\(\{\s*animateNewest\s*\}\)/,
    'render forwards the intent to drawThread rather than deciding for itself',
  );
});

test('only a successful addLine asks for animation', () => {
  const handler = functionBody(appJs, 'buildCompass').match(/btn\.addEventListener\('click',[\s\S]*?\n {4}\}\);/);
  assert.ok(handler, 'compass buttons have a click handler');
  assert.match(handler[0], /=\s*selection\.addLine\(dir\)/, "the handler keeps addLine's success flag");
  assert.match(
    handler[0],
    /render\(\{\s*animateNewest:\s*added\b/,
    'animation is requested only when the line was actually committed',
  );
  assert.equal((handler[0].match(/animateNewest/g) ?? []).length, 1, 'and asked for once, there');

  // Every render call that could turn animation on lives in that handler. Any
  // other call may name the intent only to switch it off outright, as PER-43's
  // restored path does — so a second site actually asking for it still fails,
  // while an unrelated ticket adding a non-animating call site does not
  // (PER-51: owned, not counted).
  const ANIMATION_REQUEST = /render\(\{(?![^}]*animateNewest:\s*false\b)[^}]*animateNewest[^}]*\}\)/;
  assertOwnedBy(ANIMATION_REQUEST, [handler[0]], 'no other call site turns animation on');
});

test('undo, reset, start and the initial render do not animate', () => {
  // Each handler is read whole and on its own (PER-51), so what else it does
  // first — cancelling a walkthrough, asking before a reset — is its business.
  for (const [name, call] of [['undoBtn', 'undo'], ['resetBtn', 'reset']]) {
    const handler = clickHandler(name);
    assert.match(handler, new RegExp(String.raw`selection\.${call}\(\);\s*render\(\);`),
      `${call} re-renders with a bare render()`);
    assert.doesNotMatch(handler, /animateNewest|revealCompletion/, `${call} never asks for animation`);
  }
  assert.match(functionBody(appJs, 'onCellClick'), /render\(\);/, 'picking a start does not animate');
  assert.doesNotMatch(functionBody(appJs, 'onCellClick'), /animateNewest/, 'nor asks for it');
  // The first paint is the restored one (PER-43): it draws whatever the address
  // carried — often nothing at all — and refuses the strand draw outright, so a
  // shared link never replays itself as though it were being traced live.
  // Read from the top-level bootstrap statements, not from which lines happen
  // to sit next to each other.
  const bootRender = appJs.match(/^(render|renderRestoredPath)\(\);?\s*$/m);
  assert.ok(bootRender, 'the bootstrap paints once at load');
  assert.equal(bootRender[1], 'renderRestoredPath', 'the initial render is the restored-path one');
  assert.ok(appJs.search(/^buildCompass\(\);/m) < bootRender.index, 'painted once the compass exists');
  assert.match(
    functionBody(appJs, 'renderRestoredPath'),
    /render\(\{ animateNewest: false, revealCompletion: selection\.canExtract\(\) \}\)/,
    'a restored path is shown settled, with the completion intent named outright',
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
  // Only one place in the app may *put* the drawing class on anything. A bare
  // count of the string no longer says that: PER-22's completion reveal reads
  // the class back with querySelector to learn when the strand has finished
  // drawing, which is a lookup, not an assignment. So the read-only lookups are
  // resolved away first and the assignments are counted — the contract keeps its
  // teeth (a second assignment anywhere still fails) without being weakened to
  // "at most two occurrences".
  const LOOKUP = /\.(?:querySelectorAll|querySelector|closest|matches|getElementsByClassName)\(\s*['"][^'"]*['"]\s*\)/g;
  assert.match(appJs, LOOKUP, 'sanity: the lookup form this strips really occurs');
  const assignments = appJs.replace(LOOKUP, '.LOOKUP()');
  assert.equal(
    (assignments.match(/strand-drawing/g) ?? []).length,
    1,
    'nothing else — knots, cells, the thread root — gets the drawing class',
  );
  // And that one assignment is the class attribute built above, not a
  // classList write that could stack the class onto an already-drawn strand.
  assert.doesNotMatch(
    appJs,
    /(?:classList\.(?:add|toggle)|setAttribute\(\s*'class')[^)]*strand-drawing/,
    'the class is only ever set when the strand is created',
  );
  // The surviving occurrence is inside drawThread, so no other function can be
  // the one place that assigns it.
  assert.equal(
    (functionBody(assignments, 'drawThread').match(/strand-drawing/g) ?? []).length,
    1,
    'the single assignment lives in drawThread',
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
