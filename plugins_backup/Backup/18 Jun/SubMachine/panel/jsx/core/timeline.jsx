/**
 * freeXan Caption - Timeline Manipulation Tools (v2.8)
 *
 * This file contains the three core phrase-editing tools:
 * 1. sm_tools_split_v28      - Split 1 Entire Phrase (at playhead)
 * 2. sm_tools_join_v28       - Join Multiple Phrases (full phrase merge)
 * 3. sm_tools_split_join_v28 - Split & Join Selection (Word Surgery)
 *
 * All logic is strictly based on the blueprints in docs/guides/.
 */

// ==========================================
// HELPER: Per-timeline-clip identity
// (projectItem.nodeId is shared across all clips spawned from the same MOGRT
//  template, so we key by track index + clip start ticks instead.)
// ==========================================

function _clipKey(trackIdx, clip) { return trackIdx + ":" + clip.start.ticks; }

function _getClipTrackIndex(clip) {
  if (!clip) return -1;
  var activeSeq = app.project.activeSequence;
  if (!activeSeq) return -1;
  for (var i = 1; i < activeSeq.videoTracks.numTracks; i++) {
    var track = activeSeq.videoTracks[i];
    for (var j = 0; j < track.clips.numItems; j++) {
      if (track.clips[j].start.ticks === clip.start.ticks && track.clips[j].end.ticks === clip.end.ticks) return i;
    }
  }
  return -1;
}

// Move a clip to another video track. Returns the new clip on destTrack, or
// null on failure. Uses overwriteClip + remove (the only path available in
// PP's ExtendScript). Caller is expected to (re)apply styles/text/progression
// after the move — the new clip starts with the MOGRT template's defaults.
// sourceTrack must be the track the clip currently lives on.
// Passing it lets us re-find a fresh reference after overwriteClip may have
// invalidated the pre-insert `clip` object, which is the cause of silent
// remove() failures that leave ghost originals on the timeline.
// moveClipToTrack(clip, sourceTrackIdx, destTrackIdx)
// Takes INTEGER track indices — NOT track objects.
// Rationale: overwriteClip fires PP's sequence-structure-changed event which
// invalidates all pre-captured Track COM-object references. ExtendScript COM
// wrappers also do not support === identity comparison (each property access
// creates a new wrapper), so we cannot resolve indices from objects after the
// fact. Accepting indices lets us re-fetch fresh Track references from
// activeSeq.videoTracks[idx] both before and after overwriteClip.
function moveClipToTrack(clip, sourceTrackIdx, destTrackIdx) {
  if (destTrackIdx < 0) {
    jsxLog("moveClipToTrack: destTrackIdx invalid (" + destTrackIdx + ")", "ERROR");
    return null;
  }

  var activeSeq = app.project.activeSequence;
  if (!activeSeq) { jsxLog("moveClipToTrack: no active sequence", "ERROR"); return null; }

  var origStartTicks = clip.start.ticks;
  var origEndTicks   = clip.end.ticks;
  var durTicks       = origEndTicks - origStartTicks;
  var projectItem    = clip.projectItem;

  jsxLog("moveClipToTrack: src=T" + sourceTrackIdx + " dest=T" + destTrackIdx + " ticks=" + origStartTicks, "INFO");

  // Fetch destTrack fresh before overwriteClip
  var destTrack = activeSeq.videoTracks[destTrackIdx];
  if (!destTrack) { jsxLog("moveClipToTrack: destTrack T" + destTrackIdx + " not found", "ERROR"); return null; }

  // CONFLICT CHECK: refuse to overwrite an unrelated clip already occupying
  // the target time range on the dest track. overwriteClip will silently
  // chew into existing content otherwise, leaving the user with a corrupted
  // timeline. Exception: if the existing clip starts at the same tick AND
  // its projectItem is the same template, treat it as a self-replacement.
  for (var cc = 0; cc < destTrack.clips.numItems; cc++) {
    var existing = destTrack.clips[cc];
    var eStart = existing.start.ticks;
    var eEnd   = existing.end.ticks;
    // Numeric-string comparison: ticks are large integers stored as strings,
    // so compare them as numbers (Number() loses precision above 2^53 but is
    // accurate enough for typical PP timelines — < 1 year of footage).
    if (Number(eStart) < Number(origEndTicks) && Number(eEnd) > Number(origStartTicks)) {
      // Allow self-overwrite when ticks match exactly (re-applying same MOGRT)
      if (eStart === origStartTicks.toString() || Number(eStart) === Number(origStartTicks)) {
        continue;
      }
      var conflictMsg = "Cannot place clip at " + (Number(origStartTicks)/254016000000).toFixed(3) +
        "s on V" + (destTrackIdx + 1) + " — track already has clip at " +
        (Number(eStart)/254016000000).toFixed(3) + "s-" + (Number(eEnd)/254016000000).toFixed(3) +
        "s. Move/delete that clip, or unlock another empty video track so the staircase has a free slot.";
      jsxLog("moveClipToTrack: CONFLICT " + conflictMsg, "ERROR");
      throw new Error(conflictMsg);
    }
  }

  // Snapshot existing clip ticks on destTrack BEFORE insert so we can find
  // the new clip by exclusion — overwriteClip may snap the clip to a different
  // tick than origStartTicks, making position-based search unreliable.
  var preInsertTicks = {};
  for (var pi = 0; pi < destTrack.clips.numItems; pi++) {
    preInsertTicks[destTrack.clips[pi].start.ticks] = true;
  }
  var preInsertCount = destTrack.clips.numItems;

  try {
    projectItem.setOutPoint(durTicks.toString(), 4);
  } catch (e) {
    jsxLog("moveClipToTrack: could not set projectItem outPoint: " + e.toString(), "WARN");
  }

  // Construct a fresh Time object from the primitive tick value.
  var insertTime = new Time();
  insertTime.ticks = origStartTicks.toString();

  // Snapshot per-track clip counts BEFORE insertion so we can locate the new
  // clip wherever it lands.
  var preCounts = [];
  for (var pt = 0; pt < activeSeq.videoTracks.numTracks; pt++) {
    preCounts.push(activeSeq.videoTracks[pt].clips.numItems);
  }

  // Use Track.overwriteClip — it does NOT ripple existing clips on the dest
  // track (unlike Sequence.insertClip which corrupts timelines by pushing
  // future phrases later). When called on a MOGRT-compatible track,
  // overwriteClip honors the receiver track per offset semantics.
  try {
    destTrack.overwriteClip(projectItem, insertTime);
  } catch (e) {
    jsxLog("moveClipToTrack: overwriteClip failed: " + e.toString(), "ERROR");
    return null;
  }

  // Diagnostic: compare per-track counts to see where the clip landed
  var diag = "";
  for (var dt = 0; dt < activeSeq.videoTracks.numTracks; dt++) {
    var nowCount = activeSeq.videoTracks[dt].clips.numItems;
    if (nowCount !== preCounts[dt]) {
      diag += " T" + dt + ":" + preCounts[dt] + "->" + nowCount;
    }
  }
  jsxLog("moveClipToTrack: post-overwrite delta:" + (diag || " (none)") + " | requested T" + destTrackIdx, "BRIDGE");

  // Re-fetch BOTH tracks by index — the overwriteClip call above fires PP's
  // internal sequence-structure-changed event, which invalidates every Track
  // COM-object reference captured before the call.
  destTrack = activeSeq.videoTracks[destTrackIdx];
  var sourceTrack = (sourceTrackIdx >= 0) ? activeSeq.videoTracks[sourceTrackIdx] : null;

  // Find the inserted clip: look for a clip whose start.ticks was NOT in the
  // pre-insert snapshot. Falls back to closest-ticks if no new clip found
  // (e.g. overwriteClip replaced an existing clip at the same tick).
  var newClip = null;
  for (var i = 0; i < destTrack.clips.numItems; i++) {
    var c = destTrack.clips[i];
    if (!preInsertTicks[c.start.ticks]) { newClip = c; break; }
  }
  if (!newClip) {
    // Fallback: closest tick within a wide tolerance (5 frames at 24fps)
    var MAX_TOL = 52920000;
    var bestDiff = MAX_TOL + 1;
    for (var i = 0; i < destTrack.clips.numItems; i++) {
      var c = destTrack.clips[i];
      var diff = c.start.ticks - origStartTicks;
      if (diff < 0) diff = -diff;
      if (diff < bestDiff) { bestDiff = diff; newClip = c; }
    }
    if (bestDiff > MAX_TOL) newClip = null;
  }
  if (!newClip) {
    jsxLog("moveClipToTrack: could not locate inserted clip on T" + destTrackIdx + " (preCount=" + preInsertCount + " postCount=" + destTrack.clips.numItems + ")", "ERROR");
    return null;
  }

  try {
    var endTime = new Time();
    endTime.ticks = origEndTicks.toString();
    newClip.end = endTime;
  } catch (e) {}

  // Remove the original from sourceTrack using the fresh post-refresh reference.
  var removed = false;
  if (sourceTrack) {
    for (var si = 0; si < sourceTrack.clips.numItems; si++) {
      if (sourceTrack.clips[si].start.ticks === origStartTicks) {
        try { sourceTrack.clips[si].remove(false, false); removed = true; } catch (e) {
          jsxLog("moveClipToTrack: remove() failed: " + e.toString(), "WARN");
        }
        break;
      }
    }
  }
  if (!removed) {
    try { clip.remove(false, false); } catch (e) {
      jsxLog("moveClipToTrack: remove() fallback failed: " + e.toString(), "WARN");
    }
  }

  return newClip;
}

// ==========================================
// HELPER: Smart Phrase Heuristic
// ==========================================

function getPhraseClips(track, anchorIdxRaw) {
  var anchorIdx = parseInt(anchorIdxRaw, 10);
  var clips = track.clips;
  var anchor = clips[anchorIdx];
  if (!anchor || !anchor.isMGT()) return [];

  var anchorMgt = anchor.getMGTComponent();
  var anchorTextParam = anchorMgt.properties.getParamForDisplayName("Ⓣ Text Input") ||
                        anchorMgt.properties.getParamForDisplayName("Text Input");
  if (!anchorTextParam) return [];

  var _anchorRaw = anchorTextParam.getValue();
  var _anchorParsed; try { _anchorParsed = JSON.parse(_anchorRaw); } catch(e) { _anchorParsed = {}; }
  var rawAnchorText = (_anchorParsed && typeof _anchorParsed.textEditValue === 'string') ? _anchorParsed.textEditValue : "";
  var phraseText = rawAnchorText.replace(/[\r\n]/g, " ").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");

  var anchorProgParam = anchorMgt.properties.getParamForDisplayName("Ⓣ Word Progression") ||
                        anchorMgt.properties.getParamForDisplayName("Word Progression");
  var anchorProg = anchorProgParam ? anchorProgParam.getValue() : 0;

  jsxLog("Heuristic Start | Anchor: '" + phraseText + "' | Prog: " + anchorProg, "INFO");

  var phraseClips = [anchor];
  var expectedProg;

  // Walk backward on the SAME track
  expectedProg = anchorProg - 1;
  for (var i = anchorIdx - 1; i >= 0; i--) {
    var c = clips[i];
    if (!c || !c.isMGT()) break;
    try {
      var mgt = c.getMGTComponent();
      var textParam = mgt.properties.getParamForDisplayName("Ⓣ Text Input") ||
                      mgt.properties.getParamForDisplayName("Text Input");
      var progParam = mgt.properties.getParamForDisplayName("Ⓣ Word Progression") ||
                      mgt.properties.getParamForDisplayName("Word Progression");
      if (!textParam || !progParam) break;
      var _rawB = textParam.getValue();
      var _parsedB; try { _parsedB = JSON.parse(_rawB); } catch(e2) { _parsedB = {}; }
      var rawTxt = (_parsedB && typeof _parsedB.textEditValue === 'string') ? _parsedB.textEditValue : "";
      var txt = rawTxt.replace(/[\r\n]/g, " ").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
      var prog = progParam.getValue();
      if (txt === phraseText && Math.round(prog) === Math.round(expectedProg)) {
        phraseClips.unshift(c);
        expectedProg--;
      } else { break; }
    } catch (e) { break; }
  }

  // Walk forward on the SAME track
  expectedProg = anchorProg + 1;
  for (var j = anchorIdx + 1; j < clips.numItems; j++) {
    var c = clips[j];
    if (!c || !c.isMGT()) break;
    try {
      var mgt = c.getMGTComponent();
      var textParam = mgt.properties.getParamForDisplayName("Ⓣ Text Input") ||
                      mgt.properties.getParamForDisplayName("Text Input");
      var progParam = mgt.properties.getParamForDisplayName("Ⓣ Word Progression") ||
                      mgt.properties.getParamForDisplayName("Word Progression");
      if (!textParam || !progParam) break;
      var _rawF = textParam.getValue();
      var _parsedF; try { _parsedF = JSON.parse(_rawF); } catch(e3) { _parsedF = {}; }
      var rawTxt = (_parsedF && typeof _parsedF.textEditValue === 'string') ? _parsedF.textEditValue : "";
      var txt = rawTxt.replace(/[\r\n]/g, " ").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
      var prog = progParam.getValue();
      if (txt === phraseText && Math.round(prog) === Math.round(expectedProg)) {
        phraseClips.push(c);
        expectedProg++;
      } else { break; }
    } catch (e) { break; }
  }

  jsxLog("Heuristic End | Found " + phraseClips.length + " clips", "INFO");
  return phraseClips;
}
// ==========================================
// HELPER: findNeighborPhrase
// ==========================================

function findNeighborPhrase(anchorClip, direction) {
  if (!anchorClip) return null;
  var activeSeq = app.project.activeSequence;
  if (!activeSeq) return null;

  var targetClip = null;
  var minDiff = 999999;
  var tTime = (direction === "after") ? anchorClip.end.seconds : anchorClip.start.seconds;

  var numTracks = activeSeq.videoTracks.numTracks;
  for (var i = 1; i < numTracks; i++) {
    var track = activeSeq.videoTracks[i];
    for (var j = 0; j < track.clips.numItems; j++) {
      var c = track.clips[j];
      if (!c || !c.isMGT()) continue;

      if (direction === "after") {
        var diff = c.start.seconds - tTime;
        if (diff >= -0.01 && diff < minDiff) {
          minDiff = diff;
          targetClip = c;
        }
      } else {
        var diff = tTime - c.end.seconds;
        if (diff >= -0.01 && diff < minDiff) {
          minDiff = diff;
          targetClip = c;
        }
      }
    }
  }
  if (minDiff > 5) return null;
  return targetClip;
}

