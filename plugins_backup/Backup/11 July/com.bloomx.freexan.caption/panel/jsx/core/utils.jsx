/**
 * freeXan Caption - Backend Utilities & UI Feedback
 * This file contains system helper functions, logging tools, and alert messages.
 */

// ==========================================
// 1. SYSTEM UTILITIES
// ==========================================

/**
 * Retrieves environmental data like OS version, App Version, and User ID.
 */
function getUserData() {
  try {
    var osVersion = $.os.toString();
    var appInstance = app;
    var appVersion = appInstance.version.toString();
    var userGuid = appInstance.userGuid;
    
    var data = {
      OSVersion: osVersion,
      PPVersion: appVersion,
      guid: userGuid,
    };
  } catch (err) {
    alert("System Data Retrieval failed at Line: " + err.line.toString() + "\n" + err.toString());
  }
  return JSON.stringify(data);
}

/**
 * Standard dialog to let the user pick the subtitle (SRT) file they want to import.
 */
function selectSRT() {
  var fileDialog = File.openDialog("Choose Short SRT", false);
  if (!fileDialog) return JSON.stringify({ srtFilePath: "Invalid File", srtFileName: "Invalid File" });

  var filePath = fileDialog.fsName;
  var fileName = fileDialog.name;
  
  if (!fileName.match(".srt")) {
    filePath = "Invalid File";
    fileName = "Invalid File";
  }
  
  var result = {
    srtFilePath: filePath,
    srtFileName: fileName,
  };
  return JSON.stringify(result);
}

/**
 * Standard dialog to let the user pick which MOGRT template will be used for the subtitles.
 */
function selectMogrt() {
  var fileDialog = File.openDialog("Choose mogrt file", false);
  if (!fileDialog) return JSON.stringify({ mogrtPath: "Invalid File", mogrtName: "Invalid File" });

  var filePath = fileDialog.fsName;
  var fileName = fileDialog.name;
  
  if (!fileName.match(".mogrt")) {
    filePath = "Invalid File";
    fileName = "Invalid File";
  }
  
  var result = {
    mogrtPath: filePath,
    mogrtName: fileName,
  };
  return JSON.stringify(result);
}

/**
 * Returns the directory path of the currently active Premiere Pro project.
 */
function getProjectDirectory() {
  var projectPath = app.project.path;
  if (!projectPath || projectPath === "") {
    return "Invalid Path";
  }
  var projectFile = new File(projectPath);
  return projectFile.parent.fsName;
}

// ==========================================
// 2. METADATA UTILITIES (XMP Shadow)
// ==========================================

/**
 * Writes a string (usually stringified JSON) into a custom XMP field on a Project Item.
 */
function writeClipMetadata(params) {
  return safeCall(function() {
    var item = params.projectItem;
    var field = params.field || "freeXan Caption_Definition";
    var value = params.value;
    
    if (!item) throw new Error("No project item provided for metadata write.");
    
    if (ExternalObject.AdobeXMPScript === undefined) {
      ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
    }
    
    var xmp = new XMPMeta(item.getProjectMetadata());
    var schemaNS = "http://ns.bloomxsolutions.com/freexan-caption/1.0/";
    var prefix = "sm:";
    XMPMeta.registerNamespace(schemaNS, prefix);
    
    xmp.setProperty(schemaNS, field, value);
    item.setProjectMetadata(xmp.serialize());
    
    return { status: "Success", field: field };
  }, "writeClipMetadata");
}

/**
 * Reads a custom XMP field from a Project Item.
 */
