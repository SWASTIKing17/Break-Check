const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { WebSocketServer } = require('ws');
const db = require('./db');
const axios = require('axios');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
// In a packaged build the binary is extracted to app.asar.unpacked but the
// module's .path still points inside app.asar (unexecutable). Fix it here.
const ffmpegPath = ffmpegInstaller.path.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const audioDb = require('./audioDb');
const audioWatcher = require('./audioWatcher');
const mogrtDb = require('./mogrtDb');
const mogrtWatcher = require('./mogrtWatcher');
const linkWatcher = require('./linkWatcher');
const httpApi = require('./httpApi');

const EXPECTED_EXT_VERSION = '2.0.0'; // Must match EXT_VERSION in cep-extension/ext.js

// ── Debug Logger ─────────────────────────────────────────────────────────────
const { createLogger } = require('./logger');
const mainLogger = createLogger('main');
const cepLogger = createLogger('cep_bridge');
const dragDropLogger = createLogger('drag_n_drop');
const builderLogger = createLogger('builder');
const captionLogger = createLogger('caption');
const audioLogger = createLogger('audio');
const bloomxLogger = createLogger('bloomx');
const linkLogger = createLogger('link');

// Keep legacy dbg function mapped to mainLogger so existing code doesn't break
function dbg(...args) {
  mainLogger(...args);
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Date/Time Variable Resolver ───────────────────────────────────────────────
// Replaces {Year} {Month} {Date} {HH} {MM} {SS} with current date/time values.
// Called on project names, folder node names, and targetDir before path ops.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function resolveVars(str) {
  if (!str) return str;
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return String(str)
    .replace(/\{Year\}/gi, now.getFullYear())
    .replace(/\{Month\}/gi, MONTH_NAMES[now.getMonth()])
    .replace(/\{Date\}/gi, pad(now.getDate()))
    .replace(/\{HH\}/gi, pad(now.getHours()))
    .replace(/\{MM\}/gi, pad(now.getMinutes()))
    .replace(/\{SS\}/gi, pad(now.getSeconds()));
}

function safeParseJson(str, fallback) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

function sanitizeName(str) {
  return String(str || '').replace(/[<>:"/\\|?*]/g, '_');
}

// F-FTS-023 / F-FTS-028: infer slot type from a folder or bin name when the
// user hasn't explicitly assigned a Video/Audio/Image slot in the template.
function inferSlotType(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return null;
  if (/(footage|video|raw|clip|shot)/.test(n)) return 'video';
  if (/(music|bgm|soundtrack|score)/.test(n)) return 'bgm';
  if (/(sfx|foley|sound effect|whoosh|impact|riser)/.test(n)) return 'sfx';
  if (/(audio|sound|voice|vo\b)/.test(n))  return 'audio';
  if (/(assets|graphics|images|photos|design|art|gfx|stills)/.test(n)) return 'image';
  return null;
}
// ─────────────────────────────────────────────────────────────────────────────

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let wss = null;
let activeProjectPath = '';     // Synced from CEP extension via WebSocket
let userOpenedManually = false;  // Set when user opens from tray; suppresses monitor auto-hide until user closes
let pendingProjectSetup = null; // { projectPath, bins, sequences } — sent to CEP when that project becomes active
let nativeProjectPath = '';     // Parsed from Premiere Pro window title (fallback)
let isCepConnected = false;
let cepWs = null; // Live WebSocket connection to the CEP panel
let haloPickerActive = false; // True while overlay is showing the routing halo
let configPath = path.join(app.getPath('userData'), 'config.json');

// Default configuration
let appConfig = {
  targetDir: '',
  templateFile: '',
  folderStructure: ['01_Project_Files', '02_Footage', '03_Audio', '04_Assets', '05_Exports'],
  autoPopup: true,
  defaultBins: ['Footage', 'Audio', 'Graphics', 'Exports'],
  defaultSequences: ['Main Sequence']
};

// Load configuration
function loadConfig() {
  if (fs.existsSync(configPath)) {
    try {
      const data = fs.readFileSync(configPath, 'utf8');
      appConfig = { ...appConfig, ...JSON.parse(data) };
    } catch (e) {
      console.error('Error loading config:', e);
    }
  }
}

// Save configuration
function saveConfig(newConfig) {
  appConfig = { ...appConfig, ...newConfig };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false // Start hidden, will be shown by monitor or manually
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Notify the renderer every time the window becomes visible — used to
  // auto-focus the Client dropdown so typing starts working immediately.
  mainWindow.on('show', () => {
    mainWindow.webContents.send('main-window-shown');
  });

  mainWindow.on('hide', () => {
    userOpenedManually = false;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Create a simple custom icon or use a standard shape if file doesn't exist
  // We will create a small 16x16 icon dynamically or use a fallback
  const iconPath = path.join(__dirname, 'tray_icon.png');

  // Create tray
  tray = new Tray(fs.existsSync(iconPath) ? iconPath : nativeImage.createEmpty());
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open freeXan',
      click: () => {
        if (mainWindow) {
          userOpenedManually = true;
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Reposition Overlay',
      click: () => repositionOverlay()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('freeXan');
  tray.setContextMenu(contextMenu);

  // Toggle show/hide on double click
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        userOpenedManually = true;
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// Background Monitor for Premiere Pro Home Screen
let hasShownForWelcome = false;
let _premiereMonitorInterval = null;

function startPremiereMonitor() {
  _premiereMonitorInterval = setInterval(() => {
    // Use a script file approach to avoid $_ escaping issues in exec()
    const psCommand = `powershell -NoProfile -Command "$p = Get-Process -Name 'Adobe Premiere Pro' -ErrorAction SilentlyContinue; if ($p) { $p.MainWindowTitle } else { '' }"`;

    exec(psCommand, { timeout: 3000 }, (err, stdout) => {
      if (err) {
        // Premiere Pro is likely not running
        if (hasShownForWelcome) hasShownForWelcome = false;
        if (nativeProjectPath) {
          nativeProjectPath = '';
          updateOverlayUI();
        }
        return;
      }

      const title = stdout.trim();

      if (!title) {
        // Premiere not running or title blank
        if (nativeProjectPath) {
          nativeProjectPath = '';
          updateOverlayUI();
        }
        hasShownForWelcome = false;
        return;
      }

      // Parse project path from window title:
      // Format: "Adobe Premiere Pro 2025 - D:\Path\To\file.prproj"
      const dashIdx = title.indexOf(' - ');
      if (dashIdx !== -1) {
        const parsedPath = title.substring(dashIdx + 3).trim();
        if (parsedPath.toLowerCase().endsWith('.prproj') && parsedPath !== nativeProjectPath) {
          nativeProjectPath = parsedPath;
          console.log('[NativeMonitor] Detected active project:', nativeProjectPath);
          updateOverlayUI();
        }

        // A real project is active — hide the project builder main window,
        // but not if the user explicitly opened it from the tray this session.
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && appConfig.autoPopup && !userOpenedManually) {
          mainWindow.hide();
        }
        hasShownForWelcome = false;
      } else {
        // No project separator found — Premiere Home Screen is showing
        if (nativeProjectPath) {
          nativeProjectPath = '';
          updateOverlayUI();
        }
        
        // NEVER popup automatically if CEP is connected OR the halo picker is
        // currently showing (would steal focus from the in-progress route gesture)
        if (!isCepConnected && !haloPickerActive && appConfig.autoPopup && mainWindow && !mainWindow.isDestroyed()) {
          if (!hasShownForWelcome && !mainWindow.isVisible()) {
            mainWindow.show();
            mainWindow.focus();
            hasShownForWelcome = true;
          }
        }
      }
    });
  }, 2500); // check every 2.5 seconds
}

// CEP Extension Auto-Installation and Configuration
function enableCEPDebugging() {
  console.log('Configuring Adobe PlayerDebugMode registry keys...');
  const csxsVersions = ['9', '10', '11', '12', '13', '14', '15', '16', '17'];
  csxsVersions.forEach(v => {
    const cmd = `reg add "HKCU\\Software\\Adobe\\CSXS.${v}" /v PlayerDebugMode /t REG_SZ /d 1 /f`;
    exec(cmd, (err) => {
      if (err) console.error(`Error setting PlayerDebugMode for CSXS.${v}:`, err);
    });
  });
}

// Locate the source `plugins/` folder both in dev and in packaged builds.
// In a packaged app, electron-builder copies `plugins/` to
// process.resourcesPath/plugins/ via the extraResources rule.
function getPluginsSourceRoot() {
  const packed = path.join(process.resourcesPath || '', 'plugins');
  if (fs.existsSync(packed)) return packed;
  const devCeps = path.join(__dirname, 'CEPs');
  if (fs.existsSync(devCeps)) return devCeps;
  return path.join(__dirname, 'plugins');
}

// Parse CLI args (e.g. `npm start SubMachine` or `freeXan.exe SubMachine`)
// for plugin names to SKIP this launch. Matching is case-insensitive and
// resolved against actual folder names in plugins/. Returns a Set of
// canonical (case-matched) folder names.
function getCliSkipSet() {
  const skip = new Set();
  const pluginsRoot = getPluginsSourceRoot();
  if (!fs.existsSync(pluginsRoot)) return skip;
  const folderNames = fs.readdirSync(pluginsRoot).filter(name => {
    return fs.existsSync(path.join(pluginsRoot, name, 'CSXS', 'manifest.xml'));
  });
  const byLower = new Map(folderNames.map(n => [n.toLowerCase(), n]));

  // process.argv = [electron.exe, app_path, ...args] — strip the first two
  // entries plus any flag-style args (e.g. `--hidden`).
  const args = process.argv.slice(2).filter(a => !a.startsWith('-'));
  for (const arg of args) {
    const canonical = byLower.get(arg.toLowerCase());
    if (canonical) skip.add(canonical);
  }
  return skip;
}

// Read which plugins should be enabled this launch.
// Priority:
//   1. CLI args — any plugin name passed via `npm start <Name>` is SKIPPED.
//   2. `plugins-enabled.json` — written by the NSIS installer at install time.
//   3. Default: every folder in plugins/ that has a CSXS/manifest.xml.
function getEnabledPluginsMap() {
  const pluginsRoot = getPluginsSourceRoot();
  const cliSkip = getCliSkipSet();

  // Start from the installer manifest if present, else default-all-enabled.
  let map = null;
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, '..', 'plugins-enabled.json'));
  }
  candidates.push(path.join(__dirname, 'plugins-enabled.json'));

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        map = JSON.parse(fs.readFileSync(file, 'utf-8'));
        console.log('[Plugins] Loaded selection from', file);
        break;
      } catch (err) {
        console.warn('[Plugins] Could not parse', file, '-', err.message);
      }
    }
  }

  if (map == null) {
    map = {};
    if (fs.existsSync(pluginsRoot)) {
      fs.readdirSync(pluginsRoot).forEach(name => {
        const manifest = path.join(pluginsRoot, name, 'CSXS', 'manifest.xml');
        if (fs.existsSync(manifest)) map[name] = true;
      });
    }
  }

  // Apply CLI overrides last so they always win.
  for (const name of cliSkip) {
    map[name] = false;
    console.log('[Plugins] CLI override — skipping this launch:', name);
  }

  return map;
}

// Read the ExtensionBundleId attribute from a CEP manifest.xml.
// Every install path (npm start, .exe installer, .bat installers) must use
// this ID as the destination folder name so we never end up with two copies
// of the same extension (e.g. `SubMachine` AND `com.aescripts.submachine`).
function getBundleIdFromManifest(manifestPath) {
  try {
    const xml = fs.readFileSync(manifestPath, 'utf-8');
    const m = xml.match(/ExtensionBundleId\s*=\s*"([^"]+)"/);
    if (m && m[1]) return m[1].trim();
  } catch (err) {
    console.warn('[Plugins] Could not read manifest at', manifestPath, '-', err.message);
  }
  return null;
}

// Pre-rebrand bundle ids that should be deleted from %APPDATA%\Adobe\CEP\extensions\
// on every launch, keyed by the plugins/<folder> source name. When a plugin is
// rebranded (e.g. SubMachine → freeXan Caption, bundle id com.aescripts.submachine
// → com.bloomx.freexan.caption) the old id stays behind on machines that ran an
// earlier installer / .bat. Listing it here forces removal so Premiere doesn't
// load both copies.
const LEGACY_BUNDLE_IDS = {
  SubMachine: ['com.aescripts.submachine']
};

