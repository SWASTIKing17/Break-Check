# Changelog - SubMachine

## [v5.1.13] - 2026-07-02
### Fixed & Changed
- **On-Demand MOGRT Parameter Fetching Diagnostics & Fallback Sequence Scan Bug Fix in Params Tab.** Added on-demand inspection function (`smDumpSelectedMogrtProperties` in `mogrt_editor.jsx` / `.js`) writing directly to a separate log file `panel/logs/mogrt_param_fetch.log`. Removed automatic per-MOGRT logging inside `smParseClipParams` to prevent log spam during normal timeline scanning. Added a temporary **"📋 Log Props"** button beside the Reload (`↻`) button in the Params Tab header (`ParamsView.tsx`). When clicked, it logs 100% of the properties (`dispName`, `rawName`, `type`, `val`) for the currently selected MOGRT (or MOGRT under the playhead) and shows an alert with the summary. Expanded JSON text field detection (`.textEditValue`, `.text`, `.value`, `.content`) and broadened keyword matching regexes across both React frontend (`ParamsView.tsx`) and ExtendScript backend (`mogrt_editor.jsx` / `.js`). Resolved exact bug where clicking unselected word progression pills returned `total selected=0` due to `pm.value` vs `pm.val` lookup mismatch during fallback sequence scanning. Recompiled production bundle (`freexan-caption.js`).

## [v5.1.12] - 2026-07-02
### Fixed & Changed
- **Instant Timeline Selection Auto-Polling in Params Tab.** Isolated the automatic 500ms timeline polling interval (`setInterval`) into a dedicated clean `useEffect` independent of `eventsInitialized.current`. Previously, any React re-render destroyed the polling timer because the effect exited early on `if (eventsInitialized.current) return;`. Also removed the restrictive `isJsxReadyRef.current` check from the interval loop so timeline selection updates in Premiere Pro reflect instantly in the Params tab without requiring manual Refresh button clicks. Recompiled production bundle (`freexan-caption.js`).

## [v5.1.11] - 2026-07-02
### Added & Changed
- **Real-Time Word Tracking Optimization & Playhead Highlight in Params Tab.** Removed heavy bridge execution (`fetchParams()`) inside the `ctiSecs` playhead poller effect. Previously, every 500ms playhead tick fired `smGetSelectionParams` over the ExtendScript bridge during video playback, causing playback stutter and lagging the UI. Added exact playhead boundary detection (`ctiSecs + 0.001 >= matchingClip.start && ctiSecs < matchingClip.end`) to word progression pills inside horizontal phrase cards so the exact word bubble under the Premiere Pro playhead highlights dynamically in real time with `.cc-is-playhead` (cyan glowing border and pulse animation). Recompiled production bundle (`freexan-caption.js`).

## [v5.1.10] - 2026-07-01
### Added & Changed
- **Exact Horizontal Phrase Cards in Params Tab (<Image> Edit Tab Parity).** Replaced the mini timeline strip with exact horizontal phrase cards (`.mpe-horizontal-phrase-card`) matching the exact backend and frontend of the Edit Tab phrase card structure (`PhraseRow`). Cards are arranged horizontally side-by-side in a scrollable flex track (`.mpe-horizontal-phrases-track`). Each horizontal phrase card features the exact header meta row displaying the phrase number (`#{gIdx + 1}`), formatted timestamp (`formatTime(startSecs)`), assigned MOGRT badge (`rawMogrtName`) with HSL dot/tint, and interactive lock toggle (`🔒` / `🔓`) linked directly to `lockStore`. Word pills inside each horizontal phrase card render inside `.cc-bubble-zone` with exact `.cc-word-pill` styling, glowing active states (`.cc-is-active`), selected borders (`.cc-is-selected`), and locked opacity. Recompiled production bundle (`freexan-caption.js`).

