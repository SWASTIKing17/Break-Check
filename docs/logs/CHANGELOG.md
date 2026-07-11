# CHANGELOG — freeXan by BloomX

All notable changes to this project are documented here.  
Format: `[vX.Y.Z] — YYYY-MM-DD HH:MM | Type | Description`

**Types:** `Feature` · `Fix` · `Logic` · `UI` · `DB` · `Build` · `Refactor` · `Security` · `Perf`

---

## [v3.8.36] — 2026-07-11 | UI | Break Check: Empty Profile Ghost Data Fix (`app.js`)

- **Reset UI state**: Added `resetDashboardUI()` to cleanly wipe out all residual text KPIs, project list tables, modifier gauges, context switch rates, switch pairs, and RAM alert borders when switching to a user with no logs.
- **Fixed heatmap hour labels leakage**: Heatmap hour labels are now properly cleared before being re-rendered to prevent duplicate rows from stacking up.

## [v3.8.35] — 2026-07-11 | UI | Break Check Dashboard v2 — Full Redesign (`index.html`, `style.css`, `app.js`)

**Complete ground-up redesign of the Break Check Admin Dashboard based on the Dashboard Matrix Scopes document.**

- **Sidebar layout** with 5 dedicated analytical views replacing the single-page scrolling layout.
- **Global KPI strip**: Total Events, Keystrokes, Active Minutes, Modifier Ratio %, Scroll Distance, Avg RAM — always visible across all views.
- **View 1 — Activity Flow**: Time-series chart (keystrokes + cursor + idle shading), App Distribution doughnut, Scroll-by-App horizontal bar chart, Project Time tracker.
- **View 2 — Editor Proficiency**: Modifier Ratio semi-circle gauge with RAG (Red/Amber/Green) scoring + insight text, KPM (Keystrokes Per Minute) timeline, 24-hour Flow State heatmap coloured by keystroke density.
- **View 3 — Hardware Health**: RAM spike alert (auto-detects anomalies), Peak RAM readout, Average RAM per App bar list, RAM-over-time line chart.
- **View 4 — Workflow Friction**: Context Switch Rate (per hour) with RAG scoring, Scroll-by-Category doughnut (NLE Creative vs Asset Hunting vs Browser), Top Switch Pairs bar list, Switch Timeline bar chart.
- **View 5 — Team Profiles**: Clean table with inline Edit/Delete, Add Employee form — unchanged functionality, redesigned UI.
- **Auto-refresh every 60s** (was 5s — reduced API load).
- All new fields from `usage_monitor.py` v2 (`ram_usage_gb`, `scroll_distance`, `modifier_keys`) are fully consumed and visualized.

## [v3.8.34] — 2026-07-11 | Feature | Break Check: RAM, Scroll & Modifier Key Tracking (`usage_monitor.py`, `ingest.js`)


- **RAM tracking** (`ram_usage_gb`): Each event now records the tracker process RAM in GB via `psutil`. Near-zero overhead.
- **Scroll distance** (`scroll_distance`): `pynput` mouse scroll listener accumulates absolute vertical ticks per keystroke burst, revealing timeline review vs. active editing patterns.
- **Modifier key ratio** (`modifier_keys`): `on_release` handler tracks active modifier state; each non-modifier keypress while a modifier is held increments a counter. Flushed as a boolean (`1`/`0`) per burst — high ratio → advanced shortcut user.
- **Safe DB migration**: `init_db()` now runs `ALTER TABLE … ADD COLUMN` with `try/except` for all three new columns, so existing databases upgrade without data loss.
- **Netlify ingest.js** updated to forward the three new fields to Supabase (`ram_usage_gb`, `scroll_distance`, `modifier_keys`), defaulting to `null` if absent (backward-compatible with old tracker versions).

## [v3.8.33] — 2026-07-11 | Fix | Middle-Click Debounce (`WM_MBUTTONUP`) & Packaged `app.asar` Write Fix (`main.js`, `native-pill/main.cpp`)

- **Middle-Click Debounce & Button Release Trigger (`WM_MBUTTONUP`)** — Fixed rapid or duplicate profile changes when holding the middle mouse button (MMB) or moving the mouse while holding MMB. Replaced `WM_MBUTTONDOWN` trigger with `WM_MBUTTONUP` and enforced a strict 350ms hardware debounce timer (`GetTickCount()`). This guarantees exactly 1 profile cycle per physical click regardless of hold duration or hardware switch bounce.
- **Packaged `app.asar` Read-Only Write Crash Fix (`main.js`)** — Fixed an issue where `fs.writeFileSync(path.join(__dirname, 'Break Check', 'current_profile.txt'), user.name)` crashed on packaged builds (`app.isPackaged`) with `EROFS: read-only file system` because `__dirname` resides inside the read-only `app.asar` archive. Wrapped the write in a `try/catch` and routed `current_profile.txt` to `app.getPath('userData')` when packaged, guaranteeing `pushStateToNativePill()` always executes.

## [v3.8.32] — 2026-07-11 | Fix | Native Pill Real-Time UI Thread Wake-Up on Profile Cycle (`native-pill/main.cpp`, `DropHandler.h`)
- **Real-Time UI Thread Repaint on Middle-Click (`WM_APP_UPDATE_STATE`)** — Fixed an issue where changing profiles via middle-click (`cycle-profile`) updated state in the backend but failed to instantly repaint the Native C++ Pill (`FreeXanPill.exe`) until the user moved the mouse or toggled window visibility (`ShowWindow`). Root cause: calling `InvalidateRect(hWnd, NULL, FALSE)` from `IpcMessenger`'s background pipe reader thread marked the window client area as dirty but did not wake up `GetMessage(&msg, NULL, 0, 0)` sitting asleep on the main UI thread.
- **PostMessage Thread Synchronization (`PostMessage(hWnd, WM_APP_UPDATE_STATE, 0, 0)`)** — Defined custom window message `WM_APP_UPDATE_STATE` (`WM_APP + 101`) and updated `SetStateCallback` and `SetLinkMapCallback` to post directly to the window message queue. When `main.js` sends `{ type: 'overlay-update' }` across the named pipe, the UI thread's message loop wakes up in <0.1ms, executes `InvalidateRect + UpdateWindow`, and repaints the pill instantly without requiring mouse movement. Recompiled `build\FreeXanPill.exe`.

## [v3.8.31] — 2026-07-08 | Feature | Automated Usage Monitor Background Deployment
- **Background Tracking Auto-Deployment (main.js, package.json, scripts/build-monitor.js)** — The Python usage monitor (usage_monitor.py) is now compiled into a standalone, hidden Windows executable using PyInstaller. It is automatically bundled into the FreeXan electron installer.
- **Silent Windows Startup Registration (main.js)** — When FreeXan launches, it silently injects a registry key into HKCU\Software\Microsoft\Windows\CurrentVersion\Run, guaranteeing that the tracking script runs infinitely in the background on every PC boot, completely independent of the FreeXan UI.

## [v3.8.31] — 2026-07-08 | Refactor | Safe Removal & Archiving of Legacy Electron Overlay Pill
- **Legacy Electron Overlay Pill Removed & Archived (`main.js`, `archive_legacy_electron_pill/`)** — Safely removed the legacy HTML5/CSS/JS Electron overlay pill from the active runtime environment (`renderer/overlay.html`, `renderer/overlay.js`, `renderer/overlay.css`) to prevent duplicate pills from launching side-by-side on app startup. All frontend overlay files and reference documentation were preserved in `archive_legacy_electron_pill/` for future review and potential cross-platform (macOS/Linux) reuse.
- **Main Process Overlay Cleanup (`main.js`)** — Removed `createOverlayWindow()`, `repositionOverlay()` window animations, and Electron renderer IPC listeners (`resize-overlay`, `move-overlay-window`, `overlay-log`, `request-status`). FreeXan now cleanly and exclusively launches the **Native C++ Pill** (`FreeXanPill.exe`). Updated the system tray menu option from 'Reposition Overlay' to 'Reposition Pill'.

## [v3.8.30] — 2026-07-08 | Fix | Supabase RLS Investigation & Proper Error Detection for Edit/Delete
- **Root Cause Identified (RLS Block, Silent 200 Empty Response):** Live-tested the Supabase REST API directly from Node.js. Confirmed that PATCH and DELETE with the anon/publishable key (sb_publishable_*) returns 200 [] — an empty array — instead of an error. This is Supabase RLS silently blocking write operations that have no matching policy. INSERT and SELECT work because those policies exist; UPDATE and DELETE policies are missing.
- **RLS Fix SQL (Break Check/Dashboard/supabase_rls_fix.sql)** — Created a SQL migration file with two CREATE POLICY statements to allow the anon role to perform UPDATE and DELETE on the 	eam_profiles table. User must run this once in the Supabase SQL Editor.
- **Netlify Function Error Detection (
etlify/functions/update-profile.js)** — Upgraded to use Prefer: return=representation and detect the silent RLS block (empty array on 200 status), returning a clear 403 RLS_BLOCKED error with a specific message pointing to the SQL fix file instead of silently succeeding.

## [v3.8.29] — 2026-07-07 | Fix | Dashboard Edit/Delete Routed Through Netlify Serverless Functions
- **Edit / Delete Now Routed via Netlify Functions (
etlify/functions/update-profile.js, 
etlify/functions/delete-profile.js, Dashboard/public/app.js)** — Fixed Edit and Delete buttons silently failing due to two root causes: (1) e.target event bug — the click handler read data-id/data-name/data-color off e.target which resolves to a child text node when clicking button text, returning null. Fixed by capturing tn in closure and reading attributes from tn directly. (2) RLS block — the edit and delete functions were calling Supabase REST API directly from the browser using the publishable key, which cannot bypass Row Level Security for UPDATE and DELETE. Fixed by creating two new Netlify serverless functions (update-profile.js using PATCH, delete-profile.js using DELETE) that execute server-side using the SUPABASE_KEY service role key. The frontend now calls /api/update-profile and /api/delete-profile via POST with a JSON body, fully mirroring the architecture of ingest.js and employees.js.

## [v3.8.29] — 2026-07-07 | Fix | Infinite WebSocket Reconnect in CEP Panels
- **Infinite WebSocket Reconnect (`CEPs/Link_freeXan/ext.js`, `CEPs/Audio_freeXan/audio.js`)** — Fixed an issue where the FreeXan overlay pill and companion app failed to connect if Premiere Pro was opened more than 90 seconds before starting FreeXan. Previously, `MAX_RECONNECT` was capped at 30 attempts (~90 seconds), after which the panels permanently stopped attempting to connect to `ws://localhost:4554`. Updated `MAX_RECONNECT = Infinity` in `Link_freeXan` and `Audio_freeXan` (as well as `cep-extension/`) so that panels retry connection every 3 seconds indefinitely and connect automatically whenever FreeXan is launched.

## [v3.8.28] — 2026-07-07 | Feature | Web Dashboard Team Profile Editing
- **Team Profiles Interactive Editing (Dashboard/public/app.js)** — Added a dedicated Edit button to each user row in the Break Check web dashboard. Admins can now instantly modify a user's Full Name, Initials, and Hex Color via inline prompts that execute an asynchronous PATCH request directly against the Supabase 	eam_profiles table, followed by an immediate real-time refresh of the UI.

## [v3.8.27] — 2026-07-07 | Feature / Fix | Supabase Team Profiles Sync & UI Overhaul
- **Supabase Cloud Sync Migration to Main Process (main.js, preload.js, settings.js)** — Migrated the Supabase REST API fetch logic from the Electron renderer (settings.js) to the Electron main process (main.js). Added a new etch-supabase-profiles IPC handle using xios. This safely bypasses Chromium CORS restrictions when fetching from the ile:// protocol and securely hardcodes the Supabase credentials, removing the need for manual user input.
- **Removed Manual Credential Inputs (
enderer/index.html, 
enderer/settings.js)** — Removed the Supabase URL and Publishable Key text fields from the Settings tab since credentials are now hardcoded securely in the backend.
- **Web Dashboard Team Profiles Management (Break Check/Dashboard/public/index.html, pp.js)** — Added a full Supabase integration to the Break Check Web Dashboard. Managers can now add team members directly from the web dashboard. The system automatically generates 2-letter initials, assigns a random HSL hex color, and inserts the profile into Supabase. Employees can also be deleted directly from the dashboard UI.
- **UI Tab Cleanup & Fix (
enderer/index.html)** — Removed the unused 'Users' tab navigation button from the sidebar. Fixed a severe UI crash where uilder.js was accidentally unlinked, halting pp.js initialization and causing the Database tab to render completely blank.

## [v3.8.26] — 2026-07-07 | Fix / Logic | Prevent Duplicate Premiere Pro Import via Live Bin Check & markSeen
- **Duplicate Import Suppression & Live Bin Verification (`linkWatcher.js`, `main.js`)** — Fixed an issue where media files dropped onto the overlay pill or added externally were imported into Premiere Pro twice. Previously, `linkWatcher` only checked an in-memory `seen` set populated once at startup; when files were imported directly by `performImportDroppedFiles` or external tools, `linkWatcher`'s `fs.watch` event blindly dispatched a second `type: 'import'` message 350ms later. Added `markSeen(filePath)` to `linkWatcher.js` and called it from `performImportDroppedFiles` in `main.js`. Furthermore, updated `attachWatcher` in `linkWatcher.js` to execute an async live verification against Premiere Pro CEP (`getBinFilesCached(link.binName, 1500)`) right before dispatching any import. If the file already exists in the target bin, `linkWatcher` logs an explanation and skips the import. Added `binFilesCache` to coalesce concurrent `get_bin_files` requests and invalidate cache on new imports.

## [v3.8.25] — 2026-07-06 | Doc | Full Deep-Research Rewrite of PROJECT_MEMORY.md (Source of Truth Overhaul)
- **Full ecosystem research & PROJECT_MEMORY.md rewrite (`docs/PROJECT_MEMORY.md`)** — Performed comprehensive code-first discovery of the entire freeXan stack. Read `main.js`, `db.js`, `audioDb.js`, `mogrtDb.js`, `httpApi.js`, `mcp/server.js`, `cli/freexan.js`, `CEPs/Link_freeXan/ext.js`, `CEPs/Link_freeXan/hostscript.jsx`, `CEPs/Audio_freeXan/audio.js`, `CEPs/Audio_freeXan/hostscript.jsx`, `CEPs/MISTER_BloomX/MISTER_BloomX_Features.md`, and `CEPs/freeXan_Caption/panel-src/src/lib/captionMcpHandlers.ts`. Rewrote `PROJECT_MEMORY.md` from 118 lines to a 550-line authoritative document covering: full project directory layout, complete canonical action nomenclature, cross-stack mapping table for all 6 layers, Electron main process architecture (IPC monkey-patch, all WS message types in both directions), all 3 SQLite databases (full schema tables), all 5 CEP plugins (responsibilities, ExtendScript functions, known limitations), complete HTTP API route table with request/response formats, all 8 current MCP tools with full schemas, all 8 current CLI commands, 3-Tier architecture plan (Bulk/Workflow/Micro), AI safety risk classification, 13 known gotchas and constraints, and transcriber sandbox documentation.