// ==========================================
// HELPER: Master Style Management
// ==========================================

function extractMasterStyle(clip) {
  var styleMap = { mogrt: [], motion: {} };
  try {
    var mgt = clip.getMGTComponent();
    var props = mgt.properties;
    var pCount = props.length || props.numItems || 0;
    var inGroup = false;
    var foundInGroup = false;
    for (var k = 0; k < pCount; k++) {
      var p = props[k];
      if (!p) continue;
      var dName = p.displayName;
      if (dName === "Ⓣ Text Input" || dName === "Ⓣ Word Progression") continue;

      var hasGlyph = (dName.indexOf("Ⓢ") !== -1 || dName.indexOf("Ⓑ") !== -1);
      var info = _getSliderOrPointInfo(p);

      if (hasGlyph && !info.isTarget) {
        inGroup = true;
        foundInGroup = false;
      } else if (!hasGlyph && !info.isTarget) {
        inGroup = false;
      }

      var isTarget = false;
      if (inGroup && info.isTarget && !foundInGroup) {
        isTarget = true;
        foundInGroup = true;
      }

      // Skip ONLY the group header and the target index (they are mathematically handled).
      // Everything else (Scale, Checkboxes) inside the group should be copied!
      if ((hasGlyph && !info.isTarget) || isTarget) continue;

      var val = p.getValue();
      var isColor = false;
      try {
        var rawColor = p.getColorValue();
        if (rawColor && rawColor.length === 4 && typeof rawColor[0] === 'number') {
          val = [rawColor[0], rawColor[1], rawColor[2], rawColor[3]]; // [a, r, g, b]
          isColor = true;
        } else if (typeof rawColor === 'string' && rawColor.charAt(0) === '{') {
          var cObj = JSON.parse(rawColor);
          var cr = (cObj.red !== undefined) ? cObj.red : (cObj.Red !== undefined ? cObj.Red : 0);
          var cg = (cObj.green !== undefined) ? cObj.green : (cObj.Green !== undefined ? cObj.Green : 0);
          var cb = (cObj.blue !== undefined) ? cObj.blue : (cObj.Blue !== undefined ? cObj.Blue : 0);
          var ca = (cObj.alpha !== undefined) ? cObj.alpha : (cObj.Alpha !== undefined ? cObj.Alpha : 1);
          val = [ca, cr, cg, cb];
          isColor = true;
        }
      } catch (e) {}
      
      styleMap.mogrt.push({ index: k, value: val, isColor: isColor, displayName: dName, isTarget: isTarget });
    }


    var comps = clip.components;
    for (var mc = 0; mc < comps.length; mc++) {
      if (comps[mc].displayName === "Motion") {
        var mProps = comps[mc].properties;
        for (var pIdx = 0; pIdx < mProps.length; pIdx++) {
          var mp = mProps[pIdx];
          if (mp.displayName === "Position") styleMap.motion.pos = mp.getValue();
          if (mp.displayName === "Scale") styleMap.motion.scale = mp.getValue();
          if (mp.displayName === "Rotation") styleMap.motion.rot = mp.getValue();
        }
        break;
      }
    }
  } catch (e) {
    jsxLog("extractMasterStyle error: " + e.toString(), "ERROR");
  }
  return styleMap;
}

// ==========================================
// HELPER: Persistent "Specific Word" Sliders
// Detects properties matching "Ⓢ ... Word N" (e.g., "Ⓢ Specific Word 1").
// Their VALUES are 1-based word indices that need to be recalculated when
// words move between clips during Split/Join/Surgery.
// ==========================================

// BUG 1 FIX: Do NOT use propertyValueType to detect sliders.
// Type 0 is the API default for uninitialized/group headers — not just sliders.
// NEW: Support Point Controls as well, since authors use them for larger numbers.
function _getSliderOrPointInfo(p) {
  try {
    var v = p.getValue();
    if (typeof v === 'number' && isFinite(v)) {
      return { isTarget: true, isPoint: false, value: v };
    }
    if (typeof v === 'boolean') {
      return { isTarget: true, isPoint: false, value: v ? 1 : 0 };
    }
    if (v instanceof Array && v.length >= 2 && typeof v[0] === 'number') {
      return { isTarget: true, isPoint: true, value: v[0], fullValue: v };
    }
    if (typeof v === 'string') {
      var vTrim = v.trim();
      if (vTrim.charAt(0) === '[' || vTrim.charAt(0) === '{') {
        try {
          var parsedArr = JSON.parse(vTrim);
          if (parsedArr instanceof Array && parsedArr.length >= 2) {
            return { isTarget: true, isPoint: true, value: Number(parsedArr[0]), fullValue: parsedArr };
          }
        } catch(e) {}
      }
      var parsedNum = parseFloat(vTrim);
      if (!isNaN(parsedNum) && vTrim !== "") {
        return { isTarget: true, isPoint: false, value: parsedNum };
      }
    }
    return { isTarget: false };
  } catch(e) { return { isTarget: false }; }
}

// Returns array of { propIndex, displayName, currentValue } in property order.
// Slot 0 = first Ⓢ/Ⓑ slider encountered, slot 1 = second, etc.
function _extractSpecificWordSliderSlots(clip) {
  var slots = [];
  try {
    var mgt = clip.getMGTComponent();
    var props = mgt.properties;
    var pCount = props.length || props.numItems || 0;
    var inGroup = false;
    var foundInGroup = false;
    for (var k = 0; k < pCount; k++) {
      var p = props[k];
      if (!p || !p.displayName) continue;
      
      var hasGlyph = (p.displayName.indexOf("Ⓢ") !== -1 || p.displayName.indexOf("Ⓑ") !== -1);
      var info = _getSliderOrPointInfo(p);

      if (hasGlyph && !info.isTarget) {
        // Entering a new Ⓢ or Ⓑ group header
        inGroup = true;
        foundInGroup = false;
      } else if (!hasGlyph && !info.isTarget) {
        // Hit a non-glyph, non-slider property (new group header) — EXIT the zone
        inGroup = false;
      }

      // Rule: First numeric/point property found INSIDE a glyph group is the Word Index
      var isTarget = false;
      if (inGroup && info.isTarget && !foundInGroup) {
        isTarget = true;
        foundInGroup = true;
      }

      if (isTarget) {
        slots.push({ 
          index: k, 
          displayName: p.displayName, 
          currentValue: info.value,
          isPoint: info.isPoint,
          fullValue: info.fullValue
        });
      }
    }
  } catch (e) {
    jsxLog("_extractSpecificWordSliderSlots error: " + e.toString(), "WARN");
  }
  return slots;
}

// Apply an array of slider values to the slots in order. Missing/extra values are clamped.
// A value of 0 means "off / no specific word selected".
function _setSpecificWordSliderSlots(clip, sliderValues) {
  if (!sliderValues || sliderValues.length === 0) return;
  try {
    var mgt = clip.getMGTComponent();
    var props = mgt.properties;
    var pCount = props.length || props.numItems || 0;
    var slot = 0;
    var inGroup = false;
    var foundInGroup = false;
    for (var k = 0; k < pCount; k++) {
      var p = props[k];
      if (!p || !p.displayName) continue;

      var hasGlyph = (p.displayName.indexOf("Ⓢ") !== -1 || p.displayName.indexOf("Ⓑ") !== -1);
      var info = _getSliderOrPointInfo(p);

      if (hasGlyph && !info.isTarget) {
        inGroup = true;
        foundInGroup = false;
      } else if (!hasGlyph && !info.isTarget) {
        inGroup = false;
      }

      var isTarget = false;
      if (inGroup && info.isTarget && !foundInGroup) {
        isTarget = true;
        foundInGroup = true;
      }

      if (isTarget) {
        var v = 0;
        if (slot < sliderValues.length) {
          v = sliderValues[slot];
          if (v === undefined || v === null) v = 0;
        }

        try { 
          if (info.isPoint) {
            // Keep Y axis intact, update X axis
            var oldFull = p.getValue() || [0, 0];
            p.setValue([v, oldFull[1]], 1);
          } else {
            p.setValue(v, 1); 
          }
        } catch (e) {} // Force UI update

        slot++;
      }
    }
  } catch (e) {
    jsxLog("_setSpecificWordSliderSlots error: " + e.toString(), "WARN");
  }
}

// Pull the raw (1-based) slider values from a phrase's first clip.
function _readPhraseSliderValues(clip) {
  var slots = _extractSpecificWordSliderSlots(clip);
  var values = [];
  for (var i = 0; i < slots.length; i++) values.push(Math.round(slots[i].currentValue || 0));
  return values;
}

function applyMasterStyle(clip, styleMap) {
  try {
    if (styleMap.motion.pos !== undefined) {
      var comps = clip.components;
      for (var i = 0; i < comps.length; i++) {
        if (comps[i].displayName === "Motion") {
          var mp = comps[i].properties;
          for (var j = 0; j < mp.length; j++) {
            if (mp[j].displayName === "Position") mp[j].setValue(styleMap.motion.pos, 0);
            if (mp[j].displayName === "Scale") mp[j].setValue(styleMap.motion.scale, 0);
            if (mp[j].displayName === "Rotation") mp[j].setValue(styleMap.motion.rot, 0);
          }
          break;
        }
      }
    }

    var mgt = clip.getMGTComponent();
    for (var k = 0; k < styleMap.mogrt.length; k++) {
      var item = styleMap.mogrt[k];
      var targetProp = mgt.properties[item.index];
      if (!targetProp) continue;

      // Skip ONLY the group header and the target index.
      // We check if it was flagged during extraction.
      if (item.isTarget || (targetProp.displayName.indexOf("Ⓢ") !== -1 && !_getSliderOrPointInfo(targetProp).isTarget) || (targetProp.displayName.indexOf("Ⓑ") !== -1 && !_getSliderOrPointInfo(targetProp).isTarget)) continue;

      if (item.isColor && (item.value instanceof Array)) {
        try { 
           targetProp.setColorValue(item.value[0], item.value[1], item.value[2], item.value[3], 0);
        } catch(e){
           targetProp.setValue(item.value, 0);
        }
      } else {
        try { targetProp.setValue(item.value, 0); } catch(e){}
      }
    }
  } catch (e) {
    jsxLog("applyMasterStyle error: " + e.toString(), "ERROR");
  }
}

// ==========================================
// TOOL 1: SPLIT 1 ENTIRE PHRASE
// ==========================================

