# Blueprint: Sync Text & Typeface (The Typo Killer)

## 1. Overview & Purpose
The **Sync Text & Typeface** tool is designed for rapid corrections. It allows an editor to fix a typo or change the font style in a single MOGRT and broadcast that change to all selected clips in one click.

---

## 2. User Experience (UX)
1. **The Correction**: Editor fixes the text or typeface in the "Master" clip (usually the one under the playhead).
2. **Action**: Editor selects all clips needing the fix and clicks **"Sync Text & Typeface."**
3. **Outcome**:
    - Every selected clip now has the **exact same text** as the master.
    - Every selected clip inherits the **Font, Size, and Style** (Italic, Caps, etc.) of the master.
    - **Preservation**: Colors, Positions, and other non-text sliders are **NOT** changed.

---

## 3. Detailed Technical Workflow

### Phase A: Master Capture
1. **Identify Master**: Locate the clip under the **Playhead (CTI)**.
2. **Extract Property**: Capture the raw value of the `Ⓣ Text Input` property. 
    - *Note: This is a JSON string containing textEditValue, fontFamily, fontSize, etc.*

### Phase B: Full Mirroring
1. **Targeting**: Identify all other selected clips.
2. **Direct Overwrite**: For each target, use `targetProp.setValue(masterValue, 1)`.
    - This replaces the word AND the typeface in one operation.
3. **Property Safety**: The script **only** targets properties with the `Ⓣ` (Circle-T) prefix.

### Phase C: Visual Feedback
1. **Label Check**: Verify the Label Colors of the selection.
2. **Consolidation**: If the clips are now identical in content and style, ensure they share the same **Premiere Label Color** (Mango/Cerulean) to show they are synchronized.

---

## 4. Why Use This Tool?
- **Typo Management**: Fix a recurring spelling error across a whole sentence in 2 seconds.
- **Branding Consistency**: Quickly update the font family of a whole subtitle track without affecting custom word-level colors.
- **Workflow Efficiency**: Eliminates the need for manual copy-pasting of text strings in the Essential Graphics panel.

---

## 5. Future Evolutionary Path
- **v3.1 Integration**: Once "Persistent Word Selectors" are implemented, this tool will gain the ability to sync styles for specific word indices even if the words themselves are different (Dynamic Styling).
