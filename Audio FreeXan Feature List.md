# Audio freeXan Feature List & Specification

This document lists all features for the **Audio freeXan** Premiere Pro CEP Plugin.

## 1. Timeline Playback Sync (Spacebar Sync Play)
* **Description**: Allows the editor to preview how an audio asset fits with the current timeline video/edit without actually importing or adding any files to the project.
* **How it works**:
  * There is a toggle switch on the UI: **"Sync Play with Timeline"**.
  * When this toggle is enabled:
    1. The user clicks on any audio asset in the grid to select it.
    2. The user presses the **Spacebar** to play the audio.
    3. As soon as the audio begins playing, the Premiere Pro timeline playhead starts playing/moving forward in sync with the audio playback.
    4. While playing, the audio from the plugin plays back in sync with the video on the timeline.
    5. As soon as the audio finishes playing, or if the user pauses the audio (by pressing **Spacebar** again), the Premiere Pro playhead immediately snaps/returns to its initial starting position.
* **Technical Details**:
  * Store the starting playhead position on play start.
  * During playback: either call ExtendScript to play/scrub the sequence or trigger timeline play.
  * On pause/stop/finish: invoke ExtendScript to set the playhead position back to the stored initial starting ticks/seconds.

## 2. Core Audio Explorer Features
* **Directory Monitoring**: SQLite-backed tracking of local directories containing audio assets.
* **Responsive Waveform Grid**: Displaying small visual representations of the audio waveforms on cards.
* **Detail Preview Drawer**:
  * Draggable start/end trim handles.
  * Speed/Duration multiplier slider (0.5x to 2.0x).
  * Pitch shift slider (-12 to +12 semitones).
  * Reverse audio checkbox.
* **Search & Favorites**: Text search filtering and starring of favorite sounds.
* **Direct Import**: Add the fully processed/manipulated audio file directly to the sequence at the current playhead position or in the active bin.

## 3. Smart Project Metadata Tagging & Client Profiles
* **Description**: Leverages active project metadata (Client, Funnel, Task) to auto-tag sound choices and enable intelligent filtering.
* **How it works**:
  * Every time a sound is imported into a sequence, the backend records that this asset was used in the current `Client-Funnel-Task` profile inside `audio-library.db`.
  * The sidebar displays a virtual list category: **"Frequently Used by [Client]"** or **"Recommended for [Task]"**.
  * Shows a history indicator on the card (e.g. "Used 3x in project") to help editors maintain consistency or avoid using the same sound effect too close together.

## 4. Smart BGM vs. SFX Import Routing
* **Classification Engine**:
  * Audio files are classified as either **BGM** (Background Music) or **SFX** (Sound Effects) based on the parent folder name (e.g. path containing "music" or "sfx") or duration (BGM if > 30 seconds, SFX otherwise).
* **Confirm Before Import**:
  * Upon clicking "Add" to import, a quick prompt asks the user to confirm/adjust the classification (defaulting to the predicted tag).
* **Target Bin Routing (Optional Slots)**:
  * Adds two optional slots inside the Premiere Pro Template assigner: **BGM** and **SFX**.
  * If the confirmed file is **BGM** and the BGM slot is configured, it routes to that bin.
  * If it is **SFX** and the SFX slot is configured, it routes to that bin.
  * If the specific slots are not configured, it falls back to the standard **Audio** slot.

## 5. Waveform Color-Coding by Classification
* **Description**: Visually color-codes waveforms in the UI so the editor can distinguish BGM and SFX at a glance.
* **How it works**:
  * **BGM** tracks render their waveforms in a warm theme color (e.g., orange or violet).
  * **SFX** tracks render their waveforms in a cool theme color (e.g., neon green or cyan).
  * These colors help users browse large collections of files without reading text labels.

## 6. Drag-and-Drop Direct to Timeline
* **Description**: Allows users to drag an audio item card directly from the panel and drop it onto the Premiere Pro timeline or project bin.
* **How it works**:
  * When a drag event begins on an audio card:
    1. The CEP panel quickly instructs the Electron backend to render/process the temporary audio file containing the current trim, pitch, and speed adjustments.
    2. The resulting temporary file path is set as the drag payload.
    3. Dropping this payload onto the Premiere timeline/bin imports the processed audio file instantly.

## 7. Waveform Peak Marker & BPM Visualizer
* **Description**: Displays transients and beat indicators to help editors sync audio beats with sequence cuts.
* **How it works**:
  * For **BGM** tracks, the indexing pipeline calculates tempo (BPM) and transient points.
  * Draws vertical marker lines on the large player waveform showing beat intervals.
  * Helps editors trim files starting exactly on beat lines for perfect syncing.

## 8. Advanced Audio Processing Preview (Wavesurfer.js & Tone.js)
* **Description**: Delivers a zero-latency, highly interactive preview experience inside the panel before anything is imported.
* **How it works**:
  * **Wavesurfer.js Integration**: Renders the visual waveform and allows editors to draw **Regions** directly on the canvas to set exact trim start/end points intuitively.
  * **Tone.js Integration**: Intercepts the audio context to provide real-time **Pitch Shifting** and **Time Stretching**. When the user drags the pitch or speed slider, Tone.js applies the effect instantly in the browser preview.
  * **Reverse Playback** is simulated in real-time, allowing immediate auditioning.
