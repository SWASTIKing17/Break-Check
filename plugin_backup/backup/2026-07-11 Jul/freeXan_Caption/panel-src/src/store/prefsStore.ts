/**
 * freeXan Caption — Preferences Store
 *
 * UI preferences persisted to localStorage.
 * Controls which tab is active, expanded sections, etc.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TabId = 'workflow' | 'edit' | 'params' | 'tools';

interface PrefsState {
  /** Currently active tab */
  activeTab: TabId;
  /** Whether the session inspector drawer is open */
  inspectorOpen: boolean;
  /** Expanded section IDs (for collapsible groups) */
  expandedSections: string[];

  // Actions
  setActiveTab: (tab: TabId) => void;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  toggleSection: (id: string) => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      activeTab: 'workflow',
      inspectorOpen: false,
      expandedSections: [],

      setActiveTab: (activeTab) => set({ activeTab }),
      toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
      setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
      toggleSection: (id) =>
        set((s) => ({
          expandedSections: s.expandedSections.includes(id)
            ? s.expandedSections.filter((sid) => sid !== id)
            : [...s.expandedSections, id],
        })),
    }),
    {
      name: 'freexan_caption_prefs_v1',
    }
  )
);
