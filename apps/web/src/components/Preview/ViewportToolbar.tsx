'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Monitor, Tablet, Smartphone, RotateCcw } from 'lucide-react';

export type ViewportSize = 'desktop' | 'tablet' | 'mobile';

export interface ViewportConfig {
  width: number | '100%';
  label: string;
  icon: typeof Monitor;
}

export const VIEWPORT_CONFIGS: Record<ViewportSize, ViewportConfig> = {
  desktop: { width: '100%', label: 'Desktop', icon: Monitor },
  tablet: { width: 768, label: 'Tablet (768px)', icon: Tablet },
  mobile: { width: 375, label: 'Mobile (375px)', icon: Smartphone },
};

interface ViewportToolbarProps {
  viewport: ViewportSize;
  onViewportChange: (viewport: ViewportSize) => void;
  iframeRef?: React.RefObject<HTMLIFrameElement>;
  className?: string;
}

/**
 * ViewportToolbar - Device preview buttons for responsive testing
 * 
 * Features:
 * - Desktop/Tablet/Mobile buttons with proper sizing
 * - PostMessage to iframe for same-origin viewport changes
 * - Fallback to iframe width resizing for cross-origin
 * - Reset button to restore default view
 * - Debounced rapid clicks
 * - Keyboard navigation and aria-labels
 */
export default function ViewportToolbar({
  viewport,
  onViewportChange,
  iframeRef,
  className = '',
}: ViewportToolbarProps) {
  const [isDebouncing, setIsDebouncing] = useState(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced viewport change handler
  const handleViewportChange = useCallback((newViewport: ViewportSize) => {
    if (isDebouncing || newViewport === viewport) return;

    setIsDebouncing(true);
    onViewportChange(newViewport);

    // Send postMessage to iframe if available (for same-origin)
    if (iframeRef?.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          { type: 'setViewport', viewport: newViewport },
          '*'
        );
      } catch (e) {
        // Cross-origin - fallback handled by parent resizing iframe
        console.debug('[ViewportToolbar] PostMessage failed (cross-origin), using resize fallback');
      }
    }

    // Debounce rapid clicks
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      setIsDebouncing(false);
    }, 150);
  }, [viewport, onViewportChange, iframeRef, isDebouncing]);

  // Reset to desktop
  const handleReset = useCallback(() => {
    handleViewportChange('desktop');
  }, [handleViewportChange]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, viewportKey: ViewportSize) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleViewportChange(viewportKey);
    }
  }, [handleViewportChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const viewportEntries = Object.entries(VIEWPORT_CONFIGS) as [ViewportSize, ViewportConfig][];

  return (
    <div 
      className={`flex items-center gap-1 ${className}`}
      role="toolbar"
      aria-label="Viewport size controls"
    >
      <div className="flex items-center bg-black/50 border-white/10 backdrop-blur-xl rounded-lg p-1 border">
        {viewportEntries.map(([key, config]) => {
          const Icon = config.icon;
          const isActive = viewport === key;
          
          return (
            <button
              key={key}
              onClick={() => handleViewportChange(key)}
              onKeyDown={(e) => handleKeyDown(e, key)}
              disabled={isDebouncing}
              className={`p-2 rounded transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                isActive 
                  ? 'bg-white/10 text-white' 
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              } ${isDebouncing ? 'cursor-not-allowed opacity-50' : ''}`}
              title={config.label}
              aria-label={`Switch to ${config.label} view`}
              aria-pressed={isActive}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
        
        {/* Separator */}
        <div className="w-px h-4 bg-white/10 mx-1" />
        
        {/* Reset button */}
        <button
          onClick={handleReset}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleReset();
            }
          }}
          disabled={viewport === 'desktop' || isDebouncing}
          className={`p-2 rounded transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
            viewport === 'desktop'
              ? 'text-white/30 cursor-not-allowed'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
          title="Reset to Desktop"
          aria-label="Reset to desktop view"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
      
      {/* Active viewport label */}
      {viewport !== 'desktop' && (
        <span className="text-xs text-white/50 ml-2">
          {VIEWPORT_CONFIGS[viewport].label}
        </span>
      )}
    </div>
  );
}

/**
 * Hook to get viewport width value for styling
 */
export function useViewportWidth(viewport: ViewportSize): string | number {
  const config = VIEWPORT_CONFIGS[viewport];
  return config.width;
}
