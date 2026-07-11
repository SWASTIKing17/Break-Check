# SubMachine Command Center — Redesign Blueprint (v4.0)

## 1. System Architecture
The system operates on a 3-layer bridge architecture to ensure the UI remains lightweight while the Timeline operations remain precise.

| Layer | Responsibility | Technology |
| :--- | :--- | :--- |
| **Frontend** | State Management, Drag & Drop Rules, Selection Logic | React 18, SortableJS |
| **Bridge** | JSON Serialization, Error Handling, Progress Tracking | `callJSX` Utility |
| **Backend** | Timeline Surgery (Split/Join), MOGRT Property Access | ExtendScript (JSX) |

---

## 2. Frontend Logic (The Brain)

### Selection Engine
- **Single Click (Phrase)**: Selects whole phrase; playhead follow selection for first selected phrase.
- **Single Click (Bubble)**: Selects word; playhead follow selection for first selected word.
- **Shift + Click (Phrase)**: Multi-selects phrases (for Merge). Only allows contiguous selection.
- **Shift + Click (Bubble)**: Multi-selects words (for Merge). Only allows contiguous selection to be dragged and dropped to adjacent phrases to perform Split and then Merge of the selected words with Adjacent Phrase.
- **Click-Away**: Deselects everything.
- **Visuals**: No text selection (`user-select: none`).

### Drag & Drop Surgery (The Edge-to-Edge Rules)
- **Validation**: 
    - Words can ONLY move to the **immediate previous** or **immediate next** phrase.
    - Any other drop target is blocked (Snap-back animation).
- **Auto-Snapping**:
    - Drop on Previous → Append to end of previous phrase.
    - Drop on Next → Prepend to start of next phrase.
- **Trigger**: The backend surgery is called **instantly** upon drop.

---

## 3. Interaction Map (Action → Outcome)

| Action | Logic | Outcome (Premiere Pro) |
| :--- | :--- | :--- |
| **Hover Gap** | Detection of mouse between two Word Bubbles. | Shows "Laser Scissors" (Neon Line). |
| **Click Scissor** | Calculate split point based on Word Index. | `SplitMogrt()` triggers at word boundary. |
| **D&D Word** | Validate adjacency → Calculate target track/index. | `TransferWord()` moves clip and adjusts timings. |
| **Dbl-Click Word**| Open inline `<input>` with current word text. | No timeline change yet. |
| **Press Enter** | Sanitize text → Dispatch text update. | Update `Text Input` property on MOGRT. |
| **Click Merge** | Validate 2 adjacent phrases are selected. | `JoinMogrts()` merges clips and combines text. |

---

## 4. Visual Tokens (Slate & Precision Theme)

### Core Palette
- **Base**: `#121418` (Deep Slate)
- **Surface**: `#1a1d23` (Card Background)
- **Active Accent**: `#29BFBE` (Electric Teal - Surgery/Sync)
- **Selection Accent**: `#8a63f2` (Indigo - Multi-select)
- **Error/Blocked**: `#ff4d4d` (Snap-back feedback)

### Design Elements
- **Slimline Cards**: Compact horizontal rows (32px height) for high density.
- **The Grip**: A 4px teal vertical bar on the left of each row for phrase selection.
- **Typography**: Inter (Variable), Weight 500 for labels, 700 for active indices.

---

## 5. Backend Logic (The Surgeon)

### Function: `getTimelinePhraseMap`
- Scans target track.
- Groups MOGRTs into phrases based on content similarity and timing proximity.
- Returns JSON map: `[{ phraseId, startTime, endTime, words: [...] }]`.

### Function: `executeSurgery`
- Receives: `sourcePhraseId`, `targetPhraseId`, `movedWordIndices`.
- Operation:
    1. Locks Sequence.
    2. Cuts source MOGRT at calculated frame.
    3. Merges segment into target MOGRT.
    4. Updates `Word Progression` count for all affected clips.
    5. Re-syncs remaining word indices.
