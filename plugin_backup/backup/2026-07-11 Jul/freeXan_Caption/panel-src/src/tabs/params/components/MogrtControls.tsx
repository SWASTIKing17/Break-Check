/**
 * freeXan Caption — Params Controls
 * Components for editing MOGRT parameters (colors, sliders, toggles, text).
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useJsx } from '@/hooks/useJsx';
import { CockpitColorPicker } from '../../edit/components/Inspector';

export const colorObjToHex = (obj: any) => {
  if (!obj) return '#888888';
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const r = clamp(Math.round(obj.r || 0), 0, 255);
  const g = clamp(Math.round(obj.g || 0), 0, 255);
  const b = clamp(Math.round(obj.b || 0), 0, 255);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
};

export const MogrtControl: React.FC<{ param: any; nodeId: string; onApply: any; onSyncProp?: any; onOpenColorModal?: any }> = ({ param, nodeId, onApply, onSyncProp, onOpenColorModal }) => {
  const { execute } = useJsx();
  const [localValue, setLocalValue] = useState(param.kind === 'text' ? param.displayValue : param.value);
  const [isPending, setIsPending] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const applyTimer = useRef<any>(null);

  // Check normalization for single scalar numbers (Scale / Position X / Position Y)
  const isNormalizedScale = useMemo(() => {
    return param.kind === 'number' && /scale|size|zoom/i.test(param.displayName || '') && typeof param.value === 'number' && Math.abs(param.value) <= 10;
  }, [param.kind, param.displayName, param.value]);

  const isNormalizedPosX = useMemo(() => {
    return param.kind === 'number' && /(pos.*x|position.*x)/i.test(param.displayName || '') && typeof param.value === 'number' && Math.abs(param.value) <= 10;
  }, [param.kind, param.displayName, param.value]);

  const isNormalizedPosY = useMemo(() => {
    return param.kind === 'number' && /(pos.*y|position.*y)/i.test(param.displayName || '') && typeof param.value === 'number' && Math.abs(param.value) <= 10;
  }, [param.kind, param.displayName, param.value]);

  const scalarMult = isNormalizedScale ? 100 : isNormalizedPosX ? 1920 : isNormalizedPosY ? 1080 : 1;

  useEffect(() => {
    if (!isPending) {
      if (param.kind === 'text') {
        setLocalValue(param.displayValue);
      } else if (param.kind === 'number' && typeof param.value === 'number') {
        setLocalValue(Math.round(param.value * scalarMult));
      } else {
        setLocalValue(param.value);
      }
    }
  }, [JSON.stringify(param.value), param.displayValue, isPending, param.kind, scalarMult]);

  const scheduleApply = useCallback((newValue: any) => {
    clearTimeout(applyTimer.current);
    applyTimer.current = setTimeout(async () => {
      setIsPending(true);
      try { await onApply({ nodeId, paramIndex: param.index, value: newValue }); }
      finally { setIsPending(false); }
    }, 280);
  }, [nodeId, param.index, onApply]);

  const handleTextBlur = (e: any) => {
    const newText = e.target.value;
    if (param.rawJson) {
      let obj: any = {};
      try { obj = JSON.parse(param.rawJson); } catch (_) {}
      obj.textEditValue = newText;
      obj.fontTextRunLength = [newText.length];
      scheduleApply(JSON.stringify(obj));
    } else {
      scheduleApply(newText);
    }
  };

  const handleNumberChange = (e: any) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) {
      setLocalValue(v);
      scheduleApply(v / scalarMult);
    }
  };

  const handleBoolChange = (e: any) => {
    const v = e.target.checked;
    setLocalValue(v); scheduleApply(v);
  };

  const handleColorLiveChange = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      const rgbObj = { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) };
      setLocalValue(rgbObj);
      scheduleApply(rgbObj);
    }
  };

  const hex = param.isColor ? colorObjToHex(localValue && typeof localValue === 'object' ? localValue : param.value) : null;

  const handleOpenPicker = () => {
    if (onOpenColorModal) {
      onOpenColorModal({ nodeId, paramIndex: param.index, hex: hex || '#ffffff', displayName: param.displayName });
    } else {
      setShowPicker(true);
    }
  };

  return (
    <div className={`mpe-control ${isPending ? 'mpe-control--pending' : ''}`}>
      <div className="mpe-control__name">
        <span>{param.displayName}</span>
        <span className="mpe-kind-badge">{isNormalizedScale ? 'scale (%)' : scalarMult > 1 ? 'position (px)' : param.kind}</span>
        {onSyncProp && (
          <button
            className="mpe-sync-prop-btn"
            onClick={(e) => {
              e.stopPropagation();
              let valToSync = localValue;
              if (param.kind === 'text' && param.rawJson) {
                let obj: any = {};
                try { obj = JSON.parse(param.rawJson); } catch (_) {}
                obj.textEditValue = String(localValue || '');
                obj.fontTextRunLength = [String(localValue || '').length];
                valToSync = JSON.stringify(obj);
              } else if (param.kind === 'number' && typeof localValue === 'number') {
                valToSync = localValue / scalarMult;
              }
              onSyncProp({
                nodeId,
                paramIndex: param.index,
                paramName: param.displayName,
                paramKind: param.kind,
                value: valToSync
              });
            }}
            title="Sync this property across all selected identical MOGRTs in timeline"
          >
            ⚡ Sync
          </button>
        )}
      </div>
      <div className="mpe-control__value">
        {param.isColor ? (
          <>
            <div className="mpe-color-row">
              <div
                className="mpe-color-swatch"
                style={{ background: hex || undefined }}
                onClick={handleOpenPicker}
              />
              <span className="mpe-color-hex-label" onClick={handleOpenPicker}>
                #{hex ? hex.slice(1).toUpperCase() : '------'}
              </span>
              <button className="mpe-color-picker-trigger" onClick={handleOpenPicker}>Edit</button>
            </div>
            {!onOpenColorModal && showPicker && (
              <div style={{ position: 'absolute', zIndex: 100, right: 0, marginTop: '8px' }}>
                <CockpitColorPicker
                  initialHex={hex || '#000000'}
                  onChange={handleColorLiveChange}
                  onClose={() => setShowPicker(false)}
                />
              </div>
            )}
          </>
        ) : param.kind === 'text' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', background: 'rgba(0,0,0,0.25)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <select
                className="cc-font-select"
                style={{ flex: 1, fontSize: '11px', background: '#111', color: '#eee', border: '1px solid #333', borderRadius: '3px', padding: '2px 4px' }}
                value={(() => { try { return JSON.parse(param.rawJson || '{}').fontFamily || 'Inter'; } catch (_) { return 'Inter'; } })()}
                onChange={(e) => {
                  const newFont = e.target.value;
                  if (param.rawJson) {
                    let obj: any = {};
                    try { obj = JSON.parse(param.rawJson); } catch (_) {}
                    obj.fontFamily = newFont;
                    obj.fontStyleName = 'Regular';
                    scheduleApply(JSON.stringify(obj));
                  }
                }}
              >
                <option value="Inter">Inter</option>
                <option value="Montserrat">Montserrat</option>
                <option value="Outfit">Outfit</option>
                <option value="Roboto">Roboto</option>
                <option value="Poppins">Poppins</option>
                <option value="Arial">Arial</option>
              </select>
              <select
                className="cc-style-select"
                style={{ width: '80px', fontSize: '11px', background: '#111', color: '#eee', border: '1px solid #333', borderRadius: '3px', padding: '2px 4px' }}
                value={(() => { try { return JSON.parse(param.rawJson || '{}').fontStyleName || 'Bold'; } catch (_) { return 'Bold'; } })()}
                onChange={(e) => {
                  const newStyle = e.target.value;
                  if (param.rawJson) {
                    let obj: any = {};
                    try { obj = JSON.parse(param.rawJson); } catch (_) {}
                    obj.fontStyleName = newStyle;
                    scheduleApply(JSON.stringify(obj));
                  }
                }}
              >
                <option value="Regular">Regular</option>
                <option value="Medium">Medium</option>
                <option value="Bold">Bold</option>
                <option value="Black">Black</option>
              </select>
              <select
                className="cc-flux-style-select"
                style={{ width: '95px', fontSize: '11px', background: '#111', color: 'var(--fx-accent-teal)', border: '1px solid #333', borderRadius: '3px', padding: '2px 4px', fontWeight: 600 }}
                defaultValue="Flux Default"
              >
                <option value="Flux Default">⚡ Flux Style</option>
                <option value="Neon Glow">Neon Glow</option>
                <option value="Kinetic Pop">Kinetic Pop</option>
                <option value="Smooth Slide">Smooth Slide</option>
                <option value="Cyber Glow">Cyber Glow</option>
              </select>
            </div>
            <textarea
              className="mpe-text-input"
              rows={3}
              defaultValue={localValue}
              onBlur={handleTextBlur}
              onChange={(e) => setLocalValue(e.target.value)}
              placeholder="Enter text…"
            />
          </div>
        ) : param.kind === 'boolean' ? (
          <label className="mpe-toggle-label">
            <input type="checkbox" checked={!!localValue} onChange={handleBoolChange} />
            <span className="mpe-toggle-track" />
            <span className="mpe-toggle-value-text">{localValue ? 'On' : 'Off'}</span>
          </label>
        ) : param.kind === 'image' ? (
          <div className="mpe-image-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '4px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#ccc' }}>
              <span>🖼️</span>
              <span style={{ fontWeight: 600 }}>{param.displayName || param.name || 'Media / Image Slot'}</span>
            </div>
            <button
              className="mpe-replace-media-btn"
              style={{ background: 'var(--fx-accent-teal)', color: '#000', border: 'none', borderRadius: '4px', padding: '6px 14px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,255,200,0.2)' }}
              onClick={async () => {
                setIsPending(true);
                try {
                  await execute('smSelectImageAndReplace', { nodeId, paramIndex: param.index });
                } finally {
                  setIsPending(false);
                }
              }}
            >
              Replace Image...
            </button>
          </div>
        ) : (
          <div className="mpe-number-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
            <input
              type="range"
              className="mpe-range-slider"
              min={0}
              max={isNormalizedScale ? 300 : scalarMult > 1 ? scalarMult : 100}
              step={isNormalizedScale ? "1" : scalarMult > 1 ? "2" : "0.5"}
              value={typeof localValue === 'number' ? localValue : 0}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setLocalValue(v);
                scheduleApply(v / scalarMult);
              }}
              style={{ flex: 1, cursor: 'pointer', accentColor: 'var(--fx-accent-teal)' }}
            />
            <input
              className="mpe-number-input"
              type="number"
              value={typeof localValue === 'number' ? (Number.isInteger(localValue) ? localValue : parseFloat(localValue.toFixed(2))) : (localValue || 0)}
              onChange={handleNumberChange}
              step="1"
              style={{ width: '70px', textAlign: 'center' }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const MogrtVectorControl: React.FC<{ param: any; nodeId: string; onApply: any; onSyncProp?: any }> = ({ param, nodeId, onApply, onSyncProp }) => {
  const rawParts = useMemo(() => (param.value || '').split(',').map((v: string) => parseFloat(v) || 0), [param.value]);
  
  // Check if normalized position (0..1 range) or raw pixels
  const isNormalizedVector = useMemo(() => {
    return rawParts.length >= 2 && rawParts.every((n: number) => Math.abs(n) <= 10);
  }, [rawParts]);

  const isScale = useMemo(() => /scale|size|zoom/i.test(param.displayName || ''), [param.displayName]);
  const multipliers = useMemo(() => {
    if (!isNormalizedVector) return rawParts.map(() => 1);
    if (isScale) return rawParts.map(() => 100);
    return rawParts.map((_: any, i: number) => i === 0 ? 1920 : i === 1 ? 1080 : 1000);
  }, [isNormalizedVector, isScale, rawParts]);

  const [localParts, setLocalParts] = useState(() => rawParts.map((n: number, i: number) => Math.round(n * (multipliers[i] || 1))));
  const applyTimer = useRef<any>(null);

  useEffect(() => {
    setLocalParts((param.value || '').split(',').map((v: string, i: number) => {
      const num = parseFloat(v);
      return isNaN(num) ? 0 : Math.round(num * (multipliers[i] || 1));
    }));
  }, [param.value, multipliers]);

  const labels = localParts.length === 2 ? ['X', 'Y'] : localParts.length === 3 ? ['X', 'Y', 'Z'] : localParts.map((_: any, i: number) => i);

  const handleChange = (idx: number, rawVal: string) => {
    const v = parseFloat(rawVal);
    if (isNaN(v)) return;
    const next = [...localParts];
    next[idx] = Math.round(v);
    setLocalParts(next);
    clearTimeout(applyTimer.current);
    applyTimer.current = setTimeout(() => {
      const toSend = next.map((val: number, i: number) => {
        const mult = multipliers[i] || 1;
        return mult > 1 ? parseFloat((val / mult).toFixed(4)) : val;
      });
      onApply({ nodeId, paramIndex: param.index, value: toSend.join(',') });
    }, 280);
  };

  return (
    <div className="mpe-control">
      <div className="mpe-control__name">
        <span>{param.displayName}</span>
        <span className="mpe-kind-badge">{isScale ? 'scale (%)' : multipliers[0] > 1 ? 'position (px)' : 'vector'}</span>
        {onSyncProp && (
          <button
            className="mpe-sync-prop-btn"
            onClick={(e) => {
              e.stopPropagation();
              const toSend = localParts.map((val: number, i: number) => {
                const mult = multipliers[i] || 1;
                return mult > 1 ? parseFloat((val / mult).toFixed(4)) : val;
              });
              onSyncProp({
                nodeId,
                paramIndex: param.index,
                paramName: param.displayName,
                paramKind: 'vector',
                value: toSend.join(',')
              });
            }}
            title="Sync this property across all selected identical MOGRTs in timeline"
          >
            ⚡ Sync
          </button>
        )}
      </div>
      <div className="mpe-vector-row" style={{ display: 'flex', gap: '10px' }}>
        {localParts.map((v: number, i: number) => (
          <div key={i} className="mpe-vector-field" style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
            <span
              className="mpe-vector-label"
              style={{ cursor: 'ew-resize', userSelect: 'none', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '3px', fontWeight: 'bold', fontSize: '11px', color: 'var(--fx-accent-teal)' }}
              onMouseDown={(e) => {
                const startX = e.clientX;
                const startVal = localParts[i];
                const onMove = (ev: MouseEvent) => {
                  const delta = Math.round((ev.clientX - startX) * 0.5);
                  handleChange(i, String(startVal + delta));
                };
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
              title="Scrubbable slider (After Effects style): Click & drag left/right to adjust pixel value"
            >
              {labels[i]}
            </span>
            <input
              className="mpe-number-input"
              type="number"
              value={Number.isInteger(v) ? v : parseFloat(v.toFixed(1))}
              onChange={(e) => handleChange(i, e.target.value)}
              step="1"
              style={{ flex: 1, textAlign: 'center' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const buildParamTree = (flatParams: any[]) => {
  const root = { kind: 'root', children: [] as any[] };
  const stack = [{ node: root, remaining: Infinity }];

  flatParams.forEach(p => {
    if (p.kind === 'complex') return;
    const top = stack[stack.length - 1];

    if (p.kind === 'group') {
      const uuidStr = p.value || '';
      const childCount = uuidStr ? uuidStr.replace(/;+$/, '').split(';').filter(Boolean).length : 0;
      const node = { kind: 'group', name: p.displayName || 'Group', index: p.index, children: [] };
      top.node.children.push(node);
      if (top.remaining !== Infinity) {
        top.remaining--;
        if (top.remaining <= 0) stack.pop();
      }
      if (childCount > 0) stack.push({ node, remaining: childCount });
    } else {
      top.node.children.push(p);
      if (top.remaining !== Infinity) {
        top.remaining--;
        if (top.remaining <= 0) stack.pop();
      }
    }
  });
  return root.children;
};

export const ParamList: React.FC<{ params: any[]; nodeId: string; onApply: any; onSyncProp?: any; onOpenColorModal?: any }> = ({ params, nodeId, onApply, onSyncProp, onOpenColorModal }) => {
  const tree = useMemo(() => buildParamTree(params), [params]);

  const collectGroupIndices = (nodes: any[], out: number[]) => {
    nodes.forEach(n => {
      if (n.kind === 'group') { out.push(n.index); collectGroupIndices(n.children, out); }
    });
    return out;
  };

  const [collapsed, setCollapsed] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    collectGroupIndices(tree, []).forEach(i => { m[i] = false; });
    return m;
  });

  useEffect(() => {
    const indices = collectGroupIndices(tree, []);
    setCollapsed(prev => {
      const next = { ...prev };
      indices.forEach(i => { if (!(i in next)) next[i] = false; });
      return next;
    });
  }, [tree]);

  const toggleGroup = (idx: number) => {
    setCollapsed(prev => ({ ...prev, [idx]: !(idx in prev ? prev[idx] : false) }));
  };

  const renderNodes = (nodes: any[], depth: number): any => {
    return nodes.map(node => {
      if (node.kind === 'group') {
        const isOpen = !collapsed[node.index];
        return (
          <div key={node.index} className="mpe-section">
            <div
              className={`mpe-group-header ${depth > 0 ? 'mpe-group-header--sub' : ''}`}
              style={depth > 0 ? { paddingLeft: `${15 + depth * 12}px` } : {}}
              onClick={() => toggleGroup(node.index)}
            >
              <span className={`mpe-group-arrow ${isOpen ? 'mpe-group-arrow--open' : ''}`}>›</span>
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
      if (/word progression|\u24c9|\u24c8|word index/i.test(node.name || node.displayName || '')) return null;
      if (node.kind === 'vector') {
        return <MogrtVectorControl key={node.index} param={node} nodeId={nodeId} onApply={onApply} onSyncProp={onSyncProp} />;
      }
      return <MogrtControl key={node.index} param={node} nodeId={nodeId} onApply={onApply} onSyncProp={onSyncProp} onOpenColorModal={onOpenColorModal} />;
    });
  };

  return <div>{renderNodes(tree, 0)}</div>;
};
