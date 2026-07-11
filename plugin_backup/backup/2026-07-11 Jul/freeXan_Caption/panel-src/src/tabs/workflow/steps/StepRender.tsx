import React, { useState, useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { useJsx } from '@/hooks/useJsx';
import { ManualToggle, ProgressBar, showCepFileBrowser } from '../shared';
import { csi } from '@/lib/csi';
import { node } from '@/lib/node';

interface StepProps {
  stepNum: number;
  active: boolean;
  completed: boolean;
}

export const StepRender: React.FC<StepProps> = ({ stepNum, active, completed }) => {
  const { 
    mogrtPath, wbwPath, charsPerPhrase, phrasingSrtPath, phrasingMode,
    setMogrtPath, setCharsPerPhrase, setPhrasingSrtPath, setPhrasingMode,
    manualMode, setManualMode 
  } = useWorkflowStore();
  const { execute } = useJsx();
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const isManual = !!manualMode[stepNum];

  // Check active_mogrt.txt on mount and listen to Mister BloomX events
  useEffect(() => {
    if (!active) return;
    
    const onMogrtSelected = (e: any) => {
      const payload = e.detail;
      if (payload && payload.mogrtPath) {
        setMogrtPath(payload.mogrtPath);
      }
    };
    
    window.addEventListener('freexan-caption:replace_selected', onMogrtSelected);
    csi.dispatch('bloomx:request_selected_mogrt');
    
    if (!isManual && node.isAvailable) {
      try {
        const fxDir = node.path.join(node.os.homedir(), 'AppData', 'Roaming', 'freeXan');
        const activeMogrtTxt = node.path.join(fxDir, 'active_mogrt.txt');
        if (node.fs.existsSync(activeMogrtTxt)) {
          const storedPath = node.fs.readFileSync(activeMogrtTxt, 'utf8').trim();
          if (storedPath) setMogrtPath(storedPath);
        }
      } catch (e) {
        console.warn('Failed to read active_mogrt.txt on mount', e);
      }
    }
    
    return () => window.removeEventListener('freexan-caption:replace_selected', onMogrtSelected);
  }, [active, isManual, setMogrtPath]);

  // Mock progress emitter for the minimalistic progress bar
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (rendering) {
      setProgress(0);
      timer = setInterval(() => {
        setProgress(p => {
          if (p >= 95) return p;
          return p + 5;
        });
      }, 500);
    } else {
      setProgress(0);
    }
    return () => clearInterval(timer);
  }, [rendering]);

  const handleBrowseMogrt = () => {
    const result = showCepFileBrowser('Select MOGRT', ['mogrt']);
    if (result) setMogrtPath(result);
  };

  const handleBrowsePhrasingSrt = () => {
    const result = showCepFileBrowser('Select Phrasing SRT', ['srt']);
    if (result) setPhrasingSrtPath(result);
  };

  const handlePhrasingSrtDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith('.srt')) {
        const path = (file as any).path;
        if (path) setPhrasingSrtPath(path);
      }
    }
  };

  const handleMogrtDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith('.mogrt')) {
        const path = (file as any).path;
        if (path) setMogrtPath(path);
      }
    }
  };

  const handleRender = async () => {
    if (!mogrtPath || !wbwPath) {
      alert('Missing MOGRT or parsed SRT path. Please select a MOGRT in Mister BloomX.');
      return;
    }

    if (!node.isAvailable) {
      alert('Node.js is not available. Caption generation is only supported inside the Premiere Pro extension.');
      return;
    }

    setRendering(true);
    setProgress(0);

    try {
      // 1. Read and Parse the word-by-word SRT file
      const rawSrt = node.fs.readFileSync(wbwPath, 'utf8');
      const blocks = rawSrt.trim().split(/\r?\n\r?\n/);
      const wordsList: any[] = [];

      const tsToMs = (ts: string) => {
        const [h, m, rest] = ts.replace(',', '.').split(':');
        const [s, ms] = rest.split('.');
        return (+h * 3600 + +m * 60 + +s) * 1000 + +ms;
      };

      for (let i = 0; i < blocks.length; i++) {
        const lines = blocks[i].split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) continue;

        const tsLine = lines.find(l => l.includes('-->'));
        if (!tsLine) continue;
        const tsMatch = tsLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
        if (!tsMatch) continue;

        const start = tsToMs(tsMatch[1]) / 1000;
        const end = tsToMs(tsMatch[2]) / 1000;
        const tsIdx = lines.indexOf(tsLine);
        const text = lines.slice(tsIdx + 1).join(' ').trim();
        if (!text) continue;

        const words = text.split(/\s+/).filter(Boolean);
        const charDur = (end - start) / text.length;

        if (words.length > 1) {
          const dur = (end - start) / words.length;
          for (let w = 0; w < words.length; w++) {
            const wStart = start + w * dur;
            const wEnd = start + (w + 1) * dur;
            wordsList.push({
              wordText: words[w],
              wordDuration: dur,
              characterDuration: charDur,
              wordCharacters: words[w].length,
              wordStart: wStart,
              wordEnd: wEnd,
            });
          }
        } else {
          wordsList.push({
            wordText: text,
            wordDuration: end - start,
            characterDuration: charDur,
            wordCharacters: text.length,
            wordStart: start,
            wordEnd: end,
          });
        }
      }

      if (wordsList.length === 0) {
        throw new Error('No words found in SRT file.');
      }

      // 2. Phrasing logic
      let s = 1;
      let phraseText = "";
      let M = 1;
      let P = 1;
      let J = 1;
      const phrases: string[] = [];

      if (phrasingMode === 'dual_srt' && phrasingSrtPath && node.isAvailable) {
        const rawPhrasingSrt = node.fs.readFileSync(phrasingSrtPath, 'utf8');
        const pBlocks = rawPhrasingSrt.trim().split(/\r?\n\r?\n/);
        const phraseBlocks: { start: number; end: number; text: string }[] = [];

        const tsToMs = (ts: string) => {
          const [h, m, rest] = ts.replace(',', '.').split(':');
          const [sec, ms] = rest.split('.');
          return (+h * 3600 + +m * 60 + +sec) * 1000 + +ms;
        };

        for (let i = 0; i < pBlocks.length; i++) {
          const lines = pBlocks[i].split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          if (lines.length < 2) continue;
          const tsLine = lines.find(l => l.includes('-->'));
          if (!tsLine) continue;
          const tsMatch = tsLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
          if (!tsMatch) continue;
          const start = tsToMs(tsMatch[1]) / 1000;
          const end = tsToMs(tsMatch[2]) / 1000;
          const tsIdx = lines.indexOf(tsLine);
          const text = lines.slice(tsIdx + 1).join(' ').trim();
          if (text) phraseBlocks.push({ start, end, text });
        }

        if (phraseBlocks.length === 0) {
          throw new Error('No valid phrase blocks found in Phrasing SRT.');
        }

        let lastBlockIdx = 0;
        const blockWordCounts: Record<number, number> = {};

        for (let e = 0; e < wordsList.length; e++) {
          const d = wordsList[e];
          if (e < wordsList.length - 1) {
            const nextWord = wordsList[e + 1];
            d.wordEnd = nextWord.wordStart;
            if (nextWord.wordStart - d.wordEnd > 5) d.wordEnd = d.wordStart + 5;
          }

          let bestIdx = lastBlockIdx;
          let maxOverlap = -999999;
          for (let bIdx = lastBlockIdx; bIdx < phraseBlocks.length; bIdx++) {
            const pb = phraseBlocks[bIdx];
            const overlap = Math.min(d.wordEnd, pb.end) - Math.max(d.wordStart, pb.start);
            if (overlap > maxOverlap) {
              maxOverlap = overlap;
              bestIdx = bIdx;
            }
            if (pb.start > d.wordEnd + 1.0) break;
          }
          lastBlockIdx = bestIdx;
          const pb = phraseBlocks[bestIdx];
          blockWordCounts[bestIdx] = (blockWordCounts[bestIdx] || 0) + 1;
          const wordIdxInBlock = blockWordCounts[bestIdx];

          d.phraseText = pb.text;
          d.phraseNumber = bestIdx + 1;
          d.numWords = wordIdxInBlock;
          d.progressionValue = wordIdxInBlock;
          d.videoTrack = (bestIdx % 2 === 0) ? 1 : 2;
        }
      } else {
        const phraseLimit = (phrasingMode === 'slider') ? charsPerPhrase : 100;

        for (let e = 0; e < wordsList.length; e++) {
          const d = wordsList[e];
          if (e < wordsList.length - 1) {
            const nextWord = wordsList[e + 1];
            d.wordEnd = nextWord.wordStart;
            if (nextWord.wordStart - d.wordEnd > 5) {
              d.wordEnd = d.wordStart + 5;
            }
          }
          
          const f = phraseText.length;
          if (f === 0) {
            phraseText = d.wordText;
            d.phraseText = phraseText;
            d.phraseNumber = s;
            d.numWords = M;
            d.progressionValue = P;
            d.videoTrack = J;
          } else if (f > 0 && f < phraseLimit && !d.wordText.match(/[?!.]/g)) {
            phraseText += " " + d.wordText;
            d.phraseText = phraseText;
            d.phraseNumber = s;
            d.videoTrack = J;
            M++;
            P++;
            d.numWords = M;
            d.progressionValue = P;
          } else if (f > 0 && f < phraseLimit && d.wordText.match(/[?!.]/g)) {
            phraseText += " " + d.wordText;
            d.phraseText = phraseText;
            d.phraseNumber = s;
            d.videoTrack = J;
            M++;
            P++;
            d.numWords = M;
            d.progressionValue = P;
            phrases.push(phraseText);
            phraseText = "";
            s++;
            J = J === 1 ? 2 : 1;
            M = 1;
            P = 1;
          } else if (f >= phraseLimit) {
            phrases.push(phraseText);
            phraseText = d.wordText;
            d.phraseText = phraseText;
            s++;
            d.phraseNumber = s;
            M = 1;
            P = 1;
            d.numWords = M;
            d.progressionValue = P;
            J = J === 1 ? 2 : 1;
            d.videoTrack = J;
          }
          
          if (e === wordsList.length - 1 && phraseText) {
            phrases.push(phraseText);
          }
        }

        for (let e = 0; e < wordsList.length; e++) {
          const U = wordsList[e].phraseNumber;
          wordsList[e].phraseText = phrases[U - 1] || "";
        }
      }

      // 3. Call getData
      const requestData = { srtFilePath: wbwPath, mogrtFilePath: mogrtPath };
      const appData: any = await execute('getData', requestData);
      if (!appData) {
        throw new Error('Failed to retrieve project / MOGRT details.');
      }
      if (appData.status === 'Invalid' || !appData.activeSequence) {
        throw new Error(appData.message || 'No active sequence found.');
      }

      if (appData.sequenceFrameRate !== appData.mogrtFrameRate) {
        console.warn(`[freeXan] Frame rates are not equal (Sequence: ${appData.sequenceFrameRate} vs MOGRT: ${appData.mogrtFrameRate}). Proceeding anyway.`);
      }

      const Q = appData.desiredMogrtName;
      const g = appData.desiredMogrtProjectItem;
      const E = appData.desiredMogrtNodeId;
      const e = appData.firstVideoTrack;
      const o = appData.secondVideoTrack;

      // 4. Create captions loop sequentially
      for (let t = 0; t < wordsList.length; t++) {
        const r = wordsList[t];
        r.mogrtName = Q;
        r.mogrtProjectItem = g;
        r.mogrtNodeId = E;
        r.firstVideoTrack = e;
        r.secondVideoTrack = o;
        r.totalWords = wordsList.length;
        r.wordNumber = t + 1;
        r.isLastWordInPhrase = false;

        if (t < wordsList.length - 1) {
          r.nextWordProgression = wordsList[t + 1].progressionValue;
          if (wordsList[t + 1].progressionValue === 1) {
            r.isLastWordInPhrase = true;
          }
        } else {
          r.isLastWordInPhrase = true;
        }

        // Set progress
        setProgress(Math.round((t / wordsList.length) * 100));
        
        // Execute createCaptions JSX
        const result = await execute('createCaptions', r);
        if (!result) {
          throw new Error(`Failed to create caption for word ${t + 1}: "${r.wordText}"`);
        }
      }

      // Final cleanup pass: Bridge micro 1-2 frame gaps between adjacent caption clips
      try {
        await execute('bridgeCaptionGaps', {});
      } catch (err) {
        console.error('Failed to execute bridgeCaptionGaps:', err);
      }

      setProgress(100);

      // Play success chime sound if available
      try {
        const extRoot = csi.getExtensionPath();
        if (extRoot) {
          const soundFile = node.path.join(extRoot, 'panel', 'images', 'MA_OriginalSound_InfographicIdeas_1.wav');
          if (node.fs.existsSync(soundFile)) {
            new Audio(`file:///${soundFile.replace(/\\/g, '/')}`).play().catch(() => {});
          }
        }
      } catch (eSound) {
        console.warn('Failed to play success sound', eSound);
      }

      alert('Captions generated successfully!');
    } catch (e: any) {
      alert(`Render failed: ${e.message}`);
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className={`fx-step ${active ? 'fx-step--active' : ''} ${completed ? 'fx-step--completed' : ''}`}>
      <div className="fx-step__indicator">
        {completed ? <i className="fas fa-check" /> : stepNum}
      </div>
      <div className="fx-step__content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="fx-step__title">Render Captions</h3>
          {active && <ManualToggle isManual={isManual} onToggle={() => setManualMode(stepNum, !isManual)} />}
        </div>
        <p className="fx-step__desc">
          Select your MOGRT template, then trigger compilation.
        </p>

        {active && isManual && (
          <div className="fx-manual-panel" style={{ marginTop: '12px' }}>
            {/* Template Source */}
            <div>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--fx-text-mute)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                Template Source (Manual)
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input 
                  type="text" 
                  className="fx-input" 
                  value={mogrtPath || ''} 
                  onChange={(e) => setMogrtPath(e.target.value)}
                  placeholder="Drop .mogrt file here, or browse..."
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleMogrtDrop}
                  style={{ flex: 1, padding: '8px', background: 'var(--fx-bg-deep)', border: '1px solid var(--fx-border)', color: 'var(--fx-text)', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}
                />
                <button className="fx-btn fx-btn--secondary" onClick={handleBrowseMogrt} style={{ padding: '8px 12px' }}>
                  <i className="fas fa-folder-open" />
                </button>
              </div>
            </div>

            {/* Phrasing Mode Selection */}
            <div style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--fx-text-mute)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                Phrasing Mode
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--fx-text)', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="phrasingMode" 
                    checked={phrasingMode === 'auto'} 
                    onChange={() => setPhrasingMode('auto')} 
                  />
                  Standard Auto Phrasing (100 ch)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--fx-text)', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="phrasingMode" 
                    checked={phrasingMode === 'slider'} 
                    onChange={() => setPhrasingMode('slider')} 
                  />
                  Custom Character Limit (Slider)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--fx-text)', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="phrasingMode" 
                    checked={phrasingMode === 'dual_srt'} 
                    onChange={() => setPhrasingMode('dual_srt')} 
                  />
                  Custom Phrasing SRT (Dual SRT)
                </label>
              </div>
            </div>

            {/* Visual Slider */}
            {phrasingMode === 'slider' && (
              <div style={{ background: 'var(--fx-bg-elev)', padding: '12px', borderRadius: '4px', border: '1px solid var(--fx-border)', marginTop: '8px' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--fx-text)', marginBottom: '8px' }}>
                  Chars / Phrase
                  <span style={{ color: 'var(--fx-accent)', fontFamily: 'monospace', fontWeight: 'bold' }}>{charsPerPhrase} ch</span>
                </label>
                <input 
                  type="range" 
                  className="fx-slider"
                  min="1" max="100" 
                  value={charsPerPhrase} 
                  onChange={(e) => setCharsPerPhrase(Number(e.target.value))}
                />
              </div>
            )}

            {/* Custom Phrasing SRT Input */}
            {phrasingMode === 'dual_srt' && (
              <div style={{ marginTop: '8px' }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--fx-text-mute)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                  Phrasing SRT File
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input 
                    type="text" 
                    className="fx-input" 
                    value={phrasingSrtPath || ''} 
                    onChange={(e) => setPhrasingSrtPath(e.target.value)}
                    placeholder="Drop phrasing .srt file here, or browse..."
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handlePhrasingSrtDrop}
                    style={{ flex: 1, padding: '8px', background: 'var(--fx-bg-deep)', border: '1px solid var(--fx-border)', color: 'var(--fx-text)', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}
                  />
                  <button className="fx-btn fx-btn--secondary" onClick={handleBrowsePhrasingSrt} style={{ padding: '8px 12px' }}>
                    <i className="fas fa-folder-open" />
                  </button>
                </div>
              </div>
            )}

            <button 
              className="fx-btn fx-btn--primary" 
              onClick={handleRender} 
              disabled={rendering || !mogrtPath}
              style={{ marginTop: '8px', padding: '12px', fontSize: '13px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}
            >
              <i className="fas fa-magic" /> {rendering ? 'Rendering...' : 'Generate Captions'}
            </button>
            {rendering && <ProgressBar progress={progress} />}
          </div>
        )}

        {active && !isManual && (
          <div className="fx-step__action" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button 
              className="fx-btn fx-btn--primary" 
              onClick={handleRender} 
              disabled={rendering || !mogrtPath}
              style={{ padding: '12px', fontSize: '13px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}
            >
              <i className="fas fa-magic" /> {rendering ? 'Rendering...' : 'Generate Captions'}
            </button>
            {rendering && <ProgressBar progress={progress} />}
          </div>
        )}

      </div>
    </div>
  );
};
