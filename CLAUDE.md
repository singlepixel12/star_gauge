# CLAUDE.md — Star Gauge Poem Extractor

## What we are building

An interactive, single-page **static website** for exploring Su Hui's 4th-century
reversible poem **璇玑圖 (Xuanji Tu / "Star Gauge")**. The user sees the authentic
**29×29 grid of 841 traditional-Chinese characters**, traces a continuous route
through it to build a poem (straight 7-character lines, connected end-to-start),
and once they have a full quatrain (≥4 lines, a multiple of 4) the app:

1. assembles the extracted **Chinese** poem,
2. builds a **copy-to-clipboard LLM prompt** embedding that poem, and
3. shows a dedicated **English-poem area** where the translation will appear.

The full plan lives in `2026-07-05-star-gauge-poem-extractor.md` (project root).
Read it before implementing.

## The intricacy of the Chinese here — READ THIS

This project lives or dies on handling the characters correctly. Treat the text
with care:

- **Traditional characters, NOT simplified.** The original brocade is in
  traditional Chinese. Do **not** run any traditional→simplified conversion. `璇
  玑圖` stays traditional. Keep every source file **UTF-8**.
- **841 characters = 840 + 1.** The original grid held 840 characters; a central
  **心 ("heart")** was added later. So `GRID` is 29×29 and `GRID[14][14] === '心'`
  (0-indexed center; the 15th row and column).
- **心 is special and inert.** The centre 心 "lends meaning to the whole but is
  not part of any of the smaller poems." It is rendered distinctly and can never
  be part of a selected line. Geometry must exclude it.
- **One codepoint per cell.** Every cell is exactly one CJK character. When
  transcribing the grid, verify **29 rows × 29 columns = 841** and beware of:
  invisible whitespace, full-width vs half-width confusion, variant characters
  (異體字), and any accidental simplified substitutions. Count, don't eyeball.
- **It is a reversible (palindrome-style) poem.** Lines can be read
  **horizontally, vertically, and diagonally, forwards and backwards**. Our v1
  reads straight 7-character runs in any of 8 directions — that is intentional
  and faithful to the "read every which way" nature.
- **Rhyme is real but NOT enforced.** Historically the 2nd line of each couplet
  rhymes; Chinese rhyme/tone checking is genuinely error-prone, so v1 does **not**
  validate rhyme. Do not add it without a dedicated spec.
- **Colour regions are stylized/approximate in v1.** Su Hui used five colours of
  silk to mark different reading rules. Accurate cell-by-cell colour data is not
  cleanly published and reconstructions disagree, so the colour tint is a
  **display-only geometric approximation, clearly labelled as such**. It must not
  affect validation.
- **The LLM output is a poem, not a gloss.** The prompt asks for an English poem
  that preserves the quatrain structure — not a literal word-by-word translation.

## Hard constraints

- **Do NOT make any live LLM/OpenAI API call in v1.** The OpenAI Chat Completions
  integration (`src/translate.js`) is written and ready but **must never be
  invoked**. A single guard `LLM_ENABLED = false` in `app.js` keeps the Translate
  button disabled. It must consume **zero** API credits until deliberately turned
  on. Never hard-code or commit an API key.
- **No build step, no framework.** Vanilla HTML/CSS/JS with small ES modules.
- **Region-specific reading rules are out of scope for v1** (the 3-char "blue
  corner" mode and the circular 112-char border poem are separate future specs).

## Conventions

- **TDD.** Pure logic modules (`geometry`, `selection`, `prompt`, `translate`,
  `regions`) are covered by tests in `test/` using Node's built-in test runner.
- **Run tests:** `node --test`
- **Commit frequently**, one logical change per commit.
- Keep modules small and single-purpose; no DOM access in the pure logic modules.