## [v3.8.25] — 2026-07-06 | Feature | MCP & CLI Expansion — App + Link_freeXan Scope
- **`GET /mogrts` route (`httpApi.js`)** — New read-only route returning MOGRT library data from `mogrtDb.mogrtApi.getAll()`. Supports `?search=`, `?category=`, and `?favoritesOnly=` query parameters.
- **`GET /audio` route (`httpApi.js`)** — New read-only route returning audio library data from `audioDb.audioApi.getAll()`. Supports `?search=` and `?favoritesOnly=` query parameters.
- **`mogrtDb` + `audioDb` in httpApi context (`main.js`)** — Both database modules now passed into `startHttpApi()` context so the new routes can query them.
- **Link CEP `plugin_action` dispatcher (`CEPs/Link_freeXan/ext.js`)** — Added complete `if (data.type === 'plugin_action')` block to `ws.onmessage`. Handles four actions: `link_status` (project name, path, all sequences, active sequence), `link_list_bins` (recursive bin tree via `collectBins`), `link_create_bin` (creates bin at root or inside a pipe-delimited parent path), `link_create_sequence` (creates sequence using `app.project.createNewSequence`). All actions use inline JSX IIFEs (never named hostscript functions). Each sends `plugin_action_result` with `{ result }` or `{ error }` so `dispatchToPlugin` in main resolves correctly.
- **8 new MCP tools (`mcp/server.js`)** — `freexan_app_list_funnels`, `freexan_app_list_tasks`, `freexan_app_list_mogrts`, `freexan_app_list_audio` (app scope, DB-only), `freexan_link_create_bin`, `freexan_link_create_sequence`, `freexan_link_list_bins`, `freexan_link_premiere_status` (link scope, via plugin_action). Full helper functions added for each: `callListFunnels`, `callListTasks`, `callListMogrts`, `callListAudio`, `callLinkPremiereStatus`, `callLinkListBins`, `callLinkCreateBin`, `callLinkCreateSequence`.
- **7 new CLI commands (`cli/freexan.js` v0.3.0)** — `freexan funnels [--client X]`, `freexan tasks [--client X] [--funnel Y]`, `freexan mogrts [--search S] [--category C] [--favorites]`, `freexan audio [--search S] [--favorites]`, `freexan link status`, `freexan link bins`, `freexan link create-bin <name> [--path P]`, `freexan link create-seq <name> [--preset P]`. Updated `printHelp()` with full documentation for all new commands and examples.

## [v3.8.24] — 2026-07-06 | Doc / Rule | Separate MCP & CLI Documentation Rules & Project Memory Source of Truth
- **Separate MCP & CLI Documentation Rules (`.agents/rules/documentation_update.md`, `docs/RULEBOOK.md`)** — Added strict mandatory rules enforcing that the Model Context Protocol server (`/mcp/README.md`) and Command Line Interface (`/cli/README.md`) must have their documentation maintained separately and independently whenever tools or commands are modified. Added Section 1.5 to `RULEBOOK.md` for Component-Specific Documentation.
- **Project Memory Source of Truth & Maintenance Rule (`.agents/rules/project_memory_maintenance.md`, `docs/RULEBOOK.md`, `CLAUDE.md`, `docs/PROJECT_MEMORY.md`)** — Established `docs/PROJECT_MEMORY.md` as the authoritative Source of Truth and the primary starting point for any research or development across the freeXan ecosystem. Added strict mandatory rules requiring all developers and AI agents to consult `PROJECT_MEMORY.md` first, cross-check all findings against it, and immediately add and enrich any missing reference, tool, or architecture found during code investigation.


## [v3.8.23] — 2026-07-02 | Fix & Feature | On-Demand MOGRT Parameter Fetching Diagnostics & Word Bubble Click Snap Parity

- **On-Demand Parameter Fetching Diagnostics (`mogrt_param_fetch.log`)** — Added dedicated inspection logger (`paramFetchLog`) and on-demand diagnostic function (`smDumpSelectedMogrtProperties`) in `mogrt_editor.jsx` / `.js`. Removed automatic logging during normal timeline scanning (`smParseClipParams`) to prevent excessive log spam. Added a temporary **"📋 Log Props"** button beside the Reload (`↻`) button in the Params Tab header (`ParamsView.tsx`). When clicked, it logs 100% of the properties (`dispName`, `rawName`, `propertyType`, `val`) of the currently selected MOGRT (or MOGRT under the playhead) directly to `panel/logs/mogrt_param_fetch.log` and alerts the user with the result count. Added expanded JSON parsing fallback across both ExtendScript backend (`smParseClipParams`) and React frontend (`getClipPhraseAndWordIdx`) to extract text from `.text`, `.value`, or `.content` if `.textEditValue` is absent. Broadened regex matching (`/text input|source text|caption text|title text|phrase text/i` and `/word progression|word index|word #|current word|progression/i`) across both frontend and backend sequence scanning so non-standard MOGRT parameter names are reliably recognized.
- **Fallback Sequence Scan Bug Fix (`mogrt_editor.jsx` / `.js`)** — Pinpointed and resolved the exact failure where clicking unselected word bubbles in the Params Tab resulted in `total selected=0`. During fallback sequence scanning (`smSelectClipsByPhraseAndWord`), the function was checking `pm.value`, but `smParseClipParams` outputs parameter objects with values assigned to `pm.val` (not `value`). Fixed the property lookup (`var rawVal = pm.val !== undefined && pm.val !== null ? pm.val : pm.value;`) so that text input matching and `parseInt(rawVal, 10)` for word progression index work 100% reliably across all sequence clips when `nodeIds` is empty.
- **Non-Clickable Outer Card & Comprehensive Click Telemetry (`ParamsView.tsx`, `ParamsView.css`, `mogrt_editor.jsx` / `.js`)** — Set `cursor: default !important;` on `.mpe-horizontal-phrase-card` so the outer phrase bubble container is not clickable and does not show pointer hand on hover. Kept `cursor: pointer !important;` strictly on word progression pills (`.cc-word-pill`). Instrumented both frontend (`onClick` in `ParamsView.tsx`) and ExtendScript (`smSelectClipsByPhraseAndWord`) with comprehensive debug telemetry (`jsxLog`, `console.log`) following the FreeXan Debugging Framework. Upgraded `onClick` to `async` so it sequentially executes and awaits `setPlayheadTime` (`clip.start + 0.01`) exactly like Edit Tab parity before running `smSelectClipsByPhraseAndWord`, preventing ExtendScript single-thread collisions.

## [v3.8.22] — 2026-07-02 | Fix | Instant Timeline Selection Auto-Polling in Params Tab
- **Isolated 500ms Auto-Polling Interval (`ParamsView.tsx`)** — Fixed an issue where the automatic timeline polling interval (`setInterval`) was prematurely killed whenever the component re-rendered due to being bundled with `eventsInitialized.current`. Split the one-time event initialization (`csi.on('freexan.caption.paramsUpdated')`) from a dedicated 500ms auto-polling `useEffect`. Removed the restrictive `isJsxReadyRef.current` gate from the poller so timeline clip selections and parameter edits in Premiere Pro sync instantly without requiring manual clicks on the Refresh button.

## [v3.8.21] — 2026-07-02 | Perf / UI | Real-Time Word Tracking Optimization & Playhead Highlight in Params Tab
- **Zero-Cost Playhead Re-renders (`ParamsView.tsx`)** — Removed heavy bridge execution (`fetchParams()`) inside the `ctiSecs` playhead poller effect. Previously, every 500ms playhead tick fired `smGetSelectionParams` over the ExtendScript bridge during video playback, causing playback stutter and lagging the UI. `ctiSecs` updates now trigger clean local React re-renders without blocking the bridge.
- **Real-Time Word Playhead Follower (`ParamsView.tsx`, `ParamsView.css`)** — Added exact playhead boundary detection (`ctiSecs + 0.001 >= matchingClip.start && ctiSecs < matchingClip.end`) to word progression pills inside horizontal phrase cards. The exact word bubble under the Premiere Pro playhead highlights dynamically in real time with `.cc-is-playhead` (cyan glowing border and pulse animation).

## [v3.8.20] — 2026-07-01 | UI | Exact Horizontal Phrase Cards in Params Tab (<Image> Edit Tab Parity)
- **Params Tab Horizontal Phrase Cards (`ParamsView.tsx`, `ParamsView.css`)** — Replaced the mini timeline strip with exact horizontal phrase cards (`.mpe-horizontal-phrase-card`) matching the exact backend and frontend of the Edit Tab phrase card structure (`PhraseRow`). Cards are arranged horizontally side-by-side in a scrollable flex track (`.mpe-horizontal-phrases-track`).
- **Exact Card Header & Lock Parity** — Each horizontal phrase card features the exact header meta row displaying the phrase number (`#{gIdx + 1}`), formatted timestamp (`formatTime(startSecs)`), assigned MOGRT badge (`rawMogrtName`) with HSL dot/tint, and interactive lock toggle (`🔒` / `🔓`) linked directly to `lockStore`.
- **Word Bubble Parity** — Word pills inside each horizontal phrase card render inside `.cc-bubble-zone` with exact `.cc-word-pill` styling, glowing active states (`.cc-is-active`), selected borders (`.cc-is-selected`), and locked opacity.

## [v3.8.19] — 2026-07-01 | Doc | Comprehensive Overlay Pills Architecture & UX Comparison Document
- **Overlay Pills Comparison Document (`docs/OVERLAY_PILLS_COMPARISON.md`)** — Authored an exhaustive technical comparison between the two side-by-side implementations of the FreeXan Overlay Pill: the Electron Overlay Pill (`renderer/overlay.html/js/css`) and the C++ Native Direct2D Overlay Pill (`native-pill/`, `FreeXanPill.exe`). Documented functional differences (Chromium DOM vs Direct2D hardware rendering, Electron IPC vs Named Pipe `\\.\pipe\freexan_pill`, Chromium drag events vs non-blocking OLE `IDropTarget`), logical differences (`requestAnimationFrame` hit-testing vs Win32 `WM_NCHITTEST` radial clipping, JS timer state machines vs `TrackMouseEvent` instant hover, thread input focus stealing `AttachThreadInput` for keyboard routing), and UX differences (frosted glass vs matte dark Direct2D, 56px vs 84px circles, 8-bubble halo presentation).

## [v3.8.18] — 2026-07-01 | UI / Fix | Mini Timeline Header Strip, Prioritized Text Input Extraction & Image/Media Replacement
- **Mini Timeline Header Strip (`ParamsView.tsx`, `ParamsView.css`)** — Replaced bulky phrase bubble cards with an ultra-compact horizontal **Mini Timeline Header Strip** directly below the main navigation tabs, matching the Green Part diagram specification. Phrase titles (`⚡ [Phrase]:`) and word progression pills (`.mpe-mini-pill`) align neatly on a single scrollable track (`height: 20px; font-size: 11px; padding: 0 7px;`).
- **Prioritized Text Input Extraction (`ParamsView.tsx`)** — Fixed word progression phrase text extraction where MOGRTs containing `Ⓣ Word Progression` grabbed the wrong text parameter. Updated `getClipPhraseAndWordIdx` to specifically prioritize parameters matching `/text input|\u24c9|\u24c8|source text/i` over generic text fields.
- **Image & Media Replacement Support (`mogrt_editor.jsx`, `mogrt_editor.js`, `MogrtControls.tsx`)** — Added full backend and UI support for MOGRT image/media slots (`canReplaceMedia()`, `propertyType === 6 || 7`). Rendered a dedicated Image Control Row with a prominent `Replace Image...` button. Added `smSelectImageAndReplace` in ExtendScript to open an OS file dialog (`File.openDialog`), import the selected image/video into Premiere Pro's active bin, and call `prop.replaceMedia(item)`.
- **Properties UI Polish (`MogrtControls.tsx`)** — Filtered out internal numerical counter sliders (`Word Progression`, `Word Index`) from the property inspector so editors only see clean visual and styling properties. Rebuilt production bundle (`freexan-caption.js`).

## [v3.8.17] — 2026-07-01 | UI / Fix | Params Tab Compact Horizontal Bubbles (Image 3 Parity) & Interactive Hex Editing
- **Compact Horizontal Phrase Bubbles (`ParamsView.tsx`, `ParamsView.css`)** — Replaced large vertical phrase cards (which contained headers and count badges) with sleek, ultra-compact horizontal rounded bubble containers (`.mpe-compact-phrase-bubble`) matching the Edit Tab layout and Image 3 specifications. Enclosed word pills (`.mpe-compact-word-pill`) render in a single horizontal scrollable pill zone with glowing yellow borders (`#FFEB3B`) when selected or active on the timeline. Also enhanced `getClipPhraseAndWordIdx` to check `name`, `displayName`, `value`, and `val` across 0-indexed and 1-indexed progression parameters so word bubbles align accurately across all template structures.
- **Interactive Hex Input & Header De-duplication (`Inspector.tsx`, `ParamsView.tsx`)** — Fixed inability to type into the Hex color input box inside `CockpitColorPicker`. Added local editing state (`localHex`) so users can freely type hex strings without React instantly resetting character-by-character changes; colors automatically convert and sync once 3 or 6 valid hex characters are entered. Also added `hideHeader={true}` when embedding `CockpitColorPicker` inside `ParamsView.tsx` to eliminate duplicate stacked modal headers. Rebuilt production bundle (`freexan-caption.js`).

