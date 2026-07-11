---
trigger: always_on
description: Strict rule to use and maintain PROJECT_MEMORY.md as the authoritative Source of Truth
---

# Project Memory Maintenance & Source of Truth Rule

**STRICT MANDATORY RULE:** `docs/PROJECT_MEMORY.md` is the authoritative **Source of Truth** and the primary starting point for any research, investigation, or development across the entire freeXan ecosystem.

1. **Mandatory Starting Point:** Before developing any new feature, debugging an issue, or reading code to understand an existing mechanism, you MUST start your research by consulting `docs/PROJECT_MEMORY.md`.
2. **Mandatory Cross-Check:** Whenever you read code or investigate any part of the project (desktop app, CEP plugins, HTTP/WebSocket bridges, CLI, or MCP server), you MUST cross-check your findings against `docs/PROJECT_MEMORY.md`.
3. **Mandatory Enrichment & Maintenance:** If you discover any architecture, workflow, mechanism, tool, command, parameter, or reference in the codebase that is missing from or outdated in `docs/PROJECT_MEMORY.md`, you MUST immediately add or update it in `docs/PROJECT_MEMORY.md`. Keep the document well-organized, comprehensive, and well-researched at all times.
