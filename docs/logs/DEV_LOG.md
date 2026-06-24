# DEVELOPMENT LOG — freeXan by BloomX

Active development journal. Each session is a timestamped entry.  
Record decisions, blockers, ideas, and progress here — not in code comments.

---

## Current Version: v3.5.1

[2026-06-24] Added SRT export functionality to freeXan Caption. Created exportUtils.ts with generateWbwSrt and generatePhrasedSrt. Added buttons in EditView.tsx to save files locally using Adobe CEP File System.

**App:** freeXan by BloomX  
**Date:** 2026-06-24
**Progress:**
- Found and fixed the root cause of the Adobe CEP engine disconnection issue in reeXan Caption.
- The ExtendScript engine was crashing during parsing because of two ES3 syntax issues: an unescaped slash in a regex /[^/.]+/ inside core/mogrt.jsx and the use of the reserved keyword char inside core/timeline.jsx.
- Fixed the plugin files in CEPs/freeXan_Caption and reinstalled them using the .bat installer.


**App:** freeXan by BloomX  
**Platform:** Windows 64-bit (Electron 30)  
**Stack:** Electron · SQLite (better-sqlite3) · WebSocket (ws) · Adobe CEP · ExtendScript  
**Entry Points:** `main.js` (main process), `renderer/index.html` (UI), `cep-extension/ext.js` (Premiere panel)  
**Database:** `%APPDATA%/freeXan/project-builder.db`  
**Config:** `%APPDATA%/Roaming/project-builder-link/config.json`  
**Installer:** `dist/freeXan Setup 1.9.7.exe`

---

## Session Log

### 2026-06-20 | Session 086 — CLI + MCP Prototype (v3.4.3 → v3.5.0)

**By:** Claude (AI assistant) + Swastik
**Version:** v3.4.3 → v3.5.0
**Status:** Done (prototype — not yet smoke-tested against a running app)

**Why this session existed:** Swastik wanted to be able to drive freeXan from a terminal AND let Claude Code control it directly. Decided in conversation: 6 commands, short-and-chatty naming, MCP mirrors CLI 1:1, confirm-before-destructive guardrails, separate `cli/` + `mcp/` folders, `npm link` for global install.

**Architecture chosen:** one "HTTP door" on the running Electron app, two thin clients on top.
```
freeXan app (Electron)
   └── new httpApi.js  →  HTTP server on 127.0.0.1:4555
                          ├── used by CLI (cli/freexan.js)
                          └── used by MCP (mcp/server.js)
```
The door wraps the existing `db.js` API and existing `ipcMain.handle` handlers — no business logic duplicated. Bridging HTTP→IPC uses `ipcMain._invokeHandlers.get(channel)({}, ...args)`. This is technically a private Electron API, but stable for years and acceptable for a prototype. None of the reachable handlers use `event.sender`, so the fake event object is safe.

**Done:**
- `httpApi.js` (new file at project root) — ~200 lines. Localhost-only HTTP server with 8 endpoints. Loopback check rejects non-127.0.0.1 connections defensively (Node already binds to loopback). 1 MB body cap. EADDRINUSE warning + disable instead of crash.
- `main.js` — three small additions: `require('./httpApi')`, `httpApi.startHttpApi({ ... })` call inside `app.whenReady()`, `httpApi.stopHttpApi()` in `before-quit`. Context passed in: `{ db, shell, appConfig, appVersion, getStatus, invokeHandler }`. No existing code touched.
- `cli/freexan.js` (new) — single file CLI, zero external deps. Built-in `http`/`path`/`fs` only. Tiny custom argv parser (no commander/yargs). ANSI colors gated on `process.stdout.isTTY && !NO_COLOR`. Commands: `status`, `clients`, `templates`, `new`, `import`, `open`. Resolves names by exact-match → initials → starts-with, all case-insensitive.
- `cli/package.json` — `bin: { freexan: "freexan.js" }` so `npm link` registers the global command. Engine 18+.
- `cli/README.md` — install/usage/examples.
- `mcp/server.js` (new) — ESM using low-level `Server` from `@modelcontextprotocol/sdk` (avoids needing zod). 6 tools mirror the 6 CLI commands. Destructive tools (`create_project`, `import_files`) include "ALWAYS confirm with the user before calling" in their descriptions so Claude prompts.
- `mcp/package.json` — single dep on `@modelcontextprotocol/sdk` (^1.0.0). `type: module` because top-level `await server.connect(transport)` needs ESM.
- `mcp/README.md` — install + Claude Code wiring (`claude_desktop_config.json` snippet) + example prompts.
- `npm install` in `mcp/` — 93 packages, no vulnerabilities.

**Decisions:**
- HTTP door is **localhost-only**. Two-line defense: Node binds to 127.0.0.1; the request handler also checks `req.socket.remoteAddress`. Belt and braces.
- Bridging HTTP → existing IPC handlers via `ipcMain._invokeHandlers` (private API) instead of refactoring `create-project`'s 400-line handler body into a named function. Zero changes to existing handlers. If Electron ever removes the private map, the fallback is to extract the handler bodies — clean refactor at that point.
- HTTP routes never write SQL directly — they always call `db.js` API objects. Follows RULEBOOK Section 3.2.
- CLI uses **zero external deps** so it stays portable and easy to update. The argv parser is ~30 lines; not worth a `yargs` dep for 6 commands.
- MCP uses the **low-level `Server` API** instead of the newer `McpServer` + zod. Saves a dep. The 6 tool schemas are tiny JSONSchema objects inline.
- For destructive MCP tools, guardrails live in the **tool description** that Claude reads (telling it to confirm) rather than blocking at the tool level. Reason: the source of truth for confirmation should be Claude's reasoning, not the tool. A hard block would also block legit batch workflows where the user has already confirmed.
- CLI `open` command takes a literal path, not a project name. No "recent projects" feature exists in freeXan today; faking one would mean scanning targetDir, which is out of scope for the prototype.

**What's NOT done (deliberate scope):**
- Live smoke test against a running freeXan instance — Swastik should restart the app first (so it picks up the new `require('./httpApi')` + `startHttpApi` call) and then test the CLI manually.
- Database **write** commands (add client / funnel / task). The GUI handles those fine and adding them widens the surface area unnecessarily for a v0.1.
- Recent-projects open by name.
- A way to query funnel/task lists from the CLI without an obscure SQL trick. Add `freexan funnels` / `freexan tasks` if needed in v0.2.
- "Dry run" mode for MCP tools. The guardrail today is the tool description telling Claude to confirm; if that proves insufficient, add a `dryRun: boolean` arg later.

**Verification path (manual — Swastik should do this):**
1. Restart freeXan (so it loads `httpApi.js` and starts the HTTP door). Check the dev console / logs for `[HTTP API] freeXan API door listening on http://127.0.0.1:4555`.
2. `cd "C:\Swastik Development\FreeXan Development\cli" && npm link` — one-time install.
3. From any new terminal: `freexan status` → should show app running, Premiere connection state, active project.
4. `freexan clients` → should list saved clients.
5. `freexan templates` → should list folder templates with ★ on Default.
6. `freexan new "Test Project" --client <name> --funnel <name>` — should create folders + open Premiere.
7. With a Premiere project active: `freexan import <some-file.mp4>` → should land in the appropriate Footage/Audio/Assets folder + Premiere bin.
8. MCP wiring: add the snippet from `mcp/README.md` to Claude Code's MCP config, restart Claude Code, then ask Claude "Is freeXan connected to Premiere?" — should call `freexan_status` and report back.

**Blockers:**
- None during build. Live verification deferred to Swastik (needs running app + Premiere + a Claude Code session).

**Notes:**
- `ipcMain._invokeHandlers` is private API. If Electron ever changes this, the fix is a 30-minute refactor: extract `createProject` and `importDroppedFiles` handler bodies into named functions and call them directly.
- Today the HTTP door has no authentication. Loopback-only is the only gate. Anything running as the same Windows user can call it. Acceptable for v0.1.
- Port 4555 is hardcoded in three places: `httpApi.js`, `cli/freexan.js`, `mcp/server.js`. If it ever changes, update all three (or thread it via a shared config file — defer until needed).

**Next:**
- Smoke test with Swastik on his machine.
- If CLI proves useful, add `funnels` and `tasks` list commands in v3.5.1.
- Consider a `freexan dev` command that streams freeXan's debug.log to the terminal (useful for diagnosing CEP/Premiere issues).
- Consider re-signing the MCP server with a proper bundle id if we ever ship it as a standalone npm package.

---

**By:** Antigravity (AI assistant)
**Version:** v3.4.2 → v3.4.3
**Status:** Done

**Problem:** The MOGRT "Replace" workflow was completely failing to inject saved style colors into newly placed MOGRTs. The `ReplaceDebugLog.txt` showed `ERROR applying Fill Color: Illegal Parameter type`, and even when colors appeared to inject, Pure Red (`FF0000`) was inexplicably becoming Magenta (`FF00FF`).

**Root Causes & Fixes:**
1. **Data Integrity mismatch between Save Style and Sync Button**
   - *Bug*: `getMogrtDumpForActiveClip` (which triggers when a user hits "Save Style") was dumping color values divided by 255 (e.g., 0.0-1.0 scale) and storing them in the database as `[Red, Green, Blue, Alpha]`. However, the Premiere `setColorValue` API and the native `syncPhraseWithMaster` function both strictly expect colors in the `0-255` scale, formatted as `[Alpha, Red, Green, Blue]`.
   - *Fix*: Modified `getMogrtDumpForActiveClip` in `sync.jsx` to retain the native `0-255` scale and strictly pack arrays as `[A, R, G, B]`. The database now stores styles in the exact same format `syncPhraseWithMaster` natively uses.
2. **ExtendScript JSON Array `instanceof` bug**
   - *Bug*: The React frontend pulls the style data from the DB and sends it to ExtendScript via `evalScript` as a JSON string. When parsed with `JSON.parse` in ExtendScript, older JS engines often yield arrays that fail `val instanceof Array`. As a result, the array check in `_applyMogrtPropValue` evaluated to false, skipped the `setColorValue` branch, and passed the color array into the fallback `prop.setValue()`, triggering the "Illegal Parameter type" error in Premiere.
   - *Fix*: Replaced `val instanceof Array` with the universally safe `Object.prototype.toString.call(val) === '[object Array]'` across `_applyMogrtPropValue`.
3. **Blue channel Logical OR bug (`0 || 255`)**
   - *Bug*: In `_applyMogrtPropValue`, the fourth array argument (Blue channel) was destructured using a fallback: `Number(val[3] || 255)`. Because JavaScript treats `0` as falsy, any color with a Blue value of `0` (such as Red `[255, 255, 0, 0]`) hit the fallback and was artificially maxed out to `255`, generating `[255, 255, 0, 255]` (Magenta).
   - *Fix*: Replaced the `||` fallback with an explicit `val[3] !== undefined` check, safely preserving true `0` blue channel values.

**Files changed:** `CEPs/freeXan_Caption/panel/jsx/core/sync.jsx`

---

## Session Log

### 2026-06-18 | Session 084 — Halo Picker Replaces Focus-Dependent Hold-Key (v3.3.1 → v3.4.0)

**By:** Claude (AI assistant)
**Version:** v3.3.1 → v3.4.0
**Status:** Done

**Why this session existed:** v3.3.0/v3.3.1 introduced "hold a number key while dropping to route the file". Testing on Windows revealed an architectural problem — keyboard focus stays on the source app (File Explorer) for the whole drag gesture, so the overlay's `keydown` listeners never fire. Confirmed by `[OVERLAY] drop fired — currentHeldKey: (none)` in debug.log even when the user verifiably held "1". The gesture had to be reworked.

**Solution chosen by Swastik:** Path B with refinements.
> "Drop while holding Ctrl → 8 small circles appear around the overlay pill (1–8). User can press number key or click bubble to route. Double-tap Ctrl cancels. Shift modifier initiates OS-level move. Can combine. 6-second unhovered timeout. Hover reveals the linked folder."

**Why this works where hold-key didn't:**
- `DragEvent.ctrlKey`/`shiftKey` ARE in the drop event regardless of which window has focus. Preload now forwards `{ ctrlKey, shiftKey, altKey }` to the overlay's `onFilesDropped` callback.
- After the drop, the overlay window has keyboard focus, so number-key picks and Esc / Ctrl detection work natively.

**Architecture:**
1. **Drop trigger** — preload modified to pass `modKeys` to the drop callback. Overlay's drop handler branches on `modKeys.ctrlKey`: if set, open halo picker; otherwise, proceed to slot mapping (honoring `modKeys.shiftKey` as the move modifier).
2. **Halo build** — `buildHaloBubbles()` creates 8 bubbles at `angle = (n-1) × 45°` from 12 o'clock, positioned via CSS custom properties (`--bx`, `--by`) at radius 70 px. Each assigned position becomes a clickable bubble showing the digit; empty positions render as dashed-outline placeholders so the spatial grid stays legible.
3. **Window resize** — extended `resize-overlay` IPC to accept `'halo'` mode (220×220). When transitioning to/from halo, `win.setBounds` is called with computed `(x, y)` so the pill's screen centre is preserved across the resize (otherwise the pill would visually jump from the window's top-left to its centre or vice versa).
4. **Body class** — `body.halo-mode` switches the container layout from `flex-start` to `center center`, hiding the text panel and constraining the pill to its 56×56 form.
5. **Dismissal** — Esc, double-tap Ctrl (two key-ups within 400 ms), and 6-second unhovered timeout. Hover on any bubble clears the timer; mouseleave restarts it. Click-outside does NOT cancel (explicit user choice — prevents accidental cancels while moving the mouse to a bubble).
6. **OS-level move** — new `moveFsItem(src, dest, isDirectory)` helper in main.js. Tries `fs.renameSync` first (atomic on same drive); on `EXDEV` falls back to `fs.cpSync`+`fs.rmSync` (recursive) for directories or `fs.copyFileSync`+`fs.unlinkSync` for files. Source-delete failure after a cross-drive copy is logged but doesn't fail the operation — no data loss, file ends up in both places.
7. **`importDroppedFiles` opts** — `{ routeToFolder, moveSource }`. The halo route path applies the move flag to the staging copy/move; the slot-mapping path applies it inside the per-file branch (directory vs single file).

