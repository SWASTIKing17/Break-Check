# MOGRT Technical Blueprint: SubMachine Edition

This guide provides a step-by-step breakdown of how the **SubMachine Animator Pro** MOGRT was constructed. It serves as a master template for creating compatible Motion Graphics Templates.

---

## 1. Project Architecture (The Skeleton)

The project is built on three main "Pillars":

1.  **The Controller Null (`CONTROL`)**: A hidden layer that holds all the sliders and checkboxes seen in Premiere Pro.
2.  **The Text Layer**: The visible layer that displays the captions. This contains the "Karaoke" expressions.
3.  **The Background/Mask System**: Automatic shapes that react to the length of the text.

### Layer Order:
- `[01] CONTROL` (Null Object)
- `[02] Text Layer` (Main dialogue)
- `[03] Line Bending Null` (Control for text pathing)
- `[04] Background/Solids` (Optional UI elements)

---

## 2. Essential Graphics Mapping (The Dashboard)

SubMachine uses a specific naming convention to distinguish between **System Properties** (automated) and **Style Properties** (user-defined).

### The "Ⓣ" System Properties:
These properties *must* exist for SubMachine to recognize the MOGRT:
-   **`Ⓣ Text Input`** (Text Control): Linked to the `Source Text`.
-   **`Ⓣ Word Progression`** (Slider): Drives the timing of the highlight (1 = 1st word, 2 = 2nd word).
-   **`Ⓣ Emphasized Word 1 & 2`** (Sliders): Allows the user to manually trigger extra animations on specific words.

### The Style Properties:
These allow users to customize the look without breaking the automation:
-   `Text Fill Color`
-   `Stroke Color / Width`
-   `Master Position / Scale`
-   `Shake Distance / Speed`

---

## 3. The Timing Logic (The Heartbeat)

The "Highlighter" effect works by splitting the dialogue into an array of words and comparing it to the `Word Progression` slider.

### The "Magic" Expression
Inside the **Text Animator** (named `Primary: Word Progression`), the **Range Selector** uses this logic:

```javascript
// Step 1: Tell After Effects what text we are using
var textLayer = thisLayer;
var fullText = textLayer.text.sourceText;

// Step 2: Turn the sentence into a list of individual words
var words = fullText.split(" ");

// Step 3: Check which word the Slider is telling us to highlight
var currentWordIndex = Math.min(Math.floor(effect("Ⓣ Word Progression")(1)), words.length);

// Step 4: Highlight that word
// (AE internal logic handles the physical color change)
```

---

## 4. Advanced Feature: "Typewriter Pro"

This MOGRT goes beyond simple highlighting. It includes a "Typewriter" mode that reveals text character-by-character based on the word progression.

### How it works:
Instead of just jumping word-to-word, the expression calculates the **Character Length** of every word.
- Word 1 ("Hello") = 5 characters.
- Word 2 ("World") = 5 characters.
As the slider moves from 1 to 2, the typewriter knows it needs to reveal the *next* 5 characters smoothly.

---

## 5. Advanced Feature: Dynamic Path Bending

The MOGRT includes a "Bend Along Path" feature. This is achieved using the `createPath()` function on a Mask.

### The Metaphor: The "Stretchy Rubber Band"
Imagine a rubber band held by two pins. 
1.  One pin stays at the start of the text.
2.  One pin moves to the end of the text.
3.  The expression calculates the distance between them and "Bends" the band to form a smooth curve or underline that perfectly fits the length of the sentence.

---

## 6. Key Takeaways for Developers

1.  **Match Names Matter**: If you copy these expressions, make sure your Animators and Sliders are named exactly like the blueprint.
2.  **Prefixing**: Use `Ⓣ` for everything you want SubMachine to touch.
3.  **Optimization**: These expressions use `Math.min()` and `Math.floor()` to prevent errors if the slider goes higher than the number of words in the text.

> [!TIP]
> To create a new style, duplicate **Simple.aep**, keep the logic, and simply change the **Text Animator** settings (e.g., change Color to Scale for a "Pop-up" effect).
