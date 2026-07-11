const fs = require('fs');
const path = require('path');
const mogrtDb = require('./mogrtDb');

let watchers = {};

const MOGRT_EXT = '.mogrt';

function isMogrtFile(filePath) {
  return path.extname(filePath).toLowerCase() === MOGRT_EXT;
}

function scanDirectory(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile() && isMogrtFile(fullPath)) {
        mogrtDb.mogrtApi.upsert(fullPath, path.basename(fullPath, MOGRT_EXT));
      }
    }
  } catch (e) {
    console.error(`[mogrtWatcher] Error scanning ${dirPath}:`, e);
  }
}

function watchDirectory(folderId, dirPath, onChangeCallback) {
  if (watchers[folderId]) {
    watchers[folderId].close();
  }

  scanDirectory(dirPath);

  try {
    const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const fullPath = path.join(dirPath, filename);
      if (!isMogrtFile(fullPath)) return;

      setTimeout(() => {
        try {
          if (fs.existsSync(fullPath)) {
            const stat = fs.statSync(fullPath);
            if (stat.isFile()) {
              mogrtDb.mogrtApi.upsert(fullPath, path.basename(fullPath, MOGRT_EXT));
              if (onChangeCallback) onChangeCallback({ type: 'added', filePath: fullPath });
            }
          } else {
            mogrtDb.mogrtApi.deleteByPath(fullPath);
            if (onChangeCallback) onChangeCallback({ type: 'deleted', filePath: fullPath });
          }
        } catch (err) {
          mogrtDb.mogrtApi.deleteByPath(fullPath);
          if (onChangeCallback) onChangeCallback({ type: 'deleted', filePath: fullPath });
        }
      }, 300);
    });

    watchers[folderId] = watcher;
    console.log(`[mogrtWatcher] Watching: ${dirPath}`);
  } catch (e) {
    console.error(`[mogrtWatcher] Failed to watch ${dirPath}:`, e);
  }
}

function stopWatching(folderId) {
  if (watchers[folderId]) {
    watchers[folderId].close();
    delete watchers[folderId];
  }
}

function initWatchers(onChangeCallback) {
  const folders = mogrtDb.foldersApi.getAll();
  for (const folder of folders) {
    watchDirectory(folder.id, folder.folder_path, onChangeCallback);
  }
}

function stopAll() {
  for (const id in watchers) {
    watchers[id].close();
  }
  watchers = {};
}

module.exports = { watchDirectory, stopWatching, initWatchers, stopAll };
