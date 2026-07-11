# Conversation Brief - 2026-04-21 (Robust Debugging System)

## Context
Following the modular refactor of the backend, we needed a way to identify the source of bugs in complex timeline manipulation, especially since Premiere Pro's default error reporting is often too generic.

## Objective
Implement a robust, level-based logging and error capture system to provide "black box" traceability for backend operations.

## Key Changes
1.  **Enhanced Logger**: `jsxLog` now supports `[INFO]`, `[SUCCESS]`, and `[ERROR]` levels, and saves to `core/debug_jsx.log`.
2.  **Error Reporter**: Created `reportError(err, context)` which automatically extracts the specific file name and line number from ExtendScript's `Error` object.
3.  **Object Dump Utility**: `dumpObject(obj)` allows for deep recursive inspection of complex Premiere Pro objects (tracks, project items, components) which usually fail stringification.
4.  **Breadcrumb Integration**: Added entry/exit logging to:
    - `timeline.jsx` (Join, Split, SplitJoin)
    - `sync.jsx` (SyncAll, SyncText)
    - `mogrt.jsx` (GetData, CreateCaptions)

## Impact
- **Traceability**: We can now see exactly which step failed in a multi-step operation like Join or Split.
- **Speed of Debugging**: Direct access to File and Line numbers in the backend log eliminates guesswork.
- **Transparency**: Non-technical users can refer to the `debug_jsx.log` to provide developers with precise info.

## Next Steps
- Monitor the `debug_jsx.log` during the next testing phase in Premiere Pro.
- Use `dumpObject` to investigate any null-property access issues in Newer Premiere versions.
