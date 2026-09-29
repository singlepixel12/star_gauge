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

// Every match of `pattern` in app.js lies inside one of `owners` — slices of
// app.js. Ownership rather than a count (PER-51): an unrelated edit elsewhere
// in the shared file cannot trip it, but a second owner still does.
function assertOwnedBy(pattern, owners, message) {
  const ranges = owners.map((slice) => {
    const at = appJs.indexOf(slice);
    assert.ok(at > -1, 'each owner is a slice of app.js');
    return [at, at + slice.length];
  });
  const matches = [...appJs.matchAll(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))];
  assert.ok(matches.length > 0, `sanity: ${pattern} occurs in app.js`);
  for (const m of matches) {
    assert.ok(ranges.some(([from, to]) => m.index >= from && m.index < to),
      `${message} (found ${JSON.stringify(m[0])} at offset ${m.index})`);
  }
}

// A top-level click handler, whole, from its addEventListener to its closing line.
function clickHandler(name) {
  const m = appJs.match(new RegExp(String.raw`${name}\.addEventListener\('click', \(\) => \{[\s\S]*?\r?\n\}\);`));
  assert.ok(m, `expected the ${name} click handler`);
  return m[0];
}

const dir = (id) => DIRECTIONS.find((d) => d.id === id);

// --- who may pick the fragment apart ---------------------------------------

// `location.hash`, as a whole value — bare, or reached through window,
// document or globalThis, all of which name the same Location.
const HASH = String.raw`(?<![\w$.])(?:(?:window|document|globalThis)\s*\.\s*)?location\s*\.\s*hash\b`;
const WHOLE = String.raw`[ \t]*(?=[;,)}\r\n]|$)`;
const escapeName = (n) => n.replace(/\$/g, '\\$');

