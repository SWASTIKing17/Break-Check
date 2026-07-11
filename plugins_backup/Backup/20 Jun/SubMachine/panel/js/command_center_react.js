/**
 * =============================================================================
 * freeXan Caption Command Center — React Edition (v4.0.24 - Bug Sweep)
 *
 * Fixes vs v4.0.23 (per docs/guides/Command Center — Architecture & Integration.md):
 *   1.  Inline word rename (dbl-click → input → Enter broadcasts to every MOGRT in phrase)
 *   2.  isPhraseFullySelected uses .every (not .some)
 *   3.  Lock toggle is now an immutable update
 *   4.  Lock state enforced (Sortable onMove, handleSplit/Merge/Transfer all early-return)
 *   5.  .cc-is-active style now actually visible (CSS)
 *   6.  Stable React keys via track-index id
 *   7.  Sortable DOM mutation reverted in onEnd; React owns the move
 *   8.  Sortable mounts once per row (refs for live phrase / map / handlers)
 *   9.  Click-Away on empty Navigator clears selection
 *   10. Snap-back red flash on rejected drop
 *   11. Word transfer is optimistic (matches Split + Merge)
 *   12. Layout shift on phrase-row select removed (constant 2px transparent left border in CSS)
 *   13. Empty state hint when timeline is empty
 *   14. Esc cancels selection / inline edit; Enter commits rename
 *   15. Browser mock data restored for getTimelinePhraseMap + updateMogrtProperty
 *   16. Footer log readability bumped (CSS)
 *   17. requestId guards stale callJSX resolutions
 *   18. Toast surface for failures
 *
 * Lock persistence: localStorage keyed by `${track}-${firstClipIndex}` (lightweight DB).
 * =============================================================================
 */

const { useState, useEffect, useRef, useCallback, useMemo } = React;
console.log('freeXan Caption CC React script loading...');
window.addEventListener('error', function (e) {
    console.error('React Runtime Error:', e);
});

// Safe Framer Motion fallback for CEP environment
const motion = (window.Motion && window.Motion.motion) || (window.FramerMotion && window.FramerMotion.motion) || { div: 'div', span: 'span', section: 'section' };
const AnimatePresence = (window.Motion && window.Motion.AnimatePresence) || (window.FramerMotion && window.FramerMotion.AnimatePresence) || (({ children }) => children);

// --- Lock store (lightweight phrase-lock DB) ---
const lockStore = {
    KEY: 'freexan_caption_phrase_locks_v1',
    _read() {
        try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); }
        catch (e) { return {}; }
    },
    _write(map) {
        try { localStorage.setItem(this.KEY, JSON.stringify(map)); } catch (e) { /* quota */ }
    },
    get(id) { return !!this._read()[id]; },
    set(id, locked) {
        const m = this._read();
        if (locked) m[id] = 1; else delete m[id];
        this._write(m);
    }
};

// --- Stable phrase identity (survives split/merge index reshuffles) ---
const phraseIdOf = (phrase) => {
    const c = phrase && phrase.clips && phrase.clips[0];
    return c ? `${c.track}-${c.index}` : `empty-${Math.random()}`;
};

const sendLog = (msg) => {
    try {
        var logWs = new WebSocket('ws://localhost:4554');
        logWs.onopen = function () {
            logWs.send(JSON.stringify({ type: 'ext_log', source: 'caption', msg: msg }));
            logWs.close();
        };
    } catch (e) { }
};

// --- JSX bridge (with browser mock branch restored, fix #15) ---
const callJSX = (funcName, params) => {
    if (funcName !== 'getTimelinePhraseMap' && funcName !== 'getPlayheadTime' && funcName !== 'listMogrtsInBin') {
        sendLog('Edit Tab Action: ' + funcName + (params ? ' | ' + JSON.stringify(params) : ''));
    }
    return new Promise((resolve, reject) => {
        if (!window.__adobe_cep__) {
            // Mock branch — keeps the panel testable in a plain browser
            if (funcName === 'getTimelinePhraseMap') {
                return resolve([
                    {
                        start: 0, end: 5, isLocked: false,
                        clips: [
                            { text: 'Welcome', start: 0, end: 1, track: 1, index: 0, progression: 1 },
                            { text: 'to', start: 1, end: 2, track: 1, index: 1, progression: 2 },
                            { text: 'freeXan Caption', start: 2, end: 5, track: 1, index: 2, progression: 3 }
                        ]
                    },
                    {
                        start: 5, end: 9, isLocked: false,
                        clips: [
                            { text: 'Built', start: 5, end: 6, track: 1, index: 3, progression: 1 },
                            { text: 'for', start: 6, end: 7, track: 1, index: 4, progression: 2 },
                            { text: 'Editors', start: 7, end: 9, track: 1, index: 5, progression: 3 }
                        ]
                    }
                ]);
            }
            if (funcName === 'updateMogrtProperty') return resolve('Success');
            if (funcName === 'setPlayheadTime') return resolve('Success');
            if (funcName === 'getPlayheadTime') return resolve(6.5); // mock: 6.5 seconds
            if (funcName === 'syncPhraseWithMaster') return resolve({ status: 'Ok', syncedCount: 4 });
            if (funcName === 'listMogrtsInBin') return resolve([
                { name: 'freeXan Caption - Animator Pro.mogrt', nodeId: 'mock-1', mediaPath: '/mock/AnimatorPro.mogrt' },
                { name: 'freeXan Caption - Karaoke.mogrt', nodeId: 'mock-2', mediaPath: '/mock/Karaoke.mogrt' }
            ]);
            if (funcName === 'replacePhraseWithMogrt') return resolve({ status: 'Ok', replaced: 3 });
            return resolve({ status: 'Mock Success' });
        }
        const script = (params !== undefined) ? `${funcName}(${JSON.stringify(params)})` : `${funcName}()`;
        const timeout = setTimeout(() => reject(new Error(`JSX TIMEOUT: ${funcName}`)), 15000);
        window.__adobe_cep__.evalScript(script, (res) => {
            clearTimeout(timeout);
            if (!res || res === 'EvalScript error.') return reject(new Error(`JSX CRASH: ${funcName}`));
            try {
                const parsed = JSON.parse(res);
                if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
                    if (parsed.ok) resolve(parsed.data);
                    else reject(new Error(parsed.error || 'Unknown Backend Error'));
                } else resolve(parsed);
            } catch (e) { resolve(res); }
        });
    });
};

const formatTime = (seconds) => {
    const s = Number(seconds);
    if (!isFinite(s) || s < 0) return '00:00.000';
    const date = new Date(0);
    date.setSeconds(s);
    return date.toISOString().substr(14, 9);
};

// =============================================================================
// Generic MOGRT support — XMP enrichment
// -----------------------------------------------------------------------------
// Each phrase from the backend may correspond to either:
//   - "freexan" mode: one clip per word (legacy)
//   - "generic" mode:    one clip per phrase, with multiple text inputs.
//                        Word→input distribution lives on the projectItem's XMP
//                        under field "freeXan Caption_WordTimings".
//
// We enrich each phrase asynchronously after the initial map loads. Failures
// fall back to freeXan Caption rendering so the UI never breaks.
// =============================================================================
const _genericXmpCache = new Map(); // key: "track-index" → enrichment data
const readGenericClipXMP = async (trackIndex, clipIndex) => {
    const cacheKey = `${trackIndex}-${clipIndex}`;
    if (_genericXmpCache.has(cacheKey)) return _genericXmpCache.get(cacheKey);

    if (!window.__adobe_cep__) {
        _genericXmpCache.set(cacheKey, null);
        return null;
    }

    const script = `(function() { try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ok:false, error:'no sequence'});
        var track = seq.videoTracks[${trackIndex}];
        if (!track) return JSON.stringify({ok:false, error:'no track'});
        var clip = track.clips[${clipIndex}];
        if (!clip) return JSON.stringify({ok:false, error:'no clip'});
        if (typeof _smIsGenericClip !== 'function' || !_smIsGenericClip(clip)) {
            return JSON.stringify({ok:true, data:null});
        }
        if (typeof _smReadWordTimings !== 'function') {
            return JSON.stringify({ok:false, error:'no reader'});
        }
        var data = _smReadWordTimings(clip.projectItem);
        return JSON.stringify({ok:true, data: data || null});
    } catch (e) { return JSON.stringify({ok:false, error: String(e)}); } })()`;

    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 5000);
        try {
            window.__adobe_cep__.evalScript(script, (res) => {
                clearTimeout(timer);
                if (!res || res === 'EvalScript error.') { _genericXmpCache.set(cacheKey, null); return resolve(null); }
                try {
                    const parsed = JSON.parse(res);
                    const out = (parsed && parsed.ok && parsed.data) ? parsed.data : null;
                    _genericXmpCache.set(cacheKey, out);
                    resolve(out);
                } catch (e) {
                    _genericXmpCache.set(cacheKey, null);
                    resolve(null);
                }
            });
        } catch (e) {
            clearTimeout(timer);
            _genericXmpCache.set(cacheKey, null);
            resolve(null);
        }
    });
};

