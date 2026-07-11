# Context: SubMachine v2.8 Logic Fixes (Typo, Gaps, and Colors)

This document provides the complete technical context required to resolve three core logic glitches discovered during the 2026-04-24 codebase audit.

## 1. The "Typo Sync" Glitch (Sync Text & Typeface)
*   **File**: [sync.jsx](file:///c:/Swastik%20Development/SubMachine/panel/jsx/core/sync.jsx)
*   **Function**: `syncText(data)` (Lines 276-318)
*   **The Error**: Current code explicitly protects the existing text when multiple phrases are selected:
    ```javascript
    if (item.displayName === "\u24c9 Text Input" && multi) {
        var template = JSON.parse(item.value);
        var current = JSON.parse(targetProp.getValue());
        template.textEditValue = current.textEditValue; // <--- THE BUG
        // ...
    }
    ```
*   **Required Fix**: Remove the `textEditValue` preservation. The tool should mirror the **entire JSON string** to allow "Master" typo corrections to broadcast to all selected clips.

## 2. The "Gap-Tooth" Surgery Glitch (Split & Join)
*   **File**: [timeline.jsx](file:///c:/Swastik%20Development/SubMachine/panel/jsx/core/timeline.jsx)
*   **Function**: `sm_tools_split_join_v28(params)` (Lines 282-363)
*   **The Error**: The "Surgery" phase only adjusts the junction (Scalpel Point) between the two original phrases. It does not perform a sequential check to bridge internal gaps between all clips in the new phrase.
*   **Required Fix**: Implement a gap-filling loop similar to the one found in `sm_tools_join_v28` (L252-258):
    ```javascript
    for (var idx = 0; idx < movedClips.length - 1; idx++) {
      if (movedClips[idx + 1].start.seconds > movedClips[idx].end.seconds) {
        var newEnd = new Time();
        newEnd.seconds = movedClips[idx + 1].start.seconds;
        movedClips[idx].end = newEnd;
      }
    }
    ```

## 3. The "Color Collision" Glitch (Label Colors)
*   **File**: [timeline.jsx](file:///c:/Swastik%20Development/SubMachine/panel/jsx/core/timeline.jsx)
*   **Functions**: `sm_tools_split_v28` and `sm_tools_join_v28`
*   **The Error**: Label colors are hardcoded toggles (Mango vs Cerulean). If a phrase is split next to a clip that already has the "New" color, the boundary becomes invisible.
*   **Required Fix**:
    1.  Add a helper `getSafeAlternatingColor(neighborPhraseA, neighborPhraseB)` to `utils.jsx`.
    2.  This helper must check the `projectItem.getColorLabel()` of the phrases immediately before and after the selection.
    3.  Assign a color that **differs from both** (standardizing on Mango/Cerulean).

## 4. Technical Constraints
- **Targeting**: Always use the Unicode `\u24c9` (circled T: `Ⓣ`) display name matching.
- **Safety**: Wrap all implementations in `safeCall` for standardized error reporting.
- **Integrity**: Use `nodeId` to target existing clips; never replace or delete clips unless physically necessary (not required for these fixes).
- **Aesthetics**: Ensure the UI progress bar is updated via `jsxLog` to show step-by-step completion.
