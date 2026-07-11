/**
 * freeXan Caption - Synchronization Tools
 * This file contains tools to sync styles and text values across multiple MOGRT clips.
 */

function syncAllGetData(params) {
  return safeCall(function () {
    app.enableQE();
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) return { status: "Error", message: "No active sequence." };

    var qeSeq = qe.project.getActiveSequence();
    var cti = qeSeq ? qeSeq.CTI.secs : 0;

    var clipsData = [];
    var masterMogrtData = [];
    var result = { status: "Incomplete", playhead: cti };

    // Pass 1: Find Master
    var masterFound = false;
    jsxLog("--- syncAllGetData START | CTI: " + cti + "s | Tracks: " + activeSeq.videoTracks.numTracks, "INFO");

    for (var i = 0; i < activeSeq.videoTracks.numTracks; i++) {
      var track = activeSeq.videoTracks[i];
      for (var j = 0; j < track.clips.numItems; j++) {
        var clip = track.clips[j];
        if (clip.isSelected() && clip.isMGT()) {
          var start = clip.start.seconds;
          var end = clip.end.seconds;

          jsxLog("  Checking clip [T" + i + " C" + j + "] '" + clip.projectItem.name + "' | " + start.toFixed(3) + "s - " + end.toFixed(3) + "s", "INFO");

          if (!masterFound && cti >= start && cti <= end) {
            masterFound = true;
            jsxLog("  ✔ MASTER FOUND: [T" + i + " C" + j + "] '" + clip.projectItem.name + "'", "INFO");

            var mgt = clip.getMGTComponent();

            // Pass 1: Gather Master properties (Flat Loop)
            var pCount = (mgt && mgt.properties) ? (mgt.properties.length || 0) : 0;
            if (pCount === 0) jsxLog("syncAllGetData: master MOGRT returned 0 properties — template may not expose params.", "WARN");
            for (var k = 0; k < pCount; k++) {
              var p = mgt.properties[k];
              var pName = p.displayName;
              var vType = p.propertyValueType;
              var val = p.getValue();

              // Color handling
              try {
                var rawColor = p.getColorValue();
                if (rawColor && rawColor.length === 4) {
                  val = [rawColor[0], rawColor[1], rawColor[2], rawColor[3]];
                  vType = 6;
                } else if (typeof rawColor === 'string' && rawColor.charAt(0) === '{') {
                  var cObj = JSON.parse(rawColor);
                  var cr = cObj.red || cObj.Red || 0;
                  var cg = cObj.green || cObj.Green || 0;
                  var cb = cObj.blue || cObj.Blue || 0;
                  var ca = cObj.alpha || cObj.Alpha || 1;
                  val = [ca, cr, cg, cb];
                  vType = 6;
                }
              } catch (colErr) { }

              masterMogrtData.push({
                index: k,
                displayName: pName,
                value: val,
                valueType: vType
              });
            }

            jsxLog("  Master properties collected: " + masterMogrtData.length + " props", "INFO");

            var masterComps = clip.components;
            for (var mc = 0; mc < masterComps.length; mc++) {
              if (masterComps[mc].displayName === "Motion") {
                var mProps = masterComps[mc].properties;
                for (var pIdx = 0; pIdx < mProps.length; pIdx++) {
                  var mp = mProps[pIdx];
                  if (mp.displayName === "Position") result.masterPositionValue = mp.getValue();
                  if (mp.displayName === "Scale") result.masterScaleValue = mp.getValue();
                  if (mp.displayName === "Rotation") result.masterRotationValue = mp.getValue();
                }
                jsxLog("  Motion captured | Pos: " + result.masterPositionValue + " Scale: " + result.masterScaleValue + " Rot: " + result.masterRotationValue, "INFO");
              }
            }
          } else if (!masterFound) {
            jsxLog("  ✘ Skipped (not under playhead)", "INFO");
          } else {
            jsxLog("  ✘ Skipped (master already found)", "INFO");
          }
        }
      }
    }

    // Guard: if no master found, return early with clear error
    if (!masterFound) {
      jsxLog("syncAllGetData FAILED: No selected clip under playhead. CTI=" + cti, "ERROR");
      return { status: "Error", message: "Place your playhead (blue line) over the clip you want to copy settings FROM, then click Sync All." };
    }

    jsxLog("--- syncAllGetData Pass 1 DONE | masterMogrtData.length=" + masterMogrtData.length, "INFO");

    // Safety cap: prevent full-timeline freezes. 500 clips is already an unusually large sync.
    var SYNC_CAP = 500;

    // Pass 2: Count selected MOGRTs first — bail before any getMGTComponent() if over cap
    var selectedCount = 0;
    for (var t = 0; t < activeSeq.videoTracks.numTracks; t++) {
      var vt = activeSeq.videoTracks[t];
      for (var cIdx = 0; cIdx < vt.clips.numItems; cIdx++) {
        if (vt.clips[cIdx].isSelected() && vt.clips[cIdx].isMGT()) selectedCount++;
      }
    }
    if (selectedCount > SYNC_CAP) {
      return { status: "Error", message: "Too many clips selected (" + selectedCount + "). Sync All is capped at " + SYNC_CAP + " clips to prevent freezing. Narrow your selection and try again." };
    }

    // Pass 2: Selection (Gather all first to sort chronologically)
    var selectedClips = [];
    for (var t = 0; t < activeSeq.videoTracks.numTracks; t++) {
      var vt = activeSeq.videoTracks[t];
      for (var cIdx = 0; cIdx < vt.clips.numItems; cIdx++) {
        var c = vt.clips[cIdx];
        if (c.isSelected() && c.isMGT()) {
          var mgtComp = c.getMGTComponent();
          var prog = 0;
          var progParam = mgtComp.properties.getParamForDisplayName("Ⓣ Word Progression") ||
                          mgtComp.properties.getParamForDisplayName("Word Progression") ||
                          mgtComp.properties.getParamForDisplayName("Ⓣ Word Progression");
          if (progParam) prog = progParam.getValue();

          selectedClips.push({
            clip: c,
            t: t,
            cIdx: cIdx,
            start: c.start.seconds,
            progression: prog
          });
        }
      }
    }

    // Sort selected clips by start time
    selectedClips.sort(function(a, b) { return a.start - b.start; });

    // Assign phrase indices based on sorted order
    var lastProg = 0;
    var isMultiPhrase = false;
    var phraseIndex = 0;
    var masterPhraseIndex = -1;

    for (var k = 0; k < selectedClips.length; k++) {
      var item = selectedClips[k];
      if (Math.round(item.progression) <= Math.round(lastProg) && k > 0) {
        isMultiPhrase = true;
        phraseIndex++;
      }
      lastProg = item.progression;

      // Check if this is the master clip (under playhead)
      if (item.start <= cti && item.clip.end.seconds > cti) {
        masterPhraseIndex = phraseIndex;
      }

      clipsData.push({ 
        trackNumber: item.t, 
        clipNumber: item.cIdx, 
        phraseIndex: phraseIndex 
      });
    }

    result.status = "Complete";
    result.selectedMogrtData = clipsData;
    result.masterMogrtData = masterMogrtData;
    result.multiplePhrases = isMultiPhrase;
    result.masterPhraseIndex = masterPhraseIndex;

    if (masterMogrtData.length === 0) {
      return { status: "Error", message: "Place your playhead over the 'Source' clip you want to copy settings FROM." };
    }

    return result;
  }, "syncAllGetData");
}