## [v3.8.16] — 2026-07-01 | Fix / Logic | Halo Mode Drop Import: Direct CEP Bin Import, Duplicate File Prevention & JSON Unescaping
- **Direct CEP Bin Import & Fallback Slot Mapping (`main.js`)** — Fixed file drop routing when holding `Ctrl` (Halo Mode). Previously, files dropped via Halo Mode (`opts.routeToFolder`) were copied to the disk folder but returned immediately (`imported: false`) without dispatching a `type: 'import'` WebSocket message to Premiere Pro CEP, relying entirely on background folder watchers. Updated `performImportDroppedFiles` to batch and dispatch immediate WebSocket import requests directly to Premiere Pro CEP (`wss.clients.forEach(...)`) with the exact assigned `binName`. Also added fallback link resolution in `refreshLinkedFolders` so `_freexan_slot_map.json` automatically maps to Halo slots 1–5 when `_freexan_links.json` sidecar is absent.
- **Duplicate File Copy Prevention & Path Normalization (`main.js`)** — Fixed inability to drop/copy the same file twice into the same folder when holding `Ctrl`. Added exact path normalization (`path.resolve(path.normalize(...))`) and self-copy detection (`isAlreadyInTarget`) so dropping an item already located inside the destination folder does not loop or fail `copyFileSync`.
- **JSON Unescaping & Target Bin Routing (`native-pill/IpcMessenger.cpp`, `native-pill/main.cpp`)** — Fixed quadruple backslash path corruption caused by `ExtractJsonString` not unescaping Windows directory separators (`\\`). Upgraded `ExtractJsonString` with full JSON unescaping (`\\` -> `\`) and updated `SendDropImport` in `main.cpp` and `IpcMessenger.cpp` to pass both `targetFolder` and `targetBin` over IPC. Recompiled standalone binary `FreeXanPill.exe`.

## [v3.8.15] — 2026-07-01 | UI / Feature | Params Tab Flux Overhaul: Phrase & Word Progression Bubbles, Mouse Scrolling, Auto Polling & Color Modal
- **Phrase & Word Progression Bubbles (`ParamsView.tsx`, `ParamsView.css`)** — Upgraded multi-MOGRT parameter editing to display full phrase groupings when one or more word MOGRTs are selected on the timeline. Words belonging to the same phrase (`phraseText`) are now cleanly enclosed inside a large glassmorphic **Phrase Bubble Card** styled with the exact deterministic MOGRT HSL card tint. Within each card, individual words are rendered as interactive **Word Progression Pills** (`Ⓣ`). Selected timeline MOGRTs are highlighted with glowing active pills, matching the Edit Tab experience.
- **Mouse Horizontal Scrolling & Jump/Multi-Select (`ParamsView.tsx`)** — Added horizontal mouse wheel scrolling (`onWheel`) across word progression pills. Users can click any word pill to jump the playhead directly to that word (`smSelectClipsByPhraseAndWord`) or `Shift+Click` to multi-select contiguous/non-contiguous words within or across phrase bubbles.
- **Real-Time Auto-Polling Check (`ParamsView.tsx`)** — Removed the need for users to manually click the Refresh button when selecting multiple MOGRTs on the timeline. Implemented a zero-cost 700ms polling interval that automatically detects Premiere timeline selection changes and syncs the Params tab seamlessly.
- **Top-Level Centered Color Modal (`ParamsView.tsx`, `Inspector.tsx`)** — Delegated color picker triggering (`onOpenColorModal`) directly to the top-level `ParamsView` root container with a dedicated backdrop overlay (`mpe-color-modal-overlay`), overriding fixed screen coordinates so the color picker always renders perfectly centered without clipping or layout jumping.

## [v3.8.14] — 2026-07-01 | UI / Feature | Params Tab UI Polish: AE-Style Sliders, Scrubbable Vectors, Real-Time Color Modal & Text Styling Bar


### UI & Feature Upgrades
- **AE-Style Scrubbable Sliders (`MogrtControls.tsx`)** — Upgraded numeric parameter controls (`kind === 'number'`) from plain number inputs to After Effects style range sliders (`<input type="range" className="mpe-range-slider" />`) paired with a centered numeric box, allowing rapid scrubbing and fine-tuned precision.
- **Scrubbable Vector Labels & Clean Integers (`MogrtControls.tsx`)** — Position and scale vectors (`kind === 'vector'`) now round coordinates cleanly to whole pixels (`Math.round(v)` when step is integer or whole px) instead of weird long decimals (`960.0000012`). Added horizontal mouse drag scrubbing (`cursor: ew-resize`) on X/Y labels so dragging left/right adjusts values in real-time.
- **Real-Time Color Picker Modal Fix & RGB/HSL Tabs (`Inspector.tsx`, `MogrtControls.tsx`)** — Fixed `CockpitColorPicker` disappearing prematurely on first click/drag in the saturation box. Separated live parameter changes (`handleColorLiveChange`) from modal closure so dragging hue/saturation updates timeline MOGRT colors in real time while keeping the modal open until `✕` or outside click. Added interactive mode tabs (`Hex | RGB | HSL`) allowing direct numerical input across all color spaces.
- **Text Property Font & Flux Style Bar (`MogrtControls.tsx`)** — Added an embedded styling toolbar above `kind === 'text'` properties when JSON typography metadata is present, allowing real-time selection of Font Family (`Inter`, `Montserrat`, `JetBrains Mono`, `Roboto`, `Impact`, `Bebas Neue`), Font Style (`Bold`, `Regular`, `Italic`), and preset text animation/styles (`⚡ Flux Style`).
- **Word Bubble Tabs with MOGRT Card Tint (`ParamsView.tsx`)** — When multiple MOGRT clips are selected on the timeline, tab selectors now display each clip's subtitle word (`getClipWord`) styled with the exact deterministic HSL MOGRT Card Tint (`getMogrtHue`) matching the Edit tab.

## [v3.8.13] — 2026-06-30 | Build | Compiled Standalone C++ Native Overlay Pill Binary (`FreeXanPill.exe`)

### Build, Perf & UI Refactor
- **Standalone Static Compilation (`native-pill/build.bat`)** — Resolved system error popups (`libgcc_s_seh-1.dll was not found` / `libstdc++-6.dll was not found`) when launching `FreeXanPill.exe` outside a shell with MinGW on `PATH`. Added `-static -static-libgcc -static-libstdc++` flags to `g++` compilation in `build.bat` so all C++ runtime dependencies are statically baked into a zero-dependency standalone Windows executable (~2.8 MB).
- **Non-Blocking OLE Drag-and-Drop & Asynchronous IPC Queue (`native-pill/`)** — Fixed Windows Explorer freezing/hanging during file drag-and-drop onto the C++ native pill (`FreeXanPill.exe`). Previously, synchronous execution of `WriteFile` inside `IDropTarget::Drop` blocked Windows Explorer's COM RPC loop if the IPC pipe thread was simultaneously executing synchronous `ReadFile`. Decoupled OLE drop execution by having `IDropTarget::Drop` post custom asynchronous message `WM_APP_DROP_FILES` to the window queue and returning `S_OK` immediately (<0.1ms). Upgraded `IpcMessenger` to use non-blocking `PeekNamedPipe` polling and a thread-safe outgoing message queue (`m_outQueue`), completely eliminating UI thread and Windows Explorer hangs.
- **Standalone Native Direct2D Halo Picker (`native-pill/`)** — Implemented 100% native hardware-accelerated Direct2D Halo Picker inside the C++ Native Pill (`FreeXanPill.exe`). Previously, dropping files onto the C++ pill forwarded the drop to the top Electron HTML pill (`overlayWindow`), causing bubbles to appear around the top pill while the bottom C++ pill did nothing. `FreeXanPill.exe` now parses `overlay-link-map` over IPC (`IpcMessenger.cpp`), dynamically expands its Win32 window to a `220×220` circular region when files are dropped while holding `Ctrl`, and renders its own ring of 8 numbered routing bubbles around itself using Direct2D (`Renderer.cpp`). Added focus stealing on drop (`AttachThreadInput` + `SetForegroundWindow` + `SetFocus`) and `WM_KEYDOWN` routing so pressing numbers `1`-`8` immediately routes files and closes the ring (`ExitHaloMode`), rather than leaking keystrokes to Windows Explorer. Clicking any bubble or pressing `Esc` / clicking outside closes the ring. Added visual contrast between assigned slots (filled vibrant purple, glowing border, bright white digit) and empty slots (dim dashed outline, 0.28 opacity digit). Added dynamic folder name banners displayed clearly outside assigned bubbles on hover. Recompiled standalone binary `FreeXanPill.exe`.
- **Tray Menu Controls, Process Tree Grouping & Native Repositioning (`main.js`, `native-pill/`, `renderer/overlay.html`)** — Configured `app.setName('FreeXan')`, `app.setAppUserModelId`, and updated `overlay.html` title to `FreeXan Overlay`. Upgraded `spawnNativePillProcess` to use `child_process.spawn(..., { detached: false })` instead of `exec`, linking `FreeXanPill.exe` directly under the main application process tree (`FreeXan`) in Windows Task Manager. Added a **Hide Pill / Show Pill** option to the system tray right-click context menu. Clicking **Hide Pill** terminates/closes both the Electron overlay pill and the C++ native pill (`FreeXanPill.exe`) and updates the menu label to **Show Pill**. Clicking **Show Pill** restarts both pills side-by-side. Also upgraded **Reposition Overlay** to move both the Electron pill and the C++ native pill back to their default screen coordinates (`x=20, y=20` for Electron pill; `x=20, y=115` for C++ native pill). *(Note: During side-by-side transition, toggling visibility or re-creating the Electron pill may leave duplicate Electron overlay instances if not singleton-guarded; kept as a known note since the old Electron pill will be deprecated/removed after C++ pill verification).*
- **True Round Circular Pill Geometry & OS Region Clipping (`native-pill/`)** — Restored the classic round/circular look (`84×84` circle when collapsed, capsule shape when expanded) while permanently eliminating the black square background box behind the circular pill. Updated Direct2D rendering in `Renderer.cpp` to use dynamic corner radius `(height - 2) / 2` and updated OS window clipping in `main.cpp` using `SetWindowRgn(..., CreateRoundRectRgn(..., height, height), TRUE)`. This trims the Win32 window physical boundaries precisely to the circular contour, ensuring zero unrendered black corner pixels around the circle. Recompiled standalone binary `FreeXanPill.exe`.

## [v3.8.12] — 2026-06-29 | Fix | Missing String.prototype.trim Polyfill in ExtendScript Sync

### Fix
- **ExtendScript ES3 String Trim Polyfill (`core/utils.jsx`, `core/utils.js`, `core/mogrt_editor.jsx`, `core/mogrt_editor.js`)** — Fixed `masterClip.name.replace().split().pop().replace().trim is not a function` error during parameter sync. In Adobe CS6/CC ExtendScript (ES3), `String.prototype.trim` is not natively supported. Added global `String.prototype.trim` regex replacement polyfill to `utils.jsx` & `utils.js`, and replaced `.trim()` calls in `smSyncParamAcrossSelected` with direct `.replace(/^\s+|\s+$/g, '')` for guaranteed compatibility.

## [v3.8.11] — 2026-06-29 | Fix | ES3 Syntax Error in mogrt_editor.jsx Terminating Backend Load

### Fix
- **ExtendScript ES3 Regex Syntax Error (`core/mogrt_editor.jsx`, `core/mogrt_editor.js`)** — Fixed fatal syntax errors caused by `.split(/[/\\]/)`. In Adobe's ExtendScript (ES3) engine, unescaped forward slashes inside a character class `[...]` prematurely terminate regex literals, causing the parser to throw `SyntaxError: Syntax error` when evaluating `mogrt_editor.jsx`. Because `#include "core/mogrt_editor.jsx"` failed during initialization, none of the Params tab functions (`smGetSelectionParams`, `smGetClipUnderPlayhead`) were ever loaded into engine memory, causing every IPC call from `ParamsView.tsx` to return `null` (`DBG: JSX not ready — waiting...`). Replaced all instances with `.replace(/\\/g, '/').split('/')`.

## [v3.8.10] — 2026-06-29 | Fix | JSX Backend Not Loading (manifest.xml ScriptPath Wrong)

### Fix
- **manifest.xml ScriptPath: `test.jsx` → `main.jsx` (`CSXS/manifest.xml`)** — The CEP manifest was pointing to `panel/jsx/test.jsx` (a one-time syntax tester with hardcoded absolute paths) instead of `panel/jsx/main.jsx` (the real entry point with `#include` directives for all backend modules). This caused every `execute()` call in the Params tab to return `null` (EvalScript error) because `smGetSelectionParams`, `smApplyParam`, and all other functions were never loaded into the ExtendScript engine. Fixed the `<ScriptPath>` in source `CSXS/manifest.xml`. Re-install using `Install_freeXan_Caption.bat` and restart Premiere Pro.

## [v3.8.9] — 2026-06-29 | Fix | Params Tab "no clips: null" on JSX Not Ready

### Fix
- **Params Tab Null Result Guard (`ParamsView.tsx`)** — `smGetSelectionParams` returns `null` (via `useJsx`) when ExtendScript functions are not yet loaded in Premiere's engine. Added `isJsxReadyRef` which only becomes `true` after the first successful fetch response. `fetchParams` now treats `null` silently (`JSX not ready — waiting...`) and the `ctiSecs` playhead subscriber is gated on `isJsxReadyRef.current` — it will not trigger until JSX is confirmed working. Also improved empty-clips DBG message to `Ready — select a MOGRT on the timeline` instead of the cryptic raw JSON dump. Rebuilt production bundle (`freexan-caption.js`).

## [v3.8.8] — 2026-06-29 | Perf | Zero-Cost Playhead Subscriber Replaces Params Tab Poll

### Perf & Refactor
- **Zero-Cost Playhead Subscriber (`sessionStore.ts`, `EditView.tsx`, `ParamsView.tsx`)** — Eliminated ParamsView's own 300ms `setInterval` (which was calling `smGetClipUnderPlayhead()` via the JSX bridge). Instead, added `ctiSecs: number | null` and `setCtiSecs()` to `sessionStore`. EditView's existing 500ms `getPlayheadTime()` poll now writes the value to the shared store with a single Zustand `set()`. ParamsView subscribes via `useSessionStore` and triggers `fetchParams()` only when `ctiSecs` changes — entirely in-memory, zero additional JSX calls. The `isFetchingRef` guard and `prevClipsJson` dedup continue to prevent flood and unnecessary re-renders. Rebuilt production bundle (`freexan-caption.js`).

## [v3.8.7] — 2026-06-29 | Feature | Playhead-Responsive Params Tab

### Feature & Perf
- **Playhead-Responsive Params Tab (`mogrt_editor.jsx`, `mogrt_editor.js`, `ParamsView.tsx`)** — Added `smGetClipUnderPlayhead()` ExtendScript function: a lightweight CTI-scan that returns only `{nodeId, name, isMogrt}` without doing any property parsing. React side now runs a 300ms smart poll that calls this cheap function every tick, and only triggers a full `smGetSelectionParams()` parse when the `nodeId` under the playhead actually changes. An `isFetchingRef` guard prevents queuing multiple concurrent fetches. Poll cleans up on unmount. Result: the Params tab updates instantly when scrubbing the timeline (~300ms latency) with minimal JSX bridge overhead (~3 calls/sec). Rebuilt production bundle (`freexan-caption.js`).

## [v3.8.6] — 2026-06-29 | Fix | Enabled Extensive Debugging Telemetry & Fixed Master Reference Matching for Single Property Sync

### Fix & Logic
- **Robust Sync Debugging & Master Reference Resolution (`mogrt_editor.jsx`, `mogrt_editor.js`, `ParamsView.tsx`)** — Enabled comprehensive telemetry and diagnostic debugging for single-property MOGRT sync. Prioritized `data.nodeId` matching to guarantee that the MOGRT currently being edited in the UI is selected as the master reference clip before falling back to timeline playhead position. Added vector type checking (`!isNaN(parseFloat)`) to prevent text strings containing commas from being erroneously treated as vector coordinates. Surfaced rich diagnostic string array (`debugLog`) directly into the UI header banner (`setDbg`) so users and developers can see real-time match and failure reasons per clip. Rebuilt production bundle (`freexan-caption.js`).

## [v3.8.5] — 2026-06-29 | Feature | Added "⚡ Sync" Button for Single Property Synchronization Across Identical Selected MOGRTs

### Feature & UI
- **Single Property Synchronization Across Identical Selected MOGRTs (`MogrtControls.tsx`, `ParamsView.tsx`, `mogrt_editor.jsx`)** — Added a sleek `⚡ Sync` button next to each property name in the Parameters tab. Clicking this button triggers `smSyncParamAcrossSelected()`, which gets the full data of the property, loops through all clips selected on the Premiere Pro timeline, identifies the reference master MOGRT under the playhead, filters out different MOGRT templates, and inserts that exact property without touching other properties using the well-researched index-based property insertion engine. Rebuilt production bundle (`freexan-caption.js`).

## [v3.8.4] — 2026-06-29 | Refactor | Added IPC Named Pipe Bridge for Side-by-Side C++ Native Overlay Pill

### Refactor & Perf
- **Side-by-Side C++ Native Overlay Pill Architecture (`native-pill/` & `main.js`)** — Implemented the complete standalone Win32 / Direct2D C++ native overlay pill inside `native-pill/` (`main.cpp`, `Renderer.h/cpp`, `DropHandler.h/cpp`, `IpcMessenger.h/cpp`, `build.bat`). Features exact functional parity including OLE drag-and-drop (`IDropTarget`), hit-testing click pass-through (`WM_NCHITTEST`), hover expansion, and real-time JSON Named Pipe communication. Added a Named Pipe server (`\\.\pipe\freexan_pill`) and side-by-side process spawner in `main.js`, and refactored `import-dropped-files` and `import-browser-image` into standalone helpers so both Electron renderer IPC and C++ Named Pipe messages execute identical drop import logic with full telemetry instrumentation (`sendLog`).

## [v3.8.3] — 2026-06-29 | Feature | Synchronized MOGRT Card Tints & Auto-Select by MOGRT

### Feature & UI
- **Synchronized MOGRT Card Tints & Auto-Select by MOGRT** — Implemented deterministic HSL Card Tints across MISTER BloomX (`CEPs/MISTER_BloomX/dist/index.html`) and FreeXan Caption (`PhraseRow.tsx`). Each MOGRT's base filename is cleaned and hashed into a consistent color palette, applying a matching glowing border, background tint, and color dot badge. Clicking on this MOGRT badge in any phrase card in FreeXan Caption automatically scans all phrases in the Edit tab and multi-selects every phrase assigned with the same MOGRT. Rebuilt production bundle (`freexan-caption.js`).

## [v3.8.2] — 2026-06-27 | Fix | Re-wired bridgeCaptionGaps into Caption Generation Pipeline

### Feature & UI
- **Zero-Waste Progressive Execution & Live Stage Inspector** — Refactored `transcriber_sandbox/sarvam_minimal_test.html` to decouple Stage 1 (Sarvam AI), Stage 2 (Modal GPU), and Stage 3 (Groq Llama LLM) fault boundaries. Word-by-word timestamps are rendered and preserved immediately after Stage 2 completes, ensuring any subsequent Stage 3 LLM failure never wastes earlier stage outputs. Added a 3-Tab Live API Inspector (`🟢 Stage 1`, `🟣 Stage 2`, `⚡ Stage 3`) to Box 3 for viewing individual API responses and diagnostics in real time.

### Fix
- **Bridge Micro 1-2 Frame Caption Gaps** — Wired `bridgeCaptionGaps()` invocation into both frontend React UI (`StepRender.tsx`) immediately after the word rendering loop finishes, and backend ExtendScript engine (`runCaptionGenerate` in `mogrt.jsx` / `mogrt.js`). Rebuilt extension production bundle (`freexan-caption.js`). This ensures any 1-2 frame quantization or track switching gaps between adjacent subtitle clips are automatically stretched and snapped shut.

## [v3.8.1] — 2026-06-27 | Docs | Interactive UI & Functions Guide for freeXan Caption

### Docs
- **Interactive UI & Functions Guide** — Created comprehensive Simple Language reference manual (`interactive_ui_and_functions_guide.md`) in `CEPs/freeXan_Caption/docs/guides/`. Details all interactive UI triggers across the Workflow, Cockpit, Command Center, Sync, and Parameters tabs, maps out function execution sequences, and provides plain-English definitions for every frontend and ExtendScript backend function.

## [v3.8.0] — 2026-06-26 | Feature | Dual SRT Phrasing & Manual Mode UI Refactoring

### Feature
- **Dual SRT Phrasing in freeXan Caption Workflow tab** — Added optional support for a second phrasing SRT file in the Workflow tab (`StepRender.tsx`) and ExtendScript engine (`mogrt.jsx` / `mogrt.js`). Users can now supply word-by-word timing accuracy SRT alongside a separate semantic phrasing SRT to generate perfectly aligned and structured MOGRT subtitles.
- **Manual Mode Native Dialog Browsing & Radio Buttons** — Refactored manual mode file selection across `StepCheckProject`, `StepParseSrt`, and `StepRender` to use reliable native OS file open dialogs (`window.cep.fs.showOpenDialog`) via a new `showCepFileBrowser` helper. Switched the slider/phrasing selection UI from checkboxes to clear radio buttons (`auto`, `slider`, `dual_srt`).

## [v3.7.0] — 2026-06-26

### Feature
- **4-Track Synchronized Subtitle Suite shipped** — Upgraded `transcriber_sandbox/sarvam_minimal_test.html` with simultaneous 4-way SRT generation (Native Word, Roman Word, Native Phrase, Roman Phrase) powered by Groq Llama-3.3-70B semantic phrasing and Hinglish romanization. Uses deterministic ID pointer mapping (`0..N`) to guarantee 0ms timing drift against physical acoustic VRAM timestamps.

## [v3.6.0] — 2026-06-25

### Feature
- **Phase 4 — Caption MCP tools shipped + existing tools renamed per nomenclature.** Claude can now drive the entire freeXan Caption Workflow tab via two new MCP tools, and every existing MCP tool carries its canonical scope prefix (`freexan_app_*` for OS-level, `freexan_link_*` for Premiere-only). (`mcp/server.js`, `cli/freexan.js`)
- **NEW: `freexan_caption_ping` MCP tool** — Safe read-only health check. Returns `{ pluginConnected, jsxLoaded, supportedActions }`. Confirms Caption panel is alive AND `runCaptionGenerate` JSX is loaded before attempting generation.
- **NEW: `freexan_caption_generate` MCP tool** — DESTRUCTIVE (description tells Claude to confirm with user first). One-shot equivalent of the Workflow tab. Args: `{ hinglishSrtPath, mogrtPath, charsPerPhrase?, trackStart? }`. Returns `{ wordsRendered, phrasesCreated, totalWords, firstVideoTrack, secondVideoTrack, mogrtName, mogrtMode, sequenceFrameRate, mogrtFrameRate, failures[] }`. 180 s plugin timeout (HTTP client 200 s) for long SRTs.
- **MCP tool renames (per `docs/NOMENCLATURE.md` scope rule — OS-level=`app`, Premiere-only=`link`):**
  - `freexan_status` → `freexan_app_status`
  - `freexan_list_clients` → `freexan_app_list_clients`
  - `freexan_list_templates` → `freexan_app_list_templates`
  - `freexan_create_project` → `freexan_app_create_project`
  - `freexan_open` → `freexan_app_open`
  - `freexan_import_files` → `freexan_link_import_files`
- **`freexan_app_status` now reports `connectedPlugins`** — array of plugin names currently connected via WebSocket (e.g. `["link", "bloomx", "caption"]`). Lets Claude verify plugin availability before calling plugin tools.
- **MCP Current Version: v3.8.10
[2026-06-29] Fix manifest.xml ScriptPath: Changed `<ScriptPath>` in `CSXS/manifest.xml` from `./panel/jsx/test.jsx` to `./panel/jsx/main.jsx`. The wrong entry point was causing all JSX backend functions to be unavailable at runtime, making every `execute()` call return null. This explains the `DBG: JSX not ready — waiting...` and earlier `DBG: no clips: null` messages in the Params tab.

## Version: v3.8.90 → 0.2.0** (in `mcp/server.js` Server() constructor).
- **CLI: new `caption` subcommand** — `freexan caption ping` and `freexan caption generate <srt> --mogrt <path> [--chars-per-phrase N] [--track-start N]`. Existing flat commands (status, clients, templates, new, import, open) unchanged. CLI version 0.1.0 → 0.2.0. (`cli/freexan.js`)

### Build
- `package.json` 3.5.6 → 3.6.0 (minor — new MCP tools + new CLI subcommands are user-visible features).
- Updated `docs/NOMENCLATURE.md` registry tables — all 8 actions now marked ✅ live.
- **No Caption panel rebuild needed** — only the MCP server and CLI changed.

### Migration notes
- Claude Code MCP config does NOT need editing (server path unchanged). Claude Code restart picks up the new tool list automatically.
- Any saved Claude conversation referencing OLD tool names will see them missing in a new session — phrasing like "use the freexan app status tool" still works (Claude finds the new name).
- The `_app_` / `_link_` prefixes ARE breaking changes for any external script that hits the MCP server programmatically; for human Claude use it's transparent.

---

## [v3.6.5] — 2026-06-26

### Sarvam AI Cloud Sandbox — Minimal UI
- **Minimal UI Test Harness.** Created `transcriber_sandbox/sarvam_minimal_test.html` — self-contained, minimal web debug interface for testing Sarvam AI subscription keys and inspecting raw vs. transformed FreeXan JSON contracts.
- **Contract Transformer.** Added live Javascript transformer mapping Sarvam Saaras API word output (`word`, `start_time_s`, `end_time_s`) into FreeXan timeline subtitle segments (`[{text, start, end, words}]`).

## [v3.6.4] — 2026-06-26

### AI Transcriber Sandbox — Phase 1
- **Isolated Sandbox Created.** Created `transcriber_sandbox/` directory inside workspace root for isolated development of the local speech-to-text forced alignment engine.
- **Core Engine Script.** Added `core_engine.py` using `faster-whisper` + `WhisperX` Wav2Vec2 alignment models. Outputs a strict JSON contract (`status`, `language`, `durationMs`, `segments` with millisecond `words` timestamps) formatted for Premiere Pro MOGRT slider progression.
- **Automated Setup.** Added `requirements.txt` and `setup_sandbox.bat` to automatically instantiate a localized Python virtual environment (`venv`) and install PyTorch with CUDA 12.1 GPU support.

## [v3.6.3] — 2026-06-25

### Link freeXan — New
- **Standalone Installer.** Created `CEPs/Link_freeXan/install_link_freexan.bat` — self-contained 3-step Windows installer: (1) enables CEP `PlayerDebugMode` for all known CSXS versions, (2) wipes old install and robocopy-deploys to `%APPDATA%\Adobe\CEP\extensions\com.bloomx.freexan.link\`, (3) verifies `CSXS/manifest.xml` exists. No Admin rights required.

## [v3.6.2] — 2026-06-25

### FreeXan Caption CEP — Bug Fixes
- **Blank Screen on Tab Switch.** Replaced `AnimatePresence mode="wait"` with always-mounted tab DOM pattern. Added `ErrorBoundary.tsx` for per-tab fault isolation.
- **CEP Panel Close Kills Other Panels.** Guarded `ws.onerror` in `useFreeXanWs.ts`; added `beforeunload` cleanup in `main.tsx` to gracefully close WebSocket before Adobe tears down the CEP extension host.

### Electron App — Bug Report Button
- **Report Bug Modal.** Replaced blocking `alert()` with inline status toast (`#bug-report-status`). Added defensive `window.api?.` guard. Added `⏳ Sending…` spinner. Modal auto-closes 2.5 s after success.

### Workspace Rule
- **Debugging Framework Rule.** Added `.agents/rules/debugging_framework.md` — a persistent workspace rule enforcing telemetry instrumentation patterns (correlationId, PII scrubbing, slow-execution WARNs, ErrorBoundary, IPC timing) on every future code change.

## [v3.6.1] — 2026-06-25

### FreeXan Caption CEP — UX
- **SRT Export Buttons Moved to Header.** Relocated "Save WBW Srt." and "Save Phrased Srt." buttons from the footer into the toolbar header alongside Refresh and Save Style for quicker access. Rebuilt `panel/dist/freexan-caption.js`.

## [v3.6.0] — 2026-06-25

### Verification & Milestones
- **Phase 6 System Verification & Log Integrity Audit Shipped.** Executed automated verification suite confirming intact correlation ID tracing across Electron Renderer, Main process, and CEP ExtendScript tiers. Audited diagnostic ZIP archives in memory to verify zero PII leaks across Windows (`C:\Users\...`), macOS (`/Users/...`), and Linux (`/home/...`) filepaths. Confirmed hardware context telemetry (`ramMb`, `freeRamMb`, `cpuCores`) is accurately packaged. Shipped full Telemetry & Debugging Roadmap (Phases 1–6).

## [v3.5.9] — 2026-06-25

### Diagnostic & Bug Reporting
- **Phase 5 One-Click Diagnostic Bundler & Bug Report Emailer Completed.** Upgraded `exportDiagnosticsZip` in `main.js` to sort log files by modification time and include only the last 3 rotations. Added comprehensive PII scrubbing regexes replacing user filepaths (`C:\Users\Aditya\...` / `/Users/...`) with `[USER_PATH]`. Enhanced `getSystemContext()` in `logger.js` to capture RAM availability (`ramMb` / `freeRamMb`) and CPU core counts. Exposed `exportDiagnostics` via `preload.js` and verified seamless webhook dispatch to `swastik@bloomxsolutions.com` via the existing `send-bug-report` modal handler.

## [v3.5.8] — 2026-06-25

### Telemetry
- **Phase 4 Claude Code MCP Bridge Telemetry Completed.** Instrumented `httpApi.js` to intercept HTTP requests from `mcp/server.js` and CLI tools. Computes SHA-256 input hash and logs `mcp:tool-call` and `mcp:tool-resolve` event pairs with exact `durationMs`. Added slow execution detection triggering `mcp:tool-slow-execution` WARN telemetry if duration exceeds 8000ms.

## [v3.5.7] — 2026-06-25

### Fix & Telemetry
- **Phase 3 P1 Caption Surgical Repair & Heartbeat Completed.** Fixed ExtendScript regex typos (`split(/\s+/)`, `replace(/^\s+|\s+$/g)`) across `timeline.jsx` and `timeline.js`. Refactored `sm_tools_add_word_v28` and `sm_tools_remove_word_v28` to update *only* the MOGRT clip directly under playhead immediately for zero UI lag. Added selection safety fallback track scanner to `sm_tools_reset_progression_v28`. Implemented 10-second background CEP heartbeat timeout detection (`cep:heartbeat-timeout` WARN >11s) in `main.js`.

## [v3.5.6] — 2026-06-25

### Telemetry & UI
- **Phase 2 Universal Telemetry Instrumentation Completed.** Verified `window.freeXanLog` context bridge in `preload.js`. Stamped Tab navigation clicks (`ui:tab-click`) and Bug Report modal lifecycle events (`ui:report-bug-*`) with unique UUID `correlationId` tracking in `renderer/app.js`. Added optimistic UI correlation tracking to Halo Bubble picker events (`ui:halo-pick`, `ui:halo-cancel`) in `renderer/overlay.js`.

## [v3.5.5] — 2026-06-25

### Refactor
- **Nomenclature standardization across the freeXan API stack.** Established canonical action-ID scheme `{scope}.{verb}[_{object}]` with controlled verb vocabulary and per-layer naming patterns (HTTP / WebSocket / MCP / CLI / JSX). New file `docs/NOMENCLATURE.md` is authoritative. (`docs/NOMENCLATURE.md`)
- **Scope rule established (per Swastik):** OS-level work = `app`, Premiere-only work = `link`, plugin-internal work = `{plugin}` (`caption`, `bloomx`, `audio`).
- **JSX private helpers in `mogrt.jsx` lost the `sm` qualifier** (8 helpers, 49 occurrences, all 1:1):
  - `_smFindAllTextParams` → `_findAllTextParams`
  - `_smGetText` → `_getMogrtText` *(kept `Mogrt` qualifier to avoid ExtendScript global-scope name collision)*
  - `_smSetText` → `_setMogrtText` *(same reason)*
  - `_smDetectCapabilities` → `_detectCapabilities`
  - `_smDistributeWords` → `_distributeWords`
  - `_smReadWordTimings` → `_readWordTimings`
  - `_smWriteWordTimings` → `_writeWordTimings`
  - `_smIsGenericClip` → `_isGenericClip`
- **JSX action entry renamed** — `runCaptionWorkflow` → `runCaptionGenerate`. `generate` is the standard verb for "produce content output"; `Workflow` was a vestigial UI-tab name. (`CEPs/freeXan_Caption/panel/jsx/core/mogrt.jsx`)
- **Plugin action renamed** — `caption_create` → `caption_generate`. `create` is reserved for DB-backed `app` resources; captions are produced content. (`CEPs/freeXan_Caption/panel-src/src/lib/captionMcpHandlers.ts`)
- **Pre-rename backups** taken to `Debug/backup-rename-20260625_120207/` (mogrt.jsx + captionMcpHandlers.ts).

### Build
- `package.json` 3.5.4 → 3.5.5 (refactor patch — naming-only, behaviour unchanged).
- Caption panel rebuilt — `npm run build` inside `panel-src/`. TS passed; Vite emitted 1,868.74 KB IIFE bundle. Post-build grep on `panel/dist/freexan-caption.js`: **0 references to old names**.

### Deferred (scope acknowledged, not done this session)
- Public `sm_*` JSX function purge (10+ functions in Edit + Tools tabs) — needs dedicated session with before/after tab testing.
- Paired `.js` files alongside `.jsx` in `panel/jsx/core/` — sizes drift; audit + delete TBD.
- Existing MCP tool renames (`freexan_status` → `freexan_app_status`, etc.) — bundled with Phase 4 so one Claude Code restart picks up everything.

---

## [v3.5.4] — 2026-06-24

### Feature
- **Caption plugin WebSocket → ExtendScript bridge (Phase 3 of plugin-level MCP).** The freeXan Caption panel now listens for `plugin_action` messages from the main process and dispatches them to ExtendScript via `csi.callJSX`. With this in place, the full pipeline is alive: CLI/MCP/Claude → HTTP `POST /plugin-action` → main.js `dispatchToPlugin` → Caption panel WS → JSX `runCaptionWorkflow` → Premiere timeline. (`CEPs/freeXan_Caption/panel-src/src/lib/captionMcpHandlers.ts`, `panel-src/src/hooks/useFreeXanWs.ts`)
- **New file `panel-src/src/lib/captionMcpHandlers.ts`** — action dispatcher with two handlers in v0.1:
  - `caption_create` — full Workflow-tab equivalent. Validates `args`, calls `runCaptionWorkflow`, surfaces JSX-side `status:"Error"` responses as thrown errors so the main bridge maps them to HTTP 500.
- **P1 Instant Playhead Refresh** in Add/Remove Word tools.
- **Fixed word splitting regex (/\s+/)** in Add/Remove Word tools.
- **Fixed ES3 Array.filter crash** in Add/Remove Word tools in 	imeline.jsx.

### Perf
- **Fast Add/Remove Word Tools.** Replaced lengthy O(N) searching and redundant full-phrase Master Style re-injections with a blazing fast duplicate-and-trim model for Add Word and gap-fill extension model for Remove Word. Execution time reduced from ~3s to near-instantaneous.

### Feature
- **Reset Word Progression Tool.** Added Reset Word Progression button to Tools tab Word Edit group. Select scrambled clips of a phrase on timeline and click to sequentially re-assign Word Progression from 1 to N.
  - `caption_ping` — health check. Probes whether `runCaptionWorkflow` is defined in the ExtendScript engine and returns the list of supported actions.
- **`useFreeXanWs.ts:onmessage` extended** — new branch matches `msg.type === 'plugin_action'`, calls `dispatchPluginAction(action, args)`, and sends back `{ type: 'plugin_action_result', requestId, result | error }` on either path. Send-side failures are caught + logged so the panel can never crash from a missing/closed socket.
- **Explicit plugin identity on connect** — Caption panel now sends `{ type: 'ext_hello', plugin: 'caption', version: 'caption-1.0.0' }` immediately on `ws.onopen`. The main process already auto-tagged us via `get_project_state` (which still runs right after), but the explicit hello makes the registration deterministic and forward-compatible with future protocol changes.
- **Built bundle updated.** `panel/dist/freexan-caption.js` rebuilt with `npm run build` (TypeScript type-check passed; Vite emitted 1,867 KB IIFE bundle).

### Build
- `package.json` version bumped 3.5.3 → 3.5.4 (patch — Phase 3 of plugin MCP plumbing; user-visible feature still pending Phase 4 MCP tool wrapper).

### Notes
- **Restart required** — Premiere must be closed and reopened (or at minimum, the Caption panel closed and reopened via `Window → Extensions → freeXan Caption`) to load the new bundle. The ExtendScript engine also re-reads `mogrt.jsx` on Premiere restart, so this picks up Phase 2's `runCaptionWorkflow` at the same time.
- **End-to-end test path** — after restart, `curl -X POST http://127.0.0.1:4555/plugin-action -d '{"plugin":"caption","action":"caption_ping"}'` should now return `{"success":true,"result":{"pluginConnected":true,"jsxLoaded":true,"supportedActions":["caption_create","caption_ping"]}}` instead of the 504 timeout we got after Phase 1.

---

## [v3.5.3] — 2026-06-24

### Feature
- **Caption workflow JSX wrapper (Phase 2 of plugin-level MCP).** New `runCaptionWorkflow(args)` function in `panel/jsx/core/mogrt.jsx` that bundles the entire 4-step Workflow tab pipeline into ONE ExtendScript call: read the Hinglish word-by-word SRT from disk, parse it into a `wordsList`, apply phrasing logic (alternating tracks, char-per-phrase splitting on `.!?`), call `getData()`, then loop `createCaptions()` per word. Returns a JSON summary `{ status, wordsRendered, phrasesCreated, totalWords, mogrtName, mogrtMode, failures[] }`. (`CEPs/freeXan_Caption/panel/jsx/core/mogrt.jsx:807-1088`)
- **SRT parsing in ExtendScript** — new helpers `_rcwTrim()` and `_rcwTsToMs()`. Parses standard SubRip format with both `,` and `.` decimal separators. Reads file via the ExtendScript `File` API in UTF-8 mode. (`mogrt.jsx:1071-1089`)
- **Phrasing algorithm ported 1:1 from `StepRender.tsx:168-241`** — same `charsPerPhrase` limit (default 100), same alternate-track behaviour (1↔2 on punctuation), same `phraseNumber`/`numWords`/`progressionValue`/`videoTrack` fields. Output is bit-identical to today's Workflow tab.
- **Failure tracking** — per-word failures are accumulated in a `failures[]` array instead of throwing, so a single bad word doesn't abort the whole batch. Each entry: `{ wordNumber, wordText, error }`.

### Build
- `package.json` version bumped 3.5.2 → 3.5.3 (patch — additive JSX function; no existing function modified; no panel rebuild required).

### Notes
- **No `npm run build` needed for this phase.** ExtendScript reloads on Premiere restart and the changes are in `panel/jsx/core/mogrt.jsx` (the runtime artifact). The TypeScript source under `panel-src/src/` is untouched.
- **Plugin side still doesn't know about this yet.** Phase 3 wires `useFreeXanWs.ts` to receive `plugin_action` messages and call `csi.callJSX('runCaptionWorkflow', args)` — that step requires the Vite build.
- **Smoke test path (manual, ExtendScript console in Premiere):** open Premiere with the freeXan Caption panel, open the ExtendScript Toolkit / VS Code debugger, paste `runCaptionWorkflow({ hinglishSrtPath: '...', mogrtPath: '...' })` and check the returned JSON. This proves the wrapper works before we wire up Phase 3.

---

## [v3.5.2] — 2026-06-24

### Feature
- **Plugin Bridge plumbing (Phase 1 of plugin-level MCP control).** New generic dispatcher in `main.js` that lets the CLI/MCP address any individual CEP plugin via WebSocket, with request/response correlation by `requestId` and clean timeout/disconnect handling. Future plugin-level MCP tools (caption_create, audio_search, mogrt_insert, etc.) build on top of this — no Caption/Audio/BloomX plugin code touched yet. (`main.js`, `httpApi.js`)
- **Plugin connection registry** — new `pluginConnections` Map in `main.js` keyed by plugin name (`link`, `caption`, `bloomx`). Plugins are auto-registered on their first identifying message: `ext_hello` → `link`, `get_project_state` → `caption`, `get_mogrt_library` → `bloomx`. `ext_hello` also now accepts an explicit `plugin` field for forward compat — back-compat preserved (missing field defaults to `link`). (`main.js:526–555`)
- **`dispatchToPlugin(plugin, action, args, timeoutMs)`** — Promise-returning helper that finds the named plugin's ws connection, sends `{ type: 'plugin_action', requestId, action, args }`, and awaits a `plugin_action_result` reply with the same requestId. Times out after `timeoutMs` (default 30 s, clamped 1 s–10 min). Pending requests are rejected cleanly if the target plugin disconnects mid-call. (`main.js:557–598`)
- **HTTP route `POST /plugin-action`** — Generic JSON endpoint that wraps `dispatchToPlugin`. Body: `{ plugin, action, args?, timeoutMs? }`. Maps errors to status codes: 503 = plugin not connected, 504 = plugin connected but didn't reply in time, 500 = other. (`httpApi.js:185–220`)
- **`GET /status` extended** — now returns `connectedPlugins: string[]` so the CLI/MCP can see which plugins are live before dispatching. (`main.js` httpApi context)

### Build
- `package.json` version bumped 3.5.1 → 3.5.2 (patch — plumbing only, no user-visible feature yet; all four plugins' source code is untouched).

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.

### Feature
- **SRT Export Tools.** Added "Save WBW Srt." and "Save Phrased Srt." buttons to the Edit Tab footer. generateWbwSrt exports a .srt file where each time block contains exactly one word. generatePhrasedSrt exports a .srt file where each time block contains the entire phrase.
  - Fixed missing text parameter matching in sm_tools_format_text_selected_mogrts where Text Format tool skipped MOGRTs using 'Text' or 'Source Text' instead of 'Text Input', causing 'No clips updated.' errors.


## [v2.2.4] — 2026-05-29

### Fix
- **Project creation crashed with EPERM when a preset asset was a folder:** `create-project` used `fs.copyFileSync()` for all preset assets unconditionally — that call throws EPERM on Windows when the source path is a directory. Added `fs.statSync` check: folders are now copied with `fs.cpSync(src, dest, { recursive: true })` into the project root; files continue using `getDestSubfolder()` + `copyFileSync` as before. Same guard added to `import-dropped-files` for dropped folders. (`main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v2.2.3] — 2026-05-29

### Fix
- **Drag-drop imports now copy files to the project folder; DB asset imports do not:** Restored `getDestSubfolder()` + `fs.copyFileSync()` logic in `import-dropped-files`. Files dropped on the overlay are copied into the appropriate project subfolder (footage / audio / assets) and Premiere imports from the copy. Files from the Assets collection (`setup-project` handler in `ext.js`) are still imported from their original location — no copy. (`main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v2.2.2] — 2026-05-29

### Fix
- **Drag-drop imports were copying files into the project folder before importing:** The `import-dropped-files` handler was calling `getDestSubfolder()`, creating a versioned destination path, and running `fs.copyFileSync()` before sending the path to Premiere. This duplicated assets on disk unnecessarily. Removed all copy-to-disk logic from the handler — the original `filePath` is now sent directly to the CEP panel via WebSocket. `getDestSubfolder()` itself was kept; it is still used by `import-browser-image`. (`main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v2.2.1] — 2026-05-29

### Fix
- **Browse button in Assets section could not select folders:** The handler called `window.api.selectFiles()` which uses `openFile` only. Swapped to `window.api.ft.selectAsset()` which already passes `['openFile', 'openDirectory']` — the same dialog used in the folder template asset picker. (`renderer/app.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v2.2.0] — 2026-05-29

### Feature
- **Library asset import via Premiere template:** The Premiere Pro tab in the template editor now has a `+ Import` button on each bin (edit mode). Clicking it opens a picker listing all assets from the DB Assets library. Selecting one attaches an `import` node to that bin — stored in `bins_json` with `{ type: "import", name, file_path, asset_id, parent_id }`. At project creation, `extractPremiereImports()` in `main.js` walks those nodes, expands any folder paths to individual files, and passes them to `pendingProjectSetup.assets`. Premiere receives them in `setup-project` and imports each file into the correct bin automatically. (`renderer/app.js`, `renderer/styles.css`, `main.js`)
- **Import nodes visible in Premiere tree:** `renderPremiereNode()` handles `type === "import"` — renders with 📂 icon, amber name, and dimmed filename. Delete button removes the node. (`renderer/app.js`, `renderer/styles.css`)

### Fix
- **`setup-project` assets were never imported into Premiere (silent failure):** The handler in `ext.js` called `importAssetToBin()` as a named hostscript.jsx function — same pattern as the v1.8.3 / v2.1.1 bug, silently fails every time. Replaced with an inline IIFE using the same `findBin()` recursive search used for drag-drop imports. (`cep-extension/ext.js`)
- **Mode B (open_template) always sent `assets: []`:** Never forwarded any attached imports to the CEP panel. Now uses `extractPremiereImports(rawBins)` so library assets fire on template open too. (`main.js`)
- **EXT_VERSION bumped 1.9.8 → 1.9.9** to force panel reload. (`cep-extension/ext.js`, `main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v2.1.4] — 2026-05-29

### Fix
- **Import not routing to nested bins:** The bin search only looked one level deep in `rootItem.children`. A target bin nested inside another bin was never found, so `tgt` fell back to `rootItem`. Replaced the flat loop with a recursive `findBin(parent, name)` DFS function inside the IIFE that walks the full bin tree at any depth. (`cep-extension/ext.js`)
- **EXT_VERSION bumped 1.9.7 → 1.9.8** to force panel reload. (`cep-extension/ext.js`, `main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v2.1.3] — 2026-05-29

### Fix
- **Import always landing in root bin instead of target bin:** The bin search loop in the `ext.js` import IIFE used `app.project.rootItem.numItems` as the loop limit — that property does not exist in Premiere ExtendScript, so the loop never ran and `tgt` stayed as `rootItem`. Replaced with the null-terminated `for(i<500){ if(!it)break; }` pattern used everywhere else in the file. (`cep-extension/ext.js`)
- **EXT_VERSION bumped 1.9.6 → 1.9.7** to force panel reload. (`cep-extension/ext.js`, `main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v2.1.2] — 2026-05-29

### Refactor
- **Silenced all general debug logging; added targeted import parameter debug:** All existing `extLog()` call sites in `ext.js` and all `dbg()` / `console.log` debug calls in `main.js` have been commented out. In their place, the `import` message handler in `ext.js` now logs every `app.project.importFiles()` call with its exact parameters (`params[0]` file array, `params[1]` suppressWarnings, `params[2]` resolved target bin or rootItem, `params[3]` addToRoot flag) plus the actual resolved target after the bin search. `main.js` `import-dropped-files` logs file type detection, slot-map routing, dest folder/path, bin name, and the exact WebSocket payload sent to CEP — all prefixed `[IMPORT]`. (`cep-extension/ext.js`, `main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v2.1.1] — 2026-05-29

### Fix
- **Premiere bin import was silently failing:** The v2.1.0 import change called `importAssetToBin()` as a named hostscript.jsx function — but ext.js uses inline IIFEs exclusively (named calls are a silent no-op, the v1.8.3 bug). Replaced with an inline IIFE that searches `rootItem.children` for the bin by name and calls `app.project.importFiles()` directly. When `binName` is null the IIFE falls back to `rootItem` (root import). (`cep-extension/ext.js`)
- **EXT_VERSION bumped 1.9.5 → 1.9.6** to force panel reload and pick up the fix. (`cep-extension/ext.js`, `main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v2.1.0] — 2026-05-29

### Feature
- **Asset Slot system — explicit Video / Audio / Image routing:** Added a new `slot` node type to folder templates. In the folder structure editor, each folder now has a `+ Asset` button (edit mode) that opens a 3-option picker (🎬 Video, 🎵 Audio, 🖼 Image). Only one of each type can exist per template — already-used types appear grayed out in the picker. Slot nodes render as color-coded badges inside their parent folder. Deleting the badge removes the slot. (`renderer/app.js`, `renderer/styles.css`)
- **Premiere bin slot tagging:** Same `+ Asset` button added to every bin row in the Premiere tree editor. Clicking it tags the bin as the destination for that media type (badge shown inline). Clicking the badge again removes the tag. (`renderer/app.js`)
- **`_freexan_slot_map.json` written at project creation:** When a project is built from a template that has slot assignments, a `_freexan_slot_map.json` file is written to the project root containing explicit folder path + bin name for each media type. (`main.js` — `create-project` IPC, `buildFolderTree()`)
- **Drag-drop routing uses slot map:** `getDestSubfolder()` now accepts an optional slot map and checks it before keyword matching. `import-dropped-files` reads `_freexan_slot_map.json` once, routes each file's destination folder via the map, and resolves the target Premiere bin. (`main.js`)
- **Bin-targeted Premiere import:** The WebSocket `import` message now carries `binName`. `ext.js` calls `importAssetToBin(filePath, binName)` (already existed in `hostscript.jsx`) instead of the old root-only `importAsset`. Files land in the correct bin automatically. (`cep-extension/ext.js`)
- **RAW/cinema formats added to video routing:** `.r3d`, `.braw`, `.arw`, `.cr2`, `.dng` added to `videoExts` — previously fell through to assets. (`main.js`)

### DB
- **`folder_template_nodes.slot_type` column:** Auto-migration adds `slot_type TEXT DEFAULT NULL` on first launch. `setNodes()` INSERT updated to persist it. (`db.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v2.0.0] — 2026-05-27

### UI
- **Sliding nav indicator:** Left-edge accent bar animates between sidebar tabs via `getBoundingClientRect` + CSS `transition: top, height`. (`renderer/index.html`, `renderer/styles.css`, `renderer/app.js`)
- **Progressive reveal — Builder form:** Funnel field starts dimmed/inactive until Client is selected; Task field reveals after Funnel is chosen. Smooth `opacity` + `transform` transition. (`renderer/index.html`, `renderer/styles.css`, `renderer/app.js`)
- **Typewriter preview values:** Date Path, Root Folder, Project File fields animate character-by-character on change (max 200ms). (`renderer/app.js`)
- **Initialize button shimmer + states:** Hover reveals a diagonal shimmer sweep via `::after`. On submit shows spinning loader + "Building…"; on success flashes green with a checkmark for 900ms before alert. (`renderer/styles.css`, `renderer/app.js`)
- **Builder tree stagger:** Folder hierarchy nodes fade+slide in with 28ms stagger delay per node when tree rebuilds. (`renderer/app.js`, `renderer/styles.css`)
- **Client avatars:** Each client row in Library tab now shows a 28px colored circle with initials. Color derived from client name hash → HSL hue. (`renderer/app.js`, `renderer/styles.css`)
- **Sequence modal spring entry:** Modal card springs in with `scale(0.93)→scale(1)` + opacity on open via CSS animation. (`renderer/styles.css`)
- **Dimension tiles:** `seq-modal-dims` select replaced with 3 visual tiles showing aspect-ratio rectangles (Landscape/Portrait/Square). Selected tile highlighted in accent purple. (`renderer/index.html`, `renderer/styles.css`, `renderer/app.js`)
- **Modal keyboard hint:** Footer shows `↵ Add  Esc Cancel` hint with styled `<kbd>` elements. (`renderer/index.html`, `renderer/styles.css`)
- **JetBrains Mono font:** Preview values, `db-item-file` paths now use JetBrains Mono for sharper monospace rendering. (`renderer/styles.css`)
- **Terminal preview box:** Preview box gets a line-rule texture background + purple accent border. (`renderer/styles.css`)
- **Amplified focus glow:** Input/select focus ring upgraded from 8px blur to `0 0 0 1px accent` + `0 0 14px rgba(purple)`. (`renderer/styles.css`)
- **Sidebar narrowed:** 200px → 168px. (`renderer/styles.css`)
- **Overlay connected glow:** Pill gets a faint green ring when project is connected (`has-project` class). (`renderer/overlay.css`)
- **Overlay success flush:** On successful file drop, pill background briefly flushes green (800ms) before reverting. (`renderer/overlay.css`, `renderer/overlay.js`)
- **Overlay drag scale:** Pill scales to 1.03× when dragging a file over it. (`renderer/overlay.css`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.9.9] — 2026-05-27

### Build
- **Windows installer built and signed:** `dist/freeXan Setup 1.9.7.exe` — NSIS one-click, per-user, x64. `package.json` version bumped from `1.2.0` → `1.9.7`. Signed via signtool.exe. (`package.json`, `electron-builder.yml`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.9.8] — 2026-05-27

### Feature / Fix
- **Sequence format stored per-template, picked per-sequence (not global):** Each sequence in a template already stores `width`, `height`, `fps` from the sequence modal. ext.js now reads these fields from the `premiereTree` nodes and builds the preset path per-sequence: `sqpersets/{width}x{height}_{fps}fps.sqpreset`. Global `sequencePreset` from config is kept as a fallback only for sequences that have no format data. (`cep-extension/ext.js`)
- **Sequence modal options restricted to supported presets:** `seq-modal-dims` now shows only the 3 bundled resolutions (Landscape 1920×1080 / Portrait 1080×1920 / Square 1080×1080); `seq-modal-fps` shows only 24 / 25 / 30 fps — matching the 9 preset files in `sqpersets/`. (`renderer/index.html`)
- **`EXT_VERSION` → `'1.9.5'`, `EXPECTED_EXT_VERSION` → `'1.9.5'`** (`cep-extension/ext.js`, `main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.9.7] — 2026-05-27

### Feature
- **Sequence format picker in Settings (9 presets — resolution × FPS):** Users can now choose their sequence format before creating projects. Settings tab has two new dropdowns: Resolution (`Landscape 1920×1080` / `Portrait 1080×1920` / `Square 1080×1080`) and FPS (`24` / `25` / `30`). Selection is auto-saved to `config.json` as `seqResolution` and `seqFps`. Default: `1920×1080` at `25fps`. (`renderer/index.html`, `renderer/app.js`, `main.js`)
- **9 preset files bundled in `cep-extension/sqpersets/`:** `1920x1080_24fps.sqpreset`, `1920x1080_25fps.sqpreset`, `1920x1080_30fps.sqpreset`, `1080x1920_24fps.sqpreset`, `1080x1920_25fps.sqpreset`, `1080x1920_30fps.sqpreset`, `1080x1080_24fps.sqpreset`, `1080x1080_25fps.sqpreset`, `1080x1080_30fps.sqpreset`. The `sqpersets/` subfolder is automatically copied to the CEP extension folder on every freeXan startup via the existing `copyDir` logic in `installCEPExtension`. (`cep-extension/sqpersets/`)
- **`sequencePreset` field added to all `setup-project` sends:** All four send sites in `main.js` (fallback dispatch, `project_ready` handler, Mode A immediate, Mode B immediate) now include `sequencePreset: "1920x1080_25fps"` (built from current config). (`main.js`)
- **ext.js uses preset from `sqpersets/`:** `setupFromPremiereTree` and `setupProjectBinsAndSequences` now accept a `sequencePreset` argument. When provided, preset path is `extensionPath\sqpersets\{sequencePreset}.sqpreset`; falls back to legacy `sequence-preset.sqpreset` if null. (`cep-extension/ext.js`)
- **`EXT_VERSION` → `'1.9.4'`, `EXPECTED_EXT_VERSION` → `'1.9.4'`** (`cep-extension/ext.js`, `main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.9.6] — 2026-05-27

### Fix
- **`moveBin` called on Sequence object instead of ProjectItem (ext.js):** `app.project.createNewSequence` returns a `Sequence` object. `Sequence` does not have a `moveBin` method — only `ProjectItem` does. So `s.moveBin(tgt)` was silently throwing or doing nothing, leaving the sequence in the project root. Fixed by finding the newly created sequence as a `ProjectItem` via `rootItem.children[k]` (matching by name, `type !== ProjectItemType.BIN`) and calling `moveBin` on that item instead.
- **Sequence creation dialog + wrong dimensions/FPS (ext.js):** `createNewSequence(name, presetPath)` ignores the second argument (which is a Prelude placeholder ID, not a preset path) and always shows the sequence settings dialog with Premiere's defaults. Replaced with a three-method cascade:  
  1. `createNewSequenceFromPreset(presetPath, name)` — no dialog, uses bundled preset (PP 2019+ API, tried first)  
  2. `app.enableQE(); qe.project.newSequence(name, presetPath)` — QE domain, suppresses dialog, uses preset  
  3. `createNewSequence(name, "")` — shows dialog (last resort if both above unavailable)  
  The log now reports which method was used: `→ ok Xms [preset]` / `[qe]` / `[dialog]`.
- **`EXT_VERSION` → `'1.9.3'`, `EXPECTED_EXT_VERSION` → `'1.9.3'`** (`cep-extension/ext.js`, `main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.9.5] — 2026-05-27

### Fix
- **`p.numItems` is stale — switched to null-terminated child iteration (ext.js):** Root cause of all "parent not found" failures: `p.numItems` (on `ProjectItem`) returns the pre-creation count even after new bins are created, so `for(j < p.numItems)` never reaches the newly created children. The project panel showed 12 items at root while the search loop was iterating 0 or wrong times. Fixed by replacing `for(j < p.numItems)` with `for(j < 500)` with a `if(!c) break` inside — Premiere's `children[j]` returns `null`/`undefined` when the index is past the end, so we iterate until that null boundary regardless of what `numItems` says. Applied in both `createOneBin` (parent search) and `createNextSequence` (target-bin search). (`cep-extension/ext.js`)
- **Diagnostic info added to "parent not found" and "target bin not found" errors:** On failure, the error string now includes what was actually visible in `children[0..29]` — e.g., `err:parent not found: Audios (saw:[Raw,Elements,Audios,Sequences])`. This confirms whether the bin is visible at all and whether the name/type check is the problem. (`cep-extension/ext.js`)
- **Sequence retry minimum raised to 200ms:** `adaptiveT` at sequence-creation time was 6ms (last bin creation was fast), making retry interval `6ms` — all 8 retries finished in 48ms. Raised to `Math.max(adaptiveT, 200)` consistent with bin retries. (`cep-extension/ext.js`)
- **`EXT_VERSION` → `'1.9.2'`, `EXPECTED_EXT_VERSION` → `'1.9.2'`** (`cep-extension/ext.js`, `main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.9.4] — 2026-05-27

### Fix
- **Parent bin visible too late — minimum wait floors raised (ext.js):** `adaptiveT` after creating "Visual Assets" measured 10ms (fast Premiere response), so the after-ok delay was `max(10,30)=30ms` and retry interval was 10ms. All 8 retries completed in ~80ms total, but Premiere needs ~200–400ms to register a new bin in `rootItem.children`. Raised after-ok delay minimum to 250ms and retry interval minimum to 200ms (`Math.max(adaptiveT, 250)` / `Math.max(adaptiveT, 200)`). These floors are independent of `adaptiveT` — creation speed and children-list update latency are different operations. With T=10ms: first child attempt at 250ms, retries at 200ms intervals → 8 retries = 1.85 seconds max window. (`cep-extension/ext.js`)
- **`createNewSequenceFromPreset` is not a function (ext.js):** `app.project.createNewSequenceFromPreset` does not exist in this Premiere Pro install — ExtendScript returned `ReferenceError`. Added `typeof` check with fallback: if `createNewSequenceFromPreset` exists, use it; otherwise call `app.project.createNewSequence(name, presetPath)` — when a preset path is passed as the second argument, `createNewSequence` uses it and suppresses the sequence-settings dialog. Applied to both `setupFromPremiereTree` and `setupProjectBinsAndSequences`. (`cep-extension/ext.js`)
- **`EXT_VERSION` → `'1.9.1'`, `EXPECTED_EXT_VERSION` → `'1.9.1'`** (`cep-extension/ext.js`, `main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.9.3] — 2026-05-27

### Refactor
- **DFS bin creation with adaptive T timing (complete rewrite of `setupFromPremiereTree` in `ext.js`):** Replaced the flat sequential queue with a true depth-first traversal. Root bins are created first; for each bin the algorithm immediately recurses into its children before moving to the next sibling — guaranteeing every parent exists before any child creation is attempted. Sequences are deferred to a final phase after all bins are confirmed done.
- **One command at a time:** Only one `evalScript` call is in flight at any moment. The next command is not sent until the current one returns a result (or fails). This eliminates any overlap where Premiere hasn't updated `rootItem.children` yet.
- **Adaptive T timing:** Each `createOneBin` call records the elapsed milliseconds from script send to `"ok"` received. This measured value becomes the new `adaptiveT`. Every subsequent delay (wait before next bin, retry wait on `"err:parent not found"`) uses the latest `adaptiveT` instead of a hardcoded constant — the algorithm self-calibrates to actual Premiere speed.
- **Retry with T wait:** On `"err:parent not found"` responses (up to 8 attempts), the retry waits exactly `adaptiveT` ms before re-trying — matching Premiere's own children-list update cadence.
- **`buildPath` for sequences:** A `buildPath(parentId)` helper walks the `tempId → parent_id` chain upward to build a full path array for every sequence's parent bin, enabling reliable `moveBin` navigation even for deeply nested bins.
- **Crash fix — `getSystemPath` removed:** Previous v1.9.2 code called `csInterface.getSystemPath(SystemPath.EXTENSION)` at startup to derive the extension path for the preset file. The project's `CSInterface.js` is a 12-line stub with no `getSystemPath` method — this threw a TypeError before `connectWebSocket()` was ever called, leaving the panel permanently "Disconnected". Fixed by deriving the extension path from `window.location.href` instead, which always works in CEP panels.
- **`EXT_VERSION` → `'1.9.0'`, `EXPECTED_EXT_VERSION` → `'1.9.0'`** (`cep-extension/ext.js`, `main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.9.2] — 2026-05-27

### Fix
- **Immediate dispatch when panel already connected (Fix A):** `pendingProjectSetup` could be queued after the CEP panel already sent `active_project` and `project_ready` — so neither handler ever fired again and bins were never created. Fixed by adding an immediate dispatch check right after both Mode A and Mode B `pendingProjectSetup` assignments in `main.js`: if `isCepConnected`, `cepWs.readyState === OPEN`, and `activeProjectPath` matches, `setup-project` is sent immediately and `pendingProjectSetup` is cleared. Added `let cepWs = null` module-level var, assigned on `connection`, cleared on `close`. (`main.js`)
- **`waitForProjectReady` resolves in under 1 second (Fix B):** Previous check `typeof ri.numItems !== "undefined"` kept returning `"wait"` for 20 seconds even though `createBin()` worked immediately. Changed to `ri.children` access in a try/catch — if accessing `.children` does not throw, rootItem is ready. Same fix applied to `TRACKING_SCRIPT` so `project_ready` fires promptly. Poll interval reduced from 500ms to 300ms. (`cep-extension/ext.js`)
- **Nested bins no longer fail "parent not found" (Fix C):** `createBin()` returns `"ok"` before Premiere updates `rootItem.children`, so the very next IIFE (running 4ms later) couldn't find the parent. Added a retry loop: up to 5 attempts with 150ms between each on `"err:parent not found"` responses before giving up. (`cep-extension/ext.js`)
- **Sequence creation dialog eliminated (Fix D):** `app.project.createNewSequence()` opened Premiere's sequence settings dialog, blocking the entire queue until the user clicked OK. Replaced with `app.project.createNewSequenceFromPreset(presetPath, name)` using a bundled `sequence-preset.sqpreset` (HD 1080p 25fps, copied from Premiere's own install). Preset file is installed to `%APPDATA%\Adobe\CEP\extensions\freexan-link\` on every freeXan start. Extension path retrieved via `csInterface.getSystemPath(SystemPath.EXTENSION)` at startup. (`cep-extension/ext.js`, `cep-extension/sequence-preset.sqpreset`)
- **Sequences now land in their parent bin, not root (Fix E):** `collectOrder` was not storing `parentPath` for sequence queue items, so the creation IIFE had no target bin information and always called `createNewSequence` at root. Fixed by passing `parentPath: parentPath.slice()` in the sequence queue push. After `createNewSequenceFromPreset` returns the new sequence object, the IIFE navigates to the target bin via `parentPath` and calls `seq.moveBin(targetBin)`. Same retry logic as Fix C applied to moveBin's target-bin lookup. (`cep-extension/ext.js`)
- **`EXPECTED_EXT_VERSION` / `EXT_VERSION` bumped to `1.8.9`** (`main.js`, `cep-extension/ext.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.9.1] — 2026-05-27

