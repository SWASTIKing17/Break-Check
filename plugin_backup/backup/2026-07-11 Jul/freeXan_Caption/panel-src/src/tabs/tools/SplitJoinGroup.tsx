/**
 * freeXan Caption — SplitJoinGroup
 * Split and join phrases.
 */
import React from 'react';
import { useJsx } from '@/hooks/useJsx';
import { csi } from '@/lib/csi';

interface SplitJoinGroupProps {
  onStart: (label: string) => void;
  onStop: (success: boolean, label?: string) => void;
}

export const SplitJoinGroup: React.FC<SplitJoinGroupProps> = ({ onStart, onStop }) => {
  const { execute, loading } = useJsx();

  const handleSplitPhrase = async () => {
    onStart('Splitting Phrase...');
    try {
      const isLoaded = await csi.probeFunction('sm_tools_split_v28');
      if (!isLoaded) {
        alert('freeXan Caption: Split backend (v2.8) not found.\n\nPlease fully restart Premiere Pro and try again.');
        onStop(false);
        return;
      }

      const data: any = await execute('splitPhraseGetMogrtData', { splitVideoTrack: 1 });
      if (!data || data.status === 'Error') {
        alert('Split Error:\n\n' + (data?.message || 'Failed to get data'));
        onStop(false);
        return;
      }

      let masterClip = null;
      const playhead = data.playhead;

      if (data.selectedClipData && data.selectedClipData.length > 0) {
        for (let i = 0; i < data.selectedClipData.length; i++) {
          const c = data.selectedClipData[i];
          if (c.clipStart <= playhead && c.clipEnd >= playhead) {
            masterClip = c;
            break;
          }
        }
      }

      if (!masterClip) {
        const scanResult: any = await execute('findClipUnderPlayhead', {});
        if (scanResult && scanResult.status === 'Found') {
          masterClip = scanResult;
        }
      }

      if (!masterClip) {
        alert('Instruction: Place your playhead (blue line) over the freeXan Caption subtitle you want to split, then click Split.\n\nTip: You do not need to select any clips — just position the playhead.');
        onStop(false);
        return;
      }

      const params = {
        trackIndex: masterClip.trackNumber,
        clipIndex: masterClip.clipNumber
      };

      const result: any = await execute('sm_tools_split_v28', params);
      if (result && result.status === 'Error') {
        alert('Split Failed\n\nDetails: ' + result.message);
        onStop(false);
      } else {
        onStop(true, 'Split Complete!');
      }
    } catch (err: any) {
      alert('freeXan Caption Critical Error (Split):\n\n' + err.message);
      onStop(false);
    }
  };

  const handleJoinPhrases = async () => {
    onStart('Joining Phrases...');
    try {
      const isLoaded = await csi.probeFunction('sm_tools_join_v28');
      if (!isLoaded) {
        alert('freeXan Caption: Join backend (v2.8) not found.\n\nPlease fully restart Premiere Pro and try again.');
        onStop(false);
        return;
      }

      const data: any = await execute('joinGetSelection', {});
      if (!data || data.status !== 'Complete' || !data.selectedMogrtData || data.selectedMogrtData.length < 2) {
        alert('Instruction: Select at least 2 freeXan Caption clips (from 2+ phrases) to join.');
        onStop(false);
        return;
      }

      const params = { selectedClips: [] as any[] };
      for (let i = 0; i < data.selectedMogrtData.length; i++) {
        params.selectedClips.push({
          trackIndex: data.selectedMogrtData[i].trackNumber,
          clipIndex: data.selectedMogrtData[i].clipNumber
        });
      }

      const result: any = await execute('sm_tools_join_v28', params);
      if (result && result.status === 'Error') {
        alert('Join Failed\n\nDetails: ' + result.message);
        onStop(false);
      } else {
        onStop(true, 'Join Complete!');
      }
    } catch (err: any) {
      alert('freeXan Caption Critical Error (Join):\n\n' + err.message);
      onStop(false);
    }
  };

  const handleSplitJoinSelection = async () => {
    onStart('Split & Join Selection...');
    try {
      const isLoaded = await csi.probeFunction('sm_tools_split_join_v28');
      if (!isLoaded) {
        alert('freeXan Caption: Split & Join backend (v2.8) not found.\n\nPlease fully restart Premiere Pro and try again.');
        onStop(false);
        return;
      }

      const data: any = await execute('joinGetSelection', {});
      if (!data || data.status !== 'Complete' || !data.selectedMogrtData || data.selectedMogrtData.length < 2) {
        alert('Instruction: Select at least 2 freeXan Caption clips contiguous across phrases.');
        onStop(false);
        return;
      }

      const params = { selectedClips: [] as any[] };
      for (let i = 0; i < data.selectedMogrtData.length; i++) {
        params.selectedClips.push({
          trackIndex: data.selectedMogrtData[i].trackNumber,
          clipIndex: data.selectedMogrtData[i].clipNumber
        });
      }

      const result: any = await execute('sm_tools_split_join_v28', params);
      if (result && result.status === 'Error') {
        alert('Split & Join Failed\n\nDetails: ' + result.message);
        onStop(false);
      } else {
        onStop(true, 'Split & Join Complete!');
      }
    } catch (err: any) {
      alert('freeXan Caption Critical Error (Split & Join):\n\n' + err.message);
      onStop(false);
    }
  };

  return (
    <div className="fx-tool-group">
      <h3 className="fx-tool-group__title">Phrase Surgery</h3>
      <p className="fx-tool-group__desc">Split or join phrases on the timeline.</p>
      
      <div className="fx-tool-grid">
        <button className="fx-btn fx-btn--secondary" onClick={handleSplitPhrase} disabled={loading}>
          <i className="fas fa-cut" /> Split Phrase
        </button>
        <button className="fx-btn fx-btn--secondary" onClick={handleJoinPhrases} disabled={loading}>
          <i className="fas fa-link" /> Join Phrases
        </button>
        <button className="fx-btn fx-btn--secondary" onClick={handleSplitJoinSelection} disabled={loading}>
          <i className="fas fa-compress-arrows-alt" /> Split & Join Sel.
        </button>
      </div>
    </div>
  );
};
