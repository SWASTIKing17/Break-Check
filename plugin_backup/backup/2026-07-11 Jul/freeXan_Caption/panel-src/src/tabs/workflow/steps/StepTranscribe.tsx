import React, { useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { node } from '@/lib/node';
import { csi } from '@/lib/csi';
import { ManualToggle, Toast } from '../shared';

interface StepProps {
  stepNum: number;
  active: boolean;
  completed: boolean;
}

export const StepTranscribe: React.FC<StepProps> = ({ stepNum, active, completed }) => {
  const { srtPath, setStage, manualMode, setManualMode } = useWorkflowStore();
  const [copying, setCopying] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  
  const isManual = !!manualMode[stepNum];

  const getSkillPath = () => {
    if (!node.isAvailable) return '';
    const root = csi.getExtensionPath();
    return node.path.join(root, 'panel', 'prompt', 'Hindi to Hinglish SRT.SKILL.md');
  };

  const handleCopy = () => {
    if (!node.isAvailable || !srtPath) return;
    const skillPath = getSkillPath();
    
    if (!node.fs.existsSync(skillPath)) {
      alert(`Skill file missing at: ${skillPath}`);
      return;
    }

    setCopying(true);

    const srtEsc = srtPath.replace(/'/g, "''");
    const skillEsc = skillPath.replace(/'/g, "''");

    const ps = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$fc = New-Object System.Collections.Specialized.StringCollection',
      `$fc.Add('${srtEsc}')`,
      `$fc.Add('${skillEsc}')`,
      '[System.Windows.Forms.Clipboard]::SetFileDropList($fc)',
      "Start-Process 'https://claude.ai/new'"
    ].join('; ');

    node.child_process.exec(`powershell -NoProfile -NonInteractive -Command "${ps}"`, (err) => {
      setCopying(false);
      if (err) {
        alert(`Clipboard error: ${err.message}`);
        return;
      }
      setStage(3);
    });
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
  };

  const handleFileAction = (e: React.MouseEvent, path: string, type: 'click' | 'double' | 'context') => {
    if (type === 'context') e.preventDefault();
    if (!node.isAvailable) return;

    if (type === 'click') {
      // Copy to clipboard using PowerShell to ensure no encoding issues
      const ps = `Set-Clipboard -Value '${path.replace(/'/g, "''")}'`;
      node.child_process.exec(`powershell -NoProfile -NonInteractive -Command "${ps}"`, () => {
        showToast(`Copied ${node.path.basename(path)} to clipboard`);
      });
    } else if (type === 'double') {
      csi.evalScriptRaw(`app.open(new File("${path.replace(/\\/g, '\\\\')}"))`).catch(() => {
        // fallback
        node.child_process.exec(`start "" "${path}"`);
      });
    } else if (type === 'context') {
      // reveal in explorer
      node.child_process.exec(`explorer /select,"${path}"`);
    }
  };

  return (
    <div className={`fx-step ${active ? 'fx-step--active' : ''} ${completed ? 'fx-step--completed' : ''}`}>
      <div className="fx-step__indicator">
        {completed ? <i className="fas fa-check" /> : stepNum}
      </div>
      <div className="fx-step__content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="fx-step__title">Transcribe to Hinglish</h3>
          {active && <ManualToggle isManual={isManual} onToggle={() => setManualMode(stepNum, !isManual)} />}
        </div>
        <p className="fx-step__desc">
          {completed 
            ? 'Copied to clipboard.' 
            : 'Copy your SRT and the freeXan skill prompt to your clipboard.'}
        </p>

        {active && isManual && (
          <div className="fx-manual-panel">
            <p style={{ fontSize: '11px', color: 'var(--fx-text-dim)', marginBottom: '8px' }}>
              Click to copy path, double-click to open, right-click to reveal.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="fx-btn fx-btn--secondary"
                style={{ flex: 1 }}
                onClick={(e) => handleFileAction(e, getSkillPath(), 'click')}
                onDoubleClick={(e) => handleFileAction(e, getSkillPath(), 'double')}
                onContextMenu={(e) => handleFileAction(e, getSkillPath(), 'context')}
              >
                <i className="fas fa-file-code" /> Prompt File
              </button>
              <button 
                className="fx-btn fx-btn--secondary"
                style={{ flex: 1 }}
                onClick={(e) => handleFileAction(e, srtPath || '', 'click')}
                onDoubleClick={(e) => handleFileAction(e, srtPath || '', 'double')}
                onContextMenu={(e) => handleFileAction(e, srtPath || '', 'context')}
                disabled={!srtPath}
              >
                <i className="fas fa-file-alt" /> SRT File
              </button>
            </div>
            <button 
              className="fx-btn fx-btn--primary" 
              style={{ marginTop: '8px', padding: '8px', fontSize: '12px' }}
              onClick={() => setStage(3)}
            >
              Continue to Parse
            </button>
          </div>
        )}

        {active && !isManual && (
          <div className="fx-step__action">
            <button className="fx-btn fx-btn--secondary" onClick={handleCopy} disabled={copying}>
              <i className="fas fa-copy" /> {copying ? 'Copying...' : 'Copy to AI'}
            </button>
          </div>
        )}
      </div>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
};
