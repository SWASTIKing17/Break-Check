var csInterface = new CSInterface();
var EXT_VERSION = '2.0.0';
var isDraggingDummy = false;
var pendingReplaceData = null;

/* ── WebSocket ──────────────────────────────────────────────── */
var ws = null;
var reconnectTimer = null;
var reconnectAttempts = 0;
var MAX_RECONNECT = Infinity; // keep retrying indefinitely so panel connects whenever FreeXan app is started

function extLog(msg) {
    console.log('[Audio freeXan] ' + msg);
    if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'ext_log', msg: msg })); } catch(e) {}
    }
}

window.onerror = function(message, source, lineno, colno, error) {
    var errStr = message + ' at ' + source + ':' + lineno + ':' + colno;
    if (error && error.stack) {
        errStr += '\n' + error.stack;
    }
    extLog('UNCAUGHT ERROR: ' + errStr);
    return false;
};

window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason;
    extLog('UNHANDLED REJECTION: ' + (reason ? (reason.stack || reason) : event));
});

function connectWebSocket() {
    if (ws) { try { ws.close(); } catch(e) {} }
    ws = new WebSocket('ws://localhost:4554');

    ws.onopen = function() {
        reconnectAttempts = 0;
        try { ws.send(JSON.stringify({ type: 'ext_hello', version: EXT_VERSION })); } catch(e) {}
        requestAudioLibrary();
    };

    ws.onmessage = function(event) {
        try {
            var data = JSON.parse(event.data);

            if (data.type === 'reload') { window.location.reload(); return; }

            if (data.type === 'audio_library_data') {
                audioLibrary = data.files || [];
                watchedFolders = data.watchedFolders || [];
                renderFolderTree();
                applyFilter();
                return;
            }

            if (data.type === 'audio_library_changed') {
                requestAudioLibrary();
                return;
            }

            if (data.type === 'dummy_ready') {
                window.currentDummyPath = data.path;
                return;
            }

            if (data.type === 'replace_audio') {
                if (isDraggingDummy) {
                    pendingReplaceData = data;
                } else {
                    doReplaceInPremiere(data.dummyFilePath, data.realFilePath, data.binName);
                }
                pendingProcessMsgId = null;
                var btn = document.getElementById('btn-import');
                if (btn) { btn.textContent = 'Add'; btn.disabled = false; }
                return;
            }
            
            if (data.type === 'move_bin_only') {
                doMoveInPremiere(data.filePath, data.binName);
                return;
            }

            if (data.type === 'import_audio_legacy') {
                doImportToPremiere(data.realFilePath, data.binName, data.durationSec, volumeLevel);
                pendingProcessMsgId = null;
                var btn = document.getElementById('btn-import');
                if (btn) { btn.textContent = 'Add'; btn.disabled = false; }
                return;
            }

            if (data.type === 'peaks_ready') {
                if (window.pendingPeaksCallback) {
                    window.pendingPeaksCallback(data.peaks || null, data.duration || null);
                    window.pendingPeaksCallback = null;
                }
                return;
            }

            if (data.type === 'process_result' || data.type === 'process_error') {
                if (!data.success && data.msgId === pendingProcessMsgId) {
                    showToast('Processing failed.');
                }
                pendingProcessMsgId = null;
                var btn = document.getElementById('btn-import');
                if (btn) { btn.textContent = 'Add'; btn.disabled = false; }
                return;
            }

            if (data.type === 'project_context') {
                projectContext = data.context || null;
                updateEssentialsSection();
                return;
            }
        } catch(e) {
            console.error('[Audio freeXan] onmessage error:', e);
        }
    };

    ws.onclose = function() {
        clearTimeout(reconnectTimer);
        reconnectAttempts++;
        if (reconnectAttempts <= MAX_RECONNECT) {
            reconnectTimer = setTimeout(connectWebSocket, 3000);
        }
    };

    ws.onerror = function(err) {
        console.error('[Audio freeXan] WebSocket error:', err);
    };
}

function requestAudioLibrary() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify({ type: 'get_audio_library', search: '', favoritesOnly: false }));
        } catch(e) {}
    }
}

/* ── App State ──────────────────────────────────────────────── */
var audioLibrary = [];
var filteredLibrary = [];
var selectedAudio = null;
var selectedAudioRawPeaks = null;
var selectedAudioRawDuration = 0;
var wavesurfer = null;
var wsRegions = null;
var wavesurferMinimap = null;
var wsMinimapRegions = null;
var minimapRegion = null;
var currentZoom = 50;
var activeFX = [];
var volumeLevel = 100;
var toneFX = {};
var tonePitchShift = null;
var trimStart = 0;
var trimEnd = 0;
var isPlaying = false;
var pendingProcessMsgId = null;
var searchQuery = '';
var activeFilter = 'all';
var drawerOpen = false;
var syncTimeline = false;
var hoverPlayEnabled = false;
var autoPlayOnLoad = false;
var hoverPreviewAudio = new Audio();
var hoverPreviewAnimFrame = null;
var initialPlayheadTicks = null;
var skipTypeConfirm = false;
var projectContext = null;
var watchedFolders = [];
var expandedFolders = {};
var miniWavesurfers = [];
var currentAudioBlobUrl = null;
var activeDragFilePath = null;
var activeDragBinName = null;
var activeDragDurSec = 0;

/* ── Mood Tags ──────────────────────────────────────────────── */
var MOODS = [
    { key: 'tense',     label: 'Tense',     color: '#e05252' },
    { key: 'dark',      label: 'Dark',      color: '#9b6bf2' },
    { key: 'cinematic', label: 'Cinematic', color: '#4b90e2' },
    { key: 'calm',      label: 'Calm',      color: '#10c48a' },
    { key: 'uplifting', label: 'Uplifting', color: '#f5a623' },
    { key: 'chaotic',   label: 'Chaotic',   color: '#e040fb' }
];
var batchTagTargets = [];

function parseTags(str) {
    return (str || '').split(',').map(function(t) { return t.trim().toLowerCase(); }).filter(Boolean);
}
function serializeTags(arr) { return arr.filter(Boolean).join(','); }
function getParentFolderName(filePath) {
    var parts = (filePath || '').replace(/\\/g, '/').split('/');
    return parts.length >= 2 ? parts[parts.length - 2] : '';
}

/* ── Classification ─────────────────────────────────────────── */
var BGM_KEYWORDS = ['bgm', 'music', 'soundtrack', 'score', 'ost', 'theme', 'ambient', 'atmosphere', 'background', 'loop', 'cinematic'];
var SFX_KEYWORDS = ['sfx', 'effect', '/fx', '\\fx', 'foley', 'impact', 'transition', 'stinger', 'sting', 'whoosh', 'notification', 'alert', 'ui_'];

function doMoveInPremiere(filePath, binName, attempt) {
    if (!filePath) return;
    attempt = attempt || 0;
    var ep = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    
    var script = '(function(){' +
        'try{' +
        '  if(!app.project || !app.project.rootItem) return "err:no project";' +
        '  function findByPath(root, pth){' +
        '    for(var i=0;i<2000;i++){var item=root.children[i];if(!item)break;' +
        '      if(item.type!==ProjectItemType.BIN && item.getMediaPath()===pth) return item;' +
        '      if(item.type===ProjectItemType.BIN){var res=findByPath(item,pth);if(res)return res;}' +
        '    } return null;' +
        '  }' +
        '  var target = findByPath(app.project.rootItem, "' + ep + '");' +
        '  if(target) {' +
        '    var bName = "' + (binName || '') + '";' +
        '    if(bName) {' +
        '      function findItem(root, name){' +
        '        for(var i=0;i<2000;i++){var item=root.children[i];if(!item)break;' +
        '          if(item.name===name)return item;' +
        '          if(item.type===ProjectItemType.BIN){var res=findItem(item,name);if(res)return res;}' +
        '        } return null;' +
        '      }' +
        '      var bin = findItem(app.project.rootItem, bName);' +
        '      if(!bin || bin.type !== ProjectItemType.BIN) bin = app.project.rootItem.createBin(bName);' +
        '      target.moveBin(bin);' +
        '      return "moved";' +
        '    }' +
        '    return "no_bin_specified";' +
        '  }' +
        '  return "not found";' +
        '} catch(e) { return "err:"+e.message; }' +
        '})()';
        
    csInterface.evalScript(script, function(result) {
        if (result && result.indexOf('not found') !== -1) {
            if (attempt < 15) {
                // Premiere is still processing the native drop import. Retry in 200ms.
                setTimeout(function() {
                    doMoveInPremiere(filePath, binName, attempt + 1);
                }, 200);
            }
        }
    });
}

function downsamplePeaks(rawPeaks, targetWidth) {
    if (!rawPeaks || rawPeaks.length === 0) return [];
    targetWidth = Math.max(1, Math.round(targetWidth));
    if (rawPeaks.length <= targetWidth) return rawPeaks;

    var step = rawPeaks.length / targetWidth;
    var downsampled = [];
    for (var i = 0; i < targetWidth; i++) {
        var start = Math.floor(i * step);
        var end = Math.min(rawPeaks.length, Math.floor((i + 1) * step));
        var max = 0;
        for (var j = start; j < end; j++) {
            var val = Math.abs(rawPeaks[j]);
            if (val > max) max = val;
        }
        downsampled.push(max);
    }
    return downsampled;
}

function downsampleSlice(rawPeaks, startIdx, endIdx, targetWidth) {
    startIdx = Math.max(0, Math.floor(startIdx));
    endIdx   = Math.min(rawPeaks.length, Math.ceil(endIdx));
    var sliceLen = endIdx - startIdx;
    if (sliceLen <= 0 || targetWidth <= 0) return [];
    targetWidth = Math.round(targetWidth);
    var result = new Array(targetWidth);
    var step = sliceLen / targetWidth;
    for (var i = 0; i < targetWidth; i++) {
        var s = Math.floor(startIdx + i * step);
        var e = Math.min(rawPeaks.length, Math.floor(startIdx + (i + 1) * step));
        if (e <= s) e = s + 1;
        var max = 0;
        for (var j = s; j < e; j++) {
            var v = Math.abs(rawPeaks[j]);
            if (v > max) max = v;
        }
        result[i] = max;
    }
    return result;
}

function classifyAudio(audio) {
    var p = (audio.file_path || '').toLowerCase().replace(/\\/g, '/');
    for (var i = 0; i < SFX_KEYWORDS.length; i++) {
        if (p.indexOf(SFX_KEYWORDS[i]) !== -1) return 'sfx';
    }
    for (var i = 0; i < BGM_KEYWORDS.length; i++) {
        if (p.indexOf(BGM_KEYWORDS[i]) !== -1) return 'bgm';
    }
    var dur = audio.duration || 0;
    return dur > 30 ? 'bgm' : (dur > 0 ? 'sfx' : 'bgm');
}

/* ── Utilities ──────────────────────────────────────────────── */
function escHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripExtension(name) {
    return (name || '').replace(/\.[^.]+$/, '');
}

function formatDuration(s) {
    if (!s) return '';
    if (s < 60) return s.toFixed(1) + 's';
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return h >>> 0;
}

function showToast(msg) {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%) translateY(0);background:#2a2a2a;color:#e0e0e0;padding:6px 14px;border-radius:5px;font-size:11px;z-index:999;pointer-events:none;white-space:nowrap;border:1px solid #3a3a3a;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 3000);
}

