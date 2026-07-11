---
name: ppro-plugin
description: >
  Write, scaffold, and debug Adobe Premiere Pro plugin code — covering both the modern UXP
  extensibility platform and legacy CEP/ExtendScript. Use this skill whenever the user asks to:
  build a Premiere Pro plugin or panel, write ExtendScript or UXP code that controls Premiere,
  communicate between a plugin's UI (frontend) and Premiere's DOM (backend), work with sequences,
  tracks, clips, markers, project items, metadata, or the encoder, scaffold manifest.json or plugin
  entry points, migrate a CEP extension to UXP, or debug evalScript / async API issues. Trigger on
  any mention of: ppro, Premiere Pro plugin, CEP extension, ExtendScript, UXP plugin, evalScript,
  manifest.json, app.project, app.sequence, timeline automation, or "Premiere scripting".
---

# Premiere Pro Plugin Skill

> **Platform status (April 2026)**
> - **UXP** — current standard (Premiere 25.6+, Nov 2025 GA). All new plugins should use UXP.
> - **CEP + ExtendScript** — still works, officially supported until **September 2026**.
> - **QE DOM** — unofficial extended API; access with `app.enableQE()` (ExtendScript only).

---

## 1 — Choosing Your Stack

| Concern | UXP (new) | CEP + ExtendScript (legacy) |
|---|---|---|
| Framework | Unified JS — one environment | Split: JS frontend + `.jsx` backend |
| API calls | `async / await` (non-blocking) | Synchronous (blocks Premiere UI) |
| Frontend ↔ Premiere | Direct `require('premierepro')` | `csInterface.evalScript(script, cb)` |
| Dev tool | UXP Developer Tools (UDT) | CSXS / PlayerDebugMode registry key |
| Distribution | Adobe Marketplace + CC Desktop | ZXP / manual CSXS install |
| Hybrid C++ | Supported (future) | Not available |

**Default to UXP** unless the user has an existing CEP panel or needs an API not yet in UXP.

---

## 2 — UXP Plugin Structure

```
my-plugin/
├── manifest.json        ← plugin identity, permissions, entrypoints
├── index.html           ← panel UI (HTML + CSS)
└── index.js             ← all logic; imports Premiere DOM and UXP APIs
```

### manifest.json skeleton
```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "host": { "app": "PPRO", "minVersion": "25.6" },
  "entrypoints": [
    {
      "type": "panel",
      "id": "mainPanel",
      "label": { "default": "My Panel" },
      "main": "index.html"
    }
  ],
  "requiredPermissions": {
    "network": { "domains": ["https://example.com"] },
    "localFileSystem": "plugin"
  }
}
```

### Accessing the Premiere DOM in UXP
```js
// index.js — runs inside UXP's unified JS environment
const ppro = require('premierepro');

async function getActiveSequenceName() {
  const app = await ppro.app;
  const project = await app.getActiveProject();
  const sequence = await project.getActiveSequence();
  return sequence?.name ?? 'No active sequence';
}
```

> ⚠️ **All UXP Premiere API calls are async.** Always `await` them; forgetting this is the #1 bug.

---

## 3 — CEP + ExtendScript Plugin Structure

```
com.example.panel/
├── CSXS/
│   └── manifest.xml          ← extension identity & host requirements
├── index.html                ← panel UI (runs in Chromium/Node.js)
├── js/
│   └── main.js               ← frontend JS; uses CSInterface
└── jsx/
    └── hostscript.jsx        ← ExtendScript; has direct access to `app`
```

### Frontend → Backend call pattern (CEP)
```js
// main.js (frontend)
const csInterface = new CSInterface();

function getProjectName() {
  csInterface.evalScript('app.project.name', (result) => {
    console.log('Project:', result);
    document.getElementById('output').textContent = result;
  });
}

// Passing data TO ExtendScript — stringify args into the eval string
function renameSequence(newName) {
  const escaped = newName.replace(/'/g, "\\'");
  csInterface.evalScript(
    `app.project.activeSequence.name = '${escaped}'; 'done';`,
    (result) => console.log(result)
  );
}

// Passing data FROM ExtendScript — use JSON.stringify in the .jsx
function getSequenceInfo() {
  csInterface.evalScript(
    `JSON.stringify({
      name: app.project.activeSequence.name,
      duration: app.project.activeSequence.end
    })`,
    (jsonStr) => {
      const info = JSON.parse(jsonStr);
      console.log(info);
    }
  );
}
```

```jsx
// hostscript.jsx (ExtendScript — ES3 syntax!)
// This is the "backend" that runs inside Premiere Pro's engine
function getClipCount() {
  var seq = app.project.activeSequence;
  if (!seq) return '0';
  var count = 0;
  for (var t = 0; t < seq.videoTracks.numTracks; t++) {
    count += seq.videoTracks[t].clips.numItems;
  }
  return String(count);
}
```

> ⚠️ **ExtendScript is ES3.** No arrow functions, no `const/let`, no template literals, no Promises.  
> ⚠️ **evalScript is always async** on the frontend side; use callbacks or wrap in Promises.

---

## 4 — Key Premiere Pro API Objects

Read the appropriate reference file for full method/property lists:

