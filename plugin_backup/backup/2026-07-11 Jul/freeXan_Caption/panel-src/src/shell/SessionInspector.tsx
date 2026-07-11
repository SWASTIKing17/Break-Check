/**
 * freeXan Caption — SessionInspector
 *
 * Slide-in drawer content showing live session info:
 * sequence name, FPS, selected clips count, last action.
 */
import React from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { usePrefsStore } from '@/store/prefsStore';
import { basename } from '@/lib/format';
import './SessionInspector.css';

export const SessionInspector: React.FC = () => {
  const {
    connection,
    projectPath,
    sequenceName,
    sequenceFps,
    selectedClipsCount,
    lastAction,
  } = useSessionStore();
  const setInspectorOpen = usePrefsStore((s) => s.setInspectorOpen);

  return (
    <div className="fx-session">
      <div className="fx-session__header">
        <span className="fx-session__title">SESSION</span>
        <button
          className="fx-session__close"
          onClick={() => setInspectorOpen(false)}
        >
          ✕
        </button>
      </div>

      <div className="fx-session__grid">
        <div className="fx-session__row">
          <span className="fx-session__label">Status</span>
          <span className="fx-session__value fx-session__value--mono">
            {connection.toUpperCase()}
          </span>
        </div>

        <div className="fx-session__row">
          <span className="fx-session__label">Project</span>
          <span className="fx-session__value">
            {projectPath ? basename(projectPath) : '—'}
          </span>
        </div>

        <div className="fx-session__row">
          <span className="fx-session__label">Sequence</span>
          <span className="fx-session__value">
            {sequenceName || '—'}
          </span>
        </div>

        <div className="fx-session__row">
          <span className="fx-session__label">FPS</span>
          <span className="fx-session__value fx-session__value--mono">
            {sequenceFps || '—'}
          </span>
        </div>

        <div className="fx-session__row">
          <span className="fx-session__label">Selected</span>
          <span className="fx-session__value fx-session__value--mono">
            {selectedClipsCount} clips
          </span>
        </div>

        <div className="fx-session__row">
          <span className="fx-session__label">Last Action</span>
          <span className="fx-session__value fx-session__value--mono">
            {lastAction || '—'}
          </span>
        </div>
      </div>
    </div>
  );
};
