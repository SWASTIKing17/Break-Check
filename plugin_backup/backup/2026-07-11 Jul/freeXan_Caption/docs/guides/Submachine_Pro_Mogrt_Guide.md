# SubMachine: Pro After Effects MOGRT Guide

This guide is designed for Professional After Effects Artists building MOGRTs specifically for the SubMachine Premiere Pro plugin. It explains **The Why** and **The How**, mapping out the standards needed to sync position, scale, rotation, style, and animation perfectly with the plugin.

## 1. The Core Standard: What SubMachine Expects
At its heart, SubMachine is a data-injector. It reads your subtitle file (SRT) and pushes text strings and timing data into your MOGRT. 

To allow SubMachine to "talk" to your graphic, every SubMachine MOGRT **MUST** have the following two properties exactly named in the Essential Graphics Panel (EGP):

1. **`Ⓣ Text Input`** *(Text Control)*: Receives the entire phrase/sentence from SubMachine.
2. **`Ⓣ Word Progression`** *(Slider Control, Range 1 to 60)*: SubMachine keyframes this slider over time. As the slider increases, the spoken word progresses.

*Why do we do this?* By funneling all text into a single String, and the timing into a single Slider, your MOGRT stays lightweight and blazingly fast in Premiere Pro.

---

## 2. Common & Unique Effects Analysis
Based on an analysis of 9 official SubMachine templates (Animator Pro, Block, Karaoke, Dynamo, etc.), here is how effects are typically distributed:

### The Constants (Common to All)
- **Data Hooks:** `Ⓣ Text Input` and `Ⓣ Word Progression` absolutely exist in every file.
- **Base Style Sync:** Text tracking, Master Scale, and Master Position are standard.
- **Color Overrides:** Text Fill Color and Stroke Color.

### The Variables (Unique Typography Styles)
Different MOGRTs interpret the `Word Progression` data differently:
- **Block / Dynamo:** Controls for finding Line Breaks and Background scaling (padding, stroke, twist) behind specific text bounds.
- **Tiktok / Pod:** Line wrap limits, and vertical line spacing overrides. 
- **Animator Pro:** Vast suite of Animator effects: Crookedness, specific word targeting (where a user can target Word #3 to be purple), Flash colors, Typewriter reveals, and "Unspoken Word" opacities.

---

## 3. Step-by-step: Recreating SubMachine Typography Effects
Here is the precise technique to map position, scale, rotation, and style using the Data Hooks.

### Step A: Initialize the Logic
1. Create a new Comp, add a Text Layer.
2. Open the Essential Graphics Panel (EGP).
3. Drag the Text Layer's **Source Text** into the EGP and rename it **exactly**: `Ⓣ Text Input`.
4. Create a Null Object, add a Slider Control. Drag this Slider to the EGP and rename it **exactly**: `Ⓣ Word Progression`. Set its range from 1 to 60.

### Step B: The "Current Word" Procedural Highlight
*Goal: As the Word Progression slider climbs, the active word changes color and scales up. Changing the scale value from the Essential Graphics Panel should dynamically shift surrounding words.*
1. Select your Text Layer. Go to **Animate > Fill Color > RGB**. Then click **Add > Property > Scale** on that same Animator.
2. Change the Fill Color to your desired highlight color. 
3. **Procedural EGP Scale Hook:** Add a Slider Control to your Essential Graphics Panel named `Current Word Scale`.
4. Alt-click the **Scale** stopwatch inside the *Animator* (NOT the layer's main transform). Paste this expression to link the 2D Scale to your 1D EGP Slider:
   ```javascript
   var s = effect("Current Word Scale")("Slider");
   [s, s];
   ```
5. Under the Animator, delete the *Range Selector*.
4. Add an **Expression Selector**.
5. Twirl down the Expression Selector and Alt+Click the **Amount** stopwatch. Paste this code:

```javascript
// Get the current word count from the SubMachine slider
var sliderVal = effect("Ⓣ Word Progression")("Slider");
// Compare the current Text Index (word) to the slider
if (textIndex == Math.floor(sliderVal)) {
    100; // Apply the color/scale 100%
} else {
    0; // Do not apply the effect
}
```
*Make sure the Expression Selector's "Based On" property is set to **Words**!*

### Step C: Hiding "Unspoken Words" (The Reveal)
*Goal: Words should be invisible until they are spoken.*
1. Add a second Animator: **Animate > Opacity**. Set Opacity to 0%.
2. Delete the Range Selector and add an **Expression Selector** (Based on Words).
3. Alt-click Amount and paste:

```javascript
var sliderVal = effect("Ⓣ Word Progression")("Slider");
if (textIndex > Math.floor(sliderVal)) {
    100; // Apply 0% opacity to future words
} else {
    0; // Past and current words are visible
}
```

### Step D: "Specific Word" Emphasis Override
*Goal: Allow the user to specify a number (e.g., word 3) to always be a different color/rotation.*
1. Add a Slider to your EGP named **`Specific Word #`**.
2. Add a new Animator for Fill Color/Rotation. Add an Expression Selector (Based on Words).
3. Expression:
```javascript
var targetWord = effect("Specific Word #")("Slider");
if (textIndex == Math.floor(targetWord)) 100 else 0;
```

---

## 4. SubMachine Sync Standards
To guarantee your `.mogrt` acts beautifully when dragged onto the Premiere timeline, observe these standards:

- **Leave Base Transform Alone:** Do not adjust the Text Layer's standard Transform properties (Position, Scale). If you need internal Master controls, add an Expression to the text layer's anchor point or position linking to a Slider in the EGP (`Master Position`, `Master Scale`). *Why?* This ensures Premiere users can still grab the graphic and use Premiere's native Effect Controls to move it around without breaking the internal design logic.
- **Word Index Matching:** Text Animators must ALWAYS be set to "Based On: Words". Otherwise, the `Ⓣ Word Progression` slider will highlight characters instead of words.
- **Line Endings:** Never hard-code line breaks in your text expressions unless required by layout logic. SubMachine injects raw strings and allows Premiere users to wrap text naturally in newer versions, or calculates spacing externally.
