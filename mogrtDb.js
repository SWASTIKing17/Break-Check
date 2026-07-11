const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db = null;

function getDb() {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'mogrt-library.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mogrt_watched_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_path TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS mogrt_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tags TEXT DEFAULT '',
      category TEXT DEFAULT 'mogrt',
      is_favorite INTEGER DEFAULT 0,
      use_count INTEGER DEFAULT 0,
      thumbnail TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

const foldersApi = {
  getAll() {
    return getDb().prepare('SELECT * FROM mogrt_watched_folders ORDER BY folder_path').all();
  },
  add(folderPath) {
    try {
      return getDb().prepare('INSERT INTO mogrt_watched_folders (folder_path) VALUES (?)').run(folderPath).lastInsertRowid;
    } catch (e) {
      const existing = getDb().prepare('SELECT id FROM mogrt_watched_folders WHERE folder_path = ?').get(folderPath);
      return existing ? existing.id : null;
    }
  },
  delete(id) {
    const folder = getDb().prepare('SELECT folder_path FROM mogrt_watched_folders WHERE id = ?').get(id);
    if (folder) {
      getDb().transaction(() => {
        const likePath = folder.folder_path + path.sep + '%';
        getDb().prepare('DELETE FROM mogrt_files WHERE file_path LIKE ? OR file_path = ?').run(likePath, folder.folder_path);
        getDb().prepare('DELETE FROM mogrt_watched_folders WHERE id = ?').run(id);
      })();
    }
  }
};

const mogrtApi = {
  getAll(search = '', favoritesOnly = false, category = '') {
    let sql = 'SELECT * FROM mogrt_files';
    const params = [];
    const conditions = [];

    if (favoritesOnly) conditions.push('is_favorite = 1');

    if (category && category !== 'all') {
      conditions.push('category = ?');
      params.push(category);
    }

    if (search && search.trim()) {
      conditions.push('(name LIKE ? OR tags LIKE ?)');
      const match = `%${search.trim()}%`;
      params.push(match, match);
    }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY name COLLATE NOCASE';
    return getDb().prepare(sql).all(...params);
  },
  upsert(filePath, name, category = 'mogrt', thumbnail = '') {
    return getDb().prepare(`
      INSERT INTO mogrt_files (file_path, name, category, thumbnail)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        thumbnail = CASE WHEN excluded.thumbnail <> '' THEN excluded.thumbnail ELSE thumbnail END
    `).run(filePath, name, category, thumbnail);
  },
  deleteByPath(filePath) {
    return getDb().prepare('DELETE FROM mogrt_files WHERE file_path = ?').run(filePath);
  },
  toggleFavorite(id) {
    return getDb().prepare('UPDATE mogrt_files SET is_favorite = 1 - is_favorite WHERE id = ?').run(id);
  },
  updateTags(id, tags) {
    return getDb().prepare('UPDATE mogrt_files SET tags = ? WHERE id = ?').run(tags, id);
  },
  incrementUseCount(id) {
    return getDb().prepare('UPDATE mogrt_files SET use_count = use_count + 1 WHERE id = ?').run(id);
  }
};

module.exports = { foldersApi, mogrtApi };
