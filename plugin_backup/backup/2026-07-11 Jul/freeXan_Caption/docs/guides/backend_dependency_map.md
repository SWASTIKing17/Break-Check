# SubMachine Backend Dependency Map

This document tracks the "Common Roads" of the SubMachine backend. These are functions used by multiple systems. Modifying them is like changing a major highway — it affects everyone.

## 1. The Nervous System (Core Utilities)

These functions are used across almost every file in the backend. They provide the basic infrastructure for logging, error handling, and communication.

### [jsxLog](file:///c:/Swastik%20Development/SubMachine/panel/jsx/core/utils.jsx)
*   **The Metaphor:** The "Logbook" of the entire operation.
*   **Usage:** Used everywhere.
*   **Risk:** **CRITICAL**. If this fails, debugging becomes impossible.
*   **Caution:** Never add logic that could throw an error inside `jsxLog`.

### [reportError](file:///c:/Swastik%20Development/SubMachine/panel/jsx/core/utils.jsx)
*   **The Metaphor:** The "Emergency Siren".
*   **Usage:** Used in almost every `catch` block.
*   **Risk:** **CRITICAL**. If this fails, a minor error will crash the entire extension without explanation.
*   **Caution:** Ensure it always returns a valid JSON string for the frontend to parse.

### [safeCall](file:///c:/Swastik%20Development/SubMachine/panel/jsx/core/utils.jsx)
*   **The Metaphor:** The "Security Gate" between the UI (Javascript) and the Engine (ExtendScript).
*   **Usage:** Wraps all entry-point functions.
*   **Risk:** **EXTREME**. Changes here affect every single button click in the UI.
*   **Caution:** This function standardizes the response format `{ ok: true, data: ... }`. Never change this structure.

## 2. The Color & Track Coordinator (Staircase Model)

These functions manage the visual organization of the timeline, preventing "clashes" between adjacent phrases.

### [getSafeAlternatingColor](file:///c:/Swastik%20Development/SubMachine/panel/jsx/core/utils.jsx) & [getSafeAlternatingTrack](file:///c:/Swastik%20Development/SubMachine/panel/jsx/core/utils.jsx)
*   **The Metaphor:** The "Traffic Lights" that prevent cars from colliding.
*   **Usage:** Used by Split, Join, and Surgery tools.
*   **Risk:** **HIGH**. Breaking this makes the timeline look messy or makes new clips invisible (color collision).
*   **Caution:** These rely on checking neighbors. Ensure the neighbor-finding logic is robust.

## 3. The Phrase Architect (Timeline Tools)

These functions are defined in `timeline.jsx` and are shared between the Split, Join, and Surgery tools.

### [getPhraseClips](file:///c:/Swastik%20Development/SubMachine/panel/jsx/core/timeline.jsx)
*   **The Metaphor:** The "Family Finder". It identifies which MOGRTs belong to the same sentence.
*   **Usage:** Fundamental to all v2.8+ timeline tools.
*   **Risk:** **EXTREME**. If the heuristic fails, the tool might join the wrong clips or split in the wrong place.
*   **Caution:** It uses `Text Input` and `Word Progression` to group clips. Changes to MOGRT property names will break this.

### [extractMasterStyle](file:///c:/Swastik%20Development/SubMachine/panel/jsx/core/timeline.jsx) & [applyMasterStyle](file:///c:/Swastik%20Development/SubMachine/panel/jsx/core/timeline.jsx)
*   **The Metaphor:** The "Photocopier". It copies colors, fonts, and positions from one clip to many others.
*   **Usage:** Used by all sync and editing tools.
*   **Risk:** **HIGH**. These functions handle complex property types (Colors, Arrays, JSON).
*   **Caution:** ExtendScript's `getColorValue` behavior changes between Premiere Pro versions. These functions contain critical version-aware logic.

### [moveClipToTrack](file:///c:/Swastik%20Development/SubMachine/panel/jsx/core/timeline.jsx)
*   **The Metaphor:** The "Mover". It picks up a clip and places it on a new floor (track).
*   **Usage:** Used by Split, Join, and Surgery for the "Staircase" effect.
*   **Risk:** **HIGH**. This is a destructive operation (overwrite + remove). 
*   **Caution:** Any failure here can lead to clips being deleted without being replaced.

## Summary Table

| Function | File | Impact Area |
| :--- | :--- | :--- |
| `jsxLog` | `utils.jsx` | Global Debugging |
| `reportError` | `utils.jsx` | Global Stability |
| `safeCall` | `utils.jsx` | UI Integration |
| `getPhraseClips` | `timeline.jsx` | Logical Grouping |
| `extractMasterStyle` | `timeline.jsx` | Styling & Sync |
| `moveClipToTrack` | `timeline.jsx` | Timeline Structure |
