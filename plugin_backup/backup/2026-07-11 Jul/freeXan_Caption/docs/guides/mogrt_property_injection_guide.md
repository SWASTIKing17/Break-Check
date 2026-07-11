# Guide: How SubMachine "Injects" Settings into MOGRTs

This guide explains the "Why" and "How" behind the magic of SubMachine's ability to update subtitles, colors, and styles in Premiere Pro.

## The Problem: MOGRTs are Stubborn
Imagine you have 100 subtitle clips. If you want to change the font size or color for all of them, you’d normally have to click each one and change it manually. Premiere Pro doesn't make it easy to "bulk update" these settings because every MOGRT can have different names for its controls (e.g., one might call it "Font Size" while another calls it "Text Size").

## The Solution: The "SubMachine Injection" Method
SubMachine uses a standard, robust way to talk to these clips. Think of it like a universal remote that works on any TV, even if the "Volume" button is labeled differently.

### 1. The Universal Translator (Property Mapping)
Instead of looking for a specific name, SubMachine has a dictionary of "Common Names." 
*   If SubMachine wants to change the **Text**, it looks for: "Ⓣ Text Input", "Text Input", or just "Text".
*   This makes SubMachine "smart"—it adapts to the MOGRT you are using without you having to rename anything.

### 2. The JSON "Envelope" (Text Injection)
Text in Premiere Pro MOGRTs is wrapped in a special "envelope" called JSON. 
*   **The Content:** "Hello World"
*   **The Meta-Data:** "Font: Arial, Size: 50, Color: White"

When SubMachine "injects" text, it carefully opens this envelope, swaps out the words ("Hello World" → "Hello SubMachine"), and puts it back without breaking the font or style.

### 3. Smart Syncing (Style vs. Content)
The most powerful part of the injection system is the **Sync All** tool. It follows a simple rule:
*   **Copy the Look:** Font, Color, Size, and Position are copied from your "Master" clip (the one under the playhead) to all other selected clips.
*   **Keep the Words:** SubMachine is smart enough *not* to overwrite the actual words of your other subtitles. It only updates the "Look," ensuring your hard work on the timing and text remains intact.

### 4. Precision Control (Progression)
SubMachine uses a specific "Word Progression" slider to highlight words. The injection system precisely calculates which word should be "active" based on the timing and injects that number directly into the MOGRT's brain.

---

## Glossary for Non-Coders
*   **MOGRT:** Motion Graphics Template. The "container" for your subtitle designs.
*   **Property:** A single setting inside a MOGRT (like "Color" or "Scale").
*   **Injection:** The process of SubMachine forcing a new value into a MOGRT setting.
*   **Sync:** Making multiple clips look identical with one click.
*   **Playhead:** The blue vertical line in your timeline that determines which clip is the "Source" of your styles.
