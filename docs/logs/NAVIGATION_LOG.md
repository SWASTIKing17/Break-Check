# NAVIGATION LOG — freeXan by BloomX

**Purpose:** Map for agents, developers, and non-coder users.  
Use this file to find: which file does what, which function controls which feature.  
**Version:** v1.2.0 | **Last Updated:** 2026-05-25

---

## Quick Index

| I want to change… | Go to file |
|---|---|
| How projects are created (folders, template, open Premiere) | `main.js` → `create-project` handler |
| The Builder form (dropdowns, live preview, submit) | `renderer/app.js` → Builder section |
| The floating drag-drop overlay appearance | `renderer/overlay.html`, `renderer/overlay.css` |
| The drag-drop file sorting logic | `main.js` → `import-dropped-files` handler |
| How files get imported into Premiere | `cep-extension/hostscript.jsx` → `importAsset()` |
| The CEP panel UI inside Premiere | `cep-extension/panel.html` |
| WebSocket messages between app and Premiere | `main.js` → WebSocket server, `cep-extension/ext.js` |
| Database tables / schema | `db.js` |
| Seeded clients list | `scripts/seed-db.js` |
| Settings (target dir, template, folder structure) | `renderer/app.js` → Settings section, `main.js` → `save-config`/`get-config` |
| UI theme colors, layout | `renderer/styles.css` |
| App startup, tray, CEP install | `main.js` → `app.whenReady()` |
| NSIS installer customization | `build/installer.nsh`, `electron-builder.yml` |
| Brand colors, logo, tone of voice | `Brand Guidelines/free_xan_complete_brand_guidelines.md` |

---

## File Map

---

### `main.js` — Electron Main Process

**What it does:** The brain of the app. Manages app lifecycle, all IPC communication, the WebSocket server, Premiere detection, project creation pipeline, file import routing, and window management.

**Line Ranges (approximate):**
| Lines | What's there |
|---|---|
| 1–50 | Imports, global state variables (`activeProjectPath`, `wsClients`, config defaults) |
| 51–120 | Config load/save helpers (`loadConfig`, `saveConfig`) |
| 121–200 | Window creation (`createMainWindow`, `createOverlayWindow`) |
| 201–280 | System tray setup, startup registry, CEP extension install |
| 281–360 | WebSocket server setup (port 4554), message routing |
| 361–430 | PowerShell Premiere window monitor (polls every 2.5s) |
| 431–520 | `create-project` IPC handler — folder mkdir, template copy, asset import, shell.openPath |
| 521–580 | `import-dropped-files` IPC handler — file type detection, copy to subfolder, WS broadcast |
| 581–650 | Database IPC handlers (`db-get-clients`, `db-add-client`, etc.) |
| 651–715 | Window control IPC (`close-window`, `minimize-window`, `open-folder`, `resize-overlay`, `move-overlay-window`) |

**Key functions / handlers:**

| Function / IPC Channel | What it does |
|---|---|
| `loadConfig()` | Reads `config.json` from AppData, merges with defaults |
| `saveConfig(data)` | Writes config JSON to AppData |
| `createMainWindow()` | Creates frameless 800×600 main window, loads `renderer/index.html` |
| `createOverlayWindow()` | Creates always-on-top 56×56 overlay pill, loads `renderer/overlay.html` |
| WebSocket `wss` server | Listens on port 4554; routes messages from CEP panel; broadcasts to overlay |
| PowerShell poll (setInterval 2500ms) | Reads Premiere window title; extracts active `.prproj` path |
| `ipcMain.handle('create-project')` | Full project creation: mkdirs → copy template → copy preset assets → open in Premiere |
| `ipcMain.handle('import-dropped-files')` | Classifies files (video/audio/image/other) → copies to correct subfolder → WS broadcast |
| `ipcMain.handle('save-config')` | Saves settings to config.json |
| `ipcMain.handle('get-config')` | Returns current config to renderer |
| `ipcMain.handle('select-directory')` | Opens native folder picker dialog |
| `ipcMain.handle('select-file')` | Opens native file picker dialog |
| `ipcMain.handle('db-*')` | All database CRUD operations (delegates to `db.js` functions) |
| `ipcMain.handle('resize-overlay')` | Changes overlay window height (56px ↔ 84px) |
| `ipcMain.handle('move-overlay-window')` | Repositions overlay by pixel delta |
| `ipcMain.handle('set-ignore-mouse-events')` | Toggles overlay mouse passthrough |
| `ipcMain.handle('overlay-update')` | Pushes project name + WS connection state to overlay |

