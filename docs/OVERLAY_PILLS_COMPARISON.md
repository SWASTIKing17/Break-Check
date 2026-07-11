# FreeXan Overlay Pills: Comprehensive Architectural, Logical & UX Comparison

This document provides an exhaustive technical comparison between the two side-by-side implementations of the FreeXan Overlay Pill currently operating within the codebase:

1. **The Electron Overlay Pill** (`renderer/overlay.html`, `renderer/overlay.js`, `renderer/overlay.css`)
2. **The C++ Native Direct2D Overlay Pill** (`native-pill/main.cpp`, `native-pill/Renderer.h/cpp`, `native-pill/DropHandler.h/cpp`, `native-pill/IpcMessenger.h/cpp`, compiled as `FreeXanPill.exe`)

---

## Executive Summary

| Dimension | Electron Overlay Pill | C++ Native Direct2D Overlay Pill |
| :--- | :--- | :--- |
| **Technology Stack** | Chromium DOM, HTML5, Vanilla CSS, Electron `BrowserWindow` | 100% Native Win32 C++, Direct2D Hardware Acceleration, OLE COM |
| **Process Model** | Runs inside Chromium Renderer process (~40–80 MB RAM) | Dedicated standalone executable `FreeXanPill.exe` (~2–5 MB RAM) |
| **Window Geometry** | Frameless transparent window (`84×84` up to `244×84`) | Win32 window region clipping (`SetWindowRgn`) with exact circle/capsule bounds |
| **IPC Mechanism** | Chromium IPC (`window.api` preload bridge) | Asynchronous Windows Named Pipe (`\\.\pipe\freexan_pill`) |
| **Drag & Drop Engine** | Chromium DOM drag events (`dragover`, `dragleave`, `dragend`) | Native OLE `IDropTarget` with non-blocking asynchronous message queueing |
| **Hit-Testing** | JS `requestAnimationFrame` throttled `setIgnoreMouseEvents` | Native Win32 `WM_NCHITTEST` radial & rectangular coordinate clipping |
| **Halo Mode Routing** | DOM `<div class="halo-bubble">` around 56px pill at radius 50px | Hardware-accelerated Direct2D circles around 82px center at radius 58px |

---

## 1. Functional Differences

### A. Rendering & Runtime Environment
- **Electron Overlay Pill (`renderer/overlay.html`, `renderer/overlay.js`, `renderer/overlay.css`)**
  - **Initialization:** Instantiated in `main.js` via `createOverlayWindow()` (lines 1441–1477) as a frameless, transparent `BrowserWindow`.
  - **Z-Order Management:** Configured with `alwaysOnTop: true` using the specialized `'screen-saver'` z-order level (`overlayWindow.setAlwaysOnTop(true, 'screen-saver')`) to prevent Windows built-in screen capture tools (e.g., Win+Shift+S Snipping Tool) from obscuring the drop zone.
  - **Graphics Engine:** Relies on the Chromium Skia engine rendering HTML DOM elements, SVG vectors (`#drop-icon`), and CSS3 backdrop filters (`backdrop-filter: blur(28px) saturate(180%)`).

- **C++ Native Overlay Pill (`native-pill/main.cpp`, `native-pill/Renderer.cpp`)**
  - **Initialization:** Compiled as a standalone, zero-dependency Win32 executable (`FreeXanPill.exe`) using MinGW GCC static linking (`-static -static-libgcc -static-libstdc++`). Spawns from `main.js` via `spawnNativePillProcess()` (lines 2705–2730) using `child_process.spawn(..., { detached: false })`, nesting it directly inside the main `FreeXan` process tree in Windows Task Manager.
  - **Window Masking:** Uses direct Win32 window region shaping (`SetWindowRgn`). Instead of relying on transparent desktop compositor rendering, the OS physically clips the window rectangle into a perfect circle (`CreateRoundRectRgn(0, 0, 85, 85, 84, 84)`) or capsule when expanded, eliminating visual black square rendering glitches on legacy graphics drivers.
  - **Graphics Engine:** Direct2D hardware-accelerated drawing (`ID2D1HwndRenderTarget`) combined with DirectWrite (`IDWriteFactory`) for typography (`Segoe UI`).

