# Development Log - SubMachine

## [2026-07-02] - v5.1.13 On-Demand MOGRT Parameter Fetch Diagnostics & Fallback Sequence Scan Bug Fix
### Status
- Created on-demand diagnostic function (`smDumpSelectedMogrtProperties`) writing directly to `panel/logs/mogrt_param_fetch.log`. Removed automatic per-MOGRT logging inside `smParseClipParams` to prevent timeline scanning log spam. Added temporary **"📋 Log Props"** button beside the Reload button in `ParamsView.tsx`.
- Expanded JSON parsing across frontend and backend to inspect `.textEditValue`, `.text`, `.value`, or `.content`. Broadened text input and word progression keyword matching regexes. Fixed `pm.val` vs `pm.value` mismatch in sequence scan fallback. Recompiled production bundle (`freexan-caption.js`).

## [2026-07-02] - v5.1.12 Instant Timeline Selection Auto-Polling in Params Tab
### Status
- Isolated the automatic 500ms timeline polling interval (`setInterval`) into a dedicated clean `useEffect` independent of `eventsInitialized.current`. Previously, any React re-render destroyed the polling timer because the effect exited early on `if (eventsInitialized.current) return;`. Also removed the restrictive `isJsxReadyRef.current` check from the interval loop so timeline selection updates in Premiere Pro reflect instantly in the Params tab without requiring manual Refresh button clicks. Recompiled production bundle (`freexan-caption.js`).

## [2026-07-02] - v5.1.11 Real-Time Word Tracking Optimization & Playhead Highlight in Params Tab
### Status
- Removed heavy bridge execution (`fetchParams()`) inside the `ctiSecs` playhead poller effect. Previously, every 500ms playhead tick fired `smGetSelectionParams` over the ExtendScript bridge during video playback, causing playback stutter and lagging the UI.
- Added exact playhead boundary detection (`ctiSecs + 0.001 >= matchingClip.start && ctiSecs < matchingClip.end`) to word progression pills inside horizontal phrase cards so the exact word bubble under the Premiere Pro playhead highlights dynamically in real time with `.cc-is-playhead` (cyan glowing border and pulse animation). Recompiled production bundle (`freexan-caption.js`).

## [2026-07-01] - v5.1.10 Exact Horizontal Phrase Cards in Params Tab (<Image> Edit Tab Parity)
### Status
- Replaced the mini timeline strip with exact horizontal phrase cards (`.mpe-horizontal-phrase-card`) matching the exact backend and frontend of the Edit Tab phrase card structure (`PhraseRow`). Cards are arranged horizontally side-by-side in a scrollable flex track (`.mpe-horizontal-phrases-track`).
- Each horizontal phrase card features the exact header meta row displaying the phrase number (`#{gIdx + 1}`), formatted timestamp (`formatTime(startSecs)`), assigned MOGRT badge (`rawMogrtName`) with HSL dot/tint, and interactive lock toggle (`🔒` / `🔓`) linked directly to `lockStore`.
- Word pills inside each horizontal phrase card render inside `.cc-bubble-zone` with exact `.cc-word-pill` styling, glowing active states (`.cc-is-active`), selected borders (`.cc-is-selected`), and locked opacity. Recompiled production bundle (`freexan-caption.js`).

## [2026-07-01] - v5.1.9 Mini Timeline Header Strip, Prioritized Text Input Extraction & Image/Media Replacement
### Status
- Replaced bulky phrase bubble cards with an ultra-compact horizontal **Mini Timeline Header Strip** directly below the main navigation tabs, matching the Green Part diagram specification. Updated `getClipPhraseAndWordIdx` to prioritize `/text input|\u24c9|\u24c8|source text/i` specifically when extracting phrase text for MOGRTs with `Ⓣ Word Progression`. Added full support for MOGRT media/image slots (`canReplaceMedia()`, `propertyType === 6 || 7`) with a dedicated UI row and ExtendScript handler (`smSelectImageAndReplace`) that opens an OS file dialog, imports the file into the active project bin, and replaces the MOGRT media slot. Filtered out internal numerical progression counters (`Word Progression`, `Word Index`) from the properties panel. Recompiled production bundle (`freexan-caption.js`).

