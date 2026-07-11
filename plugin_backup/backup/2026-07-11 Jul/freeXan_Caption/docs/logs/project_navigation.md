# Project Navigation - SubMachine

## Purpose
This document provides a map of the project structure for easy navigation.

## Directory Mapping

- `panel-src/src/tabs/params/ParamsView.tsx` & `ParamsView.css` & `utils.jsx` / `.js` & `mogrt_editor.jsx` / `.js`: [UPDATED 2026-07-02] Created on-demand diagnostic tool (`smDumpSelectedMogrtProperties` in `mogrt_editor.jsx` / `.js`) writing directly to `panel/logs/mogrt_param_fetch.log`. Removed automatic per-MOGRT logging inside `smParseClipParams` to prevent timeline scanning log spam. Added temporary **"📋 Log Props"** button beside the Reload button in `ParamsView.tsx`. Expanded JSON parsing across frontend and backend (`.textEditValue`, `.text`, `.value`, `.content`) and broadened keyword regexes. Resolved exact bug where clicking unselected word pills returned `total selected=0` due to `pm.value` vs `pm.val` lookup mismatch. Set `cursor: default !important;` on `.mpe-horizontal-phrase-card` (`ParamsView.css`).
- `panel-src/src/tabs/params/ParamsView.tsx` & `ParamsView.css`: [UPDATED 2026-07-02] Removed heavy bridge execution (`fetchParams()`) inside the `ctiSecs` playhead poller effect. Previously, every 500ms playhead tick fired `smGetSelectionParams` over the ExtendScript bridge during video playback, causing playback stutter and lagging the UI. Added exact playhead boundary detection (`ctiSecs + 0.001 >= matchingClip.start && ctiSecs < matchingClip.end`) to word progression pills inside horizontal phrase cards so the exact word bubble under the Premiere Pro playhead highlights dynamically in real time with `.cc-is-playhead` (cyan glowing border and pulse animation).
- `panel-src/src/tabs/params/ParamsView.tsx` & `ParamsView.css`: [UPDATED 2026-07-01] Replaced the mini timeline strip with exact horizontal phrase cards (`.mpe-horizontal-phrase-card`) matching the exact backend and frontend of the Edit Tab phrase card structure (`PhraseRow`). Cards are arranged horizontally side-by-side in a scrollable flex track (`.mpe-horizontal-phrases-track`). Each horizontal phrase card features the exact header meta row displaying the phrase number (`#{gIdx + 1}`), formatted timestamp (`formatTime(startSecs)`), assigned MOGRT badge (`rawMogrtName`) with HSL dot/tint, and interactive lock toggle (`🔒` / `🔓`) linked directly to `lockStore`. Word pills inside each horizontal phrase card render inside `.cc-bubble-zone` with exact `.cc-word-pill` styling, glowing active states (`.cc-is-active`), selected borders (`.cc-is-selected`), and locked opacity.
- `panel-src/src/tabs/params/ParamsView.tsx` & `ParamsView.css` & `MogrtControls.tsx` & `mogrt_editor.jsx` / `.js`: [UPDATED 2026-07-01] Replaced bulky phrase bubble cards with an ultra-compact horizontal **Mini Timeline Header Strip** directly below the navigation tabs. Updated `getClipPhraseAndWordIdx` to prioritize `/text input|\u24c9|\u24c8|source text/i` specifically when extracting phrase text for MOGRTs with `Ⓣ Word Progression`. Added full support for MOGRT media/image slots (`canReplaceMedia()`, `propertyType === 6 || 7`) with a dedicated UI row and ExtendScript handler (`smSelectImageAndReplace`) that opens an OS file dialog, imports the file into the active project bin, and replaces the MOGRT media slot. Filtered out internal numerical progression counters (`Word Progression`, `Word Index`) from the properties panel.
- `panel-src/src/tabs/params/ParamsView.tsx` & `ParamsView.css` & `Inspector.tsx`: [UPDATED 2026-07-01] Replaced vertical phrase cards with compact horizontal rounded bubble containers (`.mpe-compact-phrase-bubble`) matching Image 3 parity. Enclosed word pills (`.mpe-compact-word-pill`) render in a single horizontal scrollable pill zone with glowing yellow borders (`#FFEB3B`) when selected or active. Enhanced `getClipPhraseAndWordIdx` to check `name`, `displayName`, `value`, and `val` across 0-indexed and 1-indexed progression parameters. Added local editing state (`localHex`) in `CockpitColorPicker` to enable smooth hex typing, and passed `hideHeader={true}` when embedded in `ParamsView.tsx`.
- `panel-src/src/tabs/params/ParamsView.tsx` & `ParamsView.css`: [UPDATED 2026-07-01] Upgraded multi-MOGRT parameter editing to group selected clips by phrase text (`phraseText`) into large glassmorphic **Phrase Bubble Cards** with deterministic HSL card tints. Inside each card, words are rendered as interactive **Word Progression Pills** (`Ⓣ`) supporting horizontal mouse wheel scroll, click-to-jump, and `Shift+Click` multi-word selection. Added zero-cost 700ms polling interval (`fetchParams`) to auto-sync timeline selection without requiring manual Refresh button clicks. Delegated color picker triggering (`onOpenColorModal`) directly to top-level centered backdrop overlay (`mpe-color-modal-overlay`).
- `panel-src/src/tabs/params/components/MogrtControls.tsx` & `Inspector.tsx`: [UPDATED 2026-07-01] Added AE-style range sliders, scrubbable vector label drag (`cursor: ew-resize`), clean integer/pixel rounding, live color picker scrubbing without premature modal closure, interactive Hex/RGB/HSL tabs, and embedded Font Family / Font Style / Flux Style controls.
- `panel-src/src/tabs/params/ParamsView.tsx`: [UPDATED 2026-07-01] Upgraded multi-clip selection tabs to render subtitle words (`getClipWord`) styled with deterministic HSL MOGRT Card Tints (`getMogrtHue`).
- `panel/jsx/core/utils.jsx` / `utils.js`: [UPDATED 2026-06-29] Added global `String.prototype.trim` polyfill to support ES3 string trimming during sync operations.
- `panel/jsx/core/mogrt_editor.jsx` / `mogrt_editor.js`: [UPDATED 2026-06-29] Replaced `.trim()` calls with `.replace(/^\s+|\s+$/g, '')` and fixed ExtendScript ES3 regex syntax errors.
- `CSXS/manifest.xml`: [UPDATED 2026-06-29] Pointed `<ScriptPath>` to `./panel/jsx/main.jsx` instead of `./panel/jsx/test.jsx`.
- `CEPs/MISTER_BloomX/dist/index.html`: [UPDATED 2026-06-29] MISTER BloomX asset library interface updated with deterministic HSL Card Tint styling and color dot badges.
- `panel-src/src/tabs/edit/components/PhraseRow.tsx`: [UPDATED 2026-06-29] Synchronized MOGRT Card Tint hashing, added MOGRT color dot pill in phrase headers, and wired clickable auto-select handler.
- `panel-src/src/tabs/edit/EditView.tsx`: [UPDATED 2026-06-29] Added `onSelectByMogrt` handler to scan and multi-select all phrases assigned with a given MOGRT name.
- `docs/guides/interactive_ui_and_functions_guide.md`: [NEW 2026-06-27] Complete Simple Language dictionary of interactive UI elements, sequential function call traces, and plain-English function explanations.
- `panel-src/src/tabs/workflow/`: [UPDATED 2026-06-27] `StepRender.tsx` re-wired to execute `bridgeCaptionGaps` after rendering words to close 1-2 frame gaps.
- `panel/jsx/core/mogrt.jsx` / `mogrt.js`: [UPDATED 2026-06-27] ExtendScript backend updated to invoke `bridgeCaptionGaps()` inside `runCaptionGenerate`.
- `panel/dist/freexan-caption.js`: [UPDATED 2026-06-27] Production bundle rebuilt.
- `.old_files/`: [NEW] Archive of unused, temporary, and scratch files.
  - `converted_jsx/`: Leftover converted JS files from JSX.
  - `temp_scratch/`: Temporary scripts and old scratch pads.
  - `snapshots/`: Old project snapshots.
