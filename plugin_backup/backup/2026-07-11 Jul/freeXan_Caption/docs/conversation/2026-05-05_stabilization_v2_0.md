# Conversation Brief: SubMachine Stabilization v2.0 (2026-05-05)

## Objective
Stabilize the SubMachine synchronization engine by resolving persistent "JSX CRASH" errors and scrapping the unstable property mapping architecture in favor of a rock-solid, flat-index-based system.

## Key Actions Taken
1.  **Resolved JSX Crashes**: Identified that `numProperties` and `matchName` were causing Premiere Pro's host engine to abort. Standardized all iteration on `.length` and removed unsupported calls.
2.  **Scrapped Property Mapping**: Deleted `properties.jsx` and removed all dependencies on the `getSMProperty` dictionary system.
3.  **Flat-Index Architecture**: Updated `sync.jsx`, `timeline.jsx`, and `mogrt.jsx` to use direct index-matching and prioritized display-name lookups for core properties (Progression/Text).
4.  **Verified Detachment**: Performed a full codebase audit (recursive grep) to ensure zero remaining references to the old mapping logic.
5.  **Updated Documentation**: Recorded the milestone in the `changelog.md` and `development_log.md` as **SubMachine v2.0**.

## Current State (v2.0)
-   **Stability**: The backend is now crash-resistant and optimized for Premiere Pro's ExtendScript environment.
-   **Architecture**: "Flat Index Dependency" is the new source of truth for all synchronization tools.
-   **Structure**: Cleaned up `main.jsx` and the `core/` directory.

## Information for Next Agent
-   All sync tools now use `item.index` to target properties.
-   Do NOT re-introduce `numProperties` or `matchName` on Premiere Pro objects.
-   The system is now completely independent of `properties.jsx`.
-   The user considers this **Working Version 2.0**.
