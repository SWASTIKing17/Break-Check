#!/usr/bin/env node
// freexan-cli — terminal control for freeXan by BloomX.
// Talks to the running Electron app over http://127.0.0.1:4555.
//
// Commands:
//   freexan status                                                  Show connection + active project
//   freexan clients                                                 List saved clients
//   freexan templates                                               List folder templates
//   freexan new <name> --client X --funnel Y [--task Z]             Create a new project
//   freexan import <files...> [--to-folder P] [--move]              Import files into active project
//   freexan open <path>                                             Open a .prproj or folder in shell
//
// Global flags:
//   --json                                                          Emit raw JSON instead of pretty output
//   --port N                                                        Override API port (default 4555)
//   --help, -h                                                      Show help
//   --version, -v                                                   Show CLI version

const http = require('http');
const path = require('path');
const fs = require('fs');

const CLI_VERSION = '0.3.0';
const DEFAULT_PORT = 4555;

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m'
};
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (col, s) => useColor ? `${col}${s}${c.reset}` : String(s);

const argv = parseArgv(process.argv.slice(2));
const PORT = argv.flags.port ? parseInt(argv.flags.port, 10) : DEFAULT_PORT;
const JSON_MODE = !!argv.flags.json;

main().catch((err) => {
  printError(err && err.message ? err.message : String(err));
  process.exit(1);
});

async function main() {
  if (argv.flags.version || argv.flags.v) {
    console.log(`freexan-cli ${CLI_VERSION}`);
    return;
  }
  if (argv.flags.help || argv.flags.h || argv.command === 'help' || !argv.command) {
    printHelp();
    return;
  }

  switch (argv.command) {
    case 'status':    return cmdStatus();
    case 'clients':   return cmdClients();
    case 'funnels':   return cmdFunnels();
    case 'tasks':     return cmdTasks();
    case 'mogrts':    return cmdMogrts();
    case 'audio':     return cmdAudio();
    case 'templates': return cmdTemplates();
    case 'new':       return cmdNew();
    case 'import':    return cmdImport();
    case 'open':      return cmdOpen();
    case 'caption':   return cmdCaption();
    case 'link':      return cmdLink();
    default:
      printError(`Unknown command: ${argv.command}`);
      printHelp();
      process.exit(1);
  }
}

