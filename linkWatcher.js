// linkWatcher.js — watches "linked" project folders and auto-imports new media
// into the matching Premiere bin via the CEP WebSocket bridge.
//
// Lifecycle:
//   start(links, ctx)  — links = [{ folderPath, binName }]
//                         ctx   = { sendToCep, log, requestBinFiles }
//   stop()             — closes all current watchers, clears state
//   handleBinFiles(requestId, files) — main.js invokes this when CEP responds
//                                       with a `bin_files` message.
//
// Behaviour:
//   - On start, for every link: ask CEP for current bin contents, scan the
//     folder, import everything in the folder that is NOT already in the bin.
//   - Then attach an `fs.watch` (non-recursive) on the folder. New files
//     trigger an `import` WS dispatch to CEP. Debounced 300 ms.
//   - Supported-format whitelist (Premiere-native). Anything else is ignored
//     for now; future updates will route unsupported formats through FFmpeg.

const fs = require('fs');
const path = require('path');

const SUPPORTED_EXTS = new Set([
  // Video
  '.mp4', '.mov', '.avi', '.mkv', '.mxf', '.m4v', '.m2v', '.m2t', '.mts', '.ts',
  '.wmv', '.webm', '.mpg', '.mpeg',
  // Audio
  '.wav', '.mp3', '.aac', '.m4a', '.aiff', '.aif', '.flac', '.ogg',
  // Image / still
  '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.psd', '.ai', '.gif', '.bmp',
  '.exr', '.dpx', '.tga',
  // RAW / cinema
  '.r3d', '.braw', '.arri', '.ari',
  // Caption
  '.srt'
]);

function isSupported(filePath) {
  return SUPPORTED_EXTS.has(path.extname(filePath).toLowerCase());
}

let watchers = [];                // [{ folderPath, binName, watcher, seen:Set, debounceTimers:Map }]
let pendingRequests = {};         // requestId -> { resolve, timeout }
let binFilesCache = new Map();    // binName -> { promise, timestamp }
let ctxRef = null;

function uid() {
  return 'bf_' + Date.now() + '_' + Math.floor(Math.random() * 1e9);
}

function log(msg) {
  if (ctxRef && typeof ctxRef.log === 'function') ctxRef.log(msg);
  else console.log('[linkWatcher] ' + msg);
}

function requestBinFiles(binName) {
  return new Promise(resolve => {
    if (!ctxRef || typeof ctxRef.sendToCep !== 'function') {
      resolve([]);
      return;
    }
    const requestId = uid();
    const timeout = setTimeout(() => {
      delete pendingRequests[requestId];
      log('bin_files request "' + binName + '" timed out — assuming empty bin');
      resolve([]);
    }, 5000);
    pendingRequests[requestId] = {
      resolve: (files) => { clearTimeout(timeout); resolve(files || []); },
      timeout
    };
    try {
      ctxRef.sendToCep({ type: 'get_bin_files', requestId, binName });
    } catch (e) {
      clearTimeout(timeout);
      delete pendingRequests[requestId];
      log('sendToCep failed for get_bin_files: ' + e.message);
      resolve([]);
    }
  });
}

function getBinFilesCached(binName, maxAgeMs = 1500) {
  const now = Date.now();
  const cached = binFilesCache.get(binName);
  if (cached && (now - cached.timestamp < maxAgeMs)) {
    return cached.promise;
  }
  const promise = requestBinFiles(binName).then(files => {
    return files || [];
  }).catch(err => {
    binFilesCache.delete(binName);
    return [];
  });
  binFilesCache.set(binName, { promise, timestamp: now });
  return promise;
}

function handleBinFiles(requestId, files) {
  const pending = pendingRequests[requestId];
  if (!pending) return;
  delete pendingRequests[requestId];
  pending.resolve(files);
}

function scanFolder(folderPath) {
  try {
    return fs.readdirSync(folderPath, { withFileTypes: true })
      .filter(d => d.isFile())
      .map(d => path.join(folderPath, d.name))
      .filter(isSupported);
  } catch (e) {
    log('scanFolder failed for "' + folderPath + '": ' + e.message);
    return [];
  }
}

function dispatchImport(filePath, binName, link) {
  if (!ctxRef || typeof ctxRef.sendToCep !== 'function') return;
  try {
    ctxRef.sendToCep({ type: 'import', filePath, binName });
    link.seen.add(path.basename(filePath).toLowerCase());
    binFilesCache.delete(binName); // invalidate cache when importing a new file
    log('→ dispatched import: ' + path.basename(filePath) + ' → ' + binName);
  } catch (e) {
    log('dispatchImport failed: ' + e.message);
  }
}