function installCEPExtension() {
  const cepExtensionsRoot = path.join(app.getPath('appData'), 'Adobe', 'CEP', 'extensions');
  const pluginsRoot = getPluginsSourceRoot();
  const enabledMap = getEnabledPluginsMap();

  // Remove stale legacy installations that share the WebSocket port and would
  // shadow the current panel. These are leftovers from the pre-freeXan rename
  // (Project Builder Link → freeXan) and the pre-v3.1.0 combined bundle.
  // If left in place, Premiere loads BOTH panels, the legacy one connects
  // first, and the new panels never run.
  const legacyFolders = ['project-builder-link', 'projectbuilder-link', 'project_builder_link', 'freexan-link'];
  for (const folder of legacyFolders) {
    const legacyPath = path.join(cepExtensionsRoot, folder);
    if (fs.existsSync(legacyPath)) {
      try {
        fs.rmSync(legacyPath, { recursive: true, force: true });
        console.log('[Plugins] Removed legacy CEP extension:', legacyPath);
      } catch (err) {
        console.warn('[Plugins] Could not remove legacy at', legacyPath, '-', err.message);
      }
    }
  }

  if (!fs.existsSync(pluginsRoot)) {
    console.warn('[Plugins] Source plugins/ folder not found at:', pluginsRoot);
    return;
  }

  const copyDir = (src, dest) => {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(file => {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      if (fs.statSync(srcPath).isDirectory()) copyDir(srcPath, destPath);
      else fs.copyFileSync(srcPath, destPath);
    });
  };

  // Walk plugins/. Each subfolder with CSXS/manifest.xml is a CEP bundle.
  // Install enabled ones into the Adobe extensions dir using the manifest's
  // ExtensionBundleId as the folder name — this matches the .bat installers
  // and prevents duplicates like `SubMachine` AND `com.aescripts.submachine`
  // both existing side-by-side. Also remove the legacy folder-name install
  // (e.g. `SubMachine`) if it was created by an older version of freeXan.
  fs.readdirSync(pluginsRoot).forEach(name => {
    const pluginSrc = path.join(pluginsRoot, name);
    const manifest = path.join(pluginSrc, 'CSXS', 'manifest.xml');
    if (!fs.statSync(pluginSrc).isDirectory() || !fs.existsSync(manifest)) return;

    const bundleId = getBundleIdFromManifest(manifest);
    if (!bundleId) {
      console.warn('[Plugins] No ExtensionBundleId in', manifest, '— skipping', name);
      return;
    }

    // Sweep the old folder-name install (pre-bundle-id-standardisation).
    // Skip if the source folder name happens to equal the bundle id.
    if (name !== bundleId) {
      const legacyByName = path.join(cepExtensionsRoot, name);
      if (fs.existsSync(legacyByName)) {
        try {
          fs.rmSync(legacyByName, { recursive: true, force: true });
          console.log('[Plugins] Removed duplicate folder-name install:', legacyByName);
        } catch (err) {
          console.warn('[Plugins] Could not remove duplicate', legacyByName, '-', err.message);
        }
      }
    }

    // Sweep pre-rebrand bundle ids (e.g. SubMachine's old com.aescripts.submachine).
    const legacyIds = LEGACY_BUNDLE_IDS[name] || [];
    for (const legacyId of legacyIds) {
      if (legacyId === bundleId) continue; // nothing to do — current id matches legacy id
      const legacyPath = path.join(cepExtensionsRoot, legacyId);
      if (fs.existsSync(legacyPath)) {
        try {
          fs.rmSync(legacyPath, { recursive: true, force: true });
          console.log('[Plugins] Removed pre-rebrand bundle-id install:', legacyPath);
        } catch (err) {
          console.warn('[Plugins] Could not remove legacy bundle id', legacyPath, '-', err.message);
        }
      }
    }

    const pluginDest = path.join(cepExtensionsRoot, bundleId);
    const enabled = enabledMap[name] !== false; // default true if not listed

    if (enabled) {
      try {
        // Wipe existing target so renamed/removed files don't linger.
        if (fs.existsSync(pluginDest)) {
          fs.rmSync(pluginDest, { recursive: true, force: true });
        }
        copyDir(pluginSrc, pluginDest);
        console.log('[Plugins] Installed:', name, '→', pluginDest);
      } catch (err) {
        console.error('[Plugins] Failed to install', name, '-', err.message);
      }
    } else {
      // Plugin was unchecked at install time — make sure it is not present.
      if (fs.existsSync(pluginDest)) {
        try {
          fs.rmSync(pluginDest, { recursive: true, force: true });
          console.log('[Plugins] Removed disabled plugin:', name, '(' + bundleId + ')');
        } catch (err) {
          console.warn('[Plugins] Could not remove disabled', name, '-', err.message);
        }
      }
    }
  });
}


var activeTempPeaksFile = null;

function broadcastToAll(payload) {
  if (!wss) return;
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      try { client.send(payload); } catch (e) {}
    }
  });
}

function broadcastMogrtChange(change) {
  broadcastToAll(JSON.stringify({ type: 'mogrt_library_changed', change }));
}

