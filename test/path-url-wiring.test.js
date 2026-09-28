// test/path-url-wiring.test.js
// PER-43: the address bar is where a traced path is kept. The codec itself is
// covered by path-codec.test.js; what is guarded here is the wiring in app.js —
// a browser module with no DOM in Node, so this uses the same small
// source-contract technique as thread-animation.test.js and
// completion-moment.test.js, plus a pure round trip through the two functions
// the app actually calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GRID } from '../src/grid-data.js';
import { createSelection } from '../src/selection.js';
import { DIRECTIONS } from '../src/geometry.js';
import { encodePath, decodePath } from '../src/path-codec.js';

const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start > -1, `expected a function ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(?:async )?function /);
  return next === -1 ? rest : rest.slice(0, next);
}

const dir = (id) => DIRECTIONS.find((d) => d.id === id);

// --- the loop the app runs: render writes, load reads ---------------------

test('what the app writes is what the app reads back, state for state', () => {
  const traced = createSelection(GRID);
  traced.pickStart({ row: 10, col: 10 });
  for (const id of ['e', 's', 'w', 'n']) traced.addLine(dir(id));

  // syncLocationHash writes exactly this; the next load decodes exactly that.
  const restored = decodePath(encodePath(traced.path()), GRID);
  assert.deepEqual(restored.path(), traced.path());
  assert.deepEqual(restored.allLines(), traced.allLines());
  assert.deepEqual(restored.extractedLines(), traced.extractedLines());
  assert.equal(restored.canExtract(), true, 'a restored quatrain still offers its prompt');
  // And the fragment it settles on is stable, so no render rewrites the address
  // a second time for a path that has not changed.
  assert.equal(encodePath(restored.path()), encodePath(traced.path()));
});

test('an unreadable address decodes to the same empty state as no address', () => {
  for (const fragment of ['', '#', '#v9;10,10;e', '#v1;10,10;e,', '#v1;14,14']) {
    const decoded = decodePath(fragment, GRID);
    assert.equal(decoded.lineCount(), 0, `${fragment} restores nothing`);
    assert.equal(decoded.currentAnchor(), null, `${fragment} restores no start`);
    // …and the app then writes '' back, clearing the bad fragment quietly.
    assert.equal(encodePath(decoded.path()), '', `${fragment} is not written back out`);
  }
});

// --- how app.js is wired to the address -----------------------------------

test('the first selection comes from the address, and can be replaced by it', () => {
  assert.match(
    appJs,
    /^let selection = decodePath\(location\.hash, GRID\);$/m,
    'the module opens on whatever path the fragment names',
  );
  assert.doesNotMatch(appJs, /createSelection\(/, 'the empty state is the codec\'s job, not a second one here');
  // The seeding has to happen before anything is painted.
  assert.ok(
    appJs.indexOf('let selection = decodePath') < appJs.indexOf('renderRestoredPath();'),
    'the path is replayed before the first render',
  );
});

test('every render ends by putting the current path in the address', () => {
  const renderBody = functionBody(appJs, 'render');
  assert.match(renderBody, /syncLocationHash\(\);/, 'render is the single save point');
  // Undo, reset and picking a start all go through a bare render(), so none of
  // them needs to remember to write the fragment itself.
  assert.match(functionBody(appJs, 'onCellClick'), /render\(\);/);
  // Undo and Reset now also cancel a pending walkthrough (PER-46), so they are
  // no longer one-liners — but they still finish with the same bare render(),
  // which is the only thing this test cares about.
  for (const name of ['undo', 'reset']) {
    const from = appJs.indexOf(`selection.${name}();`);
    assert.ok(from > -1, `${name} is called from a handler`);
    assert.match(appJs.slice(from, from + 120), /render\(\);/, `${name} is followed by a bare render()`);
  }
  assert.equal(
    (appJs.match(/syncLocationHash\(\)/g) ?? []).length,
    2,
    'exactly one call site, plus the declaration',
  );
});

test('the address is rewritten in place, carrying only coordinates and ids', () => {
  const body = functionBody(appJs, 'syncLocationHash');
  assert.match(body, /encodePath\(selection\.path\(\)\)/, 'the fragment is the encoded path, nothing else');
  assert.match(body, /history\.replaceState\(/, 'one evolving state, not a stack of pages');
  assert.doesNotMatch(body, /pushState/, 'the trace does not fill the Back button');
  assert.doesNotMatch(body, /location\.hash\s*=|location\.(?:assign|replace)\(/, 'no navigation, and no hashchange back at us');
  assert.match(body, /location\.pathname.*location\.search/, 'the rest of the address survives the rewrite');
  assert.match(body, /if \(fragment === location\.hash\) return;/, 'an unchanged path writes nothing');
  // Nothing of the cloth itself may reach the URL.
  assert.doesNotMatch(body, /extractedLines|poemZhEl|GRID/, 'no character of the poem is ever stored');
  assert.equal((appJs.match(/history\./g) ?? []).length, 1, 'this is the only place the app touches history');
});

test('a fragment arriving later replaces the cloth through the same replay', () => {
  const listener = appJs.match(/addEventListener\('hashchange',[\s\S]*?\n\}\);/);
  assert.ok(listener, 'expected a hashchange listener');
  assert.match(listener[0], /selection = decodePath\(location\.hash, GRID\);/, 'the new address is replayed, not patched');
  assert.match(listener[0], /renderRestoredPath\(\);/, 'and shown settled, like any restored path');
  // PER-49: a pending "Reset again?" belonged to the trace the address just replaced.
  assert.match(listener[0], /endResetConfirmation\(\);[\s\S]*renderRestoredPath\(\);/,
    'a new address drops a pending reset question before replaying');
});

test('asking to reset leaves the address alone; only the confirmed reset rewrites it', () => {
  const handler = appJs.match(/resetBtn\.addEventListener\('click', \(\) => \{[\s\S]*?\r?\n\}\);/)[0];
  const askAt = handler.indexOf("=== 'confirm'");
  assert.ok(askAt > -1, 'Reset asks before clearing a longer trace');
  const confirmBranch = handler.slice(askAt, handler.indexOf('}', askAt));
  assert.doesNotMatch(confirmBranch, /render\(|syncLocationHash|history\.|selection\.reset/,
    'the first press writes nothing to the address');
  assert.doesNotMatch(functionBody(appJs, 'askResetConfirmation'), /render\(|syncLocationHash|history\./);
});

test('a resize redraws without touching the address', () => {
  const observer = appJs.slice(appJs.indexOf('new ResizeObserver('));
  assert.match(observer, /drawThread\(\);/, 're-measure and redraw only');
  assert.doesNotMatch(observer, /render\(|syncLocationHash|history\./, 'and no save, no scroll, no rewrite');
});

test('app.js reads the address only through the codec and these two places', () => {
  const reads = appJs.match(/location\.hash/g) ?? [];
  assert.equal(reads.length, 4,
    'seeding, the hashchange replay, the unchanged-path check, and the walkthrough declining on a shared link');
  // Narrowed for PER-46. The claim was, and remains, that the URL is the only
  // memory *of the poem*: no trace, path or selection is ever written to device
  // storage. PER-46 stores one flag — whether this reader has already been shown
  // the walkthrough — which remembers a reader, not a cloth.
  const stored = appJs.match(/(?:local|session)Storage\.\w+\(([^)]*)\)/g) ?? [];
  for (const call of stored) {
    assert.match(call, /DEMO_STORAGE_KEY/,
      'the only thing stashed on the device is the demonstration-seen flag');
  }
  assert.doesNotMatch(appJs, /(?:local|session)Storage[^;]*(?:encodePath|selection\.path|location\.hash)/,
    'no traced path is ever written to device storage');
});
