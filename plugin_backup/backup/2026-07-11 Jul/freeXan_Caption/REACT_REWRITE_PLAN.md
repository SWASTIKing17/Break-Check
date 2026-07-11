# freeXan Caption — React Rewrite Implementation Plan

**Status:** Draft for review. **Do not start coding until the user signs off on Section 8 (Open decisions).**
**Target version:** freeXan Caption `1.1.0` (rewrite ships as the next minor after the rebrand).
**Scope:** Replace the current `panel.html` 8-tab UI (3,159 lines, mixed jQuery/vanilla JS + two React islands) with a **single unified React 18 application**, retaining only 4 of the 8 tabs.

---

## 1 · Current state (what we're replacing)

`panel/panel.html` mounts an 8-tab layout via CSS radio-toggle:

| # | Tab id | Label | Implementation today | Decision |
|---|--------|-------|----------------------|----------|
| 1 | `tab-1` | Workflow | Hand-authored HTML stepper, jQuery-driven (`workflow.js`, `workflow_refactor.js`) | **KEEP** — port to React |
| 2 | `tab-ai` | AI | `ai_translate.js` (Hindi→Hinglish translation calls) | **REMOVE** |
| 3 | `tab-edit` | Edit | Already React (`command_center_react.js`, 1,791 lines) mounted on `#react-edit-root` | **KEEP** — already React, migrate into shell |
| 4 | `tab-params` | Params | Already React (`mogrt_param_editor.js`, 860 lines) mounted on `#react-params-root` | **KEEP** — already React, migrate into shell |
| 5 | `tab-2` | Tools | Vanilla HTML buttons wired by `tools_refactor.js`, `phrasing.js`, `ui_manager.js` | **KEEP** — port to React |
| 6 | `tab-3` | Advanced Tools | Extra HTML block | **REMOVE** |
| 7 | `tab-4` | Login | Licensing UI | **REMOVE** (the about-dialog modal already handles this) |
| 8 | `tab-5` | Help | Hardcoded help HTML | **REMOVE** (Adobe's about-dialog "Support" tab covers this) |

**Final shell: 4 tabs (Workflow, Edit, Params, Tools), one React 18 app.**

**Existing React stack (in `panel.html`):**
- `react@18` + `react-dom@18` via UMD CDN
- `framer-motion@10.16.4` via UMD CDN
- `@babel/standalone` for runtime JSX transform (`type="text/babel"`)
- `sortablejs@1.14` (Edit-tab drag-merge)
- jQuery 2.0.2 + Font Awesome 5.15 + Bootstrap 5.0.2

CSS already on freeXan brand: `#121214 / #997DFF / #f3f3f5`, IBM Plex Sans + JetBrains Mono. The "mission-control terminal" aesthetic in `.wf-shell` is the visual foundation — extend it across all four tabs.

---

## 2 · Design direction

**Concept:** *Operator's console.* The user is a video editor running a caption pipeline — they need to see project state at a glance, jump between four discrete workspaces fast, and not be slowed down by chrome. Aesthetic stays "infrastructure terminal" (already established in `.wf-shell`):

- **Dominant black** (`#121214` → `#161618` → `#1f1f23` surface ramp), no rounded blobs, no card shadows. Hairline borders `rgba(255,255,255,0.06)`.
- **One accent — purple** `#997DFF`. Use for: active nav state, primary action, focus rings, the single graph element on screen. Not for borders, not for body text.
- **Typography:** IBM Plex Sans 400/500/600 for prose. JetBrains Mono 500 (uppercase, 0.18em tracking) for eyebrows, status labels, version chips. No system fonts, no Inter.
- **Spatial composition:** rigid 8-pt grid. Tab content lives inside a single `<main>` with 20px gutter. No nested scroll regions — the panel scrolls as one column.
- **Motion:** Framer Motion `LayoutGroup` + shared layout id for the active-tab indicator (slides between tabs). Page transitions = 180ms `easeOut` opacity+y(+4px). Status dots pulse at 1.4s. Nothing else animates by default.
- **Distinctive detail:** a persistent **status rail** down the left edge (4px wide) that shows live Premiere connection state via a vertical gradient — green when CEP is connected, amber when project is loaded but no clips selected, red when disconnected. Replaces the "wf-s1-dot" pattern currently scattered through Workflow.

**Layout:**

```
┌──────────────────────────────────────────────────┐
│ ▎ freeXan · Caption          v1.1.0   ● Connected │  ← App bar (40px)
├─┬────────────────────────────────────────────────┤
│s│ Workflow  Edit  Params  Tools  ◂─────────────  │  ← Tab strip (44px)
│t│                                                 │
│a│  ┌─────────────────────────────────────────┐   │
│t│  │                                          │   │
│u│  │   Active tab content                     │   │
│s│  │                                          │   │
│ │  └─────────────────────────────────────────┘   │
│r│                                                 │
│a│                                                 │
│i│                                                 │
│l│                                                 │
└─┴────────────────────────────────────────────────┘
```

App bar: brand mark (left), version chip (center), live connection pill (right).
Tab strip: 4 pill labels, framer-motion-shared underline marks the active one.
Status rail: 4px wide, full height. Click expands to a 240px-wide "session inspector" drawer (sequence FPS, selected clips count, last action).

---

## 3 · Technical approach

### 3a · Build system

**Switch from Babel-runtime to Vite.** Rationale:
- Current Babel-Standalone runtime transform reparses every script on every panel load — measurable lag on Premiere startup, plus it can't tree-shake.
- A built bundle drops the three CDN scripts (React + ReactDOM + framer-motion + Babel ≈ 1.4 MB over network) for one ~180 KB local file.
- TS support comes free; we get it in case we want to type the CSInterface boundary.
- Vite's `build.lib` mode is enough — we don't need an HTML entry, just an IIFE bundle that mounts itself.

**Setup:** `CEPs/freeXan_Caption/panel-src/` (new) → `vite build` → `CEPs/freeXan_Caption/panel/dist/freexan-caption.js` + `freexan-caption.css`. The existing `panel/` folder is the deployable artifact, untouched by Vite except for the `dist/` subfolder it owns.

**Alternative considered:** stay on Babel runtime. Faster to start but worse end-state. **Recommendation: Vite.** Flag this in Section 8.

### 3b · State

**Zustand** for cross-tab shared state. Three stores:

| Store | Owns | Persists? |
|-------|------|-----------|
| `useSessionStore` | Premiere connection, active project path, sequence info, selected clips | No — runtime only |
| `useWorkflowStore` | Current stage in the pipeline (1–6), SRT file path, MOGRT path, last action | LocalStorage (`freexan_caption_session_v1`) |
| `usePrefsStore` | UI prefs: pinned tab, expanded sections, color history | LocalStorage (`freexan_caption_prefs_v1`) |

CSInterface stays as a singleton service (`src/lib/csi.ts`) exposing typed methods (`evalScript<T>(jsx): Promise<T>`, `on(eventId, handler)`, `dispatch(eventId, payload)`). Components consume via custom hooks (`useJsx()`, `useCsxsEvent()`).

### 3c · Component map

```
panel-src/
├── src/
│   ├── main.tsx                 — mounts <App /> on #root
│   ├── App.tsx                  — shell: AppBar, StatusRail, TabStrip, <Outlet />
│   ├── shell/
│   │   ├── AppBar.tsx           — brand + version + connection pill
│   │   ├── StatusRail.tsx       — left edge, expandable drawer
│   │   ├── TabStrip.tsx         — framer-motion pill nav (4 items)
│   │   └── SessionInspector.tsx — drawer content
│   ├── tabs/
│   │   ├── workflow/
│   │   │   ├── WorkflowView.tsx          — stepper container
│   │   │   ├── WorkflowStep.tsx          — single stage card
│   │   │   ├── steps/
│   │   │   │   ├── Step1_ExportSRT.tsx
│   │   │   │   ├── Step2_LoadSRT.tsx
│   │   │   │   ├── Step3_PickMogrt.tsx
│   │   │   │   ├── Step4_GenerateCaptions.tsx
│   │   │   │   ├── Step5_SyncStyle.tsx
│   │   │   │   └── Step6_Finalize.tsx
│   │   │   └── stepRegistry.ts           — id ↔ component ↔ jsx-call map
│   │   ├── edit/
│   │   │   ├── EditView.tsx              — wraps existing command_center_react
│   │   │   ├── PhraseLane.tsx
│   │   │   ├── PhraseRow.tsx
│   │   │   ├── ColorPicker.tsx
│   │   │   └── (port from command_center_react.js, 1,791 lines)
│   │   ├── params/
│   │   │   ├── ParamsView.tsx            — wraps existing mogrt_param_editor
│   │   │   ├── ParamGroup.tsx
│   │   │   ├── ParamField.tsx
│   │   │   └── (port from mogrt_param_editor.js, 860 lines)
│   │   └── tools/
│   │       ├── ToolsView.tsx
│   │       ├── SyncAllButton.tsx
│   │       ├── SyncTextButton.tsx
│   │       ├── SyncStyleButton.tsx
│   │       ├── SyncPSRButton.tsx
│   │       ├── ResetGroup.tsx
│   │       ├── SplitJoinGroup.tsx
│   │       └── (port from tools_refactor.js, 527 lines)
│   ├── store/
│   │   ├── sessionStore.ts
│   │   ├── workflowStore.ts
│   │   └── prefsStore.ts
│   ├── lib/
│   │   ├── csi.ts               — CSInterface wrapper
│   │   ├── jsx.ts               — typed evalScript helpers
│   │   ├── events.ts            — CSXS event id constants (com.bloomx.freexan.caption.*)
│   │   └── format.ts            — small string/path helpers
│   ├── hooks/
│   │   ├── useJsx.ts            — promise-based evalScript wrapper
│   │   ├── useCsxsEvent.ts      — subscribe to a CSXS event with auto-cleanup
│   │   ├── usePremiereState.ts  — polls active project / selection
│   │   └── usePhraseLocks.ts
│   ├── styles/
│   │   ├── tokens.css           — CSS vars (--fx-bg, --fx-accent, etc.)
│   │   ├── reset.css
│   │   └── app.css              — shell layout
│   └── components/              — atoms shared by tabs
│       ├── Button.tsx
│       ├── Pill.tsx
│       ├── StatusDot.tsx
│       ├── SectionHeader.tsx
│       └── Modal.tsx
├── index.html                   — vite entry (dev only)
├── vite.config.ts
├── tsconfig.json
└── package.json                 — react, react-dom, zustand, framer-motion, vite, typescript
```

ExtendScript stays untouched in `panel/jsx/`. The React app calls into it via `useJsx()` → `csi.evalScript()`.

### 3d · Mounting into the CEP panel

`panel.html` shrinks to ~30 lines:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="dist/freexan-caption.css">
</head>
<body>
  <div id="root"></div>
  <script src="js/CSInterface.js"></script>
  <script src="dist/freexan-caption.js"></script>
</body>
</html>
```

Everything else in the current `panel.html` (Bootstrap, jQuery, Font Awesome, all the inline `<script>` blocks, all 8 tab blocks) is **deleted**.

### 3e · Files retired from `panel/js/`

After the cutover these JS files have no consumers and get deleted:

- `ai_translate.js` — AI tab gone
- `panel.js` (23,774 lines) — main panel runtime, replaced by React
- `panel_clean.js` — already orphaned
- `workflow.js`, `workflow_refactor.js` — logic ports into `tabs/workflow/`
- `tools_refactor.js` — logic ports into `tabs/tools/`
- `phrasing.js` — logic ports into hooks (`usePhraseLocks`, `usePhrasing`)
- `ui_manager.js` — DOM toggling, no longer needed
- `command_center_react.js`, `mogrt_param_editor.js` — content ports into React components, source files delete
- `mogrt_patcher.js`, `safe_eval.js` — review case by case; `mogrt_patcher` might move into `tabs/edit/`
- `premiere_simulator.js` + CSS — dev-only simulator, decide whether to keep behind a `?debug=1` flag

**Files kept** in `panel/js/`:
- `CSInterface.js` (Adobe-provided, loaded before React bundle)
- `libs/` (jszip etc., if React bundle still needs them — likely move into Vite deps instead)

### 3f · CSS / styling

- `styles/tokens.css` — extract every freeXan brand variable currently inlined in `.wf-shell`. Single source of truth.
- Keep plain CSS files (no Tailwind, no styled-components). CEP panels render in CEF which is fine with vanilla CSS Modules.
- `panel/panel.css`, `panel/command_center.css`, `panel/css/mogrt_param_editor.css`, `panel/css/premiere_simulator.css` — **all deleted** after the rewrite ships. Equivalent rules live in `styles/` + component-scoped CSS modules.

---

## 4 · Phased rollout (6 milestones)

Each milestone ends in a state where Premiere can load the panel without crashing — i.e. you can stop after any phase and still have a working plugin.

| # | Phase | What lands | Why this order |
|---|-------|-----------|----------------|
| **M1** | **Scaffold** | `panel-src/` Vite project, `dist/` builds, new minimal `panel.html` mounts an empty `<App />` showing "freeXan Caption" placeholder. Old `panel.html` renamed to `panel.legacy.html`. | Prove the build → CEP pipeline works before porting any logic. |
| **M2** | **Shell + StatusRail + TabStrip** | App bar, status rail, 4-tab strip, route system (no real content yet — each tab shows a stub). Live Premiere connection pill works via `usePremiereState`. | Get the chrome done so subsequent tabs slot in. |
| **M3** | **Tools tab** | Port `tools_refactor.js` (527 lines) to React components + `useJsx` calls. Smallest port → quick win to validate the pattern. | Smallest surface area; if the architecture is wrong, we find out cheap. |
| **M4** | **Workflow tab** | Port the stepper (currently the most polished part of the old panel — most styles transfer). 6 step components. | Medium complexity, high user-visible value. |
| **M5** | **Edit tab** | Port `command_center_react.js` (1,791 lines). Already React, but heavy refactor into our component structure + Zustand stores. | Largest port; do after the shell is stable. |
| **M6** | **Params tab + cleanup** | Port `mogrt_param_editor.js` (860 lines). Delete all retired JS files. Delete `panel.legacy.html`. Bump to v1.1.0. | Final port; cleanup ships together so users get one clean build. |

**Estimated effort:** M1–M2 ≈ 1 day; M3 ≈ 0.5 day; M4 ≈ 1.5 days; M5 ≈ 2 days; M6 ≈ 1 day. Total **~6 dev-days** if no rabbit holes. Add 30% buffer for CEP/Premiere quirks → **~8 days**.

---

## 5 · Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| CEF version in Premiere is too old for Vite's default ES2020 output | **Medium** | Set `build.target: 'chrome80'` in `vite.config.ts`. Test in oldest supported Premiere (24.x = CEP 12). |
| `command_center_react.js` (1,791 lines) hides side effects the React port misses | **Medium** | Phase M5 includes a feature-parity checklist; keep `panel.legacy.html` accessible behind a `?legacy=1` query for direct comparison until users sign off. |
| Babel-runtime currently lets you edit `command_center_react.js` and hit reload in Premiere — Vite build loses that loop | **High DX impact** | Vite dev server with `--host` + a tiny `panel.dev.html` that loads from `http://localhost:5173`. Set `CEFCommandLine` to allow it. |
| jQuery removal breaks something subtle in `panel.js` that was used cross-tab | **Low** (the 4 retained tabs don't need jQuery if Tools is ported cleanly) | `panel.js` is 23,774 lines — most of it is dialog.js-style licensing code already covered by `dialog/js/dialog.js`. Audit before deletion. |
| XMP namespace already changed in the rebrand (`http://ns.bloomxsolutions.com/freexan-caption/1.0/`) — existing user MOGRT clips won't be recognized | **Low for new install / High for migration** | Already accepted in v3.1.5 changelog. No additional work here. |
| `framer-motion@10` peer-deps require React 18 — check Vite resolves correctly | **Low** | Pin `framer-motion@11` (current stable) in `package.json`. |

---

## 6 · What this rewrite does *not* change

- Bundle id `com.bloomx.freexan.caption` — stays.
- `dialog/` (licensing about-modal) — stays as-is; it's an independent CEP extension with its own manifest entry.
- `panel/jsx/**` (ExtendScript) — stays. The React app calls it via `evalScript`.
- `mogrt sample/` — untouched.
- `IMAGE_REPLACEMENT_LIST.md` — still the source of truth for binary asset replacement.
- Premiere ↔ panel CSXS event ids (`freexan.caption.paramsUpdated`, `com.freexan.caption.executeAction`, etc.) — stays. The new React app subscribes to the same names.

---

## 7 · Updated dependency table

| Package | Version | Lives in | Replaces |
|---------|---------|----------|----------|
| `react`, `react-dom` | 18.x | Vite bundle | UMD CDN scripts |
| `framer-motion` | 11.x | Vite bundle | UMD CDN script |
| `zustand` | 4.x | Vite bundle | (new) |
| `sortablejs` + `react-sortablejs` | 1.15 / 6.x | Vite bundle | UMD CDN script |
| `vite`, `@vitejs/plugin-react`, `typescript` | latest | dev deps | (new) |
| `jquery` | — | **removed** | (no longer used) |
| `bootstrap` | — | **removed** | (no longer used) |
| `@babel/standalone` | — | **removed** | (replaced by Vite) |

Font Awesome stays via CDN link in the lean `panel.html` (used for icon glyphs in step badges).

---

## 8 · Open decisions — confirm before I start

1. **Build system: Vite (recommended) or stay on Babel runtime?**
2. **TypeScript or plain JSX?** I'd default to TS for the new code (better DX, no runtime cost). Confirm or override to JSX.
3. **State library: Zustand (recommended) or React Context only?**
4. **Keep `panel.legacy.html` accessible during the rollout via `?legacy=1`?** Useful for comparing behavior; adds a small maintenance load.
5. **Premiere Simulator (`premiere_simulator.js` + CSS) — keep behind a debug flag, or delete?**
6. **`panel.js` (23,774 lines) — do we audit it for cross-tab functions that the 4 retained tabs still need, or just delete and fix what breaks?**
7. **Login tab is being removed — but the about-dialog licensing UI is currently the only place a user enters a license code. Is that path still wanted, or are we dropping licensing UX entirely?** (The dialog modal lives at `dialog/dialog.html` and still works.)
8. **Help tab is being removed — are help links (Discord, User Guide, FAQs) moving anywhere, or dropped?** (They live in `custom/help.html` which is opened from the about dialog.)
9. **Status rail / session inspector — is the visual concept right, or do you want the current `.wf-session` top-bar pattern to remain instead?**

Reply with answers to these and I'll start at M1.
