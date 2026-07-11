import React, { useState } from 'react';
import { useJsx } from '@/hooks/useJsx';
import { csi } from '@/lib/csi';

interface FormatTextGroupProps {
  onStart: (label: string) => void;
  onStop: (success: boolean, label?: string) => void;
}

export const FormatTextGroup: React.FC<FormatTextGroupProps> = ({ onStart, onStop }) => {
  const { execute, loading } = useJsx();
  const [formatType, setFormatType] = useState('sentence');

  const handleFormatText = async () => {
    onStart('Formatting text...');
    try {
      const isLoaded = await csi.probeFunction('sm_tools_format_text_selected_mogrts');
      if (!isLoaded) {
        alert('freeXan Caption: Text Format backend not found.\n\nPlease fully restart Premiere Pro and try again.');
        onStop(false);
        return;
      }

      const data: any = await execute('joinGetSelection', {});
      if (!data || data.status !== 'Complete' || !data.selectedMogrtData || data.selectedMogrtData.length === 0) {
        alert('Instruction: Select at least 1 freeXan Caption clip to format.');
        onStop(false);
        return;
      }

      const params = { formatType, selectedClips: [] as any[] };
      for (let i = 0; i < data.selectedMogrtData.length; i++) {
        params.selectedClips.push({
          trackIndex: data.selectedMogrtData[i].trackNumber,
          clipIndex: data.selectedMogrtData[i].clipNumber
        });
      }

      const result: any = await execute('sm_tools_format_text_selected_mogrts', params);
      if (result && result.status === 'Error') {
        alert('Format Failed\n\nDetails: ' + result.message);
        onStop(false);
      } else {
        onStop(true, 'Formatting Complete!');
      }
    } catch (err: any) {
      alert('freeXan Caption Critical Error (Format Text):\n\n' + err.message);
      onStop(false);
    }
  };

  return (
    <div className="fx-tool-group">
      <h3 className="fx-tool-group__title">Text Formatting</h3>
      <p className="fx-tool-group__desc">Quickly apply formatting to the selected MOGRTs.</p>
      
      <div className="fx-tool-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <select 
          className="fx-input fx-input--select" 
          value={formatType} 
          onChange={e => setFormatType(e.target.value)}
          disabled={loading}
          style={{ width: '100%', padding: '0.5rem', background: '#252526', color: '#fff', border: '1px solid #3e3e42', borderRadius: '4px' }}
        >
          <option value="uppercase">UPPERCASE</option>
          <option value="lowercase">lowercase</option>
          <option value="sentence">Sentence case</option>
          <option value="title">Title Case</option>
          <option value="first_upper">First Word Upper</option>
          <option value="last_upper">Last Word Upper</option>
          <option value="alternating">aLtErNaTiNg CaSe</option>
          <option value="snake_case">snake_case</option>
          <option value="camelcase">camelCase</option>
          <option value="vowel">vOwEl CaSe</option>
        </select>

        <button className="fx-btn fx-btn--secondary" onClick={handleFormatText} disabled={loading}>
          <i className="fas fa-magic" /> Apply
        </button>
      </div>
    </div>
  );
};