// Enrich a phrase map array in place. Each phrase's first clip is probed for
// generic XMP; failures or missing data fall through as mogrtMode="freexan".
const enrichPhrasesWithMogrtMode = async (phrases) => {
    if (!Array.isArray(phrases) || phrases.length === 0) return phrases;
    await Promise.all(phrases.map(async (phrase) => {
        if (!phrase || !phrase.clips || phrase.clips.length === 0) return;
        // Pre-existing backend mogrtMode wins (forward-compat)
        if (phrase.mogrtMode === 'generic' && Array.isArray(phrase.wordDistribution)) return;
        const first = phrase.clips[0];
        if (!first || typeof first.track !== 'number' || typeof first.index !== 'number') {
            phrase.mogrtMode = phrase.mogrtMode || 'freexan';
            return;
        }
        const xmp = await readGenericClipXMP(first.track, first.index);
        if (xmp && Array.isArray(xmp.words) && xmp.words.length > 0) {
            phrase.mogrtMode = 'generic';
            phrase.wordTimings = xmp.words;
            phrase.wordDistribution = Array.isArray(xmp.distribution) && xmp.distribution.length > 0
                ? xmp.distribution
                : [xmp.words.map((_, i) => i)]; // single-input fallback
            phrase.textInputCount = xmp.textInputCount || phrase.wordDistribution.length;
            phrase.textInputNames = Array.isArray(xmp.textInputNames) ? xmp.textInputNames : [];
        } else {
            phrase.mogrtMode = phrase.mogrtMode || 'freexan';
        }
    }));
    return phrases;
};

// --- Toast (fix #18) ---
const ToastZone = ({ toasts }) => (
    <div className="cc-toast-zone">
        {toasts.map(t => (
            <div key={t.id} className={`cc-toast cc-toast-${t.kind || 'info'}`}>{t.message}</div>
        ))}
    </div>
);

// --- Mini Timeline (NEW) ---
const MiniTimeline = ({ timelineMap, activePhraseIdx, onSelect }) => {
    if (!timelineMap || timelineMap.length === 0) return null;

    // Calculate total duration for scaling
    const start = timelineMap[0]?.start || 0;
    const end = timelineMap[timelineMap.length - 1]?.end || 1;
    const totalDuration = Math.max(0.1, end - start);

    return (
        <div className="cc-mini-timeline">
            {timelineMap.map((phrase, idx) => {
                const phraseDur = Math.max(0, phrase.end - phrase.start);
                const width = (phraseDur / totalDuration) * 100;
                return (
                    <div
                        key={idx}
                        className={`cc-mini-phrase-block ${activePhraseIdx === idx ? 'is-active' : ''}`}
                        style={{ width: `${Math.max(width, 2)}%` }}
                        onClick={() => onSelect(idx)}
                    >
                        {idx % 5 === 0 && (
                            <span className="cc-mini-time-label">{formatTime(phrase.start)}</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// --- Value Scrubbing Hook (Premiere Style) ---
const useScrubber = (value, onChange, step = 1) => {
    const startXRef = useRef(0);
    const startValRef = useRef(0);

    const onMouseDown = (e) => {
        startXRef.current = e.clientX;
        startValRef.current = parseFloat(value) || 0;

        // Create invisible overlay to capture all mouse moves
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.zIndex = '9999';
        overlay.style.cursor = 'ew-resize';
        document.body.appendChild(overlay);

        const onMouseMove = (ev) => {
            const delta = ev.clientX - startXRef.current;
            onChange(startValRef.current + (delta * step));
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            if (overlay && overlay.parentNode) {
                document.body.removeChild(overlay);
            }
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    return { onMouseDown };
};

// --- Word bubble (also handles inline rename, fix #1) ---
// `word` (optional) — for generic-MOGRT phrases, the per-word timing record
// { text, start, end } extracted from the clip's XMP. When present, click
// scrubs to word.start instead of clip.start (the clip spans the whole phrase).
const WordBubble = ({
    clip, word, pIdx, cIdx, isActive, isSelected, isLast, isEditing, isPhraseLocked,
    isPlayhead,
    onClick, onDoubleClick, onSplit, onEditCommit, onEditCancel
}) => {
    const clipId = `${pIdx}-${cIdx}`;
    const inputRef = useRef(null);
    const displayText = (word && word.text) || (clip && clip.text) || '...';
    // For scrub target / click payload, prefer the word-level timing when available.
    const clickTarget = word
        ? { ...clip, start: word.start, end: word.end, text: word.text, _genericWord: true }
        : clip;

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    return (
        <React.Fragment>
            {isEditing ? (
                <input
                    ref={inputRef}
                    className="cc-word-edit"
                    defaultValue={displayText}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                            const v = e.target.value.trim();
                            if (!v || v === displayText) onEditCancel();
                            else onEditCommit(v);
                        } else if (e.key === 'Escape') {
                            onEditCancel();
                        }
                    }}
                    onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (!v || v === displayText) onEditCancel();
                        else onEditCommit(v);
                    }}
                />
            ) : (
                <div
                    id={`cc-word-${pIdx}-${cIdx}`}
                    className={[
                        'cc-word-pill',
                        isActive ? 'cc-is-active' : '',
                        isSelected ? 'cc-is-selected' : '',
                        isPhraseLocked ? 'cc-is-locked' : '',
                        isPlayhead ? 'cc-is-playhead' : ''
                    ].join(' ').trim()}
                    data-clip-id={clipId}
                    data-phrase-id={pIdx}
                    data-word-index={cIdx}
                    onClick={(e) => onClick(clickTarget, clipId, e)}
                    onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(clickTarget, pIdx, cIdx); }}
                >
                    {displayText}
                </div>
            )}
            {!isLast && (
                <motion.div
                    layout
                    className="cc-laser-gap"
                    onClick={(e) => { e.stopPropagation(); onSplit(pIdx, cIdx); }}
                >
                    <div className="cc-laser-line"></div>
                </motion.div>
            )}
        </React.Fragment>
    );
};

// --- Phrase row ---
// --- Inspector Components ---

// --- Dashboard Components ---
const EmptyDashboard = ({ onRefresh }) => (
    <div className="cc-empty-dashboard">
        <div className="cc-empty-art">
            <div className="cc-empty-icon">📂</div>
            <div className="cc-empty-ring"></div>
        </div>
        <h3>No Phrases Detected</h3>
        <p>Drop a freeXan Caption MOGRT onto the timeline and click refresh to start editing.</p>
        <button className="cc-btn cc-btn-primary" onClick={onRefresh} style={{ marginTop: '12px' }}>
            ↻ Refresh Timeline
        </button>
    </div>
);

const ToggleTile = ({ prop, handlePropChange, index }) => {
    const isActive = prop.value === 1;
    // Extract word number from "Word 1 Highlight" or similar
    const wordNum = prop.displayName.match(/\d+/) || index + 1;

    return (
        <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`cc-toggle-tile ${isActive ? 'is-active' : ''}`}
            onClick={() => handlePropChange(prop.index, prop.displayName, isActive ? 0 : 1)}
            title={prop.displayName}
        >
            <span className="cc-tile-label">{wordNum}</span>
            {isActive && <div className="cc-tile-glow"></div>}
        </motion.div>
    );
};

const HighlightGrid = ({ props, handlePropChange }) => {
    if (!props || props.length === 0) return null;

    return (
        <div className="cc-highlight-section">
            <div className="cc-section-header">
                <span className="cc-section-icon">✨</span>
                <span className="cc-section-title">Word Highlights</span>
            </div>
            <div className="cc-highlight-grid">
                {props.map((prop, idx) => (
                    <ToggleTile
                        key={prop.index}
                        prop={prop}
                        handlePropChange={handlePropChange}
                        index={idx}
                    />
                ))}
            </div>
        </div>
    );
};

// --- Color Utilities ---
const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
};

const rgbToHex = (r, g, b) => {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
};

const rgbToHsb = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) { h = 0; }
    else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, b: v * 100 };
};

const hsbToRgb = (h, s, v) => {
    s /= 100; v /= 100;
    let r, g, b;
    const i = Math.floor(h / 60);
    const f = h / 60 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
};