## [2026-07-01] - v5.1.8 Params Tab Compact Horizontal Bubbles & Interactive Hex Input
### Status
- Replaced large vertical phrase cards with compact horizontal rounded bubble containers (`.mpe-compact-phrase-bubble`) matching the Edit Tab layout and Image 3 specifications. Word pills (`.mpe-compact-word-pill`) render in a single horizontal scrollable pill zone with glowing yellow borders (`#FFEB3B`) when selected or active.
- Enhanced `getClipPhraseAndWordIdx` to check `name`, `displayName`, `value`, and `val` across 0-indexed and 1-indexed progression parameters so word bubbles align accurately across all template structures.
- Fixed inability to type into Hex input box inside `CockpitColorPicker` by adding local editing state (`localHex`). Passed `hideHeader={true}` to embedded `CockpitColorPicker` inside `ParamsView.tsx` to eliminate duplicate modal headers. Recompiled production bundle (`freexan-caption.js`).

## [2026-07-01] - v5.1.7 Params Tab Flux Overhaul & Word Progression Grouping
### Status
- Upgraded multi-MOGRT parameter editing (`ParamsView.tsx`, `ParamsView.css`) to enclose words belonging to the same phrase inside a large glassmorphic **Phrase Bubble Card** styled with deterministic MOGRT HSL card tints. Within each phrase card, individual words are rendered as interactive **Word Progression Pills** (`Ⓣ`). Selected timeline MOGRTs highlight dynamically with glowing active pills, matching the Edit Tab experience.
- Added horizontal mouse wheel scrolling across word pills (`onWheel`). Added click-to-jump (`smSelectClipsByPhraseAndWord`) and `Shift+Click` multi-word selection within and across phrase cards.
- Added a zero-cost 700ms polling interval (`fetchParams`) to auto-sync timeline selections without requiring manual Refresh button clicks.
- Delegated color picker triggering (`onOpenColorModal`) directly to the top-level centered backdrop modal (`mpe-color-modal-overlay`), overriding fixed screen coordinates so the color picker always renders perfectly centered without clipping or layout jumping. Rebuilt production panel bundle (`npm run build`).

## [2026-07-01] - v5.1.6 Params Tab UI & UX Upgrade
### Status
- Upgraded slider controls (`kind === 'number'`) from basic number inputs to After Effects style range sliders (`<input type="range" className="mpe-range-slider" />`) paired with precision number input boxes.
- Upgraded Position and Scale vector controls (`kind === 'vector'`) to display cleanly rounded numbers (`Math.round(v)`) instead of floating decimals, and added scrubbable horizontal mouse drag (`cursor: ew-resize`) directly on the label so dragging left/right adjusts values smoothly in real time.
- Fixed color picker modal disappearing prematurely in `MogrtControls.tsx` by separating live parameter updates (`handleColorLiveChange`) from modal closure (`onClose`), allowing real-time scrubbing on the saturation box and hue slider without closing the modal. Added interactive Hex, RGB, and HSL space tabs in `CockpitColorPicker`.
- Added embedded Font Family, Font Style, and preset text animation/styles (`⚡ Flux Style`) toolbar inside Text parameter controls (`kind === 'text'`) when MOGRT JSON metadata is available.
- Upgraded multiple clip selection tab buttons in `ParamsView.tsx` to display each clip's actual subtitle word (`getClipWord`) styled with the exact deterministic HSL MOGRT Card Tint (`getMogrtHue`) matching the Edit tab word bubbles. Recompiled production panel bundle (`npm run build`).

