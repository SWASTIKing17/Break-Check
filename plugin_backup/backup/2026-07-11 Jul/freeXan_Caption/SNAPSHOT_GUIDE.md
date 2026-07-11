# Git Feature Snapshot Guide — SubMachine v2.0

A simple system to save "working state snapshots" of your code. If a feature breaks later, instantly see exactly what changed since it was last confirmed working.

---

## 📋 Table of Contents
1. [One-Time Setup (5 minutes)](#one-time-setup)
2. [Save a Snapshot (15 seconds)](#save-a-snapshot)
3. [Compare Changes (10 seconds)](#compare-changes)
4. [View All Snapshots](#view-all-snapshots)
5. [Restore a Single File](#restore-a-single-file)

---

## One-Time Setup

**⚠️ Important:** You only do this ONCE. Afterward, taking snapshots is instant.

### Step 1: Open PowerShell
1. Navigate to: `c:\Swastik Development\SubMachine\`
2. Click the address bar and type `powershell` then press Enter
   - You should now see a blue PowerShell window

### Step 2: Initialize Git
Copy and paste this into PowerShell:
```powershell
git init
git add panel/jsx/core/utils.jsx panel/jsx/core/mogrt.jsx panel/jsx/core/sync.jsx panel/jsx/core/timeline.jsx panel/js/command_center_react.js panel/js/tools_refactor.js panel/js/dynamic_ui_manager.js panel/js/phrasing.js .gitignore snapshot.ps1 diff-feature.ps1
git commit -m "initial: project baseline v2.0"
.\snapshot.ps1 baseline
```

### Step 3: Verify
You should see:
```
✓ Snapshot saved: stable/baseline-2026-05-06-1423
```

If you see an error about "PowerShell execution policy", run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Then try Step 2 again.

---

## Save a Snapshot

**When:** After you finish testing a feature and confirm it works perfectly.

**How:** Open PowerShell in the SubMachine folder and run:
```powershell
.\snapshot.ps1 sync-all
```

Replace `sync-all` with your feature name. Examples:
- `.\snapshot.ps1 word-transfer`
- `.\snapshot.ps1 mogrt-load`
- `.\snapshot.ps1 timeline-split`

**Expected output:**
```
✓ Snapshot saved: stable/sync-all-2026-05-06-1423
All snapshots of 'sync-all': git tag -l 'stable/sync-all*'
```

**That's it!** Your working code is now saved. Every time you run this command with the same feature name, a **new timestamped snapshot** is created (old ones are preserved).

---

## Compare Changes

**When:** Your feature broke. You want to see exactly what changed since it was last working.

**How:** Open PowerShell and run:
```powershell
.\diff-feature.ps1 sync-all
```

**Output:** Lines showing exactly what changed:
- Lines starting with `-` = old (working) code
- Lines starting with `+` = new (broken) code  
- Lines with no prefix = unchanged context

**To save the diff to a file:**
```powershell
.\diff-feature.ps1 sync-all > changes.diff
```
This creates a `changes.diff` file you can review in any text editor.

---

## View All Snapshots

**To see every snapshot of a specific feature:**
```powershell
git tag -l "stable/sync-all*"
```

Output:
```
stable/sync-all-2026-05-06-1423
stable/sync-all-2026-05-07-0912
stable/sync-all-2026-05-08-1530
```

**To see ALL snapshots of everything:**
```powershell
git tag -l "stable/*"
```

---

## Restore a Single File

**If you want to restore one file to its last known-good state:**

```powershell
git checkout stable/sync-all -- panel/jsx/core/sync.jsx
```

This pulls `sync.jsx` from the most recent `sync-all` snapshot.

**To restore from a specific older snapshot:**
```powershell
git checkout stable/sync-all-2026-05-06-1423 -- panel/jsx/core/sync.jsx
```

---

## Command Reference

| What You Want | Command |
|---|---|
| **Save current work as "feature-name" snapshot** | `.\snapshot.ps1 feature-name` |
| **See what changed since last snapshot** | `.\diff-feature.ps1 feature-name` |
| **Save diff to a text file** | `.\diff-feature.ps1 feature-name > file.txt` |
| **List all snapshots of a feature** | `git tag -l "stable/feature-name*"` |
| **List all snapshots ever** | `git tag -l "stable/*"` |
| **Restore one file to last snapshot** | `git checkout stable/feature-name -- panel/jsx/core/sync.jsx` |
| **See git history** | `git log --oneline` |

---

## Example Workflow

### Day 1 — Morning: Sync All is working
```powershell
.\snapshot.ps1 sync-all
# ✓ Snapshot saved: stable/sync-all-2026-05-06-1400
```

### Day 1 — Afternoon: You fix a bug in timeline.jsx
Work on `timeline.jsx`, test it, confirm it works.
```powershell
.\snapshot.ps1 timeline-split
# ✓ Snapshot saved: stable/timeline-split-2026-05-06-1630
```

### Day 2 — Morning: Sync All is broken!
```powershell
.\diff-feature.ps1 sync-all
```
Output shows exactly which lines in `sync.jsx` changed since yesterday. You see the problem immediately.

### Day 2 — Fix it
Fix the code, test it again.
```powershell
.\snapshot.ps1 sync-all
# ✓ Snapshot saved: stable/sync-all-2026-05-07-0945
```

Now you have **two** snapshots of `sync-all` — one from yesterday (when it worked) and one from today (current fix).

---

## Troubleshooting

### "git: command not found"
Git is not installed. Download and install from: https://git-scm.com/download/win

### "PowerShell execution policy" error
Run this once:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "No snapshot found for: sync-all"
You haven't saved a snapshot with that name yet. Run:
```powershell
.\snapshot.ps1 sync-all
```

### "fatal: not a git repository"
You skipped the "One-Time Setup" or didn't follow it correctly. Start from [One-Time Setup](#one-time-setup).

---

## Why This Works

- **Git tracks changes** — every snapshot is timestamped and permanent
- **No accidental overwrites** — new snapshots create new tags (`sync-all-2026-05-06` vs `sync-all-2026-05-07`)
- **Compare instantly** — `diff-feature.ps1` shows you exactly which lines changed
- **Simple backup** — if you mess something up badly, restore the whole file from a previous snapshot
- **No complexity** — just two PowerShell scripts and git's built-in features

---

## Questions?

The two scripts (`snapshot.ps1` and `diff-feature.ps1`) are in: `c:\Swastik Development\SubMachine\`

If PowerShell closes after a command, you can safely reopen it and run the same command again — nothing is lost.
