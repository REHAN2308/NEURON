'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import { useProjectStore } from '@/store/useProjectStore';
import { useEditorStore, selectFiles, selectActiveFile } from '@/store/useEditorStore';
import { useSocket } from '@/hooks/useSocket';
import { Save, X } from 'lucide-react';

interface EditorTabsProps {
  onSave?: (path: string, content: string) => void;
}

export default function CodeViewerWithTabs({ onSave }: EditorTabsProps) {
  const { generatedCode, status, settings, projectId } = useProjectStore();
  const { 
    files, 
    activeFilePath, 
    setActiveFile, 
    updateFileContent, 
    initializeFromCode,
    getActiveFile,
    markFileDirty,
  } = useEditorStore();
  const { isConnected } = useSocket();
  
  const editorRef = useRef<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const filesList = Array.from(files.values());
  const activeFile = activeFilePath ? files.get(activeFilePath) : null;
  
  const isLoading = status === 'processing' || status === 'uploading';

  // Initialize files from generated code when it changes
  useEffect(() => {
    if (generatedCode && filesList.length === 0) {
      initializeFromCode(generatedCode, settings.codeType);
    }
  }, [generatedCode, settings.codeType, filesList.length, initializeFromCode]);

  // Update App.jsx content when generatedCode changes externally (e.g., from AI modification)
  useEffect(() => {
    if (generatedCode && filesList.length > 0) {
      const mainFile = filesList.find(f => f.path.startsWith('App.') || f.path === 'index.html');
      if (mainFile && mainFile.content !== generatedCode) {
        updateFileContent(mainFile.path, generatedCode);
        markFileDirty(mainFile.path, false); // Don't mark as dirty if it's from AI
      }
    }
  }, [generatedCode, filesList, updateFileContent, markFileDirty]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleEditorChange: OnChange = (value) => {
    if (activeFilePath && value !== undefined) {
      updateFileContent(activeFilePath, value);
    }
  };

  const handleTabClick = (path: string) => {
    setActiveFile(path);
  };

  const handleSave = useCallback(async () => {
    if (!activeFile || !projectId) return;
    
    setIsSaving(true);
    try {
      // Call the save callback if provided
      if (onSave) {
        await onSave(activeFile.path, activeFile.content);
      }
      
      // Mark file as not dirty after save
      markFileDirty(activeFile.path, false);
      
      // If saving styles.css, also send to preview via postMessage
      if (activeFile.path === 'styles.css') {
        // This will be handled by the parent component
        window.dispatchEvent(new CustomEvent('neuron:styles-updated', {
          detail: { css: activeFile.content }
        }));
      }
      
      // If saving main component file, update the project store
      if (activeFile.path.startsWith('App.') || activeFile.path === 'index.html') {
        useProjectStore.getState().setGeneratedCode(activeFile.content);
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    } finally {
      setIsSaving(false);
    }
  }, [activeFile, projectId, onSave, markFileDirty]);

  // Keyboard shortcut for save (Ctrl/Cmd + S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  if (!generatedCode && !isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0a0a] text-neutral-600 text-xs">
        Code will appear here
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-center">
          <div className="w-5 h-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin mx-auto mb-2" />
          <p className="text-[11px] text-neutral-500">Generating code...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      {/* File Tabs */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-white/10 bg-black/30 overflow-x-auto">
        {filesList.map((file) => {
          const isActive = file.path === activeFilePath;
          return (
            <button
              key={file.path}
              onClick={() => handleTabClick(file.path)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-t transition-all whitespace-nowrap ${
                isActive 
                  ? 'bg-white/10 text-white border-b-2 border-blue-500' 
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>{file.name}</span>
              {file.isDirty && (
                <span className="w-2 h-2 rounded-full bg-orange-400" title="Unsaved changes" />
              )}
            </button>
          );
        })}
        
        {/* Save button */}
        {activeFile?.isDirty && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded transition-all"
            title="Save (Ctrl+S)"
          >
            <Save className="w-3 h-3" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
      
      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={activeFile?.language || 'javascript'}
          value={activeFile?.content || ''}
          onMount={handleEditorMount}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            readOnly: false,
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
            renderWhitespace: 'none',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            fontLigatures: true,
            smoothScrolling: true,
            lineHeight: 1.6,
            renderLineHighlight: 'line',
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
          loading={
            <div className="flex items-center justify-center h-full bg-[#0a0a0a]">
              <div className="w-5 h-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
            </div>
          }
        />
      </div>
    </div>
  );
}
