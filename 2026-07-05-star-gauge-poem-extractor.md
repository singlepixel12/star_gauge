# Star Gauge Poem Extractor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `CLAUDE.md` first — especially the Chinese-language intricacies.

**Goal:** Build a static single-page site rendering Su Hui's authentic 29×29 (841-char) traditional-Chinese "Star Gauge" grid, letting the user trace connected 7-character lines to extract a Chinese poem, then produce a copy-ready LLM prompt and a placeholder English-poem area, with an inactive (scaffolded) OpenAI integration and an optional stylized colour-region tint.

**Architecture:** Vanilla HTML/CSS/JS, no build step. Pure, DOM-free logic modules (`geometry`, `selection`, `prompt`, `translate`, `regions`, `grid-data`) are unit-tested with Node's built-in test runner; `app.js` wires them to the DOM. The OpenAI call is written but guarded off (`LLM_ENABLED = false`) and never invoked in v1.

**Tech Stack:** HTML5, CSS Grid, ES modules, Node `node:test` (dev/testing only). No dependencies.

---

## Design Context (read before starting)

**The poem's rules (as implemented in v1):**
- Grid is 29×29 = 841 chars. Original 840 + a central 心 added later. `GRID[14][14] === '心'`.
- The centre 心 belongs to no poem: it is inert and excluded from every line.
- A **line** = 7 characters in a straight run, in any of **8 directions** (H/V/diagonal, forward/back).
- A **path** = connected lines: each line after the first **starts on the cell where the previous line ended** (a shared "meridian junction" character).
- **Minimum to extract:** ≥4 lines and a multiple of 4 (a whole number of quatrains).
- Enforcement is **geometry only** — no rhyme/tone checking.

**Out of scope for v1:** rhyme validation, region-specific reading grammars (blue 3-char mode, circular border poem), any live OpenAI call.

**File structure:**
| File | Responsibility |
|------|----------------|
| `package.json` | `"type": "module"` + `test` script. |
| `index.html` | Page skeleton: grid, controls, output (Chinese poem, prompt, English area). |
| `styles.css` | Grid layout, highlighting, colour-region tints, output styling. |
| `src/grid-data.js` | `GRID` (29×29 `string[][]`) + `CENTER`. |
| `src/geometry.js` | Direction vectors, valid-run detection, `validDirectionsFrom`. Pure. |
| `src/regions.js` | `regionAt(row,col)` stylized colour map. Pure, display-only. |
| `src/selection.js` | Path state: `pickStart`, `addLine`, `undo`, `reset`, `canExtract`, `extractedLines`. Pure. |
| `src/prompt.js` | `buildPrompt(lines)`. Pure. |
| `src/translate.js` | `buildOpenAIRequest`, `translatePoem` (never called in v1). |
| `src/app.js` | DOM wiring. |
| `test/*.test.js` | Unit tests. |

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `styles.css`
- Create: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "star-gauge",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
node_modules/
.DS_Store
*.log
```

- [ ] **Step 3: Create minimal `index.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>璇璣圖 · Star Gauge</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header>
    <h1>璇璣圖 · Star Gauge</h1>
    <p class="tagline">Trace a path through Su Hui's reversible poem. 7 characters per line, 4 lines per quatrain.</p>
  </header>

  <main>
    <section class="controls">
      <button id="undo" type="button" disabled>Undo line</button>
      <button id="reset" type="button" disabled>Reset</button>
      <label class="toggle"><input id="regions-toggle" type="checkbox" /> Show colour regions <span class="hint">(stylized / approximate)</span></label>
      <span id="progress" class="progress">Click a character to begin.</span>
    </section>

    <section id="grid" class="grid" aria-label="29 by 29 character grid"></section>

    <section class="output" id="output" hidden>
      <button id="extract" type="button" disabled>Extract poem</button>
      <div class="poem-chinese">
        <h2>Extracted poem</h2>
        <pre id="poem-zh" class="poem"></pre>
      </div>
      <div class="prompt-block">
        <h2>Translation prompt</h2>
        <textarea id="prompt-text" class="prompt-text" readonly rows="8"></textarea>
        <button id="copy-prompt" type="button">Copy translation prompt</button>
      </div>
      <div class="english-block">
        <h2>English poem</h2>
        <textarea id="poem-en" class="poem-en" rows="8"
          placeholder="The English translation will appear here — paste it, or wire up the OpenAI call."></textarea>
        <button id="translate" type="button" disabled title="OpenAI integration is scaffolded but disabled in v1">Translate with OpenAI (disabled)</button>
      </div>
    </section>
  </main>

  <script type="module" src="src/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create minimal `styles.css`**

