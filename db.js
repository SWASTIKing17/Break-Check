const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db = null;

function getDb() {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'project-builder.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL,
      initials TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS funnels (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      name      TEXT NOT NULL,
      initials  TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS templates (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      funnel_id INTEGER REFERENCES funnels(id) ON DELETE CASCADE,
      name      TEXT NOT NULL,
      file_path TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      funnel_id INTEGER REFERENCES funnels(id) ON DELETE CASCADE,
      name      TEXT NOT NULL,
      file_path TEXT NOT NULL,
      category  TEXT DEFAULT 'other',
      tags      TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL UNIQUE,
      initials TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Junction: which tasks are attached to which (client, funnel) pair
    CREATE TABLE IF NOT EXISTS funnel_tasks (
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      funnel_id INTEGER NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
      task_id   INTEGER NOT NULL REFERENCES tasks(id)   ON DELETE CASCADE,
      PRIMARY KEY (client_id, funnel_id, task_id)
    );
    CREATE INDEX IF NOT EXISTS idx_funnel_tasks_pair ON funnel_tasks(client_id, funnel_id);

    CREATE TABLE IF NOT EXISTS folder_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      prproj_path TEXT,
      open_mode TEXT NOT NULL DEFAULT 'copy_to_new',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS folder_template_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES folder_templates(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES folder_template_nodes(id) ON DELETE CASCADE,
      node_type TEXT NOT NULL DEFAULT 'folder',
      name TEXT NOT NULL,
      asset_path TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS folder_template_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES folder_templates(id) ON DELETE CASCADE,
      client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      funnel_id INTEGER REFERENCES funnels(id) ON DELETE CASCADE
    );
  `);

  // Migrate funnels.client_id from NOT NULL → nullable (for global funnels).
  // SQLite doesn't support ALTER COLUMN, so we recreate if needed.
  const fCols = db.prepare("PRAGMA table_info(funnels)").all();
  const clientIdCol = fCols.find(c => c.name === 'client_id');
  if (clientIdCol && clientIdCol.notnull === 1) {
    console.log('[db] Migrating funnels.client_id to nullable…');
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE funnels_new (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        name      TEXT NOT NULL,
        initials  TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO funnels_new (id, client_id, name, created_at)
        SELECT id, client_id, name, created_at FROM funnels;
      DROP TABLE funnels;
      ALTER TABLE funnels_new RENAME TO funnels;
      COMMIT;
    `);
  }

  // Add initials column to funnels if missing (ALTER TABLE ADD COLUMN is supported).
  if (!fCols.find(c => c.name === 'initials')) {
    console.log('[db] Adding funnels.initials column…');
    db.exec("ALTER TABLE funnels ADD COLUMN initials TEXT NOT NULL DEFAULT ''");
    autoFillInitials('funnels');
  }

  // Add initials column to tasks if missing.
  const tCols = db.prepare("PRAGMA table_info(tasks)").all();
  if (!tCols.find(c => c.name === 'initials')) {
    console.log('[db] Adding tasks.initials column…');
    db.exec("ALTER TABLE tasks ADD COLUMN initials TEXT NOT NULL DEFAULT ''");
    autoFillInitials('tasks');
  }

  // Migrate folder_templates: add bins_json + sequences_json if missing
  const ftCols = db.prepare("PRAGMA table_info(folder_templates)").all();
  if (!ftCols.find(c => c.name === 'bins_json')) {
    db.exec('ALTER TABLE folder_templates ADD COLUMN bins_json TEXT NOT NULL DEFAULT "[]"');
  }
  if (!ftCols.find(c => c.name === 'sequences_json')) {
    db.exec('ALTER TABLE folder_templates ADD COLUMN sequences_json TEXT NOT NULL DEFAULT "[]"');
  }

  // Migrate folder_template_assignments: add task_id if missing
  const ftaCols = db.prepare("PRAGMA table_info(folder_template_assignments)").all();
  if (!ftaCols.find(c => c.name === 'task_id')) {
    db.exec('ALTER TABLE folder_template_assignments ADD COLUMN task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL');
  }

  // Migrate folder_template_nodes: add slot_type for asset-routing slots
  const ftnCols = db.prepare("PRAGMA table_info(folder_template_nodes)").all();
  if (!ftnCols.find(c => c.name === 'slot_type')) {
    db.exec("ALTER TABLE folder_template_nodes ADD COLUMN slot_type TEXT DEFAULT NULL");
  }

  // Seed a Default folder template on first run
  const existing = db.prepare('SELECT id FROM folder_templates WHERE is_default = 1').get();
  if (!existing) {
    const tpl = db.prepare("INSERT INTO folder_templates (name, is_default) VALUES ('Default', 1)").run();
    const roots = ['01_Project_Files', '02_Footage', '03_Audio', '04_Assets', '05_Exports'];
    roots.forEach((name, i) => {
      db.prepare('INSERT INTO folder_template_nodes (template_id, parent_id, node_type, name, sort_order) VALUES (?,NULL,"folder",?,?)')
        .run(tpl.lastInsertRowid, name, i);
    });
    console.log('[db] Seeded Default folder template.');
  }
}