function syncAll(data) {
  return safeCall(function () {
    var index = data.thisLoopNumber;
    var clipData = data.selectedMogrtData[index];
    var trackNum = clipData.trackNumber;
    var clipNum = clipData.clipNumber;
    var updatedProps = data.updatedMogrtData;
    var total = data.totalLoops || data.selectedMogrtData.length;

    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");

    // Open undo group at the start of the first clip's sync
    if (index === 0) {
      startUndo("Sync All Properties");
    }

    var track = activeSeq.videoTracks[trackNum];
    if (!track) throw new Error("Track " + trackNum + " no longer exists — timeline may have changed during sync.");
    var clip = track.clips[clipNum];
    if (!clip || !clip.isMGT()) throw new Error("Clip [T" + trackNum + " C" + clipNum + "] is missing or is no longer a MOGRT — timeline may have changed during sync.");

    var isSamePhrase = (clipData.phraseIndex === data.masterPhraseIndex);
    jsxLog("Injecting -> " + clip.projectItem.name + " | samePhrase=" + isSamePhrase + " (Index: " + clipData.phraseIndex + " vs Master: " + data.masterPhraseIndex + ")", "INFO");

    // Sync MOGRT properties — Match by Index
    var mgt = clip.getMGTComponent();
    if (!mgt) throw new Error("getMGTComponent() returned null for clip [T" + trackNum + " C" + clipNum + "].");
    for (var k = 0; k < updatedProps.length; k++) {
      var item = updatedProps[k];
      var targetProp = mgt.properties[Number(item.index)];
      if (!targetProp) continue;

      // H: Backend Progression guard
      if (item.displayName.indexOf("Progression") !== -1) continue;

      // Glyph-Based Sync Guard (Ⓢ and Ⓑ)
      var hasSpecificGlyph = (targetProp.displayName.indexOf("Ⓢ") !== -1 || targetProp.displayName.indexOf("Ⓑ") !== -1);
      if (hasSpecificGlyph && !isSamePhrase) {
        jsxLog("  [GUARD] Skipping phrase-specific: " + targetProp.displayName, "INFO");
        continue;
      }

      try {
        var isTextInput = (item.displayName.indexOf("Text Input") !== -1);
        if (isTextInput && !isSamePhrase) {
          var masterStyleObj;
          try { masterStyleObj = JSON.parse(String(item.value)); } catch (e) { masterStyleObj = {}; }
          var currentObj;
          try { currentObj = JSON.parse(targetProp.getValue()); } catch (e) { currentObj = {}; }
          masterStyleObj.textEditValue = currentObj.textEditValue || "";
          masterStyleObj.fontTextRunLength = [masterStyleObj.textEditValue.length];
          targetProp.setValue(JSON.stringify(masterStyleObj), 1);
          continue;
        }

        // Color injection check — require valueType=6 OR a strict 4-element numeric array
        var isArr = (Object.prototype.toString.call(item.value) === '[object Array]');
        var isColor = (item.valueType === 6) ||
                      (isArr && item.value.length === 4 &&
                       typeof item.value[0] === 'number' && typeof item.value[1] === 'number' &&
                       typeof item.value[2] === 'number' && typeof item.value[3] === 'number');
        if (isColor && isArr && item.value.length === 4) {
          targetProp.setColorValue(item.value[0], item.value[1], item.value[2], item.value[3], 1);
        } else {
          targetProp.setValue(item.value, 1);
        }
      } catch (propErr) {
        jsxLog("  [ERROR] " + item.displayName + ": " + propErr, "ERROR");
      }
    }

    // Close undo group after last clip is synced
    if (index === total - 1) {
      endUndo("Sync All Properties");
    }

    return { status: "Complete" };
  }, "syncAll");
}


/**
 * Loose-selection gatherer for Join Multiple Phrases.
 * Unlike syncAllGetData, this does NOT require the playhead to sit over
 * a selected clip — Join resolves its own master inside sm_tools_join_v28.
 */
function joinGetSelection(params) {
  return safeCall(function () {
    app.enableQE();
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) return { status: "Error", message: "No active sequence." };
    var qeSeq = qe.project.getActiveSequence();
    var cti = qeSeq ? qeSeq.CTI.secs : 0;

    var clipsData = [];
    for (var t = 0; t < activeSeq.videoTracks.numTracks; t++) {
      var vt = activeSeq.videoTracks[t];
      for (var cIdx = 0; cIdx < vt.clips.numItems; cIdx++) {
        var c = vt.clips[cIdx];
        if (c.isSelected() && c.isMGT()) {
          clipsData.push({ trackNumber: t, clipNumber: cIdx });
        }
      }
    }
    return { status: "Complete", selectedMogrtData: clipsData, playhead: cti };
  }, "joinGetSelection");
}

function syncTextGetData(params) {
  return safeCall(function () {
    app.enableQE();
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) return { status: "Error", message: "No active sequence." };

    var qeSeq = qe.project.getActiveSequence();
    var cti = qeSeq ? qeSeq.CTI.secs : 0;

    var result = { status: "Incomplete", selectedMogrtData: [], masterMogrtData: [], playhead: cti };

    // Pass 1: Master
    var masterFound = false;
    var masterTrack = -1;
    var masterClipIdx = -1;
    for (var i = 0; i < activeSeq.videoTracks.numTracks; i++) {
      var track = activeSeq.videoTracks[i];
      for (var j = 0; j < track.clips.numItems; j++) {
        var clip = track.clips[j];
        if (clip.isSelected() && clip.isMGT()) {
          var start = clip.start.seconds;
          var end = clip.end.seconds;
          if (!masterFound && cti >= start && cti <= end) {
            masterFound = true;
            masterTrack = i;
            masterClipIdx = j;
            var mgt = clip.getMGTComponent();

            // Pass 1: Gather Master Text properties (Flat Loop)
            var pCount = (mgt && mgt.properties) ? (mgt.properties.length || 0) : 0;
            if (pCount === 0) jsxLog("syncTextGetData: master MOGRT returned 0 properties.", "WARN");
            for (var k = 0; k < pCount; k++) {
              var p = mgt.properties[k];
              if (p.displayName.match(/\u24c9/) || p.displayName.match(/Ⓣ/) || p.displayName === "TEXT") {
                var val = p.getValue();
                var vType = p.propertyValueType;

                try {
                  var rawCs = p.getColorValue();
                  if (rawCs && rawCs.length === 4 && typeof rawCs[0] === 'number') {
                    val = [rawCs[0], rawCs[1], rawCs[2], rawCs[3]];
                    vType = 6;
                  } else if (typeof rawCs === 'string' && rawCs.charAt(0) === '{') {
                    var cObj = JSON.parse(rawCs);
                    var cr = (cObj.red !== undefined) ? cObj.red : 0;
                    var cg = (cObj.green !== undefined) ? cObj.green : 0;
                    var cb = (cObj.blue !== undefined) ? cObj.blue : 0;
                    var ca = (cObj.alpha !== undefined) ? cObj.alpha : 1;
                    val = [ca, cr, cg, cb];
                    vType = 6;
                  }
                } catch (e) { }

                result.masterMogrtData.push({
                  index: k,
                  displayName: p.displayName,
                  value: val,
                  valueType: vType
                });
              }
            }
          }
        }
      }
    }

    // Pass 2: Count before iterating to catch accidental full-timeline selections
    var selectedCount2 = 0;
    for (var t = 0; t < activeSeq.videoTracks.numTracks; t++) {
      var vt = activeSeq.videoTracks[t];
      for (var cIdx = 0; cIdx < vt.clips.numItems; cIdx++) {
        if (vt.clips[cIdx].isSelected() && vt.clips[cIdx].isMGT()) selectedCount2++;
      }
    }
    if (selectedCount2 > 500) {
      return { status: "Error", message: "Too many clips selected (" + selectedCount2 + "). Sync Text is capped at 500 clips to prevent freezing. Narrow your selection and try again." };
    }

    // Pass 2: All Selected (Gather all first to sort chronologically)
    var selectedClips = [];
    for (var t = 0; t < activeSeq.videoTracks.numTracks; t++) {
      var vt = activeSeq.videoTracks[t];
      for (var cIdx = 0; cIdx < vt.clips.numItems; cIdx++) {
        var c = vt.clips[cIdx];
        if (c.isSelected() && c.isMGT()) {
          var prog = 0;
          var mComp = c.getMGTComponent();
          var pP = mComp.properties.getParamForDisplayName("Ⓣ Word Progression") ||
                   mComp.properties.getParamForDisplayName("Word Progression") ||
                   mComp.properties.getParamForDisplayName("Ⓣ Word Progression");
          if (pP) prog = pP.getValue();

          selectedClips.push({
            clip: c,
            t: t,
            cIdx: cIdx,
            start: c.start.seconds,
            progression: prog
          });
        }
      }
    }

    // Sort selected clips by start time
    selectedClips.sort(function(a, b) { return a.start - b.start; });

    // Assign phrase indices based on sorted order
    var lastProg = 0;
    var isMultiPhrase = false;
    var phraseIndex = 0;
    var masterPhraseIndex = -1;

    for (var k = 0; k < selectedClips.length; k++) {
      var item = selectedClips[k];
      if (Math.round(item.progression) <= Math.round(lastProg) && k > 0) {
        isMultiPhrase = true;
        phraseIndex++;
      }
      lastProg = item.progression;

      // Check if this is the master clip (to find masterPhraseIndex)
      if (item.t === masterTrack && item.cIdx === masterClipIdx) {
        masterPhraseIndex = phraseIndex;
      }

      result.selectedMogrtData.push({
        trackNumber: item.t,
        clipNumber: item.cIdx,
        clipStart: item.start,
        clipEnd: item.clip.end.seconds,
        phraseIndex: phraseIndex
      });
    }

    if (!masterFound) {
      jsxLog("syncTextGetData FAILED: No selected clip under playhead. CTI=" + cti, "ERROR");
      return { status: "Error", message: "Place your playhead (blue line) over the clip you want to copy settings FROM, then click Sync Text." };
    }

    if (result.masterMogrtData.length === 0) {
      return { status: "Error", message: "Place your playhead over the 'Source' clip you want to copy settings FROM." };
    }

    result.status = "Complete";
    result.multiplePhrases = isMultiPhrase;
    result.masterPhraseIndex = masterPhraseIndex;
    return result;
  }, "syncTextGetData");
}

