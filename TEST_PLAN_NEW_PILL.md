# End-to-End Test Checklist: C++ Native Direct2D Overlay Pill (`FreeXanPill.exe`)

This document is formatted as an interactive checklist. As you test each item in Windows/Premiere Pro, check off the boxes (`[x]`) to track verification progress.

---

## Phase 1: Process Lifecycle & Tray Control Verification
- [ ] **TC-SYS-01: Automatic Side-by-Side Launch**
  - **Action:** Launch FreeXan (`npm start` or Electron executable).
  - **Expected Result:** `FreeXanPill.exe` automatically spawns alongside the main app. Both the old Electron pill and new C++ pill render side-by-side on the desktop.

- [ ] **TC-SYS-02: Task Manager Process Tree Grouping**
  - **Action:** Open Windows Task Manager → expand the **FreeXan** process group.
  - **Expected Result:** `FreeXanPill.exe` (labeled **FreeXan Overlay Pill**) appears cleanly nested as a child process under the main **FreeXan** application tree.

- [ ] **TC-SYS-03: System Tray Hide Pill Toggle**
  - **Action:** Right-click the FreeXan tray icon → click **Hide Pill**.
  - **Expected Result:** Both overlay pills instantly disappear/terminate. The context menu item changes label to **Show Pill**.

- [ ] **TC-SYS-04: System Tray Show Pill Toggle**
  - **Action:** Right-click the tray icon → click **Show Pill**.
  - **Expected Result:** Both overlay pills respawn side-by-side at their current/default screen positions.

- [ ] **TC-SYS-05: Graceful App Quit**
  - **Action:** Close FreeXan via tray menu (**Quit FreeXan**).
  - **Expected Result:** `FreeXanPill.exe` terminates cleanly via IPC `quit` message without leaving any zombie processes in Task Manager.

---

## Phase 2: Visual Geometry & Repositioning Verification
- [ ] **TC-GEO-01: True Round Circular Contour**
  - **Action:** Inspect the collapsed C++ pill (`84×84px`) against any desktop background color.
  - **Expected Result:** Window contour is perfectly circular with clean rounded edges. Zero black square background corner pixels appear behind the circle.

- [ ] **TC-GEO-02: Always-On-Top Layering**
  - **Action:** Open active applications (Premiere Pro, Explorer, Chrome) over the pill's coordinates.
  - **Expected Result:** Pill stays persistently visible on the topmost screen layer without blocking interaction with surrounding windows.

- [ ] **TC-GEO-03: Reposition Overlay Command**
  - **Action:** Move or drag windows around, then click **Reposition Overlay** in the FreeXan tray menu.
  - **Expected Result:** The C++ native pill resets precisely to its default coordinates (`x=20, y=115`) directly below the Electron pill (`x=20, y=20`).

---

## Phase 3: Standard (Direct) Drag-and-Drop & Slot Routing
- [ ] **TC-DND-01: Direct Video Drop (No Modifiers)**
  - **Action:** Drag an `.mp4` / `.mov` file from Desktop/Explorer directly onto the round C++ pill without holding keys.
  - **Expected Result:** Explorer mouse cursor shows copy badge. Pill receives drop instantly without Explorer freezing (<0.1ms OLE response).

- [ ] **TC-DND-02: Automatic Slot & Bin Classification**
  - **Action:** Drop a video file and check the destination folder and Premiere Pro project bin.
  - **Expected Result:** File is automatically routed to the project's assigned Video folder (`02_Footage`) and imported directly into the matching Premiere bin over WebSocket.

- [ ] **TC-DND-03: Multi-Format Classification**
  - **Action:** Drop audio (`.wav`/`.mp3`) and image (`.png`/`.psd`) files onto the pill.
  - **Expected Result:** Audio routes to assigned Audio folder/bin; images route to assigned Image folder/bin.

- [ ] **TC-DND-04: Shift-Drop Move Mode**
  - **Action:** Hold `Shift` while dragging and dropping a file from another folder on the same drive.
  - **Expected Result:** File is **moved** (`renameSync`) into the destination slot folder rather than copied, leaving the source directory clean.

---

## Phase 4: Halo Mode (Hold Ctrl) Ring & Interactive Routing
- [ ] **TC-HALO-01: Ring Expansion Trigger**
  - **Action:** Hold `Ctrl` while dragging files over the C++ pill and drop onto the center bubble.
  - **Expected Result:** Pill smoothly expands its window region to `220×220px` and renders a circular ring of **8 numbered routing bubbles** around itself.

- [ ] **TC-HALO-02: Assigned vs. Empty Visual Feedback**
  - **Action:** Inspect the 8 ring bubbles when an active Premiere project is linked.
  - **Expected Result:** Assigned slots render with vibrant purple fill, glowing borders, and bright white digits. Unassigned slots render dim with dashed borders and faint digits.

- [ ] **TC-HALO-03: Hover Folder Banner**
  - **Action:** Hover mouse cursor over an assigned numbered bubble (e.g., bubble `1` or `2`).
  - **Expected Result:** A clear dynamic text banner displays the name of the assigned folder outside the bubble contour.

- [ ] **TC-HALO-04: Mouse Click Slot Routing**
  - **Action:** In Halo Mode, click directly on bubble `1` (`02_Footage`).
  - **Expected Result:** All dropped files instantly copy/move into the exact folder for slot 1, import directly into slot 1's Premiere bin, and the ring closes back to circular shape.

- [ ] **TC-HALO-05: Keyboard Number Routing (`1`–`8`)**
  - **Action:** In Halo Mode, press number key `2` on top keyboard or numpad.
  - **Expected Result:** Pill captures the keystroke (via foreground thread attachment), routes files into slot 2's folder/bin, and closes the ring.

- [ ] **TC-HALO-06: Escape / Click Outside Dismissal**
  - **Action:** Enter Halo Mode, then press `Esc` or click anywhere on empty desktop space outside the ring bubbles.
  - **Expected Result:** Halo ring cancels immediately without transferring files and collapses back to `84×84px`.

---

## Phase 5: Duplicate Handling & Edge Cases
- [ ] **TC-ERR-01: Duplicate File Drop (Standard Mode)**
  - **Action:** Drop `clip.mp4` onto the pill once, then drop `clip.mp4` from Desktop onto the pill a second time.
  - **Expected Result:** Second drop increments filename automatically (`clip_1.mp4`), copying safely without throwing path collision errors.

- [ ] **TC-ERR-02: Duplicate File Drop (Halo Mode Ctrl)**
  - **Action:** Drop `clip.mp4` holding `Ctrl` onto slot 1, then drop `clip.mp4` holding `Ctrl` onto slot 1 again.
  - **Expected Result:** Path normalization prevents double backslash errors (`\\\\`). File copies as `clip_1.mp4` and imports cleanly into CEP.

- [ ] **TC-ERR-03: Dropping Files Already Inside Target Folder**
  - **Action:** Open the project's `02_Footage` folder in Explorer, drag `existing.mp4` out and drop it onto slot 1 in Halo Mode.
  - **Expected Result:** Self-copy detector (`isAlreadyInTarget`) detects the file is already in destination. Skips disk copy/rename loop and triggers CEP bin import directly.

- [ ] **TC-ERR-04: Project Switch / Dynamic Link Map Sync**
  - **Action:** Switch active project tabs inside Premiere Pro (`Project A.prproj` → `Project B.prproj`).
  - **Expected Result:** `main.js` pushes the new project's link map over IPC (`overlay-link-map`). Hover banners and assigned slots in Halo Mode instantly update to reflect Project B's folders.
