/**
 * freeXan Caption — MOGRT Param Editor Backend
 *
 * Architecture mirrors Premiere Composer exactly:
 *   - aegraphic path check for MOGRT detection (NOT isMGT)
 *   - props.numItems for iteration
 *   - Color read: getColorValue() → hex string 'rrggbb' (c[1]=r, c[2]=g, c[3]=b)
 *   - Color write: setColorValue(1, r, g, b, isLast) — alpha hardcoded 1
 *   - app.bind() events dispatch CSXSEvent 'freexan.caption.paramsUpdated'
 *
 * Public functions:
 *   smInitParamEvents()     — binds app events; call once on panel load
 *   smGetSelectionParams()  — manual refresh; returns current MOGRT selection
 *   smApplyParam(data)      — writes one param; color value = { r, g, b }
 */

var aegraphicRegex = /\.(aegraphic|mogrt)$/i;

// Hard cap: never iterate more than this many MOGRT properties in one call.
// Premiere MOGRTs rarely exceed 60 real params; anything over 200 is a sign
// of a corrupted template or a recursive structure — exactly what caused the
// "InternalError: Stack overrun" crash seen in debug_jsx.log.
var SM_MAX_PROPS = 200;

function smIsMogrtClip(clip) {
  // Primary: media path ends with .aegraphic or .mogrt
  try {
    var path = clip.projectItem.getMediaPath();
    if (path && aegraphicRegex.test(path)) return true;
  } catch (e) {}
  // Fallback: isMGT() API (may be unreliable in PP2025 but worth trying)
  try { if (clip.isMGT && clip.isMGT()) return true; } catch (e) {}
  // Last resort: try getMGTComponent — if it returns a non-null object with properties, it's a MOGRT
  try {
    var mgt = clip.getMGTComponent();
    if (mgt && mgt.properties && mgt.properties.numItems > 0) return true;
  } catch (e) {}
  return false;
}

