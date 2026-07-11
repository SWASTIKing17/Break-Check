#!/usr/bin/env node
// Scan FEATURE_GUIDE.md for filled-in "My Suggestion" cells.
// Honors backticks (no splitting on | inside `...`) and escaped pipes (\|).

const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'docs', 'FEATURE_GUIDE.md');
const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

function splitRow(line) {
  const cells = [];
  let buf = '';
  let inTick = false;
  let i = 0;
  while (i < line.length && line[i] === ' ') i++;
  if (line[i] === '|') i++;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === '|') { buf += '\\|'; i += 2; continue; }
    if (ch === '`') { inTick = !inTick; buf += ch; i++; continue; }
    if (ch === '|' && !inTick) { cells.push(buf); buf = ''; i++; continue; }
    buf += ch;
    i++;
  }
  return cells.map(c => c.trim());
}

let fence = false;
const inFence = lines.map(l => {
  if (l.trim().startsWith('```')) { fence = !fence; return true; }
  return fence;
});

const isSep = (l) => {
  if (!l.trim().startsWith('|')) return false;
  const c = splitRow(l);
  return c.length > 0 && c.every(x => /^:?-+:?$/.test(x));
};

let i = 0;
const findings = [];
while (i < lines.length) {
  if (inFence[i]) { i++; continue; }
  const line = lines[i];
  const next = lines[i + 1] || '';
  if (line.trim().startsWith('|') && !isSep(line) && isSep(next)) {
    const headers = splitRow(line);
    const msIdx  = headers.findIndex(h => /My\s*Suggestion/i.test(h));
    const htfIdx = headers.findIndex(h => /How\s*To\s*Fix/i.test(h));
    let j = i + 2;
    while (j < lines.length && !inFence[j] && lines[j].trim().startsWith('|')) {
      const cells = splitRow(lines[j]);
      if (msIdx >= 0 && cells[msIdx] && cells[msIdx].length > 0) {
        findings.push({
          line: j + 1,
          id: cells[0] || '?',
          behavior: cells[1] || '',
          suggestion: cells[msIdx],
          htf: htfIdx >= 0 ? (cells[htfIdx] || '') : ''
        });
      }
      j++;
    }
    i = j;
    continue;
  }
  i++;
}

if (findings.length === 0) {
  console.log('No My Suggestion content found.');
} else {
  console.log('Found ' + findings.length + ' filled My Suggestion cells:\n');
  findings.forEach(f => {
    console.log('Line ' + f.line + ' [' + f.id + ']');
    console.log('  Behavior  : ' + f.behavior);
    console.log('  Suggestion: ' + f.suggestion);
    if (f.htf) console.log('  HTF (existing): ' + f.htf);
    console.log('');
  });
}