### B. Inter-Process Communication (IPC) Bridge
- **Electron Overlay Pill**
  - Communicates directly over Chromium's built-in IPC channels (`ipcRenderer` bridged via `preload.js`).
  - Outgoing actions invoke `window.api.moveOverlayWindow()`, `window.api.resizeOverlay(mode)`, and `window.api.importDroppedFiles()`.
  - Incoming state updates are pushed from `main.js` via `overlayWindow.webContents.send('overlay-update', payload)`.

- **C++ Native Overlay Pill**
  - Communicates over an asynchronous Windows Named Pipe (`\\.\pipe\freexan_pill`).
  - **Server Side (`main.js` lines 2732–2778):** Electron runs `net.createServer()` listening on the pipe, sending JSON strings (`overlay-update`, `overlay-link-map`) terminated by newline (`\n`).
  - **Client Side (`native-pill/IpcMessenger.cpp`):** Operates a background background reader/writer thread (`ThreadProc`) that polls `PeekNamedPipe` every 10ms. Thread safety for outgoing telemetry (`sendLog`), drop events (`import-dropped-files`), and status requests (`request-status`) is guaranteed by a `CRITICAL_SECTION`-guarded queue (`m_outQueue`).

### C. Drag-and-Drop Capture & Execution
- **Electron Overlay Pill**
  - Intercepts Chromium DOM events (`dragover`, `dragleave`, `dragend`). When files are dropped over the HTML window, Electron resolves the file paths and passes them to `onFilesDropped(filePaths, modKeys)`.

- **C++ Native Overlay Pill**
  - Implements the native OLE COM interface `IDropTarget` (`DropHandler.cpp`).
  - **Non-Blocking Architecture:** Standard COM drag-and-drop blocks the calling process (Windows Explorer) until `IDropTarget::Drop` returns. If file copying or network IPC takes longer than a few milliseconds, Windows Explorer freezes with a spinning wait cursor. To solve this, `DropHandler::Drop` instantly reads dropped file paths (`DragQueryFileW`) into a heap-allocated `DropPayload` struct and posts an asynchronous Win32 message (`PostMessage(m_hWnd, WM_APP_DROP_FILES, (WPARAM)payload, 0)`), returning `S_OK` in `<0.1ms`. The message pump in `main.cpp` processes the import asynchronously without blocking Explorer.

---

## 2. Logical Differences

### A. Click Passthrough & Hit-Testing
- **Electron Overlay Pill (`overlay.js` lines 57–67)**
  - Because the HTML window occupies a rectangular bounds (`84×84` up to `244×84`), transparent areas outside the pill cap would intercept clicks intended for desktop windows beneath it.
  - **Throttled Hit-Test:** A global `mousemove` listener hit-tests the cursor against `pill.getBoundingClientRect()`. To prevent excessive CPU overhead, checks are throttled to one `requestAnimationFrame` per frame, dynamically toggling `window.api.setIgnoreMouseEvents(!over, { forward: true })`.

- **C++ Native Overlay Pill (`main.cpp` lines 123–137)**
  - Intercepts Win32 message `WM_NCHITTEST`.
  - **Exact Radial Hit-Testing:** In Halo Mode (`220×220` window), evaluates radial Euclidean distance from center:
    ```cpp
    float dx = (float)pt.x - 110.0f;
    float dy = (float)pt.y - 110.0f;
    if (dx * dx + dy * dy > 110.0f * 110.0f) return HTNOWHERE;
    return HTCLIENT;
    ```
  - Returning `HTNOWHERE` instructs Windows at the kernel level to pass the mouse event directly to underlying desktop windows, completely eliminating JS event throttling overhead.

### B. Hover Expansion & Collapse State Machines
- **Electron Overlay Pill (`overlay.js` lines 99–145)**
  - **Timer-Driven State Machine:**
    - On `dragover` enter: starts a **500ms** `expandTimer`. The pill only expands (`setDragActive()`) if the cursor hovers continuously for half a second.
    - On `dragleave`: starts a **1500ms** `collapseTimer`. Prevents accidental collapse when the user briefly moves the cursor off the pill cap during drag preparation.

- **C++ Native Overlay Pill (`main.cpp` lines 183–211)**
  - **Instantaneous Hover Architecture:** Uses Win32 `TrackMouseEvent` with `TME_LEAVE`.
  - When `WM_MOUSEMOVE` detects hover (`!g_isHovered`), instantly resizes the window bounds and Direct2D render target to `244×84`. When `WM_MOUSELEAVE` triggers, immediately collapses back to `84×84`. Zero timer delays are used, providing immediate tactile response.