function readClipMetadata(params) {
  return safeCall(function() {
    var item = params.projectItem;
    var field = params.field || "freeXan Caption_Definition";
    
    if (!item) {
        var seq = app.project.activeSequence;
        if (seq) {
            jsxLog("Searching for selected MOGRT in active sequence...");
            for (var i = 0; i < seq.videoTracks.numTracks; i++) {
                var trk = seq.videoTracks[i];
                for (var j = 0; j < trk.clips.numItems; j++) {
                    var c = trk.clips[j];
                    if (c.isSelected() && c.isMGT()) { 
                        item = c.projectItem; 
                        jsxLog("Found selected MOGRT: " + item.name);
                        break; 
                    }
                }
                if (item) break;
            }
        }
    }
    
    if (!item) {
        jsxLog("No selected MOGRT found for metadata read.", "WARN");
        return { status: "Error", message: "No selected MOGRT found." };
    }

    if (ExternalObject.AdobeXMPScript === undefined) {
      ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
    }
    
    var xmp = new XMPMeta(item.getProjectMetadata());
    var schemaNS = "http://ns.bloomxsolutions.com/freexan-caption/1.0/";
    var prefix = "sm:";
    XMPMeta.registerNamespace(schemaNS, prefix); // Register for reading too
    
    var val = xmp.getProperty(schemaNS, field);
    if (val) {
        jsxLog("Metadata found for field: " + field, "SUCCESS");
    } else {
        jsxLog("Metadata field empty: " + field, "WARN");
    }
    
    return { status: "Success", value: val ? val.toString() : null };
  }, "readClipMetadata");
}

// ==========================================
// 3. DEBUGGING & UNDO UTILITIES
// ==========================================

/**
 * Robust Logger for ExtendScript.
 * @param {string} msg The message to log.
 * @param {string} level [INFO, SUCCESS, WARN, ERROR]
 */
function jsxLog(msg, level) {
  level = level || "INFO";
  var timestamp = new Date().toTimeString().split(' ')[0];
  var logMsg = "[" + timestamp + "] [" + level + "] " + msg;

  // Write to the ExtendScript console (visible in CEP DevTools / ESTK)
  $.writeln(logMsg);

  try {
    // WHY NOT $.fileName:
    // When JSX files are loaded via #include in main.jsx, $.fileName at
    // runtime resolves to main.jsx — not utils.jsx. The parent-traversal
    // therefore lands outside the extension folder and the write silently fails.
    //
    // SOLUTION: Use Folder.userData which always resolves to the user's
    // Roaming AppData folder (C:\Users\[name]\AppData\Roaming) on Windows,
    // regardless of which file is currently executing.
    var logFile = new File(
      Folder.userData.fsName +
      "/Adobe/CEP/extensions/com.bloomx.freexan.caption/panel/logs/debug_jsx.log"
    );

    // Ensure the logs/ directory exists before writing
    var logFolder = new Folder(logFile.parent);
    if (!logFolder.exists) logFolder.create();

    if (logFile.open("a")) {
      logFile.writeln(logMsg);
      logFile.close();
      return; // Success — skip fallback
    }
  } catch (e) { /* fall through to backup */ }

  // FALLBACK: Write to the system Temp folder. This ALWAYS works.
  // Path: C:\Users\[name]\AppData\Local\Temp\freexan_caption_jsx.log
  try {
    var fallbackFile = new File(Folder.temp.fsName + "/freexan_caption_jsx.log");
    if (fallbackFile.open("a")) {
      fallbackFile.writeln(logMsg);
      fallbackFile.close();
    }
  } catch (e2) { /* silently ignore — never crash execution for a log write */ }
}

/**
 * Specialized logger for Data Transfer only.
 * Logs what is received from the UI and what is injected into Premiere.
 */
function dataLog(msg, type) {
  var timestamp = new Date().toTimeString().split(' ')[0];
  var logMsg = "[" + timestamp + "] [" + type + "] " + msg;

  try {
    // Dynamic path detection for the log file
    var folder = new File($.fileName).parent.parent.parent; 
    var logFile = new File(folder.fsName + "/logs/data_transfer.log");
    
    var logFolder = new Folder(logFile.parent);
    if (!logFolder.exists) logFolder.create();

    if (logFile.open("a")) {
      logFile.writeln(logMsg);
      logFile.close();
    }
  } catch (e) {}
}

