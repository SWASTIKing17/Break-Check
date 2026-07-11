# Guide: Creating MOGRTs for SubMachine

## Purpose
This guide explains the specific requirements for building an Adobe After Effects template (MOGRT) that works seamlessly with the SubMachine automation system.

---

## 1. The "Smart Label" System (Metaphor)
Imagine your MOGRT is a **Smart Digital Signage**. To make it listen to the SubMachine controller, you need to add specific "Labels" (Property Names) that act as receivers. Without these exact labels, the controller (SubMachine) won't know where to "type" the text or how to "highlight" the words.

---

## 2. Required Properties
To work perfectly, your MOGRT must have these **exact** property names in the Essential Graphics Panel in After Effects. Note the special character `Ⓣ` (Circled Capital T).

### A. `Ⓣ Text Input` (Text Property)
- **Type**: Edit Text
- **What it does**: This is where SubMachine "types" the entire phrase for each caption. 
- **Setup**: Link this to your Source Text in After Effects.

### B. `Ⓣ Word Progression` (Slider)
- **Type**: Slider (integer recommended)
- **What it does**: This acts as the "Timekeeper." For every word in a phrase, SubMachine sends a number (1, 2, 3...) to this slider.
- **Setup**: In After Effects, use an Expression on your text layer to look at this slider value and determine which word should be highlighted, colored, or animated.

---

## 3. Recommended Expressions
Inside After Effects, your text layer needs to "read" the `Ⓣ Word Progression` value. Here is a simplified logic of how you might set that up:

```javascript
// Example Expression for Word Highlighting
var progression = effect("Ⓣ Word Progression")("Slider");
var words = text.sourceText.split(" ");
// Use the 'progression' value to index into the 'words' array 
// and apply styles using Text Animators.
```

---

## 4. Why Use the `Ⓣ` Prefix?
SubMachine uses the `Ⓣ` symbol to distinguish **System Properties** from **Style Properties**.
- **System Properties** (`Ⓣ`): These are controlled automatically by the SubMachine engine to handle timing and content.
- **Style Properties** (Unprefixed): These are your custom controls (Color, Font Size, Position). SubMachine leaves these alone so you can customize the look without breaking the automation.

---

## 5. Summary Checklist
- [ ] Property 1: `Ⓣ Text Input` (Must be a text input field).
- [ ] Property 2: `Ⓣ Word Progression` (Must be a slider).
- [ ] Expression: Your AE project must have logic that reacts to the progression slider to create the "karaoke" style effect.
