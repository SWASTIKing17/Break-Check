// httpApi.js — Localhost HTTP door for the freeXan CLI and MCP tools.
//
// Exposes a small, JSON-only API on 127.0.0.1:4555 (refuses non-loopback
// connections). All routes call the same db.js helpers and IPC handlers
// the GUI already uses, so there is no duplicate business logic.
//
// To add a new endpoint:
//   1. Add a `case 'METHOD /path':` branch in `handleRequest()`.
//   2. Call into `ctx.db`, `ctx.appConfig`, or `ctx.invokeHandler(channel, ...args)`.
//   3. Document it in the CLI/MCP if user-visible.

const http = require('http');
const crypto = require('crypto');
const { ipcMain } = require('electron');

const HTTP_PORT = 4555;
const HTTP_HOST = '127.0.0.1';

let server = null;

function startHttpApi(ctx) {
  if (server) return server;

  server = http.createServer((req, res) => {
    handleRequest(req, res, ctx).catch((err) => {
      sendJson(res, 500, { error: err && err.message ? err.message : String(err) });
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[HTTP API] Port ${HTTP_PORT} already in use — CLI/MCP door disabled for this run.`);
    } else {
      console.warn('[HTTP API] Server error:', err.message);
    }
  });

  server.listen(HTTP_PORT, HTTP_HOST, () => {
    console.log(`[HTTP API] freeXan API door listening on http://${HTTP_HOST}:${HTTP_PORT}`);
  });

  return server;
}

function stopHttpApi() {
  if (server) {
    try { server.close(); } catch (_) {}
    server = null;
  }
}

async function handleRequest(req, res, ctx) {
  // Refuse anything that isn't loopback. Node binds to 127.0.0.1 already, but
  // belt-and-braces in case someone reverses the host config.
  const remote = req.socket.remoteAddress || '';
  if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') {
    return sendJson(res, 403, { error: 'Loopback only' });
  }

  const url = new URL(req.url, `http://${HTTP_HOST}`);
  const route = `${req.method} ${url.pathname}`;
  const body = (req.method === 'POST' || req.method === 'PUT') ? await readJsonBody(req) : null;

  // 4.1 Claude Code MCP Bridge Telemetry
  const startTime = Date.now();
  const inputStr = JSON.stringify(body || url.search || '');
  const inputHash = crypto.createHash('sha256').update(inputStr).digest('hex').slice(0, 16);

  if (ctx && typeof ctx.sendLog === 'function') {
    ctx.sendLog('debug', 'mcp:tool-call', 'http-mcp-door', null, { route, inputHash });
    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      ctx.sendLog('debug', 'mcp:tool-resolve', 'http-mcp-door', null, { route, inputHash, statusCode: res.statusCode, durationMs });
      if (durationMs > 8000) {
        ctx.sendLog('warn', 'mcp:tool-slow-execution', 'http-mcp-door', null, { route, inputHash, durationMs });
      }
    });
  }

  switch (route) {
    case 'GET /health':
      return sendJson(res, 200, { ok: true, port: HTTP_PORT, appVersion: ctx.appVersion });

    case 'GET /status':
      return sendJson(res, 200, ctx.getStatus());

    case 'GET /clients':
      return sendJson(res, 200, ctx.db.clientsApi.getAll());

    case 'GET /funnels': {
      const clientId = parseIntOrNull(url.searchParams.get('clientId'));
      const rows = clientId ? ctx.db.funnelsApi.getByClient(clientId) : ctx.db.funnelsApi.getAll();
      return sendJson(res, 200, rows);
    }

    case 'GET /tasks': {
      const clientId = parseIntOrNull(url.searchParams.get('clientId'));
      const funnelId = parseIntOrNull(url.searchParams.get('funnelId'));
      const rows = (clientId && funnelId)
        ? ctx.db.tasksApi.getForFunnel(clientId, funnelId)
        : ctx.db.tasksApi.getAll();
      return sendJson(res, 200, rows);
    }

    case 'GET /templates': {
      const rows = ctx.db.folderTemplatesApi.getAll();
      const seen = new Set();
      const unique = [];
      for (const t of rows) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        unique.push({
          id: t.id,
          name: t.name,
          is_default: !!t.is_default,
          prproj_path: t.prproj_path || null,
          open_mode: t.open_mode || 'copy_to_new'
        });
      }
      return sendJson(res, 200, unique);
    }

    case 'GET /mogrts': {
      if (!ctx.mogrtDb) return sendJson(res, 503, { error: 'MOGRT database not available' });
      const search      = url.searchParams.get('search') || '';
      const category    = url.searchParams.get('category') || '';
      const favOnly     = url.searchParams.get('favoritesOnly') === '1' || url.searchParams.get('favoritesOnly') === 'true';
      const rows = ctx.mogrtDb.mogrtApi.getAll(search, favOnly, category);
      return sendJson(res, 200, rows);
    }

    case 'GET /audio': {
      if (!ctx.audioDb) return sendJson(res, 503, { error: 'Audio database not available' });
      const search  = url.searchParams.get('search') || '';
      const favOnly = url.searchParams.get('favoritesOnly') === '1' || url.searchParams.get('favoritesOnly') === 'true';
      const rows = ctx.audioDb.audioApi.getAll(search, favOnly);
      return sendJson(res, 200, rows);
    }

    case 'POST /project':
      return await createProjectRoute(res, ctx, body);

    case 'POST /import':
      return await importFilesRoute(res, ctx, body);

    case 'POST /plugin-action':
      return await pluginActionRoute(res, ctx, body);

    case 'POST /open': {
      if (!body || !body.filePath) return sendJson(res, 400, { error: 'Missing filePath' });
      const result = await ctx.shell.openPath(String(body.filePath));
      if (result) return sendJson(res, 400, { error: result });
      return sendJson(res, 200, { success: true });
    }

    default:
      return sendJson(res, 404, { error: `No route for ${route}` });
  }
}

