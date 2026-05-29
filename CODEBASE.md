# Premiere Pro Project Builder — Codebase Documentation

## What This App Does

An Electron desktop utility that automates Adobe Premiere Pro project creation and media import. It sits in the system tray, watches for Premiere's Welcome Screen, pops up a builder UI to scaffold new projects, and provides a floating overlay for drag-and-drop media import directly into the active Premiere project.

---

## Architecture Overview

```
User ──► Main Window UI (renderer/index.html)
              │
              ▼
         main.js (Electron Main Process)
         ├── IPC handlers (project creation, config, file import)
         ├── WebSocket Server :4554 ──► CEP Panel (Premiere Plugin)
         ├── PowerShell poll (2.5s) ──► window title → project path
         └── System Tray

         Overlay Window (renderer/overlay.html)
         ├── Floating drag-drop pill (always on top)
         └── Passes mouse through to Premiere when not dragging

         CEP Extension (cep-extension/)
         ├── Runs inside Adobe Premiere Pro
         ├── Polls active project path every 1.5s
         └── Calls ExtendScript to import files into Premiere bins
```

---

## File Map

| File | Role |
|------|------|
| `main.js` | Electron main process. App lifecycle, IPC handlers, WebSocket server, PowerShell monitor, CEP auto-install. ~627 lines. |
| `preload.js` | IPC bridge with context isolation. Intercepts file drops, exposes `window.api`. ~65 lines. |
| `renderer/index.html` | Main window HTML (800×600). Two tabs: Builder + Settings. |
| `renderer/app.js` | Main window JS. Form logic, live preview, settings persistence. |
| `renderer/styles.css` | Dark theme, purple accent (`#997DFF`). |
| `renderer/overlay.html` | Floating overlay HTML (56×56 idle → 244×84 on drag). |
| `renderer/overlay.js` | Overlay JS. Drag state machine, expand/collapse, feedback toasts. |
| `renderer/overlay.css` | Overlay styling, drag states, animations. |
| `cep-extension/panel.html` | Premiere panel UI (connection status, project name). |
| `cep-extension/ext.js` | CEP panel JS. WebSocket client, project polling, import handler. |
| `cep-extension/hostscript.jsx` | ExtendScript. `importAsset(filePath)` → `app.project.importFiles()`. |
| `cep-extension/CSInterface.js` | Adobe CEP bridge library (vendor). |
| `cep-extension/CSXS/manifest.xml` | CEP extension metadata. Bundle ID: `com.swastik.projectbuilder.link`. PPRO 14.0+. |
| `blank_template.prproj` | Default Premiere template used when no custom template is set. |
| `package.json` | App metadata + dependencies. |

---

## Entry Points

- **Start app:** `npm start` → `electron main.js`
- **Main window:** loads `renderer/index.html`
- **Overlay window:** loads `renderer/overlay.html`, created lazily on demand
- **CEP extension:** auto-installed to `%APPDATA%/Adobe/CEP/extensions/project-builder-link` on app start

---

## Key Flows

### 1. Project Creation
```
Builder form submit
  → main.js createProject() IPC handler
  → mkdir: ClientInitials - FunnelName - ProjectName/
  → mkdir: 01_Project_Files, 02_Footage, 03_Audio, 04_Assets, 05_Exports
  → copy template .prproj (custom or blank_template.prproj)
  → write README.md with metadata
  → shell.openPath() opens project in Premiere
```

### 2. Active Project Detection
```
setInterval 2.5s
  → PowerShell: get window title "Adobe Premiere Pro 2025 - [path]"
  → extract project path from title
  → updateOverlayUI() → IPC overlay-update → overlay.js
  → overlay shows project name + green status dot
```

Fallback: CEP panel polls `app.project.path` via ExtendScript every 1.5s and sends it over WebSocket.

