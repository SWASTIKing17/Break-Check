# freeXan Caption — Image Replacement List

Generated during the SubMachine → freeXan Caption rebrand.

The plugin code now references **freeXan Caption by BloomX**, but the binary image assets in `panel/images/` still carry **old SubMachine / aescripts / BMP / CWS branding**. The HTML and JS references to these files have been **deliberately preserved** so the panel keeps working today — but the imagery itself needs to be replaced for the rebrand to be visually complete.

Replace each image **in-place** (overwrite the file at the same path, with the same filename). The HTML doesn't need to change. If you want to rename a file, also update its `<img src="...">` reference in `custom/help.html` and `panel/panel.html`.

Brand spec for new artwork:
- Background: `#121214`
- Surface: `#161618`
- Accent: `#997DFF`
- Text: `#f3f3f5`
- Type: IBM Plex Sans (UI), JetBrains Mono (labels), match the panel's "infrastructure terminal" aesthetic

---

## Critical (visible branding — replace first)

| # | File | Where it shows | Current content |
|---|------|----------------|-----------------|
| 1 | `panel/images/Aescripts Help Header.png` | `custom/help.html` (top of help page) | aescripts logo banner |
| 2 | `panel/images/BMP_Logo_Still.png` | panel (footer / about section, if referenced) | BMP Creative logo |
| 3 | `panel/images/Logos_CWS-Icon-Light.png` | panel collaboration credits | Creative Workflow Solutions icon |
| 4 | `panel/images/Logo_Spin_Optimized.gif` | panel loading/splash | Old SubMachine animated logo |

## Quick-tutorial thumbnails (12 files — visible in Help tab and panel walkthroughs)

These all live in `panel/images/`, referenced from `custom/help.html` and `panel/panel.html`. Each should become a freeXan Caption-branded thumbnail of the same dimensions.

| # | File | Subject |
|---|------|---------|
| 5 | `SubMachine Create SRT.png` | "Create SRT" tutorial thumbnail |
| 6 | `SubMachine Create Subs.png` | "Create Subs" tutorial thumbnail |
| 7 | `SubMachine Sync All.png` | "Sync All" tutorial thumbnail |
| 8 | `SubMachine Sync Text and Typeface.png` | "Sync Text & Typeface" thumbnail |
| 9 | `SubMachine Sync Style and Animation.png` | "Sync Style & Animation" thumbnail |
| 10 | `SubMachine Sync Position, Scale & Rotation.png` | "Sync PSR" thumbnail |
| 11 | `SubMachine Reset Word Progression.png` | "Reset Word Progression" thumbnail |
| 12 | `SubMachine Split & Join Selection.png` | "Split & Join Selection" thumbnail |
| 13 | `SubMachine Split 1 Entire Phrase.png` | "Split Phrase" thumbnail |
| 14 | `SubMachine Join 2 Entire Phrases.png` | "Join Phrases" thumbnail |
| 15 | `SubMachine Reset All and Reset Reset Specific.png` | "Reset" thumbnail |
| 16 | `SubMachine Editing Mogrts.png` | "Editing MOGRTs" thumbnail |
| 17 | `SubMachine - Split & Join Selection Image.png` | additional Split/Join image |

## MOGRT preview GIFs and posters (18 files — for the help/showcase grid)

These represent the **content** of the MOGRT templates, not the freeXan Caption branding directly. They are likely fine as-is **unless** the templates ship under new names — but consider updating any frames that visibly say "SubMachine" in the rendered text.

| # | File | Type |
|---|------|------|
| 18 | `Animator_A-65 (dragged).png` | poster |
| 19 | `Animator_A.gif` | preview animation |
| 20 | `Animator_B-65 (dragged).png` | poster |
| 21 | `Animator_B.gif` | preview animation |
| 22 | `Animator_C-65 (dragged).png` | poster |
| 23 | `Animator_C.gif` | preview animation |
| 24 | `AnimatorPro_A-65 (dragged).png` | poster |
| 25 | `AnimatorPro_A.gif` | preview animation |
| 26 | `AnimatorPro_B-65 (dragged).png` | poster |
| 27 | `AnimatorPro_B.gif` | preview animation |
| 28 | `AnimatorPro_C-65 (dragged).png` | poster |
| 29 | `AnimatorPro_C.gif` | preview animation |
| 30 | `Dynamo_A-17 (dragged).png` | poster |
| 31 | `Dynamo_A.gif` | preview animation |
| 32 | `Dynamo_B-63 (dragged).png` | poster |
| 33 | `Dynamo_B.gif` | preview animation |
| 34 | `Dynamo_C-9 (dragged).png` | poster |
| 35 | `Dynamo_C.gif` | preview animation |
| 36 | `Karaoke_A-65 (dragged).png` | poster |
| 37 | `Karaoke_A.gif` | preview animation |
| 38 | `Karaoke_B-65 (dragged).png` | poster |
| 39 | `Karaoke_B.gif` | preview animation |
| 40 | `Karaoke_C-65 (dragged).png` | poster |
| 41 | `Karaoke_C.gif` | preview animation |

## Walkthrough / tutorial preview images

| # | File | Notes |
|---|------|-------|
| 42 | `Walkthrough.png` | Full walkthrough thumbnail |
| 43 | `PG-1.png` | Walkthrough PG part 1 |
| 44 | `PG-2.png` | Walkthrough PG part 2 |
| 45 | `VR-1.png` | Walkthrough VR thumbnail |

## Tools / numbered guide images (used in panel "Tools" tab)

| # | File | Notes |
|---|------|-------|
| 46 | `01.png` – `09.png` (9 files) | Numbered step illustrations |
| 47 | `10.gif` | Animated step illustration |
| 48 | `Tools 01.png` – `Tools 06.png` (6 files) | Tools-tab illustrations |
| 49 | `Tools - Split 01.png` | Split tool illustration |
| 50 | `Tools - Join 01.png` | Join tool illustration |
| 51 | `Caption Track Visibility.png` | Caption-track explanation |
| 52 | `Export CSV.png` | Export CSV illustration |
| 53 | `Long CSV Settings.png` | CSV settings illustration |
| 54 | `Short CSV Settings.png` | CSV settings illustration |

## Third-party brand icons (replace or remove — Discord ones probably keep)

| # | File | Notes |
|---|------|-------|
| 55 | `Discord_Logo-1.png` | Discord brand mark — keep if community link is Discord |
| 56 | `discord-icon.png` | Discord icon variant |
| 57 | `discord-logo-white.png` | Discord icon variant |
| 58 | `discord-logo.png` | Discord icon variant |

## Non-image assets in `panel/images/`

These are not images and shouldn't be touched as part of the rebrand:

| File | Type |
|------|------|
| `panel/images/DSLR 1080p25.sqpreset` | Premiere sequence preset |
| `panel/images/MA_OriginalSound_InfographicIdeas_1.wav` | Audio sample for demos |

---

## After replacement

1. Drop new files into `panel/images/` with the same filenames as listed above.
2. If you rename a file, search-and-replace its old name in:
   - `custom/help.html`
   - `panel/panel.html`
3. Reinstall the plugin (`Install_freeXan_Caption.bat`) so the new assets land in `%APPDATA%\Adobe\CEP\extensions\com.bloomx.freexan.caption\`.
4. Restart Premiere Pro and open **Window → Extensions → freeXan Caption** to verify the new artwork.
