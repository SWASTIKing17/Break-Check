/**
 * freeXan Caption - MOGRT Management
 * This file handles analyzing sequences for MOGRT placement and creating caption clips.
 *
 * v6 — Generic MOGRT support
 * --------------------------------
 * Two modes:
 *   - "freexan" : MOGRTs with Ⓣ Text Input + Ⓣ Word Progression (one clip per word).
 *   - "generic"    : Any MOGRT with text properties but no Word Progression
 *                    (one clip per phrase, words distributed across N text inputs,
 *                     word-level timings stored in XMP for round-tripping).
 *
 * XMP contract for generic clips:
 *   Namespace : http://ns.bloomxsolutions.com/freexan-caption/1.0/
 *   Field     : freeXan Caption_WordTimings
 *   Value     : { words: [{text,start,end}], textInputCount, textInputNames, distribution }
 */

// =============================================================================
// SECTION 0 — GENERIC MOGRT HELPERS
// All helpers are top-level functions (no closures) so they are visible to all
// callers throughout this file. ES3-only (var, function expressions, no ES6).
// =============================================================================

/**
 * _smFindAllTextParams(properties)
 * Returns array of text property objects (ordered by property index).
 * Uses a 3-pass detection strategy and de-dupes by property index.
 */
function _smFindAllTextParams(properties) {
  var found = [];
  var seenIdx = {}; // property index → true (de-dup)

  if (!properties) return found;

  var numProps;
  try { numProps = properties.length; } catch (eLen) { numProps = 0; }
  if (!numProps || numProps <= 0) return found;

  // ---- Priority name list (Pass 1) ----------------------------------------
  var priorityBase = [
    "Ⓣ Text Input", "Text Input",
    "Source Text", "Caption Text", "Subtitle Text",
    "Text", "Title", "Main Text", "Caption",
    "Subtitle", "Lyrics", "Body Text", "Body"
  ];
  // Build numbered variants e.g. "Text 1", "Source Text 1", "Line 1" ...
  var priorityNames = [];
  for (var pn = 0; pn < priorityBase.length; pn++) {
    priorityNames.push(priorityBase[pn]);
  }
  // Numbered "Line N" series (not in base list but commonly used)
  for (var ln = 1; ln <= 10; ln++) {
    priorityNames.push("Line " + ln);
  }
  // Numbered variants of every base name
  for (var pb = 0; pb < priorityBase.length; pb++) {
    for (var nn = 1; nn <= 10; nn++) {
      priorityNames.push(priorityBase[pb] + " " + nn);
    }
  }

  // We need a way to map back from a name match to its property INDEX so we
  // can sort and de-dup. Build a name → index map by scanning once.
  var nameToIdx = {};
  var indexedProps = []; // [{idx, name, prop}]
  for (var si = 0; si < numProps; si++) {
    var pRef;
    var pName = "";
    try { pRef = properties[si]; } catch (eRef) { pRef = null; }
    if (!pRef) continue;
    try { pName = pRef.displayName || ""; } catch (eDn) { pName = ""; }
    indexedProps.push({ idx: si, name: pName, prop: pRef });
    if (pName && nameToIdx[pName] === undefined) {
      nameToIdx[pName] = si;
    }
  }

  // ---- Pass 1: exact priority-name match ----------------------------------
  for (var ppi = 0; ppi < priorityNames.length; ppi++) {
    var wantName = priorityNames[ppi];
    var idxHit = nameToIdx[wantName];
    if (idxHit !== undefined && !seenIdx[idxHit]) {
      // Re-resolve via getParamForDisplayName for the runtime live object.
      var paramHit = null;
      try { paramHit = properties.getParamForDisplayName(wantName); } catch (e1) {}
      if (!paramHit) {
        // Fallback to the cached prop ref from the index scan.
        for (var fpr = 0; fpr < indexedProps.length; fpr++) {
          if (indexedProps[fpr].idx === idxHit) { paramHit = indexedProps[fpr].prop; break; }
        }
      }
      if (paramHit) {
        found.push({ idx: idxHit, name: wantName, param: paramHit });
        seenIdx[idxHit] = true;
      }
    }
  }

  // ---- Pass 2: scan for JSON-shaped text-input values ---------------------
  for (var p2 = 0; p2 < indexedProps.length; p2++) {
    var rec2 = indexedProps[p2];
    if (seenIdx[rec2.idx]) continue;
    var raw2 = null;
    try { raw2 = rec2.prop.getValue(); } catch (e2) { raw2 = null; }
    if (typeof raw2 === "string" && raw2.length > 0 && raw2.charAt(0) === "{") {
      var obj2 = null;
      try { obj2 = JSON.parse(raw2); } catch (eParse) { obj2 = null; }
      if (obj2 && obj2.textEditValue !== undefined) {
        found.push({ idx: rec2.idx, name: rec2.name, param: rec2.prop });
        seenIdx[rec2.idx] = true;
      }
    }
  }

  // ---- Pass 3: fuzzy keyword fallback (ONLY if Passes 1 & 2 found nothing) -
  // Why gated: aggressive fuzzy matching can falsely pick up properties like
  // "Title Color" (string "Red") or "Caption Style" (string "Bold") and then
  // freeXan Caption would overwrite those non-text fields with phrase words. By
  // only running this pass when we have no legitimate text inputs at all, we
  // safely cover odd-template cases without breaking standard MOGRTs.
  if (found.length === 0) {
    var kw = ["text", "caption", "subtitle", "lyric"]; // "title" / "line" removed: too generic
    // Reject values that look like enum/option pickers, not editable text.
    var enumLike = { "on": 1, "off": 1, "true": 1, "false": 1, "yes": 1, "no": 1,
                     "left": 1, "right": 1, "center": 1, "centre": 1, "top": 1,
                     "bottom": 1, "middle": 1, "auto": 1, "none": 1, "default": 1 };
    for (var p3 = 0; p3 < indexedProps.length; p3++) {
      var rec3 = indexedProps[p3];
      if (seenIdx[rec3.idx]) continue;
      var nLower = (rec3.name || "").toLowerCase();
      var matched = false;
      for (var kk = 0; kk < kw.length; kk++) {
        if (nLower.indexOf(kw[kk]) !== -1) { matched = true; break; }
      }
      if (!matched) continue;

      var raw3 = null;
      try { raw3 = rec3.prop.getValue(); } catch (e3) { raw3 = null; }
      if (typeof raw3 !== "string") continue;
      if (raw3.length > 0 && raw3.charAt(0) === "[") continue;
      if (raw3.length > 0 && raw3.charAt(0) === "{") continue;
      // Skip short enum-like values (likely a dropdown, not a text field)
      var vTrim = raw3.replace(/^\s+|\s+$/g, "").toLowerCase();
      if (vTrim.length > 0 && vTrim.length < 12 && enumLike[vTrim]) continue;
      found.push({ idx: rec3.idx, name: rec3.name, param: rec3.prop });
      seenIdx[rec3.idx] = true;
    }
  }

  // Sort by property index ascending.
  found.sort(function (a, b) { return a.idx - b.idx; });
  return found;
}

/**
 * _smGetText(textParam) — reads text from a MOGRT text parameter.
 * Returns "" on any error.
 */
function _smGetText(textParam) {
  if (!textParam) return "";
  try {
    var raw = textParam.getValue();
    if (typeof raw === "string" && raw.length > 0 && raw.charAt(0) === "{") {
      try {
        var obj = JSON.parse(raw);
        if (obj && obj.textEditValue !== undefined) return obj.textEditValue;
      } catch (eP) {}
    }
    return (raw == null) ? "" : raw.toString();
  } catch (e) { return ""; }
}

/**
 * _smSetText(textParam, text) — writes text to a MOGRT text parameter.
 * If the param holds the freeXan Caption-style JSON shape, merges into it preserving
 * fontTextRuns. Otherwise calls setValue(text, 1) directly.
 */
