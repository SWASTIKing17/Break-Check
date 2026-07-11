# SubMachine Surgery: Safety & Integrity Guide

## What is "Word Surgery"?
Imagine your timeline is a row of Lego bricks. Each brick is a "Phrase" (a MOGRT clip) and each bump on the brick is a "Word." 

**Word Surgery** is the process of picking a "bump" from one brick and moving it to another. Because these bricks are made of time, moving a word doesn't just change the text—it changes the **length** and **position** of the bricks so they still fit together perfectly without any gaps.

## How We Keep Your Work Safe
When you drag a bubble in the Command Center, several invisible safety systems kick in to ensure your timeline doesn't break.

### 1. The "Safety Net" (Atomic Undo)
Every time you move a word, the system treats the entire operation (changing word text, adjusting clip length, and moving the playhead) as a single "event."
*   **The Benefit**: If you don't like the result, a single `Ctrl+Z` (Undo) will snap everything back to exactly how it was before the move.

### 2. "Ghost" Word Prevention
The system doesn't just "copy" a word; it "transfers" it. 
*   **The Benefit**: We ensure that a word can never exist in two places at once, and it can never "disappear" into a gap. The total word count of your timeline always stays 100% accurate.

### 3. Collision Detection
If you try to move a word into a space where there isn't enough room, or onto a track that isn't a "SubMachine" track:
*   **The Benefit**: The system will block the move and keep your clips exactly where they are, preventing accidental overlaps or "eating" of other clips.

### 4. Style Preservation (The "DNA" Lock)
We treat the **Text** and the **Style** (color, font, position) as separate things.
*   **The Benefit**: When you move a word into a new phrase, that word automatically adopts the style of its new "home." Your carefully designed typography remains consistent, no matter how much you shuffle the words.

## A Note on "The Previous Tools"
The Command Center is a **New Driver** for the **Same Engine**. The old Split and Join buttons were like manual gear-shifting. The Command Center is like an automatic transmission—it's smoother and faster, but it uses the exact same gears (the backend logic) that have been proven stable in SubMachine for years.