/**
 * Standardized Error Reporter.
 * Extracts line number, file name, and message into a formatted log.
 */
function reportError(err, context) {
  var errorMsg = "CRITICAL ERROR in " + (context || "Unknown Context") + ":\n" +
                 "Message: " + err.toString() + "\n" +
                 "File: " + (err.fileName ? err.fileName.replace(/.*[\/\\]/, "") : "Unknown") + "\n" +
                 "Line: " + (err.line || "Unknown");
  jsxLog(errorMsg, "ERROR");
  return JSON.stringify({ status: "Error", message: errorMsg });
}

/**
 * Recursive Object Dumper.
 * Useful for inspecting Premiere's complex internal objects.
 */
function dumpObject(obj, name, indent) {
  indent = indent || "";
  name = name || "Object";
  var result = indent + "--- DUMP: " + name + " ---\n";
  
  for (var prop in obj) {
    try {
      var val = obj[prop];
      if (typeof val === "object") {
        // Limit depth to prevent infinite loops on circular refs
        if (indent.length < 10) {
          result += dumpObject(val, prop, indent + "  ");
        } else {
          result += indent + "  " + prop + ": [Object (Depth Limit)]\n";
        }
      } else {
        result += indent + "  " + prop + ": " + val + " (" + (typeof val) + ")\n";
      }
    } catch (e) {
      result += indent + "  " + prop + ": [Access Denied]\n";
    }
  }
  return result;
}

// ==========================================
// UNDO GROUP ENGINE
// Why this exists:
// Premiere Pro records every individual clip mutation (remove, overwrite)
// as a separate entry in its History panel. Without grouping, a single
// "Split" operation creates 4+ undo steps — the user would have to press
// Ctrl+Z four times to reverse one logical action.
//
// This engine probes three known Premiere API paths on first use and
// caches the result. The probe only runs once per engine session.
// ==========================================

// Cached result of which API Premiere exposes. null = not probed yet.
// Values: "seq" | "qe" | "none"
var _undoApi = null;

/**
 * Probes Premiere Pro for a working undo-group API.
 * Tries the sequence DOM path first, then the QE module path.
 * Caches the result in _undoApi so this only runs once.
 */
function _resolveUndoApi() {
  if (_undoApi !== null) return; // Already resolved — skip.

  // Path 1: app.project.activeSequence.undoGroup (Premiere 2020+ DOM)
  try {
    var seq = app.project.activeSequence;
    if (seq && seq.undoGroup && typeof seq.undoGroup.open === "function") {
      _undoApi = "seq";
      jsxLog("[Undo] API resolved: sequence DOM (seq.undoGroup)", "INFO");
      return;
    }
  } catch(e) {}

  // Path 2: qe.project.getActiveSequence().undoGroup (undocumented QE module)
  try {
    app.enableQE();
    var qeSeq = qe.project.getActiveSequence();
    if (qeSeq && qeSeq.undoGroup && typeof qeSeq.undoGroup.open === "function") {
      _undoApi = "qe";
      jsxLog("[Undo] API resolved: QE module (qeSeq.undoGroup)", "INFO");
      return;
    }
  } catch(e) {}

  // No API found — fall back silently. History will show individual ops.
  _undoApi = "none";
  jsxLog("[Undo] No undo-group API found in this Premiere version. Individual history entries will be created per operation.", "WARN");
}

/**
 * Opens an undo group. All Premiere mutations between this call and
 * endUndo() will be collapsed into one named entry in the History panel.
 * @param {string} undoName - The label shown in Premiere's History panel.
 */
function startUndo(undoName) {
  _resolveUndoApi();
  try {
    if (_undoApi === "seq") {
      app.project.activeSequence.undoGroup.open(undoName);
    } else if (_undoApi === "qe") {
      app.enableQE();
      qe.project.getActiveSequence().undoGroup.open(undoName);
    }
    // "none": do nothing — mutations will appear individually in History.
  } catch(e) {
    jsxLog("[Undo] startUndo failed (" + undoName + "): " + e.toString(), "WARN");
  }
  jsxLog("[Undo] BEGIN: " + undoName, "INFO");
}

