# Conversation Brief - 2026-04-29 - Installer & Cleanup

## Context
The user requested a "single-click" installer for the SubMachine plugin and a clean version of the legacy `panel.js` boilerplate.

## Key Changes
1.  **Created `Install_SubMachine.bat`**:
    *   Automates deployment to `%APPDATA%\Adobe\CEP\extensions`.
    *   Forces `PlayerDebugMode = 1` in the Windows Registry for CSXS versions 4-14.
    *   Uses `robocopy` for reliable file transfers.
2.  **Created `scratch/panel_clean.js`**:
    *   Replaced the 2.1MB `OLDpanel.js` (aescripts boilerplate) with a clean ~4KB version.
    *   Maintains the `SWASTIKing17` license bypass.
    *   Decoupled the SubMachine logic from obfuscated third-party libraries (Ajv, GA).
3.  **Updated Documentation**:
    *   Bumped version to `v3.3.0`.
    *   Updated `changelog.md` and `development_log.md`.

## Next Steps for the Next Agent
*   **Finalize Integration**: If the user wants to switch permanently to `panel_clean.js`, rename it to `panel/js/panel.js` (after backing up the current one).
*   **Testing**: Ask the user to run the `Install_SubMachine.bat` and verify the plugin appears in Premiere Pro's Extension menu.
*   **Portability**: If the user needs a macOS installer, create a corresponding `.command` script.