## [2026-06-29] - v5.1.5 Fixed ExtendScript ES3 String Trim Runtime Error
### Status
- Investigated `Sync Button Is Not Working` failure and traced log error in `debug_jsx.log`: `masterClip.name.replace().split().pop().replace().trim is not a function`. Identified that Adobe ExtendScript (ES3) engine lacks native `String.prototype.trim`. Added global string trim polyfill in `utils.jsx` & `utils.js` and replaced `.trim()` calls with regex trimming in `mogrt_editor.jsx` & `mogrt_editor.js`.

## [2026-06-29] - v5.1.4 Fixed ExtendScript ES3 Regex Syntax Error
### Status
- Discovered and fixed fatal ES3 syntax error caused by `.split(/[/\\]/)` in `mogrt_editor.jsx` and `mogrt_editor.js`. Adobe's ExtendScript engine interprets unescaped forward slashes inside regex character classes as the termination of the regular expression, throwing a syntax error at line 326. Because `#include "core/mogrt_editor.jsx"` failed to evaluate, none of the parameter editor functions (`smGetSelectionParams`, etc.) were loaded into memory, resulting in `DBG: JSX not ready — waiting...` in the React panel. Replaced with `.replace(/\\/g, '/').split('/')` and verified script syntax.

## [2026-06-29] - v5.1.3 Synchronized MOGRT Card Tints & Auto-Select by MOGRT
### Status
- Synchronized deterministic MOGRT Card Tint styling between MISTER BloomX (`CEPs/MISTER_BloomX/dist/index.html`) and FreeXan Caption (`PhraseRow.tsx`). Base MOGRT filenames are cleaned and hashed into a unified HSL color scheme so that every MOGRT has a distinct card tint and color dot badge that matches across both plugins.
- Attached `onClick` trigger to the colored MOGRT badge in `PhraseRow.tsx` connected to `onSelectByMogrt` in `EditView.tsx`. Clicking any MOGRT colored box scans `timelineMap` and automatically multi-selects all phrase tracks sharing that MOGRT name. Rebuilt bundle (`freexan-caption.js`).

## [2026-06-27] - v5.1.2 Re-wired bridgeCaptionGaps
### Status
- Wired `bridgeCaptionGaps()` execution into `StepRender.tsx` post-loop and `runCaptionGenerate` (`mogrt.jsx` / `mogrt.js`). Rebuilt panel bundle (`freexan-caption.js`) to ensure all 1-2 frame gaps between subtitle clips are snapped closed automatically.

## [2026-06-27] - v5.1.1 Interactive UI & Functions Guide
### Status
- Created `docs/guides/interactive_ui_and_functions_guide.md` mapping all interactive UI triggers, step-by-step function execution chains, and simple-language definitions for all extension functions.

## [2026-06-26] - v5.1.0 Dual SRT Phrasing & Manual UI Refactor
### Status
- Shipped Dual SRT Phrasing feature allowing word-by-word timing accuracy SRT combined with semantic phrasing SRT (`workflowStore.ts`, `StepRender.tsx`, `mogrt.jsx`, `mogrt.js`).
- Refactored manual mode file dialogs across all steps to use native `window.cep.fs.showOpenDialog` and updated phrasing mode UI to use radio buttons.

## [2026-06-25] - v5.0.1 Surgical P1 Fixes
### Status
- Shipped Phase 3 P1 caption repairs in timeline.jsx and timeline.js: restored `\s` regex escaping, eliminated redundant `Text Input` property calls on non-anchor MOGRT clips, and added track scanning fallback for Reset Progression selection errors.

## [2026-05-15] - v5.0.0 Stability Milestone
### Achievements
- Fixed regex typo where split(/s+/) split strings on the letter 's' instead of whitespace /\s+/.

