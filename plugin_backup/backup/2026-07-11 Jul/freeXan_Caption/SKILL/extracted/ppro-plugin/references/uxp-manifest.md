# UXP Plugin Manifest Reference

`manifest.json` is the single source of truth for a UXP plugin. It declares identity, target host, entrypoints, permissions, and UI context.

> **Reload required**: Changes to manifest.json require manually unloading and reloading the plugin in UXP Developer Tools (UDT). File-system changes to JS/HTML hot-reload automatically when using "Load & Watch".

---

## Full Manifest Schema

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Short description shown in Marketplace",
  "author": "Your Name",

  "host": {
    "app": "PPRO",
    "minVersion": "25.6"
  },

  "entrypoints": [
    {
      "type": "panel",
      "id": "mainPanel",
      "label": { "default": "My Panel" },
      "main": "index.html",
      "minimumSize": { "width": 200, "height": 100 },
      "maximumSize": { "width": 2000, "height": 2000 },
      "preferredDockedSize": { "width": 300, "height": 400 },
      "icons": [
        { "width": 23, "height": 23, "path": "icons/icon_23.png", "scale": [1, 2], "theme": ["darkest", "dark", "medium", "light", "lightest"] }
      ]
    },
    {
      "type": "command",
      "id": "runCommand",
      "label": { "default": "Run My Command" },
      "main": "command.js"
    },
    {
      "type": "modal",
      "id": "myModal",
      "label": { "default": "My Modal Dialog" },
      "main": "modal.html",
      "size": { "width": 500, "height": 400 }
    }
  ],

  "requiredPermissions": {
    "network": {
      "domains": ["https://api.example.com", "https://fonts.googleapis.com"],
      "localFileSystem": "request"
    },
    "localFileSystem": "plugin",
    "ipc": {
      "enablePluginCommunication": true
    },
    "launchProcess": {
      "schemes": ["https"],
      "extensions": [".pdf"]
    }
  },

  "hostUIContext": {
    "hideFromMenu": false
  }
}
```

---

## Field Reference

### Top-level fields

| Field | Required | Description |
|---|---|---|
| `id` | ✅ | Reverse-DNS unique plugin ID |
| `name` | ✅ | Display name |
| `version` | ✅ | Semver string |
| `host.app` | ✅ | Must be `"PPRO"` |
| `host.minVersion` | ✅ | Minimum Premiere version (e.g. `"25.6"`) |
| `description` | ❌ | Marketplace description |
| `author` | ❌ | Author name |

### Entrypoint types

| Type | Description |
|---|---|
| `panel` | Persistent dockable panel in Premiere's UI |
| `command` | Menu item that executes a JS file once and exits |
| `modal` | Blocking dialog — use sparingly |

### Panel entrypoint fields

| Field | Description |
|---|---|
| `id` | Unique entrypoint ID within this plugin |
| `label.default` | Displayed in Window → UXP Plugins menu |
| `main` | Entry HTML file (for panels/modals) or JS file (for commands) |
| `minimumSize` | Min panel dimensions |
| `maximumSize` | Max panel dimensions |
| `preferredDockedSize` | Default docked size |
| `icons` | Array of icon objects (`width`, `height`, `path`, `scale`, `theme`) |

### Permission types

| Key | Values | Description |
|---|---|---|
| `localFileSystem` | `"plugin"`, `"request"`, `"fullAccess"` | File system access scope |
| `network.domains` | String[] | Allowed network domains |
| `network.localFileSystem` | `"request"` | Needed to use `uxp.storage` network requests |
| `ipc.enablePluginCommunication` | Boolean | Allow inter-plugin messaging |
| `launchProcess.schemes` | String[] | Allowed URL schemes to open externally |
| `launchProcess.extensions` | String[] | Allowed file extensions to open with OS |

### hostUIContext

| Field | Values | Description |
|---|---|---|
| `hideFromMenu` | Boolean | If `true`, the panel won't appear in Window → UXP Plugins menu. Useful for background-only plugins that register for app events at launch. |

---

## Minimal Working Examples

### Panel only (simplest possible)
```json
{
  "id": "com.example.simple-panel",
  "name": "Simple Panel",
  "version": "1.0.0",
  "host": { "app": "PPRO", "minVersion": "25.6" },
  "entrypoints": [
    { "type": "panel", "id": "mainPanel", "label": { "default": "Simple Panel" }, "main": "index.html" }
  ]
}
```

### Panel + Command
```json
{
  "id": "com.example.dual",
  "name": "Panel + Command",
  "version": "1.0.0",
  "host": { "app": "PPRO", "minVersion": "25.6" },
  "entrypoints": [
    { "type": "panel", "id": "mainPanel", "label": { "default": "My Panel" }, "main": "panel.html" },
    { "type": "command", "id": "exportCmd", "label": { "default": "Quick Export" }, "main": "export.js" }
  ],
  "requiredPermissions": {
    "localFileSystem": "plugin"
  }
}
```

### Plugin with network access
```json
{
  "id": "com.example.network-panel",
  "name": "Network Panel",
  "version": "1.0.0",
  "host": { "app": "PPRO", "minVersion": "25.6" },
  "entrypoints": [
    { "type": "panel", "id": "mainPanel", "label": { "default": "Network Panel" }, "main": "index.html" }
  ],
  "requiredPermissions": {
    "network": {
      "domains": ["https://api.openai.com", "https://fonts.googleapis.com"]
    }
  }
}
```

---

## Accessing UXP APIs in Code

```js
// Global (no import needed):
window, document, navigator, fetch, console

// Module-based (require):
const uxpStorage = require('uxp').storage;   // file system
const shell = require('uxp').shell;          // open URLs, files externally
const os = require('os');

// Premiere DOM (always async):
const ppro = require('premierepro');
const app = await ppro.app;
```

### File system example
```js
const { storage } = require('uxp');
const fs = storage.localFileSystem;

// Read plugin-relative file
const pluginFolder = await fs.getPluginFolder();
const file = await pluginFolder.getEntry('data.json');
const content = await file.read({ format: storage.formats.utf8 });
const data = JSON.parse(content);

// Write to plugin folder
const outFile = await pluginFolder.createEntry('output.json', { overwrite: true });
await outFile.write(JSON.stringify({ result: 'done' }), { format: storage.formats.utf8 });
```

### Open external URL
```js
const { shell } = require('uxp');
await shell.openExternal('https://example.com');
```

---

## CEP manifest.xml (legacy reference)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest Version="7.0"
  ExtensionBundleId="com.example.panel"
  ExtensionBundleVersion="1.0.0">
  <ExtensionList>
    <Extension Id="com.example.panel.main" Version="1.0.0"/>
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
      <Host Name="PPRO" Version="[22.0,99.9]"/>
    </HostList>
    <LocaleList>
      <Locale Code="All"/>
    </LocaleList>
    <RequiredRuntimeList>
      <RequiredRuntime Name="CSXS" Version="11.0"/>
    </RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="com.example.panel.main">
      <DispatchInfo>
        <Resources>
          <MainPath>./index.html</MainPath>
          <ScriptPath>./jsx/hostscript.jsx</ScriptPath>
          <CEFCommandLine>
            <Parameter>--allow-file-access-from-files</Parameter>
          </CEFCommandLine>
        </Resources>
        <Lifecycle>
          <AutoVisible>true</AutoVisible>
        </Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>
            <Name>My Panel</Name>
          </Menu>
          <Geometry>
            <PreferredSize><Width>300</Width><Height>400</Height></PreferredSize>
            <MinSize><Width>200</Width><Height>100</Height></MinSize>
          </Geometry>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>
```