### Fix
- **Date folder format changed to `{Month}{Year}` (e.g. `July2026`):** Year-month directory was `2026 May`; now matches the requested `July2026` style. (`main.js`, `renderer/app.js`)
- **`.prproj` auto-increments version instead of overwriting:** If `CLI_FNL_001_v01.prproj` already exists in `01_Project_Files`, the next run creates `…_v02.prproj`, then `…_v03.prproj`, etc. No file is ever overwritten. (`main.js`)
- **README skipped if already present:** Re-running `create-project` into an existing project folder no longer clobbers the original README. (`main.js`)
- **Resolved vars applied to prproj filename:** `projectName` in the file parts now also goes through `resolveVars()`, consistent with how the folder name is built. (`main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.9.0] — 2026-05-27

### Feature
- **Universal date/time variables in all folder/filename inputs:** Users can type `{Date}`, `{Month}`, `{Year}`, `{HH}`, `{MM}`, `{SS}` anywhere a name is entered (project name field, folder template node names, target directory path) and they resolve to the current PC date/time at project creation. Example: typing `001_{Date}{Month}` creates `001_27May`. (`main.js`, `renderer/app.js`)
- **Automatic date hierarchy wrapping:** Every project is now created inside a two-level date folder under the root: `TargetDir / {Year} {Month} / {DD} {Month} / ProjectFolder`. Today's projects go into `2026 May / 27 May /`. The hierarchy folders are created automatically if absent. (`main.js` — `create-project` IPC handler)
- **Live date-path preview in UI:** The Builder tab's "Project Structure Preview" now shows a "Date Path" row (`2026 May  →  27 May`) that always reflects today's date. (`renderer/app.js`, `renderer/index.html`)
- **Variable resolution in folder template nodes:** Folder names stored in templates (e.g. `{Month} Exports`) are resolved at project creation time via `resolveVars()` in `buildFolderTree()`. (`main.js`)
- **Input validation — invalid Windows filename chars:** Typing `\ / : * ? " < > |` outside of a `{Variable}` token in any folder/filename input shows a red border. Literal slashes and backslashes in folder-name inputs are blocked at submit time. Path inputs (target directory) are unaffected. Variable tokens (`{Date}` etc.) are whitelisted and never trigger the error. (`renderer/app.js`, `renderer/styles.css`)
- **Variable hint labels:** The Project Name field help text now lists all six supported tokens as styled chips. (`renderer/index.html`, `renderer/styles.css`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.8.9] — 2026-05-26

### Fix
- **Legacy "Project Builder Link" CEP extension now auto-removed on startup:** Root cause of "bins not creating, no errors": two CEP panels were installed in Premiere — the new `freexan-link` (ID `com.bloomx.freexan.link`, menu "freeXan Link") AND the legacy `project-builder-link` from before the brand rename (ID `com.swastik.projectbuilder.link`, menu "Project Builder Link"). Both connect to `ws://localhost:4554`. The legacy panel — running an old ext.js with no `ext_hello`, no `extLog`, no `project_ready`, and no inline-IIFE bin creation — connected first and intercepted every WebSocket session. The new v1.8.8 panel never got a chance to run. Symptoms: server logged `[CEP] Panel connected` and `active_project`, but no version-check log line, no `[EXT]` forwarding, and the 8-second fallback dispatch was sent to the legacy panel which ignored `setup-project` entirely.
- `installCEPExtension` in `main.js` now removes `project-builder-link`, `projectbuilder-link`, and `project_builder_link` folders from `%APPDATA%\Adobe\CEP\extensions\` on every freeXan start, before installing the current panel. Idempotent — silently skipped if the folder is already gone. (`main.js`)
- One-time manual cleanup performed: removed the legacy extension folder and its stale CEP cache entries (`%LOCALAPPDATA%\Temp\cep_cache\PPRO_25.3.0_com.swastik.projectbuilder.link.panel` and `…\PPRO_25.3.0_com.projectbuilder.link`).

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.8.8] — 2026-05-26

### Fix
- **TRACKING_SCRIPT crash no longer resets project path:** When Premiere is mid-load, accessing `app.project.rootItem` throws an exception. The previous single try/catch caught this and returned `"NONE||"` — which reset `lastProjectPath` to empty on every tick, making `projectReadySent` reset as well, so `project_ready` could never fire. Fixed with a nested try/catch: the outer catch still returns `"NONE||"` for a missing `app` or `app.project`, but the inner catch (rootItem access failure) returns `"NOT_READY||"+path`, preserving the path and letting the loop wait properly for rootItem to stabilize. (`cep-extension/ext.js`)
- **`waitForProjectReady` restored in both setup functions:** After v1.8.5 removed this function, the 8-second fallback dispatch (`active_project` handler) could fire `setup-project` while rootItem was still inaccessible — all bin/sequence IIFEs would return `"err:rootItem not ready"`. Restored `waitForProjectReady` (inline IIFE, 40 retries × 500ms = 20s max) in both `setupFromPremiereTree` and `setupProjectBinsAndSequences` as a safety net for fallback-path execution. (`cep-extension/ext.js`)
- **Version constant mismatch:** `EXPECTED_EXT_VERSION` in `main.js` was left at `'1.8.7'` while `EXT_VERSION` in `ext.js` became `'1.8.8'` — this caused every panel connect to trigger a `reload` command, creating an infinite reload loop that prevented the panel from ever staying connected long enough to function. Fixed by bumping `EXPECTED_EXT_VERSION` to `'1.8.8'`. (`main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.8.7] — 2026-05-26

