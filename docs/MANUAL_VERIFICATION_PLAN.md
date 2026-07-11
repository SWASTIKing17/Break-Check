# Manual Verification Plan — Phase 4 + Nomenclature (v3.6.0)

**Purpose:** Verify the full multi-layer freeXan API end-to-end after the Phase 4 release. Each step has a clear **what to do** and **what success looks like**. Run them in order — later steps depend on earlier ones passing.

**Total time estimate:** ~20 minutes if everything passes the first try.

---

## Pre-Flight (Required Before Starting)

You need ALL of these set up before Section 1:

| Check | How |
|---|---|
| ☐ freeXan running with v3.6.0 | Quit + restart freeXan (system tray → Quit, then `npm start`). The terminal should log `freeXan API door listening on http://127.0.0.1:4555`. Version check: `curl http://127.0.0.1:4555/health` → `{"ok":true,"port":4555,"appVersion":"3.6.0"}`. |
| ☐ Premiere Pro open with an empty active sequence | Tracks V1 / V2 should be free (caption clips will land there). |
| ☐ freeXan Link panel open in Premiere | `Window → Extensions → freeXan Link`. |
| ☐ MisterBloomX panel open in Premiere | `Window → Extensions → MisterBloomX`. |
| ☐ freeXan Caption panel open in Premiere | `Window → Extensions → freeXan Caption`. |
| ☐ A `.mogrt` template path you know works | E.g. `D:\Swastik\Assets\MOGRT\Final Mister BloomX Library\WBW Mogrt\Simple Background MOGRT.mogrt` — the one we tested with in Phase 3. |
| ☐ A Hinglish word-by-word SRT file | E.g. `D:\Swastik 2026\June2026\24 June\Aditya kundli - Smart kundli report - Ai Reel - 01\Hindi.srt` — same one from Phase 3. |

---

## Section 1 — HTTP Door Sanity (1 minute)

### 1.1 Health check
```
curl http://127.0.0.1:4555/health
```
**Pass:** `{"ok":true,"port":4555,"appVersion":"3.6.0"}` — note `3.6.0`, not `3.5.x`.
**Fail:** any other appVersion → restart freeXan; you're running an old build.

### 1.2 Status with connected plugins
```
curl http://127.0.0.1:4555/status
```
**Pass:** JSON includes `"connectedPlugins":["link","bloomx","caption"]` (order may differ).
**Fail:** any plugin missing → open its panel in Premiere and re-run.

---

## Section 2 — Plugin Bridge (3 minutes)

### 2.1 Caption plugin ping (the most-thorough live check)
PowerShell:
```
curl -X POST http://127.0.0.1:4555/plugin-action ^
     -H "Content-Type: application/json" ^
     -d "{\"plugin\":\"caption\",\"action\":\"caption_ping\"}"
```
**Pass:** `{"success":true,"result":{"pluginConnected":true,"jsxLoaded":true,"supportedActions":["caption_generate","caption_ping"]}}`. Critical: `supportedActions` must list `caption_generate` (renamed name), NOT `caption_create` (old name).
**Fail (jsxLoaded=false):** Caption panel didn't pick up the rebuilt JSX. Restart Premiere.
**Fail (supportedActions has caption_create):** Caption panel didn't pick up the rebuilt bundle. Restart Premiere.

### 2.2 Unknown plugin (should fail cleanly)
```
curl -X POST http://127.0.0.1:4555/plugin-action ^
     -H "Content-Type: application/json" ^
     -d "{\"plugin\":\"ghost\",\"action\":\"foo\"}"
```
**Pass:** HTTP 503 with `{"error":"Plugin \"ghost\" is not connected. ..."}`.

---

## Section 3 — CLI Verification (3 minutes)

### 3.1 CLI version
```
freexan --version
```
**Pass:** `freexan-cli 0.2.0`.

### 3.2 Help text shows caption commands
```
freexan --help
```
**Pass:** under `Commands (caption plugin):` you see `caption ping` and `caption generate`.

### 3.3 App-scope commands (sanity — unchanged from previous version)
```
freexan status
freexan clients
freexan templates
```
**Pass:** each runs cleanly. `status` shows v3.6.0; `clients` and `templates` list real data.

### 3.4 Caption ping via CLI
```
freexan caption ping
```
**Pass:** Output shows `Panel connected: yes`, `JSX loaded: yes`, `Supported actions: caption_generate, caption_ping`.

### 3.5 Caption generate via CLI (end-to-end real test)
```
freexan caption generate "D:/Swastik 2026/June2026/24 June/Aditya kundli - Smart kundli report - Ai Reel - 01/Hindi.srt" --mogrt "D:/Swastik/Assets/MOGRT/Final Mister BloomX Library/WBW Mogrt/Simple Background MOGRT.mogrt"
```
**Pass:** Captions appear on the Premiere timeline. CLI output:
```
✓ Captions generated
  Words rendered:        66
  Phrases:               6
  Tracks:                V2 / V3
  MOGRT mode:            freexan
  Failures:              0
```
**Fail (no captions on timeline):** check the Caption panel is open AND Premiere has an active sequence with empty V2/V3.
**Fail (CLI hangs):** the action took longer than 180 s. Look at the freeXan terminal for `[Plugin Bridge]` log lines.

---

## Section 4 — MCP Verification with Claude Code (10 minutes)

### 4.1 Restart Claude Code
**Important:** the new MCP tool list (8 tools) only loads at session start. Close every Claude Code window, then open a fresh session **in this project folder** (the MCP server was registered with project scope).