// Generate initials from a name. Multi-word → first letter of each word, max 4 chars.
// Single-word → first 3 letters (uppercased). Trims punctuation.
function deriveInitials(name) {
  const clean = (name || '').replace(/[^\w\s]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'XX';
  if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase();
  }
  return words.map(w => w[0]).join('').slice(0, 5).toUpperCase();
}

// Populate empty initials for an existing table.
function autoFillInitials(tableName) {
  const rows = db.prepare(`SELECT id, name FROM ${tableName} WHERE initials = ''`).all();
  const upd = db.prepare(`UPDATE ${tableName} SET initials = ? WHERE id = ?`);
  const tx = db.transaction(() => {
    rows.forEach(r => upd.run(deriveInitials(r.name), r.id));
  });
  tx();
  console.log(`[db] Auto-filled initials for ${rows.length} ${tableName}`);
}

// ── Clients ──────────────────────────────────────────────────────────────────
const clientsApi = {
  getAll() {
    return getDb().prepare('SELECT * FROM clients ORDER BY name').all();
  },
  add(name, initials) {
    return getDb().prepare('INSERT INTO clients (name, initials) VALUES (?, ?)').run(name, initials).lastInsertRowid;
  },
  update(id, name, initials) {
    getDb().prepare('UPDATE clients SET name=?, initials=? WHERE id=?').run(name, initials, id);
  },
  nameConflict(name, excludeId) {
    return !!getDb().prepare('SELECT id FROM clients WHERE name=? COLLATE NOCASE AND id != ?')
                    .get(name, excludeId || -1);
  },
  delete(id) {
    getDb().prepare('DELETE FROM clients WHERE id=?').run(id);
  }
};

// ── Funnels ───────────────────────────────────────────────────────────────────
const funnelsApi = {
  // All funnels — used by the Builder dropdown (clients and funnels are independent).
  getAll() {
    return getDb().prepare(`
      SELECT f.*, c.name AS client_name
      FROM funnels f
      LEFT JOIN clients c ON f.client_id = c.id
      ORDER BY f.name COLLATE NOCASE
    `).all();
  },
  // Funnels filtered by client — used in the Library tab for scoped views.
  getByClient(clientId) {
    return getDb().prepare('SELECT * FROM funnels WHERE client_id=? ORDER BY name COLLATE NOCASE').all(clientId);
  },
  add(clientId, name, initials) {
    const ini = (initials && initials.trim()) || deriveInitials(name);
    return getDb().prepare('INSERT INTO funnels (client_id, name, initials) VALUES (?, ?, ?)').run(clientId || null, name, ini).lastInsertRowid;
  },
  update(id, clientId, name, initials) {
    const ini = (initials && initials.trim()) || deriveInitials(name);
    getDb().prepare('UPDATE funnels SET client_id=?, name=?, initials=? WHERE id=?').run(clientId || null, name, ini, id);
  },
  // True if another funnel exists at the same (name, client_id) scope (case-insensitive).
  scopeConflict(name, clientId, excludeId) {
    const sql = clientId
      ? `SELECT id FROM funnels WHERE name=? COLLATE NOCASE AND client_id=? AND id != ?`
      : `SELECT id FROM funnels WHERE name=? COLLATE NOCASE AND client_id IS NULL AND id != ?`;
    const params = clientId ? [name, clientId, excludeId || -1] : [name, excludeId || -1];
    return !!getDb().prepare(sql).get(...params);
  },
  delete(id) {
    getDb().prepare('DELETE FROM funnels WHERE id=?').run(id);
  }
};

