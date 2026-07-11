# MCP & CLI Development Rule

**STRICT RULE: Always Use Tested and Verified Code**
- When developing or modifying MCP tools or CLI commands, **DO NOT** write new code or logic from scratch if a similar operation already exists.
- The project already has established methods for almost every operation (e.g., sequence creation, bin manipulation, API requests).
- You MUST thoroughly search the codebase for existing approaches, patterns, or functions and **copy the exact same approach**.
- Reuse existing logic that has already been tested and verified to work.
