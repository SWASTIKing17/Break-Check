/**
 * freeXan Caption — ParamsView
 * Full UI/UX Overhaul: Flux Design, Phrase & Word Progression Bubbles,
 * Mouse horizontal scrolling, real-time polling, and stable color modal.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useJsx } from '@/hooks/useJsx';
import { csi } from '@/lib/csi';
import { useParamsStore } from '@/store/paramsStore';
import { useSessionStore } from '@/store/sessionStore';
import { readTemplateJson, extractDisplayNames, applySchema, normalizeClips } from '@/lib/paramUtils';
import { ParamList } from './components/MogrtControls';
import { CockpitColorPicker } from '../edit/components/Inspector';
import { formatTime } from '@/lib/format';
import { lockStore } from '@/lib/editUtils';
import './ParamsView.css';

const getClipPhraseAndWordIdx = (clip: any) => {
  if (!clip || !clip.params) return { phraseText: clip?.name || 'Clip', wordIdx: -1 };
  let phraseText = '';
  let fallbackText = '';
  let wordIdx = -1;
  for (const p of clip.params) {
    const paramName = p.name || p.displayName || '';
    if (/word progression|\u24c9|\u24c8|word index|word #|current word|active word|progression/i.test(paramName)) {
      const rawV = p.value !== undefined && p.value !== null ? p.value : p.val;
      const v = parseInt(rawV, 10);
      if (!isNaN(v) && v >= 0) wordIdx = v >= 1 ? v - 1 : v;
    }
  }
  for (const p of clip.params) {
    const paramName = p.name || p.displayName || '';
    if (p.kind === 'text') {
      let txt = p.displayValue || p.value || p.val;
      if (p.rawJson) {
        try {
          const parsed = JSON.parse(p.rawJson);
          if (parsed.textEditValue !== undefined) txt = parsed.textEditValue;
          else if (parsed.text !== undefined) txt = parsed.text;
          else if (parsed.value !== undefined) txt = parsed.value;
          else if (parsed.content !== undefined) txt = parsed.content;
        } catch (_) {}
      }
      if (typeof txt === 'string' && txt.trim()) {
        const clean = txt.trim();
        if (!fallbackText) fallbackText = clean;
        if (/text input|\u24c9|\u24c8|source text|caption text|title text|phrase text/i.test(paramName)) {
          phraseText = clean;
        }
      }
    }
  }
  if (!phraseText) phraseText = fallbackText || clip.name || 'Clip';
  return { phraseText, wordIdx };
};

const getMogrtHue = (name: string) => {
  const clean = (name || '').split(/[/\\]/).pop()?.replace(/\.mogrt$/i, '').trim().toLowerCase() || 'unknown';
  const hash = clean.split('').reduce((a: number, b: string) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  return Math.abs(hash) % 360;
};

export const ParamsView: React.FC = () => {
  const { execute } = useJsx();
  const { clips, activeClipIdx, status, lastUpdated, dbg, setClips, setActiveClipIdx, setStatus, setLastUpdated, setDbg } = useParamsStore();
  const ctiSecs = useSessionStore((s) => s.ctiSecs);

  const [activeColorModal, setActiveColorModal] = useState<{
    nodeId: string;
    paramIndex: number;
    hex: string;
    displayName: string;
  } | null>(null);
  const [locksVersion, setLocksVersion] = useState(0);

  const prevClipsJson = useRef('');
  const eventsInitialized = useRef(false);
  const isFetchingRef = useRef(false);
  const isJsxReadyRef = useRef(false);

  const applyClipsData = useCallback((rawClips: any[], onDbg: ((msg: string) => void) | null) => {
    let normalized = normalizeClips(rawClips);

    if (csi.isAvailable) {
      normalized = normalized.map(clip => {
        if (!clip.path) { if (onDbg) onDbg('nopath'); return clip; }
        const schema = readTemplateJson(clip.path);
        if (!schema) { if (onDbg) onDbg('schema=NULL'); return clip; }
        const names = extractDisplayNames(schema, 0, []) as string[];
        if (onDbg) onDbg(`schema=${names.length}names`);
        clip.params = applySchema(clip.params, names);
        return clip;
      });
    }

    const json = JSON.stringify(normalized);
    if (json !== prevClipsJson.current) {
      prevClipsJson.current = json;
      setClips(normalized);
      setActiveClipIdx((idx: number) => Math.min(idx, Math.max(0, normalized.length - 1)));
    }
    setLastUpdated(new Date());
    setStatus('live');
    return normalized;
  }, [setClips, setActiveClipIdx, setLastUpdated, setStatus]);

  const fetchParams = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const result: any = await execute('smGetSelectionParams');
      if (result === null || result === undefined) {
        setDbg('JSX not ready — waiting...');
        return;
      }
      if (result && result.clips !== undefined) {
        isJsxReadyRef.current = true;
        const rc = result.clips;
        const rawCount = rc[0] && rc[0].params ? rc[0].params.length : 0;
        let schemaNote = '';
        const final = applyClipsData(rc, (msg) => { schemaNote = msg; });
        const shownCount = final && final[0] ? final[0].params.length : 0;
        if (rc.length === 0) {
          setDbg('Ready — select a MOGRT on the timeline');
        } else {
          setDbg(`raw=${rawCount} | ${schemaNote} | shown=${shownCount}`);
        }
      } else {
        setDbg(`Unexpected response shape`);
      }
    } catch (e: any) {
      setStatus('error');
      setDbg(`ERR: ${e.message}`);
    } finally {
      isFetchingRef.current = false;
    }
  }, [execute, applyClipsData, setDbg, setStatus]);

  // Zero-cost playhead re-render subscriber (ctiSecs updates cause re-render for real-time word tracking without heavy JSX bridge calls)
  useEffect(() => {
    // ctiSecs triggers visual playhead tracking on .cc-word-pill items below
  }, [ctiSecs]);

  useEffect(() => {
    if (!csi.isAvailable) return;
    if (eventsInitialized.current) return;
    eventsInitialized.current = true;

    csi.on('freexan.caption.paramsUpdated', (event: any) => {
      try {
        const raw = JSON.parse(event.data || '[]');
        applyClipsData(raw, null);
      } catch (e) {}
    });

    execute('smInitParamEvents').catch(() => {});
    fetchParams();
  }, [execute, fetchParams, applyClipsData]);

  // Dedicated auto-poll timer (500ms) so timeline changes in Premiere Pro update instantly without manual refresh clicks
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isFetchingRef.current) {
        fetchParams();
      }
    }, 500);
    return () => clearInterval(timer);
  }, [fetchParams]);

  const handleApply = useCallback(async (data: any) => {
    try { await execute('smApplyParam', data); }
    catch (e) { setStatus('error'); }
  }, [execute, setStatus]);

  const activeClip = clips[activeClipIdx] || null;

  const handleSyncProp = useCallback(async (data: any) => {
    try {
      setStatus('live');
      const res: any = await execute('smSyncParamAcrossSelected', {
        ...data,
        targetName: activeClip?.name || '',
        targetPath: activeClip?.path || ''
      });
      const count = res && res.syncedCount !== undefined ? res.syncedCount : '?';
      const total = res && res.totalSelected !== undefined ? res.totalSelected : '?';
      const master = res && res.masterName ? res.masterName : 'none';
      const dbgDetails = res && Array.isArray(res.debugLog) ? res.debugLog.join(' | ') : '';
      setDbg(`Sync ${count}/${total} [M:${master}] -> ${dbgDetails}`);
      fetchParams();
    } catch (e: any) {
      setStatus('error');
      setDbg(`Sync FAIL: ${e.message || 'unknown'}`);
    }
  }, [execute, activeClip, setStatus, setDbg, fetchParams]);

  // Group selected clips by phrase text to show full Phrase Bubbles containing Word Progression Pills
  const phraseGroups = useMemo(() => {
    if (clips.length === 0) return [];
    const map = new Map<string, { phraseText: string; words: string[]; clipsByWordIdx: Record<number, any>; totalSelected: number; minStart: number; mogrtName: string; phraseId: string }>();

    clips.forEach(clip => {
      const { phraseText, wordIdx } = getClipPhraseAndWordIdx(clip);
      if (!map.has(phraseText)) {
        const words = phraseText.split(/\s+/).filter(Boolean);
        map.set(phraseText, {
          phraseText,
          words,
          clipsByWordIdx: {},
          totalSelected: 0,
          minStart: typeof clip.start === 'number' ? clip.start : 0,
          mogrtName: clip.name || 'unknown',
          phraseId: clip.nodeId || phraseText
        });
      }
      const group = map.get(phraseText)!;
      if (typeof clip.start === 'number' && (clip.start < group.minStart || group.minStart === 0)) {
        group.minStart = clip.start;
      }
      if (wordIdx >= 0 && wordIdx < group.words.length) {
        group.clipsByWordIdx[wordIdx] = clip;
      }
      group.totalSelected++;
    });

    return Array.from(map.values());
  }, [clips, locksVersion]);

  const dotClass = status === 'live' ? 'mpe-poll-dot'
    : status === 'error' ? 'mpe-poll-dot mpe-poll-dot--error'
    : 'mpe-poll-dot mpe-poll-dot--paused';

  const timeLabel = lastUpdated
    ? `${lastUpdated.getHours()}:${String(lastUpdated.getMinutes()).padStart(2, '0')}:${String(lastUpdated.getSeconds()).padStart(2, '0')}`
    : '—';

  return (
    <div className="mpe-root">
      <div style={{ background: '#1a0a0a', borderBottom: '2px solid #ff4444', padding: '5px 8px', fontSize: '11px', color: '#ff8888', fontFamily: 'monospace', wordBreak: 'break-all' }}>
        <b style={{ color: '#ff4444' }}>DBG:</b> {dbg}
      </div>

      <div className="mpe-header">
        <div className="mpe-header-left">
          <span className="mpe-header-title">Params</span>
          {activeClip && (
            <span className="mpe-clip-label" title={activeClip.name}>{activeClip.name}</span>
          )}
        </div>
        <div className="mpe-header-right">
          <span style={{ fontSize: '9px', color: 'var(--fx-text-dimmer)', fontFamily: 'monospace' }}>{timeLabel}</span>
          <button
            className="mpe-refresh-btn"
            style={{ fontSize: '10px', padding: '1px 6px', width: 'auto', borderRadius: '3px', background: '#3b2f0a', color: '#ffcc00', border: '1px solid #7a6215', marginRight: '4px', cursor: 'pointer' }}
            onClick={async () => {
              try {
                const res: any = await execute('smDumpSelectedMogrtProperties');
                if (res && res.ok) {
                  alert(res.msg);
                } else {
                  alert('Dump Failed: ' + (res?.msg || 'Unknown error'));
                }
              } catch (e: any) {
                alert('Error: ' + String(e));
              }
            }}
            title="Dump all properties of selected MOGRT to panel/logs/mogrt_param_fetch.log"
          >
            📋 Log Props
          </button>
          <button className="mpe-refresh-btn" onClick={fetchParams} title="Refresh now">↻</button>
          <div className={dotClass} title={status} />
        </div>
      </div>

      {phraseGroups.length > 0 && (
        <div className="mpe-horizontal-phrases-track">
          {phraseGroups.map((group, gIdx) => {
            const hue = getMogrtHue(group.phraseText);
            const rawMogrtName = group.mogrtName || 'unknown';
            const cleanMogrtName = rawMogrtName.replace(/\.mogrt$/i, '');
            const startSecs = group.minStart;
            const isGroupSelected = group.words.some((_, wIdx) => !!group.clipsByWordIdx[wIdx]);
            const isLocked = lockStore.get(group.phraseId);

            return (
              <div
                key={gIdx}
                className={`cc-phrase-row mpe-horizontal-phrase-card ${isGroupSelected ? 'cc-is-selected' : ''} ${isLocked ? 'cc-is-locked' : ''}`}
                onWheel={(e) => {
                  // Allow horizontal wheel scrolling across cards if hovering on card background
                  if (e.currentTarget.parentElement) {
                    e.currentTarget.parentElement.scrollLeft += e.deltaY;
                  }
                }}
              >
                <div className="cc-phrase-header">
                  <div className="cc-phrase-meta" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--fx-accent-teal, #29bfbe)', fontWeight: 800 }}>#{gIdx + 1}</span>
                    <span>•</span>
                    <span>{formatTime(startSecs)}</span>
                    {rawMogrtName !== 'unknown' && (
                      <>
                        <span>•</span>
                        <span
                          style={{
                            backgroundColor: `hsla(${hue}, 60%, 50%, 0.15)`,
                            color: `hsl(${hue}, 85%, 75%)`,
                            border: `1px solid hsla(${hue}, 60%, 50%, 0.35)`,
                            padding: '1px 6px',
                            borderRadius: '10px',
                            fontSize: '10px',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer'
                          }}
                          title={`Assigned MOGRT: ${rawMogrtName}`}
                        >
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: `hsl(${hue}, 80%, 65%)`, boxShadow: `0 0 4px hsla(${hue}, 80%, 65%, 0.6)` }}></span>
                          {cleanMogrtName}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="cc-phrase-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      className="cc-btn cc-lock-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        lockStore.set(group.phraseId, !isLocked);
                        setLocksVersion(v => v + 1);
                      }}
                      style={{ background: 'none', border: 'none', color: isLocked ? '#F0AD4E' : '#444', fontSize: '11px', padding: 0, cursor: 'pointer' }}
                      title={isLocked ? 'Locked — click to unlock' : 'Click to lock phrase'}
                    >
                      {isLocked ? '🔒' : '🔓'}
                    </button>
                  </div>
                </div>

                <div className="cc-bubble-zone">
                  {group.words.map((wordText, wIdx) => {
                    const matchingClip = group.clipsByWordIdx[wIdx];
                    const isSelected = !!matchingClip;
                    const isActive = matchingClip && matchingClip.nodeId === activeClip?.nodeId;
                    const isPlayhead = ctiSecs !== null && matchingClip && typeof matchingClip.start === 'number' && typeof matchingClip.end === 'number' && ctiSecs + 0.001 >= matchingClip.start && ctiSecs < matchingClip.end;
                    return (
                      <div
                        key={wIdx}
                        className={[
                          'cc-word-pill',
                          isActive ? 'cc-is-active' : '',
                          isSelected && !isActive ? 'cc-is-selected' : '',
                          isLocked ? 'cc-is-locked' : '',
                          isPlayhead ? 'cc-is-playhead' : ''
                        ].filter(Boolean).join(' ')}
                        onClick={async (e) => {
                          e.stopPropagation();
                          console.log('[ParamsView] Word bubble clicked:', { wIdx, wordText, matchingClip, isLocked });
                          if (isLocked) {
                            console.log('[ParamsView] Click ignored: Phrase is locked');
                            return;
                          }
                          if (matchingClip) {
                            const idx = clips.findIndex(c => c.nodeId === matchingClip.nodeId);
                            if (idx >= 0) setActiveClipIdx(idx);
                            if (typeof matchingClip.start === 'number') {
                              console.log('[ParamsView] Executing setPlayheadTime:', matchingClip.start + 0.01);
                              await execute('setPlayheadTime', { seconds: matchingClip.start + 0.01 }).catch((err) => {
                                console.error('[ParamsView] setPlayheadTime failed:', err);
                              });
                            }
                          } else {
                            console.warn('[ParamsView] matchingClip is null for word:', wIdx, wordText);
                          }
                          console.log('[ParamsView] Executing smSelectClipsByPhraseAndWord');
                          await execute('smSelectClipsByPhraseAndWord', {
                            nodeIds: matchingClip ? [matchingClip.nodeId] : [],
                            targetSeconds: matchingClip && typeof matchingClip.start === 'number' ? matchingClip.start : -1,
                            phraseText: group.phraseText,
                            wordIndices: [wIdx],
                            shiftKey: e.shiftKey
                          }).then((res) => {
                            console.log('[ParamsView] smSelectClipsByPhraseAndWord success:', res);
                          }).catch((err) => {
                            console.error('[ParamsView] smSelectClipsByPhraseAndWord failed:', err);
                          });
                        }}
                        title={`Word ${wIdx + 1}: "${wordText}"\nClick to jump/select. Shift+Click multi-select.`}
                      >
                        {wordText}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!activeClip ? (
        <div className="mpe-empty">
          <div className="mpe-empty-icon">🎛</div>
          <p className="mpe-empty-title">No MOGRT Selected</p>
          <p className="mpe-empty-desc">
            Select one or more MOGRT clips in the Premiere Pro timeline to view and edit parameters.
          </p>
        </div>
      ) : (
        <div className="mpe-param-list">
          <ParamList
            params={activeClip.params}
            nodeId={activeClip.nodeId}
            onApply={handleApply}
            onSyncProp={handleSyncProp}
            onOpenColorModal={(modalInfo: any) => setActiveColorModal(modalInfo)}
          />
        </div>
      )}

      {activeColorModal && (
        <div
          className="mpe-color-modal-overlay"
          onClick={() => setActiveColorModal(null)}
        >
          <div className="mpe-color-modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="mpe-color-modal-header">
              <span>Edit Color: {activeColorModal.displayName}</span>
              <button onClick={() => setActiveColorModal(null)}>✕</button>
            </div>
            <CockpitColorPicker
              initialHex={activeColorModal.hex}
              hideHeader={true}
              onChange={(newHex) => {
                setActiveColorModal(prev => prev ? { ...prev, hex: newHex } : null);
                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(newHex);
                if (result) {
                  const rgbObj = { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) };
                  execute('smApplyParam', {
                    nodeId: activeColorModal.nodeId,
                    paramIndex: activeColorModal.paramIndex,
                    value: rgbObj
                  });
                }
              }}
              onClose={() => setActiveColorModal(null)}
              style={{ position: 'relative', top: 'auto', right: 'auto', width: '100%', margin: '0 auto', boxShadow: 'none' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