---

### `preload.js` — IPC Security Bridge

**What it does:** Runs in an isolated context between the renderer and main process. Exposes a safe `window.api` object so renderer JS can call IPC without accessing Node.js directly. Also captures file drag-over events.

| Function | What it does |
|---|---|
| `window.api.send(channel, data)` | One-way IPC to main (fire and forget) |
| `window.api.invoke(channel, data)` | Two-way IPC to main (returns a Promise) |
| `window.api.on(channel, callback)` | Listen for messages pushed from main |
| Drag-over listener | Intercepts `dragover` events and extracts file paths via `webUtils.getPathForFile()` |

---

### `db.js` — SQLite Database Layer

**What it does:** All database operations. Initializes the SQLite file, creates tables, runs migrations, and exports functions for every CRUD operation the app needs.

**Database file:** `%APPDATA%/freeXan/project-builder.db`

| Function | What it does |
|---|---|
| `initDb()` | Opens DB, enables WAL + foreign keys, creates all tables, runs migrations |
| `getClients()` | Returns all rows from `clients` |
| `addClient(name, initials)` | Inserts new client |
| `updateClient(id, name, initials)` | Updates client name/initials |
| `deleteClient(id)` | Deletes client (cascades to funnels, assets, templates) |
| `getFunnels(clientId?)` | Returns funnels — all, or scoped to a client |
| `addFunnel(clientId, name, initials)` | Inserts new funnel |
| `updateFunnel(id, name, initials)` | Updates funnel |
| `deleteFunnel(id)` | Deletes funnel (cascades) |
| `getTasks()` | Returns all tasks |
| `addTask(name, initials)` | Inserts new task |
| `updateTask(id, name, initials)` | Updates task |
| `deleteTask(id)` | Deletes task |
| `getFunnelTasks(clientId, funnelId)` | Returns tasks attached to a client+funnel pair |
| `setFunnelTasks(clientId, funnelId, taskIds[])` | Replaces all task assignments for a pair |
| `getTemplates(clientId?, funnelId?)` | Returns templates filtered by scope |
| `addTemplate(clientId, funnelId, name, filePath)` | Inserts template record |
| `deleteTemplate(id)` | Deletes template record |
| `getAssets(clientId?, funnelId?)` | Returns assets filtered by scope |
| `addAsset(clientId, funnelId, name, filePath, category, tags)` | Inserts asset record |
| `deleteAsset(id)` | Deletes asset record |

**Schema:**
```
clients         (id, name, initials, created_at)
funnels         (id, client_id→clients, name, initials, created_at)
tasks           (id, name, initials, created_at)
funnel_tasks    (client_id→clients, funnel_id→funnels, task_id→tasks)
templates       (id, client_id→clients, funnel_id→funnels, name, file_path)
assets          (id, client_id→clients, funnel_id→funnels, name, file_path, category, tags)
```

---

### `renderer/index.html` — Main Window UI

**What it does:** The HTML shell for the 800×600 main window. Contains three tabs: Builder, Settings, Database. Custom frameless titlebar with draggable region, minimize, and close buttons.

| Section | What's in it |
|---|---|
| `<div id="titlebar">` | Custom draggable titlebar with app title + window buttons |
| `<div id="tab-builder">` | Project Builder form: client, funnel, task selects, project name input, preview, create button |
| `<div id="tab-settings">` | Target dir, template file, folder structure list, auto-popup toggle |
| `<div id="tab-database">` | Clients/Funnels/Tasks/Templates/Assets management panels with add/edit/delete |
| `<script src="app.js">` | Loads all renderer logic |

