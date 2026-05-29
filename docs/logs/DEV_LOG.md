# DEVELOPMENT LOG — freeXan by BloomX

Active development journal. Each session is a timestamped entry.  
Record decisions, blockers, ideas, and progress here — not in code comments.

---

## Current Version: v2.2.4

**App:** freeXan by BloomX  
**Platform:** Windows 64-bit (Electron 30)  
**Stack:** Electron · SQLite (better-sqlite3) · WebSocket (ws) · Adobe CEP · ExtendScript  
**Entry Points:** `main.js` (main process), `renderer/index.html` (UI), `cep-extension/ext.js` (Premiere panel)  
**Database:** `%APPDATA%/freeXan/project-builder.db`  
**Config:** `%APPDATA%/Roaming/project-builder-link/config.json`  
**Installer:** `dist/freeXan Setup 1.9.7.exe`

---

## Session Log

---

### 2026-05-29 | Session 036 — Fix EPERM crash when preset asset or dropped item is a folder (v2.2.3 → v2.2.4)

**By:** Claude Code
**Version:** v2.2.3 → v2.2.4
**Status:** Done

**Root cause:** `fs.copyFileSync()` throws `EPERM -4048` on Windows when the source path is a directory — the OS does not allow a file-copy syscall on a directory handle. The `create-project` preset asset loop at line 780 called `copyFileSync` unconditionally, so any asset whose `file_path` pointed to a folder crashed project creation.

**Fix:** Added `fs.statSync(asset.file_path).isDirectory()` check in both affected loops:
- `create-project` preset assets: directories are copied with `fs.cpSync(src, dest, { recursive: true })` into `projectPath` root; files use existing `getDestSubfolder()` + `copyFileSync`.
- `import-dropped-files` overlay drops: same check — dropped folders go to `projectFolder` root via `cpSync`; files use the versioned `getDestSubfolder()` path.

`fs.cpSync` is available in Node 16.7+ / Electron 30 — no extra dependency needed.

---

### 2026-05-29 | Session 035 — Restore copy for drag-drop, keep no-copy for DB assets (v2.2.2 → v2.2.3)

**By:** Claude Code
**Version:** v2.2.2 → v2.2.3
**Status:** Done

**Change:**
User clarified: files dropped on the overlay should be copied into the project folder (original v2.2.2 removed this). Assets from the DB collection (attached to bins in templates, imported via `setup-project`) should continue importing from their original location with no copy.

Restored in `import-dropped-files`: `getDestSubfolder(projectFolder, fileExt, slotMap)` to resolve the correct subfolder, `fs.mkdirSync` to create it if missing, versioned filename loop (`_counter` suffix) to avoid collisions, and `fs.copyFileSync()` to copy before sending the path to Premiere. The WebSocket payload now sends `finalDestPath` (the copy) rather than the original.

The `setup-project` assets handler in `ext.js` remains unchanged — it receives `sourcePath` values that were already original paths (never copied) from `extractPremiereImports()` in `main.js`.

---

### 2026-05-29 | Session 034 — Remove file copy on drag-drop import (v2.2.1 → v2.2.2)

**By:** Claude Code
**Version:** v2.2.1 → v2.2.2
**Status:** Done

**Change:**
The `import-dropped-files` handler in `main.js` was copying every dropped file into the project folder (via `getDestSubfolder()` + `fs.copyFileSync()`) before passing the path to Premiere. This duplicated assets on disk with no benefit — Premiere was importing the copy, not the original.

Removed from the handler: `getDestSubfolder()` call, `fs.mkdirSync(destFolder)`, versioned filename calculation, `fs.copyFileSync()`. The original `filePath` is now sent directly to the CEP panel in the WebSocket payload. Slot map resolution and bin routing are unchanged.

`getDestSubfolder()` was deliberately kept in the file — it is still called by the `import-browser-image` handler.

---

### 2026-05-29 | Session 033 — Browse asset folder selection fix (v2.2.0 → v2.2.1)

**By:** Claude Code
**Version:** v2.2.0 → v2.2.1
**Status:** Done

**Root cause:** The "Browse" button on the Assets section called `window.api.selectFiles()` → `select-files` IPC → `properties: ['openFile']` only. Folder paths couldn't be selected.

**Fix:** Changed to `window.api.ft.selectAsset()` → `ft-select-asset` IPC → `properties: ['openFile', 'openDirectory']`. Same dialog handler already used in the folder template asset picker — no new IPC needed.

---

### 2026-05-29 | Session 032 — Library asset import via Premiere template (v2.1.4 → v2.2.0)

**By:** Claude Code
**Version:** v2.1.4 → v2.2.0
**Status:** Done

**Feature:**
User stores file/folder paths in the DB Assets library. In the template editor → Premiere Pro tab, each bin now has a `+ Import` button (edit mode). Clicking it opens `buildAssetPicker()` — an async popover that fetches the DB assets list and shows each as a two-line button (name + filename). Selecting an asset pushes a `{ type: 'import', name, file_path, asset_id, parent_id: binTempId }` node into `ftsPremiere` and saves with the template in `bins_json`.

At project creation, `extractPremiereImports(rawBins)` in `main.js` finds all `type === 'import'` nodes, resolves the parent bin name from `binMap`, and expands any folder paths to individual files. The resulting `{ sourcePath, binName }` array is merged with `assetsToImport` and sent to the CEP panel in `pendingProjectSetup.assets`.

In `ext.js`, the `setup-project` assets handler was fixed from a silent-failing named `importAssetToBin()` call to an inline IIFE with `findBin()` recursive search — same pattern as drag-drop imports.

**Also fixed:**
- Mode B (open_template) was always sending `assets: []` — now correctly passes `premiereImports1`
- Both the queued `pendingProjectSetup` and the immediate dispatch path (when panel already holds the project) now carry the correct assets array

**EXT_VERSION:** 1.9.8 → 1.9.9

---

### 2026-05-29 | Session 031 — Fix nested bin import routing (v2.1.3 → v2.1.4)

**By:** Claude Code
**Version:** v2.1.3 → v2.1.4
**Status:** Done

**Root cause:** The bin search loop in the import IIFE only iterated `rootItem.children` (one level). A bin tagged as the slot target that lives inside another bin was never found — `tgt` stayed as `rootItem`.

**Fix:** Added a recursive `findBin(parent, name)` function inside the IIFE. It does a DFS through the full bin tree: iterates children, recurses into any child that is a BIN type, returns the first match at any depth. The flat loop is replaced with a single call: `findBin(app.project.rootItem, bn)`.

**Version bump:** EXT_VERSION 1.9.7 → 1.9.8.

---

### 2026-05-29 | Session 030 — Fix bin import always routing to rootItem (v2.1.2 → v2.1.3)

**By:** Claude Code
**Version:** v2.1.2 → v2.1.3
**Status:** Done

**Root cause:** The import IIFE bin search loop was `for(var i=0; i<app.project.rootItem.numItems; i++)`. `numItems` does not exist on `rootItem` in Premiere ExtendScript — it returns `undefined`, so the condition `0 < undefined` is false and the loop body never executes. `tgt` stays as `rootItem`, so every file goes to the project root regardless of the `binName` passed.

**Fix:** Replaced with the null-terminated pattern used throughout the rest of ext.js: `for(var i=0;i<500;i++){ var it=rootItem.children[i]; if(!it)break; ... }`.

**Version bump:** EXT_VERSION 1.9.6 → 1.9.7 to force panel reload.

---

### 2026-05-29 | Session 029 — Import parameter debugging (v2.1.1 → v2.1.2)

**By:** Claude Code
**Version:** v2.1.1 → v2.1.2
**Status:** Done

