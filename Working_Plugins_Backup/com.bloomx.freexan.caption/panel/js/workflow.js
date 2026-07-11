/**
 * freeXan Caption — Workflow Engine
 * Manages the 4-step caption pipeline:
 *   1. Detect exported Hindi SRT from project folder (via freeXan WS)
 *   2. Copy SRT + skill prompt as files to clipboard
 *   3. Detect hinglish_*.srt, word-split multi-word lines, feed into pipeline
 *   4. Trigger existing createCaptions engine
 */
(function () {
    'use strict';

    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { exec } = require('child_process');

    // ── State ──────────────────────────────────────────────────────────────────
    let projectFolder = null;
    let exportedSrtPath = null;   // step 1 — the Hindi SRT the user exported
    let wordByWordPath = null;   // step 3 — LLM output
    let srtPollTimer = null;
    let wbwPollTimer = null;
    let wsRetryTimer = null;
    let ws = null;
    let detectedSrtKey = '';     // tracks last-seen file list to avoid re-render thrashing
    let detectedWbwKey = '';     // tracks last-seen Hinglish file list to avoid re-render thrashing

    // ── DOM references (resolved after DOMContentLoaded) ──────────────────────
    let els = {};

    // ── freeXan WebSocket ──────────────────────────────────────────────────────
    const WS_URL = 'ws://localhost:4554';

    function connectFreeXan() {
        try {
            ws = new WebSocket(WS_URL);

            ws.onopen = function () {
                requestProjectState();
            };

            ws.onmessage = function (e) {
                let msg;
                try { msg = JSON.parse(e.data); } catch (_) { return; }

                // MISTER BloomX → freeXan → freeXan Caption: apply selected MOGRT
                if (msg.type === 'mogrt_ready') {
                    var localPath = msg.localPath || msg.originalPath;
                    if (!localPath) return;

                    // Populate freeXan Caption's MOGRT file input and fire its change event
                    var mogrtInput = document.getElementById('mogrtFile');
                    if (mogrtInput) {
                        mogrtInput.value = localPath;
                        mogrtInput.dispatchEvent(new Event('change'));
                    }

                    // Also trigger the selectMogrt button flow if input wiring isn't enough
                    var hiddenInput = document.getElementById('smAssetFolderPath');
                    if (hiddenInput) hiddenInput.value = '';

                    console.log('[freeXan Caption] mogrt_ready — loaded: ' + localPath);
                    return;
                }

                if (msg.type !== 'project_state') return;

                if (msg.connected && msg.projectPath) {
                    // Premiere has a project open — we have a path.
                    // Watch the folder that CONTAINS the project folder, not the project folder itself.
                    if (wsRetryTimer) { clearTimeout(wsRetryTimer); wsRetryTimer = null; }
                    projectFolder = path.dirname(path.dirname(msg.projectPath));
                    onProjectFolderKnown();
                } else {
                    // freeXan is reachable but Premiere hasn't pushed a project yet
                    setDot('wf-s1-dot', 'warn');
                    setMsg('wf-s1-msg', 'Open a project in Premiere — retrying...');
                    // Re-poll every 4 s until Premiere is ready
                    if (!wsRetryTimer) {
                        wsRetryTimer = setInterval(requestProjectState, 4000);
                    }
                }
            };

            ws.onerror = function () { onFreeXanUnavailable(); };
            ws.onclose = function () {
                if (wsRetryTimer) { clearInterval(wsRetryTimer); wsRetryTimer = null; }
                if (!projectFolder) {
                    wsRetryTimer = setTimeout(connectFreeXan, 8000);
                }
            };
        } catch (e) {
            onFreeXanUnavailable();
        }
    }

    // ── MISTER BloomX CSEvent Listener (Primary) ──────────────────────────────
    function initBloomXListener() {
        try {
            var csInterface = new window.CSInterface();
            csInterface.addEventListener("com.freexan.caption.executeAction", function(event) {
                var payload;
                try { payload = JSON.parse(event.data); } catch(e) { return; }
                
                console.log('[freeXan Caption] Received BloomX action: ' + payload.action);
                
                // Populate the global MOGRT file input
                var mogrtInput = document.getElementById('mogrtFile');
                if (mogrtInput && payload.mogrtPath) {
                    mogrtInput.value = payload.mogrtPath;
                    mogrtInput.dispatchEvent(new Event('change'));
                }

                if (payload.action === 'apply_new') {
                    // Done. The UI input is populated for Create Subs.
                } else if (payload.action === 'replace_selected' || payload.action === 'sync_style') {
                    // Dispatch custom event to React (command_center_react.js)
                    var evt = new CustomEvent("freexan-caption:" + payload.action, { detail: payload });
                    window.dispatchEvent(evt);
                }
            });
        } catch (e) {
            console.warn("CSInterface not available for BloomX events");
        }
    }

    function requestProjectState() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'get_project_state' }));
        }
    }

    function onFreeXanUnavailable() {
        setDot('wf-s1-dot', 'warn');
        setMsg('wf-s1-msg', 'freeXan not found — browse manually');
    }

    function onProjectFolderKnown() {
        // Stop any pending retry timers — we have what we need
        if (wsRetryTimer) { clearInterval(wsRetryTimer); clearTimeout(wsRetryTimer); wsRetryTimer = null; }
        setDot('wf-s1-dot', 'pulse');
        setMsg('wf-s1-msg', 'Watching: ' + path.basename(projectFolder));
        startSrtPoll();
    }

    // ── Step 1: Poll project folder for exported *.srt ────────────────────────
    function startSrtPoll() {
        if (srtPollTimer) clearInterval(srtPollTimer);
        checkForExportedSrt();
        srtPollTimer = setInterval(checkForExportedSrt, 2500);
    }

    function checkForExportedSrt() {
        if (!projectFolder) return;
        try {
            const files = fs.readdirSync(projectFolder)
                .filter(function (f) {
                    const lower = f.toLowerCase();
                    return lower.endsWith('.srt') && !lower.startsWith('hinglish_');
                })
                .map(function (f) {
                    const full = path.join(projectFolder, f);
                    return { name: f, full: full, mtime: fs.statSync(full).mtimeMs };
                })
                .sort(function (a, b) { return b.mtime - a.mtime; });

            const key = files.map(function (f) { return f.full; }).join('|');
            if (key !== detectedSrtKey && files.length > 0) {
                detectedSrtKey = key;
                onSrtCandidatesFound(files);
            }
        } catch (_) { }
    }

    // Show all detected SRT files as clickable confirm-badges.
    // Step 1 stays "active" until the user clicks one to confirm.
    function onSrtCandidatesFound(files) {
        const container = document.getElementById('wf-s1-file');
        if (!container) return;

        container.innerHTML = '';
        files.forEach(function (f) {
            const btn = document.createElement('button');
            btn.className = 'wf-file-badge-item';
            btn.textContent = f.name;
            btn.title = 'Click to confirm — renames to Hindi.srt';
            btn.addEventListener('click', function () { confirmSrt(f.full); });
            container.appendChild(btn);
        });
        container.style.display = 'flex';

        setDot('wf-s1-dot', 'ok');
        setMsg('wf-s1-msg', files.length > 1 ? 'Multiple SRTs — click to confirm' : 'Click to confirm');
    }

    // User clicked a badge: rename the file to Hindi.srt, lock in the path, advance.
    function confirmSrt(fullPath) {
        const targetPath = path.join(path.dirname(fullPath), 'Hindi.srt');

        if (fullPath !== targetPath) {
            try {
                fs.renameSync(fullPath, targetPath);
            } catch (e) {
                flashMsg('wf-s1-msg', 'Rename failed: ' + e.message, 'error');
                return;
            }
        }

        exportedSrtPath = targetPath;
        clearInterval(srtPollTimer);

        const container = document.getElementById('wf-s1-file');
        if (container) {
            container.innerHTML = '';
            const badge = document.createElement('span');
            badge.className = 'wf-file-badge-item wf-file-badge-confirmed';
            badge.textContent = 'Hindi.srt';
            container.appendChild(badge);
        }

        setDot('wf-s1-dot', 'ok');
        setMsg('wf-s1-msg', 'Confirmed');
        markDone(1);
        unlockStep(2);
    }

    // ── Step 2: Copy SRT + skill file to clipboard via PowerShell ─────────────
    function copyPayloadToClipboard() {
        if (!exportedSrtPath) {
            flashMsg('wf-s2-msg', 'No SRT detected — complete step 1 first.', 'error');
            return;
        }

        const skillPath = getSkillPath();
        if (!fs.existsSync(skillPath)) {
            flashMsg('wf-s2-msg', 'Skill file missing. Place it at: ' + skillPath, 'error');
            console.log('[freeXan Caption] Skill file not found at: ' + skillPath);
            return;
        }

        setBtnState('wf-copy-btn', true, 'Copying...');

        // Escape single quotes in paths for PowerShell single-quoted strings
        const srtEsc = exportedSrtPath.replace(/'/g, "''");
        const skillEsc = skillPath.replace(/'/g, "''");

        const ps = [
            'Add-Type -AssemblyName System.Windows.Forms',
            '$fc = New-Object System.Collections.Specialized.StringCollection',
            "$fc.Add('" + srtEsc + "')",
            "$fc.Add('" + skillEsc + "')",
            '[System.Windows.Forms.Clipboard]::SetFileDropList($fc)',
            "Start-Process 'https://claude.ai/new'"
        ].join('; ');

        exec('powershell -NoProfile -NonInteractive -Command "' + ps + '"', function (err) {
            setBtnState('wf-copy-btn', false, '<i class="fas fa-copy" style="margin-right:7px;"></i>Copy to AI');
            if (err) {
                flashMsg('wf-s2-msg', 'Clipboard error: ' + err.message, 'error');
                return;
            }
            flashMsg('wf-s2-msg', '2 files copied — paste into your AI chat', 'ok');
            markDone(2);
            unlockStep(3);
            startWbwPoll();
        });
    }

    function getSkillPath() {
        let root = '';

        // Primary: CSInterface gives us the extension install root reliably
        try {
            const cs = new CSInterface();
            root = cs.getSystemPath(SystemPath.EXTENSION);
        } catch (_) { }

        // Fallback: derive from panel.html URL
        // URL is  file:///C:/path/to/extension/panel/panel.html
        if (!root) {
            try {
                root = decodeURIComponent(window.location.pathname)
                    .replace(/^\//, '')             // strip leading /
                    .replace(/\\/g, '/')             // normalise to forward slashes
                    .replace(/\/panel\/[^/]*$/, '')  // strip /panel/panel.html
                    .replace(/\//g, path.sep);       // back to OS separators
            } catch (_) { }
        }

        // Skill file lives at: <extension_root>\panel\prompt\Hindi to Hinglish SRT.SKILL.md
        const candidate = path.join(root, 'panel', 'prompt', 'Hindi to Hinglish SRT.SKILL.md');
        console.log('[freeXan Caption] skill path: "' + candidate + '" exists=' + fs.existsSync(candidate));
        return candidate; // always return the path so error messages show it
    }

    // ── Step 3: Poll for hinglish_*.srt ─────────────────────────────────────────────────
    function startWbwPoll() {
        setDot('wf-s3-dot', 'pulse');
        setMsg('wf-s3-msg', 'Watching for hinglish_*.srt...');
        if (wbwPollTimer) clearInterval(wbwPollTimer);
        checkForWbw();
        wbwPollTimer = setInterval(checkForWbw, 2500);
    }

    function checkForWbw() {
        if (!projectFolder) return;
        try {
            const files = fs.readdirSync(projectFolder)
                .filter(function (f) {
                    const lower = f.toLowerCase();
                    return lower.startsWith('hinglish_') && lower.endsWith('.srt');
                })
                .map(function (f) {
                    const full = path.join(projectFolder, f);
                    return { name: f, full: full, mtime: fs.statSync(full).mtimeMs };
                })
                .sort(function (a, b) { return b.mtime - a.mtime; });

            const key = files.map(function (f) { return f.full; }).join('|');
            if (key !== detectedWbwKey && files.length > 0) {
                detectedWbwKey = key;
                onWbwCandidatesFound(files);
            }
        } catch (_) { }
    }

    function onWbwCandidatesFound(files) {
        const container = document.getElementById('wf-s3-file');
        if (!container) return;

        container.innerHTML = '';
        files.forEach(function (f) {
            const btn = document.createElement('button');
            btn.className = 'wf-file-badge-item';
            btn.textContent = f.name;
            btn.title = 'Click to confirm — feeds ' + f.name + ' into pipeline';
            btn.addEventListener('click', function () { onWbwFound(f.full); });
            container.appendChild(btn);
        });
        container.style.display = 'block';

        setDot('wf-s3-dot', 'pulse');
        setMsg('wf-s3-msg', files.length > 1 ? 'Multiple Hinglish SRTs — click to confirm' : 'Click to confirm Hinglish SRT');
    }

    function onWbwFound(fullPath) {
        wordByWordPath = fullPath;
        if (wbwPollTimer) { clearInterval(wbwPollTimer); wbwPollTimer = null; }

        // Word-split: break any multi-word lines into individual word entries
        const processed = splitToWords(fullPath);
        if (!processed) {
            flashMsg('wf-s3-msg', 'Could not parse ' + path.basename(fullPath), 'error');
            setDot('wf-s3-dot', 'error');
            return;
        }

        // Write processed SRT to temp file
        const tempPath = path.join(os.tmpdir(), 'sm_wbw_processed_' + Date.now() + '.srt');
        try {
            fs.writeFileSync(tempPath, processed, 'utf8');
        } catch (e) {
            flashMsg('wf-s3-msg', 'Temp write failed: ' + e.message, 'error');
            return;
        }

        // Feed into the existing pipeline
        const srtInput = document.getElementById('srtFilePath');
        if (srtInput) {
            srtInput.value = tempPath;
            srtInput.dispatchEvent(new Event('change'));
        }

        // Lock chars-per-phrase slider at 100 so phrasing.js doesn't re-split
        const slider = document.getElementById('range-slider__range');
        if (slider) { slider.value = 100; slider.dispatchEvent(new Event('input')); }

        setDot('wf-s3-dot', 'ok');
        setMsg('wf-s3-msg', 'Ready');
        
        const container = document.getElementById('wf-s3-file');
        if (container) {
            container.innerHTML = '';
            const badge = document.createElement('span');
            badge.className = 'wf-file-badge-item wf-file-badge-confirmed';
            badge.textContent = path.basename(fullPath) + ' (' + countEntries(processed) + ' words)';
            container.appendChild(badge);
            container.style.display = 'block';
        }
        
        markDone(3);
        unlockStep(4);
    }

    // ── Word splitter ──────────────────────────────────────────────────────────
    // Reads the SRT, splits any entry that has 2+ words into N single-word
    // entries with evenly distributed timing, then re-numbers from 1.
    function splitToWords(filePath) {
        let raw;
        try { raw = fs.readFileSync(filePath, 'utf8'); } catch (e) { return null; }

        const blocks = raw.trim().split(/\r?\n\r?\n/);
        const out = [];
        let idx = 1;

        for (let i = 0; i < blocks.length; i++) {
            const lines = blocks[i].split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) continue;

            // Tolerate blocks that start with a number line or go straight to timestamp
            const tsLine = lines.find(l => l.includes('-->'));
            if (!tsLine) continue;
            const tsMatch = tsLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
            if (!tsMatch) continue;

            const startMs = tsToMs(tsMatch[1]);
            const endMs = tsToMs(tsMatch[2]);
            const tsIdx = lines.indexOf(tsLine);
            const text = lines.slice(tsIdx + 1).join(' ').trim();
            if (!text) continue;

            const words = text.split(/\s+/).filter(Boolean);
            if (words.length === 1) {
                out.push(idx++ + '\n' + msToTs(startMs) + ' --> ' + msToTs(endMs) + '\n' + words[0]);
            } else {
                const dur = (endMs - startMs) / words.length;
                for (let w = 0; w < words.length; w++) {
                    const wStart = Math.round(startMs + w * dur);
                    const wEnd = Math.round(startMs + (w + 1) * dur);
                    out.push(idx++ + '\n' + msToTs(wStart) + ' --> ' + msToTs(wEnd) + '\n' + words[w]);
                }
            }
        }
        return out.join('\n\n') + '\n';
    }

    function tsToMs(ts) {
        const [h, m, rest] = ts.replace(',', '.').split(':');
        const [s, ms] = rest.split('.');
        return (+h * 3600 + +m * 60 + +s) * 1000 + +ms;
    }

    function msToTs(ms) {
        const h = Math.floor(ms / 3600000); ms %= 3600000;
        const m = Math.floor(ms / 60000); ms %= 60000;
        const s = Math.floor(ms / 1000); ms %= 1000;
        return pad2(h) + ':' + pad2(m) + ':' + pad2(s) + ',' + pad3(ms);
    }

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function pad3(n) { return n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n; }

    function countEntries(srt) {
        return (srt.match(/^\d+$/mg) || []).length;
    }

    // ── Manual browse fallbacks ────────────────────────────────────────────────
    function browseSrt() {
        if (!window.cep) return;
        const r = window.cep.fs.showOpenDialog(false, false, 'Select exported Hindi SRT', '', ['srt']);
        if (r.err !== 0 || !r.data || !r.data.length) return;
        const full = r.data[0];
        if (!projectFolder) projectFolder = path.dirname(full);
        confirmSrt(full);
    }

    function browseWbw() {
        if (!window.cep) return;
        const r = window.cep.fs.showOpenDialog(false, false, 'Select Hinglish SRT', '', ['srt']);
        if (r.err !== 0 || !r.data || !r.data.length) return;
        onWbwFound(r.data[0]);
    }

    // ── UI helpers ─────────────────────────────────────────────────────────────
    function unlockStep(n) {
        const card = document.getElementById('wf-step-' + n);
        if (!card) return;
        card.classList.remove('wf-locked');
        card.classList.add('wf-active');
        const conn = document.getElementById('wf-conn-' + (n - 1) + n);
        if (conn) conn.classList.add('wf-lit');
    }

    function markDone(n) {
        const card = document.getElementById('wf-step-' + n);
        if (card) { card.classList.remove('wf-active'); card.classList.add('wf-done'); }
    }

    function setDot(id, state) {
        const el = document.getElementById(id);
        if (!el) return;
        el.className = 'wf-dot' + (state ? ' wf-dot-' + state : '');
    }

    function setMsg(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function showFileBadge(id, name) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = name;
        el.style.display = 'block';
    }

    function flashMsg(id, text, type) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        el.style.color = type === 'error' ? '#ef4444' : '#22c55e';
        el.style.display = 'block';
        setTimeout(function () { el.style.display = 'none'; }, 15000);
    }

    function setBtnState(id, disabled, html) {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = disabled;
        el.innerHTML = html;
    }

    // ── Init ───────────────────────────────────────────────────────────────────
    function init() {
        const copyBtn = document.getElementById('wf-copy-btn');
        const browseSrtBtn = document.getElementById('wf-browse-srt');
        const browseWbwBtn = document.getElementById('wf-browse-wbw');

        if (copyBtn) copyBtn.addEventListener('click', copyPayloadToClipboard);
        if (browseSrtBtn) browseSrtBtn.addEventListener('click', browseSrt);
        if (browseWbwBtn) browseWbwBtn.addEventListener('click', browseWbw);

        // Step 1 starts active immediately; connect to freeXan
        setDot('wf-s1-dot', 'pulse');
        setMsg('wf-s1-msg', 'Connecting to freeXan...');
        connectFreeXan();
        initBloomXListener();

        // Auto-fill MOGRT on load if available
        try {
            const cs = window.csInterface || new window.CSInterface();
            const fxDir = require('path').join(cs.getSystemPath(window.SystemPath.USER_DATA), 'freeXan');
            const tempFile = require('path').join(fxDir, 'active_mogrt.txt');
            if (require('fs').existsSync(tempFile)) {
                const mogrtPath = require('fs').readFileSync(tempFile, 'utf8').trim();
                const mogrtInput = document.getElementById('mogrtFile');
                if (mogrtInput && mogrtPath) {
                    mogrtInput.value = mogrtPath;
                    // Note: don't dispatchEvent('change') to avoid triggering React updates before it mounts, just set value visually.
                }
            }
        } catch(e) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

}());