### [2026-06-25] Word Tools Bugfixes
- Fixed 	extObj.textEditValue.split().filter is not a function error in ExtendScript ES3.
- Restored sm_tools_add_word_v28 and sm_tools_reset_progression_v28 in 	imeline.jsx.
    - Verified that **Subtitle Creation** is fully operational with the new Asset Isolation Engine.
    - Confirmed **Command Center** stability for all surgical tools: Split, Merge, Surgery (Drag & Drop), and Word Renaming.
    - Verified **Synchronisation Tools** (All, Text, Style, PSR) follow phrase-aware standards.
    - Successfully took the **v5.0.0-stable snapshot** (`stable/v5.0.0-stable-...`).
- **Decisions**: Formalized the "Editor's Cockpit" as the standard UI architecture for production release.
- **Next Steps**:
    - [ ] Final pre-release cleanup of unused CSS tokens.
    - [ ] Update user guides to reflect the "Cockpit" UI workflow.

## [2026-05-13] - SubMachine v5.0.0 ("Editor's Cockpit" UX Redesign)
### Status
- **Phase**: UI/UX Evolution / Design System
- **Goal**: Elevate the plugin to a professional "Cockpit" experience with high visual polish and ergonomic efficiency.

### Decisions
- **Decision 1**: Implement a "Mini-Timeline" visualization at the top of the Navigator.
    - *Rationale*: Professional editors think in "rhythm". A horizontal map of phrase durations allows them to navigate the timeline spatially before reading text.
- **Decision 2**: Shift to a "Search & Pin" model for property management.
    - *Rationale*: Modern MOGRTs have 50+ properties. A flat list is overwhelming. Search allows instant access, and Pinning allows editors to "save" their preferred workspace.
- **Decision 3**: Standardize on Framer Motion for "Tactile Feedback".
    - *Rationale*: In complex surgical operations (Split/Merge), the user needs to *see* the clips moving to stay oriented. Motion provides this confirmation without popups.
- **Decision 4**: Introduce the "Empty Dashboard" onboarding.
    - *Rationale*: First impressions matter. A professional dashboard feels more like a tool and less like an error message when the timeline is empty.

### Progress
- [x] Defined new Teal-based design tokens and glassmorphism system in `command_center.css`.
- [x] Implemented `MiniTimeline` and `EmptyDashboard` React components.
- [x] Added `searchFilter` and `pinnedProps` state (with localStorage persistence).
- [x] Integrated `Framer Motion` into `PhraseRow` and `WordBubble` for layout transitions.
- [x] Created `docs/guides/ux_philosophy_guide.md` to document the new metaphors.
- [x] Verified "Surgical Precision" remains intact with the new animated UI.


## [2026-05-13] - Replace MOGRT Feature (v4.2.0)
### Status
- **Phase**: Feature Implementation
- **Goal**: Allow swapping the MOGRT template under a full phrase in one action.

### Decisions
- **Decision 1**: Pre-flight probe via 1-frame test clip before touching any real clip.
    - *Rationale*: Fail early and clearly rather than leaving the timeline in a half-swapped state.
- **Decision 2**: Process clips in reverse order during the swap loop.
    - *Rationale*: Prevents index drift — removing a clip shifts all subsequent indices, so going backward keeps each clip's index stable at the time of removal.
- **Decision 3**: Single `app.beginUndoGroup / app.endUndoGroup` wraps the entire swap.
    - *Rationale*: Makes `Ctrl+Z` a one-shot revert for the entire phrase swap.

### Progress
- [x] Added `listMogrtsInBin()` to `sync.jsx` — recursive bin walker.
- [x] Added `replaceMogrtInPhrase()` to `sync.jsx` — probe + capture + swap + apply loop.
- [x] Added `ReplaceMogrtModal` React component with bin list + Browse entry.
- [x] Added `isSinglePhraseFullySelected` useMemo to gate the button correctly.
- [x] Added `handleReplaceMogrt()` handler + `🔄 Replace MOGRT` footer button.
- [x] Added mock branches for browser-mode testing.

