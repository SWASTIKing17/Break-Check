/**
 * freeXan Caption — AppBar
 *
 * Top bar (40px): brand mark (left), version chip (center), connection pill (right).
 */
import React from 'react';
import { useSessionStore, type ConnectionState } from '@/store/sessionStore';
import './AppBar.css';

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  connected: 'Connected',
  'project-open': 'No Sequence',
  disconnected: 'Offline',
};

const CONNECTION_COLORS: Record<ConnectionState, string> = {
  connected: 'var(--fx-success)',
  'project-open': 'var(--fx-warn)',
  disconnected: 'var(--fx-error)',
};

export const AppBar: React.FC = () => {
  const connection = useSessionStore((s) => s.connection);

  return (
    <header className="fx-appbar no-select">
      {/* Brand */}
      <div className="fx-appbar__brand">
        <span className="fx-appbar__brand-name">
          free<span className="fx-appbar__brand-accent">X</span>an
        </span>
        <span className="fx-appbar__brand-sep">·</span>
        <span className="fx-appbar__brand-product">Caption</span>
      </div>

      {/* Version */}
      <span className="fx-appbar__version">v1.1.0</span>

      {/* Connection Pill */}
      <div className="fx-appbar__connection">
        <span
          className="fx-appbar__connection-dot"
          style={{ background: CONNECTION_COLORS[connection] }}
        />
        <span className="fx-appbar__connection-label">
          {CONNECTION_LABELS[connection]}
        </span>
      </div>
    </header>
  );
};