**Templates picker** — downsized from 1–9 to 1–8 (2×4 grid). 9 & 0 reserved for future special-case use. The picker JS keyboard handler likewise limits to 1–8.

**What was deleted:** the v3.3.x `currentHeldKey` keydown/keyup tracking and the `resolveHeldKey()`/setDragActive-with-key branches. They were dead code on Windows.

**Files changed:** `db.js` (no change — column still works), `main.js` (resize-overlay extended, moveFsItem helper, import-dropped-files updated for routeToFolder+moveSource and slot-path moveSource), `preload.js` (drop callback signature widened with modKeys), `renderer/overlay.html` (halo, halo-label, halo-mode-tag DOM nodes added), `renderer/overlay.css` (halo-mode body class, bubble styles + animations, label + mode-tag styles), `renderer/overlay.js` (drop handler rewritten, halo picker functions added, dead currentHeldKey code removed), `renderer/folder-templates.js` (picker grid 1–8), `renderer/styles.css` (popover width 138 → 178 px, grid 3 → 4 cols), `docs/logs/CHANGELOG.md`, `docs/logs/DEV_LOG.md`

**Verification path (manual):**
1. Create a project from a template with a linked folder assigned to shortcut `1`.
2. Drag a file from File Explorer onto the overlay pill while holding **Ctrl**. Halo of 8 bubbles should appear around the pill, bubble `1` visually distinct (purple, with shadow), the other 7 dim hollow placeholders.
3. Hover bubble `1` → folder name label appears below the pill. Unhover → label disappears, 6-second timer starts.
4. Press `1` on the keyboard → halo closes, file copies to the linked folder, linkWatcher imports it into the matching Premiere bin within ~1 sec.
5. Repeat the drop holding **Ctrl + Shift** → `MOVE` chip shows above the pill, picker behaves identically, but the file is removed from the source folder after the operation (atomic on same drive, copy+delete on cross-drive).
6. Drop, then tap Ctrl twice quickly → picker cancels, falls back to slot mapping.

---

### 2026-06-17 | Session 083 — Hold-Key-to-Route on Overlay Pill (v3.2.1 → v3.3.0)

**By:** Claude (AI assistant)
**Version:** v3.2.1 → v3.3.0
**Status:** Done

**Request (Swastik):** "If user enables link, he can assign a key shortcut for that folder. Whenever user drags a file and holds that specific key while dropping, the dropped file will be copied to that folder instead of slot mapping."

**Decisions confirmed before coding:**
- Drop target: **overlay pill only** (not main window, not Audio CEP panel)
- Key type: **number keys 1–9** (more slots than modifier keys, no conflicts with Windows shell or Premiere)
- No key held: **current slot-mapping behavior preserved**
- Held key with no match: **fall back to slot mapping AND show a toast** so the user knows the gesture didn't route

