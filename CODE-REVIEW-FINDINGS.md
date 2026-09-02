# Code review findings — uncommitted `styles.css` changes

Review scope: the working-tree diff to `styles.css` (grid palette retune, cell 34→36px,
hover affordance, center-心 gradient, junction outline 3px). Medium-effort review:
8 finder angles, each candidate independently verified against the actual code.
4 findings survived; 1 candidate was refuted (see bottom). Ranked most-severe first.

**All findings are fixes to `styles.css` only — no JS changes required.**

---

## 1. Hover rule fights the first-pick junction cell and out-specifies `.preview` — CONFIRMED

**Where:** `styles.css:83`

```css
.cell:not(.center):not(.in-line):hover {
  background: var(--gold-glow);
  box-shadow: inset 0 0 0 1px var(--gold);
}
```

**Problem:** The selector excludes only `.center` and `.in-line`, but not `.junction`
or `.preview`.

- **Junction (easily triggered):** On the very first pick, `render()`
  (`src/app.js:120`) adds `.junction` to the tapped cell *without* `.in-line`
  (no committed lines exist yet, so the `.in-line` pass at `src/app.js:115` marks
  nothing). The compass container is `pointer-events: none` and its center hole
  inherits that, so the pointer — which is already resting on the cell the user
  just clicked — hovers it. Result: gold-glow fill + 1px gold inset painted
  *inside* the vermillion junction outline, visually fighting the junction marker
  immediately after every first pick.
- **Preview (mixed input only):** The selector's specificity is (0,4,0)
  (`:not()` counts its argument), beating `.cell.preview` at (0,2,0). If a compass
  button is focused via keyboard while the mouse rests on a previewed cell, the
  preview's intended 2px inset ring thins to 1px. (Pure-mouse can't trigger it —
  `mouseleave` on the button clears the preview first.)

**Fix (right-depth):** Replace the `:not()` enumeration with a plain `.cell:hover`
rule placed **before** all the state rules (`.center`, `.in-line`, `.junction`,
`.preview`). At equal or higher specificity and later source order, every state
rule then wins over hover automatically — including any state class added in the
future — with no exclusion list to maintain. Give `.cell.junction` a background
(or keep its outline-only treatment but ensure a background is asserted by a
state rule) so hover never bleeds through on a junction-only cell.

---

## 2. Sticky `:hover` highlight on touch devices — CONFIRMED

**Where:** `styles.css:83` (same rule as finding 1)

**Problem:** Bare `:hover` with no hover-capability guard. Touch is a supported
target (the stylesheet already has `@media (pointer: coarse)` at `styles.css:164`
for 44px compass buttons). On touch, tapping a cell latches `:hover`:

- Invalid tap (e.g. tapping a second cell when a start already exists):
  `selection.pickStart` returns `false` (`src/selection.js:15-20`), `render()`
  never runs, and the tapped bare cell keeps a persistent gold-glow + gold inset
  that looks exactly like selection state until the user taps elsewhere.
- Valid first tap: the cell becomes `.junction`-only, which the current
  exclusions don't mask (see finding 1), so the latched hover paints over it.

**Fix:** Wrap the cell hover rule in `@media (hover: hover)` (optionally
`(hover: hover) and (pointer: fine)`). Combine with the finding-1 restructure —
the media query wraps the new plain `.cell:hover` rule.

---

## 3. New `.cell` transition not gated by reduced-motion — PLAUSIBLE (convention)

**Where:** `styles.css:80` — `transition: background-color .08s ease;` on `.cell`

**Problem:** The project deliberately honors reduced motion (commit `cb21cb9`;
`src/app.js:15` defines `REDUCED_MOTION` and `src/app.js:106` uses it to switch
`scrollIntoView` to non-smooth). `styles.css` has **no**
`@media (prefers-reduced-motion: reduce)` block, so reduced-motion users still get
the animated background cross-fade on all 841 cells. An 80ms color fade is
low-risk under a strict WCAG reading, but it's inconsistent with the convention
the project chose.

**Fix:** Add once, at the end of the stylesheet:

```css
@media (prefers-reduced-motion: reduce) {
  .cell { transition: none; }
}
```

(Or a broader `* { transition-duration: 0.01ms !important; }` policy block if you
prefer a stylesheet-wide motion policy — either satisfies the convention.)

---

## 4. Center-心 radial gradient vanishes in Colour-regions mode — CONFIRMED, low severity

**Where:** `styles.css:90` (new gradient) vs `styles.css:146`

**Problem:** `.show-regions .cell.r-center { background: #f0d5cd; }` is (0,3,0)
and later in source; the new gradient on `.cell.center` is (0,2,0). With the
regions checkbox on (`src/app.js:168-169` toggles `body.show-regions`; the center
cell carries `cell r-center center`), the gradient is overridden by the flat pink
tint. 心 stays distinct (vermillion glyph, bold, enlarged — CLAUDE.md satisfied),
so this is cosmetic: the gradient this diff added simply never shows in one
display mode.

**Fix (pick one):**
- If the gradient should persist in regions mode: raise the center rule to
  `.cell.center, .show-regions .cell.center { background: radial-gradient(...); }`
  or move/duplicate the gradient after line 146 as
  `.show-regions .cell.r-center.center { background: radial-gradient(...); }`.
- If the flat region tint is intended to win: add a one-line comment at
  `styles.css:90` noting the regions override is deliberate, so the next reader
  doesn't re-flag it.

---

## Refuted during verification (do NOT "fix")

- **`--cell-bg`/`--line` duplicating `--silk`/`--weave`:** Refuted. The new tokens
  are meaningfully different values with inline comments documenting intent
  (`near-white silk so ink glyphs read clearly`, `visibly darker than a cell`).
  Deliberate differentiation, not accidental duplication — leave as is.
- Also verified clean: `--cell` 34→36px breaks no JS (compass positioning uses
  live `offsetLeft/offsetWidth`, nothing hardcodes 34); `--silk`/`--weave` are
  still live elsewhere; the junction outline 3px/-3px has no layout dependency;
  CJK font stack and ≥44px coarse-pointer compass buttons untouched.

## Suggested verification after fixes

Serve over HTTP and check: (1) tap a first start cell — no gold fill inside the
vermillion junction outline; (2) DevTools device/touch emulation — tapping cells
leaves no lingering gold highlight; (3) emulate `prefers-reduced-motion: reduce` —
cell backgrounds flip instantly; (4) toggle Colour regions — center 心 renders per
whichever option was chosen in finding 4. `node --test` should stay green (CSS-only
changes, but per superpowers verification convention, run it before claiming done).
