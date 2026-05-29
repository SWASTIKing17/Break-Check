const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { WebSocketServer } = require('ws');
const db = require('./db');
const axios = require('axios');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

const EXPECTED_EXT_VERSION = '1.9.9'; // Must match EXT_VERSION in cep-extension/ext.js

// ── Debug Logger ─────────────────────────────────────────────────────────────
// Writes timestamped entries to %APPDATA%/freeXan/debug.log
// Open this file in Notepad while the app is running to watch logs live.
let debugLogPath = null;
function dbg(...args) {
  const line = '[' + new Date().toISOString() + '] ' + args.join(' ');
  console.log(line);
  try {
    if (!debugLogPath) {
      const logDir = path.join(app.getPath('userData'));
      debugLogPath = path.join(logDir, 'debug.log');
    }
    fs.appendFileSync(debugLogPath, line + '\n', 'utf8');
  } catch (e) { /* never crash the app over logging */ }
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Date/Time Variable Resolver ───────────────────────────────────────────────
// Replaces {Year} {Month} {Date} {HH} {MM} {SS} with current date/time values.
// Called on project names, folder node names, and targetDir before path ops.
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function resolveVars(str) {
  if (!str) return str;
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return String(str)
    .replace(/\{Year\}/gi,  now.getFullYear())
    .replace(/\{Month\}/gi, MONTH_NAMES[now.getMonth()])
    .replace(/\{Date\}/gi,  pad(now.getDate()))
    .replace(/\{HH\}/gi,    pad(now.getHours()))
    .replace(/\{MM\}/gi,    pad(now.getMinutes()))
    .replace(/\{SS\}/gi,    pad(now.getSeconds()));
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
let configPath = path.join(app.getPath('userData'), 'config.json');

// Default configuration
let appConfig = {
  targetDir: '',
  templateFile: '',
  folderStructure: ['01_Project_Files', '02_Footage', '03_Audio', '04_Assets', '05_Exports'],
  autoPopup: true,
  defaultBins: ['Footage', 'Audio', 'Graphics', 'Exports'],
  defaultSequences: ['Main Sequence'],
  seqResolution: '1920x1080',
  seqFps: '25'
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
  tray = new Tray(fs.existsSync(iconPath) ? iconPath : path.join(__dirname, 'renderer', 'index.html')); // fallback
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

function startPremiereMonitor() {
  setInterval(() => {
    // Use a script file approach to avoid $_ escaping issues in exec()
    const psCommand = `powershell -NoProfile -Command "$p = Get-Process -Name 'Adobe Premiere Pro' -ErrorAction SilentlyContinue; if ($p) { $p.MainWindowTitle } else { '' }"`;

    exec(psCommand, (err, stdout) => {
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
        if (appConfig.autoPopup && mainWindow && !mainWindow.isDestroyed()) {
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
  const csxsVersions = ['9', '10', '11', '12'];
  csxsVersions.forEach(v => {
    const cmd = `reg add "HKCU\\Software\\Adobe\\CSXS.${v}" /v PlayerDebugMode /t REG_SZ /d 1 /f`;
    exec(cmd, (err) => {
      if (err) console.error(`Error setting PlayerDebugMode for CSXS.${v}:`, err);
    });
  });
}

function installCEPExtension() {
  const cepExtensionsRoot = path.join(app.getPath('appData'), 'Adobe', 'CEP', 'extensions');
  const cepTargetDir = path.join(cepExtensionsRoot, 'freexan-link');
  const cepSourceDir = path.join(__dirname, 'cep-extension');

  // Remove stale legacy installations that share the WebSocket port and would
  // shadow the current panel. These are leftovers from the pre-freeXan rename
  // (Project Builder Link → freeXan). If left in place, Premiere loads BOTH
  // panels, the legacy one connects first, and the new panel never runs.
  const legacyFolders = ['project-builder-link', 'projectbuilder-link', 'project_builder_link'];
  for (const folder of legacyFolders) {
    const legacyPath = path.join(cepExtensionsRoot, folder);
    if (fs.existsSync(legacyPath)) {
      try {
        fs.rmSync(legacyPath, { recursive: true, force: true });
        console.log('Removed legacy CEP extension:', legacyPath);
      } catch (err) {
        console.warn('Could not remove legacy CEP extension at', legacyPath, '-', err.message);
      }
    }
  }

  console.log('Installing Premiere Pro CEP auto-import extension to:', cepTargetDir);

  try {
    const copyDir = (src, dest) => {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      const files = fs.readdirSync(src);
      files.forEach(file => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        if (fs.statSync(srcPath).isDirectory()) {
          copyDir(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      });
    };

    if (fs.existsSync(cepSourceDir)) {
      copyDir(cepSourceDir, cepTargetDir);
      console.log('CEP extension installed successfully.');
    } else {
      console.warn('Source CEP extension directory not found at:', cepSourceDir);
    }
  } catch (err) {
    console.error('Failed to install CEP extension:', err);
  }
}

function startWebSocketServer() {
  console.log('Starting local WebSocket server on port 4554...');
  wss = new WebSocketServer({ port: 4554 });

  wss.on('connection', (ws) => {
    // dbg(`[CEP] Panel connected`);
    isCepConnected = true;
    cepWs = ws;
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
                ws.send(JSON.stringify({
                  type: 'setup-project',
                  bins: bins,
                  sequences: seqs,
                  premiereTree: tree,
                  assets: snapshot.assets || [],
                  sequencePreset: `${appConfig.seqResolution || '1920x1080'}_${appConfig.seqFps || '25'}fps`
                }));
                // dbg(`[Setup] setup-project sent (fallback)`);
                pendingProjectSetup = null;
              }, 8000);
            }
          }

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
                  sequencePreset: `${appConfig.seqResolution || '1920x1080'}_${appConfig.seqFps || '25'}fps`
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
          // Log forwarded from the CEP panel — written to debug.log alongside main-process logs
          dbg(`[EXT] ${data.msg}`);

        } else if (data.type === 'import_result') {
          // dbg(`[CEP] import_result for "${data.filePath}": ${data.result}`);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    });

    ws.on('close', () => {
      // dbg(`[CEP] Panel disconnected`);
      isCepConnected = false;
      cepWs = null;
      activeProjectPath = '';
      updateOverlayUI();
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

  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function getDestSubfolder(projectFolder, fileExt, slotMap) {
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
      const fileType = videoExts.includes(ext) ? 'video' : audioExts.includes(ext) ? 'audio' : imageExts.includes(ext) ? 'image' : null;
      if (fileType && slotMap[fileType] && slotMap[fileType].folder && fs.existsSync(slotMap[fileType].folder)) {
        return slotMap[fileType].folder;
      }
    }

    let folderType = 'Assets';
    if (videoExts.includes(ext)) {
      folderType = 'footage';
    } else if (audioExts.includes(ext)) {
      folderType = 'audio';
    } else if (imageExts.includes(ext)) {
      folderType = 'assets';
    }

    // Find folder matching the keywords
    let matchedFolder = folders.find(f => {
      const lf = f.toLowerCase();
      if (folderType === 'footage') return lf.includes('footage') || lf.includes('video') || lf.includes('raw');
      if (folderType === 'audio') return lf.includes('audio') || lf.includes('music') || lf.includes('sound') || lf.includes('voice');
      if (folderType === 'assets') return lf.includes('assets') || lf.includes('graphics') || lf.includes('images') || lf.includes('photos') || lf.includes('design');
      return false;
    });

    // Fallback search for numbers if keyword match fails
    if (!matchedFolder) {
      if (folderType === 'footage') matchedFolder = folders.find(f => f.includes('02'));
      else if (folderType === 'audio') matchedFolder = folders.find(f => f.includes('03'));
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
    const seqs = JSON.parse(sequencesJson || '[]');
    return { flatBins: [], flatSeqs: Array.isArray(seqs) && seqs.length && typeof seqs[0] === 'string' ? seqs : seqs.map(s => s.name || s) };
  }
  if (typeof rawBins[0] === 'string') {
    const seqs = JSON.parse(sequencesJson || '[]');
    return { flatBins: rawBins, flatSeqs: Array.isArray(seqs) ? seqs : [] };
  }
  // New tree format — flatten bin names and sequence names
  const flatBins = rawBins.filter(n => n.type === 'bin').map(n => n.name);
  const flatSeqs = rawBins.filter(n => n.type === 'sequence').map(n => n.name);
  return { flatBins, flatSeqs };
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
          try { if (fs.statSync(fp).isFile()) imports.push({ sourcePath: fp, binName }); } catch (_) {}
        });
      } else {
        imports.push({ sourcePath: n.file_path, binName });
      }
    } catch (_) {}
  });
  return imports;
}

function convertWithFfmpeg(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    exec(`"${ffmpegInstaller.path}" -y -i "${inputPath}" "${outputPath}"`, (err) => {
      if (err) reject(new Error(`Format conversion failed: ${err.message}`));
      else resolve();
    });
  });
}

// IPC Handlers
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
  // console.log('create-project invoked with data:', projectData);
  const {
    clientName, clientInitials,
    funnelName, funnelInitials,
    taskName, taskInitials,
    projectName, targetDir, clientId, funnelId, taskId
  } = projectData;
  const task = (taskName || '').trim();
  const taskIni = (taskInitials || '').trim();

  if (!targetDir) {
    console.error('Project creation failed: Target Directory is not configured');
    throw new Error('Target Directory is not configured');
  }

  // Resolve template: funnel-level DB → client-level DB → global config → blank
  let resolvedTemplate = appConfig.templateFile || null;
  if (clientId || funnelId) {
    const dbTemplate = db.templatesApi.resolve(clientId || null, funnelId || null);
    if (dbTemplate && fs.existsSync(dbTemplate.file_path)) {
      resolvedTemplate = dbTemplate.file_path;
      // console.log('Using DB template:', dbTemplate.name, dbTemplate.file_path);
    }
  }

  // Folder name uses FULL names: "Astro Arun Pandit - Mega Astrology Webinar - Ads Video - 001_HookA"
  // {Date}/{Month}/{Year}/{HH}/{MM}/{SS} in projectName are resolved to live values.
  const folderParts = [(clientName || clientInitials).trim(), funnelName.trim()];
  if (task) folderParts.push(task);
  folderParts.push(resolveVars(projectName.trim()));
  const folderName = folderParts.join(' - ');

  // Date hierarchy: targetDir / {Month}{Year} / {DD} {Month} / projectFolder
  const _now = new Date();
  const _pad = n => String(n).padStart(2, '0');
  const _month = MONTH_NAMES[_now.getMonth()];
  const yearMonthDir = `${_month}${_now.getFullYear()}`;
  const dateDayDir   = `${_pad(_now.getDate())} ${_month}`;
  const projectPath  = path.join(resolveVars(targetDir), yearMonthDir, dateDayDir, folderName);
  // console.log('Target project path:', projectPath);

  try {
    // Resolve folder template: assigned → default
    const folderTemplate = db.folderTemplatesApi.resolve(clientId || null, funnelId || null, taskId || null)
      || db.folderTemplatesApi.getDefault();

    // ── MODE B: Open Template Project directly ────────────────────────────────
    if (folderTemplate && folderTemplate.open_mode === 'open_template' && folderTemplate.prproj_path) {
      const tplPath = folderTemplate.prproj_path;
      if (!fs.existsSync(tplPath)) throw new Error('Template project file not found: ' + tplPath);

      shell.openPath(tplPath).then(err => { if (err) console.error(err); });

      const rawBins = JSON.parse(folderTemplate.bins_json || '[]');
      // dbg(`[Setup][ModeB] bins_json raw (first 200 chars): "${(folderTemplate.bins_json || '[]').slice(0, 200)}"`);
      const { flatBins: tplBins, flatSeqs: tplSeqs } = flattenPremiereTree(rawBins, folderTemplate.sequences_json);
      const rootNames = db.folderTemplatesApi.getNodes(folderTemplate.id)
        .filter(n => n.node_type === 'folder' && n.parent_id === null)
        .map(n => n.name);
      const allBins = [...new Set([...rootNames, ...tplBins])];

      const premiereTree1 = Array.isArray(rawBins) && rawBins.length && typeof rawBins[0] === 'object' ? rawBins : [];
      const premiereImports1 = extractPremiereImports(rawBins);
      // dbg(`[Setup][ModeB] pendingProjectSetup queued — premiereTree:${premiereTree1.length} bins(flat):${allBins.length} seqs:${tplSeqs.length}`);
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
        // dbg(`[Setup][ModeB] panel already holds this path — dispatching immediately`);
        cepWs.send(JSON.stringify({
          type: 'setup-project',
          bins: allBins,
          sequences: tplSeqs,
          premiereTree: premiereTree1,
          assets: premiereImports1,
          sequencePreset: `${appConfig.seqResolution || '1920x1080'}_${appConfig.seqFps || '25'}fps`
        }));
        // dbg(`[Setup][ModeB] setup-project sent (immediate)`);
        pendingProjectSetup = null;
      }

      if (mainWindow) mainWindow.hide();
      return { success: true, projectPath: tplPath, openedFile: tplPath, mode: 'open_template' };
    }

    // ── MODE A: Create new folder + project ───────────────────────────────────
    if (!fs.existsSync(projectPath)) fs.mkdirSync(projectPath, { recursive: true });

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

    const fileParts = [clientInitials.trim(), (funnelInitials || funnelName).trim()];
    if (taskIni) fileParts.push(taskIni);
    else if (task) fileParts.push(task);
    fileParts.push(resolveVars(projectName.trim()));
    const baseFileName = fileParts.join('_');
    const prprojDestFolder = path.join(projectPath, '01_Project_Files');
    if (!fs.existsSync(prprojDestFolder)) fs.mkdirSync(prprojDestFolder, { recursive: true });
    // Find next available version — v01, v02, v03… Never overwrites an existing file.
    let vNum = 1;
    let destFileName = `${baseFileName}_v${String(vNum).padStart(2, '0')}.prproj`;
    while (fs.existsSync(path.join(prprojDestFolder, destFileName))) {
      vNum++;
      destFileName = `${baseFileName}_v${String(vNum).padStart(2, '0')}.prproj`;
    }
    const destPath = path.join(prprojDestFolder, destFileName);

    if (resolvedPrproj) {
      fs.copyFileSync(resolvedPrproj, destPath);
      openedFile = destPath;
      // console.log('Copied template to:', destPath, `(version v${String(vNum).padStart(2, '0')})`);
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

      const rawBins2 = folderTemplate ? JSON.parse(folderTemplate.bins_json || '[]') : [];
      const seqsJson2 = folderTemplate ? folderTemplate.sequences_json : null;
      // dbg(`[Setup] bins_json raw (first 200 chars): "${(folderTemplate?.bins_json || '[]').slice(0, 200)}"`);
      // dbg(`[Setup] sequences_json raw: "${folderTemplate?.sequences_json || '[]'}"`);
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
        cepWs.send(JSON.stringify({
          type: 'setup-project',
          bins: allBins,
          sequences: tplSeqs,
          premiereTree: premiereTree2,
          assets: allAssets,
          sequencePreset: `${appConfig.seqResolution || '1920x1080'}_${appConfig.seqFps || '25'}fps`
        }));
        // dbg(`[Setup] setup-project sent (immediate)`);
        pendingProjectSetup = null;
      }
    }

    // 6. Write asset slot map — explicit folder+bin routing for drag-drop
    {
      const rawBinsForSlots = folderTemplate ? JSON.parse(folderTemplate.bins_json || '[]') : [];
      const slotBins = {};
      rawBinsForSlots.forEach(item => { if (item.slotType) slotBins[item.slotType] = item.name; });
      const slotMap = {};
      ['video', 'audio', 'image'].forEach(type => {
        const entry = {};
        if (slotFolders[type]) entry.folder = slotFolders[type];
        if (slotBins[type])   entry.bin    = slotBins[type];
        if (Object.keys(entry).length) slotMap[type] = entry;
      });
      if (Object.keys(slotMap).length) {
        fs.writeFileSync(path.join(projectPath, '_freexan_slot_map.json'), JSON.stringify(slotMap, null, 2), 'utf8');
        // dbg(`[Setup] slot map written: ${JSON.stringify(slotMap)}`);
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

ipcMain.on('resize-overlay', (event, expanded) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  // Compact: 56px pill + 14px padding each side = 84px
  // Expanded: 216px pill + 14px padding each side = 244px
  win.setSize(expanded ? 244 : 84, 84);
});

ipcMain.on('resize-overlay', (event, expanded) => {
  const webContents = event.sender;
  const win = BrowserWindow.fromWebContents(webContents);
  if (win) {
    win.setSize(expanded ? 260 : 100, 100);
  }
});

ipcMain.on('move-overlay-window', (event, delta) => {
  const webContents = event.sender;
  const win = BrowserWindow.fromWebContents(webContents);
  if (win) {
    const [x, y] = win.getPosition();
    win.setPosition(x + delta.deltaX, y + delta.deltaY);
  }
});

ipcMain.on('request-status', () => {
  updateOverlayUI();
});

ipcMain.handle('import-dropped-files', async (event, filePaths) => {
  // console.log('import-dropped-files invoked for:', filePaths);

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

      const fileExt  = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath);
      const baseName = path.basename(filePath, fileExt);

      const fileType = _videoExts.includes(fileExt) ? 'video' : _audioExts.includes(fileExt) ? 'audio' : _imageExts.includes(fileExt) ? 'image' : null;
      const binName  = (slotMap && fileType && slotMap[fileType]) ? (slotMap[fileType].bin || null) : null;

      dbg(`[IMPORT] ── File: ${fileName} ──`);
      dbg(`[IMPORT] fileType : ${fileType || '(unknown)'}`);
      dbg(`[IMPORT] binName  : ${binName ? '"' + binName + '"' : '(none — rootItem)'}`);
      dbg(`[IMPORT] source   : "${filePath}"`);

      // Copy into the project folder (file or folder)
      const srcStat = fs.statSync(filePath);
      let finalDestPath;
      if (srcStat.isDirectory()) {
        finalDestPath = path.join(projectFolder, fileName);
        if (!fs.existsSync(finalDestPath)) fs.cpSync(filePath, finalDestPath, { recursive: true });
      } else {
        const destFolder = getDestSubfolder(projectFolder, fileExt, slotMap);
        if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });
        finalDestPath = path.join(destFolder, fileName);
        let counter = 1;
        while (fs.existsSync(finalDestPath)) {
          finalDestPath = path.join(destFolder, `${baseName}_${counter}${fileExt}`);
          counter++;
        }
        fs.copyFileSync(filePath, finalDestPath);
      }

      dbg(`[IMPORT] finalDestPath : "${finalDestPath}"`);

      toImport.push({ filePath: finalDestPath, binName });
    }

    let importedIntoPremiere = false;
    if (wss && isCepConnected) {
      for (const { filePath, binName } of toImport) {
        wss.clients.forEach(client => {
          if (client.readyState === 1) {
            dbg(`[IMPORT] → WebSocket send: filePath="${filePath}" binName="${binName || 'null'}"`);
            client.send(JSON.stringify({ type: 'import', filePath, binName: binName || null }));
            importedIntoPremiere = true;
          }
        });
      }
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
          client.send(JSON.stringify({ type: 'import', filePath: finalDestPath }));
          importedIntoPremiere = true;
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
ipcMain.handle('ft-create', (_, name, prprojPath, mode, bins, seqs) => db.folderTemplatesApi.create(name, prprojPath, mode, bins, seqs));
ipcMain.handle('ft-update', (_, id, name, prprojPath, mode, bins, seqs) => { db.folderTemplatesApi.update(id, name, prprojPath, mode, bins, seqs); });
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

// App lifecycle
app.whenReady().then(() => {
  const startHidden = process.argv.includes('--hidden');

  loadConfig();
  enableCEPDebugging();
  installCEPExtension();
  startWebSocketServer();
  createWindow();
  createOverlayWindow();
  createTray();
  startPremiereMonitor();

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
});

app.on('window-all-closed', () => {
  // On Windows, the app stays active in the system tray
  if (process.platform !== 'darwin') {
    // If we want it to close only on quit, we don't call app.quit() here
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
