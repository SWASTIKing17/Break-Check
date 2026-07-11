# Command Center Interaction Rules

## 1. The Navigator (Left Column) — "The Timeline Map"

### ✅ What the User CAN do:
*   **Snap Playhead**: Single-click any word bubble. The playhead jumps to that exact word on the timeline instantly.
*   **Change Word**: Double Click on any word bubble. The user can change the spelling of thet word
*   **Multi-Select**: Hold `Shift` while clicking Phrases. 
    *   *Result*: Selects multiple Phrases for batch styling (e.g., color changes).
*   **Phrase Protection**: Click the 🔒 icon on a phrase card.
    *   *Result*: This phrase is now "Shielded." Global syncs will not change its style.
*   **Word Surgery**: Drag a word bubble from one phrase card and drop it into another.
    *   *How*: Select multiple words (by holding Shift while clicking bubbles) & Dragging them to the CARD of Adjacent phrase (First Few Words can be moved to the previous Phrase Card, last few words can be moved to the Next Phrase Card. You can not move words to a non-adjacent Phrase Card.)(The Card of the phrase will glow Blue when it is ready to accept the words).
    *   *Result*: Triggers the stable `Split & Join` tool.
*   **Split Phrase**: select multiple words from a phrase card and drag them between current and adjacent phrase cards to split 1 entire phrase.
    *   *Result*: Triggers the stable `Split 1 Entire phrase` tool.
*   **Join Phrase**: Select multiple adjacent Phrases and click Merge button icon in the top toolbar.
    *   *Result*: Triggers the stable `Join 2 Entire Phrases` tool.
### ❌ What the User CANNOT do:
*   **Drag Entire Phrases**: You move words (the "Lego bricks"), not the cards themselves.
*   **Manual Text Entry**: You change the text by moving words between phrases, not by typing. This ensures the timeline and the UI never get out of sync.

---

## 2. The Inspector (Right Column) — "The Surgery Table"

### ✅ What the User CAN do:
*   **Surgical Edits**: Change sliders, colors, or checkboxes for the active word.
*   **The "Broadcaster" (Global Sync)**: Toggle the **Sync ⟳** button at the top of the Inspector.
    *   *Result*: Any change you make now will be "broadcast" to **every word** you have selected in the Navigator.
*   **Property Search**: Type "Color" or "Shadow" in the search bar to find hidden settings instantly.

### ❌ What the User CANNOT do:
*   **Edit Without Selection**: The Inspector stays empty until you click a bubble.


---

## 3. The Toolbar — "The Control Room"

### ✅ What the User CAN do:
*   **Hard Refresh**: Click **Refresh ↻**. 
    *   *Result*: Re-scans the entire timeline chronologically. Use this if you manually moved clips in Premiere.
*   **Search Timeline**: Search for words like "Success" or "Failure" to find those specific clips across your 1-hour timeline.
