# NAVIGATION LOG — freeXan by BloomX

**Purpose:** Map for agents, developers, and non-coder users.  
Use this file to find: which file does what, which function controls which feature.  
**Version:** v3.5.4 | **Last Updated:** 2026-06-24

---


[2026-06-25] Rewrote Add Word, Remove Word, and Reset Progression logic in 	imeline.jsx and WordEditGroup.tsx.

[2026-06-24] Implemented 'Save WBW Srt.' and 'Save Phrased Srt.' functionality within EditView.tsx and a new utility file exportUtils.ts.
## Quick Index

| I want to change… | Go to file |
|---|---|
| How projects are created (folders, template, open Premiere) | `main.js` → `create-project` handler (~line 622) |
| The Builder form (dropdowns, live preview, submit) | `renderer/builder.js` → `bindBuilderEvents()`, `updatePreviews()` |
| The Builder folder tree preview | `renderer/builder.js` → `refreshBuilderTree()`, `renderBuilderTree()` |
| Progressive reveal of funnel/task dropdowns | `renderer/builder.js` → `bindBuilderEvents()` (fgFunnel/fgTask logic) |
| Initials-first keystroke search in dropdowns | `renderer/builder.js` → `enableInitialsSearch()` |
| The floating overlay appearance + states | `renderer/overlay.html`, `renderer/overlay.css` |
| Overlay drag-to-expand / drop detection logic | `renderer/overlay.js` |
| Overlay window drag-to-reposition (mouse move) | `renderer/overlay.js` → mousedown/mousemove handlers |
| The drag-drop file sorting + bin routing logic | `main.js` → `import-dropped-files` handler (~line 925) |
| Browser image URL drop (images dragged from Chrome) | `main.js` → `import-browser-image` (~line 1033), `renderer/overlay.js` → `onUrlsDropped` |
| How files get imported into Premiere | `plugins/Link_freeXan/ext.js` → `ws.onmessage` `import` handler |
| Premiere bin + sequence creation algorithm | `plugins/Link_freeXan/ext.js` → `setupFromPremiereTree()`, `setupProjectBinsAndSequences()` |
| The CEP panel UI inside Premiere | `plugins/Link_freeXan/panel.html` |
| WebSocket messages between app and Premiere | `main.js` → `startWebSocketServer()`, `plugins/Link_freeXan/ext.js` → `connectWebSocket()` |
| CEP extension version checking / reload | `main.js` → `EXPECTED_EXT_VERSION`, `plugins/Link_freeXan/ext.js` → `EXT_VERSION` (must match) |
| Database tables / schema | `db.js` → `initSchema()` |
| Folder Structure Templates (tree editor, bin/seq builder) | `renderer/folder-templates.js` → `bindFtsEvents()`, `loadFtsTemplates()` |
| File template open-mode toggle (Copy to new / Open existing) | `renderer/index.html` → `#fts-openmode-toggle`; logic in `renderer/folder-templates.js` → `selectFtsTemplate()`, `enterFtsEditMode()`, `exitFtsEditMode()`, `saveFtsTemplate()` |
| Folder template node tree (DB-side) | `db.js` → `folderTemplatesApi` |
| Slot map (file type → folder + bin routing at drop time) | `main.js` → slot map write in `create-project`, `getDestSubfolder()` |
| Seeded clients list | `scripts/seed-db.js` |
| Settings (workspace dir, auto-popup, seq resolution/fps) | `renderer/settings.js` → `bindSettingsEvents()`, `main.js` → `save-config`/`get-config` |
| UI theme colors, layout | `renderer/styles.css` |
| App startup, tray, CEP install | `main.js` → `app.whenReady()` (~line 1233) |
| Startup at boot (login item) | `main.js` → `app.setLoginItemSettings()` |
| NSIS installer customization | `build/installer.nsh`, `electron-builder.yml` |
| Plugin selection page (installer) | `build/installer.nsh` → `PluginsPageCreate`, `PluginsPageLeave` |
| Which CEP plugins get installed at runtime | `main.js` → `installCEPExtension()`, reads `plugins-enabled.json` |
| Plugin destination folder name (ExtensionBundleId) | `main.js` → `getBundleIdFromManifest()` reads `CSXS/manifest.xml`; install path is `%APPDATA%\Adobe\CEP\extensions\<bundleId>\` |
| Pre-rebrand bundle-id cleanup (e.g. SubMachine's old `com.aescripts.submachine`) | `main.js` → `LEGACY_BUNDLE_IDS` map, swept in `installCEPExtension()` |
| Skip a plugin for one launch (`npm start SubMachine`) | `main.js` → `getCliSkipSet()`, applied in `getEnabledPluginsMap()` |
| Plugin folder layout / bundle IDs | `plugins/README.md`, `plugins/*/CSXS/manifest.xml` |
| Sequence preset files (.sqpreset) | `plugins/Link_freeXan/sqpersets/` |
| Brand colors, logo, tone of voice | `Brand Guidelines/free_xan_complete_brand_guidelines.md` |
| Date/time variables (`{Year}`, `{Month}`, etc.) | `main.js` → `resolveVars()`, `renderer/utils.js` → `resolveVars()` (mirrored) |
| Watched folders list / settings mapping | `renderer/settings.js` → `refreshWatchedFoldersList()`, `audioDb.js` |
| Watched MOGRT folders (MisterBloomX) settings UI | `renderer/settings.js` → `refreshMogrtFoldersList()`, `mogrtDb.js` |
| Audio files database / SQLite schema | `audioDb.js` → `initSchema()`, `audioApi` |
| Background directory watching / scanner | `audioWatcher.js` → `watchDirectory()`, `scanDirectory()`, `generatePeaks()` |
| Audio Library CEP panel layout / HTML structure | `plugins/Audio_freeXan/audio.html` |
| Audio panel controller, custom trim handles, & waveform spikes | `plugins/Audio_freeXan/audio.js` → `initPlayer()`, `drawWaveform()` |
| Audio player drawer and search/card grid styles | `plugins/Audio_freeXan/audio-player.css` |
| HTTP API door for CLI + MCP (port 4555) | `httpApi.js` → `startHttpApi()`, `handleRequest()` |
| Plugin bridge (CLI/MCP → individual CEP plugin) | `main.js` → `pluginConnections`, `dispatchToPlugin()`, `POST /plugin-action` in `httpApi.js` |
| One-shot Caption workflow (parse SRT + render captions) | `CEPs/freeXan_Caption/panel/jsx/core/mogrt.jsx` → `runCaptionWorkflow(args)` |
| Caption plugin MCP/CLI action dispatcher | `CEPs/freeXan_Caption/panel-src/src/lib/captionMcpHandlers.ts` → `dispatchPluginAction()`, action: `caption_create` & `caption_ping` |
| Caption plugin WS `plugin_action` listener | `CEPs/freeXan_Caption/panel-src/src/hooks/useFreeXanWs.ts` → onmessage `plugin_action` branch |
| CLI commands (`freexan status`, `clients`, `new`, …) | `cli/freexan.js` |
| MCP tools for Claude Code | `mcp/server.js` |

---

## File Map

---

### `main.js` — Electron Main Process

**What it does:** The brain of the app. Manages app lifecycle, all IPC communication, the WebSocket server, Premiere detection, project creation pipeline, file import routing, browser image download, folder template resolution, and window management.

**Key global state:**

| Variable | Purpose |
|---|---|
| `EXPECTED_EXT_VERSION` | Must match `EXT_VERSION` in `plugins/Link_freeXan/ext.js` — triggers CEP reload if mismatched |
| `activeProjectPath` | Project path synced from CEP via WebSocket |
| `nativeProjectPath` | Project path parsed from Premiere window title (fallback) |
| `pendingProjectSetup` | `{ projectPath, bins, sequences, premiereTree, assets }` — queued until CEP confirms project is open |
| `isCepConnected` | True when CEP WebSocket connection is live |
| `cepWs` | Live WebSocket socket to the CEP panel |
| `userOpenedManually` | Set when user opens from tray; suppresses monitor auto-hide |
| `appConfig` | Runtime config: `targetDir`, `templateFile`, `folderStructure`, `autoPopup`, `defaultBins`, `defaultSequences`, `seqResolution`, `seqFps` |

**Line Ranges (approximate):**

| Lines | What's there |
|---|---|
| 1–27 | Imports, `EXPECTED_EXT_VERSION`, `dbg()` debug logger (writes timestamped entries to `%APPDATA%/freeXan/debug.log`) |
| 28–46 | `resolveVars()` — replaces `{Year}` `{Month}` `{Date}` `{HH}` `{MM}` `{SS}` tokens in strings |
| 47–88 | Global state variables, `appConfig` defaults, `loadConfig()`, `saveConfig()` |
| 90–166 | `createWindow()`, `createTray()` — frameless window + system tray setup |
| 168–234 | `startPremiereMonitor()` — PowerShell poll every 2500ms; handles autoPopup, CEP-priority suppression |
| 236–298 | `enableCEPDebugging()`, `installCEPExtension()` — sets Adobe PlayerDebugMode, copies CEP folder, removes legacy stale extensions |
| 300–414 | `startWebSocketServer()` — port 4554; handles `ext_hello`, `active_project`, `project_ready`, `ext_log`, `import_result`; manages `pendingProjectSetup` dispatch |
| 416–427 | `updateOverlayUI()` — pushes project name + connection state to overlay window |
| 429–455 | `createOverlayWindow()` — always-on-top 84×84px pill |
| 457–506 | `getDestSubfolder()` — maps file extension → project subfolder (video→Footage, audio→Audio, image→Assets) |
| 508–521 | `flattenPremiereTree()` — converts `bins_json` tree → flat `{ flatBins, flatSeqs }` arrays |
| 522–558 | `buildFolderTree()` — creates disk folders from DB template nodes; tracks slot folders |
| 560–583 | `extractPremiereImports()` — extracts `type='import'` nodes from `bins_json` for `pendingProjectSetup.assets` |
| 585–592 | `convertWithFfmpeg()` — converts unsupported image formats (webp/avif/heic) to PNG using bundled FFmpeg |
| 594–621 | `get-config`, `save-config`, `select-directory`, `select-file` IPC handlers |
| 622–886 | `create-project` IPC handler — full project creation pipeline (see Data Flow below) |
| 888–1031 | `set-ignore-mouse-events`, `resize-overlay`, `move-overlay-window`, `request-status`, `import-dropped-files` |
| 1033–1131 | `import-browser-image` — downloads image from HTTP URL, converts if needed, imports to Premiere |
| 1133–1164 | Database IPC handlers (`db-*` — all delegate to `db.js`) |
| 1166–1193 | `select-files` (multi), Folder Template IPC handlers (`ft-*`) |
| 1197–1282 | Misc IPC (`log-from-preload`, window controls), single-instance lock, app lifecycle (`app.whenReady`) |

**Key functions / handlers:**

| Function / IPC Channel | What it does |
|---|---|
| `dbg(...args)` | Debug logger — timestamped, written to `%APPDATA%/freeXan/debug.log` |
| `resolveVars(str)` | Replaces `{Year}` `{Month}` `{Date}` `{HH}` `{MM}` `{SS}` with current date/time |
| `loadConfig()` | Reads `config.json` from AppData, merges with defaults |
| `saveConfig(data)` | Writes config JSON to AppData |
| `createWindow()` | Creates frameless 800×600 main window, starts hidden |
| `createTray()` | System tray with Open / Quit menu and double-click toggle |
| `startPremiereMonitor()` | PowerShell poll every 2500ms — parses window title for project path; auto-shows/hides main window |
| `enableCEPDebugging()` | Sets `PlayerDebugMode=1` in Adobe CSXS registry keys (CSXS 9-12) |
| `getBundleIdFromManifest(manifestPath)` | Parses `ExtensionBundleId` attribute out of a CEP manifest.xml — used to derive the install folder name |
| `installCEPExtension()` | For each plugin in `plugins/`, reads its `ExtensionBundleId` from manifest, then copies the folder to `%APPDATA%\Adobe\CEP\extensions\<bundleId>\`. Also sweeps the legacy folder-name copy (e.g. `SubMachine`) and any pre-freeXan-rename panels. Matches the standalone `.bat` installers under `CEPs/` so there is exactly one installed folder per plugin regardless of installer used |
| `startWebSocketServer()` | WebSocket server on port 4554; dispatches `pendingProjectSetup` on `active_project`/`project_ready` |
| `updateOverlayUI()` | Sends `overlay-update` IPC to overlay with project name + connection state |
| `createOverlayWindow()` | Creates always-on-top 84×84 overlay pill window |
| `getDestSubfolder(projectFolder, ext, slotMap?)` | Returns the best matching subfolder path for a given file extension |
| `flattenPremiereTree(rawBins, sequencesJson)` | Converts tree-format `bins_json` → flat `{ flatBins, flatSeqs }` |
| `buildFolderTree(basePath, nodes)` | Creates disk folders from template node tree; returns `{ assetsToImport, slotFolders }` |
| `extractPremiereImports(rawBins)` | Extracts `type='import'` nodes from bins_json for asset pre-import |
| `convertWithFfmpeg(inputPath, outputPath)` | Converts image format using bundled FFmpeg binary |
| `ipcMain.handle('create-project')` | Full pipeline: resolve template → mkdir → copy .prproj → build folder tree → queue pendingProjectSetup → write slot map → write README → open in Premiere |
| `ipcMain.handle('import-dropped-files')` | Reads slot map → classifies files → copies to subfolder → WebSocket broadcast to CEP |
| `ipcMain.handle('import-browser-image')` | Downloads image from URL → converts if needed → copies to folder → imports via CEP |
| `ipcMain.handle('db-*')` | All database CRUD (delegates to `db.js`) |
| `ipcMain.handle('ft-*')` | Folder template CRUD + node management (delegates to `db.js → folderTemplatesApi`) |
| `ipcMain.on('resize-overlay')` | 84px (compact) ↔ 244px (expanded) |
| `ipcMain.on('move-overlay-window')` | Repositions overlay by pixel delta |

**Two project creation modes (`create-project`):**

| Mode | Trigger | Behavior |
|---|---|---|
| **Mode B: Open Template** | `folderTemplate.open_mode === 'open_template'` | Opens existing `.prproj` directly; no folder/file is created |
| **Mode A: Create New** | Default | Creates date-hierarchy folder structure, copies `.prproj`, writes slot map + README |

**Date hierarchy path format:**
```
targetDir / {Month}{Year} / {DD} {Month} / Client - Funnel - Task - ProjectName
```

---

### `preload.js` — IPC Security Bridge

**What it does:** Runs in an isolated context. Exposes `window.api` to renderers. Captures file drag-drop events and URL drops from browser tabs.

**`window.api` surface:**

| Method | What it does |
|---|---|
| `saveConfig(config)` / `getConfig()` | Config persistence |
| `selectDirectory()` / `selectFile()` / `selectFiles()` | Native dialog openers |
| `createProject(projectData)` | Invoke `create-project` |
| `openFolder(path)` | Shell open folder |
| `closeWindow()` / `minimizeWindow()` | Window controls |
| `importDroppedFiles(filePaths)` | File drop import |
| `importBrowserImage(url)` | Browser URL image import |
| `onFilesDropped(callback)` | Register drop handler — receives `[filePaths]` |
| `onUrlsDropped(callback)` | Register URL drop handler — fires when image dragged from browser |
| `onOverlayUpdate(callback)` | Receive `{ connected, projectName, nativeProjectName }` from main |
| `onMainWindowShown(callback)` | Fires when main window becomes visible (auto-focuses client dropdown) |
| `requestStatus()` | Ask main to push current overlay state |
| `setIgnoreMouseEvents(ignore, options)` | Mouse passthrough control |
| `resizeOverlay(expanded)` | Expand/collapse overlay pill |
| `moveOverlayWindow(delta)` | Reposition overlay by `{ deltaX, deltaY }` |
| `db.*` | Full database CRUD (clients, funnels, tasks, templates, assets, funnel_tasks) |
| `ft.*` | Folder template CRUD + nodes + assignments (`getAll`, `getNodes`, `create`, `update`, `delete`, `setDefault`, `setNodes`, `getAssignments`, `assign`, `unassign`, `clone`, `getDefault`, `selectAsset`) |

---

### `db.js` — SQLite Database Layer

**What it does:** All database operations. Initializes SQLite, creates tables, runs migrations, and exports API objects for every CRUD operation.

**Database file:** `%APPDATA%/freeXan/project-builder.db`

**Schema:**
```
clients         (id, name, initials, created_at)
funnels         (id, client_id→clients [nullable], name, initials, created_at)
tasks           (id, name [UNIQUE], initials, created_at)
funnel_tasks    (client_id→clients, funnel_id→funnels, task_id→tasks) — PK triple
templates       (id, client_id→clients, funnel_id→funnels, name, file_path)
assets          (id, client_id→clients, funnel_id→funnels, name, file_path, category, tags)

folder_templates         (id, name, is_default, prproj_path, open_mode, bins_json, sequences_json, created_at)
folder_template_nodes    (id, template_id→folder_templates, parent_id→self, node_type, name, asset_path, slot_type, sort_order)
folder_template_assignments (id, template_id→folder_templates, client_id→clients, funnel_id→funnels, task_id→tasks)
```

**`node_type` values in `folder_template_nodes`:**

| Type | Purpose |
|---|---|
| `folder` | Creates a disk folder at project creation |
| `slot` | Tags parent folder as routing destination for `slot_type` media (video/audio/image) |
| `asset` | Copies `asset_path` file/folder into project at creation; imports into Premiere |

**`open_mode` values in `folder_templates`:**

| Value | Behavior |
|---|---|
| `copy_to_new` | (Mode A) Creates new folder + copies template `.prproj` |
| `open_template` | (Mode B) Opens the template `.prproj` directly |

**Exported API objects:**

| Object | Key functions |
|---|---|
| `clientsApi` | `getAll`, `add`, `update`, `delete`, `nameConflict` |
| `funnelsApi` | `getAll` (all funnels), `getByClient(clientId)`, `add`, `update`, `delete`, `scopeConflict` |
| `tasksApi` | `getAll`, `add`, `update`, `delete`, `nameConflict`, `getForFunnel(clientId, funnelId)`, `setForFunnel(clientId, funnelId, taskIds)` |
| `templatesApi` | `getAll`, `add`, `delete`, `resolve(clientId, funnelId)` — priority: funnel > client > null |
| `assetsApi` | `getAll`, `add`, `delete`, `getPresets(clientId, funnelId)` — returns funnel-scoped first, then client-level |
| `folderTemplatesApi` | `getAll`, `getDefault`, `create`, `update`, `delete`, `setDefault`, `getNodes(id)`, `setNodes(id, nodes)`, `getAssignments(id)`, `assign`, `unassign`, `resolve(clientId, funnelId, taskId)`, `clone(id)` |

**Template resolution priority (`folderTemplatesApi.resolve`):**
```
client + funnel + task → client + funnel → client only → null (caller uses getDefault())
```

**Helper functions:**
- `deriveInitials(name)` — auto-generates initials from name (multi-word: first letter each word; single-word: first 3 chars)
- `autoFillInitials(tableName)` — backfills empty `initials` columns on migration

---

### `audioDb.js` — SQLite Audio Database Layer

**What it does:** Dedicated database interface for audio libraries and directory watchers. Handles schema definitions, folder mappings, and caching metadata for audio files (including pre-computed downsampled peaks).

**Database file:** `%APPDATA%/freeXan/audio-library.db`

**Schema:**
```
watched_folders   (id, folder_path [UNIQUE])
audio_files       (id, file_path [UNIQUE], name, duration [REAL], tags, is_favorite, use_count, category, peaks)
```

**Exported API objects:**

| Object | Key functions |
|---|---|
| `foldersApi` | `getAll()`, `add(folderPath)`, `delete(id)` (automatically triggers cascaded cleanup of related cached audio files) |
| `audioApi` | `getAll(search, favoritesOnly)`, `upsert(filePath, name, duration, category, peaks)`, `deleteByPath(filePath)`, `toggleFavorite(id)`, `updateTags(id, tags)`, `incrementUseCount(id)` |

---

### `audioWatcher.js` — Directory Watcher & File Classifier

**What it does:** Electron background scanner module. Watches directories for added/modified/deleted audio files recursively using `fs.watch`. Classifies folders, parses duration metadata, and spawns `ffmpeg` streams to extract peak configurations.

**Key functions / helpers:**

| Function | What it does |
|---|---|
| `watchDirectory(folderId, dirPath, onChangeCallback)` | Spawns background worker tracking directory path recursively; registers changes |
| `scanDirectory(dirPath)` | Recursively iterates directories to index and add valid audio extensions |
| `isAudioFile(filePath)` | Validates file extensions (`.mp3`, `.wav`, `.aac`, `.m4a`, etc.) while excluding hidden directories like `.peaks` |
| `getCategory(filePath, duration)` | Classifies audio files (`bgm` vs `sfx`) based on folder names or duration > 30s |
| `generatePeaks(filePath)` | Runs asynchronous `ffmpeg` mono channel analysis at 4,000Hz. Compresses outputs into 150-element Float arrays. Writes `.pk2` peak cache json files to a hidden `.peaks/` folder under the watched folder |

---

### `renderer/index.html` — Main Window UI

**What it does:** HTML shell for the 800×600 main window. Sidebar nav + four content tabs: Builder, Settings, Library, Database. Custom frameless titlebar.

| Section | What's in it |
|---|---|
| `.titlebar` | Draggable titlebar with logo + minimize/close buttons |
| `.sidebar` / `.nav-menu` | Navigation items with sliding active-bar indicator |
| `#tab-builder` | Builder: client/funnel/task selects, project name input, live preview, folder tree preview, create button |
| `#tab-settings` | Workspace dir, auto-popup toggle, sequence resolution + fps |
| `#tab-library` | Folder Structure Templates editor (fts-* UI) |
| `#tab-database` | Clients/Funnels/Tasks/Templates/Assets management panels |

---

### Renderer Scripts — Load Order

`renderer/index.html` loads 6 scripts in order. All share the browser global scope — no bundler. Functions in early files can reference DOM refs and state from `app.js` (loaded last) because those values are only read inside event handlers and DOMContentLoaded, never at parse time.

```
utils.js → builder.js → settings.js → database-tab.js → folder-templates.js → app.js
```

---

### `renderer/app.js` — Global State + DOM Refs + Boot

**What it does:** Declares all shared global state variables and DOM element references, then runs DOMContentLoaded to wire everything together. No logic lives here — just the glue.

**Global state declared here:**

| Variable | Purpose |
|---|---|
| `configState` | Runtime config object (targetDir, templateFile, autoPopup, etc.) |
| `dbClients` | All clients from DB — shared across tabs |
| `dbFunnels` | All funnels — used by builder and folder-templates |
| `dbTasks` | All tasks — master list for manage panel and dropdowns |
| `ftTemplates`, `ftActiveId`, `ftTree` | Old FT editor state |
| `builderTreeNodes`, `defaultBuilderNodes` | Folder tree preview nodes |
| `ftsTemplates`, `ftsActiveId`, `ftsTree`, `ftsPremiere` | FTS editor state |
| `ftsEditMode`, `seqModalParentId` | FTS UI flags |

**DOMContentLoaded sequence:** minimise/close → version chip → tab nav → `bindBuilderEvents` → `bindSettingsEvents` → `bindDatabaseEvents` → `bindFolderTemplateEvents` → `bindFtsEvents` → `loadAndApplyConfig` → `loadBuilderDropdowns` → `loadFolderTemplates` → `loadFtsTemplates` → `refreshBuilderTree` → initials search → focus client.

---

### `renderer/utils.js` — Shared Utilities

**What it does:** Pure helper functions and DOM utilities shared across all other renderer files.

| Function | What it does |
|---|---|
| `updateNavIndicator()` | Moves the sidebar active-bar indicator to match selected nav item |
| `animatePreviewValue(el, text)` | Typewriter animation for preview text — caps at 200ms total |
| `clientHue(name)` | Hashes client name → HSL hue for avatar background color |
| `resolveVars(str)` | Date/time token resolver — `{Year}` `{Month}` `{Date}` `{HH}` `{MM}` `{SS}` |
| `hasInvalidChars(str)` | Returns true if string contains Windows-illegal filename chars (ignores `{Variable}` tokens) |
| `SLOT_META` | Constant — `{ video, audio, image }` with label/icon/color per slot type |
| `usedFolderSlots()` | Returns Set of slot types already placed in `ftsTree` |
| `usedBinSlots()` | Returns Set of slot types already placed in `ftsPremiere` |
| `binSlotOwners()` | Returns `{ slotType → binName }` map for picker "in 'BinName'" hints |
| `_closePicker()` | Closes and cleans up any currently open slot/asset picker popover |
| `openPickerNearButton(picker, btn)` | Mounts picker as fixed-position overlay anchored below a button |
| `buildSlotPicker(usedSet, onPick, ownSlots?, owners?)` | Builds slot-type picker popover (Video/Audio/Image) |
| `buildAssetPicker(onPick)` | Builds async asset-picker popover populated from DB assets library |
| `showErr(el, msg)` | Shows inline error text in a DB edit error box |
| `escapeHtml(s)` / `escapeAttr(s)` | HTML escaping for safe DOM injection |
| `showStatusMessage(msg, type)` | Shows success/error status in the sidebar `#save-status` footer |
| `populateClientSelect(selectEl, clients, placeholder)` | Fills a `<select>` with `"Name (INITIALS)"` client options |

---

### `renderer/builder.js` — Builder Tab

**What it does:** All logic for the Builder tab — dropdown loading, progressive reveal, keyboard flow, form submit, manage-tasks panel, live path preview, and folder tree preview.

| Function | What it does |
|---|---|
| `loadBuilderDropdowns()` | Loads all clients/funnels/tasks from DB; fills selects |
| `refreshTaskDropdownForPair()` | Loads tasks attached to current (client + funnel) pair; disables if pair incomplete |
| `fillSelectWithInitials(selectEl, rows, placeholder)` | Renders options as "Name (INITIALS)", stores initials in `dataset` |
| `enableInitialsSearch(selectEl)` | Keydown — typing "AK" jumps to initials match; 1200ms buffer reset |
| `refreshFunnelDropdown()` | Filters funnel list by selected client; preserves previous selection |
| `getSelectedClientData()` | Returns full client object from `dbClients` for the selected client |
| `updateTemplateHint()` | Shows resolved `.prproj` template name below the funnel dropdown |
| `_projectMemoryKey()` / `loadProjectMemory()` / `saveProjectMemory()` | Persist last-used Project Name per client+funnel pair in localStorage |
| `bindBuilderEvents()` | All Builder tab events: progressive reveal, Enter-key flow, token chips, manage panel, form submit |
| `openManagePanel()` / `closeManagePanel()` / `saveManagedTasks()` | Inline task assignment panel for current client+funnel pair |
| `switchToTab(tabId)` | Programmatically switches to a tab and updates nav indicator |
| `focusClientDropdown()` | Switches to Builder tab and focuses the client select |
| `updatePreviews()` | Rebuilds live date-path, folder name, and filename previews |
| `refreshBuilderTree()` | Resolves which template to show (default or assigned); calls renderBuilderTree |
| `renderBuilderTree(fileName)` / `renderBuilderTreeNode(node, fileName, depth)` | Renders animated folder tree preview |

**Progressive reveal flow:**
```
Client selected → funnel reveals → Funnel selected → task reveals
Enter on client → focus funnel
Enter on funnel → load tasks → focus task (or project name)
Enter on task → focus project name → submit → create project
```

---

### `renderer/settings.js` — Settings Tab

**What it does:** Settings tab bindings, config load/save, watched folders list.

| Function | What it does |
|---|---|
| `loadAndApplyConfig()` | Reads config from main process, populates settings fields, calls `updatePreviews` |
| `savePathSettings()` | Auto-saves workspace dir + all config fields on directory pick or field change |
| `refreshWatchedFoldersList()` | Loads watched audio folders from DB and renders the list with delete buttons |
| `makeListRow(name, onRemove)` | Builds a structure-row element with a remove button |
| `bindSettingsEvents()` | Wires directory picker, auto-save on input change, Save button, watched folder Browse button |

---

### `renderer/database-tab.js` — Database Tab (Library)

**What it does:** All CRUD for the Library tab — clients, funnels, tasks, and assets. Inline editing (double-click), drag-drop path inputs, scope-based filtering. The legacy "Project File Templates" UI section (add-form + list) was removed in v2.9.10 — `.prproj` templates are now managed entirely through the Templates section (FTS editor).

| Function | What it does |
|---|---|
| `bindPathInputDrop(inputEl, opts?)` | Enables drag-drop onto a path input — sets `value` from `webUtils.getPathForFile` |
| `bindDatabaseEvents()` | All add-button handlers, client-select change listeners, browse buttons, drag-drop setup |
| `refreshDatabaseTab()` | Loads all clients and re-renders all four list panels (clients, funnels, tasks, assets) |
| `refreshFunnelsList()` / `refreshTasksList()` / `refreshAssetsList()` | Individual list refreshers |
| `refreshAssetsFunnelDropdown()` | Populates funnel scope selector filtered by selected client |
| `renderClientsList()` / `makeClientRow()` / `enterClientEdit()` | Client list — renders rows, handles double-click inline edit |
| `renderFunnelsList()` / `makeFunnelGroupRow()` / `enterFunnelGroupEdit()` | Funnel list — groups same-name funnels into one card with per-client scope chips |
| `makeFunnelRow()` / `enterFunnelEdit()` | Single-funnel row helpers (kept for backwards compat) |
| `renderTasksList()` / `makeTaskRow()` / `enterTaskEdit()` | Task list — renders rows, handles inline edit |
| `renderAssetsList()` / `makeAssetRow()` / `enterAssetEdit()` | Asset list — renders rows with inline edit including Browse + drag-drop on path field |

---

### `renderer/folder-templates.js` — Folder Template + FTS Editors

**What it does:** Two template editors — the old single-template FT editor (Settings-tab based) and the full FTS editor in the Library tab (multi-template list, assignment by client/funnel/task, Premiere bins/sequences tree, slot routing).

**Old FT editor functions:**

| Function | What it does |
|---|---|
| `loadFolderTemplates()` | Loads all templates into the FT select dropdown; populates client assignment dropdown |
| `loadFtTemplateData(id)` | Loads nodes + prproj path for a specific template; renders tree and assignments |
| `renderFtTree()` / `renderFtNode(node, depth)` | Renders the FT folder tree with toggle, rename-on-dblclick, add/remove actions |
| `ftAddFolderNode(parentId)` / `ftAddAssetNode(parentId, path)` | Adds a node to in-memory `ftTree` |
| `ftRemoveNode(nodeKey)` / `ftRenameNode(nodeKey, newName)` | Mutates in-memory `ftTree` |
| `ftBuildSavePayload()` | Builds flat topological-order array for `ft.setNodes` |
| `saveFolderTemplate(templateId)` | Saves nodes + prproj + open_mode to DB |
| `renderAssignments(templateId)` / `refreshFtAssignFunnels()` | Renders current client/funnel assignments with remove buttons |
| `bindFolderTemplateEvents()` | Wires all FT editor buttons (new, set-default, delete, browse, save, save-as-new, assign) |

**FTS editor functions:**

| Function | What it does |
|---|---|
| `loadFtsTemplates()` | Loads all templates; pre-loads default nodes for builder tree; calls `renderFtsList` + `populateFtsDropdowns` |
| `renderFtsList()` | Renders the left-side template list with filter + delete buttons; file-type templates show `.prproj` basename chip |
| `populateFtsDropdowns()` | Populates assignment + filter selects with current clients/funnels/tasks |
| `refreshFtsFilterFunnels()` / `refreshFtsFilterTasks()` | Updates filter dropdowns when client/funnel filter changes |
| `refreshFtsFunnels()` / `refreshFtsTasks()` | Updates edit-mode assignment dropdowns |
| `selectFtsTemplate(id)` | Loads and displays a template — nodes → `ftsTree`, bins → `ftsPremiere`, sets assignment dropdowns |
| `renderFtsTree()` / `renderFtsNode(node, depth)` | Renders folder tree (slot nodes, locked nodes, edit-mode actions) |
| `renderLockedPrprojNode(depth)` | Renders the always-locked `project.prproj` placeholder inside `01_Project_Files` |
| `renderPremiereTree()` / `renderPremiereNode(node, depth)` | Renders Premiere bins/sequences/imports tree with slot badges and edit-mode actions |
| `addPremiereBin(parentId)` | Adds a bin to `ftsPremiere` and focuses its name for immediate rename |
| `openSeqModal(parentId)` / `closeSeqModal()` / `confirmAddSequence()` | Sequence creation modal with resolution tiles |
| `enterFtsEditMode()` / `exitFtsEditMode(cancelled)` | Toggle edit mode — enables/disables inputs and shows/hides action buttons |
| `saveFtsTemplate()` | Saves name, nodes, Premiere tree, and assignment to DB; handles shared-template conflict dialog |
| `switchFtsTab(tab)` | Switches between 'folder' and 'premiere' sub-tabs |
| `bindFtsEvents()` | Wires all FTS buttons, filter changes, add-root row, modal events, dimension tiles |

---

### `renderer/overlay.html` — Drag-Drop Overlay Window

**What it does:** The floating always-on-top pill window. Idle with no project: compact orb (84×84). With a project: stays expanded showing project name + "Drop Media". On drag: shows "Drop to add". On drop: success/error feedback.

| Element | What it does |
|---|---|
| `#overlay-pill` | Root container — receives CSS state classes (`has-project`, `drag-active`, `processing`, `success`, `error`) |
| `#status-dot` | Green dot (connected/project known) / muted dot (no project) |
| `#status-text` | Primary line: "Drop Media", "Drop to add", "Copying…", "Imported", "Failed" |
| `#project-text` | Secondary line: project name, "Please wait", error message, "Detecting…" |

---

### `renderer/overlay.js` — Overlay State Machine

**What it does:** Controls the overlay pill — window repositioning, drag-expand logic, file/URL drop handling, state animations, and status updates from main.

| Function / Event | What it does |
|---|---|
| `mousedown` + `mousemove` + `mouseup` | Drag the pill anywhere on screen; sends `moveOverlayWindow({ deltaX, deltaY })` to main |
| `mousemove` passthrough (rAF throttled) | Hit-tests cursor against pill rect; calls `setIgnoreMouseEvents` so clicks pass through empty space |
| `window.addEventListener('dragover')` | Hit-tests cursor against pill; starts 500ms expand timer when cursor enters pill zone |
| Collapse timer | 1500ms after drag leaves pill or window — collapses back to idle |
| `window.addEventListener('dragend')` | Cancels timers, resets to idle if drag cancelled/escaped |
| `window.api.onFilesDropped(callback)` | Receives `[filePaths]` from preload on file drop → calls `importDroppedFiles` |
| `window.api.onUrlsDropped(callback)` | Receives `[urls]` on browser image drop → calls `importBrowserImage` for each |
| `window.api.onOverlayUpdate(callback)` | Receives `{ connected, projectName, nativeProjectName }` → updates state |
| `setDragActive()` | Expands pill, shows "Drop to add" + project name |
| `setProcessing(label)` | Shows spinner label ("Copying…", "Downloading…") |
| `setSuccess(title, sub)` | Green flush for 800ms, full success for 2200ms, then idle |
| `setError(msg)` | Error state for 3000ms, then idle |
| `restoreIdle()` | Compact orb if no project; expanded "Drop Media" + green dot if project known |
| `hasProject()` | True if either CEP or native monitor has a project path |

**Two project name sources:**
- `currentProjectName` — from CEP WebSocket (`active_project` message) — takes priority
- `nativeProjectName` — from PowerShell window-title monitor — fallback

---

### `renderer/styles.css` — Main Window Theme

**What it does:** Complete visual styling for `index.html`. Dark glassmorphism theme with brand CSS variables, motion system, and all component styles.

**CSS Variables (`:root`):**

| Variable | Value / Purpose |
|---|---|
| `--bg-app` | `#0B0B12` — Deep Space Black |
| `--bg-sidebar` | `#171821` — Graphite |
| `--accent-color` | `#7B4DFF` — Primary Purple |
| `--accent-hover` | `#9F6BFF` — Electric Violet |
| `--success` | `#10D28F` |
| `--danger` | `#FF5A7A` |
| `--warning` | `#FFB547` |
| `--text-main` | `#F5F7FB` — Frost White |
| `--text-muted` | `#9A9DAC` |
| `--gradient-primary` | `135deg, #7B4DFF → #B084FF` |
| `--ease` | `cubic-bezier(0.22, 1, 0.36, 1)` |

**Key component classes:**

| Class | What it controls |
|---|---|
| `#nav-active-bar` | Sliding vertical indicator bar in sidebar — animated with spring cubic-bezier |
| `.card` | Glassmorphism panel — `backdrop-filter: blur`, dark bg |
| `.btn-primary` | Purple gradient button with shimmer sweep on hover |
| `.btn-primary.btn-loading` | Pulse animation during project creation |
| `.btn-primary.btn-done` | Green flash on success |
| `.preview-box` | Terminal-style output block with scan-line grid |
| `.preview-value` | JetBrains Mono monospace — path/filename display |
| `.manage-panel` | Inline task assignment panel |
| `.db-list-item[data-editable]` | Hover highlight; double-click opens inline edit |
| `.ft-node` / `.ft-slot-node` | Folder template tree nodes |
| `.slot-picker` / `.slot-picker-btn` | Slot-type popover (Video/Audio/Image) |
| `.modal-overlay` / `.modal-card` | Sequence creation modal |
| `.dim-tile` | Resolution picker tiles in modal |
| `.input-invalid` | Red border/glow on invalid Windows filename chars |
| `#form-group-funnel.inactive` / `#form-group-task.inactive` | Dimmed + non-interactive until previous field is filled |

---

### `renderer/overlay.css` — Overlay Pill Theme

**What it does:** Styles the overlay window and all state animations.

| Class | What it controls |
|---|---|
| `.pill` (base) | 56×56px circle, minimal |
| `.pill.has-project` | Expanded to show project name, green dot |
| `.pill.drag-active` | Expanded 216px, purple border, "Drop to add" |
| `.pill.processing` | Expanded, spinner label |
| `.pill.success` | Green (#10D28F) flash, success text |
| `.pill.success-flush` | Bright green glow that fades at 800ms |
| `.pill.error` | Red (#FF5A7A) glow, error text |
| `.pill-dragging` | Cursor: grabbing during reposition drag |

---

### `plugins/Link_freeXan/ext.js` — CEP Premiere Panel Script

**What it does:** JavaScript that runs inside Adobe Premiere Pro's panel. Connects to freeXan WebSocket, tracks active project, handles import and project-setup messages, creates bins and sequences in Premiere via ExtendScript.

**Key constants / state:**

| Var | Value / Purpose |
|---|---|
| `EXT_VERSION` | `'1.9.9'` — must match `EXPECTED_EXT_VERSION` in `main.js` |
| `MAX_RECONNECT` | 30 — stops reconnect attempts after ~90s if server never appears |
| `lastProjectPath` | Last known `.prproj` path — change triggers `active_project` message |
| `projectReadySent` | Guards against duplicate `project_ready` sends per project |
| `reconnectAttempts` | Reset to 0 on successful connection |

**Functions:**

| Function | What it does |
|---|---|
| `extLog(msg)` | Logs to console + forwards to main as `{ type: 'ext_log', msg }` via WebSocket |
| `evalResult(r, label)` | Uniform ExtendScript result checker — returns false and logs on failure |
| `connectWebSocket()` | Connects to `ws://localhost:4554`; sends `ext_hello` with version; reconnects every 3s (up to MAX_RECONNECT) |
| `startProjectTracking()` | `setInterval` every 1000ms — runs `TRACKING_SCRIPT` to poll project state (`READY`/`NOT_READY`/`NONE`) |
| `stopProjectTracking()` | Clears the tracking interval |
| `waitForProjectReady(callback)` | Polls every 300ms (up to 40×) until `rootItem.children` is accessible, then fires callback |
| `setupFromPremiereTree(nodes, seqPreset, onComplete)` | Full bin+sequence creation — DFS traversal, adaptive timing, retry on parent-not-found, per-sequence preset |
| `setupProjectBinsAndSequences(bins, seqs, preset, onComplete)` | Flat bin+sequence creation (legacy fallback when no premiereTree) |

**WebSocket messages handled (`ws.onmessage`):**

| Message type | Action |
|---|---|
| `reload` | `window.location.reload()` — triggered by version mismatch |
| `import` | Runs inline ExtendScript IIFE to call `app.project.importFiles`; routes to named bin via `findBin()` |
| `setup-project` | Waits for rootItem → calls `setupFromPremiereTree` or `setupProjectBinsAndSequences` → then runs asset imports |

**Messages sent to main:**

| Message type | When sent |
|---|---|
| `ext_hello` | On WebSocket open — includes `version` |
| `active_project` | On project path change (including empty string when closed) |
| `project_ready` | When `rootItem.children` becomes accessible for the current path |
| `ext_log` | Debug log forwarding |
| `import_result` | After `importFiles` call — includes result status |

**Bin creation algorithm (`setupFromPremiereTree`):**
```
Phase 1: Root bins — created in sort_order, DFS into children before next root
Phase 2: (within DFS) Nested bins — each waits adaptive T ms after parent confirms
Phase 3: Sequences — created after all bins; moved to parent bin via moveBin()
Adaptive T: updated after each successful createBin() call; minimum 250ms between commands
Retry: up to 8 attempts on "parent not found" errors
```

**Sequence creation cascade (per sequence):**
```
1. createNewSequenceFromPreset  — no dialog (Premiere 2019+ API)
2. QE domain newSequence        — no dialog (unofficial, widely supported)
3. createNewSequence            — shows dialog (last resort)
```

---

### `plugins/Link_freeXan/hostscript.jsx` — ExtendScript (Premiere API)

**What it does:** Runs inside Premiere Pro's ExtendScript engine. Contains utility functions accessible via `csInterface.evalScript()`.

**Note:** As of v2.x the main import and bin-creation logic uses inline IIFE scripts in `ext.js` rather than calling named functions here. Only `getActiveProjectPath()` may still be referenced by legacy code paths.

| Function | What it does |
|---|---|
| `getActiveProjectPath()` | Returns `app.project.path` |
| `importAsset(filePath)` | `app.project.importFiles([filePath], true, rootItem, false)` — legacy, superseded by inline IIFE in ext.js |

---

### `plugins/Link_freeXan/panel.html` — CEP Panel UI

**What it does:** The tiny HTML panel visible inside Adobe Premiere Pro's workspace.

| Element | What it shows |
|---|---|
| `#status-text` + `#pulse` | Connection status text + animated dot |
| `#info-text` | Active project name / current operation / error message |

---

### `plugins/Audio_freeXan/audio.html` — Audio Library Panel UI

**What it does:** HTML layout structure of the Audio Library panel inside Adobe Premiere Pro.

| Section / Element | Purpose |
|---|---|
| `#app-header` | Panel header containing hover-preview and timeline-sync toggles |
| `#sidebar` | Left side folder browser, favorites filter, and BGM/SFX category badges |
| `#audio-grid` | Responsive CSS grid displaying audio track cards with dynamic lazy-loading mini-waveforms |
| `#detail-drawer` | Slide-up bottom media player containing track metadata, Waveform canvases, sliders, and timeline drop triggers |
| `#waveform-container` | Interactive player view housing the custom 1px spikes waveform canvas, playhead, and trim handles |
| `#minimap-wrap` | Mini context overview canvas overlayed with a draggable brush viewport selector |

---

### `plugins/Audio_freeXan/audio.js` — Audio Panel Controller & Native Drag-Drop

**What it does:** Core client scripting layer for the Audio Library panel inside Adobe Premiere Pro. Integrates Tone.js for web-audio processing and custom canvas drawing systems for high-fidelity interactive waveforms.

**Key features:**
- **High-Res Waveform Engine**: Decouples from default WaveSurfer configurations, drawing clean 1px wide vertical spikes. Downsamples 22,050Hz peaks to a stable 8,000 points upon file load, resolving multi-canvas scaling glitches.
- **Audio Previews**: Tracks trim regions, speed changes (0.5x - 2.0x), and pitch shifts (-12 to +12 semitones) in real time using Tone.js nodes.
- **Native OS Drag-Drop & Proxy Swapping**: Captures threshold drags to generate synchronous proxy WAV files. Triggers ExtendScript `changeMediaPath` replacement handlers upon websocket render completion events.
- **IntersectionObserver Grid**: Virtualizes the grid view to paint canvas lines only when tracks slide into active viewport bounds.

---

### `plugins/Audio_freeXan/audio-player.css` — Audio Library Styles

**What it does:** Complete stylesheet for the Audio Library interface. Defines custom dark-mode colors (`#141414` / `#1f1f1f`), dual-accent classification highlights (Violet-to-Coral for BGM, Green-to-Cyan for SFX), trim handle cursors, and layout slide transitions.

---

### `plugins/Link_freeXan/sqpersets/` — Sequence Preset Files

**What it does:** Pre-built `.sqpreset` files used by `setupFromPremiereTree` / `setupProjectBinsAndSequences` in `ext.js` to create sequences without showing the Premiere Pro sequence dialog.

**Available presets:**

| File | Resolution | FPS |
|---|---|---|
| `1920x1080_25fps.sqpreset` | 1920×1080 | 25 |
| `1920x1080_24fps.sqpreset` | 1920×1080 | 24 |
| `1920x1080_30fps.sqpreset` | 1920×1080 | 30 |
| `1080x1920_25fps.sqpreset` | 1080×1920 (vertical) | 25 |
| `1080x1920_24fps.sqpreset` | 1080×1920 (vertical) | 24 |
| `1080x1920_30fps.sqpreset` | 1080×1920 (vertical) | 30 |
| `1080x1080_25fps.sqpreset` | 1080×1080 (square) | 25 |
| `1080x1080_24fps.sqpreset` | 1080×1080 (square) | 24 |
| `1080x1080_30fps.sqpreset` | 1080×1080 (square) | 30 |

**Naming convention:** `{width}x{height}_{fps}fps.sqpreset` — matched by `sequencePreset` field (`seqResolution + '_' + seqFps + 'fps'`) from `appConfig`.  
**To add a new preset:** create the `.sqpreset` in Premiere Pro (Sequence → New Sequence), export it, and drop it here with the correct filename.

---

### `plugins/*/CSInterface.js` — Adobe CEP Bridge (mirrored in each plugin)

**What it does:** Third-party vendor library from Adobe. Bridges the panel HTML/JS with Premiere Pro host. Used for `csInterface.evalScript()`.

**Do not modify.** Update only by replacing with a newer Adobe-provided version.

---

### `plugins/` — CEP Plugin Folder (4 bundles)

**What it does:** Single source-of-truth for every Premiere CEP plugin shipped with freeXan. Each subfolder is an independent CEP bundle with its own `CSXS/manifest.xml`. At install time the user picks which plugins to enable; at app launch `main.js → installCEPExtension()` copies the enabled ones into `%APPDATA%/Adobe/CEP/extensions/`.

| Folder | Bundle ID | Panel ID(s) | What it does |
|---|---|---|---|
| `Link_freeXan/` | `com.bloomx.freexan.link` — do NOT change | `com.bloomx.freexan.link.panel` | Bridges freeXan ↔ Premiere — auto-import, bin/sequence creation. Files: `panel.html`, `ext.js`, `hostscript.jsx`, `CSInterface.js`, `sequence-preset.sqpreset`, `sqpersets/` |
| `Audio_freeXan/` | `com.bloomx.freexan.audio` | `com.bloomx.freexan.audio.panel` | Audio library — waveform browser, trim, drag-to-timeline. Files: `audio.html`, `audio.js`, `audio-player.css`, `Tone.js`, `wavesurfer.min.js`, `regions.min.js`, `handle-*.svg`, `hostscript.jsx`, `CSInterface.js` |
| `MisterBloomX/` | `com.bloomx.misterbloomx` | `com.bloomx.misterbloomx.panel` | MOGRT browser UI — card grid, search, favorites. Files: `dist/index.html`, `bridge/` (JSX), `CSXS/` |
| `SubMachine/` | `com.bloomx.freexan.caption` — rebranded v3.1.6 (display name "freeXan Caption") | `.panel` + `.about` | MOGRT timeline executor. Files: `panel/`, `dialog/`, `src/`, `custom/`, `META-INF/`, `mimetype`, `CSXS/`. Source folder name `SubMachine/` is kept intentionally so `plugins-enabled.json` and the `npm start SubMachine` skip-syntax stay backwards compatible. Premiere users see "freeXan Caption" in `Window → Extensions`. |

**Selection manifest:** `plugins-enabled.json` (next to `freeXan.exe`) — written by NSIS, read by `main.js`. Schema: `{ "Link_freeXan": true, "Audio_freeXan": true, "MisterBloomX": true, "SubMachine": true }`.

**To add a new plugin:** drop the folder into `plugins/` with `CSXS/manifest.xml` inside. No `main.js` change required — `installCEPExtension()` auto-discovers it. Add a checkbox to `build/installer.nsh → PluginsPageCreate` and a row to this table.

---

### `cep-extension/` — Legacy Combined Bundle (DEPRECATED)

**Status:** Superseded by `plugins/Link_freeXan/` + `plugins/Audio_freeXan/` in v3.1.0. Kept on disk as a recovery fallback; excluded from the installer (`!cep-extension/**` in `electron-builder.yml`). Slated for removal in v3.1.1.

---

### `CEPs/SubMachine/` — freeXan Caption (dev master, rebranded v3.1.5)

**What it is:** The rebranded source-of-truth for the caption MOGRT plugin. Formerly SubMachine by aescripts; forked to **freeXan Caption by BloomX** in v3.1.5.

**Bundle id:** `com.bloomx.freexan.caption` (panel: `.panel`, about: `.about`).
**Install target:** `%APPDATA%\Adobe\CEP\extensions\com.bloomx.freexan.caption\` (via `Install_freeXan_Caption.bat` or `install_mac.command`).

| File / folder | Role |
|---|---|
| `CSXS/manifest.xml` | Extension manifest — IDs, menu label, host requirements |
| `panel/panel.html` | Main panel UI (156 KB) — Workflow / Tools / About tabs |
| `panel/panel.css`, `command_center.css`, `css/*.css` | Panel styling (freeXan dark theme) |
| `panel/js/panel.js` | Loaded script — main panel runtime |
| `panel/js/command_center_react.js` | Command-center React UI (workflow tab) |
| `panel/js/workflow.js` | CSXS event listener → MOGRT replace/sync actions |
| `panel/js/phrasing.js` | Phrase parsing + lock handling (localStorage `freexan_caption_phrase_locks_v1`) |
| `panel/js/dynamic_ui_manager.js` | Dynamic parameter UI for selected MOGRTs |
| `panel/js/mogrt_param_editor.js` | MOGRT parameter editor (listens for `freexan.caption.paramsUpdated`) |
| `panel/jsx/main.jsx` | ExtendScript entry — loads core modules |
| `panel/jsx/core/mogrt.jsx` | MOGRT replace/insert (XMP namespace `http://ns.bloomxsolutions.com/freexan-caption/1.0/`) |
| `panel/jsx/core/sync.jsx` | Sync text / style / PSR across selected clips |
| `panel/jsx/core/timeline.jsx` | Timeline phrase detection + grouping |
| `panel/jsx/core/utils.jsx` | Shared helpers + JSX logger (`freexan_caption_jsx.log`) |
| `panel/jsx/core/debug_bridge.jsx` | Debug log forwarder (path: `/Adobe/CEP/extensions/com.bloomx.freexan.caption/panel/logs/`) |
| `dialog/dialog.html` + `dialog/dialog.css` | About / Update / Support modal (freeXan accent `#997DFF`) |
| `dialog/js/dialog.js` | aescripts/aeplugins licensing lib (1.9 MB minified, rebranded in-place) |
| `custom/header.html` | Brand bar — CSS+SVG "freeXan · Caption · by BloomX" |
| `custom/about.html`, `custom/help.html` | About text + Help-tab content (freeXan dark theme) |
| `src/content/strings.json` | Modal copy (error/info text) |
| `Install_freeXan_Caption.bat` | Windows single-click installer |
| `install_mac.command` | macOS installer |
| `IMAGE_REPLACEMENT_LIST.md` | Catalog of 70+ image binaries in `panel/images/` still carrying old SubMachine artwork |

**Relationship to `plugins/SubMachine/`:** `CEPs/SubMachine/` is the dev master that Swastik edits. `plugins/SubMachine/` is the bundled copy that ships with the Electron installer. The two are sync'd manually after major changes (see CHANGELOG v3.1.3 + v3.1.5 follow-up #3). As of v3.1.5 the dev master is rebranded; the bundled copy is **not yet** sync'd.

---

### `httpApi.js` — Localhost HTTP API Door (v3.5.1)

**What it does:** Small JSON HTTP server bound to `127.0.0.1:4555`. Two new front doors call into it: the `freexan` CLI and the `freexan-mcp` MCP server. Wraps existing `db.js` API objects and existing `ipcMain.handle` handlers — no business logic is duplicated.

**Started by:** `main.js` → `httpApi.startHttpApi(ctx)` inside `app.whenReady()`. Stopped in `before-quit`.

**Endpoints:**

| Method | Path | What it returns / does |
|---|---|---|
| `GET` | `/health` | `{ ok: true, port, appVersion }` — quick ping |
| `GET` | `/status` | `{ running, appVersion, cepConnected, activeProject, projectName, targetDir }` |
| `GET` | `/clients` | All saved clients |
| `GET` | `/funnels[?clientId=N]` | All funnels, or filtered by client |
| `GET` | `/tasks[?clientId=N&funnelId=N]` | All tasks, or scoped to a (client, funnel) pair |
| `GET` | `/templates` | All folder templates (deduplicated by id) |
| `POST` | `/project` | Body: `{ clientId, funnelId, taskId?, projectName }` — looks up names + targetDir, calls `create-project` IPC handler |
| `POST` | `/import` | Body: `{ filePaths[], opts? }` — calls `import-dropped-files` IPC handler |
| `POST` | `/plugin-action` | Body: `{ plugin, action, args?, timeoutMs? }` — generic dispatcher to any individual CEP plugin via WebSocket. 503 = plugin offline; 504 = timeout. *(v3.5.2+)* |
| `POST` | `/open` | Body: `{ filePath }` — calls `shell.openPath()` |

**Key design points:**

- Loopback-only — `req.socket.remoteAddress` rejected if not `127.0.0.1` / `::1` / `::ffff:127.0.0.1` (belt and braces; Node also binds only to loopback).
- 1 MB body cap (these payloads are tiny).
- EADDRINUSE: logs a warning and disables the door instead of crashing.
- Bridges to existing IPC handlers via `ipcMain._invokeHandlers.get(channel)(fakeEvent, ...args)` — private Electron API, stable for years, used because none of the reachable handlers reference `event.sender`. Fallback if Electron ever removes this: extract handler bodies into named functions.
- `/plugin-action` route delegates to `ctx.dispatchToPlugin(plugin, action, args, timeoutMs)` exposed by `main.js`.

**Key functions:**

| Function | What it does |
|---|---|
| `startHttpApi(ctx)` | Create and listen on the HTTP server. `ctx` provides `{ db, shell, appConfig, appVersion, getStatus, invokeHandler, dispatchToPlugin }` |
| `stopHttpApi()` | Close the server (called in `before-quit`) |
| `invokeIpcHandler(channel, ...args)` | Calls a registered `ipcMain.handle` handler from non-IPC contexts |
| `pluginActionRoute(res, ctx, body)` | Handler for `POST /plugin-action` — validates body, maps errors to 503/504/500 |
| `handleRequest(req, res, ctx)` | Request router |

---

### Plugin Bridge — `main.js` (v3.5.2)

**What it does:** Generic CLI/MCP → CEP plugin dispatcher with `requestId` correlation. Lets any code (HTTP route, IPC handler, anything) send a message to a *specific* plugin and await its reply — in contrast to `broadcastToAll()` which fans out to every panel.

**Plugin registration is automatic** — no plugin code changes were needed. Each plugin gets tagged on its first identifying message:

| Plugin | Identifying message | Registry key |
|---|---|---|
| Link | `ext_hello` (optionally with `plugin: 'link'`) | `'link'` |
| Caption | `get_project_state` | `'caption'` |
| MisterBloomX | `get_mogrt_library` | `'bloomx'` |

**State:**

| Variable | Purpose |
|---|---|
| `pluginConnections` | Map: plugin name → ws connection |
| `pendingPluginRequests` | Map: requestId → `{ resolve, reject, timer, plugin, action }` |
| `pluginRequestCounter` | Monotonic counter for unique requestIds |

**Key functions:**

| Function | What it does |
|---|---|
| `registerPluginConnection(ws, name)` | Tags a ws connection with a plugin name. If the same ws was previously registered under another name, drops the old mapping first. |
| `unregisterPluginConnection(ws)` | Called from `ws.on('close')`. Removes the entry and rejects all in-flight requests for that plugin so callers don't hang. |
| `dispatchToPlugin(plugin, action, args, timeoutMs)` | Promise. Looks up the connection, sends `{ type:'plugin_action', requestId, action, args }`, awaits the matching `plugin_action_result`. Timeout default 30 s (clamped 1 s–10 min). |
| `handlePluginActionResult(data)` | Called on incoming `plugin_action_result`. Resolves or rejects the pending Promise by `requestId`. Logs warning for unknown requestIds. |

**Wire protocol (main.js ↔ plugin):**

```jsonc
// Main → plugin:
{ "type": "plugin_action", "requestId": "req_1234_5", "action": "create", "args": {...} }

// Plugin → main (success):
{ "type": "plugin_action_result", "requestId": "req_1234_5", "result": {...} }

// Plugin → main (failure):
{ "type": "plugin_action_result", "requestId": "req_1234_5", "error": "message" }
```

**Status surface:** `GET /status` includes `connectedPlugins: string[]` so the CLI/MCP can verify a plugin is online before calling.

**Next phases (not yet built):** the plugin side of this contract — each CEP panel needs to listen for `plugin_action` and dispatch to its own handlers. Caption is the first target (Phase 3).

---

### `cli/` — Command-Line Interface (v3.5.1)

**What it is:** A standalone Node CLI that talks to the running freeXan app over the HTTP door. Single-file implementation with zero external dependencies (Node built-ins only). Install via `npm link` for global `freexan` command.

| File | Role |
|---|---|
| `cli/freexan.js` | The CLI script (shebang + argv parser + 6 commands) |
| `cli/package.json` | `bin: { freexan: "freexan.js" }` — registers global command on `npm link` |
| `cli/README.md` | Install + usage + examples |

**Commands:**

| Command | What it does |
|---|---|
| `freexan status` | Show app + Premiere connection state, active project, workspace dir |
| `freexan clients` | List saved clients |
| `freexan templates` | List folder templates (★ marks the Default) |
| `freexan new <name> --client X --funnel Y [--task Z]` | Create a new project (Builder tab, headless) |
| `freexan import <files...> [--to-folder P] [--move]` | Import file(s) into the active Premiere project |
| `freexan open <path>` | Open a `.prproj` or folder via system shell |

**Global flags:** `--json`, `--port N`, `--help`, `--version`.

**Name resolution (client / funnel / task):** exact match (case-insensitive) → initials match → starts-with match. So `--client AC` and `--client "acme"` both find `Acme Corporation (AC)`.

---

### `mcp/` — Model Context Protocol Server (v3.5.1)

**What it is:** An MCP server that lets Claude Code (and any MCP-capable AI tool) drive freeXan. ESM module using `@modelcontextprotocol/sdk` v1. Mirrors the 6 CLI commands as MCP tools.

| File | Role |
|---|---|
| `mcp/server.js` | MCP server — stdio transport, 6 tools |
| `mcp/package.json` | `type: module` + single dep `@modelcontextprotocol/sdk` |
| `mcp/README.md` | Install + Claude Code wiring + example prompts |

**Tools exposed:**

| Tool | Risk | What it does |
|---|---|---|
| `freexan_status` | safe | Read connection + project |
| `freexan_list_clients` | safe | Read clients |
| `freexan_list_templates` | safe | Read templates |
| `freexan_create_project` | destructive | Create a Premiere project (description tells Claude to confirm first) |
| `freexan_import_files` | destructive | Import files into active project (description tells Claude to confirm first) |
| `freexan_open` | low | Open a path in the shell |

**Claude Code wiring:** add `{ command: "node", args: ["<full-path>/mcp/server.js"] }` to the `mcpServers` block in Claude Code's MCP config, then restart Claude Code.

**Env vars:** `FREEXAN_PORT` overrides the API port (default 4555).

---

### `scripts/seed-db.js` — Database Seeder

**What it does:** One-shot idempotent script that populates the DB with an initial client list. Run with `npm run seed`. Safe to re-run.

**To add new default clients:** Edit the `clients` array near the top of this file.

---

### `package.json` — Project Manifest

| Script | What it runs |
|---|---|
| `npm start` | Electron app in development mode |
| `npm run dev` | Electron + nodemon (auto-restarts on file changes) |
| `npm run dist` | Builds Windows installer (`electron-builder --win --x64`) |
| `npm run dist:dir` | Builds unpacked directory (no installer — faster for testing) |
| `npm run seed` | Populates DB with default clients |
| `npm run rebuild` | Rebuilds native modules (better-sqlite3) for current Electron version |
| `npm run icon` | Generates `icon.ico` from source PNG |

**Key dependencies:**

| Package | Why it's here |
|---|---|
| `electron` | App framework (v30) |
| `better-sqlite3` | Synchronous SQLite — fast, no async complexity |
| `ws` | WebSocket server for CEP panel communication |
| `axios` | HTTP client — used by `import-browser-image` for URL downloads |
| `@ffmpeg-installer/ffmpeg` | FFmpeg binary — used to convert webp/avif/heic images to PNG |

---

### `electron-builder.yml` — Windows Installer Config

| Setting | Value / Purpose |
|---|---|
| `appId` | `com.bloomx.freexan` |
| `productName` | `freeXan` |
| `icon` | `build/icon.ico` |
| `asarUnpack` | `better-sqlite3`, `@ffmpeg-installer`, `cep-extension`, `blank_template.prproj`, `Premiere Pro Utilities/`, `tray_icon.png` |
| `nsis.oneClick` | `true` — single-click install |
| `nsis.perMachine` | `false` — per-user, no UAC |
| `nsis.runAfterFinish` | `true` — launches app after install |
| `nsis.include` | `build/installer.nsh` — custom NSIS script |

---

### `Premiere Pro Utilities/Fresh Project Pr 2025.prproj` — Fallback Template

**What it does:** A clean Premiere Pro 2025 project file used as the default `.prproj` when no other template is configured. Preferred over `blank_template.prproj` if present.

**Template resolution order (Mode A):**
```
1. Folder template's prproj_path (if set and exists)
2. DB template for current client/funnel (templatesApi.resolve)
3. Global config templateFile (from Settings tab)
4. Premiere Pro Utilities/Fresh Project Pr 2025.prproj
5. blank_template.prproj
```

---

### `blank_template.prproj` — Legacy Fallback Template

**What it does:** Last-resort fallback `.prproj` if nothing else is configured or found. A clean empty Premiere Pro project.

---

### `Brand Guidelines/free_xan_complete_brand_guidelines.md` — Brand Spec

**Refer to this before** designing new UI, writing copy, creating marketing material.

---

## Architecture Overview

```
User (Windows Desktop)
│
├── Main Window  (renderer/index.html + renderer/app.js)
│   ├── Builder Tab   → form → IPC → main.js create-project
│   ├── Settings Tab  → IPC → main.js save-config / get-config
│   ├── Library Tab   → Folder Structure Templates editor → ft-* IPC → db.js folderTemplatesApi
│   └── Database Tab  → Clients/Funnels/Tasks/Templates/Assets → db-* IPC → db.js
│
├── Overlay Pill  (renderer/overlay.html + renderer/overlay.js)
│   ├── file drop → preload → IPC → main.js import-dropped-files
│   │   └── slot map → copy file → WebSocket → CEP → importFiles → Premiere bin
│   └── URL drop → preload → IPC → main.js import-browser-image
│       └── axios download → convert (ffmpeg if needed) → copy → WebSocket → CEP → Premiere
│
├── main.js
│   ├── WebSocket Server (port 4554)
│   │   ├── ext_hello → version check → reload if stale
│   │   ├── active_project → update activeProjectPath, check pendingProjectSetup (8s fallback)
│   │   ├── project_ready → dispatch pendingProjectSetup immediately
│   │   └── import_result, ext_log
│   ├── PowerShell Monitor (Premiere title poll, 2500ms) → nativeProjectPath fallback
│   ├── CEP Extension auto-installer + legacy cleanup (on startup)
│   ├── SQLite DB (via db.js)
│   └── Login item registration (start at boot with --hidden)
│
└── CEP Extension  (inside Adobe Premiere Pro)
    ├── panel.html     — visible status panel in Premiere workspace
    ├── ext.js         — WebSocket client, project tracker (1000ms), bin+seq creation
    ├── hostscript.jsx — ExtendScript helpers (legacy)
    └── sqpersets/     — .sqpreset files for sequence creation without dialogs

External clients (v3.5.1+)
    ├── HTTP API door  (httpApi.js → 127.0.0.1:4555, loopback only)
    │
    ├── freexan CLI    (cli/freexan.js — `freexan status / clients / new / import / open`)
    │
    └── freexan-mcp    (mcp/server.js — 6 tools for Claude Code via MCP)
```

---

## Data Flow: Project Creation (Mode A — New Folder)

```
1. User fills Builder form (client, funnel, task, project name)
2. renderer/app.js → handleCreateProject() → IPC invoke('create-project', payload)
3. main.js create-project handler:
   a. Resolves folder template: assigned (client+funnel+task) → assigned (client+funnel) → assigned (client) → Default
   b. Builds date hierarchy path: targetDir / {Month}{Year} / {DD Month} / FolderName
   c. mkdir project root folder
   d. buildFolderTree(projectPath, nodes) → creates subfolders, tracks slotFolders
   e. Resolves .prproj: folderTemplate.prproj_path → DB template → global config → Fresh Project → blank
   f. Copies .prproj to 01_Project_Files/{initials}_v01.prproj (auto-increments version)
   g. Copies preset assets from DB (legacy)
   h. shell.openPath(destPath) → Premiere Pro opens the project
   i. Queues pendingProjectSetup { projectPath, premiereTree, bins, sequences, assets }
   j. Writes _freexan_slot_map.json to project root (video/audio/image → folder + bin routing)
   k. Writes README.md
   l. mainWindow.hide()
4. CEP panel detects project open:
   - Sends active_project → main notes path
   - rootItem becomes accessible → sends project_ready → main dispatches setup-project immediately
   (Fallback: if project_ready never comes, active_project path match triggers dispatch after 8s)
5. CEP ext.js receives setup-project:
   - waitForProjectReady → setupFromPremiereTree (DFS bin creation + sequences) → doImports (asset files)
6. Renderer receives { success, projectPath, openedFile } → shows Done flash → alert → opens folder
```

---

## Data Flow: File Drop Import

```
1. User drags file over overlay pill
2. overlay.js hit-tests cursor; after 500ms over pill → setDragActive() → resizeOverlay(true)
3. User drops file
4. preload.js captures file paths via webUtils.getPathForFile() → calls onDropCallback([paths])
5. overlay.js → window.api.importDroppedFiles([paths]) → IPC invoke('import-dropped-files')
6. main.js import-dropped-files:
   a. Resolves projectFolder from activeProjectPath (CEP) or nativeProjectPath (PowerShell)
   b. Checks parent folder for subfolders — climbs up one level if project subfolders live there
   c. Loads _freexan_slot_map.json if present (explicit folder + bin routing)
   d. For each file: classify by extension → getDestSubfolder() → copy to disk → resolve conflicts (_N suffix)
   e. Broadcasts { type: 'import', filePath, binName } to all CEP WebSocket clients
7. CEP ext.js → runs inline IIFE: findBin() → app.project.importFiles([filePath], target bin)
8. main.js sends { success, imported } back to overlay
9. overlay.js shows setSuccess / setError → auto-dismisses
```

---

## Data Flow: Browser Image Drop

```
1. User drags image from browser tab onto overlay pill
2. preload.js intercepts drop event: no file paths found → reads text/uri-list → calls onUrlDropCallback([urls])
3. overlay.js → window.api.importBrowserImage(url) → IPC invoke('import-browser-image')
4. main.js import-browser-image:
   a. Validates https? URL (no arbitrary schemes)
   b. Resolves projectFolder same as file drop
   c. axios.get(url, { responseType: 'arraybuffer', timeout: 30s, maxContentLength: 50MB })
   d. Validates Content-Type is image/*
   e. Writes to temp file; if format is webp/avif/heic/heif → convertWithFfmpeg() to PNG
   f. getDestSubfolder() → copy to project folder
   g. Broadcasts WebSocket import message to CEP (no binName)
5. overlay.js shows success/error feedback
```

---

*Last updated: 2026-06-24 | v3.5.4*

---
## [2026-06-22 13:21] � freeXan Caption Bug Fix

**Files Touched:**
- CEPs/freeXan_Caption/panel/jsx/core/sync.jsx
  - getMogrtDumpForActiveClip: Reverted isMogrt triple-guard ? simple isMGT() check
  - getTimelinePhraseMap: Added try-catch around clip.isMGT()
- CEPs/freeXan_Caption/panel-src/src/hooks/useFreeXanWs.ts
  - WS reconnect: 4000ms ? 1000ms
- CEPs/freeXan_Caption/panel/dist/freexan-caption.js (rebuilt via npm run build)
| Connection status debug logging | CEPs/freeXan_Caption/panel-src/src/hooks/usePremiereState.ts | poll() ? setAndLog() � every disconnect path tagged [DISC-n] |
| CSI raw result logging | CEPs/freeXan_Caption/panel-src/src/lib/csi.ts | evalScriptRaw() callback � logs exact Premiere return value |

---

| Connection debug log (React) | `%APPDATA%\Adobe\CEP\extensions\com.bloomx.freexan.caption\panel\logs\connection_debug.log` | Written by `usePremiereState.ts` � connection/DISC-n events only |
| ExtendScript debug log | `%APPDATA%\Adobe\CEP\extensions\com.bloomx.freexan.caption\panel\logs\debug_jsx.log` | Written by `jsxLog()` in all JSX files � everything ExtendScript logs |

| Master CEP installer | `CEPs/install_plugins.bat` | Installs all 5 plugins via robocopy � no Admin needed |
| Caption-only installer | `CEPs/freeXan_Caption/Install_freeXan_Caption.bat` | Installs only freeXan Caption, excludes dev artifacts |

| getPlayheadTime connection guard | `CEPs/freeXan_Caption/panel-src/src/tabs/edit/EditView.tsx` | line ~134 � `useEffect` playhead follower, `connection !== 'connected'` guard |
| smParseClipParams stack overrun fix | `CEPs/freeXan_Caption/panel/jsx/core/mogrt_editor.jsx` | `smParseClipParams()` � `SM_MAX_PROPS` cap + per-property try/catch |
## [2026-06-22 13:35] -- useFreeXanWs.ts: ?? fallback for bloomxOpen/connected. Rebuilt + copied to installed.

---
## [2026-06-22 13:37] � Link_freeXan Bug Fix #3

**Bugs Fixed:**
- **Audio List Not Loading:** Restored missing 
equestAudioLibrary() explicit call and audio list rendering logic (udioLibrary = data.files || []; renderAudioList();) in ext.js which was accidentally deleted, preventing the audio library from loading in Link_freeXan.
- Copied updated ext.js to installed location $env:APPDATA\Adobe\CEP\extensions\com.bloomx.freexan.link\ext.js.

---
## [2026-06-22 17:43] -- Edited EditView.tsx and mogrt.jsx for Replace Engine fixes.

---
## [2026-06-22 18:26] -- Updated mogrt.jsx and mogrt.js for targeted text injection and error aborts.