function smParseClipParams(clip) {
  var params = [];
  try {
    var mgtComp = clip.getMGTComponent();
    if (!mgtComp) {
      jsxLog("smParseClipParams: getMGTComponent() returned null — skipping clip", "WARN");
      return params;
    }
    var props    = mgtComp.properties;
    if (!props) {
      jsxLog("smParseClipParams: properties is null — skipping clip", "WARN");
      return params;
    }
    var numProps = props.numItems;

    // Stack overrun guard: if a template exposes an absurd number of properties
    // (seen with corrupted or nested MOGRTs), cap iteration to SM_MAX_PROPS.
    // Without this cap, ExtendScript's call stack overruns and the engine crashes,
    // causing the panel to show DISCONNECTED even though Premiere is running fine.
    if (numProps > SM_MAX_PROPS) {
      jsxLog("smParseClipParams: property count " + numProps + " exceeds cap " + SM_MAX_PROPS + " — truncating to prevent Stack overrun", "WARN");
      numProps = SM_MAX_PROPS;
    }

    for (var p = 0; p < numProps; p++) {
      // Wrap each property access individually — one bad property must not abort the whole clip.
      try {
        var prop = props[p];
        if (!prop) { params.push({ idx: p, name: '', kind: 'skip', val: '' }); continue; }

        var name = '';
        var rawPropName = '';
        var propType = -1;
        try { name = prop.displayName || ''; } catch (e) {}
        try { rawPropName = prop.name || ''; } catch (e) {}
        try { propType = prop.propertyType; } catch (e) {}

        // Get value — if it throws we still emit a placeholder so group child-counts stay accurate
        var val;
        var valOk = true;
        try { val = prop.getValue(); } catch (e) { valOk = false; }

        var isMediaSlot = false;
        try { if (typeof prop.canReplaceMedia === 'function' && prop.canReplaceMedia()) isMediaSlot = true; } catch (e) {}
        try { if (prop.propertyType === 6 || prop.propertyType === 7) isMediaSlot = true; } catch (e) {}

        if (isMediaSlot) {
          params.push({ idx: p, name: name || "Media / Image Slot", kind: 'image', val: '' });
        } else if (!valOk || val === null || val === undefined) {
          // Inaccessible param (e.g. Vector2/Point) — placeholder preserves tree count
          params.push({ idx: p, name: name, kind: 'skip', val: '' });
        } else if (val >= 0x1000000000000) {
          // Color
          try {
            var c = prop.getColorValue();
            params.push({
              idx: p, name: name, kind: 'color',
              val: ('0' + c[1].toString(16)).slice(-2)
                 + ('0' + c[2].toString(16)).slice(-2)
                 + ('0' + c[3].toString(16)).slice(-2)
            });
          } catch (ex) {
            params.push({ idx: p, name: name, kind: 'skip', val: '' });
          }
        } else if (typeof val === 'boolean') {
          params.push({ idx: p, name: name, kind: 'boolean', val: val });
        } else if (typeof val === 'number') {
          params.push({ idx: p, name: name, kind: 'number', val: val });
        } else if (typeof val === 'string') {
          if (val.charAt(0) === '{') {
            try {
              var parsed = JSON.parse(val);
              var txtVal = null;
              if (parsed) {
                if (typeof parsed.textEditValue === 'string') txtVal = parsed.textEditValue;
                else if (typeof parsed.text === 'string') txtVal = parsed.text;
                else if (typeof parsed.value === 'string') txtVal = parsed.value;
                else if (typeof parsed.content === 'string') txtVal = parsed.content;
              }
              if (txtVal !== null) {
                params.push({ idx: p, name: name, kind: 'text', val: txtVal, rawJson: val });
              } else {
                params.push({ idx: p, name: name, kind: 'complex', val: '' });
              }
            } catch (e) {
              params.push({ idx: p, name: name, kind: 'complex', val: '' });
            }
          } else if (/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12};?)+$/i.test(val)) {
            params.push({ idx: p, name: name, kind: 'group', val: val });
          } else {
            params.push({ idx: p, name: name, kind: 'text', val: val, rawJson: null });
          }
        } else if (typeof val === 'object' && val !== null && typeof val.length === 'number') {
          // Array — multi-component param (e.g. Position [x,y], Scale [x,y])
          var parts = [];
          for (var vi = 0; vi < val.length; vi++) parts.push(val[vi]);
          params.push({ idx: p, name: name, kind: 'vector', val: parts.join(',') });
        } else {
          // Truly unknown type — placeholder preserves tree count, not shown
          params.push({ idx: p, name: name, kind: 'skip', val: '' });
        }
      } catch (propEx) {
        // One bad property must never abort the whole parse
        jsxLog("smParseClipParams: property[" + p + "] threw — skipping: " + propEx, "WARN");
        params.push({ idx: p, name: '', kind: 'skip', val: '' });
      }
    }
  } catch (ex) {
    jsxLog("smParseClipParams error: " + ex, "ERROR");
    return null;
  }
  return params;
}

/**
 * smGetClipUnderPlayhead
 * Lightweight poll target: returns { nodeId, name, isMogrt } for the clip
 * sitting directly under the timeline CTI (playhead). Does NOT parse params —
 * purely an identity check so the JS side can decide whether a full
 * smGetSelectionParams() call is necessary. Returns null if no sequence or
 * no clip under playhead.
 */
function smGetClipUnderPlayhead() {
  return safeCall(function () {
    var seq = app.project.activeSequence;
    if (!seq) return null;

    var ctiSecs = 0;
    try {
      var qeSeq = null;
      if (typeof qe !== 'undefined' && qe.project) qeSeq = qe.project.getActiveSequence();
      ctiSecs = qeSeq ? qeSeq.CTI.secs : (seq.getPlayerPosition ? seq.getPlayerPosition().seconds : 0);
    } catch (e) {}

    // Walk every video track, check every clip's time range
    var numTracks = seq.videoTracks.numTracks;
    for (var t = 0; t < numTracks; t++) {
      var track = seq.videoTracks[t];
      var numClips = track.clips.numItems;
      for (var c = 0; c < numClips; c++) {
        var clip = track.clips[c];
        try {
          if (clip.start.seconds <= ctiSecs && clip.end.seconds > ctiSecs) {
            var isMogrt = smIsMogrtClip(clip);
            return { nodeId: clip.nodeId, name: clip.name, isMogrt: isMogrt, ctiSecs: ctiSecs };
          }
        } catch (e) {}
      }
    }
    return null; // nothing under playhead
  }, 'smGetClipUnderPlayhead');
}

