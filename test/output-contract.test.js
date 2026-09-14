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

// The one .poem-chinese card, opening tag through its matching close.
function poemCard() {
  const start = html.indexOf('<div class="card poem-chinese">');
  assert.ok(start > -1, 'the poem card is present');
  const end = html.indexOf('<div class="card prompt-block">', start);
  assert.ok(end > start, 'the prompt card still follows it');
  return html.slice(start, end);
}

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

// --- PER-45: the two readings inside the one poem card --------------------

test('index.html: forward and reverse readings share the one poem-chinese card', () => {
  const card = poemCard();
  const forward = card.indexOf('id="poem-zh"');
  const reverse = card.indexOf('id="poem-zh-reverse"');
  assert.ok(forward > -1, 'the forward output keeps its id — app.js and PER-22 both key off it');
  assert.ok(reverse > forward, 'the reverse output is in the same card, after the forward one');
  // One card, so the completion moment and the scroll target stay singular.
  assert.equal((html.match(/class="card poem-chinese"/g) ?? []).length, 1);
  assert.equal((html.match(/id="poem-zh-reverse"/g) ?? []).length, 1);
});

test('index.html: both readings are .poem, in traditional Chinese, and not controls', () => {
  const card = poemCard();
  for (const id of ['poem-zh', 'poem-zh-reverse']) {
    const tag = openingTag(card, id);
    assert.match(tag, /^<pre\s/, `#${id} is a <pre>, so the extracted lines keep their breaks`);
    assert.match(tag, /class="[^"]*\bpoem\b/, `#${id} carries the shared .poem treatment`);
    assert.match(tag, /lang="zh-Hant"/, `#${id} is marked as traditional Chinese`);
  }
  // The reverse is a reading, never a path you can edit or a control you press.
  assert.doesNotMatch(card, /<button|<input|tabindex|contenteditable/i);
  assert.doesNotMatch(card, /aria-pressed|role="button"/i);
});

test('index.html: each reading has a visible, accessible label', () => {
  const card = poemCard();
  for (const [word, id] of [['Forward', 'reading-forward-label'], ['Reverse', 'reading-reverse-label']]) {
    // Real text in the flow, not a title attribute or a placeholder: the labels
    // are what make the reversibility legible at a glance.
    assert.match(card, new RegExp(`<h3 id="${id}"[^>]*>${word}</h3>`), `visible "${word}" heading`);
    assert.match(card, new RegExp(`aria-labelledby="${id}"`), `the reading group is named by it`);
  }
  // And a line of copy saying what the second reading is.
  assert.match(card, /class="[^"]*\breading-note\b/, 'the explanatory copy is present');
  assert.match(card, /the same thread, read back from its endpoint/i);
});

test('styles.css: .poem-readings pairs the readings side by side by default', () => {
  assert.match(
    css,
    /\.poem-readings\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    'the two readings sit side by side — the ticket’s one strong move',
  );
  // Equal tracks, so neither reading is the subordinate one, and minmax(0, …)
  // so a long line shrinks its column instead of widening the card.
  assert.match(css, /\.poem-readings\s*\{[^}]*gap:/, 'the columns are separated by real space');
  assert.match(css, /\.reading\s*\{[^}]*min-width:\s*0/, 'a reading may shrink below its text');
  // Static presentation only: no overlay and nothing animated was added.
  assert.doesNotMatch(css, /\.poem-readings[^{}]*\{[^}]*animation/);
  assert.doesNotMatch(css, /\.reading[^{}]*\{[^}]*position:\s*(?:fixed|absolute)/);
});

// PER-45 review: a reviewer read the ticket's "side by side" as binding at
// 375x812 too. It is not, and this is the test that says so rather than leaving
// it to a comment. The Codex plan requires the collapse in four separate places
// — "fits mobile by stacking", "at max-width: 600px, collapse .poem-readings to
// one column", "at 375px, keep the reverse reading below the forward one rather
// than shrinking the Chinese glyphs excessively", and the 375x812 manual step
// "confirm the readings stack" — and CLAUDE.md makes single-column-on-small-
// screens a hard constraint. The arithmetic is in styles.css: at 375px a column
// of a two-up layout holds 4.1 characters of a seven-character line. So the
// stack is required, and what has to be proven is that stacking costs the
// reader nothing: both readings still present, full width, full size, in order,
// and neither clipped nor covered.
test('styles.css: below 600px the readings stack without clipping or shrinking', () => {
  const mobile = css.slice(css.indexOf('@media (max-width: 600px)'));
  assert.ok(mobile.length > 0, 'the phone query exists');
  assert.match(
    mobile,
    /\.poem-readings\s*\{[^}]*grid-template-columns:\s*1fr/,
    'one column: the reverse reading sits under the forward one at full width',
  );
  // A single 1fr track is the whole card width, so neither reading is narrowed
  // and .poem keeps the size the same query gives it. The one type change here
  // is letter-spacing, which is tracking and not glyph size — the plan's
  // "rather than shrinking the Chinese glyphs excessively".
  const poemMobile = mobile.match(/\.poem\s*\{([^}]*)\}/);
  assert.ok(poemMobile, '.poem is retuned for phones');
  assert.doesNotMatch(poemMobile[1], /font-size/, 'the glyphs are not shrunk to fit');
  assert.match(poemMobile[1], /letter-spacing/, 'only the tracking tightens');

  // The divider has to move with the axis or it rules across the wrong edge.
  const divider = mobile.match(/\.reading \+ \.reading\s*\{([^}]*)\}/);
  assert.ok(divider, 'the stacked divider is redeclared');
  assert.match(divider[1], /border-left:\s*0/, 'the column rule is dropped');
  assert.match(divider[1], /padding-left:\s*0/, 'and so is the column indent');
  assert.match(divider[1], /border-top:/, 'the readings are separated horizontally instead');
});

