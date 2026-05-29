# RULEBOOK — freeXan by BloomX

Rules, standards, and policies for this project.  
Every contributor (human or AI agent) must follow these rules.  
**Version:** v1.2.0 | **Established:** 2026-05-25

---

## 1. LOG MAINTENANCE (MANDATORY)

These three log files must be kept up to date at all times. They are living documents.

### 1.1 CHANGELOG.md

**Rule:** Every code change — no matter how small — must be logged here before the session ends.

**Log these:**
- Any new feature or capability added
- Any bug fix (even a one-line fix)
- Any logical change (algorithm, flow, behavior change)
- Any UI change (color, layout, copy, animation)
- Any database change (new table, new column, new query)
- Any build/config change (package.json, electron-builder.yml, NSIS)
- Any performance or security improvement

**Do NOT log:**
- Changes to log files themselves (`CHANGELOG.md`, `DEV_LOG.md`, `NAVIGATION_LOG.md`)
- Changes to `RULEBOOK.md` (unless it affects development workflow)
- Changes to `Brand Guidelines/` (those are design assets, not code)

**Format:**
```
## [vX.Y.Z] — YYYY-MM-DD HH:MM

### Feature / Fix / Logic / UI / DB / Build / Refactor / Security / Perf
- Short description of what changed and why. File: `path/to/file.js:lineNumber`
```

**Version bumping:**
- **Patch (1.2.X):** Bug fixes, minor UI tweaks, small logic changes
- **Minor (1.X.0):** New features, new tabs, new DB tables, significant UI additions
- **Major (X.0.0):** Breaking changes, full rewrites, fundamental behavior changes

---

### 1.2 DEV_LOG.md

**Rule:** Start a new session entry at the beginning of every significant development session.

**Log these:**
- What was attempted and what was completed
- Key decisions made and why (these decay from memory — capture them)
- Blockers encountered
- Gotchas discovered about the codebase
- Ideas for future improvements
- What to tackle in the next session

**Format:**
```
### YYYY-MM-DD | Session NNN — Short Title

**By:** [Author / AI assistant name]
**Version:** vX.Y.Z → vX.Y.Z (or same if no version bump)
**Status:** In Progress / Done / Blocked

**Done:**
- bullet list

**Decisions:**
- bullet list

**Blockers:**
- bullet list

**Notes:**
- bullet list

**Next:**
- bullet list
```

---

### 1.3 NAVIGATION_LOG.md

**Rule:** Update NAVIGATION_LOG.md whenever any of the following happen:
- A new file is added to the project
- A new major function is added
- A file's responsibility changes
- A new IPC channel is added
- A new database function is added
- An existing function is renamed or removed

**How:** Update the relevant section in NAVIGATION_LOG.md to reflect the new state. Also update the "Last updated" line at the bottom.

**Purpose:** This file is the map that lets any new person (or AI) understand the full project without reading every file. Keep it accurate.

---

## 2. VERSIONING

- Current version is always tracked at the top of `DEV_LOG.md`
- Version in `package.json` must match the current release version
- When building a new installer: update `package.json` version → run `npm run build` → commit
- Do not ship installers with version mismatch

---

## 3. CODE STANDARDS

### 3.1 JavaScript
- Use `const` and `let` — never `var`
- Use `async/await` over Promise `.then()` chains
- IPC handler names follow the pattern: `category-action` (e.g., `db-get-clients`, `save-config`)
- WebSocket message objects always have a `type` field as the first key

### 3.2 Database
- All DB operations go through `db.js` — never write SQL directly in `main.js` or renderers
- Add new functions to `db.js` when new queries are needed
- Test all new DB functions with `npm run seed` + manual check before committing

### 3.3 IPC
- All IPC channels must be declared in `preload.js` allowlist
- Renderer never gets raw Node.js access — always goes through `window.api`
- Two-way IPC uses `ipcMain.handle` + `window.api.invoke`
- One-way pushes from main use `webContents.send` + `window.api.on`

### 3.4 File Paths
- Always use `path.join()` for file path construction — never string concatenation
- User-facing paths use backslash style (Windows) but internal logic uses `path.join` (cross-platform safe)