function sm_tools_split_v28(params) {
  return safeCall(function () {
    app.enableQE();
    jsxLog("Executing Split Phrase (Staircase Robust Model) on track " + params.trackIndex + " clip " + params.clipIndex, "INFO");
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");

    // Pre-flight: validate indices before any mutation (C2 / C3 / C4)
    var trackIdx = parseInt(params.trackIndex, 10);
    var clipIdx  = parseInt(params.clipIndex, 10);
    if (isNaN(trackIdx) || trackIdx < 0 || trackIdx >= activeSeq.videoTracks.numTracks)
      throw new Error("Track index out of range: " + params.trackIndex);
    var track = activeSeq.videoTracks[trackIdx];
    if (isNaN(clipIdx) || clipIdx < 0 || clipIdx >= track.clips.numItems)
      throw new Error("Clip index out of range: " + params.clipIndex);
    var anchorClip = track.clips[clipIdx];
    if (!anchorClip) throw new Error("Anchor clip is null at T" + trackIdx + " C" + clipIdx);

    // --- Generic MOGRT branch: clips with no Ⓣ Word Progression param ---
    if (typeof _smIsGenericClip === "function" && _smIsGenericClip(anchorClip)) {
      jsxLog("sm_tools_split_v28: generic clip detected — delegating to sm_generic_split", "INFO");
      return sm_generic_split(params);
    }

    startUndo("Split Phrase");
    try {

    var anchorMgt = anchorClip.getMGTComponent();
    var anchorTextParam = anchorMgt.properties.getParamForDisplayName("\u24c9 Text Input") || 
                        anchorMgt.properties.getParamForDisplayName("Text Input") ||
                        anchorMgt.properties.getParamForDisplayName("Ⓣ Text Input");
    var fullPhraseText = JSON.parse(anchorTextParam.getValue()).textEditValue;

    var phraseClips = getPhraseClips(track, clipIdx);
    if (phraseClips.length < 2) return { status: "Error", message: "Need at least 2 words to split." };

    // Map clips to their start times to avoid reference invalidation
    var clipTimes = [];
    var anchorIdxInPhrase = -1;
    for (var i = 0; i < phraseClips.length; i++) {
      clipTimes.push(phraseClips[i].start.ticks);
      if (phraseClips[i].start.ticks === anchorClip.start.ticks) anchorIdxInPhrase = i;
    }

    if (anchorIdxInPhrase === phraseClips.length - 1) return { status: "Error", message: "Cannot split at the last word." };

    var rawWords = fullPhraseText.split(/\s+/);
    var words = [];
    for (var w = 0; w < rawWords.length; w++) { if (rawWords[w] !== "") words.push(rawWords[w]); }
    var textA = words.slice(0, anchorIdxInPhrase + 1).join(" ");
    var textB = words.slice(anchorIdxInPhrase + 1).join(" ");

    var phraseBeforeA = findNeighborPhrase(phraseClips[0], "before");
    var phraseAfterB = findNeighborPhrase(phraseClips[phraseClips.length - 1], "after");

    var colorA = getSafeAlternatingColor(phraseBeforeA, null);
    var colorBProxy = { projectItem: { getColorLabel: function() { return colorA; } } };
    var colorB = getSafeAlternatingColor(colorBProxy, phraseAfterB);

    var trackIdxBeforeA = phraseBeforeA ? _getClipTrackIndex(phraseBeforeA) : -1;
    var trackIdxAfterB = phraseAfterB ? _getClipTrackIndex(phraseAfterB) : -1;
    var sourceTrackIdx = trackIdx; // use the already-parsed int from pre-flight

    var trackIdxA = getSafeAlternatingTrack(trackIdxBeforeA, sourceTrackIdx);
    var trackIdxB = getSafeAlternatingTrack(trackIdxA, trackIdxAfterB);
    var destTrackA = _ensureTrack(activeSeq, trackIdxA);
    var destTrackB = _ensureTrack(activeSeq, trackIdxB);
    var originalTextObjStr = anchorTextParam.getValue();
    var originalTextObj = {}; try { originalTextObj = JSON.parse(originalTextObjStr); } catch(e) {}
    var masterStyleMap = extractMasterStyle(anchorClip);

    // --- Persistent Word Selectors: capture master sliders from the phrase ---
    // Search the whole phrase for non-zero sliders (most reliable source)
    var masterSliderValues = [];
    for (var f = 0; f < phraseClips.length; f++) {
      var candidateValues = _readPhraseSliderValues(phraseClips[f]);
      var hasValue = false;
      for (var cv = 0; cv < candidateValues.length; cv++) { if (candidateValues[cv] > 0) hasValue = true; }
      if (hasValue || masterSliderValues.length === 0) masterSliderValues = candidateValues;
      if (hasValue) break; // Found our source
    }

    var slidersA = [], slidersB = [];
    var splitBoundary = anchorIdxInPhrase + 1; // # of words in phrase A
    for (var sv = 0; sv < masterSliderValues.length; sv++) {
      var v = Number(masterSliderValues[sv]);
      
      // All extracted sliders are legitimate Word Indices (Ⓢ or Ⓑ)
      // Phrase A: Word 1 to splitBoundary stay; others -> 0
      slidersA.push((v >= 1 && v <= splitBoundary) ? v : 0);
      
      // Phrase B: Words after splitBoundary get shifted back
      var shiftedB = v - splitBoundary;
      slidersB.push(shiftedB >= 1 ? shiftedB : 0);
    }
    jsxLog("Sliders | master=" + masterSliderValues.join(",") + " | A=" + slidersA.join(",") + " | B=" + slidersB.join(","), "INFO");

    // Word index arrays for run-preserving text rebuild
    var wordsA = [], wordsB = [], indicesA = [], indicesB = [];
    for (var ia = 0; ia <= anchorIdxInPhrase; ia++) { wordsA.push(words[ia]); indicesA.push(ia); }
    for (var ib = anchorIdxInPhrase + 1; ib < words.length; ib++) { wordsB.push(words[ib]); indicesB.push(ib); }

    jsxLog("Color Alternation | resultA: " + colorA + " | resultB: " + colorB + " | TrackA: " + trackIdxA + " | TrackB: " + trackIdxB, "INFO");

    var splitSourceTrack = activeSeq.videoTracks[sourceTrackIdx];

    // Pass A: Update Phrase A
    var phraseAFinal = [];
    for (var pA = 0; pA <= anchorIdxInPhrase; pA++) {
      var mcA = _findClipByTime(splitSourceTrack, clipTimes[pA]);
      if (!mcA) continue;

      if (sourceTrackIdx !== trackIdxA) {
        var movedA = moveClipToTrack(mcA, sourceTrackIdx, trackIdxA);
        if (movedA) mcA = movedA;
      }
      applyMasterStyle(mcA, masterStyleMap);

      var mTxtA = mcA.getMGTComponent().properties.getParamForDisplayName("\u24c9 Text Input");
      if (mTxtA) { mTxtA.setValue(JSON.stringify(buildTextObj(originalTextObj, wordsA, indicesA)), 0); }
      var mProgA = mcA.getMGTComponent().properties.getParamForDisplayName("\u24c9 Word Progression");
      if (mProgA) mProgA.setValue(pA + 1, 0);

      _setSpecificWordSliderSlots(mcA, slidersA);
      _setClipColor(mcA, colorA);
      phraseAFinal.push(mcA);
    }
    phraseAFinal.sort(function(a, b) { return a.start.ticks - b.start.ticks; });
    _bridgeGaps(phraseAFinal);

    // Pass B: Update Phrase B
    var phraseBFinal = [];
    for (var pB = anchorIdxInPhrase + 1; pB < phraseClips.length; pB++) {
      var mcB = _findClipByTime(splitSourceTrack, clipTimes[pB]);
      if (!mcB) continue;

      if (sourceTrackIdx !== trackIdxB) {
        var movedB = moveClipToTrack(mcB, sourceTrackIdx, trackIdxB);
        if (movedB) mcB = movedB;
      }
      applyMasterStyle(mcB, masterStyleMap);

      var mTxtB = mcB.getMGTComponent().properties.getParamForDisplayName("\u24c9 Text Input");
      if (mTxtB) { mTxtB.setValue(JSON.stringify(buildTextObj(originalTextObj, wordsB, indicesB)), 0); }
      var mProgB = mcB.getMGTComponent().properties.getParamForDisplayName("\u24c9 Word Progression");
      if (mProgB) mProgB.setValue(pB - anchorIdxInPhrase, 0);

      _setSpecificWordSliderSlots(mcB, slidersB);
      _setClipColor(mcB, colorB);
      phraseBFinal.push(mcB);
    }
    phraseBFinal.sort(function(a, b) { return a.start.ticks - b.start.ticks; });
    _bridgeGaps(phraseBFinal);

      return { status: "Complete" };
    } finally { endUndo("Split Phrase"); }
  }, "sm_tools_split_v28");
}

function _findClipByTime(track, ticks) {
  for (var i = 0; i < track.clips.numItems; i++) {
    if (track.clips[i].start.ticks === ticks) return track.clips[i];
  }
  return null;
}

// Extend each clip's end to exactly meet the following clip's start,
// eliminating any frame-snap gaps that cause flickering between words.
// `clips` must be sorted by start time before calling.
function _bridgeGaps(clips) {
  for (var _bg = 0; _bg < clips.length - 1; _bg++) {
    if (!clips[_bg] || !clips[_bg + 1]) continue;
    if (clips[_bg + 1].start.ticks > clips[_bg].end.ticks) {
      var _t = new Time();
      _t.seconds = clips[_bg + 1].start.seconds;
      try { clips[_bg].end = _t; } catch (e) {}
    }
  }
}


// ==========================================
// TOOL 2: JOIN MULTIPLE PHRASES
// ==========================================

function sm_tools_join_v28(params) {
  return safeCall(function () {
    app.enableQE();
    jsxLog("Executing Join Phrases for " + params.selectedClips.length + " groups", "INFO");
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");

    // Pre-flight: validate every clip before any mutation (C2 / C3 / C4)
    var selectedClipsData = params.selectedClips;
    for (var pf = 0; pf < selectedClipsData.length; pf++) {
      var pfD = selectedClipsData[pf];
      var pfTIdx = parseInt(pfD.trackIndex, 10);
      var pfCIdx = parseInt(pfD.clipIndex, 10);
      if (isNaN(pfTIdx) || pfTIdx < 0 || pfTIdx >= activeSeq.videoTracks.numTracks)
        throw new Error("Track index out of range: " + pfD.trackIndex);
      var pfTrack = activeSeq.videoTracks[pfTIdx];
      if (isNaN(pfCIdx) || pfCIdx < 0 || pfCIdx >= pfTrack.clips.numItems)
        throw new Error("Clip index out of range: " + pfD.clipIndex);
    }

    var qeSeq = qe.project.getActiveSequence();
    var playhead = qeSeq ? qeSeq.CTI.secs : 0;

    // --- Generic-mode detection: check whether all selected clips are generic ---
    if (typeof _smIsGenericClip === "function") {
      var allGeneric = true;
      var anyGeneric = false;
      for (var pfg = 0; pfg < selectedClipsData.length; pfg++) {
        var pfGT = parseInt(selectedClipsData[pfg].trackIndex, 10);
        var pfGC = parseInt(selectedClipsData[pfg].clipIndex, 10);
        var pfGClip = activeSeq.videoTracks[pfGT].clips[pfGC];
        if (_smIsGenericClip(pfGClip)) { anyGeneric = true; } else { allGeneric = false; }
      }
      if (allGeneric && anyGeneric) {
        jsxLog("sm_tools_join_v28: all clips generic — delegating to sm_generic_join", "INFO");
        return sm_generic_join(params);
      }
      if (anyGeneric && !allGeneric) {
        jsxLog("sm_tools_join_v28: mixed-mode selection rejected", "ERROR");
        return { status: "Error", message: "Cannot join: selection mixes freeXan Caption and generic MOGRTs. Convert all to the same template first via Replace Template." };
      }
    }

    startUndo("Join Phrases");
    try {
    // discoveredGroups: [{ trackIdx, clips: [...] }, ...]
    var discoveredGroups = [];
    var seen = {};

    for (var i = 0; i < selectedClipsData.length; i++) {
      var d = selectedClipsData[i];
      var track = activeSeq.videoTracks[d.trackIndex];
      var clip = track.clips[d.clipIndex];
      if (seen[_clipKey(d.trackIndex, clip)]) continue;

      var fullPhrase = getPhraseClips(track, d.clipIndex);
      for (var p = 0; p < fullPhrase.length; p++) seen[_clipKey(d.trackIndex, fullPhrase[p])] = true;
      discoveredGroups.push({ trackIdx: d.trackIndex, clips: fullPhrase });
    }

    discoveredGroups.sort(function (a, b) { return a.clips[0].start.seconds - b.clips[0].start.seconds; });

    if (discoveredGroups.length < 2) {
      return { status: "Error", message: "Select at least 2 different phrases to join. The clips you picked all belong to the same phrase." };
    }

    // Find master clip + its track
    var masterClip = null;
    var masterTrackIdx = -1;
    for (var g = 0; g < discoveredGroups.length; g++) {
      var grp = discoveredGroups[g];
      for (var c = 0; c < grp.clips.length; c++) {
        if (playhead >= (grp.clips[c].start.seconds - 0.01) && playhead <= (grp.clips[c].end.seconds + 0.01)) {
          masterClip = grp.clips[c];
          masterTrackIdx = grp.trackIdx;
          break;
        }
      }
      if (masterClip) break;
    }
    if (!masterClip) {
      return { status: "Error", message: "Place your playhead on the clip whose style you want everything to match, then click Join again." };
    }

    var masterStyleMap = extractMasterStyle(masterClip);
    var masterTextParam = masterClip.getMGTComponent().properties.getParamForDisplayName("\u24c9 Text Input");
    var masterTextObjStr = masterTextParam ? masterTextParam.getValue() : "{}";

    // --- Persistent Word Selectors: collect all phrases' sliders with cumulative offset ---
    var joinedSliderValues = [];
    var sliderCumOffset = 0;
    for (var jg = 0; jg < discoveredGroups.length; jg++) {
      var jgGrp = discoveredGroups[jg];
      var jgSliders = _readPhraseSliderValues(jgGrp.clips[0]);
      for (var jgs = 0; jgs < jgSliders.length; jgs++) {
        var jgv = jgSliders[jgs];
        if (jgv >= 1) joinedSliderValues.push(jgv + sliderCumOffset);
      }
      sliderCumOffset += jgGrp.clips.length;
    }
    jsxLog("Join Sliders | combined=" + joinedSliderValues.join(","), "INFO");

    var phraseTexts = [], phraseTextObjs = [];
    for (var g = 0; g < discoveredGroups.length; g++) {
      var gTxtParam = discoveredGroups[g].clips[0].getMGTComponent().properties.getParamForDisplayName("\u24c9 Text Input");
      var gTxtStr = gTxtParam ? gTxtParam.getValue() : "{}";
      var gTxtObj = {}; try { gTxtObj = JSON.parse(gTxtStr); } catch(e) {}
      phraseTexts.push(gTxtObj.textEditValue || "");
      phraseTextObjs.push(gTxtObj);
    }
    var joinedText    = phraseTexts.join(" ");
    var joinedTextObj = mergeTextObjs(phraseTextObjs, phraseTexts);

    // Staircase: find safe track avoiding outer neighbors
    var firstGrp = discoveredGroups[0];
    var lastGrp = discoveredGroups[discoveredGroups.length - 1];
    var prevPhrase = findNeighborPhrase(firstGrp.clips[0], "before");
    var nextPhrase = findNeighborPhrase(lastGrp.clips[lastGrp.clips.length - 1], "after");

    var trackIdxBefore = prevPhrase ? _getClipTrackIndex(prevPhrase) : -1;
    var trackIdxAfter = nextPhrase ? _getClipTrackIndex(nextPhrase) : -1;
    var safeTrackIdx = getSafeAlternatingTrack(trackIdxBefore, trackIdxAfter);

    var destTrack = _ensureTrack(activeSeq, safeTrackIdx);
    var allClips = [];
    for (var g = 0; g < discoveredGroups.length; g++) {
      var grp = discoveredGroups[g];
      for (var c = 0; c < grp.clips.length; c++) {
        var origClip = grp.clips[c];
        if (grp.trackIdx === safeTrackIdx) {
          allClips.push(origClip);
        } else {
          var moved = moveClipToTrack(origClip, grp.trackIdx, safeTrackIdx);
          if (moved) allClips.push(moved);
          else allClips.push(origClip);
        }
      }
    }

    allClips.sort(function (a, b) { return a.start.seconds - b.start.seconds; });
    _bridgeGaps(allClips);

    for (var n = 0; n < allClips.length; n++) {
      var target = allClips[n];
      var tMgt = target.getMGTComponent();
      applyMasterStyle(target, masterStyleMap);
      var tTextProp = tMgt.properties.getParamForDisplayName("\u24c9 Text Input");
      if (tTextProp) { tTextProp.setValue(JSON.stringify(joinedTextObj), 0); }
      var tIdxProp = tMgt.properties.getParamForDisplayName("\u24c9 Word Progression");
      if (tIdxProp) tIdxProp.setValue(n + 1, 0);
      _setSpecificWordSliderSlots(target, joinedSliderValues);
    }

    var prevPhrase = findNeighborPhrase(allClips[0], "before");
    var nextPhrase = findNeighborPhrase(allClips[allClips.length - 1], "after");
    var joinedColor = getSafeAlternatingColor(prevPhrase, nextPhrase);

    for (var p = 0; p < allClips.length; p++) {
      _setClipColor(allClips[p], joinedColor);
    }

      return { status: "Complete" };
    } finally { endUndo("Join Phrases"); }
  }, "sm_tools_join_v28");
}