```css
:root {
  --cell: 26px;
  --ink: #1a1a1a;
  --paper: #f7f2e7;
  --line: #c9a227;
  --start: #2e7d32;
  --center: #b23b3b;
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 1.5rem;
  font-family: system-ui, "Noto Sans", sans-serif;
  background: var(--paper); color: var(--ink);
}
header h1 { margin: 0; font-size: 1.6rem; }
.tagline { color: #555; margin: .25rem 0 1rem; }
.controls { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; margin-bottom: 1rem; }
.controls .hint { color: #888; font-size: .8em; }
.progress { color: #444; }
.grid {
  display: grid;
  grid-template-columns: repeat(29, var(--cell));
  grid-template-rows: repeat(29, var(--cell));
  gap: 1px; width: max-content;
  background: #d8cdb5; border: 1px solid #b3a684;
}
.cell {
  display: flex; align-items: center; justify-content: center;
  background: var(--paper); font-size: 15px; line-height: 1;
  cursor: pointer; user-select: none;
  font-family: "Noto Serif TC", "Songti TC", serif;
}
.cell:hover { outline: 1px solid var(--line); }
.cell.center { color: var(--center); font-weight: 700; cursor: default; }
.cell.center:hover { outline: none; }
.cell.in-line { background: #fbeec1; }
.cell.start { background: #c8e6c9; outline: 2px solid var(--start); }
.cell.candidate { outline: 2px dashed var(--line); }
.output { margin-top: 1.5rem; max-width: 640px; }
.poem { font-size: 1.3rem; letter-spacing: .3em; line-height: 1.8; }
.prompt-text, .poem-en { width: 100%; font-family: inherit; }
button:disabled { opacity: .5; cursor: not-allowed; }
```

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore index.html styles.css
git commit -m "chore: scaffold static site skeleton"
```

---

## Task 2: Grid data (`src/grid-data.js`)

**This task is transcription + verification, not invention.** The 841 characters must be sourced from a reliable published transcription and verified. Do not fabricate characters.

**Files:**
- Create: `src/grid-data.js`
- Test: `test/grid-data.test.js`

- [ ] **Step 1: Write the failing structural test**

```js
// test/grid-data.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRID, CENTER } from '../src/grid-data.js';

test('grid is 29 rows', () => {
  assert.equal(GRID.length, 29);
});

test('every row has 29 columns of single characters', () => {
  for (const row of GRID) {
    assert.equal(row.length, 29);
    for (const ch of row) {
      assert.equal([...ch].length, 1, `cell "${ch}" must be exactly one character`);
    }
  }
});

test('grid has 841 characters total', () => {
  const total = GRID.reduce((n, row) => n + row.length, 0);
  assert.equal(total, 841);
});

