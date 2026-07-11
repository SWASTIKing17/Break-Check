/**
 * freeXan Caption — Params Store
 */
import { create } from 'zustand';

interface ParamState {
  clips: any[];
  activeClipIdx: number;
  status: 'idle' | 'live' | 'error';
  lastUpdated: Date | null;
  dbg: string;

  setClips: (clips: any[]) => void;
  setActiveClipIdx: (idx: number | ((prev: number) => number)) => void;
  setStatus: (status: 'idle' | 'live' | 'error') => void;
  setLastUpdated: (date: Date) => void;
  setDbg: (dbg: string) => void;
  reset: () => void;
}

export const useParamsStore = create<ParamState>((set) => ({
  clips: [],
  activeClipIdx: 0,
  status: 'idle',
  lastUpdated: null,
  dbg: 'init...',

  setClips: (clips) => set({ clips }),
  setActiveClipIdx: (val) => set((s) => ({ activeClipIdx: typeof val === 'function' ? val(s.activeClipIdx) : val })),
  setStatus: (status) => set({ status }),
  setLastUpdated: (lastUpdated) => set({ lastUpdated }),
  setDbg: (dbg) => set({ dbg }),
  reset: () => set({ clips: [], activeClipIdx: 0, status: 'idle', lastUpdated: null, dbg: 'init...' })
}));