async function syncLink(link) {
  const binFiles = await getBinFilesCached(link.binName);
  const binNames = new Set(binFiles.map(n => String(n).toLowerCase()));
  binNames.forEach(n => link.seen.add(n));

  const folderFiles = scanFolder(link.folderPath);
  const missing = folderFiles.filter(fp => !binNames.has(path.basename(fp).toLowerCase()));
  log('sync "' + link.folderPath + '" → bin "' + link.binName + '": ' + binNames.size + ' in bin, ' + folderFiles.length + ' in folder, ' + missing.length + ' to import');
  missing.forEach(fp => dispatchImport(fp, link.binName, link));
}

function attachWatcher(link) {
  try {
    if (!fs.existsSync(link.folderPath)) {
      log('folder does not exist — skipping watcher: ' + link.folderPath);
      return;
    }
    const w = fs.watch(link.folderPath, { recursive: false }, (eventType, filename) => {
      if (!filename) return;
      const full = path.join(link.folderPath, filename);
      if (!isSupported(full)) return;

      // Debounce per filename — fs.watch fires multiple events per write on Windows.
      const key = filename.toLowerCase();
      if (link.debounceTimers.has(key)) clearTimeout(link.debounceTimers.get(key));
      link.debounceTimers.set(key, setTimeout(async () => {
        link.debounceTimers.delete(key);
        try {
          if (!fs.existsSync(full)) return;
          const stat = fs.statSync(full);
          if (!stat.isFile()) return;
          if (link.seen.has(key)) return;

          // Before importing, check if the file already exists in the target bin!
          const currentBinFiles = await getBinFilesCached(link.binName, 1500);
          const binNames = new Set((currentBinFiles || []).map(n => String(n).toLowerCase()));
          binNames.forEach(n => link.seen.add(n));

          if (link.seen.has(key)) {
            log('file "' + filename + '" already exists in bin "' + link.binName + '" — skipping duplicate import');
            return;
          }

          dispatchImport(full, link.binName, link);
        } catch (e) {
          log('watcher dispatch failed: ' + e.message);
        }
      }, 350));
    });
    w.on('error', e => log('fs.watch error on "' + link.folderPath + '": ' + e.message));
    link.watcher = w;
    log('watching: ' + link.folderPath + ' ↔ bin "' + link.binName + '"');
  } catch (e) {
    log('attachWatcher failed for "' + link.folderPath + '": ' + e.message);
  }
}

function start(links, ctx) {
  stop();
  ctxRef = ctx || null;
  if (!Array.isArray(links) || links.length === 0) {
    log('start called with no links — nothing to watch');
    return;
  }
  log('starting with ' + links.length + ' link(s)');
  links.forEach(l => {
    if (!l || !l.folderPath || !l.binName) return;
    const link = {
      folderPath: l.folderPath,
      binName: l.binName,
      watcher: null,
      seen: new Set(),
      debounceTimers: new Map()
    };
    watchers.push(link);
    // Kick off async sync, then attach watcher when initial diff is done.
    syncLink(link).finally(() => attachWatcher(link));
  });
}

function stop() {
  // Clear all pending bin_files requests so any late CEP response is dropped.
  Object.keys(pendingRequests).forEach(k => {
    try { clearTimeout(pendingRequests[k].timeout); } catch (e) {}
  });
  pendingRequests = {};
  binFilesCache.clear();

  watchers.forEach(link => {
    try { if (link.watcher) link.watcher.close(); } catch (e) {}
    link.debounceTimers.forEach(t => clearTimeout(t));
    link.debounceTimers.clear();
    link.seen.clear();
  });
  if (watchers.length) log('stopped ' + watchers.length + ' watcher(s)');
  watchers = [];
}

function isActive() {
  return watchers.length > 0;
}

function markSeen(filePath) {
  if (!filePath) return;
  try {
    const name = path.basename(filePath).toLowerCase();
    const fileDir = path.resolve(path.normalize(path.dirname(filePath))).toLowerCase();
    watchers.forEach(link => {
      if (!link || !link.folderPath) return;
      const linkDir = path.resolve(path.normalize(link.folderPath)).toLowerCase();
      if (fileDir === linkDir || fileDir.startsWith(linkDir)) {
        link.seen.add(name);
        binFilesCache.delete(link.binName);
        log('marked seen (suppressing duplicate watch import): ' + name);
      }
    });
  } catch (e) {
    log('markSeen failed: ' + e.message);
  }
}

module.exports = { start, stop, handleBinFiles, isActive, markSeen, SUPPORTED_EXTS };
