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