// --- Cockpit Color Picker (NEW) ---
const CockpitColorPicker = ({ initialHex, onChange, onClose }) => {
    const [hsb, setHsb] = useState(() => {
        const rgb = hexToRgb(initialHex);
        return rgbToHsb(rgb.r, rgb.g, rgb.b);
    });

    const [history, setHistory] = useState(() => {
        try { return JSON.parse(localStorage.getItem('freexan_caption_color_history') || '["#29BFBE", "#8A63F2", "#FF4D4D", "#FFFFFF", "#000000"]'); }
        catch (e) { return ["#29BFBE"]; }
    });

    const currentHex = useMemo(() => {
        const rgb = hsbToRgb(hsb.h, hsb.s, hsb.b);
        return rgbToHex(rgb.r, rgb.g, rgb.b);
    }, [hsb]);

    const handleHsbChange = (updates) => {
        const newHsb = { ...hsb, ...updates };
        setHsb(newHsb);
        const rgb = hsbToRgb(newHsb.h, newHsb.s, newHsb.b);
        onChange(rgbToHex(rgb.r, rgb.g, rgb.b));
    };

    const addToHistory = (hex) => {
        const newHistory = [hex, ...history.filter(c => c !== hex)].slice(0, 6);
        setHistory(newHistory);
        localStorage.setItem('freexan_caption_color_history', JSON.stringify(newHistory));
    };

    // Color Theory Generators
    const theory = useMemo(() => {
        const comp = { ...hsb, h: (hsb.h + 180) % 360 };
        const triad1 = { ...hsb, h: (hsb.h + 120) % 360 };
        const triad2 = { ...hsb, h: (hsb.h + 240) % 360 };
        const analo1 = { ...hsb, h: (hsb.h + 30) % 360 };
        const analo2 = { ...hsb, h: (hsb.h - 30 + 360) % 360 };

        const toHex = (h) => {
            const rgb = hsbToRgb(h.h, h.s, h.b);
            return rgbToHex(rgb.r, rgb.g, rgb.b);
        };

        return {
            complementary: [toHex(comp)],
            triadic: [toHex(triad1), toHex(triad2)],
            analogous: [toHex(analo1), toHex(analo2)]
        };
    }, [hsb]);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="cc-color-picker-cockpit"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="cc-cp-header">
                <span className="cc-cp-title">Color Picker</span>
                <button className="cc-cp-close" onClick={() => { addToHistory(currentHex); onClose(); }}>✕</button>
            </div>

            <div className="cc-cp-main">
                <div
                    className="cc-cp-sat-val"
                    style={{ backgroundColor: `hsl(${hsb.h}, 100%, 50%)` }}
                    onMouseDown={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const update = (ev) => {
                            const s = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
                            const v = Math.max(0, Math.min(100, (1 - (ev.clientY - rect.top) / rect.height) * 100));
                            handleHsbChange({ s, b: v });
                        };
                        update(e);
                        const onMove = (ev) => update(ev);
                        const onUp = () => {
                            window.removeEventListener('mousemove', onMove);
                            window.removeEventListener('mouseup', onUp);
                        };
                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onUp);
                    }}
                >
                    <div className="cc-cp-white-grad"></div>
                    <div className="cc-cp-black-grad"></div>
                    <motion.div
                        className="cc-cp-cursor"
                        style={{ left: `${hsb.s}%`, top: `${100 - hsb.b}%` }}
                    />
                </div>

                <div className="cc-cp-sliders">
                    <div className="cc-cp-hue-slider-wrap">
                        <input
                            type="range" min="0" max="360" value={hsb.h}
                            onChange={(e) => handleHsbChange({ h: parseFloat(e.target.value) })}
                            className="cc-cp-hue-slider"
                        />
                    </div>
                </div>
            </div>

            <div className="cc-cp-tabs">
                <span className="cc-cp-tab active">Hex</span>
                <span className="cc-cp-tab">RGB</span>
                <span className="cc-cp-tab">HSL</span>
            </div>

            <div className="cc-cp-inputs">
                <div className="cc-cp-input-group">
                    <span className="cc-cp-input-icon">#</span>
                    <input
                        type="text" value={currentHex.replace('#', '')}
                        onChange={(e) => {
                            const hex = '#' + e.target.value;
                            if (/^#[0-9A-F]{6}$/i.test(hex)) {
                                const rgb = hexToRgb(hex);
                                setHsb(rgbToHsb(rgb.r, rgb.g, rgb.b));
                                onChange(hex);
                            }
                        }}
                    />
                </div>
                <div className="cc-cp-input-group small">
                    <input
                        type="text"
                        value="100"
                        readOnly
                        className="cc-scrub-text"
                    />
                    <span className="cc-cp-input-suffix">%</span>
                </div>
            </div>

            <div className="cc-cp-theory">
                <div className="cc-cp-theory-col">
                    <span className="cc-cp-theory-label">Complementary</span>
                    <div className="cc-cp-star" style={{ background: theory.complementary[0] }} onClick={() => onChange(theory.complementary[0])}></div>
                </div>
                <div className="cc-cp-theory-col">
                    <span className="cc-cp-theory-label">Triadic</span>
                    <div className="cc-cp-theory-row">
                        <div className="cc-cp-star tri" style={{ background: theory.triadic[0] }} onClick={() => onChange(theory.triadic[0])}></div>
                        <div className="cc-cp-star tri" style={{ background: theory.triadic[1] }} onClick={() => onChange(theory.triadic[1])}></div>
                    </div>
                </div>
                <div className="cc-cp-theory-col">
                    <span className="cc-cp-theory-label">Analogous</span>
                    <div className="cc-cp-theory-row">
                        <div className="cc-cp-star analo" style={{ background: theory.analogous[0] }} onClick={() => onChange(theory.analogous[0])}></div>
                        <div className="cc-cp-star analo" style={{ background: theory.analogous[1] }} onClick={() => onChange(theory.analogous[1])}></div>
                    </div>
                </div>
            </div>

            <div className="cc-cp-history">
                <span className="cc-cp-history-label">Last used</span>
                <div className="cc-cp-history-grid">
                    {history.map((hex, i) => (
                        <div
                            key={i} className="cc-cp-hex-tile"
                            style={{ backgroundColor: hex }}
                            onClick={() => {
                                const rgb = hexToRgb(hex);
                                setHsb(rgbToHsb(rgb.r, rgb.g, rgb.b));
                                onChange(hex);
                            }}
                        />
                    ))}
                </div>
            </div>
        </motion.div>
    );
};