function smBuildSelection() {
  var ret = [];
  try {
    var seq = app.project.activeSequence;
    if (!seq) return ret;
    var sel     = seq.getSelection();
    var selSize = Math.min(100, sel ? sel.length : 0);
    jsxLog("[SM-PARAMS] smBuildSelection: " + selSize + " clips in selection", "DEBUG");
    for (var i = 0; i < selSize; i++) {
      var selectedClip = sel[i];
      var dbgPath = '';
      try { dbgPath = selectedClip.projectItem.getMediaPath(); } catch (e) {}
      jsxLog("[SM-PARAMS] clip[" + i + "] name=" + selectedClip.name + " path=" + dbgPath, "DEBUG");
      if (!smIsMogrtClip(selectedClip)) {
        jsxLog("[SM-PARAMS] clip[" + i + "] SKIPPED — not a MOGRT", "DEBUG");
        continue;
      }

      var parsed = smParseClipParams(selectedClip);
      if (!parsed) { jsxLog("[SM-PARAMS] clip[" + i + "] parse FAILED", "ERROR"); continue; }
      jsxLog("[SM-PARAMS] clip[" + i + "] OK — " + parsed.length + " editable params", "SUCCESS");

      var startSecs = 0;
      var endSecs = 0;
      try { startSecs = selectedClip.start.seconds; endSecs = selectedClip.end.seconds; } catch (e) {}

      ret.push({
        nodeId:  selectedClip.nodeId,
        name:    selectedClip.name,
        path:    dbgPath,
        start:   startSecs,
        end:     endSecs,
        params:  parsed
      });
    }
  } catch (e) {
    jsxLog("smBuildSelection error: " + e, "ERROR");
  }
  return ret;
}

function smSendSelectionToJS() {
  var data = smBuildSelection();
  var eventObj  = new CSXSEvent();
  eventObj.type = 'freexan.caption.paramsUpdated';
  eventObj.data = JSON.stringify(data);
  eventObj.dispatch();
}

function smInitParamEvents() {
  return safeCall(function () {
    app.bind('onActiveSequenceSelectionChanged', function () {
      try {
        if (!app.project || !app.project.activeSequence) return;
        smSendSelectionToJS();
      } catch (e) {}
    });
    app.bind('onProjectChanged', function () {
      try {
        if (!app.project || !app.project.activeSequence) return;
        smSendSelectionToJS();
      } catch (e) {}
    });
    return { bound: true };
  }, 'smInitParamEvents');
}

function smGetSelectionParams() {
  return safeCall(function () {
    return { clips: smBuildSelection() };
  }, 'smGetSelectionParams');
}

function smApplyParam(data) {
  return safeCall(function () {
    var seq = app.project.activeSequence;
    if (!seq) throw new Error("No active sequence.");

    var nodeId     = data.nodeId;
    var paramIndex = Number(data.paramIndex);
    var value      = data.value; // { r, g, b } for color OR scalar

    // Search selection first (PC approach), then fall back to track scan
    var clip = null;
    var sel  = seq.getSelection();
    for (var i = 0; i < sel.length; i++) {
      if (sel[i].nodeId === nodeId) { clip = sel[i]; break; }
    }
    if (!clip) {
      outer: for (var t = 0; t < seq.videoTracks.numTracks; t++) {
        var track = seq.videoTracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
          if (track.clips[c].nodeId === nodeId) { clip = track.clips[c]; break outer; }
        }
      }
    }
    if (!clip) throw new Error("Clip not found: " + nodeId);

    var prop = clip.getMGTComponent().properties[paramIndex];
    if (!prop) throw new Error("No property at index " + paramIndex);

    var isLast = 1;
    if (value !== null && typeof value === 'object' && 'r' in value) {
      // Color — alpha hardcoded to 1
      prop.setColorValue(1, value.r, value.g, value.b, isLast);
    } else if (typeof value === 'string' && value.indexOf(',') !== -1) {
      // Vector — comma-separated string back to array
      var parts = value.split(',');
      var arr = [];
      for (var vi = 0; vi < parts.length; vi++) arr.push(parseFloat(parts[vi]));
      prop.setValue(arr, isLast);
    } else {
      prop.setValue(value, isLast);
    }

    return { status: "Complete" };
  }, 'smApplyParam');
}

