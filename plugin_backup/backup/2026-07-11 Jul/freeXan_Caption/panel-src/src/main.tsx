/**
 * freeXan Caption — React App Entry Point
 * Mounts the root <App /> component onto #root.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

// Styles — order matters: tokens → reset → app layout
import './styles/tokens.css';
import './styles/reset.css';
import './styles/app.css';

/**
 * FIX (panel-close-kills-others): Register a beforeunload guard so any open
 * WebSocket is closed gracefully before Adobe tears down the CEP extension host.
 * Without this, a dangling socket error during teardown can propagate through
 * Adobe's shared extension process and unexpectedly close sibling panels.
 */
window.addEventListener('beforeunload', () => {
  (window as any).__freexan_unloading = true;
  // useFreeXanWs cleanup runs on React unmount, but beforeunload fires earlier.
  // Belt-and-suspenders: reach into any raw WS ref if React hasn't cleaned up yet.
  try {
    const wsRef: WebSocket | undefined = (window as any).__freexan_ws_ref;
    if (wsRef && wsRef.readyState === WebSocket.OPEN) {
      wsRef.close(1000, 'panel-beforeunload');
    }
  } catch (_) {}
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('[freeXan Caption] #root element not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

