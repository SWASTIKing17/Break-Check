# Guide: The Modular Toolbox (Backend Refactor)

## The Problem: The "Giant Scroll"
Imagine you are building a house and all your instructions are written on one single scroll that is 50 feet long. If you need to find the instructions for "Plumbing," you have to unroll the whole thing, crawling through "Electrical," "Roofing," and "Flooring" first. It’s hard to carry, easy to tear, and confusing for anyone else trying to help.

The original `main.jsx` file was like that 50-foot scroll. It had over 1,300 lines of code doing everything from "Saving Logs" to "Calculating Timecodes."

## The Solution: The Organized Toolbox
We have split that giant scroll into a set of organized folders and files. Each file has one specific job.

### 1. `lib/json2.jsx` (The Translator)
Adobe apps are built on an older foundation. They don't naturally speak "JSON" (a common language used to send data). This file acts as a translator so the user interface and the Premiere backend can talk to each other.

### 2. `core/utils.jsx` (The Helper)
This file handles the "boring" but essential tasks:
- Sending error reports (Logs).
- Showing pop-up messages to the user (Alerts).
- Asking the computer what OS version it’s running.

### 3. `core/mogrt.jsx` (The Builder)
This is the core "Subtitling Engine." It handles:
- Finding space on the timeline.
- Placing the graphics (MOGRTs).
- Making sure the text matches the subtitle file.

### 4. `core/sync.jsx` (The Copy-Paste Expert)
When you change the color or font of one subtitle and want it to apply to all 500 others, this file handles that logic. It ensures consistency across the whole timeline.

### 5. `core/timeline.jsx` (The Surgeon)
This file handles the delicate "surgery" of splitting or joining clips. It knows how to cut a phrase in half or merge two phrases together without losing any timing data.

---

## How to Debug
If a tool "stops working" or you get a generic error message, follow these steps:

1.  **Check the Log File**: Navigate to `panel/jsx/core/debug_jsx.log`.
2.  **Look for [ERROR]**: The log will now show the exact line number and file where the problem occurred.
3.  **Inspect the Breadcrumbs**: Check the `[INFO]` and `[SUCCESS]` messages to see which step was the last one to complete successfully.
4.  **Object Dumps**: For complex issues, I may ask you to enable "Object Dumping" which will print out a detailed map of Premiere’s internal state at that moment.

---

## Why This Matters for You
- **Faster Fixes**: If there is a bug in the "Join" tool, we know exactly which file to look in (`timeline.jsx`) without wading through 1,000 lines of unrelated code.
- **Better Stability**: Changing one part of the code is less likely to accidentally break a different part.
- **Easier Upgrades**: When we add new features, we can just drop a new file into the "Modular Toolbox" instead of making the main scroll even longer.
