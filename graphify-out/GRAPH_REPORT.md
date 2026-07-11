# Graph Report - .  (2026-06-04)

## Corpus Check
- 59 files · ~273,266 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 571 nodes · 736 edges · 52 communities (36 shown, 16 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 57 edges (avg confidence: 0.89)
- Token cost: 37,000 input · 8,400 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Builder UI Event Handlers|Builder UI Event Handlers]]
- [[_COMMUNITY_Electron Main Process|Electron Main Process]]
- [[_COMMUNITY_Project Config & Build|Project Config & Build]]
- [[_COMMUNITY_Initialize Flow UI|Initialize Flow UI]]
- [[_COMMUNITY_CEP Audio Extension|CEP Audio Extension]]
- [[_COMMUNITY_Audio Database Layer|Audio Database Layer]]
- [[_COMMUNITY_Picker & Modal Components|Picker & Modal Components]]
- [[_COMMUNITY_SQLite Data Layer|SQLite Data Layer]]
- [[_COMMUNITY_DB Seed Scripts|DB Seed Scripts]]
- [[_COMMUNITY_CEP WebSocket Bridge|CEP WebSocket Bridge]]
- [[_COMMUNITY_Runtime State & Errors|Runtime State & Errors]]
- [[_COMMUNITY_Brand Visual Identity|Brand Visual Identity]]
- [[_COMMUNITY_Database Event Handlers|Database Event Handlers]]
- [[_COMMUNITY_UI Refresh Functions|UI Refresh Functions]]
- [[_COMMUNITY_Audio Feature Roadmap|Audio Feature Roadmap]]
- [[_COMMUNITY_Architecture & Standards|Architecture & Standards]]
- [[_COMMUNITY_Overlay Pill UI|Overlay Pill UI]]
- [[_COMMUNITY_Suggestion Column Scripts|Suggestion Column Scripts]]
- [[_COMMUNITY_Config & Preview Helpers|Config & Preview Helpers]]
- [[_COMMUNITY_Find Suggestions Script|Find Suggestions Script]]
- [[_COMMUNITY_Audio Panel HTML & UX|Audio Panel HTML & UX]]
- [[_COMMUNITY_Codebase Architecture Docs|Codebase Architecture Docs]]
- [[_COMMUNITY_Feature Guide Docs|Feature Guide Docs]]
- [[_COMMUNITY_Folder Template Editor|Folder Template Editor]]
- [[_COMMUNITY_CEP Hostscript ExtendScript|CEP Hostscript ExtendScript]]
- [[_COMMUNITY_Builder Dropdown Helpers|Builder Dropdown Helpers]]
- [[_COMMUNITY_Future Updates Roadmap|Future Updates Roadmap]]
- [[_COMMUNITY_Brand & Color Palette|Brand & Color Palette]]
- [[_COMMUNITY_CEP Panel & WebSocket Docs|CEP Panel & WebSocket Docs]]
- [[_COMMUNITY_Changelog Versions|Changelog Versions]]
- [[_COMMUNITY_Column Processing Scripts|Column Processing Scripts]]
- [[_COMMUNITY_Claude Settings & Permissions|Claude Settings & Permissions]]
- [[_COMMUNITY_Electron Builder Config|Electron Builder Config]]
- [[_COMMUNITY_FT Tree Node Helpers|FT Tree Node Helpers]]
- [[_COMMUNITY_Project Memory State|Project Memory State]]
- [[_COMMUNITY_Renderer Index HTML|Renderer Index HTML]]
- [[_COMMUNITY_Overlay State|Overlay State]]
- [[_COMMUNITY_IPC Channel Bridge|IPC Channel Bridge]]
- [[_COMMUNITY_Dev Log Entries|Dev Log Entries]]
- [[_COMMUNITY_Screenshot UI States|Screenshot UI States]]
- [[_COMMUNITY_Sequence Config|Sequence Config]]
- [[_COMMUNITY_Drag Drop Import|Drag Drop Import]]
- [[_COMMUNITY_Template Resolver|Template Resolver]]
- [[_COMMUNITY_Rulebook Policy|Rulebook Policy]]
- [[_COMMUNITY_Error Log Output|Error Log Output]]
- [[_COMMUNITY_Audio Output Log|Audio Output Log]]
- [[_COMMUNITY_CEP Manifest|CEP Manifest]]
- [[_COMMUNITY_Brand Logo SVG|Brand Logo SVG]]
- [[_COMMUNITY_Preset Architecture|Preset Architecture]]
- [[_COMMUNITY_Misc Singleton|Misc Singleton]]