/* ── Native Drag ────────────────────────────────────────────── */
function showDragGhost(ev, name) {
    var g = document.createElement('div');
    g.className = 'drag-ghost';
    g.textContent = name;
    document.body.appendChild(g);
    g.style.left = (ev.clientX + 14) + 'px';
    g.style.top  = (ev.clientY + 6)  + 'px';
    return g;
}

function initNativeDrag(el, getPath, onBeforeDrag) {
    el.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        var sx = e.clientX, sy = e.clientY;
        var ghost = null, live = false;

        function move(ev) {
            if (live) {
                if (ghost) { ghost.style.left = (ev.clientX + 14) + 'px'; ghost.style.top = (ev.clientY + 6) + 'px'; }
                return;
            }
            if (Math.sqrt(Math.pow(ev.clientX - sx, 2) + Math.pow(ev.clientY - sy, 2)) < 5) return;
            var p = getPath();
            if (!p) { stop(); return; }
            live = true;
            if (typeof onBeforeDrag === 'function') onBeforeDrag();
            ghost = showDragGhost(ev, p.replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, ''));
            if (window.cep && window.cep.dnd && typeof window.cep.dnd.initiateDrag === 'function') {
                window.cep.dnd.initiateDrag(ev, [p]);
            }
        }

        function stop() {
            if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
            ghost = null; live = false;
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', stop);
            window.removeEventListener('blur', stop);
            document.removeEventListener('mouseleave', stop);
        }

        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', stop);
        window.addEventListener('blur', stop);        // panel loses focus when dropping onto Premiere
        document.addEventListener('mouseleave', stop); // cursor exits CEP panel bounds during OS drag
    });
}

/* ── Drop Zone (Timeline insert target inside panel) ────────── */
function showDropZone(filePath, binName, durSec) {
    hideDropZone();
    activeDragFilePath = filePath;
    activeDragBinName = binName;
    activeDragDurSec = durSec || 0;
    console.log('[DND] showDropZone — filePath:', filePath, '| binName:', binName, '| durSec:', durSec);
    var dz = document.createElement('div');
    dz.id = 'drag-drop-zone';
    dz.className = 'drag-drop-zone';
    dz.textContent = '↓ Drop here → Insert at Playhead';
    dz.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        dz.classList.add('active');
        console.log('[DND] drop-zone dragover');
    });
    dz.addEventListener('dragleave', function() {
        dz.classList.remove('active');
        console.log('[DND] drop-zone dragleave');
    });
    dz.addEventListener('drop', function(e) {
        e.preventDefault();
        var fp = activeDragFilePath;
        var bn = activeDragBinName;
        var dSec = activeDragDurSec;
        console.log('[DND] drop-zone DROP — calling doImportToPremiere with:', fp, '| bin:', bn, '| durSec:', dSec);
        hideDropZone();
        if (fp) doImportToPremiere(fp, bn, dSec, volumeLevel);
        else console.warn('[DND] drop-zone DROP — no filePath, aborting');
    });
    document.body.appendChild(dz);
    console.log('[DND] drop-zone appended to body');
}

function hideDropZone() {
    var existing = document.getElementById('drag-drop-zone');
    if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
        console.log('[DND] drop-zone removed');
    }
    activeDragFilePath = null;
    activeDragBinName = null;
    activeDragDurSec = 0;
}

/* ── Folder Tree ────────────────────────────────────────────── */
function buildTree(files, watchedFoldersList) {
    var treeData = {
        name: 'Root',
        fullPath: 'root',
        type: 'folder',
        children: {},
        files: []
    };

    function getRelativeParts(filePath) {
        var normalized = filePath.replace(/\\/g, '/');
        for (var i = 0; i < watchedFoldersList.length; i++) {
            var wf = watchedFoldersList[i].folder_path.replace(/\\/g, '/');
            if (normalized.indexOf(wf) === 0) {
                var rel = normalized.substring(wf.length);
                if (rel.startsWith('/')) rel = rel.substring(1);
                var parts = rel.split('/');
                var filename = parts.pop();
                return {
                    rootName: wf.substring(wf.lastIndexOf('/') + 1) || wf,
                    rootPath: wf,
                    relDirs: parts,
                    filename: filename
                };
            }
        }
        var parts = normalized.split('/');
        var filename = parts.pop();
        var rootName = parts.shift() || 'Local';
        return {
            rootName: rootName,
            rootPath: rootName,
            relDirs: parts,
            filename: filename
        };
    }

    files.forEach(function(audio) {
        var info = getRelativeParts(audio.file_path);
        var currentNode = treeData;
        var currentPath = info.rootPath;

        // Include the root watched folder itself as the top-level node
        if (!currentNode.children[info.rootName]) {
            currentNode.children[info.rootName] = {
                name: info.rootName,
                fullPath: info.rootPath,
                type: 'folder',
                children: {},
                files: []
            };
        }
        currentNode = currentNode.children[info.rootName];

        info.relDirs.forEach(function(dirName) {
            currentPath += '/' + dirName;
            if (!currentNode.children[dirName]) {
                currentNode.children[dirName] = {
                    name: dirName,
                    fullPath: currentPath,
                    type: 'folder',
                    children: {},
                    files: []
                };
            }
            currentNode = currentNode.children[dirName];
        });

        currentNode.files.push(audio);
    });

    return treeData;
}

function renderFolderTree() {
    var treeEl = document.getElementById('folder-tree');
    if (!treeEl) return;
    treeEl.innerHTML = '';

    if (audioLibrary.length === 0) return;

    var titleEl = document.createElement('div');
    titleEl.className = 'sb-section-title';
    titleEl.textContent = 'User library';
    treeEl.appendChild(titleEl);

    var treeData = buildTree(audioLibrary, watchedFolders);

    function renderNode(node, container, depth) {
        // Render subfolders
        var folderKeys = Object.keys(node.children).sort();
        folderKeys.forEach(function(key) {
            var childNode = node.children[key];
            var fullPath = childNode.fullPath;
            var isExpanded = !!expandedFolders[fullPath];
            var isActive = activeFilter.replace(/\\/g, '/').toLowerCase() === fullPath.replace(/\\/g, '/').toLowerCase();

            var folderEl = document.createElement('div');
            folderEl.className = 'tree-folder-row' + (isActive ? ' active' : '');
            folderEl.style.paddingLeft = (depth * 14) + 'px';
            folderEl.setAttribute('data-path', fullPath);

            var arrowEl = document.createElement('span');
            arrowEl.className = 'tree-arrow';
            var hasChildren = Object.keys(childNode.children).length > 0 || childNode.files.length > 0;
            arrowEl.innerHTML = hasChildren ? (isExpanded ? '▼' : '▶') : ' ';
            arrowEl.onclick = function(e) {
                e.stopPropagation();
                expandedFolders[fullPath] = !isExpanded;
                renderFolderTree();
            };

            var iconEl = document.createElement('span');
            iconEl.className = 'tree-icon';
            iconEl.innerHTML = childNode.name.toLowerCase() === 'user library' ? '👤' : '📁';

            var nameEl = document.createElement('span');
            nameEl.className = 'tree-name';
            nameEl.textContent = childNode.name;

            var tagBtn = document.createElement('button');
            tagBtn.className = 'tree-folder-tag-btn';
            tagBtn.title = 'Tag all tracks in "' + childNode.name + '"';
            tagBtn.textContent = '🏷';
            (function(fp, fn) {
                tagBtn.onclick = function(e) {
                    e.stopPropagation();
                    var norm = fp.replace(/\\/g, '/');
                    var folderFiles = audioLibrary.filter(function(a) {
                        var ap = a.file_path.replace(/\\/g, '/');
                        return ap.indexOf(norm + '/') !== -1 || ap.indexOf(norm + '\\') !== -1;
                    });
                    openBatchTagModal(fn, folderFiles);
                };
            })(fullPath, childNode.name);

            folderEl.appendChild(arrowEl);
            folderEl.appendChild(iconEl);
            folderEl.appendChild(nameEl);
            folderEl.appendChild(tagBtn);

            folderEl.onclick = function() {
                setFilter(fullPath);
            };

            container.appendChild(folderEl);

            if (isExpanded) {
                var subContainer = document.createElement('div');
                subContainer.className = 'tree-sub-container';
                container.appendChild(subContainer);
                renderNode(childNode, subContainer, depth + 1);
            }
        });

        // Render files inside this folder
        if (node.files && node.files.length > 0) {
            node.files.sort(function(a, b) {
                return (a.name || '').localeCompare(b.name || '');
            }).forEach(function(audio) {
                var isActive = selectedAudio && selectedAudio.id === audio.id;
                var type = classifyAudio(audio);

                var fileEl = document.createElement('div');
                fileEl.className = 'tree-file-row ' + type + (isActive ? ' active' : '');
                fileEl.style.paddingLeft = (depth * 14 + 14) + 'px';

                var starEl = document.createElement('span');
                starEl.className = 'tree-file-star' + (audio.is_favorite ? ' starred' : '');
                starEl.innerHTML = '★';
                starEl.onclick = function(e) {
                    e.stopPropagation();
                    toggleFav(audio.id);
                };

                var waveIconEl = document.createElement('span');
                waveIconEl.className = 'tree-file-wave-icon ' + type;
                waveIconEl.innerHTML = '🎚️';

                var nameEl = document.createElement('span');
                nameEl.className = 'tree-file-name';
                nameEl.textContent = stripExtension(audio.name);

                fileEl.appendChild(starEl);
                fileEl.appendChild(waveIconEl);
                fileEl.appendChild(nameEl);

                fileEl.onclick = function() {
                    selectAudio(audio);
                };

                container.appendChild(fileEl);
            });
        }
    }

    renderNode(treeData, treeEl, 0);
}

/* ── Filter Logic ───────────────────────────────────────────── */
function setFilter(val) {
    activeFilter = val;
    document.querySelectorAll('.sb-item[data-filter]').forEach(function(el) {
        el.classList.toggle('active', el.dataset.filter === val);
    });
    document.querySelectorAll('.tree-folder-row').forEach(function(el) {
        var p = el.getAttribute('data-path');
        if (p) {
            el.classList.toggle('active', val.replace(/\\/g, '/').toLowerCase() === p.replace(/\\/g, '/').toLowerCase());
        }
    });
    applyFilter();
}

function applyFilter() {
    var q = searchQuery.trim().toLowerCase();

    filteredLibrary = audioLibrary.filter(function(audio) {
        if (q) {
            var n = (audio.name || '').toLowerCase();
            var g = (audio.tags || '').toLowerCase();
            if (n.indexOf(q) === -1 && g.indexOf(q) === -1) return false;
        }
        if (activeFilter === 'favorites') return !!audio.is_favorite;
        if (activeFilter === 'bgm') return classifyAudio(audio) === 'bgm';
        if (activeFilter === 'sfx') return classifyAudio(audio) === 'sfx';
        if (activeFilter !== 'all' && activeFilter !== 'recommended' && activeFilter !== 'frequent') {
            var cp = audio.file_path.replace(/\\/g, '/');
            var cf = activeFilter.replace(/\\/g, '/');
            return cp.indexOf(cf) !== -1;
        }
        return true;
    });

    renderGrid();
}

/* ── Mini-waveform helpers (shared by observer + scale redraw) ── */
function getMiniPeaks(peaksStr, cardName) {
    var peaks = [];
    try { if (peaksStr) peaks = JSON.parse(peaksStr); } catch(e) {}
    if (!peaks || peaks.length === 0) {
        var hash = hashStr(cardName || '');
        var b0 = hash & 0xFF, b1 = (hash >> 8) & 0xFF;
        for (var i = 0; i < 150; i++) {
            var amp = Math.abs(Math.sin(i * 0.13 + b0 * 0.01) * Math.cos(i * 0.07));
            amp = amp * 0.65 + Math.abs(Math.sin(i * 0.43 + b1 * 0.02)) * 0.35;
            peaks.push(Math.max(0.04, amp));
        }
    }
    return peaks;
}

