import { create } from 'zustand';

// ============================================
// Types
// ============================================
export type UploadStatus = 'idle' | 'uploading' | 'processing' | 'completed' | 'error';

export type CodeType = 'HTML' | 'REACT' | 'VUE' | 'SVELTE' | 'ANGULAR' | 'NEXTJS';
export type Framework = 'VANILLA' | 'TAILWIND' | 'BOOTSTRAP' | 'MATERIAL_UI' | 'CHAKRA_UI';
export type ColorScheme = 'default' | 'dark' | 'light' | 'blue' | 'green' | 'purple' | 'custom';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ProjectSettings {
  codeType: CodeType;
  framework: Framework;
  colorScheme: ColorScheme;
  customColors?: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
  };
  additionalInstructions: string;
}

export interface ProjectState {
  // Upload state
  status: UploadStatus;
  progress: number;
  error: string | null;
  
  // Modification state (separate from upload/processing status)
  // This allows the Workspace to stay visible during code modifications
  isModifying: boolean;
  
  // Image data
  imageFile: File | null;
  imagePreview: string | null;
  
  // Project data
  projectId: string | null;
  projectName: string;
  
  // Generated code
  generatedCode: string | null;
  
  // Settings
  settings: ProjectSettings;
  
  // Chat
  chatMessages: ChatMessage[];
  isChatOpen: boolean;
  isSettingsOpen: boolean;
}

export interface ProjectActions {
  // Upload actions
  setStatus: (status: UploadStatus) => void;
  setProgress: (progress: number) => void;
  setError: (error: string | null) => void;
  
  // Modification actions
  setIsModifying: (isModifying: boolean) => void;
  
  // Image actions
  setImageFile: (file: File | null) => void;
  setImagePreview: (preview: string | null) => void;
  
  // Project actions
  setProjectId: (id: string | null) => void;
  setProjectName: (name: string) => void;
  setGeneratedCode: (code: string | null) => void;
  
  // Settings actions
  setSettings: (settings: Partial<ProjectSettings>) => void;
  
  // Chat actions
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearChat: () => void;
  toggleChat: () => void;
  toggleSettings: () => void;
  
  // Workflow actions
  startUpload: (file: File) => void;
  uploadComplete: (projectId: string) => void;
  processingComplete: (code: string) => void;
  reset: () => void;
}

type ProjectStore = ProjectState & ProjectActions;

// ============================================
// Initial State
// ============================================
const initialState: ProjectState = {
  status: 'idle',
  progress: 0,
  error: null,
  isModifying: false,
  imageFile: null,
  imagePreview: null,
  projectId: null,
  projectName: 'Untitled Project',
  generatedCode: null,
  settings: {
    codeType: 'REACT',
    framework: 'TAILWIND',
    colorScheme: 'default',
    additionalInstructions: '',
  },
  chatMessages: [],
  isChatOpen: false,
  isSettingsOpen: false,
};

// ============================================
// Store
// ============================================
export const useProjectStore = create<ProjectStore>((set, get) => ({
  ...initialState,

  // Upload actions
  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),
  setError: (error) => set({ error, status: error ? 'error' : get().status }),

  // Modification actions
  setIsModifying: (isModifying) => set({ isModifying }),

  // Image actions
  setImageFile: (imageFile) => set({ imageFile }),
  setImagePreview: (imagePreview) => set({ imagePreview }),

  // Project actions
  setProjectId: (projectId) => set({ projectId }),
  setProjectName: (projectName) => set({ projectName }),
  setGeneratedCode: (generatedCode) => set({ generatedCode }),

  // Settings actions
  setSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    })),

  // Chat actions
  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        {
          ...message,
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
        },
      ],
    })),

  clearChat: () => set({ chatMessages: [] }),
  
  toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),
  
  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),

  // Workflow actions
  startUpload: (file) => {
    // Create preview URL
    const preview = URL.createObjectURL(file);
    
    set({
      status: 'uploading',
      progress: 0,
      error: null,
      imageFile: file,
      imagePreview: preview,
      generatedCode: null,
      projectId: null,
    });
  },

  uploadComplete: (projectId) => {
    set({
      status: 'processing',
      progress: 100,
      projectId,
    });
  },

  processingComplete: (code) => {
    set({
      status: 'completed',
      generatedCode: code,
    });
  },

  reset: () => {
    const { imagePreview } = get();
    
    // Revoke object URL to prevent memory leaks
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    
    set(initialState);
  },
}));

// ============================================
// Selectors (for better performance)
// ============================================
export const selectStatus = (state: ProjectStore) => state.status;
export const selectProgress = (state: ProjectStore) => state.progress;
export const selectImagePreview = (state: ProjectStore) => state.imagePreview;
export const selectGeneratedCode = (state: ProjectStore) => state.generatedCode;
export const selectSettings = (state: ProjectStore) => state.settings;
export const selectIsProcessing = (state: ProjectStore) => 
  state.status === 'uploading' || state.status === 'processing';
export const selectHasResult = (state: ProjectStore) => 
  state.status === 'completed' && state.generatedCode !== null;
