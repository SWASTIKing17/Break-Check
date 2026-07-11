# Blueprint: Split & Join Selection Tool

## 1. Overview & Purpose
The **Split & Join Selection** tool is designed for precision "re-balancing" of subtitles on the timeline. It allows a user to "steal" words from one phrase and join them to an adjacent phrase in a single click, automatically correcting text, timing, and word progression.

---

## 2. User Experience (UX)
1. **Selection**: User highlights a range of clips that includes part of one phrase and part (or all) of an adjacent phrase.
2. **Action**: User clicks "Split & Join Selection."
3. **Result**: 
    - The "stolen" words are moved to the target phrase.
    - All clips in the target phrase adopt a cohesive style.
    - Words remaining in the source phrase are re-indexed.
    - The timeline boundaries are snapped to prevent gaps or overlaps.

---

## 3. Detailed Technical Workflow

### Phase A: Pre-Flight Validation (Heuristics)
- **Phrase Identification**: Phrases are grouped by matching `Ⓣ Text Input` AND sequential `Ⓣ Word Progression` (N+1). This prevents accidental merging of different phrases with identical text.
- **Requirement 1**: Selection must contain at least 2 MOGRT clips.
- **Requirement 2**: Selected clips must be adjacent neighbors.
- **Requirement 3**: All selected clips must use the same MOGRT template.

### Phase B: Data Extraction (Backend)
- Identify the **Scalpel Point**: The `start.seconds` of the first selected clip.
- Identify **Source Phrase** vs **Target Phrase** based on selection bounds.
- Read `Ⓣ Text Input` and `Ⓣ Word Progression` from the boundary clips.

### Phase C: The "Surgery"
1. **String Manipulation**:
    - Segment the Source phrase text using the Progression indices.
    - Append/Prepend the "stolen" segment to the Target phrase text.
2. **Timeline Snapping (Option A: Gap-Filling)**:
    - Trim the last clip of the Source phrase to the Scalpel Point.
    - Extend the first clip of the Target phrase to the Scalpel Point.
    - **Auto-Bridging**: If a gap exists between the source and target selections, the expansion clip must be stretched to meet the boundary, ensuring zero empty space between the newly joined segments.
3. **Sequential Property Update**:
    - Loop through expanded Target Phrase in [timeline.jsx](file:///c:/Swastik%20Development/SubMachine/panel/jsx/core/timeline.jsx).
    - Apply **Smart Sync**: Update Text, Position, Scale, and Colors.
    - **Visual Sync**: Force all clips in the joined phrase to the **Master Label Color** (Mango or Cerulean) to ensure visual unification.

---

## 4. Anti-Glitch Measures
- **Property Preservation**: Use `nodeId` targeting to update existing clips instead of replacing them. This prevents "flattening" of styles and loss of custom keyframes.
- **Progress Feedback**: Utilize the UI progress bar to show real-time completion of the sequential Adobe API calls.
- **Error Handling**: Wrap the entire operation in a `try/catch` block. If validation fails, provide a descriptive Alert instead of a "JSX Crash."

---

## 5. Handoff Notes (Future Updates)
- **v3.1 Integration**: Once "Persistent Word Selectors" are implemented, this tool will be updated to move specific word styles (e.g., emphasis) along with the text during the join.
- **Audio Clamping**: Future versions may use audio analysis to refine the "Scalpel Point" precisely between spoken words.