## [2026-05-13] - SubMachine v4.1.0 (Asset Isolation)
### Status
- **Phase**: Architecture / Stabilization
- **Goal**: Resolve the "Missing definition.json" crash by virtualizing MOGRT components.

### Decisions
- **Decision 1**: Implement an "Isolated Asset Folder" (`SM_Assets`) next to the project file.
    - *Rationale*: Premiere Pro's internal cache is volatile and often hides or renames the core `definition.json` file. Moving the source of truth to the project workspace ensures stability.
- **Decision 2**: Use "XMP Tagging" for relative folder lookup.
    - *Rationale*: Storing a unique tag allows the plugin to find the `SM_Assets` subfolder relative to the project file, making the system resilient to project moves across different drives or users.
- **Decision 3**: Implement "Live Updates" to the isolated folder.
    - *Rationale*: Writing the updated `definition.json` back to disk ensures the folder always contains the most recent version of the template.

### Progress
- [x] Create XMP metadata utilities in `utils.jsx`.
- [x] Implement MOGRT extraction logic in `workflow_refactor.js` using `JSZip`.
- [x] Update `phrasing.js` to pass asset paths to the backend during subtitle creation.
- [x] Update `mogrt.jsx` to "stamp" Master Items with Asset Tags.
- [x] Refactor `mogrt_patcher.js` to prioritize isolated assets over internal caches.
- [x] Verified "Triple-Redundancy" (XMP -> Local Folder -> Library) lookup.

## [2026-05-07] - The Great Unwinding (Refactor Phase)
### Status
- **Phase**: Refactoring / Architecture
- **Goal**: Achieve "Complete Independency" of functions across features.

### Decisions
- **Decision 1**: Duplicate `utils.jsx` logic into each feature file. 
    - *Rationale*: "Write 2 Same Block Of Code With different function name but do not share the same function for different feature" as per user requirement. Prevents side-effects where changing a utility for one tool breaks another.
- **Decision 2**: Prefix all functions with feature-specific identifiers (`sync_`, `surg_`, `mog_`, `cc_`).
    - *Rationale*: Namespace isolation.
- **Decision 3**: Isolate the Command Center backend from `sync.jsx`.
    - *Rationale*: Logical separation of concerns.

### Progress
- [x] Pre-execution snapshot taken (stable/pre-silo-refactor-2026-05-07-1307).
- [ ] Create `center.jsx` and move logic from `sync.jsx`.
- [ ] Refactor `sync.jsx` utilities and internal calls.
- [ ] Refactor `timeline.jsx` utilities and internal calls.
- [ ] Refactor `mogrt.jsx` utilities and internal calls.
- [ ] Update frontend calls to match new backend signatures.
- [x] **v3.0 Snapshot**: Finalized and snapshotted stable version 3.0.


## 2026-05-06
- **Milestone**: **Commit Agent Mapping & Architectural Guardrails**
- **Achievements**:
    - Analyzed the full SubMachine codebase to map feature-to-file dependencies.
    - Created `docs/GIT_COMMIT_AGENT_MAP.md` as the definitive safety guide for automated commits.
    - Verified the "Staircase Model" in `timeline.jsx` and the "Flat Index Architecture" in `sync.jsx` to define critical dependency blocks.
    - Identified "Safe Zones" in the CSS and structure for UI-only updates.
    - **Assumed Role**: Formally onboarded as the **Git Commit Agent**.
    - **Baseline Snapshots**: Created `baseline` and `map-ready` snapshots to anchor the project state.
    - **Architecture Confirmation**: Validated the synchronous function chain model (UI -> Backend Sequence -> Output) with the user.
    - **Visual Dashboard**: Created a high-fidelity, node-based **Visual Execution Dashboard** (`architecture_nodes.html`) to map every frontend action to its backend logic.
    - **Feature Snapshots**:
        - **Sync All** (`stable/sync-all-...`): Verified phrase-aware style merging.
        - **Sync Text & Typeface** (`stable/sync-text-...`): Verified typeface synchronization with cross-phrase text protection.
