# Conversation Brief: Backend Dependency Analysis

**Date:** 2026-04-25
**Conversation ID:** `c423fdbe-87cd-464f-94d8-9c348c0c193c`

## Objective
Analyze the SubMachine backend (ExtendScript/JSX) to identify functions used multiple times and create a dependency map to guide future development and prevent regressions.

## Key Actions Taken
1.  **Codebase Audit**: Scanned all core backend files (`utils.jsx`, `mogrt.jsx`, `sync.jsx`, `timeline.jsx`) for function definitions and cross-file usages.
2.  **Shared Function Identification**:
    *   **Global Utilities**: Identified `jsxLog`, `reportError`, and `safeCall` as the foundation of the backend.
    *   **Logic Helpers**: Identified `getPhraseClips`, `extractMasterStyle`, `applyMasterStyle`, and `moveClipToTrack` as critical shared components for timeline manipulation.
    *   **Visual Logic**: Identified `getSafeAlternatingColor` and `getSafeAlternatingTrack` as key for the "Staircase" UX model.
3.  **Documentation Creation**:
    *   Created [backend_dependency_map.md](file:///c:/Swastik%20Development/SubMachine/docs/guides/backend_dependency_map.md) using metaphors to explain risks to non-technical stakeholders and developers.
    *   Updated `project_navigation.md`, `development_log.md`, and `changelog.md` to reflect the new documentation.

## Outcome
The project now has a "Risk Map" for the backend. Any agent or developer modifying these shared functions is now explicitly warned about the potential impact on multiple systems (Split, Join, Sync, etc.). This significantly hardens the project against regressions during rapid feature expansion.

## Critical Functions to Watch
*   `safeCall`: The entry point for almost all UI-to-Backend communication.
*   `getPhraseClips`: The logic that identifies which MOGRTs belong to a sentence.
*   `applyMasterStyle`: The engine that preserves looks across the timeline.
