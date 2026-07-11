import React, { useEffect, useState } from 'react';

// A simple Toast component for temporary messages (e.g. copied to clipboard)
export const Toast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fx-toast">
      {message}
    </div>
  );
};

// A minimalistic progress bar
export const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => {
  return (
    <div className="fx-progress-bar-container">
      <div className="fx-progress-bar" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
    </div>
  );
};

// Toggle button for Manual Mode
export const ManualToggle: React.FC<{ isManual: boolean; onToggle: () => void }> = ({ isManual, onToggle }) => {
  return (
    <button 
      className={`fx-manual-toggle ${isManual ? 'is-manual' : ''}`} 
      onClick={onToggle}
      title={isManual ? 'Switch to Auto Mode' : 'Switch to Manual Mode'}
    >
      <i className="fas fa-plus" />
    </button>
  );
};

// Helper to open CEP native file dialog (or prompt fallback outside CEP)
export function showCepFileBrowser(title: string, extensions: string[]): string | null {
  if (typeof window !== 'undefined' && (window as any).cep?.fs?.showOpenDialog) {
    const r = (window as any).cep.fs.showOpenDialog(false, false, title, '', extensions);
    if (r && r.err === 0 && r.data && r.data.length > 0) {
      return r.data[0];
    }
  } else {
    const manual = prompt(`Enter path for ${title}:`);
    if (manual) return manual;
  }
  return null;
}

