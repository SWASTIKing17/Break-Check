const fs = require('fs');
const path = require('path');
const audioDb = require('./audioDb');
const mm = require('music-metadata');
const { spawn } = require('child_process');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
// In packaged builds the binary is in app.asar.unpacked but the module path
// still points inside app.asar (unexecutable). Fix it once at module load.
const ffmpegExe = ffmpegInstaller.path.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);

let watchers = {}; // folderId -> fs.FSWatcher

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac', '.aif', '.aiff']);

function isAudioFile(filePath) {
  if (filePath.includes('.peaks') || filePath.includes(path.sep + '.peaks')) return false;
  return AUDIO_EXTS.has(path.extname(filePath).toLowerCase());
}

function getCategory(filePath, duration) {
  const p = filePath.toLowerCase();
  if (p.includes('music') || p.includes('bgm') || p.includes('soundtrack')) return 'bgm';
  if (duration > 30) return 'bgm';
  return 'sfx';
}

function getWatchedFolderRoot(filePath) {
  const folders = audioDb.foldersApi.getAll();
  const filePathNormalized = path.normalize(filePath).toLowerCase();
  for (const folder of folders) {
    const folderNormalized = path.normalize(folder.folder_path).toLowerCase();
    if (filePathNormalized.startsWith(folderNormalized)) {
      return folder.folder_path;
    }
  }
  return null;
}

function generatePeaks(filePath) {
  return new Promise((resolve) => {
    const rootDir = getWatchedFolderRoot(filePath);
    let pekPath = null;

    if (rootDir) {
      const relativePath = path.relative(rootDir, filePath);
      const peaksDir = path.join(rootDir, '.peaks');
      const pekFileName = relativePath.replace(/[\\/]/g, '_') + '.pk2';
      const oldPekFileName = relativePath.replace(/[\\/]/g, '_') + '.pek';
      pekPath = path.join(peaksDir, pekFileName);

      const oldPekPath = path.join(peaksDir, oldPekFileName);
      if (fs.existsSync(oldPekPath)) {
        try { fs.unlinkSync(oldPekPath); } catch (e) {}
      }

      // Optimization: If the .pk2 file already exists, read it
      if (fs.existsSync(pekPath)) {
        try {
          const storedPeaks = fs.readFileSync(pekPath, 'utf8');
          resolve(storedPeaks);
          return;
        } catch (e) {}
      }
    }

    const args = [
      '-v', 'error',
      '-i', filePath,
      '-f', 's8',
      '-ac', '1',
      '-ar', '4000',
      '-'
    ];

    const child = spawn(ffmpegExe, args);
    const chunks = [];

    child.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    child.on('close', (code) => {
      if (code !== 0 || chunks.length === 0) {
        resolve('');
        return;
      }
      try {
        const buffer = Buffer.concat(chunks);
        const data = new Int8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        
        const targetLength = 150;
        const peaks = [];
        
        if (data.length <= targetLength) {
          for (let i = 0; i < data.length; i++) {
            peaks.push(Number((Math.abs(data[i]) / 128).toFixed(3)));
          }
          while (peaks.length < targetLength) {
            peaks.push(0);
          }
        } else {
          const chunkSize = data.length / targetLength;
          for (let i = 0; i < targetLength; i++) {
            const start = Math.floor(i * chunkSize);
            const end = Math.min(data.length, Math.floor((i + 1) * chunkSize));
            let maxVal = 0;
            for (let j = start; j < end; j++) {
              const val = Math.abs(data[j]);
              if (val > maxVal) {
                maxVal = val;
              }
            }
            peaks.push(Number((maxVal / 128).toFixed(3)));
          }
        }
        
        const peaksStr = JSON.stringify(peaks);
        
        // Write the .pek file in the root watcher directory
        if (rootDir && pekPath) {
          try {
            const peaksDir = path.dirname(pekPath);
            if (!fs.existsSync(peaksDir)) {
              fs.mkdirSync(peaksDir, { recursive: true });
            }
            fs.writeFileSync(pekPath, peaksStr, 'utf8');
          } catch (writeErr) {
            console.error('[audioWatcher] Failed to write .pek file:', writeErr);
          }
        }
        
        resolve(peaksStr);
      } catch (err) {
        resolve('');
      }
    });

    child.on('error', () => {
      resolve('');
    });
  });
}

async function processAudioFile(fullPath, fileName) {
  let duration = 0;
  let category = 'sfx';
  try {
    const metadata = await mm.parseFile(fullPath, { duration: true });
    if (metadata.format && metadata.format.duration) {
      duration = metadata.format.duration;
    }
    category = getCategory(fullPath, duration);
  } catch (err) {
    category = getCategory(fullPath, 0);
  }
  const peaks = await generatePeaks(fullPath);
  audioDb.audioApi.upsert(fullPath, fileName, duration, category, peaks);
}

// Recursively walks a folder and indexes all audio files
async function scanDirectory(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (entry.isFile() && isAudioFile(fullPath)) {
        await processAudioFile(fullPath, entry.name);
      }
    }
  } catch (e) {
    console.error(`[audioWatcher] Error scanning directory ${dirPath}:`, e);
  }
}

// Watch a directory for changes
function watchDirectory(folderId, dirPath, onChangeCallback) {
  if (watchers[folderId]) {
    watchers[folderId].close();
  }

  // Pre-scan to populate index
  scanDirectory(dirPath).catch(e => console.error('[audioWatcher] scan failed:', e));

  try {
    // Windows supports native recursive watching
    const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const fullPath = path.join(dirPath, filename);

      // Simple debounce/delay to let file operations complete
      setTimeout(async () => {
        try {
          if (fs.existsSync(fullPath)) {
            const stat = fs.statSync(fullPath);
            if (stat.isFile() && isAudioFile(fullPath)) {
              await processAudioFile(fullPath, path.basename(fullPath));
              if (onChangeCallback) onChangeCallback({ type: 'added', filePath: fullPath, name: path.basename(fullPath) });
            }
          } else {
            // File was deleted
            audioDb.audioApi.deleteByPath(fullPath);
            if (onChangeCallback) onChangeCallback({ type: 'deleted', filePath: fullPath });
          }
        } catch (err) {
          // File might be deleted or locked temporarily
          audioDb.audioApi.deleteByPath(fullPath);
          if (onChangeCallback) onChangeCallback({ type: 'deleted', filePath: fullPath });
        }
      }, 300);
    });

    watchers[folderId] = watcher;
    console.log(`[audioWatcher] Watching folder: ${dirPath}`);
  } catch (e) {
    console.error(`[audioWatcher] Failed to watch directory ${dirPath}:`, e);
  }
}

function stopWatching(folderId) {
  if (watchers[folderId]) {
    watchers[folderId].close();
    delete watchers[folderId];
  }
}

function initWatchers(onChangeCallback) {
  const folders = audioDb.foldersApi.getAll();
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

module.exports = {
  watchDirectory,
  stopWatching,
  initWatchers,
  stopAll
};
