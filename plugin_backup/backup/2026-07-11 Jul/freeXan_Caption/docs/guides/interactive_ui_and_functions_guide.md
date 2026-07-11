# freeXan Caption — Interactive UI & Functions Guide (Simple Language)

This guide is written in clear, simple language for both developers and video editors. It maps out every interactive UI element in the **freeXan Caption** extension, shows the exact sequence of functions that run behind the scenes when you use them, and explains what each function actually does.

---

## Part 1: Interactive User-Facing UI & Function Sequences

### 1. Workflow Tab (Subtitle Creation)

#### A. "Check Project State" Button
* **What you do:** Click the button to verify if Premiere Pro is ready to generate captions.
* **Function Sequence Called:**
  1. `execute('checkProjectState')` — Talks to Premiere Pro to verify that an active sequence exists and checks its frame rate (FPS).

#### B. "Browse" Buttons (Manual Mode File Selection)
* **What you do:** Click Browse next to Project, Sequence, or SRT file inputs.
* **Function Sequence Called:**
  1. `showCepFileBrowser()` — Opens your operating system's native file explorer (`window.cep.fs.showOpenDialog`) so you can reliably select files without freezing Adobe Premiere.

#### C. "Parse SRT" Button
* **What you do:** Click to load your transcribed subtitle `.srt` file.
* **Function Sequence Called:**
  1. `handleParseSrt()` — Reads the text file from your computer and parses the timestamps (`00:01:12,345`) and words into computer memory.

#### D. Phrasing Mode Selection (Radio Buttons & Sliders)
* **What you do:** Select between **Standard Auto (100 ch)**, **Custom Character Limit Slider**, or **Custom Phrasing SRT (Dual SRT)**.
* **Function Sequence Called:**
  1. `setPhrasingMode()` — Updates the React UI state to change how words will be grouped into sentence chunks.

#### E. "Generate Captions" Button
* **What you do:** Click to build animated subtitles directly onto your Premiere Pro timeline.
* **Function Sequence Called One-by-One:**
  1. `handleRender()` — Reads the SRT timestamps and stretches each word's end time to match the next word's start time to eliminate gaps.
  2. **Phrasing Loop** — Groups individual words into sentence phrases and alternates them between Video Track 1 (`V1`) and Video Track 2 (`V2`).
  3. `execute('getData', requestData)` — Validates sequence FPS against MOGRT FPS and locates the template `.mogrt` item inside your Premiere Project bin.
  4. `execute('createCaptions', wordData)` *(Runs in a loop for every word)* — Drops the MOGRT clip onto track `V1` or `V2` at the exact timestamp, calculates duration (adding overlapping frames), injects the sentence text, and sets the `Ⓣ Word Progression` number.
  5. `execute('bridgeCaptionGaps')` — Final cleanup pass scanning all created clips on the timeline to snap close any micro 1–2 frame quantization gaps.

---

### 2. Editor's Cockpit / Timeline Tab (Surgical Editing)

#### A. "Load Clips / Refresh" Button
* **What you do:** Loads all existing subtitle clips from your timeline into the interactive cockpit panel.
* **Function Sequence Called:**
  1. `execute('getTimelinePhraseMap')` — Scans Premiere's video tracks, reads MOGRT metadata, and builds a visual block map of all subtitle clips grouped by phrase.

#### B. Playhead Click / Time Scrubbing
* **What you do:** Click on a phrase card in the UI to jump Premiere's timeline playhead to that sentence.
* **Function Sequence Called:**
  1. `execute('setPlayheadTime', { seconds })` — Moves Premiere Pro's vertical playhead line to the exact start timestamp of that subtitle clip.

#### C. Live Text Editing Input
* **What you do:** Type inside a word card to correct a spelling error.
* **Function Sequence Called:**
  1. `execute('updatePhraseMogrtProperty', payload)` — Immediately pushes your updated text string directly into the MOGRT text box on the Premiere timeline without replacing the clip.

#### D. MOGRT Colored Badge Click (Auto-Select Matching MOGRTs)
* **What you do:** Click the colored MOGRT pill/box displayed on the right side of a phrase header in the Edit tab.
* **Function Sequence Called:**
  1. `onSelectByMogrt(mogrtName)` — Scans all loaded phrases in the panel and automatically selects every phrase using that same MOGRT template type.

