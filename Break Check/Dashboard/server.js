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
            employee_id TEXT,
            ram_usage_gb REAL,
            scroll_distance INTEGER,
            modifier_keys INTEGER,
            ram_total_gb REAL
        )`);
        
        // Safe migrations for older databases — each ALTER silently fails if column already exists
        const migrations = [
            'ALTER TABLE admin_events ADD COLUMN employee_id TEXT',
            'ALTER TABLE admin_events ADD COLUMN ram_usage_gb REAL',
            'ALTER TABLE admin_events ADD COLUMN scroll_distance INTEGER',
            'ALTER TABLE admin_events ADD COLUMN modifier_keys INTEGER',
            'ALTER TABLE admin_events ADD COLUMN ram_total_gb REAL',
        ];
        migrations.forEach(sql => db.run(sql, () => {}));
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

// API: Fetch aggregate data for the dashboard (legacy — raw rows)
app.get('/api/data', (req, res) => {
    const employeeId = req.query.employee_id;
    const date = req.query.date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;

    let query = `SELECT * FROM admin_events WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT 5000`;
    let params = [dayStart, dayEnd];
    
    if (employeeId) {
        query = `SELECT * FROM admin_events WHERE employee_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT 5000`;
        params = [employeeId, dayStart, dayEnd];
    }
    
    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, data: rows });
    });
});

// API: Server-side aggregated dashboard stats (mirrors Supabase RPC locally)
app.get('/api/dashboard-stats', (req, res) => {
    const employeeId = req.query.employee_id || null;
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;

    let whereClause = `WHERE timestamp >= ? AND timestamp <= ?`;
    let params = [dayStart, dayEnd];

    if (employeeId) {
        whereClause += ` AND employee_id = ?`;
        params.push(employeeId);
    }

    const queries = {
        kpis: `SELECT 
            COUNT(*) as total_events,
            COALESCE(SUM(keystrokes), 0) as total_keystrokes,
            COALESCE(SUM(scroll_distance), 0) as total_scroll,
            COUNT(DISTINCT substr(timestamp, 1, 16)) as active_minutes,
            SUM(CASE WHEN event_type = 'keystrokes' AND keystrokes > 0 THEN 1 ELSE 0 END) as keystroke_bursts,
            SUM(CASE WHEN modifier_keys = 1 THEN 1 ELSE 0 END) as modifier_bursts
            FROM admin_events ${whereClause}`,

        time_span: `SELECT 
            MIN(timestamp) as first_event,
            MAX(timestamp) as last_event
            FROM admin_events ${whereClause}`,
    };

    // Execute KPIs query
    db.get(queries.kpis, params, (err, kpis) => {
        if (err) return res.status(500).json({ error: err.message });

        // Execute time_span query
        db.get(queries.time_span, params, (err2, timeSpan) => {
            if (err2) return res.status(500).json({ error: err2.message });

            const trackedHours = (timeSpan.first_event && timeSpan.last_event)
                ? (new Date(timeSpan.last_event) - new Date(timeSpan.first_event)) / 3600000
                : 0;

            // Get raw rows for client-side rendering (still needed for charts)
            let rawQuery = `SELECT * FROM admin_events ${whereClause} ORDER BY timestamp ASC`;
            db.all(rawQuery, params, (err3, rows) => {
                if (err3) return res.status(500).json({ error: err3.message });

                res.json({
                    success: true,
                    data: {
                        kpis: { ...kpis, tracked_hours: trackedHours.toFixed(1) },
                        time_span: { ...timeSpan, tracked_hours: trackedHours.toFixed(1) },
                        raw_events: rows,
                    }
                });
            });
        });
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