function smSelectImageAndReplace(data) {
  return safeCall(function () {
    var seq = app.project.activeSequence;
    if (!seq) throw new Error("No active sequence.");

    var nodeId     = data.nodeId;
    var paramIndex = Number(data.paramIndex);

    var clip = null;
    var sel  = seq.getSelection();
    for (var i = 0; i < sel.length; i++) {
      if (sel[i].nodeId === nodeId) { clip = sel[i]; break; }
    }
    if (!clip) {
      outer: for (var t = 0; t < seq.videoTracks.numTracks; t++) {
        var track = seq.videoTracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
          if (track.clips[c].nodeId === nodeId) { clip = track.clips[c]; break outer; }
        }
      }
    }
    if (!clip) throw new Error("Clip not found: " + nodeId);

    var prop = clip.getMGTComponent().properties[paramIndex];
    if (!prop) throw new Error("No property at index " + paramIndex);

    var filterString = "Media Files:*.png;*.jpg;*.jpeg;*.mp4;*.mov;*.psd;*.ai";
    var f = File.openDialog("Select Image / Video to Replace", filterString, false);
    if (!f) return { status: "Cancelled" };

    var bin = app.project.getInsertionBin();
    app.project.importFiles([f.fsName], true, bin, false);

    var importedItem = null;
    for (var j = 0; j < app.project.rootItem.children.numItems; j++) {
      var item = app.project.rootItem.children[j];
      if (item && item.getMediaPath && item.getMediaPath() === f.fsName) {
        importedItem = item;
        break;
      }
    }

    if (typeof prop.replaceMedia === 'function') {
      if (importedItem) prop.replaceMedia(importedItem);
      else prop.replaceMedia(f.fsName);
    }

    return { status: "Complete", path: f.fsName };
  }, 'smSelectImageAndReplace');
}

