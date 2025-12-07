'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Layers, 
  Box, 
  Type, 
  Palette, 
  Maximize2, 
  ChevronDown,
  ChevronRight,
  FileCode,
  Loader2,
  X
} from 'lucide-react';
import ExtractComponentModal, { RepeatCluster } from './ExtractComponentModal';
import type { ElementInfo } from '../LivePreview';

// Re-export for convenience
export type { ElementInfo };

// ============================================
// Types
// ============================================

interface InspectorPanelProps {
  projectId: string | null;
  selectedElement: ElementInfo | null;
  onElementSelect?: (elementId: string) => void;
  onClose?: () => void;
}

// ============================================
// API Configuration
// ============================================
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============================================
// Component
// ============================================
export default function InspectorPanel({
  projectId,
  selectedElement,
  onElementSelect,
  onClose,
}: InspectorPanelProps) {
  // State
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['element', 'styles', 'layout'])
  );
  const [clusters, setClusters] = useState<RepeatCluster[]>([]);
  const [isLoadingClusters, setIsLoadingClusters] = useState(false);
  const [extractModalOpen, setExtractModalOpen] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<RepeatCluster | null>(null);

  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  // Fetch extraction candidates when element is selected
  const fetchCandidates = useCallback(async () => {
    if (!projectId || !selectedElement) {
      setClusters([]);
      return;
    }

    setIsLoadingClusters(true);
    try {
      const url = new URL(`${API_BASE_URL}/api/project/${projectId}/extract-candidates`);
      url.searchParams.set('nodeId', selectedElement.id);
      
      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        setClusters(data.data?.clusters || []);
      } else {
        setClusters([]);
      }
    } catch (error) {
      console.error('Failed to fetch extraction candidates:', error);
      setClusters([]);
    } finally {
      setIsLoadingClusters(false);
    }
  }, [projectId, selectedElement]);

  // Fetch candidates when element changes
  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  // Handle extract button click
  const handleExtractClick = (cluster: RepeatCluster) => {
    setSelectedCluster(cluster);
    setExtractModalOpen(true);
  };

  // Handle extraction complete
  const handleExtracted = (componentName: string) => {
    console.log(`Component "${componentName}" extracted successfully`);
    setExtractModalOpen(false);
    setSelectedCluster(null);
    // Refresh candidates after extraction
    fetchCandidates();
  };

  // Section header component
  const SectionHeader = ({ 
    title, 
    icon: Icon, 
    section 
  }: { 
    title: string; 
    icon: React.ElementType; 
    section: string;
  }) => (
    <button
      onClick={() => toggleSection(section)}
      className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-white/70 uppercase tracking-wider hover:bg-white/5 transition-colors"
    >
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5" />
        {title}
      </div>
      {expandedSections.has(section) ? (
        <ChevronDown className="w-3.5 h-3.5" />
      ) : (
        <ChevronRight className="w-3.5 h-3.5" />
      )}
    </button>
  );

  // Property row component
  const PropertyRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between px-3 py-1.5 hover:bg-white/5">
      <span className="text-xs text-white/50">{label}</span>
      <span className="text-xs text-white/90 font-mono truncate max-w-[120px]" title={value}>
        {value}
      </span>
    </div>
  );

  return (
    <>
      <div className="h-full flex flex-col bg-black/40 backdrop-blur-xl border-l border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/30">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Inspector</h2>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded transition-colors text-white/60 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {selectedElement ? (
            <>
              {/* Element Info Section */}
              <div className="border-b border-white/10">
                <SectionHeader title="Element" icon={Box} section="element" />
                {expandedSections.has('element') && (
                  <div className="pb-2">
                    <PropertyRow label="Tag" value={`<${selectedElement.tagName.toLowerCase()}>`} />
                    {selectedElement.className && (
                      <PropertyRow label="Class" value={selectedElement.className} />
                    )}
                    {selectedElement.textContent && (
                      <PropertyRow 
                        label="Text" 
                        value={selectedElement.textContent.slice(0, 30) + (selectedElement.textContent.length > 30 ? '...' : '')} 
                      />
                    )}
                    <PropertyRow label="ID" value={selectedElement.id || '(none)'} />
                  </div>
                )}
              </div>

              {/* Layout Section */}
              <div className="border-b border-white/10">
                <SectionHeader title="Layout" icon={Maximize2} section="layout" />
                {expandedSections.has('layout') && (
                  <div className="pb-2">
                    <PropertyRow label="Width" value={`${selectedElement.boundingBox.width}px`} />
                    <PropertyRow label="Height" value={`${selectedElement.boundingBox.height}px`} />
                    <PropertyRow label="X" value={`${selectedElement.boundingBox.x}px`} />
                    <PropertyRow label="Y" value={`${selectedElement.boundingBox.y}px`} />
                  </div>
                )}
              </div>

              {/* Styles Section */}
              <div className="border-b border-white/10">
                <SectionHeader title="Styles" icon={Palette} section="styles" />
                {expandedSections.has('styles') && (
                  <div className="pb-2">
                    {Object.entries(selectedElement.styles).slice(0, 10).map(([prop, value]) => (
                      <PropertyRow key={prop} label={prop} value={value} />
                    ))}
                    {Object.keys(selectedElement.styles).length > 10 && (
                      <p className="px-3 py-1 text-xs text-white/40">
                        +{Object.keys(selectedElement.styles).length - 10} more...
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Component Extraction Section */}
              <div className="border-b border-white/10">
                <SectionHeader title="Extract Component" icon={FileCode} section="extract" />
                {expandedSections.has('extract') && (
                  <div className="p-3">
                    {isLoadingClusters ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-white/50" />
                      </div>
                    ) : clusters.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs text-white/60 mb-3">
                          Found {clusters.length} repeating pattern{clusters.length > 1 ? 's' : ''}:
                        </p>
                        {clusters.map((cluster) => (
                          <button
                            key={cluster.clusterId}
                            onClick={() => handleExtractClick(cluster)}
                            className="w-full flex items-center justify-between p-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/50 rounded-lg transition-all group"
                          >
                            <div className="text-left">
                              <p className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
                                {cluster.suggestedName}
                              </p>
                              <p className="text-xs text-white/50">
                                {cluster.instanceCount} instances • {Math.round(cluster.similarity * 100)}% similar
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-white/40 group-hover:text-blue-400 transition-colors" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <FileCode className="w-8 h-8 text-white/20 mx-auto mb-2" />
                        <p className="text-xs text-white/50">
                          No repeating patterns detected for this element.
                        </p>
                        <p className="text-xs text-white/30 mt-1">
                          Select an element that appears multiple times.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* No Element Selected */
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <Box className="w-10 h-10 text-white/20 mb-3" />
              <p className="text-sm text-white/60 mb-1">No element selected</p>
              <p className="text-xs text-white/40">
                Click on an element in the preview to inspect it.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {selectedElement && (
          <div className="px-4 py-3 border-t border-white/10 bg-black/30">
            <button
              onClick={() => fetchCandidates()}
              disabled={isLoadingClusters || !projectId}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 hover:border-blue-500/50 rounded-lg text-blue-400 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingClusters ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <FileCode className="w-4 h-4" />
                  Scan for Patterns
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Extract Component Modal */}
      <ExtractComponentModal
        isOpen={extractModalOpen}
        onClose={() => {
          setExtractModalOpen(false);
          setSelectedCluster(null);
        }}
        projectId={projectId || ''}
        elementId={selectedElement?.id || ''}
        cluster={selectedCluster}
        onExtracted={handleExtracted}
      />
    </>
  );
}