## [v5.1.9] - 2026-07-01
### Added & Changed
- **Mini Timeline Header Strip, Prioritized Text Input Extraction & Image/Media Replacement.** Replaced bulky phrase bubble cards with an ultra-compact horizontal **Mini Timeline Header Strip** directly below the main navigation tabs, matching the Green Part diagram specification. Updated `getClipPhraseAndWordIdx` to prioritize `/text input|\u24c9|\u24c8|source text/i` specifically when extracting phrase text for MOGRTs with `Ⓣ Word Progression`. Added full support for MOGRT media/image slots (`canReplaceMedia()`, `propertyType === 6 || 7`) with a dedicated UI row and ExtendScript handler (`smSelectImageAndReplace`) that opens an OS file dialog, imports the file into the active project bin, and replaces the MOGRT media slot. Filtered out internal numerical progression counters (`Word Progression`, `Word Index`) from the properties panel. Recompiled production bundle (`freexan-caption.js`).

## [v5.1.8] - 2026-07-01
### Added & Changed
- **Params Tab Compact Horizontal Bubbles & Interactive Hex Input.** Replaced vertical phrase cards with ultra-compact horizontal rounded bubble containers (`.mpe-compact-phrase-bubble`) matching the Edit Tab layout and Image 3 specifications. Enclosed word pills (`.mpe-compact-word-pill`) render in a single scrollable zone with glowing yellow borders (`#FFEB3B`) when selected or active. Enhanced `getClipPhraseAndWordIdx` to check `name`, `displayName`, `value`, and `val` across 0-indexed and 1-indexed progression parameters. Fixed inability to type into Hex input box inside `CockpitColorPicker` by adding local editing state (`localHex`). Passed `hideHeader={true}` to embedded `CockpitColorPicker` inside `ParamsView.tsx` to eliminate duplicate modal headers. Recompiled production bundle (`freexan-caption.js`).

## [v5.1.7] - 2026-07-01
### Added & Changed
- **Params Tab Flux Overhaul & Word Progression Grouping.** Upgraded multi-MOGRT parameter editing (`ParamsView.tsx`, `ParamsView.css`) to enclose words belonging to the same phrase inside a large glassmorphic **Phrase Bubble Card** styled with deterministic MOGRT HSL card tints. Within each phrase card, individual words are rendered as interactive **Word Progression Pills** (`Ⓣ`). Selected timeline MOGRTs highlight dynamically with glowing active pills, matching the Edit Tab experience. Added horizontal mouse wheel scrolling across word pills (`onWheel`). Added click-to-jump (`smSelectClipsByPhraseAndWord`) and `Shift+Click` multi-word selection within and across phrase cards. Added a zero-cost 700ms polling interval (`fetchParams`) to auto-sync timeline selections without requiring manual Refresh button clicks. Delegated color picker triggering (`onOpenColorModal`) directly to the top-level centered backdrop modal (`mpe-color-modal-overlay`). Rebuilt production bundle (`npm run build`).

## [v5.1.6] - 2026-07-01
### Added & Changed
- **Params Tab UI & UX Upgrade.** Upgraded numeric sliders (`kind === 'number'`) to After Effects style range controls (`<input type="range" className="mpe-range-slider" />`) and scrubbable boxes. Upgraded Position and Scale vectors (`kind === 'vector'`) to display rounded pixel integers (`Math.round(v)`) with scrubbable horizontal mouse drag (`cursor: ew-resize`) on X/Y labels. Fixed premature disappearance of the color modal when scrubbing saturation/hue (`handleColorLiveChange`), and added interactive Hex, RGB, and HSL space tabs in `CockpitColorPicker`. Added embedded Font Family, Font Style, and preset text animation/styles (`⚡ Flux Style`) toolbar inside Text parameter controls. Upgraded multi-clip selection tabs to show word bubbles (`getClipWord`) styled with deterministic HSL MOGRT Card Tints (`getMogrtHue`). Recompiled production bundle (`npm run build`).

## [v5.1.5] - 2026-06-29
### Fixed
- **Fixed ExtendScript ES3 String Trim Runtime Error.** Fixed `masterClip.name.replace().split().pop().replace().trim is not a function` error when synchronizing parameters across clips in the timeline. Added global `String.prototype.trim` polyfill to `core/utils.jsx` & `core/utils.js`, and replaced `.trim()` with `.replace(/^\s+|\s+$/g, '')` in `smSyncParamAcrossSelected` in `core/mogrt_editor.jsx` & `core/mogrt_editor.js`.

