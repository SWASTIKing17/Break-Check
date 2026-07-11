# Technical Standard: MOGRT Property Synchronization

This document defines the **immutable logic** for syncing properties between MOGRT clips in SubMachine. Adhering to these patterns is critical to prevent regressions in "Sync All" and "Word Surgery" operations.

---

## 1. Property Identification (Flat Index Dependency)
**Standard:** For bulk synchronization (Sync All), use **Flat Indexing** (e.g., `mgt.properties[item.index]`) as the primary target resolution method.

**Reason:** 
While group-aware pathing is conceptually superior, the Premiere Pro ExtendScript API often flattens the property tree in a way that makes deep group traversal unreliable. Professional MOGRTs with identical internal structures must be synced by their physical index to ensure that identical names in different groups (like multiple "Stroke" colors) map correctly to their corresponding counterparts.

**The Code Pattern:**
```javascript
// GATHER: Master properties are collected into a flat list
for (var k = 0; k < mgt.properties.length; k++) {
  masterMogrtData.push({
    index: k,
    displayName: mgt.properties[k].displayName,
    value: mgt.properties[k].getValue()
  });
}

// INJECT: Target properties are found by matching the index
var targetProp = targetMgt.properties[item.index];
if (targetProp && targetProp.displayName === item.displayName) {
  targetProp.setValue(item.value, 1);
}
```

---

## 2. Text Synchronization (The "JSON Envelope" Rule)
**Standard:** MOGRT text is a JSON string. You must parse it, modify specific keys, and stringify it back.

### A. Full Overwrite (Same Phrase)
Used when syncing clips that belong to the same phrase.
```javascript
var textObj = JSON.parse(textParam.getValue());
textObj.textEditValue = newText;
textObj.fontTextRunLength = [newText.length]; // Must match character count
textParam.setValue(JSON.stringify(textObj), 1);
```

### B. Style-Only Sync (Cross-Phrase Protection)
**CRITICAL:** When syncing styles from a "Master" to a different sentence, you must **preserve** the target's text while copying the master's style (font, size, alignment).
```javascript
var masterStyle = JSON.parse(masterValue);
var currentText = JSON.parse(targetProp.getValue()).textEditValue;

masterStyle.textEditValue = currentText; // Protect existing text
masterStyle.fontTextRunLength = [currentText.length]; 
targetProp.setValue(JSON.stringify(masterStyle), 1);
```

---

## 3. Color Synchronization (The "Version-Proof" Rule)
**Standard:** Different Premiere versions return colors as Arrays `[a,r,g,b]` or JSON strings `{red, green...}`. You must normalize them.

**The Normalization Pattern:**
```javascript
// Injection must always use setColorValue for reliability
if (item.valueType === 6 && (item.value instanceof Array)) {
    var a = item.value[0], r = item.value[1], g = item.value[2], b = item.value[3];
    targetProp.setColorValue(a, r, g, b, 1); // 1 = Update UI
}
```

---

## 4. Slider & Numeric Sync (The "Rounding" Rule)
**Standard:** Direct `setValue()` is used, but **Word Progression** must be rounded to avoid "sticky phrases" caused by float imprecision (e.g., `0.99999` instead of `1`).

**The Code Pattern:**
```javascript
// Protection: Never bulk-sync Progression unless it's a "Repair" operation
if (item.displayName === "Ⓣ Word Progression") return; 

// General sliders
targetProp.setValue(item.value, 1);
```

---

## 5. Highlight Preservation (The "Progression Guard")
**Standard:** `Word Progression` is considered **Unique Identity Data** for each clip. It must NEVER be included in any bulk sync operation (`Sync All`, `Sync Text`, etc.).

**Reason:** 
In SubMachine, each clip in a phrase highlights a specific word (e.g., Word 1, Word 2, Word 3). If you sync the "Progression" slider from a master (Word 1) to a target (Word 2), the target will reset to highlight Word 1. This destroys the timing of the entire phrase.

**The Implementation Rule:**
- Any property containing the string "Progression" must be filtered out of the property list before the sync loop begins.
- In the `syncAll` loop, an explicit string check `if (prop.displayName.indexOf("Progression") !== -1) continue;` acts as the final safety barrier.

---

## 6. Glyph-Based Sync Guards (Ⓢ & Ⓑ)
**Standard:** Properties containing the glyphs **Ⓢ** (Specific) or **Ⓑ** (Phrase/Boundary) must be treated as **Phrase-Specific Logic**.

**Sync Rules:**
- **Same Phrase:** **ALLOWED.** These properties can be unified across clips within the same sentence to ensure visual consistency of that specific phrase.
- **Cross Phrase:** **STRICTLY BLOCKED.** These properties must never be synced to a different sentence, as they control settings unique to the master's word structure (e.g., "Ⓢ Specific Word 1").