function startWebSocketServer() {
  console.log('Starting local WebSocket server on port 4554...');
  wss = new WebSocketServer({ port: 4554 });

  wss.on('connection', (ws) => {
    // dbg(`[CEP] Panel connected`);
    isCepConnected = true;
    cepWs = { readyState: 1, send: (msg) => broadcastToAll(msg) };
    updateOverlayUI();

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'ext_hello') {
          if (data.version !== EXPECTED_EXT_VERSION) {
            // dbg(`[CEP] Panel v${data.version} is stale (expected v${EXPECTED_EXT_VERSION}) — sending reload`);
            ws.send(JSON.stringify({ type: 'reload' }));
          } else {
            // dbg(`[CEP] Panel v${data.version} is current — OK`);
          }

        } else if (data.type === 'active_project') {
          activeProjectPath = data.path;
          // dbg(`[CEP] active_project: "${data.path}"`);
          updateOverlayUI();
          // Linked-folder watchers: switch to the new project's link manifest.
          refreshLinkedFolders(data.path);

          // Fallback for panels that don't support project_ready (pre-v1.8.5).
          // Fires after 3 s so rootItem has time to become accessible.
          // Auto-cancels if project_ready already handled this setup.
          if (pendingProjectSetup && data.path) {
            const norm = (p) => path.normalize(p.trim()).toLowerCase();
            if (norm(data.path) === norm(pendingProjectSetup.projectPath)) {
              const snapshot = pendingProjectSetup; // capture in case it clears before timeout
              // dbg(`[Setup] active_project matched — fallback dispatch in 8 s if project_ready doesn't fire first`);
              setTimeout(() => {
                if (pendingProjectSetup !== snapshot) {
                  // dbg(`[Setup] fallback cancelled — project_ready already handled it`);
                  return;
                }
                const tree = snapshot.premiereTree || [];
                const bins = snapshot.bins || [];
                const seqs = snapshot.sequences || [];
                // dbg(`[Setup] fallback firing — premiereTree:${tree.length}, bins:${bins.length}, sequences:${seqs.length}`);
                try {
                  ws.send(JSON.stringify({
                    type: 'setup-project',
                    bins: bins,
                    sequences: seqs,
                    premiereTree: tree,
                    assets: snapshot.assets || [],
                    sequencePreset: '1920x1080_25fps'
                  }));
                } catch (sendErr) {
                  dbg(`[Setup] fallback send failed: ${sendErr.message}`);
                }
                // dbg(`[Setup] setup-project sent (fallback)`);
                pendingProjectSetup = null;
              }, 8000);
            }
          }

        } else if (data.type === 'get_project_state') {
          if (ws.clientType !== 'caption') {
            ws.clientType = 'caption';
          }
          const knownPath = activeProjectPath || nativeProjectPath || null;
          const isBloomXOpen = Array.from(wss.clients).some(c => c.clientType === 'bloomx');
          ws.send(JSON.stringify({
            type: 'project_state',
            projectPath: knownPath,
            connected: !!knownPath,
            bloomxOpen: isBloomXOpen
          }));

        } else if (data.type === 'project_ready') {
          // Panel confirmed app.project.rootItem is accessible — dispatch immediately
          // dbg(`[CEP] project_ready: "${data.path}"`);
          if (pendingProjectSetup) {
            if (data.path) {
              const norm = (p) => path.normalize(p.trim()).toLowerCase();
              const received = norm(data.path);
              const expected = norm(pendingProjectSetup.projectPath);
              // dbg(`[Setup] Path compare:`);
              // dbg(`        received : "${received}"`);
              // dbg(`        expected : "${expected}"`);
              // dbg(`        match    : ${received === expected}`);
              if (received === expected) {
                const tree = pendingProjectSetup.premiereTree || [];
                const bins = pendingProjectSetup.bins || [];
                const seqs = pendingProjectSetup.sequences || [];
                // dbg(`[Setup] Sending setup-project — premiereTree:${tree.length}, bins:${bins.length}, sequences:${seqs.length}`);
                // if (tree.length) dbg(`[Setup] premiereTree sample:`, JSON.stringify(tree.slice(0, 3)));
                // else dbg(`[Setup] flat bins:`, JSON.stringify(bins));
                ws.send(JSON.stringify({
                  type: 'setup-project',
                  bins: bins,
                  sequences: seqs,
                  premiereTree: tree,
                  assets: pendingProjectSetup.assets || [],
                  sequencePreset: '1920x1080_25fps'
                }));
                // dbg(`[Setup] setup-project sent`);
                pendingProjectSetup = null;
              } else {
                // dbg(`[Setup] project_ready path does not match pending — waiting`);
              }
            }
          } else {
            // dbg(`[CEP] project_ready — no pendingProjectSetup, nothing to dispatch`);
          }

        } else if (data.type === 'ext_log') {
          // Log forwarded from the CEP panel — routed based on source if provided
          if (data.source === 'caption') {
            captionLogger(data.msg);
          } else if (data.source === 'audio') {
            audioLogger(data.msg);
          } else if (data.source === 'bloomx') {
            bloomxLogger(data.msg);
          } else if (data.source === 'link') {
            linkLogger(data.msg);
          } else {
            dbg(`[EXT] ${data.msg}`);
          }

        } else if (data.type === 'import_result') {
          // dbg(`[CEP] import_result for "${data.filePath}": ${data.result}`);
        } else if (data.type === 'bin_files') {
          // CEP response to get_bin_files — forward to linkWatcher's diff queue.
          linkWatcher.handleBinFiles(data.requestId, data.files || []);
        } else if (data.type === 'get_audio_library') {
          const search = data.search || '';
          const favoritesOnly = !!data.favoritesOnly;
          const files = audioDb.audioApi.getAll(search, favoritesOnly);
          const watchedFolders = audioDb.foldersApi.getAll();
          ws.send(JSON.stringify({ type: 'audio_library_data', files, watchedFolders, msgId: data.msgId }));
        } else if (data.type === 'toggle_favorite') {
          audioDb.audioApi.toggleFavorite(data.id);
          const files = audioDb.audioApi.getAll();
          const watchedFolders = audioDb.foldersApi.getAll();
          ws.send(JSON.stringify({ type: 'audio_library_data', files, watchedFolders }));
        } else if (data.type === 'update_tags') {
          audioDb.audioApi.updateTags(data.id, data.tags);
          const files = audioDb.audioApi.getAll();
          const watchedFolders = audioDb.foldersApi.getAll();
          ws.send(JSON.stringify({ type: 'audio_library_data', files, watchedFolders }));
        } else if (data.type === 'batch_add_tags') {
          audioDb.audioApi.addTagsBatch(data.ids, data.tagKeys);
          const files = audioDb.audioApi.getAll();
          const watchedFolders = audioDb.foldersApi.getAll();
          ws.send(JSON.stringify({ type: 'audio_library_data', files, watchedFolders }));
        } else if (data.type === 'update_duration') {
          audioDb.audioApi.upsert(data.filePath, path.basename(data.filePath), data.duration);
        } else if (data.type === 'record_use') {
          if (data.id) audioDb.audioApi.incrementUseCount(data.id);

        // ── MOGRT Library ───────────────────────────────────────────────────────
        } else if (data.type === 'get_mogrt_library') {
          if (ws.clientType !== 'bloomx') {
            ws.clientType = 'bloomx';
            broadcastToAll(JSON.stringify({ type: 'bloomx_status', open: true }));
          }
          const files = mogrtDb.mogrtApi.getAll(data.search || '', !!data.favoritesOnly, data.category || '');
          const watchedFolders = mogrtDb.foldersApi.getAll();
          ws.send(JSON.stringify({ type: 'mogrt_library_data', files, watchedFolders }));

        } else if (data.type === 'toggle_mogrt_favorite') {
          mogrtDb.mogrtApi.toggleFavorite(data.id);
          const files = mogrtDb.mogrtApi.getAll();
          const watchedFolders = mogrtDb.foldersApi.getAll();
          ws.send(JSON.stringify({ type: 'mogrt_library_data', files, watchedFolders }));

        } else if (data.type === 'update_mogrt_tags') {
          mogrtDb.mogrtApi.updateTags(data.id, data.tags);
          const files = mogrtDb.mogrtApi.getAll();
          const watchedFolders = mogrtDb.foldersApi.getAll();
          ws.send(JSON.stringify({ type: 'mogrt_library_data', files, watchedFolders }));

        } else if (data.type === 'record_mogrt_use') {
          if (data.id) mogrtDb.mogrtApi.incrementUseCount(data.id);

        } else if (data.type === 'add_mogrt_folder') {
          const folderId = mogrtDb.foldersApi.add(data.folderPath);
          if (folderId) {
            mogrtWatcher.watchDirectory(folderId, data.folderPath, (change) => {
              broadcastMogrtChange(change);
            });
          }
          const files = mogrtDb.mogrtApi.getAll();
          const watchedFolders = mogrtDb.foldersApi.getAll();
          ws.send(JSON.stringify({ type: 'mogrt_library_data', files, watchedFolders }));

        } else if (data.type === 'remove_mogrt_folder') {
          mogrtWatcher.stopWatching(data.id);
          mogrtDb.foldersApi.delete(data.id);
          const files = mogrtDb.mogrtApi.getAll();
          const watchedFolders = mogrtDb.foldersApi.getAll();
          ws.send(JSON.stringify({ type: 'mogrt_library_data', files, watchedFolders }));

        } else if (data.type === 'select_mogrt') {
          // Copy MOGRT to active project folder, then broadcast mogrt_ready to all panels
          if (data.id) mogrtDb.mogrtApi.incrementUseCount(data.id);
          const projectPath = activeProjectPath || nativeProjectPath || null;
          let localPath = data.filePath;
          if (projectPath && data.filePath) {
            try {
              const destDir = path.join(path.dirname(projectPath), 'SM_Assets');
              if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
              const destPath = path.join(destDir, path.basename(data.filePath));
              if (!fs.existsSync(destPath)) fs.copyFileSync(data.filePath, destPath);
              localPath = destPath;
            } catch (copyErr) {
              dbg(`[MOGRT] Copy failed: ${copyErr.message} — using original path`);
            }
          }
          broadcastToAll(JSON.stringify({ type: 'mogrt_ready', localPath, originalPath: data.filePath }));

        } else if (data.type === 'prepare_dummy') {
          const durationSec = data.duration;
          const sampleRate = data.sampleRate || 48000;
          const numChannels = data.channels || 2;
          const bytesPerSample = 2; // 16-bit
          const numSamples = Math.max(1, Math.floor(sampleRate * durationSec));
          const dataSize = numSamples * numChannels * bytesPerSample;
          const buf = Buffer.alloc(44 + dataSize);
          
          buf.write('RIFF', 0);
          buf.writeUInt32LE(36 + dataSize, 4);
          buf.write('WAVE', 8);
          buf.write('fmt ', 12);
          buf.writeUInt32LE(16, 16);
          buf.writeUInt16LE(1, 20);
          buf.writeUInt16LE(numChannels, 22);
          buf.writeUInt32LE(sampleRate, 24);
          buf.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
          buf.writeUInt16LE(numChannels * bytesPerSample, 32);
          buf.writeUInt16LE(16, 34);
          buf.write('data', 36);
          buf.writeUInt32LE(dataSize, 40);
          
          const dummyPath = path.join(app.getPath('temp'), `dummy_${Date.now()}.wav`);
          fs.writeFileSync(dummyPath, buf);
          ws.send(JSON.stringify({ type: 'dummy_ready', path: dummyPath }));
        } else if (data.type === 'cleanup_dummy') {
          try {
            if (data.path && fs.existsSync(data.path)) {
              fs.unlinkSync(data.path);
              // dbg(`[CEP] Cleaned up OS dummy file: ${data.path}`);
            }
          } catch(e) {}
        } else if (data.type === 'generate_peaks') {
          const { filePath, msgId } = data;
          if (!filePath || !fs.existsSync(filePath)) {
            ws.send(JSON.stringify({ type: 'peaks_ready', msgId, error: 'File not found' }));
            return;
          }
          const hash = require('crypto').createHash('md5').update(filePath).digest('hex');
          const tempFile = path.join(app.getPath('temp'), `freexan_peaks_v3_${hash}.json`);

          // Clean up the previously active temp peaks file if it's different
          if (activeTempPeaksFile && activeTempPeaksFile !== tempFile) {
            try {
              if (fs.existsSync(activeTempPeaksFile)) {
                fs.unlinkSync(activeTempPeaksFile);
              }
            } catch (e) {
              console.error('Failed to clean up old temp peaks file:', e);
            }
          }
          activeTempPeaksFile = tempFile;

          if (fs.existsSync(tempFile)) {
            try {
              const fileData = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
              let peaksData = Array.isArray(fileData) ? fileData : fileData.peaks;
              let peaksDuration = Array.isArray(fileData) ? (peaksData.length * (1 / 22050)) : fileData.duration;
              ws.send(JSON.stringify({ type: 'peaks_ready', msgId, peaks: peaksData, duration: peaksDuration }));
              return;
            } catch(e) {}
          }
          
          const ffmpegArgs = ['-i', `"${filePath}"`, '-f', 's16le', '-ac', '1', '-ar', '22050', 'pipe:1'];
          const { spawn } = require('child_process');
          const proc = spawn(`"${ffmpegPath}"`, ffmpegArgs, { shell: true });
          proc.stderr.resume(); // Drain stderr so process never blocks on pipe buffer

          let allSamples = [];
          
          proc.stdout.on('data', (chunk) => {
            for (let i = 0; i < chunk.length - 1; i += 2) {
              let val = chunk.readInt16LE(i) / 32768.0;
              allSamples.push(val);
            }
          });
          proc.on('close', () => {
             const totalSamples = allSamples.length;
             if (totalSamples === 0) {
                ws.send(JSON.stringify({ type: 'peaks_ready', msgId, peaks: [], duration: 0 }));
                return;
             }
             const targetPeaks = 10000000; // 10 million limit
             const chunkSize = Math.max(1, Math.ceil(totalSamples / targetPeaks));
             
             let minMaxArray = [];
             for (let i = 0; i < totalSamples; i += chunkSize) {
               let maxAbs = 0;
               const end = Math.min(totalSamples, i + chunkSize);
               for (let j = i; j < end; j++) {
                 let abs = Math.abs(allSamples[j]);
                 if (abs > maxAbs) maxAbs = abs;
               }
               minMaxArray.push(Number(maxAbs.toFixed(4)));
             }
             
             const peaksDuration = minMaxArray.length * chunkSize * (1 / 22050);
             try { fs.writeFileSync(tempFile, JSON.stringify({ peaks: minMaxArray, duration: peaksDuration })); } catch(e){}
             ws.send(JSON.stringify({ type: 'peaks_ready', msgId, peaks: minMaxArray, duration: peaksDuration }));
          });
        } else if (data.type === 'route_bin') {
          const { filePath, audioType } = data;
          const resolvedProjectPath = activeProjectPath || nativeProjectPath;
          let binName = audioType === 'bgm' ? 'BGM' : (audioType === 'sfx' ? 'SFX' : 'Audio'); // Default fallbacks
          
          if (resolvedProjectPath) {
            let projectFolder = path.dirname(resolvedProjectPath);
            const parentFolder = path.dirname(projectFolder);
            try {
              const parentContents = fs.readdirSync(parentFolder);
              const hasSubfolders = parentContents.some(f => {
                const lf = f.toLowerCase();
                return f.includes('02_') || f.includes('03_') || f.includes('04_') ||
                  lf.includes('footage') || lf.includes('audio') || lf.includes('assets');
              });
              if (hasSubfolders) projectFolder = parentFolder;
            } catch (e) {}

            let slotMap = null;
            const slotMapPath = path.join(projectFolder, '_freexan_slot_map.json');
            if (fs.existsSync(slotMapPath)) {
              try { slotMap = JSON.parse(fs.readFileSync(slotMapPath, 'utf8')); } catch (e) {}
            }
            
            if (slotMap) {
                if (slotMap[audioType] && slotMap[audioType].bin) {
                    binName = slotMap[audioType].bin;
                } else if (slotMap['audio'] && slotMap['audio'].bin) {
                    binName = slotMap['audio'].bin;
                }
            }
          }
          ws.send(JSON.stringify({ type: 'move_bin_only', filePath, binName }));
        } else if (data.type === 'process_audio') {
          const { filePath, trimStart, trimEnd, pitch, speed, msgId, dummyFilePath, audioType, sampleRate, channels, durationSec, fxArray } = data;
          
          const sourceSr = sampleRate || 48000;
          const sourceCh = channels || 2;
          
          const basename = path.basename(filePath, path.extname(filePath));
          let suffix = '';
          if (pitch !== undefined && pitch !== 0) suffix += `_p${pitch > 0 ? '+' : ''}${pitch}`;
          if (speed !== undefined && speed !== 1.0) suffix += `_s${speed}`;
          if (trimStart !== undefined && trimStart !== null) suffix += `_ts${trimStart}`;
          if (trimEnd !== undefined && trimEnd !== null) suffix += `_te${trimEnd}`;
          
          // Resolve routing
          const resolvedProjectPath = activeProjectPath || nativeProjectPath;
          let destFolder = app.getPath('temp');
          let binName = null;

          if (resolvedProjectPath) {
            let projectFolder = path.dirname(resolvedProjectPath);
            const parentFolder = path.dirname(projectFolder);
            try {
              const parentContents = fs.readdirSync(parentFolder);
              const hasSubfolders = parentContents.some(f => {
                const lf = f.toLowerCase();
                return f.includes('02_') || f.includes('03_') || f.includes('04_') ||
                  lf.includes('footage') || lf.includes('audio') || lf.includes('assets');
              });
              if (hasSubfolders) projectFolder = parentFolder;
            } catch (e) {}

            let slotMap = null;
            const slotMapPath = path.join(projectFolder, '_freexan_slot_map.json');
            if (fs.existsSync(slotMapPath)) {
              try { slotMap = JSON.parse(fs.readFileSync(slotMapPath, 'utf8')); } catch (e) {}
            }

            // Option C: if active .prproj matches a file-type template, use the dated folder's slot map
            if (!slotMap && appConfig.targetDir) {
              const _normPA = p => path.normalize(p || '').toLowerCase();
              const allTplsPA = db.folderTemplatesApi.getAll();
              const fileTplPA = allTplsPA.find(t =>
                t.template_type === 'file' && t.open_mode === 'open_existing' &&
                t.prproj_path && _normPA(t.prproj_path) === _normPA(resolvedProjectPath)
              );
              if (fileTplPA) {
                const _nowPA = new Date();
                const _ddPA = String(_nowPA.getDate()).padStart(2, '0');
                const _mmPA = String(_nowPA.getMonth() + 1).padStart(2, '0');
                const _myrPA = `${MONTH_NAMES[_nowPA.getMonth()]}${_nowPA.getFullYear()}`;
                const _dmPA = `${_ddPA} ${MONTH_NAMES[_nowPA.getMonth()]}`;
                const _npPA = [fileTplPA.client_name, fileTplPA.funnel_name, fileTplPA.task_name].filter(Boolean);
                const _fnPA = _npPA.length ? `${_npPA.join(' - ')} - ${_ddPA} ${_mmPA}` : `${_ddPA} ${_mmPA}`;
                const optionCFolder = path.join(resolveVars(appConfig.targetDir), _myrPA, _dmPA, _fnPA);
                const optionCSlotMapPath = path.join(optionCFolder, '_freexan_slot_map.json');
                if (fs.existsSync(optionCSlotMapPath)) {
                  try {
                    slotMap = JSON.parse(fs.readFileSync(optionCSlotMapPath, 'utf8'));
                    projectFolder = optionCFolder;
                  } catch (e) {}
                }
              }
            }

            const fileExt = path.extname(filePath).toLowerCase();
            destFolder = getDestSubfolder(projectFolder, fileExt, slotMap, audioType);
            if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });

            const _videoExts = ['.mp4', '.mov', '.mkv', '.avi', '.m4v', '.webm', '.raw', '.mxf', '.r3d', '.braw', '.arw', '.cr2', '.dng'];
            const _audioExts = ['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac', '.aif', '.aiff'];
            const _imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.psd', '.ai', '.webp', '.tiff', '.bmp'];
            let fileType = audioType;
            if (!fileType) {
              fileType = _videoExts.includes(fileExt) ? 'video' : _audioExts.includes(fileExt) ? 'audio' : _imageExts.includes(fileExt) ? 'image' : null;
            }
            binName = (slotMap && fileType && slotMap[fileType]) ? (slotMap[fileType].bin || null) : null;
            // Fallback: bgm/sfx → audio bin
            if (!binName && (fileType === 'bgm' || fileType === 'sfx') && slotMap && slotMap['audio']) {
              binName = slotMap['audio'].bin || null;
            }
          }

          let finalName = `${basename}${suffix}.wav`;
          let outPath = path.join(destFolder, finalName);
          
          if (fs.existsSync(outPath) && fs.statSync(outPath).size > 44) {
            // Already rendered — skip FFmpeg and instantly return cached result
            if (dummyFilePath) {
              ws.send(JSON.stringify({ type: 'replace_audio', dummyFilePath, realFilePath: outPath, binName }));
            } else {
              ws.send(JSON.stringify({ type: 'import_audio_legacy', realFilePath: outPath, binName }));
            }
            return;
          }
          
          let ffmpegArgs = [];
          
          if (trimStart !== undefined && trimStart !== null) {
            ffmpegArgs.push(`-ss ${trimStart}`);
          }
          if (trimEnd !== undefined && trimEnd !== null) {
            ffmpegArgs.push(`-to ${trimEnd}`);
          }
          
          ffmpegArgs.push(`-i "${filePath}"`);
          
          // Audio filters for pitch and speed
          let filters = [];
          if (pitch !== undefined && pitch !== 0) {
            const F = Math.pow(2, pitch / 12);
            filters.push(`asetrate=${sourceSr}*${F.toFixed(4)}`);
            filters.push(`aresample=${sourceSr}`);
            
            const T = (speed || 1.0) / F;
            let tempoFilters = [];
            let tempT = T;
            while (tempT > 2.0) {
              tempoFilters.push('atempo=2.0');
              tempT /= 2.0;
            }
            while (tempT < 0.5) {
              tempoFilters.push('atempo=0.5');
              tempT /= 0.5;
            }
            tempoFilters.push(`atempo=${tempT.toFixed(4)}`);
            filters.push(...tempoFilters);
          } else if (speed !== undefined && speed !== 1.0) {
            let tempoFilters = [];
            let tempT = speed;
            while (tempT > 2.0) {
              tempoFilters.push('atempo=2.0');
              tempT /= 2.0;
            }
            while (tempT < 0.5) {
              tempoFilters.push('atempo=0.5');
              tempT /= 0.5;
            }
            tempoFilters.push(`atempo=${tempT.toFixed(4)}`);
            filters.push(...tempoFilters);
          }
          
          if (fxArray && Array.isArray(fxArray) && fxArray.length > 0) {
            fxArray.forEach(fx => {
              if (fx === 'AutoFilter') filters.push('aphaser=type=t');
              else if (fx === 'AutoPanner') filters.push('apulsator=mode=sine:hz=1');
              else if (fx === 'AutoWah') filters.push('bandpass=f=1000:width_type=q:width=1');
              else if (fx === 'BitCrusher') filters.push('acrusher=level_in=1:level_out=1:bits=4:mode=log');
              else if (fx === 'Chebyschev') filters.push('aexciter=level_in=1:level_out=1');
              else if (fx === 'Chorus') filters.push('chorus=0.5:0.9:50|60:0.4|0.32:0.25|0.4:2|2.3');
              else if (fx === 'Compressor') filters.push('acompressor=ratio=4:makeup=2');
              else if (fx === 'Distortion') filters.push('compand=attacks=0:points=-80/-80|-20/-20|0/-10|20/-7');
              else if (fx === 'EQ3') filters.push('equalizer=f=1000:width_type=o:width=2:g=5');
              else if (fx === 'FeedbackDelay') filters.push('aecho=0.8:0.9:500:0.5');
              else if (fx === 'Freeverb') filters.push('aecho=0.8:0.9:1000:0.3');
              else if (fx === 'JCReverb') filters.push('aecho=0.8:0.9:800:0.2');
              else if (fx === 'Phaser') filters.push('aphaser=in_gain=0.4:out_gain=0.74:delay=3:decay=0.4:speed=0.5:type=t');
              else if (fx === 'PingPongDelay') filters.push('aecho=0.8:0.9:500|1000:0.3|0.3');
              else if (fx === 'StereoWidener') filters.push('extrastereo=m=2.5');
              else if (fx === 'Tremolo') filters.push('tremolo=f=5.0:d=0.5');
              else if (fx === 'Vibrato') filters.push('vibrato=f=7.0:d=0.5');
            });
          }
          
          if (filters.length > 0) {
            ffmpegArgs.push(`-af "${filters.join(',')}"`);
          }
          
          ffmpegArgs.push('-c:a pcm_s16le'); // Force 16-bit to match dummy header
          ffmpegArgs.push(`-ac ${sourceCh}`);
          ffmpegArgs.push(`-ar ${sourceSr}`);
          ffmpegArgs.push(`-y "${outPath}"`);
          
          const ffmpeg = exec(`"${ffmpegPath}" ${ffmpegArgs.join(' ')}`);
          ffmpeg.on('close', (code) => {
            if (code === 0) {
              if (dummyFilePath) {
                ws.send(JSON.stringify({ type: 'replace_audio', dummyFilePath, realFilePath: outPath, binName }));
              } else {
                ws.send(JSON.stringify({ type: 'import_audio_legacy', realFilePath: outPath, binName, durationSec }));
              }
            } else {
              ws.send(JSON.stringify({ type: 'process_error', msgId }));
            }
          });
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    });

    ws.on('close', () => {
      // dbg(`[CEP] Panel disconnected`);
      const anyStillOpen = Array.from(wss.clients).some(c => c.readyState === 1);
      isCepConnected = anyStillOpen;
      if (!anyStillOpen) {
        cepWs = null;
        activeProjectPath = '';
      }
      updateOverlayUI();

      if (ws.clientType === 'bloomx') {
        const isStillOpen = Array.from(wss.clients).some(c => c !== ws && c.clientType === 'bloomx');
        if (!isStillOpen) {
          broadcastToAll(JSON.stringify({ type: 'bloomx_status', open: false }));
        }
      }

      // Clean up the active temp peaks file when panel closes/disconnects
      if (activeTempPeaksFile) {
        try {
          if (fs.existsSync(activeTempPeaksFile)) {
            fs.unlinkSync(activeTempPeaksFile);
          }
        } catch (e) {
          console.error('Failed to clean up temp peaks file on close:', e);
        }
        activeTempPeaksFile = null;
      }
    });
  });
}

