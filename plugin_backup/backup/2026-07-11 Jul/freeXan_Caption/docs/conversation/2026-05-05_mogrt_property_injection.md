# Conversation Brief: MOGRT Property Injection Documentation

**Conversation ID:** 46075ec9-e1b7-4b2a-a651-b62f8168bc15
**Date:** 2026-05-05

## Objective
Document the "standard way" of injecting properties into MOGRTs within the SubMachine ecosystem.

## Key Outcomes
1.  **Code Analysis**: Verified the property injection logic in `properties.jsx`, `mogrt.jsx`, and `sync.jsx`.
2.  **New Guide**: Created `docs/guides/mogrt_property_injection_guide.md` which explains the "Universal Translator" (Property Mapping) and "JSON Envelope" (Text Injection) concepts to non-technical stakeholders.
3.  **Technical Standard**: Established `docs/guides/sync_technical_standard.md` with detailed breakdowns for the 4 UI sync tools (**Sync All**, **Sync Text & Typeface**, **Sync Style & Animation**, **Sync PSR**) and the **Join Selection** utility.
4.  **Standardization**:
    -   **Property Lookup**: Use `SM_PROP` for name-agnostic access.
    -   **Text Injection**: Parsing/Updating/Stringifying JSON strings for Source Text.
    -   **Highlight Preservation**: Strictly protect `Word Progression` from bulk sync.
    -   **Glyph Guards**: Block properties with **Ⓢ** or **Ⓑ** during cross-phrase sync to protect phrase-specific logic.
    -   **Color Normalization**: Handle Array vs. Object formats across PP versions.
    -   **Transform Logic**: Prioritize internal MGT transforms over external Motion components.

## Implementation Details
-   The `SM_PROP` dictionary in `properties.jsx` is the source of truth for property names.
-   `getSMProperty` handles the lookup.
-   `createCaptions` in `mogrt.jsx` demonstrates the text injection pattern.
-   `syncText` in `sync.jsx` implements the "Style vs. Content" protection logic.

## Next Steps for Future Agents
-   Maintain the `SM_PROP` dictionary when adding new features or supporting new MOGRT versions.
-   Ensure all "Sync" operations respect the `phraseIndex` to avoid accidental text overwrites.
-   Reference `mogrt_property_injection_guide.md` when explaining MOGRT behavior to users.
