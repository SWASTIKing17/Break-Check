/**
 * freeXan Caption — Workflow Store
 *
 * Tracks the user's position in the caption pipeline.
 * Persisted to localStorage so the workflow survives panel reloads.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { node } from '@/lib/node';

interface WorkflowState {
  /** Current stage in the pipeline (1–6) */
  currentStage: number;
  /** Path to the loaded SRT file */
  srtPath: string | null;
  /** Path to the processed word-by-word SRT file */
  wbwPath: string | null;
  /** Path to the selected MOGRT file */
  mogrtPath: string | null;
  /** Label of the last completed action */
  lastAction: string | null;
  /** Characters per phrase limit */
  charsPerPhrase: number;
  /** Optional external SRT for pre-phrased lines */
  phrasingSrtPath: string | null;
  /** Phrasing mode in manual mode */
  phrasingMode: 'auto' | 'slider' | 'dual_srt';
  /** Record of manual mode enabled per step. true = Manual, false = Auto */
  manualMode: Record<number, boolean>;

  // Actions
  setStage: (stage: number) => void;
  setSrtPath: (path: string | null) => void;
  setWbwPath: (path: string | null) => void;
  setMogrtPath: (path: string | null) => void;
  setPhrasingSrtPath: (path: string | null) => void;
  setPhrasingMode: (mode: 'auto' | 'slider' | 'dual_srt') => void;
  setLastAction: (action: string) => void;
  setCharsPerPhrase: (val: number) => void;
  setManualMode: (step: number, enabled: boolean) => void;
  resetManualModes: () => void;
  reset: () => void;
}

const initialState = {
  currentStage: 1,
  srtPath: null,
  wbwPath: null,
  mogrtPath: null,
  phrasingSrtPath: null,
  phrasingMode: 'auto' as const,
  lastAction: null,
  charsPerPhrase: 20,
  manualMode: {},
};

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set) => ({
      ...initialState,

      setStage: (currentStage) => set({ currentStage }),
      setSrtPath: (srtPath) => set({ srtPath }),
      setWbwPath: (wbwPath) => set({ wbwPath }),
      setMogrtPath: (mogrtPath) => {
        set({ mogrtPath });
        if (node.isAvailable) {
          try {
            const fxDir = node.path.join(node.os.homedir(), 'AppData', 'Roaming', 'freeXan');
            if (!node.fs.existsSync(fxDir)) {
              node.fs.mkdirSync(fxDir, { recursive: true });
            }
            const activeMogrtTxt = node.path.join(fxDir, 'active_mogrt.txt');
            node.fs.writeFileSync(activeMogrtTxt, mogrtPath || '', 'utf8');
            console.log('[Store] Updated active_mogrt.txt with:', mogrtPath);
          } catch (e) {
            console.warn('[Store] Failed to write active_mogrt.txt', e);
          }
        }
      },
      setPhrasingSrtPath: (phrasingSrtPath) => set({ phrasingSrtPath }),
      setPhrasingMode: (phrasingMode) => set({ phrasingMode }),
      setLastAction: (lastAction) => set({ lastAction }),
      setCharsPerPhrase: (charsPerPhrase) => set({ charsPerPhrase }),
      setManualMode: (step, enabled) => set((state) => ({ 
        manualMode: { ...state.manualMode, [step]: enabled } 
      })),
      resetManualModes: () => set({ manualMode: {} }),
      reset: () => set(initialState),
    }),
    {
      name: 'freexan_caption_session_v1',
    }
  )
);

