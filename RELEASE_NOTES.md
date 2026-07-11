# freeXan — Release Notes
### Everything added since v2.3.3 · Current build: v3.4.2

---

## Linked Folders + Halo Picker — The Big Workflow Change
*v3.2 → v3.4 · June 2026*

The biggest workflow upgrade since the Audio panel. **Drop a file in a project folder on disk, and it shows up in the matching Premiere bin automatically.** No more dragging into Premiere manually.

### How it works

When you create a template in **Settings → Folder Template Studio**, freeXan now looks for folders whose names match a Premiere bin name (e.g. a `RAW` folder + a `RAW` bin, or `Audio` + `Audio`). For each match, a small **🔗 link icon** appears on the folder row. Click it to enable the link.

Once linked, anything you paste / save / render into that folder on disk gets imported into the matching Premiere bin **automatically, within about a second**. The watch only runs while a freeXan project is open in Premiere — closing Premiere stops it; opening a different project switches it to that one.

### Quick start

1. Open **Settings → Folder Template Studio**
2. Edit a template (or make a new one)
3. On the **Folder Structure** tab, give a folder a name that matches a Premiere bin (e.g. rename to `RAW`)
4. On the **Premiere Pro** tab, add a bin with the same name
5. Back on the Folder tab, click the **🔗** icon that now appears next to the folder
6. Save the template
7. Create a project from this template — done

Now drop anything into the `RAW` folder on disk and watch it appear in Premiere's `RAW` bin automatically.

### Supported file types

freeXan auto-imports common media: **MP4, MOV, AVI, MKV, MXF, WAV, MP3, AAC, M4A, FLAC, PNG, JPG, TIFF, PSD, AI, GIF, BMP, EXR, DPX, R3D, BRAW, SRT** (and more). Anything else is ignored for now — a future update will route unsupported formats through FFmpeg automatically.

### Drop assets onto the overlay → route them with a key

There's a second part to this feature. On any linked folder, you can also assign a **number key (1–8)** as a shortcut. Then, when you drag any file onto the overlay pill **while holding the Ctrl key**, freeXan opens a "halo" picker — 8 small bubbles arranged around the pill — and you choose where the file goes:

- **Press 1–8** or **click a bubble** → file is copied to that linked folder and imported into the matching bin
- **Hold Ctrl + Shift while dropping** → same picker, but the file is **moved** (cut + paste) instead of copied — atomic on the same drive, so even huge files transfer instantly
- **Tap Ctrl twice quickly** → cancel the picker; file goes to the default slot mapping instead
- **Press Esc** → same cancel
- **Wait 6 seconds without hovering a bubble** → auto-cancel

**Hover any bubble** to see the folder name in a small label next to it.

**Why this matters:** when you've got RAW files coming from one folder, B-roll from another, music from a third, the overlay turns into a single drop target that you can aim at any bin with one keystroke.

### Setting up shortcut keys

In the template builder, click the **🔗** icon to enable the link, then click the **— key** dropdown that appears next to it. Pick `1` through `8`. Keys already assigned to other linked folders show as `2 (used)` and are disabled — you can't double-book a key by accident.

`9` and `0` are reserved for future use.

### Move mode is genuinely fast

Holding **Shift** during a drop tells freeXan to MOVE the file instead of copy. When the source file is on the same drive as the destination, this is an instant atomic rename — a 4GB video takes the same time as a 4KB text file. Only when you're moving across drives does it fall back to copy-then-delete.

If something goes wrong mid-move (disk full, file locked) the file stays in the source location, no data loss.

---

## Audio freeXan — Brand New Panel
*v2.7.0 → v2.9.8 · June 2026*

A completely new Premiere Pro panel has been added alongside the existing Link freeXan panel.

**What it does:**
- Browse all your music and SFX folders directly inside Premiere Pro without leaving the edit
- Automatically watches your audio folders and keeps the library up to date
- Classifies every track as **BGM** (music, score, OST) or **SFX** (foley, sound design) — both by folder name and by duration
- Color-coded waveform cards: violet-coral for BGM, green-cyan for SFX
- Sidebar lets you filter by All / Favorites / BGM / SFX / any subfolder
- Tracks how many times you've imported each clip ("Used 3×" badge)

**Preview & trim before importing:**
- Click any card to open a detail drawer at the bottom of the panel
- See a full waveform with draggable trim handles — set your in/out points by dragging directly on the waveform
- Pitch shift and speed controls with one-click reset
- Spacebar plays/pauses; Escape closes the drawer
- High-fidelity waveforms drawn at 1 pixel per sample column — looks like Premiere's own waveform view

**Dragging into Premiere:**
- Drag a card into Premiere's **Project Panel** to import it with all your pitch/speed/trim settings applied
- Drop a card onto the **"Drop here → Insert at Playhead"** bar at the bottom of the panel to place it directly at your playhead position on the timeline
- FFmpeg processes the audio in the background the moment you start dragging — by the time you drop, it's ready
- Imported files land in the correct project audio bin automatically

**Waveform quality (v2.9.7 → v2.9.8):**
- Waveforms now render at full pixel resolution — exactly 1 data point per pixel column, not a fixed downsample
- Detail player waveform and minimap both draw directly via canvas for clean, sharp spikes (Adobe Audition style)
- Zooming via trim handles re-slices the raw peak data live — no layout glitches

