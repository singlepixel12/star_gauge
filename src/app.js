// src/app.js — DOM wiring.
import { GRID } from './grid-data.js';
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