test('styles.css: no breakpoint hides, covers or truncates either reading', () => {
  // Both readings stay in the flow and in the accessibility tree at every
  // width. This is the assertion the 375x812 manual check is standing in for:
  // stacking is only acceptable because nothing is lost by it.
  for (const m of css.matchAll(/([^{}]*\.(?:poem-readings|reading|poem)\b[^{}]*)\{([^}]*)\}/g)) {
    const [, selector, body] = m;
    const where = selector.trim().replace(/\s+/g, ' ');
    assert.doesNotMatch(body, /display:\s*none/, `${where} must not drop a reading`);
    assert.doesNotMatch(body, /visibility:\s*hidden/, `${where} must not blank a reading`);
    assert.doesNotMatch(body, /overflow(?:-y)?:\s*hidden/, `${where} must not clip a reading`);
    // Anchored to a declaration boundary, so .poem's own line-height is not a hit.
    assert.doesNotMatch(body, /(?:^|;)\s*max-height:/m, `${where} must not cap a reading's height`);
    assert.doesNotMatch(body, /(?:^|;)\s*height:\s*\d/m, `${where} must not fix a reading's height`);
    assert.doesNotMatch(body, /position:\s*(?:fixed|absolute)/, `${where} must not lift a reading out`);
  }
  // The narrowest query tightens the controls bar only; it must not reach the
  // poem card and undo any of the above.
  const narrow = css.slice(css.indexOf('@media (max-width: 380px)'));
  assert.ok(narrow.length > 0, 'the narrow-phone query exists');
  assert.doesNotMatch(narrow, /\.poem-readings|\.reading\b|#poem-zh/, 'it leaves the readings alone');
  // And the poem <pre>s keep the overflow behaviour they already had, so a line
  // that somehow does not fit scrolls rather than being cut off.
  assert.match(css, /\.poem\s*\{[^}]*overflow-x:\s*auto/, '.poem still scrolls rather than clips');
  assert.match(css, /\.poem\s*\{[^}]*white-space:\s*pre-wrap/, 'and keeps its line breaks');
});

test('src/app.js: the reverse reading is derived, and the prompt gets forward only', () => {
  assert.match(appJs, /import \{ reverseReading \} from '\.\/readings\.js';/, 'from the pure module');
  // The trace is read once, so the two readings and the prompt cannot drift.
  assert.equal((appJs.match(/selection\.extractedLines\(\)/g) ?? []).length, 1);
  assert.match(appJs, /const extractedLines = selection\.extractedLines\(\);/);
  assert.match(appJs, /poemZhEl\.textContent = extractedLines\.join\('\\n'\);/);
  assert.match(appJs, /poemReverseEl\.textContent = reverseReading\(extractedLines\)\.join\('\\n'\);/);
  // Translation still works from the poem as traced — PER-45 changes no prompt
  // semantics, so reverseReading() must never reach buildPrompt().
  assert.equal((appJs.match(/buildPrompt\(/g) ?? []).length, 1);
  assert.match(appJs, /buildPrompt\(extractedLines\)/);
  assert.doesNotMatch(appJs, /buildPrompt\([^)]*reverse/i);
});

test('src/readings.js: the transform stays pure presentation', () => {
  const readingsJs = readFileSync(new URL('../src/readings.js', import.meta.url), 'utf8');
  assert.match(readingsJs, /export function reverseReading\(lines\)/);
  assert.match(readingsJs, /Array\.from/, 'code-point reversal, not UTF-16 indexing');
  // The forbidden names below are checked against *executable* source only. The
  // module's comments name the very things it must not touch — that is the
  // explanation doing its job, and documenting a boundary is not crossing it.
  const code = readingsJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // No DOM, no geometry, no grid, no selection: a string transform and nothing else.
  assert.doesNotMatch(code, /document|window/);
  assert.doesNotMatch(code, /^import /m, 'it depends on nothing');
  assert.doesNotMatch(code, /addLine|pathToThreadGeometry|isCenter|GRID/);
});

test('src/app.js: neither reading depends on the Colour-regions state', () => {
  // Regions are a cell tint and nothing more: they touch aria-pressed and the
  // body class, so they cannot reach the extracted text either way round.
  assert.match(
    appJs,
    /function applyRegionsState\(\{ on, ariaPressed \}\) \{\s*regionsToggle\.setAttribute\('aria-pressed', ariaPressed\);\s*document\.body\.classList\.toggle\('show-regions', on\);\s*\}/,
    'applyRegionsState writes only the attribute and the body class',
  );
  assert.equal((appJs.match(/'show-regions'/g) ?? []).length, 1, 'one place writes the tint state');
  // And no .show-regions rule reaches into either poem to hide or recolour it.
  for (const m of css.matchAll(/\.show-regions[^{}]*\{[^}]*\}/g)) {
    assert.doesNotMatch(m[0], /\.poem\b|#poem-zh|\.reading\b/, `regions rule touches a reading: ${m[0]}`);
  }
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
