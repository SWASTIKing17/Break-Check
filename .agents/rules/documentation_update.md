---
trigger: always_on
description: Strict rule to update documentation after codebase changes
---

# Documentation Update Rule

**STRICT RULE:** You MUST update the following logs after EVERY change you make in the codebase:
1. `CHANGELOG.md` (in `c:\Swastik Development\FreeXan Development\docs\logs`)
2. `DEV_LOG.md` (in `c:\Swastik Development\FreeXan Development\docs\logs`)
3. `NAVIGATION_LOG.md` (in `c:\Swastik Development\FreeXan Development\docs\logs`)

**ADDITIONAL STRICT RULE FOR CEP PLUGINS:**
CEPs have separate docs. Whenever you change ANY Plugin in the `CEPs` directory, you MUST update their respective documentation separately in their own specific directory/file.

**ADDITIONAL STRICT RULE FOR MCP AND CLI TOOLS:**
MCP Server (`/mcp`) and CLI (`/cli`) MUST have their separate documentation maintained independently. Whenever you add, modify, or remove any MCP tool or CLI command, you MUST update their respective documentation in `/mcp/README.md` and `/cli/README.md` immediately and separately!

**ADDITIONAL STRICT RULE FOR PROJECT MEMORY (SOURCE OF TRUTH):**
`docs/PROJECT_MEMORY.md` is the authoritative Source of Truth for the entire ecosystem. Whenever you investigate code or develop any feature, always cross-check against `docs/PROJECT_MEMORY.md`. If any reference, mechanism, or tool is not found, you MUST add and enrich it in `docs/PROJECT_MEMORY.md` immediately!