function syncText(data) {
  return safeCall(function () {
    var i = data.thisLoopNumber;
    var clipData = data.selectedMogrtData[i];
    var t = clipData.trackNumber;
    var c = clipData.clipNumber;
    var multi = data.multiplePhrases;
    var updatedProps = data.updatedMogrtData;

    // Is this target clip in the master's phrase? (single-phrase mode = always yes)
    var inMasterPhrase = !multi || (clipData.phraseIndex === data.masterPhraseIndex);

    var activeSeq = app.project.activeSequence;
    if (activeSeq) {
      var clip = activeSeq.videoTracks[t].clips[c];
      if (clip && clip.isMGT()) {
        var mgt = clip.getMGTComponent();
        for (var j = 0; j < updatedProps.length; j++) {
          var item = updatedProps[j];
          var targetProp = mgt.properties[Number(item.index)];
          if (!targetProp) continue;

          if (targetProp.displayName.indexOf("Progression") !== -1) continue;

          // Glyph-Based Sync Guard (Ⓢ and Ⓑ) for cross-phrase sync
          var hasSpecificGlyph = (targetProp.displayName.indexOf("Ⓢ") !== -1 || targetProp.displayName.indexOf("Ⓑ") !== -1);
          if (hasSpecificGlyph && !inMasterPhrase) {
            continue;
          }

          // Cross-Phrase Logic: If syncing to a different phrase, merge style but keep text
          if (!inMasterPhrase && (targetProp.displayName.indexOf("Text Input") !== -1 || targetProp.displayName === "TEXT")) {
            try {
              var masterStyleObj;
              try { masterStyleObj = JSON.parse(String(item.value)); } catch (e) { masterStyleObj = {}; }
              var currentObj;
              try { currentObj = JSON.parse(targetProp.getValue()); } catch (e) { currentObj = {}; }
              var currentText = (currentObj && typeof currentObj.textEditValue === 'string') ? currentObj.textEditValue : "";
              masterStyleObj.textEditValue = currentText;
              masterStyleObj.fontTextRunLength = [currentText.length];
              targetProp.setValue(JSON.stringify(masterStyleObj), 1);
            } catch (e) {
              jsxLog("  [WARN] Cross-phrase text merge failed for " + targetProp.displayName + ": " + e, "WARN");
            }
            continue;
          }

          if (item.valueType === 6 && (item.value instanceof Array)) {
            var a = item.value[0];
            var r = item.value[1];
            var g = item.value[2];
            var b = item.value[3];
            targetProp.setColorValue(a, r, g, b, 1);
          } else {
            targetProp.setValue(item.value, 1);
          }
        }
      }
      data.status = "Complete";
    }
    return data;
  }, "syncText");
}

function sm_sync_batch(data) {
  return safeCall(function () {
    var total = data.selectedMogrtData.length;
    dataLog("Sync Payload Received. Total clips to process: " + total, "RECEIVE");

    jsxLog("--- sm_sync_batch START | total clips: " + total + " | multiplePhrases: " + data.multiplePhrases, "INFO");

    var skipped = 0;
    var lastError = "";
    for (var i = 0; i < total; i++) {
      data.thisLoopNumber = i;
      var d = data.selectedMogrtData[i];
      jsxLog("  Applying clip " + (i + 1) + "/" + total + " [T" + d.trackNumber + " C" + d.clipNumber + "]", "INFO");
      try {
        syncAll(data);
        jsxLog("  ✔ Clip " + (i + 1) + " synced OK", "INFO");
      } catch (e) {
        lastError = e.message;
        jsxLog("  ✘ Clip " + (i + 1) + " SKIPPED — Error: " + e.message + " (T" + d.trackNumber + " C" + d.clipNumber + ")", "WARN");
        skipped++;
      }
    }

    if (skipped > 0 && total === 1) {
      throw new Error(lastError);
    }

    jsxLog("--- sm_sync_batch END | success: " + (total - skipped) + " | skipped: " + skipped, "INFO");
    return { status: "Complete", count: total - skipped, skipped: skipped, message: lastError };
  }, "sm_sync_batch");
}

function sm_sync_text_batch(data) {
  return safeCall(function () {
    var total = data.selectedMogrtData.length;
    for (var i = 0; i < total; i++) {
      data.thisLoopNumber = i;
      syncText(data);
    }
    return { status: "Complete", count: total };
  }, "sm_sync_text_batch");
}

// =============================================================================
// COMMAND CENTER BACKEND (v3.0)
// =============================================================================