/**
 * Closes the active undo group opened by startUndo().
 * Always placed in a finally{} block in surgery functions so it runs
 * even if the surgery throws an error mid-way.
 * @param {string} undoName - For logging only.
 */
function endUndo(undoName) {
  // Independent try/catch: a failed startUndo must never prevent endUndo
  // from attempting to close the group (prevents history corruption).
  try {
    if (_undoApi === "seq") {
      app.project.activeSequence.undoGroup.close();
    } else if (_undoApi === "qe") {
      app.enableQE();
      qe.project.getActiveSequence().undoGroup.close();
    }
  } catch(e) {
    jsxLog("[Undo] endUndo failed (" + (undoName || "") + "): " + e.toString(), "WARN");
  }
  jsxLog("[Undo] END: " + (undoName || ""), "INFO");
}

/**
 * Resets the cached API probe. Useful during debugging if you want to
 * force a re-probe after a Premiere version change or panel hot-reload.
 */
function resetUndoApiProbe() {
  _undoApi = null;
  jsxLog("[Undo] Probe cache cleared. Will re-probe on next surgery.", "INFO");
}

// ==========================================
// 3. SAFE COLOR LABELING
// ==========================================

/**
 * Returns a label color (9=Mango, 1=Cerulean) that differs from both neighbors.
 * Prevents "color collision" where a new split is invisible because it matches an adjacent color.
 */
// Per-clip color (TrackItem level) with fallback to project-item label.
function _getClipColor(clip) {
  if (!clip) return null;
  var color = null;
  try { color = clip.getColorLabel(); } catch (e) {}
  if (color === null) {
      try { color = clip.projectItem.getColorLabel(); } catch (e2) {}
  }
  jsxLog("  _getClipColor: " + color, "DEBUG");
  return color;
}
function _setClipColor(clip, label) {
  if (!clip) return;
  var labelInt = parseInt(label);
  
  // 1. Try modern method: setColorLabel()
  try { 
      clip.setColorLabel(labelInt); 
      jsxLog("  _setClipColor: setColorLabel(" + labelInt + ") success", "DEBUG");
      return; 
  } catch (e) {}
  
  // 2. Try property-based setter: .colorLabel = X
  try {
      clip.colorLabel = labelInt;
      jsxLog("  _setClipColor: .colorLabel = " + labelInt + " success", "DEBUG");
      return;
  } catch (e) {}

  // 3. Fallback to Project Item (Changes all instances)
  try { 
      clip.projectItem.setColorLabel(labelInt); 
      jsxLog("  _setClipColor: ProjectItem.setColorLabel(" + labelInt + ") success", "DEBUG");
  } catch (e) {
      jsxLog("  _setClipColor: All methods failed for " + labelInt, "ERROR");
  }
}

function getSafeAlternatingColor(neighborPhraseA, neighborPhraseB) {
  // 3-color rotation (soft colors): Cerulean (1), Lavender (3), Caribbean (4).
  var palette = [1, 3, 4];
  var colorA = _getClipColor(neighborPhraseA);
  var colorB = _getClipColor(neighborPhraseB);
  for (var i = 0; i < palette.length; i++) {
    if (palette[i] !== colorA && palette[i] !== colorB) return palette[i];
  }
  return palette[0];
}

function _isTrackLocked(track) {
  if (!track) return true;
  try { if (track.isLocked === true || (typeof track.isLocked === 'function' && track.isLocked())) return true; } catch (_) {}
  return false;
}

