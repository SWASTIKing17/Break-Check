import time
import sqlite3
import threading
import os
import sys
import json
import urllib.request
import urllib.error
import psutil
from datetime import datetime

# Cross-platform window tracking
def get_active_window_title():
    if sys.platform in ['win32', 'cygwin']:
        try:
            import ctypes
            hwnd = ctypes.windll.user32.GetForegroundWindow()
            length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
            buf = ctypes.create_unicode_buffer(length + 1)
            ctypes.windll.user32.GetWindowTextW(hwnd, buf, length + 1)
            return buf.value
        except Exception as e:
            print(f"[DEBUG] Windows Window Fetch Error: {e}")
            return ""
    elif sys.platform == 'darwin':
        try:
            import subprocess
            script = 'tell application "System Events" to get title of window 1 of (every process whose frontmost is true)'
            res = subprocess.check_output(['osascript', '-e', script], stderr=subprocess.DEVNULL)
            return res.decode('utf-8').strip()
        except Exception as e:
            print(f"[DEBUG] Mac Window Fetch Error: {e}")
            return ""
    return ""

# Cross-platform imports
try:
    from pynput import keyboard, mouse
    PYINPUT_AVAILABLE = True
except ImportError:
    PYINPUT_AVAILABLE = False

# Config
def get_current_employee():
    try:
        if os.path.exists('current_profile.txt'):
            with open('current_profile.txt', 'r') as f:
                name = f.read().strip()
                if name: return name
    except:
        pass
    return "Swastik"

API_KEY = ".HVb2$35*.R5QqS"
CURSOR_INTERVAL = 60           # 60 seconds (1 minute) optimal for team
KEYSTROKE_MAX_INTERVAL = 300   # 5 minutes optimal for team
POLL_INTERVAL = 1              # 1 second for checking window changes
SYNC_INTERVAL = 60             # 1 minute for syncing to admin dashboard
DATA_FILE = "employee_usage_data.db"
ADMIN_API_URL = "https://voluble-basbousa-2977b2.netlify.app/api/ingest"

# Globals
keystroke_count = 0
modifier_key_count = 0   # Count of keystrokes that had a modifier held
scroll_distance = 0      # Accumulated scroll ticks since last keystroke flush

MODIFIER_KEYS = set()
try:
    MODIFIER_KEYS = {
        keyboard.Key.ctrl, keyboard.Key.ctrl_l, keyboard.Key.ctrl_r,
        keyboard.Key.alt, keyboard.Key.alt_l, keyboard.Key.alt_r,
        keyboard.Key.shift, keyboard.Key.shift_l, keyboard.Key.shift_r,
        keyboard.Key.cmd, keyboard.Key.cmd_l, keyboard.Key.cmd_r,
    }
except Exception:
    pass

active_modifiers = set()  # Which modifier keys are currently held down

def get_ram_usage_gb():
    """Returns RAM used by the current process in GB. Zero-cost, pure psutil."""
    try:
        proc = psutil.Process(os.getpid())
        return round(proc.memory_info().rss / (1024 ** 3), 3)
    except Exception:
        return 0.0

def get_ram_total_gb():
    try:
        return round(psutil.virtual_memory().total / (1024 ** 3), 3)
    except Exception:
        return 16.0

def init_db():
    conn = sqlite3.connect(DATA_FILE)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS usage_events
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  timestamp TEXT,
                  event_type TEXT,
                  cursor_x INTEGER,
                  cursor_y INTEGER,
                  keystrokes INTEGER,
                  active_window TEXT,
                  synced INTEGER DEFAULT 0,
                  employee_id TEXT,
                  ram_usage_gb REAL,
                  scroll_distance INTEGER,
                  modifier_keys INTEGER,
                  ram_total_gb REAL)''')
    # Safe migrations for existing databases
    for col, typedef in [
        ('employee_id',    'TEXT'),
        ('ram_usage_gb',   'REAL'),
        ('scroll_distance','INTEGER'),
        ('modifier_keys',  'INTEGER'),
        ('ram_total_gb',   'REAL'),
    ]:
        try:
            c.execute(f'ALTER TABLE usage_events ADD COLUMN {col} {typedef}')
        except Exception:
            pass
    conn.commit()
    conn.close()

def save_event(event_type, cursor_x, cursor_y, keystrokes, active_window,
               ram_usage_gb=0.0, scroll_dist=0, has_modifier=0, ram_total_gb=0.0):
    try:
        conn = sqlite3.connect(DATA_FILE)
        c = conn.cursor()
        c.execute(
            '''INSERT INTO usage_events
               (timestamp, event_type, cursor_x, cursor_y, keystrokes,
                active_window, employee_id, ram_usage_gb, scroll_distance, modifier_keys, ram_total_gb)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (datetime.now().astimezone().isoformat(), event_type,
             cursor_x, cursor_y, keystrokes, active_window,
             get_current_employee(), ram_usage_gb, scroll_dist, has_modifier, ram_total_gb)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DEBUG] DB Save Error: {e}")

# ── Keyboard callbacks ────────────────────────────────────────────────────────

def on_press(key):
    global keystroke_count, modifier_key_count
    if key in MODIFIER_KEYS:
        active_modifiers.add(key)
    else:
        keystroke_count += 1
        if active_modifiers:          # A real key was pressed while a modifier was held
            modifier_key_count += 1

def on_release(key):
    active_modifiers.discard(key)

# ── Scroll callback ───────────────────────────────────────────────────────────

