// ─── State ────────────────────────────────────────────────────
let isConnected        = false;
let currentProjectName = '';   // from CEP WebSocket
let nativeProjectName  = '';   // from PowerShell window-title monitor

// Whether a file drag is currently in progress over this window
let isDragInProgress   = false;

// Link map for the current project — `[{ folderPath, binName, shortcut }, …]`.
// Pushed from main when active project changes.
let linkMap            = [];

// Halo picker state — activated when user drops with Ctrl held
let pickerActive       = false;
let pickerFiles        = null;
let pickerMoveMode     = false;
let pickerTimeoutId    = null;
let pickerLastCtrlUp   = 0;

window.addEventListener('DOMContentLoaded', () => {
    const pill       = document.getElementById('overlay-pill');
    const statusText = document.getElementById('status-text');
    const projText   = document.getElementById('project-text');
    const statusDot  = document.getElementById('status-dot');

    // BUG-26: guard against missing DOM elements
    if (!pill || !statusText || !projText || !statusDot) {
        console.error('Overlay: required DOM elements missing');
        return;
    }

    // ─── 1. Window drag-to-reposition ────────────────────────
    let isMoving = false;
    let sx = 0, sy = 0;

    pill.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isMoving = true;
        sx = e.screenX;
        sy = e.screenY;
        pill.classList.add('pill-dragging');
        e.preventDefault();
    });

    let mouseMovePending = false; // BUG-29: throttle IPC to one frame
    window.addEventListener('mousemove', (e) => {
        if (isMoving) {
            window.api.moveOverlayWindow({
                deltaX: e.screenX - sx,
                deltaY: e.screenY - sy,
            });
            sx = e.screenX;
            sy = e.screenY;
            return;
        }

        // Pass clicks through when cursor is outside the pill — throttled to one rAF per frame
        if (!mouseMovePending) {
            mouseMovePending = true;
            const r    = pill.getBoundingClientRect();
            const over = e.clientX >= r.left && e.clientX <= r.right &&
                         e.clientY >= r.top  && e.clientY <= r.bottom;
            requestAnimationFrame(() => {
                window.api.setIgnoreMouseEvents(!over, { forward: true });
                mouseMovePending = false;
            });
        }
    });

    window.addEventListener('mouseup', () => {
        if (isMoving) { isMoving = false; pill.classList.remove('pill-dragging'); }
    });

    window.addEventListener('blur', () => {
        if (isMoving) { isMoving = false; pill.classList.remove('pill-dragging'); }
    });

    // ─── 2. File-drag expand ──────────────────────────────────
    // dragenter on pill is unreliable with setIgnoreMouseEvents.
    // Instead, use window-level dragover (which fires via preload's capture
    // listener) and manually hit-test against the pill bounding rect.
    //
    // Rules:
    //  • Cursor over pill for 1.5 s while dragging → expand.
    //  • Cursor leaves pill (or window) → cancel timer; if already expanded,
    //    collapse after 1.5 s.
    //  • Drop → collapse immediately (processing/success/error feedback).

    let expandTimer   = null;
    let collapseTimer = null;
    let overPill      = false;

    function clearTimers() {
        clearTimeout(expandTimer);
        clearTimeout(collapseTimer);
        expandTimer = collapseTimer = null;
    }

    window.addEventListener('dragover', (e) => {
        e.preventDefault();

        const r = pill.getBoundingClientRect();
        const hit = e.clientX >= r.left && e.clientX <= r.right &&
                    e.clientY >= r.top  && e.clientY <= r.bottom;

        if (hit && !overPill) {
            // Entered pill zone — start expand timer
            overPill = true;
            clearTimeout(collapseTimer);
            collapseTimer = null;
            if (!expandTimer && !pill.classList.contains('drag-active') && !isAnimating()) {
                expandTimer = setTimeout(() => {
                    expandTimer = null;
                    if (overPill && !isAnimating()) setDragActive();
                }, 500);
            }
        } else if (!hit && overPill) {
            // Left pill zone — cancel expand, maybe start collapse
            overPill = false;
            clearTimeout(expandTimer);
            expandTimer = null;
            if (pill.classList.contains('drag-active') && !collapseTimer) {
                collapseTimer = setTimeout(() => {
                    collapseTimer = null;
                    isDragInProgress = false;
                    if (!isAnimating()) restoreIdle();
                }, 1500);
            }
        }
    });

    window.addEventListener('dragleave', (e) => {
        // Fires when drag leaves the entire window (relatedTarget is null or outside)
        if (e.relatedTarget !== null) return;
        overPill = false;
        clearTimeout(expandTimer);
        expandTimer = null;
        if (!collapseTimer) {
            collapseTimer = setTimeout(() => {
                collapseTimer = null;
                isDragInProgress = false;
                if (!isAnimating()) restoreIdle();
            }, 1500);
        }
    });

    // BUG-28: reset pill if drag is cancelled (Escape key or released outside window)
    window.addEventListener('dragend', () => {
        isDragInProgress = false;
        clearTimers();
        if (!isAnimating()) restoreIdle();
    });

    // ─── Halo picker keyboard handling ────────────────────────────
    // Only active while the picker is open (the overlay has keyboard focus
    // post-drop). 1–8 picks a bubble; Esc cancels; two quick Ctrl key-ups
    // (within 400 ms) cancels too.
    window.addEventListener('keydown', (e) => {
        if (!pickerActive) return;
        if (e.repeat) return;
        if (/^[1-8]$/.test(e.key)) {
            e.preventDefault();
            pickHaloBubble(e.key);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelHaloPicker('escape');
        }
    });
    window.addEventListener('keyup', (e) => {
        if (!pickerActive) return;
        if (e.key === 'Control') {
            const now = Date.now();
            if (now - pickerLastCtrlUp < 400) {
                cancelHaloPicker('double-ctrl');
                pickerLastCtrlUp = 0;
            } else {
                pickerLastCtrlUp = now;
            }
        }
    });

    // ─── Link map from main (changes when active project changes) ────
    if (window.api.onLinkMapUpdated) {
        window.api.onLinkMapUpdated((data) => {
            linkMap = Array.isArray(data) ? data : [];
            const summary = `link map received: ${linkMap.length} link(s) — ` +
                linkMap.map(l => `${l.shortcut || '-'} → ${l.folderPath}`).join(' | ');
            console.log('[Overlay]', summary);
            if (window.api.overlayLog) window.api.overlayLog(summary);
        });
    }

    // ─── 3. Files received from preload ──────────────────────
    if (window.api.onFilesDropped) {
        window.api.onFilesDropped(async (filePaths, modKeys) => {
            clearTimers();
            overPill = false;
            isDragInProgress = false;
            modKeys = modKeys || {};

            if (!Array.isArray(filePaths) || !filePaths.length) { // BUG-27
                restoreIdle();
                return;
            }

            const dropLog = `drop fired — ctrl:${!!modKeys.ctrlKey} shift:${!!modKeys.shiftKey} | files:${filePaths.length} | linkMap:${linkMap.length}`;
            console.log('[Overlay]', dropLog);
            if (window.api.log) window.api.log('drag_n_drop', dropLog);
            if (window.api.overlayLog) window.api.overlayLog(dropLog);

            // Ctrl held → open the halo picker. Shift held additionally → move mode.
            if (modKeys.ctrlKey) {
                window.api.log('drag_n_drop', 'Ctrl key detected - Opening Halo Picker');
                openHaloPicker(filePaths, !!modKeys.shiftKey);
                return;
            }

            // No Ctrl → normal slot mapping. Shift alone still applies move semantics.
            window.api.log('drag_n_drop', 'No Ctrl key - Proceeding with normal import route');
            await runImport(filePaths, modKeys.shiftKey ? { moveSource: true } : null);
        });
    }

    // ─── Halo picker — open / pick / cancel ───────────────────────
    function openHaloPicker(files, moveMode) {
        pickerActive = true;
        pickerFiles = files;
        pickerMoveMode = moveMode;
        pickerLastCtrlUp = 0;
        document.body.classList.add('halo-mode');
        window.api.resizeOverlay('halo');
        // Move-mode tag chip floats above the pill
        const tag = document.getElementById('halo-mode-tag');
        if (tag) {
            if (moveMode) { tag.textContent = 'MOVE'; tag.hidden = false; }
            else { tag.hidden = true; }
        }
        buildHaloBubbles();
        startUnhoveredTimer();
        // Try to bring focus so number-keys reach our handlers (post-drop the
        // overlay window typically has focus, but be defensive).
        try { window.focus(); } catch (_) {}
    }

    function buildHaloBubbles() {
        const halo = document.getElementById('halo');
        if (!halo) return;
        halo.innerHTML = '';
        halo.hidden = false;
        const radius = 50;        // Tight ring around the 56 px pill (8 px gap)
        const byShortcut = new Map(linkMap.map(l => [String(l.shortcut), l]));
        for (let n = 1; n <= 8; n++) {
            const angleRad = (n - 1) * Math.PI / 4;        // 0°, 45°, 90°, …
            const bx = Math.sin(angleRad) * radius;
            const by = -Math.cos(angleRad) * radius;
            const link = byShortcut.get(String(n));
            const b = document.createElement('div');
            b.className = 'halo-bubble' + (link ? ' assigned' : ' empty');
            b.textContent = String(n);
            b.style.setProperty('--bx', bx.toFixed(2) + 'px');
            b.style.setProperty('--by', by.toFixed(2) + 'px');
            b.style.setProperty('--idx', String(n - 1));
            if (link) {
                b.addEventListener('mouseenter', () => onBubbleEnter(link.folderPath, n));
                b.addEventListener('mouseleave', onBubbleLeave);
                b.addEventListener('click', () => pickHaloBubble(String(n)));
            }
            halo.appendChild(b);
        }
    }

    function onBubbleEnter(folderPath, n) {
        clearTimeout(pickerTimeoutId);
        pickerTimeoutId = null;
        const label = document.getElementById('halo-label');
        if (label) {
            label.textContent = basename(folderPath);
            label.title = folderPath;
            // Position label just outside the bubble, on the side AWAY from
            // the pill, so it never overlaps another bubble.
            const angle = (n - 1) * Math.PI / 4;
            const r = 76;        // 50 (bubble centre) + 14 (bubble r) + ~12 (gap)
            const lx = Math.sin(angle) * r;
            const ly = -Math.cos(angle) * r;
            label.style.transform = `translate(calc(-50% + ${lx.toFixed(1)}px), calc(-50% + ${ly.toFixed(1)}px))`;
            label.hidden = false;
        }
    }

    function onBubbleLeave() {
        const label = document.getElementById('halo-label');
        if (label) label.hidden = true;
        startUnhoveredTimer();
    }

    function startUnhoveredTimer() {
        clearTimeout(pickerTimeoutId);
        pickerTimeoutId = setTimeout(() => {
            if (pickerActive) cancelHaloPicker('timeout');
        }, 6000);
    }

    async function pickHaloBubble(shortcut) {
        if (!pickerActive) return;
        const link = linkMap.find(l => String(l.shortcut) === String(shortcut));
        if (!link) return;          // empty position — ignore
        const files = pickerFiles;
        const moveMode = pickerMoveMode;
        const msg = `halo pick: key ${shortcut} → ${link.folderPath} ${moveMode ? '(MOVE)' : '(COPY)'}`;
        console.log('[Overlay]', msg);
        if (window.api.overlayLog) window.api.overlayLog(msg);
        teardownPicker();
        await runImport(files, { routeToFolder: link.folderPath, moveSource: moveMode });
    }

    function cancelHaloPicker(reason) {
        if (!pickerActive) return;
        const files = pickerFiles;
        const moveMode = pickerMoveMode;
        const msg = `halo cancel: ${reason} → slot mapping ${moveMode ? '(MOVE)' : '(COPY)'}`;
        console.log('[Overlay]', msg);
        if (window.api.overlayLog) window.api.overlayLog(msg);
        teardownPicker();
        window.api.log('drag_n_drop', `Halo Picker Route Selected: ${routeToFolder} (moveMode: ${moveMode})`);
        runImport(files, moveMode ? { moveSource: true, routeToFolder: routeToFolder } : { routeToFolder: routeToFolder });
    }

    function teardownPicker() {
        pickerActive = false;
        pickerFiles = null;
        pickerMoveMode = false;
        pickerLastCtrlUp = 0;
        clearTimeout(pickerTimeoutId);
        pickerTimeoutId = null;
        const halo = document.getElementById('halo');
        const label = document.getElementById('halo-label');
        const tag = document.getElementById('halo-mode-tag');
        if (halo) { halo.innerHTML = ''; halo.hidden = true; }
        if (label) label.hidden = true;
        if (tag) tag.hidden = true;
        document.body.classList.remove('halo-mode');
        window.api.resizeOverlay(false);
    }

    async function runImport(filePaths, opts) {
        setProcessing();
        try {
            const res = await window.api.importDroppedFiles(filePaths, opts || null);
            if (res && res.success) {
                const moved = opts && opts.moveSource;
                const title = res.imported ? 'Imported' : (moved ? 'Moved' : 'Copied');
                const sub   = res.imported
                    ? `${filePaths.length} file(s) added to Premiere`
                    : `${filePaths.length} file(s) ${moved ? 'moved' : 'copied'} to project`;
                setSuccess(title, sub);
            } else {
                throw new Error((res && res.error) || 'Operation failed');
            }
        } catch (err) {
            setError(err.message || 'Unknown error');
        }
    }

    // ─── 4. Browser URL drops (images dragged from a browser tab) ───
    if (window.api.onUrlsDropped) {
        window.api.onUrlsDropped(async (urls) => {
            clearTimers();
            overPill = false;
            isDragInProgress = false;

            setProcessing('Downloading…');

            try {
                let anyImportedToPremiere = false;
                for (const url of urls) {
                    const res = await window.api.importBrowserImage(url);
                    if (res && res.imported) anyImportedToPremiere = true;
                }
                const label = urls.length === 1 ? '1 image added' : `${urls.length} images added`;
                const sub   = anyImportedToPremiere ? 'Imported to Premiere' : 'Saved to folder';
                setSuccess(label, sub);
            } catch (err) {
                setError(err.message || 'Download failed');
            }
        });
    }

    // ─── 5. Status updates from main process ─────────────────
    if (window.api.onOverlayUpdate) {
        window.api.onOverlayUpdate((data) => {
            isConnected        = !!data.connected;
            currentProjectName = data.projectName       || '';
            nativeProjectName  = data.nativeProjectName || '';

            // Don't interrupt active feedback
            if (!isAnimating() && !isDragInProgress) restoreIdle();
        });
    }

    if (window.api.requestStatus) window.api.requestStatus();

    // ─── Helpers ──────────────────────────────────────────────

    function hasProject() {
        // True if any project is known — either from CEP or native monitor
        return isConnected || !!(currentProjectName || nativeProjectName);
    }

    function isAnimating() {
        return pill.classList.contains('processing') ||
               pill.classList.contains('success')    ||
               pill.classList.contains('error');
    }

    function clearStates() {
        pill.classList.remove(
            'has-project', 'drag-active',
            'processing', 'success', 'error'
        );
    }

    // Pill expanded, muted "drop to add" label during drag preview.
    function setDragActive() {
        clearStates();
        pill.classList.add('drag-active');
        window.api.resizeOverlay(true);
        const name = currentProjectName || nativeProjectName;
        statusText.innerText = 'Drop to add';
        projText.innerText   = name || 'Active project';
    }

    function basename(p) {
        if (!p) return '';
        const parts = String(p).replace(/\\/g, '/').split('/');
        return parts[parts.length - 1] || '';
    }

    // Toast inside the overlay — slim non-blocking message that fades on its own.
    function showToast(msg) {
        const t = document.createElement('div');
        t.className = 'overlay-toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
    }

    function setProcessing(label = 'Copying…') {
        clearStates();
        pill.classList.add('processing');
        window.api.resizeOverlay(true);
        statusText.innerText = label;
        projText.innerText   = 'Please wait';
    }

    function setSuccess(title, sub) {
        clearStates();
        pill.classList.add('success', 'success-flush');
        statusText.innerText = title;
        projText.innerText   = sub;
        // Fade out the green flush after 800ms, pill stays expanded until 2200ms
        setTimeout(() => pill.classList.remove('success-flush'), 800);
        setTimeout(() => {
            pill.classList.remove('success');
            restoreIdle();
        }, 2200);
    }

    function setError(msg) {
        clearStates();
        pill.classList.add('error');
        statusText.innerText = 'Failed';
        projText.innerText   = msg;
        setTimeout(() => {
            pill.classList.remove('error');
            restoreIdle();
        }, 3000);
    }

    // Default idle state:
    //  - has-project → pill stays expanded, green dot, project name shown
    //  - no project  → compact orb, muted dot
    function restoreIdle() {
        clearStates();
        window.api.resizeOverlay(false);
        const name = currentProjectName || nativeProjectName;

        if (hasProject()) {
            // Green dot — project is known
            statusDot.className  = 'status-dot connected';
            statusText.innerText = 'Drop Media';
            projText.innerText   = name || (isConnected ? 'Linked' : 'Open');
            pill.classList.add('has-project');
        } else {
            // Muted dot — no project detected yet
            statusDot.className  = 'status-dot disconnected';
            statusText.innerText = 'Drop Media';
            projText.innerText   = 'Detecting…';
            // pill stays as orb (no has-project class)
        }
    }
});