// ── caption subcommands ─────────────────────────────────────────────────────
async function cmdCaption() {
  const sub = argv.positional[0];
  if (!sub) throw new Error('Usage: freexan caption <ping|generate> ...');

  if (sub === 'ping') {
    const result = await api('POST', '/plugin-action', {
      plugin: 'caption', action: 'caption_ping', timeoutMs: 10000
    });
    if (JSON_MODE) return printJson(result);
    const r = result && result.result ? result.result : {};
    console.log();
    console.log(paint(c.bold, 'Caption plugin'));
    console.log(paint(c.gray, '─'.repeat(40)));
    console.log(`  ${pad('Panel connected:', 22)} ${r.pluginConnected ? green('yes') : red('no')}`);
    console.log(`  ${pad('JSX loaded:', 22)}      ${r.jsxLoaded ? green('yes') : red('no')}`);
    console.log(`  ${pad('Supported actions:', 22)} ${(r.supportedActions || []).join(', ') || '(none)'}`);
    console.log();
    return;
  }

  if (sub === 'generate') {
    const srtArg = argv.positional[1];
    if (!srtArg) throw new Error('Usage: freexan caption generate <hinglish-srt-path> --mogrt <path> [--chars-per-phrase N] [--track-start N]');
    if (!argv.flags.mogrt) throw new Error('Missing --mogrt');

    const hinglishSrtPath = path.resolve(srtArg);
    const mogrtPath = path.resolve(String(argv.flags.mogrt));
    if (!fs.existsSync(hinglishSrtPath)) throw new Error(`SRT not found: ${srtArg}`);
    if (!fs.existsSync(mogrtPath))       throw new Error(`MOGRT not found: ${argv.flags.mogrt}`);

    const actionArgs = { hinglishSrtPath, mogrtPath };
    if (argv.flags['chars-per-phrase']) actionArgs.charsPerPhrase = parseInt(argv.flags['chars-per-phrase'], 10);
    if (argv.flags['track-start'])      actionArgs.trackStart     = parseInt(argv.flags['track-start'], 10);

    if (!JSON_MODE) {
      console.log();
      console.log(paint(c.bold, 'Generating captions'));
      console.log(paint(c.gray, '─'.repeat(40)));
      console.log(`  SRT:    ${paint(c.cyan, hinglishSrtPath)}`);
      console.log(`  MOGRT:  ${paint(c.cyan, mogrtPath)}`);
      if (actionArgs.charsPerPhrase) console.log(`  chars/phrase:  ${actionArgs.charsPerPhrase}`);
      if (actionArgs.trackStart)     console.log(`  track start:   V${actionArgs.trackStart}`);
      console.log(paint(c.gray, '  (this can take 10–60 s — Premiere is placing clips)'));
      console.log();
    }

    const response = await api('POST', '/plugin-action', {
      plugin: 'caption', action: 'caption_generate', args: actionArgs, timeoutMs: 180000
    });
    if (JSON_MODE) return printJson(response);

    const result = response && response.result ? response.result : null;
    if (!result || result.status !== 'Success') {
      printError(`Generation failed: ${(result && result.message) || JSON.stringify(response)}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${green('✓')} Captions generated`);
    console.log(`  ${pad('Words rendered:', 22)} ${result.wordsRendered}`);
    console.log(`  ${pad('Phrases:', 22)} ${result.phrasesCreated}`);
    console.log(`  ${pad('Tracks:', 22)} V${result.firstVideoTrack} / V${result.secondVideoTrack}`);
    console.log(`  ${pad('MOGRT mode:', 22)} ${result.mogrtMode}`);
    console.log(`  ${pad('Failures:', 22)} ${(result.failures || []).length}`);
    console.log();
    return;
  }

  throw new Error(`Unknown caption subcommand: ${sub}. Use 'ping' or 'generate'.`);
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function cmdStatus() {
  const s = await api('GET', '/status');
  if (JSON_MODE) return printJson(s);

  console.log();
  console.log(paint(c.bold, 'freeXan status'));
  console.log(paint(c.gray, '─'.repeat(40)));
  console.log(`  ${pad('App running:', 18)} ${green('yes')}`);
  console.log(`  ${pad('App version:', 18)} ${s.appVersion || '—'}`);
  console.log(`  ${pad('Premiere link:', 18)} ${s.cepConnected ? green('connected') : red('not connected')}`);
  console.log(`  ${pad('Active project:', 18)} ${s.projectName ? paint(c.cyan, s.projectName) : paint(c.gray, '(none)')}`);
  if (s.activeProject) console.log(`  ${pad('Project path:', 18)} ${paint(c.gray, s.activeProject)}`);
  console.log(`  ${pad('Workspace dir:', 18)} ${s.targetDir ? paint(c.gray, s.targetDir) : red('not configured')}`);
  console.log();
}

async function cmdClients() {
  const rows = await api('GET', '/clients');
  if (JSON_MODE) return printJson(rows);
  if (!rows.length) return console.log(paint(c.gray, 'No clients saved.'));

  console.log();
  console.log(paint(c.bold, `Clients (${rows.length})`));
  console.log(paint(c.gray, '─'.repeat(40)));
  for (const r of rows) {
    console.log(`  ${paint(c.cyan, pad(r.name, 28))} ${paint(c.gray, `(${r.initials || '—'})`)}`);
  }
  console.log();
}

async function cmdFunnels() {
  let route = '/funnels';
  let label = 'Funnels';
  if (argv.flags.client) {
    const clients = await api('GET', '/clients');
    const client = matchByName(clients, argv.flags.client);
    if (!client) throw new Error(`No client matches "${argv.flags.client}". Run \`freexan clients\` to list.`);
    route = `/funnels?clientId=${client.id}`;
    label = `Funnels for ${client.name}`;
  }
  const rows = await api('GET', route);
  if (JSON_MODE) return printJson(rows);
  if (!rows.length) return console.log(paint(c.gray, `${label}: none found.`));
  console.log();
  console.log(paint(c.bold, `${label} (${rows.length})`));
  console.log(paint(c.gray, '─'.repeat(40)));
  for (const r of rows) {
    const client = r.client_name ? paint(c.gray, ` [${r.client_name}]`) : '';
    console.log(`  ${paint(c.cyan, pad(r.name, 28))} ${paint(c.gray, `(${r.initials || '—'})`)}${client}`);
  }
  console.log();
}

async function cmdTasks() {
  let route = '/tasks';
  let label = 'Tasks';
  if (argv.flags.client) {
    const clients = await api('GET', '/clients');
    const client = matchByName(clients, argv.flags.client);
    if (!client) throw new Error(`No client matches "${argv.flags.client}".`);
    if (argv.flags.funnel) {
      const funnels = await api('GET', `/funnels?clientId=${client.id}`);
      const funnel = matchByName(funnels, argv.flags.funnel);
      if (!funnel) throw new Error(`No funnel "${argv.flags.funnel}" under client "${client.name}".`);
      route = `/tasks?clientId=${client.id}&funnelId=${funnel.id}`;
      label = `Tasks for ${client.name} / ${funnel.name}`;
    } else {
      route = `/tasks?clientId=${client.id}`;
      label = `Tasks for ${client.name}`;
    }
  }
  const rows = await api('GET', route);
  if (JSON_MODE) return printJson(rows);
  if (!rows.length) return console.log(paint(c.gray, `${label}: none found.`));
  console.log();
  console.log(paint(c.bold, `${label} (${rows.length})`));
  console.log(paint(c.gray, '─'.repeat(40)));
  for (const r of rows) {
    console.log(`  ${paint(c.cyan, pad(r.name, 28))} ${paint(c.gray, `(${r.initials || '—'})`)}`);
  }
  console.log();
}

async function cmdMogrts() {
  const params = new URLSearchParams();
  if (argv.flags.search)    params.set('search', argv.flags.search);
  if (argv.flags.category)  params.set('category', argv.flags.category);
  if (argv.flags.favorites) params.set('favoritesOnly', '1');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const rows = await api('GET', `/mogrts${qs}`);
  if (JSON_MODE) return printJson(rows);
  if (!rows.length) return console.log(paint(c.gray, 'No MOGRTs found.'));
  console.log();
  console.log(paint(c.bold, `MOGRT library (${rows.length})`));
  console.log(paint(c.gray, '─'.repeat(60)));
  for (const r of rows) {
    const star  = r.is_favorite ? paint(c.yellow, '★ ') : '  ';
    const cat   = r.category    ? paint(c.gray, ` (${r.category})`) : '';
    const tags  = r.tags        ? paint(c.gray, `  [${r.tags}]`) : '';
    console.log(`  ${star}${paint(c.cyan, pad(`[${r.id}] ${r.name}`, 40))}${cat}${tags}`);
  }
  console.log();
}

async function cmdAudio() {
  const params = new URLSearchParams();
  if (argv.flags.search)    params.set('search', argv.flags.search);
  if (argv.flags.favorites) params.set('favoritesOnly', '1');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const rows = await api('GET', `/audio${qs}`);
  if (JSON_MODE) return printJson(rows);
  if (!rows.length) return console.log(paint(c.gray, 'No audio files found.'));
  console.log();
  console.log(paint(c.bold, `Audio library (${rows.length})`));
  console.log(paint(c.gray, '─'.repeat(60)));
  for (const r of rows) {
    const star = r.is_favorite ? paint(c.yellow, '★ ') : '  ';
    const dur  = r.duration    ? paint(c.gray, ` ${Math.round(r.duration)}s`) : '';
    const tags = r.tags        ? paint(c.gray, `  [${r.tags}]`) : '';
    console.log(`  ${star}${paint(c.cyan, pad(`[${r.id}] ${r.name}`, 40))}${dur}${tags}`);
  }
  console.log();
}

async function cmdTemplates() {
  const rows = await api('GET', '/templates');
  if (JSON_MODE) return printJson(rows);
  if (!rows.length) return console.log(paint(c.gray, 'No templates saved.'));

  console.log();
  console.log(paint(c.bold, `Folder templates (${rows.length})`));
  console.log(paint(c.gray, '─'.repeat(40)));
  for (const r of rows) {
    const star = r.is_default ? paint(c.yellow, '★ ') : '  ';
    const mode = r.open_mode === 'open_template' ? paint(c.gray, '[opens template]') : '';
    console.log(`  ${star}${paint(c.cyan, pad(r.name, 28))} ${mode}`);
  }
  console.log();
}

async function cmdNew() {
  const projectName = argv.positional[0];
  if (!projectName) throw new Error('Usage: freexan new <project-name> --client X --funnel Y [--task Z]');

  const clientName = argv.flags.client;
  const funnelName = argv.flags.funnel;
  const taskName   = argv.flags.task || null;
  if (!clientName) throw new Error('Missing --client');
  if (!funnelName) throw new Error('Missing --funnel');

  // Resolve client → funnel → (task)
  const clients = await api('GET', '/clients');
  const client = matchByName(clients, clientName);
  if (!client) throw new Error(`No client matches "${clientName}". Run \`freexan clients\` to list saved clients.`);

  const funnels = await api('GET', `/funnels?clientId=${client.id}`);
  const funnel = matchByName(funnels, funnelName);
  if (!funnel) throw new Error(`No funnel "${funnelName}" found under client "${client.name}".`);

  let taskId = null;
  if (taskName) {
    const tasks = await api('GET', `/tasks?clientId=${client.id}&funnelId=${funnel.id}`);
    const task = matchByName(tasks, taskName);
    if (!task) throw new Error(`No task "${taskName}" attached to ${client.name} / ${funnel.name}.`);
    taskId = task.id;
  }

  if (!JSON_MODE) {
    console.log();
    console.log(paint(c.bold, 'Creating project'));
    console.log(paint(c.gray, '─'.repeat(40)));
    console.log(`  Client:  ${paint(c.cyan, client.name)}`);
    console.log(`  Funnel:  ${paint(c.cyan, funnel.name)}`);
    if (taskName) console.log(`  Task:    ${paint(c.cyan, taskName)}`);
    console.log(`  Name:    ${paint(c.cyan, projectName)}`);
    console.log();
  }

  const result = await api('POST', '/project', {
    clientId: client.id, funnelId: funnel.id, taskId, projectName
  });

  if (JSON_MODE) return printJson(result);
  if (result && result.success) {
    console.log(`${green('✓')} Project created at:`);
    console.log(`  ${paint(c.cyan, result.projectPath || result.openedFile || '(unknown)')}`);
    console.log(`${green('✓')} Opening in Premiere…`);
    console.log();
  } else {
    printError(`Create failed: ${JSON.stringify(result)}`);
    process.exitCode = 1;
  }
}

async function cmdImport() {
  if (argv.positional.length === 0) throw new Error('Usage: freexan import <file1> [file2...] [--to-folder PATH] [--move]');

  // Resolve to absolute paths and verify each exists.
  const resolved = [];
  for (const p of argv.positional) {
    const abs = path.resolve(p);
    if (!fs.existsSync(abs)) throw new Error(`File not found: ${p}`);
    resolved.push(abs);
  }

  const opts = {};
  if (argv.flags['to-folder']) opts.routeToFolder = path.resolve(argv.flags['to-folder']);
  if (argv.flags.move) opts.moveSource = true;

  if (!JSON_MODE) {
    console.log();
    console.log(paint(c.bold, `Importing ${resolved.length} file${resolved.length > 1 ? 's' : ''}`));
    for (const f of resolved) console.log(`  ${paint(c.gray, '•')} ${path.basename(f)}`);
    if (opts.routeToFolder) console.log(`  → ${paint(c.cyan, opts.routeToFolder)}`);
    if (opts.moveSource) console.log(`  ${paint(c.yellow, 'move mode (source files will be deleted)')}`);
    console.log();
  }

  const result = await api('POST', '/import', { filePaths: resolved, opts: Object.keys(opts).length ? opts : null });
  if (JSON_MODE) return printJson(result);
  if (result && result.success) {
    console.log(`${green('✓')} ${result.imported ? 'Imported to Premiere' : 'Files placed in linked folder'}`);
    console.log();
  } else {
    printError(`Import failed: ${JSON.stringify(result)}`);
    process.exitCode = 1;
  }
}

async function cmdOpen() {
  const target = argv.positional[0];
  if (!target) throw new Error('Usage: freexan open <path>');
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) throw new Error(`Path not found: ${target}`);
  const result = await api('POST', '/open', { filePath: abs });
  if (JSON_MODE) return printJson(result);
  console.log(`${green('✓')} Opened: ${paint(c.cyan, abs)}`);
}

// ── link subcommands ────────────────────────────────────────────────────────
async function cmdLink() {
  const sub = argv.positional[0];
  if (!sub) throw new Error('Usage: freexan link <status|bins|create-bin|create-seq> ...');

  if (sub === 'status') {
    const res = await api('POST', '/plugin-action', { plugin: 'link', action: 'link_status', timeoutMs: 15000 });
    if (JSON_MODE) return printJson(res);
    const r = res && res.result ? res.result : {};
    if (!r.connected) {
      console.log(paint(c.yellow, 'Premiere Pro not connected or no project open.'));
      return;
    }
    console.log();
    console.log(paint(c.bold, 'Premiere Pro project'));
    console.log(paint(c.gray, '─'.repeat(50)));
    console.log(`  ${pad('Project:', 18)} ${paint(c.cyan, r.projectName || '(none)')}`);
    console.log(`  ${pad('Path:', 18)} ${paint(c.gray, r.projectPath || '(unknown)')}`);
    console.log(`  ${pad('Sequences:', 18)} ${r.sequenceCount || 0}`);
    if (r.activeSequence) console.log(`  ${pad('Active seq:', 18)} ${paint(c.cyan, r.activeSequence)}`);
    if (r.sequences && r.sequences.length) {
      console.log(`  ${pad('All seqs:', 18)} ${paint(c.gray, r.sequences.join(', '))}`);
    }
    console.log();
    return;
  }

  if (sub === 'bins') {
    const res = await api('POST', '/plugin-action', { plugin: 'link', action: 'link_list_bins', timeoutMs: 15000 });
    if (JSON_MODE) return printJson(res);
    const r = res && res.result ? res.result : {};
    if (r.err) { printError(r.err); process.exitCode = 1; return; }
    if (r.debug) {
      for (const d of r.debug) {
        console.log(` - ${d.name} (type: ${d.type}, isBin: ${d.isBin})`);
      }
    }
    function printBins(bins, indent) {
      for (const b of bins || []) {
        console.log(`${indent}${paint(c.cyan, '📁')} ${b.name}`);
        printBins(b.children, indent + '   ');
      }
    }
    console.log();
    console.log(paint(c.bold, 'Premiere bins'));
    console.log(paint(c.gray, '─'.repeat(40)));
    if (!r.bins || !r.bins.length) {
      console.log(paint(c.gray, '  (no bins — project may be empty)'));
    } else {
      printBins(r.bins, '  ');
    }
    console.log();
    return;
  }

  if (sub === 'create-bin') {
    const binName = argv.positional[1];
    if (!binName) throw new Error('Usage: freexan link create-bin <name> [--path "Parent"]');
    const parentPath = argv.flags.path || argv.flags['parent-path'] || '';
    if (!JSON_MODE) {
      const where = parentPath ? `inside "${parentPath}"` : 'at root';
      console.log(`Creating bin "${paint(c.cyan, binName)}" ${where}…`);
    }
    const res = await api('POST', '/plugin-action', {
      plugin: 'link', action: 'link_create_bin', args: { name: binName, parentPath }, timeoutMs: 20000
    });
    if (JSON_MODE) return printJson(res);
    const r = res && res.result ? res.result : {};
    if (r.err) { printError(`Bin creation failed: ${r.err}`); process.exitCode = 1; return; }
    console.log(`${green('✓')} Created bin "${paint(c.cyan, r.name || binName)}" in Premiere.`);
    return;
  }

  if (sub === 'create-seq') {
    const seqName = argv.positional[1];
    if (!seqName) throw new Error('Usage: freexan link create-seq <name> [--preset <name>] [--path "Parent"]');
    const preset = argv.flags.preset || '';
    const parentPath = argv.flags.path || argv.flags['parent-path'] || '';
    if (!JSON_MODE) console.log(`Creating sequence "${paint(c.cyan, seqName)}"${preset ? ` (preset: ${preset})` : ''}${parentPath ? ` inside "${parentPath}"` : ''}…`);
    const res = await api('POST', '/plugin-action', {
      plugin: 'link', action: 'link_create_sequence', args: { name: seqName, preset: preset || undefined, parentPath: parentPath || undefined }, timeoutMs: 20000
    });
    if (JSON_MODE) return printJson(res);
    const r = res && res.result ? res.result : {};
    if (r.err) { printError(`Sequence creation failed: ${r.err}`); process.exitCode = 1; return; }
    if (r.moveErr) {
      console.log(paint(c.yellow, `⚠ Sequence created, but move failed: ${r.moveErr}`));
    } else {
      console.log(`${green('✓')} Created sequence "${paint(c.cyan, r.name || seqName)}" in Premiere.`);
    }
    return;
  }

  throw new Error(`Unknown link subcommand: ${sub}. Use: status | bins | create-bin | create-seq`);
}

// ── HTTP helper ──────────────────────────────────────────────────────────────

function api(method, route, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: route,
      method,
      headers: payload
        ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
        : {},
      timeout: 60000
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (_) { /* leave null */ }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          return resolve(json);
        }
        const msg = (json && json.error) || `HTTP ${res.statusCode}`;
        reject(new Error(msg));
      });
    });
    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        return reject(new Error(`freeXan is not running. Start the app and try again. (Looked for http://127.0.0.1:${PORT})`));
      }
      reject(err);
    });
    req.on('timeout', () => { req.destroy(new Error('Request timed out')); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseArgv(args) {
  // Light parser: first non-flag token = command, the rest split into positional + flags.
  // Flags: --key value | --key=value | --flag (bool)
  const out = { command: null, positional: [], flags: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const body = a.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) { out.flags[body.slice(0, eq)] = body.slice(eq + 1); }
      else {
        const next = args[i + 1];
        if (next && !next.startsWith('-')) { out.flags[body] = next; i++; }
        else { out.flags[body] = true; }
      }
    } else if (a.startsWith('-') && a.length > 1) {
      out.flags[a.slice(1)] = true;
    } else if (!out.command) {
      out.command = a;
    } else {
      out.positional.push(a);
    }
  }
  return out;
}

