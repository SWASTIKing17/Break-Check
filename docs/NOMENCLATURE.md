# NOMENCLATURE — freeXan API Naming Standard

**Established:** 2026-06-25 (v3.5.5)
**Status:** Authoritative. All new actions added across the freeXan stack MUST follow this standard.

---

## Why This Exists

freeXan has six API layers — HTTP routes, WebSocket message types, plugin actions, CLI commands, MCP tools, JSX functions. Without a shared naming standard, the same operation ends up with six different names that don't predict each other (e.g. `create_caption` in the CLI but `freexan_captions_make` in MCP and `runCapWf` in JSX). This file fixes that.

**Goal:** if you know an action's canonical ID, you can derive its name in every layer without looking it up.

---

## The Canonical Action ID

Every freeXan operation has ONE canonical ID:

```
{scope}.{verb}[_{object}]
```

- **`scope`** — which part of the stack owns the action
- **`verb`** — what's being done (from the controlled vocabulary below)
- **`object`** — what's being acted on (optional, used when the verb alone is ambiguous)

### Scope Rule (Critical — User Decision)

> **OS-level access = `app` scope. Premiere-only work = `link` scope. Plugin-internal work = `{plugin-name}` scope.**

| Scope | Owns | Examples |
|---|---|---|
| `app` | OS-level: filesystem, databases, opening apps, browser image downloads, config | `app.list_clients`, `app.create_project`, `app.open` |
| `link` | Premiere-only: bin creation, sequence creation, file imports into the active project | `link.import_files`, `link.create_sequence` |
| `caption` | freeXan Caption plugin (MOGRT captions, SRT processing) | `caption.generate`, `caption.replace_style` |
| `bloomx` | MisterBloomX plugin (MOGRT library browser) | `bloomx.list_mogrts`, `bloomx.insert_mogrt` |
| `audio` | freeXan Audio plugin (audio library) | `audio.search`, `audio.insert_track` |

**Rule of thumb when you can't decide:** if the action would fail without Premiere running, it's `link` or a plugin scope. If it works headless (or only needs the freeXan app), it's `app`.

---

## Controlled Verb Vocabulary

Use ONLY these verbs. Don't invent new ones — pick the closest match.

| Verb | Meaning | Returns |
|---|---|---|
| `status` | Snapshot of state | One object |
| `ping` | Health check (read-only) | Liveness info |
| `list` | Enumerate | Array |
| `get` | Fetch one by ID/name | One object |
| `search` | Query with filter | Array |
| `create` | New main-app resource (DB-backed, OS-level) | The created object |
| `generate` | Produce content output (captions, exports, etc.) | Summary of what was produced |
| `insert` | Place into Premiere timeline | Reference to placed item |
| `replace` | Swap existing element | The new state |
| `update` | Modify fields of existing resource | The updated object |
| `delete` | Remove | Success/failure |
| `set` | Change selection / config value | The new value |
| `open` | OS shell open (Explorer / Premiere) | Success/failure |

**Why these specific verbs?** They map cleanly to HTTP methods, Claude's natural language patterns, and editor mental models. Adding a new verb requires updating this file first.

---

## Per-Layer Naming Patterns

Every canonical action ID `scope.verb[_object]` derives its name in each layer:

| Layer | Pattern | Example for `caption.generate` |
|---|---|---|
| **Canonical ID** | `{scope}.{verb}[_{object}]` | `caption.generate` |
| **HTTP** | `POST /plugin-action {plugin, action}` (payload-based; one route handles all) | `{ plugin:"caption", action:"generate" }` |
| **WebSocket** | `{ type:"plugin_action", plugin, action, args, requestId }` | same payload |
| **MCP tool** (`mcp/server.js`) | `freexan_{scope}_{verb}[_{object}]` (snake_case throughout) | `freexan_caption_generate` |
| **CLI** (`cli/freexan.js`) — plugin scope | `freexan {scope} {verb} [args]` (subcommand style) | `freexan caption generate <srt>` |
| **CLI** — `app` scope only | `freexan {verb} [args]` (flat short form — `app` is implicit) | `freexan status`, `freexan new`, `freexan open` |
| **JSX action entry** (`mogrt.jsx`, etc.) | `run{Scope}{Verb}` (PascalCase) | `runCaptionGenerate` |
| **JSX primitive** (helpers, building blocks) | `{verb}{Object}` camelCase | `getData`, `createCaptions` |
| **JSX private helper** | `_{verb}{Object}` (underscore prefix) | `_findAllTextParams`, `_detectCapabilities` |

### Why CLI is "flat" for `app` scope but not for plugins

The CLI is for human typing. `freexan status` reads better than `freexan app status`. Since `app` is the default scope (no Premiere needed), we drop the prefix. Plugin scopes ALWAYS require the explicit name because the action wouldn't make sense otherwise — `freexan generate` could mean caption.generate OR audio.generate; `freexan caption generate` is unambiguous.

### Why MCP always uses the full scope

MCP tools live in a global namespace inside Claude. `freexan_status` is fine; `freexan_caption_status` is required because we'd want both. The full prefix avoids collisions and gives Claude semantic context about what the tool touches.

---

## Reserved / Deprecated Prefixes

| Prefix | Status | Migration |
|---|---|---|
| `sm_*` (public JSX functions) | **Deprecated** — SubMachine legacy from before the freeXan Caption rebrand. To be renamed in a dedicated sweep. | New code MUST NOT use this prefix. |
| `_sm*` (private JSX helpers) | **Removed (v3.5.5)** — all internal helpers in `mogrt.jsx` have been renamed to drop the `sm` qualifier. | n/a (gone) |
| `runCaptionWorkflow` (JSX entry) | **Renamed (v3.5.5)** | Now `runCaptionGenerate`. |
| `caption_create` (plugin action) | **Renamed (v3.5.5)** | Now `caption_generate`. The verb `create` is reserved for DB-backed `app` resources; `generate` is correct for produced content. |

---

## Current Registry (Audited 2026-06-25)

### `app` scope

| Canonical ID | MCP tool name | Status |
|---|---|---|
| `app.status` | `freexan_app_status` | ✅ live (v3.6.0) |
| `app.list_clients` | `freexan_app_list_clients` | ✅ live (v3.6.0) |
| `app.list_templates` | `freexan_app_list_templates` | ✅ live (v3.6.0) |
| `app.create_project` | `freexan_app_create_project` | ✅ live (v3.6.0) |
| `app.open` | `freexan_app_open` | ✅ live (v3.6.0) |

### `link` scope

| Canonical ID | MCP tool name | Status |
|---|---|---|
| `link.import_files` | `freexan_link_import_files` | ✅ live (v3.6.0) |

### `caption` scope

| Canonical ID | MCP tool name | JSX entry | Status |
|---|---|---|---|
| `caption.generate` | `freexan_caption_generate` | `runCaptionGenerate` | ✅ live (v3.6.0) |
| `caption.ping` | `freexan_caption_ping` | n/a (JS-only) | ✅ live (v3.6.0) |

---

## Adding a New Action — The Checklist

1. **Pick the scope.** Apply the "OS-level vs Premiere-only" rule.
2. **Pick the verb** from the controlled list. If nothing fits, this file gets updated first.
3. **Pick the object** if the verb alone is ambiguous.
4. **Derive the names** for every layer using the patterns above.
5. **Implement bottom-up:** JSX primitive (if needed) → JSX action entry → plugin handler → MCP tool → CLI command.
6. **Update this file's "Current Registry" section.**

---

*Last updated: 2026-06-25 | v3.6.0*
