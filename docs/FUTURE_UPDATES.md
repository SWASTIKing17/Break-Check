# FUTURE UPDATES — freeXan by BloomX

Planned improvements to be built one by one.  
Check off each item when work begins and when it ships.  
**Created:** 2026-05-25 | **Base Version:** v1.2.1

---

## Status Key

| Symbol | Meaning |
|---|---|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Shipped |

---

## Priority 1 — High Impact, Fits Existing Architecture

- [ ] **Recent Projects Quick-Launch**
  - Show last 5–8 created projects in the Builder tab
  - Click to open the folder or reopen `.prproj` in Premiere
  - Store project history in the SQLite DB (new `projects` table)
  - Files: `db.js`, `main.js`, `renderer/app.js`, `renderer/index.html`

- [x] **Browser Image Drag-Drop — Download & Convert to Premiere** *(shipped v1.3.0 — 2026-05-25)*
  - Drag any image directly from a browser tab onto the overlay pill
  - Detect browser drag (URL in `text/uri-list` or raw `image/*` data) vs local file drop
  - Download image via `axios` (already installed, currently unused)
  - Detect format and auto-convert unsupported formats to PNG using `ffmpeg` (already installed, currently unused):
    - `.webp` → `.png`
    - `.avif` → `.png`
    - `.heic` / `.heif` → `.jpeg`
    - `.svg` → `.png` (rasterized at 4K)
    - `.jpeg`, `.png`, `.tiff`, `.bmp`, `.gif` → pass through as-is (Premiere supports natively)
  - Save to project's `04_Assets` folder with conflict resolution
  - Auto-import into active Premiere bin via existing WebSocket → CEP pipeline
  - Filename derived from URL path segment; fallback: `browser-import-YYYYMMDD-HHMMSS.png`
  - Show download + conversion progress in overlay pill (downloading… → converting… → imported!)
  - Files: `preload.js` (capture `text/uri-list` from dataTransfer), `renderer/overlay.js` (detect URL vs file drop), `main.js` → new `import-browser-image` IPC handler, `renderer/overlay.css` (progress states)
  - No new dependencies needed — `axios` + `ffmpeg` both already in `package.json`

- [ ] **Proxy Generation on Drop**
  - On file drop, auto-generate half-res H.264 proxy into `Proxies/` subfolder
  - Wire up `@ffmpeg-installer/ffmpeg` (already installed, currently unused)
  - Run ffmpeg in background, show progress in overlay pill
  - Files: `main.js` → `import-dropped-files` handler, `renderer/overlay.js`

- [ ] **Smart Bins in Premiere**
  - On import, auto-create bins inside Premiere matching subfolder names (`02_Footage`, `03_Audio`, etc.)
  - Extend `hostscript.jsx` — add bin creation calls using `app.project.rootItem`
  - Files: `cep-extension/hostscript.jsx`, `cep-extension/ext.js`

- [ ] **Project Status Tracking**
  - Add `status` field to DB: `In Progress` / `Review` / `Delivered` / `Archived`
  - New "Projects" tab in main window with filter by client and status
  - Files: `db.js`, `main.js`, `renderer/app.js`, `renderer/index.html`

- [ ] **Export Naming Enforcer**
  - Show expected export filename for the active project in overlay or panel
  - Format: `[ClientInitials]_[Funnel]_[Task]_v01_EXPORT.mp4`
  - Derives values from DB using the active project path
  - Files: `main.js`, `renderer/overlay.js`, `cep-extension/panel.html`

---

## Priority 2 — Medium Impact, Needs New Work

- [ ] **Per-Client LUT / Color Preset Auto-Import**
  - Store a LUT file path per client in the assets DB
  - Auto-import LUT into Premiere on project creation or first drop
  - Files: `db.js`, `main.js` → `create-project` handler, `cep-extension/hostscript.jsx`

- [ ] **Project Archive / Zip on Delivery**
  - One-click archive: zip project folder (skip `02_Footage` to save space)
  - Move archive to a configurable `Archive/` path
  - Add "Archive" button to Project Status tab
  - Files: `main.js`, `renderer/app.js`

- [ ] **Batch Project Creation**
  - CSV/paste input: list of project names + client/funnel combos
  - Create all projects in one shot
  - Files: `main.js` → new `batch-create-projects` handler, `renderer/app.js`, `renderer/index.html`

- [ ] **Deadline + Notes per Project**
  - Attach a due date and text note to each project (stored in DB)
  - Highlight overdue projects in the Projects tab
  - Files: `db.js`, `renderer/app.js`

---

## Priority 3 — Low-Effort Polish

- [ ] **Overlay Pin to Any Corner**
  - Let editors drag/pin the overlay pill to any screen corner, not just top-left
  - Persist last position across sessions
  - Files: `renderer/overlay.js`, `main.js` → `move-overlay-window`

- [ ] **Global Keyboard Shortcut to Toggle Builder**
  - `Ctrl+Shift+F` shows/hides main window even when Premiere is focused
  - Uses Electron `globalShortcut` (built-in, no new deps)
  - Files: `main.js` → `app.whenReady()`

- [ ] **Thumbnail Preview on Drop**
  - Show a frame thumbnail of the dropped video in the overlay success state
  - Extract frame via ffmpeg in under 1s
  - Files: `main.js` → `import-dropped-files`, `renderer/overlay.js`, `renderer/overlay.css`

---

## Completed

> Items move here once shipped, with version and date.

| Feature | Version | Date |
|---|---|---|
| Browser Image Drag-Drop — Download & Convert to Premiere | v1.3.0 | 2026-05-25 |

---

*Last updated: 2026-05-25 — Added: Browser Image Drag-Drop*
