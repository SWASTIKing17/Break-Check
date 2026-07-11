# freexan-mcp

A Model Context Protocol server that lets Claude Code (and any other MCP-capable AI tool) drive the freeXan ecosystem.

## How it works

The MCP server is a small Node process that Claude launches in the background. It talks to the running freeXan Electron app over `http://127.0.0.1:4555` (the same door the CLI uses). Fourteen tools are exposed:

| Tool | Risk | What it does |
|---|---|---|
| `freexan_app_status` | safe | Check connection + active project |
| `freexan_app_list_clients` | safe | List saved clients |
| `freexan_app_list_funnels` | safe | List funnels (all or by client) |
| `freexan_app_list_tasks` | safe | List tasks (all or scoped) |
| `freexan_app_list_mogrts` | safe | Search MOGRT library |
| `freexan_app_list_audio` | safe | Search audio library |
| `freexan_app_list_templates` | safe | List folder templates |
| `freexan_app_create_project` | destructive | Create a new Premiere project |
| `freexan_app_open` | low | Open a file or folder via OS shell |
| `freexan_link_import_files` | destructive | Import files into the active project |
| `freexan_link_create_bin` | destructive | Create a bin in the Premiere project |
| `freexan_link_create_sequence` | destructive | Create a sequence in Premiere |
| `freexan_link_list_bins` | safe | List bins in active Premiere project |
| `freexan_link_premiere_status` | safe | Check active Premiere project details |
| `freexan_caption_ping` | safe | Caption panel health check |
| `freexan_caption_generate` | destructive | Full caption run (SRT → MOGRT clips) |

Destructive tools include explicit guidance in their description telling Claude to confirm with the user before calling.

## Install

From inside the `mcp/` folder:

```
npm install
```

That pulls in `@modelcontextprotocol/sdk`.

## Wire it into Claude Code

Open Claude Code's MCP config (usually via the `/mcp` slash command or by editing `claude_desktop_config.json` / `.mcp.json`) and add:

```json
{
  "mcpServers": {
    "freexan": {
      "command": "node",
      "args": ["C:/Swastik Development/FreeXan Development/mcp/server.js"]
    }
  }
}
```

Restart Claude Code. The 6 tools become available.

## Try it

Once registered, ask Claude things like:

- *"Is freeXan connected to Premiere right now?"*
- *"What clients are saved in freeXan?"*
- *"Create a new Acme Sales Reel project called Q3 Reel."* (will ask you to confirm)
- *"Import every .mp4 in `~/Downloads/AcmeFootage` into the active project."* (will ask you to confirm)

## Requirements

- freeXan must be running. If it's not, every tool returns a clear error.
- Node 18+.
- One dependency: `@modelcontextprotocol/sdk`.

## Optional env vars

- `FREEXAN_PORT` — override the API port (default `4555`)
