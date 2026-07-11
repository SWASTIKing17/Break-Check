# Blueprint: Join Multiple Phrases Tool

## 1. Overview & Purpose
The **Join Multiple Phrases** tool is a "Mega-Merge" feature designed to unify two or more connected phrases into a single long subtitle sequence. It simplifies timeline management by allowing flexible "loose" selections to trigger a complete logical merge.

---

## 2. User Experience (UX)
1. **Flexible Selection**: User selects any number of MOGRTs representing **two or more adjacent phrases**. 
    - Full phrase selection is NOT required; selecting a single word from each phrase is sufficient to target the entire phrase.
2. **Master Style Positioning**: User places the **playhead (CTI)** over the specific MOGRT whose visual style (Color, Position, Scale, Font) they want the entire new joined phrase to adopt.
3. **Action**: User clicks "Join Multiple Phrases."
4. **Outcome**:
    - All selected phrases are merged into one.
    - All clips adopt the style of the clip under the playhead.
    - Total duration is Bridged (Option A: Gap-Filling).
    - Word progression is re-indexed from 1 to the new total.

---

## 3. Detailed Technical Workflow

### Phase A: Group Identification
1. **Target Phrases**: Scan the selection to find all unique "Parent Phrases."
2. **Boundary Logic**: 
    - `StartTime` = Start of the first clip in the first targeted phrase.
    - `EndTime` = End of the last clip in the last targeted phrase.
3. **Master Identification**: identify the clip directly under the playhead. Read all its properties into a "Style Object."

### Phase B: Logical Merging
1. **Text Aggregation**: Fetch the `Ⓣ Text Input` from each targeted phrase and concatenate them chronologically.
2. **Gap Filling**: Verify the end of mỗi clip meets the start of the next. If a gap exists, extend the preceding clip to bridge it.

### Phase C: Final Property Sync (Full Visual Harmony)
1. **Apply Master Style**: Sync ALL Essential Graphics properties (except Text & Progression) from the MOGRT currently under the **Playhead (CTI)**.
2. **Label Consolidation & Alternation Check**: All clips in the new mega-phrase are force-updated to the Master Style color. The script then checks the phrases immediately before and after the new group to ensure **Strict Alternation** (e.g., if the previous phrase is Cerulean, the new phrase must be Mango).
3. **Update Content**: Set text and re-index word progression (1 to N).

---

## 4. Pre-Flight Validation
- **Requirement 1**: Selection must span at least two separate phrases.
- **Requirement 2**: Playhead must be over one of the selected MOGRTs to establish the Master Style.
- **Requirement 3**: All targeted phrases must be "connected" (no unrelated clips of different types between them).

---

## 5. Future Evolutionary Path
- **v3.2 Integration**: A "Keep Specific Properties" toggle will be added to the UI. If enabled, the tool will EXCEPT certain properties from the "Master Style" sync (e.g., if a word was manually made Green, it stays Green even as it joins a Blue phrase).
