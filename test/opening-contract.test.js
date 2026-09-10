// test/opening-contract.test.js
// Guards the opening moment introduced by PER-12: the page leads with the story
// and a display-voice title, keeps the About disclosure for fuller context, uses
// the 心 motif restrainedly (decorative, never a control), and leaves the grid,
// gold thread, compass, controls and output regions exactly as they were.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

// Opening tag of an element carrying a given class, e.g. <p class="story-lede">
function tagWithClass(source, cls) {
  const m = source.match(new RegExp(`<([a-z]+)\\s[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, 'i'));
  assert.ok(m, `expected an element with class="${cls}"`);
  return m[0];
}

test('index.html: the story is above the controls and the grid', () => {
  const lede = html.indexOf('class="story-lede"');
  const controls = html.indexOf('class="controls"');
  const grid = html.indexOf('id="grid"');
  assert.ok(lede > -1, 'a story lede exists');
  assert.ok(lede < controls, 'the story reads before the controls');
  assert.ok(controls < grid, 'controls still sit above the grid');
});

test('index.html: the lede tells who wove it and how it is read', () => {
  const m = html.match(/<p class="story-lede">([\s\S]*?)<\/p>/);
  assert.ok(m, 'story lede is a paragraph');
  const lede = m[1];
  assert.match(lede, /Su Hui/, 'names Su Hui');
  assert.match(lede, /husband/i, 'places the distant husband');
  assert.match(lede, /841/, 'gives the character count');
  assert.match(lede, /backwards/i, 'says the grid reads in many directions');
});

test('index.html: one h1, holding the traditional-Chinese title and a Latin gloss', () => {
  const h1s = html.match(/<h1[\s>]/g) || [];
  assert.equal(h1s.length, 1, 'exactly one h1 on the page');
  const heading = html.match(/<h1[\s\S]*?<\/h1>/)[0];
  assert.match(heading, /<span class="title-zh" lang="zh-Hant">璇璣圖<\/span>/,
    'the Chinese title is marked up as zh-Hant and stays traditional');
  assert.match(heading, /class="latin"[^>]*>\s*Star Gauge/, 'the Latin title is presented separately');
});

test('index.html: the 心 motif is decorative and accessible, never a control', () => {
  const m = html.match(/<p class="opening-mark"[\s\S]*?<\/p>/);
  assert.ok(m, 'the opening carries a 心 mark');
  const mark = m[0];
  assert.match(mark, />心</, 'the mark is the heart character itself');
  assert.match(mark, /lang="zh-Hant"/, 'the mark is tagged zh-Hant');
  assert.match(mark, /role="img"/, 'exposed as an image, not as text noise');
  assert.match(mark, /aria-label="[^"]*心[^"]*"/, 'the mark carries its own context');
  assert.doesNotMatch(mark, /<button|tabindex|onclick/i, 'the mark is not interactive');
});

test('index.html: the interaction instruction and the About disclosure both survive', () => {
  const tagline = tagWithClass(html, 'tagline');
  assert.match(tagline, /^<p/, 'the tagline is still a paragraph of copy');
  assert.match(html, /<p class="tagline">[^<]*seven characters[^<]*<\/p>/,
    'the tagline still explains how a line is traced');

  const about = html.match(/<details class="about">[\s\S]*?<\/details>/);
  assert.ok(about, 'the About disclosure is still a <details>');
  assert.match(about[0], /<summary>About this poem<\/summary>/, 'its summary is unchanged');
  assert.match(about[0], /蘇蕙[\s\S]*竇滔/, 'the fuller context keeps the traditional-Chinese names');
  assert.ok(html.indexOf('class="story-lede"') < html.indexOf('<details class="about">'),
    'the story leads and the disclosure stays secondary');
});

test('index.html: grid, thread, compass, controls and output are untouched and in order', () => {
  const order = [
    'id="undo"', 'id="reset"', 'id="regions-toggle"', 'id="progress"',
    'id="grid"', 'id="thread"', 'id="compass"',
    'id="output"', 'id="poem-zh"', 'id="prompt-text"', 'id="poem-en"', 'id="translate"',
  ];
  let previous = -1;
  for (const marker of order) {
    const at = html.indexOf(marker);
    assert.ok(at > -1, `${marker} is still present`);
    assert.ok(at > previous, `${marker} keeps its place in the document order`);
    previous = at;
  }
  assert.match(html, /<svg id="thread" class="thread" aria-hidden="true"/,
    'the gold-thread overlay stays decorative');
  assert.match(html, /<div id="compass" class="compass" hidden>/, 'the compass still starts hidden');
});

test('styles.css: the opening has its own restrained hierarchy', () => {
  assert.match(css, /\.opening\s*\{[^}]*display:\s*grid/, '.opening lays out the hero');
  assert.match(css, /\.opening \.title-zh\s*\{[^}]*font-size:\s*clamp\([^)]*vw[^)]*\)/,
    'the Chinese title has a responsive display size');
  assert.match(css, /\.opening \.latin\s*\{[^}]*color:\s*var\(--faded\)/,
    'the Latin title reads quieter than the Chinese one');
  assert.match(css, /\.story-lede\s*\{[^}]*max-width:\s*\d+ch/, 'the lede is set to a readable measure');
});

test('styles.css: 心 is the hero accent, and the hero borrows no gold thread', () => {
  const mark = css.match(/\.opening-mark\s*\{[^}]*\}/);
  assert.ok(mark, '.opening-mark rule exists');
  assert.match(mark[0], /color:\s*var\(--vermillion\)/, 'the seal is vermillion, like the grid centre');
  assert.match(mark[0], /background:\s*var\(--center-glow\)/, 'it reuses the centre halo rather than inventing one');

  const hero = css.slice(css.indexOf('.opening {'), css.indexOf('.controls {'));
  assert.doesNotMatch(hero, /--gold-soft|--gold-glow/,
    'the traced-thread golds stay reserved for the thread itself');
});

test('styles.css: the About summary has a visible focus ring', () => {
  assert.match(css, /\.about summary:focus-visible\s*\{[^}]*outline:/, 'keyboard focus on About is visible');
});

test('styles.css: the hero compacts on small screens, grid behaviour preserved', () => {
  const mobile = css.match(/@media \(max-width: 600px\)\s*\{[\s\S]*?\n\}/);
  assert.ok(mobile, 'the 600px media query exists');
  assert.match(mobile[0], /\.opening\s*\{[^}]*grid-template-columns:\s*1fr/, 'the hero collapses to one column');
  assert.match(mobile[0], /\.opening-mark\s*\{[^}]*font-size/, 'the seal shrinks with it');
  assert.match(mobile[0], /--cell:\s*30px/, 'the smaller cell size is untouched');
  assert.match(css, /\.grid-viewport\s*\{[^}]*max-height:\s*74dvh/, 'the base grid viewport uses the dynamic viewport height');
  assert.match(mobile[0], /\.grid-viewport\s*\{[^}]*max-height:\s*60dvh/, 'the mobile grid viewport uses the dynamic viewport height');
  assert.match(css, /\.grid-frame\s*\{[^}]*padding:\s*56px/, 'the compass clearance padding is preserved');

  assert.match(css, /@media \(pointer: coarse\)[\s\S]*?--compass-btn:\s*44px/,
    'coarse-pointer compass buttons stay >=44px');
  // Matches .cell wherever it sits in the selector list: other tickets add their
  // own rules to this block (PER-14 the controls, PER-23 the thread), so pinning
  // ".cell {" exactly would fail on a change that strengthens reduced motion.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.cell[^{]*\{[^}]*transition:\s*none/,
    'reduced-motion handling is preserved');
});