**Done:**
- Commented out ALL existing `extLog()` call sites in `ext.js` (WebSocket connect, bin creation, sequence creation, project tracking, waitForProjectReady) — function definition kept.
- Commented out ALL `dbg()` calls in `main.js` (CEP panel connect/disconnect, project_ready/active_project dispatch, setup-project queuing, slot map write, create-project logs).
- Commented out all `console.log()` debug calls in `main.js` (create-project, import-dropped-files, BrowserImport).
- Added targeted `[IMPORT]`-prefixed debug in `ext.js` import handler: logs file name, escaped path, binName, and all 4 `app.project.importFiles` parameters before the evalScript call. Modified the IIFE return value to include `|tgtDesc:<rootItem|bin:NAME>` so the callback can log which target was actually resolved inside Premiere.
- Added targeted `[IMPORT]`-prefixed `dbg()` calls in `main.js` `import-dropped-files`: logs received file list, resolved projectFolder, slotMap state, per-file type/ext/destFolder/destPath/binName, and the exact WebSocket payload sent to CEP.

**Next:** User testing — import debug output should now appear exclusively in `%APPDATA%/freeXan/debug.log` for each dropped file.

---

### 2026-05-29 | Session 027 — Asset Slot routing system (v2.0.0 → v2.1.0)

**By:** Claude Code
**Version:** v2.0.0 → v2.1.0
**Status:** Done

**Done:**
- Added `slot` node type to the folder template system. Slots are child nodes of folders that tag that folder as the explicit disk destination for a media type (video / audio / image). Stored in `folder_template_nodes` with `node_type = 'slot'` and `slot_type = 'video'|'audio'|'image'`.
- DB migration: `ALTER TABLE folder_template_nodes ADD COLUMN slot_type TEXT DEFAULT NULL` — runs once on startup, safe on existing data. `setNodes()` INSERT updated to persist the new column.
- `buildFolderTree()` now also extracts slot→diskPath mappings (`slotFolders`) alongside the existing `assetsToImport`. Return changed from bare array to `{ assetsToImport, slotFolders }` — call-site in `create-project` destructures it.
- Premiere bin slot tagging: `slotType` property added to items in `bins_json` flat array. No schema change — JSON column, backward-compatible.
- `_freexan_slot_map.json` written to project root at creation: `{ video: { folder: "...", bin: "..." }, ... }`. Only written if at least one slot is defined.
- `getDestSubfolder()` accepts optional `slotMap` arg; if the map covers the file type and the folder exists, it returns that path immediately — keyword matching becomes the fallback.
- `import-dropped-files` reads `_freexan_slot_map.json` once at the top of the handler, resolves both destination folder and bin name per file, sends `{ type: 'import', filePath, binName }` to CEP.
- `ext.js` now calls `importAssetToBin(filePath, binName)` (existed in `hostscript.jsx`) instead of the old `importAsset`. When `binName` is null it falls back to root import.
- UI — folder tree: `+ Asset` button added to each folder row in edit mode. Clicking opens a `buildSlotPicker()` popover (3 buttons: 🎬 Video, 🎵 Audio, 🖼 Image). Already-used types are disabled. Slot nodes render as colored pill badges with a delete `✕`.
- UI — Premiere tree: same `+ Asset` button on bin rows. Selected slot shown as inline pill on the bin. Clicking the active button removes the slot.
- CSS: `.ft-slot-badge`, `.ft-slot-badge--inline`, `.ft-asset-slot-btn`, `.slot-picker`, `.slot-picker-btn` added. `color-mix()` used for badge backgrounds. `.ft-node` gets `position: relative` for picker anchoring.
- RAW/cinema formats (`.r3d`, `.braw`, `.arw`, `.cr2`, `.dng`) added to `videoExts` in both `getDestSubfolder` and `import-dropped-files`.

**Decisions:**
- Slot uniqueness enforced in UI (picker disables used types) — not enforced in DB, so manually crafted data could duplicate, but that's acceptable.
- `buildSlotPicker` closes on outside click via a capture-phase document listener with `setTimeout(0)` to avoid the opening click triggering it immediately.
- Bin slot is a simple property on the bin object (not a child node) — keeps the Premiere tree flat and avoids another DB column.

---

### 2026-05-27 | Session 026 — UI/UX overhaul (v1.9.9 → v2.0.0)

**By:** Claude Code  
**Version:** v1.9.9 → v2.0.0  
**Status:** Done

**Done (8 improvement areas, 17 changes):**
- Sliding nav indicator, progressive reveal (funnel/task), typewriter preview, button shimmer+loading+done states, tree stagger, client avatars, sequence modal spring + dimension tiles + keyboard hints, JetBrains Mono, terminal preview box, amplified focus glow, sidebar narrowed to 168px, overlay connected glow + success flush + drag scale.

**Files changed:** `renderer/styles.css`, `renderer/index.html`, `renderer/app.js`, `renderer/overlay.css`, `renderer/overlay.js`

**Next:** Test all 8 areas. See testing plan in conversation.

---

### 2026-05-27 | Session 025 — Windows installer build v1.9.7 (v1.9.8 → v1.9.9)

**By:** Claude Code
**Version:** v1.9.8 → v1.9.9
**Status:** Done

**Done:**
- `package.json` version bumped from `1.2.0` → `1.9.7` to align package version with internal dev version series.
- Ran `npm run dist` (electron-builder --win --x64). Build succeeded cleanly.
- Output: `dist/freeXan Setup 1.9.7.exe` — NSIS one-click, per-user install, x64, signed via signtool.exe.

**Next:** Distribute or test installer on a clean machine.

---

### 2026-05-27 | Session 024 — Per-sequence preset from template modal (v1.9.7 → v1.9.8)

**By:** Claude Code
**Version:** v1.9.7 → v1.9.8
**Status:** Done

**Insight:** The sequence creation modal already existed with `width`, `height`, `fps` fields, and `confirmAddSequence` already stores them in the template node. These fields travel through `sequences_json` → `premiereTree` → `setup-project` to ext.js. The only missing piece was ext.js using them for preset selection instead of a global config value.

**Done:**
- `seq-modal-dims` restricted to 3 options: `1920x1080` (Landscape), `1080x1920` (Portrait), `1080x1080` (Square). `seq-modal-fps` restricted to 24 / 25 / 30. Matches the 9 preset files. (`renderer/index.html`)
- In `setupFromPremiereTree`, sequence collection now includes `width`, `height`, `fps` from each node. (`cep-extension/ext.js`)
- In `createNextSequence`, per-sequence `seqPresetPath` is computed from `seq.width × seq.height _ seq.fps fps.sqpreset` inside `sqpersets/`. Falls back to function-level `presetPath` (from global config) if node has no format data. (`cep-extension/ext.js`)
- `EXT_VERSION` → `'1.9.5'`, `EXPECTED_EXT_VERSION` → `'1.9.5'`. Deployed.

---

### 2026-05-27 | Session 023 — Sequence format picker + 9 presets (v1.9.6 → v1.9.7)

**By:** Claude Code
**Version:** v1.9.6 → v1.9.7
**Status:** Done

**Done:**
- Added "Sequence Format" section to Settings tab: Resolution dropdown (`1920×1080` / `1080×1920` / `1080×1080`) and FPS dropdown (`24` / `25` / `30`). Auto-saves on change. (`renderer/index.html`, `renderer/app.js`)
- Added `seqResolution` and `seqFps` to `appConfig` defaults and `configState` defaults. (`main.js`, `renderer/app.js`)
- Added `sequencePreset` field to all 4 `setup-project` send sites in `main.js`. Value is `"{seqResolution}_{seqFps}fps"` e.g. `"1920x1080_25fps"`.
- 9 preset files in `cep-extension/sqpersets/` — copied to CEP folder. `installCEPExtension` uses `copyDir` (recursive) so the subfolder deploys automatically on every freeXan startup.
- `setupFromPremiereTree(nodes, sequencePreset)` and `setupProjectBinsAndSequences(bins, seqs, sequencePreset)` now accept the preset name. Preset path: `extensionPath\sqpersets\{name}.sqpreset`. Falls back to `sequence-preset.sqpreset` if null.
- `EXT_VERSION` → `'1.9.4'`, `EXPECTED_EXT_VERSION` → `'1.9.4'`.

