// test/output-contract.test.js
// Guards the output hierarchy / state contract introduced by PER-9: the poem is
// the payoff and comes first, the prompt box is read-only, and the English area
// stays editable with its "translation is off in v1" helper wired to LLM_ENABLED.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

// Opening tag of an element identified by id, e.g. <textarea id="poem-en" ...>
function openingTag(source, id) {
  const m = source.match(new RegExp(`<([a-z]+)\\s+id="${id}"[\\s\\S]*?>`, 'i'));
  assert.ok(m, `expected an element with id="${id}"`);
  return m[0];
}

test('index.html: poem card comes before the prompt and English cards', () => {
  const poem = html.indexOf('id="poem-zh"');
  const prompt = html.indexOf('id="prompt-text"');
  const english = html.indexOf('id="poem-en"');
  assert.ok(poem > -1 && prompt > -1 && english > -1, 'all three regions present');
  assert.ok(poem < prompt, 'poem is rendered before the translation prompt');
  assert.ok(prompt < english, 'prompt is rendered before the English poem');
});

test('index.html: the poem card carries its primary class', () => {
  const m = html.match(/<div class="([^"]*)">\s*<h2>Poem so far<\/h2>/);
  assert.ok(m, 'poem card wraps the "Poem so far" heading');
  const classes = m[1].split(/\s+/);
  assert.ok(classes.includes('card'), 'poem card is a .card');
  assert.ok(classes.includes('poem-chinese'), 'poem card keeps its distinguishing .poem-chinese class');
});

test('index.html: English helper is associated with the editable English textarea', () => {
  assert.ok(html.includes('id="english-help"'), 'English helper element exists');
  const textarea = openingTag(html, 'poem-en');
  assert.match(textarea, /aria-describedby="english-help"/, 'textarea points at the helper');
  assert.doesNotMatch(textarea, /\breadonly\b/, 'English textarea stays editable');
});

test('index.html: Translate button stays disabled and is labelled as such', () => {
  const m = html.match(/<button id="translate"[\s\S]*?<\/button>/);
  assert.ok(m, 'Translate button present');
  const btn = m[0];
  assert.match(btn, /\bdisabled\b/, 'button is disabled in markup');
  assert.ok(
    /disabled/i.test(btn.replace(/\bdisabled\b/, '')),
    'button text or title explicitly says the integration is disabled',
  );
});

test('styles.css: two-column output on wider screens, full-width poem, one-column on mobile', () => {
  assert.match(
    css,
    /\.output\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    'default .output layout is two columns',
  );
  assert.match(
    css,
    /\.poem-chinese\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/,
    '.poem-chinese spans the full width',
  );
  assert.match(
    css,
    /@media \(max-width: 600px\)[\s\S]*?\.output\s*\{\s*grid-template-columns:\s*1fr;?\s*\}/,
    'mobile media query collapses .output to one column',
  );
});

test('styles.css: responsive poem typography and pre-wrap are preserved', () => {
  const poemRule = css.match(/\.poem\s*\{[^}]*\}/);
  assert.ok(poemRule, '.poem rule exists');
  assert.match(poemRule[0], /font-size:\s*clamp\([^)]*vw[^)]*\)/, 'poem font-size scales with viewport');
  assert.match(poemRule[0], /white-space:\s*pre-wrap/, 'poem keeps line breaks via pre-wrap');
  assert.match(
    css,
    /@media \(max-width: 600px\)[\s\S]*?\.poem\s*\{[^}]*letter-spacing/,
    'mobile media query retunes .poem letter-spacing',
  );
});

test('src/app.js: English helper visibility is synced to LLM_ENABLED', () => {
  assert.match(appJs, /const LLM_ENABLED = false/, 'the live-call guard stays off in v1');
  assert.match(appJs, /englishHelpEl\.hidden\s*=\s*LLM_ENABLED/, 'helper is shown/hidden with LLM_ENABLED');
  assert.match(appJs, /translateBtn\.disabled\s*=\s*!LLM_ENABLED/, 'Translate button disabled follows LLM_ENABLED');
});

test('index.html: prompt textarea stays read-only', () => {
  const textarea = openingTag(html, 'prompt-text');
  assert.match(textarea, /\breadonly\b/, 'the generated prompt is not hand-edited');
});
