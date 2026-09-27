// src/app.js — DOM wiring.
import { GRID } from './grid-data.js';
import { DIRECTIONS, SIZE, isCenter, lineCells, validDirectionsFrom } from './geometry.js';
import { regionAt } from './regions.js';
import { createSelection } from './selection.js';
import { buildPrompt } from './prompt.js';
import { pathToThreadGeometry } from './thread-path.js';
import { nextRegionsState } from './controls.js';
import { silkVars } from './silk.js';
import { isQuatrainMilestone } from './milestone.js';

// v1: the live OpenAI call is intentionally disabled. To enable later:
//   1) set LLM_ENABLED = true,
//   2) import { translatePoem } from './translate.js',
//   3) add a click handler on #translate that calls translatePoem(promptTextEl.value, key)
//      and writes the result into #poem-en.
const LLM_ENABLED = false;

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const selection = createSelection(GRID);

const gridEl = document.getElementById('grid');
const frameEl = gridEl.parentElement;      // .grid-frame — the overlay's anchor
const threadEl = document.getElementById('thread');
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
const englishHelpEl = document.getElementById('english-help');
// The card the finished poem sits in — the thing the completion moment reveals.
const poemCardEl = poemZhEl.closest('.poem-chinese');

const cellEls = []; // cellEls[row][col]
const compassBtns = new Map(); // dir.id -> button

