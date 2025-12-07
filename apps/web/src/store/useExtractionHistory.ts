import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================
// Types
// ============================================

export interface GeneratedFile {
  path: string;
  content: string;
  language: 'tsx' | 'jsx' | 'css';
}

export interface InstanceReplacement {
  nodeId: string;
  componentUsage: string;
  propValues: Record<string, string>;
  originalCode?: string;
}

export interface ExtractionEntry {
  id: string;
  projectId: string;
  componentName: string;
  files: GeneratedFile[];
  replacements: InstanceReplacement[];
  originalCode: string;
  timestamp: string;
  status: 'applied' | 'reverted';
}

export interface ExtractionHistoryState {
  // History entries keyed by project ID
  history: Record<string, ExtractionEntry[]>;
  
  // Currently selected extraction for viewing
  selectedExtractionId: string | null;
}

export interface ExtractionHistoryActions {
  // Add a new extraction entry
  addExtraction: (entry: Omit<ExtractionEntry, 'id' | 'timestamp' | 'status'>) => string;
  
  // Mark an extraction as reverted
  markReverted: (projectId: string, extractionId: string) => void;
  
  // Get extractions for a project
  getProjectExtractions: (projectId: string) => ExtractionEntry[];
  
  // Get active (non-reverted) extractions
  getActiveExtractions: (projectId: string) => ExtractionEntry[];
  
  // Select an extraction for viewing
  selectExtraction: (extractionId: string | null) => void;
  
  // Clear history for a project
  clearProjectHistory: (projectId: string) => void;
  
  // Check if extraction can be reverted (must be most recent active)
  canRevert: (projectId: string, extractionId: string) => boolean;
}

type ExtractionHistoryStore = ExtractionHistoryState & ExtractionHistoryActions;

// ============================================
// Store
// ============================================

export const useExtractionHistory = create<ExtractionHistoryStore>()(
  persist(
    (set, get) => ({
      // Initial state
      history: {},
      selectedExtractionId: null,

      // Add a new extraction entry
      addExtraction: (entry) => {
        const id = `ext-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newEntry: ExtractionEntry = {
          ...entry,
          id,
          timestamp: new Date().toISOString(),
          status: 'applied',
        };

        set((state) => {
          const projectHistory = state.history[entry.projectId] || [];
          return {
            history: {
              ...state.history,
              [entry.projectId]: [...projectHistory, newEntry],
            },
          };
        });

        return id;
      },

      // Mark an extraction as reverted
      markReverted: (projectId, extractionId) => {
        set((state) => {
          const projectHistory = state.history[projectId] || [];
          return {
            history: {
              ...state.history,
              [projectId]: projectHistory.map((entry) =>
                entry.id === extractionId
                  ? { ...entry, status: 'reverted' as const }
                  : entry
              ),
            },
          };
        });
      },

      // Get extractions for a project
      getProjectExtractions: (projectId) => {
        return get().history[projectId] || [];
      },

      // Get active (non-reverted) extractions
      getActiveExtractions: (projectId) => {
        const projectHistory = get().history[projectId] || [];
        return projectHistory.filter((entry) => entry.status === 'applied');
      },

      // Select an extraction for viewing
      selectExtraction: (extractionId) => {
        set({ selectedExtractionId: extractionId });
      },

      // Clear history for a project
      clearProjectHistory: (projectId) => {
        set((state) => {
          const { [projectId]: _, ...rest } = state.history;
          return { history: rest };
        });
      },

      // Check if extraction can be reverted
      canRevert: (projectId, extractionId) => {
        const activeExtractions = get().getActiveExtractions(projectId);
        if (activeExtractions.length === 0) return false;
        
        // Only the most recent active extraction can be reverted
        const mostRecent = activeExtractions[activeExtractions.length - 1];
        return mostRecent.id === extractionId;
      },
    }),
    {
      name: 'neuron-extraction-history',
      // Only persist history, not selection state
      partialize: (state) => ({ history: state.history }),
    }
  )
);

// ============================================
// Selectors
// ============================================

export const selectProjectHistory = (projectId: string) => (state: ExtractionHistoryStore) =>
  state.history[projectId] || [];

export const selectActiveExtractions = (projectId: string) => (state: ExtractionHistoryStore) =>
  (state.history[projectId] || []).filter((e) => e.status === 'applied');

export const selectExtractionById = (extractionId: string) => (state: ExtractionHistoryStore) => {
  for (const entries of Object.values(state.history)) {
    const found = entries.find((e) => e.id === extractionId);
    if (found) return found;
  }
  return null;
};

// ============================================
// Hooks
// ============================================

/**
 * Hook to get extraction history for the current project
 */
export function useProjectExtractionHistory(projectId: string | null) {
  const history = useExtractionHistory((state) =>
    projectId ? state.history[projectId] || [] : []
  );
  const activeExtractions = history.filter((e) => e.status === 'applied');
  const revertedExtractions = history.filter((e) => e.status === 'reverted');

  return {
    history,
    activeExtractions,
    revertedExtractions,
    totalExtractions: history.length,
    activeCount: activeExtractions.length,
  };
}

export default useExtractionHistory;