- **Decisions**: 
    - Chose to explicitly link the Backend Surgery Engine (v2.8) and the Sync Engine (v2.0) as separate but overlapping safety domains to prevent regressions in word-level manipulation.
    - Formalized the **Synchronous Execution Chain** as the official mental model for SubMachine tool operations.
    - Adopted a **Containerized Visual Standard** for mapping codebase dependencies to improve architectural clarity.
- **Next Steps**:
    - [x] Onboard the Git Commit Agent with the new mapping document.
    - [x] Perform first feature-verified snapshot upon user confirmation.
    - [ ] Monitor automated commits for compliance with the "Required Files" safety rules.


## 2026-05-05 (Night Session)
- **Milestone**: **SubMachine v2.0 - The Stabilization**
- **Achievements**:
    - **Total Stabilization**: Resolved persistent "JSX CRASH" errors by identifying and removing unsupported host-level property calls (`numProperties` and `matchName`) that were causing Premiere Pro's scripting engine to abort.
    - **Architectural Cleanup**: Completely detached the codebase from `properties.jsx`. All logic is now self-contained, reducing the surface area for "Deceptively Simple" regressions.
    - **Scrapped Property Mapping**: Successfully moved from unstable name-based recursive mapping to the rock-solid **Flat Index Dependency** model.
    - **Cross-File Audit**: Manually audited `sync.jsx`, `timeline.jsx`, and `mogrt.jsx` to ensure 100% of the code uses the new stable standard.
    - **v2.0 Snapshot**: Finalized the build for release-grade testing.
- **Decisions**: Chose to prioritize absolute stability and host-engine safety over property-name flexibility. Standardizing on `.length` and direct lookups has eliminated the unpredictable crashes.
- **Next Steps**:
    - [ ] Perform a full UI walkthrough to ensure all buttons in the Command Center bridge correctly to the stabilized JSX functions.
    - [ ] Update user-facing documentation to reflect the simplified (and faster) synchronization process.


## 2026-05-05
- **Milestone**: MOGRT Property Injection Documentation (v4.0.29)
- **Achievements**:
    - Conducted a deep analysis of `properties.jsx`, `mogrt.jsx`, and `sync.jsx` to define the "SubMachine Standard" for property injection.
    - Created a non-technical guide (`mogrt_property_injection_guide.md`) explaining JSON-based text injection and style/content separation.
    - Defined the **Technical Sync Standard** (`sync_technical_standard.md`) with functional breakdowns for the 4 UI sync tools.
    - Implemented the **Recursive Mapping Rule** to ensure properties nested in MOGRT groups are correctly identified.
    - Refined the standard to prioritize **Internal MGT Parameters** over external Premiere Motion components.
    - Added the **Highlight Preservation Rule** to protect `Word Progression` sliders.
    - Added **Glyph-Based Guards** to block **Ⓢ** (Specific) and **Ⓑ** (Boundary) properties during cross-phrase sync.
    - Implemented **Group-Aware Property Pathing** by refactoring `properties.jsx` and `sync.jsx` to trace and apply parameters via their exact structural path (e.g., `["Color & Style", "Fill Color"]`), eliminating catastrophic collisions between identically-named properties.
    - Added a **Vocabulary Section** to the guide to standardize AI/Agent interpretation.
    - Documented the `SM_PROP` mapping system as the primary method for robust cross-MOGRT compatibility.
- **Decisions**: Chose to formalize the "JSON Envelope" metaphor for non-technical stakeholders to explain how font styles are preserved during text updates.
- **Next Steps**:
    - [ ] Audit all MOGRT templates to ensure they align with the `SM_PROP` naming conventions.
    - [ ] Create a technical guide for developers on adding new properties to the `SM_PROP` dictionary.