---

### `renderer/app.js` — Main Window Logic

**What it does:** All interactivity for the main window. Tab switching, dropdown population with initials search, form handling, live path preview, database CRUD from the UI, settings persistence.

**Key sections:**

| Section | What it does |
|---|---|
| Tab switching | Shows/hides tab panes, highlights active tab button |
| `populateClients()` | Fetches clients from DB, fills `#client-select` with `<option>` elements |
| `populateFunnels()` | Fetches funnels, fills `#funnel-select` |
| `populateTasks()` | Fetches tasks scoped to selected client+funnel pair |
| Initials-first search | `keydown` listener on selects — types "AK" jumps to first option matching "AK" initials |
| Live preview | Updates `#preview-path` and `#preview-filename` as form fields change |
| `handleCreateProject()` | Collects form data, calls `window.api.invoke('create-project', payload)` |
| Settings load/save | Reads config on load, writes on "Save Settings" click |
| Folder structure editor | Add/remove/reorder folder names in the settings list |
| Database tab — Clients | Add/edit/delete clients; inline edit on row click |
| Database tab — Funnels | Add/edit/delete funnels; client-scope filter |
| Database tab — Tasks | Add/edit/delete tasks; assign to funnel via checkboxes |
| Database tab — Templates | Add/delete templates with client/funnel scope pickers; file path via dialog |
| Database tab — Assets | Add/delete assets with scope pickers, category, tags; file path via dialog |

---

### `renderer/overlay.html` — Drag-Drop Overlay Window

**What it does:** The floating pill window that stays on top of all windows. Idle: 56×56px circle. On file drag: expands to 244×84px with drop prompt. On drop: shows success/error feedback.

| Element | What it does |
|---|---|
| `#pill` | Root container, receives CSS state classes (`idle`, `drag-hover`, `success`, `error`) |
| `#status-icon` | SVG icon that changes per state |
| `#status-text` | Message text: "Drop to add", "Imported!", error message |
| `#drag-target` | Invisible full-window drop zone |

---

### `renderer/overlay.js` — Overlay State Machine

**What it does:** Controls the overlay pill's behavior — window resize requests, drag detection, file drop handling, success/error display, and auto-dismiss timers.

| Function / Event | What it does |
|---|---|
| `window.api.on('overlay-update')` | Receives project name + WS status from main; updates title attribute |
| `dragenter` / `dragover` / `dragleave` | Detects drag state; requests window resize via IPC; starts 500ms expand timer |
| `drop` handler | Collects file paths via `window.api.getDroppedFiles()`; calls `window.api.invoke('import-dropped-files', paths)` |
| `showSuccess(msg)` | Sets success CSS class; auto-dismisses after 2.5s |
| `showError(msg)` | Sets error CSS class; auto-dismisses after 3s |
| `resetState()` | Returns pill to idle state; requests window shrink |
| `mousemove` | Sends window position delta to main for dragging the pill around the screen |

---

### `renderer/styles.css` — Main Window Theme

**What it does:** All visual styling for `index.html`. Dark glassmorphism theme.

| Variable / Class | What it controls |
|---|---|
| `#121214` | App background |
| `#997DFF` | Accent purple — buttons, active states, brand color |
| `#f3f3f5` | Primary text color |
| `.card` | Glassmorphism panel with `backdrop-filter: blur` |
| `.tab-btn.active` | Active tab highlight |
| `.dropdown-wrapper` | Custom styled `<select>` containers |
| `.btn-primary` | Purple action buttons |
| `.btn-danger` | Red delete buttons |

---

### `renderer/overlay.css` — Overlay Pill Theme

**What it does:** Styles the overlay window and all its state animations.

