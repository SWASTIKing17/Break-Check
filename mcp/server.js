#!/usr/bin/env node
// freexan-mcp — Model Context Protocol server for freeXan by BloomX.
//
// Exposes MCP tools that wrap the freeXan HTTP API on http://127.0.0.1:4555.
// Naming follows docs/NOMENCLATURE.md:
//
//   freexan_app_*       OS-level work (filesystem, DB, opening apps)
//   freexan_link_*      Premiere-only work via the Link CEP plugin
//   freexan_caption_*   freeXan Caption plugin actions (MOGRT captions)
//
// Tools in v0.2 (v3.6.0):
//   freexan_app_status            (safe, read-only)
//   freexan_app_list_clients      (safe, read-only)
//   freexan_app_list_templates    (safe, read-only)
//   freexan_app_create_project    (destructive — confirm with user first)
//   freexan_app_open              (low-risk — opens path in shell)
//   freexan_link_import_files     (destructive — confirm with user first)
//   freexan_caption_ping          (safe, read-only — health check)
//   freexan_caption_generate      (destructive — confirm with user first)

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import http from "node:http";
import path from "node:path";

const PORT = process.env.FREEXAN_PORT ? parseInt(process.env.FREEXAN_PORT, 10) : 4555;

const TOOLS = [
  // ── app scope (OS-level) ────────────────────────────────────────────────
  {
    name: "freexan_app_status",
    description:
      "Check whether freeXan is running and connected to Adobe Premiere Pro. Returns the app version, Premiere connection state, the active project name, the configured workspace directory, and the list of connected CEP plugins. Call this first to confirm freeXan is alive before invoking other tools. Safe / read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "freexan_app_list_clients",
    description:
      "List every client saved in freeXan's database. Use this when you need to know which clients exist before creating a project. Safe / read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "freexan_app_list_funnels",
    description:
      "List every funnel (marketing/project category) saved in freeXan's database. Optionally filter by client name to see only that client's funnels. Use this to know which funnels exist before creating a project. Safe / read-only.",
    inputSchema: {
      type: "object",
      properties: {
        clientName: { type: "string", description: "Optional. Filter funnels to only those belonging to this client (case-insensitive name or initials match)." }
      },
      additionalProperties: false
    }
  },
  {
    name: "freexan_app_list_tasks",
    description:
      "List every task saved in freeXan's database. Optionally filter by client and funnel to see only the tasks attached to a specific (client, funnel) pair. Safe / read-only.",
    inputSchema: {
      type: "object",
      properties: {
        clientName: { type: "string", description: "Optional. Filter tasks to those attached to this client." },
        funnelName: { type: "string", description: "Optional. Filter tasks to those attached to this funnel (requires clientName)." }
      },
      additionalProperties: false
    }
  },
  {
    name: "freexan_app_list_templates",
    description:
      "List every folder template saved in freeXan. The starred one is the Default template applied to new projects when no other match exists. Safe / read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "freexan_app_create_project",
    description:
      "Create a new Adobe Premiere Pro project with the matching folder structure and open it in Premiere. DESTRUCTIVE: writes folders to disk and launches Premiere. ALWAYS confirm the client, funnel, task, and project name with the user before calling this tool.",
    inputSchema: {
      type: "object",
      properties: {
        clientName: { type: "string", description: "Saved client name (case-insensitive match; initials also accepted)." },
        funnelName: { type: "string", description: "Saved funnel name scoped to that client." },
        taskName:   { type: "string", description: "Optional task name attached to the (client, funnel) pair." },
        projectName: { type: "string", description: "The new project's name. Used in the folder name and the .prproj filename." }
      },
      required: ["clientName", "funnelName", "projectName"],
      additionalProperties: false
    }
  },
  {
    name: "freexan_app_open",
    description:
      "Open a file or folder using the operating system shell. Works for `.prproj` files (launches Adobe Premiere Pro) and folders (opens File Explorer). Low risk — does not modify anything.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to open. Relative paths are resolved against CWD." }
      },
      required: ["path"],
      additionalProperties: false
    }
  },
  {
    name: "freexan_app_list_mogrts",
    description:
      "Search and list MOGRT (Motion Graphics Template) files saved in freeXan's MOGRT library database. Returns id, name, file_path, category, tags, is_favorite, and use_count. Safe / read-only.",
    inputSchema: {
      type: "object",
      properties: {
        search:       { type: "string",  description: "Optional. Filter by name or tags (case-insensitive substring match)." },
        category:     { type: "string",  description: "Optional. Filter by category label." },
        favoritesOnly: { type: "boolean", description: "Optional. If true, returns only favorited MOGRTs. Defaults to false." }
      },
      additionalProperties: false
    }
  },
  {
    name: "freexan_app_list_audio",
    description:
      "Search and list audio files saved in freeXan's audio library database. Returns id, name, file_path, duration, tags, is_favorite, and use_count. Safe / read-only.",
    inputSchema: {
      type: "object",
      properties: {
        search:       { type: "string",  description: "Optional. Filter by name or tags (case-insensitive substring match)." },
        favoritesOnly: { type: "boolean", description: "Optional. If true, returns only favorited audio files. Defaults to false." }
      },
      additionalProperties: false
    }
  },

  // ── link scope (Premiere-only) ──────────────────────────────────────────
  {
    name: "freexan_link_import_files",
    description:
      "Import one or more files into the Adobe Premiere Pro project currently open in freeXan. freeXan classifies each file by type (video, audio, image) and copies it to the matching subfolder + Premiere bin. DESTRUCTIVE: copies files into the active project folder and imports them into Premiere. Confirm the file list with the user before calling.",
    inputSchema: {
      type: "object",
      properties: {
        filePaths: {
          type: "array",
          items: { type: "string" },
          description: "Absolute paths to the files to import. Relative paths are resolved against the current working directory."
        },
        toFolder: {
          type: "string",
          description: "Optional. If provided, files are placed directly into this folder (must exist or be writable). Skips automatic slot mapping."
        },
        move: {
          type: "boolean",
          description: "Optional. If true, files are MOVED instead of copied (deletes the source after transfer). Defaults to false."
        }
      },
      required: ["filePaths"],
      additionalProperties: false
    }
  },
  {
    name: "freexan_link_create_bin",
    description:
      "Create a new bin (folder) inside the Adobe Premiere Pro project panel. Requires the Link_freeXan panel to be open in Premiere. You can nest the bin inside an existing parent by providing a pipe-delimited path (e.g. '02_Footage|B-Roll'). DESTRUCTIVE: modifies the active Premiere project. Confirm bin name with the user before calling.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the new bin to create." },
        parentPath: { type: "string", description: "Optional. Pipe-delimited path to the parent bin, e.g. '02_Footage' or '02_Footage|B-Roll'. Creates at root if omitted." }
      },
      required: ["name"],
      additionalProperties: false
    }
  },
  {
    name: "freexan_link_create_sequence",
    description:
      "Create a new sequence inside the Adobe Premiere Pro project. Requires the Link_freeXan panel to be open in Premiere. DESTRUCTIVE: adds a sequence to the active Premiere project. Confirm the sequence name with the user before calling.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the new sequence." },
        preset: { type: "string", description: "Optional. Name of a .sqpreset file (without extension) from the extension's sqpersets/ folder. Uses the default preset if omitted." },
        parentPath: { type: "string", description: "Optional. Pipe-delimited path to the parent bin, e.g. '02_Footage' or '02_Footage|B-Roll'. Creates at root if omitted." }
      },
      required: ["name"],
      additionalProperties: false
    }
  },
  {
    name: "freexan_link_list_bins",
    description:
      "List all bins (folders) in the Adobe Premiere Pro project panel as a tree. Requires the Link_freeXan panel to be open in Premiere. Safe / read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "freexan_link_premiere_status",
    description:
      "Get the current status of the active Adobe Premiere Pro project: project name, file path, all sequence names, and the active sequence. Requires the Link_freeXan panel to be open in Premiere. Safe / read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },

  // ── caption scope (freeXan Caption plugin) ──────────────────────────────
  {
    name: "freexan_caption_ping",
    description:
      "Health-check the freeXan Caption plugin. Verifies the Caption panel is connected to the freeXan main app AND the ExtendScript engine has the caption-generation function loaded. Returns the list of supported caption actions. Safe / read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "freexan_caption_generate",
    description:
      "Generate caption MOGRT clips on the Adobe Premiere Pro timeline from a word-by-word Hinglish SRT file. Equivalent to running the full freeXan Caption Workflow tab in one shot — reads the SRT, parses into words, groups into phrases, places caption MOGRTs across alternating V1/V2 tracks with color labels. DESTRUCTIVE: writes many clips to the active sequence in Premiere. ALWAYS confirm the SRT path and MOGRT path with the user before calling. Preconditions: the freeXan Caption panel must be open in Premiere with an active sequence and free video tracks. May take 10-60 seconds depending on word count.",
    inputSchema: {
      type: "object",
      properties: {
        hinglishSrtPath: {
          type: "string",
          description: "Absolute path to the word-by-word Hinglish SRT file (one word per timed block, standard SubRip format with HH:MM:SS,mmm timestamps)."
        },
        mogrtPath: {
          type: "string",
          description: "Absolute path to the .mogrt caption template to use for every clip."
        },
        charsPerPhrase: {
          type: "number",
          description: "Optional. Maximum characters per phrase (caption group) before splitting to a new track. Default 100."
        },
        trackStart: {
          type: "number",
          description: "Optional. Starting video track index (1 or 2) for the first phrase. Subsequent phrases alternate. Default 1."
        }
      },
      required: ["hinglishSrtPath", "mogrtPath"],
      additionalProperties: false
    }
  }
];