function smSyncParamAcrossSelected(data) {
  return safeCall(function () {
    var seq = app.project.activeSequence;
    if (!seq) throw new Error("No active sequence.");

    var paramIndex = Number(data.paramIndex);
    var value      = data.value;

    var sel = seq.getSelection();
    if (!sel || sel.length === 0) {
      throw new Error("No clips selected in timeline.");
    }

    var debugLog = [];
    var qeSeq = null;
    try { if (typeof qe !== 'undefined' && qe.project) qeSeq = qe.project.getActiveSequence(); } catch(e) {}
    var playhead = qeSeq ? qeSeq.CTI.secs : (seq.getPlayerPosition() ? seq.getPlayerPosition().seconds : 0);

    var masterClip = null;
    if (data.nodeId) {
      for (var m0 = 0; m0 < sel.length; m0++) {
        if (sel[m0].nodeId === data.nodeId) { masterClip = sel[m0]; break; }
      }
    }
    if (!masterClip) {
      for (var m = 0; m < sel.length; m++) {
        if (sel[m].start.seconds <= playhead + 0.01 && sel[m].end.seconds >= playhead - 0.01) {
          masterClip = sel[m];
          break;
        }
      }
    }
    if (!masterClip && sel.length > 0) masterClip = sel[0];

    var masterName = '';
    if (masterClip && masterClip.name) {
      masterName = masterClip.name.replace(/\\/g, '/').split('/').pop().replace(/\.(mogrt|aegraphic)$/i, '').replace(/^\s+|\s+$/g, '').toLowerCase();
    }
    var masterPath = '';
    try {
      if (masterClip) {
        var mp = masterClip.projectItem.getMediaPath();
        if (mp) masterPath = mp.replace(/\\/g, '/').split('/').pop().replace(/\.(mogrt|aegraphic)$/i, '').replace(/^\s+|\s+$/g, '').toLowerCase();
      }
    } catch (e) {}

    if (!masterName && data.targetName) masterName = data.targetName.replace(/\\/g, '/').split('/').pop().replace(/\.(mogrt|aegraphic)$/i, '').replace(/^\s+|\s+$/g, '').toLowerCase();
    if (!masterPath && data.targetPath) masterPath = data.targetPath.replace(/\\/g, '/').split('/').pop().replace(/\.(mogrt|aegraphic)$/i, '').replace(/^\s+|\s+$/g, '').toLowerCase();

    jsxLog("[SYNC-DBG] Master clip: " + masterName + " path: " + masterPath + " selSize: " + sel.length + " paramIdx: " + paramIndex, "INFO");

    var syncedCount = 0;
    for (var i = 0; i < sel.length; i++) {
      var clip = sel[i];
      if (!smIsMogrtClip(clip)) {
        debugLog.push("c[" + i + "]:NotMogrt");
        jsxLog("[SYNC-DBG] clip[" + i + "] skipped: Not a MOGRT", "WARN");
        continue;
      }

      var clipName = '';
      if (clip.name) {
        clipName = clip.name.replace(/\\/g, '/').split('/').pop().replace(/\.(mogrt|aegraphic)$/i, '').replace(/^\s+|\s+$/g, '').toLowerCase();
      }
      var clipPath = '';
      try {
        var p = clip.projectItem.getMediaPath();
        if (p) clipPath = p.replace(/\\/g, '/').split('/').pop().replace(/\.(mogrt|aegraphic)$/i, '').replace(/^\s+|\s+$/g, '').toLowerCase();
      } catch (e) {}

      var isSameMogrt = false;
      if (masterPath && clipPath && masterPath === clipPath) isSameMogrt = true;
      else if (masterName && clipName && masterName === clipName) isSameMogrt = true;

      if (!isSameMogrt) {
        debugLog.push("c[" + i + "]:SkipName(" + clipName + ")");
        jsxLog("[SYNC-DBG] clip[" + i + "] skipped: name mismatch (" + clipName + " != " + masterName + ")", "WARN");
        continue;
      }

      var mgt = clip.getMGTComponent();
      if (!mgt || !mgt.properties) {
        debugLog.push("c[" + i + "]:NoMGT");
        jsxLog("[SYNC-DBG] clip[" + i + "] skipped: No MGT component", "ERROR");
        continue;
      }

      var prop = mgt.properties[paramIndex];
      if (!prop) {
        debugLog.push("c[" + i + "]:NoPropIdx(" + paramIndex + ")");
        jsxLog("[SYNC-DBG] clip[" + i + "] skipped: No property at index " + paramIndex, "ERROR");
        continue;
      }

      var isLast = 1;
      try {
        if (value !== null && typeof value === 'object' && 'r' in value) {
          prop.setColorValue(1, value.r, value.g, value.b, isLast);
        } else if (data.paramKind === 'vector' || (typeof value === 'string' && value.indexOf(',') !== -1 && data.paramKind !== 'text' && data.paramKind !== 'group' && !isNaN(parseFloat(value.split(',')[0])))) {
          var parts = value.split(',');
          var arr = [];
          for (var vi = 0; vi < parts.length; vi++) arr.push(parseFloat(parts[vi]));
          prop.setValue(arr, isLast);
        } else {
          prop.setValue(value, isLast);
        }
        syncedCount++;
        debugLog.push("c[" + i + "]:OK");
        jsxLog("[SYNC-DBG] clip[" + i + "] property set successfully", "SUCCESS");
      } catch (applyErr) {
        debugLog.push("c[" + i + "]:Err(" + applyErr + ")");
        jsxLog("[SYNC-DBG] clip[" + i + "] setValue error: " + applyErr, "ERROR");
      }
    }

    return { syncedCount: syncedCount, totalSelected: sel.length, masterName: masterName, debugLog: debugLog };
  }, 'smSyncParamAcrossSelected');
}

