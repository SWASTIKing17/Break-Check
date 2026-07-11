# SubMachine Roadmap & Evolutionary Timeline

## The Golden Rule: Evolutionary Documentation
Whenever the user mentions "later," "future," "next version," or similar terms, the Agent must:
1. **Log it here**: Extract the feature, fix, or idea.
2. **Define the Mission**: Clearly state What to achieve, How to achieve it, and When.
3. **Save the "Where We Left"**: Provide a technical snapshot of the current state for the next AI session.

---

## Future Updates (To-Do List)

### [Next Version]
#### 1. Non-Linear Word Splitting (Timing-Based)
- **What to Achieve**: Replace the current "total duration / word count" logic with a more sophisticated algorithm (e.g., using silences, audio analysis, or phonetic length estimation).
- **How to Achieve**: 
    - Integrate a small JS-based sound library or leverage Premiere's own audio-to-text analysis if accessible via API.
    - Alternative: Use character-weighting (longer words get more time).
- **When to Achieve**: Planned for v3.0.
- **Where we left**: Currently using simple linear division in `phrasing.js` (Line 158).

#### 2. Robust Fast-Paced Timing
- **What to Achieve**: Replace "Magic Number" offsets (`-0.05`, `-0.02`) with frame-accurate calculations based on the sequence frame rate.
- **How to Achieve**: Calculate `1 / SequenceFPS` and use it as the epsilon for overlap prevention.
- **When to Achieve**: Post-v2.7 stabilization.
- **Where we left**: Hardcoded offsets in `phrasing.js` (Line 182).

#### 3. Style-Preserving Text Updates
- **What to Achieve**: Update MOGRT text without losing individual character styles (Color/Font/Size transitions).
- **How to Achieve**: Use `fontTextRuns` array from the `TextLayer` object to surgically replace text while keeping property indices.
- **When to Achieve**: High priority for users with complex templates.
- **Where we left**: Currently using `fontTextRunLength = [fullText.length]` which flattens all styles in `main.jsx` (Line 924).

#### 4. Persistent "Specific Word" Selectors
- **What to Achieve**: Create a naming convention for MOGRT properties that allows styling to "follow" a word even if it moves between phrases or changes position.
- **How to Achieve**: 
    - Establish a naming convention like `Ⓢ Word [N] Color`.
    - During Join/Split operations, the Agent will calculate the "New Index" and move property values.
    - **Update**: Include a "Keep Style" toggle in the UI.
- **Visual Feedback**: **[STRICT]** No two adjacent phrases should share the same color. All tools must automatically update the Premiere Label Color (Alternating Mango and Cerulean) after every operation to maintain clear visual boundaries.
- **When to Achieve**: Planned for v3.1.
- **Where we left**: Blueprints for Join/Split/Phrase now include this Label Color requirement.

#### 5. Efficient Word Property Skipping
- **What to Achieve**: Skip updates for word‑specific properties that are not affected by a Split/Join/Surgery operation, improving performance.
- **How to Achieve**: Use a prefix `✗` or a configurable JSON skip list to mark properties that should be ignored during style application.
- **When to Achieve**: Planned for v3.2.
- **Where we left**: No implementation yet; documentation added in `future_updates_word_property_skip.md`.

#### 6. Hindi‑to‑Hinglish SRT Translation via Claude API
- **What to Achieve**: Translate Hindi subtitle files (SRT) into Hinglish (mixed Hindi‑English) using Claude's LLM, preserving timestamps and formatting.
- **How to Achieve**: 
  - Add a `claudeTranslateSRT` module that reads an SRT, splits into caption blocks, and sends each block to Claude with a prompt like “Convert this Hindi subtitle to Hinglish, keep the timestamps unchanged.”
  - Cache results locally to avoid duplicate API calls, handle rate‑limits, and expose a UI button “Translate to Hinglish” in the plugin panel.
  - Store the translated SRT next to the original in a `translated/` folder.
- **When to Achieve**: Planned for v4.0.
- **Where we left**: Design drafted; no code integration yet.

#### 7. MOGRT Browsing & Quick Replace Menu
- **What to Achieve**: Provide a UI panel that lists all available MOGRT files, lets the user preview them, and replace the MOGRT applied to a specific phrase in the timeline with a single click.
- **How to Achieve**: 
  - Add a new `MogrtBrowser.jsx` module that scans a user‑defined directory for `.mogrt` files and populates a scrollable list with thumbnails.
  - When a phrase is selected in the timeline, the panel shows the currently assigned MOGRT and an "Replace" button.
  - Clicking “Replace” swaps the underlying MOGRT component on the phrase’s clip using the standard property mapping (all standard MOGRT controls are preserved).
  - Persist the chosen MOGRT path in a JSON config (`userMogrtMap.json`) for quick re‑use.
- **When to Achieve**: Planned for v3.0 (short‑term sprint).
- **Where we left**: UI skeleton drafted in `MogrtBrowser.jsx`; integration with `timeline.jsx` pending.

---

## Current State (Where We Left)
**Date**: 2026-04-21
- **Focus**: Stabilizing v2.7.2.
- **Status**: Identified three major logic glitches (Timing, Join efficiency, Style flattening). User approved deferring the "Timing" fix to a later version.
- **Recent Change**: Refactored Split/Join with better error handling (QE API checks).
