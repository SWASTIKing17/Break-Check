const { app } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

app.name = 'freexan'; // Force the app name to get the correct path
app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'audio-library.db');
  console.log('DB Path:', dbPath);
  const db = new Database(dbPath);
  const folders = db.prepare('SELECT * FROM watched_folders').all();
  const files = db.prepare('SELECT * FROM audio_files').all();
  console.log('Folders:', folders);
  console.log('Files count:', files.length);
  app.quit();
});