### 4.2 Check the MCP server connection
In the new Claude Code session, type:
```
/mcp
```
**Pass:** `freexan` appears in the list as `connected` with **8 tools** (was 6 before Phase 4). Expand it — you should see:
- `freexan_app_status`
- `freexan_app_list_clients`
- `freexan_app_list_templates`
- `freexan_app_create_project`
- `freexan_app_open`
- `freexan_link_import_files`
- `freexan_caption_ping`
- `freexan_caption_generate`

**Fail (only 6 tools, no `freexan_caption_*`):** Claude Code didn't restart cleanly. Close ALL Claude Code processes via Task Manager, then reopen.

### 4.3 Safe read-only — `freexan_app_status`
Ask Claude:
> *"Use freeXan to check the app status."*

**Pass:** Claude calls `freexan_app_status` and reports running=yes, version=3.6.0, connected plugins, active project name. **No confirmation prompt** (it's a safe tool).

### 4.4 List clients
Ask Claude:
> *"List my saved clients in freeXan."*

**Pass:** Claude calls `freexan_app_list_clients` and renders the list.

### 4.5 List templates
Ask Claude:
> *"What folder templates do I have?"*

**Pass:** Claude calls `freexan_app_list_templates`. The Default ★ template appears.

### 4.6 Caption plugin health
Ask Claude:
> *"Ping the freeXan caption plugin."*

**Pass:** Claude calls `freexan_caption_ping` and reports `jsxLoaded: true`, `supportedActions: [...]`. No confirmation prompt.

### 4.7 The big one — Claude generates captions end-to-end
Ask Claude:
> *"Use freeXan to generate captions on the timeline. The SRT file is at `D:/Swastik 2026/June2026/24 June/Aditya kundli - Smart kundli report - Ai Reel - 01/Hindi.srt`. Use the MOGRT at `D:/Swastik/Assets/MOGRT/Final Mister BloomX Library/WBW Mogrt/Simple Background MOGRT.mogrt`."*

**Pass:**
1. Claude **asks you to confirm** before calling (because the tool description says so). Look for something like *"I'll create caption clips on the timeline using ... — confirm?"*
2. After you confirm, Claude calls `freexan_caption_generate`.
3. Within ~10–30 seconds, captions appear in Premiere on alternating V2/V3 tracks.
4. Claude reports a summary: *"Captions generated successfully. Words rendered: 66. Phrases: 6. ..."*

**Fail (no confirmation):** Claude is too aggressive. The tool description tells it to confirm — this is a Claude-side behavior issue, not a freeXan bug. Ask "confirm before destructive actions" if it happens again.
**Fail (timeline empty after Claude reports success):** the JSX path returned success but Premiere didn't actually place clips. Check the Caption panel's CEP DevTools console for errors.
**Fail (Claude says tool errored):** copy the error text back to me — most likely an invalid path or a closed Caption panel.

### 4.8 Optional — destructive workflow Claude should refuse without confirmation
Ask Claude:
> *"Create a new project called 'Test'."*

**Pass:** Claude **does NOT immediately call `freexan_app_create_project`**. Instead it asks for the client, funnel, etc., or asks for confirmation that you really want to create a real project. Confirming Claude respects the destructive-tool convention.

---

## Section 5 — Spot Checks (optional, 2 minutes)

### 5.1 `freexan_link_import_files` (skip if you don't want to touch Premiere)
Pick any small `.mp4` or `.png` you don't mind landing in your active project. Ask Claude:
> *"Import this file into freeXan: `D:/path/to/test.png`"*

**Pass:** Claude asks to confirm. After confirmation, file copies into the project folder + appears in a Premiere bin.

### 5.2 Old tool names should NOT exist
In the Claude Code session, ask:
> *"Do you have a tool called freexan_status?"*

**Pass:** Claude says no — only `freexan_app_status` exists. (Old name is gone.)

---

## After All Sections Pass

You've verified:
- ✅ HTTP API door alive on v3.6.0
- ✅ All 3 CEP plugins register in `connectedPlugins`
- ✅ Caption plugin's `plugin_action` handler dispatches `caption_generate` and `caption_ping` correctly
- ✅ CLI has working `caption ping` and `caption generate` subcommands
- ✅ MCP exposes 8 tools with new nomenclature
- ✅ Claude can ping, list, AND generate captions end-to-end via natural language
- ✅ Destructive tools prompt for confirmation

**The multi-phase plugin-MCP plan is now COMPLETE.** Any future plugin action follows the pattern:
1. Declare canonical ID (`{scope}.{verb}[_{object}]`)
2. Write JSX entry function (if Premiere-side work)
3. Add handler in plugin's `*McpHandlers.ts` (rebuild panel)
4. Add MCP tool in `mcp/server.js` (restart Claude Code)

---

## If Something Fails

Paste the failing step number + the actual output back to me. Most likely failure modes:

| Symptom | Likely cause |
|---|---|
| `appVersion: 3.5.x` in step 1.1 | freeXan still running old code — restart it |
| `connectedPlugins: []` in step 1.2 | No CEP panels open in Premiere |
| `supportedActions` has `caption_create` (old name) | Caption panel running old bundle — restart Premiere |
| `freexan` command not found | CLI not installed — run `npm link` inside `cli/` |
| `/mcp` only shows 6 tools | Claude Code didn't restart cleanly — kill all processes |
| Claude calls destructive tool without confirming | Claude-side judgment issue, not a bug — say "always confirm before destructive freeXan actions" |
| Caption generate completes but no clips appear | JSX returned success but Premiere skipped the clip placement — check CEP DevTools console |

---

*Plan version: 1.0 | Created: 2026-06-25 | For freeXan v3.6.0*