### Perf
- **CEP extension logs now appear in debug.log:** Added `extLog(msg)` helper to `ext.js` — every call logs to the CEP browser console AND sends `{ type: "ext_log", msg }` over WebSocket. `main.js` receives it and writes `[EXT] <msg>` to `debug.log` via `dbg()`. All insertion events (queue built, each bin/sequence creation attempt + result, errors) are now in the same log file as the server-side events. Panel info-text also updates per-item during insertion showing the current bin/sequence name and "ok" or "ERROR: ...". (`cep-extension/ext.js`, `main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.8.6] — 2026-05-26

### Fix
- **Restored fallback dispatch for panels running pre-v1.8.5 code:** v1.8.5 moved `setup-project` dispatch exclusively to the `project_ready` handler. Old panels (not yet restarted after the update) only send `active_project`, so nothing was ever dispatched. Fixed by reinstating a 3-second delayed dispatch inside the `active_project` handler — if `project_ready` fires first and clears `pendingProjectSetup`, the delayed fallback detects the reference change and cancels itself. New panels use `project_ready` (instant, guaranteed-ready); old panels fall back to the delayed path with a 3-second buffer for `rootItem` to become accessible. (`main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.8.5] — 2026-05-26

### Fix
- **Inverted handshake — CEP signals readiness before setup is sent:** Previously main.js dispatched `setup-project` the moment the active project path arrived (`active_project`), then ext.js had to poll internally for `rootItem` to become accessible. Race condition: path is available early in project load, rootItem is not. Redesigned to: CEP's tracking script now checks BOTH `path` AND `app.project.rootItem.numItems` in a single evalScript call every 1 s. When rootItem is confirmed accessible it sends `{ type: "project_ready" }` — the server dispatches `setup-project` only in response. The extension is guaranteed ready when it receives the command, so `waitForProjectReady` polling has been removed from the setup functions entirely.
  - `cep-extension/ext.js`: `startProjectTracking` rewritten — single IIFE per tick returns `"READY||<path>"` or `"NOT_READY||<path>"`. Sends `active_project` on path change (overlay sync), sends `project_ready` once per project when rootItem confirms accessible. `waitForProjectReady` function removed. (`EXT_VERSION` bumped to `1.8.5`)
  - `main.js`: `active_project` handler now UI-only. New `project_ready` handler does path comparison and dispatches `setup-project`. (`EXPECTED_EXT_VERSION` bumped to `1.8.5`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.8.4] — 2026-05-26