function drawMiniWaveformCanvas(canvas, peaks, type) {
    var w = canvas.width, h = canvas.height;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getGradient(ctx, w, type);
    var maxPeak = 0.01;
    for (var i = 0; i < peaks.length; i++) if (peaks[i] > maxPeak) maxPeak = peaks[i];
    var sc = 1 / maxPeak;
    var mid = h / 2;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    for (var i = 0; i < peaks.length; i++) {
        var x = (i / (peaks.length - 1)) * w;
        ctx.lineTo(x, mid - Math.max(0.5, peaks[i] * sc * mid * 0.9));
    }
    for (var i = peaks.length - 1; i >= 0; i--) {
        var x = (i / (peaks.length - 1)) * w;
        ctx.lineTo(x, mid + Math.max(0.5, peaks[i] * sc * mid * 0.9));
    }
    ctx.closePath();
    ctx.fill();
}

function currentCardWaveH() {
    var grid = document.getElementById('audio-grid');
    return parseInt((grid && grid.style.getPropertyValue('--card-wave-h')) || '34', 10) || 34;
}

/* ── Grid Rendering & Observer ───────────────────────────────── */
var gridObserver = null;

function initGridObserver() {
    if (gridObserver) {
        gridObserver.disconnect();
    }
    gridObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            var card = entry.target;
            var miniWaveformContainer = card.querySelector('.card-waveform');
            if (!miniWaveformContainer) return;
            
            if (entry.isIntersecting) {
                if (!miniWaveformContainer.querySelector('canvas')) {
                    var canvas = document.createElement('canvas');
                    canvas.width = miniWaveformContainer.offsetWidth || 150;
                    canvas.height = currentCardWaveH();
                    miniWaveformContainer.appendChild(canvas);
                    var peaks = getMiniPeaks(card.getAttribute('data-peaks'), card.getAttribute('data-name'));
                    drawMiniWaveformCanvas(canvas, peaks, card.getAttribute('data-type'));
                }
            } else {
                miniWaveformContainer.innerHTML = '';
            }
        });
    }, {
        root: document.getElementById('content-area'),
        rootMargin: '100px 0px 100px 0px',
        threshold: 0.01
    });
}

var _cardScaleDebounce = null;
function applyCardScale(v, rebuild) {
    var grid = document.getElementById('audio-grid');
    if (!grid) return;
    var wh = Math.max(20, Math.min(56, Math.round(34 * v / 96)));
    grid.style.setProperty('--card-min-w', v + 'px');
    grid.style.setProperty('--card-wave-h', wh + 'px');
    if (rebuild) {
        clearTimeout(_cardScaleDebounce);
        _cardScaleDebounce = setTimeout(redrawAllCardCanvases, 180);
    }
}

function redrawAllCardCanvases() {
    var wh = currentCardWaveH();
    document.querySelectorAll('.audio-card').forEach(function(card) {
        var container = card.querySelector('.card-waveform');
        if (!container) return;
        var canvas = container.querySelector('canvas');
        if (!canvas) return; // off-screen — observer will draw at correct size when it scrolls in
        canvas.width  = container.offsetWidth || 150; // resizing clears the canvas
        canvas.height = wh;
        var peaks = getMiniPeaks(card.getAttribute('data-peaks'), card.getAttribute('data-name'));
        drawMiniWaveformCanvas(canvas, peaks, card.getAttribute('data-type'));
    });
}