function getTimelinePhraseMap() {
  return safeCall(function () {
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) return { status: "Error", message: "No active sequence." };

    var allMogrts = [];
    var genericPhrases = []; // generic MOGRT clips become standalone phrase entries
    var tracks = activeSeq.videoTracks;

    // 1. Collect all MOGRTs (freeXan Caption-native + generic)
    for (var i = 0; i < tracks.numTracks; i++) {
      var clips = tracks[i].clips;
      for (var j = 0; j < clips.numItems; j++) {
        var clip = clips[j];
        if (clip.isMGT()) {
          var mgt;
          try { mgt = clip.getMGTComponent(); } catch (e) { continue; }
          if (!mgt || !mgt.properties) continue;

          var textParam = mgt.properties.getParamForDisplayName("\u24c9 Text Input") || 
                          mgt.properties.getParamForDisplayName("Text Input") ||
                          mgt.properties.getParamForDisplayName("Ⓣ Text Input");
          if (!textParam) {
            // Generic-MOGRT path: clip is MGT but has no Ⓣ Text Input.
            // Build a standalone phrase entry from XMP word timings (if present),
            // otherwise from the first detected text input's current value.
            // Wrapped in try/catch so any failure on a single clip doesn't crash
            // the entire phrase scan (which would leave the edit tab blank).
            try {
              if (typeof _smFindAllTextParams !== "function") continue;
              var gTextParams = _smFindAllTextParams(mgt.properties);
              if (!gTextParams || gTextParams.length === 0) continue;

              var xmpData = null;
              try {
                if (typeof _smReadWordTimings === "function") xmpData = _smReadWordTimings(clip.projectItem);
              } catch (eXmp) { xmpData = null; }

              var gStartSec = clip.start ? clip.start.seconds : 0;
              var gEndSec   = clip.end   ? clip.end.seconds   : 0;

              var gWords, gDist, gInputCount, gInputNames, gPhraseText;
              if (xmpData && xmpData.words && xmpData.words.length > 0) {
                gWords = xmpData.words;
                if (xmpData.distribution && xmpData.distribution.length > 0) {
                  gDist = xmpData.distribution;
                } else {
                  var allIdxs = [];
                  for (var z = 0; z < gWords.length; z++) allIdxs.push(z);
                  gDist = [allIdxs];
                }
                gInputCount = xmpData.textInputCount || gTextParams.length;
                gInputNames = xmpData.textInputNames || [];
                var pieces = [];
                for (var wp = 0; wp < gWords.length; wp++) {
                  if (gWords[wp] && gWords[wp].text) pieces.push(gWords[wp].text);
                }
                gPhraseText = pieces.join(" ");
              } else {
                var ft = "";
                try { ft = (typeof _smGetText === "function") ? _smGetText(gTextParams[0].param) : ""; } catch (eGT) { ft = ""; }
                gPhraseText = ft || "(generic clip)";
                gWords = [{ text: gPhraseText, start: gStartSec, end: gEndSec }];
                gDist = [[0]];
                gInputCount = gTextParams.length;
                gInputNames = [];
                for (var ti = 0; ti < gTextParams.length; ti++) {
                  gInputNames.push(gTextParams[ti].name || ("Input " + (ti + 1)));
                }
              }

              genericPhrases.push({
                text:             gPhraseText,
                start:            gStartSec,
                end:              gEndSec,
                isLocked:         false,
                mogrtMode:        "generic",
                wordTimings:      gWords,
                wordDistribution: gDist,
                textInputCount:   gInputCount,
                textInputNames:   gInputNames,
                clips: [{
                  text:        gPhraseText,
                  progression: 1,
                  start:       gStartSec,
                  end:         gEndSec,
                  track:       i,
                  index:       j,
                  mogrtName:   clip.projectItem ? clip.projectItem.name : clip.name
                }]
              });
            } catch (eGenericBlock) {
              jsxLog("getTimelinePhraseMap: generic-detect failed on T" + i + " C" + j + ": " + eGenericBlock.toString(), "WARN");
            }
            continue;
          }

          var progParam = mgt.properties.getParamForDisplayName("\u24c9 Word Progression") || 
                          mgt.properties.getParamForDisplayName("Word Progression") ||
                          mgt.properties.getParamForDisplayName("Ⓣ Word Progression");
          var prog = progParam ? progParam.getValue() : 1;

          var textVal = textParam.getValue();
          var textContent = "";
          try {
            textContent = JSON.parse(textVal).textEditValue || "";
          } catch (e) {
            jsxLog("Failed to parse text for clip " + j + ": " + textVal, "WARN");
          }

          allMogrts.push({
            clip: clip,
            track: i,
            index: j,
            start: clip.start ? clip.start.seconds : 0,
            end: clip.end ? clip.end.seconds : 0,
            text: textContent,
            progression: prog
          });
        }
      }
    }

    // 2. Sort clips chronologically by start time
    allMogrts.sort(function (a, b) {
      return a.start - b.start;
    });

    // 3. Group into Phrases
    var phraseMap = [];
    var currentPhrase = null;
    var lastText = "";

    for (var k = 0; k < allMogrts.length; k++) {
      var m = allMogrts[k];

      // Round progression — sliders may emit 0.999/1.001 due to float imprecision.
      // Strict === 1 misses those, causing two phrases to fuse into one ("sticky phrases").
      var progRounded = Math.round(m.progression);

      var wordName = "Word";
      try {
        var words = m.text.split(/\s+/);
        wordName = words[progRounded - 1] || "Word";
      } catch (e) { }

      // Phrase boundary: Text changes OR progression resets to 1 (rounded).
      if (m.text !== lastText || progRounded === 1) {
        if (currentPhrase) phraseMap.push(currentPhrase);
        currentPhrase = {
          text: m.text,
          start: m.start,
          end: m.end,
          isLocked: false,
          clips: []
        };
      }

      currentPhrase.clips.push({
        text: wordName,
        progression: progRounded,
        start: m.start,
        end: m.end,
        track: m.track,
        index: m.index,
        mogrtName: m.clip.projectItem ? m.clip.projectItem.name : m.clip.name
      });

      currentPhrase.end = m.end;
      lastText = m.text;
    }
    if (currentPhrase) phraseMap.push(currentPhrase);

    // Tag freeXan Caption phrases explicitly + merge in generic phrases, then sort by start.
    for (var smI = 0; smI < phraseMap.length; smI++) {
      if (!phraseMap[smI].mogrtMode) phraseMap[smI].mogrtMode = "freexan";
    }
    for (var gp = 0; gp < genericPhrases.length; gp++) {
      phraseMap.push(genericPhrases[gp]);
    }
    phraseMap.sort(function (a, b) { return a.start - b.start; });

    return phraseMap;
  }, "getTimelinePhraseMap");
}

function setPlayheadTime(params) {
  return safeCall(function () {
    var seq = app.project.activeSequence;
    if (seq) {
      var t = new Time();
      t.seconds = params.seconds;
      seq.setPlayerPosition(t.ticks);
      return "Success";
    }
    throw new Error("No active sequence.");
  }, "setPlayheadTime");
}

function getPlayheadTime() {
  return safeCall(function () {
    var qeSeq = qe.project.getActiveSequence();
    if (qeSeq) return qeSeq.CTI.secs;
    var seq = app.project.activeSequence;
    if (seq) return seq.getPlayerPosition().seconds;
    throw new Error("No active sequence.");
  }, "getPlayheadTime");
}