## God Nodes (most connected - your core abstractions)
1. `Audio freeXan UI/UX Specification` - 11 edges
2. `connectWebSocket()` - 10 edges
3. `scripts` - 8 edges
4. `escapeAttr()` - 8 edges
5. `selectFtsTemplate()` - 8 edges
6. `preload.js window.api contextBridge` - 8 edges
7. `Audio freeXan Feature List` - 8 edges
8. `Premiere Pro Project Builder Codebase Documentation` - 8 edges
9. `refreshDatabaseTab()` - 7 edges
10. `updatePreviews()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `getDb()` --semantically_similar_to--> `getDb()`  [INFERRED] [semantically similar]
  db.js → audioDb.js
- `ext.js startProjectTracking` --semantically_similar_to--> `startPremiereMonitor()`  [INFERRED] [semantically similar]
  cep-extension/ext.js → main.js
- `Drag-and-Drop Direct to Timeline` --semantically_similar_to--> `Media Import via Overlay Pipeline`  [INFERRED] [semantically similar]
  Audio FreeXan Feature List.md → CODEBASE.md
- `freeXan Brand Color Palette` --semantically_similar_to--> `UI Design Tokens`  [INFERRED] [semantically similar]
  Brand Guidelines/free_xan_complete_brand_guidelines.md → CODEBASE.md
- `resolveVars()` --semantically_similar_to--> `resolveVars()`  [INFERRED] [semantically similar]
  main.js → renderer/app.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Audio Library Pipeline: DB + Watcher + CEP UI** — audiodb_audioapi, audiowatcher_initwatchers, cep_audio_renderaudiolist, main_startwebsocketserver [INFERRED 0.95]
- **Premiere Project Setup: WebSocket → CEP → ExtendScript** — main_startwebsocketserver, cep_ext_connectwebsocket, cep_ext_setupfrompremiertree, cep_ext_waitforprojectready [INFERRED 0.95]
- **Renderer → Preload → IPC → Main → DB chain** — preload_windowapi, db_clientsapi, db_funnelsapi, db_tasksapi [EXTRACTED 1.00]
- **Mandatory Log Maintenance Triad (CHANGELOG + DEV_LOG + NAVIGATION_LOG)** — logs_changelog, logs_dev_log, logs_navigation_log [EXTRACTED 1.00]
- **Audio freeXan Feature Specification Pipeline (Feature List + UX Spec + CEP Panel)** — audio_freexan_feature_list_audio_freexan, docs_audio_ux_spec, cep_audio_html_audio_panel [INFERRED 0.85]
- **Project Creation Documentation Triad (CODEBASE + FEATURE_GUIDE + NAVIGATION_LOG)** — codebase_project_creation_flow, docs_feature_guide_project_creation_pipeline, logs_navigation_log_main_js_map [INFERRED 0.75]

## Communities (52 total, 16 thin omitted)

### Community 0 - "Builder UI Event Handlers"
Cohesion: 0.01
Nodes (115): btnBrowseAsset, btnBrowseTemplate, btnClose, btnCloseManage, btnDbAddAsset, btnDbAddClient, btnDbAddFunnel, btnDbAddTask (+107 more)

### Community 1 - "Electron Main Process"
Cohesion: 0.06
Nodes (21): { app, BrowserWindow, ipcMain, dialog, Menu, Tray, shell, nativeImage }, appConfig, audioDb, audioWatcher, axios, configPath, createOverlayWindow(), db (+13 more)

### Community 2 - "Project Config & Build"
Cohesion: 0.06
Nodes (31): delay, exec, ext, ignore, watch, author, dependencies, axios (+23 more)

### Community 3 - "Initialize Flow UI"
Cohesion: 0.08
Nodes (30): Client > Funnel > Task Selection Hierarchy, Initialize Flow — Core Project Creation Workflow, Settings Configuration — Target Directory and Template, Builder Tab — Initialize Flow Panel, freeXan CEP Panel Inside Premiere Pro, Folder Hierarchy Preview — Autogenerated Panel, freeXan Idle Startup Layout — Builder Tab, Default Target Directory Setting (+22 more)

### Community 4 - "CEP Audio Extension"
Cohesion: 0.17
Nodes (23): connectWebSocket(), csInterface, drawWaveform(), extLog(), importAudioToPremiere(), initAudioLibraryUI(), pauseAudio(), playAudio() (+15 more)

### Community 5 - "Audio Database Layer"
Cohesion: 0.12
Nodes (19): { app }, audioApi, Database, foldersApi, getDb(), initSchema(), path, AUDIO_EXTS (+11 more)

### Community 6 - "Picker & Modal Components"
Cohesion: 0.15
Nodes (20): addPremiereBin(), buildAssetPicker(), buildSlotPicker(), _closePicker(), closeSeqModal(), confirmAddSequence(), enterFtsEditMode(), exitFtsEditMode() (+12 more)

### Community 7 - "SQLite Data Layer"
Cohesion: 0.19
Nodes (17): Electron Context Isolation + IPC Security Bridge, SQLite In-place Schema Migration Pattern, { app }, assetsApi, autoFillInitials(), clientsApi, Database, deriveInitials() (+9 more)

### Community 8 - "DB Seed Scripts"
Cohesion: 0.12
Nodes (15): clientIdCol, clients, cols, Database, dbPath, findClient, findFunnel, funnels (+7 more)

### Community 9 - "CEP WebSocket Bridge"
Cohesion: 0.19
Nodes (15): audio.js connectWebSocket, audio.js importAudioToPremiere, audio.js initAudioLibraryUI, audio.js requestAudioLibrary, CEP CSInterface, ext.js connectWebSocket, ext.js finalizeImportBatch, ext.js setupFromPremiereTree (+7 more)

### Community 10 - "Runtime State & Errors"
Cohesion: 0.20
Nodes (14): Database Tab — Default Template Folder Structure Editor, EADDRINUSE Error — Port Already In Use Crash, Folder Hierarchy Autogenerated — Project Structure Preview, Initialize Flow — Builder Tab Client+Funnel+Task UI, New Sequence Modal — Name, Dimensions, Frame Rate, Premiere Pro Bin — Audios (SFX/BGM) and Sequences, Sequence Binding Debug Log — rootitem/bin retry logic, WebSocket Port 4554 — freeXan/Premiere Bridge (+6 more)

### Community 11 - "Brand Visual Identity"
Cohesion: 0.26
Nodes (13): Brand Color: Deep Black #0B0B12, Brand Color: Light Violet #B084FF, Brand Color: Primary Purple #7B4DFF, freeXan Visual Identity System, freeXan Master Logo SVG, freeXan App Icon (Dark Background), freeXan Brand Logo Sheet, freeXan Taskbar / Mark-Only Icon (+5 more)

### Community 12 - "Database Event Handlers"
Cohesion: 0.17
Nodes (13): bindDatabaseEvents(), bindPathInputDrop(), clientHue(), enterAssetEdit(), enterClientEdit(), enterFunnelEdit(), enterFunnelGroupEdit(), enterTaskEdit() (+5 more)

### Community 13 - "UI Refresh Functions"
Cohesion: 0.15
Nodes (13): makeFunnelGroupRow(), makeFunnelRow(), populateClientSelect(), refreshAssetsList(), refreshDatabaseTab(), refreshFunnelsList(), refreshTasksList(), refreshTemplatesList() (+5 more)

### Community 14 - "Audio Feature Roadmap"
Cohesion: 0.29
Nodes (11): Audio freeXan Feature List, Smart BGM vs SFX Import Routing, Waveform Peak Marker & BPM Visualizer, Core Audio Explorer Features, Drag-and-Drop Direct to Timeline, Smart Project Metadata Tagging & Client Profiles, Timeline Playback Sync (Spacebar Sync Play), Waveform Color-Coding by Classification (+3 more)

### Community 15 - "Architecture & Standards"
Cohesion: 0.24
Nodes (11): freeXan Architecture at a Glance, freeXan Project Context for Claude Code, IPC Security Bridge Pattern (preload.js window.api), RULEBOOK — freeXan Development Standards, Code Standards (JS, DB, IPC, CSS), Database Rules (migrations, idempotent seed), Log Maintenance Policy (CHANGELOG + DEV_LOG + NAVIGATION_LOG), Security Rules (no direct Node.js to renderer) (+3 more)

### Community 16 - "Overlay Pill UI"
Cohesion: 0.33
Nodes (7): clearStates(), hasProject(), restoreIdle(), setDragActive(), setError(), setProcessing(), setSuccess()

### Community 17 - "Suggestion Column Scripts"
Cohesion: 0.20
Nodes (7): filePath, fs, inFence, lines, out, path, raw

### Community 18 - "Config & Preview Helpers"
Cohesion: 0.22
Nodes (9): resolveVars(), animatePreviewValue(), getSelectedClientData(), loadAndApplyConfig(), refreshBuilderTree(), renderBuilderTree(), resolveVars(), savePathSettings() (+1 more)

### Community 19 - "Find Suggestions Script"
Cohesion: 0.25
Nodes (8): filePath, findings, fs, inFence, isSep(), lines, path, splitRow()

### Community 20 - "Audio Panel HTML & UX"
Cohesion: 0.25
Nodes (8): Audio freeXan CEP Panel HTML, Pitch and Speed Modifier Controls, Audio Trim Sliders (Start/End), Waveform Canvas Player UI, Detail Preview Drawer UX (Audio Explorer), DEV LOG — freeXan Development Journal, Session 050 — Big UX Pass, Session 051 — Standalone Audio Library Panel

### Community 21 - "Codebase Architecture Docs"
Cohesion: 0.25
Nodes (8): Active Project Detection (PowerShell + CEP fallback), Premiere Pro Project Builder Codebase Documentation, IPC API Channels (preload to main), Media Import via Overlay Pipeline, Project Creation Flow, freeXan Tech Stack, UI Design Tokens, freeXan Project Architecture Visualizer

### Community 22 - "Feature Guide Docs"
Cohesion: 0.25
Nodes (8): freeXan User-Facing Feature Guide, Builder Tab Features (Initialize Flow), Folder Structure Templates Editor, Overlay Pill UI & Behaviors, Project Creation Pipeline Behaviors, Template Resolution Priority (7-level cascade), renderer/overlay.html Drag-Drop Overlay, Overlay Pill State Machine

### Community 23 - "Folder Template Editor"
Cohesion: 0.25
Nodes (8): ftBuildSavePayload(), loadFolderTemplates(), loadFtTemplateData(), refreshFtAssignFunnels(), renderAssignments(), renderFtTree(), saveFolderTemplate(), showStatusMessage()

### Community 25 - "Builder Dropdown Helpers"
Cohesion: 0.47
Nodes (6): closeManagePanel(), fillSelectWithInitials(), loadBuilderDropdowns(), refreshFunnelDropdown(), refreshTaskDropdownForPair(), saveManagedTasks()

### Community 26 - "Future Updates Roadmap"
Cohesion: 0.40
Nodes (5): FUTURE UPDATES — freeXan Planned Features, Browser Image Drag-Drop (Shipped v1.3.0), Proxy Generation on Drop (Planned), Recent Projects Quick-Launch (Planned), Smart Bins in Premiere (Planned)

### Community 27 - "Brand & Color Palette"
Cohesion: 0.50
Nodes (4): freeXan Brand Color Palette, freeXan Complete Brand Guidelines, Invisible Infrastructure Positioning, Audio Panel Visual Palette

### Community 28 - "CEP Panel & WebSocket Docs"
Cohesion: 0.50
Nodes (4): CEP Panel Connection Status Indicator, Link freeXan CEP Panel HTML, WebSocket Protocol Port 4554, CEP Extension Rules

### Community 29 - "Changelog Versions"
Cohesion: 0.50
Nodes (4): CHANGELOG — freeXan Version History, Changelog v2.5.0 — Defensive Audit Fix Pass, Changelog v2.6.0 — Big UX Pass, Changelog v2.7.0 — Audio Library Panel

### Community 30 - "Column Processing Scripts"
Cohesion: 0.67
Nodes (3): PowerShell Table Column Adder, scripts/add-suggestion-columns.js, scripts/find-suggestions.js

### Community 32 - "Electron Builder Config"
Cohesion: 0.67
Nodes (3): electron-builder.yml Build Config, ASAR Unpack Native Modules Config, NSIS Installer Configuration

### Community 33 - "FT Tree Node Helpers"
Cohesion: 0.67
Nodes (3): ftAddAssetNode(), ftAddFolderNode(), ftNextTempId()

### Community 34 - "Project Memory State"
Cohesion: 0.67
Nodes (3): loadProjectMemory(), _projectMemoryKey(), saveProjectMemory()

### Community 35 - "Renderer Index HTML"
Cohesion: 0.67
Nodes (3): renderer/index.html Main Window UI, Sidebar Navigation (Builder/Settings/Database), Custom Frameless Titlebar

## Knowledge Gaps
- **252 isolated node(s):** `allow`, `Database`, `path`, `{ app }`, `fs` (+247 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `resolveVars()` connect `Config & Preview Helpers` to `Builder UI Event Handlers`?**
  _High betweenness centrality (0.127) - this node is a cross-community bridge._
- **Why does `resolveVars()` connect `Config & Preview Helpers` to `Electron Main Process`?**
  _High betweenness centrality (0.126) - this node is a cross-community bridge._
- **Why does `startWebSocketServer()` connect `Electron Main Process` to `CEP WebSocket Bridge`, `Audio Database Layer`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `connectWebSocket()` (e.g. with `importAudioToPremiere()` and `renderAudioList()`) actually correct?**
  _`connectWebSocket()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `allow`, `Database`, `path` to the rest of the system?**
  _259 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Builder UI Event Handlers` be split into smaller, more focused modules?**
  _Cohesion score 0.014285714285714285 - nodes in this community are weakly interconnected._
- **Should `Electron Main Process` be split into smaller, more focused modules?**
  _Cohesion score 0.06190476190476191 - nodes in this community are weakly interconnected._