function buildGrid() {
  for (let r = 0; r < 29; r++) {
    cellEls[r] = [];
    for (let c = 0; c < 29; c++) {
      const el = document.createElement('div');
      el.className = `cell r-${regionAt(r, c)}`;
      el.lang = 'zh-Hant';
      el.textContent = GRID[r][c];
      // Where this cell sits on the cloth, 0%-100% across the 28 intervals, so
      // the one broad silk sheen in styles.css runs unbroken from cell to cell
      // at either --cell size. Position only: the gradient itself is shared CSS.
      for (const [prop, value] of Object.entries(silkVars(r, c))) {
        el.style.setProperty(prop, value);
      }
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
    btn.addEventListener('click', () => {
      clearPreview();
      // Only a line that was actually committed is drawn on; a rejected
      // direction re-renders unchanged and must not re-animate anything.
      const before = selection.lineCount();
      const added = selection.addLine(dir);
      // The compass is the only place a quatrain can be *completed*, so it is
      // the only place that asks for the reveal — and only for the step that
      // actually landed on a multiple of four.
      const revealCompletion = added && isQuatrainMilestone(before, selection.lineCount());
      render({ animateNewest: added, revealCompletion });
    });
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

function positionCompass(anchor, { scroll = true } = {}) {
  const cell = cellEls[anchor.row][anchor.col];
  compassEl.hidden = false;
  // offsetParent of both is .grid-frame (position: relative).
  const cx = cell.offsetLeft + cell.offsetWidth / 2;
  const cy = cell.offsetTop + cell.offsetHeight / 2;
  compassEl.style.left = `${cx - compassEl.offsetWidth / 2}px`;
  compassEl.style.top = `${cy - compassEl.offsetHeight / 2}px`;
  if (scroll) {
    cell.scrollIntoView({ block: 'center', inline: 'center', behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
  }
}

// --- Gold thread overlay ------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

// Cell geometry is read back from the rendered boxes rather than assumed from
// the CSS: --cell changes with the media query, and CJK fonts can settle late.
// Coordinates are relative to .grid-frame, which is both the overlay's
// containing block and the compass's offsetParent.
function measureLayout() {
  if (cellEls.length !== SIZE) return null;
  const frame = frameEl.getBoundingClientRect();
  const first = cellEls[0][0].getBoundingClientRect();
  const lastCol = cellEls[0][SIZE - 1].getBoundingClientRect();
  const lastRow = cellEls[SIZE - 1][0].getBoundingClientRect();
  if (!frame.width || !first.width) return null; // not laid out yet
  const midX = (r) => r.left + r.width / 2;
  const midY = (r) => r.top + r.height / 2;
  return {
    originX: midX(first) - frame.left,
    originY: midY(first) - frame.top,
    // Averaged over the full span so sub-pixel cell sizes don't accumulate.
    stepX: (midX(lastCol) - midX(first)) / (SIZE - 1),
    stepY: (midY(lastRow) - midY(first)) / (SIZE - 1),
    width: frame.width,
    height: frame.height,
  };
}

// drawThread() rebuilds the whole overlay every call, so "animate" cannot mean
// "animate what is here" — it would replay the entire path on every move and on
// every resize. `animateNewest` is an explicit, one-shot intent passed only by
// the action that just added a line: exactly one strand gets the drawing class,
// every earlier strand is rendered final.
function drawThread({ animateNewest = false } = {}) {
  threadEl.replaceChildren();
  const layout = measureLayout();
  if (!layout) return;
  threadEl.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);

  // Before the first line there are no cells to draw, only the picked start.
  const start = selection.lineCount() === 0 ? selection.currentAnchor() : null;
  const geo = pathToThreadGeometry(selection.allLines(), layout, { start });
  if (geo.segments.length === 0 && !geo.start) return;

  // The reduced-motion gate lives here as well as in CSS so the class is never
  // even applied when the user has asked for no motion.
  const drawNewest = animateNewest && !REDUCED_MOTION;
  const newestIndex = geo.segments.length - 1;

  const pitch = Math.min(layout.stepX, layout.stepY);
  const defs = svgEl('defs', {});
  const strands = svgEl('g', { class: 'strands' });

  for (const seg of geo.segments) {
    // One gradient per segment, in user space from the segment's first point to
    // its last: the thread deepens the way it was drawn, so a still frame shows
    // reading order without any animation.
    const gradient = svgEl('linearGradient', {
      id: seg.gradientId,
      gradientUnits: 'userSpaceOnUse',
      x1: seg.from.x, y1: seg.from.y, x2: seg.to.x, y2: seg.to.y,
    });
    gradient.append(
      svgEl('stop', { class: 'strand-from', offset: '0' }),
      svgEl('stop', { class: 'strand-to', offset: '1' }),
    );
    defs.append(gradient);
    const isNewest = seg.index === newestIndex;
    strands.append(svgEl('polyline', {
      class: drawNewest && isNewest ? 'strand strand-drawing' : 'strand',
      points: seg.pointsAttr,
      stroke: `url(#${seg.gradientId})`,
      'stroke-width': Math.max(2.5, pitch * 0.1),
      // Normalised length: one dash unit spans the segment, so a diagonal run
      // draws in the same time as an orthogonal one.
      pathLength: '1',
    }));
  }

  const knots = svgEl('g', { class: 'knots' });
  for (const pivot of geo.pivots) {
    knots.append(svgEl('circle', { class: 'knot', cx: pivot.x, cy: pivot.y, r: pitch * 0.3 }));
  }
  if (geo.start) {
    // Double ring — deliberately unlike the single-ring pivot knots.
    knots.append(svgEl('circle', { class: 'knot-start', cx: geo.start.x, cy: geo.start.y, r: pitch * 0.4 }));
    knots.append(svgEl('circle', { class: 'knot-start-inner', cx: geo.start.x, cy: geo.start.y, r: pitch * 0.26 }));
  }
  if (geo.end) {
    knots.append(svgEl('circle', { class: 'knot-head', cx: geo.end.x, cy: geo.end.y, r: Math.max(2.5, pitch * 0.085) }));
  }

  threadEl.append(defs, strands, knots);
}

// --- Quatrain completion moment -----------------------------------------

// Landing on a fourth line is the payoff, so the app shows the reader the thing
// they just made: the finished poem is scrolled into view once, and the card it
// sits in warms for a few seconds. Nothing is laid over .poem-chinese — no
// overlay, modal or covering pseudo-element — because at 375px the sticky
// controls bar already owns the top of the screen and the poem must stay
// readable underneath it. #progress (role="status") remains the announcement.
//
// This is the one render that moves the page on its own, so it is careful about
// contending with positionCompass(): the completion render positions the
// compass without scrolling (see render), and this scrolls the poem instead.
// The poem is only revealed once the newest strand has finished drawing, so the
// two PER-23 motions read as one gesture rather than racing each other.
const REVEAL_FALLBACK_MS = 1600; // > the 1.2s strand draw, if animationend never lands
const REVEAL_REST_MS = 2600;     // how long the card keeps its completion warmth

// Bumped by anything that supersedes a pending reveal, so a delayed reveal that
// was already in flight can tell that it is stale and do nothing.
let revealGeneration = 0;
let revealTimer = null;
let revealStrand = null;
let onStrandDrawn = null;
let revealRestTimer = null;

// Drops a reveal that has not fired yet, without touching one that already has.
function clearPendingReveal() {
  revealGeneration++;
  clearTimeout(revealTimer);
  revealTimer = null;
  if (revealStrand && onStrandDrawn) revealStrand.removeEventListener('animationend', onStrandDrawn);
  revealStrand = null;
  onStrandDrawn = null;
}

// Every render that is not itself a completion calls this: undo, reset, picking
// a start, and an ordinary fifth line all end the moment, so the page can never
// scroll or glow after the user has moved on.
function endCompletionMoment() {
  clearPendingReveal();
  clearTimeout(revealRestTimer);
  revealRestTimer = null;
  poemCardEl.classList.remove('is-complete');
}

function startCompletionReveal() {
  endCompletionMoment();
  const generation = revealGeneration;
  // Under reduced motion no strand is drawing and nothing is waited on: the
  // poem is simply already there, and the scroll below jumps outright.
  if (REDUCED_MOTION) return revealCompletedPoem(generation);
  const strand = threadEl.querySelector('.strand-drawing');
  if (!strand) return revealCompletedPoem(generation);
  revealStrand = strand;
  onStrandDrawn = () => revealCompletedPoem(generation);
  strand.addEventListener('animationend', onStrandDrawn, { once: true });
  revealTimer = setTimeout(onStrandDrawn, REVEAL_FALLBACK_MS);
}

function revealCompletedPoem(generation) {
  if (generation !== revealGeneration) return; // superseded — undo, reset, or a newer line
  clearPendingReveal(); // whichever of the listener and the timer did not fire
  poemCardEl.classList.add('is-complete');
  // block: 'center' rather than a pinned offset — the poem lands in the middle
  // of the viewport, clear of the sticky controls bar at every width.
  poemCardEl.scrollIntoView({ block: 'center', behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
  revealRestTimer = setTimeout(() => {
    poemCardEl.classList.remove('is-complete');
    revealRestTimer = null;
  }, REVEAL_REST_MS);
}

function render({ animateNewest = false, revealCompletion = false } = {}) {
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
    // The compass is repositioned as always, but on a completion render it does
    // not scroll: the poem reveal below owns the one scroll, and two competing
    // scrolls would fight over where the page finally settles.
    positionCompass(anchor, { scroll: !revealCompletion });
  } else {
    compassEl.hidden = true;
  }

  drawThread({ animateNewest });

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

  // Last, so the poem the reveal scrolls to is the one this render just wrote.
  if (revealCompletion) startCompletionReveal();
  else endCompletionMoment();
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

// Colour regions is a native button toggle, so aria-pressed *is* the state.
// The transition itself lives in ./controls.js (pure, and so testable); this
// only applies it, writing the attribute and the body class out of the one
// state object, which is why the two cannot drift.
function applyRegionsState({ on, ariaPressed }) {
  regionsToggle.setAttribute('aria-pressed', ariaPressed);
  document.body.classList.toggle('show-regions', on);
}

undoBtn.addEventListener('click', () => { selection.undo(); render(); });
resetBtn.addEventListener('click', () => { selection.reset(); render(); });
regionsToggle.addEventListener('click', () =>
  applyRegionsState(nextRegionsState(regionsToggle.getAttribute('aria-pressed'))));
copyPromptBtn.addEventListener('click', onCopyPrompt);
translateBtn.disabled = !LLM_ENABLED;
// The "translation is off" helper only applies while the live call is disabled.
englishHelpEl.hidden = LLM_ENABLED;

buildGrid();
buildCompass();
render();

// Cell boxes change with the media query, a window resize, or a late-loading
// CJK font. Re-measure and redraw only — calling render() here would run
// positionCompass()'s scrollIntoView and yank the user's pan position.
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => {
    // A pending completion reveal is waiting on a strand this redraw is about
    // to replace: the element it listens to is discarded, and the fallback
    // timer would otherwise fire later and scroll the page in the middle of a
    // resize or an orientation change. The moment belongs to the move that
    // earned it, not to a resize, so it is dropped here. A reveal that already
    // fired keeps its warmed frame — only what has not happened yet is cancelled.
    clearPendingReveal();
    drawThread();
    const anchor = selection.currentAnchor();
    if (anchor) positionCompass(anchor, { scroll: false });
  }).observe(gridEl);
}
