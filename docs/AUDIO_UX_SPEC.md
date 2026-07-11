# Audio freeXan: UI/UX Specification & Design Documentation

This document defines the interface layout, interaction patterns, state machines, and UX guidelines for the **Audio freeXan** Premiere Pro CEP panel upgrade. It serves as the single source of truth for both frontend layout and backend integration developers.

---

## 1. Visual Identity & Palette

To maintain a premium feel that blends natively with Adobe Premiere Pro's workspace, the panel uses the following custom styling system:

* **Backgrounds**: Deep slate dark-mode tones (`#141414` for headers/drawers, `#1f1f1f` for content grids).
* **Text**: High-contrast white (`#ffffff`) for titles, medium grey (`#a0a0a0`) for metadata labels, and muted grey (`#606060`) for folders.
* **Accent Colors**: 
  * Neon Green / Mint (`#00C896`): Active state, playback, and **SFX** highlights.
  * Deep Coral / Violet (`#8E2DE2` or `#F7567C`): Playhead tracking, hover highlights, and **BGM** highlights.
* **Typography**: Clean, sans-serif interfaces (`Inter` or system defaults) with compact letter spacing.

---

## 2. Feature-by-Feature UI/UX Breakdown

### Feature 1: Timeline Playback Sync (Spacebar Sync Play)

#### UI Design
* **Control Element**: A toggle switch located in the top-right corner of the panel header.
  * *Label*: "Sync Timeline Play" (accompanied by a small chain-link icon).
  * *Active State*: Mint green switch (`#00C896`), icon colored mint green.
  * *Inactive State*: Muted dark grey switch (`#444444`).
* **Visual Playhead Sync**: While playing, the large waveform player features a glowing playhead line matching the precise frame index of the timeline.

#### UX Flow & Interaction
1. **Selection**: User clicks any audio card in the main grid. The card is highlighted with a subtle border.
2. **Activation**: User hits the **Spacebar** key.
   * *If Sync is ON*:
     * The panel triggers local audio playback and simultaneously fires a WebSocket command (`play_timeline`) to the Electron backend.
     * The backend queries the current playhead position using ExtendScript (`app.project.activeSequence.getPlayerPosition()`), stores it as `initialTicks`, and executes sequence playback.
   * *If Sync is OFF*:
     * Local audio in the panel plays; the Premiere timeline remains static.
3. **Pausing / Completion**:
   * If the user presses the **Spacebar** again, or if the audio track reaches its end:
     * Local audio stops immediately.
     * A WebSocket command (`restore_playhead`) is sent, calling ExtendScript to set the player position back to `initialTicks`.
     * The timeline playhead snaps back instantly, restoring the editor's context.

---

### Feature 2: Core Audio Explorer Features

#### UI Design
* **Layout Grid**: Responsive auto-filling grid system (`grid-template-columns: repeat(auto-fill, minmax(130px, 1fr))`).
* **Sidebar Tree**: List of folder items with folder icons and caret arrows (`▸` collapsed, `▾` expanded). Muted hover states.
* **Detail Drawer**: Bottom-docked player panel with a height of `140px` that rises from the bottom of the screen with a `0.3s cubic-bezier(0.25, 0.8, 0.25, 1)` slide-in transition upon selecting a track.

#### UX Flow & Interaction
* **Navigation**: Clicking folders in the sidebar tree instantly filters the right-hand grid. Loading indicators are represented by a subtle pulse animation on the cards.
* **Trim Handles**: The detail drawer waveform features left and right overlay sliders. Draggable handles contain tactile drag bars (`||`). Dragging a handle dynamically updates the Start/End timecode indicators in real time.
* **Pitch & Speed Sliders**: Slider knobs change color on hover. Clicking "Reset" next to the slider instantly resets the value to `0 semitones` / `1.0x` speed.

---

### Feature 3: Smart Project Metadata Tagging & Client Profiles

