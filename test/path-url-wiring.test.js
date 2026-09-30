// test/path-url-wiring.test.js
// PER-43: the address bar is where a traced path is kept. The codec itself is
// covered by path-codec.test.js; what is guarded here is the wiring in app.js —
// a browser module with no DOM in Node, so this uses the same small
// source-contract technique as thread-animation.test.js and
// completion-moment.test.js, plus a pure round trip through the two functions
// the app actually calls.
//
// PER-51: app.js is shared by nearly every ticket, so the wiring assertions
// below are scoped to what PER-43 owns — the seeding, the save point, the
// rewrite, the replay — and say where a thing lives rather than how many times
// the whole file mentions it.
//
// WHAT THIS FILE CANNOT COVER — needs manual validation, served over HTTP.
// There is no browser history, address bar or DOM here (no jsdom, no
// playwright — deliberately: vanilla site, no build step, no dependencies):
//   * that a copied address really reopens on the same trace in a fresh tab,
//     and that Back/Forward and a hand-edited fragment replay as expected;
//   * that tracing never adds history entries and never scrolls the page on
//     the rewrite;
//   * that an address shared from one browser opens the same poem in another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appJs, functionBody, assertOwnedBy, clickHandler } from '../test-support/app-source.js';

import { GRID } from '../src/grid-data.js';
import { createSelection } from '../src/selection.js';
import { DIRECTIONS } from '../src/geometry.js';
import { encodePath, decodePath } from '../src/path-codec.js';


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
  // Every assignment of the app's selection comes from the codec, so the empty
  // state is decodePath's job, not a second one here. Checked per assignment
  // rather than as a ban over the shared file (PER-51).
  const assignments = [...appJs.matchAll(/^\s*(?:let\s+)?selection\s*=\s*([^;\r\n]*)/gm)];
  assert.ok(assignments.length > 0, 'sanity: the app assigns its selection');
  for (const [statement, value] of assignments) {
    assert.match(value, /^decodePath\(location\.hash, GRID\)$/,
      `the empty state is the codec's job, not a second one here: ${statement.trim()}`);
  }
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
  for (const [handler, name] of [['undoBtn', 'undo'], ['resetBtn', 'reset']]) {
    assert.match(clickHandler(handler), new RegExp(String.raw`selection\.${name}\(\);\s*render\(\);`),
      `${name} is followed by a bare render()`);
  }
  // The one save point: every call of syncLocationHash lives in render, where
  // it is made exactly once — owned, not counted across the file (PER-51).
  assertOwnedBy(/(?<!function )syncLocationHash\(\)/, [renderBody], 'render is the only call site');
  assert.equal((renderBody.match(/syncLocationHash\(\)/g) ?? []).length, 1, 'and calls it exactly once');
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
  // Owned: every history write, replaceState or pushState, lives here — and
  // pushState is barred here above, so it appears nowhere in the app.
  assertOwnedBy(/\bhistory\s*\.\s*(?:replaceState|pushState)\b/, [body],
    'syncLocationHash is the only place the app writes history');
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
  // The observer callback alone, not everything after it in the file (PER-51).
  const observer = appJs.match(/new ResizeObserver\(\(\) => \{[\s\S]*?\}\)\.observe\(gridEl\)/)?.[0];
  assert.ok(observer, 'the grid resize observer is present');
  assert.match(observer, /drawThread\(\);/, 're-measure and redraw only');
  assert.doesNotMatch(observer, /render\(|syncLocationHash|history\./, 'and no save, no scroll, no rewrite');
});

test('app.js decodes the address only through the codec, and never parses it by hand', () => {
  // What PER-43 owns is the fragment's *format*, so the claim is about who may
  // interpret it, not how many times the file mentions it (PER-51). The path is
  // read out of the address only by the codec — at seeding and on hashchange —
  // and the address is written only by syncLocationHash.
  const decodes = appJs.match(/decodePath\(location\.hash, GRID\)/g) ?? [];
  assert.ok(decodes.length >= 2, 'seeding and the hashchange replay both go through the codec');
  const hashchange = appJs.match(/addEventListener\('hashchange',[\s\S]*?\n\}\);/)[0];
  assert.match(hashchange, /decodePath\(location\.hash, GRID\)/, 'the replay decodes through the codec');
  // Every literal read of the fragment lives in one of the places that take it
  // whole: the seeding, syncLocationHash's unchanged-path check, the walkthrough
  // declining on a shared link, and the hashchange replay. A new reader
  // elsewhere has to be added here deliberately. (Literal reads only — this
  // does not follow the fragment through a copied local.)
  assertOwnedBy(/location\.hash/, [
    appJs.match(/^let selection = decodePath\(location\.hash, GRID\);$/m)[0],
    functionBody(appJs, 'syncLocationHash'),
    functionBody(appJs, 'maybeStartDemo'),
    hashchange,
  ], 'location.hash is read only by the seeding, syncLocationHash, maybeStartDemo and the hashchange replay');
  // And none of those reads picks it apart by hand.
  assert.doesNotMatch(appJs, /location\.hash\s*(?:\??\.|\[)/,
    'the fragment is never parsed outside path-codec.js');
  assert.doesNotMatch(appJs,
    /\b(?:split|slice|substring|substr|match|replace|startsWith|indexOf)\([^)]*location\.hash/,
    'nor handed to a string method');
  // Nor reached around the literal: no destructured or bracketed copy.
  assert.doesNotMatch(appJs, /\{[^}]*\bhash\b[^}]*\}\s*=\s*(?:window\.)?location\b|location\s*\[/,
    'the fragment is not copied out of location by another spelling');
  // syncLocationHash writes through history.replaceState, which it alone owns
  // (above); a direct assignment anywhere would be a second writer.
  assert.doesNotMatch(appJs, /location\.hash\s*=(?!=)|location\.(?:assign|replace)\(/,
    'the address is written only by syncLocationHash');
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
