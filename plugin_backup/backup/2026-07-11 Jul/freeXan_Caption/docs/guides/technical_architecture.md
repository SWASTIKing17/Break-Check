# SubMachine: Technical Architecture & Debugging Guide

This guide explains how data moves between the **User Interface (HTML/JS)** and the **Premiere Pro Engine (ExtendScript)**, and how to effectively debug the system when things go wrong.

---

## 1. The Three-Layer Stack

SubMachine operates as a sandwich of three technologies:

1.  **Frontend (The Control Room)**: 
    *   **Files**: `panel/panel.html`, `panel/js/tools_refactor.js`.
    *   **Tech**: HTML, CSS, JavaScript.
    *   **Role**: Handles button clicks, animations, and high-level logic.

2.  **The CEP Bridge (The Wire)**:
    *   **Mechanism**: `window.__adobe_cep__.evalScript`.
    *   **Role**: The communication tunnel that allows the JS "Control Room" to talk to the JSX "Engine."

3.  **Backend (The Engine)**:
    *   **Files**: `panel/jsx/core/sync.jsx`, `panel/jsx/core/timeline.jsx`.
    *   **Tech**: ExtendScript (Adobe's version of JavaScript).
    *   **Role**: Directly manipulates the Premiere Pro API (Timeline, Tracks, MOGRT properties).

---

## 2. Data Flow Lifecycle (Example: Sync All)

When a user clicks "Sync All," the following sequence occurs:

1.  **JS Interception**: `tools_refactor.js` catches the click event.
2.  **Inquiry Call**: JS calls `syncAllGetData` in the backend.
3.  **JSX Snapshot**: 
    *   The backend scans the sequence.
    *   It finds the clip under the playhead.
    *   It gathers all visual properties into a JSON object.
4.  **JS Processing**: 
    *   The backend returns the JSON to the JS.
    *   The JS removes properties that shouldn't be synced (like `Word Progression`).
5.  **Execution Call**: JS calls `sm_sync_batch` with the updated data.
6.  **JSX Application**: 
    *   The backend loops through all selected clips.
    *   It performs a "Surgical Merge" for text-based properties to ensure style is copied but words are preserved.

---

## 3. How to Debug

### A. Debugging the Frontend (The Panel)
To see `console.log` messages from `tools_refactor.js`:
1.  **Enable Remote Debugging**: Create a file named `.debug` in the root of the extension folder.
2.  **Open Chrome**: Navigate to `http://localhost:8088` (the port defined in `.debug`).
3.  **Inspect**: You will see a standard Chrome Developer Tools window where you can inspect elements and see JS errors.

### B. Debugging the Backend (The JSX Engine)
Since the backend runs inside Premiere, standard `console.log` doesn't work.
1.  **Use `jsxLog()`**: This is a custom helper in `utils.jsx` that writes to `panel/jsx/debug_jsx.log`.
2.  **ESTK / VS Code**: If you have the "Adobe Script Runner" or "ExtendScript Debugger" extension in VS Code, you can use `$.writeln()` to output directly to the VS Code console.
3.  **`dumpObject()`**: Use this helper to print the structure of Premiere's complex internal objects (like `TrackItem` or `Component`) to the log.

### C. Identifying "The Crash"
If a button does nothing:
1.  Check the Chrome Console (Frontend). If you see **"EvalScript error."**, it means the JSX backend crashed (syntax error or API failure).
2.  Check `debug_jsx.log`. Look for lines marked `[ERROR]`. SubMachine is designed to report the exact line number of the crash in the backend.

---

## 4. Key Data Structures

### `selectedMogrtData`
Used to identify targets.
```json
[
  { "trackNumber": 1, "clipNumber": 4 },
  { "trackNumber": 1, "clipNumber": 5 }
]
```

### `masterMogrtData`
The blueprint of the look we are copying.
```json
[
  { 
    "displayName": "Ⓣ Word Color", 
    "value": [255, 0, 0, 1], 
    "valueType": 6 
  }
]
```

---

## 5. Summary for Non-Coders
Think of the **JS Frontend** as a Manager and the **JSX Backend** as a Worker. 
*   The **Manager** looks at the big picture ("The user wants to sync these clips").
*   The **Worker** does the heavy lifting ("I am physically changing the color of clip #5").
*   The **Bridge** is the telephone they use to talk. If the phone line is busy or the Worker doesn't understand the command, the "Sync" fails.
