'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Check, AlertTriangle, FileCode, Copy, Undo2 } from 'lucide-react';

// ============================================
// Types
// ============================================

export interface PropCandidate {
  name: string;
  type: 'text' | 'image' | 'href' | 'icon' | 'boolean';
  sourceNodeId: string;
  sampleValue: string;
  inferredFrom: string;
}

export interface RepeatCluster {
  clusterId: string;
  sampleNodeId: string;
  instances: string[];
  instanceCount: number;
  similarity: number;
  suggestedName: string;
  propCandidates: PropCandidate[];
}

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

export interface PatchSuggestion {
  componentName: string;
  files: GeneratedFile[];
  replacements: InstanceReplacement[];
  diff: {
    before: string;
    after: string;
  };
}

interface ExtractComponentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  elementId: string;
  cluster: RepeatCluster | null;
  onExtracted?: (componentName: string, files: GeneratedFile[]) => void;
}

// ============================================
// API Configuration
// ============================================
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============================================
// Component
// ============================================
export default function ExtractComponentModal({
  isOpen,
  onClose,
  projectId,
  elementId,
  cluster,
  onExtracted,
}: ExtractComponentModalProps) {
  // State
  const [componentName, setComponentName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patch, setPatch] = useState<PatchSuggestion | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [applyStatus, setApplyStatus] = useState<'idle' | 'applying' | 'applied' | 'error'>('idle');
  const [versionId, setVersionId] = useState<number | null>(null);

  // Initialize component name from cluster suggestion
  useEffect(() => {
    if (cluster?.suggestedName) {
      setComponentName(cluster.suggestedName);
    }
  }, [cluster]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setPatch(null);
      setError(null);
      setShowDiff(false);
      setApplyStatus('idle');
      setVersionId(null);
    }
  }, [isOpen]);

  // Generate patch preview
  const handleGeneratePatch = useCallback(async () => {
    if (!componentName.trim()) {
      setError('Please enter a component name');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/project/${projectId}/extract-component`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            elementId,
            componentName: componentName.trim(),
            clusterId: cluster?.clusterId,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate component');
      }

      const data = await response.json();
      setPatch(data.data.patch);
      setShowDiff(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, elementId, componentName, cluster]);

  // Apply the patch
  const handleApplyPatch = useCallback(async () => {
    if (!patch) return;

    setApplyStatus('applying');
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/project/${projectId}/apply-extraction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patch }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to apply extraction');
      }

      const data = await response.json();
      setVersionId(data.data.versionId);
      setApplyStatus('applied');

      // Notify parent
      if (onExtracted) {
        onExtracted(patch.componentName, patch.files);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply extraction');
      setApplyStatus('error');
    }
  }, [projectId, patch, onExtracted]);

  // Revert the extraction
  const handleRevert = useCallback(async () => {
    if (versionId === null) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/project/${projectId}/revert-extraction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ versionId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to revert extraction');
      }

      // Reset state
      setApplyStatus('idle');
      setPatch(null);
      setVersionId(null);
      setShowDiff(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revert');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, versionId]);

  // Copy component code to clipboard
  const handleCopyCode = useCallback(async () => {
    if (!patch?.files[0]?.content) return;
    
    try {
      await navigator.clipboard.writeText(patch.files[0].content);
    } catch {
      console.error('Failed to copy to clipboard');
    }
  }, [patch]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <FileCode className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Extract Component</h2>
              <p className="text-sm text-white/60">
                {cluster?.instanceCount || 0} instances found
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Component Name Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-white/80">
              Component Name
            </label>
            <input
              type="text"
              value={componentName}
              onChange={(e) => setComponentName(e.target.value)}
              placeholder="e.g., FeatureCard"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
              disabled={applyStatus === 'applied'}
            />
          </div>

          {/* Cluster Info */}
          {cluster && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-white/80">
                Detected Pattern
              </h3>
              <div className="bg-white/5 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/60">Instances</span>
                  <span className="text-white font-medium">
                    {cluster.instanceCount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/60">Similarity</span>
                  <span className="text-white font-medium">
                    {Math.round(cluster.similarity * 100)}%
                  </span>
                </div>
                
                {/* Props Preview */}
                {cluster.propCandidates.length > 0 && (
                  <div className="pt-3 border-t border-white/10">
                    <p className="text-xs text-white/60 mb-2">Detected Props:</p>
                    <div className="flex flex-wrap gap-2">
                      {cluster.propCandidates.map((prop) => (
                        <span
                          key={prop.name}
                          className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded"
                        >
                          {prop.name}: {prop.type}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Diff Preview */}
          {showDiff && patch && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white/80">
                  Patch Preview
                </h3>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Code
                </button>
              </div>
              
              {/* Before/After */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs text-red-400 font-medium">Before</p>
                  <pre className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-white/80 overflow-x-auto">
                    {patch.diff.before}
                  </pre>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-green-400 font-medium">After</p>
                  <pre className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-white/80 overflow-x-auto">
                    {patch.diff.after}
                  </pre>
                </div>
              </div>

              {/* Generated Files */}
              <div className="space-y-2">
                <p className="text-xs text-white/60">Files to create:</p>
                <div className="space-y-1">
                  {patch.files.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg text-sm text-white/80"
                    >
                      <FileCode className="w-4 h-4 text-blue-400" />
                      {file.path}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {applyStatus === 'applied' && (
            <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-green-300">
                  Component extracted successfully!
                </p>
                <p className="text-xs text-green-300/70 mt-1">
                  {patch?.componentName} has been created.
                </p>
              </div>
              <button
                onClick={handleRevert}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Revert
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-black/20">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            {applyStatus === 'applied' ? 'Done' : 'Cancel'}
          </button>
          
          {applyStatus !== 'applied' && (
            <>
              {!showDiff ? (
                <button
                  onClick={handleGeneratePatch}
                  disabled={isLoading || !componentName.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    'Preview Extraction'
                  )}
                </button>
              ) : (
                <button
                  onClick={handleApplyPatch}
                  disabled={applyStatus === 'applying'}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {applyStatus === 'applying' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Apply Patch
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