### Perf
- **Debug logging for bin/sequence insertion:** Full timestamped log written to `%APPDATA%/freeXan/debug.log` at every step of the project setup flow — template data read from DB, `pendingProjectSetup` contents, path comparison (both sides shown), `setup-project` payload summary, plus `waitForProjectReady` retry count and each IIFE result in the CEP panel console. Open the log file in Notepad while the app is running to watch entries arrive live. (`main.js`, `cep-extension/ext.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.8.3] — 2026-05-26

### Fix
- **CEP panel auto-reloads when a new ext.js is installed:** The panel now announces its version (`EXT_VERSION`) to the WebSocket server on connect. If the server's `EXPECTED_EXT_VERSION` is newer, it sends a `{ type: "reload" }` command and the panel calls `window.location.reload()` to pick up the latest code. Eliminates the requirement to restart Premiere Pro after freeXan updates. (`cep-extension/ext.js`, `main.js`)
- **All remaining named ExtendScript function calls removed:** Sequences in `setupFromPremiereTree` and all calls in `setupProjectBinsAndSequences` (both bins and sequences) were still calling named functions (`createSequence`, `createBin`) defined in `hostscript.jsx`. If the JSX hadn't reloaded since the last freeXan update, these calls failed silently. Converted to self-contained inline IIFEs — zero dependency on pre-loaded JSX functions. (`cep-extension/ext.js`)
- **Path comparison trims whitespace:** `path.normalize(p.trim())` now used on both sides of the `active_project` path match in `main.js` — prevents silent mismatch if ExtendScript returns a path with trailing whitespace. (`main.js`)
- **Setup progress visible in panel:** Info text now shows "Project setup received", "Waiting for project…", "Creating N item(s)…" during the setup flow so the user can confirm the command arrived. (`cep-extension/ext.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.8.2] — 2026-05-26

