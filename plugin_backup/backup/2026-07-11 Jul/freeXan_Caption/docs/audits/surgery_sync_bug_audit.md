# Bug Audit Report: Surgery & Sync Tools (v4.0.26)

This report summarizes 17 substantive technical findings discovered in the `timeline.jsx` and `sync.jsx` files.

## 🔴 CRITICAL: "The Showstoppers"
### 1. C1 — Drag & Drop Crash
* **How to Check:** Open the "Edit" tab. Drag a word bubble from Phrase A and drop it into the middle of Phrase B.
* **The Exploit:** The word will likely "snap back" or the plugin will flicker. If you check the `debug_jsx.log`, you'll see a `JSON.parse` error. It’s trying to "decode" data that is already decoded.

I did not noticed this bug whenever i drop the word in next or previous phrase it automatically align itself to the starting and end respectively

### 2. C2 — Sticky Phrases
* **How to Check:** Try to split a phrase where the "Word Progression" slider isn't exactly a whole number (e.g., you've manually tweaked it).
* **The Exploit:** The Split will fail, and the tool will treat two sentences as one giant block, making it impossible to manage them separately.

### 3. C3 — "Add Word" Sabotage
* **How to Check:** Use "Add Word" to insert a word right at the playhead where another word already exists.
* **The Exploit:** The new word appears, but the word that was originally there might lose its font settings or suddenly "jump" to a different track because its reference in the computer's memory became "stale."


## 🟠 HIGH: "Data Corruptors"
*Visual glitches or logic errors that break your project state.*

1. **H3/H4/H5 — The "Math" Trap (5+1=51):** Forward phrase discovery fails because the computer treats numbers as text. Splits will fail for the second half of a sentence.
2. **H1 — Ghost Sliders:** Removing a word on one track leaves animation "ghosts" on other tracks in Staircase mode.
3. **H6 — Property Scrambling:** Joining phrases can accidentally swap your settings (e.g., Font Size becomes Scale) because it counts by number instead of name.
4. **H7 — Stale Highlights:** Refuses to clear word highlights because it ignores "empty" lists.

## 🟡 MEDIUM/LOW: "The Gremlins"
*Workflow friction and inconsistent behavior.*

1. **M3 — V1 Blindness:** Any subtitle on Video Track 1 is invisible to the Surgery tools.
2. **M2 — The 5-Second Silence:** Refuses to join sentences if there is a pause longer than 5 seconds.
3. **M5 — Inconsistent Vision:** Sync can see Track 1, but Surgery cannot, leading to "Clip Not Found" errors.

---

## 🛠️ Recommended Fix Priority

| Priority | Items | Impact |
| :--- | :--- | :--- |
| **P1 — FIX NOW** | C1, H3, H4, H5 | Stops the Drag & Drop crash and fixes broken Splits. |
| **P2 — Next** | C2, C3, H1, H6, M3 | Fixes "Sticky Phrases" and the V1 Track blindness. |
| **P3 — Polish** | All others | General hardening and stability. |