function smSelectClipsByPhraseAndWord(params) {
  return safeCall(function () {
    var seq = app.project.activeSequence;
    if (!seq) throw new Error("No active sequence.");

    var phraseText = (params.phraseText || "").replace(/^\s+|\s+$/g, '');
    var targetWordIndices = params.wordIndices || [];
    var nodeIds = params.nodeIds || [];
    var shiftKey = Boolean(params.shiftKey);

    jsxLog("smSelectClipsByPhraseAndWord START | nodeIds=" + nodeIds.join(",") + " | phraseText='" + phraseText + "' | targetSecs=" + params.targetSeconds, "INFO");

    if (!shiftKey) {
      var currentSel = seq.getSelection();
      for (var s = 0; s < currentSel.length; s++) {
        try { currentSel[s].setSelected(false, true); } catch (e) {}
      }
    }

    var selectedCount = 0;
    var firstStartSecs = typeof params.targetSeconds === 'number' && params.targetSeconds >= 0 ? params.targetSeconds : -1;

    // Fast path: Exact nodeId matching when clip is already known
    if (nodeIds.length > 0) {
      for (var t = 0; t < seq.videoTracks.numTracks; t++) {
        var track = seq.videoTracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
          var clip = track.clips[c];
          for (var nid = 0; nid < nodeIds.length; nid++) {
            if (String(clip.nodeId) === String(nodeIds[nid])) {
              try {
                clip.setSelected(true, true);
                selectedCount++;
                jsxLog("  [FastPath] Selected clip nodeId=" + clip.nodeId + " at " + clip.start.seconds + "s", "INFO");
                if (firstStartSecs < 0) firstStartSecs = clip.start.seconds;
              } catch (e) {}
              break;
            }
          }
        }
      }
    }

    // Fallback path: Scan sequence clips matching phraseText and word progression index
    if (selectedCount === 0) {
      jsxLog("  [Fallback] FastPath found 0 clips. Scanning sequence...", "WARN");
      var progressionNames = ["\u24c9 Word Progression", "Ⓢ Word Progression", "Word Progression", "Ⓣ Word Progression", "Word Index"];
      for (var t = 0; t < seq.videoTracks.numTracks; t++) {
        var track = seq.videoTracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
          var clip = track.clips[c];
          if (!smIsMogrtClip(clip)) continue;
          try {
            var parsed = smParseClipParams(clip);
            if (!parsed) continue;

            var cText = "";
            var fallbackText = "";
            var progVal = -1;
            for (var p = 0; p < parsed.length; p++) {
              var pm = parsed[p];
              var pName = pm.displayName || pm.name || "";
              var rawVal = pm.val !== undefined && pm.val !== null ? pm.val : pm.value;
              if (pm.kind === "text") {
                var txt = (rawVal || "").toString().replace(/^\s+|\s+$/g, '');
                if (!fallbackText && txt) fallbackText = txt;
                if (/text input|\u24c9|\u24c8|source text|caption text|title text|phrase text/i.test(pName)) {
                  cText = txt;
                }
              } else if (pName) {
                if (/word progression|\u24c9|\u24c8|word index|word #|current word|active word|progression/i.test(pName)) {
                  var rawV = parseInt(rawVal, 10);
                  if (!isNaN(rawV) && rawV >= 0) {
                    progVal = rawV;
                  }
                }
              }
            }
            if (!cText) cText = fallbackText;

            if (cText.toLowerCase() === phraseText.toLowerCase() && progVal >= 0) {
              var wIdx = progVal >= 1 ? progVal - 1 : progVal;
              for (var wi = 0; wi < targetWordIndices.length; wi++) {
                if (targetWordIndices[wi] === wIdx) {
                  clip.setSelected(true, true);
                  selectedCount++;
                  jsxLog("  [Fallback] Matched clip nodeId=" + clip.nodeId + " | wIdx=" + wIdx, "INFO");
                  if (firstStartSecs < 0) firstStartSecs = clip.start.seconds;
                  break;
                }
              }
            }
          } catch (e) {}
        }
      }
    }

    if (firstStartSecs >= 0) {
      try {
        var tm = new Time();
        tm.seconds = firstStartSecs + 0.01;
        seq.setPlayerPosition(tm.ticks);
        jsxLog("  [Playhead] Position snapped to " + tm.seconds + "s", "INFO");
      } catch (e) {}
    } else {
      jsxLog("  [Playhead] Skipped snapping (firstStartSecs < 0)", "WARN");
    }

    smSendSelectionToJS();
    jsxLog("smSelectClipsByPhraseAndWord END | total selected=" + selectedCount, "INFO");
    return { count: selectedCount };
  }, 'smSelectClipsByPhraseAndWord');
}

