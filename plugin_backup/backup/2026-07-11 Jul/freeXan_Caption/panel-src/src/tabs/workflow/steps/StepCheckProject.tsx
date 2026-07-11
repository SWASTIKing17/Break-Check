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

export const StepCheckProject: React.FC<StepProps> = ({ stepNum, active, completed }) => {
  const projectPath = useSessionStore((s) => s.projectPath);
  const { setStage, setSrtPath, manualMode, setManualMode } = useWorkflowStore();
  const isManual = !!manualMode[stepNum];
  
  const [candidates, setCandidates] = useState<{name: string, full: string}[]>([]);
  const [confirmedSrt, setConfirmedSrt] = useState<string | null>(null);
  
  // Manual state
  const [manualSrtPath, setManualSrtPath] = useState('');

  useEffect(() => {
    if (!active || !projectPath || !node.isAvailable || isManual) return;

    const projectFolder = node.path.dirname(node.path.dirname(projectPath));
    
    const timer = setInterval(() => {
      try {
        const files = node.fs.readdirSync(projectFolder)
          .filter(f => f.toLowerCase().endsWith('.srt') && !f.toLowerCase().startsWith('hinglish_'))
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

  const handleConfirm = (fullPath: string) => {
    if (!node.isAvailable) return;
    try {
      const targetPath = node.path.join(node.path.dirname(fullPath), 'Hindi.srt');
      if (fullPath !== targetPath) {
        node.fs.renameSync(fullPath, targetPath);
      }
      setConfirmedSrt('Hindi.srt');
      setSrtPath(targetPath);
      setStage(2);
    } catch (e: any) {
      alert(`Rename failed: ${e.message}`);
    }
  };

  const handleManualBrowse = () => {
    const res = showCepFileBrowser('Select SRT', ['srt']);
    if (res) setManualSrtPath(res);
  };

  const handleManualNext = () => {
    if (manualSrtPath) {
      setConfirmedSrt('Manual.srt'); // or parse name
      setSrtPath(manualSrtPath);
      setStage(2);
    }
  };

  return (
    <div className={`fx-step ${active ? 'fx-step--active' : ''} ${completed ? 'fx-step--completed' : ''}`}>
      <div className="fx-step__indicator">
        {completed ? <i className="fas fa-check" /> : stepNum}
      </div>
      <div className="fx-step__content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="fx-step__title">Check Project</h3>
          {active && <ManualToggle isManual={isManual} onToggle={() => setManualMode(stepNum, !isManual)} />}
        </div>
        <p className="fx-step__desc">
          {completed 
            ? 'SRT confirmed.' 
            : (projectPath ? 'Export a text file as SubRip (.srt) next to your project folder.' : 'Open a Premiere Pro project.')}
        </p>

        {active && isManual && (
          <div className="fx-manual-panel">
            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--fx-text-mute)', textTransform: 'uppercase' }}>
              Provide Base SRT
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                className="fx-input" 
                value={manualSrtPath} 
                onChange={(e) => setManualSrtPath(e.target.value)}
                placeholder="Path to .srt file"
                style={{ flex: 1, padding: '8px', background: 'var(--fx-bg-deep)', border: '1px solid var(--fx-border)', color: 'var(--fx-text)', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}
              />
              <button className="fx-btn fx-btn--secondary" onClick={handleManualBrowse} style={{ padding: '8px 12px' }}>
                <i className="fas fa-folder-open" />
              </button>
            </div>
            <button 
              className="fx-btn fx-btn--primary" 
              onClick={handleManualNext}
              disabled={!manualSrtPath}
              style={{ padding: '8px', marginTop: '4px', fontSize: '12px' }}
            >
              Confirm Base SRT
            </button>
          </div>
        )}

        {active && !isManual && projectPath && candidates.length > 0 && (
          <div className="fx-step__action">
            {candidates.map(c => (
              <button key={c.full} className="fx-file-badge" onClick={() => handleConfirm(c.full)}>
                <i className="far fa-file-alt" /> {c.name}
              </button>
            ))}
          </div>
        )}

        {completed && confirmedSrt && (
          <div className="fx-step__action">
            <span className="fx-file-badge fx-file-badge--confirmed">
              <i className="fas fa-check-circle" /> {confirmedSrt}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
