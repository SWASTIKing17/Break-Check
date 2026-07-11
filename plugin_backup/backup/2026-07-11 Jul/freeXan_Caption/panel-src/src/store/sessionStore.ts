/**
 * freeXan Caption — Session Store
 *
 * Runtime-only state about the Premiere Pro connection.
 * Not persisted — resets every time the panel loads.
 */
import { create } from 'zustand';

export type ConnectionState = 'connected' | 'project-open' | 'disconnected';

interface SessionState {
  /** Current connection status to Premiere */
  connection: ConnectionState;
  /** Full path to the open .prproj file */
  projectPath: string | null;
  /** Active sequence name */
  sequenceName: string | null;
  /** Active sequence frame rate */
  sequenceFps: number | null;
  /** Number of currently selected clips in the timeline */
  selectedClipsCount: number;
  /** Last action label for the session inspector */
  lastAction: string | null;
  /**
   * Current timeline playhead position in seconds (CTI).
   * Written by EditView's existing 500ms getPlayheadTime() poll.
   * Any tab can subscribe to this without spawning its own JSX call.
   */
  ctiSecs: number | null;

  // Actions
  setConnection: (state: ConnectionState) => void;
  setProjectPath: (path: string | null) => void;
  setSequenceInfo: (name: string | null, fps: number | null) => void;
  setSelectedClipsCount: (count: number) => void;
  setLastAction: (action: string) => void;
  setCtiSecs: (secs: number | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  connection: 'disconnected',
  projectPath: null,
  sequenceName: null,
  sequenceFps: null,
  selectedClipsCount: 0,
  lastAction: null,
  ctiSecs: null,

  setConnection: (connection) => set({ connection }),
  setProjectPath: (projectPath) => set({ projectPath }),
  setSequenceInfo: (sequenceName, sequenceFps) => set({ sequenceName, sequenceFps }),
  setSelectedClipsCount: (selectedClipsCount) => set({ selectedClipsCount }),
  setLastAction: (lastAction) => set({ lastAction }),
  setCtiSecs: (ctiSecs) => set({ ctiSecs }),
}));
