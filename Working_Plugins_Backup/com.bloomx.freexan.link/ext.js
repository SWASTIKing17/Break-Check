const csInterface = new CSInterface();
const EXT_VERSION = '2.0.0';
// Derive extension folder from panel URL — works without the full CSInterface library.
// CEP loads panel.html as file:///C:/path/to/extension/panel.html so stripping the filename gives the folder.
var extensionPath = (function() {
    var href = window.location.href;
    var dir  = href.substring(0, href.lastIndexOf('/'));
    if (dir.indexOf('file:///') === 0) dir = dir.substring(8).replace(/\//g, '\\');
    return decodeURIComponent(dir);
})();

let ws = null;
let reconnectTimer = null;
let projectCheckInterval = null;
let lastProjectPath = '';
let projectReadySent = false;
let reconnectAttempts = 0;
var MAX_RECONNECT = 30; // stop after 30 attempts (~90 s) if server never comes back

function extLog(msg) {
    console.log('[freeXan] ' + msg);
    if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'ext_log', source: 'link', msg: msg })); } catch(e) {}
    }
}

// Override evalScript to log all commands and results to the node backend
const originalEvalScript = csInterface.evalScript;
csInterface.evalScript = function(script, callback) {
    extLog('Executing JSX Script:\n' + script.substring(0, 500) + (script.length > 500 ? '...' : ''));
    originalEvalScript.call(this, script, function(result) {
        // Exclude noisy ping results if needed, but the user requested "every command sent to Premiere and its result"
        extLog('JSX Result:\n' + String(result).substring(0, 500) + (String(result).length > 500 ? '...' : ''));
        if (typeof callback === 'function') {
            callback(result);
        }
    });
};

// BUG-24: uniform evalScript result checker — returns false and logs on any failure
function evalResult(r, label) {
    if (!r || r === 'undefined' || r === 'EvalScript error.' || r.indexOf('err:') === 0) {
        extLog('[evalResult] FAILED ' + label + ': ' + r);
        return false;
    }
    return true;
}