### Fix
- **Bins and sequences now actually create in Premiere Pro:** Two root-cause bugs prevented any bin or sequence from being created when a project was set up.
  - **Bug 1 — Timing race condition:** The `setup-project` WebSocket message fired as soon as `app.project.path` was available, but Premiere's `app.project.rootItem` API is not ready at that point — all `createBin` / `createNewSequence` calls silently failed. Fixed by adding `waitForProjectReady(callback)` in `cep-extension/ext.js` — polls `app.project && app.project.rootItem ? "ready" : "wait"` every 500ms, up to 20 retries (10 seconds), before firing any bin/sequence creation.
  - **Bug 2 — ExtendScript named function not loaded:** `setupFromPremiereTree` previously called `createBinAtPath()` by name — a function defined in `hostscript.jsx`. If Premiere was already running when freeXan installed new CEP files, the old JSX without `createBinAtPath` was still in ExtendScript memory. Fixed by replacing all named-function calls with self-contained inline IIFEs passed to `evalScript` — no dependency on any pre-loaded JSX function.
  - Both `setupFromPremiereTree` and `setupProjectBinsAndSequences` (fallback) now use `waitForProjectReady`. (`cep-extension/ext.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.8.1] — 2026-05-26

### Feature
- **Nested bin creation in Premiere Pro:** When a project is set up, bins are now created in the correct parent-child order instead of being flattened to root level.
  - `cep-extension/hostscript.jsx`: Added `createBinAtPath(pathStr, binName)` — navigates to the correct parent bin using a pipe-separated path string (e.g. `"Footage|A-Roll"`) then creates the child bin inside it
  - `cep-extension/ext.js`: Added `setupFromPremiereTree(nodes)` — builds a depth-first ordered queue of bins and sequences, then executes each `createBinAtPath` call sequentially via callbacks (parent confirmed created before child is attempted). Falls back to old `setupProjectBinsAndSequences` if no tree is present
  - `main.js`: `premiereTree` added to `pendingProjectSetup` in both Mode A and Mode B paths; broadcast in `setup-project` WebSocket message

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.8.0] — 2026-05-26

### Feature
- **Premiere Pro tab — interactive bin/sequence tree:** Fully replaced the old bins + sequences tag-pill layout with a live tree editor matching the Folder Structure tab's visual style.
  - **Ghost add card:** A dashed hollow "+ Add Bin" card sits at the bottom of the tree in edit mode. Clicking it creates a new root-level bin immediately, selects the name, and the user types to rename then presses Enter.
  - **Nested bins:** Each bin has `+ Bin` and `+ Seq` hover buttons. `+ Bin` creates a child bin inside the parent with the same inline-rename flow.
  - **Sequence modal:** `+ Seq` opens a Premiere-style modal with Name, Dimensions (HD/4K/QHD/vertical presets), and Frame Rate (23.976–60fps). Enter or "Add Sequence" confirms. The sequence appears in the tree as a leaf node with a `width×height · fps` badge.
  - **Delete:** Hover `✕` on any node removes it and all children (same as folder tree).
  - **Data:** Premiere tree stored as a node-object array in `bins_json` (replaces separate flat `bins_json`/`sequences_json` string arrays). Backward compatible — old flat string arrays auto-migrate on load.
  - `renderer/index.html`: Tab 2 replaced with unified tree + ghost card; sequence modal added before `</body>`
  - `renderer/app.js`: `ftsPremiere` state replaces `ftsBins`/`ftsSequences`; `renderPremiereTree`, `renderPremiereNode`, `addPremiereBin`, `openSeqModal`, `closeSeqModal`, `confirmAddSequence` added; `saveFtsTemplate` updated
  - `renderer/styles.css`: `.premiere-add-card`, `.premiere-seq-badge`, modal styles added
  - `main.js`: `flattenPremiereTree()` helper added; both `pendingProjectSetup` paths updated to handle new tree format with backward compat

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.7.2] — 2026-05-26

### UI
- **Premiere Pro tab redesigned to match Folder Structure tab:** Bins and Sequences now render as `ft-node` rows inside bordered `ft-tree` containers — same icon/name/hover-delete layout as the folder tree. Replaced pill/tag layout (`fts-tags-list`, `fts-tag`) with tree-row layout. Empty state shows "No bins yet" / "No sequences yet". Add buttons relabelled "+ Bin" / "+ Sequence". (`renderer/index.html`, `renderer/app.js` — `renderFtsBins`, `renderFtsSequences`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.7.1] — 2026-05-26

### UI
- **Removed "+ Asset" button from Folder Structure template tree editor:** Button appeared on each folder node in edit mode in the Database → Templates section. Removed from both `renderFtsNode` (fts-* section) and `renderFtNode` (legacy ft-* section). (`renderer/app.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.7.0] — 2026-05-26

### Fix
- **Funnel dropdown shows only the selected client's funnels:** Added `refreshFunnelDropdown()` — when a client is selected, filters `dbFunnels` to entries where `client_id` matches or is null (global funnels). Previous funnel selection is cleared on client change. (`renderer/app.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.6.9] — 2026-05-26