| Class | What it controls |
|---|---|
| `.pill.idle` | 56×56px circle, minimal opacity |
| `.pill.drag-hover` | Expanded 244×84px, bright purple border, "Drop to add" text visible |
| `.pill.success` | Green (#10b981) glow, "Imported!" text |
| `.pill.error` | Red (#ef4444) glow, error message text |
| `@keyframes pulse` | Breathing animation on drag-hover state |

---

### `cep-extension/ext.js` — CEP Premiere Panel Script

**What it does:** JavaScript that runs inside Adobe Premiere Pro's panel. Connects to the freeXan WebSocket server, polls the active project path via ExtendScript every 1.5s, and handles import messages.

| Function | What it does |
|---|---|
| `connectWebSocket()` | Connects to `ws://localhost:4554`; sets up reconnect on close |
| `ws.onmessage` | Receives `import` messages → calls `doImport(filePath)` |
| `pollActiveProject()` (setInterval 1500ms) | Calls `evalScript('getActiveProjectPath()')` → sends `active_project` message to main |
| `doImport(filePath)` | Calls `evalScript('importAsset("' + filePath + '")')` → sends `import_result` back |
| Status updates | Updates `#status-dot` and `#status-text` in `panel.html` |

---

### `cep-extension/hostscript.jsx` — ExtendScript (Premiere API)

**What it does:** Runs inside Adobe Premiere Pro's ExtendScript engine. Has access to the full Premiere Pro API (`app.project`).

| Function | What it does |
|---|---|
| `getActiveProjectPath()` | Returns `app.project.path` — the full path to the currently open `.prproj` file |
| `importAsset(filePath)` | Calls `app.project.importFiles([filePath], true, app.project.rootItem, false)` to add file to active project's root bin |

---

### `cep-extension/panel.html` — CEP Panel UI

**What it does:** The tiny HTML panel visible inside Adobe Premiere Pro's workspace. Shows connection status and active project name.

| Element | What it shows |
|---|---|
| `#status-dot` | Green (connected) / Gray (disconnected) indicator circle |
| `#status-text` | "Connected" / "Disconnected" / "Connecting…" |
| `#project-name` | Name of the currently active Premiere project |

---

### `cep-extension/CSInterface.js` — Adobe CEP Bridge

**What it does:** Third-party vendor library provided by Adobe. Bridges the HTML/JS panel with the Premiere Pro host application. Used to call `evalScript()` which runs ExtendScript inside Premiere.

**Do not modify this file.** Update only by replacing with a newer Adobe-provided version.

---

### `cep-extension/CSXS/manifest.xml` — CEP Extension Manifest

**What it does:** Declares the CEP extension to Adobe. Defines extension ID, version, supported apps, panel dimensions, and entry points.

| Field | Value / Purpose |
|---|---|
| `ExtensionBundleId` | `com.bloomx.freexan.link` — unique extension identifier |
| `Host Name="PPRO"` | Targets Adobe Premiere Pro |
| `Host Version` | Minimum `14.0` (Premiere 2020+) |
| `MainPath` | `panel.html` — the panel's HTML entry |
| `ScriptPath` | `hostscript.jsx` — the ExtendScript entry |
| Width/Height | Panel dimensions when docked |

---

### `scripts/seed-db.js` — Database Seeder

**What it does:** One-shot idempotent script that populates the database with the initial client list. Run with `npm run seed`. Safe to re-run — checks for existence before inserting.

**Contains:** Hardcoded list of 30+ clients with names and initials (e.g., `Astro Arun Pandit → AAP`).  
**To add new default clients:** Edit the `clients` array near the top of this file.

---

### `package.json` — Project Manifest

**What it does:** NPM package metadata, dependency list, and npm scripts.

| Script | What it runs |
|---|---|
| `npm start` | Launches Electron app in development mode |
| `npm run build` | Builds Windows installer via electron-builder |
| `npm run seed` | Runs `scripts/seed-db.js` to populate initial client data |
| `npm run rebuild` | Rebuilds native modules (better-sqlite3) for current Electron version |

**Key dependencies:**

| Package | Why it's here |
|---|---|
| `electron` | App framework |
| `better-sqlite3` | SQLite with synchronous API — fast, no async complexity |
| `ws` | WebSocket server for CEP panel communication |
| `axios` | HTTP client — installed but currently unused |
| `@ffmpeg-installer/ffmpeg` | FFmpeg binary — installed but currently unused |

---

### `electron-builder.yml` — Windows Installer Config

**What it does:** Configures electron-builder to produce an NSIS `.exe` installer for Windows 64-bit.

| Setting | Value / Purpose |
|---|---|
| `appId` | `com.bloomx.freexan` |
| `productName` | `freeXan` |
| `icon` | `build/icon.ico` |
| `nsis.oneClick` | `true` — single-click install, no wizard pages |
| `nsis.perMachine` | `false` — installs per-user |
| `nsis.runAfterFinish` | `true` — launches app after install |
| `nsis.include` | `build/installer.nsh` — custom NSIS script |

---

### `build/installer.nsh` — NSIS Installer Script

**What it does:** Custom NSIS script hooks for the installer. Sets up the Windows startup registry key so freeXan launches at system boot with `--hidden`.

---

### `blank_template.prproj` — Default Premiere Template

**What it does:** The fallback `.prproj` file copied as the starting template when no client/funnel-specific template is configured. A clean empty Premiere Pro project.

**To replace:** Swap this file with any `.prproj`, or set a per-client/funnel template in the Database tab.

---

### `Brand Guidelines/free_xan_complete_brand_guidelines.md` — Brand Spec

**What it does:** Complete brand reference: positioning ("invisible workflow infrastructure"), personality, color palette, typography, iconography, tone of voice, and do/don't usage rules.

**Refer to this before:** designing new UI, writing copy for buttons/labels, creating marketing material.

---

## Architecture Overview

```
User (Windows Desktop)
│
├── Main Window  (renderer/index.html + renderer/app.js)
│   ├── Builder Tab   → form → IPC → main.js create-project
│   ├── Settings Tab  → IPC → main.js save-config / get-config
│   └── Database Tab  → IPC → main.js db-* → db.js
│
├── Overlay Pill  (renderer/overlay.html + renderer/overlay.js)
│   └── file drop → IPC → main.js import-dropped-files
│       └── copy files to project subfolder
│           └── WebSocket → CEP panel → importAsset() → Premiere bin
│
├── main.js
│   ├── WebSocket Server (port 4554)
│   ├── PowerShell Monitor (Premiere title poll, 2500ms)
│   ├── CEP Extension auto-installer (on startup)
│   └── SQLite DB (via db.js)
│
└── CEP Extension  (inside Adobe Premiere Pro)
    ├── panel.html     — visible UI in Premiere workspace
    ├── ext.js         — WebSocket client, active project poll (1500ms)
    └── hostscript.jsx — ExtendScript API calls (getActiveProjectPath, importAsset)
```

---

## Data Flow: Project Creation

```
1. User fills Builder form (client, funnel, task, name)
2. renderer/app.js collects form values
3. IPC invoke('create-project', payload) → main.js
4. main.js:
   a. Resolves template (funnel > client > config > blank_template.prproj)
   b. mkdir all folders in folderStructure list
   c. fs.copyFile(template → new project path)
   d. Queries db.js for preset assets scoped to client+funnel
   e. Copies each asset to appropriate subfolder
   f. Writes README.md into project folder
   g. shell.openPath(newProjectPath) → Premiere Pro opens the project
5. Renderer receives result, shows success or error
```

---

## Data Flow: File Drop Import

```
1. User drags file over overlay pill
2. overlay.js detects dragenter → IPC resize-overlay (expand)
3. User drops file
4. preload.js captures file path via webUtils.getPathForFile()
5. IPC invoke('import-dropped-files', [paths]) → main.js
6. main.js:
   a. Detects activeProjectPath (from WS or PowerShell)
   b. For each file: classify by extension (video/audio/image/other)
   c. Copy to matching subfolder, resolve conflicts with _N suffix
   d. Broadcast WebSocket message { type: 'import', filePath } to CEP
7. CEP ext.js receives message → evalScript('importAsset(filePath)')
8. hostscript.jsx → app.project.importFiles([filePath]) in Premiere
9. main.js sends IPC result back to overlay.js
10. overlay.js shows success/error pill → auto-dismiss
```

---

*Last updated: 2026-05-25 | v1.2.0*