// Walks every property on a MOGRT clip and returns a typed value dump
// for the JS-side patcher. Single sweep picks selected clip first, falls
// back to the clip under the playhead. valueType 6 = color in Premiere's
// MOGRT property API (matches inspectMogrtProperties' usage below).
function getMogrtDumpForActiveClip() {
  return safeCall(function () {
    app.enableQE();
    var seq = app.project.activeSequence;
    if (!seq) throw new Error("No active sequence.");

    var qeSeq = qe.project.getActiveSequence();
    var cti = qeSeq ? qeSeq.CTI.secs : 0;

    var selectedHit = null;
    var playheadHit = null;
    for (var i = 0; i < seq.videoTracks.numTracks; i++) {
      var trk = seq.videoTracks[i];
      for (var j = 0; j < trk.clips.numItems; j++) {
        var c = trk.clips[j];
        
        var isMogrt = false;
        try { if (c.isMGT && c.isMGT()) isMogrt = true; } catch (e) {}
        if (!isMogrt) {
            try { var m = c.getMGTComponent(); if (m && m.properties) isMogrt = true; } catch (e) {}
        }
        if (!isMogrt) continue;

        if (!selectedHit && c.isSelected()) selectedHit = c;
        if (!playheadHit && cti >= c.start.seconds && cti <= c.end.seconds) playheadHit = c;
        if (selectedHit && playheadHit) break;
      }
      if (selectedHit && playheadHit) break;
    }
    var found = selectedHit || playheadHit;
    if (!found) {
      return { status: "Error", message: "Select a MOGRT clip (or place the playhead over one) before saving." };
    }

    var mediaPath = "";
    try { mediaPath = found.projectItem.getMediaPath() || ""; } catch (e) { mediaPath = ""; }

    // --- FREEXAN CAPTION METADATA RETRIEVAL ---
    var smDef = null;
    var smAssetFolder = null;
    var smAssetTag = null;
    
    try {
        if (ExternalObject.AdobeXMPScript === undefined) {
            ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
        }
        var xmp = new XMPMeta(found.projectItem.getProjectMetadata());
        var schemaNS = "http://ns.bloomxsolutions.com/freexan-caption/1.0/";
        var prefix = "sm:";
        XMPMeta.registerNamespace(schemaNS, prefix);
        
        var d = xmp.getProperty(schemaNS, "freeXan Caption_Definition");
        if (d) smDef = d.toString();
        
        var f = xmp.getProperty(schemaNS, "freeXan Caption_Asset_Folder");
        if (f) smAssetFolder = f.toString();

        var t = xmp.getProperty(schemaNS, "freeXan Caption_Asset_Tag");
        if (t) smAssetTag = t.toString();
    } catch (e) {
        jsxLog("Failed to read metadata during dump: " + e.message, "WARN");
    }

    var mgt = found.getMGTComponent();
    if (!mgt) return { status: "Error", message: "Active clip is not a Motion Graphics Template." };
    var props = mgt.properties;
    var pCount = props ? (props.length || 0) : 0;
    if (!pCount) return { status: "Error", message: "MOGRT exposes no parameters to save." };

    var values = [];
    for (var k = 0; k < pCount; k++) {
      var p = props[k];
      var name = p.displayName;
      var entry = null;

      if (p.propertyValueType === 6) {
        try {
          var colorJson = p.getColorValue();
          var co = colorJson ? ((typeof colorJson === 'string') ? JSON.parse(colorJson) : colorJson) : null;
          if (co) {
            var r = Number(co.red != null ? co.red : co.Red) || 0;
            var g = Number(co.green != null ? co.green : co.Green) || 0;
            var b = Number(co.blue != null ? co.blue : co.Blue) || 0;
            var aRaw = co.alpha != null ? co.alpha : co.Alpha;
            var a = aRaw != null ? Number(aRaw) : 255;
            if (r <= 1 && g <= 1 && b <= 1 && (r > 0 || g > 0 || b > 0)) {
              r = Math.round(r * 255);
              g = Math.round(g * 255);
              b = Math.round(b * 255);
            }
            if (a <= 1 && a > 0) {
              a = Math.round(a * 255);
            }
            if (a === 0 && aRaw == null) a = 255;
            entry = { index: k, displayName: name, kind: "color", value: [a, r, g, b] };
          }
        } catch (eC) { }
      }

      if (!entry) {
        var v = null;
        try { v = p.getValue(); } catch (eV) { v = null; }
        if (v === null || typeof v === 'undefined') continue;

        if (typeof v === 'string' && v.charAt(0) === '{') {
          try {
            var parsed = JSON.parse(v);
            if (typeof parsed.textEditValue !== 'undefined') {
              entry = {
                index: k,
                displayName: name,
                kind: "text",
                value: parsed.textEditValue,
                font: {
                  fontEditValue: parsed.fontEditValue,
                  fontSizeEditValue: parsed.fontSizeEditValue,
                  fontFSBoldValue: parsed.fontFSBoldValue,
                  fontFSItalicValue: parsed.fontFSItalicValue,
                  fontFSAllCapsValue: parsed.fontFSAllCapsValue,
                  fontFSSmallCapsValue: parsed.fontFSSmallCapsValue
                }
              };
            }
          } catch (eP) { }
        } else if (typeof v === 'boolean') {
          entry = { index: k, displayName: name, kind: "bool", value: v };
        } else if (typeof v === 'number') {
          entry = { index: k, displayName: name, kind: "number", value: v };
        } else if (Object.prototype.toString.call(v) === '[object Array]') {
          var arr = [];
          for (var ai = 0; ai < v.length; ai++) arr.push(v[ai]);
          entry = { index: k, displayName: name, kind: "array", value: arr };
        }
      }

      if (entry) values.push(entry);
    }

    return {
      status: "Ok",
      sourceMogrtPath: mediaPath,
      templateName: found.projectItem.name || "Template",
      values: values
    };
  }, "getMogrtDumpForActiveClip");
}

function inspectMogrtProperties(params) {
  return safeCall(function () {
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");
    var track = activeSeq.videoTracks[params.trackIndex];
    if (!track) throw new Error("Track not found: " + params.trackIndex);
    var clip = track.clips[params.clipIndex];
    if (!clip) throw new Error("Clip not found at T" + params.trackIndex + " C" + params.clipIndex);

    var mgt = clip.getMGTComponent();
    var props = mgt.properties;
    var result = [];

    function componentToHex(c) {
      var hex = Math.round(c * 255).toString(16);
      return hex.length == 1 ? "0" + hex : hex;
    }
    function rgbToHex(r, g, b) {
      return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
    }

    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      var type = "slider";
      var dName = p.displayName || "";
      var val = null;
      var isGroup = false;

      try {
        val = p.getValue();
        if (typeof val === 'boolean') {
          val = val ? 1 : 0;
          type = "checkbox";
        }
      } catch (e) {
        isGroup = true;
        type = "group";
      }

      if (!isGroup) {
        if (dName.indexOf("Color") !== -1 || p.propertyValueType === 6) {
          type = "color";
          try {
            var c = p.getColorValue();
            val = rgbToHex(c[1], c[2], c[3]);
          } catch (e) {
            val = "#ffffff";
          }
        } else if (dName.indexOf("Text Input") !== -1) {
          type = "text";
          try {
            var parsed = JSON.parse(val);
            val = parsed.textEditValue || val;
          } catch (e) { }
        } else if (dName.indexOf("Progression") !== -1) {
          type = "readonly";
        } else if (val instanceof Array && val.length >= 2) {
          type = "point";
        }
      }

      result.push({
        displayName: dName,
        value: val,
        type: type,
        index: i
      });
    }
    return result;
  }, "inspectMogrtProperties");
}