## [v5.1.4] - 2026-06-29
### Fixed
- **Fixed ExtendScript ES3 Regex Syntax Error.** Replaced `.split(/[/\\]/)` with `.replace(/\\/g, '/').split('/')` in `core/mogrt_editor.jsx` and `core/mogrt_editor.js`. In ExtendScript ES3 engine, unescaped forward slashes inside regex character classes prematurely terminate regex literals, which caused a fatal syntax error at line 326 when loading `mogrt_editor.jsx`. This prevented the backend from registering Params tab functions (`smGetSelectionParams`, etc.), causing the React panel to display `DBG: JSX not ready — waiting...`. Also fixed `CSXS/manifest.xml` `<ScriptPath>` pointing to `test.jsx` instead of `main.jsx`.

## [v5.1.3] - 2026-06-29
### Added
- **Synchronized MOGRT Card Tints & Auto-Select by MOGRT.** Synchronized deterministic MOGRT Card Tints between MISTER BloomX and FreeXan Caption. In `PhraseRow.tsx`, phrase cards now clean and hash the assigned MOGRT base name to compute a consistent HSL tint, and render a distinct color dot badge in the phrase header alongside the MOGRT name. Clicking on this MOGRT badge automatically scans all phrases in the Edit tab and multi-selects every phrase assigned with the same MOGRT. Rebuilt production bundle (`freexan-caption.js`).

## [v5.1.2] - 2026-06-27
### Fixed
- **Re-wired bridgeCaptionGaps into Caption Generation Pipeline.** Wired `bridgeCaptionGaps()` invocation into both frontend React UI (`StepRender.tsx`) immediately after the word rendering loop finishes, and backend ExtendScript engine (`runCaptionGenerate` in `mogrt.jsx` / `mogrt.js`). Rebuilt production bundle (`freexan-caption.js`). This automatically eliminates any micro 1-2 frame quantization or track switching gaps between adjacent subtitle clips.

## [v5.1.1] - 2026-06-27
### Added
- **Interactive UI & Functions Guide.** Added comprehensive simple-language reference guide (`docs/guides/interactive_ui_and_functions_guide.md`) mapping out all UI controls across Workflow, Editor's Cockpit, Command Center, Sync, and Parameters tabs, tracing their exact sequential function call chains, and defining all frontend and ExtendScript functions.

## [v5.1.0] - 2026-06-26
### Added & Changed
- **Dual SRT Phrasing Support.** Added optional second phrasing SRT support to Workflow tab (`StepRender.tsx`) and backend ExtendScript (`mogrt.jsx`, `mogrt.js`). Users can now supply word-by-word timing accuracy SRT alongside a semantic phrasing SRT to generate perfectly timed and grouped MOGRT captions.
- **Manual Mode UI Radio Buttons & File Browse Fix.** Fixed broken browse buttons across all manual mode steps (`StepCheckProject`, `StepParseSrt`, `StepRender`) by replacing ExtendScript dialog calls with native CEP file browser dialogs (`window.cep.fs.showOpenDialog`). Upgraded phrasing mode selection UI to use clear radio buttons (`Standard Auto`, `Character Slider`, `Dual SRT`).

