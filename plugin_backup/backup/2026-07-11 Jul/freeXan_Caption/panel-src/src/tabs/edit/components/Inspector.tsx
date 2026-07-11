/**
 * freeXan Caption — Edit Inspector
 * Port of the right-side inspector panel: color picker, sliders, toggles.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Color Utils ---
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 };
};

const rgbToHex = (r: number, g: number, b: number) => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
};

const rgbToHsb = (r: number, g: number, b: number) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s, v = max;
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

const hsbToRgb = (h: number, s: number, v: number) => {
  s /= 100; v /= 100;
  let r = 0, g = 0, b = 0;
  const i = Math.floor(h / 60);
  const f = h / 60 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
};

// --- Cockpit Color Picker ---
export const CockpitColorPicker: React.FC<{ initialHex: string; onChange: (h: string) => void; onClose: () => void; style?: React.CSSProperties; hideHeader?: boolean }> = ({ initialHex, onChange, onClose, style, hideHeader }) => {
  const [tabMode, setTabMode] = useState<'hex' | 'rgb' | 'hsl'>('hex');
  const [hsb, setHsb] = useState(() => {
    const rgb = hexToRgb(initialHex);
    return rgbToHsb(rgb.r, rgb.g, rgb.b);
  });
  
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('freexan_caption_color_history') || '["#29BFBE", "#8A63F2", "#FF4D4D", "#FFFFFF", "#000000"]'); }
    catch (e) { return ["#29BFBE"]; }
  });

  const currentHex = useMemo(() => {
    const rgb = hsbToRgb(hsb.h, hsb.s, hsb.b);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }, [hsb]);

  const [localHex, setLocalHex] = useState(() => currentHex.replace('#', ''));
  useEffect(() => {
    setLocalHex(currentHex.replace('#', ''));
  }, [currentHex]);

  const currentRgb = useMemo(() => hsbToRgb(hsb.h, hsb.s, hsb.b), [hsb]);

  const handleHsbChange = (updates: Partial<typeof hsb>) => {
    const newHsb = { ...hsb, ...updates };
    setHsb(newHsb);
    const rgb = hsbToRgb(newHsb.h, newHsb.s, newHsb.b);
    onChange(rgbToHex(rgb.r, rgb.g, rgb.b));
  };

  const addToHistory = (hex: string) => {
    const newHistory = [hex, ...history.filter(c => c !== hex)].slice(0, 6);
    setHistory(newHistory);
    localStorage.setItem('freexan_caption_color_history', JSON.stringify(newHistory));
  };

  const theory = useMemo(() => {
    const comp = { ...hsb, h: (hsb.h + 180) % 360 };
    const triad1 = { ...hsb, h: (hsb.h + 120) % 360 };
    const triad2 = { ...hsb, h: (hsb.h + 240) % 360 };
    const analo1 = { ...hsb, h: (hsb.h + 30) % 360 };
    const analo2 = { ...hsb, h: (hsb.h - 30 + 360) % 360 };

    const toHex = (h: any) => {
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
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {!hideHeader && (
        <div className="cc-cp-header">
          <span className="cc-cp-title">Color Picker</span>
          <button className="cc-cp-close" onClick={() => { addToHistory(currentHex); onClose(); }}>✕</button>
        </div>
      )}

      <div className="cc-cp-main">
        <div 
          className="cc-cp-sat-box"
          style={{ backgroundColor: `hsl(${hsb.h}, 100%, 50%)` }}
          onMouseDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const update = (moveE: MouseEvent) => {
              const x = Math.max(0, Math.min(rect.width, moveE.clientX - rect.left));
              const y = Math.max(0, Math.min(rect.height, moveE.clientY - rect.top));
              handleHsbChange({
                s: (x / rect.width) * 100,
                b: 100 - (y / rect.height) * 100
              });
            };
            update(e.nativeEvent);
            const onUp = () => { window.removeEventListener('mousemove', update); window.removeEventListener('mouseup', onUp); };
            window.addEventListener('mousemove', update);
            window.addEventListener('mouseup', onUp);
          }}
        >
          <div className="cc-cp-sat-white"></div>
          <div className="cc-cp-sat-black"></div>
          <div 
            className="cc-cp-sat-thumb" 
            style={{ 
              left: `${hsb.s}%`, 
              top: `${100 - hsb.b}%`,
              backgroundColor: currentHex 
            }} 
          />
        </div>

        <div className="cc-cp-sliders">
          <div className="cc-cp-hue-slider">
            <input 
              type="range" min="0" max="360" value={hsb.h}
              onChange={(e) => handleHsbChange({ h: parseFloat(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <div className="cc-cp-tabs">
        <span className={`cc-cp-tab ${tabMode === 'hex' ? 'active' : ''}`} onClick={() => setTabMode('hex')} style={{ cursor: 'pointer' }}>Hex</span>
        <span className={`cc-cp-tab ${tabMode === 'rgb' ? 'active' : ''}`} onClick={() => setTabMode('rgb')} style={{ cursor: 'pointer' }}>RGB</span>
        <span className={`cc-cp-tab ${tabMode === 'hsl' ? 'active' : ''}`} onClick={() => setTabMode('hsl')} style={{ cursor: 'pointer' }}>HSL</span>
      </div>

      <div className="cc-cp-inputs" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {tabMode === 'hex' && (
          <>
            <div className="cc-cp-input-group" style={{ flex: 1 }}>
              <span className="cc-cp-input-icon">#</span>
              <input 
                type="text" value={localHex} 
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
                  setLocalHex(raw);
                  if (raw.length === 3 || raw.length === 6) {
                    let full = raw;
                    if (raw.length === 3) full = raw.split('').map(c => c + c).join('');
                    const hex = '#' + full;
                    const rgb = hexToRgb(hex);
                    setHsb(rgbToHsb(rgb.r, rgb.g, rgb.b));
                    onChange(hex);
                  }
                }}
                onBlur={() => setLocalHex(currentHex.replace('#', ''))}
              />
            </div>
            <div className="cc-cp-input-group small" style={{ width: '50px' }}>
              <input type="text" value="100" readOnly className="cc-scrub-text" />
              <span className="cc-cp-input-suffix">%</span>
            </div>
          </>
        )}
        {tabMode === 'rgb' && (
          <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
            {(['r', 'g', 'b'] as const).map(channel => (
              <div key={channel} className="cc-cp-input-group" style={{ flex: 1 }}>
                <span className="cc-cp-input-icon" style={{ textTransform: 'uppercase' }}>{channel}</span>
                <input 
                  type="number" min="0" max="255" value={currentRgb[channel]} 
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(255, parseInt(e.target.value) || 0));
                    const nextRgb = { ...currentRgb, [channel]: val };
                    setHsb(rgbToHsb(nextRgb.r, nextRgb.g, nextRgb.b));
                    onChange(rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b));
                  }}
                />
              </div>
            ))}
          </div>
        )}
        {tabMode === 'hsl' && (
          <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
            <div className="cc-cp-input-group" style={{ flex: 1 }}>
              <span className="cc-cp-input-icon">H</span>
              <input 
                type="number" min="0" max="360" value={Math.round(hsb.h)} 
                onChange={(e) => handleHsbChange({ h: Math.max(0, Math.min(360, parseInt(e.target.value) || 0)) })}
              />
            </div>
            <div className="cc-cp-input-group" style={{ flex: 1 }}>
              <span className="cc-cp-input-icon">S</span>
              <input 
                type="number" min="0" max="100" value={Math.round(hsb.s)} 
                onChange={(e) => handleHsbChange({ s: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
              />
            </div>
            <div className="cc-cp-input-group" style={{ flex: 1 }}>
              <span className="cc-cp-input-icon">B</span>
              <input 
                type="number" min="0" max="100" value={Math.round(hsb.b)} 
                onChange={(e) => handleHsbChange({ b: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
              />
            </div>
          </div>
        )}
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

// --- Scrubber Hook ---
const useScrubber = (value: number, onChange: (v: number) => void, step = 1) => {
  const startXRef = React.useRef(0);
  const startValRef = React.useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    startXRef.current = e.clientX;
    startValRef.current = parseFloat(value as any) || 0;
    
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '9999';
    overlay.style.cursor = 'ew-resize';
    document.body.appendChild(overlay);

    const onMouseMove = (ev: MouseEvent) => {
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

// --- PropertyControl ---
export const PropertyControl: React.FC<{ prop: any; handlePropChange: any; onTogglePin: any; isPinned: boolean; }> = ({ prop, handlePropChange, onTogglePin, isPinned }) => {
  const [showPicker, setShowPicker] = useState(false);
  const iconMap: any = {
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
            <span className="cc-color-hex">{String(prop.value).toUpperCase()}</span>
            
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
            <div className="cc-point-field" {...useScrubber(prop.value[0], (val) => handlePropChange(prop.index, prop.displayName, [val, prop.value[1]]), 1)}>
              <input
                type="number"
                value={Math.round(prop.value[0])}
                onChange={(e) => handlePropChange(prop.index, prop.displayName, [parseFloat(e.target.value) || 0, prop.value[1]])}
              />
            </div>
            <div className="cc-point-field" {...useScrubber(prop.value[1], (val) => handlePropChange(prop.index, prop.displayName, [prop.value[0], val]), 1)}>
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

export const PropertyGroup: React.FC<{ group: any; handlePropChange: any; onTogglePin: any; pinnedProps: string[]; }> = ({ group, handlePropChange, onTogglePin, pinnedProps }) => {
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
            {group.props.map((prop: any, idx: number) => (
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