### C. Halo Mode Routing & Focus Stealing
- **Electron Overlay Pill (`overlay.js` lines 211–347)**
  - Initiated when files are dropped with `modKeys.ctrlKey == true`.
  - Resizes window to `180×180`, attaches DOM `<div class="halo-bubble">` nodes at radius `50px` around the central pill.
  - Listens to DOM `keydown` events for keys `1`–`8` or `Escape` to dispatch import routing to assigned folder paths.

- **C++ Native Overlay Pill (`main.cpp` lines 57–119; `Renderer.cpp` lines 144–190)**
  - Initiated when `WM_APP_DROP_FILES` receives `ctrlPressed == true`. Resizes window to `220×220` and centers the ring at `(110, 110)`.
  - **Win32 Input Thread Attachment (Focus Stealing):** When dropping files from Windows Explorer into a window, Explorer retains keyboard focus by default, causing numerical keystrokes (`1`–`8`) to be ignored or swallowed by Explorer until the user clicks the pill window. The C++ Pill actively attaches thread input queues (`AttachThreadInput`), forcing foreground activation (`SetForegroundWindow` + `SetFocus`):
    ```cpp
    DWORD foreThread = GetWindowThreadProcessId(GetForegroundWindow(), NULL);
    DWORD curThread = GetCurrentThreadId();
    if (foreThread != curThread && foreThread != 0) {
        AttachThreadInput(foreThread, curThread, TRUE);
        SetForegroundWindow(hWnd);
        SetFocus(hWnd);
        AttachThreadInput(foreThread, curThread, FALSE);
    }
    ```
    This ensures that pressing `1`–`8` immediately routes the dropped files without requiring an extra click.

---

## 3. UX & Visual Differences

### A. Geometry & Visual Theme
- **Electron Overlay Pill**
  - **Aesthetics:** Styled after macOS frosted glass interfaces (`backdrop-filter: blur(28px)` with subtle border shadows).
  - **Dimensions:** Collapsed circle is `56×56px` inside an `84×84px` container. Expanded drag box is `216×56px`.
  - **Animations:** Features cubic-bezier width expansion (`0.38s cubic-bezier(0.34, 1.3, 0.64, 1)`), green flash animations on import success (`.pill.success-flush`), and error shake keyframes (`@keyframes pillShake`).

- **C++ Native Overlay Pill**
  - **Aesthetics:** High-contrast, solid dark matte slate (`D2D1::ColorF(0x18181a, 0.95f)`) with clean `1.5px` borders (`#333338`).
  - **Dimensions:** Collapsed circle is exactly `84×84px`. Expanded project banner is `244×84px`. In Halo Mode, the center pill renders at `82×82px` inside a `220×220px` ring.
  - **Halo Picker Presentation:** Renders 8 numbered circular bubbles at radius `58px`. Assigned slots display a prominent purple fill (`#7c3aed`), hovered slots glow bright purple (`#8b5cf6`), and empty slots display dim dashed/hollow contours (`0.45` alpha fill). Hovering an assigned slot draws a solid rounded banner above/below the bubble displaying the exact folder basename.

### B. Feedback Mechanisms
- **Electron Overlay Pill:** Provides textual feedback directly inside the pill text panel (`status-text` / `project-text`) and spawns transient DOM toast notifications (`showToast()`) at the bottom of the screen.
- **C++ Native Overlay Pill:** Employs crisp status indicators rendered directly onto the Direct2D canvas (Green `#22c55e` circle labeled `PR` when connected to Premiere Pro CEP; Red `#ef4444` circle labeled `OFF` when disconnected).

---

## Architectural Conclusion

The two overlay pills demonstrate distinct engineering trade-offs:
- **The Electron Overlay Pill** provides rich CSS micro-animations and seamless DOM integration with the renderer codebase, but incurs higher memory usage and requires JS frame-throttling to manage transparent window hit-testing.
- **The C++ Native Direct2D Overlay Pill** delivers uncompromised OS-level performance, zero-latency rendering, non-blocking OLE drag-and-drop, and robust thread-input focus stealing, establishing a rock-solid, minimalist native overlay experience.
