# Persistent Word Selectors – Index Shift Model

**Purpose**: Provide a clean, low‑maintenance way to keep word‑specific styling (color, scale, rotation, etc.) attached to the same logical word when the phrase is split, joined, or surgically moved.

---

## 1. High‑Level Concept
*   In After Effects the MOGRT will expose **one numeric slider** named `Ⓢ Word Index`. The user drags this slider to pick the *target word* (1‑based index) that they want to style.
*   All style‑related properties that should follow the word are **regular MOGRT controls** (e.g., `Color`, `Scale`). The AE expression uses the current slider value to decide which word to apply those properties to.
*   The plugin’s backend merely **adjusts the slider value** when timeline tools rearrange words, exactly the same way it updates `Ⓣ Word Progression`.

---

## 2. Required Code‑Base Changes
### 2.1 `panel/jsx/core/timeline.jsx`
| Location | Change | Reason |
|----------|--------|--------|
| **Add Helper** | `function adjustWordIndexSlider(clip, offset)` – finds the `Ⓢ Word Index` parameter, reads its current value, adds `offset`, clamps to `[1, maxWords]`, and writes it back. | Centralizes the index‑shift logic.
| **Split Tool (`sm_tools_split_v28`)** | After the new Phrase B is built, call `adjustWordIndexSlider(mcB, -splitIdx)` where `splitIdx` is the zero‑based index of the split point. | Moves the slider so that the same logical word now points to the word in Phrase B (e.g., Word 3 → Word 1).
| **Join Tool (`sm_tools_join_v28`)** | When moving Phrase 2 clips onto the destination track, call `adjustWordIndexSlider(clip, phraseAWordCount)` for each moved clip. | Increments the index by the number of words in the first phrase, keeping the semantic mapping.
| **Surgery Tool (`sm_tools_split_join_v28`)** | Compute `offset = (sourceIsBeforeTarget ? -stolenWordCount : +targetWordCount)` and call `adjustWordIndexSlider` on each affected clip. | Handles both prepend and append cases.
| **Extract/Apply Style** | No changes needed – the existing `extractMasterStyle`/`applyMasterStyle` will still copy all other properties. The slider is treated as a **standard property** and will be transferred automatically because its value has already been corrected.

#### Sample Helper (pseudo‑code)
```javascript
function adjustWordIndexSlider(clip, offset) {
    var mgt = clip.getMGTComponent();
    var idxParam = mgt.properties.getParamForDisplayName('Ⓢ Word Index');
    if (!idxParam) return; // Slider not present – nothing to do
    var cur = parseInt(idxParam.getValue(), 10) || 1;
    var newVal = cur + offset;
    // Clamp to valid range (1 … maxWords). We can read maxWords from the MOGRT if needed.
    if (newVal < 1) newVal = 1;
    // Optional: derive maxWords from the total number of word‑specific controls.
    idxParam.setValue(newVal.toString(), 1);
}
```
---

### 2.2 `panel/jsx/core/sync.jsx`
*   **Do not modify** the slider during a bulk `syncAll`/`syncText` operation – the slider represents the *author‑chosen* word, not the current progression.
*   Add a guard:
```javascript
var idxParam = mgtComp.properties.getParamForDisplayName('Ⓢ Word Index');
if (idxParam) continue; // skip – leave user‑selected index untouched
```
*   This ensures that style synchronisation copies colors, scale, etc., **without overwriting** the user‑chosen index.
---

## 3. Front‑End Adjustments
*   **UI (panel.html / panel.js)** – add a numeric slider `<input type="range" min="1" max="10" …>` labeled *"Word Index"*.
*   Bind the slider to the AE parameter `Ⓢ Word Index` via CEP `evalScript` calls:
```javascript
window.__adobe_cep__.evalScript('setWordIndex(' + value + ')');
```
*   The existing *"Progression"* slider stays untouched; it will continue to drive the playback cursor.
---

## 4. Impact on Existing Tools
| Tool | Behaviour Change | Side‑Effect |
|------|------------------|------------|
| **Split** | Slider value for the new Phrase B is decreased by the split index. | No visual change to other properties – they are copied as‑is.
| **Join** | Slider values for the moved Phrase 2 are increased by the word count of Phrase 1. | Guarantees that a style attached to word 1 of Phrase 2 now follows word N+1 after the join.
| **Surgery (Split & Join)** | Offsets are calculated per‑direction and applied to each moved clip. | Maintains continuity for any number of word‑specific controls.
| **Sync All / Sync Text** | Slider is excluded from bulk sync, preserving the author’s manual selection. | Prevents accidental overwriting of the user‑chosen word.
---

## 5. Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| **Slider out of bounds** (e.g., user selects 8 but phrase only has 5 words) | Clamp the value in `adjustWordIndexSlider`; optionally display a warning in the UI.
| **Missing Slider** (older MOGRT templates) | The helper silently returns – the tool continues to work; legacy MOGRTs simply won’t have persistent selectors.
| **Performance** – calling `getParamForDisplayName` many times | Cache the parameter reference per‑clip inside the helper when possible.
---

## 6. Where We Left (2026‑04‑27)
*   Blueprint created (see this file).
*   No code changes have been committed yet – this document captures the agreed‑upon **Index Shift Model**.
*   Next step: implement `adjustWordIndexSlider` and integrate the calls into the three tool functions in `timeline.jsx`.

---

*Generated by Antigravity – the AI coding assistant.*
