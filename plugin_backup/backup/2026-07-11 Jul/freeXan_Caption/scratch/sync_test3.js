/**
 * SubMachine - Synchronization Tools
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
            for (var k = 0; k < mgt.properties.numProperties; k++) {
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
                matchName: p.matchName,
                value: val,
                valueType: vType
              });
            }

            jsxLog("  Master properties collected: " + masterMogrtData.length + " props", "INFO");
            for (var pLog = 0; pLog < masterMogrtData.length; pLog++) {
              jsxLog("    [" + pLog + "] " + masterMogrtData[pLog].displayName + " = " + String(masterMogrtData[pLog].value).substring(0, 50), "DEBUG");
            }

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

    // Pass 2: Selection
    var lastProg = 0;
    var isMultiPhrase = false;
    var phraseIndex = 0;
    var masterPhraseIndex = -1;
    for (var t = 0; t < activeSeq.videoTracks.numTracks; t++) {
      var vt = activeSeq.videoTracks[t];
      for (var cIdx = 0; cIdx < vt.clips.numItems; cIdx++) {
        var c = vt.clips[cIdx];
        if (c.isSelected() && c.isMGT()) {
          var mgtComp = c.getMGTComponent();
          var prog = 0;
          var progParam = getSMProperty(mgtComp, "PROGRESSION");
          if (progParam) prog = progParam.getValue();
          if (Math.round(prog) <= Math.round(lastProg) && clipsData.length > 0) {
            isMultiPhrase = true;
            phraseIndex++;
          }
          lastProg = prog;

          // Note: In syncAll, we might need to find the master's phraseIndex.
          // Since syncAllGetData gets the master in Pass 1 via CTI, we need to check if this clip is under CTI.
          if (c.start.seconds <= cti && c.end.seconds > cti) {
            masterPhraseIndex = phraseIndex;
          }

          clipsData.push({ trackNumber: t, clipNumber: cIdx, phraseIndex: phraseIndex });
        }
      }
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

    var clip = activeSeq.videoTracks[trackNum].clips[clipNum];
    var isSamePhrase = (clipData.phraseIndex === data.masterPhraseIndex);
    jsxLog("Injecting -> " + clip.projectItem.name + " | samePhrase=" + isSamePhrase + " (Index: " + clipData.phraseIndex + " vs Master: " + data.masterPhraseIndex + ")", "INFO");

    // Sync MOGRT properties — Match by Index
    var mgt = clip.getMGTComponent();
    for (var k = 0; k < updatedProps.length; k++) {
      var item = updatedProps[k];
      var targetProp = mgt.properties[item.index];
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

        // Color injection check
        var isColor = (item.valueType === 6) || (item.value && item.value.length === 4 && typeof item.value[0] === 'number');
        if (isColor && item.value && item.value.length === 4) {
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
            for (var k = 0; k < mgt.properties.numProperties; k++) {
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

    // Pass 2: All Selected (with phrase-grouping)
    var lastProg = 0;
    var isMultiPhrase = false;
    var phraseIndex = 0;
    var masterPhraseIndex = -1;
    for (var t = 0; t < activeSeq.videoTracks.numTracks; t++) {
      var vt = activeSeq.videoTracks[t];
      for (var cIdx = 0; cIdx < vt.clips.numItems; cIdx++) {
        var c = vt.clips[cIdx];
        if (c.isSelected() && c.isMGT()) {
          var prog = 0;
          var mComp = c.getMGTComponent();
          var pP = mComp.properties.getParamForDisplayName("\u24c9 Word Progression");
          if (pP) prog = pP.getValue();
          if (prog <= lastProg && result.selectedMogrtData.length > 0) {
            isMultiPhrase = true;
            phraseIndex++;
          }
          lastProg = prog;

          if (t === masterTrack && cIdx === masterClipIdx) {
            masterPhraseIndex = phraseIndex;
          }

          result.selectedMogrtData.push({
            trackNumber: t,
            clipNumber: cIdx,
            clipStart: c.start.seconds,
            clipEnd: c.end.seconds,
            phraseIndex: phraseIndex
          });
        }
      }
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
          var targetProp = mgt.properties[item.index];
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
              var masterStyleObj = JSON.parse(item.value);
              var currentObj = JSON.parse(targetProp.getValue());
              masterStyleObj.textEditValue = currentObj.textEditValue;
              masterStyleObj.fontTextRunLength = [currentObj.textEditValue.length];
              targetProp.setValue(JSON.stringify(masterStyleObj), 1);
              continue;
            } catch (e) {
              continue; // Skip if parse fails
            }
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
    for (var i = 0; i < total; i++) {
      data.thisLoopNumber = i;
      var d = data.selectedMogrtData[i];
      jsxLog("  Applying clip " + (i + 1) + "/" + total + " [T" + d.trackNumber + " C" + d.clipNumber + "]", "INFO");
      try {
        syncAll(data);
        jsxLog("  ✔ Clip " + (i + 1) + " synced OK", "INFO");
      } catch (e) {
        jsxLog("  ✘ Clip " + (i + 1) + " SKIPPED — Error: " + e.message + " (T" + d.trackNumber + " C" + d.clipNumber + ")", "WARN");
        skipped++;
      }
    }

    jsxLog("--- sm_sync_batch DONE | synced: " + (total - skipped) + " | skipped: " + skipped, "INFO");
    return { status: "Complete", count: total - skipped, skipped: skipped };
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
    var tracks = activeSeq.videoTracks;

    // 1. Collect all SubMachine MOGRTs from all tracks
    for (var i = 0; i < tracks.numTracks; i++) {
      var clips = tracks[i].clips;
      for (var j = 0; j < clips.numItems; j++) {
        var clip = clips[j];
        if (clip.isMGT()) {
          var mgt;
          try { mgt = clip.getMGTComponent(); } catch (e) { continue; }
          if (!mgt || !mgt.properties) continue;

          var textParam = getSMProperty(mgt, "TEXT");
          if (!textParam) continue;

          var progParam = getSMProperty(mgt, "PROGRESSION");
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
        index: m.index
      });

      currentPhrase.end = m.end;
      lastText = m.text;
    }
    if (currentPhrase) phraseMap.push(currentPhrase);

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

    for (var i = 0; i < props.numProperties; i++) {
      var p = props[i];
      var type = "slider";
      var val = p.getValue();
      var dName = p.displayName || "";

      if (dName.indexOf("Color") !== -1 || p.propertyValueType === 6) {
        type = "color";
        try {
          var c = p.getColorValue();
          // c is [a, r, g, b]
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

    // H3: whitelist safe MOGRT property names — block access to Premiere system properties
    var ALLOWED_PROPS = {
      "Ⓣ Text Input": true, "Ⓣ Word Progression": true,
      "Ⓣ Font Size": true, "Ⓣ Scale": true,
      "Ⓣ Opacity": true, "Ⓣ Color": true,
      "Ⓢ Word Selector": true,
      "Text Input": true, "Color": true, "Opacity": true, "Font Size": true
    };
    if (!ALLOWED_PROPS[params.propName])
      throw new Error("Property name not permitted: " + params.propName);

    var mgt = clip.getMGTComponent();
    var prop = mgt.properties.getParamForDisplayName(params.propName);
    if (prop) {
      var val = params.value;
      // Handle hex colors
      if (typeof val === 'string' && val.indexOf('#') === 0) {
        var r = parseInt(val.substring(1, 3), 16) / 255;
        var g = parseInt(val.substring(3, 5), 16) / 255;
        var b = parseInt(val.substring(5, 7), 16) / 255;
        try {
          prop.setColorValue(1, r, g, b, 1);
        } catch (e) {
          prop.setValue([1, r, g, b], 1);
        }
      } else {
        prop.setValue(val, 1);
      }
      return "Success";
    }
    throw new Error("Property not found: " + params.propName);
  }, "updateMogrtProperty");
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
      throw new Error("Timeline scan returned no SubMachine phrases. Did the clips load?");

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