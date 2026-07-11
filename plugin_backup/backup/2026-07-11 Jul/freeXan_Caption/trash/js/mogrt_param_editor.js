/**
 * freeXan Caption — MOGRT Param Editor (React)
 *
 * Completely isolated from command_center_react.js.
 * Mounts its own React root at #react-params-root in the "Params" tab.
 *
 * Architecture mirrors Premiere Composer:
 *   - smInitParamEvents() binds app.bind() in JSX → dispatches CSXSEvent
 *   - Listens for 'freexan.caption.paramsUpdated' CSXSEvent for real-time updates
 *   - Manual refresh calls smGetSelectionParams()
 *   - Color values: hex string 'rrggbb' from JSX → { r, g, b } internally
 *   - Color write: { r, g, b } → smApplyParam → setColorValue(1, r, g, b, 1)
 */

(function () {
  'use strict';

  if (!document.getElementById('react-params-root')) return;

  const { useState, useEffect, useRef, useCallback, useMemo } = React;

  // ─── JSX loader — bypasses Premiere's JSX cache ──────────────────────────────
  // Premiere caches JSX across panel reloads. $.evalFile() forces a fresh load
  // of mogrt_editor.jsx from disk so new functions are always available.
  var _jsxReady = false;

  function ensureMogrtJSX() {
    return new Promise(function (resolve) {
      if (_jsxReady || !window.__adobe_cep__) { resolve(); return; }
      // Derive extension root from panel URL — more reliable than getSystemPath
      // href is like: file:///C:/Swastik%20Development/freeXan Caption/panel/panel.html
      var href    = decodeURIComponent(window.location.href);
      var extRoot = href.replace(/^file:\/{2,3}/, '').replace(/\/panel\/panel\.html.*$/, '');
      var jsxFile = (extRoot + '/panel/jsx/core/mogrt_editor.jsx').replace(/\\/g, '/');
      var script  = '$.evalFile(File("' + jsxFile + '")); typeof smGetSelectionParams === "function" ? "ok" : "missing"';
      window.__adobe_cep__.evalScript(script, function (res) {
        _jsxReady = (res === '"ok"' || res === 'ok');
        resolve();
      });
    });
  }

  // ─── JSX bridge ──────────────────────────────────────────────────────────────
  function callJSX(funcName, params) {
    return new Promise(function (resolve, reject) {
      if (!window.__adobe_cep__) {
        // Browser mock
        if (funcName === 'smGetSelectionParams') {
          return resolve({
            clips: [{
              nodeId: 'mock-1',
              name: 'Word Animation.mogrt',
              params: [
                { idx: 0, name: 'Fill Color',  kind: 'color',   val: 'aa5500' },
                { idx: 1, name: 'Text Input',  kind: 'text',    val: 'Hello World', rawJson: '{"textEditValue":"Hello World","fontTextRunLength":[11]}' },
                { idx: 2, name: 'Opacity',     kind: 'number',  val: 75 },
                { idx: 3, name: 'Scale',       kind: 'number',  val: 100 },
                { idx: 4, name: 'Bold',        kind: 'boolean', val: false },
                { idx: 5, name: 'Italic',      kind: 'boolean', val: true }
              ]
            }]
          });
        }
        return resolve({ status: 'Complete' });
      }

      // safeCall() already returns a JSON string — just call the function directly.
      // Do NOT wrap with JSON.parse() in ExtendScript: CEP would then receive a JS
      // object and re-serialize it unpredictably, producing [object Object] in the callback.
      var script = params !== undefined
        ? funcName + '(' + JSON.stringify(JSON.stringify(params)) + ')'
        : funcName + '()';

      window.__adobe_cep__.evalScript(script, function (resultStr) {
        if (typeof resultStr === 'string' && resultStr.indexOf('EvalScript error') === 0) {
          reject(new Error(resultStr)); return;
        }
        // Handle case where CEP already parsed the result into an object
        if (typeof resultStr === 'object' && resultStr !== null) {
          var r = resultStr;
          if (r.ok === false) { reject(new Error(r.error || 'JSX error')); return; }
          resolve(r.data !== undefined ? r.data : r);
          return;
        }
        try {
          var result = JSON.parse(resultStr);
          if (result && result.ok === false) {
            reject(new Error(result.error || 'JSX error'));
          } else {
            resolve(result && result.data !== undefined ? result.data : result);
          }
        } catch (e) {
          reject(new Error('Parse error: ' + resultStr));
        }
      });
    });
  }

  // ─── .aegraphic ZIP reader (Node.js — no external packages) ─────────────────
  // The .aegraphic file is a ZIP archive. We find template.json inside it using
  // the ZIP central directory, then decompress with Node's built-in zlib.

  function readTemplateJson(aegraphicPath) {
    try {
      var fs   = require('fs');
      var zlib = require('zlib');

      if (!aegraphicPath || !fs.existsSync(aegraphicPath)) return null;
      var buf = fs.readFileSync(aegraphicPath);

      // ── 1. Find End-of-Central-Directory record (PK\x05\x06) ──────────────
      // Scan backwards from the end (comment field can be up to 64KB).
      var eocd = -1;
      for (var i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
        if (buf[i]===0x50 && buf[i+1]===0x4B && buf[i+2]===0x05 && buf[i+3]===0x06) {
          eocd = i; break;
        }
      }
      if (eocd < 0) return null;

      var cdOffset  = buf.readUInt32LE(eocd + 16); // offset of central directory
      var cdEntries = buf.readUInt16LE(eocd + 10); // total entries

      // ── 2. Scan central directory for template.json ───────────────────────
      var pos = cdOffset;
      for (var e = 0; e < cdEntries; e++) {
        if (buf[pos]!==0x50 || buf[pos+1]!==0x4B || buf[pos+2]!==0x01 || buf[pos+3]!==0x02) break;

        var method   = buf.readUInt16LE(pos + 10);
        var cmpSize  = buf.readUInt32LE(pos + 20);
        var fnLen    = buf.readUInt16LE(pos + 28);
        var exLen    = buf.readUInt16LE(pos + 30);
        var cmtLen   = buf.readUInt16LE(pos + 32);
        var lhOffset = buf.readUInt32LE(pos + 42); // local header offset
        var entryName = buf.slice(pos + 46, pos + 46 + fnLen).toString('utf8');

        if (entryName === 'template.json' || entryName.slice(-14) === '/template.json') {
          // ── 3. Jump to local file header to find data start ───────────────
          var lfnLen    = buf.readUInt16LE(lhOffset + 26);
          var lexLen    = buf.readUInt16LE(lhOffset + 28);
          var dataStart = lhOffset + 30 + lfnLen + lexLen;

          var raw     = buf.slice(dataStart, dataStart + cmpSize);
          var content = (method === 8) ? zlib.inflateRawSync(raw) : raw;
          return JSON.parse(content.toString('utf8'));
        }

        pos += 46 + fnLen + exLen + cmtLen;
      }
    } catch (e) {}
    return null;
  }

  // Recursively collect all displayName strings from template.json.
  // Works regardless of which AE version produced the template or how it's nested.
  function extractDisplayNames(obj, depth, result) {
    if (!obj || typeof obj !== 'object' || depth > 10) return;
    if (!result) result = [];
    if (typeof obj.displayName === 'string' && obj.displayName) result.push(obj.displayName);
    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length; k++) {
      var child = obj[keys[k]];
      if (child && typeof child === 'object') extractDisplayNames(child, depth + 1, result);
    }
    return result;
  }

  // Filter and reorder JSX params to match the template's authored order.
  // Params not found in the schema are hidden (they're internal Premiere props).
  function applySchema(jsxParams, schemaNames) {
    var editable = jsxParams.filter(function(p){ return p.kind !== 'complex' && p.kind !== 'group'; });
    if (!schemaNames || !schemaNames.length) return editable;
    var byName = {};
    editable.forEach(function (p) { byName[p.displayName] = p; });
    var ordered = schemaNames.reduce(function (acc, name) {
      if (byName[name]) acc.push(byName[name]);
      return acc;
    }, []);
    return ordered.length > 0 ? ordered : editable;
  }

  // ─── Data normalization ───────────────────────────────────────────────────────
  // Converts JSX structured { nodeId, name, path, params: [{ idx, name, kind, val, rawJson? }] }
  // into internal { nodeId, name, path, params: [{ index, displayName, kind, value, isColor, displayValue, rawJson }] }

  function normalizeClips(rawClips) {
    if (!rawClips || !rawClips.length) return [];
    return rawClips.map(function (clip) {
      var params = (clip.params || []).map(function (p) {
        var isColor      = p.kind === 'color';
        var value        = p.val;
        var displayValue = null;
        var rawJson      = p.rawJson || null;

        if (isColor) {
          var hex = p.val || '888888';
          value = { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16) };
        } else if (p.kind === 'text') {
          displayValue = p.val;
          value        = p.val;
        }

        return {
          index:        p.idx,
          displayName:  p.name,
          kind:         p.kind,
          value:        value,
          isColor:      isColor,
          displayValue: displayValue,
          rawJson:      rawJson
        };
      });

      return { nodeId: clip.nodeId, name: clip.name, path: clip.path || '', params: params };
    });
  }

  // ─── Color utilities ──────────────────────────────────────────────────────────
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0, s = max === 0 ? 0 : d / max, v = max;
    if (d !== 0) {
      if      (max === r) h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else                h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: s, v: v };
  }

  function hsvToRgb(h, s, v) {
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    var r = 0, g = 0, b = 0;
    if      (h < 60)  { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else              { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function colorObjToHex(obj) {
    if (!obj) return '#888888';
    var r = clamp(Math.round(obj.r || 0), 0, 255);
    var g = clamp(Math.round(obj.g || 0), 0, 255);
    var b = clamp(Math.round(obj.b || 0), 0, 255);
    return '#' + [r, g, b].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }

  // ─── Color Picker Modal ───────────────────────────────────────────────────────
  function ColorPickerModal({ initialRgb, onConfirm, onCancel }) {
    var initHsv = rgbToHsv(initialRgb[0], initialRgb[1], initialRgb[2]);
    var [hue, setHue] = useState(initHsv.h);
    var [sat, setSat] = useState(initHsv.s);
    var [bri, setBri] = useState(initHsv.v);
    var [hexInput, setHexInput] = useState(
      initialRgb.map(function (v) { return v.toString(16).padStart(2,'0'); }).join('').toUpperCase()
    );

    var sbRef  = useRef(null);
    var hueRef = useRef(null);

    var rgb = useMemo(() => hsvToRgb(hue, sat, bri), [hue, sat, bri]);

    useEffect(() => {
      setHexInput(rgb.map(function (v) { return v.toString(16).padStart(2,'0'); }).join('').toUpperCase());
    }, [rgb[0], rgb[1], rgb[2]]);

    function useDrag(ref, onMove) {
      var dragging = useRef(false);
      useEffect(() => {
        var el = ref.current;
        if (!el) return;
        function getPos(e) {
          var rect = el.getBoundingClientRect();
          var cx = (e.touches ? e.touches[0].clientX : e.clientX);
          var cy = (e.touches ? e.touches[0].clientY : e.clientY);
          return { x: clamp((cx - rect.left) / rect.width, 0, 1), y: clamp((cy - rect.top) / rect.height, 0, 1) };
        }
        function onDown(e) { dragging.current = true; onMove(getPos(e)); e.preventDefault(); }
        function onUp()    { dragging.current = false; }
        function onMoveG(e) { if (dragging.current) onMove(getPos(e)); }
        el.addEventListener('mousedown',  onDown);
        el.addEventListener('touchstart', onDown, { passive: false });
        window.addEventListener('mousemove',  onMoveG);
        window.addEventListener('touchmove',  onMoveG, { passive: false });
        window.addEventListener('mouseup',    onUp);
        window.addEventListener('touchend',   onUp);
        return () => {
          el.removeEventListener('mousedown',  onDown);
          el.removeEventListener('touchstart', onDown);
          window.removeEventListener('mousemove',  onMoveG);
          window.removeEventListener('touchmove',  onMoveG);
          window.removeEventListener('mouseup',    onUp);
          window.removeEventListener('touchend',   onUp);
        };
      }, [onMove]);
    }

    useDrag(sbRef,  useCallback(({ x, y }) => { setSat(x); setBri(1 - y); }, []));
    useDrag(hueRef, useCallback(({ x }) => { setHue(x * 360); }, []));

    function handleHexChange(e) {
      var v = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
      setHexInput(v.toUpperCase());
      if (v.length === 6) {
        var rgb2 = hexToRgb('#' + v);
        var hsv2 = rgbToHsv(rgb2[0], rgb2[1], rgb2[2]);
        setHue(hsv2.h); setSat(hsv2.s); setBri(hsv2.v);
      }
    }

    function handleRgbChange(channel, v) {
      var val = clamp(parseInt(v, 10) || 0, 0, 255);
      var cur = rgb.slice();
      cur[channel] = val;
      var hsv2 = rgbToHsv(cur[0], cur[1], cur[2]);
      setHue(hsv2.h); setSat(hsv2.s); setBri(hsv2.v);
    }

    var sbBg      = 'hsl(' + hue + ',100%,50%)';
    var previewBg = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
    var sbX       = sat * 100 + '%';
    var sbY       = (1 - bri) * 100 + '%';
    var hueX      = (hue / 360) * 100 + '%';

    return (
      <div className="mpe-picker-overlay" onClick={function(e){ if(e.target===e.currentTarget) onCancel(); }}>
        <div className="mpe-picker-modal">
          <div className="mpe-picker-title">Pick Color</div>

          <div className="mpe-picker-sb-rect" ref={sbRef} style={{ background: sbBg }}>
            <div className="mpe-picker-sb-rect__white" />
            <div className="mpe-picker-sb-rect__black" />
            <div className="mpe-picker-sb-cursor" style={{ left: sbX, top: sbY }} />
          </div>

          <div className="mpe-picker-hue-row">
            <div className="mpe-picker-hue-strip" ref={hueRef}>
              <div className="mpe-picker-hue-thumb" style={{ left: hueX, background: 'hsl('+hue+',100%,50%)' }} />
            </div>
            <div className="mpe-picker-preview" style={{ background: previewBg }} />
          </div>

          <div className="mpe-picker-inputs">
            <div className="mpe-picker-input-group mpe-picker-hex-group">
              <div className="mpe-picker-input-label">Hex</div>
              <input className="mpe-picker-hex-input" value={hexInput} onChange={handleHexChange} maxLength={6} />
            </div>
            {[['R', 0], ['G', 1], ['B', 2]].map(function([label, ch]) {
              return (
                <div className="mpe-picker-input-group" key={label}>
                  <div className="mpe-picker-input-label">{label}</div>
                  <input className="mpe-picker-num-input" type="number" min="0" max="255"
                    value={rgb[ch]}
                    onChange={function(e){ handleRgbChange(ch, e.target.value); }} />
                </div>
              );
            })}
          </div>

          <div className="mpe-picker-actions">
            <button className="mpe-picker-btn" onClick={onCancel}>Cancel</button>
            <button className="mpe-picker-btn mpe-picker-btn--primary"
              onClick={function(){ onConfirm({ r: rgb[0], g: rgb[1], b: rgb[2] }); }}>
              Apply
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Individual param row ─────────────────────────────────────────────────────
  function MogrtControl({ param, nodeId, onApply }) {
    var [localValue, setLocalValue] = useState(param.kind === 'text' ? param.displayValue : param.value);
    var [isPending, setIsPending]   = useState(false);
    var [showPicker, setShowPicker] = useState(false);
    var applyTimer = useRef(null);

    useEffect(() => {
      if (!isPending) {
        setLocalValue(param.kind === 'text' ? param.displayValue : param.value);
      }
    }, [JSON.stringify(param.value), param.displayValue]);

    var scheduleApply = useCallback(function (newValue) {
      clearTimeout(applyTimer.current);
      applyTimer.current = setTimeout(async function () {
        setIsPending(true);
        try { await onApply({ nodeId: nodeId, paramIndex: param.index, value: newValue }); }
        finally { setIsPending(false); }
      }, 280);
    }, [nodeId, param.index, onApply]);

    function handleTextBlur(e) {
      var newText = e.target.value;
      if (param.rawJson) {
        var obj = {};
        try { obj = JSON.parse(param.rawJson); } catch (_) {}
        obj.textEditValue     = newText;
        obj.fontTextRunLength = [newText.length];
        scheduleApply(JSON.stringify(obj));
      } else {
        scheduleApply(newText);
      }
    }

    function handleNumberChange(e) {
      var v = parseFloat(e.target.value);
      if (!isNaN(v)) { setLocalValue(v); scheduleApply(v); }
    }

    function handleBoolChange(e) {
      var v = e.target.checked;
      setLocalValue(v);
      scheduleApply(v);
    }

    function handleColorConfirm(rgbObj) {
      setShowPicker(false);
      setLocalValue(rgbObj);
      scheduleApply(rgbObj);
    }

    var hex = param.isColor ? colorObjToHex(localValue && typeof localValue === 'object' ? localValue : param.value) : null;
    var initialRgbForPicker = (localValue && typeof localValue === 'object' && 'r' in localValue)
      ? [localValue.r, localValue.g, localValue.b]
      : [0, 0, 0];

    return (
      <div className={'mpe-control' + (isPending ? ' mpe-control--pending' : '')}>
        <div className="mpe-control__name">
          {param.displayName}
          <span className="mpe-kind-badge">{param.kind}</span>
        </div>
        <div className="mpe-control__value">

          {param.isColor ? (
            <>
              <div className="mpe-color-row">
                <div
                  className="mpe-color-swatch"
                  style={{ background: hex }}
                  onClick={function(){ setShowPicker(true); }}
                  title="Click to open color picker"
                />
                <span
                  className="mpe-color-hex-label"
                  onClick={function(){ setShowPicker(true); }}
                >
                  #{hex ? hex.slice(1).toUpperCase() : '------'}
                </span>
                <button className="mpe-color-picker-trigger" onClick={function(){ setShowPicker(true); }}>Edit</button>
              </div>
              {showPicker && (
                <ColorPickerModal
                  initialRgb={initialRgbForPicker}
                  onConfirm={handleColorConfirm}
                  onCancel={function(){ setShowPicker(false); }}
                />
              )}
            </>
          ) : param.kind === 'text' ? (
            <textarea
              className="mpe-text-input"
              rows={3}
              defaultValue={localValue}
              onBlur={handleTextBlur}
              onChange={function(e){ setLocalValue(e.target.value); }}
              placeholder="Enter text…"
            />
          ) : param.kind === 'boolean' ? (
            <label className="mpe-toggle-label">
              <input type="checkbox" checked={!!localValue} onChange={handleBoolChange} />
              <span className="mpe-toggle-track" />
              <span className="mpe-toggle-value-text">{localValue ? 'On' : 'Off'}</span>
            </label>
          ) : (
            <div className="mpe-number-row">
              <input
                className="mpe-number-input"
                type="number"
                value={typeof localValue === 'number' ? parseFloat(localValue.toFixed(4)) : (localValue || 0)}
                onChange={handleNumberChange}
                step="0.01"
              />
            </div>
          )}

        </div>
      </div>
    );
  }

  // ─── Vector (multi-component) control ────────────────────────────────────────
  function MogrtVectorControl({ param, nodeId, onApply }) {
    var parts = (param.value || '').split(',').map(Number);
    var labels = parts.length === 2 ? ['X', 'Y'] : parts.length === 3 ? ['X', 'Y', 'Z'] : parts.map(function(_,i){ return i; });
    var [localParts, setLocalParts] = useState(parts);
    var applyTimer = useRef(null);

    useEffect(function() {
      setLocalParts((param.value || '').split(',').map(Number));
    }, [param.value]);

    function handleChange(idx, rawVal) {
      var v = parseFloat(rawVal);
      if (isNaN(v)) return;
      var next = localParts.slice();
      next[idx] = v;
      setLocalParts(next);
      clearTimeout(applyTimer.current);
      applyTimer.current = setTimeout(function() {
        onApply({ nodeId: nodeId, paramIndex: param.index, value: next.join(',') });
      }, 280);
    }

    return (
      <div className="mpe-control">
        <div className="mpe-control__name">
          {param.displayName}
          <span className="mpe-kind-badge">vector</span>
        </div>
        <div className="mpe-vector-row">
          {localParts.map(function(v, i) {
            return (
              <div key={i} className="mpe-vector-field">
                <span className="mpe-vector-label">{labels[i]}</span>
                <input
                  className="mpe-number-input"
                  type="number"
                  value={parseFloat(v.toFixed(3))}
                  onChange={function(e){ handleChange(i, e.target.value); }}
                  step="0.1"
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Param tree builder ───────────────────────────────────────────────────────
  // Converts the flat param list into a nested tree using each group's UUID child
  // count. Groups list their direct children as semicolon-separated UUIDs — the
  // count tells us how many of the following flat items belong to that group.
  // Algorithm: stack-based, O(n). Works for arbitrary nesting depth.
  function buildParamTree(flatParams) {
    var root = { kind: 'root', children: [] };
    var stack = [{ node: root, remaining: Infinity }];

    flatParams.forEach(function(p) {
      if (p.kind === 'complex') return; // complex never enters the tree
      var top = stack[stack.length - 1];

      if (p.kind === 'group') {
        // After normalizeClips, the UUID list is in p.value (not p.val)
        var uuidStr = p.value || '';
        var childCount = uuidStr
          ? uuidStr.replace(/;+$/, '').split(';').filter(Boolean).length
          : 0;
        var node = { kind: 'group', name: p.displayName || 'Group', index: p.index, children: [] };
        top.node.children.push(node);
        if (top.remaining !== Infinity) {
          top.remaining--;
          if (top.remaining <= 0) stack.pop();
        }
        if (childCount > 0) stack.push({ node: node, remaining: childCount });
      } else {
        top.node.children.push(p);
        if (top.remaining !== Infinity) {
          top.remaining--;
          if (top.remaining <= 0) stack.pop();
        }
      }
    });

    return root.children;
  }

  // ─── Param list with recursive collapsible groups ────────────────────────────
  function ParamList({ params, nodeId, onApply }) {
    var tree = useMemo(function() { return buildParamTree(params); }, [params]);

    // Collect all group indices so every group gets a slot in collapsed state
    function collectGroupIndices(nodes, out) {
      nodes.forEach(function(n) {
        if (n.kind === 'group') { out.push(n.index); collectGroupIndices(n.children, out); }
      });
      return out;
    }

    var [collapsed, setCollapsed] = useState(function() {
      var m = {};
      collectGroupIndices(tree, []).forEach(function(i) { m[i] = false; });
      return m;
    });

    // When tree changes (clip switched), ensure new groups have state
    useEffect(function() {
      var indices = collectGroupIndices(tree, []);
      setCollapsed(function(prev) {
        var next = Object.assign({}, prev);
        indices.forEach(function(i) { if (!(i in next)) next[i] = false; });
        return next;
      });
    }, [tree]);

    function toggleGroup(idx) {
      setCollapsed(function(prev) {
        var next = Object.assign({}, prev);
        // Default to expanded (false) if not yet set, then flip
        next[idx] = !(idx in prev ? prev[idx] : false);
        return next;
      });
    }

    function renderNodes(nodes, depth) {
      return nodes.map(function(node) {
        if (node.kind === 'group') {
          var isOpen = !collapsed[node.index];
          return (
            <div key={node.index} className="mpe-section">
              <div
                className={'mpe-group-header' + (depth > 0 ? ' mpe-group-header--sub' : '')}
                style={depth > 0 ? { paddingLeft: (15 + depth * 12) + 'px' } : {}}
                onClick={function(){ toggleGroup(node.index); }}
              >
                <span className={'mpe-group-arrow' + (isOpen ? ' mpe-group-arrow--open' : '')}>›</span>
                {node.name}
              </div>
              {isOpen && (
                <div className={depth > 0 ? 'mpe-group-children' : ''}>
                  {renderNodes(node.children, depth + 1)}
                </div>
              )}
            </div>
          );
        }
        if (node.kind === 'skip' || node.kind === 'complex') return null;
        if (node.kind === 'vector') {
          return (
            <MogrtVectorControl
              key={node.index}
              param={node}
              nodeId={nodeId}
              onApply={onApply}
            />
          );
        }
        return (
          <MogrtControl
            key={node.index}
            param={node}
            nodeId={nodeId}
            onApply={onApply}
          />
        );
      });
    }

    return <div>{renderNodes(tree, 0)}</div>;
  }

  // ─── Main component ───────────────────────────────────────────────────────────
  function MogrtParamEditor() {
    var [clips, setClips]               = useState([]);
    var [activeClipIdx, setActiveClipIdx] = useState(0);
    var [status, setStatus]             = useState('idle'); // 'live' | 'idle' | 'error'
    var [dbg, setDbg]                   = useState('init...');
    var [isTabVisible, setIsTabVisible] = useState(false);
    var [lastUpdated, setLastUpdated]   = useState(null);
    var prevClipsJson = useRef('');
    var eventsInitialized = useRef(false);

    function applyClips(rawClips, onDbg) {
      var normalized = normalizeClips(rawClips);

      // ── Schema merge: read template.json from each clip's .aegraphic file ──
      if (window.__adobe_cep__) {
        normalized = normalized.map(function (clip) {
          if (!clip.path) { if (onDbg) onDbg('nopath'); return clip; }
          var schema = readTemplateJson(clip.path);
          if (!schema) { if (onDbg) onDbg('schema=NULL'); return clip; }
          var names = extractDisplayNames(schema, 0, []);
          if (onDbg) onDbg('schema=' + names.length + 'names');
          clip.params = applySchema(clip.params, names);
          return clip;
        });
      }

      var json = JSON.stringify(normalized);
      if (json !== prevClipsJson.current) {
        prevClipsJson.current = json;
        setClips(normalized);
        setActiveClipIdx(function(idx) { return Math.min(idx, Math.max(0, normalized.length - 1)); });
      }
      setLastUpdated(new Date());
      setStatus('live');
      return normalized;
    }

    // Manual refresh
    var fetchParams = useCallback(async function () {
      setDbg('1: ensureMogrtJSX...');
      try {
        await ensureMogrtJSX();
        setDbg('2: JSX ready=' + _jsxReady + ' | calling smGetSelectionParams...');
        var result = await callJSX('smGetSelectionParams');
        if (result && result.clips !== undefined) {
          var rc = result.clips;
          var rawCount = rc[0] && rc[0].params ? rc[0].params.length : 0;
          var kinds = {};
          if (rc[0] && rc[0].params) rc[0].params.forEach(function(p){ kinds[p.kind]=(kinds[p.kind]||0)+1; });
          var schemaNote = '';
          var final = applyClips(rc, function(msg){ schemaNote = msg; });
          var shownCount = final && final[0] ? final[0].params.length : 0;
          setDbg('raw=' + rawCount + ' ' + JSON.stringify(kinds) + ' | ' + schemaNote + ' | shown=' + shownCount);
        } else {
          setDbg('no clips: ' + JSON.stringify(result));
        }
      } catch (e) {
        setStatus('error');
        setDbg('ERR: ' + String(e));
      }
    }, []);

    // Initialize: force-reload JSX from disk (bypasses Premiere's cache), then bind events
    useEffect(() => {
      if (!window.__adobe_cep__) return;
      if (eventsInitialized.current) return;
      eventsInitialized.current = true;

      // Listen for real-time CSXSEvent dispatched by JSX app.bind handlers
      window.__adobe_cep__.addEventListener('freexan.caption.paramsUpdated', function (event) {
        try {
          var raw = JSON.parse(event.data || '[]');
          applyClips(raw, null);
        } catch (e) {}
      });

      // Force-reload mogrt_editor.jsx from disk so Premiere's JSX cache is bypassed
      ensureMogrtJSX().then(function () {
        callJSX('smInitParamEvents').catch(function () {});
        // Immediately fetch current selection after JSX is ready
        fetchParams();
      });
    }, [fetchParams]);

    // Tab visibility detection
    useEffect(() => {
      var tabInput = document.getElementById('tab-params');
      if (!tabInput) return;
      function checkTab() { setIsTabVisible(tabInput.checked); }
      checkTab();
      var allTabs = document.querySelectorAll('.myTab');
      allTabs.forEach(function(t) { t.addEventListener('change', checkTab); });
      return function () { allTabs.forEach(function(t) { t.removeEventListener('change', checkTab); }); };
    }, []);

    // Fetch once when tab becomes visible
    useEffect(() => {
      if (isTabVisible) fetchParams();
      else setStatus('idle');
    }, [isTabVisible, fetchParams]);

    var handleApply = useCallback(async function (data) {
      try { await callJSX('smApplyParam', data); }
      catch (e) { setStatus('error'); }
    }, []);

    var activeClip = clips[activeClipIdx] || null;

    var dotClass = status === 'live'  ? 'mpe-poll-dot'
                 : status === 'error' ? 'mpe-poll-dot mpe-poll-dot--error'
                 :                      'mpe-poll-dot mpe-poll-dot--paused';

    var timeLabel = lastUpdated
      ? (lastUpdated.getHours() + ':' + String(lastUpdated.getMinutes()).padStart(2,'0') + ':' + String(lastUpdated.getSeconds()).padStart(2,'0'))
      : '—';

    return (
      <div className="mpe-root">

        {/* Always-visible debug bar */}
        <div style={{background:'#1a0a0a',borderBottom:'2px solid #ff4444',padding:'5px 8px',fontSize:'11px',color:'#ff8888',fontFamily:'monospace',wordBreak:'break-all'}}>
          <b style={{color:'#ff4444'}}>DBG:</b> {dbg}
        </div>

        <div className="mpe-header">
          <div className="mpe-header-left">
            <span className="mpe-header-title">Params</span>
            {activeClip && (
              <span className="mpe-clip-label" title={activeClip.name}>{activeClip.name}</span>
            )}
          </div>
          <div className="mpe-header-right">
            <span style={{ fontSize: '9px', color: 'var(--mpe-text-dimmer)', fontFamily: 'monospace' }}>{timeLabel}</span>
            <button className="mpe-refresh-btn" onClick={fetchParams} title="Refresh now">↻</button>
            <div className={dotClass} title={status} />
          </div>
        </div>

        {clips.length > 1 && (
          <div className="mpe-clip-tabs">
            {clips.map(function (clip, i) {
              return (
                <button
                  key={clip.nodeId}
                  className={'mpe-clip-tab' + (i === activeClipIdx ? ' mpe-clip-tab--active' : '')}
                  onClick={function(){ setActiveClipIdx(i); }}
                  title={clip.name}
                >
                  {clip.name.length > 16 ? clip.name.slice(0, 16) + '…' : clip.name}
                </button>
              );
            })}
          </div>
        )}

        {!activeClip ? (
          <div className="mpe-empty">
            <div className="mpe-empty-icon">🎛</div>
            <p className="mpe-empty-title">No MOGRT Selected</p>
            <p className="mpe-empty-desc">
              Select a MOGRT clip in the Premiere Pro timeline to view and edit its parameters here.
            </p>
            <div style={{margin:'12px 8px 0',padding:'8px',background:'#3a1a1a',border:'1px solid #ff5555',borderRadius:'4px',fontSize:'11px',color:'#ff9999',fontFamily:'monospace',wordBreak:'break-all',textAlign:'left',lineHeight:'1.5'}}>
              <span style={{color:'#ff5555',fontWeight:'bold'}}>DEBUG: </span>{dbg}
            </div>
          </div>
        ) : (
          <div className="mpe-param-list">
            <ParamList params={activeClip.params} nodeId={activeClip.nodeId} onApply={handleApply} />
          </div>
        )}

      </div>
    );
  }

  // ─── Mount ────────────────────────────────────────────────────────────────────
  var paramsRoot = document.getElementById('react-params-root');
  if (paramsRoot) {
    ReactDOM.createRoot(paramsRoot).render(React.createElement(MogrtParamEditor));
  }

})();