| Object | Access | Reference |
|---|---|---|
| `Application` | `app` (ExtendScript) / `ppro.app` (UXP) | `references/api-objects.md` |
| `Project` | `app.project` | `references/api-objects.md` |
| `Sequence` | `app.project.activeSequence` | `references/api-objects.md` |
| `Track` | `sequence.videoTracks[i]` / `audioTracks[i]` | `references/api-objects.md` |
| `TrackItem` (clip) | `track.clips[i]` | `references/api-objects.md` |
| `ProjectItem` | `app.project.rootItem.children[i]` | `references/api-objects.md` |
| `Marker` | `sequence.markers` | `references/api-objects.md` |
| `Encoder` | `app.encoder` | `references/api-objects.md` |
| `QE DOM` | `app.enableQE(); app.getProjectViewIDs()` | `references/api-objects.md` |

→ **Load `references/api-objects.md` when writing code that touches any of the above.**

---

## 5 — Frontend ↔ Backend Communication Patterns

### UXP — direct (no bridge needed)
Since UXP uses a single JS runtime, there is **no separate "backend"**. Your panel's `index.js` directly imports and calls Premiere APIs. State can be shared via regular JS variables or modules.

```js
// Pattern: UI button triggers Premiere action directly
document.getElementById('btn').addEventListener('click', async () => {
  const ppro = require('premierepro');
  const app = await ppro.app;
  const project = await app.getActiveProject();
  const seq = await project.getActiveSequence();
  // Modify the sequence directly
  await seq.setInPoint(ppro.TickTime.fromSeconds(0));
});
```

### CEP — bridge via `evalScript`

```
[HTML Panel]  →  csInterface.evalScript(script, callback)  →  [ExtendScript .jsx]
                                                            ←  return value (String)
```

**Rules for the bridge:**
1. The bridge can only transport **strings**. Always use `JSON.stringify` / `JSON.parse`.
2. ExtendScript errors surface as the string `"EvalScript Error"` — wrap your `.jsx` in try/catch and return error details.
3. Never eval user-supplied strings directly — build safe script strings server-side.
4. For complex bidirectional flows, use `app.setSDKEventMessage()` in ExtendScript and `addEventListener("com.adobe.csxs.events.ApplicationStatusChanged", ...)` in CEP for push notifications.

```jsx
// jsx: safe wrapper pattern
function safeCall(fn) {
  try {
    return JSON.stringify({ ok: true, data: fn() });
  } catch (e) {
    return JSON.stringify({ ok: false, error: e.message });
  }
}

function getActiveSequenceInfo() {
  return safeCall(function() {
    var seq = app.project.activeSequence;
    if (!seq) throw new Error('No active sequence');
    return { name: seq.name, frameRate: seq.timebase };
  });
}
```

```js
// frontend: unwrap safely
csInterface.evalScript('getActiveSequenceInfo()', (result) => {
  const { ok, data, error } = JSON.parse(result);
  if (!ok) return showError(error);
  renderSequenceInfo(data);
});
```

### CEP — push events (Premiere → Panel)
```jsx
// jsx: fire an event toward the panel
var xEvent = new CSXSEvent();
xEvent.type = 'com.example.myplugin.sequenceChanged';
xEvent.data = JSON.stringify({ seqName: app.project.activeSequence.name });
xEvent.dispatch();
```
```js
// main.js: listen for it
csInterface.addEventListener('com.example.myplugin.sequenceChanged', (event) => {
  const payload = JSON.parse(event.data);
  console.log('Sequence changed to:', payload.seqName);
});
```

---

## 6 — Development Workflow

### UXP
1. Install [UXP Developer Tools (UDT)](https://www.adobe.com/go/uxp-developer-tools)
2. `Add Plugin` → point to `manifest.json`
3. `Load & Watch` — auto-reloads on file save
4. Console output appears in UDT
5. **Reload manifest changes manually** (unload → reload)

### CEP
1. Set registry key: `HKEY_CURRENT_USER\SOFTWARE\Adobe\CSXS.X` → `PlayerDebugMode = 1`
2. Copy extension folder to `~/AppData/Roaming/Adobe/CEP/extensions` (Win) or `~/Library/Application Support/Adobe/CEP/extensions` (Mac)
3. Use VSCode with the [ExtendScript Debug extension](https://marketplace.visualstudio.com/items?itemName=Adobe.extendscript-debug)
4. Check `Window → Extensions → [your panel]` in Premiere

---

## 7 — Common Patterns & Gotchas

**Time values in ExtendScript** use `Time` objects — never raw frame numbers:
```jsx
var t = new Time();
t.seconds = 10.5;
app.project.activeSequence.setPlayerPosition(t.ticks);
```

**Time in UXP** — use `ppro.TickTime`:
```js
const t = ppro.TickTime.fromSeconds(10.5);
```

**Iterating collections** in ExtendScript (not true arrays):
```jsx
for (var i = 0; i < seq.videoTracks.numTracks; i++) {
  var track = seq.videoTracks[i];
  for (var j = 0; j < track.clips.numItems; j++) {
    var clip = track.clips[j];
  }
}
```

**QE DOM** (unofficial, ExtendScript only — more power, less stability):
```jsx
app.enableQE();
var qeSeq = qe.project.getActiveSequence();
qeSeq.renderAll(); // not in the official API
```

---

## Reference Files

- **`references/api-objects.md`** — Full property/method tables for all major Premiere objects (App, Project, Sequence, Track, TrackItem, ProjectItem, Marker, Encoder). Load when writing any API-touching code.
- **`references/uxp-manifest.md`** — Manifest schema, all permission types, entrypoint types (panel/command/modal), hostUIContext. Load when scaffolding or configuring a UXP plugin.
