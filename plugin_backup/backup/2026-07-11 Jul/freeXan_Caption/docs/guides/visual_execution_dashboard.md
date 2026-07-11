# Visual Execution Dashboard: High-Density Logic Map

This document provides a **Granular Trace** of SubMachine's execution. Each branch shows not just the entry point, but every internal helper function that must fire to complete the user's request.

## 1. Word Surgery Flow (High Density)
This is the most complex flow in the plugin, involving word remapping, track movement, and style preservation.

```mermaid
graph TD
    %% Entry
    User_Surgery["[User] Drag Word / Merge"] --> React_Surgery["handleMerge / handleWordTransfer"]

    subgraph Timeline_JSX_Surgical ["timeline.jsx: The Surgical Engine"]
        direction TB
        Main_SJ["sm_tools_split_join_v28"]
        
        subgraph Analysis_Phase ["Phase 1: Analysis"]
            H_Phrase["getPhraseClips (Heuristic)"]
            H_Cover["fullyCovered (Validation)"]
            H_Style["extractMasterStyle"]
            H_Sliders["_readPhraseSliderValues"]
        end

        subgraph Calculation_Phase ["Phase 2: Math"]
            C_Neighbor["findNeighborPhrase"]
            C_Track["getSafeAlternatingTrack (track staircase)"]
            C_Color["getSafeAlternatingColor"]
            C_Text["buildTextObj / mergeTextObjs"]
        end

        subgraph Execution_Phase ["Phase 3: Surgery"]
            E_Move["moveClipToTrack"]
            E_ApplyStyle["applyMasterStyle"]
            E_ApplyText["targetProp.setValue (JSON)"]
            E_ApplySliders["_setSpecificWordSliderSlots"]
            E_ApplyColor["_setClipColor"]
        end
    end

    %% Wiring
    React_Surgery -- "evalScript" --> Main_SJ
    Main_SJ --> Analysis_Phase
    Analysis_Phase --> Calculation_Phase
    Calculation_Phase --> Execution_Phase

    %% Styling
    style User_Surgery fill:#00bcd4,stroke:#fff,color:#fff
    style Main_SJ fill:#f44336,stroke:#fff,color:#fff
    style Execution_Phase fill:#1a1a1a,stroke:#4caf50,stroke-width:2px,color:#fff
```

## 2. Sync Engine Flow (High Density)
How styles are copied while protecting text content.

```mermaid
graph TD
    User_Sync["[User] Click Sync All"] --> JS_Sync["handleSyncGeneric"]

    subgraph Sync_JSX_Engine ["sync.jsx: The Sync Engine"]
        Main_SyncData["syncAllGetData"]
        Main_SyncApply["syncAll (Sequential Loop)"]
        
        subgraph Logic_Guards ["Logic Guards"]
            G_Prog["Progression Guard (Skip)"]
            G_Glyph["Glyph Guard (Ⓢ/Ⓑ check)"]
            G_Text["Text Protection (JSON Merge)"]
        end
    end

    JS_Sync -- "1. Capture" --> Main_SyncData
    JS_Sync -- "2. Batch" --> Main_SyncApply
    Main_SyncApply --> Logic_Guards
```

---

### Glossary of Nodes
*   **Heuristic (`getPhraseClips`)**: The "Brain" that finds all clips belonging to the same sentence. **Note: scans a single track only** — clips spread across tracks by a previous staircase operation will not be found by this function.
*   **Staircase (`getSafeAlternatingTrack`)**: Logic that ensures phrases don't overlap on the same track. Picks from pool [1,2,3] avoiding the two neighbour track indices. Does not check occupancy.
*   **JSON Envelope (`mergeTextObjs`)**: The safe way to copy styles without overwriting word content.
*   **Gap Bridge (`_bridgeGaps`)**: Extends each clip's end to exactly meet the next clip's start (ticks-based), eliminating frame-snap gaps that cause subtitle flickering.

---

## 3. Debug Bridge Flow

How the terminal debugger communicates with ExtendScript inside Premiere Pro.

```mermaid
graph LR
    Dev["[Dev] Terminal\n(submachine-debug.js)"]
    Inbox["debug_inbox.json\n(LOGS dir)"]
    Outbox["debug_outbox.json\n(LOGS dir)"]
    Panel["panel.html JS\nsetInterval 2s"]
    Bridge["debug_bridge.jsx\nsm_debug_poll()"]
    JSX["ExtendScript Engine\n(getTimelinePhraseMap etc.)"]

    Dev -- "write command" --> Inbox
    Panel -- "evalScript every 2s" --> Bridge
    Bridge -- "read + delete" --> Inbox
    Bridge -- "execute" --> JSX
    Bridge -- "write result" --> Outbox
    Dev -- "poll + delete" --> Outbox
```

**Zero overhead guarantee**: `sm_debug_poll()` checks for `debug_inbox.json` existence as its first operation. If the file is absent (i.e., no command pending) it returns immediately — the 2s heartbeat costs one `File.exists` check per tick.