test('centre is 心', () => {
  assert.deepEqual(CENTER, { row: 14, col: 14 });
  assert.equal(GRID[CENTER.row][CENTER.col], '心');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/grid-data.test.js`
Expected: FAIL — cannot find module `../src/grid-data.js`.

- [ ] **Step 3: Source and transcribe the grid**

Fetch the full 29×29 text from reliable sources and cross-check at least two:
- gushiwen: https://m.gushiwen.cn/shiwenv_f75ec0543be7.aspx
- Baidu Baike: https://baike.baidu.com/item/%E7%92%87%E7%8E%91%E5%9B%BE/283427
- shuge.org (scanned reconstruction): https://www.shuge.org/meet/topic/64744/

Rules while transcribing (see `CLAUDE.md`):
- Keep **traditional** characters; do NOT convert to simplified. Save UTF-8.
- The base figure is **840** characters; insert **心** at the exact centre so the
  full grid is **841** and `GRID[14][14] === '心'`.
- Verify each row is exactly 29 characters (count, do not eyeball). Watch for
  variant/異體 characters and full/half-width mistakes.
- Cross-check the **outer border ring** against a second source, since it is the
  most-reproduced part; flag any cell where sources disagree in a comment.

Write the module in this exact shape (fill the 29 strings with the sourced rows;
each string is exactly 29 chars, centre row's 15th char is 心):

```js
// src/grid-data.js
// Su Hui's 璇璣圖 (Star Gauge), 29×29 = 841 traditional-Chinese characters.
// Base figure is 840 chars; the central 心 (row 14, col 14, 0-indexed) was added later.
// Sourced/cross-checked from gushiwen, Baidu Baike, and shuge.org (see plan Task 2).
const ROWS = [
  "…29 chars…", // row 0
  // … rows 1–13 …
  "……………心…………………………………", // row 14 — 15th char MUST be 心
  // … rows 15–28 …
  "…29 chars…", // row 28
];

export const GRID = ROWS.map((r) => [...r]);
export const CENTER = { row: 14, col: 14 };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/grid-data.test.js`
Expected: PASS (all 4 tests). If the 29/29/841 or centre assertions fail, the
transcription is wrong — fix the offending row, do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git add src/grid-data.js test/grid-data.test.js
git commit -m "feat: add verified 841-char Star Gauge grid data"
```

---

## Task 3: Geometry (`src/geometry.js`)

**Files:**
- Create: `src/geometry.js`
- Test: `test/geometry.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// test/geometry.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECTIONS, SIZE, LINE_LENGTH, CENTER,
  inGrid, isCenter, lineCells, isValidLine, validDirectionsFrom,
} from '../src/geometry.js';

test('there are 8 directions and grid constants', () => {
  assert.equal(DIRECTIONS.length, 8);
  assert.equal(SIZE, 29);
  assert.equal(LINE_LENGTH, 7);
  assert.deepEqual(CENTER, { row: 14, col: 14 });
});

test('lineCells returns 7 cells going east from (0,0)', () => {
  const cells = lineCells({ row: 0, col: 0 }, { dr: 0, dc: 1 });
  assert.equal(cells.length, 7);
  assert.deepEqual(cells[6], { row: 0, col: 6 });
});

test('lineCells returns null when it runs off the grid', () => {
  assert.equal(lineCells({ row: 0, col: 25 }, { dr: 0, dc: 1 }), null);
});

test('isValidLine rejects a line through the centre', () => {
  const cells = lineCells({ row: 14, col: 8 }, { dr: 0, dc: 1 }); // cols 8..14 includes centre
  assert.equal(isValidLine(cells), false);
});

test('isValidLine accepts a clean 7-run', () => {
  const cells = lineCells({ row: 0, col: 0 }, { dr: 1, dc: 1 });
  assert.equal(isValidLine(cells), true);
});

test('validDirectionsFrom a corner yields only inward runs', () => {
  const dirs = validDirectionsFrom({ row: 0, col: 0 });
  // From top-left only east, south, and south-east give an in-grid 7-run.
  assert.equal(dirs.length, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/geometry.test.js`
Expected: FAIL — cannot find module `../src/geometry.js`.

- [ ] **Step 3: Implement `src/geometry.js`**

```js
// src/geometry.js — pure geometry, no DOM.
export const SIZE = 29;
export const LINE_LENGTH = 7;
export const CENTER = { row: 14, col: 14 };

export const DIRECTIONS = [
  { dr: -1, dc: 0 }, { dr: -1, dc: 1 }, { dr: 0, dc: 1 }, { dr: 1, dc: 1 },
  { dr: 1, dc: 0 }, { dr: 1, dc: -1 }, { dr: 0, dc: -1 }, { dr: -1, dc: -1 },
];

export function inGrid({ row, col }) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

export function isCenter({ row, col }) {
  return row === CENTER.row && col === CENTER.col;
}

export function lineCells(start, dir) {
  const cells = [];
  for (let i = 0; i < LINE_LENGTH; i++) {
    const cell = { row: start.row + dir.dr * i, col: start.col + dir.dc * i };
    if (!inGrid(cell)) return null;
    cells.push(cell);
  }
  return cells;
}

export function isValidLine(cells) {
  if (!cells || cells.length !== LINE_LENGTH) return false;
  return cells.every((c) => inGrid(c) && !isCenter(c));
}

export function validDirectionsFrom(start) {
  return DIRECTIONS.filter((dir) => isValidLine(lineCells(start, dir)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/geometry.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/geometry.js test/geometry.test.js
git commit -m "feat: add grid geometry and line validation"
```

---

## Task 4: Colour regions (`src/regions.js`)

Display-only stylized approximation. Five concentric bands by Chebyshev distance
from the centre, plus the centre itself. No effect on validation.

**Files:**
- Create: `src/regions.js`
- Test: `test/regions.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// test/regions.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGION_IDS, regionAt } from '../src/regions.js';

test('centre cell maps to center region', () => {
  assert.equal(regionAt(14, 14), 'center');
});

test('the four grid corners map to the border region', () => {
  for (const [r, c] of [[0, 0], [0, 28], [28, 0], [28, 28]]) {
    assert.equal(regionAt(r, c), 'border');
  }
});

test('every one of the 841 cells maps to a known region id', () => {
  const ids = new Set(REGION_IDS);
  let count = 0;
  for (let r = 0; r < 29; r++) {
    for (let c = 0; c < 29; c++) {
      assert.ok(ids.has(regionAt(r, c)), `(${r},${c}) -> ${regionAt(r, c)}`);
      count++;
    }
  }
  assert.equal(count, 841);
});

test('there are five colour bands plus the centre', () => {
  assert.equal(REGION_IDS.length, 6);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/regions.test.js`
Expected: FAIL — cannot find module `../src/regions.js`.

- [ ] **Step 3: Implement `src/regions.js`**

```js
// src/regions.js — stylized, display-only colour regions.
// NOT a scholarly cell map: an approximation by Chebyshev distance from centre.
// Swapping in a verified cell-by-cell map later only touches regionAt().
export const REGION_IDS = ['center', 'band-inner', 'band-mid', 'band-outer', 'band-far', 'border'];

export function regionAt(row, col) {
  const ring = Math.max(Math.abs(row - 14), Math.abs(col - 14)); // 0..14
  if (ring === 0) return 'center';
  if (ring === 14) return 'border';
  if (ring <= 3) return 'band-inner';
  if (ring <= 6) return 'band-mid';
  if (ring <= 9) return 'band-outer';
  return 'band-far'; // rings 10..13
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/regions.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Add region tint styles to `styles.css`**

Append:

```css
/* Stylized colour-region tints (only visible when body has .show-regions) */
.show-regions .cell.r-center    { background: #f3d0d0; }
.show-regions .cell.r-band-inner { background: #f6e0c0; }
.show-regions .cell.r-band-mid   { background: #e2eccb; }
.show-regions .cell.r-band-outer { background: #cfe3e6; }
.show-regions .cell.r-band-far   { background: #d9d3ea; }
.show-regions .cell.r-border     { background: #eadfc8; }
```

- [ ] **Step 6: Commit**

```bash
git add src/regions.js test/regions.test.js styles.css
git commit -m "feat: add stylized colour-region map and tint styles"
```

---

## Task 5: Selection state (`src/selection.js`)

**Files:**
- Create: `src/selection.js`
- Test: `test/selection.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// test/selection.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSelection } from '../src/selection.js';

test('pickStart only works before any lines exist', () => {
  const s = createSelection();
  assert.equal(s.pickStart({ row: 0, col: 0 }), true);
  assert.equal(s.pickStart({ row: 5, col: 5 }), false); // already started
});

test('addLine commits a 7-char line and moves start to its end', () => {
  const s = createSelection();
  s.pickStart({ row: 0, col: 0 });
  assert.equal(s.addLine({ dr: 0, dc: 1 }), true);
  assert.equal(s.lineCount(), 1);
  assert.deepEqual(s.currentStart(), { row: 0, col: 6 }); // connected path
  assert.equal(s.extractedLines()[0].length, 7);
});

test('addLine rejects an off-grid direction', () => {
  const s = createSelection();
  s.pickStart({ row: 0, col: 0 });
  assert.equal(s.addLine({ dr: -1, dc: 0 }), false); // north runs off grid
  assert.equal(s.lineCount(), 0);
});

test('canExtract is true only at multiples of 4 (>=4)', () => {
  const s = createSelection();
  s.pickStart({ row: 0, col: 0 });
  const dirs = [{ dr: 0, dc: 1 }, { dr: 1, dc: 0 }, { dr: 0, dc: 1 }, { dr: 1, dc: 0 }];
  s.addLine(dirs[0]); assert.equal(s.canExtract(), false); // 1
  s.addLine(dirs[1]); assert.equal(s.canExtract(), false); // 2
  s.addLine(dirs[2]); assert.equal(s.canExtract(), false); // 3
  s.addLine(dirs[3]); assert.equal(s.canExtract(), true);  // 4
});

test('undo removes the last line and restores the previous start', () => {
  const s = createSelection();
  s.pickStart({ row: 0, col: 0 });
  s.addLine({ dr: 0, dc: 1 });
  s.addLine({ dr: 1, dc: 0 });
  s.undo();
  assert.equal(s.lineCount(), 1);
  assert.deepEqual(s.currentStart(), { row: 0, col: 6 });
  s.undo();
  assert.equal(s.lineCount(), 0);
  assert.equal(s.currentStart(), null);
});

test('reset clears everything', () => {
  const s = createSelection();
  s.pickStart({ row: 0, col: 0 });
  s.addLine({ dr: 0, dc: 1 });
  s.reset();
  assert.equal(s.lineCount(), 0);
  assert.equal(s.currentStart(), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/selection.test.js`
Expected: FAIL — cannot find module `../src/selection.js`.

- [ ] **Step 3: Implement `src/selection.js`**

```js
// src/selection.js — connected-path selection state, no DOM.
import { GRID } from './grid-data.js';
import { lineCells, isValidLine } from './geometry.js';

export function createSelection() {
  let startCell = null;
  const lines = []; // each: { cells: [{row,col}×7], chars: string[7] }

  function pickStart(cell) {
    if (lines.length === 0 && startCell === null) {
      startCell = { row: cell.row, col: cell.col };
      return true;
    }
    return false;
  }

  function addLine(dir) {
    if (!startCell) return false;
    const cells = lineCells(startCell, dir);
    if (!isValidLine(cells)) return false;
    const chars = cells.map((c) => GRID[c.row][c.col]);
    lines.push({ cells, chars });
    startCell = { ...cells[cells.length - 1] }; // end cell becomes next start
    return true;
  }

  function undo() {
    if (lines.length === 0) { startCell = null; return; }
    lines.pop();
    startCell = lines.length ? { ...lines[lines.length - 1].cells[6] } : null;
  }

  function reset() { lines.length = 0; startCell = null; }

  function canExtract() { return lines.length >= 4 && lines.length % 4 === 0; }
  function lineCount() { return lines.length; }
  function currentStart() { return startCell ? { ...startCell } : null; }
  function allLines() { return lines.map((l) => ({ cells: l.cells.map((c) => ({ ...c })) })); }
  function extractedLines() { return lines.map((l) => l.chars.join('')); }

  return { pickStart, addLine, undo, reset, canExtract, lineCount, currentStart, allLines, extractedLines };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/selection.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/selection.js test/selection.test.js
git commit -m "feat: add connected-path selection state"
```

---

## Task 6: Translation prompt (`src/prompt.js`)

**Files:**
- Create: `src/prompt.js`
- Test: `test/prompt.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// test/prompt.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../src/prompt.js';

test('prompt includes every line and the quatrain count', () => {
  const lines = ['琴清流楚激弦商', '秦曲發聲悲摧藏', '音和詠思惟空堂', '心憂增慕懷慘傷'];
  const p = buildPrompt(lines);
  for (const l of lines) assert.ok(p.includes(l), `missing line ${l}`);
  assert.ok(p.includes('4 lines'));
  assert.ok(p.includes('1 quatrain'), 'singular quatrain');
});

test('prompt pluralises quatrains for 8 lines', () => {
  const lines = Array.from({ length: 8 }, (_, i) => `line${i}xx`);
  const p = buildPrompt(lines);
  assert.ok(p.includes('8 lines'));
  assert.ok(p.includes('2 quatrains'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/prompt.test.js`
Expected: FAIL — cannot find module `../src/prompt.js`.

- [ ] **Step 3: Implement `src/prompt.js`**

```js
// src/prompt.js — build the LLM translation prompt. Pure.
export function buildPrompt(lines) {
  const n = lines.length;
  const quatrains = n / 4;
  const q = `${quatrains} quatrain${quatrains === 1 ? '' : 's'}`;
  const body = lines.join('\n');
  return [
    `These lines were extracted from Su Hui's 4th-century reversible poem "Star Gauge" (璇璣圖)`,
    `by tracing a path through a 29×29 character grid. Each line has 7 characters;`,
    `the poem is ${n} lines (${q}).`,
    ``,
    body,
    ``,
    `Please translate this into an English poem that preserves the four-line quatrain`,
    `structure and evokes the imagery. Add a short note on your reading.`,
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/prompt.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/prompt.js test/prompt.test.js
git commit -m "feat: add LLM translation prompt builder"
```

---

## Task 7: OpenAI integration scaffold (`src/translate.js`)

**Scaffolded but NEVER invoked in v1.** Tests only check the request shape — no network.

**Files:**
- Create: `src/translate.js`
- Test: `test/translate.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// test/translate.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenAIRequest, OPENAI_URL, DEFAULT_MODEL } from '../src/translate.js';

test('buildOpenAIRequest targets the chat completions endpoint', () => {
  const req = buildOpenAIRequest('hello', { apiKey: 'sk-test' });
  assert.equal(req.url, OPENAI_URL);
  assert.equal(req.method, 'POST');
  assert.equal(req.headers.Authorization, 'Bearer sk-test');
  assert.equal(req.headers['Content-Type'], 'application/json');
});

test('request body carries the prompt and default model', () => {
  const req = buildOpenAIRequest('translate me', { apiKey: 'sk-test' });
  const body = JSON.parse(req.body);
  assert.equal(body.model, DEFAULT_MODEL);
  const user = body.messages.find((m) => m.role === 'user');
  assert.equal(user.content, 'translate me');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/translate.test.js`
Expected: FAIL — cannot find module `../src/translate.js`.

- [ ] **Step 3: Implement `src/translate.js`**

```js
// src/translate.js — OpenAI Chat Completions integration.
// SCAFFOLDED BUT DISABLED: translatePoem() is not called anywhere in v1.
// Turning it on: supply an API key, set LLM_ENABLED = true in app.js, wire the button.
export const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
export const DEFAULT_MODEL = 'gpt-4o-mini';

export function buildOpenAIRequest(promptText, { model = DEFAULT_MODEL, apiKey = '' } = {}) {
  return {
    url: OPENAI_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      messages: [
        { role: 'system', content: 'You are a literary translator of classical Chinese poetry.' },
        { role: 'user', content: promptText },
      ],
    }),
  };
}

// NOTE: not invoked in v1. Present so enabling the live call later is trivial.
export async function translatePoem(promptText, apiKey, { model = DEFAULT_MODEL } = {}) {
  const req = buildOpenAIRequest(promptText, { model, apiKey });
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  if (!res.ok) throw new Error(`OpenAI request failed: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/translate.test.js`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/translate.js test/translate.test.js
git commit -m "feat: scaffold inactive OpenAI translation integration"
```

---

## Task 8: App wiring (`src/app.js`)

Wires the pure modules to the DOM. No new logic beyond rendering/handlers.
Verified manually in a browser (no automated DOM tests in v1).

**Files:**
- Create: `src/app.js`

- [ ] **Step 1: Implement `src/app.js`**

```js
// src/app.js — DOM wiring.
import { GRID, CENTER } from './grid-data.js';
import { validDirectionsFrom, isCenter } from './geometry.js';
import { regionAt } from './regions.js';
import { createSelection } from './selection.js';
import { buildPrompt } from './prompt.js';

// v1: the live OpenAI call is intentionally disabled. Do NOT set true without a key + button handler.
const LLM_ENABLED = false;

const selection = createSelection();
const gridEl = document.getElementById('grid');
const progressEl = document.getElementById('progress');
const undoBtn = document.getElementById('undo');
const resetBtn = document.getElementById('reset');
const regionsToggle = document.getElementById('regions-toggle');
const outputEl = document.getElementById('output');
const extractBtn = document.getElementById('extract');
const poemZhEl = document.getElementById('poem-zh');
const promptTextEl = document.getElementById('prompt-text');
const copyPromptBtn = document.getElementById('copy-prompt');
const translateBtn = document.getElementById('translate');

const cellEls = []; // cellEls[row][col]

function buildGrid() {
  for (let r = 0; r < 29; r++) {
    cellEls[r] = [];
    for (let c = 0; c < 29; c++) {
      const el = document.createElement('div');
      el.className = 'cell';
      el.textContent = GRID[r][c];
      el.dataset.row = r;
      el.dataset.col = c;
      el.classList.add(`r-${regionAt(r, c)}`);
      if (isCenter({ row: r, col: c })) {
        el.classList.add('center');
      } else {
        el.addEventListener('click', () => onCellClick(r, c));
      }
      gridEl.appendChild(el);
      cellEls[r][c] = el;
    }
  }
}

function onCellClick(row, col) {
  const start = selection.currentStart();
  if (!start) {
    selection.pickStart({ row, col });
    render();
    return;
  }
  // Interpret the clicked cell as choosing a direction from the current start,
  // if it is exactly one step away along a valid 7-run direction.
  const dr = Math.sign(row - start.row);
  const dc = Math.sign(col - start.col);
  const isNeighbour = Math.abs(row - start.row) <= 1 && Math.abs(col - start.col) <= 1 && !(dr === 0 && dc === 0);
  if (isNeighbour && validDirectionsFrom(start).some((d) => d.dr === dr && d.dc === dc)) {
    selection.addLine({ dr, dc });
  }
  render();
}

function clearHighlights() {
  for (let r = 0; r < 29; r++) {
    for (let c = 0; c < 29; c++) {
      cellEls[r][c].classList.remove('in-line', 'start', 'candidate');
    }
  }
}

function render() {
  clearHighlights();
  for (const line of selection.allLines()) {
    for (const cell of line.cells) cellEls[cell.row][cell.col].classList.add('in-line');
  }
  const start = selection.currentStart();
  if (start) {
    cellEls[start.row][start.col].classList.add('start');
    for (const d of validDirectionsFrom(start)) {
      cellEls[start.row + d.dr][start.col + d.dc].classList.add('candidate');
    }
  }

  const n = selection.lineCount();
  progressEl.textContent = start === null && n === 0
    ? 'Click a character to begin.'
    : `${n} line${n === 1 ? '' : 's'} — a poem needs 4, 8, 12 … (multiples of 4). Click a highlighted neighbour to extend.`;

  undoBtn.disabled = n === 0;
  resetBtn.disabled = n === 0 && start === null;

  const ready = selection.canExtract();
  outputEl.hidden = !ready;
  extractBtn.disabled = !ready;
  if (!ready) { poemZhEl.textContent = ''; promptTextEl.value = ''; }
}

function onExtract() {
  const lines = selection.extractedLines();
  poemZhEl.textContent = lines.join('\n');
  promptTextEl.value = buildPrompt(lines);
}

async function onCopyPrompt() {
  await navigator.clipboard.writeText(promptTextEl.value);
  copyPromptBtn.textContent = 'Copied!';
  setTimeout(() => { copyPromptBtn.textContent = 'Copy translation prompt'; }, 1500);
}

undoBtn.addEventListener('click', () => { selection.undo(); render(); });
resetBtn.addEventListener('click', () => { selection.reset(); render(); });
regionsToggle.addEventListener('change', () => document.body.classList.toggle('show-regions', regionsToggle.checked));
extractBtn.addEventListener('click', onExtract);
copyPromptBtn.addEventListener('click', onCopyPrompt);

// Translate button stays disabled in v1. When LLM_ENABLED is true, wire it to
// translatePoem(promptTextEl.value, <key>) and write the result into #poem-en.
translateBtn.disabled = !LLM_ENABLED;

buildGrid();
render();
```

- [ ] **Step 2: Manual verification in a browser**

Serve the folder and open it (a static server is needed for ES modules):

Run: `npx --yes serve .` (or `python -m http.server`), then open the printed URL.

Verify:
- The 29×29 grid renders with the centre 心 in red and non-clickable.
- Clicking a character marks it as the start and dashes its valid neighbour directions.
- Clicking a dashed neighbour commits a 7-char line; the path stays connected.
- Undo/Reset behave; progress text updates.
- At 4 lines the output panel appears with the stacked Chinese poem and a filled prompt box.
- "Copy translation prompt" copies the text.
- "Show colour regions" tints the grid; toggling off removes the tint.
- The Translate button is **disabled**; no network request to OpenAI occurs (check the Network tab).

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "feat: wire grid UI, selection, output, prompt copy, region toggle"
```

---

## Task 9: Full test run + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Run the whole test suite**

Run: `node --test`
Expected: PASS — all suites (grid-data, geometry, regions, selection, prompt, translate) green.

- [ ] **Step 2: Write `README.md`**

```markdown
# 璇璣圖 · Star Gauge

Interactive explorer for Su Hui's 4th-century reversible poem. Trace a connected
path of 7-character lines through the 29×29 grid; once you have a full quatrain
(4, 8, 12 … lines) the app extracts the Chinese poem and builds a copy-ready
LLM translation prompt. See `CLAUDE.md` for the design and the Chinese-text rules.

## Run
Static site, no build. Serve the folder (ES modules need a server):

    npx serve .

## Test

    node --test

## Notes
- Traditional characters; the centre 心 belongs to no poem and is inert.
- Enforcement is geometry-only (no rhyme checking).
- Colour regions are a stylized/approximate display layer.
- The OpenAI translation is scaffolded but disabled (`LLM_ENABLED = false`); v1
  makes no API calls.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README and confirm full test suite passes"
```

---

## Self-Review Notes

- **Spec coverage:** grid (T2), geometry/8-direction/centre-exclusion (T3), colour
  tint (T4), connected path + multiple-of-4 gating (T5), prompt (T6), inactive
  OpenAI scaffold (T7), UI + English area + region toggle + copy (T8), tests +
  docs (T9). All design goals mapped.
- **Type consistency:** `selection` exposes `currentStart`/`lineCount`/`allLines`/
  `extractedLines`/`canExtract`; `geometry` exposes `validDirectionsFrom`/
  `isCenter`/`lineCells`/`isValidLine`; `regions` exposes `regionAt`/`REGION_IDS`;
  `translate` exposes `buildOpenAIRequest`/`OPENAI_URL`/`DEFAULT_MODEL`. Names used
  consistently across tasks and `app.js`.
- **Known real-work item:** Task 2 grid transcription is the one task needing
  external sourcing + careful verification (count rows/cols, confirm centre 心).
- **Hard constraint honoured:** no live OpenAI call anywhere; `LLM_ENABLED = false`
  and the Translate button is disabled.