---

## freeXan Caption — SubMachine Rebrand
*v3.1.5 → v3.1.6 · June 2026*

The bundled SubMachine plugin has been rebranded as **freeXan Caption** under the BloomX umbrella:

- Premiere's `Window → Extensions` menu now shows **freeXan Caption** (was "SubMachine")
- Panel header, About, and Help pages all rebranded to freeXan visual style (dark `#121214` background, `#997DFF` purple accent, IBM Plex Sans + JetBrains Mono fonts)
- Hashtag updated from `#createdWithSubMachine` to `#createdWithFreeXanCaption`
- Aescripts blue accent (`#2D8CEB`) replaced with freeXan purple (`#997DFF`) throughout the panel UI
- Bundle ID changed to `com.bloomx.freexan.caption` — uninstaller cleans up the old `com.aescripts.submachine` folder automatically on next launch
- All licensing flow + functionality is unchanged — it's a visual rebrand only

---

## App Window & Overlay Improvements
*v2.3.4 → v2.4.4 · May–June 2026*

**Overlay is now rock-solid:**
- Overlay pill stays above Snipping Tool, screenshot apps, and Windows system overlays — it no longer disappears when you take a screenshot
- If the overlay is closed unexpectedly, it recreates itself automatically after 0.6 seconds
- Tray menu has a **"Reposition Overlay"** button — clicking it springs the pill back to its default corner with a smooth animation
- Spring animation bounces in from the current position over 1.5 seconds (one gentle overshoot, fully settled)

**Overlay micro-animations:**
- Pill slides in from the left edge each time the overlay opens
- Green status dot pulses a glowing ring every 2 seconds while a project is linked
- Error shake — pill jiggles for half a second if an import fails
- Success icon pop — the drop icon bounces on a successful import
- Idle breathe — icon gently oscillates when no project is detected
- Text panel slides upward as it expands instead of just fading in

**Main window no longer pops up at wrong times:**
- Window is fully suppressed whenever the CEP extension is connected — it will never interrupt your edit
- Auto-show only triggers when Premiere's Welcome Screen is detected and the extension is disconnected
- Window auto-hides itself when Premiere Pro is closed
- **New in v3.4:** main window is also suppressed while the halo picker is active — so it can't steal focus mid-routing

---

## Premiere Pro Integration
*v2.3.5 → v2.4.0 · May–June 2026*

**After a drag-drop import:**
- Premiere's Project Panel automatically navigates to the destination bin and selects the imported clip — you don't have to go find it yourself

**Multiple asset slots per bin:**
- You can now assign Video, Audio, and Image slots to the same Premiere bin
- Each slot shows as its own removable badge — the + Asset button no longer disappears after the first assignment

**Library assets import at the right time:**
- Common Library Assets now wait until all project bins have been fully created before importing — no more assets landing in the wrong bin because the folder wasn't ready yet

---

## UI Polish Pass
*v2.4.2 → v2.6.0 · June 2026*

- **Circular titlebar buttons** — Minimize turns green on hover, Close turns red
- **Version chip** — app version shown in the titlebar ("by BloomX v2.x.x")
- **Icon-only sidebar** — Builder / Settings / Database labels removed; icons only with tooltips, tighter sidebar
- **Token chips in Project Name** — `{Date}` `{Month}` `{Year}` `{HH}` `{MM}` `{SS}` are now clickable buttons that insert at the cursor
- **Project Name memory** — the last-used project name is remembered per Client + Funnel combination and reloaded when you pick the same pair again
- **Drag-drop onto path inputs** — drag a file or folder directly onto the Asset path or Project File Template path fields to fill them in
- **Slot picker shows which bin owns each slot** — instead of "used elsewhere" with no context, the picker now shows the actual bin name (e.g. "in Visual Assets")
- **Funnel deduplication in Library** — funnels with the same name across multiple clients now show as one card with per-client tags

---

## Template & Database Improvements
*v2.5.0 → v2.5.2 · June 2026*

- **7-level template resolution** — templates now cascade intelligently. Assigning a template to a single dimension (e.g. Task = "Reel Video") automatically applies it to every project that matches, unless a more specific assignment exists
- **Auto-slot assignment by name** — folder and bin names like "Audio", "Video", "Images" are automatically tagged with the right slot type. You only need to manually assign when the name is ambiguous
- **One-template-per-pair enforcement** — two templates can no longer be silently assigned to the same Client/Funnel/Task combination
- **Conflict confirmation dialog** — if you try to reassign a pair that already has a template, you get a dialog: "Replace [Old Template] with [New Template]?" — no accidental overwrites
- **14-bug defensive fix pass** — crash fixes across tray icon, JSON parsing, WebSocket sends, folder name sanitization, version numbering, and overlay repositioning

---

## Code Architecture
*v2.8.0 · June 2026*

The main renderer file (`app.js`) was split from ~3,000 lines into 6 focused files. No features changed — the app behaves identically. This was done to make future development faster and less error-prone.

---

*freeXan by BloomX · contentai@bloomxsolutions.com*