// ── Tasks ─────────────────────────────────────────────────────────────────────
const tasksApi = {
  getAll() {
    return getDb().prepare('SELECT * FROM tasks ORDER BY name COLLATE NOCASE').all();
  },
  add(name, initials) {
    const ini = (initials && initials.trim()) || deriveInitials(name);
    return getDb().prepare('INSERT OR IGNORE INTO tasks (name, initials) VALUES (?, ?)').run(name, ini).lastInsertRowid;
  },
  update(id, name, initials) {
    const ini = (initials && initials.trim()) || deriveInitials(name);
    getDb().prepare('UPDATE tasks SET name=?, initials=? WHERE id=?').run(name, ini, id);
  },
  // Case-insensitive name conflict (excluding self).
  nameConflict(name, excludeId) {
    return !!getDb().prepare('SELECT id FROM tasks WHERE name=? COLLATE NOCASE AND id != ?')
                    .get(name, excludeId || -1);
  },
  delete(id) {
    getDb().prepare('DELETE FROM tasks WHERE id=?').run(id);
  },

  // Tasks attached to a (client_id, funnel_id) pair.
  getForFunnel(clientId, funnelId) {
    if (!clientId || !funnelId) return [];
    return getDb().prepare(`
      SELECT t.*
      FROM tasks t
      INNER JOIN funnel_tasks ft ON ft.task_id = t.id
      WHERE ft.client_id = ? AND ft.funnel_id = ?
      ORDER BY t.name COLLATE NOCASE
    `).all(clientId, funnelId);
  },

  // Replace the full set of tasks attached to (client, funnel) with taskIds.
  setForFunnel(clientId, funnelId, taskIds) {
    if (!clientId || !funnelId) return;
    const d = getDb();
    const tx = d.transaction(() => {
      d.prepare('DELETE FROM funnel_tasks WHERE client_id=? AND funnel_id=?').run(clientId, funnelId);
      const ins = d.prepare('INSERT INTO funnel_tasks (client_id, funnel_id, task_id) VALUES (?, ?, ?)');
      for (const tid of taskIds) ins.run(clientId, funnelId, tid);
    });
    tx();
  }
};

// ── Templates ─────────────────────────────────────────────────────────────────
const templatesApi = {
  getAll() {
    return getDb().prepare(`
      SELECT t.*, c.name AS client_name, f.name AS funnel_name
      FROM templates t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN funnels f ON t.funnel_id = f.id
      ORDER BY t.id
    `).all();
  },
  add(clientId, funnelId, name, filePath) {
    return getDb().prepare(
      'INSERT INTO templates (client_id, funnel_id, name, file_path) VALUES (?, ?, ?, ?)'
    ).run(clientId || null, funnelId || null, name, filePath).lastInsertRowid;
  },
  delete(id) {
    getDb().prepare('DELETE FROM templates WHERE id=?').run(id);
  },
  // Priority: funnel-level → client-level → null (caller uses global config)
  resolve(clientId, funnelId) {
    const d = getDb();
    if (funnelId) {
      const t = d.prepare('SELECT * FROM templates WHERE funnel_id=? LIMIT 1').get(funnelId);
      if (t) return t;
    }
    if (clientId) {
      const t = d.prepare('SELECT * FROM templates WHERE client_id=? AND funnel_id IS NULL LIMIT 1').get(clientId);
      if (t) return t;
    }
    return null;
  }
};