function renderGrid() {
    var grid = document.getElementById('audio-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    if (gridObserver) {
        gridObserver.disconnect();
    }
    initGridObserver();

    if (filteredLibrary.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'empty-state';
        if (audioLibrary.length === 0) {
            empty.innerHTML = 'No audio found.<br>Add watched folders in freeXan settings.';
        } else {
            empty.textContent = 'No results.';
        }
        grid.appendChild(empty);
        return;
    }

    filteredLibrary.forEach(function(audio) {
        var type = classifyAudio(audio);
        var isSelected = selectedAudio && selectedAudio.id === audio.id;

        var card = document.createElement('div');
        card.className = 'audio-card ' + type + (isSelected ? ' selected' : '');
        card.title = stripExtension(audio.name);
        card.setAttribute('data-peaks', audio.peaks || '');
        card.setAttribute('data-name', audio.name || '');
        card.setAttribute('data-type', type);

        var miniWaveformContainer = document.createElement('div');
        miniWaveformContainer.className = 'card-waveform';
        card.appendChild(miniWaveformContainer);

        var body = document.createElement('div');
        body.className = 'card-body';

        var nameEl = document.createElement('div');
        nameEl.className = 'card-name';
        nameEl.textContent = stripExtension(audio.name);
        body.appendChild(nameEl);

        var metaEl = document.createElement('div');
        metaEl.className = 'card-meta';

        if (audio.duration) {
            var dur = document.createElement('span');
            dur.className = 'card-dur';
            dur.textContent = formatDuration(audio.duration);
            metaEl.appendChild(dur);
        }

        var badge = document.createElement('span');
        badge.className = 'type-badge ' + type;
        badge.textContent = type.toUpperCase();
        metaEl.appendChild(badge);

        body.appendChild(metaEl);

        if (audio.use_count > 0) {
            var used = document.createElement('div');
            used.className = 'used-badge';
            used.textContent = 'Used ' + audio.use_count + '\xd7';
            body.appendChild(used);
        }

        var folderLabel = getParentFolderName(audio.file_path);
        if (folderLabel) {
            var folderChip = document.createElement('div');
            folderChip.className = 'card-subfolder';
            folderChip.textContent = folderLabel;
            body.appendChild(folderChip);
        }

        var moodTags = parseTags(audio.tags);
        if (moodTags.length > 0) {
            var dotsEl = document.createElement('div');
            dotsEl.className = 'card-mood-dots';
            moodTags.forEach(function(tag) {
                var mood = null;
                for (var mi = 0; mi < MOODS.length; mi++) { if (MOODS[mi].key === tag) { mood = MOODS[mi]; break; } }
                if (mood) {
                    var dot = document.createElement('span');
                    dot.className = 'mood-dot';
                    dot.style.background = mood.color;
                    dot.title = mood.label;
                    dotsEl.appendChild(dot);
                }
            });
            if (dotsEl.children.length > 0) body.appendChild(dotsEl);
        }

        card.appendChild(body);

        var star = document.createElement('button');
        star.className = 'card-star' + (audio.is_favorite ? ' starred' : '');
        star.innerHTML = '★';
        star.title = audio.is_favorite ? 'Remove from favorites' : 'Favorite';
        star.onclick = function(e) { e.stopPropagation(); toggleFav(audio.id); };
        card.appendChild(star);

        card.onclick = function() { selectAudio(audio); };
        
        var hoverTimer = null;
        card.addEventListener('mouseenter', function() {
            if (!hoverPlayEnabled) return;
            hoverTimer = setTimeout(function() {
                if (hoverPlayEnabled) {
                    var cleanPath = 'file:///' + audio.file_path.replace(/\\/g, '/');
                    hoverPreviewAudio.src = cleanPath;
                    hoverPreviewAudio.volume = 0.5; // slight volume reduction for previews
                    hoverPreviewAudio.play().catch(function(e){});
                    
                    var miniPlayhead = miniWaveformContainer.querySelector('.mini-playhead');
                    if (!miniPlayhead) {
                        miniPlayhead = document.createElement('div');
                        miniPlayhead.className = 'mini-playhead';
                        miniWaveformContainer.appendChild(miniPlayhead);
                    }
                    
                    var w = miniWaveformContainer.clientWidth;
                    function animateMiniPlayhead() {
                        if (hoverPreviewAudio && !hoverPreviewAudio.paused && audio.duration > 0) {
                            var pos = (hoverPreviewAudio.currentTime / audio.duration) * w;
                            miniPlayhead.style.transform = 'translateX(' + pos + 'px)';
                            hoverPreviewAnimFrame = requestAnimationFrame(animateMiniPlayhead);
                        }
                    }
                    cancelAnimationFrame(hoverPreviewAnimFrame);
                    animateMiniPlayhead();
                }
            }, 300); // 300ms delay to prevent accidental playback when sweeping mouse
        });
        
        card.addEventListener('mouseleave', function() {
            if (hoverTimer) clearTimeout(hoverTimer);
            hoverPreviewAudio.pause();
            hoverPreviewAudio.src = '';
            cancelAnimationFrame(hoverPreviewAnimFrame);
            var miniPlayhead = miniWaveformContainer.querySelector('.mini-playhead');
            if (miniPlayhead) miniPlayhead.remove();
        });

        card.draggable = true;
        card.addEventListener('dragstart', (function(fp, d) {
            return function(e) {
                if (!fp) { e.preventDefault(); return; }
                var osPath = fp.replace(/\//g, '\\');
                e.dataTransfer.effectAllowed = 'copy';
                
                // The crucial Premiere Timeline drop keys:
                e.dataTransfer.setData('com.adobe.cep.dnd.file.0', osPath);
                // MUST be plain text OS path, not a JSON payload!
                e.dataTransfer.setData('com.adobe.cep.dnd.dictionary.string', osPath);
                e.dataTransfer.setData('text/plain', osPath);
                
                showDropZone(fp, null);
            };
        })(audio.file_path));
        card.addEventListener('dragend', function(e) {
            hideDropZone();
            if (ws && ws.readyState === WebSocket.OPEN) {
                var pendingProcessMsgId = 'proc_' + Date.now();
                try {
                    ws.send(JSON.stringify({
                        type: 'route_bin',
                        filePath: audio.file_path,
                        audioType: classifyAudio(audio)
                    }));
                } catch(e2) {}
            }
        });

        grid.appendChild(card);
        gridObserver.observe(card);
    });
}

/* ── Waveform Drawing ───────────────────────────────────────── */
function getGradient(ctx, w, type) {
    var g = ctx.createLinearGradient(0, 0, w, 0);
    if (type === 'bgm') {
        g.addColorStop(0, 'rgba(142,45,226,0.78)');
        g.addColorStop(1, 'rgba(247,86,124,0.78)');
    } else {
        g.addColorStop(0, 'rgba(0,200,150,0.78)');
        g.addColorStop(1, 'rgba(0,229,255,0.78)');
    }
    return g;
}

function drawWaveformBars(ctx, w, h, hash) {
    var barW = 2, gap = 1;
    var numBars = Math.floor(w / (barW + gap));
    var b0 = hash & 0xFF;
    var b1 = (hash >> 8) & 0xFF;
    for (var i = 0; i < numBars; i++) {
        var amp = Math.abs(Math.sin(i * 0.13 + b0 * 0.01) * Math.cos(i * 0.07));
        amp = amp * 0.65 + Math.abs(Math.sin(i * 0.43 + b1 * 0.02)) * 0.35;
        amp = Math.max(0.04, amp);
        var bh = amp * h * 0.82;
        ctx.fillRect(i * (barW + gap), (h - bh) / 2, barW, bh);
    }
}

function drawMiniWaveform(canvas, audio, type) {
    var w = canvas.width = canvas.offsetWidth || 96;
    var h = canvas.height = 34;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    
    var peaks = [];
    try { if (audio.peaks) peaks = JSON.parse(audio.peaks); } catch(e) {}
    
    if (!peaks || peaks.length === 0) {
        var hash = hashStr(audio.name || '');
        var b0 = hash & 0xFF;
        var b1 = (hash >> 8) & 0xFF;
        for (var i = 0; i < 150; i++) {
            var amp = Math.abs(Math.sin(i * 0.13 + b0 * 0.01) * Math.cos(i * 0.07));
            amp = amp * 0.65 + Math.abs(Math.sin(i * 0.43 + b1 * 0.02)) * 0.35;
            peaks.push(Math.max(0.04, amp));
        }
    }
    
    var maxPeak = 0.01;
    for (var i = 0; i < peaks.length; i++) {
        if (peaks[i] > maxPeak) maxPeak = peaks[i];
    }
    var scale = 1 / maxPeak;

    ctx.fillStyle = getGradient(ctx, w, type);
    ctx.beginPath();
    var mid = h / 2;
    
    // Top half
    ctx.moveTo(0, mid);
    for (var i = 0; i < peaks.length; i++) {
        var x = (i / (peaks.length - 1)) * w;
        var offset = Math.max(0.5, (peaks[i] * scale) * mid * 0.9);
        var y = mid - offset;
        ctx.lineTo(x, y);
    }
    
    // Bottom half (mirrored)
    for (var i = peaks.length - 1; i >= 0; i--) {
        var x = (i / (peaks.length - 1)) * w;
        var offset = Math.max(0.5, (peaks[i] * scale) * mid * 0.9);
        var y = mid + offset;
        ctx.lineTo(x, y);
    }
    
    ctx.closePath();
    ctx.fill();
}

function drawDetailWaveform() {
    if (!selectedAudioRawPeaks || !selectedAudioRawPeaks.length) return;
    var canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;
    var container = document.getElementById('waveform-container');
    var w = container ? container.clientWidth : canvas.offsetWidth;
    var h = container ? container.clientHeight : canvas.offsetHeight;
    if (!w || !h) return;

    var dpr = window.devicePixelRatio || 1;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    canvas.style.display = 'block';

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    var dur   = selectedAudioRawDuration || 1;
    var total = selectedAudioRawPeaks.length;
    var ts    = (trimEnd > trimStart) ? trimStart : 0;
    var te    = (trimEnd > trimStart) ? trimEnd   : dur;
    var startIdx = Math.floor((ts / dur) * total);
    var endIdx   = Math.ceil((te  / dur) * total);
    var peaks = downsampleSlice(selectedAudioRawPeaks, startIdx, endIdx, w);
    if (!peaks.length) return;

    var maxPeak = 0.0001;
    for (var i = 0; i < peaks.length; i++) if (peaks[i] > maxPeak) maxPeak = peaks[i];

    var type = selectedAudio ? classifyAudio(selectedAudio) : 'sfx';
    ctx.fillStyle = getGradient(ctx, w, type);

    var mid = h / 2;
    for (var i = 0; i < peaks.length; i++) {
        var amp = (peaks[i] / maxPeak) * mid * 0.88;
        if (amp < 1) amp = 1;
        ctx.fillRect(i, mid - amp, 1, amp * 2);
    }
}

function drawMinimapWaveform() {
    if (!selectedAudioRawPeaks || !selectedAudioRawPeaks.length) return;
    var canvas = document.getElementById('minimap-canvas');
    if (!canvas) return;
    var container = document.getElementById('waveform-minimap');
    var w = container ? container.clientWidth : 800;
    var h = container ? container.clientHeight : 36;
    if (!w) w = 800;
    if (!h) h = 36;

    var dpr = window.devicePixelRatio || 1;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    var peaks = downsampleSlice(selectedAudioRawPeaks, 0, selectedAudioRawPeaks.length, w);
    if (!peaks.length) return;

    var maxPeak = 0.0001;
    for (var i = 0; i < peaks.length; i++) if (peaks[i] > maxPeak) maxPeak = peaks[i];

    var type = selectedAudio ? classifyAudio(selectedAudio) : 'sfx';
    var g = ctx.createLinearGradient(0, 0, w, 0);
    if (type === 'bgm') {
        g.addColorStop(0, 'rgba(142,45,226,0.38)');
        g.addColorStop(1, 'rgba(247,86,124,0.38)');
    } else {
        g.addColorStop(0, 'rgba(0,200,150,0.38)');
        g.addColorStop(1, 'rgba(0,229,255,0.38)');
    }
    ctx.fillStyle = g;

    var mid = h / 2;
    for (var i = 0; i < peaks.length; i++) {
        var amp = (peaks[i] / maxPeak) * mid * 0.88;
        if (amp < 1) amp = 1;
        ctx.fillRect(i, mid - amp, 1, amp * 2);
    }
}

var playheadAnimFrame = null;
var playheadUI = null;
var lastAnimTime = 0;
var lastMediaTime = 0;
var smoothTime = 0;

function animatePlayhead(timestamp) {
    if (!wavesurfer || !playheadUI) return;

    var currentMediaTime = wavesurfer.getCurrentTime();

    if (currentMediaTime !== lastMediaTime) {
        lastMediaTime = currentMediaTime;
        smoothTime = currentMediaTime;
        lastAnimTime = timestamp;
    } else if (isPlaying) {
        var dt = (timestamp - lastAnimTime) / 1000;
        var speedSlider = document.getElementById('slider-speed');
        var speed = speedSlider ? parseFloat(speedSlider.value) / 100 : 1;
        smoothTime += dt * speed;
        lastAnimTime = timestamp;
    }

    // Upper waveform playhead
    var container = document.getElementById('waveform-container');
    var w = container ? container.clientWidth : 500;
    var visibleDur = (trimEnd > trimStart ? trimEnd - trimStart : selectedAudioRawDuration || 1);
    var pos = ((smoothTime - trimStart) / visibleDur) * w;

    if (pos < 0 || pos > w) {
        playheadUI.style.display = 'none';
    } else {
        playheadUI.style.display = 'block';
        playheadUI.style.transform = 'translateX(' + pos + 'px)';
    }

    // Minimap playhead
    var mmPh = document.getElementById('minimap-playhead');
    if (mmPh) {
        var totalDur = selectedAudioRawDuration || 1;
        var mmWrap = document.getElementById('waveform-minimap');
        var mmW = mmWrap ? mmWrap.clientWidth : 0;
        var mmPos = (smoothTime / totalDur) * mmW;
        if (mmW > 0 && mmPos >= 0 && mmPos <= mmW) {
            mmPh.style.display = 'block';
            mmPh.style.transform = 'translateX(' + mmPos + 'px)';
        } else {
            mmPh.style.display = 'none';
        }
    }

    if (isPlaying) {
        playheadAnimFrame = requestAnimationFrame(animatePlayhead);
    }
}

function updatePlayhead() {
    lastMediaTime = -1; 
    if (!isPlaying) {
        requestAnimationFrame(animatePlayhead);
    }
}

/* ── Audio Selection ────────────────────────────────────────── */
function selectAudio(audio) {
    selectedAudio = audio;
    isPlaying = false;
    trimStart = 0;
    trimEnd = 0;

    if (hoverPreviewAudio) {
        hoverPreviewAudio.pause();
        hoverPreviewAudio.src = '';
    }

    var cleanPath = 'file:///' + audio.file_path.replace(/\\/g, '/');

    if (wavesurfer) {
        wavesurfer.destroy();
        wavesurfer = null;
    }
    if (wavesurferMinimap) {
        wavesurferMinimap.destroy();
        wavesurferMinimap = null;
    }
    if (window.tonePlayer) {
        window.tonePlayer.dispose();
        window.tonePlayer = null;
    }

    if (currentAudioBlobUrl) {
        URL.revokeObjectURL(currentAudioBlobUrl);
        currentAudioBlobUrl = null;
    }

    var type = classifyAudio(audio);
    var nameEl = document.getElementById('drawer-name');
    var badgeEl = document.getElementById('drawer-type-badge');
    if (nameEl) nameEl.textContent = stripExtension(audio.name);
    if (badgeEl) { badgeEl.textContent = type.toUpperCase(); badgeEl.className = 'drawer-type-badge ' + type; }
    setPlayButtonState(false);
    openDrawer();
    (function() {
        var moodRowEl = document.getElementById('drawer-mood-row');
        if (!moodRowEl) return;
        moodRowEl.innerHTML = '';
        var currentTags = parseTags(audio.tags);
        MOODS.forEach(function(mood) {
            var chip = document.createElement('button');
            chip.className = 'mood-chip' + (currentTags.indexOf(mood.key) !== -1 ? ' active' : '');
            chip.textContent = mood.label;
            chip.style.setProperty('--mood-color', mood.color);
            chip.addEventListener('click', function() {
                var tags = parseTags(audio.tags);
                var idx = tags.indexOf(mood.key);
                if (idx === -1) tags.push(mood.key); else tags.splice(idx, 1);
                var newStr = serializeTags(tags);
                audio.tags = newStr;
                for (var i = 0; i < audioLibrary.length; i++) { if (audioLibrary[i].id === audio.id) { audioLibrary[i].tags = newStr; break; } }
                chip.classList.toggle('active', tags.indexOf(mood.key) !== -1);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    try { ws.send(JSON.stringify({ type: 'update_tags', id: audio.id, tags: newStr })); } catch(e) {}
                }
                renderGrid();
            });
            moodRowEl.appendChild(chip);
        });
    })();
    renderGrid();
    renderFolderTree();

    var hs = document.getElementById('handle-start');
    var he = document.getElementById('handle-end');
    if (hs) hs.style.display = 'none';
    if (he) he.style.display = 'none';
    
    var wc = document.getElementById('waveform-canvas');
    if (wc && wc.getContext) wc.getContext('2d').clearRect(0, 0, wc.width, wc.height);
    var mc = document.getElementById('minimap-canvas');
    if (mc && mc.getContext) mc.getContext('2d').clearRect(0, 0, mc.width, mc.height);

    var ph = document.getElementById('waveform-playhead');
    if (ph) ph.style.display = 'none';
    var mmPh = document.getElementById('minimap-playhead');
    if (mmPh) mmPh.style.display = 'none';

    var fs = require('fs');
    
    // Request pre-computed peaks from the backend to skip slow browser decoding
    window.pendingPeaksCallback = function(peaksArray, peaksDuration) {
        fs.readFile(audio.file_path, function(err, data) {
            if (err) { showToast('Error reading audio file.'); return; }
            
            var blob = new Blob([data]);
            currentAudioBlobUrl = URL.createObjectURL(blob);
            
            var media = new Audio(currentAudioBlobUrl);
            var isBgm = type === 'bgm';
            var finalDuration = peaksDuration || audio.duration;

            selectedAudioRawPeaks = peaksArray;
            selectedAudioRawDuration = finalDuration;
            
            var wsConfig = {
                container: '#waveform-container',
                waveColor: 'transparent',
                progressColor: 'transparent',
                cursorColor: 'transparent',
                height: 50,
                normalize: true,
                hideScrollbar: true,
                autoScroll: false,
                media: media,
                url: currentAudioBlobUrl,
                duration: finalDuration,
                barWidth: 1,
                barGap: 1,
                barRadius: 0
            };
            wavesurfer = WaveSurfer.create(wsConfig);

        var topContainer = document.getElementById('waveform-container');
        var trimTimeout = null;
        var brushDuration = 0;
        
        // ── Custom Brush Selector (Bottom Context Track) ──────────
        var updateBrushSelector = function() {
            if (!brushDuration) return;
            var fill = document.getElementById('brush-fill');
            var hl   = document.getElementById('brush-handle-left');
            var hr   = document.getElementById('brush-handle-right');
            if (!fill || !hl || !hr) return;
            var lp = (trimStart / brushDuration) * 100;
            var rp = (trimEnd   / brushDuration) * 100;
            fill.style.left  = lp + '%';
            fill.style.width = (rp - lp) + '%';
            hl.style.left = lp + '%';
            hr.style.left = rp + '%';
        };

        var initBrushSelector = function(dur) {
            brushDuration = dur;
            updateBrushSelector();
            var wrap = document.getElementById('minimap-wrap');
            var hl   = document.getElementById('brush-handle-left');
            var hr   = document.getElementById('brush-handle-right');
            if (!wrap || !hl || !hr) return;
            function makeDrag(isLeft) {
                return function(e) {
                    e.preventDefault(); e.stopPropagation();
                    function onMove(ev) {
                        var rect = wrap.getBoundingClientRect();
                        var pct  = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                        var t    = pct * brushDuration;
                        if (isLeft) { trimStart = Math.max(0, Math.min(t, trimEnd - 0.1)); }
                        else        { trimEnd = Math.min(brushDuration, Math.max(t, trimStart + 0.1)); }
                        updateBrushSelector();
                        updateTimecodeLabels();
                        drawDetailWaveform();
                        updatePlayhead();
                    }
                    function onUp() {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup',  onUp);
                        drawDetailWaveform();
                        updatePlayhead();
                        if (trimTimeout) clearTimeout(trimTimeout);
                        trimTimeout = setTimeout(requestDummyFile, 200);
                    }
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup',  onUp);
                };
            }
            hl.addEventListener('mousedown', makeDrag(true));
            hr.addEventListener('mousedown', makeDrag(false));
        };

        // ── Micro-Trim Handles (Top Detail View) ──────────────────
        var initMicroHandles = function() {
    var ml = document.getElementById('micro-handle-left');
    var mr = document.getElementById('micro-handle-right');
    if (!ml || !mr) return;

    var cursorLine = document.getElementById('waveform-cursor-line');
    var dragDim    = document.getElementById('waveform-drag-dim');

    function makeMicro(isLeft) {
        return function(e) {
            e.preventDefault(); e.stopPropagation();

            var savedStart = trimStart;
            var savedEnd   = trimEnd;
            var span       = savedEnd - savedStart;
            var cw         = topContainer.clientWidth || 1;

            // Show cursor line at initial press position
            var initX = Math.max(0, Math.min(e.clientX - topContainer.getBoundingClientRect().left, cw));
            if (cursorLine) {
                cursorLine.style.left       = initX + 'px';
                cursorLine.style.opacity    = '1';
                cursorLine.style.transition = '';
                cursorLine.style.display    = 'block';
            }
            // Show dim overlay
            if (dragDim) {
                dragDim.style.display = 'block';
                if (isLeft) {
                    dragDim.style.left  = '0';
                    dragDim.style.width = initX + 'px';
                } else {
                    dragDim.style.left  = initX + 'px';
                    dragDim.style.width = (cw - initX) + 'px';
                }
            }

            function onMove(ev) {
                var rect = topContainer.getBoundingClientRect();
                var raw  = ev.clientX - rect.left;
                var inBounds = (raw >= 0 && raw <= cw);
                var x    = Math.max(0, Math.min(raw, cw));
                var pct  = x / cw;

                // Update cursor line position (clamped to edge when outside)
                if (cursorLine) cursorLine.style.left = x + 'px';

                // Update dim overlay
                if (dragDim) {
                    if (isLeft) {
                        dragDim.style.left  = '0';
                        dragDim.style.width = x + 'px';
                    } else {
                        dragDim.style.left  = x + 'px';
                        dragDim.style.width = (cw - x) + 'px';
                    }
                }

                if (inBounds) {
                    // Map pixel to time within the pre-drag trim window
                    var t = savedStart + pct * span;
                    if (isLeft) {
                        trimStart = Math.max(0, Math.min(t, savedEnd - 0.1));
                    } else {
                        trimEnd = Math.min(brushDuration, Math.max(t, savedStart + 0.1));
                    }
                    updateBrushSelector();
                    updateTimecodeLabels();
                    // NOTE: waveform canvas intentionally NOT redrawn during drag
                }
            }

            function onUp(ev) {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup',  onUp);

                var rect = topContainer.getBoundingClientRect();
                var raw  = ev.clientX - rect.left;

                if (raw < 0 || raw > cw) {
                    // ── Cancel: released outside x bounds ──────────────────
                    trimStart = savedStart;
                    trimEnd   = savedEnd;
                    updateBrushSelector();
                    updateTimecodeLabels();
                    if (dragDim)    dragDim.style.display    = 'none';
                    if (cursorLine) cursorLine.style.display = 'none';
                    var handle = isLeft ? ml : mr;
                    handle.classList.add('handle-flicker');
                    setTimeout(function() { handle.classList.remove('handle-flicker'); }, 420);
                } else {
                    // ── Commit: released inside container ──────────────────
                    var x   = Math.max(0, Math.min(raw, cw));
                    var pct = x / cw;
                    var t   = savedStart + pct * span;
                    if (isLeft) {
                        trimStart = Math.max(0, Math.min(t, savedEnd - 0.1));
                    } else {
                        trimEnd = Math.min(brushDuration, Math.max(t, savedStart + 0.1));
                    }

                    // Hide dim
                    if (dragDim) dragDim.style.display = 'none';

                    // Animate cursor line snap to new edge then fade
                    if (cursorLine) {
                        var edgePx = isLeft
                            ? ((trimStart - savedStart) / span) * cw
                            : ((trimEnd   - savedStart) / span) * cw;
                        edgePx = Math.max(0, Math.min(edgePx, cw));
                        cursorLine.style.transition = 'left 0.13s ease, opacity 0.16s ease 0.08s';
                        cursorLine.style.left       = edgePx + 'px';
                        cursorLine.style.opacity    = '0';
                        setTimeout(function() {
                            cursorLine.style.display    = 'none';
                            cursorLine.style.transition = '';
                            cursorLine.style.opacity    = '1';
                        }, 280);
                    }

                    // Zoom-in animation on canvas
                    var canvas = document.getElementById('waveform-canvas');
                    if (canvas) {
                        canvas.classList.add('waveform-zoom-in');
                        canvas.addEventListener('animationend', function onEnd() {
                            canvas.classList.remove('waveform-zoom-in');
                            canvas.removeEventListener('animationend', onEnd);
                        });
                    }

                    updateBrushSelector();
                    updateTimecodeLabels();
                    drawDetailWaveform();
                    updatePlayhead();
                    if (trimTimeout) clearTimeout(trimTimeout);
                    trimTimeout = setTimeout(requestDummyFile, 200);
                }
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup',  onUp);
        };
    }

    ml.addEventListener('mousedown', makeMicro(true));
    mr.addEventListener('mousedown', makeMicro(false));
};

    var isReadyFired = false;
    var initReady = function() {
        if (isReadyFired) return;
        var dur = wavesurfer.getDuration();
        // If peaks were provided, WaveSurfer knows duration immediately. Otherwise wait.
        if (dur === 0 && !(peaksArray && peaksArray.length > 0)) return;
        isReadyFired = true;

        trimStart = 0;
        trimEnd = dur;
        updateTimecodeLabels();

        // Init custom brush overlay and micro-trim handles
        initBrushSelector(dur);
        initMicroHandles();
        drawDetailWaveform();
        drawMinimapWaveform();

        if (!audio.duration && dur > 0 && ws && ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'update_duration', filePath: audio.file_path, duration: dur })); } catch(e) {}
        }
        
        var buffer = wavesurfer.getDecodedData();
        if (buffer) {
            window.tonePlayer = new Tone.GrainPlayer(buffer).toDestination();
            window.tonePlayer.loop = false;
            wavesurfer.setVolume(0); // Mute media so GrainPlayer takes over audio output
        } else {
            wavesurfer.setVolume(1); // Ensure media audio plays if Tone.js is not used
        }
        
        var pitchVal = parseInt(document.getElementById('slider-pitch').value) || 0;
        if (window.tonePlayer) window.tonePlayer.detune = pitchVal * 100;
        
        var speedVal = parseFloat(document.getElementById('slider-speed').value) / 100;
        if (window.tonePlayer) window.tonePlayer.playbackRate = speedVal;
        wavesurfer.setPlaybackRate(speedVal);
        
        // Ensure dummy is instantly generated upon selection so immediate drag works
        requestDummyFile();
        
        if (autoPlayOnLoad) {
            autoPlayOnLoad = false;
            playAudio();
        }
    };
    wavesurfer.on('ready', initReady);
    setTimeout(initReady, 50);

    media.addEventListener('playing', function() {
        if (window.tonePlayer && isPlaying) {
            window.tonePlayer.stop(); // Ensure clean start
            window.tonePlayer.start(Tone.now(), wavesurfer.getCurrentTime());
        }
    });

    wavesurfer.on('pause', function() {
        isPlaying = false;
        setPlayButtonState(false);
        if (window.tonePlayer) window.tonePlayer.stop();
        if (syncTimeline) stopSyncPlay();
    });

    wavesurfer.on('seeking', function() {
        if (isPlaying && window.tonePlayer) {
            window.tonePlayer.stop();
            window.tonePlayer.start(Tone.now(), wavesurfer.getCurrentTime());
        }
    });

    wavesurfer.on('interaction', function() {
        if (!isPlaying) playAudio();
    });

    wavesurfer.on('timeupdate', function(currentTime) {
        if (trimEnd > 0 && currentTime >= trimEnd) {
            pauseAudio();
            wavesurfer.setTime(trimStart);
        }
    });

    wavesurfer.on('finish', function() { pauseAudio(); });
        });
    }; // End of pendingPeaksCallback
    
    // Request peaks from backend. The callback will be triggered via ws.onmessage
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify({
                type: 'generate_peaks',
                filePath: audio.file_path,
                msgId: 'peaks_' + Date.now()
            }));
        } catch(e) {
            // Fallback if websocket fails
            window.pendingPeaksCallback(null);
        }
    } else {
        window.pendingPeaksCallback(null);
    }
}

