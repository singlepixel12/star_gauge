# Roadmap — Star Gauge Poem Extractor

Status: draft for future fleshing-out. Each phase item needs its own spec before
implementation (per CLAUDE.md conventions: TDD, small pure modules, no build step).
Nothing here is committed scope until specced.

## Phase 0 — Ship what exists

- [ ] Apply the four `styles.css` findings in `CODE-REVIEW-FINDINGS.md`
      (hover/junction conflict, touch sticky-hover, reduced-motion gate,
      regions-mode center gradient).
- [ ] Commit the visual retune.
- [ ] Deploy to GitHub Pages (static site, ES modules need HTTP anyway).
      Add favicon + basic OG/meta tags before the link circulates.

## Phase 1 — Make it a complete artifact

The goal of this phase: turn the demo into something you'd send someone.

### 1a. Keyboard + screen-reader access to the grid  ⚠ HARD — needs careful spec

Today cells are plain `div`s with click handlers (`src/app.js:39-45`): not
focusable, no roles, unreachable without a mouse. The compass buttons are
accessible, but you can't get to the point where the compass appears.

Sketch (to be fleshed out):
- Roving tabindex over the 29×29 grid, arrow keys to move, Enter/Space to pick
  the start. One tab stop for the whole grid, not 841.
- `role="grid"` / `role="row"` / `role="gridcell"`, `aria-label` per cell giving
  the character + coordinates (SR reading of CJK glyphs needs testing with
  actual screen readers — NVDA on Windows first).
- After start is picked, focus should move into the compass; after a line is
  committed, back to… the new junction? The compass again? Needs a decision.
- Announce progress via the existing `role="status"` element rather than focus
  jumps.
- Open question: does arrow-key grid navigation fight the compass's own arrow
  semantics? Probably scope arrow keys to whichever widget has focus.

### 1b. Mobile ergonomics  ⚠ HARD — overlaps 1a, spec together

Known friction beyond the sticky-hover bug (Phase 0):
- The compass overlays neighbouring cells; on a phone the 8 buttons sit on top
  of the grid a finger just panned. Panning vs tapping vs compass-tapping needs
  real-device testing.
- 36px cells are below the 44px coarse-pointer floor we hold the compass to;
  cell taps are start-picking only, so it may be acceptable — verify, don't
  assume.
- Consider a bottom-sheet compass on small screens instead of the overlay
  (keeps the junction visible; loses the "compass at the junction" metaphor —
  design decision to make deliberately).
- Pinch-zoom / double-tap-zoom interaction with the pannable viewport is
  untested.

### 1c. Gold-thread path rendering (order + direction)

Traced cells are currently a flat `.in-line` tint: no visible start, line
breaks, or direction. CLAUDE.md's visual direction literally says "gold thread
for the traced path."
- SVG overlay, polyline cell-center to cell-center, junction markers where
  lines pivot; subtle start marker (1, 2, 3… per line, or a thread "knot").
- Pure helper (path → SVG points) is testable; keep DOM out of it.
- Must respect reduced motion if the thread is animated in.

### 1d. Shareable / persistent paths (URL hash)

Highest leverage single feature: a discovered poem becomes a link.
- Encoding sketch: `#r,c:e,s,ne,w` — start cell + direction-id sequence.
  Compact, human-readable-ish, versionable (`#v1;…`) for future modes.
- Replay through the existing `pickStart` + `addLine` API — `selection.js`
  already supports this; add a pure `encodePath`/`decodePath` module + tests.
- Reject invalid hashes gracefully (fall back to empty state, no error modal).
- Doubles as refresh-persistence; explicit localStorage resume becomes optional.

### 1e. "Show me one" — example poem walkthrough

Replay a documented historical reading (sourced from the plan file) so a first
visitor sees a real poem emerge in the first 30 seconds. Could reuse the 1d
decode/replay machinery with a small step-through animation (reduced-motion
aware).

## Phase 2 — Turn translation on

Gate: decide key handling FIRST (security note already in `src/translate.js`).
- Personal use: prompt for the user's own key, hold it in `sessionStorage`
  only, never persist, never commit.
- Public deployment: tiny proxy (e.g. Cloudflare Worker) holding the key
  server-side; the static site stays static.
- Then: `LLM_ENABLED = true`, wire the Translate button per the note in
  `app.js:8-12`, loading + error states in the English-poem card.
- Refresh the model id (`gpt-4o-mini` will be stale) and consider making
  provider/model a small config, not a hardcode.

## Phase 3 — Scholarship layer (future specs per CLAUDE.md)

Each of these is explicitly out of scope for v1 and requires its own spec:
- 3-character "blue corner" reading mode.
- Circular 112-character border poem.
- Accurate colour-region data, only if a citable source emerges (regions stay
  display-only and clearly labelled as stylized until then).
- Rhyme *hinting* — never enforcement (CLAUDE.md: error-prone; dedicated spec
  required).
- Decide the self-crossing question deliberately: paths can currently reuse
  characters mid-poem (only boundary repeats are forbidden). Optional
  "no self-crossing" toggle, or document that reuse is intentional freedom.

## Phase 4 — Delight

- Optional vertical right-to-left classical rendering of the extracted poem.
- Export the traced brocade as an image (canvas/SVG snapshot).
- Local gallery of found poems (localStorage; pairs naturally with 1d links).
- Reset confirmation (or multi-step undo) so a long trace can't be lost to one
  mistap.

## Ordering rationale

Phase 1d (shareable paths) compounds: the thread rendering, example replay,
gallery, and export all get more valuable once a poem is a link. If phases are
resequenced, keep 1d early.