function updateOverlayUI() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    // CEP-synced name takes priority; fall back to native window-title detection
    const cepName = activeProjectPath ? path.basename(activeProjectPath) : '';
    const nativeName = nativeProjectPath ? path.basename(nativeProjectPath) : '';
    overlayWindow.webContents.send('overlay-update', {
      connected: isCepConnected,
      projectName: cepName,
      nativeProjectName: nativeName
    });
  }
}

function _easeInOutCubic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

let _repositionTimer = null;

function repositionOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
    return;
  }

  // Clear any in-progress animation
  if (_repositionTimer) { clearInterval(_repositionTimer); _repositionTimer = null; }

  overlayWindow.show();
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  const [startX, startY] = overlayWindow.getPosition();
  const targetX = 20, targetY = 20;

  // Already at target — nothing to do
  if (startX === targetX && startY === targetY) return;

  const duration = 1500; // ms
  const startTime = Date.now();

  _repositionTimer = setInterval(() => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      clearInterval(_repositionTimer);
      _repositionTimer = null;
      return;
    }

    const t = Math.min((Date.now() - startTime) / duration, 1);
    const ease = _easeInOutCubic(t);

    try {
      overlayWindow.setPosition(
        Math.round(startX + (targetX - startX) * ease),
        Math.round(startY + (targetY - startY) * ease)
      );
    } catch (e) {
      clearInterval(_repositionTimer);
      _repositionTimer = null;
    }

    if (t >= 1) {
      clearInterval(_repositionTimer);
      _repositionTimer = null;
    }
  }, 16);
}

function createOverlayWindow() {
  // Start at compact size: 56px pill + 14px padding each side = 84px
  // No setIgnoreMouseEvents — window is sized to the pill so there are no transparent gaps to click through
  overlayWindow = new BrowserWindow({
    width: 84,
    height: 84,
    x: 20,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Use 'screen-saver' level so the overlay stays above Windows screenshot tools
  // (default 'normal' alwaysOnTop gets covered by Win+Shift+S Snipping Tool overlay)
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true);

  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    // Auto-recreate if closed unexpectedly (screenshot tools can kill transparent windows)
    if (!app.isQuitting) {
      setTimeout(() => { if (!overlayWindow) createOverlayWindow(); }, 600);
    }
  });
}

function getDestSubfolder(projectFolder, fileExt, slotMap, forcedType) {
  try {
    const folders = fs.readdirSync(projectFolder).filter(f => {
      return fs.statSync(path.join(projectFolder, f)).isDirectory();
    });

    const ext = fileExt.toLowerCase();
    const videoExts = ['.mp4', '.mov', '.mkv', '.avi', '.m4v', '.webm', '.raw', '.mxf', '.r3d', '.braw', '.arw', '.cr2', '.dng'];
    const audioExts = ['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac', '.aif', '.aiff'];
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.psd', '.ai', '.eps', '.svg', '.tiff', '.bmp', '.pdf'];

    // Explicit slot map takes priority over keyword guessing
    if (slotMap) {
      let fileType = forcedType;
      if (!fileType) {
        fileType = videoExts.includes(ext) ? 'video' : audioExts.includes(ext) ? 'audio' : imageExts.includes(ext) ? 'image' : null;
      }
      if (fileType && slotMap[fileType] && slotMap[fileType].folder && fs.existsSync(slotMap[fileType].folder)) {
        return slotMap[fileType].folder;
      }
      // If forcedType (bgm/sfx) isn't in slotMap, fallback to 'audio'
      if (forcedType && ['bgm', 'sfx'].includes(forcedType)) {
        if (slotMap['audio'] && slotMap['audio'].folder && fs.existsSync(slotMap['audio'].folder)) {
          return slotMap['audio'].folder;
        }
      }
    }

    let folderType = forcedType;
    if (!folderType) {
      if (videoExts.includes(ext)) {
        folderType = 'footage';
      } else if (audioExts.includes(ext)) {
        folderType = 'audio';
      } else if (imageExts.includes(ext)) {
        folderType = 'assets';
      }
    }

    // Find folder matching the keywords
    let matchedFolder = folders.find(f => {
      const lf = f.toLowerCase();
      if (folderType === 'footage') return lf.includes('footage') || lf.includes('video') || lf.includes('raw');
      if (folderType === 'audio') return lf.includes('audio') || lf.includes('music') || lf.includes('sound') || lf.includes('voice');
      if (folderType === 'assets') return lf.includes('assets') || lf.includes('graphics') || lf.includes('images') || lf.includes('photos') || lf.includes('design');
      if (folderType === 'bgm') return lf.includes('bgm') || lf.includes('music') || lf.includes('score') || lf.includes('soundtrack');
      if (folderType === 'sfx') return lf.includes('sfx') || lf.includes('foley') || lf.includes('sound effect');
      return false;
    });

    // Fallback: If bgm/sfx folder not found, look for general audio folder
    if (!matchedFolder && (folderType === 'bgm' || folderType === 'sfx')) {
       matchedFolder = folders.find(f => {
         const lf = f.toLowerCase();
         return lf.includes('audio') || lf.includes('sound') || lf.includes('assets');
       });
    }

    // Fallback search for numbers if keyword match fails
    if (!matchedFolder) {
      if (folderType === 'footage') matchedFolder = folders.find(f => f.includes('02'));
      else if (folderType === 'audio' || folderType === 'bgm' || folderType === 'sfx') matchedFolder = folders.find(f => f.includes('03'));
      else if (folderType === 'assets') matchedFolder = folders.find(f => f.includes('04'));
    }

    return matchedFolder ? path.join(projectFolder, matchedFolder) : projectFolder;
  } catch (err) {
    console.error('Error finding subfolder:', err);
    return projectFolder;
  }
}

function flattenPremiereTree(rawBins, sequencesJson) {
  if (!rawBins.length) {
    const seqs = safeParseJson(sequencesJson, []);
    return { flatBins: [], flatSeqs: Array.isArray(seqs) && seqs.length && typeof seqs[0] === 'string' ? seqs : seqs.map(s => s.name || s) };
  }
  if (typeof rawBins[0] === 'string') {
    const seqs = safeParseJson(sequencesJson, []);
    return { flatBins: rawBins, flatSeqs: Array.isArray(seqs) ? seqs : [] };
  }
  // New tree format — flatten bin names and sequence names
  const flatBins = rawBins.filter(n => n.type === 'bin').map(n => n.name);
  const flatSeqs = rawBins.filter(n => n.type === 'sequence').map(n => n.name);
  return { flatBins, flatSeqs };
}