**Architecture:**
1. **DB**: new nullable `link_shortcut TEXT` column on `folder_template_nodes`. Only persisted when `link_enabled = 1`. setNodes + clone updated.
2. **Template builder UI**: when 🔗 is on, a `<select>` (— / 1..9) appears next to it. Other folders' shortcuts show as `N (used)` and are disabled in the dropdown so duplicates are impossible.
3. **Sidecar**: `_freexan_links.json` entries now optionally include `shortcut`. linkWatcher ignores the field (doesn't need it).
4. **IPC push**: `refreshLinkedFolders` in `main.js` calls a new `pushLinkMapToOverlay(links)` that `webContents.send`s `overlay-link-map`. Overlay caches the array as a module-level `linkMap`. Empty array sent when no sidecar / no project.
5. **Overlay key tracking**: window-level `keydown`/`keyup` on `1`..`9`. `currentHeldKey` updated. `window.blur` clears it so focus-loss mid-drag doesn't strand the flag. While `isDragInProgress` is true and a key is held, `setDragActive()` re-renders to show "→ <folder>" or "Key N unbound" depending on lookup.
6. **Drop handler**: at drop time, if `currentHeldKey` resolves to a link, `routeToFolder` is passed in `importDroppedFiles(files, { routeToFolder })`. If unmatched, a slim `overlay-toast` appears and the call proceeds with no opts (normal slot mapping).
7. **`import-dropped-files` override**: when `opts.routeToFolder` is set, the IPC handler short-circuits — copies files straight to the linked folder with duplicate-resistant naming, returns `{ success: true, imported: false }`. **It does NOT send a WS `import` message** — the existing `linkWatcher` will catch the new files via `fs.watch` and dispatch the import itself. Single source of truth, no double-imports.

**Re-uses existing infrastructure:**
- `linkWatcher.js` — already watches linked folders and dispatches import messages
- `overlay-update` IPC pattern — new `overlay-link-map` channel mirrors it
- Toast / drag-active CSS — overlay already supports state-driven labels

**Key flow recap:**
```
Drag file over pill + hold "1"
  → pill expands, label switches to "→ RAW"
  → drop fires; overlay sends routeToFolder = C:\…\Acme\RAW
  → main.js copies file to that folder (skipping slot routing)
  → linkWatcher's fs.watch fires
  → import dispatched to Premiere RAW bin
```

**Files changed:** `db.js`, `main.js`, `preload.js`, `renderer/overlay.js`, `renderer/overlay.css`, `renderer/folder-templates.js`, `renderer/styles.css`, `docs/logs/CHANGELOG.md`, `docs/logs/DEV_LOG.md`

---

### 2026-06-17 | Session 082 — Linked Folder ↔ Premiere Bin Auto-Import (v3.1.6 → v3.2.0)

**By:** Claude (AI assistant)
**Version:** v3.1.6 → v3.2.0
**Status:** Done

**Request (Swastik):** "We have to add a feature in freeXan: if the project folder and Premiere bin have the same name in a template, the user has an option to enable/disable a link between the folder and bin. When enabled freeXan Link automatically imports the files which are pasted in that folder. Our software will watch the specific folders like RAW and import all the files to Premiere bin named RAW as soon as user pastes any data in RAW folder." Lifecycle decision: **active-project-only** — whenever the user opens another project, freeXan detects, diffs linked folders vs. linked bins, imports any missing files. Format scope: **supported-format whitelist only for now** — future update will route unsupported formats through FFmpeg for conversion.

**Architecture:**
1. **DB**: new `link_enabled INTEGER NOT NULL DEFAULT 0` column on `folder_template_nodes`. Migration wrapped in the existing try-catch block. `setNodes()` and `clone()` updated to read/write the flag.
2. **`linkWatcher.js`** (new file at project root): `start(links, ctx)` / `stop()` / `handleBinFiles(requestId, files)`. Uses native `fs.watch({ recursive: false })` (matches `audioWatcher.js` style — chokidar not needed). For each link: requests current bin contents from CEP (`get_bin_files`), diffs against folder via case-insensitive basename comparison, dispatches `import` WS messages for the difference, then attaches a watcher with a 350 ms per-filename debounce and a `seen` set to prevent re-imports during chokidar-style storms. Bin-file request has a 5 s timeout that falls back to "assume empty bin" so a stale CEP never blocks the watcher.
3. **`_freexan_links.json` sidecar** written next to `_freexan_slot_map.json` on project creation. Contains `[{ folderPath, binName }, ...]` — only for linked folders that have an actual matching bin in `allBins`. Computed by rebuilding disk paths the same way `buildFolderTree` does, then intersecting with the bin set.
4. **Lifecycle hook** in `main.js`: on `active_project` WS message, walks up from the .prproj path (max 3 levels) to find the sidecar, tears down old watchers via `linkWatcher.stop()`, starts new ones. Works even for projects opened directly in Premiere if the sidecar exists in their root.
5. **CEP `get_bin_files` handler** in `ext.js`. ExtendScript IIFE: recursive `findBin(parent, name)` (matches existing pattern from the `import` handler), collects top-level non-bin child names, returns JSON-serialized payload. Result parsed in the JS callback and forwarded as `{ type: 'bin_files', requestId, files }`. Main routes it back via `linkWatcher.handleBinFiles`.
6. **UI**: link toggle button in `renderFtsNode`, only rendered when the folder's name matches a bin name in `ftsPremiere` (case-insensitive). View-mode users see status but cannot click. Tab switch back to Folder triggers `renderFtsTree()` so toggles refresh after the user added/renamed bins on the Premiere tab.

**Format whitelist (Premiere-native):**
- Video: mp4, mov, avi, mkv, mxf, m4v, m2v, m2t, mts, ts, wmv, webm, mpg, mpeg
- Audio: wav, mp3, aac, m4a, aiff, aif, flac, ogg
- Image: png, jpg, jpeg, tiff, tif, psd, ai, gif, bmp, exr, dpx, tga
- RAW / cinema: r3d, braw, arri, ari
- Captions: srt

Anything else is silently skipped. Future entry will hand unsupported extensions to FFmpeg for transcode-then-import.

**Files changed:** `db.js`, `linkWatcher.js` (new), `main.js`, `cep-extension/ext.js`, `renderer/folder-templates.js`, `renderer/styles.css`, `docs/logs/CHANGELOG.md`, `docs/logs/DEV_LOG.md`

**Verification path (manual):** open the template builder → add a Premiere bin "RAW" → confirm the 🔗 toggle appears on a "RAW" folder in the folder tree → enable it → save template → create a project from that template → drop a `.mp4` into the project's RAW folder → watch it appear in Premiere's RAW bin automatically.

---

### 2026-06-15 | Session 081 — Propagate freeXan Caption rebrand into bundled plugin + freeXan installer (v3.1.5 → v3.1.6)

**By:** Claude (AI assistant)
**Version:** v3.1.5 → v3.1.6
**Status:** Done

**Request (Swastik):** "We have rebranded the SubMachine — correct everything again."

**Context — what the previous session did and what was left:** Session 080 rebranded the dev master copy at `CEPs/SubMachine/` from "SubMachine" (aescripts) to "freeXan Caption" (BloomX), with `ExtensionBundleId` `com.aescripts.submachine` → `com.bloomx.freexan.caption`. That session deliberately stopped at the CEPs/ master and flagged three follow-ups for the freeXan-installer side (`main.js`, `build/installer.nsh`, `plugins/SubMachine/`). This session closes those three.

**Diff hunt — install-path-bearing files in `plugins/SubMachine/` vs `CEPs/SubMachine/`:**
| File | Status before this session |
|---|---|
| `CSXS/manifest.xml` | Old bundle id `com.aescripts.submachine` in plugins/; new id in CEPs/ |
| `panel/jsx/core/debug_bridge.jsx` | Old log path in plugins/; new path in CEPs/ |
| `panel/jsx/core/utils.jsx` | Old log path + `setExtensionPersistent("com.swastik.submachine", 1)` in plugins/; new id + `com.bloomx.freexan.caption.persistent` in CEPs/ |

All three synced this session. Other files containing `com.aescripts.submachine` strings — `panel/js/panel.js`, `panel/js/panel_clean.js`, `dialog/js/dialog.js` — were verified to carry the same strings in the post-rebrand CEPs/ master (they're aescripts-source-internal license-event prefixes, not install paths) and left alone.

**`main.js` migration support — new `LEGACY_BUNDLE_IDS` constant:**
```
const LEGACY_BUNDLE_IDS = {
  SubMachine: ['com.aescripts.submachine']
};
```
Threaded into `installCEPExtension()` so that on every freeXan launch, any folder named `com.aescripts.submachine` in `%APPDATA%\Adobe\CEP\extensions\` is deleted before the new `com.bloomx.freexan.caption` install. This handles migration silently for users coming from v3.1.4 or from the original `Install_SubMachine.bat`.

**`build/installer.nsh`:**
- Plugin checkbox label "SubMachine — MOGRT timeline executor" → "freeXan Caption — MOGRT timeline executor".
- `customUnInstall` extended: now removes `com.bloomx.freexan.caption` (the new install path) in addition to the v3.1.4-era `com.aescripts.submachine`. Combined with the v3.1.4 folder-name cleanup, an uninstall from any version of freeXan leaves nothing behind in `%APPDATA%\Adobe\CEP\extensions\`.

**`plugins/README.md`:** Table row for `SubMachine/` updated to show `com.bloomx.freexan.caption` and a note that it's the freeXan Caption rebrand.

**Why `plugins/SubMachine/` was NOT renamed:** the folder name is the key in `plugins-enabled.json`, the value used by the installer's checkbox state, and the argument users pass to `npm start SubMachine` to skip the plugin for a launch. Renaming it would break those three contracts and force a migration of every user's `plugins-enabled.json`. The folder name is internal — Premiere reads the install folder, which is now the bundle id. The rebrand stays manifest-level.

**Outstanding from session 080's follow-up list (not done this session, intentional):**
- Re-sign bundle with a BloomX ZXPSignCmd certificate (requires generating + securely storing a cert).
- Work through `CEPs/SubMachine/IMAGE_REPLACEMENT_LIST.md` (binary artwork replacement; Swastik owns this).

**Files changed:** `main.js`, `build/installer.nsh`, `plugins/README.md`, `plugins/SubMachine/CSXS/manifest.xml`, `plugins/SubMachine/panel/jsx/core/debug_bridge.jsx`, `plugins/SubMachine/panel/jsx/core/utils.jsx`

---

### 2026-06-15 | Session 080 — Rebrand `CEPs/SubMachine/` to freeXan Caption by BloomX (v3.1.4 → v3.1.5)

**By:** Claude (AI assistant)
**Version:** v3.1.4 → v3.1.5
**Status:** Done — shipped code clean; image binaries + downstream installer plumbing flagged as follow-up.

**Request (Swastik):** "in CEPs Folder there is My Plugin Submachine - I want to rebrand that entirelly to match freeXan Enviroment and rebrand it to FreeXan Caption, do complete rebranding."

**Scope confirmed before starting (Swastik):**
- Keep brand spelling **freeXan Caption** (lowercase `f`, capital `X`) — matches the `freeXan` rule in `CLAUDE.md`.
- Remove `META-INF/signatures.xml`.
- Make a list of every image that needs replacing — user will handle binaries.
- Keep `.mogrt` sample names as-is.
- Skip the SubMachine plugin's internal `docs/`, `old_files/`, `scratch/`, etc.
- Update the main freeXan project's logs (CHANGELOG / DEV_LOG / NAVIGATION_LOG) at the end.
- Change extension IDs.

**What changed (see CHANGELOG v3.1.5 for the line-by-line list):**

- **Identity:** `ExtensionBundleId` `com.aescripts.submachine` → `com.bloomx.freexan.caption`; panel/about Extension Ids match; menu label "freeXan Caption"; version reset to 1.0.0; `.debug` updated.
- **Installers:** Renamed `Install_SubMachine.bat` → `Install_freeXan_Caption.bat`; `install_mac.command` rewritten; both now target `com.bloomx.freexan.caption`.
- **Visible UI:** `custom/header.html` rebuilt as a CSS+SVG freeXan brand bar (no more embedded aescripts PNG). `custom/about.html` + `custom/help.html` rebranded text + freeXan dark theme. `panel/panel.html` (156 KB) text rebranded with image paths preserved. `dialog/dialog.css` accents swapped to `#997DFF`.
- **Internal namespaces:** CSXS event ids, XMP namespace URI, mode-string literal `"submachine"` → `"freexan"`, localStorage keys, JSX log file path, persistent-extension key — all rebranded with consistent ids across the JS ↔ JSX boundary so dispatch/listener pairs still match.
- **Licensing lib (`dialog/js/dialog.js`, 1.9 MB minified):** Hand-patched 60+ references inside the minified bundle (event ids, URLs, user-data folder, analytics filename, settings key).
- **Deletions:** `META-INF/signatures.xml` (and empty parent folder). Stale `panel/logs/data_transfer.log` + `data_transfer_old.log` (April 2024 dev artefacts that the installer was shipping).
- **New artefact:** `CEPs/SubMachine/IMAGE_REPLACEMENT_LIST.md` — 70+ image files cataloged by priority. HTML still references the old filenames so the panel renders during transition.

**Verification:** Grep across all shipped files (excluding skipped dirs + image-path strings) returns zero `SubMachine` / `submachine` / `aescripts` hits.

**Decisions worth re-reading later:**
- **Folder name kept** — `CEPs/SubMachine/` was not renamed. Folder rename ripples into `electron-builder.yml`, `package.json` extraResources, `main.js` `installCEPExtension()`, and `build/installer.nsh`. The user-facing bundle id (`com.bloomx.freexan.caption`) is what determines the install path, so the source folder name is internal-only.
- **Image filenames kept** — All `panel/images/SubMachine *.png` files keep their on-disk names. HTML references them by old name. When Swastik replaces the artwork in-place, refs keep resolving with zero code change. If a future rename is desired, both files and HTML refs must move together.
- **XMP namespace changed** — `http://ns.adobe.com/submachine/1.0/` → `http://ns.bloomxsolutions.com/freexan-caption/1.0/`. This **does** break compatibility with any pre-rebrand MOGRT clips already on a user's timeline (the new code won't recognise the old namespace). Acceptable for a forked/rebranded product launching as a fresh install. Worth flagging if migrating an existing user base.
- **External support URLs** — aescripts.com URLs replaced with bloomxsolutions.com placeholders. Real BloomX privacy/support pages don't exist yet; the support button in the about dialog now opens `mailto:contentai@bloomxsolutions.com` as a working interim path.

**Follow-up tasks (also captured in CHANGELOG v3.1.5):**
1. Sync the rebranded `CEPs/SubMachine/` into the bundled `plugins/SubMachine/` so the freeXan installer ships the new caption build. Consider renaming `plugins/SubMachine/` → `plugins/freeXan_Caption/`.
2. Add `com.bloomx.freexan.caption` to the uninstall cleanup list in `build/installer.nsh`.
3. Audit `main.js` for any hard-coded `com.aescripts.submachine` string literals (the dynamic `getBundleIdFromManifest` parser auto-picks-up the new id, but literals don't).
4. Generate a BloomX ZXPSignCmd certificate and re-sign before public distribution.
5. Replace the imagery enumerated in `CEPs/SubMachine/IMAGE_REPLACEMENT_LIST.md`.

---

### 2026-06-15 | Session 079 — Standardise CEP install path on ExtensionBundleId (v3.1.3 → v3.1.4)

**By:** Claude (AI assistant)
**Version:** v3.1.3 → v3.1.4
**Status:** Done

**Reported issue (Swastik):** "Multiple instances of the same plugin installed in extension folder with different folder names, i.e. `Submachine`, `com.aescripts.submachine`. Keep the installation directory universal for every installation process, either by .bat, npm start, or by .exe etc."

**Root cause:** Two competing folder-naming conventions were in play.
- The standalone `.bat` installers in `CEPs/*/` use the manifest `ExtensionBundleId` as the destination folder (`com.aescripts.submachine`, `com.bloomx.misterbloomx`, `com.bloomx.freexan.audio`, `com.bloomx.freexan.link`).
- `main.js → installCEPExtension()` (run on every `npm start` / packaged .exe launch) used the *source folder name* under `plugins/` instead (`SubMachine`, `MisterBloomX`, `Audio_freeXan`, `Link_freeXan`).

Result: any user who ever ran one of the .bat scripts ended up with two folders in `%APPDATA%\Adobe\CEP\extensions\` containing the same panel. Premiere would load both, the legacy one would grab the WebSocket port on 4554 first, and the newer panel could appear blank. Confirmed on Swastik's machine — listed both `SubMachine` and `com.aescripts.submachine`, plus `MisterBloomX` and `com.bloomx.misterbloomx`.

**Decision:** Adopt the bundle-id convention everywhere. The .bat installers are correct (Adobe's own convention) and there are more of them, so converging on bundle id minimises churn. Source folder names under `plugins/*` keep their friendly names (`SubMachine`, `MisterBloomX` etc.) — only the *destination* folder under `%APPDATA%\Adobe\CEP\extensions\` is now derived from the manifest.

**Changes:**
1. `main.js` — added `getBundleIdFromManifest(manifestPath)` (regex parse of `ExtensionBundleId="…"` from `CSXS/manifest.xml`). Rewrote `installCEPExtension()` so each plugin is installed to `%APPDATA%\Adobe\CEP\extensions\<bundleId>\`. Added an in-place cleanup pass: before each install, if a folder named after the source folder (`SubMachine`, etc.) still exists from a pre-v3.1.4 freeXan run, it's deleted so the user doesn't keep a duplicate.
2. `build/installer.nsh → customUnInstall` — uninstaller now removes both the new bundle-id folders *and* the legacy folder-name copies, so a clean uninstall from any version leaves nothing behind.

**Bundle id ⇄ source folder map (canonical):**
| `plugins/<folder>` | `ExtensionBundleId` |
|---|---|
| `Link_freeXan` | `com.bloomx.freexan.link` |
| `Audio_freeXan` | `com.bloomx.freexan.audio` |
| `MisterBloomX` | `com.bloomx.misterbloomx` |
| `SubMachine` | `com.aescripts.submachine` |

**What happens on the next `npm start` (or any freeXan launch) post-update:**
- Each plugin under `plugins/` is read; its manifest's `ExtensionBundleId` is extracted.
- The `%APPDATA%\Adobe\CEP\extensions\<sourceFolderName>\` duplicate (e.g. `SubMachine`, `MisterBloomX`) is deleted if present.
- The plugin is freshly installed at `%APPDATA%\Adobe\CEP\extensions\<bundleId>\`.
- From then on, the .bat installer, `npm start`, and the .exe installer all write to the same path — no more duplicates.

**No effect on:** WebSocket port (still 4554), CEP discovery (Premiere finds plugins by manifest, not folder name), `plugins-enabled.json` keys (still source folder names — that's the user-facing identity), CLI skip syntax (`npm start SubMachine` still works).

**Files changed:** `main.js`, `build/installer.nsh`

---

### 2026-06-15 | Session 078 — Sync SubMachine bundle to match latest MisterBloomX contract (v3.1.2 → v3.1.3)

**By:** Claude (AI assistant)
**Version:** v3.1.2 → v3.1.3
**Status:** Done

**Task:** Verify the bundled SubMachine plugin still works with the latest MisterBloomX panel (synced last session) and the latest freeXan v3.1.2 WebSocket contract. Fix any incompatibility found.

**Finding:** The latest MisterBloomX (`CEPs/MISTER_BloomX/dist/index.html` — also in `plugins/`) was refactored away from the WebSocket-relayed apply flow. Old flow: MisterBloomX → WS `select_mogrt` → freeXan copies + broadcasts `mogrt_ready` → SubMachine listens. New flow: MisterBloomX → CSEvent `com.freexan.submachine.executeAction` (Adobe inter-extension messaging within the same host) → SubMachine listens directly. This is faster and removes one network hop.

Latest `CEPs/SubMachine/panel/js/workflow.js` implements the new CSEvent listener (and keeps the legacy `mogrt_ready` WS handler for back-compat). Latest `command_center_react.js` adds the matching React-side `window.addEventListener('submachine:replace_selected', ...)` and the reverse-direction `variationSaved` CSEvent so MisterBloomX can refresh its variations pane after SubMachine saves a style. Latest `mogrt.jsx` updates the ExtendScript core for the new actions.

The bundled `plugins/SubMachine/` was on the old code. Diffs were exactly the three files above:
- `panel/js/workflow.js`: 21,345 → 22,711 bytes (+28 lines = CSEvent listener block)
- `panel/js/command_center_react.js`: 81,275 → 84,500 bytes (+3.2 KB = React handler + reverse CSEvent)
- `panel/jsx/core/mogrt.jsx`: 61,004 → 62,309 bytes (+1.3 KB = ExtendScript updates)

**Action:** Synced the three files from `CEPs/SubMachine/` → `plugins/SubMachine/` verbatim. No other files differed. No changes to `main.js`, `preload.js`, or any renderer code — freeXan's WebSocket contract is unchanged; only the MisterBloomX↔SubMachine path moved off the WS bus.

**Compatibility matrix after sync** — bundled SubMachine works with both the new MisterBloomX (CSEvent path) and any older MisterBloomX that's still using `select_mogrt` (legacy WS path retained).

**Files changed:** `plugins/SubMachine/panel/js/workflow.js`, `plugins/SubMachine/panel/js/command_center_react.js`, `plugins/SubMachine/panel/jsx/core/mogrt.jsx`

---

### 2026-06-15 | Session 077 — Settings tab MOGRT watcher + sync CEPs MisterBloomX panel (v3.1.1 → v3.1.2)

**By:** Claude (AI assistant)
**Version:** v3.1.1 → v3.1.2
**Status:** Done

**Task:** Add a "Watched MOGRT Library Folders" section to the Settings tab, identical in look/behaviour to the existing audio watcher, so MOGRT folders can be added from inside freeXan instead of only from inside the MisterBloomX CEP panel. Also sync the latest version of the MisterBloomX panel that lives in `CEPs/MISTER_BloomX/dist/index.html` into the bundled copy at `plugins/MisterBloomX/dist/index.html`.

**Backend was already in place:** the v3.0.6 MOGRT system added `mogrtDb.js`, `mogrtWatcher.js`, and IPC handlers `mogrt-get-watched-folders` / `mogrt-add-folder` / `mogrt-delete-folder` / `mogrt-select-folder` in `main.js`. They were used by the CEP panel over WebSocket, but never exposed to the freeXan renderer. So this session is pure wiring + UI — no new DB/watcher code.

**Wiring chain:**
1. `preload.js` — added four members to `window.api.db`: `getMogrtFolders`, `addMogrtFolder`, `deleteMogrtFolder`, `selectMogrtFolder`. Each is a thin `ipcRenderer.invoke('mogrt-…')` proxy.
2. `renderer/index.html` — duplicated the Audio watcher `<div class="settings-group">` immediately below it. New IDs: `#setting-new-mogrt-dir`, `#btn-browse-mogrt-dir`, `#mogrt-folders-list`. Copy is "Watched MOGRT Library Folders" / "Folders monitored by MisterBloomX for new, deleted, or updated MOGRT files."
3. `renderer/settings.js` — added `refreshMogrtFoldersList()` (mirror of `refreshWatchedFoldersList`, swapping the API calls and remove-prompt wording). `bindSettingsEvents()` now also binds the new button and triggers an initial refresh.

**MisterBloomX panel sync:** `CEPs/MISTER_BloomX/dist/index.html` was newer (Jun 13 19:44) than `plugins/MisterBloomX/dist/index.html` (Jun 13 17:40), and noticeably smaller (15.4 KB vs 19.3 KB) — confirming a deliberate refactor on the CEPs side. Copied the CEPs version over the bundled one verbatim. No other CEPs/MISTER_BloomX files differed (only a `.bat` installer and a `Trash/` folder, both irrelevant for bundling).

**No plugin-level changes required:** the bundled MisterBloomX panel speaks to freeXan over WebSocket and re-fetches the watched-folder list whenever the panel reconnects. Adding a folder from freeXan's settings tab triggers the same `mogrtWatcher.watchDirectory(...)` path that adding from the panel does, and the existing `mogrt_library_changed` broadcast in `main.js` keeps the panel in sync.

**Files changed:** `preload.js`, `renderer/index.html`, `renderer/settings.js`, `plugins/MisterBloomX/dist/index.html` (synced from CEPs)

---

### 2026-06-13 | Session 076 — CLI plugin-skip override on `npm start` (v3.1.0 → v3.1.1)

**By:** Claude (AI assistant)
**Version:** v3.1.0 → v3.1.1
**Status:** Done

**Task:** Let the dev skip a specific plugin from being installed/refreshed on a given `npm start` — useful when one plugin is mid-edit / unstable and is breaking Premiere. Syntax: `npm start <PluginName>` (e.g. `npm start SubMachine`) skips that plugin for this launch only; everything else installs as normal.

**Behaviour:**
- Auto-update on every launch was already in place — `installCEPExtension()` wipes and recopies every enabled plugin into `%APPDATA%/Adobe/CEP/extensions/<name>/` on each app start. So edits inside `plugins/` propagate after a single restart of Premiere.
- New: `getCliSkipSet()` reads `process.argv.slice(2)`, drops flag-style args (anything starting with `-`), and matches the rest against folder names in `plugins/` (case-insensitive). Matched folders are forced to `false` in the enabled-map.
- The CLI override is *transient* — it does not modify `plugins-enabled.json`. Run `npm start` again with no args and the plugin comes back.

**Examples:**
- `npm start` — installs all plugins (Link_freeXan, Audio_freeXan, MisterBloomX, SubMachine).
- `npm start SubMachine` — installs all *except* SubMachine. SubMachine is also actively removed from the Adobe CEP folder, so a broken bundle doesn't keep loading.
- `npm start SubMachine MisterBloomX` — skips both.
- `npm start submachine` — same as above; case-insensitive.
- Packaged build: `"C:\Users\msi\AppData\Local\Programs\freeXan\freeXan.exe" SubMachine` — same effect post-install.

**Files changed:** `main.js` (added `getCliSkipSet()`, refactored `getEnabledPluginsMap()` to apply CLI overrides last)

---

### 2026-06-13 | Session 075 — Unified plugins/ folder + component-select installer (v3.0.6 → v3.1.0)

**By:** Claude (AI assistant)
**Version:** v3.0.6 → v3.1.0
**Status:** Done

**Task:** Bundle all four Premiere Pro CEP plugins (Link freeXan, Audio freeXan, MisterBloomX, SubMachine) into the freeXan installer with a component-selection page so the user can pick which plugins to install (all checked by default). Restructure the source repo so each plugin lives in its own self-contained folder for easy navigation.

**Why this matters:** Up to v3.0.6 there were three plugin sources, scattered:
- `cep-extension/` — Link panel and Audio panel sharing one CSXS bundle (`com.bloomx.freexan.link`, two `Extension Id`s in one manifest).
- `CEPs/MISTER_BloomX/` — installed manually.
- `CEPs/SubMachine/` — installed via a separate `Install_SubMachine.bat` script.

Users had to hunt down separate installers for the auxiliary plugins, and the source tree had no single "plugins" entry-point. The new layout fixes both.

**Decisions:**

1. **Split the combined `cep-extension/` bundle into two independent CEP bundles** — `Link_freeXan` (kept the protected `com.bloomx.freexan.link` bundle ID per RULEBOOK §163) and `Audio_freeXan` (new bundle ID `com.bloomx.freexan.audio`, panel ID `com.bloomx.freexan.audio.panel` preserved). Safe to split because `audio.js` and `ext.js` each open their own WebSocket to port 4554 — neither depends on the other. Splitting makes each panel individually selectable in the installer.

2. **SubMachine source pruned from 269MB to 20MB** — runtime needs only `CSXS/`, `META-INF/`, `custom/`, `dialog/`, `panel/`, `src/`, `mimetype` (mirrored from the official `Install_SubMachine.bat`). Excluded: `docs/` (179MB), `old_files/` (43MB), `scratch/`, `BUG/`, `.git/`, `node_modules/`, `.agent/`, `.claude/`, `SKILL/`, `Prompt/`.

3. **Plugin install moved fully into `main.js`** — the installer writes a small JSON manifest (`plugins-enabled.json`) recording the user's component selection. `installCEPExtension()` reads that manifest on every app launch and reconciles the Adobe CEP folder: enabled plugins are copied (and re-copied on every launch, picking up updates), disabled ones are deleted. Source folder location is auto-discovered via `process.resourcesPath/plugins/` in packaged builds, falling back to `__dirname/plugins/` in dev.

4. **Legacy cleanup extended** — `freexan-link` added to `legacyFolders` so existing v3.0.x users get the old combined bundle removed on first launch of v3.1.0, preventing the dual-panel-shadow bug that the legacy folder list was originally written to fix.

5. **`oneClick: true` → `oneClick: false`** — switching to wizard install was required to surface the Plugins page. Also enabled `allowToChangeInstallationDirectory: true` since the user is already going through a wizard.

6. **`cep-extension/` kept on disk for now** — superseded by `plugins/Link_freeXan/` + `plugins/Audio_freeXan/`, but not yet deleted, in case anything missed by the split needs to be recovered. Excluded from the installer bundle via the `!cep-extension/**` file rule. Slated for removal in v3.1.1 once v3.1.0 ships and is confirmed working.

**Files changed:**
- `plugins/Link_freeXan/` (new — split from `cep-extension/`)
- `plugins/Audio_freeXan/` (new — split from `cep-extension/`, new bundle ID `com.bloomx.freexan.audio`)
- `plugins/MisterBloomX/` (new — moved from `CEPs/MISTER_BloomX/`)
- `plugins/SubMachine/` (new — moved from `CEPs/SubMachine/`, runtime files only)
- `plugins/README.md` (new — plugin folder map + install rules)
- `main.js` (`installCEPExtension`, `getPluginsSourceRoot`, `getEnabledPluginsMap` rewritten)
- `electron-builder.yml` (wizard install, extraResources, file/asarUnpack rules)
- `build/installer.nsh` (custom Plugins page, `plugins-enabled.json` writer, expanded uninstall)
- `docs/logs/CHANGELOG.md`, `docs/logs/DEV_LOG.md`, `docs/logs/NAVIGATION_LOG.md`

**Next:**
- Build & test the installer (`npm run dist`) on a clean Windows machine to confirm the components page renders correctly, `plugins-enabled.json` is written, and only checked plugins appear in Premiere after a restart.
- Once confirmed working, delete the legacy `cep-extension/` and `CEPs/` source folders and bump to v3.1.1.

---

### 2026-06-10 | Session 074 — MOGRT library system + CEP integration (v3.0.5 → v3.0.6)

**By:** Claude (AI assistant)
**Version:** v3.0.5 → v3.0.6
**Status:** Done

**Task:** Wire MISTER BloomX (MOGRT browser) and SubMachine (timeline execution) into freeXan's data backbone. Architecture mirrors the existing audio library system.

**Flow:** User clicks Apply on a card in MISTER BloomX → MISTER BloomX sends `select_mogrt` to freeXan → freeXan copies `.mogrt` to `SM_Assets/` inside the active project folder, broadcasts `mogrt_ready` → SubMachine receives `mogrt_ready`, populates its MOGRT file input and fires a change event → SubMachine's existing apply logic runs.

**Watching:** MISTER BloomX sends `add_mogrt_folder` / `remove_mogrt_folder` via WS. `mogrtWatcher.js` uses `fs.watch recursive` (same as `audioWatcher.js`). Any `.mogrt` file added/removed in a watched folder triggers `mogrt_library_changed` broadcast → all connected panels re-request the library.

**MISTER BloomX UI:** Replaced the compiled React app (`dist/index.html`) with a custom standalone HTML panel — card grid, search, category filter, favorites toggle, tag editor (double-click), settings overlay for folder management. No build step required; directly editable.

**SubMachine:** Inserted `mogrt_ready` handler at the top of the `ws.onmessage` block in `workflow.js` so it runs before the `project_state` guard.

**Files changed:** `mogrtDb.js` (new), `mogrtWatcher.js` (new), `main.js`, `CEPs/MISTER_BloomX/dist/index.html`, `CEPs/SubMachine/panel/js/workflow.js`

---

### 2026-06-10 | Session 073 — Add get_project_state WebSocket handler (v3.0.4 → v3.0.5)

**By:** Claude (AI assistant)
**Version:** v3.0.4 → v3.0.5
**Status:** Done

**Task:** Add a `get_project_state` request/response message type to the WebSocket handler in `main.js` so that the SubMachine CEP panel can query the active Premiere project path on connect.

**Change:** Inserted a new `else if (data.type === 'get_project_state')` branch in the `ws.on('message', ...)` handler block (between `active_project` and `project_ready`). Responds immediately with `{ type: 'project_state', projectPath, connected }`. `projectPath` is `activeProjectPath || nativeProjectPath || null`. `connected` is `!!projectPath`.

**No new files, no new dependencies.** One block added to `main.js`.

**Files changed:** `main.js`

---

### 2026-06-09 | Session 072 — Fix card waveform flicker on scale (v3.0.3 → v3.0.4)

**By:** Claude (AI assistant)
**Version:** v3.0.3 → v3.0.4
**Status:** Done

**Problem:** Dragging the card scale slider caused all waveforms to flicker — they'd vanish and reappear repeatedly.

**Root cause:** `applyCardScale` debounced a call to `renderGrid()` at 180ms. While dragging, `clearTimeout` kept resetting the debounce so it only fired once after release — but that one `renderGrid()` call did `grid.innerHTML = ''` (full DOM wipe) then rebuilt everything, causing a visible blank flash.

**Fix:** Extracted the inline canvas drawing code from `initGridObserver` into two shared helpers: `getMiniPeaks(peaksStr, name)` (peaks parsing + hash fallback) and `drawMiniWaveformCanvas(canvas, peaks, type)` (the actual canvas draw path). Added `currentCardWaveH()` to read `--card-wave-h` from the grid at any time. New `redrawAllCardCanvases()` function iterates existing `.audio-card` elements, resizes their canvas in-place (no DOM removal), and redraws — no blank frame. Cards outside the viewport have no canvas (IntersectionObserver removed it); they are skipped and will be drawn at the new height when they scroll into view.

**Files changed:** `cep-extension/audio.js`

---

### 2026-06-09 | Session 071 — Card scale slider in header (v3.0.2 → v3.0.3)

**By:** Claude (AI assistant)
**Version:** v3.0.2 → v3.0.3
**Status:** Done

**What changed:**
1. **`audio.html`** — Wrapped existing `.sync-wrap` and new `.scale-wrap` in a `.header-right` flex group. `.scale-wrap` contains a ⊞ icon and `#slider-card-scale` range input.
2. **`audio-player.css`** — Added `.header-right`, `.scale-wrap`, `.scale-ico`, `#slider-card-scale` styles. Changed `.audio-grid` `grid-template-columns` to use `var(--card-min-w, 96px)` and `.card-waveform` height to use `var(--card-wave-h, 34px)`.
3. **`audio.js`** — Added `applyCardScale(v, rebuild)`: sets `--card-min-w` and `--card-wave-h` on `#audio-grid` (inherited by all child `.card-waveform` elements). Canvas rebuild debounced 180ms so the grid layout snaps instantly while canvases redraw after drag ends. Saved/loaded via `localStorage('audio_card_scale')`. Wired in `initUI()` after sync-toggle block.

**Design decision:** CSS vars set on `#audio-grid` (not `:root`) so the scale is scoped to the grid and doesn't leak to other elements. Default values in the CSS (`var(--card-min-w, 96px)`) ensure correct layout even if JS hasn't run yet.

**Files changed:** `cep-extension/audio.html`, `cep-extension/audio.js`, `cep-extension/audio-player.css`

---

### 2026-06-09 | Session 070 — audioWatcher ASAR path fix + rebuild v3.0.2

**By:** Claude (AI assistant)
**Version:** v3.0.1 → v3.0.2
**Status:** Done

**Problem:** After installing v3.0.1, card waveforms still showed fake sinusoidal bars and player waveform was blank.

**Root cause:** `audioWatcher.js` has a separate `require('@ffmpeg-installer/ffmpeg')` from `main.js`. The v3.0.1 fix only patched `main.js`. `audioWatcher.js` line 63 had `const ffmpegPath = ffmpegInstaller.path` — same ASAR path bug, different file. Card peaks are generated by `audioWatcher.generatePeaks()` (not by `main.js`'s `generate_peaks` handler). FFmpeg failed silently → `resolve('')` → empty peaks in DB → `audio.peaks` was `''` → card renderer hit its deliberate fallback (lines 698–707 in `audio.js`) that draws a deterministic-but-fake sinusoidal waveform from a hash of the filename.

**Fix:** Module-level `ffmpegExe` constant in `audioWatcher.js` with the same `.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)` correction. Removed local `const ffmpegPath` inside `generatePeaks` and used module-level `ffmpegExe` instead.

**Re-scan behaviour:** `watchDirectory` calls `scanDirectory` on every app startup, which calls `processAudioFile` → `upsert` for every file found. Files with previously empty DB peaks (no `.pek` file exists) will be re-processed automatically on first launch of v3.0.2 — no manual re-scan required.

**Files changed:** `audioWatcher.js`, `package.json`

---

### 2026-06-09 | Session 069 — FFmpeg ASAR path fix + rebuild v3.0.1

**By:** Claude (AI assistant)
**Version:** v3.0.0 → v3.0.1
**Status:** Done

**Problem:** Waveform was completely blank when the app was installed on any other system. Works on the dev machine only.

**Root cause:** `@ffmpeg-installer/ffmpeg` resolves `.path` relative to the module location at require time. In development this is the real filesystem. In a packaged build, the entire `node_modules` tree is bundled into `app.asar` (a virtual archive). The `asarUnpack` config in `electron-builder.yml` correctly extracts the FFmpeg binary to `app.asar.unpacked/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe` — but the module's `.path` property still returns the path into `app.asar`. Attempting to `spawn` or `exec` a binary path inside a `.asar` archive fails silently: no process launches, `stdout` gets 0 bytes, `peaks_ready` fires with an empty array, and the canvas draws nothing.

**Fix:** One-line path correction at startup — `ffmpegInstaller.path.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)` — stored as `ffmpegPath`. All three call sites (`generate_peaks` spawn, `process_audio` exec, `convertWithFfmpeg` exec) updated to use `ffmpegPath`. In development `app.asar` is never in the path so the replace is a no-op and behavior is unchanged.

**Files changed:** `main.js`

---

### 2026-06-09 | Session 068 — Production build v3.0.0

**By:** Claude (AI assistant)
**Version:** 2.6.0 → 3.0.0 (installer)
**Status:** Done

**What changed:**
- Bumped `package.json` version from `2.6.0` to `3.0.0`
- Ran `npm run dist` — electron-builder rebuilt `better-sqlite3` for x64, packaged, signed, and produced `dist\freeXan Setup 3.0.0.exe`

**Output:** `dist\freeXan Setup 3.0.0.exe` (Windows x64 · NSIS · signed · Electron 30.5.1)

**Files changed:** `package.json`

---

### 2026-06-09 | Session 067 — Dummy name in timeline + bin routing + stale cache (v2.9.14 → v2.9.15)

**By:** Claude (AI assistant)
**Version:** v2.9.14 → v2.9.15
**Status:** Done

**Problem:** After drag-dropping from the audio player to the Premiere timeline, three issues remained: (1) the timeline clip still showed the dummy filename even after the project item was renamed, (2) files were routing to the root Premiere bin instead of the SFX/BGM bin, (3) a prior broken render (from the `-to 0` FFmpeg bug, fixed in v2.9.14) left a 44-byte WAV stub on disk that was being served as a valid cached render.

**Root causes & fixes:**

1. **Timeline clip rename** (`cep-extension/audio.js`) — `doReplaceInPremiere` correctly called `target.name = newName`, which renames the project panel item. But Premiere does not auto-propagate that rename to timeline clips already placed. Added a second ExtendScript pass: iterate `app.project.sequences[si].audioTracks[ai].clips[ac]` and `videoTracks[vi].clips[vc]`, set `clip.name = newName` wherever `clip.name === dName`. This is the authoritative fix for "right name in project panel, dummy name on timeline."

2. **Stale empty-file cache** (`main.js`) — `process_audio` cache check was `fs.existsSync(outPath)`. A 44-byte WAV (header-only, no audio data) was left by the old `-to 0` bug and passed this check. Fixed: `fs.existsSync(outPath) && fs.statSync(outPath).size > 44`. Any cached output smaller than a valid header+data is now regenerated.

3. **Option C slot map missing bins** (`main.js`) — The first-drop Option C block wrote only `{ folder }` entries — `bin` was never set. `process_audio` routed to root Premiere bin because `slotMap[type].bin` was `null`. Fixed by deriving bin names from `fileTpl.bins_json`: iterate items checking `slotType`, `slotTypes`, and inferring from item name via `inferSlotType()`. Same derivation as normal project creation.

4. **`process_audio` didn't find Option C slot map** (`main.js`) — Handler scanned `path.dirname(resolvedProjectPath)` — the folder where the `.prproj` lives — for `_freexan_slot_map.json`. Option C writes the slot map to a separate dated folder under `appConfig.targetDir`. Added Option C detection block: if `slotMap` is still null and `appConfig.targetDir` is set, find the matching file-type template, reconstruct today's dated folder path (`{targetDir}\MonthYear\DD Month\folderName`), and load the slot map from there.

**Decision:** The `trimEnd > 0` sentinel remains the canonical check for "no trim set." If `trimEnd` is ever legitimately 0 (e.g. a file clipped to start), this would misfire — but all UI controls prevent setting trimEnd below ~0.1s, so this is safe.

**Files changed:** `cep-extension/audio.js`, `main.js`

---

### 2026-06-08 | Session 066 — Playhead fix + minimap playhead + scrub (v2.9.12 → v2.9.13)

**By:** Claude (AI assistant)
**Version:** v2.9.12 → v2.9.13
**Status:** Done

**Root cause:** `playheadUI` was declared as `null` at line 1100 of `audio.js` but never assigned. Every `animatePlayhead` call returned immediately. Additionally, `animatePlayhead` was never started when `playAudio()` was called — it was only recursive (no entry point).

**What changed:**
1. **Wire `playheadUI`** — `playheadUI = document.getElementById('waveform-playhead')` added at top of `initUI()`.
2. **Start RAF loop on play** — `requestAnimationFrame(animatePlayhead)` added to `doPlay` in `playAudio()`, after `isPlaying = true`. Cancels any leftover frame first.
3. **Minimap playhead** — `#minimap-playhead` div added inside `#waveform-minimap` in `audio.html`. Styled as a 1px teal vertical line. `animatePlayhead` positions it via `smoothTime / selectedAudioRawDuration`.
4. **Playhead scrub** — `.waveform-playhead` changed to `pointer-events: auto; cursor: ew-resize`. The visible line is now via `::after` pseudo-element (10px wide hit area, 2px visible line at left+4px). Mousedown handler added in `initUI()` — drag updates `wavesurfer.setTime()` and `smoothTime` in real-time. Works while paused too.

**Files changed:** `cep-extension/audio.js`, `cep-extension/audio.html`, `cep-extension/audio-player.css`

---

### 2026-06-08 | Session 065 — Option C: auto dated folder on first drop (v2.9.11 → v2.9.12)

**By:** Claude (AI assistant)
**Version:** v2.9.11 → v2.9.12
**Status:** Done

**What changed:**
- **`import-dropped-files` handler in `main.js`** — Inserted an "Option C" block between the parent-folder detection and the slot-map loading. The block: (1) queries `db.folderTemplatesApi.getAll()` and finds a template where `template_type = 'file'` and `open_mode = 'open_existing'` and `prproj_path` normalized-matches the active `.prproj`; (2) computes today's dated folder label (`DD Month YYYY`, e.g. `08 June 2026`) next to the `.prproj`; (3) on the first drop of the day (no `_freexan_slot_map.json` yet): calls `buildFolderTree(todayBase, nodes)` to create the full template folder structure, writes the slot map, and creates a `.lnk` shortcut to the `.prproj` inside the `01_Project_File`-style subfolder; (4) overrides `projectFolder = todayBase` so the existing slot-map loading and `getDestSubfolder()` routing work normally for all files in the batch.

**Decisions:**
- Shortcut scan checks for folder names containing `01` + `project` or `project_file` (case-insensitive) at the top level of `todayBase`. Falls back to `todayBase` root if none found.
- Slot map build in Option C omits Premiere bin names (no active session bin info available); folder routing still works via `slotFolders` from `buildFolderTree`.
- `_freexan_slot_map.json` presence in `todayBase` is the idempotency guard — if the user drops more files the same day the folder is already there and the slot map is already written, no duplicate creation.

**Files changed:** `main.js`

---

### 2026-06-08 | Session 064 — Mood tags, subfolder chips, batch tagging (v2.9.10 → v2.9.11)

**By:** Claude (AI assistant)
**Version:** v2.9.10 → v2.9.11
**Status:** Done

**What changed:**
1. **Mood chips in drawer** — `#drawer-mood-row` added in `audio.html` between drawer-header and waveform-container. Populated in `selectAudio()` via IIFE. 6 MOODS constants (Tense/Dark/Cinematic/Calm/Uplifting/Chaotic) each with a hex color. Click toggles via `update_tags` WS. State lives on `audio.tags` (comma-separated, e.g. `"tense,calm"`). Active chip uses `border-color + color: var(--mood-color)` + inner box-shadow — no color-mix (CEP Chromium compat).
2. **Mood dots + subfolder chip on cards** — In `renderGrid()`, after the `used-badge` block: extract `getParentFolderName(audio.file_path)` (parent basename) and append as `.card-subfolder` div. Then parse `audio.tags` and render `.mood-dot` spans (6×6px circles) in `.card-mood-dots` row.
3. **Batch tag modal** — `#batch-tag-modal` overlay in `audio.html`. Each folder row in `renderFolderTree()` gets a `.tree-folder-tag-btn` (🏷, visible on hover). Click uses closure `(fp, fn)` to capture `fullPath`/`childNode.name` and calls `openBatchTagModal(folderName, files)`. Modal renders mood chips; Apply sends `batch_add_tags` WS + updates local `audioLibrary` references in-place.
4. **DB + WS** — `audioDb.audioApi.addTagsBatch(ids, tagKeys)` uses a SQLite transaction to merge tags per-file. `batch_add_tags` handler in `main.js` calls it and broadcasts `audio_library_data`.

**Files changed:** `audioDb.js`, `main.js`, `cep-extension/audio.html`, `cep-extension/audio.js`, `cep-extension/audio-player.css`

---

### 2026-06-08 | Session 063 — Panel header spacing + legacy templates section removal (v2.9.9 → v2.9.10)

**By:** Claude (AI assistant)
**Version:** v2.9.9 → v2.9.10
**Status:** Done

**What changed:**
1. **Edit/Cancel/Save button gap** — `.fts-panel-actions` got `margin-left: 12px; flex-shrink: 0`. The buttons were flush against the template name input; now there's a clear visual separation.
2. **Removed "Project File Templates" section** — The old standalone section in the Database tab (label + list + add form with Template name, Path to .prproj, client/funnel selects, Add button) has been fully deleted. This was the legacy way to assign .prproj files before the fts merge. File templates now live entirely inside the Templates section. Cleaned up: HTML in `index.html`, 7 dead `getElementById` calls in `app.js`, and all related functions/listeners in `database-tab.js` (`renderTemplatesList`, `refreshTemplatesList`, `refreshTemplatesFunnelDropdown`, three event listeners, one `populateClientSelect` call, one `bindPathInputDrop` call, one `refreshTemplatesList()` call in `refreshDatabaseTab`).

**Files changed:** `renderer/styles.css`, `renderer/index.html`, `renderer/app.js`, `renderer/database-tab.js`

---

### 2026-06-08 | Session 062 — fts-prproj UI polish + live asset filtering (v2.9.8 → v2.9.9)

**By:** Claude (AI assistant)
**Version:** v2.9.8 → v2.9.9
**Status:** Done

**What changed:**
1. **File template card path chip** — `renderFtsList()` checks `t.template_type === 'file' && t.prproj_path` and renders a `.fts-list-item-path` span with the `.prproj` basename. Users can now see which file a template is linked to directly from the list without opening it.
2. **Browse button layout** — `.fts-prproj-row` is now a flexbox row with `gap: 8px`. Previously the Browse button stacked below the input; now it sits inline to the right. `.fts-prproj-input` gets `flex: 1`.
3. **Pill toggle for open mode** — Replaced `<input type="radio">` pairs with a `<div class="fts-toggle-group" id="fts-openmode-toggle">` containing two `<button>` elements. All JS that read `input[name="fts-open-mode"]:checked` now reads `#fts-openmode-toggle .fts-toggle-btn.active`. Toggle click wired in `bindFtsEvents`. Enable/disable wired in `enterFtsEditMode`/`exitFtsEditMode`.
4. **Live asset filtering** — `assetOpts` in the `+ Import` picker now reads `parseInt(ftsClientSel.value)` / `parseInt(ftsFunnelSel.value)` directly. `ftsClientSel` and `ftsFunnelSel` change listeners now also call `renderPremiereTree()` so the asset choices refresh the moment you pick a different client or funnel — no save required.

**Files changed:** `renderer/folder-templates.js`, `renderer/index.html`, `renderer/styles.css`, `docs/logs/CHANGELOG.md`, `docs/logs/DEV_LOG.md`

---

### 2026-06-06 | Session 061 — Pixel-Perfect Canvas Rendering, Dynamic Peak Slicing (v2.9.7 → v2.9.8)

**By:** Claude (AI assistant)
**Version:** v2.9.7 → v2.9.8
**Status:** Done

**Problem:** WaveSurfer was doing all waveform rendering — drawing peaks through its own multi-canvas tile system, using `wavesurfer.zoom()` + `setScrollTime()` to simulate zoom when the brush region changed. This caused multi-canvas squashing glitches, and the peak resolution was always a fixed 8,000 points regardless of the actual pixel width of the container.

**Solution implemented:**
- **`downsampleSlice(rawPeaks, startIdx, endIdx, targetWidth)`** — New function. Slices the raw peak array to the selected time range and downsamples to exactly `targetWidth` points (= container pixel width). 1 data point per pixel column.
- **`drawDetailWaveform()`** — Draws the detail waveform directly onto `#waveform-canvas` using `canvas.getContext('2d')`. Computes `startIdx`/`endIdx` from `trimStart`/`trimEnd` as percentages of `rawPeaks.length`. Called on: `initReady`, brush drag `onMove`, brush drag `onUp`, micro handle `onMove`, micro handle `onUp`.
- **`drawMinimapWaveform()`** — Draws the minimap onto `<canvas id="minimap-canvas">` (new element in `audio.html`). Full-file view, downsampled to minimap container pixel width. Called once on `initReady`.
- **WaveSurfer audio-only** — `waveColor: 'transparent'`, `progressColor: 'transparent'`. WaveSurfer only handles play/pause/seek/events and `getDecodedData()` for Tone.js. Its internal canvas is hidden via CSS.
- **Removed WaveSurfer minimap** — `wavesurferMinimap` is never created. `#waveform-minimap` now holds a plain `<canvas>`.
- **Removed `doTopWaveZoom()`** — Eliminated `wavesurfer.zoom()` + `setScrollTime()` calls entirely. Zoom is now achieved purely by slicing a smaller range of `rawPeaks`.
- **Playhead fix** — `animatePlayhead` maps `currentTime` to `[trimStart, trimEnd]` window. Hides when outside range.

**Files changed:** `cep-extension/audio.js`, `cep-extension/audio.html`, `cep-extension/audio-player.css`

---

### 2026-06-06 | Session 060 — High-Fidelity Waveforms, Cache Invalidation, and Stable Rendering (v2.9.6 → v2.9.7)

**By:** Gemini (AI assistant)
**Version:** v2.9.6 → v2.9.7
**Status:** Done

**Problem:** Waveforms look curvy/blobby due to WaveSurfer's default line rendering connecting adjacent peaks with diagonal lines. Also, the pre-computed peak files in the database were low-resolution (150 peaks total), resulting in sparse spikes under high zoom. In addition, when zooming, the frontend recalculated and updated peak arrays dynamically, causing multi-canvas layout squashing/glitches on the right side. The user wanted to disable scroll-to-zoom on the player.

**Solution implemented:**
- **Remove Scroll-to-Zoom**: Removed the `wheel` event listener from the top waveform container to disable mouse wheel zooming.
- **High-Fidelity Peak Generation**: Increased ffmpeg decoding sample rate to 22,050Hz on the backend (`main.js`) and implemented dynamic sample accumulation with a 10M peak cap. This allows 1:1 raw sample precision for files under 7.5 minutes (well under the 100MB memory limit).
- **Cache Invalidation**: Prefixed temporary peak files with `freexan_peaks_v3_` in `main.js` to invalidate older low-res caches and force regeneration.
- **Auto-Cleanup**: Programmed the backend to automatically delete the active temporary peak file when a new card is selected or when the WebSocket connection closes.
- **Stable Frontend Rendering**: Configured the player waveform (`audio.js`) to downsample peaks to a fixed high-resolution of 8,000 points once on load (instead of dynamically changing the array size on zoom), which completely resolves the multi-canvas squashing/rendering glitch.
- **Sharp Spikes**: Applied `barWidth: 1`, `barGap: 1`, and `barRadius: 0` to both player and minimap configs in `audio.js` to draw clean, sharp vertical spikes (similar to professional NLEs/DAWs) instead of curvy connecting lines.

**Files changed:** `cep-extension/audio.js`, `main.js`

---

### 2026-06-05 | Session 059 — Drag Fix: Restore Project Panel + Drop Zone for Timeline (v2.9.5 → v2.9.6)

**By:** Claude (AI assistant)
**Version:** v2.9.5 → v2.9.6
**Status:** Done

**Problem:** `window.cep.dnd.initiateDrag` doesn't exist in this Premiere/CEP environment. The previous session replaced all HTML5 `dragstart` handlers with `initNativeDrag()` which calls this API — result: both Project Panel drop AND Timeline drop stopped working entirely.

**Root cause confirmed:** CEP HTML5 `dragstart` + `com.adobe.cep.dnd.dictionary.string` IS the correct mechanism for Premiere's Project Panel. Timeline drop via any drag mechanism is impossible from CEP (platform constraint). The v2.9.5 approach was architecturally wrong.

**Solution implemented:**
- Restored `card.draggable = true` + `dragstart` with `com.adobe.cep.dnd.dictionary.string` (fixes Project Panel)
- Added `showDropZone(filePath, binName)` / `hideDropZone()` helpers
- Drop zone bar (`↓ Drop here → Insert at Playhead`) appears at panel bottom whenever a drag starts, disappears on `dragend`
- Dropping onto this zone calls `doImportToPremiere(fp, binName)` → ExtendScript `importFiles` + `insertClip` at playhead
- Add button: same pattern — `dragstart` with `com.adobe.cep.dnd.dictionary.string` to dummy path + `process_audio` WS kick-off; drop zone shown during drag
- `initNativeDrag` function retained (still used for nothing currently — kept in case of future use)

**User workflow:**
- Drag card RIGHT out to Premiere → drops into Project Panel bin ✓
- Drag card DOWN onto panel drop zone → imports + inserts at timeline playhead ✓
- Click card → opens drawer (unchanged) ✓
- Click Add → imports + inserts at playhead (unchanged) ✓

**Files changed:** `cep-extension/audio.js`, `cep-extension/audio-player.css`

---

### 2026-06-05 | Session 058 — Native Drag Handler (v2.9.4 → v2.9.5)

**By:** Claude (AI assistant)
**Version:** v2.9.4 → v2.9.5
**Status:** Done

**Problem:** All previous drag attempts used HTML5 `dragstart` + `com.adobe.cep.dnd.dictionary.string`. Premiere's Timeline panel silently rejects this payload — only the Project Panel accepts it.

**Solution:** `window.cep.dnd.initiateDrag(mouseEvent, [path])` — CEP 8.0+'s native OS drag API. Creates a Windows HDROP drag identical to dragging from File Explorer. Premiere's Timeline, Project Panel, and any other app can receive it.

**Implementation:**
- `initNativeDrag(el, getPath, onBeforeDrag)`: mousedown → mousemove with 5 px threshold. Below threshold = click fires normally. Above threshold = `initiateDrag` called, ghost shown.
- `showDragGhost(ev, name)`: floating `.drag-ghost` pill following cursor at +14/+6 px offset.
- Ghost leak fix (user-identified): Bound `stop()` to both `window.blur` AND `document.mouseleave`. When cursor leaves the CEP panel to drop on Premiere, `mouseup` doesn't fire inside CEP — `blur`/`mouseleave` guarantees cleanup.
- Card drag: raw original file (no processing, no use count — no reliable cross-app drop detection).
- Add button drag: `onBeforeDrag` fires `process_audio` WS message immediately at drag threshold, so FFmpeg runs during the drag gesture, not after drop.

**Files changed:** `cep-extension/audio.js`, `cep-extension/audio-player.css`

---

### 2026-06-04 | Session 057 — Timeline Placement Fix (v2.9.3 → v2.9.4)

**By:** Claude (AI assistant)
**Version:** v2.9.3 → v2.9.4
**Status:** Done

**Root cause:** CEP panel HTML5 drag (`com.adobe.cep.dnd.dictionary.string`) only works when dropped onto Premiere's *Project Panel*. Premiere's *Timeline panel* silently rejects all external CEP drag payloads — the drag appears to be accepted visually but nothing gets placed. This is a Premiere Pro / CEP platform constraint, not a code bug.

**Impact:** The Add button drag → dummy proxy flow would call `doReplaceInPremiere`, which runs `changeMediaPath` on the dummy — but since the dummy was never accepted by the Timeline, it was never in the project, so `findItem` returned null and `doReplaceInPremiere` returned `"not found"`, silently discarding the FFmpeg-processed file.

**Fixes applied (`cep-extension/audio.js`):**
1. `doImportToPremiere`: after `importFiles()`, now finds the imported item by name in `targetBin.children`, gets `seq.getPlayerPosition()`, and calls `audioTracks[t].insertClip(item, ph.seconds)` iterating tracks until one accepts. Falls back to `seq.insertClip(item, ph, -1, 0)` for older PP versions. Result: clicking "Add" both imports to the bin AND places at playhead.
2. `doReplaceInPremiere`: added result check — if result is `"not found"` or `"err:..."`, now calls `doImportToPremiere(realPath, binName)` as fallback, so the FFmpeg-processed file is never lost regardless of whether the drag was accepted.

**Workflow clarification:**
- Add button *click* → processes via FFmpeg → `import_audio_legacy` → `doImportToPremiere` → imports + inserts at playhead ✓
- Add button *drag* → sends `process_audio` with dummyFilePath → `replace_audio` → `doReplaceInPremiere` → if dummy not found, falls back to `doImportToPremiere` ✓
- Card *drag* → sets `com.adobe.cep.dnd.dictionary.string` → drops to Project Panel (not Timeline) → use count recorded on dragend ✓

---

### 2026-06-04 | Session 056 — Drag & Drop Bug Fixes (v2.9.2 → v2.9.3)

**By:** Claude (AI assistant)
**Version:** v2.9.2 → v2.9.3
**Status:** Done

**Summary:** Diagnosed and fixed three concrete bugs that were silently breaking all drag-and-drop functionality in the Audio freeXan panel. Root cause was a cascade: an undefined function call crashed a critical setTimeout callback, preventing the dummy file from ever being prepared.

**Root cause chain:**
1. `openDrawer()` called `drawLargeWaveform()` — function never existed.
2. JavaScript stops executing the callback on `ReferenceError`, so `requestDummyFile()` after it never ran.
3. `window.currentDummyPath` always stayed null.
4. Add-button drag hit the `else if` fallback, dragging the raw original file instead of the processed proxy.
5. No bin routing, no pitch/speed/trim applied via FFmpeg — drag "worked" in the most basic sense but bypassed all the v2.9.2 proxy workflow.

**Fixes applied (`cep-extension/audio.js`):**
- Removed `drawLargeWaveform()` from the `openDrawer` setTimeout; replaced the whole block with just `setTimeout(requestDummyFile, 60)`.
- Removed the first (stale) duplicate `dragstart` listener on cards — it was overriding the `com.adobe.cep.dnd.dictionary.string` payload with a second listener that set only `text/plain`.
- Rewrote the single canonical card `dragstart`: sets `com.adobe.cep.dnd.dictionary.string` (forward-slash path) + `text/plain` fallback + custom `setDragImage` pill.
- Added `dragend` listener on cards: when `dropEffect !== 'none'`, sends `record_use` WS message and optimistically bumps `use_count` in-memory.

**What's working now:**
- Card drag → drops original file to Premiere Project panel (no processing, direct raw import)
- Add-button drag → dummy proxy dropped, FFmpeg processes in background, `changeMediaPath` swaps to final render
- Use count records correctly for both card drag and Add-button import

---

### 2026-06-04 | Session 055 — Windows Drag & Drop Proxy Workflow (v2.9.1 → v2.9.2)

**By:** Antigravity (AI assistant)
**Version:** v2.9.1 → v2.9.2
**Status:** Done / Paused Debugging

**Summary:** Engineered an instant, background proxy workflow to allow dragging asynchronously-processed audio files (trimmed, pitched, speed-adjusted via FFmpeg) directly from the CEP panel into Premiere Pro, bridging the gap between browser UI and native OS file drops. 

**Done:**
- Designed a `prepare_dummy` WebSocket mechanism in `main.js` that synchronously generates a 16-bit 44.1kHz `.wav` file holding exactly the calculated `(trimEnd - trimStart) / speed` duration in the OS Temp folder.
- Configured the frontend (`audio.js`) to lazily request this exact dummy file every time a slider is moved, a trim is finalized, or the detail drawer opens.
- Overhauled the CEP Drag & Drop payloads (`dragstart`) to strictly utilize `com.adobe.cep.dnd.dictionary.string` with forward slashes for Windows compatibility, stripping conflicting standard HTML5 URIs (`text/uri-list`) which cause Adobe Premiere Pro 2024 to silently abort native file mapping.
- Integrated background FFmpeg execution with FreeXan's native routing by pointing `process_audio` destination paths strictly to `getDestSubfolder` powered by `_freexan_slot_map.json`.
- Crafted an ExtendScript `doReplaceInPremiere()` to quietly replace the dropped dummy asset in the Project Panel with the final rendered FFmpeg `.wav` using `ProjectItem.changeMediaPath()`, instantly auto-updating the Premiere timeline waveform without a reload prompt.

---

### 2026-06-04 | Session 054 — High-Performance Waveform System (v2.9.0 → v2.9.1)

**By:** Antigravity (AI assistant)
**Version:** v2.9.0 → v2.9.1
**Status:** Done

**Summary:** Refactored the Audio freeXan waveform loading to prevent CPU spikes and crashing inside Premiere Pro by implementing pre-computed peaks, lazy loading via IntersectionObserver, and decoupled playback.

**Done:**
- Added a `peaks` column (TEXT) to the `audio_files` table in SQLite (`audioDb.js`).
- Implemented FFmpeg-based peak downsampling inside `audioWatcher.js`: spawns an FFmpeg subprocess to extract mono raw 8-bit PCM at 150Hz.
- Configured `.pek` file output: writes peak arrays as JSON files inside a hidden `.peaks/` folder at the root of each watched folder to cache calculations and prevent redundant FFmpeg runs.
- Configured the chokidar filesystem watcher to ignore `.peaks` folders to avoid loop-triggering.
- Replaced the heavyweight `WaveSurfer` grid card waveforms in `cep-extension/audio.js` with virtualized `IntersectionObserver` canvas elements. Canvases are painted with 2D contexts only when cards intersect with the viewport, and unmounted immediately upon leaving it to free graphics memory.
- Decoupled visuals from playback: active `Tone.js` and `WaveSurfer.js` audio nodes are instantiated strictly on selected items inside the player detail drawer.
- Packaged `wavesurfer.min.js`, `regions.min.js`, and `Tone.js` directly in the extension folder to avoid relative `../node_modules` paths throwing `ReferenceError: WaveSurfer is not defined` inside CEP.
- Fixed an uncaught Tone.js connection exception (`A value with the given key could not be found`) by wrapping the HTML5 audio element inside a `Tone.MediaElementSource` node before connecting to the Tone.js effects chain.
- Refactored the detail drawer's playback visualization to use a high-fidelity decoupled layout:
  - Custom canvas (`#waveform-canvas`) paints high-resolution peaks directly.
  - Custom trim handles (`#handle-start` and `#handle-end`) support smooth drag gestures over a larger 16px clickable target with hover animations.
  - A glowing, custom-positioned playhead tracks playback progress via native media element `timeupdate` events, syncs on user seek clicks, and stays in place.
  - Added CSS rule overrides to hide Wavesurfer's auto-generated waveform container DOM nodes, using it solely as a background playback and event router.

**Files changed:** `audioDb.js`, `audioWatcher.js`, `cep-extension/audio.js`, `cep-extension/audio.html`, `cep-extension/audio-player.css`, `docs/logs/DEV_LOG.md`, `docs/logs/CHANGELOG.md`

---

### 2026-06-04 | Session 053 — Audio freeXan UI/UX Redesign (v2.8.0 → v2.9.0)

**By:** Claude Code
**Version:** v2.8.0 → v2.9.0
**Status:** Done

**Summary:** Full ground-up redesign of the Audio freeXan CEP panel per `docs/AUDIO_UX_SPEC.md` and `Audio FreeXan Feature List.md`. Rewrote all three panel files (`audio.html`, `audio-player.css`, `audio.js`) and made additive backend changes to `audioDb.js` and `main.js`.

**Design decisions:**
- Chose CSS `transform: translateY(100%)` → `translateY(0)` for the drawer animation instead of `height` animation (hardware-accelerated, no reflow). `.layout.drawer-open .audio-grid` adds `padding-bottom: 176px` so cards behind the open drawer remain reachable by scrolling.
- Sidebar is 90 px fixed-width (works at panel min-width 200 px, leaving 110 px for the 1-column grid). Folder tree section is hidden when all files share a single directory.
- BGM/SFX classification is pure front-end: keyword scan on the full file path (SFX keywords checked first to prevent music folders named "background sfx" from misclassifying), then duration fallback. No DB persistence needed — classification re-runs on every render.
- Trim handles are absolutely positioned `<div>`s on the waveform container, dragged via `document` mousemove/mouseup listeners that are added on mousedown and removed on mouseup — prevents stuck handles if mouse leaves the panel.
- "Used N×" badge increments optimistically in-memory on the selected audio object so the count reflects in the grid immediately without waiting for a WS round-trip.
- Timeline sync uses `csInterface.evalScript` directly (no WS round-trip needed — ExtendScript runs inside Premiere, not in Electron). `seq.play(0)` stops playback; `seq.setPlayerPosition(ticks)` restores position.
- `record_use` WS message added (non-breaking additive message type). `main.js` handles it → calls `audioDb.audioApi.incrementUseCount(id)`.

**Spec features implemented:** All 7 from spec. BPM visualizer (Feature 7) has the UI foundation (beat marker lines can be drawn on the large waveform canvas) but peak/tempo data requires a future audio analysis pipeline — spec UI is wired, markers will appear when data is provided. Drag-to-timeline (Feature 6) has card `draggable=true` and `ondragstart` wired; the `pre_render_drag` WS flow requires CEP native drag API which is a future milestone.

**Files changed:** `cep-extension/audio.html`, `cep-extension/audio-player.css`, `cep-extension/audio.js`, `audioDb.js`, `main.js`, `docs/logs/CHANGELOG.md`, `docs/logs/DEV_LOG.md`

---

### 2026-06-04 | Session 052 — Renderer Refactor: Split app.js into 6 domain files (v2.7.0 → v2.8.0)

**By:** Claude Code
**Version:** v2.7.0 → v2.8.0
**Status:** Done

**Summary:** Ran a full graphify knowledge-graph audit on the codebase, then refactored the 2,978-line `renderer/app.js` monolith into 6 domain-specific files. Split was: `utils.js` (shared helpers, pickers, escape, status), `builder.js` (builder tab, preview, folder tree), `settings.js` (settings tab, config), `database-tab.js` (full library CRUD), `folder-templates.js` (old FT editor + full FTS editor with Premiere bins/sequences). Lean `app.js` now holds only global state, DOM refs, and DOMContentLoaded boot. Scripts loaded in order via `<script>` tags — no bundler needed; all functions remain globally accessible. No functionality changed. `dbFunnels`, `dbTasks`, and `saveStatus` were explicitly promoted to shared global state in app.js since they're referenced across multiple domain files.

**Files changed/added:** `renderer/utils.js` (new), `renderer/builder.js` (new), `renderer/settings.js` (new), `renderer/database-tab.js` (new), `renderer/folder-templates.js` (new), `renderer/app.js` (rewritten to ~170 lines), `renderer/index.html` (script tags updated), `docs/logs/CHANGELOG.md`, `docs/logs/DEV_LOG.md`, `docs/logs/NAVIGATION_LOG.md`

### 2026-06-03 | Session 051 — Standalone Audio Library Panel (v2.6.0 → v2.7.0)

**By:** Claude Code
**Version:** v2.6.0 → v2.7.0
**Status:** Done

**Summary:** Added a full-featured Audio Library explorer panel to Premiere Pro that coordinates with the Electron app background watcher services. Set up a separate SQLite database (`audio-library.db`) and recursive directory watcher (`audioWatcher.js`) to index audio collections. Created the standalone **Audio freeXan** panel alongside **Link freeXan** using a unified CEP bundle. Implemented interactive HTML5 audio waveforms, looping, speed multipliers, trim controls, and backend FFmpeg processing for pitch/stretch manipulation before timeline placement.

**Files changed/added:** `audioDb.js`, `audioWatcher.js`, `main.js`, `preload.js`, `renderer/index.html`, `renderer/app.js`, `cep-extension/CSXS/manifest.xml`, `cep-extension/panel.html`, `cep-extension/audio.html`, `cep-extension/audio.js`, `cep-extension/audio-player.css`, `cep-extension/ext.js`, `docs/logs/CHANGELOG.md`, `docs/logs/DEV_LOG.md`, `docs/logs/NAVIGATION_LOG.md`

### 2026-06-02 | Session 050 — Big UX pass (v2.5.2 → v2.6.0)

**By:** Claude Code
**Version:** v2.5.2 → v2.6.0
**Status:** Done

**Summary:** Implemented 16 of the user's feature suggestions from `docs/FEATURE_GUIDE.md` in one pass. Spans cosmetic CSS (circular titlebar buttons with green/red hover, modal footer polish), small JS/HTML tweaks (version chip, icon-only sidebar, removed Sequence Format and Category dropdown), moderate features (clickable token chips, per-pair localStorage memory, drag-drop folder onto path inputs, asset inline edit, picker portal so popovers escape the scroll container), and bigger refactors (funnel deduplication into one card with per-client tags, 7-level template resolve cascade in `folderTemplatesApi.resolve`, `inferSlotType()` for auto-tagging unmarked folders/bins, batched drop protocol with bin focus and last-item selection). Case-insensitive conflict checks (F-DB-009) were verified already-implemented in v2.5.x — no code change.

**Files changed:** `main.js`, `preload.js`, `db.js`, `cep-extension/ext.js`, `renderer/index.html`, `renderer/app.js`, `renderer/styles.css`, `package.json`, `docs/logs/CHANGELOG.md`, `docs/logs/DEV_LOG.md`, `docs/FEATURE_GUIDE.md`

**Tested by user:** see "How to test" notes — runtime QA happens after this commit.

---

### 2026-06-01 | Session 049 — Conflict confirmation dialog (v2.5.1 → v2.5.2)

**By:** Claude Code
**Version:** v2.5.1 → v2.5.2
**Status:** Done

**Summary:** Added confirmation dialog before any template assignment that would replace an existing one. Two locations patched: `ftBtnAssign` click handler (Database tab) and `saveFtsTemplate()` (FTS editor save). Both check the loaded templates array for a conflicting assignment (different template ID, same client/funnel/task combo) before calling `assign()`. If found, a native `confirm()` dialog names both templates and requires explicit OK to proceed; Cancel aborts with zero changes.

**Files changed:** `renderer/app.js`

---

### 2026-06-01 | Session 048 — One-template-per-pair enforcement (v2.5.0 → v2.5.1)

**By:** Claude Code
**Version:** v2.5.0 → v2.5.1
**Status:** Done

**Summary:** Fixed silent dual-template conflict in `folderTemplatesApi.assign()`. The DELETE clause previously included `template_id=?`, so it only removed the current template's own prior assignment — another template's assignment to the same pair was left intact. Changed DELETE to `WHERE client_id IS ? AND funnel_id IS ? AND task_id IS ?` (no template_id filter), which evicts any existing assignment for the combination before inserting. This runs inside the existing transaction, so it's atomic.

**Files changed:** `db.js`

---

### 2026-06-01 | Session 047 — Full defensive audit fix pass (v2.4.4 → v2.5.0)

**By:** Claude Code
**Version:** v2.4.4 → v2.5.0
**Status:** Done

**Summary:** Fixed all 14 bugs found in the codebase audit — 5 HIGH, 4 MEDIUM, 5 LOW. Key changes: added `safeParseJson` and `sanitizeName` helpers to main.js; wrapped all WebSocket sends in try-catch across main.js and ext.js; fixed tray icon fallback; fixed duplicate template rows in DB query; replaced naive circular-reference check with full DFS cycle detection; stored monitor interval reference; fixed version padding; added IPC input validation.

**Files changed:** `main.js`, `db.js`, `cep-extension/ext.js`

---

### 2026-06-01 | Session 046 — Reposition Overlay spring animation (v2.4.3 → v2.4.4)

**By:** Claude Code
**Version:** v2.4.3 → v2.4.4
**Status:** Done

**Change:** `setPosition(20,20)` was instant. Replaced with `repositionOverlay()` — a 60 fps `setInterval` loop that interpolates the window position over 1500ms using `_springEase(t) = 1 − 2^(−10t) × cos(3πt)`. This gives a single ~10% overshoot and settles cleanly. A module-level `_repositionTimer` ref allows mid-animation interruption. If the overlay window is destroyed, falls back to `createOverlayWindow()` which places it at default coords directly.

**Files changed:** `main.js`

---

### 2026-06-01 | Session 045 — Overlay micro-animations (v2.4.2 → v2.4.3)

**By:** Claude Code
**Version:** v2.4.2 → v2.4.3
**Status:** Done

**Change:** Added 5 new CSS-only micro-animations to the pill overlay. All are pure keyframe/transition additions to `overlay.css` — no JS changes required. Mount animation fires once on window open via `animation-fill-mode: both`; error shake overrides the pill's animation property only while the `.error` class is present (higher specificity); idle breathe uses a `:not()` chain to pause when any active state class is applied; dot pulse uses `box-shadow` only to avoid overflow/clipping issues.

**Files changed:** `overlay.css`

---

### 2026-06-01 | Session 044 — Tray "Reposition Overlay" button (v2.4.1 → v2.4.2)

**By:** Claude Code
**Version:** v2.4.1 → v2.4.2
**Status:** Done

**Change:** Renamed the tray menu item from "Show Overlay" to "Reposition Overlay" and updated its click handler. Now moves the overlay back to its default position (x: 20, y: 20), shows it, and re-asserts `screen-saver` alwaysOnTop level. If the overlay window was destroyed, it is recreated (which places it at the default position via `createOverlayWindow`). Single action covers both recovery and repositioning use cases.

**Files changed:** `main.js`

---

### 2026-05-30 | Session 043 — Ensure library assets are imported *after* bin creation (v2.3.5 → v2.3.6)

**By:** Claude Code
**Version:** v2.3.5 → v2.3.6
**Status:** Done

**Root cause:** The CEP panel was receiving the `setup-project` command, which contained both the structural bins/sequences to create and the list of assets to import. The asset import logic was operating on a hardcoded 800ms timer, executing prematurely *before* the adaptive bin creation algorithm finished setting up the Premiere bins. If a bin like "Brand Assets" wasn't created yet, the import failed to find the target bin and fell back to the root of the project.

**Fix:** 
- Refactored `ext.js` so that `setupFromPremiereTree` and `setupProjectBinsAndSequences` accept an `onComplete` callback.
- Passed the asset import logic (`doImports`) as this callback, ensuring that assets are strictly imported only after the panel confirms all structural bins and sequences have been fully created.

---

### 2026-05-30 | Session 042 — Support multiple asset slots per Premiere bin (v2.3.4 → v2.3.5)

**By:** Claude Code
**Version:** v2.3.4 → v2.3.5
**Status:** Done

**Root cause:** A single Premiere bin could only be assigned one media slot (`node.slotType` as a string). When a user clicked "+ Asset" and assigned e.g., Audio, the button changed its text to the slot name and acted as a toggle-off button, blocking the assignment of another slot (like Video or Image) to the same bin.

**Fix:** 
- Upgraded `slotType` (string) to `slotTypes` (array) in `ftsPremiere` tree items.
- Added a migration step in `app.js` to automatically convert old `slotType` to `slotTypes` when reading existing templates.
- Modified `renderPremiereNode` to render a separate inline badge for *each* assigned slot. These badges are clickable to remove the slot.
- Restored the `+ Asset` button to be permanently visible (unless all global slots are exhausted), allowing users to click it multiple times to assign multiple media types to a single bin.
- Updated `main.js` project generation routing (`slotBins`) to process the new `slotTypes` array for Premiere bin assignments.

---

### 2026-05-30 | Session 041 — Ensure main window never automatically pops up when CEP is connected (v2.3.3 → v2.3.4)

**By:** Claude Code
**Version:** v2.3.3 → v2.3.4
**Status:** Done

**Root cause:** The user requested a strict rule: "if CEP is Connected Never Pop Up the Main Window Automatically". Even if Premiere's Welcome screen is on top, if the CEP panel is actively connected, the main window should remain hidden unless explicitly requested.

**Fix:** Added an explicit `!isCepConnected` check to the auto-popup block in `startPremiereMonitor` in `main.js`. Now, the popup only occurs automatically when the Welcome Screen is detected AND the CEP panel is disconnected.

---

### 2026-05-30 | Session 040 — Auto-hide main window when Premiere Pro closes (v2.3.2 → v2.3.3)

**By:** Claude Code
**Version:** v2.3.2 → v2.3.3
**Status:** Done

**Root cause:** When the user closes Premiere Pro, the background process monitor detects the closed state but doesn't call `mainWindow.hide()`. If the main window had auto-popped up on screen, it remained floating on the desktop after Premiere was gone.

**Fix:** Added calls to `mainWindow.hide()` (with `!userOpenedManually` checks) inside both the execution error branch and the empty title branch in the background monitor loop.

---

### 2026-05-30 | Session 039 — Fix unexpected Welcome Screen popups when project is active (v2.3.1 → v2.3.2)

**By:** Claude Code
**Version:** v2.3.1 → v2.3.2
**Status:** Done

**Root cause:** Premiere Pro window titles temporarily lose the ` - ` project path separator during autosaves, opening dialogs (e.g. Preferences), or loading/rendering. The background monitor assumed any title without ` - ` meant the Welcome/Home Screen was active, causing the main window to pop up unexpectedly.

**Fix:** Implemented a hybrid strategy in `main.js`:
- Block all auto-popups if the CEP extension WebSocket is active (`isCepConnected`).
- If CEP is disconnected, verify if the Welcome Screen is exactly on top by matching the window title against the regex pattern `/^Adobe Premiere Pro( \d{4})?$/i`. If it's a different title (like a dialog or saving indicator), keep the window hidden.

---

### 2026-05-30 | Session 038 — Fix GPU subprocess crash on installed build (v2.3.0 → v2.3.1)

**By:** Claude Code
**Version:** v2.3.0 → v2.3.1
**Status:** Done

**Root cause:** On the installed build, the Chromium GPU helper process (`freeXan Helper (GPU).exe`) crashed immediately with `exit_code=-1073741515` (`0xC0000135 STATUS_DLL_NOT_FOUND`) — a required DLL was missing. This is a known issue on Windows machines that don't have the full GPU/DirectX runtime stack that Chromium expects.

**Fix:** Added `app.disableHardwareAcceleration()` at the top of `main.js` (before `app.whenReady()`). This tells Electron not to launch the GPU subprocess at all — Chromium renders using the CPU instead. For freeXan (a UI form + floating overlay with no video rendering), this has zero visible impact on performance or appearance.

---

### 2026-05-29 | Session 037 — Full codebase bug fix sweep (v2.2.4 → v2.3.0)

**By:** Claude Code
**Version:** v2.2.4 → v2.3.0
**Status:** Done

**Summary:**
Full deep-dive audit across all six core files. 29 confirmed bugs found and fixed — ranging from critical data loss to low-priority style issues. No new features; all changes are correctness fixes.

**Critical / data-loss fixes:**
- `db.js` `clone()` was silently dropping `slot_type` on every cloned template — affected all users of slot-routed bins. Fixed by adding `slot_type` to the INSERT column list.
- `db.js` `assign()` ran DELETE and INSERT as two separate statements — a failed INSERT after a successful DELETE permanently destroyed the assignment. Wrapped in transaction.

**High severity fixes:**
- `main.js`: duplicate `resize-overlay` IPC handler (lines were registered twice with different dimensions). Overlay was always the wrong size. Removed duplicate.
- `main.js`: tray icon fallback pointed to an HTML file — crash on launch if `tray_icon.png` missing. Switched to `nativeImage.createEmpty()`.
- `ext.js`: `asset.sourcePath` and `data.filePath` used without type guards — both could throw TypeError on a malformed WebSocket message. Guards added.
- `renderer/app.js`: `Date.now()` tempIds for Premiere nodes collided on rapid clicks (same millisecond). Added `_ptidCounter` + `ftNextPremiereTempId()` for collision-safe IDs.
- `renderer/app.js`: slot/asset picker `document.addEventListener('click', close, true)` leaked if tree was re-rendered before user clicked away. Added module-level `_activePickerCleanup` + `_closePicker()`, called at entry of both `renderFtsTree()` and `renderPremiereTree()`.
- `renderer/app.js`: `JSON.parse(bins_json)` / `sequences_json` had no try-catch — malformed DB data crashed the template selection handler. Both now default to `[]` on parse failure.
- `renderer/overlay.js`: all four `document.getElementById()` results used without null check — crash if element IDs change. Guard added.

**Medium severity fixes:**
- `main.js`: `saveConfig()` threw ENOENT on first run if userData dir didn't exist. Added `mkdirSync(..., { recursive: true })`.
- `main.js`: `client.send()` not in try-catch in two import handlers — socket-close mid-send caused uncaught exception. Both wrapped.
- `main.js`: `pendingProjectSetup = null` cleared unconditionally even when `ws.send()` threw. Moved into try block.
- `db.js`: `initSchema()` migration DDL not wrapped — mid-migration crash left DB in unknown state. All migration blocks now in try-catch with graceful fallback.
- `ext.js`: WebSocket reconnect had no retry limit — spun forever if server never came back. Added 30-attempt cap.
- `ext.js`: `evalScript` result validation inconsistent across callbacks. Added `evalResult(r, label)` helper; used everywhere.
- `renderer/app.js`: asset picker `if (existing) { existing.remove(); return; }` returned before re-opening — required two clicks to reopen. Removed `return`.
- `renderer/app.js`: sort_order not recalculated after node deletion — gaps accumulated in sibling lists. Re-indexing added to all three delete handlers.
- `renderer/overlay.js`: `filePaths.length` could throw if argument was not an array. Added `Array.isArray()` guard.
- `renderer/overlay.js`: `dragleave` didn't cover drag-cancel (Escape/released outside). Added `dragend` handler.

**Low severity fixes:**
- `db.js`: circular `parent_id` references silently orphaned nodes. Pre-transaction self-reference check added.
- `main.js`: BUG-06 version comparison commented as intentional exact-match.
- `main.js`: Windows-invalid chars in project/client/funnel names caused `mkdirSync` to throw. Added `sanitizeFolderName()` helper.
- `main.js`: version counter `padStart(2)` broke above v99. Changed to `padStart(3)` with a 999 safety cap.
- `ext.js`: `findBin()` loop limit was 500 — silent miss on large projects. Increased to 2000.
- `renderer/app.js`: `slot_type` (snake_case, DB) vs `slotType` (camelCase, bins_json) naming difference documented in comments.
- `renderer/app.js`: template clone gave no feedback that clone is unassigned. `console.warn` added.
- `renderer/overlay.js`: `mousemove` IPC fired on every pixel move. Throttled to one `requestAnimationFrame` per frame.

**Files changed:** `db.js`, `cep-extension/ext.js`, `main.js`, `renderer/app.js`, `renderer/overlay.js`

**Next:** Ready for `npm start` smoke test.

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

---
## [2026-06-22 13:21] � freeXan Caption Bug Fix Session

**Session Goal:** Fix 5 confirmed bugs in freeXan Caption CEP plugin.

**Root Cause Analysis:** File-by-file diff of Working_Plugins_Backup vs CEPs/ identified two problematic changes in sync.jsx:
1. A new triple MOGRT detection guard in getMogrtDumpForActiveClip (isMGT + getMGTComponent + .aegraphic path check) was failing silently on embedded MOGRTs
2. getTimelinePhraseMap lacked defensive try-catch around clip.isMGT()

**Files Modified:**
- CEPs/freeXan_Caption/panel/jsx/core/sync.jsx (2 fixes)
- CEPs/freeXan_Caption/panel-src/src/hooks/useFreeXanWs.ts (1 fix)
- CEPs/freeXan_Caption/panel/dist/freexan-caption.js (rebuilt)

**Status:** Fixes applied. Pending user verification in Premiere Pro.

---

## 2026-06-24 � Fix Session: BAT Installers Rewritten

**Problems found and fixed:**
1. install_plugins.bat used mklink /J � silently fails without Admin. Missing Link_freeXan. CSXS registry only up to v16. No robustness.
2. Install_freeXan_Caption.bat copied the full dev tree (33 items including node_modules, .claude, panel-src) into the CEP extensions folder.
3. Audio_freeXan and MISTER_BloomX sources are in plugins/, not CEPs/ � old master BAT pointed to empty CEP folders.
4. freeXan_DebugLog has no manifest in CEPs/ � installer now skips gracefully.

**Files changed:**
- CEPs/install_plugins.bat
- CEPs/freeXan_Caption/Install_freeXan_Caption.bat

---

## 2026-06-24 � Fix Session: Disconnect Root Causes Patched

**Goal:** Fix the two root causes of unexpected DISCONNECTED status found via log analysis.

**Fix 1 � Stack overrun in smParseClipParams (mogrt_editor.jsx)**
- Root cause: some MOGRTs with corrupted/deep property trees had 
umItems > 200+, causing ExtendScript's call stack to overflow mid-iteration. This crashed the JSX engine, making the panel report DISCONNECTED.
- Fix: added SM_MAX_PROPS = 200 cap, null guards on getMGTComponent() and .properties, and per-property try/catch so one bad property can't abort the whole clip.

**Fix 2 � 171K getPlayheadTime calls (EditView.tsx)**
- Root cause: playhead follower polled at 250ms with no connection guard. When no sequence was open, every tick threw "No active sequence" � 171,000+ times per session, saturating the ExtendScript bridge.
- Fix: interval slowed to 500ms; tick skips the JSX call entirely when connection !== 'connected'.

**Files changed:**
- CEPs/freeXan_Caption/panel/jsx/core/mogrt_editor.jsx (+ .js mirror)
- CEPs/freeXan_Caption/panel-src/src/tabs/edit/EditView.tsx
- CEPs/freeXan_Caption/panel/dist/freexan-caption.js (rebuilt)

---

## 2026-06-24 � Debug Session: Connection Status Investigation

**Goal:** Instrument the connection status pipeline to diagnose unexpected disconnects in freeXan Caption.

**What was done:**
- Audited 7 files in the connection pipeline: csi.ts, usePremiereState.ts, useFreeXanWs.ts, useCsxsEvent.ts, sessionStore.ts, AppBar.tsx, StatusRail.tsx.
- Found 7 bugs (2 critical, 3 moderate, 2 minor) � logged in connection_audit.md artifact.
- Added targeted debug logging:
  - usePremiereState.ts: unique [DISC-n] tags on every failure path, tick counter, timestamps, raw value dumps, state-change-only logging via setAndLog.
  - csi.ts: log raw ExtendScript callback value before rejection decision (OK / REJECTED / empty).
- Rebuilt bundle: 
pm run build:fast � clean, no errors.

**Key bugs to fix next:**
1. sequenceFps stored as string tick count, not a real number � causes garbled FPS display.
2. WebSocket reconnects every 1s forever with no backoff � CPU churn when BloomX is closed.

**Files changed:**
- CEPs/freeXan_Caption/panel-src/src/hooks/usePremiereState.ts
- CEPs/freeXan_Caption/panel-src/src/lib/csi.ts
- CEPs/freeXan_Caption/panel/dist/freexan-caption.js (rebuilt)

---
## [2026-06-22 13:35] -- OFFLINE root cause: msg.bloomxOpen vs msg.connected key mismatch in project_state handler.

---
## [2026-06-22 13:37] � Link_freeXan Bug Fix #3

**Bugs Fixed:**
- **Audio List Not Loading:** Restored missing 
equestAudioLibrary() explicit call and audio list rendering logic (udioLibrary = data.files || []; renderAudioList();) in ext.js which was accidentally deleted, preventing the audio library from loading in Link_freeXan.
- Copied updated ext.js to installed location $env:APPDATA\Adobe\CEP\extensions\com.bloomx.freexan.link\ext.js.

---
## [2026-06-22 17:43] -- freeXan Caption Replace Engine Fixes
Text Wipeout + Slow Replace bugs fixed.

---
## [2026-06-22 18:26] -- Replace Engine Refinements
- Bypassed _smFindAllTextParams for freeXan mode, hardcoded '? Text Input'. Added track lock abortion in mogrt.jsx.