// F-OV-015: after a multi-file drop completes, switch the Project panel to the
// target bin and select the imported items. ExtendScript ProjectItem.select() is
// single-select; we select the most-recently-imported item and rely on
// setCurrentBin to reveal the destination bin so the user sees everything that
// landed there.
function finalizeImportBatch(batchId) {
    if (!window._batchCollector || !window._batchCollector[batchId]) return;
    var batch = window._batchCollector[batchId];
    delete window._batchCollector[batchId];
    var bn = (batch.binName || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    var nameList = batch.files.map(function(f) {
        return '"' + f.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    }).join(',');
    var script = '(function(){' +
        'try{' +
        '  if(!app.project||!app.project.rootItem)return "err:no project";' +
        '  function findBin(p,n){for(var i=0;i<2000;i++){var c=p.children[i];if(!c)break;if(c.name===n&&c.type===ProjectItemType.BIN)return c;if(c.type===ProjectItemType.BIN){var r=findBin(c,n);if(r)return r;}}return null;}' +
        '  var bn="' + bn + '";' +
        '  var tgt=bn?findBin(app.project.rootItem,bn):app.project.rootItem;' +
        '  if(!tgt)tgt=app.project.rootItem;' +
        '  try{app.project.setCurrentBin(tgt);}catch(e){}' +
        '  var names=[' + nameList + '];' +
        '  var matched=[];' +
        '  for(var k=0;k<2000;k++){' +
        '    var ch=tgt.children[k];if(!ch)break;' +
        '    for(var n=0;n<names.length;n++){' +
        '      if(ch.name===names[n]){matched.push(ch);break;}' +
        '    }' +
        '  }' +
        '  if(matched.length===0)return "no_matches";' +
        '  try{matched[matched.length-1].select();}catch(e){}' +
        '  return "ok:"+matched.length;' +
        '}catch(e){return "err:"+e;}' +
        '})()';
    csInterface.evalScript(script, function(r) {
        extLog('[BATCH] finalize ' + batchId + ' (' + batch.files.length + ' file(s)) → ' + r);
    });
}

function connectWebSocket() {
    if (ws) { try { ws.close(); } catch(e) {} }

    const statusText = document.getElementById('status-text');
    const pulse      = document.getElementById('pulse');
    const infoText   = document.getElementById('info-text');

    statusText.innerText = 'Connecting...';
    statusText.className = 'status disconnected';
    pulse.className      = 'pulse disconnected';

    ws = new WebSocket('ws://localhost:4554');

    ws.onopen = function() {
        reconnectAttempts = 0; // BUG-23: reset counter on successful connection
        statusText.innerText = 'Connected';
        statusText.className = 'status connected';
        pulse.className      = 'pulse connected';
        infoText.innerText   = 'Syncing active project...';

        ws.send(JSON.stringify({ type: 'ext_hello', version: EXT_VERSION }));
        lastProjectPath  = '';
        projectReadySent = false;
        startProjectTracking();
        requestAudioLibrary();
        // extLog('WebSocket connected — ext v' + EXT_VERSION);
    };

    ws.onmessage = function(event) {
        try {
            var data = JSON.parse(event.data);

            if (data.type === 'reload') {
                // extLog('Reload command received — reloading panel');
                window.location.reload();
                return;
            }

            if (data.type === 'audio_library_data') {
                audioLibrary = data.files || [];
                renderAudioList();
                return;
            }

            if (data.type === 'audio_library_changed') {
                requestAudioLibrary();
                return;
            }

            if (data.type === 'process_result') {
                if (data.success && data.msgId === pendingProcessMsgId) {
                    importAudioToPremiere(data.filePath);
                } else if (!data.success && data.msgId === pendingProcessMsgId) {
                    alert('Error processing audio: ' + data.error);
                }
                pendingProcessMsgId = null;
                const btnImport = document.getElementById('btn-import');
                if (btnImport) {
                    btnImport.innerText = 'Import';
                    btnImport.disabled = false;
                }
                return;
            }

            if (data.type === 'import') {
                if (typeof data.filePath !== 'string') return; // BUG-22: guard malformed message
                var filePath = data.filePath;
                var binName  = data.binName || null;
                var fileName = filePath.substring(filePath.lastIndexOf('\\') + 1);
                infoText.innerText = 'Importing: ' + fileName;

                // F-OV-015: track batched drops so we can switch to the target bin
                // and highlight what was just imported once the whole batch finishes.
                if (data.batchId) {
                    if (!window._batchCollector) window._batchCollector = {};
                    if (!window._batchCollector[data.batchId]) {
                        window._batchCollector[data.batchId] = { binName: binName, files: [] };
                    }
                    window._batchCollector[data.batchId].files.push(fileName);
                }
                // Inline IIFE — never call named hostscript.jsx functions (silent failure, fixed v1.8.3)
                var ep = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                var bn = binName ? binName.replace(/\\/g, '\\\\').replace(/"/g, '\\"') : '';

                // ── IMPORT DEBUG ─────────────────────────────────────────────
                extLog('[IMPORT] ─── app.project.importFiles call ───');
                extLog('[IMPORT] fileName   : ' + fileName);
                extLog('[IMPORT] filePath   : ' + ep);
                extLog('[IMPORT] binName    : ' + (bn ? '"' + bn + '"' : '(none)'));
                extLog('[IMPORT] params[0]  : ["' + ep + '"]');
                extLog('[IMPORT] params[1]  : true  (suppressWarnings)');
                extLog('[IMPORT] params[2]  : ' + (bn ? 'will search rootItem.children for bin "' + bn + '"' : 'app.project.rootItem (no bin specified)'));
                extLog('[IMPORT] params[3]  : false (addToRoot)');
                // ─────────────────────────────────────────────────────────────

                var fn = fileName.replace(/"/g, '\\"');
                var script = '(function(){' +
                    'if(!app.project)return "err:no project";' +
                    'var f=new File("' + ep + '");' +
                    'if(!f.exists)return "err:file not found";' +
                    'function findBin(parent,name){' +
                    '  for(var i=0;i<2000;i++){' +
                    '    var c=parent.children[i];' +
                    '    if(!c)break;' +
                    '    if(c.name===name&&c.type===ProjectItemType.BIN)return c;' +
                    '    if(c.type===ProjectItemType.BIN){var r=findBin(c,name);if(r)return r;}' +
                    '  }' +
                    '  return null;' +
                    '}' +
                    'var tgt=app.project.rootItem;' +
                    'var tgtDesc="rootItem";' +
                    'var bn="' + bn + '";' +
                    'if(bn){var found=findBin(app.project.rootItem,bn);if(found){tgt=found;tgtDesc="bin:"+bn;}}' +
                    'var ok=app.project.importFiles(["' + ep + '"],true,tgt,false);' +
                    'if(ok){' +
                    '  try{app.project.setCurrentBin(tgt);}catch(e){}' +
                    '  var iname="' + fn + '";' +
                    '  for(var i=0;i<tgt.children.numItems;i++){' +
                    '    if(tgt.children[i].name===iname){' +
                    '      try{tgt.children[i].select();}catch(e){}' +
                    '      break;' +
                    '    }' +
                    '  }' +
                    '}' +
                    'return (ok?"ok":"import failed")+"|tgtDesc:"+tgtDesc;' +
                    '})()';
                csInterface.evalScript(script, function(result) {
                    var tgtIdx  = result ? result.indexOf('|tgtDesc:') : -1;
                    var status  = tgtIdx >= 0 ? result.substring(0, tgtIdx) : (result || 'unknown');
                    var tgtDesc = tgtIdx >= 0 ? result.substring(tgtIdx + 9) : 'unknown';
                    extLog('[IMPORT] result     : ' + status);
                    extLog('[IMPORT] resolvedTgt: ' + tgtDesc);
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        try { ws.send(JSON.stringify({ type: 'import_result', filePath: filePath, binName: binName, result: status })); } catch(e) {}
                    }

                    // F-OV-015: finalize batch — switch to bin and select all imported items
                    if (data.isLast && data.batchId) {
                        finalizeImportBatch(data.batchId);
                    }

                    setTimeout(function() {
                        infoText.innerText = lastProjectPath
                            ? 'Project: ' + lastProjectPath.substring(lastProjectPath.lastIndexOf('\\') + 1)
                            : 'No active project';
                    }, 2000);
                });
                return;
            }

            if (data.type === 'get_bin_files') {
                // Linked-folder watcher requesting current contents of a bin so it
                // can diff against the disk folder. Respond with the list of file
                // names (top-level children of the bin, no recursion into sub-bins).
                var requestId = data.requestId;
                var binName = (data.binName || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                var script = '(function(){' +
                    'try {' +
                    '  if(!app.project) return JSON.stringify({err:"no project"});' +
                    '  function findBin(parent,name){' +
                    '    for(var i=0;i<2000;i++){var c=parent.children[i];if(!c)break;' +
                    '      if(c.name===name&&c.type===ProjectItemType.BIN)return c;' +
                    '      if(c.type===ProjectItemType.BIN){var r=findBin(c,name);if(r)return r;}' +
                    '    }return null;' +
                    '  }' +
                    '  var bn="' + binName + '";' +
                    '  var bin=bn?findBin(app.project.rootItem,bn):app.project.rootItem;' +
                    '  if(!bin) return JSON.stringify({files:[]});' +
                    '  var out=[];' +
                    '  for(var i=0;i<2000;i++){var c=bin.children[i];if(!c)break;' +
                    '    if(c.type!==ProjectItemType.BIN) out.push(c.name);' +
                    '  }' +
                    '  return JSON.stringify({files:out});' +
                    '} catch(e) { return JSON.stringify({err:e.message}); }' +
                    '})()';
                csInterface.evalScript(script, function(result) {
                    var files = [];
                    try {
                        var parsed = JSON.parse(result);
                        if (parsed && parsed.files) files = parsed.files;
                        if (parsed && parsed.err) extLog('[BIN_FILES] error: ' + parsed.err);
                    } catch (parseErr) {
                        extLog('[BIN_FILES] parse failed: ' + parseErr.message + ' | raw: ' + result);
                    }
                    try {
                        ws.send(JSON.stringify({ type: 'bin_files', requestId: requestId, files: files }));
                    } catch (sendErr) {
                        extLog('[BIN_FILES] send failed: ' + sendErr.message);
                    }
                });
                return;
            }

            if (data.type === 'setup-project') {
                infoText.innerText = 'Waiting for project to be ready…';

                var seqPreset = data.sequencePreset || null;
                var assets = data.assets || [];

                var doImports = function() {
                    if (assets.length === 0) return;
                    setTimeout(function() {
                        assets.forEach(function(asset) {
                            if (!asset || typeof asset.sourcePath !== 'string') return;
                            var ep = asset.sourcePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                            var bn = (asset.binName || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                            var fileName = asset.sourcePath.split('\\').pop();
                            // Inline IIFE — same findBin pattern as drag-drop import, never call named functions
                            var script = '(function(){' +
                                'if(!app.project)return "err:no project";' +
                                'var f=new File("' + ep + '");' +
                                'if(!f.exists)return "err:file not found";' +
                                'function findBin(parent,name){' +
                                '  for(var i=0;i<2000;i++){var c=parent.children[i];if(!c)break;' +
                                '    if(c.name===name&&c.type===ProjectItemType.BIN)return c;' +
                                '    if(c.type===ProjectItemType.BIN){var r=findBin(c,name);if(r)return r;}' +
                                '  }return null;' +
                                '}' +
                                'var tgt=app.project.rootItem;' +
                                'var bn="' + bn + '";' +
                                'if(bn){var found=findBin(app.project.rootItem,bn);if(found)tgt=found;}' +
                                'var ok=app.project.importFiles(["' + ep + '"],true,tgt,false);' +
                                'return ok?"ok":"import failed";' +
                                '})()';
                            csInterface.evalScript(script, function(r) {
                                extLog('[ASSET] "' + fileName + '"' + (bn ? ' → bin "' + bn + '"' : '') + ': ' + r);
                            });
                        });
                    }, 800);
                };

                if (data.premiereTree && data.premiereTree.length > 0) {
                    setupFromPremiereTree(data.premiereTree, seqPreset, doImports);
                } else {
                    setupProjectBinsAndSequences(data.bins || [], data.sequences || [], seqPreset, doImports);
                }
                return;
            }
        } catch(e) {
            console.error('[freeXan] onmessage error:', e);
        }
    };

    ws.onclose = function() {
        statusText.innerText = 'Disconnected';
        statusText.className = 'status disconnected';
        pulse.className      = 'pulse disconnected';
        stopProjectTracking();
        clearTimeout(reconnectTimer);
        reconnectAttempts++;
        if (reconnectAttempts <= MAX_RECONNECT) {
            infoText.innerText = 'Waiting for Project Builder App...';
            reconnectTimer = setTimeout(connectWebSocket, 3000);
        } else {
            infoText.innerText = 'App not found. Reload panel to retry.';
        }
    };

    ws.onerror = function(err) {
        console.error('[freeXan] WebSocket error:', err);
    };
}

// Returns "READY||<path>", "NOT_READY||<path>", or "NONE||"
// ri.children access is the readiness probe — it throws during project load
// even when rootItem exists, unlike numItems which can be undefined silently.
var TRACKING_SCRIPT = '(function(){' +
    'try{' +
    '  if(!app||!app.project)return "NONE||";' +
    '  var path=app.project.path||"";' +
    '  if(!path)return "NONE||";' +
    '  try{' +
    '    var ri=app.project.rootItem;' +
    '    if(!ri)return "NOT_READY||"+path;' +
    '    var _t=ri.children;' +
    '    return "READY||"+path;' +
    '  }catch(e2){return "NOT_READY||"+path;}' +
    '}catch(e){return "NONE||";}' +
    '})()';

function startProjectTracking() {
    stopProjectTracking();

    projectCheckInterval = setInterval(function() {
        csInterface.evalScript(TRACKING_SCRIPT, function(result) {
            if (!result || result === 'undefined') return;

            var sep   = result.indexOf('||');
            var state = result.substring(0, sep);
            var path  = result.substring(sep + 2).trim();
            var infoEl = document.getElementById('info-text');

            if (!path || state === 'NONE') {
                if (lastProjectPath !== '') {
                    lastProjectPath  = '';
                    projectReadySent = false;
                    if (infoEl) infoEl.innerText = 'No active project';
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        try { ws.send(JSON.stringify({ type: 'active_project', path: '' })); } catch(e) {}
                    }
                    // extLog('project closed');
                }
                return;
            }

            if (path !== lastProjectPath) {
                lastProjectPath  = path;
                projectReadySent = false;
                var projName = path.substring(path.lastIndexOf('\\') + 1);
                if (infoEl) infoEl.innerText = 'Project: ' + projName + ' (loading…)';
                if (ws && ws.readyState === WebSocket.OPEN) {
                    try { ws.send(JSON.stringify({ type: 'active_project', path: path })); } catch(e) {}
                }
                // extLog('project changed → "' + projName + '" | rootItem:' + state);
            }

            if (state === 'READY' && !projectReadySent) {
                projectReadySent = true;
                var pn = path.substring(path.lastIndexOf('\\') + 1);
                if (infoEl) infoEl.innerText = 'Project: ' + pn;
                // extLog('project_ready → "' + pn + '"');
                if (ws && ws.readyState === WebSocket.OPEN) {
                    try { ws.send(JSON.stringify({ type: 'project_ready', path: path })); } catch(e) {}
                }
            }
        });
    }, 1000);
}

function stopProjectTracking() {
    if (projectCheckInterval) {
        clearInterval(projectCheckInterval);
        projectCheckInterval = null;
    }
}

// Polls every 300ms until rootItem.children is accessible.
// ri.children access used as the readiness probe — consistent with TRACKING_SCRIPT.
function waitForProjectReady(callback) {
    var tries    = 0;
    var maxTries = 40;
    var readyScript = '(function(){' +
        'try{' +
        '  var ri=app.project&&app.project.rootItem;' +
        '  if(!ri)return "wait";' +
        '  var _t=ri.children;' +
        '  return "ready";' +
        '}catch(e){return "wait";}' +
        '})()';
    function check() {
        csInterface.evalScript(readyScript, function(result) {
            tries++;
            if (result === 'ready') {
                // extLog('rootItem ready after ' + tries + ' poll(s)');
                callback();
            } else if (tries < maxTries) {
                setTimeout(check, 300);
            } else {
                // extLog('WARN: rootItem still not ready after ' + tries + ' polls — attempting anyway');
                callback();
            }
        });
    }
    check();
}

// ── Main creation algorithm ────────────────────────────────────────────────────
//
// Order:
//   1. Root bins — all bins with no parent, created in sort_order
//   2. Nested bins — DFS into each bin's children before moving to next root bin
//   3. Sequences — created last, after all bins exist, moved to their parent bin
//
// Adaptive T:
//   Every successful "ok" updates adaptiveT = elapsed ms for that command.
//   Next injection waits adaptiveT ms (giving Premiere time to update children).
//   Retries also wait adaptiveT ms — the same time Premiere needed to process the last command.
//
function setupFromPremiereTree(nodes, sequencePreset, onComplete) {
    var adaptiveT  = 200; // initial conservative estimate in ms
    var infoEl     = document.getElementById('info-text');
    var eExtPath   = extensionPath.replace(/\\/g, '\\\\');
    // Use named preset from sqpersets/ if provided, otherwise fall back to legacy file
    var presetPath = sequencePreset
        ? eExtPath + '\\\\sqpersets\\\\' + sequencePreset + '.sqpreset'
        : eExtPath + '\\\\sequence-preset.sqpreset';

    // Build the full parent-path array for a node by walking up the tempId chain
    function buildPath(parentId) {
        if (!parentId) return [];
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].tempId === parentId) {
                return buildPath(nodes[i].parent_id).concat(nodes[i].name);
            }
        }
        return [];
    }

    // Collect all sequence nodes with their resolved parent paths and per-sequence format
    var sequences = [];
    for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].type === 'sequence') {
            sequences.push({
                name:       nodes[i].name,
                parentPath: buildPath(nodes[i].parent_id),
                width:      nodes[i].width  || 0,
                height:     nodes[i].height || 0,
                fps:        nodes[i].fps    || 0
            });
        }
    }

    // Root bins only (parent_id === null), sorted
    var rootBins = nodes
        .filter(function(n) { return n.type === 'bin' && n.parent_id === null; })
        .sort(function(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });

    // extLog('plan — ' + rootBins.length + ' root bin(s), ' + sequences.length + ' sequence(s) deferred');

    function getChildBins(parentTempId) {
        return nodes
            .filter(function(n) { return n.type === 'bin' && n.parent_id === parentTempId; })
            .sort(function(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    }

    // Send one bin creation command, measure T, retry on parent-not-found using T as the wait
    function createOneBin(name, parentPathArr, onDone) {
        var ePath  = parentPathArr.join('|').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        var eName  = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        var label  = '"' + name + '"' + (parentPathArr.length ? ' in ' + parentPathArr.join('/') : ' [root]');
        var script = '(function(){'
            + 'try{'
            +   'if(!app.project||!app.project.rootItem)return "err:rootItem not ready";'
            +   'var p=app.project.rootItem;'
            +   'var s="' + ePath + '";'
            +   'if(s.length>0){'
            +     'var pts=s.split("|");'
            +     'for(var i=0;i<pts.length;i++){'
            +       'var ok=false;'
            +       'for(var j=0;j<2000;j++){'
            +         'var c=p.children[j];'
            +         'if(!c)break;'
            +         'if(c.name===pts[i]&&c.type===ProjectItemType.BIN){p=c;ok=true;break;}'
            +       '}'
            +       'if(!ok){'
            +         'var cn="";for(var k=0,ck;(ck=p.children[k])&&k<30;k++)cn+=","+ck.name;'
            +         'return "err:parent not found: "+pts[i]+" (saw:["+cn.slice(1)+"])";'
            +       '}'
            +     '}'
            +   '}'
            +   'p.createBin("' + eName + '");'
            +   'return "ok";'
            + '}catch(e){return "err:"+e;}'
            + '})()';

        var start    = Date.now();
        var attempts = 0;

        function attempt() {
            attempts++;
            csInterface.evalScript(script, function(result) {
                var elapsed = Date.now() - start;
                if (result === 'ok') {
                    adaptiveT = elapsed;
                    // extLog('bin ' + label + ' → ok ' + elapsed + 'ms (T=' + adaptiveT + ')' + (attempts > 1 ? ' attempt ' + attempts : ''));
                    if (infoEl) infoEl.innerText = 'Created: ' + name;
                    // 250ms minimum: Premiere updates rootItem.children ~200-400ms after createBin returns
                    setTimeout(onDone, Math.max(adaptiveT, 250));
                } else if (result.indexOf('err:parent not found') === 0 && attempts < 8) {
                    // extLog('bin ' + label + ' → ' + result + ' — retry in ' + Math.max(adaptiveT, 200) + 'ms (attempt ' + attempts + ')');
                    // 200ms minimum per retry — children list update is independent of creation speed
                    setTimeout(attempt, Math.max(adaptiveT, 200));
                } else {
                    // extLog('bin ' + label + ' → FAILED: ' + result + ' after ' + attempts + ' attempt(s)');
                    if (infoEl) infoEl.innerText = 'ERR: ' + result;
                    setTimeout(onDone, Math.max(adaptiveT, 250));
                }
            });
        }

        // extLog('bin ' + label + ' …');
        attempt();
    }

    // DFS: create this bin, wait T, then recurse into children before calling onDone
    function processBinAndChildren(node, parentPathArr, onDone) {
        createOneBin(node.name, parentPathArr, function() {
            var childPath = parentPathArr.concat(node.name);
            var children  = getChildBins(node.tempId);
            if (children.length === 0) { onDone(); return; }
            function nextChild(idx) {
                if (idx >= children.length) { onDone(); return; }
                processBinAndChildren(children[idx], childPath, function() { nextChild(idx + 1); });
            }
            nextChild(0);
        });
    }

    function processRootBins(idx) {
        if (idx >= rootBins.length) {
            // Phase 3: all bins done — now create sequences
            if (sequences.length === 0) {
                var pn = lastProjectPath ? lastProjectPath.substring(lastProjectPath.lastIndexOf('\\') + 1) : '';
                // extLog('setup complete — no sequences');
                if (infoEl) infoEl.innerText = pn ? 'Project: ' + pn : 'Setup complete';
                if (typeof onComplete === 'function') onComplete();
            } else {
                // extLog('all bins done — creating ' + sequences.length + ' sequence(s)');
                createNextSequence(0);
            }
            return;
        }
        processBinAndChildren(rootBins[idx], [], function() {
            processRootBins(idx + 1);
        });
    }

    // Phase 3: sequences created one at a time using adaptive T, moved to parent bin
    function createNextSequence(idx) {
        if (idx >= sequences.length) {
            var pn = lastProjectPath ? lastProjectPath.substring(lastProjectPath.lastIndexOf('\\') + 1) : '';
            // extLog('setup complete — all ' + sequences.length + ' sequence(s) done');
            if (infoEl) infoEl.innerText = pn ? 'Project: ' + pn : 'Setup complete';
            if (typeof onComplete === 'function') onComplete();
            return;
        }
        var seq    = sequences[idx];
        var eSeq   = seq.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        var eSPath = seq.parentPath.join('|').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        var label  = '"' + seq.name + '"' + (seq.parentPath.length ? ' in ' + seq.parentPath.join('/') : ' [root]');

        // Per-sequence preset: use width/height/fps stored in the template node.
        // Falls back to the function-level preset (from global setting) if not set.
        var seqPresetPath;
        if (seq.width && seq.height && seq.fps) {
            seqPresetPath = eExtPath + '\\\\sqpersets\\\\' + seq.width + 'x' + seq.height + '_' + seq.fps + 'fps.sqpreset';
        } else {
            seqPresetPath = presetPath; // global fallback
        }

        // Sequence creation cascade:
        //   1. createNewSequenceFromPreset  — no dialog, uses preset (PP 2019+ API)
        //   2. QE domain newSequence        — no dialog, uses preset (unofficial but widely supported)
        //   3. createNewSequence            — shows dialog (last resort)
        // After creation: find sequence as ProjectItem in rootItem.children (not via Sequence return
        // value — Sequence object does not have moveBin; ProjectItem does).
        var seqScript = '(function(){'
            + 'try{'
            +   'if(!app.project)return "err:no project";'
            +   'var sName="' + eSeq + '";'
            +   'var pPath="' + seqPresetPath + '";'
            +   'var method="none";'

            // Method 1: createNewSequenceFromPreset
            +   'if(typeof app.project.createNewSequenceFromPreset==="function"){'
            +     'try{app.project.createNewSequenceFromPreset(pPath,sName);method="preset";}catch(e1){method="preset-fail:"+e1;}'
            +   '}'

            // Method 2: QE domain
            +   'if(method==="none"||method.indexOf("fail")!==-1){'
            +     'try{'
            +       'app.enableQE();'
            +       'if(typeof qe!=="undefined"&&qe.project&&typeof qe.project.newSequence==="function"){'
            +         'qe.project.newSequence(sName,pPath);method="qe";'
            +       '}'
            +     '}catch(e2){}'
            +   '}'

            // Method 3: standard createNewSequence (shows dialog)
            +   'if(method==="none"||method.indexOf("fail")!==-1){'
            +     'app.project.createNewSequence(sName,"");method="dialog";'
            +   '}'

            // Find the sequence as a ProjectItem in rootItem.children by name
            // (skip BINs — sequences appear as CLIP or FILE type, not BIN)
            +   'var seqItem=null;'
            +   'for(var k=0;k<2000;k++){'
            +     'var item=app.project.rootItem.children[k];'
            +     'if(!item)break;'
            +     'if(item.name===sName&&item.type!==ProjectItemType.BIN){seqItem=item;break;}'
            +   '}'
            +   'if(!seqItem)return "err:seq item not found in root (method="+method+")";'

            // If no target bin, done
            +   'if("' + eSPath + '".length===0)return "ok:"+method;'

            // Find target bin using null-terminated search (no numItems dependency)
            +   'var pts="' + eSPath + '".split("|");'
            +   'var tgt=app.project.rootItem;'
            +   'for(var i=0;i<pts.length;i++){'
            +     'var found=false;'
            +     'for(var j=0;j<2000;j++){'
            +       'var c=tgt.children[j];'
            +       'if(!c)break;'
            +       'if(c.name===pts[i]&&c.type===ProjectItemType.BIN){tgt=c;found=true;break;}'
            +     '}'
            +     'if(!found){'
            +       'var cn="";for(var m=0,ck;(ck=tgt.children[m])&&m<30;m++)cn+=","+ck.name;'
            +       'return "err:target bin not found: "+pts[i]+" (saw:["+cn.slice(1)+"])";'
            +     '}'
            +   '}'

            // moveBin on the ProjectItem (not on the Sequence return value)
            +   'seqItem.moveBin(tgt);'
            +   'return "ok:"+method;'

            + '}catch(e){return "err:"+e;}'
            + '})()';

        var start       = Date.now();
        var seqAttempts = 0;

        function attemptSeq() {
            seqAttempts++;
            csInterface.evalScript(seqScript, function(result) {
                var elapsed = Date.now() - start;
                if (result.indexOf('ok:') === 0) {
                    adaptiveT = elapsed;
                    // extLog('seq ' + label + ' → ok ' + elapsed + 'ms (T=' + adaptiveT + ') [' + result.split(':')[1] + ']');
                    if (infoEl) infoEl.innerText = 'Created: ' + seq.name;
                    setTimeout(function() { createNextSequence(idx + 1); }, Math.max(adaptiveT, 30));
                } else if (result.indexOf('err:target bin not found') === 0 && seqAttempts < 8) {
                    // extLog('seq ' + label + ' → ' + result + ' — retry in ' + Math.max(adaptiveT, 200) + 'ms (attempt ' + seqAttempts + ')');
                    setTimeout(attemptSeq, Math.max(adaptiveT, 200));
                } else {
                    // extLog('seq ' + label + ' → FAILED: ' + result + ' after ' + seqAttempts + ' attempt(s)');
                    if (infoEl) infoEl.innerText = 'ERR: ' + result;
                    setTimeout(function() { createNextSequence(idx + 1); }, Math.max(adaptiveT, 30));
                }
            });
        }

        // extLog('seq ' + label + ' …');
        attemptSeq();
    }

    waitForProjectReady(function() {
        // extLog('rootItem confirmed — phase 1: root bins');
        if (infoEl) infoEl.innerText = 'Creating project structure…';
        processRootBins(0);
    });
}

// Flat path (no premiereTree): bins to root sequentially, then sequences to root
function setupProjectBinsAndSequences(bins, sequences, sequencePreset, onComplete) {
    if (bins.length === 0 && sequences.length === 0) {
        if (typeof onComplete === 'function') onComplete();
        return;
    }
    var infoEl     = document.getElementById('info-text');
    var eExtPath   = extensionPath.replace(/\\/g, '\\\\');
    var presetPath = sequencePreset
        ? eExtPath + '\\\\sqpersets\\\\' + sequencePreset + '.sqpreset'
        : eExtPath + '\\\\sequence-preset.sqpreset';
    var adaptiveT  = 200;
    // extLog('flat insert: ' + bins.length + ' bin(s) + ' + sequences.length + ' sequence(s)');

    waitForProjectReady(function() {
        function createNextBin(idx) {
            if (idx >= bins.length) { createNextSeq(0); return; }
            var name    = bins[idx];
            var escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            var script  = '(function(){'
                + 'try{'
                +   'if(!app.project||!app.project.rootItem)return "err:rootItem not ready";'
                +   'app.project.rootItem.createBin("' + escaped + '");'
                +   'return "ok";'
                + '}catch(e){return "err:"+e;}'
                + '})()';
            // extLog('bin [' + (idx + 1) + '/' + bins.length + '] "' + name + '" …');
            var start = Date.now();
            csInterface.evalScript(script, function(result) {
                var elapsed = Date.now() - start;
                if (result === 'ok') adaptiveT = elapsed;
                // extLog('  bin "' + name + '" → ' + result + (result === 'ok' ? ' ' + elapsed + 'ms' : ''));
                if (infoEl) infoEl.innerText = result === 'ok' ? 'Created: ' + name : 'ERR: ' + result;
                setTimeout(function() { createNextBin(idx + 1); }, Math.max(adaptiveT, 30));
            });
        }

        function createNextSeq(idx) {
            if (idx >= sequences.length) {
                var pn = lastProjectPath ? lastProjectPath.substring(lastProjectPath.lastIndexOf('\\') + 1) : '';
                // extLog('flat setup complete');
                if (infoEl) infoEl.innerText = pn ? 'Project: ' + pn : 'Setup complete';
                if (typeof onComplete === 'function') onComplete();
                return;
            }
            var name    = sequences[idx];
            var escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            var script  = '(function(){'
                + 'try{'
                +   'if(!app.project)return "err:no project";'
                +   'var s;'
                +   'if(typeof app.project.createNewSequenceFromPreset==="function"){'
                +     's=app.project.createNewSequenceFromPreset("' + presetPath + '","' + escaped + '");'
                +   '}else{'
                +     's=app.project.createNewSequence("' + escaped + '","' + presetPath + '");'
                +   '}'
                +   'return s?"ok":"err:seq create failed";'
                + '}catch(e){return "err:"+e;}'
                + '})()';
            // extLog('seq [' + (idx + 1) + '/' + sequences.length + '] "' + name + '" …');
            var start = Date.now();
            csInterface.evalScript(script, function(result) {
                var elapsed = Date.now() - start;
                if (result === 'ok') adaptiveT = elapsed;
                // extLog('  seq "' + name + '" → ' + result + (result === 'ok' ? ' ' + elapsed + 'ms' : ''));
                if (infoEl) infoEl.innerText = result === 'ok' ? 'Created: ' + name : 'ERR: ' + result;
                setTimeout(function() { createNextSeq(idx + 1); }, Math.max(adaptiveT, 30));
            });
        }

        createNextBin(0);
    });
}

connectWebSocket();

window.addEventListener('unload', function() {
    stopProjectTracking();
    if (ws) {
        try { ws.close(); } catch(e) {}
    }
});