// Scan the active sequence and return indices of UNLOCKED video tracks that
// contain at least one MOGRT clip. Locked tracks are skipped — overwriteClip
// silently fails on locked tracks, so they must never be in the staircase pool.
function _getMogrtTrackPool() {
  var pool = [];
  try {
    var seq = app.project.activeSequence;
    if (!seq) return pool;
    for (var t = 0; t < seq.videoTracks.numTracks; t++) {
      var track = seq.videoTracks[t];
      if (_isTrackLocked(track)) continue;
      for (var c = 0; c < track.clips.numItems; c++) {
        var clip = track.clips[c];
        try { if (clip && clip.isMGT && clip.isMGT()) { pool.push(t); break; } } catch (_) {}
      }
    }
  } catch (_) {}
  return pool;
}

// Returns true if the track is unlocked AND has no clips at all (safe to
// hand to the staircase as a fresh expansion slot).
function _isTrackEmptyAndUnlocked(track) {
  if (!track) return false;
  if (_isTrackLocked(track)) return false;
  try { if (track.clips.numItems > 0) return false; } catch (_) { return false; }
  return true;
}

// Build the staircase pool and validate it. On failure throws an Error with
// a clear, actionable message telling the user which tracks to unlock/clear.
// Callers (Split, Join, Split&Join) invoke this BEFORE any modification so
// safeCall returns the error and no partial change is made to the timeline.
function _buildStaircasePool() {
  var detected = _getMogrtTrackPool();
  var pool = detected.slice();
  var expansion = "";
  var blocked = []; // { idx, reason } for tracks we wanted to use but couldn't

  if (pool.length < 3) {
    var seq = app.project.activeSequence;
    var maxTrack = seq ? (seq.videoTracks.numTracks - 1) : -1;
    var existing = {};
    for (var px = 0; px < pool.length; px++) existing[pool[px]] = true;

    // Candidate list: one above and one below each detected MOGRT track.
    var candidates = [];
    for (var pp = 0; pp < pool.length; pp++) {
      if (pool[pp] + 1 <= maxTrack) candidates.push(pool[pp] + 1);
      if (pool[pp] - 1 >= 0)        candidates.push(pool[pp] - 1);
    }

    for (var ci = 0; ci < candidates.length && pool.length < 3; ci++) {
      var cand = candidates[ci];
      if (existing[cand]) continue;
      var track = seq ? seq.videoTracks[cand] : null;
      if (!track) {
        blocked.push({ idx: cand, reason: "does not exist" });
        continue;
      }
      if (_isTrackLocked(track)) {
        blocked.push({ idx: cand, reason: "locked" });
        expansion += " (skip-locked T" + (cand + 1) + ")";
        continue;
      }
      if (track.clips.numItems > 0) {
        blocked.push({ idx: cand, reason: "not empty" });
        expansion += " (skip-not-empty T" + (cand + 1) + ")";
        continue;
      }
      pool.push(cand);
      existing[cand] = true;
      expansion += " +" + cand;
    }
    pool.sort(function(a, b) { return a - b; });
  }

  jsxLog("staircasePool: detected=[" + detected.join(",") + "] final=[" + pool.join(",") + "]" + expansion, "DEBUG");

  if (pool.length < 3) {
    // Build a clear actionable error message — display indices use +1
    // (i.e. videoTracks[3] is shown as "V4") to match Premiere Pro's UI.
    var detectedDisp = [];
    for (var d1 = 0; d1 < detected.length; d1++) detectedDisp.push("V" + (detected[d1] + 1));
    var blockedDisp = [];
    for (var d2 = 0; d2 < blocked.length; d2++) {
      blockedDisp.push("V" + (blocked[d2].idx + 1) + " (" + blocked[d2].reason + ")");
    }
    var msg = "STAIRCASE BLOCKED — needs 3 free video tracks. Detected MOGRT tracks: [" +
              detectedDisp.join(", ") + "]. ";
    if (blockedDisp.length) {
      msg += "Cannot expand because: " + blockedDisp.join(", ") + ". ";
    }
    msg += "To proceed: unlock and empty the listed track(s), OR add a new empty video track.";
    throw new Error(msg);
  }

  return pool;
}

