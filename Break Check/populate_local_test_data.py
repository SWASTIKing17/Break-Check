"""
Break Check — Mock Data Seeder v3
Synchronizes local Electron user profiles (from project-builder.db) with Supabase.
Clears remote team_profiles and admin_events tables, populates team_profiles
with local users, and generates mock workday events for all active user profiles.
"""
import urllib.request
import urllib.error
import json
import random
import sqlite3
import os
from datetime import datetime, timedelta, timezone
import time

# ── Config ────────────────────────────────────────────
LOCAL_DB_PATH = os.path.join(os.path.dirname(__file__), "Dashboard", "dashboard.db")

PROJECTS = [
    "Wedding_Highlight_Reel_2026.prproj",
    "Tech_Review_MKBHD_Style_v2.prproj",
    "Social_Media_Shorts_Batch.prproj"
]

WINDOWS = {
    "premiere":    lambda proj: f"Adobe Premiere Pro 2024 — D:\\Projects\\{proj}",
    "ae":          lambda proj: f"After Effects 2024 — D:\\Projects\\{proj.replace('.prproj','.aep')}",
    "chrome":      lambda _:    "Google Chrome — YouTube / Video Assets",
    "explorer":    lambda _:    "File Explorer — D:\\Projects\\Assets",
    "slack":       lambda _:    "Slack — #general",
    "locked":      lambda _:    "Windows Default Lock Screen",
}

# ── Step 1: Read local profiles from Electron SQLite DB ──
def get_local_profiles():
    db_path = "C:/Users/msi/AppData/Roaming/freexan/project-builder.db"
    print(f"Reading local user profiles from {db_path}…")
    if not os.path.exists(db_path):
        print("Error: Local project-builder.db not found!")
        return []
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name, initials, hex_color FROM users")
        rows = cursor.fetchall()
        profiles = [{"full_name": r[0], "initials": r[1], "hex_color": r[2]} for r in rows]
        conn.close()
        print(f"Found {len(profiles)} local profiles: {', '.join([p['full_name'] for p in profiles])}")
        return profiles
    except Exception as e:
        print(f"Error reading local sqlite database: {e}")
        return []