// Comments blanked to spaces (line breaks kept, so offsets and line ends hold).
// String and template literals are copied through untouched, so a '//' inside
// one is not mistaken for a comment. app.js has no regex literals, so this does
// not try to tell one from a division.
function withoutComments(source) {
  let out = '';
  for (let i = 0; i < source.length;) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== c) j += source[j] === '\\' ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && (source[i + 1] === '/' || source[i + 1] === '*')) {
      const line = source[i + 1] === '/';
      const close = line ? source.indexOf('\n', i) : source.indexOf('*/', i + 2);
      const end = close === -1 ? source.length : line ? close : close + 2;
      out += source.slice(i, end).replace(/[^\r\n]/g, ' ');
      i = end;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

// Every simple binding `name = value`, in source order, with what the value is:
// the fragment itself, a whole-value copy of another name, or anything else.
// `at` is where the value starts, so a binding is in effect only after it.
function bindingsIn(source) {
  const hashValue = new RegExp(String.raw`^(?:${HASH})${WHOLE}`);
  const aliasValue = new RegExp(String.raw`^([\w$]+)${WHOLE}`);
  const bindings = new Map();
  for (const m of source.matchAll(/(?<![\w$.])([\w$]+)\s*=(?![=>])\s*/g)) {
    const at = m.index + m[0].length;
    const rest = source.slice(at);
    const alias = rest.match(aliasValue)?.[1];
    const value = hashValue.test(rest) ? { hash: true } : alias !== undefined ? { alias } : {};
    if (!bindings.has(m[1])) bindings.set(m[1], []);
    bindings.get(m[1]).push({ at, ...value });
  }
  return bindings;
}

// Does `name`, read at offset `at`, hold the fragment? The binding in effect is
// the last one before the read, so an unrelated reassignment clears it. A read
// before any binding (a function body run later, a chain written backwards) is
// held by whichever binding of the name might have run by then.
function holdsHash(bindings, name, at, seen = new Set()) {
  const key = `${name}@${at}`;
  if (seen.has(key)) return false;
  seen.add(key);
  const all = bindings.get(name) ?? [];
  const prior = all.filter((b) => b.at < at);
  const inEffect = prior.length > 0 ? [prior.at(-1)] : all;
  return inEffect.some((b) => b.hash || (b.alias !== undefined && holdsHash(bindings, b.alias, b.at, seen)));
}

// Each place `source` parses the fragment by hand: a member access or index on
// location.hash or on any local holding it at that point, or either handed to a
// string method. Plain reads — a truthiness test, a comparison,
// decodePath(location.hash, …) — are not parsing and are not reported.
function hashParsesIn(raw) {
  const source = withoutComments(raw);
  const bindings = bindingsIn(source);
  const names = [...bindings.keys()].map((n) => String.raw`(?<![\w$.])${escapeName(n)}\b`);
  const read = [HASH, ...names].join('|');
  const parse = new RegExp([
    String.raw`(${read})\s*(?:\??\.\s*[\w$]|\[)`,
    String.raw`\b(?:split|slice|substring|substr|match|replace|startsWith|indexOf)\([^)]*?(${read})`,
  ].join('|'), 'g');
  const isHash = new RegExp(String.raw`^(?:${HASH})$`);
  return [...source.matchAll(parse)].filter((m) => {
    const token = m[1] ?? m[2];
    const at = m[1] !== undefined ? m.index : m.index + m[0].length - token.length;
    return isHash.test(token) || holdsHash(bindings, token, at);
  }).map((m) => m[0]);
}

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
  // Owned: the in-place rewrite. Other history APIs are not PER-43's to ban
  // across the shared file; the rewrite details above stay scoped to here.
  assertOwnedBy(/\bhistory\s*\.\s*replaceState\b/, [body], 'syncLocationHash is the only place the app rewrites the address');
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

test('checker: an unrelated read of the fragment passes; a hand parse, however copied, fails', () => {
  const seeded = 'let selection = decodePath(location.hash, GRID);\n';
  const passes = {
    'seeding through the codec': seeded,
    'an unrelated truthiness check': `${seeded}if (location.hash) showHint();`,
    'through the window': `${seeded}if (window.location.hash) showHint();`,
    'a whole-value comparison': `${seeded}if (fragment === location.hash) return;`,
    'a copied local, only tested': `${seeded}const raw = location.hash;\nif (raw) showHint();`,
    'the codec at the end of a chain': `${seeded}const raw = location.hash;\nconst again = raw;\ndecodePath(again, GRID);`,
    'through the document, only tested': `${seeded}if (document.location.hash) showHint();`,
    'reassigned before it is parsed': 'let raw = location.hash;\nraw = other;\nraw.slice(1);',
    'a chain cut by a reassignment': 'let raw = location.hash;\nconst copy = raw;\nraw = other;\nconst again = raw;\nagain.slice(1);',
    'a comment-like string is not a comment': "const raw = '/* location.hash */'; raw.slice(1);",
  };
  for (const [name, src] of Object.entries(passes)) {
    assert.deepEqual(hashParsesIn(src), [], `${name} passes`);
  }
  const fails = {
    'a direct slice': 'const id = location.hash.slice(1);',
    'a direct split through the window': "window.location.hash.split(';');",
    'an index': 'const first = location.hash[1];',
    'handed to a string method': "const n = ''.indexOf(location.hash);",
    'a copied local, sliced': 'const raw=location.hash; raw.slice(1)',
    'a chained copy, split': "const raw = location.hash;\nlet copy;\ncopy = raw;\nconst again = copy;\nagain.split(';');",
    'a chain written backwards': 'function f() { return b.slice(1); }\nconst b = a;\nconst a = location.hash;',
    'optional chaining on a copy': 'const raw = location.hash;\nraw?.slice(1);',
    'a direct slice through the document': 'document.location.hash.slice(1);',
    'a direct split through globalThis': "globalThis.location.hash.split(';');",
    'the document handed to a string method': "''.startsWith(document . location . hash);",
    'a copy of the document': 'const raw = document.location.hash;\nraw.slice(1);',
    'a chained copy of globalThis': 'const raw = globalThis.location.hash;\nconst again = raw;\nagain[0];',
    'a comment before the semicolon': 'const raw = location.hash /* note */; raw.slice(1)',
    'a comment in a chain': 'const raw = location.hash; // the fragment\nconst again = raw /* copy\n */;\nagain.slice(1);',
    'reassigned back to the fragment': 'let raw = location.hash;\nraw = other;\nraw = location.hash;\nraw.slice(1);',
    'sliced before an unrelated reassignment': 'let raw = location.hash;\nraw.slice(1);\nraw = other;',
  };
  for (const [name, src] of Object.entries(fails)) {
    assert.notDeepEqual(hashParsesIn(src), [], `${name} fails`);
  }
  // Names bound to something else stay free, even if they look like the fragment.
  assert.deepEqual(hashParsesIn('const hash = encodePath(path);\nhash.slice(1);'), [], 'a name is not the fragment by spelling');
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
  // Any other read takes the fragment whole — the unchanged-path check, the
  // walkthrough declining on a shared link, or anything later that only asks
  // whether there is one — and never picks it apart by hand, neither directly
  // nor through a copied local, however many times copied (hashParsesIn).
  assert.deepEqual(hashParsesIn(appJs), [], 'the fragment is never parsed outside path-codec.js');
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