**Implementation Rule:**
When the sync logic detects a "Cross-Phrase" operation, it must iterate through the master's properties and filter out any name containing `\u24c8` (Ⓢ) or `\u24b7` (Ⓑ) before proceeding with injection.

---

## 7. Vocabulary of Terms (For Developers & Agents)
To prevent confusion, the following terms are used strictly as defined:
- **Premiere Component (External):** Properties found in the "Effect Controls" panel *outside* the Essential Graphics tab.
- **MOGRT Parameter (Internal):** Properties found *inside* the "Essential Graphics" panel.
- **Property Group:** A container within the Essential Graphics panel that holds nested parameters. Must be searched recursively.
- **Ⓢ (Specific):** Glyph indicating properties unique to specific words in a phrase.
- **Ⓑ (Boundary):** Glyph indicating properties tied to phrase/sentence structure.
- **JSON Envelope:** The stringified JSON object used by MOGRTs to store text content and metadata.
- **Word Progression:** The specific SubMachine slider used to highlight individual words.

---

## 8. The 4 UI Sync Tools (Functionality Detail)

SubMachine provides 4 distinct sync buttons in the **Tools** tab. Each uses a specific filter to determine which properties are "injected" into the target clips.

### A. Sync All
The primary tool for unifying the "look" of subtitles. 
-   **MGT Scope (Internal):** All properties EXCEPT `Word Progression`.
-   **Motion Scope (External):** **IGNORED.**
-   **Phrase-Awareness:**
    -   **Same Phrase:** Performs a **Full Overwrite** (Copies Style + Text Content + Ⓢ/Ⓑ properties).
    -   **Cross Phrase:** Performs a **Style-Only Sync** (Copies Style, protects existing Text and Ⓢ/Ⓑ properties).

### B. Sync Text & Typeface (Ⓣ)
Focused exclusively on the font, size, and text-specific styling.
-   **MGT Scope (Internal):** ONLY properties mapped to `TEXT` in `properties.jsx`.
-   **Motion Scope (External):** IGNORED.
-   **Phrase-Awareness:**
    -   **Same Phrase:** Overwrites everything (Font + Words).
    -   **Cross Phrase:** Style Merge (Copies Font/Size, preserves existing Words).

### C. Sync Style & Animation
Syncs visual aesthetics (Colors, Strokes, Opacity, Animation toggles) while strictly leaving the text alone.
-   **MGT Scope (Internal):** All properties EXCEPT `Text Input` and `Word Progression`.
-   **Motion Scope (External):** IGNORED.
-   **Phrase-Awareness:** Always Safe (never overwrites text content).

### D. Sync Position/Scale/Rotation (PSR)
Focuses purely on the physical placement and sizing of the subtitle.
-   **MGT Scope (Internal):** Targets the **Master Transform Group** (mapped to `MGT_POSITION`, `MGT_SCALE`, etc. in `properties.jsx`).
-   **Motion Scope (External):** **IGNORED.** Does not touch the Premiere "Motion" component.
-   **Requirement:** The MOGRT must contain a "Master Transform" or "Transform" group in the Essential Graphics panel.
-   **Phrase-Awareness:** N/A (Safe for all phrases).

---

## 9. Summary Table

| Property Type | Sync Method | Key Guard | Component vs MGT |
| :--- | :--- | :--- | :--- |
| **Text** | JSON Parse/Stringify | Must update `fontTextRunLength` | **Internal (MGT)** |
| **Colors** | `setColorValue(a,r,g,b)` | Normalize Array vs Object formats | **Internal (MGT)** |
| **Sliders** | `setValue(val)` | Round values for `Progression` logic | **Internal (MGT)** |
| **Transforms** | `setValue(val)` | Target "Master Transform" group | **Internal (MGT)** |
| **Motion** | `setValue(val)` | **Avoided** in standard SubMachine sync | **External (Comp)** |

---

## 10. Utility Sync Tools (Internal)

### A. Join Selection (`joinGetSelection`)
A utility tool used during "Word Surgery" (Join Phrases) to gather clip data without strict playhead requirements.
-   **Purpose:** Prepares the data payload for the `sm_tools_join` surgical routine.

---

## ⚠️ Common Pitfalls (Why Sync Breaks)
1.  **Index Dependency:** Using `props[i]` from one MOGRT on another MOGRT that has different properties.
2.  **Stringified Colors:** Forgetting that newer Premiere versions return a JSON string for color values instead of a 4-item array.
3.  **Run Length Mismatch:** Setting a long text string but keeping a short `fontTextRunLength` (results in truncated text or crashes).
4.  **Progression Overwrite:** Accidental bulk-syncing of the "Word Progression" slider, which resets every word highlight in the timeline to match the master.
