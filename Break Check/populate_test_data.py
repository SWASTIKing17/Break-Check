"""
Break Check  Mock Data Seeder v2
Clears all existing admin_events rows, then inserts one realistic
9-hour workday for a single employee with all V2 fields populated.

Usage:
    python populate_test_data.py [employee_name]
    python populate_test_data.py "Swastik"   (default)
"""
import urllib.request
import urllib.error
import json
import random
import sys
from datetime import datetime, timedelta, timezone
import time

#  Config 
SUPABASE_URL = "https://toidowlqmqbmtrfjvzgt.supabase.co"
TABLE        = "admin_events"
SUPABASE_KEY = "sb_publishable_KSuDUKzHr8kzRV2YlnpP_g_osCedHm8"
BATCH_SIZE   = 200

EMPLOYEE = sys.argv[1] if len(sys.argv) > 1 else "Swastik"

PROJECTS = [
    "Wedding_Highlight_Reel_2026.prproj",
    "Tech_Review_MKBHD_Style_v2.prproj",
]

WINDOWS = {
    "premiere":    lambda proj: f"Adobe Premiere Pro 2024  D:\\Projects\\{proj}",
    "ae":          lambda proj: f"After Effects 2024  D:\\Projects\\{proj.replace('.prproj','.aep')}",
    "chrome":      lambda _:    "Google Chrome  YouTube / Video Assets",
    "explorer":    lambda _:    "File Explorer  D:\\Projects\\Assets",
    "slack":       lambda _:    "Slack  #general",
    "locked":      lambda _:    "Windows Default Lock Screen",
}

#  Step 1: Delete all rows 
def delete_all():
    print(f"  Deleting all rows from {TABLE}")
    url = f"{SUPABASE_URL}/rest/v1/{TABLE}?id=gte.0"
    req = urllib.request.Request(url, method="DELETE")
    req.add_header("apikey",        SUPABASE_KEY)
    req.add_header("Authorization", f"Bearer {SUPABASE_KEY}")
    req.add_header("Prefer",        "return=minimal")
    try:
        with urllib.request.urlopen(req) as r:
            print(f"    Deleted (HTTP {r.getcode()})")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"    Delete failed ({e.code}): {body}")
        sys.exit(1)

#  Step 2: Generate events 
def gen_workday(employee_id):
    """
    Simulates a 9-hour workday from 09:00.

    Blocks (minutes):
      09:00  11:58  (118m) Deep focus  Premiere
      11:58  12:28  (30m)  Lunch break  Slack / locked
      12:28  14:26  (118m) VFX pass  After Effects
      14:26  14:46  (20m)  Short break  Chrome / Slack
      14:46  16:44  (118m) Colour grade  Premiere
      16:44  16:59  (15m)  Admin  Slack / Explorer
      17:00  19:01  (121m) Revisions  Premiere (different project)
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
    )
    # Shift to today's date in local tz for realistic timestamps
    now_local = datetime.now(timezone.utc).astimezone()
    start = start.replace(
        year=now_local.year, month=now_local.month, day=now_local.day
    )

    events   = []
    cur_time = start

    # RAM warms up during the day  starts low, drifts higher
    base_ram = 0.025

    for block_i, (duration, block_type, primary_app) in enumerate(blocks):
        # Switch project halfway through day
        if block_i == 4:
            project_idx = 1
        proj = projects[project_idx]

        for minute in range(duration):
            t = cur_time + timedelta(minutes=minute)
            ts = t.isoformat()

            # RAM creeps up through the session (memory leak simulation)
            ram = round(base_ram + (len(events) / 3000) * 0.12 + random.uniform(-0.002, 0.005), 4)

            if block_type == "break":
                # Break: low activity, Adobe closed
                app = WINDOWS["slack"](proj) if random.random() > 0.4 else WINDOWS["locked"](proj)
                app += " [ADOBE_CLOSED]"
                events.append({
                    "timestamp":      ts,
                    "event_type":     "cursor",
                    "cursor_x":       random.randint(400, 700),
                    "cursor_y":       random.randint(300, 600),
                    "keystrokes":     0,
                    "active_window":  app,
                    "employee_id":    employee_id,
                    "ram_usage_gb":   round(ram * 0.6, 4),   # less RAM on break
                    "scroll_distance": 0,
                    "modifier_keys":  0,
                })
            else:
                # Work block: mix of cursor + keystroke events each minute
                # Occasional distraction into chrome/explorer
                roll = random.random()
                if roll < 0.08:
                    app = WINDOWS["chrome"](proj)
                elif roll < 0.12:
                    app = WINDOWS["explorer"](proj)
                else:
                    app = WINDOWS[primary_app](proj)

                # Cursor event
                events.append({
                    "timestamp":      ts,
                    "event_type":     "cursor",
                    "cursor_x":       random.randint(80, 2500),
                    "cursor_y":       random.randint(80, 1400),
                    "keystrokes":     0,
                    "active_window":  app,
                    "employee_id":    employee_id,
                    "ram_usage_gb":   ram,
                    "scroll_distance": random.randint(0, 45) if primary_app in ("premiere","ae") else random.randint(0, 8),
                    "modifier_keys":  0,
                })

                # Keystroke event (not every minute  editors aren't always typing)
                if random.random() < 0.65:
                    keys      = random.randint(2, 55)
                    # Higher modifier ratio for NLE apps (shortcut-heavy)
                    mod_prob  = 0.72 if primary_app in ("premiere","ae") else 0.25
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
                        "scroll_distance": random.randint(0, 15),
                        "modifier_keys":  has_mod,
                    })

        cur_time += timedelta(minutes=duration)

    return events

#  Step 3: POST events in batches 
def insert_events(events):
    url = f"{SUPABASE_URL}/rest/v1/{TABLE}"
    total = len(events)
    sent  = 0
    for i in range(0, total, BATCH_SIZE):
        batch = events[i:i + BATCH_SIZE]
        req = urllib.request.Request(url, method="POST")
        req.add_header("apikey",        SUPABASE_KEY)
        req.add_header("Authorization", f"Bearer {SUPABASE_KEY}")
        req.add_header("Content-Type",  "application/json")
        req.add_header("Prefer",        "return=minimal")
        data = json.dumps(batch).encode("utf-8")
        try:
            with urllib.request.urlopen(req, data=data) as r:
                sent += len(batch)
                pct = sent / total * 100
                print(f"    Batch {i//BATCH_SIZE + 1}: {len(batch)} rows  HTTP {r.getcode()}  ({pct:.0f}%)")
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            print(f"    Batch failed ({e.code}): {body}")
            break
        time.sleep(0.3)

#  Main 
if __name__ == "__main__":
    print(f"\n{'='*52}")
    print(f"  Break Check Mock Data Seeder v2")
    print(f"  Employee : {EMPLOYEE}")
    print(f"  Date     : {datetime.now().strftime('%Y-%m-%d')}")
    print(f"{'='*52}\n")

    delete_all()

    print(f"\n Generating 9-hour workday for '{EMPLOYEE}'")
    events = gen_workday(EMPLOYEE)
    print(f"   Generated {len(events)} events.")

    print(f"\n Inserting into Supabase")
    insert_events(events)

    print(f"\n Done! Dashboard is ready to load '{EMPLOYEE}'s data.\n")
