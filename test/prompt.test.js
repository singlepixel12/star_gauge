// test/prompt.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../src/prompt.js';

test('prompt includes every line, counts, and key instructions', () => {
  const lines = ['琴清流楚激弦商', '秦曲發聲悲摧藏', '音和詠思惟空堂', '心憂增慕懷慘傷'];
  const p = buildPrompt(lines);
  for (const l of lines) assert.ok(p.includes(l), `missing line ${l}`);
  assert.ok(p.includes('4 lines'));
  assert.ok(p.includes('1 quatrain'), 'singular quatrain');
  assert.ok(p.includes('traditional'), 'warns the model the text is traditional Chinese');
  assert.ok(/line for line|line-for-line/i.test(p), 'asks for per-line mapping');
  assert.ok(p.includes('Su Hui'), 'names the poet');
  assert.ok(/longing|separation|constancy/.test(p), 'carries the backstory themes');
});

test('prompt pluralises quatrains for 8 lines', () => {
  const lines = Array.from({ length: 8 }, (_, i) => `甲乙丙丁戊己${i}`);
  const p = buildPrompt(lines);
  assert.ok(p.includes('8 lines'));
  assert.ok(p.includes('2 quatrains'));
});
