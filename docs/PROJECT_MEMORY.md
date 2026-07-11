# PROJECT MEMORY — freeXan Architecture & Ecosystem Source of Truth

> [!IMPORTANT]
> **AUTHORITATIVE SOURCE OF TRUTH & MANDATORY STARTING POINT**
> This document is the primary source of truth and starting point for any developer or AI agent working across the freeXan ecosystem.
> 1. **Mandatory Starting Point:** Always consult this document first before developing new features or investigating code.
> 2. **Mandatory Cross-Check:** Whenever you develop something new or read code to understand an existing mechanism, always cross-check your findings against this document.
> 3. **Mandatory Enrichment:** If any architecture, mechanism, tool, command, parameter, or reference in the codebase is missing from or outdated in this document, you **MUST** add and enrich it immediately. Keep this document well-organized, comprehensive, and well-researched at all times.

**Established:** 2026-07-06 | **Last Updated:** 2026-07-06
**Purpose:** Living knowledge repository and authoritative source of truth recording deep architectural understanding of the freeXan desktop application, CEP plugins ecosystem, HTTP/WebSocket bridges, CLI, and MCP server.

---

## 1. Vision & Core Philosophy

**freeXan** by **BloomX** is an **invisible workflow infrastructure** designed for professional Adobe Premiere Pro and After Effects video editors (specifically tailored to Swastik's editing workflows).

Instead of forcing editors to manually organize folders, copy templates, drag assets across Finder/Explorer, or build captions by hand, freeXan operates in the background to automate:
- Client, Funnel, and Task folder hierarchy creation on disk.
- Template project (`.prproj`) duplication and auto-opening in Premiere Pro.
- Drag-and-drop media classification (video, audio, image) and direct import into active Premiere bins.
- Bin creation and sequence setup via ExtendScript injected through CEP.
- Automated MOGRT caption generation across timeline tracks.
- Audio library browsing, waveform preview, and audio insertion into Premiere sequences.
- MOGRT template library management and browsing.

---

## 2. Project Directory Layout

```
FreeXan Development/
├── main.js               ← Electron main process (≈3000 lines) — all IPC, WS, HTTP wiring
├── preload.js            ← Electron contextBridge API exposed to renderer
├── renderer/             ← Electron renderer (the desktop UI)
├── db.js                 ← Primary SQLite DB (project-builder.db) — clients, funnels, tasks, templates
├── audioDb.js            ← Audio library SQLite DB (audio-library.db)
├── mogrtDb.js            ← MOGRT library SQLite DB (mogrt-library.db)
├── audioWatcher.js       ← Chokidar watcher for audio folders
├── mogrtWatcher.js       ← Chokidar watcher for MOGRT folders
├── linkWatcher.js        ← Chokidar watcher for project linked folders (bin sync)
├── httpApi.js            ← Localhost HTTP API door (port 4555)
├── logger.js             ← Universal telemetry logger (sendLog, getLogsDir, etc.)
├── mcp/
│   ├── server.js         ← MCP server (STDIO transport, wraps HTTP API)
│   └── README.md         ← MCP tool documentation
├── cli/
│   ├── freexan.js        ← CLI (wraps HTTP API, no Electron dep)
│   └── README.md         ← CLI command documentation
├── CEPs/
│   ├── Link_freeXan/     ← CEP: project bridge, import, bin/sequence setup
│   ├── freeXan_Caption/  ← CEP: Hinglish MOGRT caption generator
│   ├── Audio_freeXan/    ← CEP: audio library browser + waveform player + import
│   ├── MISTER_BloomX/    ← CEP: MOGRT asset library browser
│   └── freeXan_DebugLog/ ← CEP: diagnostic log viewer (empty in dev)
├── native-pill/          ← C++ Native Overlay Pill (FreeXanPill.exe) using Direct2D/Win32 OLE COM
├── archive_legacy_electron_pill/ ← Archived HTML5/CSS/JS Electron overlay pill
├── plugins/              ← ⛔ LOCKED — stable plugin backups, NEVER modify here
├── docs/
│   ├── PROJECT_MEMORY.md ← This file (Source of Truth)
│   └── logs/
│       ├── CHANGELOG.md
│       ├── DEV_LOG.md
│       └── NAVIGATION_LOG.md
└── transcriber_sandbox/  ← Isolated AI transcription engine test environment
```

---

## 3. The Canonical Action Nomenclature

Every action across the freeXan stack uses a canonical ID:
```
{scope}.{verb}[_{object}]
```

### The 5 Scopes:
| Scope | Domain |
|---|---|
| `app` | OS-level headless operations — filesystem, database queries, opening applications, config |
| `link` | Premiere Pro active project operations — import files, bin creation, sequence setup |
| `caption` | freeXan Caption plugin — SRT parsing, phrase grouping, MOGRT placement on timeline |
| `bloomx` | MISTER BloomX plugin — MOGRT library browsing, search, insert |
| `audio` | freeXan Audio plugin — audio library search, waveform preview, track insertion |

### Cross-Stack Mapping Example (`caption.generate`):
| Layer | Representation |
|---|---|
| Canonical ID | `caption.generate` |
| HTTP Door | `POST /plugin-action` → `{ plugin: "caption", action: "caption_generate", args: { … } }` |
| WebSocket (main→CEP) | `{ type: "plugin_action", requestId, action: "caption_generate", args }` |
| WebSocket (CEP→main) | `{ type: "plugin_action_result", requestId, result }` or `{ …, error }` |
| MCP Tool | `freexan_caption_generate` |
| CLI Command | `freexan caption generate <srt> --mogrt <path>` |
| TypeScript Handler | `captionMcpHandlers.ts` → `dispatchPluginAction("caption_generate", args)` |
| ExtendScript Entry | `runCaptionGenerate(args)` in `mogrt.jsx` |
| ExtendScript Primitives | `getData()`, `createCaptions()`, `bridgeCaptionGaps()` |

---

## 4. Communication Architecture (All Layers)

### 4.1 Electron Main Process (`main.js`)

The central hub. It:
- Manages the BrowserWindow (Electron desktop UI).
- Hosts the WebSocket server (`ws://localhost:4554`).
- Hosts the HTTP API server (`http://127.0.0.1:4555`) via `httpApi.js`.
- Maintains the `pluginConnections` Map (plugin name → WebSocket connection).
- Owns the SQLite databases: `db.js`, `audioDb.js`, `mogrtDb.js`.
- Patches `ipcMain.handle` globally for automatic UUID correlation ID generation and timing telemetry on ALL IPC channels.
- Uses `ffmpeg` via `@ffmpeg-installer/ffmpeg` for audio processing.
- Implements the Debugging Framework (see Section 9).

**Key modules loaded by `main.js`:**

| Module | Role |
|---|---|
| `db.js` | Primary DB — clients, funnels, tasks, folder templates, assets |
| `audioDb.js` | Audio library DB — watched folders, audio files, tags, peaks |
| `mogrtDb.js` | MOGRT library DB — watched folders, MOGRT files, categories, thumbnails |
| `audioWatcher.js` | Chokidar FS watcher for audio library folders |
| `mogrtWatcher.js` | Chokidar FS watcher for MOGRT library folders |
| `linkWatcher.js` | Chokidar FS watcher for project linked-folder bins (auto-import) |
| `httpApi.js` | HTTP API door on port 4555 |
| `logger.js` | Universal telemetry system |
| `nodemailer` | Bug report email sender |
| `adm-zip` | Diagnostic ZIP bundler |

### 4.2 IPC Monkey-Patch (All handlers auto-instrumented)

`main.js` patches `ipcMain.handle` at startup (lines 59–79):
```js
ipcMain.handle = (channel, handler) => {
  // Wraps every handler: generates correlationId, logs ipc:invoke and ipc:resolve,
  // fires a 5-second hang warning timer if not resolved
};
```
All IPC channels therefore automatically log with `sendLog('debug', 'ipc:invoke')` and `sendLog('debug', 'ipc:resolve')`.

**Known IPC Channels (main.js):**

| Channel | Direction | Purpose |
|---|---|---|
| `import-dropped-files` | Renderer → Main | Import files by type into project bins and Premiere |
| `create-project` | Renderer/HTTP → Main | Build folder tree, copy `.prproj`, open in Premiere |
| `send-bug-report` | Renderer → Main | Email diagnostic ZIP to developer |
| `export-diagnostics` | Renderer → Main | Bundle and save diagnostic ZIP to disk |
| `get-status` | Renderer → Main | Return connection/project/plugin status |
| `fetch-supabase-profiles` | Renderer → Main | Fetches Team Profiles securely from Supabase via HTTP |

### 4.3 WebSocket Bridge (port `4554`)

The WS server lives in `main.js`. All CEP panels connect to `ws://localhost:4554`.

**Plugin Connection Registry:**
```js
const pluginConnections = new Map();  // plugin name → ws connection
```
Plugins register on connect by sending `{ type: 'ext_hello' }` or by sending their first domain-specific message (e.g., `get_audio_library` → registers as `'audio'`; `get_mogrt_library` → registers as `'bloomx'`; caption panel registration follows its handshake).

**Plugin Action Dispatch (`dispatchToPlugin`):**
```js
dispatchToPlugin(plugin, action, args, timeoutMs)
// Sends: { type: 'plugin_action', requestId, action, args }
// Awaits: { type: 'plugin_action_result', requestId, result } or { …, error }
// Timeout: clamped between 1s–10min (default 30s)
```
This is the core mechanism for **all MCP/CLI → CEP plugin communication**. It is injected into the `httpApi.js` context as `ctx.dispatchToPlugin`.

**WebSocket Message Types (Main → CEP):**

| type | Payload | Purpose |
|---|---|---|
| `plugin_action` | `{ requestId, action, args }` | Dispatch a named action to a CEP panel |
| `import` | `{ filePath, binName, batchId, isLast }` | Tell Link panel to import a file via ExtendScript |
| `setup-project` | `{ bins, sequences, assets, premiereTree, sequencePreset }` | Tell Link panel to build bins/sequences in Premiere |
| `get_bin_files` | `{ requestId, binName }` | Ask Link panel to list files in a Premiere bin |
| `audio_library_data` | `{ files, watchedFolders }` | Push audio library update to Audio panel |
| `audio_library_changed` | — | Signal Audio/Link panels to re-request library |
| `mogrt_library_data` | `{ files, watchedFolders }` | Push MOGRT library update to BloomX panel |
| `mogrt_library_changed` | `{ change }` | Signal MOGRT change event |
| `cep_heartbeat_ping` | — | Heartbeat ping to all connected panels |
| `reload` | — | Force panel page reload (dev utility) |
| `dummy_ready` | `{ path }` | Audio dummy file created — available for drag |
| `replace_audio` | `{ dummyFilePath, realFilePath, binName }` | Tell Audio panel to replace dummy with real file |
| `move_bin_only` | `{ filePath, binName }` | Move already-imported file to a different bin |
| `import_audio_legacy` | `{ realFilePath, binName, durationSec }` | Legacy audio import path |
| `peaks_ready` | `{ peaks, duration }` | Waveform peaks computed — send to Audio panel |
| `project_context` | `{ context }` | Push current project metadata to Audio panel |
| `process_result` | `{ success, msgId, filePath, error }` | Audio processing result |
| `bloomx_status` | `{ open: bool }` | Broadcast BloomX panel open/close state |

**WebSocket Message Types (CEP → Main):**

| type | Source Panel | Purpose |
|---|---|---|
| `ext_hello` | Link | Announce connection + version |
| `project_ready` | Link | Active Premiere project loaded and accessible |
| `active_project` | Link | Active project path changed or closed |
| `plugin_action_result` | Any | Result of a `plugin_action` dispatch |
| `ext_log` | Any | Forward panel console.log to Electron logger |
| `cep_heartbeat` | Any | Respond to heartbeat ping |
| `cep_heartbeat_pong` | Any | Alternative heartbeat pong format |
| `import_result` | Link | Result of ExtendScript file import |
| `bin_files` | Link | Response to `get_bin_files` |
| `get_audio_library` | Audio/Link | Request audio library data |
| `toggle_favorite` | Audio | Toggle audio file favorite flag |
| `update_tags` | Audio | Update audio file tags |
| `batch_add_tags` | Audio | Add tags to multiple audio files at once |
| `update_duration` | Audio | Update cached audio duration in DB |
| `record_use` | Audio | Increment audio use count |
| `get_mogrt_library` | BloomX | Request MOGRT library data |
| `toggle_mogrt_favorite` | BloomX | Toggle MOGRT favorite flag |
| `update_mogrt_tags` | BloomX | Update MOGRT tags |
| `record_mogrt_use` | BloomX | Increment MOGRT use count |
| `add_mogrt_folder` | BloomX | Add a folder to the MOGRT watch list |
| `remove_mogrt_folder` | BloomX | Remove a folder from MOGRT watch list |

### 4.4 HTTP API Door (`httpApi.js`, port `4555`)

Binds to `127.0.0.1` only (loopback security). Refuses non-loopback connections with `403 Loopback only`. Max request body: 1 MB.

**All Current HTTP Routes:**

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | — | Alive check — returns `{ ok, port, appVersion }` |
| `GET /status` | — | Full status — running, Premiere connected, active project, targetDir, connectedPlugins |
| `GET /clients` | — | All clients from `db.clientsApi.getAll()` |
| `GET /funnels[?clientId=N]` | — | All funnels, or filtered by `clientId` |
| `GET /tasks[?clientId=N&funnelId=M]` | — | All tasks, or tasks for a specific (client, funnel) pair |
| `GET /templates` | — | All folder templates (deduplicated by id) |
| `POST /project` | body | Create project folder + `.prproj` and open in Premiere |
| `POST /import` | body | Import files into active Premiere project |
| `POST /plugin-action` | body | Generic CEP plugin action dispatcher (see §4.3) |
| `POST /open` | body | Open a path in the OS shell |

**`POST /project` required body:**
```json
{ "clientId": 1, "funnelId": 2, "taskId": null, "projectName": "Reel 01" }
```
Resolved to full names from DB; then calls `ipcMain` handler `create-project`.

**`POST /import` required body:**
```json
{ "filePaths": ["/abs/path/to/file.mp4"], "opts": { "routeToFolder": "/path", "moveSource": false } }
```
Calls `ipcMain` handler `import-dropped-files`.

**`POST /plugin-action` required body:**
```json
{ "plugin": "caption", "action": "caption_generate", "args": {}, "timeoutMs": 180000 }
```

**HTTP Error Codes from `/plugin-action`:**
- `503` — Plugin not connected (CEP panel not open in Premiere)
- `504` — Plugin connected but timed out
- `500` — Other errors

---

## 4.5 Overlay Pill Architecture: Native C++ Pill vs. Legacy Electron Pill

To deliver zero-latency drag-and-drop media routing directly over Premiere Pro without heavy Chromium memory consumption or screen capture interference, freeXan utilizes a standalone **Native C++ Pill**.

### 1. The Active Native C++ Pill (`/native-pill/` -> `FreeXanPill.exe`)
- **Technology Stack:** Win32 API windowing, Direct2D/DirectWrite hardware-accelerated rendering, OLE COM drag-and-drop target, multithreaded reader/writer (`IpcMessenger`).
- **Communication & Thread Sync:** Communicates with `main.js` via a low-latency Windows Named Pipe (`\\.\pipe\freexan_pill`). `IpcMessenger` reads incoming pipe payloads on a background worker thread (`ThreadFunc`) and synchronizes state updates (`overlay-update`, `overlay-link-map`) to the main UI window thread using `PostMessage(hWnd, WM_APP_UPDATE_STATE, 0, 0)`, waking up `GetMessage()` in <0.1ms and forcing immediate `InvalidateRect + UpdateWindow` real-time repaint without waiting for mouse movement.
- **Lifecycle & Management:** Spawns automatically when `main.js` initializes (`initNativePillBridge() -> spawnNativePillProcess()`). When the user toggles visibility from the system tray, `killNativePillProcess()` / `spawnNativePillProcess()` are invoked.
- **Why Native:** Uses < 0.1% CPU and ~5MB RAM, renders floating bubbles at 60 FPS without frame drops, and intercepts dropped files instantly (`performImportDroppedFiles` in `main.js`).

### 2. The Legacy Electron Overlay Pill (`archive_legacy_electron_pill/`)
- **Background:** In earlier versions (v3.0–v3.7), FreeXan created a secondary transparent `BrowserWindow` (`createOverlayWindow()`) loaded from `renderer/overlay.html`.
- **Archiving & Removal (v3.8.31):** To eliminate duplicate pills appearing concurrently and clean up `main.js`, the Electron overlay window creation (`createOverlayWindow()`), window repositioning loops (`repositionOverlay()` animations), and renderer IPC handlers (`resize-overlay`, `move-overlay-window`, `overlay-log`, `request-status`) were removed from the active runtime.
- **Preservation & Reusability:** All frontend files (`overlay.html`, `overlay.js`, `overlay.css`) and documentation are preserved in `archive_legacy_electron_pill/`. Because Electron (`BrowserWindow`) is cross-platform, if a future macOS (`darwin`) or Linux port of FreeXan requires an overlay without rewriting C++ Direct2D in Swift/Cocoa, these legacy files can be restored to `/renderer/` and re-enabled with minimal effort.

---

## 5. SQLite Databases

All databases are stored in Electron's `app.getPath('userData')` directory (typically `%APPDATA%\freeXan\` on Windows).

### 5.1 Primary Database (`project-builder.db`) — `db.js`

**Tables:**

| Table | Key Columns | Purpose |
|---|---|---|
| `clients` | `id, name, initials, created_at` | Studio/brand clients |
| `funnels` | `id, client_id (nullable), name, initials, created_at` | Marketing funnel contexts |
| `tasks` | `id, name, initials, created_at` | Reusable editing task labels |
| `funnel_tasks` | `client_id, funnel_id, task_id` (composite PK) | Junction: which tasks belong to (client, funnel) |
| `templates` | `id, client_id, funnel_id, name, file_path` | `.prproj` template files with scoping |
| `assets` | `id, client_id, funnel_id, name, file_path, category, tags` | Client/funnel-scoped asset presets |
| `folder_templates` | `id, name, is_default, prproj_path, open_mode, bins_json, sequences_json, template_type` | Folder structure templates |
| `folder_template_nodes` | `id, template_id, parent_id, node_type, name, asset_path, slot_type, link_enabled, link_shortcut, sort_order` | Tree nodes (bins, sequences, asset slots) |
| `folder_template_assignments` | `id, template_id, client_id, funnel_id, task_id` | Assigns a folder template to (client, funnel, task) combination |

**`folderTemplatesApi.resolve(clientId, funnelId, taskId)` Resolution Priority (7 levels):**
1. `(client, funnel, task)` — Most specific
2. `(client, funnel, *)`
3. `(client, *, task)`
4. `(*, funnel, task)`
5. `(client, *, *)`
6. `(*, funnel, *)`
7. `(*, *, task)` — Least specific, falls back to is_default=1

**Exported APIs:**
```js
module.exports = { clientsApi, funnelsApi, templatesApi, assetsApi, tasksApi, folderTemplatesApi }
```

### 5.2 Audio Library Database (`audio-library.db`) — `audioDb.js`

**Tables:**

| Table | Key Columns | Purpose |
|---|---|---|
| `watched_folders` | `id, folder_path` | Directories scanned for audio |
| `audio_files` | `id, file_path, name, duration, tags, is_favorite, use_count, category, peaks` | Audio file metadata + waveform peaks |

**Search:** `audioApi.getAll(search, favoritesOnly)` — WHERE clause on `name LIKE` or `tags LIKE`.

**Exported APIs:**
```js
module.exports = { foldersApi, audioApi }
```

### 5.3 MOGRT Library Database (`mogrt-library.db`) — `mogrtDb.js`

**Tables:**

| Table | Key Columns | Purpose |
|---|---|---|
| `mogrt_watched_folders` | `id, folder_path` | Directories scanned for `.mogrt` files |
| `mogrt_files` | `id, file_path, name, tags, category, is_favorite, use_count, thumbnail, created_at` | MOGRT template metadata |

**Search:** `mogrtApi.getAll(search, favoritesOnly, category)` — WHERE clause on `name LIKE` or `tags LIKE`, filtered by `category` and `is_favorite`.

**Exported APIs:**
```js
module.exports = { foldersApi, mogrtApi }
```

---

## 6. CEP Plugin Ecosystem (`/CEPs/`)

> [!CAUTION]
> **NEVER modify the `/plugins/` directory.** This is the stable backup of deployed plugins. ALL active development happens exclusively in `/CEPs/`.

All CEP panels connect to the Electron WS server at `ws://localhost:4554`. They use `CSInterface.evalScript()` to execute ExtendScript inside Adobe Premiere Pro.

### 6.1 `Link_freeXan` — Project Bridge Plugin

**ID:** `com.bloomx.freexan.link`
**Files:** `ext.js` (≈824 lines), `hostscript.jsx`, `panel.html`, `sequence-preset.sqpreset`, `sqpersets/`
**WS Registration:** Sends `ext_hello`; registers as `'link'` in `pluginConnections`.
**Version:** `EXT_VERSION = '2.0.0'`

**Responsibilities:**
- **Project Tracking:** Polls Premiere every 1s with a JSX probe script (`TRACKING_SCRIPT`) that checks `app.project.rootItem.children` accessibility. Sends `project_ready` or `active_project` messages to main.
- **File Import:** Receives `import` messages → runs inline JSX IIFE to call `app.project.importFiles([filePath], true, targetBin, false)`. Uses `findBin()` helper to recursively locate target bin. Sends `import_result` back.
- **Bin Creation (`setup-project` → `setupFromPremiereTree`):** Receives the full Premiere bin/sequence tree from main after project creation. Creates bins using DFS (depth-first) with an **adaptive timing loop**: measures how long Premiere takes to process each `createBin()` call and uses that duration as the wait time for the next call. Retries up to 8 times on `parent not found` errors.
- **Sequence Creation:** Creates sequences after all bins are created. Each sequence node carries `width`, `height`, `fps` for per-sequence format resolution.
- **Batch Import Finalization (`finalizeImportBatch`):** After multi-file drops, switches Premiere to the target bin and selects the last-imported item (`app.project.setCurrentBin` + `item.select()`).
- **Audio Library Pass-through:** Receives `audio_library_data` and renders an audio list panel alongside the Link panel (dual-purpose panel).
- **Bin File Query:** Handles `get_bin_files` — iterates `bin.children` and reports file names back to main for linked-folder diffing.
- **WebSocket Reconnect:** Retries connection indefinitely (`MAX_RECONNECT=Infinity`) every 3s so the panel connects automatically whenever FreeXan is started.

**ExtendScript Functions in `hostscript.jsx`:**
- `importAssetToBin(filePath, binName)` — import to named bin (fallback; inline IIFEs preferred in ext.js)
- `createBin(name)` — create bin at root
- `createBinAtPath(pathStr, binName)` — create bin at pipe-delimited path (e.g., `"02_Footage|B-Roll"`)
- `createSequence(name, id)` — create sequence with given name and preset ID
- `importAsset(filePath)` — import to active/root bin

### 6.2 `freeXan_Caption` — Hinglish MOGRT Caption Generator

**ID:** `com.bloomx.freexan.caption`
**Files:** `panel-src/` (React + TypeScript + Vite), compiled to `panel/dist/`
**WS Registration:** Caption panel registers as `'caption'` in `pluginConnections` via its WebSocket handshake.
**Key Source Files:**
- `panel-src/src/lib/captionMcpHandlers.ts` — MCP/CLI action dispatcher
- `panel-src/src/lib/csi.ts` — TypeScript wrapper around `csInterface.callJSX`
- `panel/jsx/core/mogrt.jsx` — Main ExtendScript engine (≈1154 lines)
- `panel/jsx/core/timeline.jsx` — Premiere sequence/timeline manipulation
- `panel/jsx/core/utils.jsx` — Utility functions

**Caption Generation Pipeline (MCP → ExtendScript):**
1. MCP calls `freexan_caption_generate` → `POST /plugin-action` `{ plugin: "caption", action: "caption_generate", args }`.
2. `main.js` `dispatchToPlugin("caption", "caption_generate", args, 180000)` → sends `plugin_action` over WS.
3. Caption panel's `useFreeXanWs.ts` receives the message → calls `dispatchPluginAction("caption_generate", args)` in `captionMcpHandlers.ts`.
4. Handler calls `csi.callJSX('runCaptionGenerate', args)` → ExtendScript `runCaptionGenerate(args)` in `mogrt.jsx`.
5. `runCaptionGenerate` pipeline:
   - Reads the word-by-word Hinglish SRT file from disk.
   - Groups words into readable phrases based on `charsPerPhrase` (default 100).
   - For each phrase: calls `getData()` to read timing, then `createCaptions()` to place MOGRT clips on alternating V1/V2 tracks.
   - After all phrases: calls `bridgeCaptionGaps()` to snap adjacent caption clips.
   - Returns JSON summary: `{ status, wordsRendered, phrasesCreated, totalWords, firstVideoTrack, secondVideoTrack, mogrtName, mogrtMode, sequenceFrameRate, mogrtFrameRate, failures[] }`.
6. Result flows back: ExtendScript → `csi.callJSX` resolve → `captionMcpHandlers.ts` → `plugin_action_result` WS message → `handlePluginActionResult()` in `main.js` → HTTP 200 response → MCP tool → Claude.

**Supported `plugin_action` Actions on `caption` plugin:**

| Action | Args | Risk | Description |
|---|---|---|---|
| `caption_ping` | — | 🟢 Safe | Health check — returns `{ pluginConnected, jsxLoaded, supportedActions }` |
| `caption_generate` | `hinglishSrtPath, mogrtPath, [charsPerPhrase], [trackStart], [phrasingSrtPath]` | 🔴 Destructive | Full caption generation run |

**Card Tint Correlation:** Every MOGRT card in MISTER BloomX gets a deterministic tint computed from its base name. The **same tint** appears on phrase cards in freeXan Caption's Edit tab — enabling visual matching between MOGRT library and timeline phrases.

### 6.3 `Audio_freeXan` — Audio Library Browser

**ID:** `com.bloomx.freexan.audio`
**Files:** `audio.js` (≈2498 lines), `hostscript.jsx`, `audio.html`, `audio-player.css`, `wavesurfer.min.js`, `Tone.js`, `regions.min.js`
**WS Registration:** Registers as `'audio'` in `pluginConnections` when it sends `get_audio_library`.

**State (key variables in `audio.js`):**
```
audioLibrary[]       — All audio files from DB
filteredLibrary[]    — Post-search/filter subset
selectedAudio        — Currently selected file object
wavesurfer           — WaveSurfer.js instance
activeFX[]           — Active Tone.js effects chain
volumeLevel          — Current playback volume (0–100)
trimStart/trimEnd    — Trim region handles (seconds)
isPlaying            — Playback state flag
projectContext       — Current Premiere project context
watchedFolders[]     — Library folder tree
```

**MOODS (Tag System):** Tense, Dark, Cinematic, Calm, Uplifting, Chaotic — each with a color code. Used for tag-based search and filtering.

**Audio Import Flow (Drag-and-Drop to Premiere):**
1. User selects audio in panel + clicks "Add" / drags to Premiere.
2. Panel sends `{ type: 'process_result' }` to main after pre-processing (volume norm, trim via ffmpeg).
3. Main responds with `replace_audio` → `{ dummyFilePath, realFilePath, binName }`.
4. Audio panel calls `doReplaceInPremiere()` → inline JSX IIFE searches Premiere project for the dummy clip and replaces its path with the real file. Uses a sophisticated search across all sequences and all bins.
5. Alternatively: `import_audio_legacy` → `doImportToPremiere()` → directly calls `app.project.importFiles()` and then `seq.insertClip()` on the active sequence.

**Supported `plugin_action` Actions on `audio` plugin:**
> ⚠️ **Currently: none implemented yet.** The `audio` panel is registered in `pluginConnections` but has no `plugin_action` message handler in `audio.js`. This is a planned expansion.

### 6.4 `MISTER_BloomX` — MOGRT Template Library

**ID:** `com.bloomx.misterbloomx` (After Effects + Premiere Pro)
**Files:** `dist/index.html`, `dist/CSInterface.js`, `dist/assets/`
**WS Registration:** Registers as `'bloomx'` in `pluginConnections` when it sends `get_mogrt_library`.
**UI Framework:** React + Vite (compiled to `dist/`)
**Local Database:** PostgreSQL (`misterbloomx`) — caches asset catalog locally in addition to the freeXan SQLite sync.

**Asset Types:** Animations, Effects, Text Presets (`.ffx`), Fonts, Keyframe data (`.json`).

**Keyframe Serialization Engine (`serialize_keyframes.jsx`):**
- Exports: Iterates selected layer Transform/Effects, captures per-keyframe time/value/interpolation/bezier handles using property `matchName` (locale-stable).
- Imports: Reconstructs keyframes via `prop.setValueAtTime()` + `prop.setTemporalEaseAtKey()`.

**FreeXan Integration:**
- Connects to `ws://localhost:4554` to read: Clients, Funnels, Assets, Templates, Audio Library, Folder Structures.
- Main pushes `audio_library_changed` events; BloomX re-requests automatically.
- All data in freeXan's local SQLite — works fully offline.

**Supported `plugin_action` Actions on `bloomx` plugin:**
> ⚠️ **Currently: none implemented yet.** The `bloomx` panel registers but has no `plugin_action` handler. This is a planned expansion.

### 6.5 `freeXan_DebugLog` — Diagnostic Tool

**Status:** Empty directory in dev — no active source files. Placeholder for future log viewer panel.

---

## 7. MCP Server (`mcp/server.js`)

**Transport:** STDIO (standard input/output) — works with Claude Code, Gemini, and any MCP-compatible AI client.
**Version:** `0.2.0`
**Bridge:** Wraps `http://127.0.0.1:4555` (the freeXan HTTP API door).
**HTTP Client Timeout:** 200s (to give `caption_generate` sufficient slack above its 180s plugin timeout).

**Matchmaking:** `matchByName(rows, name)` — fuzzy name resolution. Tries: exact match → initials match → prefix match.

### Currently Implemented MCP Tools (v3.6.0):

| Tool Name | Risk | HTTP Route | Description |
|---|---|---|---|
| `freexan_app_status` | 🟢 Safe | `GET /status` | App/Premiere connection status, connected plugins, workspace dir |
| `freexan_app_list_clients` | 🟢 Safe | `GET /clients` | List all saved clients |
| `freexan_app_list_templates` | 🟢 Safe | `GET /templates` | List all folder templates |
| `freexan_app_create_project` | 🔴 Destructive | `POST /project` | Create folder tree + `.prproj` + open in Premiere. Requires: `clientName`, `funnelName`, `projectName`. Optional: `taskName`. |
| `freexan_app_open` | 🟡 Low-risk | `POST /open` | Open a file/folder path in OS shell |
| `freexan_link_import_files` | 🔴 Destructive | `POST /import` | Import files into active Premiere project. Optional: `toFolder`, `move`. |
| `freexan_caption_ping` | 🟢 Safe | `POST /plugin-action` | Health check Caption panel — confirms JSX loaded |
| `freexan_caption_generate` | 🔴 Destructive | `POST /plugin-action` | Full caption run: SRT → phrases → MOGRT clips on V1/V2. Timeout: 180s. |

---

## 8. CLI (`cli/freexan.js`)

**Version:** `0.2.0`
**Transport:** HTTP client to `http://127.0.0.1:4555`.
**Global Flags:** `--json` (raw JSON output), `--port N` (override port), `--help/-h`, `--version/-v`.

### Currently Implemented CLI Commands (v3.6.0):

| Command | Risk | HTTP Route | Description |
|---|---|---|---|
| `freexan status` | 🟢 Safe | `GET /status` | Show app + Premiere connection state |
| `freexan clients` | 🟢 Safe | `GET /clients` | List saved clients |
| `freexan templates` | 🟢 Safe | `GET /templates` | List folder templates |
| `freexan new <name> --client X --funnel Y [--task Z]` | 🔴 Destructive | `POST /project` | Create new project |
| `freexan import <files...> [--to-folder P] [--move]` | 🔴 Destructive | `POST /import` | Import files into active project |
| `freexan open <path>` | 🟡 Low-risk | `POST /open` | Open path in OS shell |
| `freexan caption ping` | 🟢 Safe | `POST /plugin-action` | Caption plugin health check |
| `freexan caption generate <srt> --mogrt <path> [--chars-per-phrase N] [--track-start N]` | 🔴 Destructive | `POST /plugin-action` | Generate captions from SRT |

---

## 9. Debugging Framework (Mandatory for ALL code changes)

Per `debugging_framework.md` rule — this is non-negotiable.

### 9.1 Telemetry Logger (`logger.js`)

**Signature:**
```js
sendLog(level, event, source, correlationId, payload, durationMs?, error?)
```
**Event Naming:** `<tier>:<action>-<phase>` — e.g., `ui:report-bug-submit`, `ipc:dispatch`, `cep:resolution`, `mcp:tool-call`

**Valid tiers:** `ui`, `ipc`, `cep`, `mcp`, `diagnostic`

**Renderer-side:**
```js
window.freeXanLog(level, event, correlationId, payload)
window.api.exportDiagnostics()  // Opens file Explorer to the diagnostic ZIP
```

### 9.2 Correlation IDs

Every user-initiated action generates `crypto.randomUUID()` at the UI boundary, threaded through all layers:
```
Renderer (ui:*) → Main (ipc:*) → CEP ExtendScript (cep:*) → Resolution (cep:resolution)
```

### 9.3 IPC Timing

All `ipcMain.handle` registrations are auto-wrapped (see §4.2 monkey-patch) — fires WARN at 5s hang.

### 9.4 Error Boundaries

- All `evalScript` / `csi.callJSX` calls wrapped in try/catch; failures log `cep:error`.
- All React tab components wrapped in `<ErrorBoundary>` (`src/shell/ErrorBoundary.tsx`).

### 9.5 PII Scrubbing

All log payloads containing file paths must be scrubbed:
```js
value.replace(/[a-zA-Z]:[\\/]Users[\\/][^\\/\s"']+/gi, 'C:\\Users\\[USER_PATH]')
     .replace(/\/[hH]ome\/[^/\s"']+/gi, '/home/[USER_PATH]')
     .replace(/\/Users\/[^/\s"']+/gi, '/Users/[USER_PATH]')
```

### 9.6 Slow Execution Warning

If any tool, handler, or ExtendScript call takes > **8000ms**:
```js
sendLog('warn', 'mcp:tool-slow-execution', source, correlationId, { durationMs });
```

### 9.7 Diagnostic ZIP (`exportDiagnosticsZip`)

Bundles last 3 log files (`.log`, `.old`), scrubs PII, saves to disk. Triggered via:
- `Report Bug` button in Electron UI → `ipcMain` channel `send-bug-report` → emails via nodemailer.
- `Export Diagnostics` → `ipcMain` channel `export-diagnostics` → saves ZIP.

---

## 10. 3-Tier MCP & CLI Tool Architecture (Planned)

All future MCP tools and CLI commands follow a **3-level hierarchy**:

### Level 1: 🚀 Bulk Production Macros (End-to-End Autonomous Pipelines)

A single call executes an entire multi-step production workflow autonomously. freeXan orchestrates all internal steps — creates project, imports files, loops through videos, creates sequences, runs captions — and returns a single consolidated report.

**Planned Bulk Macros:**

| Tool | CLI | Risk | Pipeline |
|---|---|---|---|
| `freexan_bulk_caption_folder` | `freexan bulk caption-folder <dir>` | 🔴 Destructive | 1. Create project. 2. Import all videos. 3. For each video: create sequence, insert clip, pair with `.srt`, generate MOGRT captions. 4. Return batch report. |
| `freexan_bulk_setup_project` | `freexan bulk setup <dir>` | 🔴 Destructive | 1. Create project. 2. Import & auto-classify media into bins. 3. Create rough-cut sequences for every video asset. 4. Return project summary. |
| `freexan_bulk_export_sequences` | `freexan bulk export` | 🟡 Modifying | Queue all sequences for batch Media Encoder render. Return render report. |

### Level 2: ⚙️ Workflow Sequences (Intermediate Multi-Step Actions)

Execute a logical editing milestone by chaining multiple Premiere and ExtendScript actions together. High-level orchestration is the AI's responsibility; freeXan handles the atomic steps.

**Planned Workflow Sequences:**

| Tool | CLI | Risk | Description |
|---|---|---|---|
| `freexan_workflow_init_project` | `freexan workflow init <name>` | 🔴 Destructive | Create project folder + `.prproj` + open + immediately import specified media. One atomic step. |
| `freexan_workflow_caption_sequence` | `freexan workflow caption` | 🔴 Destructive | *(Current `freexan_caption_generate`)* — SRT → phrases → MOGRT clips across V1/V2. |
| `freexan_workflow_score_sequence` | `freexan workflow score` | 🔴 Destructive | Search audio library by keyword/mood → select top result → import → place on specified audio track. |
| `freexan_workflow_add_title` | `freexan workflow title` | 🔴 Destructive | Search MOGRT library for title template → import → place at playhead on top video track → update text property. |

### Level 3: 🔧 Micro Tools (Atomic Primitives)

Single-responsibility, granular tools. The building blocks for everything above.

**Full Micro Tool Catalog (Existing + Planned):**

| Scope | MCP Tool | CLI | Exists? | Risk | Description |
|---|---|---|---|---|---|
| `app` | `freexan_app_status` | `freexan status` | ✅ Live | 🟢 Safe | App + Premiere connection status |
| `app` | `freexan_app_list_clients` | `freexan clients` | ✅ Live | 🟢 Safe | List all clients |
| `app` | `freexan_app_list_funnels` | `freexan funnels [--client X]` | ✅ Live | 🟢 Safe | List funnels (all or by client) |
| `app` | `freexan_app_list_tasks` | `freexan tasks [--client X] [--funnel Y]` | ✅ Live | 🟢 Safe | List tasks (all or scoped) |
| `app` | `freexan_app_list_templates` | `freexan templates` | ✅ Live | 🟢 Safe | List folder templates |
| `app` | `freexan_app_create_project` | `freexan new <name>` | ✅ Live | 🔴 Destructive | Create project folder + `.prproj` |
| `app` | `freexan_app_open` | `freexan open <path>` | ✅ Live | 🟡 Low-risk | Open path in OS shell |
| `app` | `freexan_app_list_mogrts` | `freexan mogrts` | ✅ Live | 🟢 Safe | Search/browse MOGRT library |
| `app` | `freexan_app_list_audio` | `freexan audio` | ✅ Live | 🟢 Safe | Search/browse Audio library |
| `link` | `freexan_link_import_files` | `freexan import <files...>` | ✅ Live | 🔴 Destructive | Import files into active Premiere project |
| `link` | `freexan_link_create_bin` | `freexan link create-bin <name> [--path P]` | ✅ Live | 🔴 Destructive | Create a bin in the Premiere project panel |
| `link` | `freexan_link_create_sequence` | `freexan link create-seq <name>` | ✅ Live | 🔴 Destructive | Create a new sequence in Premiere |
| `link` | `freexan_link_list_bins` | `freexan link bins` | ✅ Live | 🟢 Safe | List bins in active Premiere project |
| `link` | `freexan_link_premiere_status` | `freexan link status` | ✅ Live | 🟢 Safe | Check active Premiere project name, path, sequence |
| `caption` | `freexan_caption_ping` | `freexan caption ping` | ✅ Live | 🟢 Safe | Caption panel health check |
| `caption` | `freexan_caption_generate` | `freexan caption generate` | ✅ Live | 🔴 Destructive | Full caption run (SRT → MOGRT clips on V1/V2) |
| `bloomx` | `freexan_bloomx_insert_mogrt` | `freexan bloomx insert <id>` | 🔲 Planned | 🔴 Destructive | Insert a MOGRT clip at playhead |
| `audio` | `freexan_audio_insert_track` | `freexan audio insert <id>` | 🔲 Planned | 🔴 Destructive | Insert audio file into active sequence |

---

## 11. AI Safety & Risk Classification

All MCP tool schemas MUST communicate risk clearly to AI assistants.

| Risk Level | Symbol | Rule |
|---|---|---|
| Safe / Read-Only | 🟢 | AI may call autonomously. No user confirmation required. |
| Low-Risk / Launching | 🟡 | AI should mention what it's about to open but may proceed. |
| Destructive / Modifying | 🔴 | AI **MUST** confirm with user before calling. These tools write to disk, move files, or modify the Premiere timeline. |

---

## 12. Independent Documentation Rule

Per `documentation_update.md` — after EVERY code change:

1. **`docs/logs/CHANGELOG.md`** — Log the change with version, date, and summary.
2. **`docs/logs/DEV_LOG.md`** — Log architectural decisions and debug findings.
3. **`docs/logs/NAVIGATION_LOG.md`** — Log new files, functions, and message types discovered.
4. **`mcp/README.md`** — Update independently whenever MCP tools change.
5. **`cli/README.md`** — Update independently whenever CLI commands change.
6. **CEP Plugin docs** — Each CEP plugin in `/CEPs/` must maintain its own documentation.

---

## 13. Key Known Constraints & Gotchas

| Constraint | Detail |
|---|---|
| Ports are hardcoded | HTTP: `4555`, WebSocket: `4554`. Changing either requires updating `main.js`, `httpApi.js`, all CEP `ext.js` files, MCP `server.js`, and CLI `freexan.js`. |
| `evalScript` silent failures | Named functions in `hostscript.jsx` can silently fail in CEP. Always use inline IIFEs in `ext.js` for critical operations. |
| `rootItem.children` readiness | `app.project.rootItem.children` may throw even when `rootItem` exists, during project loading. Always use the readiness probe pattern before bin operations. |
| Adaptive timing in bin creation | Premiere Pro takes 200–400ms to update `rootItem.children` after `createBin()`. `setupFromPremiereTree` measures elapsed time and uses it as the adaptive delay for the next operation. |
| Audio panel has no `plugin_action` handlers | `audio.js` receives WS messages but does not handle `plugin_action` type. Adding MCP/CLI audio insertion requires adding this handler in the CEP `audio.js`. |
| BloomX panel has no `plugin_action` handlers | Same as audio — `bloomx` registers but has no action dispatcher. Requires implementing the handler in BloomX's React/dist code via `/CEPs/MISTER_BloomX/`. |
| Plugin folder protection | `/plugins/` is LOCKED. Any BloomX or Audio CEP changes must be made in `/CEPs/MISTER_BloomX/` and `/CEPs/Audio_freeXan/` respectively. |
| MCP HTTP timeout | 200s total on the MCP HTTP client. Caption generation has a 180s plugin timeout. No room for additional bulk operations inside a single `plugin_action` dispatch without raising timeouts. |
| MOGRT Tint Correlation | `MISTER_BloomX` and `freeXan_Caption` use the same deterministic tint algorithm based on MOGRT base name. This is a design invariant — do not change either side independently. |

---

## 14. Transcriber Sandbox (`/transcriber_sandbox/`)

Isolated AI transcription engine test environment (Phase 1). Not yet integrated into the main freeXan pipeline.

**Components:**
- `core_engine.py` — WhisperX / faster-whisper backend. Loads audio, transcribes, aligns word timestamps.
- `modal_aligner.py` — Modal-based alignment helper.
- `sarvam_proxy_server.js` — Local zero-dependency proxy server for Sarvam AI Cloud Transcriber.
- `sarvam_minimal_test.html` — Test UI for Sarvam transcription.
- `setup_sandbox.bat` — Python environment setup script.

**Transcription Providers tested:** faster-whisper (local), Sarvam AI (cloud), Groq (cloud).

**Future Integration Path:** When bulk production macros are built, `freexan_bulk_caption_folder` will optionally call the transcription engine if no matching `.srt` file is found alongside a video.

---

## 15. Current Implementation Status & Roadmap

### Live in CLI/MCP (v3.8.25):
- `app` scope: `status`, `list_clients`, `list_funnels`, `list_tasks`, `list_templates`, `create_project`, `open`, `list_mogrts`, `list_audio`
- `link` scope: `import_files`, `create_bin`, `create_sequence`, `list_bins`, `premiere_status`
- `caption` scope: `ping`, `generate`

### Phase 2 (Next Planned — Micro Tools Expansion):
- `bloomx` scope: `insert_mogrt` (requires CEP plugin_action handler)
- `audio` scope: `insert_track` (requires CEP plugin_action handler)

### Phase 3 (Future — Workflow & Bulk Production):
- `workflow` scope: `init_project`, `caption_sequence`, `score_sequence`, `add_title`
- `bulk` scope: `caption_folder`, `setup_project`, `export_sequences`
- Transcriber integration into bulk caption pipeline
