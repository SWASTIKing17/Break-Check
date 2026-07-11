# MISTER BloomX — Feature Documentation

## Overview

MISTER BloomX is a motion graphics asset management plugin for Adobe Creative Cloud. It runs as a CEP (Common Extensibility Platform) panel inside **After Effects** and **Premiere Pro**, giving motion designers a centralized library of animations, effects, fonts, and keyframe data — all applicable to the timeline in a single click.

---

## Core Features

### 1. Asset Library Browser

The main UI is a searchable, filterable grid of motion graphics assets.

- **Asset Cards**: Each asset displays a preview thumbnail, name, type badge, and associated tags.
- **Asset Types supported**: Animations, Effects, Text Presets (all `.ffx` format), Fonts, and Keyframe data (`.json`).
- **Responsive Grid**: Cards reflow automatically using CSS auto-fill grid (`minmax(160px, 1fr)`), adapting to any panel width.
- **Dark UI**: Optimized for extended use inside dark-themed Adobe applications (primary background `#141414`, accent purple `#7c6cf5`).

---

### 2. Search and Filtering

- **Text Search**: Filter assets by name in real time.
- **Type Filter**: Dropdown to show only a specific asset type (Animation, Effect, Font, Keyframe, etc.).
- **Tag Filters**: Filter by tags attached to each asset for faster discovery.
- **Sync Button**: Manually trigger a sync with the FreeXan database to pull in the latest asset catalog.

---

### 3. One-Click Asset Application

Assets are applied directly to the active composition or timeline via the **Apply** button on each card. The bridge script (`apply_asset.jsx`) handles three distinct application flows:

| Asset Type | Application Method |
|---|---|
| Animation / Effect / Text Preset | `applyPreset()` — applies the `.ffx` file natively via After Effects' preset API |
| Font | Replaces `fontFamily` on the selected text layer's `Source Text` property |
| Keyframe Data | Rebuilds saved keyframe values and interpolation handles on the selected layer property |

**Validation**: Before applying, the bridge confirms that a composition is open and a layer is selected — surfacing a clear error if not.

---

### 4. Keyframe Serialization and Reuse

The keyframe engine (`serialize_keyframes.jsx`) enables saving complex motion data as portable JSON and reapplying it to any layer or project.

**Serialize (Export)**
- Iterates over the selected layer's Transform Group and Effect properties.
- Captures per-keyframe: time, value, interpolation type (linear / ease), and bezier temporal ease handles.
- Uses property `matchName` (locale-stable identifier) so serialized data works across language versions of After Effects.
- Handles multi-dimensional values (arrays for Position, Scale, Rotation) and color objects.
- Saves output as a `.json` file.

**Deserialize (Import)**
- Reads saved keyframe JSON.
- Finds each property on the target layer by `matchName`.
- Reconstructs keyframes at the exact saved times with original values and easing, using `prop.setValueAtTime()` and `prop.setTemporalEaseAtKey()`.

This feature enables **motion style reuse** — a signature ease curve or animation timing can be saved once and applied universally across projects.

---

### 5. FreeXan Integration — Live Client Database Sync

MISTER BloomX connects to **FreeXan** (the companion Electron desktop application) over a local WebSocket on **port 4554** (`ws://localhost:4554`) to read the client database in real time.

**What FreeXan exposes:**
- **Clients** — Studio/brand clients with names and initials
- **Funnels** — Marketing funnel contexts scoped per client
- **Assets** — Media presets (graphics, animations, SFX) scoped to client or funnel
- **Templates** — Premiere Pro project templates scoped to client/funnel
- **Audio Library** — Watched audio files with tags, favorites, use counts, and waveform peak data
- **Folder Structures** — Hierarchical folder templates with slot-type routing (video/audio/image)

**How the sync works:**
1. MISTER BloomX opens a WebSocket connection to FreeXan's server at `ws://localhost:4554`.
2. On connect, it requests the asset catalog relevant to the currently active project context.
3. FreeXan responds with JSON payloads from its local SQLite database.
4. The panel updates its library grid without requiring a page reload.
5. FreeXan pushes `audio_library_changed` events whenever the watched folders update — the panel refreshes automatically.

**No external dependency**: All data lives in FreeXan's local SQLite database (`%APPDATA%/freeXan/project-builder.db`). The integration works entirely offline over localhost.

---

### 6. Metadata Management

- **Modal Dialogs**: In-panel modals allow adding or editing asset metadata (name, type, tags) without leaving the application.
- **Toast Notifications**: Non-blocking success/error messages confirm operations like apply, sync, or save.
- **Drag-and-Drop**: A drag overlay provides visual feedback when assets are being repositioned or added via drag interactions.

---

### 7. PostgreSQL Database

A local PostgreSQL database (`misterbloomx`) backs the plugin's own data layer.

- Stores structured asset records, library catalogs, and panel-specific metadata.
- Complements the FreeXan WebSocket sync by caching asset state locally for fast panel startup.

---

## Panel Specifications

| Property | Value |
|---|---|
| Default Panel Size | 400 × 700 px |
| Minimum Size | 320 × 400 px |
| Maximum Size | 1200 × 1200 px |
| Compatible Apps | After Effects 22.0+, Premiere Pro 22.0+ |
| Plugin Version | 0.1.0 |
| UI Framework | React + Vite (compiled) |
| Scripting Bridge | Adobe ExtendScript (.jsx) |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Panel UI | React, CSS3, Adobe CEP / CSXS |
| Host Scripting | Adobe ExtendScript |
| Build Tool | Vite |
| Local Database | PostgreSQL |
| Client Database Source | FreeXan (Electron app) via WebSocket `ws://localhost:4554` |
| Runtime | Adobe CEF (Chromium Embedded Framework) |
