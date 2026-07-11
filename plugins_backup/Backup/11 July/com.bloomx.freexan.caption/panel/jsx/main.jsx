/**
 * freeXan Caption - Premiere Pro & After Effects Extension Backend
 * @version v2.8.1
 * @license UNLICENSED
 * 
 * This is the main entry point for the ExtendScript backend.
 * It loads all logical modules using the #include directive.
 */

// 1. Compatibility Layer (JSON Polyfill)
#include "lib/json2.jsx"

// 2. System Utilities, Logging & Alerts
#include "core/utils.jsx"


// 4. Core Logic (MOGRT Management)
#include "core/mogrt.jsx"

// 4. Synchronization Tools
#include "core/sync.jsx"

// 5. Timeline & Phrase Tools
#include "core/timeline.jsx"

// 6. MOGRT Param Editor backend (isolated — feeds the Params tab React panel)
#include "core/mogrt_editor.jsx"

// 7. Debug Bridge — file-based IPC for the terminal debugger (zero-cost if inbox absent)
#include "core/debug_bridge.jsx"

jsxLog("--- BACKEND MAIN.JSX FULLY LOADED (v2.8.3) ---", "SUCCESS");
