# freeXan — Project Context for Claude Code

**App:** freeXan by BloomX  
**Type:** Electron 30 desktop app (Windows 64-bit)  
**Purpose:** Invisible workflow infrastructure for Adobe Premiere Pro — automates project creation, folder structure, template copying, and drag-drop media import directly into active Premiere projects.  
**Current Version:** v1.2.0  
**Owner:** Swastik / BloomX

---

## Mandatory: Read Before Any Work

Before starting any task, read:
1. `docs/PROJECT_MEMORY.md` — authoritative source of truth and complete ecosystem overview
2. `DEV_LOG.md` — latest session entry to understand current state
3. `NAVIGATION_LOG.md` — to locate the files and functions relevant to your task
4. `RULEBOOK.md` — for all coding standards and policies

---

## Mandatory: Log Maintenance

After EVERY code change or investigation, you MUST:

1. **Update `docs/PROJECT_MEMORY.md`** — if any reference, architecture, or tool is missing or modified, enrich and update this source of truth immediately
2. **Update `CHANGELOG.md`** — log every change (feature, fix, logic, UI, DB, build) with version and timestamp
3. **Update `DEV_LOG.md`** — write a session entry describing what was done, decisions made, and what's next
4. **Update `NAVIGATION_LOG.md`** — if you added/changed/removed a file or major function, update its entry in the navigation map

**These are not optional.** See `RULEBOOK.md` Section 1 for exact format.


---

## Architecture at a Glance

| File | Role |
|---|---|
| `main.js` | Electron main process — IPC, WebSocket, project creation, file import, window management |
| `preload.js` | IPC security bridge — exposes `window.api` to renderers |
| `db.js` | SQLite layer — all database functions |
| `renderer/index.html` + `app.js` | Main window UI — Builder, Settings, Database tabs |
| `renderer/overlay.html` + `overlay.js` | Floating drag-drop pill overlay |
| `cep-extension/ext.js` | CEP WebSocket client running inside Premiere Pro |
| `cep-extension/hostscript.jsx` | ExtendScript — calls Premiere Pro API |
| `scripts/seed-db.js` | One-shot DB seeder (`npm run seed`) |

Full details in `NAVIGATION_LOG.md`.

---

## Key Technical Facts

- IPC: all renderer→main communication goes through `preload.js` `window.api` bridge (context isolation enabled)
- WebSocket port: `4554` — hardcoded in both `main.js` and `cep-extension/ext.js`
- Config file: `%APPDATA%/Roaming/project-builder-link/config.json`
- Database file: `%APPDATA%/freeXan/project-builder.db`
- CEP extension ID: `com.bloomx.freexan.link` — do NOT change this
- All DB operations must go through `db.js` functions — never raw SQL in other files
- File paths: always use `path.join()`, never string concatenation

---

## Brand

- Product name: **freeXan** (not FreeXan, not freexan)
- Company: **BloomX** (not Bloomx)
- Theme: `#121214` bg · `#997DFF` accent · `#f3f3f5` text · `#10b981` success · `#ef4444` error
- Tone: "invisible infrastructure" — tools that disappear into the workflow

---

## npm Scripts

| Command | What it does |
|---|---|
| `npm start` | Run in development |
| `npm run build` | Build Windows installer |
| `npm run seed` | Populate DB with default clients |
| `npm run rebuild` | Rebuild native modules after Node/Electron change |
