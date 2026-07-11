# Workflow Logic - The "Assembly Line"

## Purpose
This guide explains the step-by-step logic of how SubMachine automates the subtitle creation process, intended for non-technical stakeholders.

---

## The Metaphor: The Printing Press
Think of SubMachine as a computerized printing press for your video project.

### Step 1: Loading the Paper (SRT Import)
- **What it is**: When you select an SRT file.
- **Why**: This is the raw list of words and timestamps. It's like the "manuscript" for your subtitles. The code reads this and knows exactly what needs to be "printed" and when.

### Step 2: Choosing the Font (MOGRT Selection)
- **What it is**: When you pick a MOGRT file.
- **Why**: This is the "printing block." It defines the style (colors, animations, fonts). SubMachine doesn't just create plain text; it uses these pre-made templates to make your subtitles look high-quality and dynamic.

### Step 3: Checking the Press (Validation)
- **What it is**: `getData()` function in `main.jsx`.
- **Why**: Before the press starts, the code checks if there's enough space in the video tracks (the "paper"). It also checks if the "manuscript" (SRT) and the "printing block" (MOGRT) are set to the same speed (Frame Rate). If they don't match, the subtitles might drift out of sync.

### Step 4: Printing (Caption Creation)
- **What it is**: `createCaptions()` function in `main.jsx`.
- **Why**: This is the real automation. Instead of you manually dragging and typing every word, the "press" (the code) automatically:
  1. Places a MOGRT on the timeline at the exact second it's needed.
  2. Types the text for you.
  3. Moves to the next word and repeats the process.

### Step 5: Professional Polish (Sync Tools)
- **What it is**: The "Sync All" and "Reset" tools.
- **Why**: If you decide to change the color of one word later, you don't have to change all of them manually. These tools act as a "synchronizer" that copies your change to every other word automatically, keeping everything visually consistent.