async function createProjectRoute(res, ctx, body) {
  if (!body) return sendJson(res, 400, { error: 'Missing JSON body' });
  const { clientId, funnelId, taskId, projectName } = body;
  if (!clientId || !funnelId || !projectName) {
    return sendJson(res, 400, { error: 'Required fields: clientId, funnelId, projectName' });
  }

  const client = ctx.db.clientsApi.getAll().find(c => c.id === clientId);
  if (!client) return sendJson(res, 404, { error: `No client with id ${clientId}` });

  const funnel = ctx.db.funnelsApi.getByClient(clientId).find(f => f.id === funnelId)
    || ctx.db.funnelsApi.getAll().find(f => f.id === funnelId);
  if (!funnel) return sendJson(res, 404, { error: `No funnel with id ${funnelId}` });

  let task = null;
  if (taskId) {
    task = ctx.db.tasksApi.getAll().find(t => t.id === taskId);
    if (!task) return sendJson(res, 404, { error: `No task with id ${taskId}` });
  }

  const targetDir = ctx.appConfig.targetDir;
  if (!targetDir) return sendJson(res, 400, { error: 'Target Directory is not configured in Settings' });

  const payload = {
    clientId,
    funnelId,
    taskId: taskId || null,
    clientName: client.name,
    clientInitials: client.initials,
    funnelName: funnel.name,
    funnelInitials: funnel.initials || '',
    taskName: task ? task.name : '',
    taskInitials: task ? task.initials : '',
    projectName: String(projectName),
    targetDir
  };

  try {
    const result = await ctx.invokeHandler('create-project', payload);
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 500, { error: err.message || String(err) });
  }
}

async function importFilesRoute(res, ctx, body) {
  if (!body || !Array.isArray(body.filePaths) || body.filePaths.length === 0) {
    return sendJson(res, 400, { error: 'filePaths must be a non-empty array' });
  }
  const opts = body.opts && typeof body.opts === 'object' ? body.opts : null;
  try {
    const result = await ctx.invokeHandler('import-dropped-files', body.filePaths, opts);
    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 500, { error: err.message || String(err) });
  }
}

// POST /plugin-action — Generic dispatcher for CEP plugin actions over WebSocket.
// Body: { plugin: 'caption'|'bloomx'|'link'|…, action: 'create'|…, args?: {…}, timeoutMs?: number }
// Sends `{ type: 'plugin_action', requestId, action, args }` to the named plugin's
// panel, awaits `plugin_action_result` with the same requestId, and returns the
// result (or 504 if the plugin never replies, or 503 if the plugin is offline).
async function pluginActionRoute(res, ctx, body) {
  if (!body || typeof body !== 'object') {
    return sendJson(res, 400, { error: 'Missing JSON body' });
  }
  const { plugin, action, args, timeoutMs } = body;
  if (!plugin || typeof plugin !== 'string') {
    return sendJson(res, 400, { error: 'Required string field: plugin' });
  }
  if (!action || typeof action !== 'string') {
    return sendJson(res, 400, { error: 'Required string field: action' });
  }
  if (typeof ctx.dispatchToPlugin !== 'function') {
    return sendJson(res, 500, { error: 'Plugin dispatcher unavailable' });
  }

  try {
    const result = await ctx.dispatchToPlugin(plugin, action, args || {}, timeoutMs);
    return sendJson(res, 200, { success: true, result });
  } catch (err) {
    const msg = err.message || String(err);
    // Map well-known error shapes to clearer HTTP codes:
    //   503 — plugin not connected
    //   504 — plugin connected but didn't reply in time
    //   500 — other
    let status = 500;
    if (/is not connected/i.test(msg)) status = 503;
    else if (/did not respond .* within/i.test(msg)) status = 504;
    else if (/disconnected before responding/i.test(msg)) status = 503;
    return sendJson(res, status, { error: msg });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {           // 1 MB cap — body should be tiny JSON
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); }
      catch (err) { reject(new Error('Invalid JSON: ' + err.message)); }
    });
    req.on('error', reject);
  });
}

function parseIntOrNull(v) {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

// Bridge HTTP → existing ipcMain.handle handlers. Uses the private
// `_invokeHandlers` map; safe because none of our reachable handlers use
// `event.sender` (window-control handlers that do are not exposed here).
function invokeIpcHandler(channel, ...args) {
  const map = ipcMain._invokeHandlers;
  if (!map || typeof map.get !== 'function' || !map.has(channel)) {
    return Promise.reject(new Error(`No IPC handler registered: ${channel}`));
  }
  const handler = map.get(channel);
  const fakeEvent = { sender: null, frameId: 0, processId: 0 };
  return Promise.resolve(handler(fakeEvent, ...args));
}

module.exports = { startHttpApi, stopHttpApi, invokeIpcHandler, HTTP_PORT };
