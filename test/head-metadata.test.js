import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const faviconPath = new URL('../favicon.svg', import.meta.url);
const favicon = readFileSync(faviconPath, 'utf8');
const description = '探索蘇蕙的迴文詩《璇璣圖》，從八百四十一字方陣中循線讀出七言詩句。';

function head() {
  const match = html.match(/<head>[\s\S]*?<\/head>/i);
  assert.ok(match, 'the document has a head');
  return match[0];
}

function count(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

test('index.html: preserves the established document identity', () => {
  assert.equal(count(html, /<title>[\s\S]*?<\/title>/gi), 1, 'one title element');
  assert.match(html, /<html\s+lang="zh-Hant">/i, 'traditional-Chinese language declaration is unchanged');
  assert.match(html, /<title>璇璣圖 · Star Gauge<\/title>/, 'the established title is unchanged');
});

test('index.html: adds the shared-page description exactly once', () => {
  const documentHead = head();
  const escaped = description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.equal(count(documentHead, /<meta\s+name="description"\s+content="[^"]*"\s*\/>/gi), 1, 'one description meta tag');
  assert.match(documentHead, new RegExp(`<meta\\s+name="description"\\s+content="${escaped}"\\s*/>`), 'description copy is exact');
  assert.equal(count(documentHead, /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/gi), 1, 'one Open Graph title');
  assert.match(documentHead, /<meta\s+property="og:title"\s+content="璇璣圖 · Star Gauge"\s*\/>/);
  assert.equal(count(documentHead, /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/gi), 1, 'one Open Graph description');
  assert.match(documentHead, new RegExp(`<meta\\s+property="og:description"\\s+content="${escaped}"\\s*/>`), 'Open Graph description copy is exact');
});

test('index.html: links a local SVG favicon without advertising an unstable image URL', () => {
  const documentHead = head();
  assert.equal(count(documentHead, /<link\s+rel="icon"[^>]*>/gi), 1, 'one favicon link');
  assert.match(documentHead, /<link\s+rel="icon"\s+href="favicon\.svg"\s+type="image\/svg\+xml"\s*\/>/);
  assert.doesNotMatch(documentHead, /property="og:image"/i, 'no relative or unsettled Open Graph image');
  assert.equal(existsSync(faviconPath), true, 'the favicon is committed as a static file');
});

test('favicon.svg: is self-contained and carries the page motif', () => {
  assert.match(favicon, /^<svg\s[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(favicon, /viewBox="0 0 64 64"/);
  assert.match(favicon, /<text[\s\S]*>心<\/text>/, 'the heart character is rendered in the icon');
  assert.doesNotMatch(favicon, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/, 'no remote asset or font dependency');
});
