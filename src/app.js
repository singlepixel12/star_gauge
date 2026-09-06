// src/app.js — DOM wiring.
import { GRID } from './grid-data.js';
import { DIRECTIONS, SIZE, isCenter, lineCells, validDirectionsFrom } from './geometry.js';
import { regionAt } from './regions.js';
import { createSelection } from './selection.js';
import { buildPrompt } from './prompt.js';
import { pathToThreadGeometry } from './thread-path.js';

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
    btn.addEventListener('click', () => {
      clearPreview();
      // Only a line that was actually committed is drawn on; a rejected
      // direction re-renders unchanged and must not re-animate anything.
      const added = selection.addLine(dir);
      render({ animateNewest: added });
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

function render({ animateNewest = false } = {}) {
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
    drawThread();
    const anchor = selection.currentAnchor();
    if (anchor) positionCompass(anchor, { scroll: false });
  }).observe(gridEl);
}
