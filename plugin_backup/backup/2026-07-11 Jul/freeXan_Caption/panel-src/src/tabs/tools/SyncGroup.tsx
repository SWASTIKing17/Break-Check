/**
 * freeXan Caption — SyncGroup
 * Sync properties from a master clip to selected clips.
 */
import React from 'react';
import { useJsx } from '@/hooks/useJsx';
import { csi } from '@/lib/csi';

export type SyncType = 'all' | 'text' | 'style' | 'psr';

interface SyncGroupProps {
  onStart: (label: string) => void;
  onStop: (success: boolean, label?: string) => void;
}

export const SyncGroup: React.FC<SyncGroupProps> = ({ onStart, onStop }) => {
  const { execute, loading } = useJsx();

  const handleSync = async (type: SyncType) => {
    onStart(`Syncing ${type.toUpperCase()}...`);

    try {
      const getDataFunc = type === 'text' ? 'syncTextGetData' : 'syncAllGetData';
      const data: any = await execute(getDataFunc, {});

      if (!data || data.status !== 'Complete' || !data.selectedMogrtData || data.selectedMogrtData.length < 1) {
        alert('Instruction: Select at least 1 master clip (under playhead) and other clips to sync.');
        onStop(false);
        return;
      }

      if (!data.masterMogrtData || data.masterMogrtData.length === 0) {
        alert('Instruction: Place playhead over the "Source" clip you want to copy settings FROM.');
        onStop(false);
        return;
      }

      const total = data.selectedMogrtData.length;
      
      const textInputNames = ["\u24c9 Text Input", "Ⓢ Text Input", "Text Input", "Text", "Ⓣ Text Input"];
      const progressionNames = ["\u24c9 Word Progression", "Ⓢ Word Progression", "Word Progression", "Ⓣ Word Progression"];

      const fullData = data.masterMogrtData.filter((p: any) => !progressionNames.includes(p.displayName));

      const isPSR = (p: any) =>
        p.displayName.includes('Position') ||
        p.displayName.includes('Scale') ||
        p.displayName.includes('Rotation') ||
        p.displayName.includes('Transform');

      const styleOnlyData = fullData
        .filter((p: any) => !textInputNames.includes(p.displayName))
        .filter((p: any) => !p.displayName.includes('Ⓢ'))
        .filter((p: any) => !p.displayName.includes('Ⓑ'))
        .filter((p: any) => !isPSR(p));
        
      const textOnlyData = data.masterMogrtData.filter((p: any) => textInputNames.includes(p.displayName));
      const psrData = fullData.filter(isPSR);

      const batchFunc = type === 'text' ? 'sm_sync_text_batch' : 'sm_sync_batch';
      const batchPayload = JSON.parse(JSON.stringify(data));

      if (type === 'all') {
        batchPayload.updatedMogrtData = fullData;
      } else if (type === 'style') {
        batchPayload.updatedMogrtData = styleOnlyData;
      } else if (type === 'text') {
        batchPayload.updatedMogrtData = textOnlyData;
      } else if (type === 'psr') {
        batchPayload.updatedMogrtData = psrData;
      }

      if (type !== 'psr') {
        batchPayload.masterPositionValue = undefined;
        batchPayload.masterScaleValue = undefined;
        batchPayload.masterRotationValue = undefined;
      }

      const batchResult: any = await execute(batchFunc, batchPayload);
      const skipped = (batchResult && batchResult.skipped != null) ? batchResult.skipped : 0;

      try {
        const fs = (window as any).require('fs');
        const path = (window as any).require('path');
        const debugDir = 'c:\\Swastik Development\\FreeXan Development\\Debug';
        if (!fs.existsSync(debugDir)) {
          fs.mkdirSync(debugDir, { recursive: true });
        }
        const debugFilePath = path.join(debugDir, 'SyncAllDebugLog.txt');
        let fileContent = `=== SYNC OPERATION LOG (${type.toUpperCase()}) ===\n`;
        fileContent += "Date: " + new Date().toLocaleString() + "\n\n";
        fileContent += "--- RAW EXTRACTED MASTER DATA ---\n";
        fileContent += JSON.stringify(data.masterMogrtData, null, 2) + "\n\n";
        fileContent += "--- FILTERED DATA SENT TO PREMIERE ---\n";
        fileContent += JSON.stringify(batchPayload.updatedMogrtData, null, 2) + "\n\n";
        fileContent += "--- EXTENDSCRIPT BATCH RESULT ---\n";
        fileContent += JSON.stringify(batchResult, null, 2) + "\n";
        
        fs.writeFileSync(debugFilePath, fileContent, 'utf8');
      } catch (err) {
        console.error("Failed to write Sync debug log file", err);
      }

      onStop(true, skipped > 0 ? `Done (${skipped} skipped)` : 'Sync Complete!');
    } catch (err: any) {
      console.error('[freeXan Caption] Sync Error:', err);
      alert('freeXan Caption Sync Failed:\n' + err.message);
      onStop(false, 'Sync Failed');
    }
  };

  return (
    <div className="fx-tool-group">
      <h3 className="fx-tool-group__title">Sync Properties</h3>
      <p className="fx-tool-group__desc">Copy properties from the clip under the playhead to all selected clips.</p>
      
      <div className="fx-tool-grid">
        <button className="fx-btn fx-btn--secondary" onClick={() => handleSync('all')} disabled={loading}>
          <i className="fas fa-sync" /> Sync All
        </button>
        <button className="fx-btn fx-btn--secondary" onClick={() => handleSync('text')} disabled={loading}>
          <i className="fas fa-font" /> Sync Text
        </button>
        <button className="fx-btn fx-btn--secondary" onClick={() => handleSync('style')} disabled={loading}>
          <i className="fas fa-paint-brush" /> Sync Style
        </button>
        <button className="fx-btn fx-btn--secondary" onClick={() => handleSync('psr')} disabled={loading}>
          <i className="fas fa-arrows-alt" /> Sync PSR
        </button>
      </div>
    </div>
  );
};
