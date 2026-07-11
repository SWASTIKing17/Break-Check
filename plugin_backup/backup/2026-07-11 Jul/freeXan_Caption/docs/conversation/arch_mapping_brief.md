# Conversation Brief: Architectural Mapping & Visualization

## Overview
The user requested a technical clarification of the SubMachine architecture and a comprehensive visual representation of the codebase execution flows. The primary focus was on mapping frontend user actions to granular backend logic in Premiere Pro (ExtendScript).

## Key Clarifications
- **Synchronous Execution**: Confirmed that the backend operates as a sequential chain of functions (UI → Main JSX → Helpers → Result). This model ensures timeline stability and "one-click" undo safety.
- **Node-Based Mental Model**: The user wanted to visualize the codebase as a tree of nodes (functions) within containers (files).

## Deliverables
- **Visual Execution Dashboard** (`docs/guides/visual_execution_dashboard.md`): A Markdown-based logic tree using Mermaid.js.
- **Interactive Architecture Dashboard** (`docs/guides/architecture_nodes.html`): A premium, high-density visualization tool styled with SubMachine's dark-mode aesthetic.
- **Backend Communication Guide** (`docs/guides/backend_communication.md`): A non-technical "Dashboard & Engine" metaphor guide for stakeholders.

## Granular Flows Mapped
- **Word Surgery (Split & Join)**: Traced from React drag-and-drop to `moveClipToTrack`, `buildTextObj`, and `_setSpecificWordSliderSlots`.
- **Synchronization Engine**: Traced from UI sync buttons to the "JSON Envelope" text protection logic in `sync.jsx`.
- **Timeline Manipulation**: Traced from the "Split" button to the playhead anchor detection and staircase track movement.

## Next Phase
The user has a clear visual understanding of the "Engine Room." Future work can now leverage this map to perform surgical refactors without risking architectural regressions.
