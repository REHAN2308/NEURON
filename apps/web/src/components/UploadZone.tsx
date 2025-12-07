'use client';

import { useCallback, useState, useRef } from 'react';
import { Upload, Loader2, X, Sparkles, Image as ImageIcon } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';

interface UploadZoneProps {
  instructions?: string;
}

export default function UploadZone({ instructions = '' }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { 
    status, 
    progress, 
    error, 
    settings,
    startUpload, 
    uploadComplete,
    setError,
    setProgress,
  } = useProjectStore();

  const isUploading = status === 'uploading' || status === 'processing';

  // Validate and store the selected file (no API call yet)
  const handleFileSelect = (file: File) => {
    // Clear previous errors
    setValidationError(null);
    setError('');

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setValidationError('Please upload an image file');
      return;
    }

    // Validate file size
    if (file.size > 10 * 1024 * 1024) {
      setValidationError('Image must be less than 10MB');
      return;
    }

    // Store the file and create preview
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  // Clear the selected file
  const handleClearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setValidationError(null);
    setError('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  // Generate code when user clicks the button
  const handleGenerate = async () => {
    // Validate that a file is selected
    if (!selectedFile) {
      setValidationError('Please select an image first');
      return;
    }

    setValidationError(null);
    startUpload(selectedFile);

    try {
      const base64 = await fileToBase64(selectedFile);

      setProgress(50);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch('http://localhost:3001/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          userId: 'demo-user',
          name: selectedFile.name.replace(/\.[^/.]+$/, ''),
          codeType: settings.codeType,
          framework: settings.framework,
          colorScheme: settings.colorScheme,
          additionalInstructions: settings.additionalInstructions,
          instructions: instructions.trim() || undefined,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }

      const data = await response.json();
      setProgress(100);
      
      if (data.success && data.data?.projectId) {
        uploadComplete(data.data.projectId);
        pollProjectStatus(data.data.projectId);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      console.error('Upload error:', err);
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          setError('Request timed out. Please try again.');
        } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          setError('Cannot connect to server. Please check if the API server is running on port 3001.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Upload failed. Please try again.');
      }
    }
  };

  const pollProjectStatus = async (projectId: string) => {
    let attempts = 0;
    const maxAttempts = 60;

    const poll = async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/project/${projectId}`);
        const data = await response.json();

        if (data.success) {
          const project = data.data;

          if (project.status === 'COMPLETED' && project.generatedCode) {
            useProjectStore.getState().processingComplete(project.generatedCode);
            return;
          }

          if (project.status === 'FAILED') {
            setError(project.errorMessage || 'Processing failed');
            return;
          }

          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(poll, 1000);
          } else {
            setError('Timeout. Please try again.');
          }
        }
      } catch (err) {
        setError('Connection error');
      }
    };

    poll();
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFileSelect(files[0]);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) handleFileSelect(files[0]);
  };

  // Format file size for display
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Upload Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative group rounded-2xl p-8 transition-all duration-300 w-full
          border-2 border-dashed
          ${isDragging 
            ? 'border-white bg-white/10 scale-[1.02]' 
            : selectedFile
              ? 'border-white/30 bg-white/5'
              : 'border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10'
          }
          ${isUploading ? 'pointer-events-none' : 'cursor-pointer'}
        `}
      >
        {/* Glow effect */}
        <div className="absolute inset-0 rounded-2xl bg-white/10 opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300 -z-10" />
        
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          disabled={isUploading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        
        <div className="flex flex-col items-center text-center">
          {/* Show preview if file is selected */}
          {selectedFile && previewUrl && !isUploading ? (
            <div className="relative">
              {/* Clear button */}
              <button
                onClick={handleClearFile}
                className="absolute -top-2 -right-2 z-10 w-6 h-6 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center transition-colors shadow-lg"
                title="Remove image"
              >
                <X className="w-4 h-4 text-white" />
              </button>
              
              {/* Thumbnail preview */}
              <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-white/20 mb-4 shadow-lg">
                <img 
                  src={previewUrl} 
                  alt="Preview" 
                  className="w-full h-full object-cover"
                />
              </div>
              
              {/* File info */}
              <div className="flex items-center gap-2 mb-2">
                <ImageIcon className="w-4 h-4 text-white/60" />
                <p className="text-sm font-medium text-white truncate max-w-[200px]">
                  {selectedFile.name}
                </p>
              </div>
              <p className="text-xs text-neutral-400">
                {formatFileSize(selectedFile.size)} • Click to change
              </p>
            </div>
          ) : (
            <>
              <div className={`
                w-16 h-16 rounded-2xl flex items-center justify-center mb-5 transition-all duration-300
                ${isDragging 
                  ? 'bg-white shadow-lg shadow-white/30' 
                  : 'bg-white/10 group-hover:bg-white/20'
                }
              `}>
                {isUploading ? (
                  <Loader2 className="w-7 h-7 text-white animate-spin" />
                ) : (
                  <Upload className={`w-7 h-7 transition-colors ${isDragging ? 'text-black' : 'text-white'}`} />
                )}
              </div>

              <p className="text-base font-medium text-white mb-2">
                {isUploading ? 'Generating code...' : 'Drop your image here'}
              </p>
              <p className="text-sm text-neutral-400">
                {isUploading ? 'AI is working its magic' : 'or click to browse files'}
              </p>
            </>
          )}

          {isUploading && (
            <div className="w-full max-w-[240px] mt-6">
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-neutral-500 mt-2">{progress}% complete</p>
            </div>
          )}

          {!isUploading && !selectedFile && (
            <p className="text-xs text-neutral-600 mt-4">
              Supports PNG, JPG, WEBP • Max 10MB
            </p>
          )}

          {/* Validation error */}
          {validationError && (
            <div className="mt-4 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400">{validationError}</p>
            </div>
          )}

          {/* API error */}
          {error && (
            <div className="mt-4 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Generate Button - shown when file is selected and not uploading */}
      {selectedFile && !isUploading && (
        <button
          onClick={handleGenerate}
          className="group relative flex items-center gap-3 px-8 py-4 bg-white hover:bg-white/90 text-black font-semibold rounded-xl transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-white/20 hover:shadow-white/30"
        >
          <Sparkles className="w-5 h-5 transition-transform group-hover:rotate-12" />
          <span>Generate with NEURON</span>
          
          {/* Button glow effect */}
          <div className="absolute inset-0 rounded-xl bg-white/50 opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300 -z-10" />
        </button>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}
