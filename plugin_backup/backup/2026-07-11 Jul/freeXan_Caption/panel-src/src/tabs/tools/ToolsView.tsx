/**
 * freeXan Caption — Tools Tab
 * Ported from legacy tools_refactor.js. Provides syncing, splitting, joining.
 */
import React, { useRef } from 'react';
import { ProgressBar, ProgressBarRef } from './ProgressBar';
import { SyncGroup } from './SyncGroup';
import { SplitJoinGroup } from './SplitJoinGroup';
import { WordEditGroup } from './WordEditGroup';
import { FormatTextGroup } from './FormatTextGroup';
import './ToolsView.css';

export const ToolsView: React.FC = () => {
  const progressRef = useRef<ProgressBarRef>(null);

  const handleStart = (label: string) => {
    progressRef.current?.start(label);
  };

  const handleStop = (success: boolean, label?: string) => {
    progressRef.current?.stop(success, label);
  };

  return (
    <div className="fx-tools-tab">
      <ProgressBar ref={progressRef} />
      
      <SyncGroup onStart={handleStart} onStop={handleStop} />
      <FormatTextGroup onStart={handleStart} onStop={handleStop} />
      <SplitJoinGroup onStart={handleStart} onStop={handleStop} />
      <WordEditGroup onStart={handleStart} onStop={handleStop} />
    </div>
  );
};
