/**
 * freeXan Caption Debug Bridge (v1.0)
 *
 * File-based IPC between the terminal debugger and ExtendScript.
 * The panel's JavaScript side calls sm_debug_poll() on a 2-second timer
 * (only when the extension is loaded — zero overhead in production if the
 * inbox file is absent).
 *
 * Inbox  (terminal → JSX): Folder.userData/.../logs/debug_inbox.json
 * Outbox (JSX → terminal): Folder.userData/.../logs/debug_outbox.json
 *
 * Supported commands:
 *   ping          — health check
 *   timeline      — full videoTracks / clips dump
 *   phraseMap     — getTimelinePhraseMap() result
 *   playhead      — current CTI in seconds
 *   clip <t> <c>  — MOGRT property dump for a single clip
 *   log <msg>     — write a custom entry via jsxLog
 */

(function () {

  var _LOGS_BASE = Folder.userData.fsName +
    "/Adobe/CEP/extensions/com.bloomx.freexan.caption/panel/logs/";
  var _INBOX  = _LOGS_BASE + "debug_inbox.json";
  var _OUTBOX = _LOGS_BASE + "debug_outbox.json";

  // ─── Write result to outbox ───────────────────────────────────────────────

  function _writeOutbox(cmd, data) {
    try {
      var f = new File(_OUTBOX);
      if (f.open("w")) {
        f.encoding = "UTF-8";
        f.write(JSON.stringify({ cmd: cmd, data: data, ts: (new Date()).toTimeString().split(' ')[0] }));
        f.close();
      }
    } catch (e) {
      jsxLog("debug_bridge: outbox write failed: " + e.toString(), "WARN");
    }
  }

  function _writeOutboxError(cmd, msg) {
    try {
      var f = new File(_OUTBOX);
      if (f.open("w")) {
        f.encoding = "UTF-8";
        f.write(JSON.stringify({ cmd: cmd, error: msg }));
        f.close();
      }
    } catch (e) {}
  }

  // ─── Command handlers ─────────────────────────────────────────────────────

  function _cmdPing() {
    var ver = "";
    try { ver = "PP " + app.version; } catch (e) {}
    _writeOutbox("ping", ver + " | ExtendScript OK | " + (new Date()).toTimeString().split(' ')[0]);
  }

  function _cmdPlayhead() {
    try {
      app.enableQE();
      var qeSeq = qe.project.getActiveSequence();
      if (!qeSeq) { _writeOutboxError("playhead", "No active QE sequence."); return; }
      _writeOutbox("playhead", qeSeq.CTI.secs);
    } catch (e) { _writeOutboxError("playhead", e.toString()); }
  }

  function _cmdTimeline() {
    try {
      var seq = app.project.activeSequence;
      if (!seq) { _writeOutboxError("timeline", "No active sequence."); return; }
      var result = { seqName: seq.name, tracks: [] };
      for (var t = 0; t < seq.videoTracks.numTracks; t++) {
        var track = seq.videoTracks[t];
        var trackData = { index: t, clips: [] };
        for (var c = 0; c < track.clips.numItems; c++) {
          var clip = track.clips[c];
          if (!clip) continue;
          var clipData = {
            index: c,
            start: clip.start.seconds,
            end: clip.end.seconds,
            startTicks: clip.start.ticks,
            isMGT: clip.isMGT()
          };
          if (clip.isMGT()) {
            try {
              var mgt = clip.getMGTComponent();
              var tParam = mgt.properties.getParamForDisplayName("Ⓣ Text Input") ||
                           mgt.properties.getParamForDisplayName("Text Input");
              var pParam = mgt.properties.getParamForDisplayName("Ⓣ Word Progression") ||
                           mgt.properties.getParamForDisplayName("Word Progression");
              if (tParam) {
                try {
                  var parsed = JSON.parse(tParam.getValue());
                  clipData.text = parsed.textEditValue || "";
                } catch (pe) { clipData.text = tParam.getValue(); }
              }
              if (pParam) clipData.progression = pParam.getValue();
            } catch (me) { clipData.mogrtError = me.toString(); }
          }
          trackData.clips.push(clipData);
        }
        if (trackData.clips.length > 0) result.tracks.push(trackData);
      }
      _writeOutbox("timeline", result);
    } catch (e) { _writeOutboxError("timeline", e.toString()); }
  }

  function _cmdPhraseMap() {
    try {
      var map = getTimelinePhraseMap();
      _writeOutbox("phraseMap", map);
    } catch (e) { _writeOutboxError("phraseMap", e.toString()); }
  }

  function _cmdClip(args) {
    try {
      var tIdx = parseInt(args[0], 10);
      var cIdx = parseInt(args[1], 10);
      var seq = app.project.activeSequence;
      if (!seq) { _writeOutboxError("clip", "No active sequence."); return; }
      if (isNaN(tIdx) || isNaN(cIdx)) { _writeOutboxError("clip", "Usage: clip <trackIndex> <clipIndex>"); return; }
      var track = seq.videoTracks[tIdx];
      if (!track) { _writeOutboxError("clip", "Track " + tIdx + " not found."); return; }
      var clip = track.clips[cIdx];
      if (!clip) { _writeOutboxError("clip", "Clip " + cIdx + " not found on track " + tIdx + "."); return; }

      var result = {
        trackIndex: tIdx,
        clipIndex: cIdx,
        start: clip.start.seconds,
        end: clip.end.seconds,
        startTicks: clip.start.ticks,
        endTicks: clip.end.ticks,
        isMGT: clip.isMGT(),
        props: []
      };

      if (clip.isMGT()) {
        try {
          var mgt = clip.getMGTComponent();
          var props = mgt.properties;
          var pCount = props.length || props.numItems || 0;
          for (var k = 0; k < pCount; k++) {
            var p = props[k];
            if (!p) continue;
            var pData = { index: k, displayName: p.displayName, value: null };
            try {
              var rawVal = p.getValue();
              // Truncate very long JSON strings for readability
              if (typeof rawVal === 'string' && rawVal.length > 200) {
                try {
                  var parsed = JSON.parse(rawVal);
                  pData.value = { textEditValue: parsed.textEditValue || "...", truncated: true };
                } catch (_) { pData.value = rawVal.substring(0, 200) + "..."; }
              } else {
                pData.value = rawVal;
              }
            } catch (ve) { pData.value = "(error: " + ve.toString() + ")"; }
            result.props.push(pData);
          }
        } catch (me) { result.mogrtError = me.toString(); }

        // Motion component
        try {
          var comps = clip.components;
          for (var ci = 0; ci < comps.length; ci++) {
            if (comps[ci].displayName === "Motion") {
              var mp = comps[ci].properties;
              result.motion = {};
              for (var pi = 0; pi < mp.length; pi++) {
                result.motion[mp[pi].displayName] = mp[pi].getValue();
              }
              break;
            }
          }
        } catch (me2) {}
      }

      _writeOutbox("clip", result);
    } catch (e) { _writeOutboxError("clip", e.toString()); }
  }

  function _cmdLog(args) {
    var msg = args.join(" ") || "(empty)";
    jsxLog("[DEBUG-BRIDGE] " + msg, "DEBUG");
    _writeOutbox("log", "written: " + msg);
  }

  // ─── Poll: called by panel JS every 2 seconds ─────────────────────────────

  function sm_debug_poll() {
    try {
      var inboxFile = new File(_INBOX);
      if (!inboxFile.exists) return; // no pending command — fast exit

      jsxLog("debug_bridge: inbox detected, attempting read", "BRIDGE");

      var raw = "";
      inboxFile.encoding = "UTF-8";
      var openOk = inboxFile.open("r");
      if (openOk) {
        raw = inboxFile.read();
        inboxFile.close();
      } else {
        jsxLog("debug_bridge: inbox open(r) FAILED — error=" + (inboxFile.error || "(none)"), "ERROR");
      }
      // Delete inbox immediately to prevent double-execution
      try { inboxFile.remove(); } catch (_) {}

      jsxLog("debug_bridge: raw length=" + (raw ? raw.length : 0) + " preview=" + (raw ? raw.substr(0, 80) : "(empty)"), "BRIDGE");

      if (!raw || !raw.replace(/^﻿/, '').replace(/\s+/g, '').length) {
        _writeOutboxError("read", "Inbox file was empty or unreadable. open=" + openOk);
        return;
      }

      // Strip BOM if present
      raw = raw.replace(/^﻿/, '');

      var payload;
      try { payload = JSON.parse(raw); } catch (e) {
        _writeOutboxError("parse", "Bad JSON in inbox: " + e.toString() + " raw=" + raw);
        return;
      }

      var cmd  = payload.cmd  || "";
      var args = payload.args || [];

      jsxLog("debug_bridge: received cmd=" + cmd + " args=" + JSON.stringify(args), "BRIDGE");

      if (cmd === "ping")           _cmdPing();
      else if (cmd === "playhead")  _cmdPlayhead();
      else if (cmd === "timeline")  _cmdTimeline();
      else if (cmd === "phraseMap") _cmdPhraseMap();
      else if (cmd === "clip")      _cmdClip(args);
      else if (cmd === "log")       _cmdLog(args);
      else _writeOutboxError(cmd, "Unknown command: " + cmd);

      jsxLog("debug_bridge: cmd '" + cmd + "' completed", "BRIDGE");

    } catch (e) {
      jsxLog("debug_bridge: poll error: " + e.toString() + " line=" + e.line, "ERROR");
      try { _writeOutboxError("poll", e.toString()); } catch (_) {}
    }
  }

  // Expose globally so the panel can call it via evalScript
  $.global.sm_debug_poll = sm_debug_poll;

  jsxLog("debug_bridge: loaded. Inbox=" + _INBOX, "BRIDGE");

}());