## 2026-05-04 (Night Session)
- **Milestone**: Phrase-Aware Synchronization (v4.0.28)
- **Achievements**:
    - Refactored `handleSyncGeneric` in `tools_refactor.js` to implement conditional filtering based on `phraseIndex`.
    - Successfully implemented "Smart Text Protection": bulk-syncing styles across the timeline no longer overwrites the text of other sentences.
    - Verified that "Word Progression" remains protected globally to preserve individual word timing.
- **Decisions**: Opted for a "Pass-by-Loop" filtering strategy in JS to avoid expensive repeated JSX calls while maintaining per-clip precision.
- **Next Steps**:
    - [ ] Add a UI toggle for "Sync Text Across Phrases" for users who explicitly want to overwrite everything.

## 2026-05-04 (Late Session)
- **Milestone**: Sync Stability & Property Mapping (v4.0.27)
- **Achievements**:
    - Implemented `properties.jsx` dictionary to decouple property access from fixed indices.
    - Fixed **M3 (Track Blindness)**: Enabled scanning of Video Track 1.
    - Resolved **C2 (Sticky Phrases)**: Applied `Math.round` to progression checks.
    - Refactored `mogrt.jsx`, `sync.jsx`, and `timeline.jsx` for production-grade property handling.
- **Decisions**: Moved to name-based property lookups to insulate against future MOGRT updates.
- **Next Steps**:
    - [ ] Verify Track 1 detection with various sequence configurations.
    - [ ] Stress-test "Sync All" with modified MOGRT templates.

## 2026-05-04
- **Milestone**: Codebase Organization & Deep Documentation (v4.0.25)
- **Achievements**:
    - Conducted a deep audit and documentation of all active codebase functions.
    - Organized the repository by archiving unused, temporary, and scratch files into `.old_files/`.
    - Cleaned up root directory and archived legacy JS backups to improve developer focus.
    - Updated project navigation map and created a Comprehensive Function Guide for non-technical stakeholders.
- **Decisions**: Established `.old_files/` as the standard archive for "Deceptively Simple" experimental files to keep the main source tree lean.
- **Next Steps**:
    - [ ] Perform a final audit of remaining loose files in root.
    - [ ] Create a "Glossary of Metaphors" for the non-technical guides.

## 2026-05-02
- **Milestone**: Command Center Stabilization (v4.0.23)
- **Achievements**:
    - Resolved the "Scanning..." hang by implementing JSX timeouts and force-unlocks.
    - Achieved "Instant Laser" response by restoring optimistic state updates for surgery.
    - Verified backend connectivity by enforcing the "Full/Partial" selection rule in payloads.
    - Created Architecture Guide to explain the UI/Backend bridge to stakeholders.
- **Decisions**: Confirmed Premiere Timeline as the primary database for SubMachine metadata.

## 2026-04-30
### Progress Summary
- **Major Milestone: Command Center v4.0**: Successfully redesigned the core editing interface. The system now features high-density "Slimline" rows and a robust "Surgical Proxy" engine.
- **Stability**: By handling selection simulation on the frontend, we preserved the stable v2.8 backend while adding advanced surgical rules (Adjacent-only, Auto-snapping).

### Key Decisions
- **Frontend Validation vs. Backend Modification**: Decided to enforce surgical rules (like adjacency) in the React layer using SortableJS callbacks. This prevents unnecessary complexity in the ExtendScript layer and keeps the timeline operations predictable.
- **Visual Density**: Chose a 40px row height for phrases to balance readability with information density. This allows pro editors to see their whole sequence without excessive scrolling.
- **Simulation Strategy**: The "Selection Proxy" was the key breakthrough. It allows the React UI to "speak" to the legacy tools by mimicking a manual user selection, ensuring zero regressions in timeline manipulation.

### Next Steps
- [ ] Implement "Bulk Sync" within the Inspector for selected words.
- [ ] Add "Gap Markers" to visually represent silences between phrases.
- [ ] Verify renaming performance on large timelines (Enter key debounce check).