// ==========================================
// TOOL 3: SPLIT & JOIN (WORD SURGERY)
// ==========================================

function sm_tools_split_join_v28(params) {
  return safeCall(function () {
    jsxLog("Executing Split & Join Surgery (full/partial model)", "INFO");
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");
    // Pre-flight: validate every selectedClip index before any mutation
    for (var pf = 0; pf < params.selectedClips.length; pf++) {
      var pfD = params.selectedClips[pf];
      var pfTIdx = parseInt(pfD.trackIndex, 10);
      var pfCIdx = parseInt(pfD.clipIndex, 10);
      if (isNaN(pfTIdx) || pfTIdx < 0 || pfTIdx >= activeSeq.videoTracks.numTracks)
        throw new Error("Track index out of range: " + pfD.trackIndex);
      var pfTrack = activeSeq.videoTracks[pfTIdx];
      if (isNaN(pfCIdx) || pfCIdx < 0 || pfCIdx >= pfTrack.clips.numItems)
        throw new Error("Clip index out of range: " + pfD.clipIndex);
    }
    // --- Generic-mode detection (before any mutation/undo) ---
    if (typeof _smIsGenericClip === "function" && params.selectedClips.length >= 2) {
      var detItems = params.selectedClips.slice();
      detItems.sort(function (a, b) {
        var ca = activeSeq.videoTracks[a.trackIndex].clips[a.clipIndex];
        var cb = activeSeq.videoTracks[b.trackIndex].clips[b.clipIndex];
        return ca.start.seconds - cb.start.seconds;
      });
      var firstDet = detItems[0];
      var lastDet  = detItems[detItems.length - 1];
      var firstDetClip = activeSeq.videoTracks[firstDet.trackIndex].clips[firstDet.clipIndex];
      var lastDetClip  = activeSeq.videoTracks[lastDet.trackIndex].clips[lastDet.clipIndex];
      var firstIsGeneric = _smIsGenericClip(firstDetClip);
      var lastIsGeneric  = _smIsGenericClip(lastDetClip);
      if (firstIsGeneric && lastIsGeneric) {
        jsxLog("sm_tools_split_join_v28: both phrases generic — delegating to sm_generic_surgery", "INFO");
        return sm_generic_surgery(params);
      }
      if (firstIsGeneric !== lastIsGeneric) {
        jsxLog("sm_tools_split_join_v28: mixed-mode surgery not yet supported", "ERROR");
        return { status: "Error", message: "Mixed-mode surgery not yet supported. Convert phrases to the same template first." };
      }
      // both freeXan Caption → fall through to existing logic
    }

    startUndo("Split & Join Surgery");
    try {

    // Hydrate selected clips, carrying their (trackIdx, clipIdx) since
    // projectItem.nodeId is shared across MOGRT instances and cannot identify a clip.
    var selectedItems = []; // { clip, trackIdx, clipIdx }
    var selKeys = {};
    for (var i = 0; i < params.selectedClips.length; i++) {
      var d = params.selectedClips[i];
      var clip = activeSeq.videoTracks[d.trackIndex].clips[d.clipIndex];
      selectedItems.push({ clip: clip, trackIdx: d.trackIndex, clipIdx: d.clipIndex });
      selKeys[_clipKey(d.trackIndex, clip)] = true;
    }
    selectedItems.sort(function (a, b) { return a.clip.start.seconds - b.clip.start.seconds; });

    // Identify the two phrases touched by the selection
    var first = selectedItems[0];
    var last = selectedItems[selectedItems.length - 1];
    var aTrack = first.trackIdx, bTrack = last.trackIdx;
    var phraseA = getPhraseClips(activeSeq.videoTracks[aTrack], first.clipIdx);
    var phraseB = getPhraseClips(activeSeq.videoTracks[bTrack], last.clipIdx);

    if (phraseA.length === 0 || phraseB.length === 0) {
      return { status: "Error", message: "Could not identify phrases. Ensure clips are properly grouped." };
    }
    if (aTrack === bTrack && phraseA[0].start.ticks === phraseB[0].start.ticks) {
      return { status: "Error", message: "Select clips from TWO different phrases \u2014 one fully, one partially." };
    }

    function fullyCovered(phrase, trackIdx) {
      for (var i = 0; i < phrase.length; i++) {
        if (!selKeys[_clipKey(trackIdx, phrase[i])]) return false;
      }
      return true;
    }
    var aFull = fullyCovered(phraseA, aTrack);
    var bFull = fullyCovered(phraseB, bTrack);

    if (aFull === bFull) {
      return { status: "Error", message: "Select ONE phrase fully and the OTHER partially. Both are " + (aFull ? "fully" : "partially") + " selected." };
    }

    var targetPhrase = aFull ? phraseA : phraseB; // master (gains words)
    var sourcePhrase = aFull ? phraseB : phraseA; // partial (donates)
    var sourceTrack = aFull ? bTrack : aTrack;
    var targetTrackIdx = aFull ? aTrack : bTrack;

    // Split source into stolen vs remainder by POSITION (handles scattered selection correctly)
    var stolenClips = [];
    var remainderClips = [];
    var stolenWordIndices = [];
    var remainderWordIndices = [];
    for (var r = 0; r < sourcePhrase.length; r++) {
      if (selKeys[_clipKey(sourceTrack, sourcePhrase[r])]) {
        stolenClips.push(sourcePhrase[r]);
        stolenWordIndices.push(r);
      } else {
        remainderClips.push(sourcePhrase[r]);
        remainderWordIndices.push(r);
      }
    }
    if (stolenClips.length === 0) return { status: "Error", message: "No clips from the partial phrase are selected." };
    if (remainderClips.length === 0) return { status: "Error", message: "Partial phrase has no leftover words. Use Join Multiple Phrases." };

    // Read current texts
    var sourceText = JSON.parse(sourcePhrase[0].getMGTComponent().properties.getParamForDisplayName("\u24c9 Text Input").getValue()).textEditValue;
    var targetText = JSON.parse(targetPhrase[0].getMGTComponent().properties.getParamForDisplayName("\u24c9 Text Input").getValue()).textEditValue;
    var sourceWords = sourceText.split(/\s+/);
    var targetWords = targetText.split(/\s+/);

    // Determine direction: does the source phrase sit BEFORE the target phrase on the timeline?
    var before = sourcePhrase[0].start.seconds < targetPhrase[0].start.seconds;

    // Pull stolen and remainder words by INDEX (preserves correct mapping for scattered selection)
    var stolenWords = [];
    for (var sw = 0; sw < stolenWordIndices.length; sw++) {
      if (stolenWordIndices[sw] < sourceWords.length) stolenWords.push(sourceWords[stolenWordIndices[sw]]);
    }
    var remainderWords = [];
    for (var rw = 0; rw < remainderWordIndices.length; rw++) {
      if (remainderWordIndices[rw] < sourceWords.length) remainderWords.push(sourceWords[remainderWordIndices[rw]]);
    }

    var newTargetText = before
      ? stolenWords.concat(targetWords).join(" ")
      : targetWords.concat(stolenWords).join(" ");
    var newRemainderText = remainderWords.join(" ");

    // Build merged phrase: all target clips + stolen clips, chronological order
    var mergedClips = targetPhrase.slice();
    for (var mc = 0; mc < stolenClips.length; mc++) mergedClips.push(stolenClips[mc]);
    mergedClips.sort(function (a, b) { return a.start.seconds - b.start.seconds; });

    jsxLog("S&J | direction=" + (before ? "BEFORE-target" : "AFTER-target") + " | stolen=" + stolenClips.length + " | remainder=" + remainderClips.length + " | merged=" + mergedClips.length, "INFO");

    // --- Track & Color Staircase ---
    var mergedPrev = findNeighborPhrase(mergedClips[0], "before");
    var mergedNext = findNeighborPhrase(mergedClips[mergedClips.length - 1], "after");
    
    if (mergedNext && remainderClips && remainderClips.length > 0) {
      for (var rn = 0; rn < remainderClips.length; rn++) {
        var rClip = remainderClips[rn];
        if (rClip && mergedNext.start && rClip.start && mergedNext.start.ticks === rClip.start.ticks) { 
          mergedNext = null; 
          break; 
        }
      }
    }
    if (mergedPrev && remainderClips && remainderClips.length > 0) {
      for (var rp = 0; rp < remainderClips.length; rp++) {
        var rClip2 = remainderClips[rp];
        if (rClip2 && mergedPrev.start && rClip2.start && mergedPrev.start.ticks === rClip2.start.ticks) { 
          mergedPrev = null; 
          break; 
        }
      }
    }
    var mergedColor = getSafeAlternatingColor(mergedPrev, mergedNext);
    var trackIdxMergedPrev = mergedPrev ? _getClipTrackIndex(mergedPrev) : -1;
    var trackIdxMergedNext = mergedNext ? _getClipTrackIndex(mergedNext) : -1;
    var safeTrackMerged = getSafeAlternatingTrack(trackIdxMergedPrev, trackIdxMergedNext);
    var destTrackMerged = _ensureTrack(activeSeq, safeTrackMerged);

    var remainderOuter = before
      ? findNeighborPhrase(remainderClips[remainderClips.length - 1], "after")
      : findNeighborPhrase(remainderClips[0], "before");
    var mergedColorProxy = { projectItem: { getColorLabel: function () { return mergedColor; } } };
    var remainderColor = getSafeAlternatingColor(mergedColorProxy, remainderOuter);

    var trackIdxRemainderOuter = remainderOuter ? _getClipTrackIndex(remainderOuter) : -1;
    var safeTrackRemainder = getSafeAlternatingTrack(safeTrackMerged, trackIdxRemainderOuter);
    var destTrackRemainder = _ensureTrack(activeSeq, safeTrackRemainder);

    // --- Persistent Word Selectors: compute merged + remainder slider values ---
    var sourceSliderValues = _readPhraseSliderValues(sourcePhrase[0]);
    var targetSliderValues = _readPhraseSliderValues(targetPhrase[0]);
    var mergedSliderValues = [];
    var remainderSliderValues = [];

    // Target's surviving sliders: shift if stolen words land BEFORE target
    var targetShift = before ? stolenClips.length : 0;
    for (var tsv = 0; tsv < targetSliderValues.length; tsv++) {
      var tv = targetSliderValues[tsv];
      if (tv >= 1) mergedSliderValues.push(tv + targetShift);
    }
    // Source's sliders: split into "points to stolen word" (→ merged) and "points to remainder" (→ remainder)
    for (var ssv = 0; ssv < sourceSliderValues.length; ssv++) {
      var sv = sourceSliderValues[ssv];
      if (sv < 1) continue;
      var origWordIdx = sv - 1; // 0-based original position in source phrase
      // Check if this points to a stolen word
      var stolenPos = -1;
      for (var sti = 0; sti < stolenWordIndices.length; sti++) {
        if (stolenWordIndices[sti] === origWordIdx) { stolenPos = sti; break; }
      }
      if (stolenPos >= 0) {
        // Stolen word lands at: stolenPos+1 (if before) OR targetWords.length+stolenPos+1 (if after)
        var mergedPos = before ? stolenPos + 1 : targetWords.length + stolenPos + 1;
        mergedSliderValues.push(mergedPos);
        continue;
      }
      // Otherwise check remainder
      var remPos = -1;
      for (var rmi = 0; rmi < remainderWordIndices.length; rmi++) {
        if (remainderWordIndices[rmi] === origWordIdx) { remPos = rmi; break; }
      }
      if (remPos >= 0) remainderSliderValues.push(remPos + 1);
    }
    jsxLog("Surgery Sliders | merged=" + mergedSliderValues.join(",") + " | remainder=" + remainderSliderValues.join(","), "INFO");

    // Style maps
    var remainderStyleMap = extractMasterStyle(remainderClips[0]);
    var remainderTextParam = remainderClips[0].getMGTComponent().properties.getParamForDisplayName("\u24c9 Text Input");
    var remainderTextObjStr = remainderTextParam ? remainderTextParam.getValue() : "{}";

    var masterStyleMap = extractMasterStyle(targetPhrase[0]);
    var masterTextParam = targetPhrase[0].getMGTComponent().properties.getParamForDisplayName("\u24c9 Text Input");
    var masterTextObjStr = masterTextParam ? masterTextParam.getValue() : "{}";

    // Build run-preserving text objects for both output phrases
    var _srcTObj = {}; try { _srcTObj = JSON.parse(remainderTextObjStr); } catch(e) {}
    var _tgtTObj = {}; try { _tgtTObj = JSON.parse(masterTextObjStr);    } catch(e) {}
    var _tgtIdxs = []; for (var _ti = 0; _ti < targetWords.length; _ti++) _tgtIdxs.push(_ti);
    var _stolenPart = buildTextObj(_srcTObj, stolenWords, stolenWordIndices);
    var _targetPart = buildTextObj(_tgtTObj, targetWords, _tgtIdxs);
    var mergedTextObj = before
      ? mergeTextObjs([_stolenPart, _targetPart], [stolenWords.join(" "), targetWords.join(" ")])
      : mergeTextObjs([_targetPart, _stolenPart], [targetWords.join(" "), stolenWords.join(" ")]);
    var remainderTextObjBuilt = buildTextObj(_srcTObj, remainderWords, remainderWordIndices);

    // --- Pass A: Move REMAINDER clips to their destination track first ---
    for (var rc = 0; rc < remainderClips.length; rc++) {
      var remTrkIdx = _getClipTrackIndex(remainderClips[rc]);
      if (remTrkIdx !== safeTrackRemainder && remTrkIdx >= 0) {
        var movedR = moveClipToTrack(remainderClips[rc], remTrkIdx, safeTrackRemainder);
        if (movedR) remainderClips[rc] = movedR;
      }
    }

    // --- Pass B: Move MERGED clips to their destination track first ---
    for (var n = 0; n < mergedClips.length; n++) {
      var mrgTrkIdx = _getClipTrackIndex(mergedClips[n]);
      if (mrgTrkIdx !== safeTrackMerged && mrgTrkIdx >= 0) {
        var movedM = moveClipToTrack(mergedClips[n], mrgTrkIdx, safeTrackMerged);
        if (movedM) mergedClips[n] = movedM;
      }
    }

    remainderClips.sort(function(a, b) { return a.start.ticks - b.start.ticks; });
    _bridgeGaps(remainderClips);
    mergedClips.sort(function(a, b) { return a.start.ticks - b.start.ticks; });
    _bridgeGaps(mergedClips);

    // --- Pass A: Apply properties to REMAINDER phrase ---
    for (var rc = 0; rc < remainderClips.length; rc++) {
      var rMgt = remainderClips[rc].getMGTComponent();
      if (!rMgt) continue;
      applyMasterStyle(remainderClips[rc], remainderStyleMap);
      var rTxt = rMgt.properties.getParamForDisplayName("\u24c9 Text Input");
      if (rTxt) { rTxt.setValue(JSON.stringify(remainderTextObjBuilt), 0); }
      var rProg = rMgt.properties.getParamForDisplayName("\u24c9 Word Progression");
      if (rProg) rProg.setValue(rc + 1, 0);
      _setSpecificWordSliderSlots(remainderClips[rc], remainderSliderValues);
      _setClipColor(remainderClips[rc], remainderColor);
    }

    // --- Pass B: Apply properties to MERGED phrase ---
    for (var n = 0; n < mergedClips.length; n++) {
      var mMgt = mergedClips[n].getMGTComponent();
      if (!mMgt) continue;
      applyMasterStyle(mergedClips[n], masterStyleMap);
      var mTxt = mMgt.properties.getParamForDisplayName("\u24c9 Text Input");
      if (mTxt) { mTxt.setValue(JSON.stringify(mergedTextObj), 0); }
      var mProg = mMgt.properties.getParamForDisplayName("\u24c9 Word Progression");
      if (mProg) mProg.setValue(n + 1, 0);
      _setSpecificWordSliderSlots(mergedClips[n], mergedSliderValues);
      _setClipColor(mergedClips[n], mergedColor);
    }

      return { status: "Complete" };
    } finally { endUndo("Split & Join Surgery"); }
  }, "sm_tools_split_join_v28");
}