// Walks up from a .prproj path looking for a `_freexan_links.json` sidecar.
// freeXan-created projects live at `<root>/01_Project_Files/<file>.prproj`, so
// the sidecar is typically one level up. We check 3 levels to be safe.
function findLinksSidecar(prprojPath) {
  if (!prprojPath) return null;
  let dir = path.dirname(prprojPath);
  for (let i = 0; i < 3; i++) {
    const candidate = path.join(dir, '_freexan_links.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Cached link map for the current project. Kept here so the overlay can request
// it on its own schedule (e.g., when it loads after main has already received
// `active_project` from CEP).
let currentLinkMap = [];

// Push the current set of links (`[{ folderPath, binName, shortcut }, …]`) to
// the overlay window so the hold-key-to-route gesture knows where to send files.
function pushLinkMapToOverlay(links) {
  currentLinkMap = Array.isArray(links) ? links : [];
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try {
      overlayWindow.webContents.send('overlay-link-map', currentLinkMap);
      dbg(`[LinkWatch] pushed link map to overlay (${currentLinkMap.length} link(s), shortcuts: ${JSON.stringify(currentLinkMap.map(l => l.shortcut || '-'))})`);
    } catch (e) {
      dbg(`[LinkWatch] push to overlay failed: ${e.message}`);
    }
  } else {
    dbg(`[LinkWatch] overlay not ready — cached ${currentLinkMap.length} link(s) for later request-status`);
  }
}

// Tear down any existing link watchers and (if a sidecar is found for the new
// active project) start fresh watchers + initial folder ↔ bin diff sync.
function refreshLinkedFolders(prprojPath) {
  linkWatcher.stop();
  if (!prprojPath) {
    pushLinkMapToOverlay([]);
    return;
  }
  const sidecarPath = findLinksSidecar(prprojPath);
  if (!sidecarPath) {
    pushLinkMapToOverlay([]);
    return;
  }
  let links;
  try {
    links = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
  } catch (e) {
    dbg(`[LinkWatch] failed to parse ${sidecarPath}: ${e.message}`);
    pushLinkMapToOverlay([]);
    return;
  }
  if (!Array.isArray(links) || links.length === 0) {
    pushLinkMapToOverlay([]);
    return;
  }
  dbg(`[LinkWatch] starting ${links.length} link(s) for project ${path.basename(prprojPath)}`);
  pushLinkMapToOverlay(links);
  linkWatcher.start(links, {
    log: (msg) => dbg(`[LinkWatch] ${msg}`),
    sendToCep: (msg) => {
      if (isCepConnected && cepWs && cepWs.readyState === 1) {
        cepWs.send(JSON.stringify(msg));
      } else {
        dbg(`[LinkWatch] cannot send ${msg.type} — CEP not connected`);
      }
    }
  });
}

// OS-level move with cross-device fallback. Same-drive moves are atomic and
// near-instant even for huge files; cross-drive falls back to copy+delete.
function moveFsItem(src, dest, isDirectory) {
  try {
    fs.renameSync(src, dest);
    return;
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
  }
  if (isDirectory) {
    fs.cpSync(src, dest, { recursive: true });
    try { fs.rmSync(src, { recursive: true, force: true }); }
    catch (delErr) { dbg(`[IMPORT] move(dir) — source delete failed after cross-drive copy: ${delErr.message}`); }
  } else {
    fs.copyFileSync(src, dest);
    try { fs.unlinkSync(src); }
    catch (delErr) { dbg(`[IMPORT] move(file) — source delete failed after cross-drive copy: ${delErr.message}`); }
  }
}

function buildFolderTree(basePath, nodes) {
  const nodeMap = {};
  const assetsToImport = [];
  const slotFolders = {}; // { video: '/abs/path', audio: '/abs/path', image: '/abs/path' }

  nodes.forEach(n => {
    if (n.node_type === 'folder') {
      const parent = n.parent_id ? nodeMap[n.parent_id] : null;
      const parentPath = parent ? parent.diskPath : basePath;
      const resolvedName = resolveVars(n.name);
      const rootName = parent ? parent.rootName : resolvedName;
      const diskPath = path.join(parentPath, resolvedName);
      if (!fs.existsSync(diskPath)) fs.mkdirSync(diskPath, { recursive: true });
      nodeMap[n.id] = { ...n, diskPath, rootName };
    } else if (n.node_type === 'slot' && n.slot_type) {
      // Asset-routing slot: tags the parent folder as the destination for this media type
      const parent = n.parent_id ? nodeMap[n.parent_id] : null;
      if (parent) slotFolders[n.slot_type] = parent.diskPath;
    } else if (n.node_type === 'asset' && n.asset_path) {
      if (!fs.existsSync(n.asset_path)) return;
      const parent = n.parent_id ? nodeMap[n.parent_id] : null;
      const binName = parent ? parent.rootName : '';
      const stat = fs.statSync(n.asset_path);
      if (stat.isDirectory()) {
        fs.readdirSync(n.asset_path).forEach(file => {
          const filePath = path.join(n.asset_path, file);
          if (fs.statSync(filePath).isFile()) assetsToImport.push({ sourcePath: filePath, binName });
        });
      } else {
        assetsToImport.push({ sourcePath: n.asset_path, binName });
      }
    }
  });

  // F-FTS-023: auto-assign slots to folders whose name strongly implies a media type
  // when the template didn't explicitly attach a slot node. Explicit slots always win.
  Object.values(nodeMap).forEach(folder => {
    const inferred = inferSlotType(folder.name);
    if (inferred && !slotFolders[inferred]) {
      slotFolders[inferred] = folder.diskPath;
    }
  });

  return { assetsToImport, slotFolders };
}

// Extracts type==='import' nodes from bins_json and expands folders to individual files.
// Returns array of { sourcePath, binName } ready for pendingProjectSetup.assets.
function extractPremiereImports(rawBins) {
  const imports = [];
  if (!rawBins || !rawBins.length) return imports;
  const binMap = {};
  rawBins.forEach(n => { if (n.type === 'bin') binMap[n.tempId] = n.name; });
  rawBins.filter(n => n.type === 'import' && n.file_path).forEach(n => {
    const binName = (n.parent_id != null ? binMap[n.parent_id] : null) || '';
    if (!fs.existsSync(n.file_path)) return;
    try {
      const stat = fs.statSync(n.file_path);
      if (stat.isDirectory()) {
        fs.readdirSync(n.file_path).forEach(file => {
          const fp = path.join(n.file_path, file);
          try { if (fs.statSync(fp).isFile()) imports.push({ sourcePath: fp, binName }); } catch (_) { }
        });
      } else {
        imports.push({ sourcePath: n.file_path, binName });
      }
    } catch (_) { }
  });
  return imports;
}

function convertWithFfmpeg(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    exec(`"${ffmpegPath}" -y -i "${inputPath}" "${outputPath}"`, (err) => {
      if (err) reject(new Error(`Format conversion failed: ${err.message}`));
      else resolve();
    });
  });
}

// IPC Handlers
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-config', () => {
  loadConfig();
  return appConfig;
});

