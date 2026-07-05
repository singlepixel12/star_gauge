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