#### E. Drag-and-Drop Surgery (Word Reordering / Transfer)
* **What you do:** Drag a word pill from one phrase block and drop it into an adjacent phrase block.
* **Function Sequence Called:**
  1. `execute('executeWordTransfer', payload)` — Recalculates the timing boundaries between the two clips, shifts the word token to the new clip, and updates both MOGRT text inputs on the timeline.

---

### 3. Command Center Tools (Split, Join, Add/Remove Words)

#### A. "Split Phrase" Button
* **What you do:** Cuts a single long subtitle clip into two separate phrase clips at your selected word.
* **Function Sequence Called:**
  1. `execute('findClipUnderPlayhead')` or `execute('splitPhraseGetMogrtData')` — Identifies the clip under your playhead and reads its internal word list.
  2. `execute('sm_tools_split_v28', params)` — Uses Premiere's razor action to slice the clip into two independent MOGRT clips on alternating tracks (`V1` / `V2`) and redistributes the text accordingly.

#### B. "Join / Merge Phrases" Button
* **What you do:** Combines two selected adjacent subtitle clips into one single phrase clip.
* **Function Sequence Called:**
  1. `execute('joinGetSelection')` — Checks which clips you currently have highlighted on the timeline.
  2. `execute('sm_tools_join_v28', params)` — Deletes the second clip, extends the duration of the first clip to cover the full time range, and merges both text strings into one.

#### C. "Add Word" / "Remove Word" Buttons
* **What you do:** Adds a new word token into a clip or deletes an unwanted word.
* **Function Sequence Called:**
  1. `execute('findClipUnderPlayhead')` — Locates target clip.
  2. `execute('sm_tools_add_word_v28')` or `execute('sm_tools_remove_word_v28')` — Adjusts the mathematical duration division across the clip's remaining words and updates the MOGRT text string.

#### D. "Reset Progression" Button
* **What you do:** Fixes word highlights if animations get out of sync or highlight the wrong word.
* **Function Sequence Called:**
  1. `execute('sm_tools_reset_progression_v28')` — Scans the selected clips and sequentially re-numbers their `Ⓣ Word Progression` parameter (`1, 2, 3...`) from left to right.

---

### 4. Synchronisation Tab (Styling & Design Sync)

#### A. "Sync All" Button
* **What you do:** Copies typography, colors, and layout from one styled "master" clip to all other subtitle clips on the timeline.
* **Function Sequence Called:**
  1. `execute('syncAllGetData')` — Reads every styling property from your highlighted anchor clip.
  2. `execute('sm_sync_all', payload)` — Iterates across target clips and overwrites their text styles, font families, color labels, and position/scale properties to match the master.

#### B. "Sync Text / Style / PSR" Individual Buttons
* **What you do:** Syncs *only* text content, *only* font design, or *only* Position/Scale/Rotation.
* **Function Sequence Called:**
  1. `execute('syncTextGetData')` / `syncStyleGetData` / `syncPsrGetData` — Extracts the specific subset of properties.
  2. `execute('sm_sync_text')` / `sm_sync_style` / `sm_sync_psr` — Applies only that specific styling category across target clips without disturbing other properties.

---

### 5. Parameters Tab (Custom MOGRT Controls)

#### A. Parameter Sliders & Color Pickers
* **What you do:** Drag custom sliders (e.g., Glow Intensity, Box Opacity, Highlight Color) exposed by the template designer.
* **Function Sequence Called:**
  1. `execute('smGetSelectionParams')` *(On Load)* — Discovers what custom knobs and sliders the template has.
  2. `execute('smApplyParam', data)` *(When changed)* — Pushes the new slider value or hex color code directly into the Premiere Pro Motion Graphics template property engine.

#### B. "⚡ Sync" Button next to Each Property
* **What you do:** Click the `⚡ Sync` button next to a specific parameter name in the Params tab.
* **Function Sequence Called:**
   1. `execute('smSyncParamAcrossSelected', data)` — Scans all clips currently selected on the Premiere Pro timeline, identifies the reference MOGRT active in the UI (or under playhead), filters out any different MOGRT types, and synchronizes *only* that individual parameter while returning real-time per-clip diagnostic feedback (`debugLog`) directly to the UI header banner.

