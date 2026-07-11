# freexan-cli

Terminal control for **freeXan by BloomX**. Talks to the running Electron app over `http://127.0.0.1:4555`.

## Install (one-time)

From inside the `cli/` folder:

```
npm link
```

That registers `freexan` as a global command. Type `freexan` from any folder, any terminal.

To remove: `npm unlink -g freexan-cli`

## Commands

| Command | What it does |
|---|---|
| `freexan status` | Show app + Premiere connection state, active project, workspace dir |
| `freexan clients` | List saved clients |
| `freexan funnels [--client X]` | List funnels (optionally filtered by client) |
| `freexan tasks [--client X] [--funnel Y]` | List tasks (optionally filtered) |
| `freexan mogrts [--search S] [--category C] [--favorites]` | Search MOGRT library |
| `freexan audio [--search S] [--favorites]` | Search audio library |
| `freexan templates` | List folder templates |
| `freexan new <name> --client X --funnel Y [--task Z]` | Create a new project (Builder tab, headless) |
| `freexan import <files...> [--to-folder P] [--move]` | Import file(s) into the active Premiere project |
| `freexan open <path>` | Open a `.prproj` or folder in the system shell |
| `freexan link status` | Show active Premiere project + sequences |
| `freexan link bins` | List all bins in the Premiere project |
| `freexan link create-bin <name> [--path P]` | Create a bin (P = pipe-delimited parent path) |
| `freexan link create-seq <name> [--preset P]` | Create a sequence |
| `freexan caption ping` | Health-check the Caption panel |
| `freexan caption generate <srt-path> --mogrt <path>` | Generate captions on the timeline |

## Global flags

- `--json` — emit raw JSON instead of pretty output (good for scripting)
- `--port N` — override API port (default 4555)
- `--help, -h`
- `--version, -v`

## Examples

```
freexan status
freexan new "Q3 Reel" --client Acme --funnel Sales --task Reel
freexan import ./shot01.mp4 ./shot02.mp4
freexan import ./logo.png --to-folder "D:/Work/Acme/Assets"
```

## Requirements

- freeXan must be running. If it is not, the CLI prints a clear error and exits.
- Node 18+ (uses only the built-in `http`, `path`, `fs` modules — zero dependencies).