- `CSXS/`: Extension configuration files.
  - `manifest.xml`: Defines the extension environment and entry points.
- `Install_SubMachine.bat`: Single-click installer for Windows (Handles Registry & Deployment).
- `panel/`: Main extension frontend and backend.
  - `index.css`: Core styling.
  - `panel.html`: UI structure (Bootstrap-based).
    - `js/`: Frontend logic.
    - `panel.js`: Legacy UI event handlers (minified/obfuscated).
    - `panel_clean.js`: Rebuilt, non-obfuscated version of the entry point (~4KB).
    - `ui_manager.js`: New dynamic modal system and centralized strings.
    - `tools_refactor.js`: Modern interception logic for Tools tab.
    - `phrasing.js`: Core SRT phrasing and word-mapping logic.
    - `command_center_react.js`: [NEW] React-based engine for the Edit tab (v5.0.0).
    - `premiere_simulator.js`: Mock CSInterface for browser debugging.
  - `css/`:
    - `premiere_simulator.css`: Premium styling for the debugger.
    - `command_center.css`: [NEW] Layout and animations for the React UI (v5.0.0).
  - `jsx/`: Backend (Adobe ExtendScript) logic.
    - `main.jsx`: Main entry point (loader).
    - `lib/`: Third-party polyfills.
      - `json2.jsx`: JSON support.
    - `core/`: Proprietary backend logic.
      - `utils.jsx`: Utilities and alerts.
      - `mogrt.jsx`: MOGRT analysis and creation (Stabilized v2.0).
      - `sync.jsx`: Synchronization tools (Flat Index Architecture v2.0).
      - `timeline.jsx` & `timeline.js`: Join/Split/Phrase tools (Surgical Engine v2.8.1 with P1 Instant Update).
      - `center.jsx`: [NEW] Command Center backend (isolated logic).