# ── Step 2 & 3: Clear DB and Upload omitted for Local DB ──
# (Local profiles aren't currently managed in a separate table in the dashboard.db, 
#  they are simply queried dynamically or stored in admin_events)
def clear_local_db():
    print(f"Deleting all rows from local DB '{LOCAL_DB_PATH}'…")
    conn = sqlite3.connect(LOCAL_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""CREATE TABLE IF NOT EXISTS admin_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT, event_type TEXT, cursor_x INTEGER, cursor_y INTEGER,
        keystrokes INTEGER, active_window TEXT, client_ip TEXT, employee_id TEXT,
        ram_usage_gb REAL, scroll_distance INTEGER, modifier_keys INTEGER, ram_total_gb REAL
    )""")
    cursor.execute("DELETE FROM admin_events")
    conn.commit()
    conn.close()
    print("   Deleted admin_events rows.")

# ── Step 4: Generate workdays ──
def gen_workday(employee_id, shift_hours=0):
    """
    Simulates a 9-hour workday starting at 09:00 + shift_hours.
    """
    blocks = [
        (118, "focus",  "premiere"),
        (30,  "break",  "slack"),
        (118, "focus",  "ae"),
        (20,  "break",  "chrome"),
        (118, "focus",  "premiere"),
        (15,  "break",  "explorer"),
        (121, "focus",  "premiere"),
    ]

    projects = random.sample(PROJECTS, 2)
    project_idx = 0

    start = datetime.now(timezone.utc).replace(
        hour=9, minute=0, second=0, microsecond=0
    ) + timedelta(hours=shift_hours)
    
    # Today's date in local tz
    now_local = datetime.now(timezone.utc).astimezone()
    start = start.replace(
        year=now_local.year, month=now_local.month, day=now_local.day
    )

    events   = []
    cur_time = start
    base_ram = random.uniform(0.015, 0.035)

    for block_i, (duration, block_type, primary_app) in enumerate(blocks):
        if block_i == 4:
            project_idx = 1
        proj = projects[project_idx]

        for minute in range(duration):
            t = cur_time + timedelta(minutes=minute)
            ts = t.isoformat()
            ram = round(base_ram + (len(events) / 3500) * 0.14 + random.uniform(-0.003, 0.006), 4)

            if block_type == "break":
                app = WINDOWS["slack"](proj) if random.random() > 0.4 else WINDOWS["locked"](proj)
                app += " [ADOBE_CLOSED]"
                events.append({
                    "timestamp":      ts,
                    "event_type":     "cursor",
                    "cursor_x":       random.randint(300, 800),
                    "cursor_y":       random.randint(200, 600),
                    "keystrokes":     0,
                    "active_window":  app,
                    "employee_id":    employee_id,
                    "ram_usage_gb":   round(ram * 0.5, 4),
                    "scroll_distance": 0,
                    "modifier_keys":  0,
                })
            else:
                roll = random.random()
                if roll < 0.09:
                    app = WINDOWS["chrome"](proj)
                elif roll < 0.13:
                    app = WINDOWS["explorer"](proj)
                else:
                    app = WINDOWS[primary_app](proj)

                events.append({
                    "timestamp":      ts,
                    "event_type":     "cursor",
                    "cursor_x":       random.randint(50, 2500),
                    "cursor_y":       random.randint(50, 1400),
                    "keystrokes":     0,
                    "active_window":  app,
                    "employee_id":    employee_id,
                    "ram_usage_gb":   ram,
                    "scroll_distance": random.randint(0, 50) if primary_app in ("premiere","ae") else random.randint(0, 12),
                    "modifier_keys":  0,
                })

                if random.random() < 0.70:
                    keys      = random.randint(2, 60)
                    mod_prob  = 0.75 if primary_app in ("premiere","ae") else 0.20
                    has_mod   = 1 if random.random() < mod_prob else 0
                    events.append({
                        "timestamp":      (t + timedelta(seconds=30)).isoformat(),
                        "event_type":     "keystrokes",
                        "cursor_x":       0,
                        "cursor_y":       0,
                        "keystrokes":     keys,
                        "active_window":  app,
                        "employee_id":    employee_id,
                        "ram_usage_gb":   ram,
                        "scroll_distance": random.randint(0, 20),
                        "modifier_keys":  has_mod,
                    })

        cur_time += timedelta(minutes=duration)

    return events

# ── Step 5: Upload events in batches ──
def upload_events(events):
    print(f"Inserting {len(events)} events into local SQLite database…")
    conn = sqlite3.connect(LOCAL_DB_PATH)
    cursor = conn.cursor()
    
    for ev in events:
        cursor.execute(
            """INSERT INTO admin_events
               (timestamp, event_type, cursor_x, cursor_y, keystrokes, active_window,
                client_ip, employee_id, ram_usage_gb, scroll_distance, modifier_keys, ram_total_gb)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (ev.get("timestamp"), ev.get("event_type"), ev.get("cursor_x"), ev.get("cursor_y"),
             ev.get("keystrokes"), ev.get("active_window"), "127.0.0.1", ev.get("employee_id"),
             ev.get("ram_usage_gb", 0), ev.get("scroll_distance", 0),
             ev.get("modifier_keys", 0), ev.get("ram_total_gb", 16.0))
        )
        
    conn.commit()
    conn.close()
    print("   Successfully inserted all rows.")

# ── Main ───────────────────────────────────────────────
if __name__ == "__main__":
    profiles = get_local_profiles()
    if not profiles:
        print("No profiles to synchronize. Exiting.")
        sys.exit(1)

    # 1. Clear existing database tables
    clear_local_db()

    # 3. Generate events for all profiles
    all_events = []
    print("\nGenerating realistic workday telemetry for each profile…")
    for idx, p in enumerate(profiles):
        # Shift start times slightly to simulate real working hours diffs
        emp_events = gen_workday(p["full_name"], shift_hours=(idx * 0.5))
        all_events.extend(emp_events)
        print(f"   Generated {len(emp_events)} events for {p['full_name']}")

    # 4. Upload events
    print(f"\nUploading total {len(all_events)} events to Supabase…")
    upload_events(all_events)
    print("\nSuccessfully synchronized local profiles and seeded mock telemetry data!\n")
