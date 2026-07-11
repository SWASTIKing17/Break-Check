import React, { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { useWorkflowStore } from '@/store/workflowStore';
import { node } from '@/lib/node';
import { ManualToggle, showCepFileBrowser } from '../shared';
import { csi } from '@/lib/csi';

interface StepProps {
  stepNum: number;
  active: boolean;
  completed: boolean;
}

export const StepParseSrt: React.FC<StepProps> = ({ stepNum, active, completed }) => {
  const projectPath = useSessionStore((s) => s.projectPath);
  const { setStage, setWbwPath, manualMode, setManualMode } = useWorkflowStore();
  
  const isManual = !!manualMode[stepNum];

  const [candidates, setCandidates] = useState<{name: string, full: string}[]>([]);
  const [confirmedWbw, setConfirmedWbw] = useState<{name: string, words: number} | null>(null);
  const [manualWbwPath, setManualWbwPath] = useState('');

  useEffect(() => {
    if (!active || !projectPath || !node.isAvailable || isManual) return;

    const projectFolder = node.path.dirname(node.path.dirname(projectPath));
    
    const timer = setInterval(() => {
      try {
        const files = node.fs.readdirSync(projectFolder)
          .filter(f => {
            const l = f.toLowerCase();
            return l.startsWith('hinglish_') && l.endsWith('.srt');
          })
          .map(f => {
            const full = node.path.join(projectFolder, f);
            return { name: f, full, mtime: node.fs.statSync(full).mtimeMs };
          })
          .sort((a, b) => b.mtime - a.mtime);

        setCandidates(files);
      } catch (e) {
        // Ignore read errors
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [active, projectPath, isManual]);

  const splitToWords = (filePath: string): string | null => {
    if (!node.isAvailable) return null;
    let raw;
    try { raw = node.fs.readFileSync(filePath, 'utf8'); } catch (e) { return null; }

    const blocks = raw.trim().split(/\r?\n\r?\n/);
    const out = [];
    let idx = 1;

    const tsToMs = (ts: string) => {
      const [h, m, rest] = ts.replace(',', '.').split(':');
      const [s, ms] = rest.split('.');
      return (+h * 3600 + +m * 60 + +s) * 1000 + +ms;
    };

    const pad2 = (n: number) => n < 10 ? '0' + n : '' + n;
    const pad3 = (n: number) => n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n;
    const msToTs = (ms: number) => {
      const h = Math.floor(ms / 3600000); ms %= 3600000;
      const m = Math.floor(ms / 60000); ms %= 60000;
      const s = Math.floor(ms / 1000); ms %= 1000;
      return pad2(h) + ':' + pad2(m) + ':' + pad2(s) + ',' + pad3(ms);
    };

    for (let i = 0; i < blocks.length; i++) {
      const lines = blocks[i].split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) continue;

      const tsLine = lines.find(l => l.includes('-->'));
      if (!tsLine) continue;
      const tsMatch = tsLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
      if (!tsMatch) continue;

      const startMs = tsToMs(tsMatch[1]);
      const endMs = tsToMs(tsMatch[2]);
      const tsIdx = lines.indexOf(tsLine);
      const text = lines.slice(tsIdx + 1).join(' ').trim();
      if (!text) continue;

      const words = text.split(/\s+/).filter(Boolean);
      if (words.length === 1) {
        out.push(`${idx++}\n${msToTs(startMs)} --> ${msToTs(endMs)}\n${words[0]}`);
      } else {
        const dur = (endMs - startMs) / words.length;
        for (let w = 0; w < words.length; w++) {
          const wStart = Math.round(startMs + w * dur);
          const wEnd = Math.round(startMs + (w + 1) * dur);
          out.push(`${idx++}\n${msToTs(wStart)} --> ${msToTs(wEnd)}\n${words[w]}`);
        }
      }
    }
    return out.join('\n\n') + '\n';
  };

  const countEntries = (srt: string) => {
    return (srt.match(/^\d+$/mg) || []).length;
  };

  const processAndConfirm = (fullPath: string, isAlreadySplit: boolean = false) => {
    if (!node.isAvailable) return;
    
    let processed;
    if (isAlreadySplit) {
      try { processed = node.fs.readFileSync(fullPath, 'utf8'); } catch(e) { return; }
    } else {
      processed = splitToWords(fullPath);
    }

    if (!processed) {
      alert(`Could not parse ${node.path.basename(fullPath)}`);
      return;
    }

    const tempPath = node.path.join(node.os.tmpdir(), `sm_wbw_processed_${Date.now()}.srt`);
    try {
      node.fs.writeFileSync(tempPath, processed, 'utf8');
      setWbwPath(tempPath);
      setConfirmedWbw({ name: node.path.basename(fullPath), words: countEntries(processed) });
      setStage(4);
    } catch (e: any) {
      alert(`Temp write failed: ${e.message}`);
    }
  };

  const handleManualBrowse = () => {
    const res = showCepFileBrowser('Select Hinglish SRT', ['srt']);
    if (res) setManualWbwPath(res);
  };

  return (
    <div className={`fx-step ${active ? 'fx-step--active' : ''} ${completed ? 'fx-step--completed' : ''}`}>
      <div className="fx-step__indicator">
        {completed ? <i className="fas fa-check" /> : stepNum}
      </div>
      <div className="fx-step__content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="fx-step__title">Parse Hinglish SRT</h3>
          {active && <ManualToggle isManual={isManual} onToggle={() => setManualMode(stepNum, !isManual)} />}
        </div>
        <p className="fx-step__desc">
          {completed 
            ? 'Hinglish SRT processed.' 
            : 'Wait for the AI to export hinglish_*.srt to your project folder.'}
        </p>

        {active && isManual && (
          <div className="fx-manual-panel">
            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--fx-text-mute)', textTransform: 'uppercase' }}>
              Provide Hinglish SRT
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                className="fx-input" 
                value={manualWbwPath} 
                onChange={(e) => setManualWbwPath(e.target.value)}
                placeholder="Path to .srt file"
                style={{ flex: 1, padding: '8px', background: 'var(--fx-bg-deep)', border: '1px solid var(--fx-border)', color: 'var(--fx-text)', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}
              />
              <button className="fx-btn fx-btn--secondary" onClick={handleManualBrowse} style={{ padding: '8px 12px' }}>
                <i className="fas fa-folder-open" />
              </button>
            </div>
            <button 
              className="fx-btn fx-btn--primary" 
              onClick={() => processAndConfirm(manualWbwPath, false)}
              disabled={!manualWbwPath}
              style={{ padding: '8px', marginTop: '4px', fontSize: '12px' }}
            >
              Parse SRT
            </button>
          </div>
        )}

        {active && !isManual && candidates.length > 0 && (
          <div className="fx-step__action">
            {candidates.map(c => (
              <button key={c.full} className="fx-file-badge" onClick={() => processAndConfirm(c.full, false)}>
                <i className="far fa-file-alt" /> {c.name}
              </button>
            ))}
          </div>
        )}

        {completed && confirmedWbw && (
          <div className="fx-step__action">
            <span className="fx-file-badge fx-file-badge--confirmed">
              <i className="fas fa-check-circle" /> {confirmedWbw.name} ({confirmedWbw.words} words)
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