// ==========================================
// TOOL 4: REMOVE WORD (Surgical deletion)
// ==========================================

function sm_tools_remove_word_v28(params) {
  return safeCall(function() {
    jsxLog("Executing Remove Word on track " + params.trackIndex + " clip " + params.clipIndex, "INFO");
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");
    var tIdx = parseInt(params.trackIndex, 10);
    var cIdx = parseInt(params.clipIndex, 10);
    if (isNaN(tIdx) || tIdx < 0 || tIdx >= activeSeq.videoTracks.numTracks)
      throw new Error("Track index out of range: " + params.trackIndex);
    var track = activeSeq.videoTracks[tIdx];
    if (isNaN(cIdx) || cIdx < 0 || cIdx >= track.clips.numItems)
      throw new Error("Clip index out of range: " + params.clipIndex);
    var targetClip = track.clips[cIdx];

    // --- Generic MOGRT branch ---
    if (typeof _smIsGenericClip === "function" && _smIsGenericClip(targetClip)) {
      jsxLog("sm_tools_remove_word_v28: generic clip — delegating to sm_generic_remove_word", "INFO");
      return sm_generic_remove_word(params);
    }

    // 1. Discover full phrase
    var phraseClips = getPhraseClips(track, params.clipIndex);
    if (phraseClips.length < 2)
      return { status: "Error", message: "Cannot remove the only word in a phrase." };

    // 2. Find position of target clip within phrase (0-based)
    var targetPos = -1;
    for (var i = 0; i < phraseClips.length; i++) {
      if (phraseClips[i].start.ticks === targetClip.start.ticks) { targetPos = i; break; }
    }
    if (targetPos === -1) return { status: "Error", message: "Could not locate clip in phrase." };

    // 3. Build new text (remove word at targetPos)
    var _rmMgt = phraseClips[0].getMGTComponent();
    var textParam = _rmMgt.properties.getParamForDisplayName("Ⓣ Text Input") ||
                    _rmMgt.properties.getParamForDisplayName("Ⓣ Text Input") ||
                    _rmMgt.properties.getParamForDisplayName("Text Input");
    if (!textParam) return { status: "Error", message: "Text Input property not found on phrase clip." };
    var textObjStr = textParam.getValue();
    var textObj; try { textObj = JSON.parse(textObjStr); } catch(e) { textObj = {}; }
    var words = (textObj && typeof textObj.textEditValue === 'string')
      ? textObj.textEditValue.split(/\s+/).filter(function(w) { return w !== ""; })
      : [];
    if (words.length < 2) return { status: "Error", message: "Phrase has fewer than 2 words." };

    words.splice(targetPos, 1);
    var newText = words.join(" ");

    startUndo("Remove Word");
    try {
    // 4. Gap-fill: extend preceding clip (or following if removing first word)
    if (targetPos > 0) {
      // Extend the previous clip's end to cover the gap
      var newEnd = new Time(); newEnd.seconds = targetClip.end.seconds;
      phraseClips[targetPos - 1].end = newEnd;
    } else {
      // Removing first word: extend the next clip backward
      var newStart = new Time(); newStart.seconds = targetClip.start.seconds;
      phraseClips[1].start = newStart;
    }

    // 5. Read master style + sliders before modifying anything
    var masterStyleMap = extractMasterStyle(phraseClips[0]);
    var oldSliders = _readPhraseSliderValues(phraseClips[0]);

    // 6. Delete the target clip
    try { targetClip.remove(false, false); } catch(e) { jsxLog("remove failed: " + e.toString(), "ERROR"); }

    // 7. Re-collect remaining phrase clips by their ticks
    var remainingTicks = [];
    for (var ri = 0; ri < phraseClips.length; ri++) {
      if (ri !== targetPos) remainingTicks.push(phraseClips[ri].start.ticks);
    }

    // 8. Update all remaining clips with new text — scan ALL tracks (staircase may have spread clips)
    var newIndices = [];
    for (var ni = 0; ni < words.length; ni++) newIndices.push(ni);
    var newTextObj = buildTextObj(textObj, words, newIndices);

    var slot = 0;
    for (var kt = 0; kt < activeSeq.videoTracks.numTracks; kt++) {
      var scanTrack = activeSeq.videoTracks[kt];
      for (var k = 0; k < scanTrack.clips.numItems; k++) {
        var c = scanTrack.clips[k];
        if (!c || !c.isMGT()) continue;
        var found = false;
        for (var rt = 0; rt < remainingTicks.length; rt++) {
          if (c.start.ticks === remainingTicks[rt]) { found = true; break; }
        }
        if (!found) continue;
        var cMgt = c.getMGTComponent();
        var cTxt = cMgt.properties.getParamForDisplayName("Ⓣ Text Input") ||
                   cMgt.properties.getParamForDisplayName("Text Input");
        if (cTxt) cTxt.setValue(JSON.stringify(newTextObj), 0);
        var cProg = cMgt.properties.getParamForDisplayName("Ⓣ Word Progression") ||
                    cMgt.properties.getParamForDisplayName("Word Progression");
        if (cProg) cProg.setValue(slot + 1, 0);
        slot++;
      }
    }

    // 9. Remap Ⓢ sliders: pointing to removed word → 0; pointing after → decrement
    var newSliders = [];
    for (var s = 0; s < oldSliders.length; s++) {
      var sv = oldSliders[s];
      if (sv === targetPos + 1) newSliders.push(0);          // was removed word → off
      else if (sv > targetPos + 1) newSliders.push(sv - 1);  // after removed → shift left
      else newSliders.push(sv);                               // before removed → unchanged
    }
    // Apply to all remaining clips — scan ALL tracks
    for (var kt2 = 0; kt2 < activeSeq.videoTracks.numTracks; kt2++) {
      var scanTrack2 = activeSeq.videoTracks[kt2];
      for (var k2 = 0; k2 < scanTrack2.clips.numItems; k2++) {
        var c2 = scanTrack2.clips[k2];
        if (!c2 || !c2.isMGT()) continue;
        var found2 = false;
        for (var rt2 = 0; rt2 < remainingTicks.length; rt2++) {
          if (c2.start.ticks === remainingTicks[rt2]) { found2 = true; break; }
        }
        if (found2) _setSpecificWordSliderSlots(c2, newSliders);
      }
    }

    jsxLog("Remove Word DONE | removed pos=" + targetPos + " | new text='" + newText + "'", "INFO");
      return { status: "Complete" };
    } finally { endUndo("Remove Word"); }
  }, "sm_tools_remove_word_v28");
}

// ==========================================
// TOOL 5: ADD WORD (Surgical insertion)
// ==========================================

function sm_tools_add_word_v28(params) {
  return safeCall(function() {
    var newWord = params.newWord ? params.newWord.replace(/^\s+|\s+$/g, "") : "";
    if (!newWord) return { status: "Error", message: "New word cannot be empty." };

    app.enableQE();
    var qeSeq = qe.project.getActiveSequence();
    if (!qeSeq) return { status: "Error", message: "QE Sequence unavailable." };
    var playhead = qeSeq.CTI.secs;

    jsxLog("Executing Add Word on track " + params.trackIndex + " clip " + params.clipIndex + " | playhead=" + playhead.toFixed(3), "INFO");

    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");
    var tIdx = parseInt(params.trackIndex, 10);
    var cIdx = parseInt(params.clipIndex, 10);
    if (isNaN(tIdx) || tIdx < 0 || tIdx >= activeSeq.videoTracks.numTracks)
      throw new Error("Track index out of range: " + params.trackIndex);
    var track = activeSeq.videoTracks[tIdx];
    if (isNaN(cIdx) || cIdx < 0 || cIdx >= track.clips.numItems)
      throw new Error("Clip index out of range: " + params.clipIndex);
    var anchorClip = track.clips[cIdx];
    var anchorStart = anchorClip.start.seconds;
    var anchorEnd   = anchorClip.end.seconds;

    // --- Generic MOGRT branch ---
    if (typeof _smIsGenericClip === "function" && _smIsGenericClip(anchorClip)) {
      jsxLog("sm_tools_add_word_v28: generic clip — delegating to sm_generic_add_word", "INFO");
      return sm_generic_add_word(params);
    }

    if (playhead <= anchorStart || playhead >= anchorEnd)
      return { status: "Error", message: "Place the playhead inside the clip, not at its edges." };

    // 1. Discover phrase + anchor position within it
    var phraseClips = getPhraseClips(track, params.clipIndex);
    var anchorPos = -1;
    for (var i = 0; i < phraseClips.length; i++) {
      if (phraseClips[i].start.ticks === anchorClip.start.ticks) { anchorPos = i; break; }
    }
    if (anchorPos === -1) return { status: "Error", message: "Anchor clip not found in phrase." };

    // 2. Capture everything before the original clip is touched
    var anchorMgt = anchorClip.getMGTComponent();
    var textParam = anchorMgt.properties.getParamForDisplayName("\u24c9 Text Input") || 
                    anchorMgt.properties.getParamForDisplayName("Text Input") ||
                    anchorMgt.properties.getParamForDisplayName("Ⓣ Text Input");
    var textObj   = JSON.parse(textParam.getValue());
    var words     = textObj.textEditValue.split(/\s+/).filter(function(w) { return w !== ""; });
    var masterStyleMap = extractMasterStyle(anchorClip);
    var oldSliders     = _readPhraseSliderValues(anchorClip);
    var anchorColor    = _getClipColor(anchorClip);
    var projectItem    = anchorClip.projectItem;

    // 3. Build new phrase text: insert newWord after anchorPos (0-based)
    var newWords = words.slice();
    newWords.splice(anchorPos + 1, 0, newWord);
    var newIndices = []; for (var ni = 0; ni < newWords.length; ni++) newIndices.push(ni);
    var newTextObj = buildTextObj(textObj, newWords, newIndices);

    // 4. Save start ticks of all other phrase clips before removing anchor
    var otherPhraseTicks = [];
    for (var op = 0; op < phraseClips.length; op++) {
      if (phraseClips[op].start.ticks !== anchorClip.start.ticks)
        otherPhraseTicks.push(phraseClips[op].start.ticks);
    }

    startUndo("Add Word");
    try {
    // 5. Delete original anchor clip to free the time slot
    try { anchorClip.remove(false, false); } catch(e) {
      return { status: "Error", message: "Could not remove anchor clip: " + e.toString() };
    }

    // 6. Place Fresh Clip A: anchorStart → playhead (original word)
    // Pass a plain number (seconds) — synthesizing `new Time()` and setting
    // `.seconds` leaves `.ticks` uninitialized and overwriteClip silently fails.
    try { track.overwriteClip(projectItem, anchorStart); } catch(e) {
      return { status: "Error", message: "overwriteClip (clip A) failed: " + e.toString() };
    }
    var clipA = null;
    for (var ca = 0; ca < track.clips.numItems; ca++) {
      if (Math.abs(track.clips[ca].start.seconds - anchorStart) < 0.01) {
        clipA = track.clips[ca]; // don't break — keep latest match in case of overlap
      }
    }
    if (!clipA) return { status: "Error", message: "Could not locate clip A after insert." };
    try { var _mgtCheckA = clipA.getMGTComponent(); if (!_mgtCheckA) throw new Error(); } catch(e) {
      return { status: "Error", message: "Clip A inserted but has no MOGRT component — template may have been garbage-collected. Undo and retry." };
    }
    try { var endA = new Time(); endA.seconds = playhead; clipA.end = endA; } catch(e) {}
    var clipATicks = clipA.start.ticks;

    // 7. Place Fresh Clip B: playhead → anchorEnd (new word)
    try { track.overwriteClip(projectItem, playhead); } catch(e) {
      return { status: "Error", message: "overwriteClip (clip B) failed: " + e.toString() };
    }
    var clipB = null;
    for (var cb = 0; cb < track.clips.numItems; cb++) {
      if (Math.abs(track.clips[cb].start.seconds - playhead) < 0.01) {
        clipB = track.clips[cb];
      }
    }
    if (!clipB) return { status: "Error", message: "Could not locate clip B after insert." };
    try { var _mgtCheckB = clipB.getMGTComponent(); if (!_mgtCheckB) throw new Error(); } catch(e) {
      return { status: "Error", message: "Clip B inserted but has no MOGRT component — template may have been garbage-collected. Undo and retry." };
    }
    try { var endB = new Time(); endB.seconds = anchorEnd; clipB.end = endB; } catch(e) {}
    var clipBTicks = clipB.start.ticks;

    // 8. Collect ALL phrase clips (others + A + B) sorted chronologically.
    // Use the ACTUAL ticks of the placed clips, not synthesized Time ticks.
    var allTicks = otherPhraseTicks.slice();
    allTicks.push(clipATicks);
    allTicks.push(clipBTicks);
    var updatedClips = [];
    for (var ci = 0; ci < track.clips.numItems; ci++) {
      var c = track.clips[ci];
      if (!c || !c.isMGT()) continue;
      for (var tk = 0; tk < allTicks.length; tk++) {
        if (c.start.ticks === allTicks[tk]) { updatedClips.push(c); break; }
      }
    }
    updatedClips.sort(function(a, b) { return a.start.seconds - b.start.seconds; });

    // 9. Apply text + progression + master style + color to every clip
    for (var n = 0; n < updatedClips.length; n++) {
      var tc  = updatedClips[n];
      var tMgt = tc.getMGTComponent();
      applyMasterStyle(tc, masterStyleMap);
      var tTxt = tMgt.properties.getParamForDisplayName("\u24c9 Text Input") || 
                 tMgt.properties.getParamForDisplayName("Text Input") ||
                 tMgt.properties.getParamForDisplayName("Ⓣ Text Input");
      if (tTxt) tTxt.setValue(JSON.stringify(newTextObj), 0);
      var tProg = tMgt.properties.getParamForDisplayName("\u24c9 Word Progression") || 
                  tMgt.properties.getParamForDisplayName("Word Progression") ||
                  tMgt.properties.getParamForDisplayName("Ⓣ Word Progression");
      if (tProg) tProg.setValue(n + 1, 0);
      _setClipColor(tc, anchorColor);
    }

    // 10. Remap Ⓢ Specific Word sliders
    //     Anchor word stays at anchorPos+1 (1-based). New word is at anchorPos+2.
    //     Everything that was anchorPos+2 or later shifts to anchorPos+3, etc.
    //     → sliders > anchorPos+1 (1-based) increment by 1; others unchanged.
    var newSliders = [];
    for (var sv = 0; sv < oldSliders.length; sv++) {
      var v = oldSliders[sv];
      newSliders.push(v > anchorPos + 1 ? v + 1 : v);
    }
    for (var sc = 0; sc < updatedClips.length; sc++) {
      _setSpecificWordSliderSlots(updatedClips[sc], newSliders);
    }

    jsxLog("Add Word DONE | inserted='" + newWord + "' after pos=" + anchorPos + " | playhead=" + playhead.toFixed(3) + "s | new text='" + newWords.join(" ") + "'", "INFO");
      return { status: "Complete" };
    } finally { endUndo("Add Word"); }
  }, "sm_tools_add_word_v28");
}