### Logic
- **Builder Folder Hierarchy — explicit Default-first behaviour:** Rewrote `refreshBuilderTree` with a simple two-state rule: always show the Default template's nodes; only swap to a specific template when Client + Funnel + Task are all selected AND an exact assignment with nodes exists for that combo. `defaultBuilderNodes` is pre-loaded once inside `loadFtsTemplates` and used as the persistent base — no more complex cache/resolution chain that could silently return empty. (`renderer/app.js`)
- **Builder tree appears immediately on Client select:** `updatePreviews()` moved before `await refreshTaskDropdownForPair()` in client and funnel change handlers so the hierarchy renders the moment a Client is chosen. (`renderer/app.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.5.0] — 2026-05-25

### Feature
- **Folder Structure Template System:** Replaces the flat folder list in Settings with a full tree editor. Users can define nestable folder hierarchies, attach asset references (file or folder), create named templates, assign templates to client/funnel pairs, and choose between two .prproj modes per template.
  - **Template types:** Default/user-created (folder tree, optional .prproj), Mode A "Copy to New Project" (creates new folder, copies .prproj, builds tree, imports assets), Mode B "Open Template Directly" (opens .prproj in-place, applies bins/sequences only)
  - **Asset nodes:** Asset references inside the tree are imported into Premiere Pro's matching root-level bin after the project opens — no copy to disk
  - **Assignment system:** Templates can be assigned to any number of client/funnel combinations; resolution priority: funnel-exact → client-exact → Default
  - **DB:** 3 new tables (`folder_templates`, `folder_template_nodes`, `folder_template_assignments`); auto-seeds Default template with 5 standard folders on first run
  - `db.js`: `folderTemplatesApi` (12 methods); new tables in `initSchema()`; export updated
  - `main.js`: `buildFolderTree()` helper; `create-project` updated for Mode A/B; `pendingProjectSetup.assets`; `setup-project` WebSocket dispatch includes assets; 12 `ft-*` IPC handlers
  - `preload.js`: `window.api.ft.*` (12 methods) exposed via contextBridge
  - `renderer/index.html`: Flat folder section hidden; new Folder Template Editor section (selector, .prproj picker, open mode, tree editor, save buttons, assignment panel)
  - `renderer/app.js`: Full tree editor — state, render, CRUD, save, assignment management, event binding
  - `renderer/styles.css`: Tree editor component styles + `.btn-danger`
  - `cep-extension/ext.js`: `setup-project` handler imports assets into matching bins (800ms delay after bin creation)
  - `cep-extension/hostscript.jsx`: `importAssetToBin(filePath, binName)` added

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.4.0] — 2026-05-25

### Feature
- **Fresh Project default template:** When no client/funnel-specific template is configured, the fallback now uses `Premiere Pro Utilities/Fresh Project Pr 2025.prproj` (falls back to `blank_template.prproj` if file missing). Fallback branch also now uses the correct initials-based filename (`AAP_MAW_AV_001_v01.prproj`) instead of the full folder name. (`main.js` → `create-project` else branch)

- **Default Bins & Sequences per project:** New Settings sections let users define bins and sequences to auto-create inside every new Premiere project. Stored in config as `defaultBins` and `defaultSequences`. After a project opens in Premiere, the freeXan CEP panel receives a `setup-project` WebSocket message and calls ExtendScript to create each bin (`app.project.rootItem.createBin`) and sequence (`app.project.createNewSequence`). Requires the freeXan panel to be open in Premiere.
  - `main.js`: `pendingProjectSetup` global; `setup-project` WebSocket dispatch on matching `active_project`; `defaultBins`/`defaultSequences` in `appConfig` defaults
  - `renderer/index.html`: Default Premiere Bins + Default Premiere Sequences sections added to Settings tab
  - `renderer/app.js`: DOM refs, `renderDefaultBinsList()`, `renderDefaultSequencesList()`, `makeListRow()` helper; add/remove/save wired up
  - `cep-extension/ext.js`: `setup-project` message handler; `setupProjectBinsAndSequences()` function
  - `cep-extension/hostscript.jsx`: `createBin(name)` and `createSequence(name, id)` ExtendScript functions

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.3.2] — 2026-05-25

### Logic
- When user opens the panel from the tray (menu click or double-click), the Premiere monitor no longer auto-hides the window when a project is detected. The window stays visible until the user manually minimizes or closes it, at which point normal auto-hide behaviour resumes. (`main.js` — `userOpenedManually` flag, tray handlers, `mainWindow.on('hide')` reset, monitor guard)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.3.1] — 2026-05-25

### Fix
- Settings — Default Target Directory and Template inputs were marked `readonly`, preventing manual typing or pasting. Removed `readonly` from both fields. (`renderer/index.html` lines 179, 189)
- Settings — Browse selection only updated in-memory state but never wrote to disk; settings were lost on every restart. Added `savePathSettings()` auto-save helper that persists immediately after Browse returns a value. Also added `change` event listeners on both inputs so manually typed or pasted paths are saved when the user leaves the field. (`renderer/app.js` — `bindSettingsEvents()`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.3.0] — 2026-05-25

### Feature
- Browser image drag-drop: drag any image directly from a browser tab onto the overlay pill. App detects `text/uri-list` in the drop payload, downloads via `axios`, converts unsupported formats (WebP/AVIF/HEIC/HEIF → PNG) via `ffmpeg`, copies to project's `04_Assets` folder, and auto-imports into active Premiere bin through existing WebSocket → CEP pipeline. No new dependencies — `axios` and `@ffmpeg-installer/ffmpeg` were already in `package.json`.
  - `preload.js`: URL detection in drop handler; `window.api.onUrlsDropped` + `window.api.importBrowserImage` exposed
  - `renderer/overlay.js`: URL drop handler registered; `setProcessing()` accepts label (`'Downloading…'`)
  - `main.js`: `axios` + `ffmpegInstaller` imports added; `convertWithFfmpeg()` helper added; `import-browser-image` IPC handler added (URL validation, 50 MB cap, content-type guard, format conversion, conflict resolution, WebSocket broadcast)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.2.1] — 2026-05-25

### Fix
- Prevent multiple app instances launching simultaneously. Second launch focuses existing window. (`main.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.2.0] — 2026-05-25 (Baseline — Logging Begins)

> This is the state of the project when the changelog was introduced.  
> All prior changes are summarized below as the v1.2.0 feature set.

### Feature
- Electron 30 desktop app: frameless main window (800×600), system tray, startup with `--hidden` flag
- Project Builder tab: client/funnel/task dropdowns, live path preview, folder structure creation, template copy, preset asset import, opens in Premiere
- Floating drag-drop overlay pill (56×56 idle → 244×84 on hover with drag)
- Overlay auto-sorts dropped files: video → `02_Footage`, audio → `03_Audio`, image → `04_Assets`
- Filename conflict resolution: auto-increment (`file_1.mp4`, `file_2.mp4`)
- WebSocket server on port 4554 for CEP ↔ main process communication
- CEP extension (`com.bloomx.freexan.link`) auto-installs on app launch for Premiere 14.0+
- ExtendScript `importAsset()` — auto-imports dropped files into active Premiere bin
- CEP panel polls `app.project.path` every 1.5s via ExtendScript; sends active project path over WebSocket
- PowerShell monitor polls Premiere window title every 2.5s for active project detection (fallback)
- Auto-popup: Builder window shows when Premiere Home Screen is detected (if enabled)
- Settings tab: target directory, global template, folder structure list, auto-popup toggle
- Settings persisted to `%APPDATA%/Roaming/project-builder-link/config.json`
- SQLite database (`better-sqlite3`, WAL mode): clients, funnels, tasks, funnel_tasks, templates, assets
- Database tab: full CRUD for clients, funnels, tasks, templates, assets
- Initials-first keystroke search on all dropdowns
- Initials auto-derived from name (multi-word → first letters; single-word → first 3 chars)
- CEP PlayerDebugMode registry keys set at launch (CSXS 9–12)
- Per-user NSIS installer with desktop + Start Menu shortcuts, auto-launch after install
- Startup registry entry (`HKCU\...\Run`) for launch-at-boot

### DB
- Schema: `clients`, `funnels`, `tasks`, `funnel_tasks`, `templates`, `assets`
- Foreign keys with cascading deletes
- Auto-migration support
- Seed script with 30+ pre-built clients (`npm run seed`)

### Build
- `electron-builder 26`, `electron-rebuild 4`
- Build output: `dist/freeXan Setup 1.2.0.exe` + unpacked

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.2.1] — 2026-05-25

### Fix
- Prevent multiple app instances from launching simultaneously. Second launch attempt now focuses the existing window instead of opening a duplicate. (`main.js` — `app.requestSingleInstanceLock()` + `second-instance` handler before `app.whenReady()`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.6.0] — 2026-05-25

### Feature
- **Folder Structure Templates — Database tab:** New "Folder Structure Templates" section at the bottom of the Library tab. Shows all templates as a clickable list; clicking one opens a "Template Structure" panel below with the full folder tree, assigned Client/Funnel/Task, Premiere Bins, and Premiere Sequences.
  - **View mode:** tree and dropdowns are read-only. Buttons: Edit + New.
  - **Edit mode:** Edit → Cancel, New → Save. Tree becomes editable (add/rename/delete folders and assets). The 3 assignment dropdowns (Client, Funnel, Task) unlock. Bins and Sequences become editable. Saving a shared template prompts Overwrite vs Save as New.
  - **New button (view mode):** clones the selected template (full tree, bins, sequences) and opens the clone in edit mode with blank assignment dropdowns.
  - **+ New Template button:** creates a blank template and opens it in edit mode.
- **Template bins + sequences per template:** Each folder template now stores its own Premiere bins and sequences (previously global settings).
- **Task-level template assignment:** Template assignments now include Task type — resolution priority: Client+Funnel+Task → Client+Funnel → Client → Default.
  - `db.js`: migrations add `bins_json`, `sequences_json` to `folder_templates`; `task_id` to `folder_template_assignments`; `folderTemplatesApi` updated (all methods); `clone()` added.
  - `main.js`: `create-project` passes `taskId` to resolve; uses template `bins_json`/`sequences_json`; `ft-*` IPC handler signatures updated; `ft-clone` added.
  - `preload.js`: `window.api.ft.*` signatures updated; `ft.clone` added.
  - `renderer/index.html`: `fts-*` section added to Database tab.
  - `renderer/app.js`: `fts*` state, DOM refs, and all functions added; `bindFtsEvents()` and `loadFtsTemplates()` wired into init.
  - `renderer/styles.css`: `.fts-*` styles added.

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.5.3] — 2026-05-25

### UI
- Removed "Base Premiere Pro Template" and "Folder Structure Templates" sections from the Settings tab. Settings now contains only: Target Directory, Auto-popup toggle, and Save button. (`renderer/index.html`, `renderer/app.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.5.2] — 2026-05-25

### UI
- Removed "Default Premiere Bins" and "Default Premiere Sequences" sections from the Settings tab. (`renderer/index.html`, `renderer/app.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.5.1] — 2026-05-25

### Fix
- **All buttons unclickable after v1.5.0:** `DOMContentLoaded` async handler called `await loadFolderTemplates()` before any `bind*Events()` calls — if it threw, no event listeners were ever attached. Fixed by moving all `bind*Events()` calls to the top of the handler (before any awaits), and wrapping each async init in its own try-catch so a single failure can't cascade. (`renderer/app.js` — `DOMContentLoaded` handler)

### UI
- **Database tab — Preset Assets moved above Templates:** Section order in the Library tab is now Clients → Funnels → Tasks → Preset Assets → Templates. (`renderer/index.html`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.6.8] — 2026-05-25

### Fix
- **Builder Folder Hierarchy blank on cold start:** `refreshBuilderTree` relied solely on the `ftsTemplates` in-memory cache to find the Default template. If the cache wasn't populated yet (race on startup), `resolveFtsTemplateForBuilder()` returned null and the tree stayed blank. Fixed by adding `ft-get-default` IPC handler (`main.js`), `window.api.ft.getDefault()` in `preload.js`, and a direct DB fallback in `refreshBuilderTree` — if the cache returns null, the Default template is fetched from the DB directly. (`main.js`, `preload.js`, `renderer/app.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.6.7] — 2026-05-25

### Fix
- **Builder Folder Hierarchy shows wrong structure with no selection:** `renderBuilderTree` was falling back to `configState.folderStructure` (an old flat list from the removed Settings UI) whenever `builderTreeNodes` was empty. Removed that fallback entirely — the tree stays blank until the Default template nodes load (a brief moment at startup). Also fixed `refreshBuilderTree` to re-fetch nodes if the cache is empty even when the resolved ID hasn't changed. (`renderer/app.js`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.6.6] — 2026-05-25

### Logic
- **Mandatory `01_Project_Files` folder:** Every template always contains a root-level `01_Project_Files` folder that cannot be renamed or deleted. When loading a template that doesn't have it (e.g. newly created), it is injected automatically. Inside it, `project.prproj` is shown as a locked visual placeholder (not stored — it represents the auto-generated project file). A 🔒 badge appears on the folder and the placeholder to make the lock visible. Users can still add subfolders and assets inside `01_Project_Files`. (`renderer/app.js` — `selectFtsTemplate`, `renderFtsNode`, new `renderLockedPrprojNode`; `renderer/styles.css` — `.ft-lock-badge`, `.ft-locked-file`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.6.5] — 2026-05-25

### Feature
- **Builder tab — live folder hierarchy preview:** The Folder Hierarchy panel now shows the actual folder template structure instead of the flat settings list. On startup it shows the Default template's full folder tree. When Client, Funnel, and/or Task are selected, it resolves the matching template (same priority: Client+Funnel+Task → Client+Funnel → Client → Default) and updates the tree live. Sub-folders are indented. The `.prproj` filename appears inside `01_Project_Files` when present. (`renderer/app.js` — `resolveFtsTemplateForBuilder`, `refreshBuilderTree`, `renderBuilderTree`, `renderBuilderTreeNode`; `loadFtsTemplates` pre-loads default nodes on startup)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.6.4] — 2026-05-25

### Fix
- **Bins/Sequences × button invisible:** `opacity: 0.45` on top of the parent's already-translucent white produced ~30% effective opacity — nearly invisible. Replaced with `color: rgba(255,255,255,0.5)` at full opacity; turns red on hover. (`renderer/styles.css`)
- **Bins/Sequences not renameable:** Tags were static text. Now in edit mode the name span is `contentEditable` — click to rename, Enter or click away to confirm. (`renderer/app.js` — `renderFtsBins`, `renderFtsSequences`)
- **Template name not editable:** Panel header showed a static "Template Structure" label with no way to rename. Replaced with an `<input>` that is disabled in view mode and enabled in edit mode; value is used when saving. (`renderer/index.html`, `renderer/app.js`, `renderer/styles.css` — `.fts-template-name-input`)
- **Folder names not visually editable:** `contentEditable` was set in JS but there was no visual cue. Added a purple underline on hover/focus for `.ft-name[contenteditable="true"]`. (`renderer/styles.css`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.6.3] — 2026-05-25

### Fix
- **Folder delete buttons missing in edit mode:** `fts-tree-view` CSS class was permanently on the tree element (set in HTML, never removed), so `.ft-node-actions { display: none !important }` suppressed all action buttons even after clicking Edit. Fixed by removing the class in `enterFtsEditMode()` and re-adding it in `exitFtsEditMode()`. (`renderer/app.js`)
- **No way to delete templates from the list:** `renderFtsList` had no delete control. Added a hover-visible × button to each non-default list item — clicking it confirms, calls `ft.delete`, hides the panel if that template was open, and reloads the list. (`renderer/app.js`, `renderer/styles.css` — `.fts-list-del`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.6.2] — 2026-05-25

### UI
- **Templates section — merged + 3-dropdown filter:** Removed the separate "Folder Structure Templates" section. The folder structure template list, "+ New Template" button, and Template Structure panel now live inside the main Templates section. Three filter dropdowns (Client, Funnel, Task) sit above the list — selecting any combination narrows the list to matching templates. Default ★ template always shows. The existing "Project File Templates" (.prproj assignments) moved below as a subsection with a divider label. (`renderer/index.html`, `renderer/app.js` — `refreshFtsFilterFunnels`, `refreshFtsFilterTasks`, `renderFtsList` filter logic; `renderer/styles.css` — `.fts-filter-row`, `.db-subsection-label`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [v1.6.1] — 2026-05-25

### UI
- **Template Structure panel — 2-tab layout:** The panel now has two inner tabs: **Folder Structure** (folder tree + add-root row) and **Premiere Pro** (Bins + Sequences). Assignment dropdowns and Edit/New buttons remain above the tabs and apply to both. (`renderer/index.html`, `renderer/app.js` — `switchFtsTab()`, `bindFtsEvents()`, `renderer/styles.css` — `.fts-inner-tabs`, `.fts-inner-tab`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


## [Unreleased]

> Add new entries below this line in the following format:
>
> ### [vX.Y.Z] — YYYY-MM-DD HH:MM | Author
> #### Type
> - Description of change (file: `path/to/file.js:line`)

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


<!-- ENTRY TEMPLATE (copy this block for each new change):

## [vX.Y.Z] — YYYY-MM-DD HH:MM

### Feature
-

### Fix
-

### Logic
-

### UI
-

### DB
-

### Build
-

-->


## [Unreleased] - Pill UI and User Profile Overhaul
- **Added**: Local Users database table and API in db.js to track FreeXan team members.
- **Added**: A new Users tab in the main FreeXan dashboard to manage profiles.
- **Changed**: The Native Pill was completely redesigned. Connection status is now mapped to the pills outer glowing border, and the center dot dynamically assumes the active users assigned hex color and displays their calculated initials.
- **Changed**: Middle-clicking the Native Pill now instantly cycles the active user profile, seamlessly updating the C++ UI and Python usage monitor.

## [Unreleased] - Supabase Sync & UI Polish
- **Added**: Team Profiles Supabase Sync button in Settings tab.
- **Removed**: Local Users tab in FreeXan Dashboard.
- **Fixed**: Removed SetWindowRgn and added DWM glass transparency to natively support anti-aliased smooth edges for the Native Pill.
- **Fixed**: Adjusted text bounding boxes in Renderer.cpp for perfect center alignment and margins.

## [Unreleased] - Dashboard User Management
- **Added**: Team Profiles Management UI in the Break Check Dashboard.
- **Added**: Supabase integration in the dashboard for registering and removing users directly from the web interface.

- Added `update_plugins.bat` utility script to safely backup and update CEP plugins.

- Updated `update_plugins.bat` to only copy necessary CEP files (CSXS, panel, dialog, src, mimetype) and ignore development files.

- Updated `update_plugins.bat` to use the exact robocopy exclusions found in `install_plugins.bat` for 1:1 parity with the master installer.

- Updated `update_plugins.bat` to exclude `%APPDATA%`, `custom`, `mogrt sample` directories, and `Install_*.bat` files.
