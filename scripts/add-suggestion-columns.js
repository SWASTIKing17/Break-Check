#!/usr/bin/env node
// One-shot: add "My Suggestion" and "How To Fix" columns to every markdown table in FEATURE_GUIDE.md.
// Preserves any existing content; only appends what is missing.

const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'docs', 'FEATURE_GUIDE.md');
const raw = fs.readFileSync(filePath, 'utf8');
const lines = raw.split(/\r?\n/);

// Mark lines inside ``` fenced code blocks.
const inFence = new Array(lines.length).fill(false);
let fence = false;
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  if (t.startsWith('```')) {
    fence = !fence;
    inFence[i] = true;
  } else {
    inFence[i] = fence;
  }
}

const isSeparator = (line) => {
  if (!line.trim().startsWith('|')) return false;
  const cells = line.split('|').slice(1, -1);
  if (cells.length === 0) return false;
  return cells.every(c => /^\s*:?-+:?\s*$/.test(c));
};

const appendBeforeFinalPipe = (line, addition) =>
  line.replace(/\|\s*$/, '|' + addition);

const out = [];
let i = 0;
while (i < lines.length) {
  if (inFence[i]) { out.push(lines[i]); i++; continue; }
  const line = lines[i];
  const next = lines[i + 1] || '';

  const looksLikeTableStart =
    line.trim().startsWith('|') &&
    !isSeparator(line) &&
    isSeparator(next);

  if (!looksLikeTableStart) { out.push(line); i++; continue; }

  // Process this table.
  const header = line;
  const sep = next;
  const hasMyS = /My\s*Suggestion/i.test(header);
  const hasHTF = /How\s*To\s*Fix/i.test(header);

  if (hasMyS && hasHTF) {
    // Already done — copy as-is and advance.
    out.push(header);
    out.push(sep);
    i += 2;
    // Pass through data rows untouched.
    while (i < lines.length && !inFence[i] && lines[i].trim().startsWith('|')) {
      out.push(lines[i]);
      i++;
    }
    continue;
  }

  const headerAdd = [];
  const sepAdd = [];
  const dataAdd = [];
  if (!hasMyS) { headerAdd.push(' My Suggestion '); sepAdd.push('---'); dataAdd.push(' '); }
  if (!hasHTF) { headerAdd.push(' How To Fix ');    sepAdd.push('---'); dataAdd.push(' '); }

  out.push(appendBeforeFinalPipe(header, headerAdd.join('|') + '|'));
  out.push(appendBeforeFinalPipe(sep,    sepAdd.join('|')    + '|'));
  i += 2;

  while (i < lines.length && !inFence[i] && lines[i].trim().startsWith('|')) {
    out.push(appendBeforeFinalPipe(lines[i], dataAdd.join('|') + '|'));
    i++;
  }
}

fs.writeFileSync(filePath, out.join('\n'), 'utf8');
console.log('Done. Tables in', filePath, 'updated.');