---

## Part 2: Complete Dictionary of Functions & What They Actually Do

| Function Name | Location | What It Actually Does in Simple Words |
| :--- | :--- | :--- |
| **`showCepFileBrowser`** | `shared.tsx` | Opens Windows/Mac native open dialog so users can browse for `.srt` or `.mogrt` files safely without locking up Adobe UI. |
| **`handleParseSrt`** | `StepParseSrt.tsx` | Reads text inside an SRT file and converts start/end timestamps into exact numbers in seconds. |
| **`handleRender`** | `StepRender.tsx` | Main controller for building subtitles. Calculates gap-bridging timestamps, assigns track alternation (`V1`/`V2`), and dispatches render commands. |
| **`checkProjectState`** | `sync.jsx` | Checks if Premiere Pro currently has a timeline sequence open and ready for editing. |
| **`getData`** | `sync.jsx` | Reads active sequence settings (FPS, width, height) and finds the target MOGRT template inside the Premiere project bin. |
| **`createCaptions`** | `mogrt.jsx` | Core timeline builder. Runs once per word to place a MOGRT clip on the timeline, set its exact length in time ticks, and inject text strings. |
| **`bridgeCaptionGaps`** | `mogrt.jsx` | Scans all generated subtitle clips on the timeline chronologically and stretches any clip that falls 1–2 frames short so it snaps seamlessly to the next clip. |
| **`getTimelinePhraseMap`** | `EditView.tsx` | Scans Premiere's video tracks to collect all MOGRT clips and organizes them into sentence groups for the Cockpit UI. |
| **`inspectMogrtProperties`** | `EditView.tsx` | Reads the hidden text structure and custom parameters inside a placed timeline clip. |
| **`updatePhraseMogrtProperty`**| `EditView.tsx` | Instantly updates the text displayed inside a subtitle clip on the timeline when you edit text in the panel. |
| **`onSelectByMogrt`** | `EditView.tsx` | Automatically finds and selects all phrases using the same MOGRT type when you click its colored badge. |
| **`executeWordTransfer`** | `EditView.tsx` | Moves a word token from one clip to another during drag-and-drop surgery and adjusts clip durations to match. |
| **`findClipUnderPlayhead`** | `WordEditGroup.tsx`| Checks the exact timeline position of the playhead bar and locates which subtitle clip sits underneath it. |
| **`sm_tools_split_v28`** | ExtendScript | Slices a single subtitle clip into two separate clips at a specific word index and assigns alternating video tracks. |
| **`sm_tools_join_v28`** | ExtendScript | Merges two adjacent highlighted clips into one continuous clip and combines their text words. |
| **`sm_tools_add_word_v28`** | ExtendScript | Adds a new word into a phrase clip and recalculates timing divisions across the clip. |
| **`sm_tools_remove_word_v28`**| ExtendScript | Deletes a word from a clip and redistributes timing evenly among remaining words. |
| **`sm_tools_reset_progression_v28`**| ExtendScript | Fixes animation sync by re-numbering the `Ⓣ Word Progression` slider sequentially across selected clips. |
| **`sm_sync_all`** | ExtendScript | Clones all typography, colors, and transform settings from a master anchor clip to all targeted clips. |
| **`sm_sync_text`** | ExtendScript | Synchronizes only the text string from master to targets. |
| **`sm_sync_style`** | ExtendScript | Synchronizes font family, font size, weight, and tracking from master to targets. |
| **`sm_sync_psr`** | ExtendScript | Synchronizes Position, Scale, and Rotation coordinates from master to targets. |
| **`smGetSelectionParams`** | ExtendScript | Reads custom template properties (sliders, checkboxes, colors) created by the MOGRT designer. |
| **`smApplyParam`** | ExtendScript | Updates a custom template slider or color picker property on selected timeline clips in real time. |
| **`smSyncParamAcrossSelected`** | ExtendScript | Synchronizes a single specific property across all selected MOGRT clips of the exact same template type while returning real-time diagnostic logs (`debugLog`) to the UI. |
| **`exportDiagnostics`** | `main.js` | Collects extension logs and bundles them into a zip file for troubleshooting or reporting bugs. |