function updateMogrtProperty(params) {
  return safeCall(function () {
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");
    var track = activeSeq.videoTracks[params.trackIndex];
    if (!track) throw new Error("Track not found: " + params.trackIndex);
    var clip = track.clips[params.clipIndex];
    if (!clip) throw new Error("Clip not found: T" + params.trackIndex + " C" + params.clipIndex);

    var mgt = clip.getMGTComponent();
    var prop = mgt.properties.getParamForDisplayName(params.propName) ||
               mgt.properties.getParamForDisplayName("Ⓣ " + params.propName) ||
               mgt.properties.getParamForDisplayName(params.propName.replace(/^Ⓣ\s*/, ""));
    if (prop) {
      _applyMogrtPropValue(prop, params.propName, params.value);
      return "Success";
    }
    throw new Error("Property not found: " + params.propName);
  }, "updateMogrtProperty");
}

function updatePhraseMogrtProperty(params) {
  return safeCall(function () {
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");
    
    var targets = params.targetClips;
    if (!targets || targets.length === 0) return "No targets";

    var usingUndoGroup = false;
    try {
      if (typeof app.beginUndoGroup === "function") {
        app.beginUndoGroup("Inspector Edit");
        usingUndoGroup = true;
      }
    } catch(e) { }

    for (var t = 0; t < targets.length; t++) {
      var tc = targets[t];
      var track = activeSeq.videoTracks[tc.trackIndex];
      if (!track) continue;
      var clip = track.clips[tc.clipIndex];
      if (!clip || !clip.isMGT()) continue;

      var mgt = clip.getMGTComponent();
      if (!mgt) continue;
      
      var prop = mgt.properties[Number(params.propIndex)];
      if (prop && prop.displayName === params.propName) {
        _applyMogrtPropValue(prop, params.propName, params.value);
      }
    }

    if (usingUndoGroup) {
      try { app.endUndoGroup(); } catch(e) {}
    }
    return "Success";
  }, "updatePhraseMogrtProperty");
}

function _applyMogrtPropValue(prop, propName, val) {
  function logApi(callStr) {
    try {
      if (ExternalObject.AdobeXMPScript === undefined) {
        ExternalObject.AdobeXMPScript = new ExternalObject('lib:AdobeXMPScript');
      }
      var eventObj = new CSXSEvent();
      eventObj.type = "com.freexan.debug.log";
      
      var receivedStr = "";
      if (Object.prototype.toString.call(val) === '[object Array]') {
        receivedStr = "[" + val.join(", ") + "]";
      } else if (typeof val === 'object') {
        try { receivedStr = JSON.stringify(val); } catch(e) { receivedStr = "Object"; }
      } else {
        receivedStr = String(val);
      }
      
      var msg = "RECEIVED: " + receivedStr + "\nINSERTED: " + callStr;
      
      eventObj.data = JSON.stringify({ 
        level: "INFO", 
        message: msg, 
        source: "ExtendScript: " + propName 
      });
      eventObj.dispatch();
    } catch(e) {}
  }

  var propNameLower = propName.toLowerCase();
  var isTextProp = (propNameLower.indexOf("text input") !== -1);

  if (typeof val === 'string' && val.indexOf('-') !== -1 && val.indexOf(';') !== -1) {
    if (val.match(/^[0-9a-fA-F\-;]+$/)) {
      return; 
    }
  }

  if (isTextProp && typeof val === 'string') {
    var existingStr = prop.getValue();
    var existingObj;
    try { existingObj = JSON.parse(existingStr); } catch(e) { existingObj = {}; }
    existingObj.textEditValue = val;
    existingObj.fontTextRunLength = [val.length];
    logApi("prop.setValue('" + JSON.stringify(existingObj) + "', 1) [Text]");
    prop.setValue(JSON.stringify(existingObj), 1);
  } else if (typeof val === 'string' && val.indexOf('#') === 0) {
    var r = parseInt(val.substring(1, 3), 16);
    var g = parseInt(val.substring(3, 5), 16);
    var b = parseInt(val.substring(5, 7), 16);
    try {
      logApi("prop.setColorValue(255, " + r + ", " + g + ", " + b + ", 1) [Hex]");
      prop.setColorValue(255, r, g, b, 1);
    } catch (e) {
      logApi("prop.setValue([255, " + r + ", " + g + ", " + b + "], 1) [Hex Fallback]");
      prop.setValue([255, r, g, b], 1);
    }
  } else if ((prop.propertyValueType === 6 || (Object.prototype.toString.call(val) === '[object Array]' && val.length === 4)) && val) {
    try {
      var success = false;
      try {
        var blue1 = val[3] !== undefined ? Number(val[3]) : 255;
        logApi("prop.setColorValue(" + Number(val[0]) + ", " + Number(val[1]) + ", " + Number(val[2]) + ", " + blue1 + ", 1)");
        prop.setColorValue(Number(val[0]), Number(val[1]), Number(val[2]), blue1, 1);
        success = true;
      } catch (e1) {}

      if (!success) {
        try {
          var blue2 = val[3] !== undefined ? Number(val[3]) : 255;
          var a = Number(val[0]), r2 = Number(val[1]), g2 = Number(val[2]), b2 = blue2;
          if (a === 1) a = 255;
          logApi("prop.setColorValue(" + a + ", " + r2 + ", " + g2 + ", " + b2 + ", 1) [Reordered]");
          prop.setColorValue(a, r2, g2, b2, 1);
          success = true;
        } catch (e2) {}
      }

      if (!success) {
        try { 
          logApi("prop.setValue([" + val.join(',') + "], 1) [Color Fallback 1]");
          prop.setValue(val, 1); 
          success = true; 
        } catch (e3) {}
      }
      
      if (!success) {
        logApi("prop.setValue([" + val.join(',') + "], 1) [Color Fallback 2]");
        prop.setValue(val, 1); 
      }
    } catch (eOuter) {
      logApi("prop.setValue([" + val.join(',') + "], 1) [Color Final Fallback]");
      prop.setValue(val, 1);
    }
  } else {
    try {
      if (Object.prototype.toString.call(val) === '[object Array]') {
        logApi("prop.setValue([" + val.join(',') + "], 1) [Array]");
        prop.setValue(val, 1);
      } else {
        logApi("prop.setValue(" + Number(val) + ", 1) [Number]");
        prop.setValue(Number(val), 1);
      }
    } catch(e) {
      logApi("prop.setValue(" + val + ", 1) [String/Object Fallback]");
      prop.setValue(val, 1);
    }
  }
}

