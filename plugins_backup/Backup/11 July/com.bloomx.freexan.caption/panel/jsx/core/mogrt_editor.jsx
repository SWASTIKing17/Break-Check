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
        try { name = prop.displayName || ''; } catch (e) {}

        // Get value — if it throws we still emit a placeholder so group child-counts stay accurate
        var val;
        var valOk = true;
        try { val = prop.getValue(); } catch (e) { valOk = false; }

        if (!valOk || val === null || val === undefined) {
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
              if (parsed && typeof parsed.textEditValue === 'string') {
                params.push({ idx: p, name: name, kind: 'text', val: parsed.textEditValue, rawJson: val });
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

function smBuildSelection() {
  var ret = [];
  try {
    var seq = app.project.activeSequence;
    if (!seq) return ret;
    var sel     = seq.getSelection();
    var selSize = Math.min(8, sel ? sel.length : 0);
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

      ret.push({
        nodeId:  selectedClip.nodeId,
        name:    selectedClip.name,
        path:    dbgPath,
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