ipcMain.handle('save-config', (event, config) => {
  saveConfig(config);
  return appConfig;
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Premiere Pro Projects', extensions: ['prproj'] }]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('create-project', async (event, projectData) => {
  builderLogger('🚀 --- PROJECT CREATION STARTED ---');
  builderLogger('Payload received:', projectData);
  const {
    clientName, clientInitials,
    funnelName, funnelInitials,
    taskName, taskInitials,
    projectName, targetDir, clientId, funnelId, taskId
  } = projectData;
  const task = (taskName || '').trim();
  const taskIni = (taskInitials || '').trim();

  if (!targetDir) {
    builderLogger('❌ Project creation failed: Target Directory is not configured');
    console.error('Project creation failed: Target Directory is not configured');
    throw new Error('Target Directory is not configured');
  }

  // Resolve template: funnel-level DB → client-level DB → global config → blank
  let resolvedTemplate = appConfig.templateFile || null;
  if (clientId || funnelId) {
    const dbTemplate = db.templatesApi.resolve(clientId || null, funnelId || null);
    if (dbTemplate && fs.existsSync(dbTemplate.file_path)) {
      resolvedTemplate = dbTemplate.file_path;
      builderLogger('Using DB template:', dbTemplate.name, dbTemplate.file_path);
    }
  }

  // Folder name uses FULL names: "Astro Arun Pandit - Mega Astrology Webinar - Ads Video - 001_HookA"
  // {Date}/{Month}/{Year}/{HH}/{MM}/{SS} in projectName are resolved to live values.
  const folderParts = [sanitizeName((clientName || clientInitials).trim()), sanitizeName(funnelName.trim())];
  if (task) folderParts.push(sanitizeName(task));
  folderParts.push(sanitizeName(resolveVars(projectName.trim())));
  const folderName = folderParts.join(' - ');

  // Date hierarchy: targetDir / {Month}{Year} / {DD} {Month} / projectFolder
  const _now = new Date();
  const _pad = n => String(n).padStart(2, '0');
  const _month = MONTH_NAMES[_now.getMonth()];
  const yearMonthDir = `${_month}${_now.getFullYear()}`;
  const dateDayDir = `${_pad(_now.getDate())} ${_month}`;
  const projectPath = path.join(resolveVars(targetDir), yearMonthDir, dateDayDir, folderName);
  builderLogger('Target project path resolved to:', projectPath);

  try {
    // Resolve folder template: assigned → default
    const folderTemplate = db.folderTemplatesApi.resolve(clientId || null, funnelId || null, taskId || null)
      || db.folderTemplatesApi.getDefault();

    // ── MODE B: Open Template Project directly ────────────────────────────────
    if (folderTemplate && folderTemplate.open_mode === 'open_template' && folderTemplate.prproj_path) {
      builderLogger('Mode B Selected: Opening Template Project directly');
      const tplPath = folderTemplate.prproj_path;
      builderLogger('Template path:', tplPath);
      if (!fs.existsSync(tplPath)) throw new Error('Template project file not found: ' + tplPath);

      shell.openPath(tplPath).then(err => { if (err) builderLogger('Shell openPath error:', err); });

      const rawBins = safeParseJson(folderTemplate.bins_json, []);
      builderLogger(`[Setup][ModeB] bins_json raw length: ${folderTemplate.bins_json ? folderTemplate.bins_json.length : 0} chars`);
      const { flatBins: tplBins, flatSeqs: tplSeqs } = flattenPremiereTree(rawBins, folderTemplate.sequences_json);
      const rootNames = db.folderTemplatesApi.getNodes(folderTemplate.id)
        .filter(n => n.node_type === 'folder' && n.parent_id === null)
        .map(n => n.name);
      const allBins = [...new Set([...rootNames, ...tplBins])];

      const premiereTree1 = Array.isArray(rawBins) && rawBins.length && typeof rawBins[0] === 'object' ? rawBins : [];
      const premiereImports1 = extractPremiereImports(rawBins);
      builderLogger(`[Setup][ModeB] pendingProjectSetup queued — premiereTree:${premiereTree1.length} bins(flat):${allBins.length} seqs:${tplSeqs.length}`);
      pendingProjectSetup = {
        projectPath: tplPath,
        bins: allBins,
        sequences: tplSeqs,
        premiereTree: premiereTree1,
        assets: premiereImports1
      };

      // Fix A: panel already connected + path already matches → dispatch without waiting
      const _normB = (p) => path.normalize(p.trim()).toLowerCase();
      if (isCepConnected && cepWs && cepWs.readyState === 1 &&
        activeProjectPath && _normB(activeProjectPath) === _normB(tplPath)) {
        builderLogger(`[Setup][ModeB] panel already holds this path — dispatching setup-project immediately`);
        try {
          cepWs.send(JSON.stringify({
            type: 'setup-project',
            bins: allBins,
            sequences: tplSeqs,
            premiereTree: premiereTree1,
            assets: premiereImports1,
            sequencePreset: '1920x1080_25fps'
          }));
          builderLogger(`[Setup][ModeB] setup-project dispatched successfully`);
        } catch (sendErr) {
          builderLogger(`[Setup][ModeB] immediate send failed: ${sendErr.message}`);
        }
        pendingProjectSetup = null;
      }

      if (mainWindow) mainWindow.hide();
      return { success: true, projectPath: tplPath, openedFile: tplPath, mode: 'open_template' };
    }

    // ── MODE A: Create new folder + project ───────────────────────────────────
    builderLogger('Mode A Selected: Creating new folder structure and project file');
    if (!fs.existsSync(projectPath)) {
      builderLogger('Creating directory:', projectPath);
      fs.mkdirSync(projectPath, { recursive: true });
    }

    let assetsToImport = [];

    let slotFolders = {};
    if (folderTemplate) {
      const nodes = db.folderTemplatesApi.getNodes(folderTemplate.id);
      ({ assetsToImport, slotFolders } = buildFolderTree(projectPath, nodes));
    } else {
      for (const sub of appConfig.folderStructure) {
        const subPath = path.join(projectPath, sub);
        if (!fs.existsSync(subPath)) fs.mkdirSync(subPath, { recursive: true });
      }
    }

    let openedFile = null;

    // Resolve .prproj source: folder template prproj → DB templates → global config → Fresh Project → blank
    let resolvedPrproj = (folderTemplate?.prproj_path && fs.existsSync(folderTemplate.prproj_path))
      ? folderTemplate.prproj_path : null;

    if (!resolvedPrproj && (clientId || funnelId)) {
      const dbTpl = db.templatesApi.resolve(clientId || null, funnelId || null);
      if (dbTpl && fs.existsSync(dbTpl.file_path)) resolvedPrproj = dbTpl.file_path;
    }
    if (!resolvedPrproj && resolvedTemplate && fs.existsSync(resolvedTemplate)) {
      resolvedPrproj = resolvedTemplate;
    }
    if (!resolvedPrproj) {
      const fresh = path.join(__dirname, 'Premiere Pro Utilities', 'Fresh Project Pr 2025.prproj');
      const blank = path.join(__dirname, 'blank_template.prproj');
      resolvedPrproj = fs.existsSync(fresh) ? fresh : (fs.existsSync(blank) ? blank : null);
    }

    const fileParts = [sanitizeName(clientName.trim()), sanitizeName(funnelName.trim())];
    if (task) fileParts.push(sanitizeName(task));
    fileParts.push(resolveVars(projectName.trim()));
    const baseFileName = fileParts.join(' - ');
    const prprojDestFolder = path.join(projectPath, '01_Project_Files');
    if (!fs.existsSync(prprojDestFolder)) fs.mkdirSync(prprojDestFolder, { recursive: true });
    // Find next available version — v01, v02, v03… Never overwrites an existing file.
    let vNum = 1;
    let destFileName = `${baseFileName}_v${String(vNum).padStart(3, '0')}.prproj`;
    while (fs.existsSync(path.join(prprojDestFolder, destFileName))) {
      if (vNum >= 999) break;
      vNum++;
      destFileName = `${baseFileName}_v${String(vNum).padStart(3, '0')}.prproj`;
    }
    const destPath = path.join(prprojDestFolder, destFileName);

    if (resolvedPrproj) {
      builderLogger(`Copying template PRPROJ from ${resolvedPrproj} to ${destPath}`);
      fs.copyFileSync(resolvedPrproj, destPath);
      openedFile = destPath;
      builderLogger('Copied template to:', destPath, `(version v${String(vNum).padStart(3, '0')})`);
    } else {
      builderLogger('No PRPROJ template resolved, openedFile remains null.');
    }

    // 4. Copy preset assets from DB (legacy — still copied to disk)
    if (clientId || funnelId) {
      const presets = db.assetsApi.getPresets(clientId || null, funnelId || null);
      for (const asset of presets) {
        if (!fs.existsSync(asset.file_path)) continue;
        const stat = fs.statSync(asset.file_path);
        if (stat.isDirectory()) {
          const destDir = path.join(projectPath, path.basename(asset.file_path));
          if (!fs.existsSync(destDir)) fs.cpSync(asset.file_path, destDir, { recursive: true });
        } else {
          const destFolder = getDestSubfolder(projectPath, path.extname(asset.file_path));
          if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });
          const destAssetPath = path.join(destFolder, path.basename(asset.file_path));
          if (!fs.existsSync(destAssetPath)) fs.copyFileSync(asset.file_path, destAssetPath);
        }
      }
    }

    // 5. Open project in Premiere Pro
    if (openedFile) {
      shell.openPath(openedFile).then((errMessage) => {
        if (errMessage) console.error('Error opening project file via shell:', errMessage);
      });

      const rawBins2 = folderTemplate ? safeParseJson(folderTemplate.bins_json, []) : [];
      const seqsJson2 = folderTemplate ? folderTemplate.sequences_json : null;
      builderLogger(`[Setup] ModeA bins_json raw length: ${folderTemplate?.bins_json ? folderTemplate.bins_json.length : 0} chars`);
      builderLogger(`[Setup] ModeA sequences_json raw length: ${folderTemplate?.sequences_json ? folderTemplate.sequences_json.length : 0} chars`);
      const { flatBins: tplBins, flatSeqs: tplSeqs } = flattenPremiereTree(rawBins2, seqsJson2);
      const rootNames = folderTemplate
        ? db.folderTemplatesApi.getNodes(folderTemplate.id)
          .filter(n => n.node_type === 'folder' && n.parent_id === null)
          .map(n => n.name)
        : [];
      const allBins = [...new Set([...rootNames, ...tplBins])];

      const premiereTree2 = Array.isArray(rawBins2) && rawBins2.length && typeof rawBins2[0] === 'object' ? rawBins2 : [];
      const premiereImports2 = extractPremiereImports(rawBins2);
      const allAssets = [...assetsToImport, ...premiereImports2];
      // dbg(`[Setup] pendingProjectSetup queued:`);
      // dbg(`        projectPath  : "${openedFile}"`);
      // dbg(`        premiereTree : ${premiereTree2.length} nodes`);
      // dbg(`        bins (flat)  : ${JSON.stringify(allBins)}`);
      // dbg(`        sequences    : ${JSON.stringify(tplSeqs)}`);
      pendingProjectSetup = {
        projectPath: openedFile,
        bins: allBins,
        sequences: tplSeqs,
        premiereTree: premiereTree2,
        assets: allAssets
      };

      // Fix A: panel already connected + path already matches → dispatch without waiting
      const _normA = (p) => path.normalize(p.trim()).toLowerCase();
      if (isCepConnected && cepWs && cepWs.readyState === 1 &&
        activeProjectPath && _normA(activeProjectPath) === _normA(openedFile)) {
        // dbg(`[Setup] panel already holds this path — dispatching immediately`);
        try {
          cepWs.send(JSON.stringify({
            type: 'setup-project',
            bins: allBins,
            sequences: tplSeqs,
            premiereTree: premiereTree2,
            assets: allAssets,
            sequencePreset: '1920x1080_25fps'
          }));
        } catch (sendErr) {
          dbg(`[Setup] immediate send failed: ${sendErr.message}`);
        }
        // dbg(`[Setup] setup-project sent (immediate)`);
        pendingProjectSetup = null;
      }
    }

    // 6. Write asset slot map — explicit folder+bin routing for drag-drop
    {
      const rawBinsForSlots = folderTemplate ? safeParseJson(folderTemplate.bins_json, []) : [];
      const slotBins = {};
      // (a) Explicit slot assignments on bins always win
      rawBinsForSlots.forEach(item => {
        if (item.slotType) slotBins[item.slotType] = item.name;
        if (item.slotTypes) item.slotTypes.forEach(t => slotBins[t] = item.name);
      });
      // (b) F-FTS-028: infer from bin names for any slot type still empty
      rawBinsForSlots.forEach(item => {
        if (item.type !== 'bin') return;
        const inferred = inferSlotType(item.name);
        if (inferred && !slotBins[inferred]) slotBins[inferred] = item.name;
      });
      const slotMap = {};
      ['video', 'audio', 'bgm', 'sfx', 'image'].forEach(type => {
        const entry = {};
        if (slotFolders[type]) entry.folder = slotFolders[type];
        if (slotBins[type]) entry.bin = slotBins[type];
        if (Object.keys(entry).length) slotMap[type] = entry;
      });
      if (Object.keys(slotMap).length) {
        fs.writeFileSync(path.join(projectPath, '_freexan_slot_map.json'), JSON.stringify(slotMap, null, 2), 'utf8');
        // dbg(`[Setup] slot map written: ${JSON.stringify(slotMap)}`);
      }
    }

    // 6b. Write linked folder ↔ bin manifest.
    // For each folder-template node with link_enabled=1 whose name also exists
    // as a Premiere bin, pair the disk folder path with the bin name.
    if (folderTemplate) {
      try {
        const nodes = db.folderTemplatesApi.getNodes(folderTemplate.id);
        const linkedFolderNodes = nodes.filter(n => n.node_type === 'folder' && n.link_enabled);
        // Rebuild disk paths the same way buildFolderTree did (so we match what's on disk).
        const diskByNodeId = {};
        nodes.forEach(n => {
          if (n.node_type !== 'folder') return;
          const parent = n.parent_id ? diskByNodeId[n.parent_id] : null;
          const parentPath = parent ? parent : projectPath;
          diskByNodeId[n.id] = path.join(parentPath, resolveVars(n.name));
        });
        // Compute the bin name set directly from the template's bins_json
        // (which is the source of truth — `allBins` higher up is scoped to the
        // `if (openedFile)` block above and not visible here).
        const rawBinsForLinks = safeParseJson(folderTemplate.bins_json, []);
        const binNameSet = new Set();
        rawBinsForLinks.forEach(b => {
          if (b && b.type === 'bin' && b.name) binNameSet.add(String(b.name).toLowerCase());
        });
        // Also include the top-level folder names that auto-promote to bins
        // (same logic as `rootNames` used to seed `allBins`).
        nodes.filter(n => n.node_type === 'folder' && n.parent_id === null)
          .forEach(n => binNameSet.add(String(resolveVars(n.name)).toLowerCase()));
        const links = [];
        linkedFolderNodes.forEach(n => {
          const resolvedName = resolveVars(n.name);
          if (!binNameSet.has(resolvedName.toLowerCase())) return; // no matching bin → skip
          const folderPath = diskByNodeId[n.id];
          if (!folderPath) return;
          const entry = { folderPath, binName: resolvedName };
          if (n.link_shortcut) entry.shortcut = String(n.link_shortcut);
          links.push(entry);
        });
        if (links.length) {
          fs.writeFileSync(path.join(projectPath, '_freexan_links.json'), JSON.stringify(links, null, 2), 'utf8');
          dbg(`[Setup] _freexan_links.json written with ${links.length} link(s)`);
        }
      } catch (e) {
        dbg(`[Setup] failed to write _freexan_links.json: ${e.message}`);
      }
    }

    // 7. Write README
    const readmeContent = `# Project Metadata: ${folderName}

- **Client Initials:** ${clientInitials}
- **Funnel Name:** ${funnelName}
- **Task:** ${task || '—'}
- **Project Name/Number:** ${projectName}
- **Created Date:** ${new Date().toLocaleDateString()}
- **Folder Path:** ${projectPath}

*Generated by freeXan — by BloomX.*
`;
    const readmePath = path.join(projectPath, 'README.md');
    if (!fs.existsSync(readmePath)) fs.writeFileSync(readmePath, readmeContent, 'utf8');

    if (mainWindow) mainWindow.hide();

    return { success: true, projectPath, openedFile };
  } catch (err) {
    console.error('Project creation failed with error:', err);
    throw err;
  }
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const webContents = event.sender;
  const win = BrowserWindow.fromWebContents(webContents);
  if (win) {
    win.setIgnoreMouseEvents(ignore, options);
  }
});

ipcMain.on('resize-overlay', (event, mode) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  // Compact: 56 px pill + 14 px padding each side = 84 px
  // Expanded: 216 px pill + 14 px padding each side = 244 px
  // Halo: 180×180 with pill recentred (8-bubble picker at radius 50, tight ring)
  let newW, newH;
  if (mode === 'halo') { newW = 180; newH = 180; }
  else if (mode === true || mode === 'expanded') { newW = 244; newH = 84; }
  else { newW = 84; newH = 84; }
  // Keep the pill visually anchored on screen across mode switches. Compact &
  // expanded put the pill at top-left (centre ≈ x+42, y+42); halo centres the
  // pill in the window (centre = x+90, y+90). Shift the window so the pill's
  // screen position doesn't jump.
  const [curX, curY] = win.getPosition();
  const [curW, curH] = win.getSize();
  const pillCx = curX + (curW === 180 && curH === 180 ? 90 : 42);
  const pillCy = curY + (curW === 180 && curH === 180 ? 90 : 42);
  const newOffX = (newW === 180 && newH === 180) ? 90 : 42;
  const newOffY = (newW === 180 && newH === 180) ? 90 : 42;
  const newX = Math.round(pillCx - newOffX);
  const newY = Math.round(pillCy - newOffY);
  win.setBounds({ x: newX, y: newY, width: newW, height: newH });

  // Halo mode: claim keyboard focus so number-key picks and clicks register
  // immediately. Without this, the first click typically just transfers focus
  // and is swallowed (Windows "first-click steals focus" pattern), and the
  // Premiere home-screen monitor may have popped the main window over.
  haloPickerActive = (mode === 'halo');
  if (mode === 'halo') {
    // Hide the main window if it's showing — it would steal focus and visually
    // dominate the small overlay picker.
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !userOpenedManually) {
      mainWindow.hide();
    }
    setTimeout(() => {
      try {
        win.focus();
        win.moveTop();
      } catch (_) {}
    }, 20);
  }
});