const server = new Server(
  { name: "freexan-mcp", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments || {};

  try {
    switch (name) {
      // ── app scope ───────────────────────────────────────────────────────
      case "freexan_app_status": {
        const s = await api("GET", "/status");
        return textResult(formatStatus(s));
      }
      case "freexan_app_list_clients": {
        const rows = await api("GET", "/clients");
        return textResult(formatList("Clients", rows, (r) => `${r.name} (${r.initials || "—"})`));
      }
      case "freexan_app_list_funnels":
        return await callListFunnels(args);
      case "freexan_app_list_tasks":
        return await callListTasks(args);
      case "freexan_app_list_templates": {
        const rows = await api("GET", "/templates");
        return textResult(formatList("Folder templates", rows, (r) =>
          `${r.is_default ? "★ " : "  "}${r.name}${r.open_mode === "open_template" ? "  [opens template]" : ""}`
        ));
      }
      case "freexan_app_create_project":
        return await callCreateProject(args);
      case "freexan_app_open": {
        if (!args.path) throw new Error("Missing 'path' argument");
        const abs = path.resolve(String(args.path));
        await api("POST", "/open", { filePath: abs });
        return textResult(`Opened: ${abs}`);
      }
      case "freexan_app_list_mogrts":
        return await callListMogrts(args);
      case "freexan_app_list_audio":
        return await callListAudio(args);

      // ── link scope ──────────────────────────────────────────────────────
      case "freexan_link_import_files":
        return await callImportFiles(args);
      case "freexan_link_create_bin":
        return await callLinkCreateBin(args);
      case "freexan_link_create_sequence":
        return await callLinkCreateSequence(args);
      case "freexan_link_list_bins":
        return await callLinkListBins();
      case "freexan_link_premiere_status":
        return await callLinkPremiereStatus();

      // ── caption scope ───────────────────────────────────────────────────
      case "freexan_caption_ping":
        return await callPluginAction("caption", "caption_ping", {}, 10000);
      case "freexan_caption_generate":
        return await callCaptionGenerate(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${err.message || String(err)}` }]
    };
  }
});

async function callCreateProject(args) {
  const { clientName, funnelName, taskName, projectName } = args;
  if (!clientName || !funnelName || !projectName) {
    throw new Error("Required arguments: clientName, funnelName, projectName");
  }

  const clients = await api("GET", "/clients");
  const client = matchByName(clients, clientName);
  if (!client) {
    const available = clients.map((c) => c.name).join(", ") || "(none)";
    throw new Error(`No client matches "${clientName}". Saved clients: ${available}`);
  }

  const funnels = await api("GET", `/funnels?clientId=${client.id}`);
  const funnel = matchByName(funnels, funnelName);
  if (!funnel) {
    const available = funnels.map((f) => f.name).join(", ") || "(none)";
    throw new Error(`No funnel "${funnelName}" under client "${client.name}". Available: ${available}`);
  }

  let taskId = null;
  if (taskName) {
    const tasks = await api("GET", `/tasks?clientId=${client.id}&funnelId=${funnel.id}`);
    const task = matchByName(tasks, taskName);
    if (!task) {
      const available = tasks.map((t) => t.name).join(", ") || "(none)";
      throw new Error(`No task "${taskName}" attached to ${client.name} / ${funnel.name}. Available: ${available}`);
    }
    taskId = task.id;
  }

  const result = await api("POST", "/project", {
    clientId: client.id, funnelId: funnel.id, taskId, projectName
  });

  const msg = result && result.success
    ? `Created project and opening in Premiere:\n  Client: ${client.name}\n  Funnel: ${funnel.name}${taskName ? `\n  Task:   ${taskName}` : ""}\n  Name:   ${projectName}\n  Path:   ${result.projectPath || result.openedFile || "(unknown)"}`
    : `Project creation returned an unexpected response:\n${JSON.stringify(result, null, 2)}`;

  return textResult(msg);
}

async function callImportFiles(args) {
  if (!Array.isArray(args.filePaths) || args.filePaths.length === 0) {
    throw new Error("'filePaths' must be a non-empty array");
  }
  const filePaths = args.filePaths.map((p) => path.resolve(String(p)));
  const opts = {};
  if (args.toFolder) opts.routeToFolder = path.resolve(String(args.toFolder));
  if (args.move) opts.moveSource = true;

  const result = await api("POST", "/import", {
    filePaths,
    opts: Object.keys(opts).length ? opts : null
  });

  let msg;
  if (result && result.success) {
    if (opts.routeToFolder) {
      msg = `Placed ${filePaths.length} file(s) in linked folder:\n  ${opts.routeToFolder}\n(linkWatcher will auto-import them into the matching Premiere bin.)`;
    } else {
      msg = `Imported ${filePaths.length} file(s) into the active Premiere project.`;
    }
  } else {
    msg = `Import returned an unexpected response:\n${JSON.stringify(result, null, 2)}`;
  }
  return textResult(msg);
}

async function callCaptionGenerate(args) {
  if (!args.hinglishSrtPath) throw new Error("Required: hinglishSrtPath");
  if (!args.mogrtPath)       throw new Error("Required: mogrtPath");

  const payload = {
    hinglishSrtPath: path.resolve(String(args.hinglishSrtPath)),
    mogrtPath:       path.resolve(String(args.mogrtPath))
  };
  if (args.charsPerPhrase != null) payload.charsPerPhrase = +args.charsPerPhrase;
  if (args.trackStart != null)     payload.trackStart = +args.trackStart;

  // Caption generation can take 30+ s on long SRTs (60-200 words). Default the
  // plugin-action timeout to 180 s here; the HTTP layer clamps to 600 s max.
  const result = await callPluginActionRaw("caption", "caption_generate", payload, 180000);

  if (!result || result.status !== "Success") {
    const msg = (result && result.message) ? result.message : "Caption generation returned an unexpected response";
    throw new Error(msg);
  }

  const lines = [
    `Captions generated successfully on the Premiere timeline.`,
    ``,
    `  Words rendered:    ${result.wordsRendered}`,
    `  Phrases created:   ${result.phrasesCreated}`,
    `  Total in SRT:      ${result.totalWords}`,
    `  Track range:       V${result.firstVideoTrack} / V${result.secondVideoTrack}`,
    `  MOGRT used:        ${result.mogrtName}`,
    `  MOGRT mode:        ${result.mogrtMode}`,
    `  Sequence FPS:      ${result.sequenceFrameRate}`,
    `  MOGRT FPS:         ${result.mogrtFrameRate}`,
    result.failures && result.failures.length
      ? `  Per-word failures: ${result.failures.length} (see failures array below)`
      : `  Per-word failures: 0`
  ];
  if (result.failures && result.failures.length) {
    lines.push(``, `Failures:`);
    for (const f of result.failures.slice(0, 10)) {
      lines.push(`  - word #${f.wordNumber} "${f.wordText}" — ${f.error}`);
    }
    if (result.failures.length > 10) lines.push(`  … (${result.failures.length - 10} more)`);
  }
  return textResult(lines.join("\n"));
}

// ── App DB helpers (no CEP required) ─────────────────────────────────────────

async function callListFunnels(args) {
  let route = "/funnels";
  if (args && args.clientName) {
    const clients = await api("GET", "/clients");
    const client = matchByName(clients, args.clientName);
    if (!client) {
      const available = clients.map((c) => c.name).join(", ") || "(none)";
      throw new Error(`No client matches "${args.clientName}". Saved clients: ${available}`);
    }
    route = `/funnels?clientId=${client.id}`;
  }
  const rows = await api("GET", route);
  return textResult(formatList(
    args && args.clientName ? `Funnels for "${args.clientName}"` : "Funnels",
    rows,
    (r) => `${r.name} (${r.initials || "—"})${r.client_name ? `  [${r.client_name}]` : ""}`
  ));
}

async function callListTasks(args) {
  let route = "/tasks";
  let label = "Tasks";
  if (args && args.clientName) {
    const clients = await api("GET", "/clients");
    const client = matchByName(clients, args.clientName);
    if (!client) throw new Error(`No client matches "${args.clientName}".`);
    if (args.funnelName) {
      const funnels = await api("GET", `/funnels?clientId=${client.id}`);
      const funnel = matchByName(funnels, args.funnelName);
      if (!funnel) throw new Error(`No funnel "${args.funnelName}" under client "${client.name}".`);
      route = `/tasks?clientId=${client.id}&funnelId=${funnel.id}`;
      label = `Tasks for ${client.name} / ${funnel.name}`;
    } else {
      route = `/tasks?clientId=${client.id}`;
      label = `Tasks for ${client.name}`;
    }
  }
  const rows = await api("GET", route);
  return textResult(formatList(label, rows, (r) => `${r.name} (${r.initials || "—"})`));
}

async function callListMogrts(args) {
  const params = new URLSearchParams();
  if (args && args.search)   params.set("search", args.search);
  if (args && args.category) params.set("category", args.category);
  if (args && args.favoritesOnly) params.set("favoritesOnly", "1");
  const qs = params.toString() ? `?${params.toString()}` : "";
  const rows = await api("GET", `/mogrts${qs}`);
  return textResult(formatList(
    "MOGRT library",
    rows,
    (r) => `${r.is_favorite ? "★ " : "  "}[${r.id}] ${r.name}${r.category ? `  (${r.category})` : ""}${r.tags ? `  tags:${r.tags}` : ""}`
  ));
}

async function callListAudio(args) {
  const params = new URLSearchParams();
  if (args && args.search) params.set("search", args.search);
  if (args && args.favoritesOnly) params.set("favoritesOnly", "1");
  const qs = params.toString() ? `?${params.toString()}` : "";
  const rows = await api("GET", `/audio${qs}`);
  return textResult(formatList(
    "Audio library",
    rows,
    (r) => {
      const dur = r.duration ? `  ${Math.round(r.duration)}s` : "";
      return `${r.is_favorite ? "★ " : "  "}[${r.id}] ${r.name}${dur}${r.tags ? `  tags:${r.tags}` : ""}`;
    }
  ));
}

// ── Link plugin helpers (require Link_freeXan panel open in Premiere) ─────────

async function callLinkPremiereStatus() {
  const result = await callPluginActionRaw("link", "link_status", {}, 15000);
  if (!result) throw new Error("No response from Link_freeXan panel");
  if (!result.connected) {
    return textResult("Premiere Pro is not connected or no project is open.");
  }
  const lines = [
    `Premiere Pro project status:`,
    ``,
    `  Project:         ${result.projectName || "(none)"}`,
    `  Path:            ${result.projectPath || "(unknown)"}`,
    `  Sequences:       ${result.sequenceCount}`,
    result.sequences && result.sequences.length
      ? `  Sequence list:   ${result.sequences.join(", ")}`
      : null,
    `  Active sequence: ${result.activeSequence || "(none)"}`
  ];
  return textResult(lines.filter(Boolean).join("\n"));
}

async function callLinkListBins() {
  const result = await callPluginActionRaw("link", "link_list_bins", {}, 15000);
  if (!result) throw new Error("No response from Link_freeXan panel");
  if (result.err) throw new Error(`Premiere error: ${result.err}`);
  function renderTree(bins, indent) {
    if (!bins || !bins.length) return [];
    return bins.flatMap((b) => [
      `${indent}📁 ${b.name}`,
      ...renderTree(b.children, indent + "   ")
    ]);
  }
  const tree = renderTree(result.bins || [], "  ");
  const out = tree.length
    ? `Premiere bins:\n\n${tree.join("\n")}`
    : "Premiere bins: (none — project may be empty)";
  return textResult(out);
}

async function callLinkCreateBin(args) {
  if (!args || !args.name) throw new Error("Required: name");
  const result = await callPluginActionRaw("link", "link_create_bin", {
    name: String(args.name),
    parentPath: args.parentPath ? String(args.parentPath) : ""
  }, 20000);
  if (!result) throw new Error("No response from Link_freeXan panel");
  if (result.err) throw new Error(`Bin creation failed: ${result.err}`);
  const where = result.parentPath ? `inside "${result.parentPath}"` : "at root";
  return textResult(`Created bin "${result.name}" ${where} in Premiere.`);
}

async function callLinkCreateSequence(args) {
  if (!args || !args.name) throw new Error("Required: name");
  const result = await callPluginActionRaw("link", "link_create_sequence", {
    name: String(args.name),
    preset: args.preset ? String(args.preset) : undefined
  }, 20000);
  if (!result) throw new Error("No response from Link_freeXan panel");
  if (result.err) throw new Error(`Sequence creation failed: ${result.err}`);
  return textResult(`Created sequence "${result.name}" in Premiere.`);
}

// Generic POST /plugin-action dispatcher. Returns the unwrapped `result` field.
// On error, throws so the tool returns isError to Claude.
async function callPluginAction(plugin, action, pluginArgs, timeoutMs) {
  const text = await callPluginActionFormatted(plugin, action, pluginArgs, timeoutMs);
  return textResult(text);
}
async function callPluginActionRaw(plugin, action, pluginArgs, timeoutMs) {
  const body = { plugin, action, args: pluginArgs || {} };
  if (timeoutMs) body.timeoutMs = timeoutMs;
  const response = await api("POST", "/plugin-action", body);
  if (!response || !response.success) {
    throw new Error((response && response.error) || "Plugin action failed");
  }
  return response.result;
}
async function callPluginActionFormatted(plugin, action, pluginArgs, timeoutMs) {
  const result = await callPluginActionRaw(plugin, action, pluginArgs, timeoutMs);
  if (result && typeof result === "object") {
    return JSON.stringify(result, null, 2);
  }
  return String(result);
}

// ── HTTP helper ──────────────────────────────────────────────────────────────

function api(method, route, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: route,
      method,
      headers: payload
        ? { "Content-Type": "application/json", "Content-Length": payload.length }
        : {},
      timeout: 200000   // 200 s so caption_generate has slack above its 180s plugin timeout
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (_) {}
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(json);
        reject(new Error((json && json.error) || `HTTP ${res.statusCode}`));
      });
    });
    req.on("error", (err) => {
      if (err.code === "ECONNREFUSED") {
        return reject(new Error(`freeXan is not running. Start the freeXan Electron app and try again. (Looked for http://127.0.0.1:${PORT})`));
      }
      reject(err);
    });
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function matchByName(rows, name) {
  if (!Array.isArray(rows)) return null;
  const wanted = String(name).trim().toLowerCase();
  return rows.find((r) => (r.name || "").toLowerCase() === wanted)
      || rows.find((r) => (r.initials || "").toLowerCase() === wanted)
      || rows.find((r) => (r.name || "").toLowerCase().startsWith(wanted))
      || null;
}

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

function formatStatus(s) {
  const lines = [
    `Running:            ${s.running ? "yes" : "no"}`,
    `App version:        ${s.appVersion || "—"}`,
    `Premiere connected: ${s.cepConnected ? "yes" : "no"}`,
    `Active project:     ${s.projectName || "(none)"}`,
    s.activeProject ? `Project path:       ${s.activeProject}` : null,
    `Workspace dir:      ${s.targetDir || "(not configured)"}`,
    s.connectedPlugins ? `Connected plugins:  ${s.connectedPlugins.length ? s.connectedPlugins.join(", ") : "(none)"}` : null
  ];
  return lines.filter(Boolean).join("\n");
}

function formatList(title, rows, render) {
  if (!rows || !rows.length) return `${title}: (none)`;
  return [`${title} (${rows.length}):`, ...rows.map((r) => `  ${render(r)}`)].join("\n");
}

// ── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
