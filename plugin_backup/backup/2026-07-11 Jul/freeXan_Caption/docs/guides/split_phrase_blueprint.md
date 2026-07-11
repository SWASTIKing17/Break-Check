# Blueprint: Split 1 Entire Phrase

## 1. Overview & Purpose
The **Split 1 Entire Phrase** tool allows users to logically divide a long subtitle phrase into two independent phrases without physically cutting MOGRT clips. It re-assigns the "Ownership" of words starting from the playhead position.

---

## 2. User Experience (UX)
1. **Targeting**: User places the playhead (CTI) over the clip intended to be the **last word** of the first phrase.
2. **Action**: User clicks "Split 1 Entire Phrase."
3. **Outcome**:
    - The original phrase text is split into two strings.
    - All clips up to the playhead become **Phrase A**.
    - All clips after the playhead become **Phrase B**.
    - **Visual Feedback**: The new Phase B is automatically assigned an alternating **Premiere Label Color** (e.g., Mango to Cerulean).

---

## 3. Detailed Technical Workflow

### Phase A: Playhead Mapping
1. **Identify Anchor**: Determine which clip the playhead is currently over in [timeline.jsx](file:///c:/Swastik%20Development/SubMachine/panel/jsx/core/timeline.jsx). Let this be Index `N`.
2. **Identify Group**: Find all clips belonging to the same phrase as Clip `N`.

### Phase B: Logical Separation
1. **String Splitting**: Fetch the `Ⓣ Text Input` from the group. Split into `TextA` and `TextB` at the playhead Word Index.
2. **Phase A Update**: Clips 1-N keep their text, style, and track.
3. **Phase B Update**: 
    - Clips N+1 to End receive `TextB`.
    - **Re-indexing**: Progressions are reset to 1-N.
    - **Same Track**: All clips stay on their original track.
4. **Visual Snapping (Strict Alternation)**: Phase B is automatically assigned the **opposite Label Color** of Phase A (e.g., if A is Mango, B must be Cerulean). The script must verify the next adjacent phrase to ensure no two neighboring phrases share the same color.

### Phase C: Property Preservation
- **Important**: The script only modifies `Ⓣ Text Input`, `Ⓣ Word Progression`, and the **Label Color**.
- All other MOGRT parameters (Global Position, Master Scale, etc.) are **preserved** because the clips are updated via `nodeId` without being replaced.

---

## 4. Pre-Flight Validation
- **Requirement 1**: Playhead must be over a valid SubMachine MOGRT clip.
- **Requirement 2**: The phrase must have at least 2 words.
- **Requirement 3**: Identification uses the **Smart Heuristic**: Matching `Text Input` + Sequential `Progression` (+1).

---

## 5. Future Evolutionary Path
- **v3.1**: Implementation of "Persistent Word Selectors" to allow specific word styles to move surgically with the text during the split.