// ==========================================
// HELPER: Get MOGRT Data for Split Operation
// ==========================================

function splitPhraseGetMogrtData(request) {
  try {
    app.enableQE();
    var qeSeq = qe.project.getActiveSequence();
    if (!qeSeq) return JSON.stringify({ status: "Error", message: "QE Sequence unavailable. Please click on your timeline first." });
    var playhead = qeSeq.CTI.secs;

    var result = { status: "Incomplete", mogrtParameterData: [], selectedClipData: [] };
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) return JSON.stringify({ status: "Error", message: "No active sequence." });

    var tracks = activeSeq.videoTracks;
    for (var i = 0; i < tracks.numTracks; i++) {
      var clips = tracks[i].clips;
      for (var j = 0; j < clips.numItems; j++) {
        var clip = clips[j];
        if (clip.isSelected() && clip.isMGT()) {
          var start = clip.start.seconds;
          var end = clip.end.seconds;
          var mgt = clip.getMGTComponent();
          var prog = mgt.properties.getParamForDisplayName("Ⓣ Word Progression") ? mgt.properties.getParamForDisplayName("Ⓣ Word Progression").getValue() : 0;
          var text = mgt.properties.getParamForDisplayName("Ⓣ Text Input") ? mgt.properties.getParamForDisplayName("Ⓣ Text Input").getValue() : "";

          result.selectedClipData.push({
            mogrtName: clip.projectItem.name,
            mogrtNodeId: clip.projectItem.nodeId,
            trackNumber: i,
            clipNumber: j,
            clipStart: start,
            clipEnd: end,
            clipDuration: clip.duration.seconds,
            clipDurationTicks: clip.duration.ticks,
            wordProgressionValue: prog,
            textInputValue: text
          });

          if (playhead >= start && playhead <= end) {
            result.mogrtParameterData.push({ wordProgressionValue: prog, textInputValue: text });
          }
        }
      }
    }

    if (activeSeq.videoTracks.numTracks <= request.splitVideoTrack + 1) {
      qeSeq.addTracks(1, request.splitVideoTrack + 1, 0);
    }

    result.status = "Complete";
    result.totalClips = result.selectedClipData.length;
    result.playhead = playhead;

    if (result.selectedClipData.length > 0) {
      result.phraseStart = result.selectedClipData[0].clipStart;
      result.phraseEnd = result.selectedClipData[result.totalClips - 1].clipEnd;
    } else {
      result.phraseStart = 0;
      result.phraseEnd = 0;
    }

    return JSON.stringify(result);

  } catch (err) {
    return reportError(err, "splitPhraseGetMogrtData");
  }
}

// ==========================================
// HELPER: Find Clip Under Playhead
// ==========================================

function findClipUnderPlayhead(request) {
  try {
    app.enableQE();
    var qeSeq = qe.project.getActiveSequence();
    if (!qeSeq) return JSON.stringify({ status: "Error", message: "QE Sequence unavailable." });
    var playhead = qeSeq.CTI.secs;

    var activeSeq = app.project.activeSequence;
    if (!activeSeq) return JSON.stringify({ status: "Error", message: "No active sequence." });

    var tracks = activeSeq.videoTracks;
    for (var i = 0; i < tracks.numTracks; i++) {
      var clips = tracks[i].clips;
      for (var j = 0; j < clips.numItems; j++) {
        var clip = clips[j];
        if (clip.isMGT()) {
          var start = clip.start.seconds;
          var end = clip.end.seconds;
          if (playhead >= start && playhead <= end) {
            var mgt = clip.getMGTComponent();
            var prog = mgt.properties.getParamForDisplayName("Ⓣ Word Progression") ? mgt.properties.getParamForDisplayName("Ⓣ Word Progression").getValue() : 0;
            return JSON.stringify({
              status: "Found",
              mogrtName: clip.projectItem.name,
              mogrtNodeId: clip.projectItem.nodeId,
              trackNumber: i,
              clipNumber: j,
              clipStart: start,
              clipEnd: end,
              clipDuration: clip.duration.seconds,
              wordProgressionValue: prog
            });
          }
        }
      }
    }

    return JSON.stringify({ status: "NotFound", message: "No clip found under playhead." });
  } catch (err) {
    return reportError(err, "findClipUnderPlayhead");
  }
}

// ==========================================
// GENERIC MOGRT SUPPORT
// ----------------------------------------
// Clips that do NOT carry the Ⓣ Word Progression param are "generic" — they
// are still MOGRTs but were imported from a non-freeXan Caption template. We
// persist per-clip word timing data in XMP under freeXan Caption_WordTimings.
//
// Helpers (defined in mogrt.jsx, available globally):
//   _smIsGenericClip(clip)                  → bool
//   _smReadWordTimings(projectItem)         → { words, textInputCount, ... } | null
//   _smWriteWordTimings(projectItem, data)  → bool
//   _smFindAllTextParams(properties)        → array of text params
//   _smGetText(textParam)                   → string
//   _smSetText(textParam, text)             → bool
//   _smDistributeWords(wordCount, numInputs) → [[indices], ...]
// ==========================================

// Apply distribution: take wordTimings.words and assigned text inputs and
// write words to each input. distribution[i] is array of word indices for
// input i. Returns true on success.
function _smApplyDistributionToClip(clip, words, distribution) {
  if (!clip) return false;
  var mgt = null;
  try { mgt = clip.getMGTComponent(); } catch (e) { mgt = null; }
  if (!mgt || !mgt.properties) { jsxLog("_smApplyDistributionToClip: no MGT component", "ERROR"); return false; }
  var textParams = (typeof _smFindAllTextParams === "function") ? _smFindAllTextParams(mgt.properties) : [];
  if (!textParams || textParams.length === 0) { jsxLog("_smApplyDistributionToClip: no text params found", "WARN"); return false; }
  var numInputs = textParams.length;
  for (var i = 0; i < numInputs; i++) {
    var idxs = (distribution && distribution[i]) ? distribution[i] : [];
    var chunk = [];
    for (var k = 0; k < idxs.length; k++) {
      var w = words[idxs[k]];
      if (w && typeof w.text === "string") chunk.push(w.text);
      else if (typeof w === "string") chunk.push(w);
    }
    var joined = chunk.join(" ");
    try { _smSetText(textParams[i].param, joined); } catch (eSet) { jsxLog("_smApplyDistributionToClip: setText failed input " + i + ": " + eSet.toString(), "ERROR"); }
  }
  return true;
}

// Compute distribution. Always re-derive via _smDistributeWords so reslicing
// after split/join/surgery produces a balanced layout consistent with the
// helper contract.
function _smDistributionFor(wordCount, numInputs) {
  if (typeof _smDistributeWords === "function") {
    var d = null;
    try { d = _smDistributeWords(wordCount, numInputs); } catch (e) { d = null; }
    if (d) return d;
  }
  // Fallback even split
  var out = [];
  for (var i = 0; i < numInputs; i++) out.push([]);
  for (var w = 0; w < wordCount; w++) out[w % numInputs].push(w);
  return out;
}

// Trim clip to start..end (seconds). Returns true on success.
function _smTrimClip(clip, startSecs, endSecs) {
  if (!clip) return false;
  try {
    var sT = new Time(); sT.seconds = startSecs;
    var eT = new Time(); eT.seconds = endSecs;
    // Set end first to avoid invalid order (start>end) intermediate state if
    // we're shrinking from the right.
    try { clip.end = eT; } catch (e1) { jsxLog("_smTrimClip end set failed: " + e1.toString(), "WARN"); }
    try { clip.start = sT; } catch (e2) { jsxLog("_smTrimClip start set failed: " + e2.toString(), "WARN"); }
    return true;
  } catch (e) {
    jsxLog("_smTrimClip failed: " + e.toString(), "ERROR");
    return false;
  }
}

// Re-fetch a clip from track by start ticks (overwriteClip invalidates refs)
function _smFindClipOnTrackByTicks(track, ticks) {
  if (!track) return null;
  for (var i = 0; i < track.clips.numItems; i++) {
    if (track.clips[i].start.ticks === ticks) return track.clips[i];
  }
  return null;
}

// Find the most-recently-inserted clip near startSecs on a track (fuzzy by 0.02s)
function _smFindClipOnTrackBySecs(track, startSecs) {
  if (!track) return null;
  var match = null;
  for (var i = 0; i < track.clips.numItems; i++) {
    if (Math.abs(track.clips[i].start.seconds - startSecs) < 0.02) match = track.clips[i];
  }
  return match;
}

// Build a "clip-like" proxy for getSafeAlternatingColor() — that helper calls
// .projectItem.getColorLabel() on its args. We pass null when no neighbor.
function _smColorProxyFromClip(clip) {
  if (!clip) return null;
  try { var label = clip.projectItem ? clip.projectItem.getColorLabel() : 0; return { projectItem: { getColorLabel: function () { return label; } } }; }
  catch (e) { return null; }
}