function getSafeAlternatingTrack(neighborTrackIdxA, neighborTrackIdxB) {
  // Build (and validate) the staircase pool. Throws if fewer than 3 usable
  // tracks are available — caller's safeCall surfaces the message to the UI.
  var pool = _buildStaircasePool();
  jsxLog("getSafeAlternatingTrack: pool=[" + pool.join(",") + "] neighbors=(" + neighborTrackIdxA + "," + neighborTrackIdxB + ")", "DEBUG");
  for (var i = 0; i < pool.length; i++) {
    if (pool[i] !== neighborTrackIdxA && pool[i] !== neighborTrackIdxB) return pool[i];
  }
  return pool[0];
}

// Returns true when [startTicks, endTicks) on `track` has no clips other than
// those whose start ticks are listed in `excludedTicks` (an object used as a set).
function _isTrackFreeAt(track, startTicks, endTicks, excludedTicks) {
  if (!track) return false;
  for (var ci = 0; ci < track.clips.numItems; ci++) {
    var c = track.clips[ci];
    if (excludedTicks && excludedTicks[c.start.ticks]) continue;
    // Overlap: clip starts before our end AND clip ends after our start
    if (c.start.ticks < endTicks && c.end.ticks > startTicks) return false;
  }
  return true;
}

// Ensure the sequence has at least (idx + 1) video tracks.
// Uses the QE API (the only reliable way to add tracks in ExtendScript).
// Returns the track at `idx`, or the last existing track if creation fails.
function _ensureTrack(seq, idx) {
  if (seq.videoTracks.numTracks > idx) return seq.videoTracks[idx];
  try {
    var qeSeq = qe.project.getActiveSequence();
    if (qeSeq) {
      var needed = idx - seq.videoTracks.numTracks + 1;
      qeSeq.addTracks(needed, seq.videoTracks.numTracks, 0);
    }
  } catch(e) {}
  return seq.videoTracks[Math.min(idx, seq.videoTracks.numTracks - 1)];
}

// Time-aware track finder for staircase placement.
//   seq       — active sequence
//   startTicks / endTicks — time range of the clips being placed
//   avoidIdxA / avoidIdxB — track indices of left/right neighbor phrases (-1 if none)
//
// Pass 1: pool track that avoids BOTH neighbors AND has no foreign clips in the range
// Pass 2: pool track that avoids both neighbors regardless of occupancy (stable fallback)
// Pass 3: add a new track if pool is full
function findFreeTrack(seq, startTicks, endTicks, avoidIdxA, avoidIdxB) {
  var pool = [1, 2, 3];
  // Pass 1: prefer a track that is both free and avoids neighbors
  for (var i = 0; i < pool.length; i++) {
    var idx = pool[i];
    if (idx === avoidIdxA || idx === avoidIdxB) continue;
    var t = seq.videoTracks[idx];
    if (t && _isTrackFreeAt(t, startTicks, endTicks, null)) return idx;
  }
  // Pass 2: fall back to stable logic — avoid neighbors even if occupied
  for (var j = 0; j < pool.length; j++) {
    if (pool[j] !== avoidIdxA && pool[j] !== avoidIdxB) return pool[j];
  }
  // Pass 3: pool exhausted — add a new track
  var newIdx = seq.videoTracks.numTracks;
  try {
    var qeSeq = qe.project.getActiveSequence();
    if (qeSeq) qeSeq.addTracks(1, newIdx, 0);
  } catch(e) {}
  return seq.videoTracks.numTracks - 1;
}

// ==========================================
// 4. STYLE-PRESERVING TEXT HELPERS
// ==========================================

/**
 * Builds a MOGRT text JSON object with the correct fontTextRuns subset for a
 * subset of words from an existing phrase.
 * srcTextObj  — parsed JSON from the source clip's Ⓣ Text Input getValue().
 * newWords    — array of word strings for the new text (in order).
 * wordIndices — indices of newWords within the original phrase words array.
 */
