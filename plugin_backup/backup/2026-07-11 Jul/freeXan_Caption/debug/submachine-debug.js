#!/usr/bin/env node
/**
 * SubMachine Debug Terminal
 * Real-time log viewer + bidirectional IPC bridge to Premiere Pro / ExtendScript.
 *
 * Usage:
 *   node submachine-debug.js             — interactive watch mode
 *   node submachine-debug.js watch       — watch mode (non-interactive)
 *   node submachine-debug.js send <cmd>  — send one command and print response
 *   node submachine-debug.js clear       — clear the log file
 *   node submachine-debug.js tail <N>    — print last N lines and exit
 *
 * Available commands (sent to ExtendScript via IPC):
 *   ping           — health check
 *   timeline       — full track/clip structure dump
 *   phraseMap      — getTimelinePhraseMap() output
 *   playhead       — current CTI position in seconds
 *   clip <t> <c>   — MOGRT property dump for clip at track T, index C
 *   log <msg>      — write custom entry to debug_jsx.log from JSX side
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const rl   = require('readline');

// ─── Paths ───────────────────────────────────────────────────────────────────

const LOGS_DIR = path.join(
  os.homedir(), 'AppData', 'Roaming', 'Adobe', 'CEP', 'extensions',
  'com.aescripts.submachine', 'panel', 'logs'
);
const LOG_FILE    = path.join(LOGS_DIR, 'debug_jsx.log');
const INBOX_FILE  = path.join(LOGS_DIR, 'debug_inbox.json');   // terminal → JSX
const OUTBOX_FILE = path.join(LOGS_DIR, 'debug_outbox.json');  // JSX → terminal

// ─── ANSI colours ────────────────────────────────────────────────────────────

const C = {
  reset   : '\x1b[0m',
  bold    : '\x1b[1m',
  dim     : '\x1b[2m',
  red     : '\x1b[31m',
  yellow  : '\x1b[33m',
  cyan    : '\x1b[36m',
  green   : '\x1b[32m',
  magenta : '\x1b[35m',
  blue    : '\x1b[34m',
  gray    : '\x1b[90m',
  white   : '\x1b[37m',
  bgRed   : '\x1b[41m',
  bgCyan  : '\x1b[46m',
};

// ─── Log-line parser & formatter ─────────────────────────────────────────────

function parseLine(raw) {
  // Format: [HH:MM:SS] [LEVEL] message
  const m = raw.match(/^\[(\d{2}:\d{2}:\d{2})\]\s+\[([A-Z]+)\]\s+(.*)/);
  if (m) return { ts: m[1], level: m[2], msg: m[3] };
  return { ts: '', level: 'RAW', msg: raw };
}

function levelColor(level) {
  switch (level) {
    case 'ERROR':   return C.red   + C.bold + '✖ ERROR  ' + C.reset;
    case 'WARN':    return C.yellow        + '⚠ WARN   ' + C.reset;
    case 'SUCCESS': return C.green  + C.bold + '✔ OK     ' + C.reset;
    case 'INFO':    return C.cyan          + '● INFO   ' + C.reset;
    case 'DEBUG':   return C.gray          + '· DEBUG  ' + C.reset;
    case 'BRIDGE':  return C.magenta+ C.bold + '⇄ BRIDGE ' + C.reset;
    default:        return C.white         + '  ' + level.padEnd(7) + C.reset;
  }
}

function highlightMsg(msg) {
  return msg
    // Function names
    .replace(/(moveClipToTrack|getPhraseClips|sm_tools_\w+|findFreeTrack|getSafeAlternatingTrack|overwriteClip)/g,
      C.cyan + '$1' + C.reset)
    // Track/clip refs like T1 C3
    .replace(/\bT(\d+)\s*C(\d+)/g, C.blue + 'T$1 C$2' + C.reset)
    // Numbers / ticks
    .replace(/\b(\d{6,})\b/g, C.yellow + '$1' + C.reset)
    // Quoted strings
    .replace(/'([^']*)'/g, C.green + "'$1'" + C.reset)
    // Error keywords
    .replace(/\b(null|undefined|NaN|Error|failed|crash)\b/gi, C.red + '$1' + C.reset);
}

function formatLine(raw) {
  const { ts, level, msg } = parseLine(raw);
  if (!raw.trim()) return null;
  const tsStr  = C.dim + (ts || '       ').padEnd(8) + C.reset;
  const lvlStr = levelColor(level);
  return `${tsStr} ${lvlStr} ${highlightMsg(msg)}`;
}

// ─── File helpers ─────────────────────────────────────────────────────────────

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function readFileSafe(fp) {
  try { return fs.readFileSync(fp, 'utf8'); } catch (_) { return ''; }
}

function writeFileSafe(fp, data) {
  try { fs.writeFileSync(fp, data, 'utf8'); return true; } catch (e) { return false; }
}

function deleteFileSafe(fp) {
  try { fs.unlinkSync(fp); } catch (_) {}
}

// ─── Header ──────────────────────────────────────────────────────────────────

function printHeader() {
  console.log('');
  console.log(C.bgCyan + C.bold + '  SubMachine Debug Terminal  ' + C.reset);
  console.log(C.cyan + '  Log : ' + C.reset + LOG_FILE);
  console.log(C.cyan + '  IPC : ' + C.reset + INBOX_FILE + ' / ' + OUTBOX_FILE);
  console.log(C.dim  + '  Commands: ping | timeline | phraseMap | playhead | clip <t> <c> | clear' + C.reset);
  console.log('');
}

// ─── Log tail (watch mode) ────────────────────────────────────────────────────

function startLogWatch(filterStr, excludeStr) {
  ensureLogsDir();

  let fileSize = 0;
  try { fileSize = fs.statSync(LOG_FILE).size; } catch (_) {}

  // Show last 30 lines on startup
  try {
    const existing = fs.readFileSync(LOG_FILE, 'utf8').split('\n');
    const tail = existing.slice(-30);
    console.log(C.dim + '─── last 30 lines ───' + C.reset);
    tail.forEach(line => {
      const f = formatLine(line);
      if (f && (!filterStr || line.toLowerCase().includes(filterStr)) && (!excludeStr || !line.toLowerCase().includes(excludeStr))) console.log(f);
    });
    console.log(C.dim + '─── live ───' + C.reset);
  } catch (_) {
    console.log(C.dim + '(log file not found yet — waiting for PP to write)' + C.reset);
  }

  // Watch for new data
  fs.watch(LOG_FILE, { persistent: true }, (event) => {
    try {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size <= fileSize) { fileSize = stat.size; return; } // truncation
      const fd = fs.openSync(LOG_FILE, 'r');
      const delta = stat.size - fileSize;
      const buf = Buffer.alloc(delta);
      fs.readSync(fd, buf, 0, delta, fileSize);
      fs.closeSync(fd);
      fileSize = stat.size;

      const lines = buf.toString('utf8').split('\n');
      lines.forEach(line => {
        if (!line.trim()) return;
        if (filterStr && !line.toLowerCase().includes(filterStr)) return;
        if (excludeStr && line.toLowerCase().includes(excludeStr)) return;
        const f = formatLine(line);
        if (f) console.log(f);
      });
    } catch (_) {}
  });

  // Also watch outbox for IPC responses
  watchOutbox();
}

// ─── Outbox watcher (print bridge responses) ─────────────────────────────────

let _lastOutboxMtime = 0;

function watchOutbox() {
  setInterval(() => {
    try {
      const stat = fs.statSync(OUTBOX_FILE);
      if (stat.mtimeMs <= _lastOutboxMtime) return;
      _lastOutboxMtime = stat.mtimeMs;

      const raw = readFileSafe(OUTBOX_FILE);
      if (!raw.trim()) return;
      let obj;
      try { obj = JSON.parse(raw); } catch (_) { return; }

      deleteFileSafe(OUTBOX_FILE);

      console.log('');
      console.log(C.magenta + C.bold + '┌─ Bridge Response (' + (obj.cmd || '?') + ') ' + C.reset);
      printBridgeResponse(obj);
      console.log(C.magenta + '└' + C.reset);
      console.log('');
    } catch (_) {}
  }, 300);
}

function printBridgeResponse(obj) {
  if (obj.error) {
    console.log(C.red + '  ERROR: ' + obj.error + C.reset);
    return;
  }
  // Unwrap safeCall envelope: { ok: true, data: <real> }
  // Some JSX commands return JSON-stringified envelopes — parse those too.
  if (typeof obj.data === 'string' && obj.data.charAt(0) === '{') {
    try {
      var parsed = JSON.parse(obj.data);
      if (parsed && parsed.ok && typeof parsed.data !== 'undefined') obj.data = parsed.data;
      else if (parsed && parsed.ok === false) { console.log(C.red + '  JSX ERROR: ' + (parsed.error || 'unknown') + C.reset); return; }
    } catch (_) {}
  }
  if (obj.data && typeof obj.data === 'object' && obj.data.ok === true && typeof obj.data.data !== 'undefined') {
    obj.data = obj.data.data;
  }
  if (obj.cmd === 'ping') {
    console.log(C.green + '  Premiere Pro is alive. ' + C.reset + obj.data);
    return;
  }
  if (obj.cmd === 'playhead') {
    console.log(C.cyan + '  Playhead: ' + C.bold + obj.data.toFixed(3) + 's' + C.reset);
    return;
  }
  if (obj.cmd === 'timeline') {
    printTimeline(obj.data);
    return;
  }
  if (obj.cmd === 'phraseMap') {
    printPhraseMap(obj.data);
    return;
  }
  if (obj.cmd === 'clip') {
    printClipProps(obj.data);
    return;
  }
  // Generic fallback
  console.log('  ' + JSON.stringify(obj.data, null, 2).replace(/\n/g, '\n  '));
}

// ─── Pretty printers ──────────────────────────────────────────────────────────

function printTimeline(data) {
  if (!data || !data.tracks) { console.log(C.dim + '  (no data)' + C.reset); return; }
  data.tracks.forEach(function(track) {
    if (!track.clips || track.clips.length === 0) return;
    console.log(C.blue + C.bold + '  Track ' + track.index + C.reset + C.dim + ' (' + track.clips.length + ' clips)' + C.reset);
    track.clips.forEach(function(clip) {
      const start = typeof clip.start === 'number' ? clip.start.toFixed(3) : '?';
      const end   = typeof clip.end   === 'number' ? clip.end.toFixed(3)   : '?';
      const text  = clip.text ? C.green + ' "' + clip.text + '"' + C.reset : '';
      const prog  = clip.progression ? C.yellow + ' [' + clip.progression + ']' + C.reset : '';
      console.log('    ' + C.dim + 'C' + clip.index + C.reset + '  ' +
        C.cyan + start + 's' + C.reset + ' → ' + C.cyan + end + 's' + C.reset +
        prog + text);
    });
  });
}

function printPhraseMap(data) {
  if (!Array.isArray(data)) { console.log(C.dim + '  (no phrases)' + C.reset); return; }
  data.forEach(function(phrase, pi) {
    const start = typeof phrase.start === 'number' ? phrase.start.toFixed(2) : '?';
    const end   = typeof phrase.end   === 'number' ? phrase.end.toFixed(2)   : '?';
    const lock  = phrase.isLocked ? C.yellow + ' 🔒' + C.reset : '';
    // Build track summary: unique tracks, sorted
    let trackTag = '';
    if (Array.isArray(phrase.clips) && phrase.clips.length) {
      const tracks = {};
      phrase.clips.forEach(c => { if (typeof c.track === 'number') tracks[c.track] = true; });
      const tList = Object.keys(tracks).map(Number).sort((a,b) => a-b);
      if (tList.length === 1) trackTag = C.magenta + ' [T' + tList[0] + ']' + C.reset;
      else if (tList.length > 1) trackTag = C.red + ' [T' + tList.join('+T') + ' — SPLIT!]' + C.reset;
    }
    console.log('  ' + C.bold + C.blue + 'Phrase ' + (pi + 1) + C.reset + trackTag +
      C.dim + ' ' + start + 's → ' + end + 's' + C.reset + lock);
    if (Array.isArray(phrase.clips)) {
      phrase.clips.forEach(function(clip) {
        const cs = typeof clip.start === 'number' ? clip.start.toFixed(3) : '?';
        const ce = typeof clip.end   === 'number' ? clip.end.toFixed(3)   : '?';
        console.log('    ' + C.magenta + C.bold + '[T' + clip.track + ']' + C.reset +
          C.dim + ' C' + clip.index + C.reset +
          '  ' + C.green + '"' + clip.text + '"' + C.reset +
          C.dim + ' [prog=' + clip.progression + '] ' + cs + 's→' + ce + 's' + C.reset);
      });
    }
  });
}

function printClipProps(data) {
  if (!data || !data.props) { console.log(C.dim + '  (no props)' + C.reset); return; }
  console.log('  ' + C.cyan + 'T' + data.trackIndex + ' C' + data.clipIndex + C.reset +
    C.dim + ' start=' + (data.start || '?') + 's  end=' + (data.end || '?') + 's' + C.reset);
  data.props.forEach(function(p) {
    const valStr = typeof p.value === 'object' ? JSON.stringify(p.value) : String(p.value);
    console.log('    ' + C.yellow + p.displayName.padEnd(35) + C.reset + ' ' + valStr);
  });
}

// ─── IPC: send command ────────────────────────────────────────────────────────

function sendCommand(cmd, args) {
  ensureLogsDir();
  const payload = { cmd: cmd, args: args || [], ts: Date.now() };
  if (!writeFileSafe(INBOX_FILE, JSON.stringify(payload))) {
    console.error(C.red + 'Failed to write inbox file.' + C.reset);
    return false;
  }
  return true;
}

async function sendAndWait(cmd, args, timeoutMs) {
  timeoutMs = timeoutMs || 8000;
  deleteFileSafe(OUTBOX_FILE);
  if (!sendCommand(cmd, args)) return;

  console.log(C.dim + '→ Sent "' + cmd + '" — waiting for PP response...' + C.reset);

  return new Promise(function(resolve) {
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(function() {
      try {
        const stat = fs.statSync(OUTBOX_FILE);
        if (stat.size > 0) {
          clearInterval(timer);
          const raw = readFileSafe(OUTBOX_FILE);
          deleteFileSafe(OUTBOX_FILE);
          let obj;
          try { obj = JSON.parse(raw); } catch (_) { obj = { error: 'bad JSON', raw: raw }; }
          console.log('');
          console.log(C.magenta + C.bold + '┌─ Bridge Response (' + cmd + ') ' + C.reset);
          printBridgeResponse(obj);
          console.log(C.magenta + '└' + C.reset);
          resolve(obj);
        }
      } catch (_) {}
      if (Date.now() > deadline) {
        clearInterval(timer);
        console.log(C.red + 'Timeout — no response from Premiere Pro.' + C.reset);
        console.log(C.dim + 'Make sure the panel is open and the debug heartbeat is running.' + C.reset);
        resolve(null);
      }
    }, 200);
  });
}

// ─── Interactive REPL ────────────────────────────────────────────────────────

function startREPL() {
  const iface = rl.createInterface({ input: process.stdin, output: process.stdout, prompt: C.cyan + 'smdebug> ' + C.reset });
  iface.prompt();

  iface.on('line', async function(line) {
    const parts = line.trim().split(/\s+/);
    const cmd   = parts[0];
    const args  = parts.slice(1);

    if (!cmd) { iface.prompt(); return; }

    if (cmd === 'clear') {
      try { fs.writeFileSync(LOG_FILE, '', 'utf8'); console.log(C.green + 'Log cleared.' + C.reset); } catch (e) { console.log(C.red + e.message + C.reset); }
      iface.prompt(); return;
    }

    if (cmd === 'help') {
      console.log('');
      console.log(C.bold + '  Commands:' + C.reset);
      console.log('  ' + C.cyan + 'ping' + C.reset + '              — check if PP/JSX is alive');
      console.log('  ' + C.cyan + 'timeline' + C.reset + '          — dump full track/clip structure');
      console.log('  ' + C.cyan + 'phraseMap' + C.reset + '         — dump getTimelinePhraseMap() result');
      console.log('  ' + C.cyan + 'playhead' + C.reset + '          — current CTI position');
      console.log('  ' + C.cyan + 'clip <t> <c>' + C.reset + '      — MOGRT property dump at track T, clip C');
      console.log('  ' + C.cyan + 'clear' + C.reset + '             — clear the log file');
      console.log('  ' + C.cyan + 'filter <str>' + C.reset + '      — only show log lines containing <str>');
      console.log('  ' + C.cyan + 'quit / exit' + C.reset + '       — exit debugger');
      console.log('');
      iface.prompt(); return;
    }

    if (cmd === 'quit' || cmd === 'exit') {
      console.log(C.dim + 'bye.' + C.reset);
      process.exit(0);
    }

    if (cmd === 'filter') {
      // Can't retroactively filter — just inform
      console.log(C.dim + 'Filter is only applied in non-interactive watch mode (pass --filter <str>).' + C.reset);
      iface.prompt(); return;
    }

    // All other commands are forwarded to JSX via IPC
    await sendAndWait(cmd, args);
    iface.prompt();
  });

  iface.on('close', function() { console.log(''); process.exit(0); });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const mode = argv[0] || 'interactive';

printHeader();

switch (mode) {
  case 'watch': {
    const filter  = argv.indexOf('--filter')  >= 0 ? argv[argv.indexOf('--filter')  + 1] : null;
    const exclude = argv.indexOf('--exclude') >= 0 ? argv[argv.indexOf('--exclude') + 1].toLowerCase() : null;
    startLogWatch(filter, exclude);
    console.log(C.dim + '(Watching — Ctrl+C to stop)' + C.reset);
    break;
  }

  case 'tail': {
    const n = parseInt(argv[1]) || 50;
    try {
      const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-n);
      lines.forEach(l => { const f = formatLine(l); if (f) console.log(f); });
    } catch (_) { console.log(C.red + 'Log file not found.' + C.reset); }
    process.exit(0);
    break;
  }

  case 'clear': {
    try { fs.writeFileSync(LOG_FILE, '', 'utf8'); console.log(C.green + 'Log cleared.' + C.reset); } catch (e) { console.log(C.red + e.message + C.reset); }
    process.exit(0);
    break;
  }

  case 'send': {
    const cmd  = argv[1];
    const args = argv.slice(2);
    if (!cmd) { console.log(C.red + 'Usage: node submachine-debug.js send <command> [args...]' + C.reset); process.exit(1); }
    sendAndWait(cmd, args).then(() => process.exit(0));
    break;
  }

  default: {
    // Interactive: log watch + REPL
    const filter  = argv.indexOf('--filter')  >= 0 ? argv[argv.indexOf('--filter')  + 1] : null;
    const exclude = argv.indexOf('--exclude') >= 0 ? argv[argv.indexOf('--exclude') + 1].toLowerCase() : null;
    startLogWatch(filter, exclude);
    console.log(C.dim + '(Interactive mode — type "help" for commands)' + C.reset);
    startREPL();
    break;
  }
}
