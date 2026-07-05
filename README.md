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