/* ── Playback ───────────────────────────────────────────────── */
function setPlayButtonState(playing) {
    var btn = document.getElementById('btn-play');
    if (!btn) return;
    if (playing) {
        btn.textContent = '⏸';
        btn.classList.add('playing');
    } else {
        btn.textContent = '▶';
        btn.classList.remove('playing');
    }
}

function playAudio() {
    if (!wavesurfer) return;
    if (trimEnd > 0 && (wavesurfer.getCurrentTime() >= trimEnd || wavesurfer.getCurrentTime() < trimStart)) {
        wavesurfer.setTime(trimStart);
    }

    var doPlay = function() {
        isPlaying = true;
        setPlayButtonState(true);
        if (syncTimeline) startSyncPlay();
        if (playheadAnimFrame) cancelAnimationFrame(playheadAnimFrame);
        lastAnimTime = performance.now();
        playheadAnimFrame = requestAnimationFrame(animatePlayhead);
        wavesurfer.play().catch(function(e) {
            extLog('playback error: ' + e);
            isPlaying = false;
            setPlayButtonState(false);
            if (syncTimeline) stopSyncPlay();
        });
    };

    if (Tone.context.state !== 'running') {
        Tone.context.resume().then(doPlay).catch(doPlay);
    } else {
        doPlay();
    }
}

