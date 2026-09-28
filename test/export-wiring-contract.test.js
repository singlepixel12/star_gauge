// test/export-wiring-contract.test.js
// PER-47: how the export action is wired into the page. There is no DOM or
// canvas in this repo's test runner, so the handler is checked as a source
// contract: what it waits for, what it reads, and what it must never touch.
//
// WHAT THIS FILE CANNOT COVER — needs browser validation: the PNG's pixels
// against the on-screen trace, font fallback, and the download itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const exportJs = readFileSync(new URL('../src/export-image.js', import.meta.url), 'utf8');

// Body of a top-level function declaration, through the next top-level
// function — the same source-contract technique the sibling suites use.
function functionBody(source, name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start > -1, `expected a function ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(?:async )?function /);
  return next === -1 ? rest : rest.slice(0, next);
}

const withoutComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Index just past the </div> matching the <div …> that opens at `start`.
function matchingDivEnd(source, start) {
  const tags = /<div\b[^>]*>|<\/div>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m; (m = tags.exec(source));) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return tags.lastIndex;
  }
  assert.fail('unclosed <div>');
}

test('index.html: an accessible export button in its own row of #output, outside every card and the controls bar', () => {
  const controls = html.match(/<section class="controls"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(controls, /export-image/, 'the four-item sticky bar is left alone');
  // The poem card holds readings only, never controls — and output-contract.test.js
  // reads "the poem card" as everything up to the prompt card — so the action
  // is a separate full-width row after the utility cards, last in #output.
  const output = html.match(/<section class="output"[\s\S]*?<\/section>/)[0];
  const utilities = output.indexOf('<div class="card prompt-block">');
  assert.doesNotMatch(output.slice(0, utilities), /export-image|export-note/, 'not in the poem card’s span');
  const lastCardStart = output.indexOf('<div class="card english-block">');
  const lastCardEnd = matchingDivEnd(output, lastCardStart);
  const row = output.slice(lastCardEnd).match(/<div class="export-row"[^>]*>[\s\S]*?<\/div>/);
  assert.ok(row, 'a dedicated .export-row inside #output, after the last card, so it appears with the poem');
  for (const card of output.matchAll(/<div class="card\b/g)) {
    const span = output.slice(card.index, matchingDivEnd(output, card.index));
    assert.doesNotMatch(span, /export-image/, 'inside no card at all');
  }
  const btn = row[0].match(/<button[^>]*id="export-image"[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(btn, 'a real <button> in the export row');
  assert.match(row[0], /id="export-note"/, 'its caveat travels with it');
  assert.match(btn[0], /type="button"/);
  assert.match(btn[1], /\S/, 'with a visible text name');
  const describedBy = btn[0].match(/aria-describedby="([^"]+)"/);
  assert.ok(describedBy, 'and a description of what the image holds');
  const note = html.match(new RegExp(`id="${describedBy[1]}"[^>]*>([\\s\\S]*?)</`));
  assert.ok(note, 'the description exists');
  assert.match(note[1], /colour regions/i, 'it says the stylized regions are left out');
});

test('src/app.js: the button runs the export handler, which the demo does not treat as a takeover', () => {
  assert.match(appJs, /import \{[^}]*buildExportScene[^}]*paintScene[^}]*\} from '\.\/export-image\.js';/);
  assert.match(appJs, /exportBtn\.addEventListener\('click', onExportImage\)/);
  // A trusted click on export must not cancel the walkthrough and clear the trace.
  assert.match(functionBody(appJs, 'onVisitorAction'), /exportBtn\.contains\(event\.target\)/);
});

test('src/app.js: the export snapshots the trace once, waits for fonts, and writes a PNG', () => {
  const body = withoutComments(functionBody(appJs, 'onExportImage'));
  assert.equal(body.match(/selection\.allLines\(\)/g)?.length, 1, 'the selection is read exactly once');
  assert.ok(
    body.indexOf('selection.allLines()') < body.indexOf('await'),
    'and read before any await, so a move during the wait cannot change the picture',
  );
  assert.match(body, /await document\.fonts\.ready/, 'glyphs are rasterized only once fonts have settled');
  assert.match(body, /buildExportScene\(GRID, /, 'the characters come from GRID itself');
  assert.match(body, /paintScene\(/);
  assert.match(body, /toBlob\([^)]*'image\/png'/, 'a PNG, from the browser’s own canvas encoder');
});

test('src/app.js: exporting is a snapshot — no render, no state, address, scroll or reveal', () => {
  const bodies = ['onExportImage', 'saveBlob'].map((n) => withoutComments(functionBody(appJs, n))).join('\n');
  const forbidden = [
    [/\brender\(/, 'render'],
    [/selection\.(pickStart|addLine|undo|reset)\(/, 'selection mutation'],
    [/selection\s*=/, 'selection replacement'],
    [/\blocation\b|history\.|syncLocationHash/, 'the address'],
    [/scrollIntoView|scrollTo|scrollBy|scrollTop|scrollLeft|\.focus\(/, 'scrolling'],
    [/positionCompass|compassEl/, 'the compass'],
    [/Reveal|CompletionMoment|is-complete/, 'the completion reveal'],
    [/regionAt|show-regions|regionsToggle/, 'the stylized colour regions'],
    [/\.(append|appendChild|prepend|insertBefore|replaceChildren)\(/, 'the page’s DOM'],
  ];
  for (const [pattern, what] of forbidden) {
    assert.doesNotMatch(bodies, pattern, `export must not touch ${what}`);
  }
});

test('src/export-image.js: pure, and blind to the stylized colour regions', () => {
  const code = withoutComments(exportJs);
  assert.doesNotMatch(code, /regions\.js|regionAt/, 'no region tint can reach the image');
  assert.doesNotMatch(code, /\b(document|window|location|history)\b/, 'no page access in the pure module');
});

test('src/app.js: the export button keeps focus and speaks its outcome through the polite status', () => {
  const body = withoutComments(functionBody(appJs, 'onExportImage'));
  // Disabling (or hiding) the focused button would drop keyboard focus to <body>.
  assert.doesNotMatch(body, /exportBtn\.(disabled|hidden|inert|tabIndex)|setAttribute\('(disabled|tabindex|inert|hidden)'/,
    'the button is never disabled, hidden or taken out of the tab order while exporting');
  assert.doesNotMatch(body, /exportBtn\.remove\(|\.blur\(/, 'and never removed or blurred');
  // A second click during an export is absorbed by a guard instead.
  assert.match(body, /if \(exportInFlight\) return;/, 'an in-flight guard stands in for disabled');
  assert.match(body, /exportInFlight = true;/);
  assert.match(body, /finally \{[\s\S]*exportInFlight = false;/, 'released however the export ends');
  // A changed button label is not reliably announced; the page's one polite
  // live region (#progress, role="status" — see grid-keyboard-contract) is.
  assert.doesNotMatch(body, /exportBtn\.textContent/, 'no visual-only label feedback');
  const tryBlock = body.slice(body.indexOf('try {'), body.indexOf('} catch'));
  const catchBlock = body.slice(body.indexOf('} catch'), body.indexOf('} finally'));
  assert.match(body.slice(0, body.indexOf('try {')), /announce\(EXPORT_WORKING\)/, 'progress is announced as it starts');
  assert.match(tryBlock, /announce\(EXPORT_SAVED\)/, 'success is announced');
  assert.match(catchBlock, /announce\(EXPORT_FAILED\)/, 'failure is announced');
  for (const name of ['EXPORT_WORKING', 'EXPORT_SAVED', 'EXPORT_FAILED']) {
    assert.match(appJs, new RegExp(`const ${name} = '[^']+';`), `${name} is real copy`);
  }
  assert.match(html, /<span id="progress" class="progress" role="status">/, 'the polite live region it speaks through');
});