function _smSetText(textParam, text) {
  if (!textParam) return false;
  if (text === null || text === undefined) text = "";
  try {
    var raw = null;
    try { raw = textParam.getValue(); } catch (eR) { raw = null; }
    if (typeof raw === "string" && raw.length > 0 && raw.charAt(0) === "{") {
      var obj = null;
      try { obj = JSON.parse(raw); } catch (eParse) { obj = null; }
      if (obj && obj.textEditValue !== undefined) {
        obj.textEditValue = text;
        obj.fontTextRunLength = [text.length];
        try {
          textParam.setValue(JSON.stringify(obj), 1);
          return true;
        } catch (eSet1) { return false; }
      }
    }
    try {
      textParam.setValue(text, 1);
      return true;
    } catch (eSet2) {
      return false;
    }
  } catch (eAll) { return false; }
}

/**
 * _smDetectCapabilities(properties) — inspects a MOGRT properties collection
 * and returns the operating mode + text-input metadata.
 */
function _smDetectCapabilities(properties) {
  var result = {
    mogrtMode: "generic",
    textInputCount: 0,
    textInputNames: [],
    hasWordProgression: false
  };
  if (!properties) return result;

  // Detect Word Progression
  var progP = null;
  try { progP = properties.getParamForDisplayName("Ⓣ Word Progression"); } catch (e1) {}
  if (!progP) {
    try { progP = properties.getParamForDisplayName("Word Progression"); } catch (e2) {}
  }
  result.hasWordProgression = (progP != null && progP !== undefined);

  // Detect all text inputs
  var textParams = _smFindAllTextParams(properties);
  result.textInputCount = textParams.length;
  var names = [];
  for (var i = 0; i < textParams.length; i++) {
    names.push(textParams[i].name || ("Input " + (i + 1)));
  }
  result.textInputNames = names;

  // freeXan Caption mode requires Word Progression (Text Input is implicit).
  result.mogrtMode = result.hasWordProgression ? "freexan" : "generic";
  return result;
}

/**
 * _smDistributeWords(wordCount, numInputs) — evenly splits word indices into
 * `numInputs` buckets. First `wordCount%numInputs` buckets get one extra.
 */
function _smDistributeWords(wordCount, numInputs) {
  if (!numInputs || numInputs <= 0) return [];
  var dist = [];
  for (var i = 0; i < numInputs; i++) dist.push([]);
  if (!wordCount || wordCount <= 0) return dist;

  var base = Math.floor(wordCount / numInputs);
  var extra = wordCount % numInputs;
  var widx = 0;
  for (var b = 0; b < numInputs; b++) {
    var take = base + (b < extra ? 1 : 0);
    for (var k = 0; k < take && widx < wordCount; k++) {
      dist[b].push(widx);
      widx++;
    }
  }
  return dist;
}

/**
 * _smReadWordTimings(projectItem) — reads the freeXan Caption_WordTimings XMP field.
 * Returns the parsed object, or null if missing/invalid.
 */
function _smReadWordTimings(projectItem) {
  if (!projectItem) return null;
  try {
    if (ExternalObject.AdobeXMPScript === undefined) {
      ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
    }
    var xmp = new XMPMeta(projectItem.getProjectMetadata());
    var schemaNS = "http://ns.bloomxsolutions.com/freexan-caption/1.0/";
    XMPMeta.registerNamespace(schemaNS, "sm:");
    var val = xmp.getProperty(schemaNS, "freeXan Caption_WordTimings");
    if (!val) return null;
    var parsed = null;
    try { parsed = JSON.parse(val.toString()); } catch (eP) { return null; }
    return parsed;
  } catch (e) {
    jsxLog("_smReadWordTimings exception: " + e.toString(), "WARN");
    return null;
  }
}

/**
 * _smWriteWordTimings(projectItem, data) — serialises and writes to XMP.
 */
function _smWriteWordTimings(projectItem, data) {
  if (!projectItem) return false;
  try {
    var json = JSON.stringify(data || {});
    writeClipMetadata({
      projectItem: projectItem,
      field: "freeXan Caption_WordTimings",
      value: json
    });
    return true;
  } catch (e) {
    jsxLog("_smWriteWordTimings exception: " + e.toString(), "WARN");
    return false;
  }
}

/**
 * _smIsGenericClip(clip) — returns true if the clip has NO Word Progression
 * param under either UTF-prefixed or plain name. Empty / non-MOGRT clips
 * also return true defensively (caller should check isMGT first if needed).
 */
function _smIsGenericClip(clip) {
  if (!clip) return true;
  try {
    var mgt = clip.getMGTComponent();
    if (!mgt || !mgt.properties) return true;
    var p1 = null, p2 = null;
    try { p1 = mgt.properties.getParamForDisplayName("Ⓣ Word Progression"); } catch (e1) {}
    try { p2 = mgt.properties.getParamForDisplayName("Word Progression"); } catch (e2) {}
    return (!p1 && !p2);
  } catch (e) { return true; }
}