// ==========================================
// GENERIC: SPLIT a single phrase at playhead
// ==========================================
function sm_generic_split(params) {
  return safeCall(function () {
    app.enableQE();
    jsxLog("sm_generic_split: entering trackIndex=" + params.trackIndex + " clipIndex=" + params.clipIndex, "INFO");
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");
    var qeSeq = qe.project.getActiveSequence();
    if (!qeSeq) return { status: "Error", message: "QE sequence unavailable." };
    var playhead = qeSeq.CTI.secs;

    var trackIdx = parseInt(params.trackIndex, 10);
    var clipIdx  = parseInt(params.clipIndex, 10);
    if (isNaN(trackIdx) || trackIdx < 0 || trackIdx >= activeSeq.videoTracks.numTracks)
      return { status: "Error", message: "Track index out of range." };
    var track = activeSeq.videoTracks[trackIdx];
    if (isNaN(clipIdx) || clipIdx < 0 || clipIdx >= track.clips.numItems)
      return { status: "Error", message: "Clip index out of range." };
    var clip = track.clips[clipIdx];
    if (!clip) return { status: "Error", message: "Clip not found." };

    if (!_smIsGenericClip(clip)) return { status: "Error", message: "Clip is not a generic MOGRT — use the freeXan Caption split path." };

    var projectItem = clip.projectItem;
    var data = _smReadWordTimings(projectItem);
    if (!data || !data.words || data.words.length === 0) {
      jsxLog("sm_generic_split: no XMP word timings on clip", "ERROR");
      return { status: "Error", message: "No word timing data on this clip — cannot split." };
    }
    var words = data.words;
    if (words.length < 2) return { status: "Error", message: "Need at least 2 words to split." };

    // Find split boundary: first word whose start >= playhead (with small slack)
    var splitIdx = -1;
    for (var i = 0; i < words.length; i++) {
      if (Number(words[i].start) >= playhead - 0.01) { splitIdx = i; break; }
    }
    if (splitIdx <= 0 || splitIdx >= words.length) {
      jsxLog("sm_generic_split: invalid split boundary " + splitIdx + " (playhead=" + playhead.toFixed(3) + ")", "ERROR");
      return { status: "Error", message: "Place playhead between words to split." };
    }

    var wordsA = words.slice(0, splitIdx);
    var wordsB = words.slice(splitIdx);
    var aStart = Number(wordsA[0].start);
    var aEnd   = Number(wordsA[wordsA.length - 1].end);
    var bStart = Number(wordsB[0].start);
    var bEnd   = Number(wordsB[wordsB.length - 1].end);

    jsxLog("sm_generic_split: splitIdx=" + splitIdx + " A=[" + aStart.toFixed(3) + "-" + aEnd.toFixed(3) + "] B=[" + bStart.toFixed(3) + "-" + bEnd.toFixed(3) + "]", "INFO");

    startUndo("Generic Split");
    try {
      // Decide phrase A track (existing trackIdx) and phrase B staircase track
      var neighborBefore = null, neighborAfter = null;
      try { neighborBefore = findNeighborPhrase(clip, "before"); } catch (e) {}
      try { neighborAfter  = findNeighborPhrase(clip, "after");  } catch (e) {}
      var trackIdxBefore = neighborBefore ? _getClipTrackIndex(neighborBefore) : -1;
      var trackIdxAfter  = neighborAfter  ? _getClipTrackIndex(neighborAfter)  : -1;
      var trackIdxA = trackIdx;
      var trackIdxB = getSafeAlternatingTrack(trackIdxA, trackIdxAfter);
      if (trackIdxB === trackIdxA) trackIdxB = trackIdxA + 1; // ensure separate track
      var destTrackB = _ensureTrack(activeSeq, trackIdxB);

      var origColor = 0;
      try { origColor = projectItem.getColorLabel(); } catch (e) {}
      var colorA = getSafeAlternatingColor(neighborBefore, null);
      var colorBProxy = { projectItem: { getColorLabel: function () { return colorA; } } };
      var colorB = getSafeAlternatingColor(colorBProxy, neighborAfter);

      // -- Place Phrase A: trim existing clip to A's time range, rewrite text + XMP --
      var clipA = _smFindClipOnTrackByTicks(track, clip.start.ticks);
      if (!clipA) clipA = clip;
      _smTrimClip(clipA, aStart, aEnd);

      var mgtA = null;
      try { mgtA = clipA.getMGTComponent(); } catch (e) {}
      var textInputCountA = data.textInputCount || (mgtA ? (typeof _smFindAllTextParams === "function" ? _smFindAllTextParams(mgtA.properties).length : 1) : 1);
      if (textInputCountA < 1) textInputCountA = 1;
      var distA = _smDistributionFor(wordsA.length, textInputCountA);
      _smApplyDistributionToClip(clipA, wordsA, distA);
      _setClipColor(clipA, colorA);
      // Write phrase A XMP — note: XMP lives on projectItem, which is SHARED
      // across all clips spawned from this MOGRT. To avoid the B clip reading
      // A's XMP, we'll overwrite per-clip after each placement. Phrase B is
      // placed first, then we re-stamp A's XMP last so the read on the
      // currently-edited clip sees the right data. (Subsequent operations
      // disambiguate by re-reading from each clip's projectItem; here both
      // share the same projectItem, so the model degrades to "last writer
      // wins" — acceptable for now and the same approach Agent A uses.)
      var dataA = { words: wordsA, textInputCount: textInputCountA, textInputNames: data.textInputNames || [], distribution: distA };

      // -- Place Phrase B: overwriteClip same template at bStart on destTrackB --
      try { destTrackB.overwriteClip(projectItem, bStart); } catch (eO) {
        jsxLog("sm_generic_split: overwriteClip B failed: " + eO.toString(), "ERROR");
        return { status: "Error", message: "Failed to place phrase B clip: " + eO.toString() };
      }
      var clipB = _smFindClipOnTrackBySecs(destTrackB, bStart);
      if (!clipB) return { status: "Error", message: "Could not locate phrase B clip after insert." };
      _smTrimClip(clipB, bStart, bEnd);
      var mgtB = null;
      try { mgtB = clipB.getMGTComponent(); } catch (e) {}
      var textInputCountB = data.textInputCount || (mgtB ? (typeof _smFindAllTextParams === "function" ? _smFindAllTextParams(mgtB.properties).length : 1) : 1);
      if (textInputCountB < 1) textInputCountB = 1;
      var distB = _smDistributionFor(wordsB.length, textInputCountB);
      _smApplyDistributionToClip(clipB, wordsB, distB);
      _setClipColor(clipB, colorB);
      var dataB = { words: wordsB, textInputCount: textInputCountB, textInputNames: data.textInputNames || [], distribution: distB };

      // Stamp XMP — shared projectItem means only one survives. Stamp B last
      // so when ops next read the projectItem they see at least one phrase's
      // data. Per-clip XMP is a known limitation of generic MOGRTs sharing a
      // projectItem; surgery/remove/add must work tolerantly.
      try { _smWriteWordTimings(projectItem, dataB); } catch (eW) { jsxLog("sm_generic_split: write XMP B failed: " + eW.toString(), "WARN"); }
      try { _smWriteWordTimings(projectItem, dataA); } catch (eW2) { jsxLog("sm_generic_split: write XMP A failed: " + eW2.toString(), "WARN"); }

      jsxLog("sm_generic_split: complete | A=" + wordsA.length + "w B=" + wordsB.length + "w", "INFO");
      return { status: "Complete" };
    } finally { endUndo("Generic Split"); }
  }, "sm_generic_split");
}

// ==========================================
// GENERIC: JOIN multiple phrases
// ==========================================
function sm_generic_join(params) {
  return safeCall(function () {
    app.enableQE();
    jsxLog("sm_generic_join: entering with " + params.selectedClips.length + " selections", "INFO");
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");
    var qeSeq = qe.project.getActiveSequence();
    var playhead = qeSeq ? qeSeq.CTI.secs : 0;

    if (!params.selectedClips || params.selectedClips.length < 2)
      return { status: "Error", message: "Select at least 2 phrases to join." };

    // Hydrate: collect phrases with their XMP
    var phrases = [];
    for (var i = 0; i < params.selectedClips.length; i++) {
      var sd = params.selectedClips[i];
      var sT = parseInt(sd.trackIndex, 10);
      var sC = parseInt(sd.clipIndex, 10);
      if (isNaN(sT) || sT < 0 || sT >= activeSeq.videoTracks.numTracks)
        return { status: "Error", message: "Track index out of range: " + sd.trackIndex };
      var sTrack = activeSeq.videoTracks[sT];
      if (isNaN(sC) || sC < 0 || sC >= sTrack.clips.numItems)
        return { status: "Error", message: "Clip index out of range: " + sd.clipIndex };
      var sClip = sTrack.clips[sC];
      if (!_smIsGenericClip(sClip))
        return { status: "Error", message: "Clip at T" + sT + " C" + sC + " is not a generic MOGRT." };
      var sData = _smReadWordTimings(sClip.projectItem);
      if (!sData || !sData.words || sData.words.length === 0) {
        jsxLog("sm_generic_join: missing XMP on T" + sT + " C" + sC, "WARN");
        return { status: "Error", message: "No word timing data on one of the selected clips — cannot join." };
      }
      phrases.push({ clip: sClip, words: sData.words, projectItem: sClip.projectItem, trackIdx: sT, clipIdx: sC, data: sData });
    }

    // Sort chronologically by first word start
    phrases.sort(function (a, b) { return Number(a.words[0].start) - Number(b.words[0].start); });

    // Find master clip by playhead
    var masterPhrase = null;
    for (var mp = 0; mp < phrases.length; mp++) {
      var pStart = phrases[mp].clip.start.seconds;
      var pEnd   = phrases[mp].clip.end.seconds;
      if (playhead >= pStart - 0.01 && playhead <= pEnd + 0.01) { masterPhrase = phrases[mp]; break; }
    }
    if (!masterPhrase) masterPhrase = phrases[0]; // Fall back to earliest

    // Merge all words
    var mergedWords = [];
    for (var pp = 0; pp < phrases.length; pp++) {
      for (var ww = 0; ww < phrases[pp].words.length; ww++) mergedWords.push(phrases[pp].words[ww]);
    }
    if (mergedWords.length === 0) return { status: "Error", message: "No words to join." };
    var mergedStart = Number(mergedWords[0].start);
    var mergedEnd   = Number(mergedWords[mergedWords.length - 1].end);

    jsxLog("sm_generic_join: merged " + mergedWords.length + " words span=[" + mergedStart.toFixed(3) + "-" + mergedEnd.toFixed(3) + "] master=T" + masterPhrase.trackIdx, "INFO");

    startUndo("Generic Join");
    try {
      var masterProjectItem = masterPhrase.projectItem;

      // Pick staircase track: aware of neighbors outside the selection
      var firstPhrase = phrases[0];
      var lastPhrase  = phrases[phrases.length - 1];
      var nbPrev = null, nbNext = null;
      try { nbPrev = findNeighborPhrase(firstPhrase.clip, "before"); } catch (e) {}
      try { nbNext = findNeighborPhrase(lastPhrase.clip,  "after");  } catch (e) {}
      var trackIdxPrev = nbPrev ? _getClipTrackIndex(nbPrev) : -1;
      var trackIdxNext = nbNext ? _getClipTrackIndex(nbNext) : -1;
      var safeTrackIdx = getSafeAlternatingTrack(trackIdxPrev, trackIdxNext);
      var destTrack = _ensureTrack(activeSeq, safeTrackIdx);

      var joinedColor = getSafeAlternatingColor(nbPrev, nbNext);

      // Remove all selected phrase clips (collect refs from current state)
      // Snapshot ticks then remove via re-lookup since removals invalidate refs
      var removalTargets = [];
      for (var rmi = 0; rmi < phrases.length; rmi++) {
        removalTargets.push({ trackIdx: phrases[rmi].trackIdx, ticks: phrases[rmi].clip.start.ticks });
      }
      for (var rmj = 0; rmj < removalTargets.length; rmj++) {
        var rmT = activeSeq.videoTracks[removalTargets[rmj].trackIdx];
        var rmClip = _smFindClipOnTrackByTicks(rmT, removalTargets[rmj].ticks);
        if (rmClip) { try { rmClip.remove(false, false); } catch (eR) { jsxLog("sm_generic_join: remove failed: " + eR.toString(), "WARN"); } }
      }

      // Place fresh clip on destTrack at mergedStart
      try { destTrack.overwriteClip(masterProjectItem, mergedStart); } catch (eO) {
        jsxLog("sm_generic_join: overwriteClip failed: " + eO.toString(), "ERROR");
        return { status: "Error", message: "Failed to place joined clip: " + eO.toString() };
      }
      var joinedClip = _smFindClipOnTrackBySecs(destTrack, mergedStart);
      if (!joinedClip) return { status: "Error", message: "Could not locate joined clip after insert." };
      _smTrimClip(joinedClip, mergedStart, mergedEnd);

      var mgtJ = null; try { mgtJ = joinedClip.getMGTComponent(); } catch (e) {}
      var textInputCountJ = (masterPhrase.data && masterPhrase.data.textInputCount) ? masterPhrase.data.textInputCount : ((mgtJ && typeof _smFindAllTextParams === "function") ? _smFindAllTextParams(mgtJ.properties).length : 1);
      if (textInputCountJ < 1) textInputCountJ = 1;
      var distJ = _smDistributionFor(mergedWords.length, textInputCountJ);
      _smApplyDistributionToClip(joinedClip, mergedWords, distJ);
      _setClipColor(joinedClip, joinedColor);

      try { _smWriteWordTimings(masterProjectItem, { words: mergedWords, textInputCount: textInputCountJ, textInputNames: (masterPhrase.data && masterPhrase.data.textInputNames) || [], distribution: distJ }); }
      catch (eW) { jsxLog("sm_generic_join: write XMP failed: " + eW.toString(), "WARN"); }

      jsxLog("sm_generic_join: complete | " + mergedWords.length + " words on T" + safeTrackIdx, "INFO");
      return { status: "Complete" };
    } finally { endUndo("Generic Join"); }
  }, "sm_generic_join");
}