const PropertyControl = ({ prop, handlePropChange, onTogglePin, isPinned }) => {
    const [showPicker, setShowPicker] = useState(false);
    const iconMap = {
        color: '●',
        slider: '─',
        point: '⌗',
        checkbox: '✓'
    };

    return (
        <div className="cc-prop-row-v2">
            <div className="cc-prop-info">
                <span className="cc-prop-icon-small">{iconMap[prop.type] || '📄'}</span>
                <span className="cc-prop-label-v2" title={prop.displayName}>
                    {(prop.displayName || 'Unknown Property')
                        .replace(/Ⓢ|Ⓣ|Ⓑ/g, '')
                        .replace('Text ', '')
                        .replace('Color ', '')
                        .trim()}
                </span>
                <span
                    className="cc-prop-pin"
                    onClick={(e) => { e.stopPropagation(); onTogglePin(prop.displayName); }}
                    style={{ marginLeft: '6px', cursor: 'pointer', opacity: isPinned ? 1 : 0.3, fontSize: '10px' }}
                >
                    📌
                </span>
            </div>

            <div className="cc-prop-control-v2">
                {prop.type === 'color' && (
                    <div className="cc-color-dash" onClick={() => setShowPicker(!showPicker)}>
                        <div className="cc-color-swatch-v2" style={{ background: prop.value }}></div>
                        <span className="cc-color-hex">{prop.value.toUpperCase()}</span>

                        <AnimatePresence>
                            {showPicker && (
                                <CockpitColorPicker
                                    initialHex={prop.value}
                                    onChange={(hex) => handlePropChange(prop.index, prop.displayName, hex)}
                                    onClose={() => setShowPicker(false)}
                                />
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {prop.type === 'checkbox' && (
                    <label className="cc-switch-v2">
                        <input
                            type="checkbox"
                            checked={prop.value === 1}
                            onChange={(e) => handlePropChange(prop.index, prop.displayName, e.target.checked ? 1 : 0)}
                        />
                        <span className="cc-switch-slider-v2"></span>
                    </label>
                )}

                {prop.type === 'slider' && (
                    <div className="cc-scrubber-group">
                        <div className="cc-range-track-v2">
                            <input
                                type="range"
                                min={0} max={prop.displayName.indexOf('Scale') !== -1 ? 500 : 100}
                                value={prop.value}
                                onChange={(e) => handlePropChange(prop.index, prop.displayName, parseFloat(e.target.value))}
                            />
                        </div>
                        <div className="cc-value-scrub" {...useScrubber(prop.value, (val) => handlePropChange(prop.index, prop.displayName, val), 0.5)}>
                            <input
                                type="number"
                                step="0.1"
                                value={Number(prop.value).toFixed(1).replace(/\.0$/, '')}
                                onChange={(e) => handlePropChange(prop.index, prop.displayName, parseFloat(e.target.value) || 0)}
                            />
                        </div>
                    </div>
                )}

                {prop.type === 'point' && Array.isArray(prop.value) && (
                    <div className="cc-point-dash">
                        <div className="cc-point-field" {...useScrubber(prop.value[0], (val) => handlePropChange(prop.index, prop.displayName, [val, prop.value[1]]))}>
                            <input
                                type="number"
                                value={Math.round(prop.value[0])}
                                onChange={(e) => handlePropChange(prop.index, prop.displayName, [parseFloat(e.target.value) || 0, prop.value[1]])}
                            />
                        </div>
                        <div className="cc-point-field" {...useScrubber(prop.value[1], (val) => handlePropChange(prop.index, prop.displayName, [prop.value[0], val]))}>
                            <input
                                type="number"
                                value={Math.round(prop.value[1])}
                                onChange={(e) => handlePropChange(prop.index, prop.displayName, [prop.value[0], parseFloat(e.target.value) || 0])}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const PropertyGroup = ({ group, handlePropChange, onTogglePin, pinnedProps }) => {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <div className={`cc-dash-group ${isOpen ? 'is-open' : ''}`}>
            <div className="cc-dash-group-header" onClick={() => setIsOpen(!isOpen)}>
                <span className="cc-dash-group-arrow">{isOpen ? '▼' : '▶'}</span>
                <span className="cc-dash-group-title">{group.name}</span>
            </div>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="cc-dash-group-content"
                    >
                        {group.props.map((prop, idx) => (
                            <motion.div
                                key={prop.index}
                                initial={{ x: -10, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: idx * 0.03 }}
                            >
                                <PropertyControl
                                    prop={prop}
                                    handlePropChange={handlePropChange}
                                    onTogglePin={onTogglePin}
                                    isPinned={pinnedProps.includes(prop.displayName)}
                                />
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const PhraseRow = ({
    phrase, pIdx, activeClipId, selection, editingClipId, playheadClipId, timelineMapRef,
    onBubbleClick, onBubbleEdit, onLock, onPhraseSelect, onSplit,
    onTransferRef, onInvalidDropRef
}) => {
    const rowRef = useRef(null);
    const bubbleZoneRef = useRef(null);

    // Live refs — keep sortable callbacks stable across renders (fix #8)
    const phraseRef = useRef(phrase); phraseRef.current = phrase;
    const pIdxRef = useRef(pIdx); pIdxRef.current = pIdx;
    const selectionRef = useRef(selection); selectionRef.current = selection;

    // Phrase is fully selected only when EVERY clip is in the selection set (fix #2)
    const isPhraseFullySelected = useMemo(() => {
        if (!phrase || !phrase.clips || phrase.clips.length === 0) return false;
        return phrase.clips.every((_, i) => selection.includes(`${pIdx}-${i}`));
    }, [phrase, selection, pIdx]);

    // Generic-mode detection — drives grouped bubble layout.
    const isGenericMode = phrase && phrase.mogrtMode === 'generic'
        && Array.isArray(phrase.wordDistribution) && phrase.wordDistribution.length > 0
        && Array.isArray(phrase.wordTimings) && phrase.wordTimings.length > 0;

    useEffect(() => {
        // Sortable drag-to-merge only applies to freeXan Caption mode (multiple discrete clips).
        // Generic phrases are a single clip — no cross-phrase word transfer possible.
        if (!bubbleZoneRef.current || isGenericMode) return;
        let lastCrossRowMoveOk = null;
        const sortable = Sortable.create(bubbleZoneRef.current, {
            group: 'phrases',
            sort: false, // word order within a phrase is fixed — dragging never reorders
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            draggable: '.cc-word-pill',
            onStart: (evt) => {
                lastCrossRowMoveOk = null;
                const wordIdx = parseInt(evt.item.dataset.wordIndex);
                const phraseLive = phraseRef.current;
                const pIdxLive = pIdxRef.current;
                const map = timelineMapRef.current;
                document.querySelectorAll('.cc-phrase-row').forEach(r => r.classList.remove('cc-valid-target'));

                if (phraseLive.isLocked) return;

                if (wordIdx === 0 && pIdxLive > 0) {
                    const prev = map[pIdxLive - 1];
                    if (prev && !prev.isLocked) {
                        document.querySelector(`.cc-phrase-row[data-phrase-id="${pIdxLive - 1}"]`)?.classList.add('cc-valid-target');
                    }
                }
                if (wordIdx === phraseLive.clips.length - 1 && pIdxLive < map.length - 1) {
                    const next = map[pIdxLive + 1];
                    if (next && !next.isLocked) {
                        document.querySelector(`.cc-phrase-row[data-phrase-id="${pIdxLive + 1}"]`)?.classList.add('cc-valid-target');
                    }
                }
            },
            onMove: (evt) => {
                const fromIdx = parseInt(evt.from.dataset.phraseId);
                const toIdx = parseInt(evt.to.dataset.phraseId);
                if (fromIdx === toIdx) return true;
                const wordIdx = parseInt(evt.dragged.dataset.wordIndex);
                const map = timelineMapRef.current;
                let ok = true;
                if (Math.abs(fromIdx - toIdx) !== 1) ok = false;
                else if (!map[fromIdx] || !map[toIdx]) ok = false;
                else if (map[fromIdx].isLocked || map[toIdx].isLocked) ok = false;
                else {
                    const phraseLength = map[fromIdx].clips.length;
                    const sel = selectionRef.current || [];
                    const selPositions = sel
                        .filter(s => parseInt(s.split('-')[0]) === fromIdx)
                        .map(s => parseInt(s.split('-')[1]))
                        .sort((a, b) => a - b);
                    const draggedId = `${fromIdx}-${wordIdx}`;
                    let firstPos = wordIdx, lastPos = wordIdx;
                    if (sel.includes(draggedId) && selPositions.length > 1) {
                        let contiguous = true;
                        for (let i = 1; i < selPositions.length; i++) {
                            if (selPositions[i] !== selPositions[i - 1] + 1) { contiguous = false; break; }
                        }
                        if (contiguous && selPositions.length < phraseLength) {
                            firstPos = selPositions[0];
                            lastPos = selPositions[selPositions.length - 1];
                        }
                    }
                    if (toIdx < fromIdx && firstPos !== 0) ok = false;
                    if (toIdx > fromIdx && lastPos !== phraseLength - 1) ok = false;
                }
                lastCrossRowMoveOk = ok;
                return ok;
            },
            onEnd: (evt) => {
                document.querySelectorAll('.cc-phrase-row').forEach(r => r.classList.remove('cc-valid-target'));
                if (evt.from !== evt.to) {
                    const draggables = Array.from(evt.from.querySelectorAll('.cc-word-pill'));
                    const refNode = draggables[evt.oldDraggableIndex] || null;
                    evt.from.insertBefore(evt.item, refNode);
                    onTransferRef.current && onTransferRef.current(evt);
                } else if (lastCrossRowMoveOk === false) {
                    onInvalidDropRef.current && onInvalidDropRef.current(evt.item);
                }
                lastCrossRowMoveOk = null;
            }
        });
        return () => sortable.destroy();
        // NOTE: we re-mount Sortable when mogrt mode flips (e.g. async XMP
        // enrichment promotes a phrase from "freexan" to "generic" and the
        // bubble-zone DOM is recreated). Previous behavior used [] (mount once
        // per row) — that breaks for late-arriving generic data.
    }, [isGenericMode]);

    if (!phrase || !phrase.clips) return null;

    return (
        <motion.div
            ref={rowRef}
            className={`cc-phrase-row ${isPhraseFullySelected ? 'cc-is-selected' : ''} ${phrase.isLocked ? 'cc-is-locked' : ''}`}
            data-phrase-id={pIdx}
            onClick={(e) => onPhraseSelect(pIdx, e.shiftKey || e.ctrlKey || e.metaKey)}
        >
            <div className="cc-phrase-header">
                <div className="cc-phrase-meta">
                    <span style={{ color: 'var(--cc-accent-teal)', fontWeight: 800 }}>#{pIdx + 1}</span>
                    <span>•</span>
                    <span>{formatTime(phrase.start)}</span>
                </div>
                <div className="cc-phrase-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        className="cc-btn cc-lock-btn"
                        onClick={(e) => { e.stopPropagation(); onLock(pIdx, !phrase.isLocked); }}
                        style={{ background: 'none', border: 'none', color: phrase.isLocked ? '#F0AD4E' : '#444', fontSize: '11px', padding: 0 }}
                        title={phrase.isLocked ? 'Locked — click to unlock' : 'Click to lock phrase'}
                    >
                        {phrase.isLocked ? '🔒' : '🔓'}
                    </button>
                </div>
            </div>
            {isGenericMode ? (
                // Generic MOGRT: one clip backs the whole phrase, but words are
                // distributed across N text inputs on that single MOGRT. Render
                // one .cc-bubble-zone per text-input group.
                phrase.wordDistribution.map((wordIndices, inputIdx) => {
                    const inputLabel = (phrase.textInputNames && phrase.textInputNames[inputIdx]) || `Line ${inputIdx + 1}`;
                    return (
                        <div
                            className="cc-bubble-zone cc-bubble-zone-grouped"
                            key={`gen-${pIdx}-${inputIdx}`}
                            data-phrase-id={pIdx}
                            data-input-index={inputIdx}
                        >
                            <span className="cc-input-label" title={inputLabel}>{inputLabel}</span>
                            {wordIndices.map((wIdx, posInRow) => {
                                const word = phrase.wordTimings[wIdx];
                                if (!word) return null;
                                const backingClip = phrase.clips[0]; // generic: single clip
                                const isLastInRow = posInRow === wordIndices.length - 1;
                                return (
                                    <WordBubble
                                        key={`gen-${pIdx}-${inputIdx}-${wIdx}`}
                                        clip={backingClip}
                                        word={word}
                                        pIdx={pIdx}
                                        cIdx={wIdx}
                                        isActive={activeClipId === `${pIdx}-${wIdx}`}
                                        isSelected={selection.includes(`${pIdx}-${wIdx}`)}
                                        isEditing={editingClipId === `${pIdx}-${wIdx}`}
                                        isPlayhead={playheadClipId === `${pIdx}-${wIdx}`}
                                        isPhraseLocked={!!phrase.isLocked}
                                        isLast={isLastInRow}
                                        onClick={onBubbleClick}
                                        onDoubleClick={onBubbleEdit}
                                        onSplit={onSplit}
                                        onEditCommit={(newText) => onBubbleEdit(backingClip, pIdx, wIdx, newText)}
                                        onEditCancel={() => onBubbleEdit(null, -1, -1, null)}
                                    />
                                );
                            })}
                        </div>
                    );
                })
            ) : (
                <div className="cc-bubble-zone" ref={bubbleZoneRef} data-phrase-id={pIdx}>
                    {phrase.clips.map((clip, cIdx) => (
                        <WordBubble
                            key={`${pIdx}-${cIdx}-${clip.index}`}
                            clip={clip} pIdx={pIdx} cIdx={cIdx}
                            isActive={activeClipId === `${pIdx}-${cIdx}`}
                            isSelected={selection.includes(`${pIdx}-${cIdx}`)}
                            isEditing={editingClipId === `${pIdx}-${cIdx}`}
                            isPlayhead={playheadClipId === `${pIdx}-${cIdx}`}
                            isPhraseLocked={!!phrase.isLocked}
                            isLast={cIdx === phrase.clips.length - 1}
                            onClick={onBubbleClick}
                            onDoubleClick={onBubbleEdit}
                            onSplit={onSplit}
                            onEditCommit={(newText) => onBubbleEdit(clip, pIdx, cIdx, newText)}
                            onEditCancel={() => onBubbleEdit(null, -1, -1, null)}
                        />
                    ))}
                </div>
            )}
        </motion.div>
    );
};

// --- Main App ---

const App = () => {
    const [timelineMap, setTimelineMap] = useState([]);
    const [selection, setSelection] = useState([]);
    const [activeClipId, setActiveClipId] = useState(null);
    const [editingClipId, setEditingClipId] = useState(null);
    const [isBusy, setIsBusy] = useState(false);
    const [progress, setProgress] = useState(0);
    const [log, setLog] = useState('Ready');
    const [toasts, setToasts] = useState([]);



    // Playhead follower state
    // playheadClipId: "pIdx-cIdx" string of the word currently under the playhead, or null
    const [playheadClipId, setPlayheadClipId] = useState(null);
    // autoFollow: true while PP is playing; paused for 3s after a manual scroll
    const autoFollowRef = useRef(true);
    const followTimerRef = useRef(null);  // timer to re-enable after manual scroll
    const navigatorRef = useRef(null);  // ref to the .cc-navigator scroller

    // Inspector state
    const [inspectorProps, setInspectorProps] = useState([]);
    const [inspectorIsBusy, setInspectorIsBusy] = useState(false);
    const [searchFilter, setSearchFilter] = useState('');
    const [pinnedProps, setPinnedProps] = useState(() => {
        try { return JSON.parse(localStorage.getItem('freexan_caption_pinned_props_v1') || '[]'); }
        catch (e) { return []; }
    });

    useEffect(() => {
        localStorage.setItem('freexan_caption_pinned_props_v1', JSON.stringify(pinnedProps));
    }, [pinnedProps]);

    const togglePin = (propName) => {
        setPinnedProps(prev => prev.includes(propName) ? prev.filter(p => p !== propName) : [...prev, propName]);
    };

    const inspectorDebounceRef = useRef({});

    const filteredProps = useMemo(() => {
        const props = Array.isArray(inspectorProps) ? inspectorProps : [];
        if (!searchFilter) return props;
        const lowFilter = searchFilter.toLowerCase();
        return props.filter(p => (p.displayName || '').toLowerCase().includes(lowFilter));
    }, [inspectorProps, searchFilter]);

    const timelineMapRef = useRef([]); timelineMapRef.current = timelineMap;
    const onTransferRef = useRef(null);
    const onInvalidDropRef = useRef(null);
    const requestIdRef = useRef(0); // fix #17: race-safe scans

    const pushToast = useCallback((message, kind = 'error') => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, kind }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    }, []);

    // Snap-back flash for invalid drops (fix #10)
    onInvalidDropRef.current = (el) => {
        if (!el) return;
        el.classList.add('cc-invalid-drop');
        setTimeout(() => el.classList.remove('cc-invalid-drop'), 320);
    };

    // Merge persisted lock state into a freshly scanned map (fix #3, #4)
    const applyPersistedLocks = (map) => map.map(p => ({ ...p, isLocked: p.isLocked || lockStore.get(phraseIdOf(p)) }));

    const selectionContiguity = useMemo(() => {
        if (selection.length < 2) return { isContiguous: false, phraseIndices: [] };
        const pIndices = [...new Set(selection.map(s => parseInt(s.split('-')[0])))].sort((a, b) => a - b);
        const isContiguous = (pIndices[pIndices.length - 1] - pIndices[0]) === (pIndices.length - 1);
        return { isContiguous, phraseIndices: pIndices };
    }, [selection]);

    // True when exactly one phrase is selected AND all its clips are selected.
    // This is what enables the 🔄 Replace MOGRT button.
    const isSinglePhraseFullySelected = useMemo(() => {
        if (selection.length === 0) return false;
        const pIndices = [...new Set(selection.map(s => parseInt(s.split('-')[0])))];
        if (pIndices.length !== 1) return false;
        const phrase = timelineMap[pIndices[0]];
        if (!phrase || !Array.isArray(phrase.clips)) return false;
        const allIds = phrase.clips.map((_, i) => `${pIndices[0]}-${i}`);
        return allIds.every(id => selection.includes(id));
    }, [selection, timelineMap]);

    const refreshTimeline = useCallback(async (silent = false) => {
        const myReq = ++requestIdRef.current;
        try {
            setIsBusy(true);
            if (!silent) setLog('Scanning...');
            const response = await callJSX('getTimelinePhraseMap', {});
            if (myReq !== requestIdRef.current) return; // stale (fix #17)
            const fresh = Array.isArray(response) ? response : [];
            // First render with freeXan Caption-style data (instant), then enrich generic phrases.
            setTimelineMap(applyPersistedLocks(fresh));
            // Async generic-MOGRT enrichment — XMP reads are per-clip evalScripts.
            // We re-render once enrichment completes; failures fall back to freeXan Caption.
            try {
                await enrichPhrasesWithMogrtMode(fresh);
                if (myReq !== requestIdRef.current) return;
                setTimelineMap(applyPersistedLocks(fresh.slice())); // new array ref to trigger render
            } catch (enrichErr) {
                console.warn('[CC] Generic MOGRT enrichment failed:', enrichErr);
            }
            setLog('Ready');
        } catch (e) {
            if (myReq !== requestIdRef.current) return;
            setLog('Scan Failed');
            pushToast('Timeline scan failed: ' + (e.message || 'unknown'), 'error');
        } finally {
            if (myReq === requestIdRef.current) {
                setIsBusy(false); setProgress(0);
            }
        }
    }, [pushToast]);

    // Inspector data fetching
    useEffect(() => {
        const fetchInspector = async () => {
            if (selection.length === 0) {
                setInspectorProps([]);
                return;
            }
            // Only fetch if a single phrase is targeted (either fully or partially)
            const pIndices = [...new Set(selection.map(s => parseInt(s.split('-')[0])))];
            if (pIndices.length !== 1) {
                setInspectorProps([]);
                return;
            }

            const pIdx = pIndices[0];
            const phrase = timelineMapRef.current[pIdx];
            if (!phrase || phrase.clips.length === 0) return;

            // Fetch from the first selected clip
            const firstSelectedCIdx = parseInt(selection[0].split('-')[1]);
            const clip = phrase.clips[firstSelectedCIdx];
            if (!clip) return;

            setInspectorIsBusy(true);
            try {
                const props = await callJSX('inspectMogrtProperties', { trackIndex: clip.track, clipIndex: clip.index });
                setInspectorProps(Array.isArray(props) ? props : []);
            } catch (e) {
                console.error("Inspector fetch error", e);
                setInspectorProps([]);
            } finally {
                setInspectorIsBusy(false);
            }
        };
        fetchInspector();
    }, [selection]);

    // Update property with debounce
    const handlePropChange = (propIndex, propName, newValue) => {
        // Optimistic UI update
        setInspectorProps(prev => prev.map(p => p.index === propIndex ? { ...p, value: newValue } : p));

        // Setup phrase update payload
        const pIndices = [...new Set(selection.map(s => parseInt(s.split('-')[0])))];
        if (pIndices.length !== 1) return;
        const phrase = timelineMapRef.current[pIndices[0]];
        if (!phrase) return;

        const targetClips = phrase.clips.map(c => ({ trackIndex: c.track, clipIndex: c.index }));

        // Clear existing debounce
        if (inspectorDebounceRef.current[propName]) {
            clearTimeout(inspectorDebounceRef.current[propName]);
        }

        // Schedule new
        inspectorDebounceRef.current[propName] = setTimeout(() => {
            callJSX('updatePhraseMogrtProperty', {
                targetClips,
                propIndex,
                propName,
                value: newValue
            }).catch(e => {
                console.error("Update prop failed", e);
                pushToast(`Failed to update ${propName}`, 'error');
            });
        }, 150); // 150ms debounce
    };

    const handleSplit = async (pIdx, cIdx) => {
        if (isBusy) return;
        const phrase = timelineMap[pIdx];
        if (!phrase) return;
        if (phrase.isLocked) { pushToast('Phrase is locked', 'error'); return; }
        const clip = phrase.clips[cIdx];

        // OPTIMISTIC SPLIT
        const currentMap = timelineMap.map(p => ({ ...p, clips: [...p.clips] }));
        const target = currentMap[pIdx];
        const leftClips = target.clips.slice(0, cIdx + 1);
        const rightClips = target.clips.slice(cIdx + 1);
        target.clips = leftClips;
        const newPhrase = { ...phrase, clips: rightClips, start: rightClips[0]?.start || phrase.start, isLocked: false };
        currentMap.splice(pIdx + 1, 0, newPhrase);
        setTimelineMap(currentMap);

        try {
            setIsBusy(true); setProgress(30); setLog('Surgical Split...');
            await callJSX('sm_tools_split_v28', { trackIndex: clip.track, clipIndex: clip.index, splitAtWordIdx: cIdx });
            setProgress(100); setLog('Split completed');
            setTimeout(() => { setProgress(0); refreshTimeline(true); }, 1500);
        } catch (e) {
            setLog('Split Failed');
            pushToast('Split failed: ' + (e.message || 'unknown'), 'error');
            setIsBusy(false); refreshTimeline();
        }
    };

    const handleSaveMogrt = async () => {
        if (isBusy) return;
        const abort = (msg, log = 'Save aborted') => {
            pushToast(msg, 'error');
            setIsBusy(false); setLog(log);
        };
        try {
            setIsBusy(true); setLog('Reading MOGRT...');
            const dump = await callJSX('getMogrtDumpForActiveClip');
            if (!dump || dump.status === 'Error') return abort(dump?.message || 'Could not read active MOGRT.');
            if (!dump.sourceMogrtPath) return abort('Source .mogrt path not found on the project item.');
            if (!window.freeXanCaptionMogrtPatcher) return abort('MOGRT patcher not loaded (JSZip missing).');
            if (!window.cep || !window.cep.fs) return abort('CEP file API unavailable — run inside Premiere.');

            const defaultName = (dump.templateName || 'Template').replace(/[\\/:*?"<>|]+/g, '_') + '.mogrt';
            const dlg = window.cep.fs.showSaveDialogEx('Save MOGRT Template', '', ['mogrt'], defaultName);
            if (!dlg || dlg.err !== 0 || !dlg.data) {
                setIsBusy(false); setLog('Save cancelled'); return;
            }
            let destPath = String(dlg.data);
            if (!/\.mogrt$/i.test(destPath)) destPath += '.mogrt';

            setLog('Patching MOGRT...');
            const result = await window.freeXanCaptionMogrtPatcher.patchMogrt({
                sourcePath: dump.sourceMogrtPath,
                destPath,
                values: dump.values,
                smDef: dump.smDef,
                smAssetFolder: dump.smAssetFolder,
                smAssetTag: dump.smAssetTag
            });
            const skipMsg = result.skipped && result.skipped.length ? ` (${result.skipped.length} skipped)` : '';
            setLog(`Saved (${result.patched} props${skipMsg})`);
            pushToast(`Saved MOGRT — ${result.patched} properties patched${skipMsg}.`, 'info');
            setIsBusy(false);
        } catch (e) {
            console.error('Save MOGRT error:', e);
            abort('Save MOGRT failed: ' + (e.message || 'unknown'), 'Save failed');
        }
    };

    const handleSaveStyle = async () => {
        if (isBusy) return;
        try {
            setIsBusy(true); setLog('Saving Style...');
            const dump = await callJSX('getMogrtDumpForActiveClip');
            if (!dump || dump.status === 'Error') {
                pushToast(dump?.message || 'Could not read active MOGRT.', 'error');
                setIsBusy(false); setLog('Save aborted'); return;
            }
            if (!dump.sourceMogrtPath) {
                pushToast('Source .mogrt path not found on the project item.', 'error');
                setIsBusy(false); setLog('Save aborted'); return;
            }

            const params = {};
            dump.values.forEach(v => {
                if (v.kind !== 'text') {
                    params[v.displayName] = v.value;
                }
            });

            const fs = window.require('fs');
            const path = window.require('path');
            const csInterface = new window.CSInterface();
            const dbPath = path.join(csInterface.getSystemPath(window.SystemPath.USER_DATA), 'freeXan', 'mogrt_variations.json');

            let db = {};
            if (fs.existsSync(dbPath)) {
                try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch (e) { }
            }

            const mogrtKey = dump.sourceMogrtPath.replace(/\\/g, '/');
            if (!db[mogrtKey]) db[mogrtKey] = [];

            const newId = Date.now().toString(36).toUpperCase();

            db[mogrtKey].push({
                id: newId,
                parameters: params,
                thumbnailPath: null // Can be expanded to capture frame
            });

            const dir = path.dirname(dbPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');

            const event = new window.CSEvent("com.freexan.caption.variationSaved", "APPLICATION");
            csInterface.dispatchEvent(event);

            pushToast(`Style saved to BloomX!`, 'info');
            setLog('Style Saved');
        } catch (e) {
            pushToast('Save Style failed: ' + (e.message || 'unknown'), 'error');
            setLog('Save Style failed');
        } finally {
            setIsBusy(false);
        }
    };

    const handleReplaceMogrt = async (externalFilePath = null, externalParams = null) => {
        if (isBusy) return;
        const pIndices = [...new Set(selection.map(s => parseInt(s.split('-')[0])))];
        if (pIndices.length !== 1) return;
        const phrase = timelineMap[pIndices[0]];
        if (!phrase || phrase.isLocked) { pushToast('Phrase is locked', 'error'); return; }

        let mogrtFilePath = externalFilePath;
        if (!mogrtFilePath) {
            const mogrtInput = document.getElementById('mogrtFile');
            if (mogrtInput && mogrtInput.value) {
                mogrtFilePath = mogrtInput.value;
            } else {
                if (!window.cep || !window.cep.fs) {
                    pushToast('No MOGRT selected. Select one in the Workflow tab first.', 'error');
                    return;
                }
                const dlg = window.cep.fs.showOpenDialog(false, false, 'Select Replacement MOGRT', '', ['mogrt']);
                if (!dlg || dlg.err !== 0 || !dlg.data || !dlg.data.length) return;
                mogrtFilePath = dlg.data[0];
            }
        }

        const phraseClips = phrase.clips.map(c => ({ trackIndex: c.track, clipIndex: c.index }));

        try {
            setIsBusy(true);
            setLog('Replacing MOGRT…');
            const result = await callJSX('replacePhraseWithMogrt', {
                mogrtFilePath,
                phraseClips,
                variationParams: externalParams
            });
            const msg = `Replaced ${result.replaced} clip${result.replaced !== 1 ? 's' : ''} with new MOGRT.`;
            pushToast(msg, 'info');
            setLog(msg);
            setTimeout(() => { setProgress(0); refreshTimeline(true); }, 800);
        } catch (e) {
            pushToast('Replace MOGRT failed: ' + (e.message || 'unknown'), 'error');
            setLog('Replace failed');
        } finally {
            setIsBusy(false);
        }
    };

    const handleSyncPhrase = async () => {
        if (isBusy || !playheadClipId) return;

        const [pIdxStr, cIdxStr] = playheadClipId.split('-');
        const pIdx = parseInt(pIdxStr);
        const cIdx = parseInt(cIdxStr);

        const phrase = timelineMap[pIdx];
        if (!phrase || phrase.isLocked) { pushToast('Phrase is locked', 'error'); return; }

        const masterClip = phrase.clips[cIdx];
        const targetClips = phrase.clips.map(c => ({ trackIndex: c.track, clipIndex: c.index }));

        try {
            setIsBusy(true);
            setLog('Syncing Phrase…');
            const result = await callJSX('syncPhraseWithMaster', {
                masterClip: { trackIndex: masterClip.track, clipIndex: masterClip.index },
                targetClips: targetClips
            });
            const msg = `Synced ${result.syncedCount} clip${result.syncedCount !== 1 ? 's' : ''} to match the word under playhead.`;
            pushToast(msg, 'info');
            setLog(msg);
            setTimeout(() => { setProgress(0); refreshTimeline(true); }, 800);
        } catch (e) {
            pushToast('Sync Phrase failed: ' + (e.message || 'unknown'), 'error');
            setLog('Sync failed');
        } finally {
            setIsBusy(false);
        }
    };

    const handleMerge = async () => {
        if (isBusy || !selectionContiguity.isContiguous) return;
        const phraseIndices = selectionContiguity.phraseIndices;
        const targetIdx = phraseIndices[0];
        if (phraseIndices.some(i => timelineMap[i]?.isLocked)) {
            pushToast('Cannot merge: a selected phrase is locked', 'error');
            return;
        }

        // OPTIMISTIC MERGE
        const currentMap = timelineMap.map(p => ({ ...p, clips: [...p.clips] }));
        let mergedClips = [];
        phraseIndices.forEach(idx => { mergedClips = [...mergedClips, ...currentMap[idx].clips]; });
        currentMap[targetIdx].clips = mergedClips;
        const sortedDesc = [...phraseIndices].sort((a, b) => b - a);
        sortedDesc.forEach(idx => { if (idx !== targetIdx) currentMap.splice(idx, 1); });
        setTimelineMap(currentMap);
        setSelection([]);

        try {
            setIsBusy(true); setProgress(30); setLog('Merging Phrases...');
            const selectedClips = mergedClips.map(c => ({ trackIndex: c.track, clipIndex: c.index }));
            await callJSX('sm_tools_join_v28', { selectedClips });
            setProgress(100); setLog('Merge completed');
            setTimeout(() => { setProgress(0); refreshTimeline(true); }, 1500);
        } catch (e) {
            setLog('Merge Failed');
            pushToast('Merge failed: ' + (e.message || 'unknown'), 'error');
            setIsBusy(false); refreshTimeline();
        }
    };

    // Optimistic word transfer (fix #11) — supports single OR multi-word transfer.
    // Multi-word: if the dragged pill is part of the current multi-selection AND the
    // selection is a contiguous block anchored to the correct edge of the source phrase
    // (start for prev-transfer, end for next-transfer), all selected words move together.
    const handleWordTransfer = async (evt) => {
        const sourceIdx = parseInt(evt.from.dataset.phraseId);
        const targetIdx = parseInt(evt.to.dataset.phraseId);
        const wordIdx = parseInt(evt.item.dataset.wordIndex);
        const map = timelineMapRef.current;
        const sourcePhrase = map[sourceIdx];
        const targetPhrase = map[targetIdx];
        if (!sourcePhrase || !targetPhrase) return;
        if (sourcePhrase.isLocked || targetPhrase.isLocked) {
            pushToast('Phrase is locked', 'error');
            return;
        }
        const draggedClip = sourcePhrase.clips[wordIdx];
        if (!draggedClip) return;

        const movingToPrev = targetIdx < sourceIdx;
        const draggedId = `${sourceIdx}-${wordIdx}`;

        // Build the list of word-positions to transfer.
        // Default: just the dragged word. Promote to multi only if the dragged
        // word is in `selection` and the selection forms a valid contiguous block.
        let movedPositions = [wordIdx];

        const selInThisPhrase = selection
            .filter(s => parseInt(s.split('-')[0]) === sourceIdx)
            .map(s => parseInt(s.split('-')[1]))
            .sort((a, b) => a - b);

        if (selection.includes(draggedId) && selInThisPhrase.length > 1) {
            // Validate contiguity
            let contiguous = true;
            for (let i = 1; i < selInThisPhrase.length; i++) {
                if (selInThisPhrase[i] !== selInThisPhrase[i - 1] + 1) { contiguous = false; break; }
            }
            // Validate edge anchoring matching transfer direction
            const firstPos = selInThisPhrase[0];
            const lastPos = selInThisPhrase[selInThisPhrase.length - 1];
            const phraseLen = sourcePhrase.clips.length;
            const anchored = movingToPrev ? (firstPos === 0) : (lastPos === phraseLen - 1);
            // Don't move the entire phrase via transfer — that would empty the source
            const partial = selInThisPhrase.length < phraseLen;

            if (contiguous && anchored && partial) {
                movedPositions = selInThisPhrase;
            }
            // Else: silently fall back to single-word transfer of the dragged item
        }

        const movedClips = movedPositions.map(p => sourcePhrase.clips[p]).filter(Boolean);
        if (movedClips.length === 0) return;

        // OPTIMISTIC TRANSFER (covers multi too — splice descending, then insert in order)
        const currentMap = map.map(p => ({ ...p, clips: [...p.clips] }));
        const positionsDesc = [...movedPositions].sort((a, b) => b - a);
        positionsDesc.forEach(p => currentMap[sourceIdx].clips.splice(p, 1));
        if (movingToPrev) {
            currentMap[targetIdx].clips = [...currentMap[targetIdx].clips, ...movedClips];
        } else {
            currentMap[targetIdx].clips = [...movedClips, ...currentMap[targetIdx].clips];
        }
        setTimelineMap(currentMap);

        try {
            setIsBusy(true);
            setLog(movedClips.length > 1 ? `Transferring ${movedClips.length} words...` : 'Redistributing Words...');
            setProgress(30);
            await callJSX('executeWordTransfer', {
                sourcePhraseIdx: sourceIdx,
                targetPhraseIdx: targetIdx,
                clipIds: movedClips.map(c => `${c.track}-${c.index}`)
            });
            setProgress(100); setLog('Surgery completed');
            setTimeout(() => { setProgress(0); refreshTimeline(true); }, 1500);
        } catch (e) {
            setLog('Surgery Failed');
            pushToast('Surgery failed: ' + (e.message || 'unknown'), 'error');
            setIsBusy(false); setProgress(0); refreshTimeline();
        }
    };
    onTransferRef.current = handleWordTransfer;

    // Inline rename (fix #1) — Enter broadcasts new full phrase text to every MOGRT in the phrase
    const handleBubbleEdit = async (clip, pIdx, cIdx, newText) => {
        // Open editor on double-click (newText === undefined)
        if (newText === undefined) {
            if (timelineMap[pIdx]?.isLocked) { pushToast('Phrase is locked', 'error'); return; }
            setEditingClipId(`${pIdx}-${cIdx}`);
            return;
        }
        // Cancel
        if (newText === null) { setEditingClipId(null); return; }

        const phrase = timelineMap[pIdx];
        if (!phrase) { setEditingClipId(null); return; }

        // Optimistic local update
        const currentMap = timelineMap.map(p => ({ ...p, clips: [...p.clips] }));
        currentMap[pIdx].clips[cIdx] = { ...currentMap[pIdx].clips[cIdx], text: newText };
        setTimelineMap(currentMap);
        setEditingClipId(null);

        const newPhraseText = currentMap[pIdx].clips.map(c => c.text).join(' ');

        try {
            setIsBusy(true); setLog('Updating phrase text...'); setProgress(30);
            // Broadcast to every MOGRT in the phrase
            await Promise.all(phrase.clips.map(c =>
                callJSX('updateMogrtProperty', {
                    trackIndex: c.track,
                    clipIndex: c.index,
                    propName: 'Text Input',
                    value: newPhraseText
                })
            ));
            setProgress(100); setLog('Text updated');
            setTimeout(() => { setProgress(0); }, 800);
        } catch (e) {
            setLog('Rename Failed');
            pushToast('Rename failed: ' + (e.message || 'unknown'), 'error');
            refreshTimeline(); // revert by re-scanning
        } finally {
            setIsBusy(false);
        }
    };

    const handleLock = (idx, locked) => {
        const phrase = timelineMap[idx];
        if (!phrase) return;
        const id = phraseIdOf(phrase);
        lockStore.set(id, locked);
        setTimelineMap(prev => prev.map((p, i) => i === idx ? { ...p, isLocked: locked } : p));
    };

    // Initial load
    useEffect(() => { refreshTimeline(); }, [refreshTimeline]);

    // ─── Playhead follower ──────────────────────────────────────────────────
    // Polls getPlayheadTime every 250ms, finds the word under the playhead,
    // and scrolls it into view + highlights it when auto-follow is active.
    useEffect(() => {
        let prevCti = null;

        const tick = async () => {
            try {
                const cti = await callJSX('getPlayheadTime');
                if (typeof cti !== 'number' || isNaN(cti)) return;

                // Only process if the playhead actually moved (PP is playing)
                const isPlaying = prevCti !== null && Math.abs(cti - prevCti) > 0.05;
                prevCti = cti;

                // Find which clip the CTI falls inside.
                // Uses a 1ms epsilon on the start boundary so that at 29.97 fps frame
                // edges (where CTI.secs can be a few µs below the next clip's start)
                // we always prefer the clip that is STARTING over the one that is ENDING.
                // Taking the latest-start match (not break-on-first) handles overlapping
                // float boundaries: Teen.start > Yeh.start, so Teen wins at the boundary.
                const FRAME_EPS = 0.001;
                const map = timelineMapRef.current;
                let found = null;
                let foundStart = -Infinity;
                for (let pi = 0; pi < map.length; pi++) {
                    for (let ci = 0; ci < map[pi].clips.length; ci++) {
                        const c = map[pi].clips[ci];
                        if (cti + FRAME_EPS >= c.start && cti < c.end && c.start > foundStart) {
                            found = `${pi}-${ci}`;
                            foundStart = c.start;
                        }
                    }
                }

                setPlayheadClipId(found);

                // Auto-scroll only when playing and follow is active
                if (isPlaying && autoFollowRef.current && found) {
                    // Re-enable auto-follow every time we detect playback
                    const el = document.getElementById(`cc-word-${found}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } catch (e) {
                // getPlayheadTime can fail if no sequence is open — silently skip
            }
        };

        const intervalId = setInterval(tick, 250);
        return () => clearInterval(intervalId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally empty — refs are stable

    // Pause auto-follow on manual scroll, resume after 3 s of no scrolling
    useEffect(() => {
        const nav = navigatorRef.current;
        if (!nav) return;
        const onScroll = () => {
            autoFollowRef.current = false;
            if (followTimerRef.current) clearTimeout(followTimerRef.current);
            followTimerRef.current = setTimeout(() => {
                autoFollowRef.current = true;
            }, 3000);
        };
        nav.addEventListener('scroll', onScroll, { passive: true });
        return () => nav.removeEventListener('scroll', onScroll);
    }, []);
    // ─── End playhead follower ──────────────────────────────────────────────

    // Esc cancels selection / inline edit (fix #14)
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') {
                if (editingClipId) setEditingClipId(null);
                else { setSelection([]); setActiveClipId(null); }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [editingClipId]);

    // Listen for Mister BloomX commands
    useEffect(() => {
        const onReplaceEvent = (e) => {
            const payload = e.detail;
            if (payload && payload.mogrtPath) {
                // Determine if parameters exist
                const params = payload.parameters || null;
                handleReplaceMogrt(payload.mogrtPath, params);
            }
        };
        window.addEventListener('freexan-caption:replace_selected', onReplaceEvent);
        return () => window.removeEventListener('freexan-caption:replace_selected', onReplaceEvent);
    }, [selection, timelineMap, isBusy]);

    // Click-Away on empty Navigator clears selection (fix #9)
    const onNavigatorClick = (e) => {
        if (e.target === e.currentTarget) {
            setSelection([]); setActiveClipId(null);
        }
    };

    return (
        <React.Fragment>
            <div id="cc-toolbar" style={{ gridRow: 1, background: '#1a1e26', borderBottom: '2px solid var(--cc-accent-teal)' }}>
                <span style={{ fontWeight: 800, color: 'var(--cc-accent-teal)', padding: '0 16px' }}>EDIT TAB ACTIVE v4.0.24</span>
                <div style={{ flex: 1 }}></div>
                <div className="cc-header-actions">
                    <button className="cc-btn" onClick={() => { setIsBusy(false); refreshTimeline(); }}>↻ Refresh</button>
                    <button className="cc-btn" onClick={handleSaveStyle} disabled={isBusy} title="Save the current active clip's parameters as a style preset in Mister BloomX">🎨 Save Style</button>
                    <button className="cc-btn" onClick={handleSaveMogrt} disabled={isBusy}>💾 Save</button>
                </div>
            </div>

            <div style={{ gridRow: 1, gridColumn: 1, position: 'relative', zIndex: 10000, pointerEvents: 'none' }}>
                <ToastZone toasts={toasts} />
            </div>

            <div className="cc-navigator" style={{ gridRow: 2 }} onClick={onNavigatorClick} ref={navigatorRef}>
                {timelineMap.length === 0 ? (
                    <EmptyDashboard onRefresh={() => refreshTimeline()} />
                ) : (
                    <React.Fragment>
                        <div
                            className="cc-phrase-list"
                            style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}
                        >
                            {timelineMap.map((phrase, pIdx) => (
                                <PhraseRow
                                    key={phraseIdOf(phrase)}
                                    phrase={phrase} pIdx={pIdx}
                                    activeClipId={activeClipId} selection={selection}
                                    editingClipId={editingClipId}
                                    playheadClipId={playheadClipId}
                                    timelineMapRef={timelineMapRef}
                                    onTransferRef={onTransferRef}
                                    onInvalidDropRef={onInvalidDropRef}
                                    onBubbleClick={(clip, id, event) => {
                                        event.stopPropagation();
                                        if (event.shiftKey || event.ctrlKey || event.metaKey) {
                                            setSelection(prev => {
                                                const next = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id];
                                                console.log('Selection:', next);
                                                return next;
                                            });
                                        } else {
                                            setSelection([id]); setActiveClipId(id);
                                            console.log('Selected:', id);
                                            callJSX('setPlayheadTime', { seconds: clip.start + 0.01 }).catch(() => { });
                                        }
                                    }}
                                    onBubbleEdit={handleBubbleEdit}
                                    onLock={handleLock}
                                    onPhraseSelect={(idx, isMulti) => {
                                        const phrase = timelineMap[idx];
                                        if (!phrase || !phrase.clips) return;
                                        const ids = phrase.clips.map((_, i) => `${idx}-${i}`);
                                        if (isMulti) {
                                            setSelection(prev => ids.every(id => prev.includes(id))
                                                ? prev.filter(id => !ids.includes(id))
                                                : [...new Set([...prev, ...ids])]);
                                        } else {
                                            setSelection(ids);
                                        }
                                    }}
                                    onSplit={handleSplit}
                                />
                            ))}
                        </div>
                    </React.Fragment>
                )}
            </div>

            <div className="cc-footer" style={{ gridRow: 3 }}>
                <div className="cc-footer-progress" style={{ width: `${progress}%` }}></div>
                <div className="cc-footer-log">{log}</div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {playheadClipId && (
                        <button
                            className="cc-btn"
                            style={{ background: '#29BFBE', color: '#000', border: 'none' }}
                            onClick={handleSyncPhrase}
                            disabled={isBusy}
                            title="Copy styles from the word under the playhead to all other words in this phrase"
                        >
                            ✨ Sync Phrase
                        </button>
                    )}

                    {selectionContiguity.isContiguous && selection.length > 1 && (
                        <button className="cc-btn" style={{ background: 'var(--cc-accent-teal)', color: '#000', border: 'none' }} onClick={handleMerge}>⚡ Merge</button>
                    )}

                    {isSinglePhraseFullySelected && (
                        <button
                            className="cc-btn"
                            style={{ background: '#9b6dff', color: '#fff', border: 'none' }}
                            onClick={handleReplaceMogrt}
                            disabled={isBusy}
                            title="Swap the MOGRT template under all clips in this phrase"
                        >
                            🔄 Replace MOGRT
                        </button>
                    )}
                </div>
            </div>
        </React.Fragment>
    );
};

const root = ReactDOM.createRoot(document.getElementById('react-edit-root'));
root.render(<App />);
console.log('freeXan Caption CC React script rendered.');