def on_scroll(x, y, dx, dy):
    global scroll_distance
    scroll_distance += abs(dy)        # dy is the vertical tick; abs() for both directions

# ── Cursor position ───────────────────────────────────────────────────────────

def get_cursor_position():
    try:
        if PYINPUT_AVAILABLE:
            return mouse.Controller().position
        else:
            import pyautogui
            return pyautogui.position()
    except Exception:
        return (0, 0)

def is_adobe_running():
    if sys.platform in ['win32', 'cygwin']:
        try:
            import subprocess
            out = subprocess.check_output(
                'tasklist /FI "IMAGENAME eq Adobe Premiere Pro.exe" /NH', shell=True).decode()
            if "Adobe Premiere Pro.exe" in out: return True
            out2 = subprocess.check_output(
                'tasklist /FI "IMAGENAME eq AfterFX.exe" /NH', shell=True).decode()
            if "AfterFX.exe" in out2: return True
        except Exception:
            pass
    return False

# ── Recording threads ─────────────────────────────────────────────────────────

def record_cursor():
    ram_total = get_ram_total_gb()
    while True:
        try:
            x, y = get_cursor_position()
            window_title = get_active_window_title()
            ram = get_ram_usage_gb()
            if not is_adobe_running():
                window_title += " [ADOBE_CLOSED]"
            print(f"[DEBUG] Cursor Event -> X:{x} Y:{y} RAM:{ram}GB Window:{window_title}")
            save_event("cursor", x, y, 0, window_title, ram_usage_gb=ram, ram_total_gb=ram_total)
        except Exception as e:
            print(f"Cursor error: {e}")
        time.sleep(CURSOR_INTERVAL)

def record_keystrokes():
    global keystroke_count, modifier_key_count, scroll_distance

    last_window_title = get_active_window_title()
    last_record_time = time.time()

    while True:
        try:
            current_window_title = get_active_window_title()
            time_now = time.time()

            window_changed = current_window_title != last_window_title
            time_exceeded = (time_now - last_record_time) >= KEYSTROKE_MAX_INTERVAL

            if window_changed or time_exceeded:
                count          = keystroke_count;    keystroke_count = 0
                mod_count      = modifier_key_count;  modifier_key_count = 0
                scroll         = scroll_distance;     scroll_distance = 0
                has_modifier   = 1 if mod_count > 0 else 0
                ram            = get_ram_usage_gb()
                ram_total      = get_ram_total_gb()

                trigger = 'Window Change' if window_changed else 'Time Limit'
                print(f"[DEBUG] Keystroke Event -> Count:{count} Modifiers:{mod_count} "
                      f"Scroll:{scroll} RAM:{ram}GB Window:{last_window_title} (Trigger: {trigger})")

                save_event("keystrokes", 0, 0, count, last_window_title,
                           ram_usage_gb=ram, scroll_dist=scroll, has_modifier=has_modifier, ram_total_gb=ram_total)

                last_window_title = current_window_title
                last_record_time = time_now

        except Exception as e:
            print(f"Keystroke error: {e}")

        time.sleep(POLL_INTERVAL)

# ── Sync thread ───────────────────────────────────────────────────────────────

def sync_data():
    while True:
        time.sleep(SYNC_INTERVAL)
        try:
            conn = sqlite3.connect(DATA_FILE)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT * FROM usage_events WHERE synced = 0 LIMIT 100")
            rows = c.fetchall()
            if rows:
                payload  = [dict(row) for row in rows]
                row_ids  = [row['id'] for row in rows]
                req = urllib.request.Request(ADMIN_API_URL, method="POST")
                req.add_header('Content-Type', 'application/json')
                req.add_header('x-api-key', API_KEY)
                data_bytes = json.dumps(payload).encode('utf-8')
                print(f"[DEBUG] Syncing {len(payload)} events to Admin Dashboard...")
                try:
                    response = urllib.request.urlopen(req, data=data_bytes, timeout=10)
                    if response.getcode() in [200, 201]:
                        placeholders = ','.join('?' * len(row_ids))
                        c.execute(f"UPDATE usage_events SET synced = 1 WHERE id IN ({placeholders})", row_ids)
                        conn.commit()
                        print(f"[DEBUG] Successfully synced {len(payload)} events.")
                    else:
                        print(f"[DEBUG] Sync failed with status: {response.getcode()}")
                except urllib.error.URLError as e:
                    print(f"[DEBUG] Sync connection failed (Offline?): {e.reason}")
            conn.close()
        except Exception as e:
            print(f"[DEBUG] Sync Error: {e}")

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Starting cross-platform usage monitor (SQLite Mode)...")
    init_db()

    if PYINPUT_AVAILABLE:
        kb_listener = keyboard.Listener(on_press=on_press, on_release=on_release)
        kb_listener.daemon = True
        kb_listener.start()

        mouse_listener = mouse.Listener(on_scroll=on_scroll)
        mouse_listener.daemon = True
        mouse_listener.start()

        print("Keyboard + scroll monitoring active")
    else:
        print("Warning: pynput not installed. Keyboard/scroll monitoring disabled.")

    cursor_thread    = threading.Thread(target=record_cursor,    daemon=True)
    keystroke_thread = threading.Thread(target=record_keystrokes, daemon=True)
    sync_thread      = threading.Thread(target=sync_data,        daemon=True)

    cursor_thread.start()
    keystroke_thread.start()
    sync_thread.start()

    print(f"Monitoring started. Data saved to {DATA_FILE}")
    print("Press Ctrl+C to stop.")

    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        print("\nStopping monitor...")
        print("Goodbye.")