// ipcMain.on('resize-overlay', (event, expanded) => {
//   const webContents = event.sender;
//   const win = BrowserWindow.fromWebContents(webContents);
//   if (win) {
//     win.setSize(expanded ? 260 : 100, 100);
//   }
// });

ipcMain.on('move-overlay-window', (event, delta) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (!delta || typeof delta.deltaX !== 'number' || typeof delta.deltaY !== 'number') return;
  if (!Number.isFinite(delta.deltaX) || !Number.isFinite(delta.deltaY)) return;
  const [x, y] = win.getPosition();
  try {
    win.setPosition(Math.round(x + delta.deltaX), Math.round(y + delta.deltaY));
  } catch (e) { /* position out of bounds — ignore */ }
});

// Overlay logs forwarded into debug.log so they can be read without DevTools.
ipcMain.on('overlay-log', (event, msg) => {
  dbg(`[OVERLAY] ${msg}`);
});

ipcMain.on('request-status', () => {
  updateOverlayUI();
  // Re-push the cached link map: the overlay may have just loaded and missed
  // the original push that fired when `active_project` arrived from CEP.
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try {
      overlayWindow.webContents.send('overlay-link-map', currentLinkMap);
      dbg(`[LinkWatch] re-pushed link map on request-status (${currentLinkMap.length} link(s))`);
    } catch (e) {
      dbg(`[LinkWatch] re-push on request-status failed: ${e.message}`);
    }
  }
});