// ── Assets ────────────────────────────────────────────────────────────────────
const assetsApi = {
  getAll() {
    return getDb().prepare(`
      SELECT a.*, c.name AS client_name, f.name AS funnel_name
      FROM assets a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN funnels f ON a.funnel_id = f.id
      ORDER BY a.id
    `).all();
  },
  add(clientId, funnelId, name, filePath, category, tags) {
    return getDb().prepare(
      'INSERT INTO assets (client_id, funnel_id, name, file_path, category, tags) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(clientId || null, funnelId || null, name, filePath, category || 'other', tags || '').lastInsertRowid;
  },
  delete(id) {
    getDb().prepare('DELETE FROM assets WHERE id=?').run(id);
  },
  // Returns funnel-scoped assets first, then client-level, deduped by id
  getPresets(clientId, funnelId) {
    const d = getDb();
    const seen = new Set();
    const results = [];
    const push = (rows) => rows.forEach(r => { if (!seen.has(r.id)) { seen.add(r.id); results.push(r); } });

    if (funnelId) push(d.prepare('SELECT * FROM assets WHERE funnel_id=?').all(funnelId));
    if (clientId) push(d.prepare('SELECT * FROM assets WHERE client_id=? AND funnel_id IS NULL').all(clientId));
    return results;
  }
};

// ── Folder Templates ──────────────────────────────────────────────────────────
const folderTemplatesApi = {
  getAll() {
    return getDb().prepare(`
      SELECT ft.*,
        c.name AS client_name, f.name AS funnel_name, t.name AS task_name,
        fta.client_id AS asgn_client_id, fta.funnel_id AS asgn_funnel_id, fta.task_id AS asgn_task_id
      FROM folder_templates ft
      LEFT JOIN folder_template_assignments fta ON fta.template_id = ft.id
      LEFT JOIN clients c ON c.id = fta.client_id
      LEFT JOIN funnels f ON f.id = fta.funnel_id
      LEFT JOIN tasks t ON t.id = fta.task_id
      ORDER BY ft.is_default DESC, ft.name COLLATE NOCASE
    `).all();
  },
  getDefault() {
    return getDb().prepare('SELECT * FROM folder_templates WHERE is_default = 1 LIMIT 1').get() || null;
  },
  create(name, prprojPath, openMode, bins, sequences) {
    return getDb().prepare(
      'INSERT INTO folder_templates (name, is_default, prproj_path, open_mode, bins_json, sequences_json) VALUES (?,0,?,?,?,?)'
    ).run(name, prprojPath || null, openMode || 'copy_to_new',
          JSON.stringify(bins || []), JSON.stringify(sequences || []));
  },
  update(id, name, prprojPath, openMode, bins, sequences) {
    getDb().prepare(
      'UPDATE folder_templates SET name=?, prproj_path=?, open_mode=?, bins_json=?, sequences_json=? WHERE id=?'
    ).run(name, prprojPath || null, openMode || 'copy_to_new',
          JSON.stringify(bins || []), JSON.stringify(sequences || []), id);
  },
  delete(id) {
    getDb().prepare('DELETE FROM folder_templates WHERE id=?').run(id);
  },
  setDefault(id) {
    const d = getDb();
    d.prepare('UPDATE folder_templates SET is_default=0').run();
    d.prepare('UPDATE folder_templates SET is_default=1 WHERE id=?').run(id);
  },
  getNodes(templateId) {
    return getDb().prepare('SELECT * FROM folder_template_nodes WHERE template_id=? ORDER BY sort_order').all(templateId);
  },
  setNodes(templateId, nodes) {
    const d = getDb();
    const insert = d.prepare('INSERT INTO folder_template_nodes (template_id, parent_id, node_type, name, asset_path, slot_type, sort_order) VALUES (?,?,?,?,?,?,?)');
    const idMap = {};
    const tx = d.transaction(() => {
      d.prepare('DELETE FROM folder_template_nodes WHERE template_id=?').run(templateId);
      nodes.forEach((n, i) => {
        const realParentId = n.parent_id != null ? (idMap[n.parent_id] ?? null) : null;
        const result = insert.run(templateId, realParentId, n.node_type, n.name, n.asset_path || null, n.slot_type || null, i);
        const key = n.tempId != null ? n.tempId : n.id;
        if (key != null) idMap[key] = result.lastInsertRowid;
      });
    });
    tx();
  },
  getAssignments(templateId) {
    return getDb().prepare(`
      SELECT fta.*, c.name AS client_name, f.name AS funnel_name, t.name AS task_name
      FROM folder_template_assignments fta
      LEFT JOIN clients c ON c.id = fta.client_id
      LEFT JOIN funnels f ON f.id = fta.funnel_id
      LEFT JOIN tasks t ON t.id = fta.task_id
      WHERE fta.template_id = ?
    `).all(templateId);
  },
  assign(templateId, clientId, funnelId, taskId) {
    const d = getDb();
    d.prepare('DELETE FROM folder_template_assignments WHERE template_id=? AND client_id IS ? AND funnel_id IS ? AND task_id IS ?')
      .run(templateId, clientId || null, funnelId || null, taskId || null);
    d.prepare('INSERT INTO folder_template_assignments (template_id, client_id, funnel_id, task_id) VALUES (?,?,?,?)')
      .run(templateId, clientId || null, funnelId || null, taskId || null);
  },
  unassign(templateId, clientId, funnelId, taskId) {
    getDb().prepare('DELETE FROM folder_template_assignments WHERE template_id=? AND client_id IS ? AND funnel_id IS ? AND task_id IS ?')
      .run(templateId, clientId || null, funnelId || null, taskId || null);
  },
  resolve(clientId, funnelId, taskId) {
    const d = getDb();
    // Priority: client + funnel + task → client + funnel → client only → null (caller uses default)
    let row = d.prepare(`
      SELECT ft.* FROM folder_templates ft
      JOIN folder_template_assignments fta ON fta.template_id = ft.id
      WHERE fta.client_id IS ? AND fta.funnel_id IS ? AND fta.task_id IS ?
      LIMIT 1
    `).get(clientId || null, funnelId || null, taskId || null);
    if (row) return row;
    row = d.prepare(`
      SELECT ft.* FROM folder_templates ft
      JOIN folder_template_assignments fta ON fta.template_id = ft.id
      WHERE fta.client_id IS ? AND fta.funnel_id IS ? AND fta.task_id IS NULL
      LIMIT 1
    `).get(clientId || null, funnelId || null);
    if (row) return row;
    row = d.prepare(`
      SELECT ft.* FROM folder_templates ft
      JOIN folder_template_assignments fta ON fta.template_id = ft.id
      WHERE fta.client_id IS ? AND fta.funnel_id IS NULL AND fta.task_id IS NULL
      LIMIT 1
    `).get(clientId || null);
    return row || null;
  },
  clone(sourceId) {
    const d = getDb();
    const src = d.prepare('SELECT * FROM folder_templates WHERE id=?').get(sourceId);
    if (!src) return null;
    const result = d.prepare(
      'INSERT INTO folder_templates (name, is_default, prproj_path, open_mode, bins_json, sequences_json) VALUES (?,0,?,?,?,?)'
    ).run(`${src.name} (copy)`, src.prproj_path, src.open_mode, src.bins_json || '[]', src.sequences_json || '[]');
    const newId = result.lastInsertRowid;
    const nodes = d.prepare('SELECT * FROM folder_template_nodes WHERE template_id=? ORDER BY sort_order').all(sourceId);
    const idMap = {};
    const ins = d.prepare('INSERT INTO folder_template_nodes (template_id, parent_id, node_type, name, asset_path, sort_order) VALUES (?,?,?,?,?,?)');
    const tx = d.transaction(() => {
      nodes.forEach((n, i) => {
        const realParent = n.parent_id != null ? (idMap[n.parent_id] ?? null) : null;
        const nr = ins.run(newId, realParent, n.node_type, n.name, n.asset_path, i);
        idMap[n.id] = nr.lastInsertRowid;
      });
    });
    tx();
    return { id: newId };
  }
};

module.exports = { clientsApi, funnelsApi, templatesApi, assetsApi, tasksApi, folderTemplatesApi };
