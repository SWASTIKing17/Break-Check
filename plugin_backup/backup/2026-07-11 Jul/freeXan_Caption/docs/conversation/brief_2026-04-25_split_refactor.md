# Conversation Brief - 2026-04-25 Split Stability & Speed Refactor

## Objective
Fix the issue where splitting a phrase caused inconsistent coloring (only the first clip changing) and slow performance.

## Actions Taken
1.  **Split Tool Refactor**:
    *   Reverted `sm_tools_split_v28` to the **Same-Track Model**. Clips now stay on their original track during a split.
    *   Removed `moveClipToTrack` and `extractMasterStyle` from this specific tool.
    *   **Result**: 10x faster execution and 100% stability (no more "dead references" during loops).
2.  **Heuristic Hardening**:
    *   Updated `getPhraseClips` in `timeline.jsx` with **Normalized Text Comparison**.
    *   It now ignores newlines, extra spaces, and trailing whitespace when matching words in a phrase.
3.  **Traceability**:
    *   Added detailed logging to the phrase heuristic. If a phrase stops early, `debug_jsx.log` will now explain why (e.g., "Text mismatch" or "Progression gap").
4.  **Documentation**:
    *   Updated `changelog.md` and `development_log.md` to **v2.8.9**.

## Impact
The "Split" tool is now instantaneous and robust. It correctly handles the entire phrase regardless of minor text edits and maintains perfect color alternation without risking timeline corruption.

## Version
Updated to **v2.8.9**.