function executeWordTransfer(params) {
  return safeCall(function () {
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");

    // Direction: frontend tells us whether target was before or after source
    var srcIdxNum = parseInt(params.sourcePhraseIdx);
    var tgtIdxNum = parseInt(params.targetPhraseIdx);
    if (isNaN(srcIdxNum) || isNaN(tgtIdxNum))
      throw new Error("Invalid phrase indices.");
    if (srcIdxNum === tgtIdxNum)
      throw new Error("Source and target phrase are the same — nothing to transfer.");
    var movingToPrev = tgtIdxNum < srcIdxNum;

    // ─── 1. Fresh scan with friendly error envelope ──────────────────────
    // getTimelinePhraseMap() goes through safeCall, so it returns a JSON
    // string envelope { ok, data } — never the raw array.
    var mapResStr = getTimelinePhraseMap();
    var res;
    try {
      res = JSON.parse(mapResStr);
    } catch (parseErr) {
      throw new Error(
        "Couldn't read the timeline. Your sequence may contain nested " +
        "or unsupported clips. Try refreshing or simplifying the timeline."
      );
    }
    if (!res || !res.ok) {
      var detail = (res && res.error) ? res.error : "unknown reason";
      throw new Error(
        "Couldn't scan timeline (" + detail + "). " +
        "Try Refresh — if it persists, the timeline may be too complex (nested sequences, missing source clips)."
      );
    }
    var phraseMap = res.data;
    if (!phraseMap || phraseMap.length === 0)
      throw new Error("Timeline scan returned no freeXan Caption phrases. Did the clips load?");

    // ─── 2. Normalize input: accept clipIds[] (multi) or clipId (single) ─
    var rawIds = [];
    if (params.clipIds && params.clipIds.length) {
      for (var ri = 0; ri < params.clipIds.length; ri++) rawIds.push(params.clipIds[ri]);
    } else if (params.clipId) {
      rawIds.push(params.clipId);
    } else {
      throw new Error("No clipId(s) provided for transfer.");
    }

    // Parse each "track-clipIndex" identity
    var movedClips = [];
    for (var mi = 0; mi < rawIds.length; mi++) {
      var parts = String(rawIds[mi]).split("-");
      var t = parseInt(parts[0]);
      var c = parseInt(parts[1]);
      if (isNaN(t) || isNaN(c))
        throw new Error("Malformed clipId: " + rawIds[mi]);
      movedClips.push({ track: t, index: c, raw: rawIds[mi] });
    }

    // ─── 3. Locate each moved clip in the live map; verify all are in the
    //        SAME source phrase, and contiguous from start (prev) or end (next).
    var sourcePhrasePos = -1;
    var foundPositions = []; // index within the source phrase clips[]

    for (var k = 0; k < movedClips.length; k++) {
      var mc = movedClips[k];
      var matchPhrase = -1, matchPos = -1;
      for (var pi = 0; pi < phraseMap.length; pi++) {
        var ph = phraseMap[pi];
        for (var ci = 0; ci < ph.clips.length; ci++) {
          if (ph.clips[ci].track === mc.track && ph.clips[ci].index === mc.index) {
            matchPhrase = pi; matchPos = ci; break;
          }
        }
        if (matchPhrase !== -1) break;
      }
      if (matchPhrase === -1)
        throw new Error("Moved clip not found in live map: " + mc.raw);
      if (sourcePhrasePos === -1) sourcePhrasePos = matchPhrase;
      else if (matchPhrase !== sourcePhrasePos)
        throw new Error("All transferred words must belong to the same source phrase.");
      foundPositions.push(matchPos);
    }

    // Sort positions ascending so contiguity check + selection order are deterministic
    foundPositions.sort(function (a, b) { return a - b; });

    // Contiguity check
    for (var fp = 1; fp < foundPositions.length; fp++) {
      if (foundPositions[fp] !== foundPositions[fp - 1] + 1)
        throw new Error("Transferred words must be contiguous (no gaps).");
    }

    // Edge anchoring rule: must touch the source-phrase boundary on the side we're transferring toward
    var sourcePhrase = phraseMap[sourcePhrasePos];
    var firstPos = foundPositions[0];
    var lastPos = foundPositions[foundPositions.length - 1];
    if (movingToPrev && firstPos !== 0)
      throw new Error("To move words to the previous phrase, the selection must start at the first word.");
    if (!movingToPrev && lastPos !== sourcePhrase.clips.length - 1)
      throw new Error("To move words to the next phrase, the selection must end at the last word.");

    // ─── 4. Resolve target phrase ────────────────────────────────────────
    var targetPhrasePos = movingToPrev ? sourcePhrasePos - 1 : sourcePhrasePos + 1;
    if (targetPhrasePos < 0 || targetPhrasePos >= phraseMap.length)
      throw new Error("Target phrase out of range: " + targetPhrasePos);
    var targetPhrase = phraseMap[targetPhrasePos];

    // ─── 5. Build virtual selection: full target phrase + every moved word
    var virtualSelection = [];
    for (var tt = 0; tt < targetPhrase.clips.length; tt++) {
      virtualSelection.push({
        trackIndex: targetPhrase.clips[tt].track,
        clipIndex: targetPhrase.clips[tt].index
      });
    }
    for (var mm = 0; mm < movedClips.length; mm++) {
      virtualSelection.push({
        trackIndex: movedClips[mm].track,
        clipIndex: movedClips[mm].index
      });
    }

    jsxLog("executeWordTransfer | movedCount=" + movedClips.length +
      " | sourcePhrasePos=" + sourcePhrasePos +
      " | targetPhrasePos=" + targetPhrasePos +
      " | selectionSize=" + virtualSelection.length, "INFO");

    // ─── 6. Delegate to the surgery tool ─────────────────────────────────
    var result = sm_tools_split_join_v28({ selectedClips: virtualSelection });
    if (result && result.status === "Error") throw new Error(result.message);

    return { status: "Success", transferred: movedClips.length };
  }, "executeWordTransfer");
}

/**
 * Physically moves a clip to a new track while preserving its projectItem and timing.
 * Note: This creates a new TrackItem, so properties must be re-applied after.
 */
function _moveClipToTrack(clip, targetTrackIdx) {
  var activeSeq = app.project.activeSequence;
  var currentTrack = clip.parent;
  if (currentTrack.index === targetTrackIdx) return clip; // Already there

  var pItem = clip.projectItem;
  var start = clip.start;

  // Remove from current
  clip.remove(false, false);

  // Overwrite to target
  var targetTrack = activeSeq.videoTracks[targetTrackIdx];
  targetTrack.overwriteClip(pItem, start);

  // Find the new clip (it will be the one at that start time)
  for (var i = 0; i < targetTrack.clips.numItems; i++) {
    var newClip = targetTrack.clips[i];
    if (Math.abs(newClip.start.seconds - start.seconds) < 0.01) {
      return newClip;
    }
  }
  return null;
}

/**
 * Helper to update MOGRT text and progression index
 */
function _updateMogrtTextAndProg(clip, phraseText, progression, labelColor) {
  try {
    var mgt = clip.getMGTComponent();
    if (!mgt) return;

    var textParam = mgt.properties.getParamForDisplayName("\u24c9 Text Input");
    var progParam = mgt.properties.getParamForDisplayName("\u24c9 Word Progression");

    if (textParam) {
      var textObj = JSON.parse(textParam.getValue());
      textObj.textEditValue = phraseText;
      textParam.setValue(JSON.stringify(textObj), 1);
    }

    if (progParam) {
      progParam.setValue(progression, 1);
    }

    if (labelColor !== undefined) {
      _setClipColor(clip, labelColor);
    }
  } catch (e) {
    jsxLog("Failed to update clip: " + e.toString(), "WARN");
  }
}

/**
 * Updates a single word's text in the Ⓣ Text Input property of a clip.
 * Parses the JSON value, updates the textEditValue, re-serializes and sets.
 */
function updateSingleWordText(params) {
  return safeCall(function () {
    app.enableQE();
    var trackIndex = params.trackIndex;
    var clipIndex = params.clipIndex;
    var newText = params.newText;

    var activeSeq = app.project.activeSequence;
    if (!activeSeq) return { status: "Error", message: "No active sequence." };

    var clip = activeSeq.videoTracks[trackIndex].clips[clipIndex];
    if (!clip) return { status: "Error", message: "Clip not found at T" + trackIndex + " C" + clipIndex };

    var mgt = clip.getMGTComponent();
    if (!mgt) return { status: "Error", message: "MOGRT component not found." };

    var textParam = mgt.properties.getParamForDisplayName("Ⓣ Text Input");
    if (!textParam) return { status: "Error", message: "Text Input property not found." };

    try {
      var textObj = JSON.parse(textParam.getValue());
      textObj.textEditValue = newText;
      textParam.setValue(JSON.stringify(textObj), 1);

      jsxLog("updateSingleWordText: updated clip T" + trackIndex + " C" + clipIndex + " to '" + newText + "'", "INFO");
      return { status: "Complete", message: "Word updated." };
    } catch (e) {
      return { status: "Error", message: "Failed to parse or update text: " + e.message };
    }
  }, "updateSingleWordText");
}

