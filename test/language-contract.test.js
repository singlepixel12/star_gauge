// test/language-contract.test.js
// Guards PER-29: the document declares an accurate default language, and every
// genuinely Traditional-Chinese subtree is marked lang="zh-Hant" explicitly
// rather than inheriting a document-wide zh-Hant it no longer has. Before this
// fix, <html lang="zh-Hant"> meant the (almost entirely English) UI copy and
// aria labels were announced in a Chinese voice.
//
// What is *parsed* here: index.html and src/app.js, as text/regex, in the
// manner of opening-contract.test.js and grid-surface-contract.test.js. There
// is no DOM here (no jsdom — deliberately: vanilla site, no build step), so
// lang *inheritance* down to a live DOM node cannot be executed; the generated
// cell's own lang attribute is asserted directly from buildGrid's source
// instead of relied on to inherit from #grid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GRID } from '../src/grid-data.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

// Whole element, opening tag through closing tag, e.g. <div id="grid" ...>...</div>
function element(source, id) {
  const m = source.match(new RegExp(`<([a-z]+)\\s[^>]*id="${id}"[\\s\\S]*?<\\/\\1>`, 'i'));
  assert.ok(m, `expected an element with id="${id}"`);
  return m[0];
}

// Body of a top-level `function name(` declaration, up to the next one.
function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start > -1, `expected a function ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(?:async )?function /);
  return next === -1 ? rest : rest.slice(0, next);
}

test('index.html: the document default is English', () => {
  assert.match(html, /^<!DOCTYPE html>\s*<html lang="en">/, 'the root element declares English');
  assert.doesNotMatch(html, /<html lang="zh-Hant">/, 'the old all-Chinese root lang is gone');
});

test('index.html/styles.css: UTF-8 and the CJK font stack survive the language change', () => {
  assert.match(html, /<meta charset="UTF-8" \/>/, 'the document stays UTF-8');
  assert.match(html.slice(0, 200), /<title>璇璣圖 · Star Gauge<\/title>/, 'the title keeps its traditional glyphs, byte for byte');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const cjkStack = '"Noto Serif TC", "PMingLiU", "MingLiU", "Microsoft JhengHei", "SimSun", serif';
  assert.ok(css.includes(cjkStack), 'the declared Windows CJK font stack is present, unrelated to lang=en');
});

test('index.html: every genuinely Chinese subtree is explicitly lang="zh-Hant"', () => {
  const zhSpans = [
    /<span class="title-zh" lang="zh-Hant">璇璣圖<\/span>/,                 // h1 title
    /<p class="opening-mark"[^>]*><span lang="zh-Hant">心<\/span><\/p>/,    // opening seal
    /Su Hui \(<span lang="zh-Hant">蘇蕙<\/span>\)/,                        // About: her name
    /Dou Tao\s*\(<span lang="zh-Hant">竇滔<\/span>\)/,                     // About: his name
    /character, <span lang="zh-Hant">心<\/span>/,                          // About: inline 心
    /Chinese Wikisource, <span lang="zh-Hant">璇璣圖<\/span>/,             // footer credit
  ];
  for (const re of zhSpans) {
    assert.match(html, re, `expected a zh-Hant-tagged match for ${re}`);
  }
  // The grid and the extracted poem are whole Chinese subtrees, tagged once
  // at the container rather than character by character.
  assert.match(element(html, 'grid'), /lang="zh-Hant"/, '#grid is tagged zh-Hant');
  assert.match(element(html, 'poem-zh'), /lang="zh-Hant"/, '#poem-zh is tagged zh-Hant');
});

test('index.html: the opening seal keeps an English accessible name, and a zh-Hant visible glyph', () => {
  const mark = html.match(/<p class="opening-mark"[\s\S]*?<\/p>/)[0];
  // The accessible name comes from aria-label (role="img"), so the element
  // itself must not carry lang="zh-Hant" — only its visible text node does.
  assert.doesNotMatch(mark, /^<p class="opening-mark" lang="zh-Hant"/, 'the paragraph itself is not tagged zh-Hant');
  assert.match(mark, /aria-label="心 — the heart character[^"]*"/, 'the accessible name is the English gloss');
  assert.match(mark, /<span lang="zh-Hant">心<\/span>/, 'the visible glyph is its own zh-Hant span');
});

test('index.html: English controls and ARIA labels carry no zh-Hant, and inherit the English default', () => {
  const englishBits = [
    element(html, 'undo'),
    element(html, 'reset'),
    element(html, 'regions-toggle'),
    element(html, 'progress'),
    element(html, 'copy-prompt'),
    element(html, 'translate'),
    element(html, 'poem-en'),
    element(html, 'prompt-text'),
  ];
  for (const el of englishBits) {
    assert.doesNotMatch(el, /lang="zh-Hant"/, `${el.slice(0, 40)}... must not be tagged zh-Hant`);
  }
  assert.match(html, /aria-label="controls"/, 'the controls region label stays English, inheriting the default');
  assert.match(html, /aria-label="poem grid"/, 'the grid region label stays English, inheriting the default');
});

test('src/app.js: buildGrid tags each generated cell lang="zh-Hant"', () => {
  const body = functionBody(appJs, 'buildGrid');
  assert.match(body, /el\.lang = 'zh-Hant'/, 'each cell is explicitly tagged, not left to inherit alone');
  // Still inside the 29x29 build loop, so all 841 cells get it.
  assert.match(body, /for \(let r = 0; r < 29; r\+\+\)[\s\S]*for \(let c = 0; c < 29; c\+\+\)/,
    'the lang assignment sits inside the full 29x29 loop');
});

test('src/app.js: generated cells stay plain, non-focusable divs (Roadmap 1a is out of scope)', () => {
  const body = functionBody(appJs, 'buildGrid');
  assert.match(body, /document\.createElement\('div'\)/, 'a cell is still a <div>');
  assert.doesNotMatch(body, /tabindex/i, 'no tabindex is introduced on cells by this change');
  assert.doesNotMatch(body, /setAttribute\('role'/, 'no interactive role is introduced on cells by this change');
});

test('src/grid-data.js: the transcribed grid is untouched by this change', () => {
  assert.equal(GRID.length, 29, 'still 29 rows');
  assert.equal(GRID.flat().length, 841, 'still 841 characters');
  assert.equal(GRID[14][14], '心', 'centre is still 心 at [14][14]');
  assert.equal(GRID[0][0], '琴', 'first cell unchanged');
  assert.equal(GRID[28][28], '津', 'last cell unchanged');
});
