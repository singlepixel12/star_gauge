// test/language-contract.test.js
// Guards the PER-29 language contract: the document default is English, because
// the interface copy, the control labels and the accessible names are English,
// and every Traditional-Chinese island inside it declares itself. The tests work
// on scopes rather than on wording: they pin *where* lang boundaries sit, not
// what any given sentence says, so ordinary copy edits stay free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const HAN = /\p{Script=Han}/u;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

// A deliberately small walker: index.html is hand-written, well-formed markup
// with no inline script or template syntax, so tag-and-text tokenising is enough
// to know which lang is in force at any point — and it keeps this test free of
// a DOM dependency the rest of the suite does not have.
function scan(source, visit) {
  const body = source.replace(/<!--[\s\S]*?-->/g, '');
  const stack = [{ tag: '#document', lang: null }];
  const token = /<\/?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g;
  let last = 0;
  let m;
  const emitText = (text) => {
    if (text.trim()) visit({ kind: 'text', text, lang: stack[stack.length - 1].lang, stack });
  };
  while ((m = token.exec(body)) !== null) {
    emitText(body.slice(last, m.index));
    last = token.lastIndex;
    const [, rawTag, attrs, selfClosing] = m;
    const tag = rawTag.toLowerCase();
    if (m[0][1] === '/') {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const langAttr = attrs.match(/\blang="([^"]*)"/);
    const lang = langAttr ? langAttr[1] : stack[stack.length - 1].lang;
    const frame = { tag, lang, attrs };
    visit({ kind: 'element', ...frame, stack: [...stack, frame] });
    if (!selfClosing && !VOID.has(tag)) stack.push(frame);
  }
  emitText(body.slice(last));
}

function elements() {
  const found = [];
  scan(html, (node) => { if (node.kind === 'element') found.push(node); });
  return found;
}

function elementWithId(id) {
  const el = elements().find((e) => e.attrs.includes(` id="${id}"`));
  assert.ok(el, `expected an element with id="${id}"`);
  return el;
}

const isChinese = (lang) => typeof lang === 'string' && lang.startsWith('zh');

test('the document default is English', () => {
  const root = html.match(/<html\s[^>]*>/);
  assert.ok(root, 'the root element declares its language');
  assert.match(root[0], /lang="en"/, 'the root is English, matching the interface copy');
});

// <title> takes the document's lang like any other element, but its content is
// plain text: it cannot hold child spans, so a Chinese phrase inside it could not
// be marked separately and would be announced under the root en. Keeping the
// browser title English-only is therefore the chosen product behaviour, not a
// workaround for a missing feature.
test('the document title stays English-only, since <title> holds no child markup', () => {
  const title = html.match(/<title>([\s\S]*?)<\/title>/);
  assert.ok(title, 'the page has a title');
  assert.doesNotMatch(title[1], HAN,
    'no Chinese in the title: with no span to scope it, it would be announced as English');
  assert.match(title[1], /\S/, 'the title is not empty');
});

test('every visible Chinese character sits inside a zh-Hant scope', () => {
  scan(html, (node) => {
    if (node.kind !== 'text' || !HAN.test(node.text)) return;
    assert.ok(isChinese(node.lang),
      `Chinese text ${JSON.stringify(node.text.trim())} is under lang=${node.lang ?? 'the root'}`);
    assert.equal(node.lang, 'zh-Hant', 'Chinese on this page is Traditional, never simplified');
  });
});

test('the containers JS fills with Chinese are marked, so their dynamic text inherits it', () => {
  // #grid takes all 841 cells and #poem-zh the extracted poem; neither has any
  // Chinese in the markup, so only the container can carry the boundary.
  for (const id of ['grid', 'poem-zh']) {
    assert.equal(elementWithId(id).lang, 'zh-Hant', `#${id} is a Traditional-Chinese scope`);
  }
});

test('the containers JS fills with English stay outside every Chinese scope', () => {
  // #compass in particular: its buttons are built with English aria-labels and
  // it is a sibling of #grid, not a child, so it must not inherit zh-Hant.
  for (const id of ['compass', 'progress', 'prompt-status', 'prompt-text', 'poem-en', 'copy-prompt', 'translate']) {
    assert.equal(elementWithId(id).lang, 'en',
      `#${id} holds English and its effective lang is exactly en`);
  }
});

test('the opening 心 keeps its glyph in zh-Hant and its English name in en', () => {
  const mark = elements().find((e) => /class="opening-mark"/.test(e.attrs));
  assert.ok(mark, 'the opening 心 mark is present');
  assert.equal(mark.lang, 'en',
    'the mark is announced under en: its accessible name is an English sentence');
  const label = mark.attrs.match(/aria-label="([^"]*)"/);
  assert.ok(label, 'the mark carries an accessible name');
  // aria-label is a flat string. The zh-Hant span below sits in the element's
  // content, not in the label, so it cannot language-scope anything inside it:
  // the name describes the character in English instead of quoting the glyph.
  assert.doesNotMatch(label[1], HAN, 'the accessible name is English throughout');
  assert.match(label[1], /heart character/i, 'and it still says which character this is');

  const glyph = html.match(/<p class="opening-mark"[\s\S]*?<\/p>/)[0];
  assert.match(glyph, /<span lang="zh-Hant">心<\/span>/,
    'the visible character still declares itself Traditional Chinese');
});

test('the Chinese title and the isolated names in English prose are marked', () => {
  assert.match(html, /<span class="title-zh" lang="zh-Hant">璇璣圖<\/span>/, 'the h1 title keeps its marker');
  const about = html.match(/<details class="about">[\s\S]*?<\/details>/)[0];
  for (const name of ['蘇蕙', '竇滔', '心']) {
    assert.match(about, new RegExp(`<span lang="zh-Hant">${name}</span>`),
      `${name} is marked as Chinese inside the English About prose`);
  }
  const footer = html.match(/<footer[\s\S]*?<\/footer>/)[0];
  assert.match(footer, /<span lang="zh-Hant">璇璣圖<\/span>/, 'the footer credit marks its Chinese title');
});