## [v5.0.3] - 2026-06-25
### Fixed
- **Blank Screen on Tab Switch.** Replaced `AnimatePresence mode="wait"` (which fully unmounted tabs on switch) with an always-mounted DOM pattern — all 4 tabs remain in the DOM; only the active one has `display: block`. Eliminates cold-boot failures that caused blank panes. Each tab is now wrapped in a new `ErrorBoundary` component (`src/shell/ErrorBoundary.tsx`) for per-tab fault isolation.
- **CEP Panel Close Kills Other Panels.** Guarded `ws.onerror` in `useFreeXanWs.ts` to swallow errors instead of rethrowing (which could crash Adobe's shared extension host). Added `__freexan_unloading` flag to prevent reconnect timers firing after teardown. Added `beforeunload` cleanup guard in `main.tsx` to close the WebSocket gracefully before Adobe tears down the host process.
- **Report Bug Button.** Added defensive `window.api?.sendBugReport` guard. Replaced blocking `alert()` dialogs with inline toast messages in the modal (`#bug-report-status` element). Added `⏳ Sending…` spinner on the submit button during the async call. Modal now auto-closes 2.5 s after a successful send.

## [v5.0.2] - 2026-06-25
### Changed
- **UX: SRT Export Buttons Moved to Header.** Relocated "Save WBW Srt." and "Save Phrased Srt." buttons from the footer row into the toolbar header alongside the "Refresh" and "Save Style" buttons. This keeps the export actions always visible and accessible without requiring the user to scroll down.

## [v5.0.1] - 2026-06-25
### Fixed & Telemetry
- **Surgical P1 Caption Repair Completed.** Fixed regex typos (`split(/\s+/)`, `replace(/^\s+|\s+$/g)`) in `timeline.jsx` and `timeline.js`. Refactored `sm_tools_add_word_v28` and `sm_tools_remove_word_v28` to skip unnecessary `Text Input` property updates on downstream clips, eliminating UI lag. Added selection track scanner fallback to `sm_tools_reset_progression_v28`.

## [v5.0.0] - 2026-05-13
### Added
- **"Editor's Cockpit" Redesign**: Major UI/UX overhaul of the Command Center for a professional-grade editing experience.
- **Visual Design System**: Refined Teal-based palette (`#29BFBE`) with premium glassmorphism, inner glows, and improved contrast.
### Perf (P1 Instant Update)
- **Fixed regex bug (/s+/ -> /\s+/)** in Add Word and Remove Word word-splitting logic in 	imeline.jsx.

## [v2.8.1] - 2026-06-25
### Fixed
- **Add/Remove Word ES3 Compat.** Replaced .filter() method calls on split arrays with ES3-compliant loops in 	imeline.jsx. Fixed missing sm_tools_add_word_v28 and sm_tools_reset_progression_v28 backend definitions.
- **Mini-Timeline**: A new rhythmic visualization at the top of the Navigator for seeing phrase timing and flow at a glance.
- **Cockpit Dashboard**: A professional empty-state "Quick Start" interface for timeline scanning and onboarding.
- **Inspector Search**: Real-time filtering of MOGRT properties to quickly locate controls like "Scale", "Color", or "Speed".
- **Property Pinning**: Persistent "Pin" functionality to keep essential controls at the top of the Inspector (saved in localStorage).
- **Motion Surgery**: Fluid Framer Motion transitions for splitting, merging, and word transfers, providing tactile visual feedback.
- **UX Philosophy Guide**: A new guide explaining the design principles and workflow benefits of the "Cockpit" metaphor.
- **Snapshot (v5.0.0-stable)**: Verified and snapshotted the final production-ready state of all core features.

## [v4.2.0] - 2026-05-13
### Added
- **Replace MOGRT**: New feature to swap the MOGRT template under all clips in a selected phrase in one action.
- **`listMogrtsInBin()` (JSX)**: Recursively walks the project bin to return all available MOGRT project items.
- **`replaceMogrtInPhrase()` (JSX)**: Core swap engine with pre-flight probe, full undo group, capture-first approach, and property transfer by display-name matching.
- **`ReplaceMogrtModal` (React)**: Bin picker modal with "Browse from disk…" at the bottom (Option C).
- **`isSinglePhraseFullySelected` (React)**: Gates the `🔄 Replace MOGRT` button — only shows when exactly one complete phrase is selected.


## [v4.1.0] - 2026-05-13
### Added
- **Asset Isolation Engine**: Implemented a robust project-bound asset isolation system for MOGRTs.
- **Project-Level Cache (SM_Assets)**: Upon MOGRT selection, components (.aegraphic, definition.json, thumbs) are now unzipped into an `SM_Assets` folder directly next to the `.prproj` file.
- **Tag-Based Relative Search**: The patcher now prioritizes finding the isolated folder using a unique tag relative to the project directory, ensuring reliability even if projects are moved.
- **Live Cache Updates**: The patcher now updates the `definition.json` file directly on disk inside the isolated folder before zipping, making the folder a live reflection of the current MOGRT state.
- **XMP Shadow Tagging**: Clips on the timeline are now tagged with `SubMachine_Asset_Folder`, `SubMachine_Asset_Tag`, and `SubMachine_Definition`.
- **Hybrid Reconstruction**: Refactored the MOGRT patcher to prioritize isolated local assets, eliminating reliance on Premiere's volatile internal AppData cache.

## [v3.0.0] - 2026-05-07
### Added
- **The Great Unwinding**: Initiated major architectural refactor to remove all inter-dependencies between backend features.
- **Feature Silos**: Defined strict boundaries for Sync, Surgery, MOGRT, and Command Center engines.
- **Utility Duplication**: Cloned and prefixed core utilities (`safeCall`, `jsxLog`, `reportError`, `undoEngine`) into each feature file to ensure complete independence.
- **Command Center Isolation**: Moved dashboard logic into a dedicated `center.jsx` file.
- **Namespace Hardening**: Renamed all backend entry points with feature-specific prefixes to prevent cross-feature interference.
- **Snapshot (v3.0)**: Saved stable version 3.0 snapshot (`stable/v3.0-...`).


## [v2.1.0] - 2026-05-06
### Added
- **Git Commit Agent Map**: Created a comprehensive architectural dependency map to guide automated commit agents.
- **Git Commit Agent Role**: Formally assumed the role of automated Git Agent for feature-specific snapshotting and regression prevention.
- **Snapshot (Sync All)**: Verified and snapshotted the **Phrase-Aware Sync All** logic, ensuring cross-phrase style merging without text data loss.
- **Snapshot (Sync Text & Typeface)**: Verified and snapshotted the typeface-only synchronization logic with robust text content protection.
- **Dependency Tracking**: Formalized the relationships between Frontend (React), Bridge (callJSX), and Backend (ExtendScript) logic.
- **Risk Categorization**: Classified file modifications into "Directly Affecting", "Required Dependencies", and "Non-Affecting" zones for safe refactoring.


## [v2.0.0] - 2026-05-05
### Added
- **Major Milestone: SubMachine v2.0 (The Stabilization)**: Achieved a rock-solid production-ready state by reverting to the proven "Flat Index Dependency" architecture.
- **Detached Property Mapping**: Completely scrapped the unstable `properties.jsx` dictionary and recursive name-resolvers.
- **Hardened Sync Engine**: Refactored `sync.jsx` and `timeline.jsx` to use direct, prioritized property lookups (Direct Display Name access).
- **Host Engine Safety**: Standardized all property iteration to use `.length` instead of `.numProperties`, preventing hard C++ crashes in the Premiere Pro scripting engine.
- **Refined Sync Logic**: Validated and updated all 4 sync tools (Sync All, Text, Style, PSR) to strictly follow the phrase-aware technical standard.
- **MOGRT Uniformity**: Standardized on a prioritized lookup list for core parameters (`\u24c9 Text Input`, `Ⓣ Text Input`, etc.) to ensure compatibility across multiple MOGRT versions.


## [4.0.29] - 2026-05-05
### Added
- **MOGRT Property Injection Guide**: Created a non-technical guide explaining the "Why" and "How" of SubMachine's property injection system.
- **Standardized Property Logic**: Documented the robust property lookup (SM_PROP), JSON-based text injection, and phrase-aware style synchronization.
- **Technical Sync Standard**: Established an immutable logic blueprint for syncing text (JSON), sliders, and colors.
- **Recursive Mapping Rule**: Formalized the requirement to search MOGRT properties recursively to handle nested groups.
- **Detailed Tool Documentation**: Defined logic for the 4 UI sync tools, emphasizing **Internal MGT Transforms** over external Premiere components.
- **Highlight Preservation Rule**: Formalized the requirement to protect `Word Progression` sliders during bulk sync.
- **Glyph-Based Sync Guards**: Implemented strict protection for **Ⓢ** (Specific) and **Ⓑ** (Boundary) properties during cross-phrase synchronization.
- **Group-Aware Property Pathing**: Refactored `properties.jsx` and `sync.jsx` to identify and sync properties using their full structural path (e.g., `["Color & Style", "Fill Color"]`) instead of flat display names, eliminating catastrophic cross-pollination between identical property names in different groups.
- **Vocabulary of Terms**: Added a glossary for AI/developer comprehension.

## [4.0.28] - 2026-05-04
### Added
- **Phrase-Aware Sync All**: The "Sync All" button now intelligently detects phrase boundaries. 
    - Clips in the **same phrase** as the master receive full synchronization (Styles + Text).
    - Clips in **different phrases** receive style synchronization but their unique text content is protected.
- **Improved Property Protection**: Expanded the internal property name blacklist to ensure "Word Progression" and "Text Input" are handled correctly across all SubMachine MOGRT versions.

## [4.0.27] - 2026-05-04
### Added
- **Property Mapping (H6 Fix)**: Introduced `properties.jsx` dictionary to handle name-based property access, protecting against MOGRT template changes.
### Fixed
- **M3 (Track Blindness)**: Plugin now correctly scans Video Track 1 (Index 0).
- **C2 (Sticky Phrases)**: Improved progression math to prevent phrases from fusing due to float imprecision.
- **C3 (Stale References)**: Standardized surgery tools to refresh clip pointers during mutations.

## [4.0.26] - 2026-05-04
### Fixed
- **Undo Engine (Critical)**: Replaced `startUndo`/`endUndo` no-op stubs in `utils.jsx` with a real probe-and-use implementation.
- Each surgery (Split, Join, Drag & Drop, Merge) now collapses into a **single named entry** in Premiere's History panel.
- A single `Ctrl+Z` now reverses an entire surgical operation, not just one clip at a time.
- API probe tries `seq.undoGroup` (DOM path) then `qe.project.getActiveSequence().undoGroup` (QE path), caching the result for the session lifetime.
- Added `resetUndoApiProbe()` debug helper to force a re-probe without restarting Premiere.

## [4.0.25] - 2026-05-04
### Added
- **Comprehensive Function Guide**: Created a non-technical, editor-friendly manual for every function in the codebase.
- **Codebase Organization**: Archived unused, temporary, and legacy files into a structured `.old_files/` directory.
- **Project Navigation Map**: Updated documentation to reflect the clean, production-ready structure.
- **Extras Consolidation**: Moved utility scripts like `split_srt.py` to the central `Extras/` folder.

## [4.0.23] - 2026-05-02
### Added
- **Instant Laser Logic**: Optimistic UI updates for Split/Merge operations.
- **Surgical Precision**: Enforced "Full/Partial" selection rules for backend compatibility.
- **Movement Lockdown**: Disallowed internal word reordering to preserve timeline integrity.
- **Heartbeat Recovery**: 15s timeouts for JSX calls to prevent UI deadlocks.
- **Vertical Consolidation**: Redesigned phrase rows to a top-header layout for 100% bubble width.
- **Premium Aesthetic Overhaul**: Custom dark scrollbars and glassmorphism card effects.
- **Grid Lockdown**: Migrated phrase rows to a 3-column CSS Grid to prevent word overlap.
- **Architecture Guide**: Created non-technical guide for UI/Backend integration.

## [v4.0.0] - 2026-04-30
### Added
- **Command Center Redesign (Slate & Precision)**: Complete visual and structural overhaul for high-density editing.
- **Slimline Row Architecture**: Phrases now use compact horizontal rows, increasing visible phrase count from 4 to ~12.
- **Selection Proxy Engine**: Frontend now simulates the exact selection required by the legacy backend surgery tool (`sm_tools_split_join_v28`), ensuring 100% stability without backend changes.
- **Adjacent-Only Surgery**: Strict validation logic in React prevents non-contiguous word transfers.
- **Laser Scissor Interaction**: Invisible vertical splitters that appear on hover between word bubbles for instant timeline cutting.
- **Smart Selection**:
    - "Playhead Follows First Select" logic for both phrases and words.
    - Contiguous Shift+Selection for both phrases and bubbles.
    - Automatic auto-scrolling to keep the active phrase centered in the panel.
- **Inline Renaming**: Double-click any word bubble to rename (Enter to save).

### Fixed
- **Layout Interference**: Replaced absolute-positioned cards with a flex-based row system to resolve legacy tab layout collisions.
- **Selection Ghosting**: Implemented `user-select: none` to prevent accidental text highlighting during drag-and-drop operations.
