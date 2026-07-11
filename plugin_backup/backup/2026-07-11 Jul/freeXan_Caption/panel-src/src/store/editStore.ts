/**
 * freeXan Caption — Edit Store
 * Manages timeline phrases, selection, and locking for the Edit Tab.
 */
import { create } from 'zustand';

export interface Clip {
  text: string;
  start: number;
  end: number;
  track: number;
  index: number;
  progression: number;
  _genericWord?: boolean;
  mogrtName?: string;
}

export interface Phrase {
  start: number;
  end: number;
  isLocked: boolean;
  clips: Clip[];
  mogrtMode?: 'freexan' | 'generic';
  wordTimings?: any[];
  wordDistribution?: any[];
  textInputCount?: number;
  textInputNames?: string[];
}

export interface ToastMessage {
  id: number;
  message: string;
  kind?: 'info' | 'error' | 'success';
}

interface EditState {
  timelineMap: Phrase[];
  activePhraseIdx: number;
  selectedClipId: string | null;
  selectedPhraseIdx: number | null;
  selectedWordIdx: number | null;
  toasts: ToastMessage[];

  // Actions
  setTimelineMap: (map: Phrase[]) => void;
  setActivePhraseIdx: (idx: number) => void;
  setSelection: (clipId: string | null, phraseIdx: number | null, wordIdx: number | null) => void;
  addToast: (message: string, kind?: 'info' | 'error' | 'success') => void;
  removeToast: (id: number) => void;
  reset: () => void;
}

export const useEditStore = create<EditState>((set) => ({
  timelineMap: [],
  activePhraseIdx: 0,
  selectedClipId: null,
  selectedPhraseIdx: null,
  selectedWordIdx: null,
  toasts: [],

  setTimelineMap: (timelineMap) => set({ timelineMap }),
  setActivePhraseIdx: (activePhraseIdx) => set({ activePhraseIdx }),
  setSelection: (selectedClipId, selectedPhraseIdx, selectedWordIdx) => 
    set({ selectedClipId, selectedPhraseIdx, selectedWordIdx }),
  addToast: (message, kind = 'info') => set((state) => {
    const id = Date.now();
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
    return { toasts: [...state.toasts, { id, message, kind }] };
  }),
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  reset: () => set({
    timelineMap: [],
    activePhraseIdx: 0,
    selectedClipId: null,
    selectedPhraseIdx: null,
    selectedWordIdx: null,
    toasts: []
  })
}));
