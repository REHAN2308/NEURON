'use client';

import { useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useProjectStore } from '@/store/useProjectStore';
import { useSocket } from '@/hooks/useSocket';

export default function CodeViewer() {
  const { generatedCode, status } = useProjectStore();
  const { isConnected } = useSocket();
  const editorRef = useRef<any>(null);
  
  const isLoading = status === 'processing' || status === 'uploading';

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

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
    <Editor
      height="100%"
      defaultLanguage="html"
      value={generatedCode || ''}
      onMount={handleEditorMount}
      theme="vs-dark"
      options={{
        readOnly: true,
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
        renderLineHighlight: 'none',
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
  );
}
