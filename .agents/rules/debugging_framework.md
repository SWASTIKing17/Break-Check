---
trigger: always_on
---

# Debugging Framework Rule

**STRICT RULE:** Every time you add, modify, or debug code in this project you MUST follow the FreeXan Debugging Framework (Phases 1–6). This is non-negotiable.

---

## 1. Telemetry — Every Code Path Must Be Instrumented

Use `sendLog(level, event, source, correlationId, payload, durationMs?, error?)` from `logger.js` (Electron main/preload) or `window.freeXanLog(level, event, correlationId, payload)` (Electron renderer) for every significant action.

**Event Naming Convention:**
```
<tier>:<action>-<phase>
```
Examples: `ui:report-bug-submit`, `ipc:dispatch`, `cep:resolution`, `mcp:tool-call`

**Valid tiers:** `ui`, `ipc`, `cep`, `mcp`, `diagnostic`

---

## 2. Correlation IDs — Tie Every Transaction Together

Every user-initiated action MUST generate a unique `correlationId` (UUID v4) at the UI boundary and thread it through ALL layers:

```
Renderer (ui:*) → Main (ipc:*) → CEP ExtendScript (cep:*) → Resolution (cep:resolution)
```

- Generate: `const cid = crypto.randomUUID()` or the `getCid()` utility in `renderer/app.js`.
- Pass it as an argument on every `sendLog` / `freeXanLog` call that is part of the same transaction.

---

## 3. IPC Timing — Wrap All IPC Calls

All `ipcMain.handle(...)` registrations MUST be wrapped with the timing helper pattern (see `main.js` — `timedHandle` wrapper) to automatically log `ipc:call` and `ipc:resolve` with `durationMs`.

---

## 4. Error Boundary — CEP & React

- All CEP `evalScript` calls must be wrapped in `try/catch`; failures log `cep:error`.
- All React tab components must be wrapped in `<ErrorBoundary>` (see `src/shell/ErrorBoundary.tsx`).

---

## 5. PII Scrubbing — Never Log Raw Paths

If any log payload could contain a file path, scrub it with:
```js
value.replace(/[a-zA-Z]:[\\/]Users[\\/][^\\/\s"']+/gi, 'C:\\Users\\[USER_PATH]')
     .replace(/\/[hH]ome\/[^/\s"']+/gi, '/home/[USER_PATH]')
     .replace(/\/Users\/[^/\s"']+/gi, '/Users/[USER_PATH]')
```

---

## 6. Slow Execution — Warn on Anything Over 8 Seconds

If a tool, handler, or ExtendScript call takes more than **8000 ms**, emit a WARN:
```js
sendLog('warn', 'mcp:tool-slow-execution', source, correlationId, { durationMs });
```

---

## 7. Diagnostic Zip — Use the Bundler

When testing or fixing diagnostic-related issues, export a zip using:
```js
await window.api.exportDiagnostics(); // Opens Explorer to the zip
```
or the **Report Bug** button in the Electron UI.

---

## Reference Files

| File | Role |
|------|------|
| `logger.js` | `sendLog`, `getSystemContext`, `getLogsDir` |
| `httpApi.js` | MCP bridge telemetry (SHA-256 hashing, slow WARN) |
| `main.js` | `send-bug-report`, `export-diagnostics` IPC handles |
| `renderer/app.js` | UI `getCid()`, `freeXanLog`, modal instrumentation |
| `CEPs/freeXan_Caption/panel-src/src/hooks/useFreeXanWs.ts` | WS safe teardown pattern |
| `CEPs/freeXan_Caption/panel-src/src/shell/ErrorBoundary.tsx` | Per-tab React fault isolation |