// ==========================================
// GENERIC: SURGERY (both target & source generic)
// ==========================================
function sm_generic_surgery(params) {
  return safeCall(function () {
    app.enableQE();
    jsxLog("sm_generic_surgery: entering with " + params.selectedClips.length + " selections", "INFO");
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");

    if (!params.selectedClips || params.selectedClips.length < 2)
      return { status: "Error", message: "Select at least 2 clips spanning 2 phrases for surgery." };

    // Hydrate selected items chronologically
    var sel = [];
    for (var i = 0; i < params.selectedClips.length; i++) {
      var sd = params.selectedClips[i];
      var sT = parseInt(sd.trackIndex, 10);
      var sC = parseInt(sd.clipIndex, 10);
      if (isNaN(sT) || sT < 0 || sT >= activeSeq.videoTracks.numTracks)
        return { status: "Error", message: "Track index out of range: " + sd.trackIndex };
      var sTrack = activeSeq.videoTracks[sT];
      if (isNaN(sC) || sC < 0 || sC >= sTrack.clips.numItems)
        return { status: "Error", message: "Clip index out of range: " + sd.clipIndex };
      var sClip = sTrack.clips[sC];
      sel.push({ clip: sClip, trackIdx: sT, clipIdx: sC });
    }
    sel.sort(function (a, b) { return a.clip.start.seconds - b.clip.start.seconds; });

    // For generic phrases, each "phrase" IS a single clip (one clip per
    // generic MOGRT phrase). So target/source identification is based on
    // selection grouping: at least two distinct clips must be selected.
    // We treat each selected clip as its own phrase; surgery on generic
    // moves whole words between two clips by INDEX (since per-word
    // sub-selection isn't possible on a single multi-word clip without
    // additional UI metadata).
    if (sel.length < 2)
      return { status: "Error", message: "Surgery needs at least 2 generic clips selected." };

    // Distinct clips by (trackIdx,clipIdx,ticks)
    var distinct = [];
    var seenKeys = {};
    for (var d = 0; d < sel.length; d++) {
      var key = sel[d].trackIdx + ":" + sel[d].clip.start.ticks;
      if (!seenKeys[key]) { seenKeys[key] = true; distinct.push(sel[d]); }
    }
    if (distinct.length < 2)
      return { status: "Error", message: "Select clips from at least 2 different generic phrases." };

    // First and last (chronological) are the two phrases involved
    var firstSel = distinct[0];
    var lastSel  = distinct[distinct.length - 1];

    var firstClip = firstSel.clip;
    var lastClip  = lastSel.clip;
    if (!_smIsGenericClip(firstClip) || !_smIsGenericClip(lastClip))
      return { status: "Error", message: "sm_generic_surgery requires both clips generic." };

    var firstData = _smReadWordTimings(firstClip.projectItem);
    var lastData  = _smReadWordTimings(lastClip.projectItem);
    if (!firstData || !firstData.words || !lastData || !lastData.words)
      return { status: "Error", message: "Missing word timing data on one of the surgery clips." };

    // Determine target vs source by playhead (target contains playhead)
    var qeSeq = qe.project.getActiveSequence();
    var playhead = qeSeq ? qeSeq.CTI.secs : 0;
    var targetIsFirst = (playhead >= firstClip.start.seconds - 0.01 && playhead <= firstClip.end.seconds + 0.01);
    if (!targetIsFirst && !(playhead >= lastClip.start.seconds - 0.01 && playhead <= lastClip.end.seconds + 0.01)) {
      // Default to last as target (donor → first → target → last)
      targetIsFirst = false;
    }
    var targetSel = targetIsFirst ? firstSel : lastSel;
    var sourceSel = targetIsFirst ? lastSel  : firstSel;
    var targetData = targetIsFirst ? firstData : lastData;
    var sourceData = targetIsFirst ? lastData  : firstData;

    // For generic surgery, "stolen" words = the whole source phrase's words
    // (since each generic clip is a single MOGRT instance — we cannot pick
    // sub-words from inside a single clip without UI metadata). The
    // semantics: move all of source's words into target, removing source.
    var stolenWords = sourceData.words.slice();
    if (stolenWords.length === 0) return { status: "Error", message: "Source phrase has no words." };

    // Build merged target word list — combine target + stolen, sort by start
    var mergedWords = targetData.words.slice();
    for (var sw = 0; sw < stolenWords.length; sw++) mergedWords.push(stolenWords[sw]);
    mergedWords.sort(function (a, b) { return Number(a.start) - Number(b.start); });
    var mergedStart = Number(mergedWords[0].start);
    var mergedEnd   = Number(mergedWords[mergedWords.length - 1].end);

    // Remainder = empty (we treat the whole source as stolen for generic)
    var remainderWords = [];

    jsxLog("sm_generic_surgery: target=T" + targetSel.trackIdx + " source=T" + sourceSel.trackIdx + " merged=" + mergedWords.length + "w span=[" + mergedStart.toFixed(3) + "-" + mergedEnd.toFixed(3) + "]", "INFO");

    startUndo("Generic Surgery");
    try {
      var targetProjectItem = targetSel.clip.projectItem;

      // Remove both old clips (target + source) so we can place a fresh
      // merged target at the new span.
      var targetTicks = targetSel.clip.start.ticks;
      var sourceTicks = sourceSel.clip.start.ticks;
      var targetTrackIdx = targetSel.trackIdx;
      var sourceTrackIdx = sourceSel.trackIdx;

      var srcClipRef = _smFindClipOnTrackByTicks(activeSeq.videoTracks[sourceTrackIdx], sourceTicks);
      if (srcClipRef) { try { srcClipRef.remove(false, false); } catch (eR) { jsxLog("sm_generic_surgery: source remove failed: " + eR.toString(), "WARN"); } }
      var tgtClipRef = _smFindClipOnTrackByTicks(activeSeq.videoTracks[targetTrackIdx], targetTicks);
      if (tgtClipRef) { try { tgtClipRef.remove(false, false); } catch (eRT) { jsxLog("sm_generic_surgery: target remove failed: " + eRT.toString(), "WARN"); } }

      // Place fresh merged clip on target's original track at mergedStart
      var destTrack = activeSeq.videoTracks[targetTrackIdx];
      try { destTrack.overwriteClip(targetProjectItem, mergedStart); } catch (eO) {
        jsxLog("sm_generic_surgery: overwriteClip failed: " + eO.toString(), "ERROR");
        return { status: "Error", message: "Failed to place merged clip: " + eO.toString() };
      }
      var mergedClip = _smFindClipOnTrackBySecs(destTrack, mergedStart);
      if (!mergedClip) return { status: "Error", message: "Could not locate merged clip after insert." };
      _smTrimClip(mergedClip, mergedStart, mergedEnd);

      var mgtM = null; try { mgtM = mergedClip.getMGTComponent(); } catch (e) {}
      var textInputCountM = (targetData && targetData.textInputCount) ? targetData.textInputCount : ((mgtM && typeof _smFindAllTextParams === "function") ? _smFindAllTextParams(mgtM.properties).length : 1);
      if (textInputCountM < 1) textInputCountM = 1;
      var distM = _smDistributionFor(mergedWords.length, textInputCountM);
      _smApplyDistributionToClip(mergedClip, mergedWords, distM);

      try { _smWriteWordTimings(targetProjectItem, { words: mergedWords, textInputCount: textInputCountM, textInputNames: (targetData && targetData.textInputNames) || [], distribution: distM }); }
      catch (eW) { jsxLog("sm_generic_surgery: write XMP failed: " + eW.toString(), "WARN"); }

      // If remainderWords had any entries we would place a residual source
      // clip here. For generic-mode whole-phrase moves, remainder is empty,
      // so source is fully consumed by the target.
      if (remainderWords.length > 0) {
        jsxLog("sm_generic_surgery: remainder path not yet exercised", "WARN");
      }

      jsxLog("sm_generic_surgery: complete | " + mergedWords.length + "w on T" + targetTrackIdx, "INFO");
      return { status: "Complete" };
    } finally { endUndo("Generic Surgery"); }
  }, "sm_generic_surgery");
}

// ==========================================
// GENERIC: REMOVE WORD
// ==========================================
function sm_generic_remove_word(params) {
  return safeCall(function () {
    app.enableQE();
    jsxLog("sm_generic_remove_word: entering T" + params.trackIndex + " C" + params.clipIndex, "INFO");
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");
    var qeSeq = qe.project.getActiveSequence();
    var playhead = qeSeq ? qeSeq.CTI.secs : 0;

    var tIdx = parseInt(params.trackIndex, 10);
    var cIdx = parseInt(params.clipIndex, 10);
    if (isNaN(tIdx) || tIdx < 0 || tIdx >= activeSeq.videoTracks.numTracks)
      return { status: "Error", message: "Track index out of range." };
    var track = activeSeq.videoTracks[tIdx];
    if (isNaN(cIdx) || cIdx < 0 || cIdx >= track.clips.numItems)
      return { status: "Error", message: "Clip index out of range." };
    var clip = track.clips[cIdx];
    if (!_smIsGenericClip(clip)) return { status: "Error", message: "Not a generic MOGRT." };

    var projectItem = clip.projectItem;
    var data = _smReadWordTimings(projectItem);
    if (!data || !data.words || data.words.length === 0)
      return { status: "Error", message: "No word timing data — cannot remove word." };

    // Choose word to remove: prefer targetWord match, else playhead position
    var removeIdx = -1;
    if (params.targetWord) {
      for (var i = 0; i < data.words.length; i++) {
        var wt = data.words[i].text || "";
        if (wt === params.targetWord) { removeIdx = i; break; }
      }
    }
    if (removeIdx < 0) {
      // Find word at playhead (start <= playhead <= end)
      for (var j = 0; j < data.words.length; j++) {
        if (playhead >= Number(data.words[j].start) - 0.01 && playhead <= Number(data.words[j].end) + 0.01) {
          removeIdx = j; break;
        }
      }
    }
    if (removeIdx < 0) return { status: "Error", message: "Place playhead on the word you want to remove." };

    jsxLog("sm_generic_remove_word: removing index=" + removeIdx + " word='" + (data.words[removeIdx].text || "?") + "'", "INFO");

    startUndo("Generic Remove Word");
    try {
      var newWords = data.words.slice();
      newWords.splice(removeIdx, 1);

      if (newWords.length === 0) {
        // Remove the clip entirely
        var rmRef = _smFindClipOnTrackByTicks(track, clip.start.ticks);
        if (rmRef) { try { rmRef.remove(false, false); } catch (eR) { jsxLog("sm_generic_remove_word: remove failed: " + eR.toString(), "WARN"); } }
        jsxLog("sm_generic_remove_word: clip emptied and removed", "INFO");
        return { status: "Complete" };
      }

      // Optionally trim clip to new word time range
      var newStart = Number(newWords[0].start);
      var newEnd   = Number(newWords[newWords.length - 1].end);
      var freshClip = _smFindClipOnTrackByTicks(track, clip.start.ticks);
      if (!freshClip) freshClip = clip;
      _smTrimClip(freshClip, newStart, newEnd);

      var mgt = null; try { mgt = freshClip.getMGTComponent(); } catch (e) {}
      var textInputCount = (data.textInputCount) ? data.textInputCount : ((mgt && typeof _smFindAllTextParams === "function") ? _smFindAllTextParams(mgt.properties).length : 1);
      if (textInputCount < 1) textInputCount = 1;
      var dist = _smDistributionFor(newWords.length, textInputCount);
      _smApplyDistributionToClip(freshClip, newWords, dist);

      try { _smWriteWordTimings(projectItem, { words: newWords, textInputCount: textInputCount, textInputNames: data.textInputNames || [], distribution: dist }); }
      catch (eW) { jsxLog("sm_generic_remove_word: write XMP failed: " + eW.toString(), "WARN"); }

      jsxLog("sm_generic_remove_word: complete | remaining=" + newWords.length + "w", "INFO");
      return { status: "Complete" };
    } finally { endUndo("Generic Remove Word"); }
  }, "sm_generic_remove_word");
}

// ==========================================
// GENERIC: ADD WORD
// ==========================================
function sm_generic_add_word(params) {
  return safeCall(function () {
    app.enableQE();
    var newWord = params.newWord ? params.newWord.replace(/^\s+|\s+$/g, "") : "";
    if (!newWord) return { status: "Error", message: "New word cannot be empty." };

    jsxLog("sm_generic_add_word: entering T" + params.trackIndex + " C" + params.clipIndex + " word='" + newWord + "'", "INFO");
    var activeSeq = app.project.activeSequence;
    if (!activeSeq) throw new Error("No active sequence.");
    var qeSeq = qe.project.getActiveSequence();
    if (!qeSeq) return { status: "Error", message: "QE sequence unavailable." };
    var playhead = qeSeq.CTI.secs;

    var tIdx = parseInt(params.trackIndex, 10);
    var cIdx = parseInt(params.clipIndex, 10);
    if (isNaN(tIdx) || tIdx < 0 || tIdx >= activeSeq.videoTracks.numTracks)
      return { status: "Error", message: "Track index out of range." };
    var track = activeSeq.videoTracks[tIdx];
    if (isNaN(cIdx) || cIdx < 0 || cIdx >= track.clips.numItems)
      return { status: "Error", message: "Clip index out of range." };
    var clip = track.clips[cIdx];
    if (!_smIsGenericClip(clip)) return { status: "Error", message: "Not a generic MOGRT." };

    var projectItem = clip.projectItem;
    var data = _smReadWordTimings(projectItem);
    if (!data || !data.words)
      return { status: "Error", message: "No word timing data — cannot add word." };

    var words = data.words.slice();
    // Determine insertion index: first word whose start > playhead
    var insertIdx = words.length;
    for (var i = 0; i < words.length; i++) {
      if (Number(words[i].start) > playhead) { insertIdx = i; break; }
    }

    // Compute timing for the new word: between prior end and next start
    var clipStart = clip.start.seconds;
    var clipEnd   = clip.end.seconds;
    var nwStart, nwEnd;
    if (insertIdx === 0) {
      // Insert at beginning
      var firstStart = (words.length > 0) ? Number(words[0].start) : clipEnd;
      nwStart = Math.max(clipStart, firstStart - 0.4);
      nwEnd   = firstStart;
    } else if (insertIdx >= words.length) {
      // Insert at end
      var lastEnd = (words.length > 0) ? Number(words[words.length - 1].end) : clipStart;
      nwStart = lastEnd;
      nwEnd   = Math.min(clipEnd, lastEnd + 0.4);
      if (nwEnd <= nwStart) nwEnd = nwStart + 0.4;
    } else {
      // Insert between insertIdx-1 and insertIdx
      var prevEnd  = Number(words[insertIdx - 1].end);
      var nextStart = Number(words[insertIdx].start);
      // Split the gap (or carve from next if no gap)
      if (nextStart - prevEnd > 0.05) {
        nwStart = prevEnd;
        nwEnd   = nextStart;
      } else {
        // No gap — shave from next word's start
        nwStart = prevEnd;
        nwEnd   = prevEnd + Math.max(0.1, (nextStart - prevEnd) || 0.2);
      }
    }

    var newWordEntry = { text: newWord, start: nwStart, end: nwEnd };
    words.splice(insertIdx, 0, newWordEntry);

    jsxLog("sm_generic_add_word: insertIdx=" + insertIdx + " timing=[" + nwStart.toFixed(3) + "-" + nwEnd.toFixed(3) + "]", "INFO");

    startUndo("Generic Add Word");
    try {
      // Adjust clip bounds if needed
      var newClipStart = Math.min(clipStart, Number(words[0].start));
      var newClipEnd   = Math.max(clipEnd, Number(words[words.length - 1].end));
      var freshClip = _smFindClipOnTrackByTicks(track, clip.start.ticks);
      if (!freshClip) freshClip = clip;
      if (newClipStart < clipStart || newClipEnd > clipEnd) {
        _smTrimClip(freshClip, newClipStart, newClipEnd);
      }

      var mgt = null; try { mgt = freshClip.getMGTComponent(); } catch (e) {}
      var textInputCount = (data.textInputCount) ? data.textInputCount : ((mgt && typeof _smFindAllTextParams === "function") ? _smFindAllTextParams(mgt.properties).length : 1);
      if (textInputCount < 1) textInputCount = 1;
      var dist = _smDistributionFor(words.length, textInputCount);
      _smApplyDistributionToClip(freshClip, words, dist);

      try { _smWriteWordTimings(projectItem, { words: words, textInputCount: textInputCount, textInputNames: data.textInputNames || [], distribution: dist }); }
      catch (eW) { jsxLog("sm_generic_add_word: write XMP failed: " + eW.toString(), "WARN"); }

      jsxLog("sm_generic_add_word: complete | total=" + words.length + "w", "INFO");
      return { status: "Complete" };
    } finally { endUndo("Generic Add Word"); }
  }, "sm_generic_add_word");
}
