// ─── State ────────────────────────────────────────────────────
let isConnected        = false;
let currentProjectName = '';   // from CEP WebSocket
let nativeProjectName  = '';   // from PowerShell window-title monitor

// Whether a file drag is currently in progress over this window
let isDragInProgress   = false;

window.addEventListener('DOMContentLoaded', () => {
    const pill       = document.getElementById('overlay-pill');
    const statusText = document.getElementById('status-text');
    const projText   = document.getElementById('project-text');
    const statusDot  = document.getElementById('status-dot');

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

        // Pass clicks through when cursor is outside the pill
        const r    = pill.getBoundingClientRect();
        const over = e.clientX >= r.left && e.clientX <= r.right &&
                     e.clientY >= r.top  && e.clientY <= r.bottom;
        window.api.setIgnoreMouseEvents(!over, { forward: true });
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

    // ─── 3. Files received from preload ──────────────────────
    if (window.api.onFilesDropped) {
        window.api.onFilesDropped(async (filePaths) => {
            clearTimers();
            overPill = false;
            isDragInProgress = false;

            if (!filePaths.length) {
                restoreIdle();
                return;
            }

            setProcessing();

            try {
                const res = await window.api.importDroppedFiles(filePaths);
                if (res && res.success) {
                    const title = res.imported ? 'Imported' : 'Copied';
                    const sub   = res.imported
                        ? `${filePaths.length} file(s) added to Premiere`
                        : `${filePaths.length} file(s) copied to project`;
                    setSuccess(title, sub);
                } else {
                    throw new Error((res && res.error) || 'Operation failed');
                }
            } catch (err) {
                setError(err.message || 'Unknown error');
            }
        });
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

    // Pill expanded, muted "drop to add" label
    function setDragActive() {
        clearStates();
        pill.classList.add('drag-active');
        window.api.resizeOverlay(true);
        const name = currentProjectName || nativeProjectName;
        statusText.innerText = 'Drop to add';
        projText.innerText   = name || 'Active project';
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