function buildTextObj(srcTextObj, newWords, wordIndices) {
  var newText = newWords.join(" ");
  var result  = JSON.parse(JSON.stringify(srcTextObj));
  result.textEditValue = newText;

  var srcRuns    = srcTextObj.fontTextRuns;
  var srcLengths = srcTextObj.fontTextRunLength;

  if (!srcRuns || !srcLengths || srcRuns.length === 0) {
    result.fontTextRunLength = [newText.length];
    return result;
  }
  if (srcRuns.length === 1) {
    result.fontTextRuns      = [srcRuns[0]];
    result.fontTextRunLength = [newText.length];
    return result;
  }

  // Build charPosition → runIndex lookup
  var charToRun = [];
  var p = 0;
  for (var r = 0; r < srcLengths.length; r++) {
    for (var c = 0; c < srcLengths[r]; c++) { charToRun[p++] = r; }
  }

  // Cumulative char-start of each source word
  var srcText  = srcTextObj.textEditValue || "";
  var rawSrc   = srcText.split(/\s+/);
  var srcWords = [];
  for (var sw = 0; sw < rawSrc.length; sw++) { if (rawSrc[sw].length > 0) srcWords.push(rawSrc[sw]); }
  var wordStarts = [];
  var cp = 0;
  for (var ww = 0; ww < srcWords.length; ww++) { wordStarts[ww] = cp; cp += srcWords[ww].length + 1; }

  // Map each new word to its source run; merge adjacent same-run words
  var outRuns    = [];
  var outLengths = [];
  var lastRunIdx = -1;
  for (var i = 0; i < newWords.length; i++) {
    var origIdx = (wordIndices && i < wordIndices.length) ? wordIndices[i] : i;
    var ri;
    if (origIdx < srcWords.length) {
      var sc = wordStarts[origIdx];
      ri = (sc < charToRun.length) ? charToRun[sc] : srcRuns.length - 1;
    } else {
      ri = srcRuns.length - 1;
    }
    var wLen = newWords[i].length + (i < newWords.length - 1 ? 1 : 0);
    if (ri === lastRunIdx && outRuns.length > 0) {
      outLengths[outLengths.length - 1] += wLen;
    } else {
      outRuns.push(srcRuns[ri]);
      outLengths.push(wLen);
      lastRunIdx = ri;
    }
  }

  // Safety: lengths must sum to newText.length
  var sum = 0;
  for (var t = 0; t < outLengths.length; t++) sum += outLengths[t];
  if (sum !== newText.length || outRuns.length === 0) {
    result.fontTextRunLength = [newText.length];
    if (srcRuns.length > 0) result.fontTextRuns = [srcRuns[0]];
    return result;
  }
  result.fontTextRuns      = outRuns;
  result.fontTextRunLength = outLengths;
  return result;
}

/**
 * Merges multiple MOGRT text objects (one per phrase) into a single joined object.
 * Concatenates fontTextRuns arrays and adjusts run lengths for the space between phrases.
 * textObjArray — parsed text JSON objects in phrase order.
 * texts        — textEditValue strings in the same order.
 */
function mergeTextObjs(textObjArray, texts) {
  if (!textObjArray || textObjArray.length === 0) return {};
  var joinedText = texts.join(" ");
  var result     = JSON.parse(JSON.stringify(textObjArray[0]));
  result.textEditValue = joinedText;

  var allHaveRuns = true;
  for (var i = 0; i < textObjArray.length; i++) {
    if (!textObjArray[i].fontTextRuns || textObjArray[i].fontTextRuns.length === 0) {
      allHaveRuns = false; break;
    }
  }
  if (!allHaveRuns) { result.fontTextRunLength = [joinedText.length]; return result; }

  var allRuns = [], allLengths = [];
  for (var i = 0; i < textObjArray.length; i++) {
    var obj    = textObjArray[i];
    var runs   = obj.fontTextRuns;
    var lens   = obj.fontTextRunLength;
    var isLast = (i === textObjArray.length - 1);
    if (!runs || !lens) {
      allRuns.push(allRuns.length > 0 ? allRuns[allRuns.length - 1] : {});
      allLengths.push(texts[i].length + (isLast ? 0 : 1));
      continue;
    }
    for (var r = 0; r < runs.length; r++) {
      allRuns.push(runs[r]);
      var len = lens[r];
      if (r === runs.length - 1 && !isLast) len += 1; // +1 space between phrases
      allLengths.push(len);
    }
  }

  var sum = 0;
  for (var t = 0; t < allLengths.length; t++) sum += allLengths[t];
  if (sum !== joinedText.length || allRuns.length === 0) {
    result.fontTextRunLength = [joinedText.length]; return result;
  }
  result.fontTextRuns      = allRuns;
  result.fontTextRunLength = allLengths;
  return result;
}