function pauseAudio() {
    if (!wavesurfer) return;
    wavesurfer.pause();
    isPlaying = false;
    setPlayButtonState(false);
    if (syncTimeline) stopSyncPlay();
}

function togglePlay() {
    if (isPlaying) pauseAudio(); else playAudio();
}

/* ── Trim Handles ───────────────────────────────────────────── */
function updateTimecodeLabels() {
    var s = document.getElementById('lbl-trim-start');
    var e = document.getElementById('lbl-trim-end');
    if (s) s.textContent = trimStart.toFixed(2) + 's';
    if (e) e.textContent = trimEnd.toFixed(2) + 's';
}

function positionTrimHandles() {}
function initTrimHandles() {}


/* ── Drawer ─────────────────────────────────────────────────── */
function openDrawer() {
    var drawer = document.getElementById('detail-drawer');
    var layout = document.getElementById('main-layout');
    if (!drawer) return;
    drawerOpen = true;
    drawer.classList.add('open');
    if (layout) layout.classList.add('drawer-open');
    setTimeout(requestDummyFile, 60);
}

function closeDrawer() {
    var drawer = document.getElementById('detail-drawer');
    var layout = document.getElementById('main-layout');
    if (!drawer) return;
    drawerOpen = false;
    drawer.classList.remove('open');
    if (layout) layout.classList.remove('drawer-open');
    pauseAudio();
}

/* ── Timeline Sync ──────────────────────────────────────────── */
function startSyncPlay() {
    var script = '(function(){' +
        'try{' +
        'var s=app.project.activeSequence;' +
        'if(!s)return "err:no_sequence";' +
        'return String(s.getPlayerPosition().ticks);' +
        '}catch(e){return "err:"+e.message;}' +
        '})()';
    csInterface.evalScript(script, function(ticks) {
        if (!ticks || ticks.indexOf('err:') === 0) {
            extLog('Sync play failed: ' + ticks);
            return;
        }
        initialPlayheadTicks = ticks;
        var playScript = '(function(){' +
            'try{' +
            'app.enableQE();' +
            'if(qe && qe.project && qe.project.getActiveSequence()){' +
            '  qe.project.getActiveSequence().player.play();' +
            '}' +
            'return "ok";' +
            '}catch(e){return "err:"+e.message;}' +
            '})()';
        csInterface.evalScript(playScript, function(r) { extLog('Timeline play: ' + r); });
    });
}

function stopSyncPlay() {
    if (!initialPlayheadTicks) return;
    var ticks = initialPlayheadTicks;
    initialPlayheadTicks = null;
    var script = '(function(){' +
        'try{' +
        'app.enableQE();' +
        'if(qe && qe.project && qe.project.getActiveSequence()){' +
        '  qe.project.getActiveSequence().player.stop();' + // Ensure playback is stopped before moving head
        '}' +
        'var s=app.project.activeSequence;' +
        'if(!s)return "err:no_sequence";' +
        's.setPlayerPosition("' + ticks + '");' +
        'return "ok";' +
        '}catch(e){return "err:"+e.message;}' +
        '})()';
    csInterface.evalScript(script, function(r) { extLog('Timeline restore: ' + r); });
}

/* ── Favorites ──────────────────────────────────────────────── */
function toggleFav(id) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify({ type: 'toggle_favorite', id: id })); } catch(e) { return; }

    // Optimistic UI update
    var audio = null;
    for (var i = 0; i < audioLibrary.length; i++) {
        if (audioLibrary[i].id === id) { audio = audioLibrary[i]; break; }
    }
    if (audio) audio.is_favorite = audio.is_favorite ? 0 : 1;
    renderGrid();
    renderFolderTree();
}

/* ── Essentials Section ─────────────────────────────────────── */
function updateEssentialsSection() {
    var group = document.getElementById('group-essentials');
    if (!group) return;
    if (!projectContext || (!projectContext.client && !projectContext.funnel)) {
        group.style.display = 'none';
        return;
    }
    group.style.display = '';
    var rec = document.getElementById('sb-recommended');
    var freq = document.getElementById('sb-frequent');
    if (rec && projectContext.task) {
        var recTxt = rec.querySelector('.sb-txt');
        if (recTxt) recTxt.textContent = 'For ' + projectContext.task;
    }
    if (freq && projectContext.client) {
        var freqTxt = freq.querySelector('.sb-txt');
        if (freqTxt) freqTxt.textContent = projectContext.client;
    }
}

/* ── Type Confirmation ──────────────────────────────────────── */
function showTypeConfirm(audio, onConfirm) {
    if (skipTypeConfirm) {
        onConfirm(classifyAudio(audio));
        return;
    }

    var predicted = classifyAudio(audio);
    var overlay = document.getElementById('type-confirm');
    var btnBgm = document.getElementById('btn-confirm-bgm');
    var btnSfx = document.getElementById('btn-confirm-sfx');
    var chkNoAsk = document.getElementById('chk-no-ask');

    if (!overlay) { onConfirm(predicted); return; }

    btnBgm.classList.toggle('active', predicted === 'bgm');
    btnSfx.classList.toggle('active', predicted === 'sfx');
    overlay.classList.add('visible');

    function handleChoice(type) {
        if (chkNoAsk && chkNoAsk.checked) skipTypeConfirm = true;
        overlay.classList.remove('visible');
        btnBgm.onclick = null;
        btnSfx.onclick = null;
        onConfirm(type);
    }

    btnBgm.onclick = function() { handleChoice('bgm'); };
    btnSfx.onclick = function() { handleChoice('sfx'); };
}

/* ── Import ─────────────────────────────────────────────────── */
function doImportToPremiere(filePath, binName, durSec, volumeLevel) {
    console.log('[DND] doImportToPremiere called — filePath:', filePath, '| binName:', binName);
    var ep = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    var fName = filePath.replace(/\\/g, '/').split('/').pop().replace(/"/g, '\\"');
    var script = '(function(){' +
        'try {' +
        '  if(!app.project) return "err:no project";' +
        '  var f = new File("' + ep + '");' +
        '  if(!f.exists) return "err:file not found";' +
        '  var bName = "' + (binName || '') + '";' +
        '  var targetBin = app.project.rootItem;' +
        '  if (bName) {' +
        '    function findBin(root, name) {' +
        '      for(var i=0;i<2000;i++){var item=root.children[i];if(!item)break;' +
        '        if(item.type===ProjectItemType.BIN&&item.name===name)return item;' +
        '        if(item.type===ProjectItemType.BIN){var res=findBin(item,name);if(res)return res;}' +
        '      } return null;' +
        '    }' +
        '    var bin = findBin(app.project.rootItem, bName);' +
        '    if(!bin) bin = app.project.rootItem.createBin(bName);' +
        '    targetBin = bin;' +
        '  }' +
        '  app.project.importFiles(["' + ep + '"], true, targetBin, false);' +
        '  var fn = "' + fName + '";' +
        '  var importedItem = null;' +
        '  for(var i=0;i<2000;i++){var c=targetBin.children[i];if(!c)break;if(c.name===fn){importedItem=c;break;}}' +
        '  var seq = app.project.activeSequence;' +
        '  if(seq && importedItem) {' +
        '    var ph = seq.getPlayerPosition();' +
        '    var dur = ' + (durSec || 0) + ';' +
        '    var placed = false;' +
        '    for(var t=0;t<seq.audioTracks.numTracks&&!placed;t++){' +
        '      var track = seq.audioTracks[t];' +
        '      var hasOverlap = false;' +
        '      for(var c=0;c<track.clips.numItems;c++){' +
        '        var clip = track.clips[c];' +
        '        var cStart = clip.start.seconds;' +
        '        var cEnd = clip.end.seconds;' +
        '        if (dur > 0) {' +
        '          if (cEnd > ph.seconds && cStart < ph.seconds + dur) { hasOverlap = true; break; }' +
        '        } else {' +
        '          if (cEnd > ph.seconds && cStart <= ph.seconds) { hasOverlap = true; break; }' +
        '        }' +
        '      }' +
        '      if(!hasOverlap){' +
        '        try{' +
        '          track.insertClip(importedItem,ph.seconds);' +
        '          placed=true;' +
        '          var vol = ' + (volumeLevel !== undefined ? volumeLevel : 100) + ';' +
        '          if (vol !== 100) {' +
        '            for(var x=0; x<track.clips.numItems; x++){' +
        '              var newClip = track.clips[x];' +
        '              if (Math.abs(newClip.start.seconds - ph.seconds) < 0.1) {' +
        '                for(var cIdx=0; cIdx<newClip.components.numItems; cIdx++){' +
        '                  var comp = newClip.components[cIdx];' +
        '                  if (comp.matchName === "PR.AudioVolume" || comp.displayName === "Volume") {' +
        '                    for(var pIdx=0; pIdx<comp.properties.numItems; pIdx++){' +
        '                      var prop = comp.properties[pIdx];' +
        '                      if (prop.displayName === "Level") {' +
        '                        prop.setValue(vol / 100, true);' +
        '                      }' +
        '                    }' +
        '                  }' +
        '                }' +
        '              }' +
        '            }' +
        '          }' +
        '        }catch(e2){}' +
        '      }' +
        '    }' +
        '    if(!placed){try{seq.insertClip(importedItem,ph,-1,0);}catch(e3){}}' +
        '  }' +
        '  return "ok";' +
        '} catch(e) { return "err:"+e.message; }' +
        '})()';
    console.log('[DND] doImportToPremiere — evalScript about to fire');
    csInterface.evalScript(script, function(result) {
        console.log('[DND] doImportToPremiere evalScript result:', result);
        extLog('Import: ' + result);
        if (result === 'ok' && selectedAudio && ws && ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'record_use', id: selectedAudio.id })); } catch(e) {}
            selectedAudio.use_count = (selectedAudio.use_count || 0) + 1;
        } else if (result !== 'ok') {
            console.warn('[DND] doImportToPremiere — non-ok result:', result);
        }
    });
}