/**
 * smDumpSelectedMogrtProperties
 * On-demand diagnostic utility triggered by the user via UI button.
 * Logs 100% of the properties of the currently selected MOGRT(s) (or clip under playhead)
 * directly to mogrt_param_fetch.log.
 */
function smDumpSelectedMogrtProperties() {
  return safeCall(function () {
    var seq = app.project ? app.project.activeSequence : null;
    if (!seq) return { ok: false, msg: "No active sequence found." };

    var sel = seq.getSelection();
    var targets = [];
    if (sel && sel.length > 0) {
      for (var i = 0; i < sel.length; i++) {
        if (smIsMogrtClip(sel[i])) targets.push(sel[i]);
      }
    }

    // If no MOGRTs selected, look under playhead
    if (targets.length === 0) {
      var ctiSecs = 0;
      try {
        var qeSeq = null;
        if (typeof qe !== 'undefined' && qe.project) qeSeq = qe.project.getActiveSequence();
        ctiSecs = qeSeq ? qeSeq.CTI.secs : (seq.getPlayerPosition ? seq.getPlayerPosition().seconds : 0);
      } catch (e) {}
      for (var t = 0; t < seq.videoTracks.numTracks; t++) {
        var track = seq.videoTracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
          var clip = track.clips[c];
          if (smIsMogrtClip(clip) && clip.start.seconds <= ctiSecs && clip.end.seconds > ctiSecs) {
            targets.push(clip);
          }
        }
      }
    }

    if (targets.length === 0) {
      return { ok: false, msg: "No MOGRT selected or under playhead to inspect." };
    }

    var totalLogged = 0;
    for (var ti = 0; ti < targets.length; ti++) {
      var mClip = targets[ti];
      var props = null;
      try { props = mClip.getMGTComponent().properties; } catch (e) {}
      if (!props) try { props = mClip.projectItem.getMGTComponent().properties; } catch (e) {}
      if (!props) continue;

      var numProps = props.numItems;
      paramFetchLog("================================================================");
      paramFetchLog("DUMP ON-DEMAND: MOGRT Clip #" + (ti+1) + " '" + mClip.name + "' | nodeId=" + mClip.nodeId + " | totalProps=" + numProps);
      paramFetchLog("================================================================");

      for (var p = 0; p < numProps; p++) {
        try {
          var prop = props[p];
          if (!prop) continue;
          var dispName = "";
          var rawName = "";
          var pType = -1;
          try { dispName = prop.displayName || ""; } catch (e) {}
          try { rawName = prop.name || ""; } catch (e) {}
          try { pType = prop.propertyType; } catch (e) {}

          var val = null;
          var valOk = true;
          try { val = prop.getValue(); } catch (e) { valOk = false; }

          var valStr = valOk && val !== null && val !== undefined ? String(val) : "ERR/NULL";
          if (valStr.length > 200) valStr = valStr.slice(0, 200) + "... [truncated]";

          paramFetchLog("  [#" + p + "] dispName='" + dispName + "' | rawName='" + rawName + "' | type=" + pType + " | val=" + valStr);
          totalLogged++;
        } catch (ex) {
          paramFetchLog("  [#" + p + "] ERROR inspecting property: " + ex);
        }
      }
      paramFetchLog("================================================================\n");
    }

    return { ok: true, msg: "Logged " + totalLogged + " properties across " + targets.length + " MOGRT(s) to mogrt_param_fetch.log" };
  }, 'smDumpSelectedMogrtProperties');
}



