const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to SQLite DB
const dbFile = process.env.DATA_FILE || 'dashboard.db';
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error("Failed to connect to database:", err.message);
    } else {
        console.log(`Connected to SQLite database at ${dbFile}`);
        db.run(`CREATE TABLE IF NOT EXISTS admin_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            event_type TEXT,
            cursor_x INTEGER,
            cursor_y INTEGER,
            keystrokes INTEGER,
            active_window TEXT,
            client_ip TEXT,
            employee_id TEXT
        )`);
        
        // Ensure older databases get the new column
        db.run(`ALTER TABLE admin_events ADD COLUMN employee_id TEXT`, (err) => {
            // Ignore error if column already exists
        });
    }
});

// API: Ingest data from the python script
app.post('/api/ingest', (req, res) => {
    const payload = req.body;
    
    if (!Array.isArray(payload)) {
        return res.status(400).json({ error: 'Payload must be an array of events' });
    }
    
    const clientIp = req.ip || req.connection.remoteAddress;

    const stmt = db.prepare(`INSERT INTO admin_events (timestamp, event_type, cursor_x, cursor_y, keystrokes, active_window, client_ip, employee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    
    let errorOccurred = false;
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        payload.forEach((event) => {
            stmt.run(
                event.timestamp,
                event.event_type || event.type,
                event.cursor_x || 0,
                event.cursor_y || 0,
                event.keystrokes || 0,
                event.active_window || '',
                clientIp,
                event.employee_id || 'Unknown',
                (err) => {
                    if (err) {
                        console.error("Insert error:", err);
                        errorOccurred = true;
                    }
                }
            );
        });
        db.run("COMMIT", (err) => {
            if (err || errorOccurred) {
                res.status(500).json({ success: false, error: 'Database commit failed' });
            } else {
                res.status(201).json({ success: true, count: payload.length });
            }
        });
    });
    
    stmt.finalize();
});

// API: Fetch aggregate data for the dashboard
app.get('/api/data', (req, res) => {
    const employeeId = req.query.employee_id;
    let query = `SELECT * FROM admin_events ORDER BY timestamp DESC LIMIT 2000`;
    let params = [];
    
    if (employeeId) {
        query = `SELECT * FROM admin_events WHERE employee_id = ? ORDER BY timestamp DESC LIMIT 2000`;
        params = [employeeId];
    }
    
    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, data: rows });
    });
});

app.get('/api/employees', (req, res) => {
    db.all(`SELECT DISTINCT employee_id FROM admin_events WHERE employee_id IS NOT NULL`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, data: rows.map(r => r.employee_id) });
    });
});

app.listen(PORT, () => {
    console.log(`Admin Dashboard Server running on port ${PORT}`);
});