function doReplaceInPremiere(dummyPath, realPath, binName, attempt) {
    if (!dummyPath || !realPath) return;
    attempt = attempt || 0;
    var epDummy = dummyPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    var epReal = realPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    
    // Safely extract just the filenames, regardless of forward or backward slashes from the backend
    var dName = dummyPath.replace(/\\/g, '/').split('/').pop();
    var newName = realPath.replace(/\\/g, '/').split('/').pop();

    var script = '(function(){' +
        'try {' +
        '  var log = "SearchLog: ";' +
        '  if(!app.project) return "err:no project";' +
        '  var dName = "' + dName.replace(/"/g, '\\"') + '";' +
        '  var newName = "' + newName.replace(/"/g, '\\"') + '";' +
        '  log += "Looking for [" + dName + "]. ";' +
        '  function findItem(root, name) {' +
        '    for(var i=0;i<2000;i++){var item=root.children[i];if(!item)break;' +
        '      if(item.name===name)return item;' +
        '      if(item.type===ProjectItemType.BIN){var res=findItem(item,name);if(res)return res;}' +
        '    } return null;' +
        '  }' +
        '  var target = findItem(app.project.rootItem, dName);' +
        '  if(target) {' +
        '    log += "Found! Path: " + target.getMediaPath() + ". Swapping to: ' + epReal + '. ";' +
        '    target.changeMediaPath("' + epReal + '");' +
        '    target.name = newName;' +
        '    var bName = "' + (binName || '') + '";' +
        '    if(bName) {' +
        '      var bin = findItem(app.project.rootItem, bName);' +
        '      if(!bin || bin.type !== ProjectItemType.BIN) bin = app.project.rootItem.createBin(bName);' +
        '      target.moveBin(bin);' +
        '    }' +
        '    try {' +
        '      var numSeqs = app.project.sequences.numSequences;' +
        '      for(var si=0;si<numSeqs;si++){' +
        '        var seq=app.project.sequences[si];' +
        '        for(var ai=0;ai<seq.audioTracks.numTracks;ai++){' +
        '          var atClips=seq.audioTracks[ai].clips;' +
        '          for(var ac=0;ac<atClips.numItems;ac++){' +
        '            if(atClips[ac]&&atClips[ac].name===dName){atClips[ac].name=newName;}' +
        '          }' +
        '        }' +
        '        for(var vi=0;vi<seq.videoTracks.numTracks;vi++){' +
        '          var vtClips=seq.videoTracks[vi].clips;' +
        '          for(var vc=0;vc<vtClips.numItems;vc++){' +
        '            if(vtClips[vc]&&vtClips[vc].name===dName){vtClips[vc].name=newName;}' +
        '          }' +
        '        }' +
        '      }' +
        '    } catch(e2){log+=" clipRename err:"+e2;}' +
        '    for(var j=app.project.rootItem.children.numItems-1; j>=0; j--){' +
        '      var itm = app.project.rootItem.children[j];' +
        '      if(itm && itm.name && itm.name.indexOf("dummy_") === 0 && itm.name.indexOf(".wav") > 0) { itm.remove(); }' +
        '    }' +
        '    try { app.project.consolidateDuplicates(); } catch(cdErr) { log += " consolidate error: " + cdErr; }' +
        '    return "replaced | " + log;' +
        '  }' +
        '  var topNames = []; for(var i=0;i<Math.min(10, app.project.rootItem.children.numItems);i++) { var child = app.project.rootItem.children[i]; if(child) topNames.push(child.name); }' +
        '  return "not found | " + log + "Top items: " + topNames.join(", ");' +
        '} catch(e) { return "err:"+e.message; }' +
        '})()';
    csInterface.evalScript(script, function(result) {
        console.error('================ DEBUG REPLACE ================');
        console.error('Dummy path sent:', dummyPath);
        console.error('Real path sent:', realPath);
        console.error('ExtendScript returned:', result);
        console.error('===============================================');
        
        extLog('Replace: ' + result);
        if (result && result.indexOf('not found') !== -1) {
            if (attempt < 15) {
                // Premiere is still processing the native drop import. Retry in 200ms.
                setTimeout(function() {
                    doReplaceInPremiere(dummyPath, realPath, binName, attempt + 1);
                }, 200);
            } else {
                extLog('Replace failed after 15 attempts. Dummy not found.');
                if (ws && ws.readyState === WebSocket.OPEN) {
                    try { ws.send(JSON.stringify({ type: 'cleanup_dummy', path: dummyPath })); } catch(e) {}
                }
            }
        } else {
            // Success or explicit error
            if (ws && ws.readyState === WebSocket.OPEN) {
                try { ws.send(JSON.stringify({ type: 'cleanup_dummy', path: dummyPath })); } catch(e) {}
            }
        }
    });
}

function doMoveBinInPremiere(filePath, binName) {
    if (!binName) return;
    var dName = filePath.replace(/\\/g, '/').split('/').pop();
    var script = '(function(){' +
        'try {' +
        '  var dName = "' + dName.replace(/"/g, '\\"') + '";' +
        '  function findItem(root, name) {' +
        '    for(var i=0;i<2000;i++){var item=root.children[i];if(!item)break;' +
        '      if(item.name===name)return item;' +
        '      if(item.type===ProjectItemType.BIN){var res=findItem(item,name);if(res)return res;}' +
        '    } return null;' +
        '  }' +
        '  var target = findItem(app.project.rootItem, dName);' +
        '  if(target) {' +
        '    var bName = "' + binName.replace(/"/g, '\\"') + '";' +
        '    var bin = findItem(app.project.rootItem, bName);' +
        '    if(!bin || bin.type !== ProjectItemType.BIN) bin = app.project.rootItem.createBin(bName);' +
        '    target.moveBin(bin);' +
        '    try { app.project.consolidateDuplicates(); } catch(e) {}' +
        '    return "moved";' +
        '  }' +
        '  return "not found";' +
        '} catch(e) { return "err:"+e.message; }' +
        '})()';
    csInterface.evalScript(script);
}

function handleImport() {
    if (!selectedAudio) { showToast('Select a track first.'); return; }

    showTypeConfirm(selectedAudio, function(type) {
        extLog('Import type: ' + type);

        var pitch = parseInt(document.getElementById('slider-pitch').value) || 0;
        var speed = parseFloat(document.getElementById('slider-speed').value) / 100;
        var dur = wavesurfer ? wavesurfer.getDuration() : (selectedAudio.duration || 0);
        var isTrimmed = dur > 0 && (trimStart > 0.05 || (dur - trimEnd) > 0.05);

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            showToast('Not connected to freeXan.');
            return;
        }

        var btn = document.getElementById('btn-import');
        if (btn) { btn.textContent = 'Processing…'; btn.disabled = true; }

        pendingProcessMsgId = 'proc_' + Date.now();
        try {
            ws.send(JSON.stringify({
                type: 'process_audio',
                msgId: pendingProcessMsgId,
                filePath: selectedAudio.file_path,
                trimStart: isTrimmed ? trimStart : null,
                trimEnd: isTrimmed ? trimEnd : null,
                pitch: pitch,
                speed: speed,
                fxArray: activeFX,
                dummyFilePath: null // Not a drag-drop replace
            }));
        } catch(e) {
            if (btn) { btn.textContent = 'Add'; btn.disabled = false; }
            showToast('Send failed.');
        }
    });
}

function requestDummyFile() {
    if (!selectedAudio || !ws || ws.readyState !== WebSocket.OPEN) return;
    var speed = parseFloat(document.getElementById('slider-speed').value) / 100;
    if (isNaN(speed) || speed <= 0) speed = 1.0;

    var totalDur = (wavesurfer && typeof wavesurfer.getDuration === 'function' ? wavesurfer.getDuration() : 0)
                  || selectedAudioRawDuration
                  || (selectedAudio && selectedAudio.duration)
                  || 1;
    var start = (trimStart > 0 && !isNaN(trimStart)) ? trimStart : 0;
    var end   = (trimEnd   > 0 && !isNaN(trimEnd))   ? trimEnd   : totalDur;

    var dur = (end - start) / speed;
    if (isNaN(dur) || dur <= 0) dur = totalDur / speed;

    var sr = 48000, ch = 2;
    if (wavesurfer) {
        var buf = null;
        if (typeof wavesurfer.getDecodedData === 'function') buf = wavesurfer.getDecodedData();
        else if (wavesurfer.backend && wavesurfer.backend.buffer) buf = wavesurfer.backend.buffer;
        if (buf) {
            sr = buf.sampleRate || 48000;
            ch = buf.numberOfChannels || 2;
        }
    }

    ws.send(JSON.stringify({ type: 'prepare_dummy', duration: dur, sampleRate: sr, channels: ch }));
}

/* ── Keyboard ───────────────────────────────────────────────── */
document.addEventListener('keydown', function(e) {
    if (e.target && e.target.tagName === 'INPUT') return;

    if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        // If a button has focus, the spacebar will natively trigger a click on it.
        // Don't double-fire togglePlay.
        if (e.target && e.target.tagName === 'BUTTON') return;
        if (selectedAudio) togglePlay();
        return;
    }

    if (e.key === 'Escape') {
        var overlay = document.getElementById('type-confirm');
        if (overlay && overlay.classList.contains('visible')) {
            overlay.classList.remove('visible');
            var btnBgm = document.getElementById('btn-confirm-bgm');
            var btnSfx = document.getElementById('btn-confirm-sfx');
            if (btnBgm) btnBgm.onclick = null;
            if (btnSfx) btnSfx.onclick = null;
        } else if (drawerOpen) {
            closeDrawer();
        }
    }
});

/* ── Batch Tag Modal ────────────────────────────────────────── */
function openBatchTagModal(folderName, files) {
    batchTagTargets = files;
    var modal = document.getElementById('batch-tag-modal');
    var titleEl = document.getElementById('btm-title');
    var moodsEl = document.getElementById('btm-moods');
    var countEl = document.getElementById('btm-count');
    if (!modal) return;
    titleEl.textContent = '"' + folderName + '" — ' + files.length + ' track' + (files.length !== 1 ? 's' : '');
    countEl.textContent = 'Pick moods to add';
    moodsEl.innerHTML = '';
    var selectedMoods = [];
    MOODS.forEach(function(mood) {
        var chip = document.createElement('button');
        chip.className = 'mood-chip';
        chip.textContent = mood.label;
        chip.style.setProperty('--mood-color', mood.color);
        chip.addEventListener('click', function() {
            var idx = selectedMoods.indexOf(mood.key);
            if (idx === -1) { selectedMoods.push(mood.key); chip.classList.add('active'); }
            else { selectedMoods.splice(idx, 1); chip.classList.remove('active'); }
            countEl.textContent = selectedMoods.length > 0
                ? 'Add to ' + files.length + ' track' + (files.length !== 1 ? 's' : '')
                : 'Pick moods to add';
        });
        moodsEl.appendChild(chip);
    });
    modal.hidden = false;
    var applyBtn = document.getElementById('btm-apply');
    if (applyBtn) {
        applyBtn.onclick = function() {
            if (selectedMoods.length === 0) { closeBatchTagModal(); return; }
            var ids = batchTagTargets.map(function(a) { return a.id; });
            batchTagTargets.forEach(function(a) {
                var existing = parseTags(a.tags);
                selectedMoods.forEach(function(m) { if (existing.indexOf(m) === -1) existing.push(m); });
                a.tags = serializeTags(existing);
                for (var i = 0; i < audioLibrary.length; i++) { if (audioLibrary[i].id === a.id) { audioLibrary[i].tags = a.tags; break; } }
            });
            if (ws && ws.readyState === WebSocket.OPEN) {
                try { ws.send(JSON.stringify({ type: 'batch_add_tags', ids: ids, tagKeys: selectedMoods })); } catch(e) {}
            }
            closeBatchTagModal();
            renderGrid();
        };
    }
}

function closeBatchTagModal() {
    var modal = document.getElementById('batch-tag-modal');
    if (modal) modal.hidden = true;
    batchTagTargets = [];
}

/* ── UI Init ────────────────────────────────────────────────── */
function initUI() {

    // Search input
    var searchEl = document.getElementById('search-input');
    if (searchEl) {
        searchEl.addEventListener('input', function(e) {
            searchQuery = e.target.value;
            applyFilter();
        });
    }

    // Sidebar static filter items
    document.querySelectorAll('.sb-item[data-filter]').forEach(function(item) {
        if (!item.dataset.filterBound) {
            item.dataset.filterBound = '1';
            item.addEventListener('click', function() { setFilter(this.dataset.filter); });
        }
    });

    // Hover toggle
    var hoverToggle = document.getElementById('toggle-hover');
    if (hoverToggle) {
        hoverToggle.addEventListener('change', function() {
            hoverPlayEnabled = this.checked;
        });
    }

    // Sync toggle
    var syncToggle = document.getElementById('toggle-sync');
    if (syncToggle) {
        syncToggle.addEventListener('change', function() {
            syncTimeline = this.checked;
            extLog('Sync timeline: ' + syncTimeline);
        });
    }

    // Card scale slider
    var scaleSlider = document.getElementById('slider-card-scale');
    if (scaleSlider) {
        var savedScale = parseInt(localStorage.getItem('audio_card_scale') || '96', 10);
        if (isNaN(savedScale) || savedScale < 60 || savedScale > 180) savedScale = 96;
        scaleSlider.value = savedScale;
        applyCardScale(savedScale, false); // false = skip renderGrid on init (grid not built yet)
        scaleSlider.addEventListener('input', function() {
            var v = parseInt(this.value, 10);
            localStorage.setItem('audio_card_scale', v);
            applyCardScale(v, true);
        });
    }

    // Wire playhead element (was never assigned — the animation loop needs this)
    playheadUI = document.getElementById('waveform-playhead');

    // Playhead scrub — drag the playhead in the upper waveform to seek
    var phEl = document.getElementById('waveform-playhead');
    if (phEl) {
        phEl.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            var container = document.getElementById('waveform-container');
            function onMove(ev) {
                if (!container || !wavesurfer) return;
                var rect = container.getBoundingClientRect();
                var pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                var visDur = (trimEnd > trimStart ? trimEnd - trimStart : selectedAudioRawDuration || 1);
                var newTime = trimStart + pct * visDur;
                wavesurfer.setTime(newTime);
                smoothTime = newTime;
                if (!isPlaying) updatePlayhead();
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    // Play button
    var btnPlay = document.getElementById('btn-play');
    if (btnPlay) btnPlay.addEventListener('click', togglePlay);

    // Drawer close button
    var btnClose = document.getElementById('btn-drawer-close');
    if (btnClose) btnClose.addEventListener('click', closeDrawer);

    // Batch tag modal close
    var btmClose = document.getElementById('btm-close');
    if (btmClose) btmClose.addEventListener('click', closeBatchTagModal);

    // Pitch slider
    var sliderPitch = document.getElementById('slider-pitch');
    var valPitch = document.getElementById('val-pitch');
    if (sliderPitch && valPitch) {
        sliderPitch.addEventListener('input', function() {
            valPitch.textContent = this.value + ' st';
            if (window.tonePlayer) window.tonePlayer.detune = parseInt(this.value) * 100;
        });
    }

    // Speed slider
    var sliderSpeed = document.getElementById('slider-speed');
    var valSpeed = document.getElementById('val-speed');
    if (sliderSpeed && valSpeed) {
        sliderSpeed.addEventListener('input', function() {
            var v = parseFloat(this.value) / 100;
            valSpeed.textContent = v.toFixed(1) + '\xd7';
            if (wavesurfer) wavesurfer.setPlaybackRate(v);
            if (window.tonePlayer) window.tonePlayer.playbackRate = v;
        });
        sliderSpeed.addEventListener('change', requestDummyFile);
    }
    
    // Volume slider
    var sliderVolume = document.getElementById('slider-volume');
    var valVolume = document.getElementById('val-volume');
    if (sliderVolume && valVolume) {
        sliderVolume.addEventListener('input', function() {
            volumeLevel = parseInt(this.value);
            valVolume.textContent = volumeLevel + '%';
            if (window.tonePlayer) window.tonePlayer.volume.value = Tone.gainToDb(volumeLevel / 100);
        });
    }

    // Initialize Tone.js FX nodes
    if (typeof Tone !== 'undefined') {
        try {
            toneFX = {
                AutoFilter: new Tone.AutoFilter("4n").start(),
                AutoPanner: new Tone.AutoPanner("4n").start(),
                AutoWah: new Tone.AutoWah(50, 6, -30),
                BitCrusher: new Tone.BitCrusher(4),
                Chebyschev: new Tone.Chebyschev(50),
                Chorus: new Tone.Chorus(4, 2.5, 0.5),
                Compressor: new Tone.Compressor(-30, 3),
                Distortion: new Tone.Distortion(0.8),
                EQ3: new Tone.EQ3(0, -5, 5),
                FeedbackDelay: new Tone.FeedbackDelay("8n", 0.5),
                Freeverb: new Tone.Freeverb(),
                JCReverb: new Tone.JCReverb(),
                Phaser: new Tone.Phaser({frequency: 15, octaves: 5, baseFrequency: 1000}),
                PingPongDelay: new Tone.PingPongDelay("4n", 0.2),
                PitchShift: new Tone.PitchShift(),
                StereoWidener: new Tone.StereoWidener(1.0),
                Tremolo: new Tone.Tremolo(9, 0.75).start(),
                Vibrato: new Tone.Vibrato()
            };
        } catch (e) {
            console.error('[Tone.js FX Init Failed] AudioContext not allowed to start, or effect missing.', e);
        }
    }

    // FX Tray buttons
    var fxButtons = document.querySelectorAll('.fx-btn');
    fxButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var fxName = this.getAttribute('data-fx');
            this.classList.toggle('active');
            if (this.classList.contains('active')) {
                if (activeFX.indexOf(fxName) === -1) activeFX.push(fxName);
            } else {
                var idx = activeFX.indexOf(fxName);
                if (idx > -1) activeFX.splice(idx, 1);
            }
            rebuildToneChain();
            requestDummyFile(); // Update dummy with FX
        });
    });

    function rebuildToneChain() {
        if (!window.tonePlayer) return;
        window.tonePlayer.disconnect();
        Object.keys(toneFX).forEach(function(k) { toneFX[k].disconnect(); });
        
        var currentNode = window.tonePlayer;
        activeFX.forEach(function(fxName) {
            if (toneFX[fxName]) {
                currentNode.connect(toneFX[fxName]);
                currentNode = toneFX[fxName];
            }
        });
        currentNode.toDestination();
    }

    // Reset pitch
    var btnResetPitch = document.getElementById('btn-reset-pitch');
    if (btnResetPitch) {
        btnResetPitch.addEventListener('click', function() {
            var s = document.getElementById('slider-pitch');
            var v = document.getElementById('val-pitch');
            if (s) s.value = 0;
            if (v) v.textContent = '0 st';
            if (window.tonePlayer) window.tonePlayer.detune = 0;
        });
    }

    // Reset speed
    var btnResetSpeed = document.getElementById('btn-reset-speed');
    if (btnResetSpeed) {
        btnResetSpeed.addEventListener('click', function() {
            var s = document.getElementById('slider-speed');
            var v = document.getElementById('val-speed');
            if (s) s.value = 100;
            if (v) v.textContent = '1.0\xd7';
            if (wavesurfer) wavesurfer.setPlaybackRate(1.0);
            if (window.tonePlayer) window.tonePlayer.playbackRate = 1.0;
        });
    }

    // Import / Add button
    var btnImport = document.getElementById('btn-import');
    var dragHandle = document.getElementById('drag-handle');
    
    if (btnImport) {
        btnImport.addEventListener('click', handleImport);
    }
    
    if (dragHandle) {
        dragHandle.draggable = true;
        dragHandle.addEventListener('dragstart', function(e) {
            isDraggingDummy = true;
            pendingReplaceData = null;
            
            var fp = (window.currentDummyPath) || (selectedAudio && selectedAudio.file_path) || null;
            if (!fp) { e.preventDefault(); return; }
            var osPath = fp.replace(/\//g, '\\');
            e.dataTransfer.effectAllowed = 'copy';
            
            // The crucial Premiere Timeline drop keys:
            e.dataTransfer.setData('com.adobe.cep.dnd.file.0', osPath);
            e.dataTransfer.setData('com.adobe.cep.dnd.dictionary.string', osPath);
            e.dataTransfer.setData('text/plain', osPath);
            
            var pitch = parseInt(document.getElementById('slider-pitch').value) || 0;
            var speed = parseFloat(document.getElementById('slider-speed').value) / 100;
            if (isNaN(speed) || speed <= 0) speed = 1.0;
            var totalDur = (wavesurfer && typeof wavesurfer.getDuration === 'function' ? wavesurfer.getDuration() : 0)
                           || selectedAudioRawDuration || (selectedAudio && selectedAudio.duration) || 1;
            // trimEnd=0 means "not trimmed" — guard against false-trim when default value is 0
            var effectiveTrimStart = (trimStart > 0 && !isNaN(trimStart)) ? trimStart : 0;
            var effectiveTrimEnd   = (trimEnd   > 0 && !isNaN(trimEnd))   ? trimEnd   : null;
            var isTrimmed = effectiveTrimStart > 0.05 || (effectiveTrimEnd !== null && (totalDur - effectiveTrimEnd) > 0.05);
            var finalDur = ((isTrimmed && effectiveTrimEnd ? effectiveTrimEnd : totalDur) - effectiveTrimStart) / speed;

            showDropZone(fp, null, finalDur);

            // Fire FFmpeg instantly on dragstart so it renders while the user moves their mouse!
            if (window.currentDummyPath && selectedAudio && ws && ws.readyState === WebSocket.OPEN) {
                var sr = 48000, ch = 2;
                if (wavesurfer) {
                    var buf = null;
                    if (typeof wavesurfer.getDecodedData === 'function') buf = wavesurfer.getDecodedData();
                    else if (wavesurfer.backend && wavesurfer.backend.buffer) buf = wavesurfer.backend.buffer;
                    if (buf) { sr = buf.sampleRate || 48000; ch = buf.numberOfChannels || 2; }
                }

                pendingProcessMsgId = 'proc_' + Date.now();
                try {
                    ws.send(JSON.stringify({
                        type: 'process_audio',
                        msgId: pendingProcessMsgId,
                        filePath: selectedAudio.file_path,
                        trimStart: isTrimmed ? effectiveTrimStart : null,
                        trimEnd:   isTrimmed ? effectiveTrimEnd   : null,
                        pitch: pitch,
                        speed: speed,
                        sampleRate: sr,
                        channels: ch,
                        dummyFilePath: window.currentDummyPath,
                        audioType: classifyAudio(selectedAudio),
                        durationSec: finalDur
                    }));
                } catch(e2) {}
            }
        });
        dragHandle.addEventListener('dragend', function(e) {
            isDraggingDummy = false;
            hideDropZone();
            
            // If FFmpeg already finished during the drag, execute the pending replace!
            if (pendingReplaceData) {
                var d = pendingReplaceData;
                pendingReplaceData = null;
                setTimeout(function() {
                    doReplaceInPremiere(d.dummyFilePath, d.realFilePath, d.binName);
                }, 50);
            }
        });
    }

    // Init drag handles
    initTrimHandles();

    // Sidebar resizing drag logic
    var sidebar = document.getElementById('sidebar');
    var resizer = document.getElementById('sidebar-resizer');
    if (sidebar && resizer) {
        var startWidth, startX;
        var savedWidth = localStorage.getItem('audio_sidebar_width');
        if (savedWidth) {
            sidebar.style.width = savedWidth + 'px';
            sidebar.style.minWidth = savedWidth + 'px';
        }
        resizer.addEventListener('mousedown', function(e) {
            e.preventDefault();
            startX = e.clientX;
            startWidth = sidebar.offsetWidth;
            resizer.classList.add('dragging');
            function onMouseMove(ev) {
                var newWidth = startWidth + (ev.clientX - startX);
                newWidth = Math.max(120, Math.min(newWidth, 400));
                sidebar.style.width = newWidth + 'px';
                sidebar.style.minWidth = newWidth + 'px';
                localStorage.setItem('audio_sidebar_width', newWidth);
            }
            function onMouseUp() {
                resizer.classList.remove('dragging');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }
}

window.addEventListener('load', function() {
    initUI();
    connectWebSocket();
});