// =============================================================================
// NOTE: replacePhraseWithMogrt lives in mogrt.jsx
// Why: The implementation reuses getData's importMGT pattern and createCaptions'
//      placement logic. Only text and Word Progression are transferred — no
//      colors, fonts, or other properties. This matches the Create Subs behavior.
// =============================================================================

/**
 * Recursively walks the project bin and returns all .mogrt project items.
 * Returns array of { name, nodeId, mediaPath }.
 * (Still used by tooling that needs to list available bin items.)
 */
function listMogrtsInBin() {
  return safeCall(function () {
    var results = [];

    function walk(item) {
      if (!item) return;
      if (item.children) {
        for (var i = 0; i < item.children.numItems; i++) {
          walk(item.children[i]);
        }
      }
      var name = item.name || "";
      try {
        var mpath = item.getMediaPath ? item.getMediaPath() : "";
        if (mpath && mpath.toLowerCase().indexOf(".mogrt") !== -1) {
          results.push({ name: name, nodeId: item.nodeId, mediaPath: mpath });
        }
      } catch (e) { /* skip items that fail */ }
    }

    walk(app.project.rootItem);
    jsxLog("listMogrtsInBin: found " + results.length + " MOGRTs in bin.", "INFO");
    return results;
  }, "listMogrtsInBin");
}

// =============================================================================
// REPLACE MOGRT
// Why: Allows swapping the MOGRT template under a whole phrase in one action,
//      preserving word text, timing, and best-effort property transfer.
// =============================================================================

/**
 * Recursively walks the project bin and returns all .mogrt project items.
 * Returns array of { name, nodeId, mediaPath }.
 */
function listMogrtsInBin() {
  return safeCall(function () {
    var results = [];

    // Walk a bin item recursively
    function walk(item) {
      if (!item) return;
      // Children first (bins)
      if (item.children) {
        for (var i = 0; i < item.children.numItems; i++) {
          walk(item.children[i]);
        }
      }
      // Check if this item is a MOGRT (ends with .mogrt, case-insensitive)
      var name = item.name || "";
      if (name.toLowerCase().indexOf(".mogrt") !== -1 || item.type === ProjectItemType.CLIP) {
        try {
          var mpath = item.getMediaPath ? item.getMediaPath() : "";
          if (mpath && mpath.toLowerCase().indexOf(".mogrt") !== -1) {
            results.push({
              name: name,
              nodeId: item.nodeId,
              mediaPath: mpath
            });
          }
        } catch (e) { /* skip items that fail */ }
      }
    }

    walk(app.project.rootItem);
    jsxLog("listMogrtsInBin: found " + results.length + " MOGRTs in bin.", "INFO");
    return results;
  }, "listMogrtsInBin");
}

// NOTE: replacePhraseWithMogrt is in mogrt.jsx — only text + Word Progression are transferred.

// =============================================================================
// SYNC PHRASE WITH MASTER
// Why: Allows the React frontend to sync all clips in a phrase to match the
//      styles of one selected master clip within that same phrase.
// =============================================================================

function syncPhraseWithMaster(params) {
  return safeCall(function () {
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");

    var masterInfo = params.masterClip;
    var targets = params.targetClips;
    if (!masterInfo || !targets || targets.length === 0) {
      throw new Error("Missing master clip or target clips.");
    }

    var trackNum = masterInfo.trackIndex;
    var clipNum = masterInfo.clipIndex;
    var track = activeSeq.videoTracks[trackNum];
    if (!track) throw new Error("Master track not found.");
    
    var masterClip = track.clips[clipNum];
    if (!masterClip || !masterClip.isMGT()) throw new Error("Master clip is missing or not a MOGRT.");

    var mgt = masterClip.getMGTComponent();
    if (!mgt || !mgt.properties) throw new Error("Master clip has no properties.");

    // 1. Extract master properties
    var updatedProps = [];
    for (var k = 0; k < mgt.properties.length; k++) {
      var p = mgt.properties[k];
      var pName = p.displayName;
      var vType = p.propertyValueType;
      var val = null;
      try { val = p.getValue(); } catch(e) { continue; }
      
      // Color handling
      try {
        var rawColor = p.getColorValue();
        if (rawColor && rawColor.length === 4) {
          val = [rawColor[0], rawColor[1], rawColor[2], rawColor[3]];
          vType = 6;
        } else if (typeof rawColor === 'string' && rawColor.charAt(0) === '{') {
          var cObj = JSON.parse(rawColor);
          val = [cObj.alpha||cObj.Alpha||1, cObj.red||cObj.Red||0, cObj.green||cObj.Green||0, cObj.blue||cObj.Blue||0];
          vType = 6;
        }
      } catch (e) {}

      updatedProps.push({ index: k, displayName: pName, value: val, valueType: vType });
    }

    var syncedCount = 0;
    var usingUndoGroup = false;
    try {
      if (typeof app.beginUndoGroup === "function") {
        app.beginUndoGroup("Sync Phrase");
        usingUndoGroup = true;
      }
    } catch(e) { }

    // 2. Apply to targets
    for (var t = 0; t < targets.length; t++) {
      var tc = targets[t];
      // Skip the master clip itself
      if (tc.trackIndex === trackNum && tc.clipIndex === clipNum) continue;
      
      var tr = activeSeq.videoTracks[tc.trackIndex];
      if (!tr) continue;
      var targetClip = tr.clips[tc.clipIndex];
      if (!targetClip || !targetClip.isMGT()) continue;

      var tgtMgt = targetClip.getMGTComponent();
      if (!tgtMgt) continue;

      for (var pIdx = 0; pIdx < updatedProps.length; pIdx++) {
        var item = updatedProps[pIdx];
        var targetProp = tgtMgt.properties[Number(item.index)];
        if (!targetProp) continue;

        // Skip Word Progression
        if (item.displayName.indexOf("Progression") !== -1) continue;

        try {
          var isTextInput = (item.displayName.indexOf("Text Input") !== -1);
          if (isTextInput) {
            // Preserve existing text edit value while copying font styles
            var masterStyleObj;
            try { masterStyleObj = JSON.parse(String(item.value)); } catch (e) { masterStyleObj = {}; }
            var currentObj;
            try { currentObj = JSON.parse(targetProp.getValue()); } catch (e) { currentObj = {}; }
            
            masterStyleObj.textEditValue = currentObj.textEditValue || "";
            masterStyleObj.fontTextRunLength = [masterStyleObj.textEditValue.length];
            targetProp.setValue(JSON.stringify(masterStyleObj), 1);
            continue;
          }

          // Inject color or scalar
          var isColor = (item.valueType === 6) ||
                        (item.value instanceof Array && item.value.length === 4);
          if (isColor && item.value instanceof Array && item.value.length === 4) {
            targetProp.setColorValue(item.value[0], item.value[1], item.value[2], item.value[3], 1);
          } else {
            targetProp.setValue(item.value, 1);
          }
        } catch (e) {}
      }
      syncedCount++;
    }

    if (usingUndoGroup) {
      try { app.endUndoGroup(); } catch(e) {}
    }
    
    jsxLog("syncPhraseWithMaster: Synced " + syncedCount + " clips.", "SUCCESS");
    return { status: "Success", syncedCount: syncedCount };
  }, "syncPhraseWithMaster");
}