ipcMain.handle('import-dropped-files', async (event, filePaths, opts) => {
  dragDropLogger('--- DRAG N DROP INITIATED ---');
  dragDropLogger(`Files dropped: ${filePaths ? filePaths.length : 0}`, filePaths);
  if (opts) dragDropLogger('Options:', opts);

  // Halo route override: the overlay can pass a `routeToFolder` (and optionally
  // `moveSource`) to bypass slot mapping entirely and place the files straight
  // into a linked folder. The existing linkWatcher already watching that folder
  // picks them up and dispatches the Premiere import — so we just transfer and
  // return.
  if (opts && opts.routeToFolder) {
    const target = String(opts.routeToFolder);
    const moveMode = !!opts.moveSource;
    try {
      if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
      let count = 0;
      for (const src of (filePaths || [])) {
        if (!src || !fs.existsSync(src)) continue;
        const fileExt = path.extname(src);
        const baseName = path.basename(src, fileExt);
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
          const dest = path.join(target, path.basename(src));
          if (fs.existsSync(dest)) continue;       // skip if dir already there
          if (moveMode) moveFsItem(src, dest, true);
          else fs.cpSync(src, dest, { recursive: true });
        } else {
          let dest = path.join(target, path.basename(src));
          let counter = 1;
          while (fs.existsSync(dest)) {
            dest = path.join(target, `${baseName}_${counter}${fileExt}`);
            counter++;
          }
          if (moveMode) moveFsItem(src, dest, false);
          else fs.copyFileSync(src, dest);
        }
        count++;
      }
      dragDropLogger(`[IMPORT] halo route → ${moveMode ? 'moved' : 'copied'} ${count} file(s) to "${target}" (linkWatcher will pick up the rest)`);
      return { success: true, imported: false };
    } catch (err) {
      dragDropLogger(`[IMPORT] halo route failed: ${err.message}`);
      throw err;
    }
  }

  // Resolve the active project path — CEP takes priority, then native monitor
  const resolvedProjectPath = activeProjectPath || nativeProjectPath;

  if (!resolvedProjectPath) {
    throw new Error('No active Premiere Pro project detected. Open a project and try again.');
  }

  let projectFolder = path.dirname(resolvedProjectPath);
  const parentFolder = path.dirname(projectFolder);
  try {
    const parentContents = fs.readdirSync(parentFolder);
    const hasSubfolders = parentContents.some(f => {
      const lf = f.toLowerCase();
      return f.includes('02_') || f.includes('03_') || f.includes('04_') ||
        lf.includes('footage') || lf.includes('audio') || lf.includes('assets');
    });
    if (hasSubfolders) projectFolder = parentFolder;
  } catch (e) {
    console.warn('Failed checking parent subfolders, using project folder:', projectFolder);
  }

  // Option C: if the active .prproj is assigned to a file-type template (open_existing),
  // build a dated folder tree inside the Default Target Directory from Settings:
  // {targetDir}\June2026\02 June\Client - Funnel - Task - DD MM
  {
    const _normP = p => path.normalize(p || '').toLowerCase();
    const allTpls = db.folderTemplatesApi.getAll();
    const fileTpl = allTpls.find(t =>
      t.template_type === 'file' &&
      t.open_mode === 'open_existing' &&
      t.prproj_path &&
      _normP(t.prproj_path) === _normP(resolvedProjectPath)
    );
    if (fileTpl) {
      if (!appConfig.targetDir) {
        throw new Error('Default Target Directory is not set. Configure it in Settings before dropping files.');
      }
      const now = new Date();
      const DD = String(now.getDate()).padStart(2, '0');
      const MM = String(now.getMonth() + 1).padStart(2, '0');
      const monthYear = `${MONTH_NAMES[now.getMonth()]}${now.getFullYear()}`;
      const dayMonth = `${DD} ${MONTH_NAMES[now.getMonth()]}`;
      const nameParts = [fileTpl.client_name, fileTpl.funnel_name, fileTpl.task_name].filter(Boolean);
      const projectFolderName = nameParts.length
        ? `${nameParts.join(' - ')} - ${DD} ${MM}`
        : `${DD} ${MM}`;
      const todayBase = path.join(resolveVars(appConfig.targetDir), monthYear, dayMonth, projectFolderName);
      const todaySlotMapPath = path.join(todayBase, '_freexan_slot_map.json');
      if (!fs.existsSync(todaySlotMapPath)) {
        fs.mkdirSync(todayBase, { recursive: true });
        const nodes = db.folderTemplatesApi.getNodes(fileTpl.id);
        const { slotFolders } = buildFolderTree(todayBase, nodes);
        // Also derive bin names from the template's bins_json (same logic as create-project)
        const rawBinsForSlots = safeParseJson(fileTpl.bins_json || '[]', []);
        const optionCSlotBins = {};
        rawBinsForSlots.forEach(item => {
          if (item.slotType) optionCSlotBins[item.slotType] = item.name;
          if (item.slotTypes) item.slotTypes.forEach(t => { optionCSlotBins[t] = item.name; });
        });
        rawBinsForSlots.forEach(item => {
          if (item.type !== 'bin') return;
          const inferred = inferSlotType(item.name);
          if (inferred && !optionCSlotBins[inferred]) optionCSlotBins[inferred] = item.name;
        });
        const newSlotMap = {};
        ['video', 'audio', 'bgm', 'sfx', 'image'].forEach(type => {
          const entry = {};
          if (slotFolders[type]) entry.folder = slotFolders[type];
          if (optionCSlotBins[type]) entry.bin = optionCSlotBins[type];
          if (Object.keys(entry).length) newSlotMap[type] = entry;
        });
        if (Object.keys(newSlotMap).length) {
          fs.writeFileSync(todaySlotMapPath, JSON.stringify(newSlotMap, null, 2), 'utf8');
        }
        // Place a .lnk shortcut to the .prproj in the project-file subfolder (e.g. 01_Project_File)
        let shortcutDir = todayBase;
        try {
          for (const entry of fs.readdirSync(todayBase)) {
            const lower = entry.toLowerCase();
            if ((lower.includes('01') && lower.includes('project')) || lower.includes('project_file')) {
              const candidate = path.join(todayBase, entry);
              if (fs.statSync(candidate).isDirectory()) { shortcutDir = candidate; break; }
            }
          }
        } catch (e) { /* use todayBase */ }
        const shortcutPath = path.join(shortcutDir, path.basename(resolvedProjectPath, '.prproj') + '.lnk');
        try {
          shell.writeShortcutLink(shortcutPath, { target: resolvedProjectPath });
        } catch (lnkErr) {
          dbg(`[IMPORT] .lnk creation failed: ${lnkErr.message}`);
        }
      }
      projectFolder = todayBase;
      dbg(`[IMPORT] Option C: file-template "${fileTpl.name}" matched → todayBase="${todayBase}"`);
    }
  }

  // console.log('Target project root folder resolved to:', projectFolder);

  // Load explicit slot map once (written at project creation)
  let slotMap = null;
  const slotMapPath = path.join(projectFolder, '_freexan_slot_map.json');
  if (fs.existsSync(slotMapPath)) {
    try { slotMap = JSON.parse(fs.readFileSync(slotMapPath, 'utf8')); } catch (e) { /* fall through */ }
  }

  const _videoExts = ['.mp4', '.mov', '.mkv', '.avi', '.m4v', '.webm', '.raw', '.mxf', '.r3d', '.braw', '.arw', '.cr2', '.dng'];
  const _audioExts = ['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac', '.aif', '.aiff'];
  const _imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.psd', '.ai', '.eps', '.svg', '.tiff', '.bmp', '.pdf'];

  // ── IMPORT DEBUG ─────────────────────────────────────────────────────────────
  dbg(`[IMPORT] ─── Overlay drop received ───`);
  dbg(`[IMPORT] files         : ${JSON.stringify(filePaths)}`);
  dbg(`[IMPORT] projectFolder : "${projectFolder}"`);
  dbg(`[IMPORT] slotMap       : ${slotMap ? JSON.stringify(slotMap) : '(none)'}`);
  // ─────────────────────────────────────────────────────────────────────────────

  try {
    const toImport = [];
    for (const filePath of filePaths) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${path.basename(filePath)}`);
      }

      const fileExt = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath);
      const baseName = path.basename(filePath, fileExt);

      const fileType = _videoExts.includes(fileExt) ? 'video' : _audioExts.includes(fileExt) ? 'audio' : _imageExts.includes(fileExt) ? 'image' : null;
      const binName = (slotMap && fileType && slotMap[fileType]) ? (slotMap[fileType].bin || null) : null;

      dbg(`[IMPORT] ── File: ${fileName} ──`);
      dbg(`[IMPORT] fileType : ${fileType || '(unknown)'}`);
      dbg(`[IMPORT] binName  : ${binName ? '"' + binName + '"' : '(none — rootItem)'}`);
      dbg(`[IMPORT] source   : "${filePath}"`);

      // Transfer the file (copy by default, move if opts.moveSource is set —
      // typically when the overlay drop carried the Shift modifier).
      const moveMode = !!(opts && opts.moveSource);
      const srcStat = fs.statSync(filePath);
      let finalDestPath;
      if (srcStat.isDirectory()) {
        finalDestPath = path.join(projectFolder, fileName);
        if (!fs.existsSync(finalDestPath)) {
          if (moveMode) moveFsItem(filePath, finalDestPath, true);
          else fs.cpSync(filePath, finalDestPath, { recursive: true });
        }
      } else {
        const destFolder = getDestSubfolder(projectFolder, fileExt, slotMap);
        if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });
        finalDestPath = path.join(destFolder, fileName);
        let counter = 1;
        while (fs.existsSync(finalDestPath)) {
          finalDestPath = path.join(destFolder, `${baseName}_${counter}${fileExt}`);
          counter++;
        }
        if (moveMode) moveFsItem(filePath, finalDestPath, false);
        else fs.copyFileSync(filePath, finalDestPath);
      }

      dbg(`[IMPORT] finalDestPath : "${finalDestPath}"`);

      toImport.push({ filePath: finalDestPath, binName });
    }

    let importedIntoPremiere = false;
    if (wss && isCepConnected) {
      // F-OV-015: batch the drop so CEP can select all newly imported items together
      const batchId = 'b_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      const total = toImport.length;
      toImport.forEach((item, idx) => {
        wss.clients.forEach(client => {
          if (client.readyState !== 1) return;
          try {
            const msg = {
              type: 'import',
              filePath: item.filePath,
              binName: item.binName || null,
              batchId,
              batchIndex: idx,
              batchTotal: total,
              isLast: idx === total - 1
            };
            dbg(`[IMPORT] → WebSocket send: filePath="${item.filePath}" binName="${item.binName || 'null'}" (batch ${idx + 1}/${total})`);
            client.send(JSON.stringify(msg));
            importedIntoPremiere = true;
          } catch (sendErr) {
            dbg(`[IMPORT] WebSocket send failed: ${sendErr.message}`);
          }
        });
      });
    } else {
      dbg(`[IMPORT] CEP offline — cannot import`);
    }

    return { success: true, imported: importedIntoPremiere };
  } catch (err) {
    console.error('Failed to import dropped files:', err);
    throw err;
  }
});

ipcMain.handle('import-browser-image', async (event, url) => {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Only http and https image URLs are supported.');
  }

  const resolvedProjectPath = activeProjectPath || nativeProjectPath;
  if (!resolvedProjectPath) {
    throw new Error('No active Premiere Pro project detected. Open a project and try again.');
  }

  let projectFolder = path.dirname(resolvedProjectPath);
  const parentFolder = path.dirname(projectFolder);
  try {
    const parentContents = fs.readdirSync(parentFolder);
    const hasSubfolders = parentContents.some(f => {
      const lf = f.toLowerCase();
      return f.includes('02_') || f.includes('03_') || f.includes('04_') ||
        lf.includes('footage') || lf.includes('audio') || lf.includes('assets');
    });
    if (hasSubfolders) projectFolder = parentFolder;
  } catch (e) {
    console.warn('[BrowserImport] Failed checking parent subfolders, using project folder:', projectFolder);
  }

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: 52428800  // 50 MB cap
  });

  const contentType = (response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new Error('URL does not point to an image.');
  }

  const CONTENT_TYPE_EXT = {
    'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
    'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif',
    'image/heic': '.heic', 'image/heif': '.heif', 'image/svg+xml': '.svg',
    'image/tiff': '.tiff', 'image/bmp': '.bmp', 'image/x-bmp': '.bmp',
  };
  const CONVERT_TO_PNG = new Set(['.webp', '.avif', '.heic', '.heif']);

  // Derive filename and extension from URL; prefer Content-Type for extension
  const urlObj = new URL(url);
  let rawName = path.basename(urlObj.pathname).replace(/[?#].*$/, '').trim();
  if (!rawName || rawName === '/') rawName = `browser-import-${Date.now()}`;

  let ext = CONTENT_TYPE_EXT[contentType] || path.extname(rawName).toLowerCase() || '.jpg';
  const baseName = path.basename(rawName, path.extname(rawName)) || `browser-import-${Date.now()}`;

  // Write download to a temp file
  const tempPath = path.join(app.getPath('temp'), `freexan-${Date.now()}${ext}`);
  fs.writeFileSync(tempPath, Buffer.from(response.data));

  let sourcePath = tempPath;
  let finalExt = ext;

  // Convert unsupported formats to PNG
  if (CONVERT_TO_PNG.has(ext)) {
    const convertedPath = tempPath.replace(ext, '.png');
    try {
      await convertWithFfmpeg(tempPath, convertedPath);
    } finally {
      try { fs.unlinkSync(tempPath); } catch (_) { }
    }
    sourcePath = convertedPath;
    finalExt = '.png';
  }

  try {
    const destFolder = getDestSubfolder(projectFolder, finalExt);
    if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });

    let finalDestPath = path.join(destFolder, baseName + finalExt);
    let counter = 1;
    while (fs.existsSync(finalDestPath)) {
      finalDestPath = path.join(destFolder, `${baseName}_${counter}${finalExt}`);
      counter++;
    }

    fs.copyFileSync(sourcePath, finalDestPath);
    // console.log('[BrowserImport] Saved to:', finalDestPath);

    let importedIntoPremiere = false;
    if (wss && isCepConnected) {
      wss.clients.forEach(client => {
        if (client.readyState === 1) {
          try {
            client.send(JSON.stringify({ type: 'import', filePath: finalDestPath }));
            importedIntoPremiere = true;
          } catch (sendErr) {
            dbg(`[BrowserImport] WebSocket send failed: ${sendErr.message}`);
          }
        }
      });
    }

    return { success: true, imported: importedIntoPremiere };
  } finally {
    try { fs.unlinkSync(sourcePath); } catch (_) { }
  }
});

// ── Database IPC ─────────────────────────────────────────────────────────────

ipcMain.handle('db-get-clients', () => db.clientsApi.getAll());
ipcMain.handle('db-add-client', (_, name, initials) => db.clientsApi.add(name, initials));
ipcMain.handle('db-update-client', (_, id, name, initials) => { db.clientsApi.update(id, name, initials); });
ipcMain.handle('db-delete-client', (_, id) => { db.clientsApi.delete(id); });

ipcMain.handle('db-get-funnels', (_, clientId) => db.funnelsApi.getByClient(clientId));
ipcMain.handle('db-get-all-funnels', () => db.funnelsApi.getAll());
ipcMain.handle('db-add-funnel', (_, clientId, name, initials) => db.funnelsApi.add(clientId, name, initials));
ipcMain.handle('db-update-funnel', (_, id, clientId, name, initials) => { db.funnelsApi.update(id, clientId, name, initials); });
ipcMain.handle('db-funnel-conflict', (_, name, clientId, excludeId) => db.funnelsApi.scopeConflict(name, clientId, excludeId));
ipcMain.handle('db-delete-funnel', (_, id) => { db.funnelsApi.delete(id); });

ipcMain.handle('db-get-tasks', () => db.tasksApi.getAll());
ipcMain.handle('db-add-task', (_, name, initials) => db.tasksApi.add(name, initials));
ipcMain.handle('db-update-task', (_, id, name, initials) => { db.tasksApi.update(id, name, initials); });
ipcMain.handle('db-task-conflict', (_, name, excludeId) => db.tasksApi.nameConflict(name, excludeId));
ipcMain.handle('db-delete-task', (_, id) => { db.tasksApi.delete(id); });

ipcMain.handle('db-get-funnel-tasks', (_, clientId, funnelId) => db.tasksApi.getForFunnel(clientId, funnelId));
ipcMain.handle('db-set-funnel-tasks', (_, clientId, funnelId, taskIds) => { db.tasksApi.setForFunnel(clientId, funnelId, taskIds); });

ipcMain.handle('db-client-conflict', (_, name, excludeId) => db.clientsApi.nameConflict(name, excludeId));

ipcMain.handle('db-get-templates', () => db.templatesApi.getAll());
ipcMain.handle('db-add-template', (_, clientId, funnelId, name, filePath) => db.templatesApi.add(clientId, funnelId, name, filePath));
ipcMain.handle('db-delete-template', (_, id) => { db.templatesApi.delete(id); });

ipcMain.handle('db-get-assets', () => db.assetsApi.getAll());
ipcMain.handle('db-add-asset', (_, clientId, funnelId, name, filePath, category, tags) => db.assetsApi.add(clientId, funnelId, name, filePath, category, tags));
ipcMain.handle('db-update-asset', (_, id, name, filePath, clientId, funnelId) => { db.assetsApi.update(id, name, filePath, clientId, funnelId); });
ipcMain.handle('db-delete-asset', (_, id) => { db.assetsApi.delete(id); });

ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled) return null;
  return result.filePaths;
});

// ── Folder Template IPC ───────────────────────────────────────────────────────

ipcMain.handle('ft-get-all', () => db.folderTemplatesApi.getAll());
ipcMain.handle('ft-get-nodes', (_, id) => db.folderTemplatesApi.getNodes(id));
ipcMain.handle('ft-create', (_, name, prprojPath, mode, bins, seqs, templateType) => db.folderTemplatesApi.create(name, prprojPath, mode, bins, seqs, templateType));
ipcMain.handle('ft-update', (_, id, name, prprojPath, mode, bins, seqs, templateType) => { db.folderTemplatesApi.update(id, name, prprojPath, mode, bins, seqs, templateType); });
ipcMain.handle('ft-delete', (_, id) => { db.folderTemplatesApi.delete(id); });
ipcMain.handle('ft-set-default', (_, id) => { db.folderTemplatesApi.setDefault(id); });
ipcMain.handle('ft-set-nodes', (_, id, nodes) => { db.folderTemplatesApi.setNodes(id, nodes); });
ipcMain.handle('ft-get-assignments', (_, id) => db.folderTemplatesApi.getAssignments(id));
ipcMain.handle('ft-assign', (_, tId, cId, fId, taskId) => { db.folderTemplatesApi.assign(tId, cId, fId, taskId); });
ipcMain.handle('ft-unassign', (_, tId, cId, fId, taskId) => { db.folderTemplatesApi.unassign(tId, cId, fId, taskId); });
ipcMain.handle('ft-clone', (_, id) => db.folderTemplatesApi.clone(id));
ipcMain.handle('ft-get-default', () => db.folderTemplatesApi.getDefault());
ipcMain.handle('ft-select-asset', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

// ─────────────────────────────────────────────────────────────────────────────

ipcMain.on('log-from-preload', (event, data) => {
  console.log('LOG FROM PRELOAD:', data);
});

ipcMain.on('open-folder', (event, folderPath) => {
  shell.openPath(folderPath);
});

ipcMain.on('close-window', () => {
  if (mainWindow) {
    mainWindow.hide(); // Minimize/hide to system tray instead of destroying
  }
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('maximize-window', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});

// Single instance lock — quit immediately if another instance is already running
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// When a second launch is attempted, bring the existing window to focus
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  const startHidden = process.argv.includes('--hidden');
  const noPlugins = process.argv.includes('--no-plugins');

  loadConfig();
  enableCEPDebugging();
  
  if (!noPlugins) {
    installCEPExtension();
  }
  
  startWebSocketServer();
  createWindow();
  createOverlayWindow();
  createTray();
  startPremiereMonitor();

  // HTTP door for CLI + MCP tools (localhost only, port 4555)
  httpApi.startHttpApi({
    db,
    shell,
    appConfig,
    appVersion: app.getVersion(),
    getStatus: () => ({
      running: true,
      appVersion: app.getVersion(),
      cepConnected: isCepConnected,
      activeProject: activeProjectPath || null,
      nativeProject: nativeProjectPath || null,
      projectName: (() => {
        const p = activeProjectPath || nativeProjectPath;
        return p ? path.basename(p, path.extname(p)) : null;
      })(),
      targetDir: appConfig.targetDir || null
    }),
    invokeHandler: httpApi.invokeIpcHandler
  });

  // Initialize Audio Watchers
  audioWatcher.initWatchers((change) => {
    if (isCepConnected && cepWs && cepWs.readyState === 1) {
      cepWs.send(JSON.stringify({ type: 'audio_library_changed', change }));
    }
  });

  // Initialize MOGRT Watchers
  mogrtWatcher.initWatchers((change) => {
    broadcastMogrtChange(change);
  });

  // Ensure startup entry is always registered (covers manual installs / dev runs).
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
    args: ['--hidden']
  });

  if (startHidden) {
    // Launched at system boot — stay in tray, don't show the window.
    return;
  }

  // Normal launch: show window if Premiere is not already open.
  const checkInitialCommand = `powershell -NoProfile -Command "Get-Process | Where-Object { $_.ProcessName -eq 'Adobe Premiere Pro' }"`;
  exec(checkInitialCommand, (err, stdout) => {
    if (err || !stdout.trim()) {
      if (mainWindow) mainWindow.show();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Re-assert overlay z-level when any window gains focus — Windows can silently
  // drop alwaysOnTop after screenshot tools or system overlays release the desktop.
  app.on('browser-window-focus', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  });
});

app.on('window-all-closed', () => {
  // On Windows, the app stays active in the system tray
  if (process.platform !== 'darwin') {
    // If we want it to close only on quit, we don't call app.quit() here
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  audioWatcher.stopAll();
  mogrtWatcher.stopAll();
  httpApi.stopHttpApi();
});

// ── Audio Library IPC ─────────────────────────────────────────────────────────
ipcMain.handle('db-get-watched-folders', () => audioDb.foldersApi.getAll());
ipcMain.handle('db-add-watched-folder', async (event, folderPath) => {
  const id = audioDb.foldersApi.add(folderPath);
  if (id) {
    audioWatcher.watchDirectory(id, folderPath, (change) => {
      if (isCepConnected && cepWs && cepWs.readyState === 1) {
        cepWs.send(JSON.stringify({ type: 'audio_library_changed', change }));
      }
    });
  }
  return id;
});
ipcMain.handle('db-delete-watched-folder', (_, id) => {
  audioWatcher.stopWatching(id);
  audioDb.foldersApi.delete(id);
});
ipcMain.handle('db-select-audio-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

// ── MOGRT Library IPC ─────────────────────────────────────────────────────────
ipcMain.handle('mogrt-get-watched-folders', () => mogrtDb.foldersApi.getAll());
ipcMain.handle('mogrt-add-folder', async (event, folderPath) => {
  const id = mogrtDb.foldersApi.add(folderPath);
  if (id) {
    mogrtWatcher.watchDirectory(id, folderPath, (change) => {
      broadcastMogrtChange(change);
    });
  }
  return id;
});
ipcMain.handle('mogrt-delete-folder', (_, id) => {
  mogrtWatcher.stopWatching(id);
  mogrtDb.foldersApi.delete(id);
});
ipcMain.handle('mogrt-select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select MOGRT Folder'
  });
  return result.canceled ? null : result.filePaths[0];
});

// ── Multi-File Logging IPC ───────────────────────────────────────────────────
ipcMain.on('write-log', (event, { component, msg }) => {
  const { createLogger } = require('./logger');
  const log = createLogger(component);
  log(msg);
});
