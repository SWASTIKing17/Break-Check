// scripts/seed-db.js
// One-shot seeder: populates the freeXan database with the initial
// client / funnel / task list. Idempotent — safe to re-run.
//
//   Usage:  npm run seed
//   Path:   %APPDATA%\freeXan\project-builder.db (Windows)
//
// IMPORTANT: Close the freeXan app before running. SQLite WAL allows
// concurrent reads, but the app may hold a write-lock during sync.

const Database = require('better-sqlite3');
const path = require('path');

const appData = process.env.APPDATA || path.join(process.env.HOME || '', 'AppData', 'Roaming');
const dbPath  = path.join(appData, 'freeXan', 'project-builder.db');

console.log('▶ Seeding DB at:', dbPath);

let db;
try {
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
} catch (err) {
  console.error('✖ Cannot open DB:', err.message);
  console.error('  Is freeXan running? Close it from the system tray first.');
  process.exit(1);
}

// ── Schema (mirrors db.js, so seed works on fresh installs too) ───────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    initials TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS funnels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── Migrate funnels.client_id to nullable if needed ──────────────────────────
const cols = db.prepare("PRAGMA table_info(funnels)").all();
const clientIdCol = cols.find(c => c.name === 'client_id');
if (clientIdCol && clientIdCol.notnull === 1) {
  console.log('  ⟳ Migrating funnels.client_id → nullable');
  db.exec(`
    BEGIN TRANSACTION;
    CREATE TABLE funnels_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO funnels_new (id, client_id, name, created_at)
      SELECT id, client_id, name, created_at FROM funnels;
    DROP TABLE funnels;
    ALTER TABLE funnels_new RENAME TO funnels;
    COMMIT;
  `);
}

// ── Data ──────────────────────────────────────────────────────────────────────
const clients = [
  ['Astro Arun Pandit',           'AAP'],
  ['Aditya kundli',               'AK'],
  ['Asslam Shaikh',               'AS'],
  ['DriveON',                     'DRV'],
  ['Jayshree Om',                 'JO'],
  ['Kayo resort',                 'KR'],
  ['Latika Sharma',               'LS'],
  ['Mahesh mankar',               'MM'],
  ['Kabil Kids',                  'KK'],
  ['PIRNAR',                      'PIR'],
  ['Krishna Furniture',           'KF'],
  ['Vinodam',                     'VIN'],
  ['Bloomx',                      'BX'],
  ['Puran sharma',                'PS'],
  ['Pitch Video',                 'PV'],
  ['OTHER',                       'OTH'],
  ['Karmic Guruji',               'KG'],
  ['Astro Roshita',               'AR'],
  ['Pearl Enterprises',           'PE'],
  ['Fabrica International',       'FI'],
  ['Astro Vidhya',                'AV'],
  ['Rmas',                        'RMS'],
  ['Ajanta Innovative Solutions', 'AIS'],
  ['Sources Unlimited',           'SU'],
  ['Silver Shine Farms',          'SSF'],
  ['Occult Gurukul',              'OG'],
  ['Horocosmo',                   'HRC'],
  ['Janma',                       'JNM'],
  ['Re Sakhi',                    'RSK'],
  ['Rudraksha Beads',             'RB'],
  ['Fabricroot',                  'FBR'],
  ['Yogic Hacks',                 'YH'],
];

const funnels = [
  'PremiunPersonalized Kundli / Report',
  'Mega Astrology Webinar',
  'Kundli Pathshala Webinar',
  'Gemsmantra',
  'Youtube',
  'MegaNumerology Webinar',
  'Website AMC',
  'Smart kundli report',
  'Shani Suraksha',
  'ULKR (Laal Kitab reports)',
  'Panchpakshi webinar',
  'Ecommerce Website',
  'Performance Marketing',
  'Jayshree om Wastu webinar',
  'Branding',
  'VIP kundli',
  'Ads',
  'Palmistry Webinar',
  '3 days 10X Astrology Bootcamp',
  'LMS Managment',
  'Horocosmo',
  'Puja Funnel',
  'Maa BaglaMukhi Pooja',
  'OTHER',
  'Fan page',
  'Vastu 2D webinar',
  'Malahar crystals',
  'Occult Gurukul Course portal',
  'Pitch Video',
  'RMP Webinar',
  'Whatsapp Community Managment',
  'Webinar Monthly',
  '(AAP-OG)-LIVE Reco.',
  'Sadhana Batches',
  'Shopify',
  'Social media',
  'GemsGuruji',
  'Call consultation funnel',
  'wolf magic',
  'Karmic Kundali',
  '3 days 10X bootcamp',
  'Astrology 360 Webinar',
  'Nakshatra Report',
  'L3 Webinar',
];

const tasks = [
  'Ads Video',
  'Reel Video',
  'Long Video',
  'Ai Reel',
  'Ai Ad Video',
  'Ai Motion',
  'Motion',
  'CGI',
  'Other',
  'Zoom Webinar',
  'Long video content',
  'Captions',
  'Description',
  'Podcast cut',
  'Listening',
  'Posting',
];

// ── Insert (idempotent) ──────────────────────────────────────────────────────
const findClient = db.prepare('SELECT id FROM clients WHERE name = ? COLLATE NOCASE');
const insClient  = db.prepare('INSERT INTO clients (name, initials) VALUES (?, ?)');

const findFunnel = db.prepare('SELECT id FROM funnels WHERE name = ? COLLATE NOCASE AND client_id IS NULL');
const insFunnel  = db.prepare('INSERT INTO funnels (client_id, name) VALUES (NULL, ?)');

const insTask    = db.prepare('INSERT OR IGNORE INTO tasks (name) VALUES (?)');

const seed = db.transaction(() => {
  let clientsAdded = 0, clientsSkipped = 0;
  for (const [name, initials] of clients) {
    if (findClient.get(name)) { clientsSkipped++; continue; }
    insClient.run(name, initials);
    clientsAdded++;
  }

  let funnelsAdded = 0, funnelsSkipped = 0;
  for (const name of funnels) {
    if (findFunnel.get(name)) { funnelsSkipped++; continue; }
    insFunnel.run(name);
    funnelsAdded++;
  }

  let tasksAdded = 0;
  for (const name of tasks) {
    const r = insTask.run(name);
    if (r.changes > 0) tasksAdded++;
  }

  return { clientsAdded, clientsSkipped, funnelsAdded, funnelsSkipped, tasksAdded };
});

const stats = seed();

console.log('');
console.log('✔ Seed complete.');
console.log(`  Clients: +${stats.clientsAdded} new  (${stats.clientsSkipped} already existed)`);
console.log(`  Funnels: +${stats.funnelsAdded} new  (${stats.funnelsSkipped} already existed)`);
console.log(`  Tasks:   +${stats.tasksAdded} new`);

// Show totals
const totalC = db.prepare('SELECT COUNT(*) c FROM clients').get().c;
const totalF = db.prepare('SELECT COUNT(*) c FROM funnels').get().c;
const totalT = db.prepare('SELECT COUNT(*) c FROM tasks').get().c;
console.log('');
console.log(`  Database totals: ${totalC} clients · ${totalF} funnels · ${totalT} tasks`);

db.close();