// =============================================================================
// SECTION 1 — getData
// =============================================================================
function getData(requestData) {
  jsxLog("getData started for MOGRT: " + requestData.mogrtFilePath);
  try {
    app.enableQE();
    var srtPath = requestData.srtFilePath;
    var mogrtPath = requestData.mogrtFilePath;
    var targetVideoTrack;
    var targetSyncTrack;

    var activeSeq = app.project.activeSequence;
    if (activeSeq) {
      var displayFormat = activeSeq.getSettings().videoDisplayFormat.toString();
      var numTracks = activeSeq.videoTracks.numTracks;

      var searchStarted = false;
      for (var i = 0; i < numTracks; i++) {
        var prevTrackIndex, prevClipCount, currentClipCount;
        if (i === 0) {
          // First track — no previous track to check, skip
          continue;
        } else {
          prevTrackIndex = i - 1;
          prevClipCount = activeSeq.videoTracks[prevTrackIndex].clips.numItems;
          currentClipCount = activeSeq.videoTracks[i].clips.numItems;

          if (prevClipCount === 0 && currentClipCount === 0) {
            searchStarted = true;
            break;
          }
        }
      }

      if (searchStarted) {
        targetVideoTrack = prevTrackIndex;
        targetSyncTrack = i;
        var thirdTrack = i + 1;
        if (thirdTrack >= activeSeq.videoTracks.numTracks) {
          var qeSequence = qe.project.getActiveSequence(0);
          qeSequence.addTracks(1, activeSeq.videoTracks.numTracks, 0);
        }
      } else {
        var qeSequence = qe.project.getActiveSequence(0);
        qeSequence.addTracks(3, numTracks, 0);
        targetVideoTrack = numTracks;
        targetSyncTrack = numTracks + 1;
        var thirdTrack = numTracks + 2;
      }

      var seqDuration = activeSeq.end - activeSeq.zeroPoint;
      var tickConstant = 254016000000;
      var durationSeconds = seqDuration / tickConstant;

      var tempMogrt = activeSeq.importMGT(mogrtPath, durationSeconds * 2, 2, 2);
      var mgtComponent = tempMogrt.getMGTComponent();
      var mgtProperties = mgtComponent.properties;
      var propertyList = [];

      var mogrtProjectItem = tempMogrt.projectItem;
      var nodeId = tempMogrt.projectItem.nodeId;
      var mogrtFPS, seqFPS;

      var xmpNS = "http://ns.adobe.com/premierePrivateProjectMetaData/1.0/";
      var xmpTimebase = "Column.Intrinsic.MediaTimebase";

      if (mogrtProjectItem) {
        if (ExternalObject.AdobeXMPScript === undefined) { ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript"); }
        var mogrtMeta = new XMPMeta(mogrtProjectItem.getProjectMetadata());
        mogrtFPS = mogrtMeta.getProperty(xmpNS, xmpTimebase);

        // --- XMP SHADOW & ASSET ISOLATION INJECTION ---
        if (requestData.mogrtDefinition) {
          writeClipMetadata({
            projectItem: mogrtProjectItem,
            field: "freeXan Caption_Definition",
            value: requestData.mogrtDefinition
          });
          jsxLog("MOGRT Item tagged with XMP Shadow definition.", "SUCCESS");
        }
        if (requestData.assetFolderPath) {
          writeClipMetadata({
            projectItem: mogrtProjectItem,
            field: "freeXan Caption_Asset_Folder",
            value: requestData.assetFolderPath
          });
          jsxLog("MOGRT Item tagged with Asset Folder path.", "SUCCESS");
        }
        if (requestData.assetTag) {
          writeClipMetadata({
            projectItem: mogrtProjectItem,
            field: "freeXan Caption_Asset_Tag",
            value: requestData.assetTag
          });
          jsxLog("MOGRT Item tagged with Asset Tag.", "SUCCESS");
        }
      }

      var seqItem = activeSeq.projectItem;
      if (seqItem) {
        if (ExternalObject.AdobeXMPScript === undefined) { ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript"); }
        var seqMeta = new XMPMeta(seqItem.getProjectMetadata());
        seqFPS = seqMeta.getProperty(xmpNS, xmpTimebase);
      }

      for (var j = 0; j < mgtProperties.length; j++) {
        var propValue;
        try { propValue = mgtProperties[j].getColorValue(); } catch (e) { propValue = mgtProperties[j].getValue(); }
        propertyList.push({
          propertyNumber: j,
          displayName: mgtProperties[j].displayName,
          value: propValue,
        });
      }

      // ------------------------------------------------------------
      // Detect capabilities BEFORE removing the temp clip — once
      // tempMogrt.remove() runs, mgtComponent.properties may dangle.
      // ------------------------------------------------------------
      var caps = { mogrtMode: "freexan", textInputCount: 0, textInputNames: [], hasWordProgression: false };
      try {
        caps = _smDetectCapabilities(mgtProperties);
        jsxLog("MOGRT mode detected: " + caps.mogrtMode +
               " | textInputs=" + caps.textInputCount +
               " | hasWordProgression=" + caps.hasWordProgression, "INFO");
      } catch (eCaps) {
        jsxLog("Capability detection failed: " + eCaps.toString(), "WARN");
      }

      var mogrtName = tempMogrt.name;
      var finalProjectItem = tempMogrt.projectItem;
      tempMogrt.remove(0, 0);

      var result = {
        status: "Valid",
        shortPhrasesCSVPath: srtPath,
        desiredMogrtPath: mogrtPath,
        desiredMogrtName: mogrtName,
        desiredMogrtProjectItem: finalProjectItem,
        desiredMogrtNodeId: nodeId,
        activeSequence: true,
        numVideoTracks: numTracks,
        firstVideoTrack: targetVideoTrack,
        secondVideoTrack: targetSyncTrack,
        thirdVideoTrack: thirdTrack,
        myFrameRateCode: displayFormat,
        sequenceFrameRate: seqFPS ? seqFPS.toString() : "0",
        mogrtFrameRate: mogrtFPS ? mogrtFPS.toString() : "0",
        originalMogrtData: propertyList,
        // NEW: generic-MOGRT capability fields
        mogrtMode: caps.mogrtMode,
        mogrtTextInputCount: caps.textInputCount,
        mogrtTextInputNames: caps.textInputNames,
        mogrtHasWordProgression: caps.hasWordProgression
      };
      return JSON.stringify(result);
    } else {
      return JSON.stringify({ status: "Invalid", message: "No active sequence." });
    }
  } catch (err) {
    return reportError(err, "getData");
  }
}

// =============================================================================
// SECTION 2 — createCaptions
// =============================================================================
function createCaptions(captionData) {
  try {
    var foundItem;
    function findProjectItem(root, name, id) {
      for (var i = 0; i < root.children.numItems; i++) {
        var child = root.children[i];
        if (child.name.toString() === name.toString() && child.nodeId === id) {
          foundItem = child;
          break;
        }
        if (child && child.type === ProjectItemType.BIN) {
          findProjectItem(child, name, id);
        }
      }
    }

    var mogrtName = captionData.mogrtProjectItem.name.replace(".mogrt", "");
    var nodeId = captionData.mogrtNodeId;
    findProjectItem(app.project.rootItem, mogrtName, nodeId);

    var mogrtItem = foundItem;
    var startTime = captionData.wordStart;
    var endTime = captionData.wordEnd;
    var fullPhrase = captionData.phraseText;
    var progression = captionData.progressionValue;
    var videoTrackIndex;

    if (captionData.videoTrack === 1) videoTrackIndex = captionData.firstVideoTrack;
    if (captionData.videoTrack === 2) videoTrackIndex = captionData.secondVideoTrack;
    if (captionData.videoTrack === 3) videoTrackIndex = captionData.thirdVideoTrack;

    var TICK_CONSTANT = 254016000000;
    var activeSeq = app.project.activeSequence;

    if (!activeSeq) return JSON.stringify(captionData);

    var settings = activeSeq.getSettings();
    var format = settings.videoDisplayFormat.toString();
    var fps = 24;

    if (format === "100") fps = 24;
    else if (format === "101") fps = 25;
    else if (format === "102" || format === "103") fps = 29.97;
    else if (format === "104") fps = 30;
    else if (format === "105") fps = 50;
    else if (format === "106" || format === "107") fps = 59.94;
    else if (format === "108") fps = 60;
    else if (format === "110") fps = 23.976;
    else if (format === "113") fps = 48;

    var frameDuration = 1 / fps;
    var targetTrack = activeSeq.videoTracks[videoTrackIndex];
    if (!targetTrack) return JSON.stringify(captionData);

    var palette = [1, 3, 4];

    // -----------------------------------------------------------------
    // GENERIC MODE BRANCH
    // One clip per phrase. Words distributed across N text inputs.
    // Word-by-word timings stored in XMP for round-trip support.
    // -----------------------------------------------------------------
    if (captionData.mogrtMode === "generic") {
      jsxLog("createCaptions: GENERIC mode | phrase='" +
        (fullPhrase || "").substr(0, 40) + "'", "INFO");

      // Place ONE clip from wordStart → wordEnd (full phrase range).
      var genericDuration = (+endTime) - (+startTime);
      if (genericDuration <= 0) genericDuration = frameDuration;
      var genericTicks = genericDuration * TICK_CONSTANT;
      mogrtItem.setOutPoint(genericTicks.toString(), 4);

      targetTrack.overwriteClip(mogrtItem, +startTime);

      // Find the placed clip (last on this track).
      var placedClipG = targetTrack.clips[targetTrack.clips.numItems - 1];
      if (!placedClipG) {
        jsxLog("createCaptions(generic): placedClip not found", "WARN");
        return JSON.stringify(captionData);
      }

      // Force exact phrase-end alignment. overwriteClip can frame-snap; this
      // pins the timeline end to the phrase boundary the caller asked for.
      try {
        var gEndT = new Time();
        gEndT.seconds = +endTime;
        placedClipG.end = gEndT;
      } catch (eGEnd) {
        jsxLog("createCaptions(generic): end-time set failed: " + eGEnd.toString(), "WARN");
      }

      var mgtCompG = null;
      try { mgtCompG = placedClipG.getMGTComponent(); } catch (eMc) { mgtCompG = null; }

      var textParamsG = [];
      if (mgtCompG && mgtCompG.properties) {
        textParamsG = _smFindAllTextParams(mgtCompG.properties);
      }

      var phraseWordTimings = captionData.phraseWordTimings || [];
      var wordCount = phraseWordTimings.length;
      var numInputs = textParamsG.length;

      jsxLog("createCaptions(generic): inputs=" + numInputs + " words=" + wordCount, "INFO");

      // Compute distribution.
      var distribution = _smDistributeWords(wordCount, numInputs);

      // Fill each text input.
      var inputNamesG = [];
      for (var ii = 0; ii < numInputs; ii++) {
        inputNamesG.push(textParamsG[ii].name || ("Input " + (ii + 1)));
        var bucket = distribution[ii] || [];
        var pieces = [];
        for (var bi = 0; bi < bucket.length; bi++) {
          var wIdx = bucket[bi];
          if (phraseWordTimings[wIdx] && phraseWordTimings[wIdx].text != null) {
            pieces.push(phraseWordTimings[wIdx].text);
          }
        }
        var joined = pieces.join(" ");
        try {
          _smSetText(textParamsG[ii].param, joined);
        } catch (eSetG) {
          jsxLog("createCaptions(generic): setText failed on input " + ii + ": " + eSetG.toString(), "WARN");
        }
      }

      // Write XMP word timings.
      try {
        var xmpData = {
          words: phraseWordTimings,
          textInputCount: numInputs,
          textInputNames: inputNamesG,
          distribution: distribution
        };
        _smWriteWordTimings(placedClipG.projectItem, xmpData);
        jsxLog("createCaptions(generic): XMP WordTimings written", "SUCCESS");
      } catch (eXmp) {
        jsxLog("createCaptions(generic): XMP write failed: " + eXmp.toString(), "WARN");
      }

      // Color label (same palette as freeXan Caption mode).
      var cLabelG = palette[(captionData.phraseNumber - 1) % 3];
      try { placedClipG.setColorLabel(cLabelG); } catch (eCol) {}

      var percentG = Math.round((100 / captionData.totalWords) * captionData.wordNumber);
      captionData.progress = percentG.toString() + "%";
      captionData.initialMogrtData = null; // not applicable in generic mode

      return JSON.stringify(captionData);
    }

    // -----------------------------------------------------------------
    // FREEXAN CAPTION MODE (existing logic) — one clip per word.
    // -----------------------------------------------------------------
    var duration;
    if (captionData.isLastWordInPhrase === true) {
      duration = (+endTime) - (+startTime);
    } else {
      duration = (+endTime) - (+startTime) + frameDuration;
    }

    var ticks = duration * TICK_CONSTANT;
    mogrtItem.setOutPoint(ticks.toString(), 4);

    targetTrack.overwriteClip(mogrtItem, +startTime);

    var lastClipIndex = targetTrack.clips.numItems - 1;
    var placedClip = targetTrack.clips[lastClipIndex];
    var mgtComp = placedClip.getMGTComponent();

    var textObj = null;

    // Use new helpers: locate the first text input and set the phrase text.
    var textParamsSm = [];
    if (mgtComp && mgtComp.properties) {
      textParamsSm = _smFindAllTextParams(mgtComp.properties);
    }
    if (textParamsSm.length > 0) {
      var firstParam = textParamsSm[0].param;
      // For initialMogrtData (returned to UI), capture the parsed JSON if present.
      try {
        var rawExisting = firstParam.getValue();
        if (typeof rawExisting === "string" && rawExisting.length > 0 && rawExisting.charAt(0) === "{") {
          try { textObj = JSON.parse(rawExisting); } catch (eJp) { textObj = null; }
        }
      } catch (eRv) {}
      _smSetText(firstParam, fullPhrase);
      // Refresh textObj so caller's initialMogrtData reflects the new value.
      if (textObj && textObj.textEditValue !== undefined) {
        textObj.textEditValue = fullPhrase;
        textObj.fontTextRunLength = [fullPhrase.length];
      }
    }

    // Progression injection — unchanged.
    var progressionParam = null;
    if (mgtComp && mgtComp.properties) {
      try { progressionParam = mgtComp.properties.getParamForDisplayName("Ⓣ Word Progression"); } catch (eP1) {}
      if (!progressionParam) {
        try { progressionParam = mgtComp.properties.getParamForDisplayName("Word Progression"); } catch (eP2) {}
      }
      if (!progressionParam) {
        try { progressionParam = mgtComp.properties.getParamForDisplayName("Ⓣ Word Progression"); } catch (eP3) {}
      }
    }
    if (progressionParam) {
      try { progressionParam.setValue(progression, 1); } catch (eSet) {}
    }

    var cLabel = palette[(captionData.phraseNumber - 1) % 3];
    try { placedClip.setColorLabel(cLabel); } catch (e) { }

    var percent = Math.round((100 / captionData.totalWords) * captionData.wordNumber);
    captionData.progress = percent.toString() + "%";
    captionData.initialMogrtData = textObj;

    return JSON.stringify(captionData);
  } catch (err) {
    return reportError(err, "createCaptions");
  }
}

// =============================================================================
// SECTION 3 — bridgeCaptionGaps (untouched)
// =============================================================================
function bridgeCaptionGaps() {
  return safeCall(function () {
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) return { status: "Error", message: "No active sequence." };

    var allClips = [];
    var tracks = activeSeq.videoTracks;

    for (var i = 0; i < tracks.numTracks; i++) {
      var clips = tracks[i].clips;
      for (var j = 0; j < clips.numItems; j++) {
        var clip = clips[j];
        if (clip.isMGT()) {
          allClips.push(clip);
        }
      }
    }

    allClips.sort(function (a, b) {
      return a.start.seconds - b.start.seconds;
    });

    var bridgedCount = 0;
    for (var idx = 0; idx < allClips.length - 1; idx++) {
      var currentEnd = allClips[idx].end.seconds;
      var nextStart = allClips[idx + 1].start.seconds;
      var gap = nextStart - currentEnd;

      if (gap > 0 && gap <= 2.0) { // Fill gaps <= 2 seconds
        var newEnd = new Time();
        newEnd.seconds = nextStart;
        allClips[idx].end = newEnd;
        bridgedCount++;
      }
    }

    return { status: "Success", bridged: bridgedCount };
  }, "bridgeCaptionGaps");
}

// =============================================================================
// SECTION 4 — replacePhraseWithMogrt (all 4 directions)
//
// params = {
//   mogrtFilePath: "C:/path/to/new.mogrt",
//   mogrtMode:     "freexan" | "generic",   // mode of the NEW template (cleaner than re-detecting)
//   phraseClips:   [ { trackIndex, clipIndex }, ... ]
// }
//
// Detection table (NEW × OLD):
//   freeXan Caption → freeXan Caption : per-clip rebuild (existing behaviour).
//   freeXan Caption → generic    : NEW. XMP-recorded words rebuilt as N freeXan Caption clips.
//   generic    → freeXan Caption : NEW. Collected words placed as 1 generic clip + XMP.
//   generic    → generic    : NEW. Single clip retained, distribution re-computed.
// =============================================================================
function replacePhraseWithMogrt(params) {
  try {
    app.enableQE();
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");

    var mogrtPath = params.mogrtFilePath;
    if (!mogrtPath) throw new Error("No mogrtFilePath provided.");

    var phraseClips = params.phraseClips;
    if (!phraseClips || phraseClips.length === 0) throw new Error("No phrase clips provided.");

    var TICK = 254016000000;
    var newMode = params.mogrtMode || "freexan";

    // --- 4.1 Determine OLD mode by inspecting the first clip ----------------
    var firstRef = phraseClips[0];
    var firstTrack = activeSeq.videoTracks[firstRef.trackIndex];
    if (!firstTrack) throw new Error("Track not found: " + firstRef.trackIndex);
    var firstClip = firstTrack.clips[firstRef.clipIndex];
    if (!firstClip) throw new Error("First phrase clip not found.");

    var oldIsGeneric = _smIsGenericClip(firstClip);
    var oldMode = oldIsGeneric ? "generic" : "freexan";
    jsxLog("replacePhraseWithMogrt: oldMode=" + oldMode + " newMode=" + newMode +
           " clips=" + phraseClips.length, "INFO");

    // --- 4.2 Snapshot data we need from OLD clips ---------------------------
    var snapshots = []; // per-clip data (freeXan Caption-style)
    var genericSnapshot = null; // single-clip data (generic-style)

    if (oldMode === "freexan") {
      // Existing per-clip snapshot logic.
      for (var ci = 0; ci < phraseClips.length; ci++) {
        var ref = phraseClips[ci];
        var track = activeSeq.videoTracks[ref.trackIndex];
        if (!track) throw new Error("Track not found: " + ref.trackIndex);
        var clip = track.clips[ref.clipIndex];
        if (!clip) throw new Error("Clip not found: T" + ref.trackIndex + " C" + ref.clipIndex);
        if (!clip.isMGT()) throw new Error("Clip is not a MOGRT: T" + ref.trackIndex + " C" + ref.clipIndex);

        var startSec = clip.start.seconds;
        var endSec = clip.end.seconds;
        var startTicks = clip.start.ticks;
        var endTicks = clip.end.ticks;
        var wordText = "";
        var progression = 1;
        var isLast = (ci === phraseClips.length - 1);
        var colorLbl = null;
        try { colorLbl = clip.getColorLabel(); } catch (eClr) { colorLbl = null; }

        var mgt = clip.getMGTComponent();
        if (mgt && mgt.properties) {
          var sTextParams = _smFindAllTextParams(mgt.properties);
          if (sTextParams.length > 0) {
            wordText = _smGetText(sTextParams[0].param);
          }
          var progP = null;
          try { progP = mgt.properties.getParamForDisplayName("Ⓣ Word Progression"); } catch (eP1) {}
          if (!progP) {
            try { progP = mgt.properties.getParamForDisplayName("Word Progression"); } catch (eP2) {}
          }
          if (progP) {
            try { progression = progP.getValue(); } catch (e) {}
          }
        }

        snapshots.push({
          trackIndex:  ref.trackIndex,
          startSec:    startSec,
          endSec:      endSec,
          startTicks:  startTicks,
          endTicks:    endTicks,
          wordText:    wordText,
          progression: progression,
          isLast:      isLast,
          colorLabel:  colorLbl
        });
      }
    } else {
      // OLD = generic. Expect a single clip in phraseClips. Read XMP.
      var gClip = firstClip;
      var gTrackIndex = firstRef.trackIndex;
      var gStartSec = gClip.start.seconds;
      var gEndSec = gClip.end.seconds;
      var gStartTicks = gClip.start.ticks;
      var gEndTicks = gClip.end.ticks;
      var gColor = null;
      try { gColor = gClip.getColorLabel(); } catch (eC) { gColor = null; }

      var xmpData = null;
      try { xmpData = _smReadWordTimings(gClip.projectItem); } catch (eX) { xmpData = null; }

      // ─── XMP-missing fallback ─────────────────────────────────────────────
      // If the generic clip has no freeXan Caption_WordTimings XMP (e.g., it was
      // placed manually onto the timeline, or created before XMP-writing was
      // added), synthesize word timings from the clip's current text inputs
      // and duration. This lets generic→freeXan Caption still work, with word
      // boundaries distributed evenly across the phrase span.
      if (!xmpData || !xmpData.words || xmpData.words.length === 0) {
        jsxLog("Replace: generic clip has no XMP — synthesizing word timings from current text", "WARN");

        // Collect current text from every detected text input on the clip.
        var srcMgt = null;
        try { srcMgt = gClip.getMGTComponent(); } catch (eMc) { srcMgt = null; }
        var combinedText = "";
        if (srcMgt && srcMgt.properties) {
          var srcParams = _smFindAllTextParams(srcMgt.properties);
          var parts = [];
          for (var sp = 0; sp < srcParams.length; sp++) {
            var t = "";
            try { t = _smGetText(srcParams[sp].param); } catch (eGt) { t = ""; }
            if (t) parts.push(t);
          }
          combinedText = parts.join(" ");
        }
        // Tokenize into words; collapse whitespace.
        combinedText = combinedText.replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ");
        var rawWords = combinedText.length > 0 ? combinedText.split(" ") : [];
        var wordTokens = [];
        for (var rwi = 0; rwi < rawWords.length; rwi++) {
          if (rawWords[rwi] !== "") wordTokens.push(rawWords[rwi]);
        }

        if (wordTokens.length === 0) {
          throw new Error("Cannot swap: this generic clip has no word-timing XMP AND its text inputs are empty. Type at least one word into the MOGRT's text fields first.");
        }

        // Distribute timings evenly across [gStartSec, gEndSec].
        var totalDur = gEndSec - gStartSec;
        if (totalDur <= 0) totalDur = 0.001;
        var slice = totalDur / wordTokens.length;
        var synthWords = [];
        for (var swi = 0; swi < wordTokens.length; swi++) {
          synthWords.push({
            text:  wordTokens[swi],
            start: gStartSec + (swi * slice),
            end:   gStartSec + ((swi + 1) * slice)
          });
        }
        // Last word ends exactly at gEndSec to avoid float drift.
        synthWords[synthWords.length - 1].end = gEndSec;

        xmpData = {
          words:          synthWords,
          textInputCount: 0,
          textInputNames: [],
          distribution:   []
        };
        jsxLog("Replace: synthesized " + synthWords.length + " word timings from text='" +
               combinedText.substr(0, 60) + (combinedText.length > 60 ? "…" : "") + "'", "INFO");
      }

      genericSnapshot = {
        trackIndex:  gTrackIndex,
        startSec:    gStartSec,
        endSec:      gEndSec,
        startTicks:  gStartTicks,
        endTicks:    gEndTicks,
        colorLabel:  gColor,
        words:       xmpData.words,
        textInputCount:  xmpData.textInputCount || 0,
        textInputNames:  xmpData.textInputNames || [],
        distribution:    xmpData.distribution || []
      };
    }

    // --- 4.3 Import the NEW MOGRT (same pattern as getData) -----------------
    var seqDuration = activeSeq.end - activeSeq.zeroPoint;
    var durationSec = seqDuration / TICK;
    var tempMogrt = activeSeq.importMGT(mogrtPath, durationSec * 2, 2, 2);
    var newProjItem = tempMogrt.projectItem;
    var newNodeId = newProjItem.nodeId;
    var newName = newProjItem.name;

    // Auto-detect NEW MOGRT mode by inspecting its properties BEFORE the temp
    // clip is removed (properties reference becomes dangling after remove).
    // Caller can still override via params.mogrtMode; if absent, we detect here
    // so the UI doesn't have to pre-inspect the file.
    if (!params.mogrtMode) {
      try {
        var detectComp = tempMogrt.getMGTComponent();
        if (detectComp && detectComp.properties) {
          var detectCaps = _smDetectCapabilities(detectComp.properties);
          newMode = detectCaps.mogrtMode;
          jsxLog("replacePhraseWithMogrt: auto-detected newMode=" + newMode +
                 " (textInputs=" + detectCaps.textInputCount + ")", "INFO");
        }
      } catch (eDetect) {
        jsxLog("replacePhraseWithMogrt: mode auto-detect failed, defaulting to freexan-caption: " + eDetect.toString(), "WARN");
      }
    }

    tempMogrt.remove(0, 0);

    var foundItem = null;
    function findItem(root) {
      for (var fi = 0; fi < root.children.numItems; fi++) {
        var ch = root.children[fi];
        if (ch.name.toString() === newName.toString() && ch.nodeId === newNodeId) {
          foundItem = ch; return;
        }
        if (ch && ch.type === ProjectItemType.BIN) findItem(ch);
      }
    }
    findItem(app.project.rootItem);
    if (!foundItem) throw new Error("Could not locate imported MOGRT in project bin.");

    // --- 4.4 Remove OLD clips (reverse order so indices stay stable) --------
    var fpsMap = {"100":24,"101":25,"102":29.97,"103":29.97,"104":30,
                  "105":50,"106":59.94,"107":59.94,"108":60,"110":23.976,"113":48};
    var settings = activeSeq.getSettings();
    var format = settings.videoDisplayFormat.toString();
    var fps = fpsMap[format] || 25;
    var frameLen = 1 / fps;
    var palette = [1, 3, 4];

    if (oldMode === "freexan") {
      var removedSm = 0;
      for (var ri = snapshots.length - 1; ri >= 0; ri--) {
        var snap = snapshots[ri];
        var swapTrack = activeSeq.videoTracks[snap.trackIndex];
        if (!swapTrack) continue;
        var found = false;
        for (var oi = 0; oi < swapTrack.clips.numItems; oi++) {
          if (swapTrack.clips[oi].start.ticks === snap.startTicks) {
            try { swapTrack.clips[oi].remove(false, false); removedSm++; found = true; }
            catch (e) { jsxLog("Replace: SM old-clip remove failed at T" + snap.trackIndex + " ticks=" + snap.startTicks + " — " + e.toString(), "WARN"); }
            break;
          }
        }
        if (!found) jsxLog("Replace: SM old-clip NOT FOUND at T" + snap.trackIndex + " ticks=" + snap.startTicks, "WARN");
      }
      jsxLog("Replace: removed " + removedSm + "/" + snapshots.length + " old SM clips", "INFO");
    } else {
      // OLD generic: remove the single clip identified by genericSnapshot.startTicks.
      var gT = activeSeq.videoTracks[genericSnapshot.trackIndex];
      var gRemoved = false;
      if (gT) {
        for (var goi = 0; goi < gT.clips.numItems; goi++) {
          if (gT.clips[goi].start.ticks === genericSnapshot.startTicks) {
            try { gT.clips[goi].remove(false, false); gRemoved = true; }
            catch (e) { jsxLog("Replace: generic old-clip remove THREW: " + e.toString(), "ERROR"); }
            break;
          }
        }
      }
      if (!gRemoved) {
        jsxLog("Replace: generic old-clip NOT REMOVED at T" + genericSnapshot.trackIndex +
               " ticks=" + genericSnapshot.startTicks + " — placement will likely conflict", "WARN");
      } else {
        jsxLog("Replace: generic old-clip removed at T" + genericSnapshot.trackIndex, "INFO");
      }
    }

    // --- 4.5 Place NEW clip(s) based on the 4 direction matrix --------------
    var replaced = 0;

    // ── DIRECTION A: NEW = freeXan Caption ────────────────────────────────────────
    if (newMode === "freexan") {

      // Build a per-word list to rebuild from.
      // From freeXan Caption snapshots → 1:1.
      // From generic snapshot     → use XMP words[].
      var rebuildList = [];
      if (oldMode === "freexan") {
        for (var rsi = 0; rsi < snapshots.length; rsi++) {
          var ss = snapshots[rsi];
          rebuildList.push({
            startSec:    ss.startSec,
            endSec:      ss.endSec,
            text:        ss.wordText,
            progression: ss.progression,
            trackIndex:  ss.trackIndex,
            colorLabel:  ss.colorLabel,
            isLast:      (rsi === snapshots.length - 1)
          });
        }
      } else {
        // Generic → freeXan Caption. Place words on a staircase of tracks.
        // Reuse track of old clip and alternate ± to mimic createCaptions placement.
        var baseTrack = genericSnapshot.trackIndex;
        // Need TWO tracks for the staircase. Ensure they exist BEFORE indexing.
        try {
          while ((baseTrack + 1) >= activeSeq.videoTracks.numTracks) {
            var qeS = qe.project.getActiveSequence();
            if (qeS) { qeS.addTracks(1, activeSeq.videoTracks.numTracks, 0); }
            else { break; }
          }
        } catch (eX) {
          jsxLog("Gen->Sub: failed to expand tracks: " + eX.toString(), "WARN");
        }
        var trackCycle = [
          baseTrack,
          (baseTrack + 1 < activeSeq.videoTracks.numTracks) ? (baseTrack + 1) : baseTrack
        ];
        jsxLog("Gen->Sub: trackCycle=[" + trackCycle[0] + "," + trackCycle[1] +
               "] words=" + genericSnapshot.words.length, "INFO");

        for (var wi = 0; wi < genericSnapshot.words.length; wi++) {
          var w = genericSnapshot.words[wi];
          rebuildList.push({
            startSec:    +w.start,
            endSec:      +w.end,
            text:        w.text || "",
            progression: wi + 1,
            trackIndex:  trackCycle[wi % 2],
            colorLabel:  genericSnapshot.colorLabel,
            isLast:      (wi === genericSnapshot.words.length - 1)
          });
        }
      }

      jsxLog("Replace: placing " + rebuildList.length + " word-clips (newMode=freeXan Caption, oldMode=" + oldMode + ")", "INFO");

      for (var pi = 0; pi < rebuildList.length; pi++) {
        var s = rebuildList[pi];
        var pTrack = activeSeq.videoTracks[s.trackIndex];
        if (!pTrack) {
          jsxLog("Replace[word " + pi + "]: track " + s.trackIndex + " unavailable — skipped", "WARN");
          continue;
        }
        // Detect track lock — overwriteClip silently fails on locked tracks
        if (typeof _isTrackLocked === "function" && _isTrackLocked(pTrack)) {
          jsxLog("Replace[word " + pi + "]: track " + s.trackIndex + " is LOCKED — skipped", "ERROR");
          continue;
        }

        var dur;
        if (s.isLast) {
          dur = s.endSec - s.startSec;
        } else {
          dur = (s.endSec - s.startSec) + frameLen;
        }
        if (dur <= 0) dur = frameLen;

        var ticks = dur * TICK;
        try { foundItem.setOutPoint(ticks.toString(), 4); } catch (eOp) {
          jsxLog("Replace[word " + pi + "]: setOutPoint failed: " + eOp.toString(), "WARN");
        }

        // Snapshot which ticks already exist on this track BEFORE the insert,
        // so we can locate the new clip by exclusion (overwriteClip can frame-snap).
        var preTicks = {};
        for (var pt = 0; pt < pTrack.clips.numItems; pt++) { preTicks[pTrack.clips[pt].start.ticks] = true; }

        var placeOk = true;
        try {
          pTrack.overwriteClip(foundItem, s.startSec);
        } catch (eOC) {
          jsxLog("Replace[word " + pi + "]: overwriteClip THREW at t=" + s.startSec.toFixed(3) +
                 " track=T" + s.trackIndex + " — " + eOC.toString(), "ERROR");
          placeOk = false;
        }
        if (!placeOk) continue;

        // Find by exclusion first (most reliable), then fall back to closest start.
        var placedClip = null;
        for (var ni = 0; ni < pTrack.clips.numItems; ni++) {
          if (!preTicks[pTrack.clips[ni].start.ticks]) { placedClip = pTrack.clips[ni]; break; }
        }
        if (!placedClip) {
          for (var nj = 0; nj < pTrack.clips.numItems; nj++) {
            if (Math.abs(pTrack.clips[nj].start.seconds - s.startSec) < 0.05) {
              placedClip = pTrack.clips[nj];
            }
          }
        }
        if (!placedClip) {
          jsxLog("Replace[word " + pi + "]: COULD NOT locate placed clip after overwriteClip " +
                 "at t=" + s.startSec.toFixed(3) + " T" + s.trackIndex +
                 " (preCount=" + Object.keys(preTicks).length + " postCount=" + pTrack.clips.numItems + ")", "ERROR");
          continue;
        }

        var mgtComp = null;
        try { mgtComp = placedClip.getMGTComponent(); } catch (eMc) {}
        if (mgtComp && mgtComp.properties) {
          if (params.variationParams) {
            for (var key in params.variationParams) {
              if (params.variationParams.hasOwnProperty(key)) {
                try {
                  var vp = mgtComp.properties.getParamForDisplayName(key);
                  if (vp) {
                    if (typeof _applyMogrtPropValue === "function") {
                      _applyMogrtPropValue(vp, key, params.variationParams[key]);
                    } else {
                      vp.setValue(params.variationParams[key], 1);
                    }
                  }
                } catch (e) {}
              }
            }
          }

          var tParams = _smFindAllTextParams(mgtComp.properties);
          if (tParams.length > 0 && s.text) {
            _smSetText(tParams[0].param, s.text);
          }
          var pParam = null;
          try { pParam = mgtComp.properties.getParamForDisplayName("Ⓣ Word Progression"); } catch (e1) {}
          if (!pParam) {
            try { pParam = mgtComp.properties.getParamForDisplayName("Word Progression"); } catch (e2) {}
          }
          if (pParam) {
            try { pParam.setValue(s.progression, 1); } catch (eSp) {}
          }
        }

        try {
          if (s.colorLabel !== null && s.colorLabel !== undefined) {
            placedClip.setColorLabel(s.colorLabel);
          } else {
            placedClip.setColorLabel(palette[0]);
          }
        } catch (eCl) {}

        replaced++;
      }

    // ── DIRECTION B: NEW = generic ───────────────────────────────────────────
    } else {
      // Collect the phrase as a single clip.
      //   From freeXan Caption snapshots → per-word words[] built from snapshots
      //   From generic snapshot     → reuse XMP words[]
      var phraseStartSec, phraseEndSec, trackIdxForNew, colorLabelForNew, wordsForXmp;

      if (oldMode === "freexan") {
        phraseStartSec = snapshots[0].startSec;
        phraseEndSec   = snapshots[snapshots.length - 1].endSec;
        trackIdxForNew = snapshots[0].trackIndex;
        colorLabelForNew = snapshots[0].colorLabel;
        wordsForXmp = [];
        for (var sni = 0; sni < snapshots.length; sni++) {
          var sn = snapshots[sni];
          wordsForXmp.push({
            text:  sn.wordText || "",
            start: sn.startSec,
            end:   sn.endSec
          });
        }
      } else {
        phraseStartSec = genericSnapshot.startSec;
        phraseEndSec   = genericSnapshot.endSec;
        trackIdxForNew = genericSnapshot.trackIndex;
        colorLabelForNew = genericSnapshot.colorLabel;
        wordsForXmp = genericSnapshot.words;
      }

      var pTrack2 = activeSeq.videoTracks[trackIdxForNew];
      if (!pTrack2) throw new Error("Target track unavailable for generic placement.");

      var dur2 = phraseEndSec - phraseStartSec;
      if (dur2 <= 0) dur2 = frameLen;
      var ticks2 = dur2 * TICK;
      foundItem.setOutPoint(ticks2.toString(), 4);
      pTrack2.overwriteClip(foundItem, phraseStartSec);

      var placedClip2 = null;
      for (var ni2 = 0; ni2 < pTrack2.clips.numItems; ni2++) {
        if (Math.abs(pTrack2.clips[ni2].start.seconds - phraseStartSec) < 0.01) {
          placedClip2 = pTrack2.clips[ni2];
        }
      }
      if (!placedClip2) placedClip2 = pTrack2.clips[pTrack2.clips.numItems - 1];
      if (!placedClip2) throw new Error("Failed to place new generic clip.");

      // Force the placed clip's end to exactly match the phrase end.
      try {
        var rPEndT = new Time();
        rPEndT.seconds = phraseEndSec;
        placedClip2.end = rPEndT;
      } catch (eRP) {
        jsxLog("replacePhraseWithMogrt(gen): end-time set failed: " + eRP.toString(), "WARN");
      }

      var mgtComp2 = null;
      try { mgtComp2 = placedClip2.getMGTComponent(); } catch (eMc2) {}

      var tParams2 = [];
      if (mgtComp2 && mgtComp2.properties) {
        if (params.variationParams) {
          for (var key2 in params.variationParams) {
            if (params.variationParams.hasOwnProperty(key2)) {
              try {
                var vp2 = mgtComp2.properties.getParamForDisplayName(key2);
                if (vp2) {
                  if (typeof _applyMogrtPropValue === "function") {
                    _applyMogrtPropValue(vp2, key2, params.variationParams[key2]);
                  } else {
                    vp2.setValue(params.variationParams[key2], 1);
                  }
                }
              } catch (e) {}
            }
          }
        }
        tParams2 = _smFindAllTextParams(mgtComp2.properties);
      }

      var newWordCount = wordsForXmp.length;
      var newNumInputs = tParams2.length;
      var newDist = _smDistributeWords(newWordCount, newNumInputs);

      var newInputNames = [];
      for (var iii = 0; iii < newNumInputs; iii++) {
        newInputNames.push(tParams2[iii].name || ("Input " + (iii + 1)));
        var bucket2 = newDist[iii] || [];
        var pieces2 = [];
        for (var bi2 = 0; bi2 < bucket2.length; bi2++) {
          var wIdx2 = bucket2[bi2];
          if (wordsForXmp[wIdx2] && wordsForXmp[wIdx2].text != null) {
            pieces2.push(wordsForXmp[wIdx2].text);
          }
        }
        try { _smSetText(tParams2[iii].param, pieces2.join(" ")); } catch (eS2) {}
      }

      // Persist XMP timings on the new clip's projectItem.
      try {
        _smWriteWordTimings(placedClip2.projectItem, {
          words:          wordsForXmp,
          textInputCount: newNumInputs,
          textInputNames: newInputNames,
          distribution:   newDist
        });
      } catch (eXw) {
        jsxLog("replacePhraseWithMogrt(generic): XMP write failed: " + eXw.toString(), "WARN");
      }

      // Preserve color label where possible.
      try {
        if (colorLabelForNew !== null && colorLabelForNew !== undefined) {
          placedClip2.setColorLabel(colorLabelForNew);
        } else {
          placedClip2.setColorLabel(palette[0]);
        }
      } catch (eC2) {}

      replaced++;
    }

    jsxLog("replacePhraseWithMogrt: done. oldMode=" + oldMode +
           " newMode=" + newMode + " replaced=" + replaced, "SUCCESS");

    // ─── Failure detection: if we ATTEMPTED placements but NONE took ─────────
    // (e.g., overwriteClip silently rejected on a locked track) surface the
    // failure to the UI explicitly instead of returning a misleading "Ok".
    if (replaced === 0) {
      var diagMsg = "Replace MOGRT did not place any clips. " +
                    "oldMode=" + oldMode + " newMode=" + newMode + ". " +
                    "Check: target track is unlocked, sequence has space, " +
                    "and (for generic source) the source clip has freeXan Caption_WordTimings XMP.";
      jsxLog("replacePhraseWithMogrt: ZERO PLACED — " + diagMsg, "ERROR");
      return JSON.stringify({ status: "Error", message: diagMsg });
    }

    // IMPORTANT: stringify the success return. ExtendScript serialises non-string
    // returns via toString(), which yields "[object Object]" — breaking the JS
    // caller's `result.replaced` access (silent UI failure).
    return JSON.stringify({
      status:   "Ok",
      replaced: replaced,
      oldMode:  oldMode,
      newMode:  newMode
    });

  } catch (err) {
    return reportError(err, "replacePhraseWithMogrt");
  }
}

// =============================================================================
// SECTION 5 — sm_read_selected_clips_as_srt (untouched)
// =============================================================================
// Strategy A: reads whatever clips are currently selected via seq.getSelection().
//   User must: click C1 track header → Ctrl+A to select all caption clips first.
// Strategy B (auto-fallback): if A yields nothing, scans seq.captionTracks
//   (available in PP 2022+) and reads every clip on every caption track.
// Returns: { ok, data (SRT string), count, source } or { ok:false, error }.
function sm_read_selected_clips_as_srt() {
  try {
    var seq = app.project.activeSequence;
    if (!seq) {
      jsxLog('sm_read_selected_clips_as_srt: no active sequence', 'ERROR');
      return JSON.stringify({ ok: false, error: 'No active sequence.' });
    }

    jsxLog('sm_read_selected_clips_as_srt: START — seq="' + seq.name + '"', 'INFO');

    var TICKS_PER_SEC = 254016000000;
    var entries = [];
    var skipped = 0;
    var source = 'unknown';

    // ── Strategy A: getSelection() ────────────────────────────────────────────
    var selection = null;
    try {
      selection = seq.getSelection();
    } catch(e) {
      jsxLog('sm_read_selected_clips_as_srt: getSelection() threw: ' + e.toString(), 'WARN');
    }

    jsxLog('sm_read_selected_clips_as_srt: getSelection count=' + (selection ? selection.length : 'null/unavailable'), 'INFO');

    if (selection && selection.length > 0) {
      source = 'getSelection';
      // Diagnostic: log available properties on first clip
      var fc = selection[0];
      var fcProps = [];
      try { fcProps.push('name="' + fc.name + '"'); } catch(e) {}
      try { fcProps.push('start.ticks=' + fc.start.ticks); } catch(e) {}
      try { fcProps.push('hasCaptionText=' + (typeof fc.getCaptionText === 'function')); } catch(e) {}
      try { fcProps.push('mediaType=' + fc.mediaType); } catch(e) {}
      jsxLog('sm_read_selected_clips_as_srt: first clip props: ' + fcProps.join(' | '), 'DEBUG');

      for (var i = 0; i < selection.length; i++) {
        var clip = selection[i];
        var txt = '';
        var txtSrc = '';

        // Method 1: getCaptionText() — PP 2022+ caption clips
        try {
          if (typeof clip.getCaptionText === 'function') {
            txt = clip.getCaptionText();
            if (txt) txtSrc = 'getCaptionText';
          }
        } catch(e) {
          jsxLog('sm_read_selected_clips_as_srt: clip[' + i + '] getCaptionText threw: ' + e.toString(), 'WARN');
        }

        // Method 2: clip.name fallback
        if (!txt) {
          try { txt = clip.name || ''; if (txt) txtSrc = 'name'; } catch(e) {}
        }

        txt = (txt || '').replace(/^\s+|\s+$/g, '');

        if (!txt) {
          jsxLog('sm_read_selected_clips_as_srt: clip[' + i + '] skipped — no text', 'DEBUG');
          skipped++;
          continue;
        }

        var s = 0, en = 0;
        try { s  = Number(clip.start.ticks) / TICKS_PER_SEC; } catch(e) {}
        try { en = Number(clip.end.ticks)   / TICKS_PER_SEC; } catch(e) {}

        if (en <= s) {
          jsxLog('sm_read_selected_clips_as_srt: clip[' + i + '] skipped — bad duration (s=' + s.toFixed(3) + ' en=' + en.toFixed(3) + ')', 'WARN');
          skipped++;
          continue;
        }

        jsxLog('sm_read_selected_clips_as_srt: clip[' + i + '] via=' + txtSrc + ' s=' + s.toFixed(3) + ' en=' + en.toFixed(3) + ' txt="' + txt.substr(0, 50) + '"', 'DEBUG');
        entries.push({ start: s, end: en, text: txt });
      }
    }

    // ── Strategy B: scan captionTracks when getSelection gave nothing ─────────
    if (entries.length === 0) {
      jsxLog('sm_read_selected_clips_as_srt: Strategy A yielded nothing — trying seq.captionTracks', 'INFO');
      try {
        var captionTracks = seq.captionTracks;
        var ctAvail = captionTracks ? 'yes numTracks=' + captionTracks.numTracks : 'unavailable';
        jsxLog('sm_read_selected_clips_as_srt: seq.captionTracks: ' + ctAvail, 'DEBUG');

        if (captionTracks && captionTracks.numTracks > 0) {
          source = 'captionTracks';
          for (var t = 0; t < captionTracks.numTracks; t++) {
            var track = captionTracks[t];
            var numClips = (track.clips) ? track.clips.numItems : 0;
            jsxLog('sm_read_selected_clips_as_srt: captionTrack[' + t + '] name="' + (track.name || '?') + '" clips=' + numClips, 'INFO');
            for (var c = 0; c < numClips; c++) {
              var cClip = track.clips[c];
              var txt2 = '';
              try {
                if (typeof cClip.getCaptionText === 'function') txt2 = cClip.getCaptionText();
              } catch(e) {}
              if (!txt2) { try { txt2 = cClip.name || ''; } catch(e) {} }
              txt2 = (txt2 || '').replace(/^\s+|\s+$/g, '');

              if (!txt2) {
                jsxLog('sm_read_selected_clips_as_srt: captionTrack[' + t + '] clip[' + c + '] skipped — no text', 'DEBUG');
                skipped++;
                continue;
              }

              var s2 = 0, en2 = 0;
              try { s2  = Number(cClip.start.ticks) / TICKS_PER_SEC; } catch(e) {}
              try { en2 = Number(cClip.end.ticks)   / TICKS_PER_SEC; } catch(e) {}
              if (en2 <= s2) { skipped++; continue; }

              jsxLog('sm_read_selected_clips_as_srt: captionTrack[' + t + '] clip[' + c + '] s=' + s2.toFixed(3) + ' txt="' + txt2.substr(0, 50) + '"', 'DEBUG');
              entries.push({ start: s2, end: en2, text: txt2 });
            }
          }
        }
      } catch(e2) {
        jsxLog('sm_read_selected_clips_as_srt: captionTracks scan threw: ' + e2.toString(), 'WARN');
      }
    }

    if (entries.length === 0) {
      var errMsg;
      if (source === 'unknown') {
        errMsg = 'No caption data found. Select all C1 caption clips first (click C1 track header → Ctrl+A), then click the debug button.';
      } else {
        errMsg = 'Tried ' + source + ': ' + (selection ? selection.length : 0) + ' clips selected but none contained readable text. Skipped=' + skipped + '. Make sure C1 caption clips are selected, not video/audio clips.';
      }
      jsxLog('sm_read_selected_clips_as_srt: FAILED — ' + errMsg, 'ERROR');
      return JSON.stringify({ ok: false, error: errMsg });
    }

    entries.sort(function(a, b) { return a.start - b.start; });

    var srt = '';
    for (var j = 0; j < entries.length; j++) {
      srt += (j + 1) + '\n';
      srt += _srtTimestamp(entries[j].start) + ' --> ' + _srtTimestamp(entries[j].end) + '\n';
      srt += entries[j].text + '\n\n';
    }

    jsxLog('sm_read_selected_clips_as_srt: SUCCESS — via=' + source + ' entries=' + entries.length + ' skipped=' + skipped, 'SUCCESS');
    return JSON.stringify({ ok: true, data: srt, count: entries.length, source: source });

  } catch(err) {
    jsxLog('sm_read_selected_clips_as_srt: EXCEPTION: ' + err.toString() + ' line=' + err.line, 'ERROR');
    return JSON.stringify({ ok: false, error: 'Exception: ' + err.toString() });
  }
}

function _srtTimestamp(secs) {
  var h  = Math.floor(secs / 3600);
  var m  = Math.floor((secs % 3600) / 60);
  var s  = Math.floor(secs % 60);
  var ms = Math.round((secs - Math.floor(secs)) * 1000);
  function z2(n) { return (n < 10 ? '0' : '') + n; }
  function z3(n) { return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }
  return z2(h) + ':' + z2(m) + ':' + z2(s) + ',' + z3(ms);
}