- `docs/`: Project documentation.
  - `logs/`: Changelogs and development progress.
  - `roadmap/`: Future feature timeline and Agent instructions.
    - `guides/`: Logic explanations for developers and non-coders.
      - `ux_philosophy_guide.md`: [NEW] Explanation of the "Editor's Cockpit" UX metaphor and features (v5.0.0).
      - `backend_communication.md`: [NEW] High-level explanation of the UI-to-Backend relationship (The "Dashboard & Engine" metaphor).
      - `visual_execution_dashboard.md`: [NEW] Node-based tree of all code execution flows.
      - `architecture_nodes.html`: [NEW] Premium Interactive Dashboard for visual execution tracing.
      - `mogrt_property_injection_guide.md`: [NEW] Explanation of MOGRT property injection for non-coders.
    - `sync_technical_standard.md`: [NEW] Immutable logic rules for syncing text, colors, and sliders.
    - `comprehensive_function_guide.md`: [NEW] Guide to every function for video editors.
    - `architecture_overview.md`: High-level system design.
    - `backend_dependency_map.md`: Mapping of shared functions and risk levels.
  - `conversation/`: Summaries for AI agents to understand past context.
  - `GIT_COMMIT_AGENT_MAP.md`: [NEW] Definitive guide for automated agents to safely commit and refactor code.
- `src/`: Centralized content management.
  - `content/`:
    - `strings.json`: Isolated user-facing text and strings.
- `Extras/`: Utility scripts and sample assets.
  - `split_srt.py`: SRT utility script.
- `package.json`: Project dependencies and metadata.

## Milestone: SubMachine v2.0 (The Stabilization)
We have successfully transitioned the synchronization engine to a rock-solid, production-ready state.
1. **Host-Safe Scripting**: Standardized on `.length` and removed unsupported properties to prevent Premiere crashes.
2. **Simplified Architecture**: Completely scrapped the `properties.jsx` dictionary in favor of Flat Indexing and prioritized direct lookups.
3. **Tool Integrity**: All 4 Sync Tools and the Surgical Engine (Split/Join) are now validated against the technical standards.

Next focus: UI/UX polishing and final deployment verification.

- [2026-06-25] Updated panel/jsx/core/timeline.jsx for ES3 compatibility.

- [2026-06-25] Fixed word splitting regex in 	imeline.jsx.

- [2026-06-25] P1 instant playhead refresh optimization in 	imeline.jsx.