### 3. Media Import via Overlay
```
User drags files over overlay pill
  → 500ms hover → pill expands to 244px
  → drop event
  → preload.js: webUtils.getPathForFile() → disk paths
  → main.js importDroppedFiles() IPC handler
  → map extensions to subfolders:
      video (mp4/mov/mxf…) → 02_Footage
      audio (mp3/wav/aiff…) → 03_Audio
      image (jpg/png/psd…)  → 04_Assets
      fallback: numeric prefix match (02_, 03_…)
  → fs.copyFile() with conflict resolution (auto-increment)
  → WebSocket broadcast to CEP panel
  → CEP ext.js: importAsset() ExtendScript call
  → app.project.importFiles() adds to active Premiere bin
  → overlay shows "Imported N" → fades after 2.2s
```

---

## Configuration

Stored at `%APPDATA%/Roaming/project-builder-link/config.json`:

```json
{
  "targetDir": "C:/Projects",
  "templateFile": "C:/path/to/template.prproj",
  "folderStructure": ["01_Project_Files", "02_Footage", "03_Audio", "04_Assets", "05_Exports"],
  "autoPopup": true
}
```

Edited via the Settings tab in the main window. Loaded on startup via `getConfig` IPC.

---

## IPC API (preload.js → main.js)

| Channel | Direction | Description |
|---------|-----------|-------------|
| `save-config` | renderer→main | Persist config JSON |
| `get-config` | renderer→main | Load config JSON |
| `create-project` | renderer→main | Run project creation pipeline |
| `select-directory` | renderer→main | Open native folder picker |
| `select-file` | renderer→main | Open native file picker |
| `import-dropped-files` | renderer→main | Copy dropped files to project subfolders |
| `set-ignore-mouse-events` | renderer→main | Toggle overlay mouse passthrough |
| `move-overlay-window` | renderer→main | Reposition overlay by delta |
| `resize-overlay` | renderer→main | Change overlay window size |
| `open-folder` | renderer→main | shell.openPath() |
| `close-window` | renderer→main | Close the calling window |
| `minimize-window` | renderer→main | Minimize the calling window |
| `overlay-update` | main→overlay | Push project name + connection state |
| `files-dropped` | main→overlay | Notify overlay of file drop result |

---

## WebSocket Protocol (port 4554)

Messages are JSON strings.

**main → CEP:**
```json
{ "type": "project-sync", "projectPath": "/path/to/project.prproj" }
{ "type": "import", "filePath": "/path/to/file.mp4" }
```

**CEP → main:**
```json
{ "type": "project-path", "path": "/path/to/project.prproj" }
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| App framework | Electron 30 |
| WebSocket | ws 8.20 |
| HTTP client | axios 1.16 (currently unused) |
| FFmpeg | @ffmpeg-installer/ffmpeg (currently unused) |
| Premiere automation | Adobe CEP + ExtendScript (JSX) |
| CEP compatibility | CSXS 9.0–12.0 (Premiere 2024+) |

---

## UI Design Tokens

| Token | Value |
|-------|-------|
| Background | `#121214` |
| Accent (purple) | `#997DFF` |
| Text | `#f3f3f5` |
| Success | `#10b981` |
| Error | `#ef4444` |
| Window size (main) | 800×600 |
| Overlay idle | 56×56px pill |
| Overlay drag | 244×84px |

Frameless window with custom titlebar controls. Glassmorphism cards (backdrop-filter blur).

---

## CEP Extension Details

- **Bundle ID:** `com.swastik.projectbuilder.link`
- **Install path:** `%APPDATA%/Adobe/CEP/extensions/project-builder-link/`
- **Host:** Adobe Premiere Pro 14.0+ (2024+)
- **Auto-visible:** true on Premiere activation
- **Debug mode:** main.js writes `PlayerDebugMode=1` to HKCU registry keys for CSXS 9–12 on startup

---

## Known Unused Dependencies

- `axios` — imported but no HTTP calls are made
- `@ffmpeg-installer/ffmpeg` — installed but no FFmpeg usage found in source
