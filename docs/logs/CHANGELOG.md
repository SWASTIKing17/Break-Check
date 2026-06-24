# CHANGELOG — freeXan by BloomX

All notable changes to this project are documented here.  
Format: `[vX.Y.Z] — YYYY-MM-DD HH:MM | Type | Description`

**Types:** `Feature` · `Fix` · `Logic` · `UI` · `DB` · `Build` · `Refactor` · `Security` · `Perf`

---

## [v3.5.1] - 2026-06-24

### Fix
- **freeXan Caption Engine Crash Fixes.** Resolved a critical bug causing the ExtendScript engine to crash entirely upon loading the extension.
  - Fixed a regex parser bug in `core/mogrt.jsx` where an unescaped forward slash `/[^/]/` inside a character class crashed the ExtendScript ES3 interpreter.
  - Fixed a reserved word violation in `core/timeline.jsx` where `var char` threw a SyntaxError. Renamed to `cChar` to restore full engine functionality.


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

