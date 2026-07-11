# Legacy Electron Overlay Pill Archive

This directory contains the original HTML5 / CSS3 / JavaScript implementation of the FreeXan Overlay Pill (`overlay.html`, `overlay.js`, `overlay.css`).

## Why Was It Archived?
In FreeXan v3.8+, the primary overlay pill was migrated to our high-performance **Native C++ Pill** (`/native-pill/` -> `FreeXanPill.exe`). The native C++ pill uses Direct2D and Win32 OLE COM drag-and-drop, providing instantaneous response with negligible CPU and RAM usage (< 0.1% CPU, ~5MB RAM).

To prevent two duplicate pills from launching side-by-side on startup, and to keep the Electron renderer bundle clean, the legacy Electron pill was removed from the active runtime environment and preserved here.

## How to Review or Reuse
- **Frontend Code:** You can open `overlay.html` directly in any browser or review `overlay.js` / `overlay.css` to inspect the UI animation state machine, Halo Ring CSS calculations, and drag-and-drop event handling.
- **Mac OS Porting Reference:** Since Electron is cross-platform, if an Electron-based pill is ever required for macOS or Linux environments in the future, these exact files can be restored to `/renderer/` and re-enabled in `main.js` by calling `createOverlayWindow()`.
