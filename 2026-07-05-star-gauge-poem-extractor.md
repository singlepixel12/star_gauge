# Star Gauge Poem Extractor — Implementation Plan (v2)

> **For agentic workers (Opus):** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `CLAUDE.md` first — especially the Chinese-language rules. **The 841-character grid is embedded in Task 2 below, already verified (29×29, 心 at [14][14]). Do NOT re-fetch it from the web, do NOT "correct" any character, do NOT convert to simplified.**

**Goal:** Build a fully responsive static single-page site rendering Su Hui's authentic 29×29 (841-char) traditional-Chinese "Star Gauge" grid, letting the user trace connected 7-character lines via an 8-way compass control to extract a Chinese poem, then produce a copy-ready LLM translation prompt and a placeholder English-poem area, with an inactive (scaffolded) OpenAI integration and an optional stylized colour-region tint — all in a silk-brocade visual style.

**Architecture:** Vanilla HTML/CSS/JS, no build step. Pure, DOM-free logic modules (`grid-data`, `geometry`, `selection`, `prompt`, `translate`, `regions`) unit-tested with Node's built-in test runner; `app.js` wires them to the DOM. The OpenAI call is written but guarded off (`LLM_ENABLED = false`) and never invoked in v1.

**Tech Stack:** HTML5, CSS Grid, ES modules, Node `node:test` (dev only). Zero dependencies.

---

## Design Context (read before starting)

**The poem's rules (as implemented in v1):**
- Grid is 29×29 = 841 traditional characters. `GRID[14][14] === '心'` (0-indexed centre).
- The centre 心 belongs to no poem: it is inert and excluded from every line.
- A **line** = 7 characters in a straight run, in any of **8 directions**.
- **Pivot rule (IMPORTANT):** the first line includes its start cell (start + 6 steps). Every subsequent line **pivots** at the previous line's last cell (the "junction") and its 7 characters begin **one step onward** in the newly chosen direction. Boundary characters are **never repeated** — `line N`'s last char and `line N+1`'s first char are different cells.
- **Minimum to extract:** ≥4 lines and a multiple of 4 (whole quatrains).
- Enforcement is **geometry only** — no rhyme/tone checking.

**Interaction model:**
- Click any non-centre cell to start. An **8-way compass control** appears anchored over that cell: arrows for valid directions enabled, invalid greyed out. Hovering (or focusing) an arrow previews the 7 cells it would commit; clicking commits the line and the compass moves to the new junction. Undo/Reset buttons; live poem panel updates after every line.
- No "Extract" button: the Chinese poem panel updates live; the translation-prompt box fills automatically whenever the line count is a multiple of 4 (≥4), and shows "add N more lines to complete the quatrain" otherwise. The panel never disappears once the first line exists.

**Visual direction — silk brocade:** warm silk ground, ink-dark serif glyphs, vermillion for 心/junction, gold thread for the traced path. Font stack must work on Windows: `"Noto Serif TC", "PMingLiU", "MingLiU", "Microsoft JhengHei", "SimSun", serif`. Cells ≥30px, glyphs ≥18px (traditional glyphs are dense).

**Responsive:** the grid lives in a pan/scrollable viewport; single-column layout on small screens; compass buttons ≥44px on coarse pointers; manual checks at a ~390px viewport are part of Task 8.

**Out of scope for v1:** rhyme validation, region-specific reading grammars (blue 3-char mode, circular border poem), any live OpenAI call, dark mode.

**File structure:**
| File | Responsibility |
|------|----------------|
| `package.json` | `"type": "module"` + `test` script. |
| `index.html` | Page skeleton: controls, grid viewport + compass mount, output panel. |
| `styles.css` | Brocade theme, grid, compass, highlights, region tints, responsive rules. |
| `src/grid-data.js` | `GRID` (29×29 `string[][]`) + `CENTER`. Data embedded in Task 2. |
| `src/geometry.js` | Directions (with ids/arrows), `lineCells(anchor, dir, skipAnchor)`, validity, `validDirectionsFrom`. Pure. |
| `src/regions.js` | `regionAt(row,col)` stylized colour map. Pure, display-only. |
| `src/selection.js` | `createSelection(grid)`: pivot-rule path state. Pure; grid injected. |
| `src/prompt.js` | `buildPrompt(lines)`. Pure. |
| `src/translate.js` | `buildOpenAIRequest`, `translatePoem` (never called in v1). |
| `src/app.js` | DOM wiring: grid render, compass, live output, copy, region toggle. |
| `test/*.test.js` | Unit tests. |

---

