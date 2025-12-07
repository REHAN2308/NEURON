import { create } from 'zustand';

// ============================================
// Types
// ============================================
export interface EditorFile {
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
}

export interface EditorState {
  // Files management
  files: Map<string, EditorFile>;
  activeFilePath: string | null;
  
  // Editor state
  isLoading: boolean;
  error: string | null;
}

export interface EditorActions {
  // File actions
  setFiles: (files: EditorFile[]) => void;
  addFile: (file: EditorFile) => void;
  updateFileContent: (path: string, content: string) => void;
  setActiveFile: (path: string) => void;
  markFileDirty: (path: string, isDirty: boolean) => void;
  getActiveFile: () => EditorFile | null;
  getFile: (path: string) => EditorFile | null;
  
  // State actions
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Initialize from generated code
  initializeFromCode: (code: string, codeType: string) => void;
  
  // Reset
  reset: () => void;
}

type EditorStore = EditorState & EditorActions;

// ============================================
// Helpers
// ============================================
function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'css': 'css',
    'scss': 'scss',
    'html': 'html',
    'json': 'json',
    'vue': 'vue',
    'svelte': 'svelte',
  };
  return languageMap[ext] || 'plaintext';
}

function extractStylesFromCode(code: string): string {
  // Extract inline styles or generate default CSS
  const styleMatch = code.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (styleMatch) {
    return styleMatch[1].trim();
  }
  
  // Default styles for generated components
  return `/* Custom styles for the generated component */

/* You can add custom styles here that will be applied to the preview */

/* Example: */
/*
.custom-container {
  max-width: 1200px;
  margin: 0 auto;
}

.custom-button {
  transition: all 0.2s ease;
}

.custom-button:hover {
  transform: scale(1.05);
}
*/
`;
}

// ============================================
// Initial State
// ============================================
const initialState: EditorState = {
  files: new Map(),
  activeFilePath: null,
  isLoading: false,
  error: null,
};

// ============================================
// Store
// ============================================
export const useEditorStore = create<EditorStore>((set, get) => ({
  ...initialState,

  // File actions
  setFiles: (files) => {
    const fileMap = new Map<string, EditorFile>();
    files.forEach(file => fileMap.set(file.path, file));
    set({ files: fileMap });
  },

  addFile: (file) => {
    set((state) => {
      const newFiles = new Map(state.files);
      newFiles.set(file.path, file);
      return { files: newFiles };
    });
  },

  updateFileContent: (path, content) => {
    set((state) => {
      const newFiles = new Map(state.files);
      const file = newFiles.get(path);
      if (file) {
        newFiles.set(path, { ...file, content, isDirty: true });
      }
      return { files: newFiles };
    });
  },

  setActiveFile: (path) => {
    set({ activeFilePath: path });
  },

  markFileDirty: (path, isDirty) => {
    set((state) => {
      const newFiles = new Map(state.files);
      const file = newFiles.get(path);
      if (file) {
        newFiles.set(path, { ...file, isDirty });
      }
      return { files: newFiles };
    });
  },

  getActiveFile: () => {
    const { files, activeFilePath } = get();
    if (!activeFilePath) return null;
    return files.get(activeFilePath) || null;
  },

  getFile: (path) => {
    return get().files.get(path) || null;
  },

  // State actions
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  // Initialize editor files from generated code
  initializeFromCode: (code, codeType) => {
    const files: EditorFile[] = [];
    
    // Determine file extension based on code type
    const extMap: Record<string, string> = {
      'REACT': 'jsx',
      'NEXTJS': 'jsx',
      'VUE': 'vue',
      'SVELTE': 'svelte',
      'ANGULAR': 'ts',
      'HTML': 'html',
    };
    const ext = extMap[codeType] || 'jsx';
    
    // Main component file
    const mainFileName = codeType === 'HTML' ? 'index.html' : `App.${ext}`;
    files.push({
      path: mainFileName,
      name: mainFileName,
      content: code,
      language: getLanguageFromPath(mainFileName),
      isDirty: false,
    });
    
    // Add a Layout file (subset or wrapper)
    if (codeType !== 'HTML') {
      files.push({
        path: `Layout.${ext}`,
        name: `Layout.${ext}`,
        content: generateLayoutFile(code, codeType),
        language: getLanguageFromPath(`Layout.${ext}`),
        isDirty: false,
      });
    }
    
    // Add styles.css
    files.push({
      path: 'styles.css',
      name: 'styles.css',
      content: extractStylesFromCode(code),
      language: 'css',
      isDirty: false,
    });
    
    const fileMap = new Map<string, EditorFile>();
    files.forEach(file => fileMap.set(file.path, file));
    
    set({
      files: fileMap,
      activeFilePath: mainFileName,
      isLoading: false,
      error: null,
    });
  },

  reset: () => set(initialState),
}));

// ============================================
// Helper to generate Layout file
// ============================================
function generateLayoutFile(code: string, codeType: string): string {
  if (codeType === 'REACT' || codeType === 'NEXTJS') {
    return `// Layout wrapper component
// This file provides the layout structure for your application

import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-xl font-semibold">My App</h1>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {children}
      </main>
      
      {/* Footer */}
      <footer className="bg-gray-100 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-gray-500 text-sm">
          Built with NEURON
        </div>
      </footer>
    </div>
  );
}
`;
  }
  
  return `<!-- Layout template -->
<div class="layout">
  <header>
    <h1>My App</h1>
  </header>
  <main>
    <!-- Content goes here -->
  </main>
  <footer>
    Built with NEURON
  </footer>
</div>
`;
}

// ============================================
// Selectors
// ============================================
export const selectFiles = (state: EditorStore) => Array.from(state.files.values());
export const selectActiveFile = (state: EditorStore) => {
  if (!state.activeFilePath) return null;
  return state.files.get(state.activeFilePath) || null;
};
export const selectIsLoading = (state: EditorStore) => state.isLoading;
