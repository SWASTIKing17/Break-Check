# freeXan Plugins

This folder contains all CEP plugins bundled with freeXan. Each subfolder is a self-contained Adobe CEP extension ready to be copied to `%APPDATA%/Adobe/CEP/extensions/`.

| Folder | Bundle ID | Host | Description |
|---|---|---|---|
| `Link_freeXan/` | `com.bloomx.freexan.link` | PPRO | Bridges freeXan ↔ Premiere — auto-import, project state, bin/sequence creation |
| `Audio_freeXan/` | `com.bloomx.freexan.audio` | PPRO | Audio library panel — waveform browser, trim, drag-to-timeline |
| `MisterBloomX/` | `com.bloomx.misterbloomx` | PPRO + AEFT | MOGRT browser — card grid, search, favorites, tag editor |
| `SubMachine/` | `com.bloomx.freexan.caption` | PPRO + AEFT | freeXan Caption — MOGRT timeline executor, applies MOGRT to active sequence (rebrand of the original SubMachine) |

## Install rules

- All four plugins are bundled into the freeXan installer.
- At install time, the user picks which plugins to enable (all checked by default).
- The user's selection is written to `plugins-enabled.json` in the install directory.
- On every app launch, `main.js → installCEPExtension()` reads that file and copies only enabled plugin folders to `%APPDATA%/Adobe/CEP/extensions/`.
- Disabled plugins are removed from the Adobe CEP folder on next launch.

## File layout per plugin

Each plugin contains its own `CSXS/manifest.xml` and panel resources. They are independent — disabling one will not affect the others.

## Adding a new plugin

1. Drop the plugin folder into `plugins/` with a `CSXS/manifest.xml` inside.
2. Add an entry to the table above and to `NAVIGATION_LOG.md`.
3. Add a checkbox in `build/installer.nsh` (`PluginsPage` section).
4. No changes needed to `main.js` — it auto-discovers any folder in `plugins/` that contains `CSXS/manifest.xml`.