function matchByName(rows, name) {
  if (!Array.isArray(rows)) return null;
  const wanted = String(name).trim().toLowerCase();
  // 1. exact case-insensitive name 2. initials match 3. starts-with
  return rows.find(r => (r.name || '').toLowerCase() === wanted)
      || rows.find(r => (r.initials || '').toLowerCase() === wanted)
      || rows.find(r => (r.name || '').toLowerCase().startsWith(wanted))
      || null;
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
const green = (s) => paint(c.green, s);
const red   = (s) => paint(c.red, s);

function printJson(obj) { process.stdout.write(JSON.stringify(obj, null, 2) + '\n'); }
function printError(msg) { console.error(`${paint(c.red, '✗')} ${msg}`); }

function printHelp() {
  const lines = [
    '',
    paint(c.bold, 'freexan') + paint(c.gray, ` ${CLI_VERSION}  — terminal control for freeXan by BloomX`),
    '',
    paint(c.bold, 'Usage:'),
    '  freexan <command> [options]',
    '',
    paint(c.bold, 'Commands (app scope):'),
    '  status                                   Show app + Premiere connection state',
    '  clients                                  List saved clients',
    '  funnels [--client X]                     List funnels (optionally filtered by client)',
    '  tasks [--client X] [--funnel Y]          List tasks (optionally filtered)',
    '  mogrts [--search S] [--category C]       Search MOGRT library',
    '         [--favorites]',
    '  audio [--search S] [--favorites]         Search audio library',
    '  templates                                List folder templates',
    '  new <name> --client X --funnel Y         Create a new project',
    '                  [--task Z]',
    '  import <files...> [--to-folder P]        Import files into active Premiere project',
    '                    [--move]',
    '  open <path>                              Open a .prproj or folder',
    '',
    paint(c.bold, 'Commands (link plugin — requires Link_freeXan panel open in Premiere):'),
    '  link status                              Show active Premiere project + sequences',
    '  link bins                                List all bins in the Premiere project',
    '  link create-bin <name> [--path P]        Create a bin (P = pipe-delimited parent path)',
    '  link create-seq <name> [--preset P]      Create a sequence',
    '',
    paint(c.bold, 'Commands (caption plugin):'),
    '  caption ping                             Health-check the Caption panel',
    '  caption generate <srt-path>              Generate captions on the timeline',
    '          --mogrt <path>',
    '          [--chars-per-phrase N]',
    '          [--track-start 1|2]',
    '',
    paint(c.bold, 'Global flags:'),
    '  --json                                   Emit JSON instead of pretty output',
    '  --port N                                 Override API port (default 4555)',
    '  --help, -h                               This help',
    '  --version, -v                            CLI version',
    '',
    paint(c.bold, 'Examples:'),
    paint(c.gray, '  freexan status'),
    paint(c.gray, '  freexan funnels --client Acme'),
    paint(c.gray, '  freexan mogrts --search caption --favorites'),
    paint(c.gray, '  freexan audio --search cinematic'),
    paint(c.gray, '  freexan new "Q3 Reel" --client Acme --funnel Sales --task Reel'),
    paint(c.gray, '  freexan import ./shot01.mp4 ./shot02.mp4'),
    paint(c.gray, '  freexan link status'),
    paint(c.gray, '  freexan link bins'),
    paint(c.gray, '  freexan link create-bin "B-Roll" --path "02_Footage"'),
    paint(c.gray, '  freexan link create-seq "Main Cut"'),
    paint(c.gray, '  freexan caption ping'),
    paint(c.gray, '  freexan caption generate ./hinglish.srt --mogrt "D:/MOGRT/caption.mogrt"'),
    ''
  ];
  console.log(lines.join('\n'));
}