### 3.5 CSS
- New UI elements must follow the existing dark theme tokens
- Background: `#121214` | Accent: `#997DFF` | Text: `#f3f3f5`
- Success: `#10b981` | Error: `#ef4444`
- No inline styles in HTML — all styles go in the `.css` file

---

## 4. DEVELOPMENT WORKFLOW

1. **Before starting:** Read the latest entry in `DEV_LOG.md` to orient yourself
2. **During development:** Make small, focused changes
3. **After a change:** Update `CHANGELOG.md` immediately
4. **Before stopping:** Write a session entry in `DEV_LOG.md`
5. **If a file's role changes:** Update `NAVIGATION_LOG.md`
6. **Before building an installer:** Bump version in `package.json` and log it

---

## 5. BUILD RULES

- **Never commit `dist/`** — installer artifacts belong to release tags, not commits
- Run `npm run rebuild` after changing Node.js native dependencies
- Build only on Windows 64-bit (electron-builder targets win/x64)
- Test the built installer on a clean machine before distributing
- Keep `dist/freeXan Setup 1.0.0.exe` only for historical reference — delete when no longer needed

---

## 6. CEP EXTENSION RULES

- CEP extension ID (`com.bloomx.freexan.link`) must never change — changing it breaks existing Premiere installs
- WebSocket port `4554` is hardcoded in both `main.js` and `cep-extension/ext.js` — if ever changed, update BOTH files and document in CHANGELOG
- Do not modify `CSInterface.js` — replace it wholesale with a newer Adobe-provided version if needed
- After changing CEP files, the app must re-install the extension. This happens automatically on next app launch (app overwrites `%APPDATA%/Adobe/CEP/extensions/freexan-link/`)

---

## 7. DATABASE RULES

- Never delete database columns in migrations — add new columns only (backwards compat)
- New tables require a migration in `db.js` `initDb()` using `IF NOT EXISTS`
- Seed data (`scripts/seed-db.js`) must be idempotent — safe to re-run
- To add new default clients: edit the `clients` array in `scripts/seed-db.js`

---

## 8. SECURITY RULES

- Never expose Node.js APIs directly to renderers — use `preload.js` bridge only
- Never trust renderer input for file system operations without path validation in `main.js`
- IPC channel allowlist in `preload.js` is the gating mechanism — only add channels that are genuinely needed
- Registry writes are limited to: CEP PlayerDebugMode + startup Run key only

---

## 9. BRAND RULES

- Refer to `Brand Guidelines/free_xan_complete_brand_guidelines.md` before any UI copy or design work
- Product name: **freeXan** (lowercase f, uppercase X, lowercase an) — never "FreeXan", "Freexan", or "freexan"
- Company: **BloomX** — not "Bloomx" or "BLOOMX"
- Positioning tagline: "invisible workflow infrastructure" — use this framing in UI text

---

## 10. COMMUNICATION STYLE

When talking to the project owner (Swastik), always use the language of a video editor — not a developer.

- Swastik is a professional Premiere Pro and After Effects user, not a software developer. He understands basic coding concepts but does not speak in developer terms daily.
- Use editing analogies where possible. A "database record" is a "saved entry". A "function" is a "step the app runs". A "bug" is "something that's broken". A "UI section" is "that part of the panel".
- Never use jargon like: IPC, contextBridge, async/await, DOM, handler, renderer, event listener, race condition, refactor, schema, migration, etc. — unless Swastik specifically asks for the technical detail.
- When describing what changed, describe it in terms of what the user *sees or experiences*, not what the code does internally. Example: say "the Save button now always works even if the template list fails to load" instead of "wrapped the async init in a try-catch before the event binding calls".
- When asking Swastik to test something, describe the exact steps the way a QA brief would — click this, look for that, check if X happens.

---

## 11. WHAT NOT TO DO

- Do not add features or abstractions beyond what the current task requires
- Do not add error handling for scenarios that cannot happen in normal use
- Do not add comments that explain what the code does — only comment WHY if non-obvious
- Do not use `axios` or `ffmpeg` until there is a real need (currently unused dependencies)
- Do not push to remote without explicit instruction from the project owner
- Do not modify `blank_template.prproj` — replace it with a proper template via the Settings tab

---

*Established: 2026-05-25 | Current Version: v1.2.0*