#### UI Design
* **History Badge**: Mini text badge on the bottom edge of cards (e.g., `"Used 2x"`).
* **Sidebar Profile Filter**: A virtual folder section named **"Client Essentials"** containing two pre-configured lists:
  * *"Recommended for [Task]"*
  * *"Frequently Used by [Client]"*

#### UX Flow & Interaction
* **Auto-Tracking**: Every time an asset is imported successfully, the backend records the asset's database ID along with the active project's Client, Funnel, and Task parameters.
* **Consistency Alerts**: If an editor selects a sound that has already been used in the active project, a small warning icon appears next to the name, prompting: *"Used in this project before"*, helping the designer maintain sound variety.

---

### Feature 4: Smart BGM vs. SFX Import Routing

#### UI Design
* **Import Option Prompt**: Upon clicking "Add" in the player drawer, a quick inline overlay replaces the import buttons with a confirmation:
  * Text: *"Confirm Audio Type"*
  * Two buttons: `[ BGM ]` (highlighted in violet) and `[ SFX ]` (highlighted in mint green).
  * A quick checkbox: *"Don't ask again for this session"*.
* **Template Slots UI**: Within the **Link freeXan** settings tab, two new rows are visible under the slot configurations named **BGM** and **SFX**, allowing the mapping of corresponding project bins.

#### UX Flow & Interaction
1. User clicks **Add**.
2. If classification prediction is confident, the button matching the classification is focused/active by default.
3. User presses **Enter** or clicks the option.
4. The system executes the ExtendScript import, placing the file into the template's designated BGM/SFX bin. If no custom slots exist, it falls back to the common `Audio` bin.

---

### Feature 5: Waveform Color-Coding by Classification

#### UI Design
* **Color Themes**:
  * **BGM Waveforms**: Rendered using a linear gradient from Deep Violet (`#8E2DE2`) to Coral (`#F7567C`).
  * **SFX Waveforms**: Rendered using a linear gradient from Emerald Green (`#00C896`) to Neon Cyan (`#00E5FF`).
* **Hover Overlay**: Card hover states apply a tint corresponding to their classification color, enhancing visual feed-forward.

#### UX Flow & Interaction
* Visually breaks up the monotony of grey waveforms. Editors browsing the grid can search for transitions (SFX) vs background tracks (BGM) purely through color recognition without needing to read metadata or folder paths.

---

### Feature 6: Drag-and-Drop Direct to Timeline

#### UI Design
* **Drag Target Indicator**: Grabbing an audio card triggers a shadow preview ghost of the card with a small `+` icon attached to the cursor.
* **Drag-State Overlay**: An overlay appears on top of the panel stating: *"Drag directly to Timeline or Bin"*.

#### UX Flow & Interaction
1. **Initiate Drag**: User clicks and holds a card, dragging it outside the panel boundaries.
2. **Asynchronous Process**: 
   * On drag start, the panel fires a WebSocket request (`pre_render_drag`) to the Electron backend.
   * The backend renders a temporary WAV file using FFmpeg with the chosen trims, pitch, and speed parameters.
   * The file path of the temporary file is assigned to the OS native drag-and-drop payload (`text/plain` and file system list formats).
3. **Drop**: User drops the cursor onto the Premiere Pro timeline or project bin. Premiere imports the fully customized temporary file instantly.

---

### Feature 7: Waveform Peak Marker & BPM Visualizer

#### UI Design
* **Transient Indicators**: Light, semi-transparent white vertical dotted lines (`rgba(255, 255, 255, 0.15)`) overlaying the main player waveform at identified beat/peak coordinates.
* **Tempo Chip**: A small badge at the corner of the waveform indicating the calculated tempo, e.g., `"120 BPM"`.

#### UX Flow & Interaction
* During preview playback, the playhead moves across the dotted marker lines. 
* Editors can align their trim handles to snap onto these vertical beat markers, guaranteeing that the audio loop starts/stops precisely on beat, eliminating awkward editing offsets.
