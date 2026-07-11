// Standalone Node simulation of the parse + phrasing parts of
// runCaptionWorkflow (mogrt.jsx:807). Validates the algorithm before
// we ask Premiere to run it for real. The getData + createCaptions
// parts can ONLY run inside Premiere — those aren't simulated here.

const fs = require('fs');

const SRT_PATH = "D:/Swastik 2026/June2026/24 June/Aditya kundli - Smart kundli report - Ai Reel - 01/Hindi.srt";
const CHARS_PER_PHRASE = 100;
const TRACK_START = 1;

function rcwTrim(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }
function tsToMs(ts) {
  const normalized = String(ts).replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length !== 3) return 0;
  const h = parseFloat(parts[0]) || 0;
  const m = parseFloat(parts[1]) || 0;
  const sm = parts[2].split('.');
  const sec = parseFloat(sm[0]) || 0;
  const ms = parseFloat(sm[1] || '0') || 0;
  return (h * 3600 + m * 60 + sec) * 1000 + ms;
}

const rawSrt = fs.readFileSync(SRT_PATH, 'utf8');
const blocks = rcwTrim(rawSrt).split(/\r?\n\r?\n/);

const wordsList = [];
for (let bi = 0; bi < blocks.length; bi++) {
  const rawLines = blocks[bi].split(/\r?\n/);
  const lines = [];
  for (const ln of rawLines) {
    const t = rcwTrim(ln);
    if (t) lines.push(t);
  }
  if (lines.length < 2) continue;

  let tsLine = null, tsIdx = -1;
  for (let li = 0; li < lines.length; li++) {
    if (lines[li].indexOf('-->') !== -1) { tsLine = lines[li]; tsIdx = li; break; }
  }
  if (!tsLine) continue;

  const tsMatch = tsLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
  if (!tsMatch) continue;

  const blockStart = tsToMs(tsMatch[1]) / 1000;
  const blockEnd = tsToMs(tsMatch[2]) / 1000;

  const textParts = [];
  for (let ti = tsIdx + 1; ti < lines.length; ti++) textParts.push(lines[ti]);
  const blockText = rcwTrim(textParts.join(' '));
  if (!blockText) continue;

  const rawWords = blockText.split(/\s+/);
  const words = rawWords.filter(Boolean);
  const charDur = (blockEnd - blockStart) / blockText.length;

  if (words.length > 1) {
    const perWord = (blockEnd - blockStart) / words.length;
    for (let w = 0; w < words.length; w++) {
      wordsList.push({
        wordText: words[w], wordDuration: perWord, characterDuration: charDur,
        wordCharacters: words[w].length,
        wordStart: blockStart + w * perWord,
        wordEnd: blockStart + (w + 1) * perWord
      });
    }
  } else {
    wordsList.push({
      wordText: blockText, wordDuration: blockEnd - blockStart, characterDuration: charDur,
      wordCharacters: blockText.length, wordStart: blockStart, wordEnd: blockEnd
    });
  }
}

console.log(`\n=== PARSE RESULTS ===`);
console.log(`Total blocks in SRT:    ${blocks.length}`);
console.log(`Total words parsed:     ${wordsList.length}`);
console.log(`First 5 words:`);
wordsList.slice(0, 5).forEach((w, i) =>
  console.log(`  ${i + 1}. "${w.wordText}"  (${w.wordStart.toFixed(3)}s → ${w.wordEnd.toFixed(3)}s, dur=${w.wordDuration.toFixed(3)}s)`)
);
console.log(`Last 3 words:`);
wordsList.slice(-3).forEach((w, i) =>
  console.log(`  ${wordsList.length - 2 + i}. "${w.wordText}"  (${w.wordStart.toFixed(3)}s → ${w.wordEnd.toFixed(3)}s)`)
);

// ─── PHRASING ─────────────────────────────────────────────────────────────────
const phraseLimit = CHARS_PER_PHRASE;
let s = 1, phraseText = "", M = 1, P = 1, J = (TRACK_START === 2) ? 2 : 1;
const phrases = [];