---

### 2026-05-27 | Session 022 — moveBin fix + sequence creation cascade (v1.9.5 → v1.9.6)

**By:** Claude Code
**Version:** v1.9.5 → v1.9.6
**Status:** Done

**Problems from user test:**
1. Sequence "Reel" was not inside "Sequences" bin despite setup completing
2. Dimensions and FPS of sequence didn't match preset (HD 1080p 25fps)
3. Dialog popup appeared every sequence creation

**Root causes:**
- `s.moveBin(tgt)`: `s` is a `Sequence` object returned by `createNewSequence`. `Sequence` does not have `moveBin` — only `ProjectItem` does. The call threw silently (caught by try/catch but the error wasn't "target bin not found" so it appeared to succeed). Sequence stayed in root.
- `createNewSequence(name, presetPath)`: Second arg is a Prelude placeholder ID, NOT a preset path. Premiere ignores it and shows dialog with default settings (wrong dimensions/FPS). The cascade previously had `createNewSequenceFromPreset` (not found) → fall back to `createNewSequence(name, presetPath)` which always shows dialog.

**Done:**
- After sequence creation, find the sequence as a `ProjectItem` by iterating `rootItem.children[k]` and matching name where `type !== ProjectItemType.BIN`. Call `seqItem.moveBin(tgt)` on the ProjectItem. This is the correct API.
- New creation cascade:
  1. `createNewSequenceFromPreset(presetPath, name)` — no dialog (PP 2019+ API)
  2. `app.enableQE(); qe.project.newSequence(name, presetPath)` — QE domain, suppresses dialog
  3. `createNewSequence(name, "")` — dialog, last resort
- Log now reports method used: `→ ok Xms [qe]` / `[preset]` / `[dialog]`
- `EXT_VERSION` → `'1.9.3'`, `EXPECTED_EXT_VERSION` → `'1.9.3'`. Deployed.

**What's next:**
- If log shows `[qe]` → no dialog, correct preset settings. 
- If log shows `[dialog]` → dialog will still appear; need to investigate which QE calls are available in PP 2025.

---

### 2026-05-27 | Session 021 — Root cause fix: stale numItems (v1.9.4 → v1.9.5)

**By:** Claude Code
**Version:** v1.9.4 → v1.9.5
**Status:** Done

**Root cause identified from debug log + project panel screenshot:**
- Project panel showed all 4 root bins (Raw, Elements, Audios, Sequences) visible with "1 of 12 items selected" — rootItem had 12 children.
- Yet `bin "SFX" in Audios` failed every retry for 1.6 seconds with "parent not found: Audios".
- Conclusion: `p.numItems` (the upper bound for our search loop) was returning a stale pre-creation count. The loop `for(j < p.numItems)` was iterating 0 (or wrong) times — never checking any children.
- Same bug caused sequence "target bin not found: Sequences" — `tgt.numItems` also stale.
- Additionally: sequence retry was at `adaptiveT=6ms` (last bin creation time) → all 8 retries finished in 48ms.

**Done:**
- Replaced `for(var j=0; j<p.numItems; j++)` with `for(var j=0; j<500; j++)` + `if(!c)break` in `createOneBin` IIFE. Same fix in `createNextSequence` IIFE for the target-bin search.
- Added diagnostic output on failure: `"err:parent not found: X (saw:[child1,child2,...])"` — logs what was actually in `children[0..29]` so future failures are immediately diagnosable.
- Sequence retry delay raised to `Math.max(adaptiveT, 200)` minimum.
- `EXT_VERSION` → `'1.9.2'`, `EXPECTED_EXT_VERSION` → `'1.9.2'`. Deployed.

**Expected result:**
- SFX and BGM will create inside Audios on first attempt (or first retry at worst).
- Sequence will find "Sequences" bin and moveBin successfully.
- If any "parent not found" still appears, the `(saw:[...])` list reveals exactly what was visible.

---

### 2026-05-27 | Session 020 — Parent wait floors + sequence fallback (v1.9.3 → v1.9.4)

**By:** Claude Code
**Version:** v1.9.3 → v1.9.4
**Status:** Done

**Problems from test run (debug.log):**
1. `bin "Gif" in Visual Assets → FAILED after 8 attempts` — `adaptiveT=10ms` made the after-ok delay only 30ms and each retry only 10ms. Total retry window was ~80ms. Premiere needs ~200–400ms to update `rootItem.children` after `createBin` returns.
2. `seq "Raw" → FAILED: err:ReferenceError: app.project.createNewSequenceFromPreset is not a function` — this ExtendScript API does not exist in the user's Premiere Pro install (v25.x).

**Done:**
- Raised `createOneBin` after-ok delay minimum from 30ms → 250ms: `Math.max(adaptiveT, 250)`.
- Raised retry interval minimum from `adaptiveT` → `Math.max(adaptiveT, 200)`. With T=10ms this gives an 8-retry window of ~1.85 seconds — enough for Premiere to update its children list.
- Added `typeof app.project.createNewSequenceFromPreset === "function"` check in both `setupFromPremiereTree` (createNextSequence) and `setupProjectBinsAndSequences` (createNextSeq). If not present, falls back to `app.project.createNewSequence(name, presetPath)` — passing preset path as second argument suppresses the sequence-settings dialog.
- `EXT_VERSION` → `'1.9.1'`, `EXPECTED_EXT_VERSION` → `'1.9.1'`. Deployed to CEP folder.

**What's next:**
- Restart Premiere and test. All bins including Gif/New/Old should create. Sequence "Raw" should appear in "Sequences" bin without dialog.

---

### 2026-05-27 | Session 019 — DFS + Adaptive T Algorithm (v1.9.2 → v1.9.3)

**By:** Claude Code
**Version:** v1.9.2 → v1.9.3
**Status:** Done

**Problem:**
- Even with the 5 fixes from v1.9.2, bin creation was unreliable: flat queue + fixed 150ms retries didn't adapt to Premiere's actual speed, and nested bins could still hit "parent not found" on slower machines.
- `csInterface.getSystemPath(SystemPath.EXTENSION)` call at ext.js load time crashed with TypeError because the project's CSInterface.js is a 12-line stub — panel showed "Disconnected" permanently.

**Done:**
- **Complete rewrite of `setupFromPremiereTree`** in `cep-extension/ext.js`:
  - `buildPath(parentId)` helper walks `tempId → parent_id` chain upward to produce a full path array for any node.
  - Root bins identified by `parent_id === null`. Processed via `processRootBins(idx)` → calls `processBinAndChildren` for each root in sequence.
  - `processBinAndChildren(node, parentPathArr, onDone)` — DFS: create bin → wait adaptiveT → recurse into children → call onDone when entire subtree done.
  - `createOneBin(name, parentPathArr, onDone)` — sends 1 evalScript, measures elapsed ms, sets `adaptiveT = elapsed` on "ok", retries up to 8× using `adaptiveT` as wait on "err:parent not found", calls `onDone` after `adaptiveT` ms.
  - Sequences collected upfront with `parentPath` arrays. `createNextSequence(idx)` runs after all bins — uses `createNewSequenceFromPreset` + `moveBin`, same adaptive T, retry on target bin not found.
- **Extension path from `window.location.href`:** Replaced crashed `csInterface.getSystemPath(SystemPath.EXTENSION)` with IIFE parsing `window.location.href` to derive extension directory. Works universally in CEP.
- `EXT_VERSION` bumped to `'1.9.0'`, `EXPECTED_EXT_VERSION` in `main.js` updated to match.
- Deployed new `ext.js` to `%APPDATA%\Adobe\CEP\extensions\freexan-link\`.

**Expected result after Premiere restart:**
- Panel connects cleanly (no crash, no "Disconnected" on load).
- Bins created in DFS order — root first, then full subtree of each root before moving to next.
- No "parent not found" errors even on slow machines — adaptive T ensures each command waits the right amount.
- Sequences created after all bins with no dialog (preset-based).
- Total creation time self-calibrates to actual Premiere response speed.

**What's next:**
- Restart Premiere and run a test project creation.
- Check `%APPDATA%\freeXan\debug.log` for `[CEP] Panel v1.9.0 is current — OK` and `[EXT]` creation logs.

---

### 2026-05-27 | Session 018 — Bin/Sequence Creation: 5 Fixes (v1.9.1 → v1.9.2)

**By:** Claude Code
**Version:** v1.9.1 → v1.9.2
**Status:** Done

**Done:**
- **Fix A — Immediate dispatch (main.js):** Added `let cepWs = null` at module level, assigned in `wss.on('connection')`, cleared in `ws.on('close')`. After each `pendingProjectSetup = {...}` assignment (both Mode A and Mode B), checks if panel is connected + `activeProjectPath` matches → sends `setup-project` instantly, skipping the `active_project` / `project_ready` wait entirely.
- **Fix B — readiness check (ext.js):** Replaced `typeof ri.numItems !== "undefined"` in both `TRACKING_SCRIPT` and `waitForProjectReady` with `ri.children` access inside try/catch. The old check kept returning "wait" for 20 seconds even when bins created fine. New check resolves in 1–3 polls (~0.3–1s). Reduced poll interval from 500ms to 300ms.
- **Fix C — parent retry for nested bins (ext.js):** Wrapped bin evalScript callback in a `tryBin()` IIFE that retries up to 5× with 150ms delay on `"err:parent not found"` — handles the Premiere async children-list update window.
- **Fix D — preset-based sequence creation (ext.js + cep-extension/):** Bundled `sequence-preset.sqpreset` (HD 1080p 25fps from Premiere install). `setupFromPremiereTree` and `setupProjectBinsAndSequences` now use `createNewSequenceFromPreset(presetPath, name)` — no dialog. Extension path captured at startup via `csInterface.getSystemPath(SystemPath.EXTENSION)`.
- **Fix E — sequence placed in parent bin (ext.js):** `collectOrder` now stores `parentPath` on sequence queue items. After creation, the returned sequence object is moved to its target bin via `seq.moveBin(tgt)`. Same retry loop as Fix C applied to the target-bin lookup in moveBin.
- `EXT_VERSION` → `'1.8.9'`, `EXPECTED_EXT_VERSION` → `'1.8.9'`

**Expected result after Premiere restart:**
- Time from project creation to bins done: ~1–3 seconds (was ~28s)
- All nested bins create correctly (no "parent not found")
- "Raw" sequence appears inside Sequences bin (not root)
- No sequence settings dialog — fully automatic

---

### 2026-05-27 | Session 017 — Folder format + prproj version increment (v1.9.0 → v1.9.1)

**By:** Claude Code  
**Version:** v1.9.0 → v1.9.1  
**Status:** Done

**Done:**
- Year-month folder renamed from `2026 May` → `July2026` (month+year, no space). Updated in `main.js` (project creation) and `renderer/app.js` (preview). Note: this format sorts alphabetically in Explorer, not chronologically — user is aware and prefers it.
- `.prproj` file now auto-increments version: checks for `v01`, if exists tries `v02`, `v03`... until it finds a free slot. No existing work is ever overwritten. Loop uses `String(vNum).padStart(2,'0')` for consistent `v01`/`v02` zero-padding.
- README write is now conditional: only creates the file if it doesn't already exist.
- Applied `resolveVars()` to `projectName` in the `fileParts` array (prproj filename) — was missing, inconsistent with `folderParts`.

---

### 2026-05-27 | Session 016 — Date/Time Variables + Auto Date Hierarchy (v1.8.9 → v1.9.0)

**By:** Claude Code  
**Version:** v1.8.9 → v1.9.0  
**Status:** Done

**Done:**
- Added `resolveVars(str)` utility to both `main.js` and `renderer/app.js`. Replaces `{Year}` `{Month}` `{Date}` `{HH}` `{MM}` `{SS}` with current PC date/time values. Case-insensitive, applies at call time, safe on null/undefined input.
- **Date hierarchy wrapping** in `create-project` IPC handler (`main.js`): every project path is now `targetDir / {Year} {Month} / {DD} {Month} / folderName`. E.g. `D:\Projects\2026 May\27 May\BloomX - Webinar - 001_Hook`. Created via existing `fs.mkdirSync(..., { recursive: true })` — no extra logic needed.
- `resolveVars()` applied to `projectName` when constructing `folderName`, so `{Date}` etc. in the project name field resolve before the folder is created.
- `resolveVars()` applied to `targetDir` in the path join, allowing the root directory itself to contain variables.
- `buildFolderTree()` (`main.js`): applies `resolveVars()` to each folder node name before `fs.mkdirSync`, and to `rootName` (used as Premiere bin name for asset imports).
- **UI preview** (`renderer/app.js`): `updatePreviews()` now resolves variables in `projectVal` and shows a "Date Path" row (`2026 May  →  27 May`) in the preview box. Updated every keystroke.
- **Input validation**: `hasInvalidChars(str)` checks for `\ / : * ? " < > |` outside of `{...}` variable tokens. Applied to `input-project` on every keystroke (red border), at form submit (blocks submit + refocuses), `ftsNewRootName` button click, and folder template node name `blur` handlers. Contenteditable node names revert to original if invalid chars entered.
- Variable hint chips added below the Project Name input in HTML.
- Red border state `.input-invalid` and `.preview-date-chip` + `.help-text code` styles added to `styles.css`.

**Decisions:**
- Date hierarchy is always on — no toggle. User confirmed.
- `{Month}` outputs full name (May, June, …), `{Date}` is zero-padded.
- Literal `/` and `\` in folder-name inputs trigger the invalid-chars error; only path inputs (target dir) allow them.

**What's next:**
- Unfixed race condition from handoff: `pendingProjectSetup` can be queued after panel already reported `active_project` — setup-project never dispatched. Still needs the immediate-dispatch check in `create-project` IPC handler.

---

### 2026-05-26 | Session 015 — Legacy CEP Extension Was Intercepting WebSocket (v1.8.8 → v1.8.9)

**By:** Claude Code
**Version:** v1.8.8 → v1.8.9
**Status:** Done

**Done:**
- Diagnosed the actual root cause of "bins not creating, no errors": a duplicate CEP extension folder `project-builder-link` (bundle ID `com.swastik.projectbuilder.link`, leftover from the pre-freeXan brand rename) was still installed alongside `freexan-link` in `%APPDATA%\Adobe\CEP\extensions\`. Both panels auto-load on Premiere startup and both connect to `ws://localhost:4554`. The legacy panel won the race and intercepted every session.
- The legacy ext.js predates v1.8.3 — no `ext_hello`, no `extLog`, no `project_ready`. This explained every missing log line:
  - No `[CEP] Panel v… is current` → no `ext_hello` ever sent
  - No `[EXT]` entries in debug.log → no `extLog` forwarding exists
  - No `[CEP] project_ready` → fallback always fires after 8 s
  - `setup-project` arrived at a panel that doesn't handle it → bins silently never created
- `main.js`: Added legacy-cleanup pass at the top of `installCEPExtension()` — removes `project-builder-link`, `projectbuilder-link`, `project_builder_link` from the CEP extensions folder on every freeXan startup before copying the current panel
- One-time manual cleanup performed via PowerShell (so user doesn't need to restart freeXan first):
  - Deleted `%APPDATA%\Adobe\CEP\extensions\project-builder-link\` recursively
  - Deleted stale CEP cache entries `PPRO_25.3.0_com.swastik.projectbuilder.link.panel` and `PPRO_25.3.0_com.projectbuilder.link` from `%LOCALAPPDATA%\Temp\cep_cache\`
- Confirmed `freexan-link\ext.js` on disk is intact and reads `EXT_VERSION = '1.8.8'`

**How this was found:**
- Read `%APPDATA%\freeXan\debug.log` — saw `[CEP] Panel connected` and `active_project` with no `ext_hello` log line and no `[EXT]` forwarding. The code on disk has both, so the running panel must not be the file on disk.
- Listed `%LOCALAPPDATA%\Temp\cep_cache\` — found a cache entry for `com.swastik.projectbuilder.link.panel` updated today, alongside the expected `com.bloomx.freexan.link.panel` (which was actually missing — the legacy panel was running, the new one wasn't).
- Listed `%APPDATA%\Adobe\CEP\extensions\` — found both `project-builder-link` (old) and `freexan-link` (new) installed.
- Inspected `project-builder-link\CSXS\manifest.xml` — confirmed bundle ID `com.swastik.projectbuilder.link` and the manifest still auto-visible. Read its `ext.js` — pre-v1.8.3 code with no version field and no `ext_hello` send.

**Notes:**
- v1.8.8 (TRACKING_SCRIPT + waitForProjectReady fixes) was actually correct all along — it just never got loaded because Premiere kept loading the legacy panel instead
- Auto-cleanup means the user won't see this issue again even on machines where they upgrade across the rename boundary
- Next: user must close Premiere if open, then restart freeXan and Premiere. The freeXan panel labelled "freeXan Link" (not "Project Builder Link") should be the only one in Window > Extensions menu

---

### 2026-05-26 | Session 014 — TRACKING_SCRIPT Race Fix + waitForProjectReady Restored (v1.8.7 → v1.8.8)

**By:** Claude Code
**Version:** v1.8.7 → v1.8.8
**Status:** Done

**Done:**
- `cep-extension/ext.js`: Fixed `TRACKING_SCRIPT` — added nested try/catch so rootItem access exceptions return `"NOT_READY||"+path` instead of `"NONE||"`. Previously the outer catch reset `lastProjectPath` to empty on every tick during project loading, preventing `project_ready` from ever firing.
- `cep-extension/ext.js`: Restored `waitForProjectReady(callback)` in both `setupFromPremiereTree` and `setupProjectBinsAndSequences` — 40 retries × 500ms (20 seconds max). Safety net for the 8-second fallback path where `setup-project` may arrive before rootItem is confirmed accessible by `project_ready`.
- `cep-extension/ext.js`: `EXT_VERSION` bumped to `1.8.8`
- `main.js`: `EXPECTED_EXT_VERSION` bumped to `1.8.8` — was left at `1.8.7`, causing every panel connect to trigger `reload` → infinite reload loop

**Root cause this session:**
- User reported "still not working after Premiere restart" — debug.log showed no `[EXT]` entries (panel was stuck in infinite reload loop due to version mismatch) and fallback dispatch firing at 8s with no result
- TRACKING_SCRIPT was crashing on rootItem access → returning NONE → resetting path state → `project_ready` never sent
- 8-second fallback was reaching setup functions before rootItem was ready → all IIFEs returning `"err:rootItem not ready"`

**Notes:**
- The version mismatch (`EXPECTED_EXT_VERSION '1.8.7'` vs `EXT_VERSION '1.8.8'`) was the most critical bug — it made the panel non-functional even after a Premiere restart
- `waitForProjectReady` is now the last line of defence for both code paths (project_ready and 8s fallback)
- Next: test with actual Premiere restart to confirm bins and sequences create successfully

---

### 2026-05-26 | Session 013 — CEP Extension Log Forwarding to debug.log (v1.8.6 → v1.8.7)

**By:** Claude Code
**Version:** v1.8.6 → v1.8.7
**Status:** Done

**Done:**
- `cep-extension/ext.js`: Added `extLog(msg)` helper — wraps `console.log` AND sends `{ type: 'ext_log', msg }` via WebSocket so all ext.js events appear in `debug.log`
- `cep-extension/ext.js`: Replaced all `console.log` calls with `extLog()`. Logged events: WebSocket connected, project path changed + rootItem state, `project_ready` fired, `setup-project` received (counts), queue built (full item list), each insertion attempt (1/N label, type, name, parent path), each insertion result (`ok` or full error string), all asset import results, empty-queue warning with node sample
- `cep-extension/ext.js`: Panel info-text now updates per-item during insertion: "Created bin: X", "Created sequence: X", or "ERROR: <full error>" — visible without DevTools
- `main.js`: Added `ext_log` branch in WebSocket message handler — writes `[EXT] <msg>` via `dbg()`
- `main.js` + `cep-extension/ext.js`: `EXPECTED_EXT_VERSION` / `EXT_VERSION` bumped to `1.8.7`

**Notes:**
- `extLog` is safe to call before ws is open — the `ws.readyState === WebSocket.OPEN` check prevents send on closed socket
- The `[EXT]` prefix in debug.log distinguishes extension-side events from server-side `[CEP]` and `[Setup]` events

---

### 2026-05-26 | Session 012 — Fallback Dispatch Restored for Old Panels (v1.8.5 → v1.8.6)

**By:** Claude Code
**Version:** v1.8.5 → v1.8.6
**Status:** Done

**Done:**
- `main.js`: Reinstated `active_project` → `setup-project` fallback dispatch. When `active_project` path matches `pendingProjectSetup`, a 3-second `setTimeout` is queued. If `project_ready` fires within those 3 seconds (new panel), it clears `pendingProjectSetup`; the timeout fires, detects `pendingProjectSetup !== snapshot`, and cancels. If `project_ready` never fires (old panel), the timeout dispatches `setup-project` using the captured `snapshot` reference.

**Root cause of regression:**
- v1.8.5 moved dispatch exclusively to `project_ready`. Old panels (pre-v1.8.5, still loaded in a running Premiere instance) only send `active_project`. main.js received `active_project`, updated UI, but never dispatched `setup-project` → no bins created.
- The 3-second delay gives `rootItem` time to become accessible for old panels that rely on the fallback path (was previously handled by `waitForProjectReady` polling in ext.js, which was removed in v1.8.5).

---

### 2026-05-26 | Session 011 — Inverted Handshake: project_ready Before setup-project (v1.8.4 → v1.8.5)

**By:** Claude Code
**Version:** v1.8.4 → v1.8.5
**Status:** Done

**Done:**
- `cep-extension/ext.js`: Rewrote `startProjectTracking` — single evalScript per 1-second tick using a pre-compiled IIFE (`TRACKING_SCRIPT`) that returns `"READY||<path>"` / `"NOT_READY||<path>"` / `"NONE||"`. Sends `active_project` on path change (overlay sync). Sends `project_ready` once per project as soon as `rootItem.numItems` is accessible.
- `cep-extension/ext.js`: Removed `waitForProjectReady` function entirely — not needed now that `setup-project` only arrives after `project_ready` confirms readiness
- `cep-extension/ext.js`: `setupFromPremiereTree` and `setupProjectBinsAndSequences` now execute immediately on receiving `setup-project` — no internal polling
- `cep-extension/ext.js`: Added `projectReadySent` module-level flag — resets to `false` on connect and when project path changes; prevents duplicate `project_ready` signals for the same project
- `main.js`: `active_project` handler stripped to UI-only (overlay sync, `activeProjectPath` update)
- `main.js`: New `project_ready` handler does path comparison and dispatches `setup-project`
- `main.js` + `cep-extension/ext.js`: `EXPECTED_EXT_VERSION` / `EXT_VERSION` bumped to `1.8.5`

**Decisions:**
- Single evalScript per tick (not separate calls for path and rootItem) — reduces evalScript call volume and guarantees the two values are read atomically from the same project state snapshot
- `TRACKING_SCRIPT` pre-built as a module-level constant — avoids re-constructing the string on every interval tick
- `project_ready` is sent ONCE per project per connection via `projectReadySent` flag — avoids flooding main.js with repeated signals if rootItem briefly becomes unavailable and re-accessible
- `active_project` kept alongside `project_ready` for overlay UI sync — the overlay needs the path regardless of rootItem state

**Notes:**
- Old panels (pre-v1.8.5) that don't send `ext_hello` will be reloaded by the auto-reload mechanism after Premiere restarts once
- The debug log will now show `[CEP] project_ready` instead of the old `[Setup] Path compare` block appearing on `active_project` events

---

### 2026-05-26 | Session 010 — Debug Logging for Bin/Sequence Insertion (v1.8.3 → v1.8.4)

**By:** Claude Code
**Version:** v1.8.3 → v1.8.4
**Status:** Done

**Done:**
- `main.js`: Added `dbg(...args)` logger — writes timestamped entries to `%APPDATA%/freeXan/debug.log` (same dir as the DB) AND to `console.log`
- `main.js`: `dbg()` wired into CEP connect/disconnect, `ext_hello` version check, `active_project` received, path comparison (both sides printed), `pendingProjectSetup` queued (bins_json raw, premiereTree node count, flat bins array, sequences array), `setup-project` sent
- `cep-extension/ext.js`: `setup-project` handler logs received payload counts (tree/bins/seq) to console and updates info-text with counts
- `cep-extension/ext.js`: `waitForProjectReady` logs every attempt and result
- `cep-extension/ext.js`: `setupFromPremiereTree` logs the built queue; if queue is empty, logs a warning with the raw nodes sample so the root-node detection failure is visible
- `cep-extension/ext.js`: all IIFE results already logged via `console.log` in callbacks

**Decisions:**
- `dbg()` uses `fs.appendFileSync` wrapped in try/catch — log failures never crash the app
- `debugLogPath` is lazily initialized (waits for `app.getPath('userData')` to be available on first call)
- CEP panel logs go to the panel's browser console (visible in CEP DevTools or Premiere's debug console), not the main log file — they can't write to the filesystem from ext.js without additional bridging

**Notes:**
- Log file location: `%APPDATA%\freeXan\debug.log` (same folder as `project-builder.db`)
- To watch logs live: open `debug.log` in Notepad, or use `Get-Content -Path $env:APPDATA\freeXan\debug.log -Wait` in PowerShell
- CEP console logs visible by opening Chrome DevTools for the panel: in Premiere, Window → Extensions → right-click freeXan Link → Inspect (or navigate to `localhost:7777` if PlayerDebugMode is on)

---

### 2026-05-26 | Session 009 — CEP Auto-Reload + Full Inline IIFE Fix (v1.8.2 → v1.8.3)

**By:** Claude Code
**Version:** v1.8.2 → v1.8.3
**Status:** Done

**Done:**
- `cep-extension/ext.js`: Added `const EXT_VERSION = '1.8.3'` and version announcement on WebSocket open — panel sends `{ type: 'ext_hello', version: EXT_VERSION }` immediately on connect
- `cep-extension/ext.js`: Added `reload` message handler — on receiving `{ type: 'reload' }`, calls `window.location.reload()` to pick up latest CEP files without restarting Premiere
- `main.js`: Added `const EXPECTED_EXT_VERSION = '1.8.3'`; added `ext_hello` branch in WebSocket message handler — sends `{ type: 'reload' }` if panel version doesn't match
- `cep-extension/ext.js`: Converted sequences in `setupFromPremiereTree` to inline IIFE (was still calling `createSequence()` by name)
- `cep-extension/ext.js`: Converted both `createBin` and `createSequence` calls in `setupProjectBinsAndSequences` to inline IIFEs
- `main.js`: Added `.trim()` to both sides of the `active_project` path comparison
- `cep-extension/ext.js`: Added `info-text` status updates at each stage of setup flow

**Decisions:**
- Auto-reload only fires if `data.version !== EXPECTED_EXT_VERSION` — a matching version does not trigger a reload, so there's no reload loop
- Panels running versions that predate the `ext_hello` mechanism (v1.8.1 and older) will NOT auto-reload — user must refresh the panel or restart Premiere once to get the current code; after that, auto-reload takes over for all future updates
- `window.location.reload()` disconnects the WebSocket, which triggers the `ws.onclose` handler in the old panel — the `connectWebSocket` timer fires after 3 seconds, and the new panel connects and announces the correct version

**Notes:**
- The `ext_hello` → `reload` cycle is: old panel connects → announces old version → server sends `reload` → panel calls `location.reload()` → panel reconnects → announces new version → server confirms version is current → normal operation resumes
- Total downtime during auto-reload: ~3-4 seconds (reconnect timer + new page load)

---

### 2026-05-26 | Session 008 — Premiere Pro Bin/Sequence Bug Fix (v1.8.1 → v1.8.2)

**By:** Claude Code
**Version:** v1.8.1 → v1.8.2
**Status:** Done

**Done:**
- `cep-extension/ext.js`: Added `waitForProjectReady(callback)` — polls ExtendScript every 500ms (max 20 retries / 10 seconds) until `app.project.rootItem` is confirmed ready before attempting any bin or sequence creation
- `cep-extension/ext.js`: Rewrote `setupFromPremiereTree` to call `waitForProjectReady` first, and replaced all `createBinAtPath()` named-function calls with inline self-contained IIFEs passed directly to `evalScript` — no dependency on named functions pre-loaded in `hostscript.jsx`
- `cep-extension/ext.js`: Wrapped `setupProjectBinsAndSequences` (flat fallback path) with `waitForProjectReady` for the same timing fix

**Decisions:**
- Inline IIFE approach chosen over named JSX function because Premiere's ExtendScript engine does not guarantee reload of JSX files between sessions — if Premiere is running when CEP files are updated, old JSX stays in memory. Self-contained scripts sidestep this entirely.
- `waitForProjectReady` uses `"ready"` / `"wait"` string return from ExtendScript rather than booleans — avoids `evalScript` marshalling edge cases with `true`/`false` across the bridge
- Timeout after 20 retries fires the callback anyway with a console warning — prevents permanent hang if Premiere reports a project that never becomes fully ready

**Notes:**
- Both bugs were silent failures — Premiere received the `setup-project` message and called `evalScript`, but the ExtendScript returned error strings that were only visible in the CEP DevTools console, not surfaced to the user
- Root cause for Bug 1: `app.project.path` is set when the `.prproj` file is opened, but `app.project.rootItem` takes additional time to initialise depending on project size and media cache

---

### 2026-05-25 | Session 007 — Builder Hierarchy + UI Polish (v1.6.0 → v1.6.8)

**By:** Claude Code
**Version:** v1.6.0 → v1.6.8
**Status:** Done

**Done:**
- `renderer/index.html` + `app.js`: Template Structure panel split into 2 inner tabs — "Folder Structure" (tree) and "Premiere Pro" (Bins + Sequences) (`v1.6.1`)
- `renderer/index.html` + `app.js` + `styles.css`: Removed standalone "Folder Structure Templates" db-section; merged template list and panel into the main "Templates" section with 3 filter dropdowns (Client, Funnel, Task) above the list; Default ★ always shows; added `.db-subsection-label` divider before .prproj templates (`v1.6.2`)
- `renderer/app.js` + `styles.css`: Added hover-visible × delete button to non-default list items in `renderFtsList`; fixed `fts-tree-view` CSS class being permanently on `ftsTreeEl` (now removed in `enterFtsEditMode`, re-added in `exitFtsEditMode`) so folder delete buttons appear in edit mode (`v1.6.3`)
- `renderer/styles.css`: Fixed bins/sequences × button invisible (was `opacity: 0.45` compounded — replaced with explicit `color: rgba(255,255,255,0.5)`; turns red on hover) (`v1.6.4`)
- `renderer/app.js`: Bins/sequences tag names now `contentEditable` in edit mode — click to rename, blur/Enter to confirm (`v1.6.4`)
- `renderer/index.html` + `app.js` + `styles.css`: Template name is now an `<input>` (`fts-template-name-input`) — disabled in view mode, enabled in edit mode; value used on Save (`v1.6.4`)
- `renderer/styles.css`: Added purple underline hover/focus cue on `.ft-name[contenteditable="true"]` (`v1.6.4`)
- `renderer/app.js`: Builder tab Folder Hierarchy panel now shows the resolved folder template tree — Default template on startup; switches live when Client/Funnel/Task dropdowns change (`resolveFtsTemplateForBuilder`, `refreshBuilderTree`, `renderBuilderTree`, `renderBuilderTreeNode`) (`v1.6.5`)
- `renderer/app.js` + `styles.css`: Every template now has a mandatory locked `01_Project_Files` root folder — injected at `selectFtsTemplate` if absent, always `_locked = true`; contains a visual `project.prproj` placeholder (rendered by `renderLockedPrprojNode`, not stored in DB); 🔒 badge on locked nodes (`v1.6.6`)
- `renderer/app.js`: Fixed folder delete buttons missing after locked-node refactor — `actions.appendChild(del)` line was accidentally omitted inside `if (!node._locked)` block (`v1.6.7`)
- `renderer/app.js`: Removed stale `configState.folderStructure` fallback from `renderBuilderTree`; fixed `refreshBuilderTree` to re-fetch nodes when cache is empty even if resolved ID hasn't changed (`v1.6.7`)
- `main.js`: Added `ft-get-default` IPC handler (`db.folderTemplatesApi.getDefault()`) (`v1.6.8`)
- `preload.js`: Exposed `window.api.ft.getDefault()` (`v1.6.8`)
- `renderer/app.js`: `refreshBuilderTree` now calls `window.api.ft.getDefault()` directly if `resolveFtsTemplateForBuilder()` returns null — fixes blank Folder Hierarchy on cold start before `ftsTemplates` cache is populated (`v1.6.8`)

**Decisions:**
- `ft-get-default` IPC handler bypasses the renderer-side `ftsTemplates` cache — guarantees the Default template loads even if `loadFtsTemplates()` hasn't completed yet on startup
- `renderLockedPrprojNode` is purely visual, never stored in `ftsTree` — no DB side effects
- `_locked` is a runtime-only JS flag on node objects; not persisted to DB; re-applied every time `selectFtsTemplate` is called
- Builder tree has no fallback to old `configState.folderStructure` — if DB returns no template at all (edge case), tree is blank rather than showing stale data

**Notes:**
- `ftsTemplates` from `getAll()` returns one row per assignment (LEFT JOIN); Default template appears once with NULL assignment fields — `find(t => t.is_default)` is reliable only after `loadFtsTemplates()` resolves

---

### 2026-05-25 | Session 006 — Template System Redesign (v1.5.1 → v1.6.0)

**By:** Claude Code
**Version:** v1.5.0 → v1.6.0
**Status:** Done

**Done:**
- `renderer/app.js`: Moved all `bind*Events()` calls before every `await` in `DOMContentLoaded`; wrapped each async init in its own try-catch (fixes all buttons being unclickable if any single init throws)
- `renderer/index.html` + `app.js`: Moved Preset Assets section above Templates in Library tab (order: Clients → Funnels → Tasks → Preset Assets → Templates → Folder Structure Templates)
- `renderer/index.html` + `app.js`: Removed "Default Premiere Bins" and "Default Premiere Sequences" sections from Settings
- `renderer/index.html` + `app.js`: Removed "Base Premiere Pro Template" and "Folder Structure Templates" sections from Settings; Settings now contains only Target Directory, Auto-popup, and Save
- `db.js`: Added `bins_json` and `sequences_json` columns to `folder_templates`; added `task_id` to `folder_template_assignments` (all via safe `ALTER TABLE` migrations); rewrote `folderTemplatesApi` — `create`, `update`, `assign`, `unassign`, `resolve`, `getAll`, `getAssignments` now include bins/seqs/taskId; added `clone(sourceId)` method that copies template metadata + all nodes with idMap remapping
- `main.js`: `create-project` now passes `taskId` to `resolve()`; `pendingProjectSetup` bins/sequences sourced from template's `bins_json`/`sequences_json`; updated `ft-create`, `ft-update`, `ft-assign`, `ft-unassign` handler signatures; added `ft-clone` handler
- `preload.js`: Updated `ft.*` signatures for bins/seqs/taskId; added `ft.clone`
- `renderer/index.html`: New `fts-*` section added at bottom of Library tab — template list, panel with header, assignment dropdowns, tree, bins section, sequences section
- `renderer/app.js`: Full `fts-*` system — state vars, 22 DOM refs, `loadFtsTemplates`, `renderFtsList`, `populateFtsDropdowns`, `refreshFtsFunnels`, `refreshFtsTasks`, `selectFtsTemplate`, `renderFtsTree`, `renderFtsNode`, `renderFtsBins`, `renderFtsSequences`, `enterFtsEditMode`, `exitFtsEditMode`, `saveFtsTemplate`, `bindFtsEvents`
- `renderer/styles.css`: Added `.fts-*` style block (list, panel, assignment row, tree-view hide rule, tags, tag-remove)
- `package.json` + `nodemon.json`: Added `npm run dev` script with nodemon watching `main.js`, `preload.js`, `db.js`, `renderer/` (500ms delay)
- `docs/RULEBOOK.md`: Added Rule 10 — always communicate in editor language (Premiere Pro/AE terms), never developer jargon

**Decisions:**
- Old `ft-*` Settings code left in place with null guards (`if (!ftTemplateSelect) return`) — DOM elements were removed but the functions stay to avoid breaking anything until the new system is confirmed stable
- Template name stays editable from the panel header in a future pass; for now it's read from the stored record during Save
- `confirm()` dialog used for the overwrite-vs-save-as-new choice — no custom modal needed at this stage
- View mode hides action buttons via `.fts-tree-view .ft-node-actions { display: none !important }` CSS class; edit mode removes the class and re-renders

**Notes:**
- `ftsTemplates` from `getAll()` returns one row per assignment (JOIN), so a template with multiple assignments shows multiple rows in the raw data — `renderFtsList` renders one row per `id` but the label shows the first assignment found (the JOIN order is non-deterministic for multi-assigned templates; acceptable for now)
- `clone()` uses an `idMap` to remap parent IDs — nodes must be inserted in `sort_order` order so parents exist before children reference them

**Next:**
- Run `npm run dev` and test: Library tab → Folder Structure Templates section appears, Default ★ in list, click shows panel, Edit unlocks tree, Save works, bins/sequences editable
- If template name needs to be editable in the panel, add an inline input to the panel header

---

### 2026-05-25 | Session 005 — Bug Fix + DB Tab Reorder

**By:** Claude Code
**Version:** v1.5.0 → v1.5.1
**Status:** Done

**Done:**
- `renderer/app.js`: Moved all `bind*Events()` calls to the top of the `DOMContentLoaded` handler (before any `await`), and wrapped each async init (`loadAndApplyConfig`, `loadBuilderDropdowns`, `loadFolderTemplates`) in its own try-catch. Fixes all buttons being unclickable when any single init call threw.
- `renderer/index.html`: Swapped order of Templates and Preset Assets sections in the Database/Library tab. New order: Clients → Funnels → Tasks → Preset Assets → Templates.

**Decisions:**
- Event binding must always precede async calls in the DOMContentLoaded handler — this is now the established pattern for this file
- `enableInitialsSearch()` and `focusClientDropdown()` remain after the awaits since they depend on dropdown options being populated

---

### 2026-05-25 | Session 004 — Folder Structure Template System

**By:** Claude Code
**Version:** v1.4.0 → v1.5.0
**Status:** Done

**Done:**
- `db.js`: Added 3 new tables (`folder_templates`, `folder_template_nodes`, `folder_template_assignments`); added `folderTemplatesApi` (12 methods: getAll, getDefault, create, update, delete, setDefault, getNodes, setNodes, getAssignments, assign, unassign, resolve); auto-seeds a Default template with 5 standard folders on first run; added to exports
- `main.js`: Added `buildFolderTree(basePath, nodes)` helper — creates folders on disk and collects asset paths for CEP import; updated `create-project` to resolve and apply folder templates (Mode A: copy-to-new, Mode B: open-template-directly); updated `pendingProjectSetup` to include `assets` array; updated WebSocket `setup-project` dispatch to include `assets`; added 11 `ft-*` IPC handlers + `ft-select-asset` dialog
- `preload.js`: Exposed `window.api.ft.*` (12 methods) via contextBridge
- `renderer/index.html`: Replaced flat Folder Structure section (now hidden) with full tree editor UI — template selector bar, .prproj path + open mode fields, tree editor, root-add row, save/save-as-new actions, assignment section
- `renderer/app.js`: Added `ftTemplates`/`ftActiveId`/`ftTree` state; all tree editor DOM refs; `loadFolderTemplates()`, `loadFtTemplateData()`, `renderFtTree()`, `renderFtNode()`, node CRUD functions (`ftAddFolderNode`, `ftAddAssetNode`, `ftRemoveNode`, `ftRenameNode`), `ftBuildSavePayload()`, `saveFolderTemplate()`, `renderAssignments()`, `refreshFtAssignFunnels()`, `bindFolderTemplateEvents()`; called from DOMContentLoaded after `loadBuilderDropdowns()`
- `renderer/styles.css`: Added full tree editor styles (`ft-tree`, `ft-node`, `ft-name`, `ft-node-actions`, `ft-node-btn`, `ft-assignment-*`, `btn-danger`, `template-selector-bar`, `ft-prproj-row`, `ft-openmode-row`)
- `cep-extension/ext.js`: Updated `setup-project` handler to import asset files into matching bins after a 800ms delay (lets bins finish creating first)
- `cep-extension/hostscript.jsx`: Added `importAssetToBin(filePath, binName)` — finds bin by name in rootItem, falls back to root, imports file via `importFiles()`

**Decisions:**
- Used delete-then-insert (not UPSERT) for `folder_template_assignments.assign()` to handle SQLite NULL uniqueness limitations
- `parent_id` in tree uses `tempId` as the key so `setNodes` can do a two-pass insert mapping temp IDs to real DB IDs; DB-loaded nodes get `tempId = id` to keep references consistent
- Mode B (open_template) returns early from `create-project` — no folder created, no file copied, template opened directly
- `buildFolderTree` propagates `rootName` from parent to child so assets deep in the hierarchy still target the correct root-level bin
- `loadFolderTemplates()` called after `loadBuilderDropdowns()` in init so `dbClients` is populated before the assignment dropdowns are built

**Notes:**
- `folderStructure` in `appConfig` is kept as a flat fallback (used if no folder template resolves)
- Legacy `structure-list` HTML element is still in the DOM but hidden — avoids null-ref errors in the legacy renderer code
- `ft-select-asset` allows both files and directories; directories cause all contained files to be imported into Premiere

---

### 2026-05-25 | Session 003 — Browser Image Drag-Drop Feature

**By:** Claude Code  
**Version:** v1.2.1 → v1.3.0  
**Status:** Done

**Done:**
- `preload.js`: added `onUrlDropCallback`; drop handler now falls through to URL detection when no local file paths are found; exposed `onUrlsDropped` and `importBrowserImage` on `window.api`
- `renderer/overlay.js`: `setProcessing()` updated to accept a label param; registered `onUrlsDropped` handler — shows "Downloading…" during fetch, then success/error feedback
- `main.js`: added `axios` and `ffmpegInstaller` requires; added `convertWithFfmpeg()` helper using existing `exec`; added `import-browser-image` IPC handler
- `docs/FUTURE_UPDATES.md`: item marked `[x]`

**Decisions:**
- Used `axios` (already in package.json) over Node's built-in `https` — simpler response handling, timeout, and content-length cap in one call
- SVG passes through without conversion — Premiere Pro 2022+ supports SVG natively, and freeXan targets Premiere 14.0+
- Temp files written to `app.getPath('temp')` and deleted in `finally` blocks — no leftover files even on error
- Content-Type header takes precedence over URL file extension for format detection — URLs from CDNs often have no extension or misleading paths

**Notes:**
- `text/uri-list` format allows multiple URLs (one per line, `#` = comment) — the handler processes each URL sequentially
- `webUtils.getPathForFile()` returns null for browser-dragged files (no local path) — so the existing `filePaths.length > 0` check acts as the router between local vs browser drops
- 50 MB cap on downloads via `maxContentLength` — prevents accidental large image downloads

**Next:**
- Consider adding `[x]` to FUTURE_UPDATES.md for this item (already done)
- Next feature: Recent Projects Quick-Launch or Smart Bins

---

### 2026-05-25 | Session 001 — Baseline Documentation

**By:** Claude Code (AI assistant) + Swastik  
**Status:** Documentation sprint  

**Done:**
- Full project audit and exploration completed
- Created `CHANGELOG.md` — v1.2.0 baseline documented
- Created `DEV_LOG.md` — this file
- Created `NAVIGATION_LOG.md` — full file/function map
- Created `RULEBOOK.md` — project rules, standards, and log maintenance policy

**Notes:**
- Two unused dependencies found: `axios` and `@ffmpeg-installer/ffmpeg` — installed but never called in source. Flag for cleanup in next session.
- `dist/freeXan Setup 1.0.0.exe` still present alongside 1.2.0 — old artifact, safe to delete.
- WebSocket port 4554 is hardcoded in both `main.js` and `cep-extension/ext.js` — if ever changed, must update both.

**Next:**
- Continue normal development; log every session below this line

---

### 2026-05-25 | Session 002 — Single Instance Lock

**By:** Claude Code  
**Version:** v1.2.0 → v1.2.1  
**Status:** Done

**Done:**
- Added `app.requestSingleInstanceLock()` in `main.js` before `app.whenReady()`
- Second launch attempt now calls `mainWindow.show()` + `mainWindow.focus()` on the existing instance instead of opening a duplicate

**Notes:**
- If lock is not acquired (second instance), `app.quit()` fires synchronously — `app.whenReady()` never runs, so no windows or servers are created
- The `second-instance` event fires on the *primary* instance, not the one that was rejected

---

<!-- SESSION TEMPLATE (copy this block for each new session):

### YYYY-MM-DD | Session NNN — Short Title

**By:** [Author/AI]
**Version:** vX.Y.Z → vX.Y.Z
**Status:** [In Progress / Done / Blocked]

**Done:**
-

**Decisions:**
-

**Blockers:**
-

**Notes:**
-

**Next:**
-

-->
