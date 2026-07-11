const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db = null;

function getDb() {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'audio-library.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS watched_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_path TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS audio_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      duration REAL DEFAULT 0,
      tags TEXT DEFAULT '',
      is_favorite INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Additive migrations — safe to run on existing DB
  try { db.exec("ALTER TABLE audio_files ADD COLUMN use_count INTEGER DEFAULT 0"); } catch(e) {}
  try { db.exec("ALTER TABLE audio_files ADD COLUMN category TEXT DEFAULT 'sfx'"); } catch(e) {}
  try { db.exec("ALTER TABLE audio_files ADD COLUMN peaks TEXT DEFAULT ''"); } catch(e) {}
}

const foldersApi = {
  getAll() {
    return getDb().prepare('SELECT * FROM watched_folders ORDER BY folder_path').all();
  },
  add(folderPath) {
    try {
      return getDb().prepare('INSERT INTO watched_folders (folder_path) VALUES (?)').run(folderPath).lastInsertRowid;
    } catch (e) {
      // If already exists, return existing id
      const existing = getDb().prepare('SELECT id FROM watched_folders WHERE folder_path = ?').get(folderPath);
      return existing ? existing.id : null;
    }
  },
  delete(id) {
    const folder = getDb().prepare('SELECT folder_path FROM watched_folders WHERE id = ?').get(id);
    if (folder) {
      getDb().transaction(() => {
        // Delete audio files under this path
        const likePath = folder.folder_path + path.sep + '%';
        getDb().prepare('DELETE FROM audio_files WHERE file_path LIKE ? OR file_path = ?').run(likePath, folder.folder_path);
        getDb().prepare('DELETE FROM watched_folders WHERE id = ?').run(id);
      })();
    }
  }
};

const audioApi = {
  getAll(search = '', favoritesOnly = false) {
    let sql = 'SELECT * FROM audio_files';
    const params = [];
    const conditions = [];

    if (favoritesOnly) {
      conditions.push('is_favorite = 1');
    }

    if (search && search.trim()) {
      conditions.push('(name LIKE ? OR tags LIKE ?)');
      const match = `%${search.trim()}%`;
      params.push(match, match);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY name COLLATE NOCASE';
    return getDb().prepare(sql).all(...params);
  },
  upsert(filePath, name, duration = 0, category = 'sfx', peaks = '') {
    return getDb().prepare(`
      INSERT INTO audio_files (file_path, name, duration, category, peaks)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        name = excluded.name,
        duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE duration END,
        category = excluded.category,
        peaks = CASE WHEN excluded.peaks <> '' THEN excluded.peaks ELSE peaks END
    `).run(filePath, name, duration, category, peaks);
  },
  deleteByPath(filePath) {
    return getDb().prepare('DELETE FROM audio_files WHERE file_path = ?').run(filePath);
  },
  toggleFavorite(id) {
    return getDb().prepare('UPDATE audio_files SET is_favorite = 1 - is_favorite WHERE id = ?').run(id);
  },
  updateTags(id, tags) {
    return getDb().prepare('UPDATE audio_files SET tags = ? WHERE id = ?').run(tags, id);
  },
  addTagsBatch(ids, tagKeys) {
    if (!ids || !ids.length || !tagKeys || !tagKeys.length) return;
    const sel = getDb().prepare('SELECT id, tags FROM audio_files WHERE id = ?');
    const upd = getDb().prepare('UPDATE audio_files SET tags = ? WHERE id = ?');
    getDb().transaction(() => {
      ids.forEach(id => {
        const row = sel.get(id);
        if (!row) return;
        const existing = (row.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
        tagKeys.forEach(k => { if (!existing.includes(k)) existing.push(k); });
        upd.run(existing.join(','), id);
      });
    })();
  },
  incrementUseCount(id) {
    return getDb().prepare('UPDATE audio_files SET use_count = use_count + 1 WHERE id = ?').run(id);
  }
};

module.exports = { foldersApi, audioApi };
