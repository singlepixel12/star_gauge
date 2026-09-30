// test-support/app-source.js
// The small source-contract helpers the app.js wiring tests share (PER-51).
// app.js is a browser module with no DOM in Node, so these tests read its text;
// keeping one copy of each helper keeps them from drifting apart.
// It lives outside test/ so that `node --test`, which runs every .js file under
// test/, does not count it as a test file of its own.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

// Body of a top-level `function name(` or `async function name(` declaration,
// up to the next one. Both are found at their `function` keyword, so the slice
// starts at the same place either way (one character in, as it always has).
export function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start > -1, `expected a function ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(?:async )?function /);
  return next === -1 ? rest : rest.slice(0, next);
}

// Every match of `pattern` in app.js lies inside one of `owners` — slices of
// app.js such as a functionBody. Ownership rather than a count (PER-51): an
// unrelated ticket's edit elsewhere in the shared file cannot trip it, but a
// second writer of the thing a test owns still does.
export function assertOwnedBy(pattern, owners, message) {
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
export function clickHandler(name) {
  const m = appJs.match(new RegExp(String.raw`${name}\.addEventListener\('click', \(\) => \{[\s\S]*?\r?\n\}\);`));
  assert.ok(m, `expected the ${name} click handler`);
  return m[0];
}