## Task 1: Project scaffold (HTML + brocade CSS)

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `index.html`
- Create: `styles.css`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "star-gauge",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test",
    "serve": "npx --yes serve ."
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
node_modules/
.DS_Store
*.log
```

- [ ] **Step 3: Create `index.html`**

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
    <h1>璇璣圖 <span class="latin">· Star Gauge</span></h1>
    <p class="tagline">Trace a thread through Su Hui's woven poem — seven characters a line, four lines a quatrain.</p>
    <details class="about">
      <summary>About this poem</summary>
      <p>In the 4th century, Su Hui (蘇蕙) wove these 841 characters in five
      colours of silk for her husband Dou Tao (竇滔), exiled far away and
      drifting toward another. Read in any direction — across, down, diagonally,
      forwards or backwards — the grid conceals nearly three thousand poems of
      longing, separation and constancy. The centre character, 心
      ("heart"), belongs to every reading and to none.</p>
    </details>
  </header>

  <main>
    <section class="controls" aria-label="controls">
      <button id="undo" type="button" disabled>Undo line</button>
      <button id="reset" type="button" disabled>Reset</button>
      <label class="toggle"><input id="regions-toggle" type="checkbox" /> Colour regions <span class="hint">(stylized)</span></label>
      <span id="progress" class="progress" role="status">Tap a character to begin.</span>
    </section>

    <section class="grid-viewport" aria-label="poem grid">
      <div class="grid-frame">
        <div id="grid" class="grid"></div>
        <div id="compass" class="compass" hidden></div>
      </div>
    </section>

    <section class="output" id="output" hidden>
      <div class="card poem-chinese">
        <h2>Poem so far</h2>
        <pre id="poem-zh" class="poem"></pre>
      </div>
      <div class="card prompt-block">
        <h2>Translation prompt</h2>
        <p id="prompt-status" class="hint"></p>
        <textarea id="prompt-text" class="prompt-text" readonly rows="9" aria-label="LLM translation prompt"></textarea>
        <button id="copy-prompt" type="button" disabled>Copy translation prompt</button>
      </div>
      <div class="card english-block">
        <h2>English poem</h2>
        <textarea id="poem-en" class="poem-en" rows="9"
          placeholder="The English translation will appear here — paste it, or wire up the OpenAI call."></textarea>
        <button id="translate" type="button" disabled
          title="OpenAI integration is scaffolded but disabled in v1">Translate with OpenAI (disabled)</button>
      </div>
    </section>
  </main>

  <footer class="credits">
    Text: <a href="https://zh.wikisource.org/wiki/%E7%92%87%E7%8E%91%E5%9C%96">Chinese Wikisource, 璇璣圖</a>
    · Background: <a href="https://en.wikipedia.org/wiki/Star_Gauge">Wikipedia, Star Gauge</a>
  </footer>

  <script type="module" src="src/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `styles.css` (silk-brocade theme, responsive)**

```css
:root {
  --cell: 34px;
  --glyph: 20px;
  --silk: #f3e8d0;
  --silk-deep: #eadbb9;
  --weave: #d6c194;
  --ink: #2b2118;
  --faded: #7a6a52;
  --vermillion: #b5402c;
  --gold: #a87b1e;
  --gold-soft: #ecd692;
  --gold-glow: #f6e7b0;
}
* { box-sizing: border-box; }
/* Author display rules below would otherwise defeat the UA's [hidden] rule. */
[hidden] { display: none !important; }
html, body { margin: 0; }
body {
  padding: 1.25rem;
  color: var(--ink);
  background:
    radial-gradient(ellipse at top, #f8efdc 0%, var(--silk) 55%, var(--silk-deep) 100%);
  font-family: Georgia, "Times New Roman", serif;
}
header h1 {
  margin: 0;
  font-size: 2rem;
  letter-spacing: .1em;
  font-family: "Noto Serif TC", "PMingLiU", "MingLiU", "Microsoft JhengHei", "SimSun", serif;
}
header .latin { font-size: 1rem; color: var(--faded); letter-spacing: .05em; }
.tagline { color: var(--faded); margin: .3rem 0 1rem; font-style: italic; }
.about { margin: 0 0 1rem; max-width: 62ch; color: var(--faded); }
.about summary { cursor: pointer; color: var(--ink); font-style: italic; }
.about p { margin: .5rem 0 0; line-height: 1.55; }

.controls {
  position: sticky; top: 0; z-index: 20;
  display: flex; flex-wrap: wrap; gap: .6rem; align-items: center;
  padding: .5rem 0; background: var(--silk);
  border-bottom: 1px solid var(--weave);
  margin-bottom: .75rem;
}
.controls button {
  font: inherit; padding: .35rem .8rem; cursor: pointer;
  background: var(--silk-deep); color: var(--ink);
  border: 1px solid var(--gold); border-radius: 4px;
}
.controls button:disabled { opacity: .4; cursor: not-allowed; }
.controls .hint, .hint { color: var(--faded); font-size: .8em; }
.progress { color: var(--faded); font-size: .9rem; }

/* Grid inside a pannable viewport; frame padding leaves room for the compass at edges */
.grid-viewport {
  overflow: auto;
  max-height: 74vh;
  border: 3px double var(--gold);
  border-radius: 6px;
  background: var(--silk-deep);
  box-shadow: inset 0 0 24px rgba(122, 106, 82, .25);
}
.grid-frame { position: relative; width: max-content; padding: 56px; margin: 0 auto; }
.grid {
  display: grid;
  grid-template-columns: repeat(29, var(--cell));
  grid-template-rows: repeat(29, var(--cell));
  gap: 1px;
  background: var(--weave);
  border: 1px solid var(--weave);
}
.cell {
  display: flex; align-items: center; justify-content: center;
  background: var(--silk);
  font-family: "Noto Serif TC", "PMingLiU", "MingLiU", "Microsoft JhengHei", "SimSun", serif;
  font-size: var(--glyph); line-height: 1;
  cursor: pointer; user-select: none;
}
.cell.center { color: var(--vermillion); font-weight: 700; cursor: default; }
.cell.in-line { background: var(--gold-soft); }
.cell.junction { outline: 2px solid var(--vermillion); outline-offset: -2px; z-index: 1; }
.cell.preview { background: var(--gold-glow); box-shadow: inset 0 0 0 2px var(--gold); }

/* 8-way compass, absolutely positioned over the junction cell */
.compass {
  position: absolute; z-index: 10;
  display: grid;
  grid-template-columns: repeat(3, var(--compass-btn, 38px));
  grid-template-rows: repeat(3, var(--compass-btn, 38px));
  gap: 2px;
  pointer-events: none; /* the hole in the middle lets the junction show through */
}
.compass button {
  pointer-events: auto;
  font-size: 1rem; line-height: 1; cursor: pointer;
  background: rgba(243, 232, 208, .92);
  color: var(--ink);
  border: 1px solid var(--gold); border-radius: 50%;
  box-shadow: 0 1px 4px rgba(43, 33, 24, .35);
}
.compass button:hover:not(:disabled), .compass button:focus-visible { background: var(--gold-glow); }
.compass button:disabled { opacity: .2; cursor: not-allowed; }
.compass .hole { visibility: hidden; }

/* Output cards */
.output { display: grid; gap: 1rem; margin-top: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.card {
  background: rgba(248, 240, 220, .8);
  border: 1px solid var(--weave); border-radius: 6px;
  padding: .9rem 1rem;
}
.card h2 { margin: 0 0 .5rem; font-size: 1.05rem; letter-spacing: .05em; }
.poem {
  margin: 0;
  font-family: "Noto Serif TC", "PMingLiU", "MingLiU", "Microsoft JhengHei", "SimSun", serif;
  font-size: 1.35rem; letter-spacing: .3em; line-height: 1.9;
  white-space: pre-wrap;
}
.prompt-text, .poem-en { width: 100%; font: .85rem/1.4 ui-monospace, Consolas, monospace; border: 1px solid var(--weave); background: #fbf6ea; }
.card button {
  margin-top: .5rem; font: inherit; padding: .35rem .8rem; cursor: pointer;
  background: var(--silk-deep); border: 1px solid var(--gold); border-radius: 4px;
}
.card button:disabled { opacity: .4; cursor: not-allowed; }

footer.credits {
  margin-top: 2rem; padding-top: .75rem;
  border-top: 1px solid var(--weave);
  color: var(--faded); font-size: .8rem;
}
footer.credits a { color: var(--gold); }

/* Stylized colour-region tints (visible only when body has .show-regions) */
.show-regions .cell.r-center     { background: #f0d5cd; }
.show-regions .cell.r-band-inner { background: #f1decb; }
.show-regions .cell.r-band-mid   { background: #e6e3c8; }
.show-regions .cell.r-band-outer { background: #d9e0d5; }
.show-regions .cell.r-band-far   { background: #dcd6e0; }
.show-regions .cell.r-border     { background: #e8dcc0; }
/* Path/selection highlights must win over region tints */
.show-regions .cell.in-line { background: var(--gold-soft); }
.show-regions .cell.preview { background: var(--gold-glow); }

/* Responsive: small screens & touch */
@media (max-width: 600px) {
  :root { --cell: 30px; --glyph: 18px; }
  body { padding: .75rem; }
  header h1 { font-size: 1.5rem; }
  .grid-viewport { max-height: 60vh; }
  .output { grid-template-columns: 1fr; }
}
@media (pointer: coarse) {
  :root { --compass-btn: 44px; }
}
```

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore index.html styles.css
git commit -m "chore: scaffold brocade-themed static skeleton"
```

---

## Task 2: Grid data (`src/grid-data.js`) — EMBEDDED, DO NOT MODIFY

The 841 characters below were transcribed from the Chinese Wikisource edition of
璇璣圖 (https://zh.wikisource.org/wiki/璇璣圖), traditional characters, and have
already been programmatically verified: 29 rows × 29 chars = 841, `心` at
[14][14]. **Copy them exactly. Do not re-fetch, re-type, "fix", or simplify any
character.** (Known variant cells vs. other editions — e.g. gushiwen's
simplified text reads 窈窕 / 泉清 / 水故 / 好恃 where Wikisource reads 窕窈 /
泉情 / 冰故 / 妤恃 — are edition differences, not errors. Wikisource is
canonical for this project.)

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
  GRID.forEach((row, r) => {
    assert.equal(row.length, 29, `row ${r} has ${row.length} cells`);
    for (const ch of row) {
      assert.equal([...ch].length, 1, `cell "${ch}" in row ${r} must be one character`);
    }
  });
});

test('grid has 841 characters total', () => {
  assert.equal(GRID.flat().length, 841);
});

test('centre is 心 at [14][14]', () => {
  assert.deepEqual(CENTER, { row: 14, col: 14 });
  assert.equal(GRID[14][14], '心');
});

test('spot-check known cells (guards against row drift)', () => {
  assert.equal(GRID[0][0], '琴');   // first cell
  assert.equal(GRID[0][28], '仁');  // end of row 0
  assert.equal(GRID[28][0], '親');  // start of row 28
  assert.equal(GRID[28][28], '津'); // last cell
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/grid-data.test.js`
Expected: FAIL — cannot find module `../src/grid-data.js`.

- [ ] **Step 3: Create `src/grid-data.js` with exactly this content**

```js
// src/grid-data.js
// Su Hui's 璇璣圖 (Star Gauge), 29×29 = 841 traditional-Chinese characters.
// Transcribed from Chinese Wikisource (zh.wikisource.org/wiki/璇璣圖) and
// structurally verified: 29 rows × 29 chars, 心 at [14][14] (0-indexed).
// DO NOT edit individual characters or convert to simplified. See CLAUDE.md.
const ROWS = [
  "琴清流楚激弦商秦曲發聲悲摧藏音和詠思惟空堂心憂增慕懷慘傷仁",
  "芳廊東步階西遊王姿淑窕窈伯邵南周風興自后妃荒經離所懷歎嗟智",
  "蘭休桃林陰翳桑懷歸思廣河女衛鄭楚樊厲節中闈淫遐曠路傷中情懷",
  "凋翔飛燕巢雙鳩土迤逶路遐志詠歌長歎不能奮飛妄清幃房君無家德",
  "茂流泉情水激揚眷頎其人碩興齊商雙發歌我袞衣想華飾容朗鏡明聖",
  "熙長君思悲好仇舊蕤葳粲翠榮曜流華觀冶容為誰感英曜珠光紛葩虞",
  "陽愁歎發容摧傷鄉悲情我感傷情徵宮羽同聲相追所多思感誰為榮唐",
  "春方殊離仁君榮身苦惟艱生患多殷憂纏情將如何欽蒼穹誓終篤志貞",
  "牆禽心濱均深身加懷憂是嬰藻文繁虎龍寧自感思岑形熒城榮明庭妙",
  "面伯改漢物日我兼思何漫漫榮曜華雕旂孜孜傷情幽未猶傾苟難闈顯",
  "殊在者之品潤乎愁苦艱是丁麗壯觀飾容側君在時巖在炎在不受亂華",
  "意誠惑步育浸集悴我生何冤充顏曜繡衣夢想勞形峻慎盛戒義消作重",
  "感故昵飄施愆殃少章時桑詩端無終始詩仁顏貞寒嵯深興后姬源人榮",
  "故遺親飄生思愆精徽盛翳風比平始璇情賢喪物歲峨慮漸孽班禍讒章",
  "新舊聞離天罪辜神恨昭感興作蘇心璣明別改知識深微至嬖女因奸臣",
  "霜廢遠微地積何遐微業孟鹿麗氏詩圖顯行華終凋淵察大趙婕所佞賢",
  "冰故離隔德怨因幽元傾宣鳴辭理興義怨士容始松重遠伐氏妤恃凶惟",
  "齊君殊喬貴其備曠悼思傷懷日往感年衰念是舊愆涯禍用飛辭恣害聖",
  "潔子我木平根嘗遠歎永感悲思憂遠勞情誰為獨居經在昭燕輦極我配",
  "志惟同誰均難苦離戚戚情哀慕歲殊歎時賤女懷歎網防青實漢驕忠英",
  "清新衾陰勻尋辛鳳知我者誰世異浮奇傾鄙賤何如羅萌青生成盈貞皇",
  "純貞志一專所當麟沙流頹逝異浮沉華英翳曜潛陽林西昭景薄榆桑倫",
  "望微精感通明神龍馳若然倏逝惟時年殊白日西移光滋愚讒漫頑凶匹",
  "誰雲浮寄身輕飛昭虧不盈無倏必盛有衰無日不陂流蒙謙退休孝慈離",
  "思輝光飭粲殊文德離忠體一違心意志殊憤激何施電疑危遠家和雍飄",
  "想群離散妾孤遺懷儀容仰俯榮華麗飾身將與誰為逝容節敦貞淑思浮",
  "懷悲哀聲殊乖分聖貲何情憂感惟哀志節上通神祗推持所貞記自恭江",
  "所春傷應翔雁歸皇辭成者作體下遺葑菲採者無差生從是敬孝為基湘",
  "親剛柔有女為賤人房幽處己憫微身長路悲曠感生民梁山殊塞隔河津",
];

export const GRID = ROWS.map((r) => [...r]);
export const CENTER = { row: 14, col: 14 };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/grid-data.test.js`
Expected: PASS (all 5 tests). If any structural assertion fails, a row was
mangled during copying — re-copy that row from this plan verbatim. **Never**
adjust characters to make tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/grid-data.js test/grid-data.test.js
git commit -m "feat: add verified 841-char Star Gauge grid (Wikisource, traditional)"
```

---

## Task 3: Geometry with the pivot rule (`src/geometry.js`)

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

test('there are 8 named directions and grid constants', () => {
  assert.equal(DIRECTIONS.length, 8);
  for (const d of DIRECTIONS) {
    assert.ok(d.id && typeof d.arrow === 'string');
    assert.ok([-1, 0, 1].includes(d.dr) && [-1, 0, 1].includes(d.dc));
  }
  assert.equal(SIZE, 29);
  assert.equal(LINE_LENGTH, 7);
  assert.deepEqual(CENTER, { row: 14, col: 14 });
});

test('first line includes its anchor: 7 cells east from (0,0)', () => {
  const cells = lineCells({ row: 0, col: 0 }, { dr: 0, dc: 1 }, false);
  assert.equal(cells.length, 7);
  assert.deepEqual(cells[0], { row: 0, col: 0 });
  assert.deepEqual(cells[6], { row: 0, col: 6 });
});

test('pivot line skips its anchor: 7 cells east from junction (0,6)', () => {
  const cells = lineCells({ row: 0, col: 6 }, { dr: 0, dc: 1 }, true);
  assert.deepEqual(cells[0], { row: 0, col: 7 });   // one step onward
  assert.deepEqual(cells[6], { row: 0, col: 13 });  // junction char not repeated
});

test('lineCells returns null when the run leaves the grid', () => {
  assert.equal(lineCells({ row: 0, col: 25 }, { dr: 0, dc: 1 }, false), null);
  assert.equal(lineCells({ row: 0, col: 22 }, { dr: 0, dc: 1 }, true), null); // 23..29 off-grid
});

test('isValidLine rejects a run through the centre', () => {
  const first = lineCells({ row: 14, col: 8 }, { dr: 0, dc: 1 }, false); // cols 8..14 hits centre
  assert.equal(isValidLine(first), false);
  const pivot = lineCells({ row: 14, col: 13 }, { dr: 0, dc: 1 }, true); // cols 14..20 hits centre
  assert.equal(isValidLine(pivot), false);
});

test('isValidLine accepts a clean run that stops just short of centre', () => {
  const cells = lineCells({ row: 14, col: 7 }, { dr: 0, dc: 1 }, false); // cols 7..13
  assert.equal(isValidLine(cells), true);
});

test('validDirectionsFrom a corner yields 3 inward runs, first-line and pivot', () => {
  assert.equal(validDirectionsFrom({ row: 0, col: 0 }, false).length, 3); // E, S, SE
  assert.equal(validDirectionsFrom({ row: 0, col: 0 }, true).length, 3);
});

test('every cell always has at least one valid pivot direction (no dead ends)', () => {
  for (let r = 0; r < 29; r++) {
    for (let c = 0; c < 29; c++) {
      if (r === 14 && c === 14) continue;
      assert.ok(validDirectionsFrom({ row: r, col: c }, true).length >= 1, `dead end at (${r},${c})`);
    }
  }
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

// Named for the compass UI. Order: clockwise from north.
export const DIRECTIONS = [
  { id: 'n',  dr: -1, dc: 0,  arrow: '↑' },
  { id: 'ne', dr: -1, dc: 1,  arrow: '↗' },
  { id: 'e',  dr: 0,  dc: 1,  arrow: '→' },
  { id: 'se', dr: 1,  dc: 1,  arrow: '↘' },
  { id: 's',  dr: 1,  dc: 0,  arrow: '↓' },
  { id: 'sw', dr: 1,  dc: -1, arrow: '↙' },
  { id: 'w',  dr: 0,  dc: -1, arrow: '←' },
  { id: 'nw', dr: -1, dc: -1, arrow: '↖' },
];

export function inGrid({ row, col }) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

export function isCenter({ row, col }) {
  return row === CENTER.row && col === CENTER.col;
}

// The 7 cells of a line. skipAnchor=false: first line, cells = anchor..anchor+6d.
// skipAnchor=true: pivot line, cells = anchor+1d..anchor+7d (junction NOT repeated).
export function lineCells(anchor, dir, skipAnchor) {
  const offset = skipAnchor ? 1 : 0;
  const cells = [];
  for (let i = 0; i < LINE_LENGTH; i++) {
    const cell = {
      row: anchor.row + dir.dr * (i + offset),
      col: anchor.col + dir.dc * (i + offset),
    };
    if (!inGrid(cell)) return null;
    cells.push(cell);
  }
  return cells;
}

export function isValidLine(cells) {
  if (!cells || cells.length !== LINE_LENGTH) return false;
  return cells.every((c) => inGrid(c) && !isCenter(c));
}

export function validDirectionsFrom(anchor, skipAnchor) {
  return DIRECTIONS.filter((dir) => isValidLine(lineCells(anchor, dir, skipAnchor)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/geometry.test.js`
Expected: PASS (all tests, including the exhaustive no-dead-ends sweep).

- [ ] **Step 5: Commit**

```bash
git add src/geometry.js test/geometry.test.js
git commit -m "feat: add pivot-rule geometry and line validation"
```

---

## Task 4: Colour regions (`src/regions.js`)

Display-only stylized approximation (concentric Chebyshev bands). NOT a
scholarly cell map — the UI labels it "stylized". No effect on validation.

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
  for (let r = 0; r < 29; r++) {
    for (let c = 0; c < 29; c++) {
      assert.ok(ids.has(regionAt(r, c)), `(${r},${c}) -> ${regionAt(r, c)}`);
    }
  }
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
Expected: PASS. (The region tint CSS already exists from Task 1.)

- [ ] **Step 5: Commit**

```bash
git add src/regions.js test/regions.test.js
git commit -m "feat: add stylized colour-region map"
```

---

## Task 5: Selection state with pivot rule (`src/selection.js`)

**Files:**
- Create: `src/selection.js`
- Test: `test/selection.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// test/selection.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSelection } from '../src/selection.js';

// Injectable fake grid: 29×29 of distinct CJK chars so extracted text is checkable.
function fakeGrid() {
  return Array.from({ length: 29 }, (_, r) =>
    Array.from({ length: 29 }, (_, c) => String.fromCharCode(0x4e00 + r * 29 + c)),
  );
}
const at = (g, cell) => g[cell.row][cell.col];

test('pickStart works once, rejects the centre cell', () => {
  const s = createSelection(fakeGrid());
  assert.equal(s.pickStart({ row: 14, col: 14 }), false); // 心 is inert
  assert.equal(s.pickStart({ row: 0, col: 0 }), true);
  assert.equal(s.pickStart({ row: 5, col: 5 }), false);   // already started
});

test('first line includes the start; pivot line does not repeat the junction', () => {
  const g = fakeGrid();
  const s = createSelection(g);
  s.pickStart({ row: 0, col: 0 });
  assert.equal(s.addLine({ dr: 0, dc: 1 }), true);  // cells (0,0)..(0,6)
  assert.equal(s.addLine({ dr: 1, dc: 0 }), true);  // pivot at (0,6): cells (1,6)..(7,6)
  const [l1, l2] = s.extractedLines();
  assert.equal(l1[0], at(g, { row: 0, col: 0 }));
  assert.equal(l1[6], at(g, { row: 0, col: 6 }));
  assert.equal(l2[0], at(g, { row: 1, col: 6 }));           // starts ONE STEP past junction
  assert.notEqual(l2[0], l1[6]);                            // no boundary repeat
  assert.deepEqual(s.currentAnchor(), { row: 7, col: 6 });  // junction = last cell of line 2
});

test('addLine rejects invalid directions and leaves state untouched', () => {
  const s = createSelection(fakeGrid());
  s.pickStart({ row: 0, col: 0 });
  assert.equal(s.addLine({ dr: -1, dc: 0 }), false); // off-grid
  assert.equal(s.lineCount(), 0);
});

test('canExtract true only at multiples of 4; linesNeeded counts the gap', () => {
  const s = createSelection(fakeGrid());
  s.pickStart({ row: 0, col: 0 });
  assert.equal(s.linesNeeded(), 4);
  // Straight east run along row 0 for the first 4 lines (never nears the
  // centre), then turn south for the 5th — avoids the centre-collision that
  // an alternating east/south path from (0,0) would hit exactly on line 5.
  s.addLine({ dr: 0, dc: 1 });  // 1
  s.addLine({ dr: 0, dc: 1 });  // 2
  s.addLine({ dr: 0, dc: 1 });  // 3
  assert.equal(s.canExtract(), false);
  assert.equal(s.linesNeeded(), 1);
  s.addLine({ dr: 0, dc: 1 });  // 4
  assert.equal(s.canExtract(), true);
  assert.equal(s.linesNeeded(), 0);
  s.addLine({ dr: 1, dc: 0 });  // 5
  assert.equal(s.canExtract(), false);
  assert.equal(s.linesNeeded(), 3);
});

test('undo pops one line; with none left it clears the start', () => {
  const s = createSelection(fakeGrid());
  s.pickStart({ row: 0, col: 0 });
  s.addLine({ dr: 0, dc: 1 });
  s.addLine({ dr: 1, dc: 0 });
  s.undo();
  assert.equal(s.lineCount(), 1);
  assert.deepEqual(s.currentAnchor(), { row: 0, col: 6 });
  s.undo();
  assert.equal(s.lineCount(), 0);
  assert.deepEqual(s.currentAnchor(), { row: 0, col: 0 }); // back to picked start
  s.undo();
  assert.equal(s.currentAnchor(), null);                    // start cleared
});

test('reset clears everything and allows a fresh pickStart', () => {
  const s = createSelection(fakeGrid());
  s.pickStart({ row: 0, col: 0 });
  s.addLine({ dr: 0, dc: 1 });
  s.reset();
  assert.equal(s.lineCount(), 0);
  assert.equal(s.currentAnchor(), null);
  assert.equal(s.pickStart({ row: 3, col: 3 }), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/selection.test.js`
Expected: FAIL — cannot find module `../src/selection.js`.

- [ ] **Step 3: Implement `src/selection.js`**

```js
// src/selection.js — pivot-rule connected-path state. No DOM. Grid is injected.
import { lineCells, isValidLine, isCenter } from './geometry.js';

export function createSelection(grid) {
  let startCell = null;   // the very first anchor (before any lines)
  const lines = [];       // each: { cells: [{row,col}×7], chars: string[7] }

  const isPivot = () => lines.length > 0;

  function currentAnchor() {
    if (lines.length > 0) return { ...lines[lines.length - 1].cells[6] };
    return startCell ? { ...startCell } : null;
  }

  function pickStart(cell) {
    if (lines.length > 0 || startCell !== null) return false;
    if (isCenter(cell)) return false;
    startCell = { row: cell.row, col: cell.col };
    return true;
  }

  function addLine(dir) {
    const anchor = currentAnchor();
    if (!anchor) return false;
    const cells = lineCells(anchor, dir, isPivot());
    if (!isValidLine(cells)) return false;
    lines.push({ cells, chars: cells.map((c) => grid[c.row][c.col]) });
    return true;
  }

  function undo() {
    if (lines.length > 0) { lines.pop(); return; }
    startCell = null;
  }

  function reset() { lines.length = 0; startCell = null; }

  const lineCount = () => lines.length;
  const canExtract = () => lines.length >= 4 && lines.length % 4 === 0;
  const linesNeeded = () =>
    lines.length < 4 ? 4 - lines.length : (4 - (lines.length % 4)) % 4;
  const allLines = () => lines.map((l) => ({ cells: l.cells.map((c) => ({ ...c })) }));
  const extractedLines = () => lines.map((l) => l.chars.join(''));

  return {
    pickStart, addLine, undo, reset, isPivot,
    currentAnchor, lineCount, canExtract, linesNeeded, allLines, extractedLines,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/selection.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/selection.js test/selection.test.js
git commit -m "feat: add pivot-rule selection state with injected grid"
```

---

## Task 6: Translation prompt (`src/prompt.js`)

The prompt must prepare the LLM for path-extracted classical text: traditional
characters, oblique/fragmentary reading, per-line quatrain mapping, defined
output format.

**Files:**
- Create: `src/prompt.js`
- Test: `test/prompt.test.js`

- [ ] **Step 1: Write the failing tests**

```js
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
  return [
    `The lines below were extracted from Su Hui's 4th-century reversible poem`,
    `"Star Gauge" (璇璣圖) by tracing a path through its 29×29 character grid.`,
    `Su Hui wove the original into silk for her husband Dou Tao, exiled far`,
    `away; its themes are longing, separation, and constancy — let that colour`,
    `your reading. The characters are traditional Chinese. Each line is exactly`,
    `7 characters; the poem is ${n} lines (${q}).`,
    ``,
    `Because the path turns freely through the grid, the lines may read obliquely`,
    `or fragmentarily — that is part of the form. Do not "correct" the text.`,
    ``,
    lines.join('\n'),
    ``,
    `Render this as an English poem, line for line, preserving the four-line`,
    `quatrain structure. Favour the imagery and mood over literal gloss, but do`,
    `not invent lines. Then add a note of 2–3 sentences on your reading.`,
    `Format: the poem first, a blank line, then the note.`,
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/prompt.test.js`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/prompt.js test/prompt.test.js
git commit -m "feat: add translation prompt builder tuned for path-extracted text"
```

---

## Task 7: OpenAI integration scaffold (`src/translate.js`)

**Scaffolded but NEVER invoked in v1.** Tests only check the request shape — no
network. No `temperature` field (newer OpenAI models reject non-default values).

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

test('request body carries the prompt and default model, and no temperature', () => {
  const req = buildOpenAIRequest('translate me', { apiKey: 'sk-test' });
  const body = JSON.parse(req.body);
  assert.equal(body.model, DEFAULT_MODEL);
  assert.equal(body.messages.find((m) => m.role === 'user').content, 'translate me');
  assert.ok(!('temperature' in body), 'omit temperature for model forward-compatibility');
});

test('model can be overridden', () => {
  const req = buildOpenAIRequest('x', { apiKey: 'k', model: 'some-newer-model' });
  assert.equal(JSON.parse(req.body).model, 'some-newer-model');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/translate.test.js`
Expected: FAIL — cannot find module `../src/translate.js`.

- [ ] **Step 3: Implement `src/translate.js`**

```js
// src/translate.js — OpenAI Chat Completions integration.
// SCAFFOLDED BUT DISABLED: translatePoem() is not called anywhere in v1 and
// must consume zero credits. Enabling later: supply an API key, set
// LLM_ENABLED = true in app.js, and wire the Translate button (see app.js note).
// SECURITY NOTE: calling OpenAI directly from a browser exposes the key to that
// browser — fine for personal/local use; use a proxy for anything public.
export const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
export const DEFAULT_MODEL = 'gpt-4o-mini'; // swap freely for a newer model id

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
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add src/translate.js test/translate.test.js
git commit -m "feat: scaffold inactive OpenAI translation integration"
```

---

## Task 8: App wiring — grid, compass, live output (`src/app.js`)

Wires the pure modules to the DOM: grid render, compass control with hover
preview, live poem panel, prompt auto-fill at whole quatrains, clipboard copy,
region toggle. Verified manually in a browser (desktop + ~390px viewport).

**Files:**
- Create: `src/app.js`

- [ ] **Step 1: Implement `src/app.js`**

```js
// src/app.js — DOM wiring.
import { GRID, CENTER } from './grid-data.js';
import { DIRECTIONS, isCenter, lineCells, validDirectionsFrom } from './geometry.js';
import { regionAt } from './regions.js';
import { createSelection } from './selection.js';
import { buildPrompt } from './prompt.js';

// v1: the live OpenAI call is intentionally disabled. To enable later:
//   1) set LLM_ENABLED = true,
//   2) import { translatePoem } from './translate.js',
//   3) add a click handler on #translate that calls translatePoem(promptTextEl.value, key)
//      and writes the result into #poem-en.
const LLM_ENABLED = false;

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const selection = createSelection(GRID);

const gridEl = document.getElementById('grid');
const compassEl = document.getElementById('compass');
const progressEl = document.getElementById('progress');
const undoBtn = document.getElementById('undo');
const resetBtn = document.getElementById('reset');
const regionsToggle = document.getElementById('regions-toggle');
const outputEl = document.getElementById('output');
const poemZhEl = document.getElementById('poem-zh');
const promptStatusEl = document.getElementById('prompt-status');
const promptTextEl = document.getElementById('prompt-text');
const copyPromptBtn = document.getElementById('copy-prompt');
const translateBtn = document.getElementById('translate');

const cellEls = []; // cellEls[row][col]
const compassBtns = new Map(); // dir.id -> button

function buildGrid() {
  for (let r = 0; r < 29; r++) {
    cellEls[r] = [];
    for (let c = 0; c < 29; c++) {
      const el = document.createElement('div');
      el.className = `cell r-${regionAt(r, c)}`;
      el.textContent = GRID[r][c];
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

// Compass: 3×3 grid — 8 direction buttons around a hole showing the junction.
// Grid order: nw n ne / w hole e / sw s se.
function buildCompass() {
  const DIR_WORDS = { n: 'north', ne: 'north-east', e: 'east', se: 'south-east', s: 'south', sw: 'south-west', w: 'west', nw: 'north-west' };
  const layout = ['nw', 'n', 'ne', 'w', null, 'e', 'sw', 's', 'se'];
  for (const id of layout) {
    if (id === null) {
      const hole = document.createElement('span');
      hole.className = 'hole';
      compassEl.appendChild(hole);
      continue;
    }
    const dir = DIRECTIONS.find((d) => d.id === id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = dir.arrow;
    btn.setAttribute('aria-label', `extend line ${DIR_WORDS[id]}`);
    btn.addEventListener('click', () => { clearPreview(); selection.addLine(dir); render(); });
    btn.addEventListener('mouseenter', () => previewLine(dir));
    btn.addEventListener('focus', () => previewLine(dir));
    btn.addEventListener('mouseleave', clearPreview);
    btn.addEventListener('blur', clearPreview);
    compassEl.appendChild(btn);
    compassBtns.set(id, btn);
  }
}

function onCellClick(row, col) {
  if (selection.pickStart({ row, col })) render();
  // After a start exists, direction choices go through the compass only.
}

function previewLine(dir) {
  clearPreview();
  const anchor = selection.currentAnchor();
  if (!anchor) return;
  const cells = lineCells(anchor, dir, selection.isPivot());
  if (!cells) return;
  for (const c of cells) cellEls[c.row][c.col].classList.add('preview');
}

function clearPreview() {
  for (const el of gridEl.querySelectorAll('.preview')) el.classList.remove('preview');
}

function positionCompass(anchor) {
  const cell = cellEls[anchor.row][anchor.col];
  compassEl.hidden = false;
  // offsetParent of both is .grid-frame (position: relative).
  const cx = cell.offsetLeft + cell.offsetWidth / 2;
  const cy = cell.offsetTop + cell.offsetHeight / 2;
  compassEl.style.left = `${cx - compassEl.offsetWidth / 2}px`;
  compassEl.style.top = `${cy - compassEl.offsetHeight / 2}px`;
  cell.scrollIntoView({ block: 'center', inline: 'center', behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
}

function render() {
  clearPreview();
  for (const el of gridEl.querySelectorAll('.in-line, .junction')) {
    el.classList.remove('in-line', 'junction');
  }
  for (const line of selection.allLines()) {
    for (const c of line.cells) cellEls[c.row][c.col].classList.add('in-line');
  }

  const anchor = selection.currentAnchor();
  if (anchor) {
    cellEls[anchor.row][anchor.col].classList.add('junction');
    const valid = new Set(validDirectionsFrom(anchor, selection.isPivot()).map((d) => d.id));
    for (const [id, btn] of compassBtns) btn.disabled = !valid.has(id);
    positionCompass(anchor);
  } else {
    compassEl.hidden = true;
  }

  const n = selection.lineCount();
  const needed = selection.linesNeeded();
  progressEl.textContent = !anchor
    ? 'Tap a character to begin.'
    : n === 0
      ? 'Now choose a direction on the compass — the line will run 7 characters.'
      : selection.canExtract()
        ? `${n} lines — ${n / 4} quatrain${n === 4 ? '' : 's'} complete. Extend by 4 or copy the prompt.`
        : `${n} line${n === 1 ? '' : 's'} — add ${needed} more to complete the quatrain.`;

  undoBtn.disabled = !anchor && n === 0;
  resetBtn.disabled = !anchor && n === 0;

  // Live output: visible from the first committed line onward; never vanishes.
  outputEl.hidden = n === 0;
  poemZhEl.textContent = selection.extractedLines().join('\n');
  if (selection.canExtract()) {
    promptTextEl.value = buildPrompt(selection.extractedLines());
    promptStatusEl.textContent = '';
    copyPromptBtn.disabled = false;
  } else {
    promptTextEl.value = '';
    promptStatusEl.textContent = n === 0 ? '' : `Add ${needed} more line${needed === 1 ? '' : 's'} to complete the quatrain.`;
    copyPromptBtn.disabled = true;
  }
}

async function onCopyPrompt() {
  try {
    await navigator.clipboard.writeText(promptTextEl.value);
    copyPromptBtn.textContent = 'Copied!';
  } catch {
    promptTextEl.select();
    copyPromptBtn.textContent = 'Press Ctrl+C to copy';
  }
  setTimeout(() => { copyPromptBtn.textContent = 'Copy translation prompt'; }, 1800);
}

undoBtn.addEventListener('click', () => { selection.undo(); render(); });
resetBtn.addEventListener('click', () => { selection.reset(); render(); });
regionsToggle.addEventListener('change', () =>
  document.body.classList.toggle('show-regions', regionsToggle.checked));
copyPromptBtn.addEventListener('click', onCopyPrompt);
translateBtn.disabled = !LLM_ENABLED;

buildGrid();
buildCompass();
render();
```

- [ ] **Step 2: Manual verification — desktop**

ES modules require a server; `file://` will NOT work.

Run: `npx --yes serve .` (or `python -m http.server`), open the printed URL.

Verify:
- 29×29 grid renders; centre 心 is vermillion and non-clickable.
- Clicking a character shows the compass centred on it; invalid arrows greyed
  out (try a corner: only 3 enabled).
- Hovering an arrow glows the 7 cells it would commit; leaving clears the glow.
- Clicking an arrow commits the line (gold), moves the compass to the junction.
- **Pivot rule:** the next line's glow starts one cell PAST the junction; in the
  "Poem so far" panel, no character repeats across a line boundary.
- Output panel appears at 1 line and never disappears; poem text grows live.
- At 4 lines the prompt box fills and Copy enables; at 5 lines the prompt
  clears with "Add 3 more lines…" but the poem stays.
- Undo steps back one line (compass follows); a final Undo clears the start;
  Reset clears all.
- Colour-regions toggle tints; path highlights still visible over tints.
- "About this poem" expands/collapses; credits footer links to Wikisource and
  Wikipedia.
- Translate button disabled; Network tab shows zero requests to openai.com.

- [ ] **Step 3: Manual verification — mobile (~390px)**

In DevTools device emulation (e.g. iPhone 14, 390×844):
- Grid pans smoothly inside its viewport; committed path stays visible.
- Compass buttons are ≥44px (coarse-pointer media query) and tappable without
  mis-hits; the junction auto-scrolls into view after each line.
- Layout is single-column; controls stay sticky at top; no horizontal page
  scroll (only the grid viewport scrolls).
- Copy works (or shows the Ctrl+C fallback text) on localhost.

- [ ] **Step 4: Commit**

```bash
git add src/app.js
git commit -m "feat: wire grid, compass control, live poem output, prompt copy"
```

---

## Task 9: Full test run + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Run the whole test suite**

Run: `node --test`
Expected: PASS — all suites (grid-data, geometry, regions, selection, prompt,
translate) green.

- [ ] **Step 2: Write `README.md`**

```markdown
# 璇璣圖 · Star Gauge

Interactive explorer for Su Hui's 4th-century reversible poem. Tap a character,
then steer with the 8-way compass: each press commits a straight 7-character
line, pivoting at the junction (no repeated characters). At 4, 8, 12 … lines you
have whole quatrains: the Chinese poem builds live and a copy-ready LLM
translation prompt is generated. See `CLAUDE.md` for the design rules.

## Run

**Static site, no build — but it MUST be served** (ES modules do not load from
`file://`; double-clicking `index.html` gives a blank page):

    npx serve .
    # or: python -m http.server

## Test

    node --test

## Notes
- Traditional characters (Wikisource edition); the centre 心 belongs to no poem
  and is inert.
- Enforcement is geometry-only (no rhyme checking).
- Colour regions are a stylized, display-only layer.
- The OpenAI translation is scaffolded but disabled (`LLM_ENABLED = false` in
  `src/app.js`); v1 makes no API calls. Enabling instructions are in that file.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README and confirm full test suite passes"
```

---

## Self-Review Notes (v2)

- **v1-plan findings fixed here:** junction duplication → pivot rule (Task 3/5,
  tested); output-panel whiplash → live panel that never vanishes (Task 8);
  grid sourcing risk → data embedded and pre-verified (Task 2); source
  disagreements → Wikisource declared canonical with variants documented;
  `GRID` hard-import → injected into `createSelection` (Task 5); Windows font
  stack + ≥18px glyphs (Task 1); prompt tuned for oblique path-extracted text
  (Task 6); `temperature` removed for model forward-compatibility (Task 7);
  touch UX → compass with 44px coarse-pointer targets, pannable grid viewport,
  ~390px manual checks (Tasks 1/8); `file://` gotcha documented (Task 9).
- **Type consistency:** `selection` exposes `pickStart/addLine/undo/reset/
  isPivot/currentAnchor/lineCount/canExtract/linesNeeded/allLines/
  extractedLines`; `geometry` exposes `DIRECTIONS/SIZE/LINE_LENGTH/CENTER/
  inGrid/isCenter/lineCells/isValidLine/validDirectionsFrom`; `regions` exposes
  `regionAt/REGION_IDS`; `translate` exposes `buildOpenAIRequest/translatePoem/
  OPENAI_URL/DEFAULT_MODEL`. Verified consistent across Tasks 3–8.
- **Hard constraint honoured:** no live OpenAI call anywhere; `LLM_ENABLED =
  false`; Translate button disabled; Task 8 verification includes checking the
  Network tab.

---

## Future ideas (NOT in v1 — do not build these)

- **Keyboard navigation:** grid cells are pointer-only in v1 (no tabindex/roving
  focus); the compass buttons are focusable but unreachable without a pointer.
  A proper keyboard mode needs roving tabindex on the grid plus focus handoff
  when the focused compass button becomes disabled — its own small spec.
- **Reverse reading:** a button that flips the extracted poem (lines in reverse
  order and/or each line read backwards) — the poem is famously reversible and
  the geometry already supports both directions.
- **Poem-counter flavour text:** "2,848 quatrains hide in this grid — you found
  one."
- **Compare with a human translator:** link David Hinton's 2012 English
  rendering, *Star Gauge*.
- **Styling prior art:** Jen Bervin's *Su Hui's Reversible Poem* project and the
  interactive version linked from the Wikipedia article.
- **Rhyme highlighting** (平水韻 rhyme groups) — genuinely hard; needs its own
  spec.
- **Region-specific reading grammars** (blue 3-char mode; circular 112-char
  border poem) — each its own spec.
- **Live OpenAI translation:** flip `LLM_ENABLED`, add key handling per the note
  in `src/app.js`.
