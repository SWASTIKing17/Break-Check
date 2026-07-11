# Electron Agent Brief — freeXan WebSocket Handler

## Context
freeXan is an Electron desktop app that runs a WebSocket server on port 4554.
The SubMachine CEP panel connects to this server to discover the active Premiere Pro project path,
which it uses to locate exported SRT files without the user having to browse manually.

The WebSocket server lives in `main.js` inside freeXan. It already tracks:
- `activeProjectPath` — full path to the active `.prproj` (pushed by the CEP panel via `active_project` message)
- `nativeProjectPath` — fallback, detected from the Premiere window title

## What needs to be added

A single new message handler in the existing `ws.on('message', ...)` block.

### Request (SubMachine → freeXan)
```json
{ "type": "get_project_state" }
```

### Response (freeXan → SubMachine)
```json
{
  "type": "project_state",
  "projectPath": "C:\\Projects\\ClientName\\project.prproj",
  "connected": true
}
```

`projectPath` should be `activeProjectPath || nativeProjectPath || null`.
`connected` is `true` when a valid path is known, `false` otherwise.

## Exact code change

In the `ws.on('message', ...)` handler inside `main.js`, add this case alongside the existing ones:

```js
if (msg.type === 'get_project_state') {
  const knownPath = activeProjectPath || nativeProjectPath || null;
  ws.send(JSON.stringify({
    type: 'project_state',
    projectPath: knownPath,
    connected: !!knownPath
  }));
  return;
}
```

That is the entire change. No new dependencies, no new files.

## Where to put it

Find the block that looks like:

```js
ws.on('message', (data) => {
  let msg;
  try { msg = JSON.parse(data); } catch (e) { return; }

  if (msg.type === 'active_project') {
    activeProjectPath = msg.path;
    // ...
  }
  // ... other handlers
});
```

Add the `get_project_state` case inside that block.

## Notes
- The handler is request/response — SubMachine sends the request once on WebSocket open.
- `activeProjectPath` is only populated after the CEP panel has connected and sent its first
  `active_project` message. If SubMachine connects before Premiere, `projectPath` will be `null`
  and SubMachine will fall back to a manual browse button — this is handled gracefully.
- No authentication is needed; the server already accepts connections from any local client.

---

## Bug Fix Log

### 2026-06-22 — MOGRT Detection + WS Reconnect Fix

**Bugs Fixed:**
- **Edit Tab empty ("No Phrases Detected"):** `clip.isMGT()` in `getTimelinePhraseMap` lacked a try-catch; wrapping it prevents a throw from aborting the full timeline scan.
- **Params "DBG: no clips: null" / Sync All failing / Render failing:** A new triple `isMogrt` guard added to `getMogrtDumpForActiveClip` (isMGT + getMGTComponent + `.aegraphic` path check) failed silently for embedded MOGRTs — all three checks returned false, skipping every clip. Reverted to original `if (!c.isMGT()) continue;` from working backup.
- **OFFLINE lingers after Electron starts:** WS auto-reconnect timer reduced from 4000ms → 1000ms.

**Files changed:**
- `panel/jsx/core/sync.jsx` (2 fixes — no rebuild needed)
- `panel-src/src/hooks/useFreeXanWs.ts` + `panel/dist/freexan-caption.js` (rebuilt)