for (let idx = 0; idx < wordsList.length; idx++) {
  const d = wordsList[idx];
  if (idx < wordsList.length - 1) {
    const nextWord = wordsList[idx + 1];
    d.wordEnd = nextWord.wordStart;
    if (nextWord.wordStart - d.wordEnd > 5) { d.wordEnd = d.wordStart + 5; }
  }
  const f = phraseText.length;
  const hasPunct = !!d.wordText.match(/[?!.]/g);

  if (f === 0) {
    phraseText = d.wordText;
    d.phraseText = phraseText; d.phraseNumber = s; d.numWords = M; d.progressionValue = P; d.videoTrack = J;
  } else if (f > 0 && f < phraseLimit && !hasPunct) {
    phraseText += " " + d.wordText;
    d.phraseText = phraseText; d.phraseNumber = s; d.videoTrack = J;
    M++; P++; d.numWords = M; d.progressionValue = P;
  } else if (f > 0 && f < phraseLimit && hasPunct) {
    phraseText += " " + d.wordText;
    d.phraseText = phraseText; d.phraseNumber = s; d.videoTrack = J;
    M++; P++; d.numWords = M; d.progressionValue = P;
    phrases.push(phraseText);
    phraseText = ""; s++; J = (J === 1) ? 2 : 1; M = 1; P = 1;
  } else if (f >= phraseLimit) {
    phrases.push(phraseText);
    phraseText = d.wordText;
    d.phraseText = phraseText; s++; d.phraseNumber = s;
    M = 1; P = 1; d.numWords = M; d.progressionValue = P;
    J = (J === 1) ? 2 : 1; d.videoTrack = J;
  }
  if (idx === wordsList.length - 1 && phraseText) phrases.push(phraseText);
}
for (let idx2 = 0; idx2 < wordsList.length; idx2++) {
  const U = wordsList[idx2].phraseNumber;
  wordsList[idx2].phraseText = phrases[U - 1] || "";
}

console.log(`\n=== PHRASING RESULTS ===`);
console.log(`Total phrases:          ${phrases.length}`);
console.log(`charsPerPhrase used:    ${phraseLimit}`);
console.log(`\nAll phrases (with track assignment):`);
phrases.forEach((p, i) => {
  const wordsInThisPhrase = wordsList.filter(w => w.phraseNumber === i + 1);
  const track = wordsInThisPhrase[0]?.videoTrack ?? '?';
  console.log(`  ${i + 1}. [V${track}] (${wordsInThisPhrase.length} words) "${p}"`);
});

// ─── INVARIANTS ───────────────────────────────────────────────────────────────
console.log(`\n=== INVARIANT CHECKS ===`);
const allOnExpectedTracks = wordsList.every(w => w.videoTrack === 1 || w.videoTrack === 2);
console.log(`All words on V1 or V2:                 ${allOnExpectedTracks ? '✓' : '✗ FAIL'}`);
const progressionValid = wordsList.every(w => w.progressionValue >= 1 && w.progressionValue <= w.numWords);
console.log(`progressionValue ≤ numWords:           ${progressionValid ? '✓' : '✗ FAIL'}`);
const everyWordHasPhrase = wordsList.every(w => typeof w.phraseText === 'string' && w.phraseText.length > 0);
console.log(`Every word has non-empty phraseText:   ${everyWordHasPhrase ? '✓' : '✗ FAIL'}`);
const sumOfPhraseWords = phrases.reduce((sum, _, i) => sum + wordsList.filter(w => w.phraseNumber === i + 1).length, 0);
console.log(`Sum of phrase-word counts = total:     ${sumOfPhraseWords === wordsList.length ? '✓' : '✗ FAIL'} (${sumOfPhraseWords} vs ${wordsList.length})`);

// Track-alternation check
let lastSeenTrack = null, alternates = true;
for (let i = 0; i < phrases.length; i++) {
  const w = wordsList.find(w => w.phraseNumber === i + 1);
  if (lastSeenTrack !== null && w.videoTrack === lastSeenTrack) { alternates = false; break; }
  lastSeenTrack = w.videoTrack;
}
console.log(`Tracks alternate phrase-by-phrase:     ${alternates ? '✓' : '✗ FAIL'}`);

console.log(`\n=== SUMMARY ===`);
console.log(`If you run runCaptionWorkflow with this SRT, expect:`);
console.log(`  - ${wordsList.length} MOGRT clips placed (one per word)`);
console.log(`  - ${phrases.length} phrases, alternating V${wordsList[0]?.videoTrack} ↔ V${wordsList[0]?.videoTrack === 1 ? 2 : 1}`);
console.log(`  - Caption mode: "freexan" (one clip per word) — assuming the MOGRT has Word Progression`);
console.log();
