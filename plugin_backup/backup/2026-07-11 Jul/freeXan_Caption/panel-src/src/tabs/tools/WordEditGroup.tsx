/**
 * freeXan Caption — WordEditGroup
 * Add or remove single words from a phrase.
 */
import React, { useState } from 'react';
import { useJsx } from '@/hooks/useJsx';
import { csi } from '@/lib/csi';

interface WordEditGroupProps {
  onStart: (label: string) => void;
  onStop: (success: boolean, label?: string) => void;
}

export const WordEditGroup: React.FC<WordEditGroupProps> = ({ onStart, onStop }) => {
  const { execute, loading } = useJsx();
  const [wordToAdd, setWordToAdd] = useState('');

  const handleRemoveWord = async () => {
    onStart('Removing Word...');
    try {
      const isLoaded = await csi.probeFunction('sm_tools_remove_word_v28');
      if (!isLoaded) {
        alert('freeXan Caption: Remove Word backend (v2.8) not found.\n\nPlease fully restart Premiere Pro and try again.');
        onStop(false);
        return;
      }

      const scanResult: any = await execute('findClipUnderPlayhead', {});
      if (!scanResult || scanResult.status !== 'Found') {
        alert('Instruction: Place your playhead over the caption clip containing the word you want to remove.');
        onStop(false);
        return;
      }

      const params = {
        trackIndex: scanResult.trackNumber,
        clipIndex: scanResult.clipNumber
      };

      const result: any = await execute('sm_tools_remove_word_v28', params);
      if (result && result.status === 'Error') {
        alert('Remove Word Failed\n\nDetails: ' + result.message);
        onStop(false);
      } else {
        onStop(true, 'Word Removed');
      }
    } catch (err: any) {
      alert('freeXan Caption Critical Error (Remove Word):\n\n' + err.message);
      onStop(false);
    }
  };

  const handleAddWord = async () => {
    if (!wordToAdd.trim()) {
      alert('Please enter a word to add.');
      return;
    }

    onStart(`Adding "${wordToAdd}"...`);
    try {
      const isLoaded = await csi.probeFunction('sm_tools_add_word_v28');
      if (!isLoaded) {
        alert('freeXan Caption: Add Word backend (v2.8) not found.\n\nPlease fully restart Premiere Pro and try again.');
        onStop(false);
        return;
      }

      const scanResult: any = await execute('findClipUnderPlayhead', {});
      if (!scanResult || scanResult.status !== 'Found') {
        alert('Instruction: Place your playhead over the caption clip where you want to add the word.');
        onStop(false);
        return;
      }

      const params = {
        trackIndex: scanResult.trackNumber,
        clipIndex: scanResult.clipNumber,
        newWord: wordToAdd.trim()
      };

      const result: any = await execute('sm_tools_add_word_v28', params);
      if (result && result.status === 'Error') {
        alert('Add Word Failed\n\nDetails: ' + result.message);
        onStop(false);
      } else {
        setWordToAdd('');
        onStop(true, 'Word Added');
      }
    } catch (err: any) {
      alert('freeXan Caption Critical Error (Add Word):\n\n' + err.message);
      onStop(false);
    }
  };

  const handleResetProgression = async () => {
    onStart('Resetting Progression...');
    try {
      const isLoaded = await csi.probeFunction('sm_tools_reset_progression_v28');
      if (!isLoaded) {
        alert('freeXan Caption: Reset Progression backend (v2.8) not found.\n\nPlease fully restart Premiere Pro and try again.');
        onStop(false);
        return;
      }

      const result: any = await execute('sm_tools_reset_progression_v28', {});
      if (result && result.status === 'Error') {
        alert('Reset Progression Failed\n\nDetails: ' + result.message);
        onStop(false);
      } else {
        onStop(true, `Progression Reset (${result?.count || 0} clips)`);
      }
    } catch (err: any) {
      alert('freeXan Caption Critical Error (Reset Progression):\n\n' + err.message);
      onStop(false);
    }
  };

  return (
    <div className="fx-tool-group">
      <h3 className="fx-tool-group__title">Word Edit</h3>
      <p className="fx-tool-group__desc">Add or remove a single word from the clip under the playhead.</p>
      
      <div className="fx-tool-row">
        <button className="fx-btn fx-btn--secondary" onClick={handleRemoveWord} disabled={loading}>
          <i className="fas fa-minus-circle" /> Remove Last Word
        </button>
      </div>

      <div className="fx-tool-row fx-tool-row--input">
        <input 
          type="text" 
          className="fx-input" 
          placeholder="Type word to add..." 
          value={wordToAdd}
          onChange={(e) => setWordToAdd(e.target.value)}
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddWord();
          }}
        />
        <button className="fx-btn fx-btn--secondary" onClick={handleAddWord} disabled={loading || !wordToAdd.trim()}>
          <i className="fas fa-plus-circle" /> Add Word
        </button>
      </div>

      <div className="fx-tool-row" style={{ marginTop: '12px', borderTop: '1px rgba(255,255,255,0.08) solid', paddingTop: '12px' }}>
        <button className="fx-btn fx-btn--secondary" onClick={handleResetProgression} disabled={loading} title="Select all clips of 1 phrase on timeline, then click to reset word progression from 1 to N">
          <i className="fas fa-sort-numeric-down" /> Reset Word Progression (1 to N)
        </button>
      </div>
    </div>
  );
};