/**
 * Sync helper: applies master clip's run STYLES to the target clip's run STRUCTURE.
 * Target keeps its text content, run count, and run lengths.
 * masterTextObj — parsed text JSON from the style-source clip.
 * targetTextObj — parsed text JSON from the target clip.
 */
function applyMasterStyleToTextObj(masterTextObj, targetTextObj) {
  var result = JSON.parse(JSON.stringify(masterTextObj));
  result.textEditValue     = targetTextObj.textEditValue;
  result.fontTextRunLength = targetTextObj.fontTextRunLength || [targetTextObj.textEditValue.length];

  var masterRuns = masterTextObj ? masterTextObj.fontTextRuns : null;
  var targetRuns = targetTextObj ? targetTextObj.fontTextRuns : null;

  if (!targetRuns || targetRuns.length === 0) {
    if (masterRuns && masterRuns.length > 0) result.fontTextRuns = [masterRuns[0]];
    return result;
  }
  if (!masterRuns || masterRuns.length === 0) {
    result.fontTextRuns = targetRuns; return result;
  }
  var newRuns = [];
  for (var i = 0; i < targetRuns.length; i++) {
    newRuns.push(masterRuns[Math.min(i, masterRuns.length - 1)]);
  }
  result.fontTextRuns = newRuns;
  return result;
}

// ==========================================
// 5. UI FEEDBACK (ALERTS)
// ==========================================

function noActiveSequence() { alert("No active sequence. Please select a valid sequence on your timeline."); }
function notEnoughVideoTracks() { alert("Not enough video tracks. Please create more tracks to continue."); }
function sayHello() { alert("Hello, this is freeXan Caption version 2.3.1"); }
function frameRatesNotEqual() { alert("Frame Rates Don't Match! Check your sequence and MOGRT settings."); }
function noClipsSelected() { alert("No clips selected! Please highlight some MOGRTs on your timeline."); }
function loggedInSuccessfully() { alert("You have logged in successfully."); }

/**
 * Skill Pattern: Safe Call Wrapper
 * Ensures every backend call returns a standardized { ok, data, error } object.
 */
function safeCall(fn, context) {
    var contextName = context || "Unknown Function";
    try {
        jsxLog("[JS->JSX] CALL START: " + contextName, "COMM");
        var result = fn();
        
        var response;
        if (typeof result === 'string') {
            try {
                JSON.parse(result);
                response = '{"ok":true, "data":' + result + '}';
            } catch (e) {
                response = JSON.stringify({ ok: true, data: result });
            }
        } else {
            response = JSON.stringify({ ok: true, data: result });
        }

        var logResponse = response.length > 200 ? response.substring(0, 200) + "..." : response;
        jsxLog("[JSX->JS] CALL SUCCESS: " + contextName + " | Result: " + logResponse, "COMM");
        return response;
    } catch (e) {
        var errorMsg = e.message || e.toString();
        jsxLog("[JSX->JS] CALL ERROR: " + contextName + " | Message: " + errorMsg, "ERROR");
        return JSON.stringify({ ok: false, error: errorMsg });
    }
}

// Ensure the panel remains persistent in Premiere
try {
    app.setExtensionPersistent("com.bloomx.freexan.caption.persistent", 1);
} catch (e) {}
