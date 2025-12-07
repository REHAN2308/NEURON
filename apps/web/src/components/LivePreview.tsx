'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Smartphone, 
  Tablet, 
  Monitor, 
  ExternalLink,
} from 'lucide-react';

type ViewportSize = 'mobile' | 'tablet' | 'desktop';
type CodeType = 'HTML' | 'REACT' | 'VUE' | 'SVELTE' | 'ANGULAR' | 'NEXTJS';

export interface ElementInfo {
  id: string;
  tagName: string;
  className: string;
  textContent?: string;
  styles: Record<string, string>;
  boundingBox: { width: number; height: number; x: number; y: number };
}

interface LivePreviewProps {
  code: string | null;
  status?: string;
  codeType?: CodeType;
  onElementSelect?: (elementInfo: ElementInfo) => void;
}

const viewports: Record<ViewportSize, { width: number; label: string }> = {
  mobile: { width: 375, label: '375px' },
  tablet: { width: 768, label: '768px' },
  desktop: { width: 1024, label: '100%' },
};

// Shared state for viewport (simple approach)
let sharedViewport: ViewportSize = 'desktop';
let viewportListeners: ((v: ViewportSize) => void)[] = [];

export function setSharedViewport(v: ViewportSize) {
  sharedViewport = v;
  viewportListeners.forEach(fn => fn(v));
}

export function getSharedViewport(): ViewportSize {
  return sharedViewport;
}

function LivePreviewComponent({ code, status, codeType = 'REACT', onElementSelect }: LivePreviewProps) {
  const [viewport, setViewport] = useState<ViewportSize>(sharedViewport);
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const prevCodeRef = useRef<string | null>(null);
  
  // Track if inspector mode is enabled
  const inspectorEnabled = !!onElementSelect;

  useEffect(() => {
    const listener = (v: ViewportSize) => setViewport(v);
    viewportListeners.push(listener);
    return () => {
      viewportListeners = viewportListeners.filter(fn => fn !== listener);
    };
  }, []);
  
  // Listen for element selection messages from iframe
  useEffect(() => {
    if (!onElementSelect) return;
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'elementSelected' && event.data.elementInfo) {
        onElementSelect(event.data.elementInfo);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onElementSelect]);
  
  // Enable/disable inspector mode in iframe when prop changes
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    
    // Wait for iframe to be ready
    const sendInspectorState = () => {
      if (inspectorEnabled) {
        iframe.contentWindow?.postMessage({ type: 'enableInspector' }, '*');
      } else {
        iframe.contentWindow?.postMessage({ type: 'disableInspector' }, '*');
      }
    };
    
    // Send immediately and also on iframe load
    sendInspectorState();
    iframe.addEventListener('load', sendInspectorState);
    
    return () => {
      iframe.removeEventListener('load', sendInspectorState);
    };
  }, [inspectorEnabled, refreshKey]);

  // Auto-refresh when code changes - this is the key effect for live preview updates
  useEffect(() => {
    if (code) {
      // Check if code actually changed to avoid unnecessary refreshes
      if (prevCodeRef.current !== code) {
        console.log('\n🖼️ [LivePreview] Code changed - triggering preview refresh!');
        console.log(`   📊 Previous code length: ${prevCodeRef.current?.length || 0}`);
        console.log(`   📊 New code length: ${code.length}`);
        console.log(`   🔄 Incrementing refreshKey from ${refreshKey} to ${refreshKey + 1}\n`);
        
        prevCodeRef.current = code;
        setRefreshKey(prev => prev + 1);
      }
    }
  }, [code, refreshKey]);

  // Fix placeholder images in any code
  const fixPlaceholderImages = (html: string): string => {
    let result = html;
    
    // Fix placehold.co URLs - they work but let's ensure proper format
    // Match: https://placehold.co/600x400 or https://placehold.co/600x400/png etc
    result = result.replace(/https?:\/\/placehold\.co\/(\d+)x(\d+)(?:\/[^"'\s]*)?/gi, 
      (match, w, h) => `https://picsum.photos/${w}/${h}`);
    
    // Replace src="400 x 600" or src="400x600" patterns
    result = result.replace(/src=["'](\d+)\s*[xX×]\s*(\d+)["']/g, (match, w, h) => {
      return `src="https://picsum.photos/${w}/${h}"`;
    });
    
    // Replace /placeholder.svg or /placeholder.png URLs with dimensions
    result = result.replace(/src=["'][^"']*placeholder[^"']*\?[^"']*height=(\d+)[^"']*width=(\d+)[^"']*["']/gi, (match, h, w) => {
      return `src="https://picsum.photos/${w}/${h}"`;
    });
    result = result.replace(/src=["'][^"']*placeholder[^"']*\?[^"']*width=(\d+)[^"']*height=(\d+)[^"']*["']/gi, (match, w, h) => {
      return `src="https://picsum.photos/${w}/${h}"`;
    });
    
    // Replace any remaining placeholder.svg/png/jpg references without dimensions
    result = result.replace(/src=["'][^"']*placeholder\.(svg|png|jpg|jpeg|webp)["']/gi, 
      'src="https://picsum.photos/400/300"');
    
    // Replace /api/placeholder/WxH patterns
    result = result.replace(/src=["']\/api\/placeholder\/(\d+)\/(\d+)["']/g, (match, w, h) => {
      return `src="https://picsum.photos/${w}/${h}"`;
    });
    
    // Replace via.placeholder.com URLs
    result = result.replace(/https?:\/\/via\.placeholder\.com\/(\d+)x?(\d+)?/gi, (match, w, h) => {
      return `https://picsum.photos/${w}/${h || w}`;
    });
    
    // Replace dummyimage.com URLs
    result = result.replace(/https?:\/\/dummyimage\.com\/(\d+)x(\d+)/gi, (match, w, h) => {
      return `https://picsum.photos/${w}/${h}`;
    });
    
    // Fix text content that looks like "400 x 600" or "1200x600" (orphaned dimension text)
    result = result.replace(/>(\s*)(\d+)\s*[xX×]\s*(\d+)(\s*)</g, 
      (match, ws1, w, h, ws2) => `>${ws1}<img src="https://picsum.photos/${w}/${h}" alt="Image" class="w-full h-auto" />${ws2}<`);
    
    return result;
  };

  // Convert React/JSX code to HTML
  const convertReactToHtml = (reactCode: string): string => {
    let htmlContent = reactCode;
    
    // Try to extract JSX content from React component
    // Handle multiple return patterns
    const patterns = [
      /return\s*\(([\s\S]*?)\)\s*;?\s*\}\s*$/,  // return (...); }
      /return\s*\(([\s\S]*)\)\s*;?\s*\}?\s*$/,  // return (...)
      /return\s+(<[\s\S]+>)\s*;?\s*\}?\s*$/,    // return <...>
    ];
    
    for (const pattern of patterns) {
      const match = reactCode.match(pattern);
      if (match && match[1]) {
        htmlContent = match[1].trim();
        break;
      }
    }
    
    // If no pattern matched, try the bracket counting approach
    if (htmlContent === reactCode) {
      const returnIndex = reactCode.indexOf('return (');
      if (returnIndex !== -1) {
        let depth = 0;
        let startIndex = -1;
        let endIndex = -1;
        
        for (let i = returnIndex + 7; i < reactCode.length; i++) {
          const char = reactCode[i];
          if (char === '(') {
            if (depth === 0) startIndex = i + 1;
            depth++;
          } else if (char === ')') {
            depth--;
            if (depth === 0) {
              endIndex = i;
              break;
            }
          }
        }
        
        if (startIndex !== -1 && endIndex !== -1) {
          htmlContent = reactCode.substring(startIndex, endIndex).trim();
        }
      }
    }

    // Convert className to class
    htmlContent = htmlContent.replace(/className=/g, 'class=');
    
    // Handle JSX expressions in attributes (e.g., class={`...`} or class={var})
    // Convert class={`template ${literal}`} to class="template literal"
    htmlContent = htmlContent.replace(/class=\{`([^`]*)`\}/g, (_, content) => {
      // Remove ${...} expressions from template literals
      const cleanContent = content.replace(/\$\{[^}]*\}/g, '').trim();
      return `class="${cleanContent}"`;
    });
    
    // Remove any attribute with JSX expression values
    htmlContent = htmlContent.replace(/\s+\w+=\{[^}]*\}/g, '');
    
    // Remove event handlers and React-specific attributes first
    htmlContent = htmlContent.replace(/\s+(onClick|onChange|onSubmit|onBlur|onFocus|onKeyDown|onKeyUp|onKeyPress|onMouseEnter|onMouseLeave|onMouseOver|onMouseOut|ref|key|dangerouslySetInnerHTML)=(?:"[^"]*"|'[^']*'|\{[^}]*\})/g, '');
    
    // Remove style objects (style={{...}})
    htmlContent = htmlContent.replace(/\s+style=\{\{[^}]*\}\}/g, '');
    
    // Now handle JSX expressions in content
    // Remove .map() expressions entirely - they render lists dynamically
    htmlContent = htmlContent.replace(/\{[^{}]*\.map\s*\([^)]*\)\s*=>\s*\([\s\S]*?\)\s*\)\}/g, '');
    htmlContent = htmlContent.replace(/\{[^{}]*\.map\s*\([^)]*\)\s*=>\s*[^}]+\}/g, '');
    
    // Remove conditional expressions like {condition && (...)} or {condition && <tag>}
    htmlContent = htmlContent.replace(/\{[^{}]*&&\s*\([^)]*\)\}/g, '');
    htmlContent = htmlContent.replace(/\{[^{}]*&&\s*<[^>]*>[^<]*<\/[^>]*>\}/g, '');
    htmlContent = htmlContent.replace(/\{[^{}]*&&\s*[^}]+\}/g, '');
    
    // Remove ternary expressions {condition ? a : b}
    htmlContent = htmlContent.replace(/\{[^{}]*\?[^{}]*:[^{}]*\}/g, '');
    
    // Remove simple variable expressions {variable}
    htmlContent = htmlContent.replace(/\{[a-zA-Z_][a-zA-Z0-9_.]*\}/g, '');
    
    // Remove any remaining curly brace expressions in text content
    // This handles nested or complex expressions we haven't caught
    let prevContent = '';
    let iterations = 0;
    while (htmlContent !== prevContent && iterations < 10) {
      prevContent = htmlContent;
      iterations++;
      
      // Remove expressions between > and < (text content)
      htmlContent = htmlContent.replace(/>([^<]*)\{[^{}]*\}([^<]*)</g, '>$1$2<');
      
      // Remove orphaned JSX expressions
      htmlContent = htmlContent.replace(/\)\s*\)/g, ')');
      htmlContent = htmlContent.replace(/\(\s*\(/g, '(');
    }
    
    // Clean up any remaining standalone curly braces and their content
    htmlContent = htmlContent.replace(/\{[^<>{}]*\}/g, '');
    
    // Remove orphaned parentheses that might be left over
    htmlContent = htmlContent.replace(/\)\s*\)/g, ')');
    htmlContent = htmlContent.replace(/>\s*\)\s*</g, '><');
    htmlContent = htmlContent.replace(/>\s*\(\s*</g, '><');
    
    // Fix self-closing JSX tags (convert <div /> to <div></div> for non-void elements)
    const validSelfClosing = ['img', 'br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];
    htmlContent = htmlContent.replace(/<(\w+)([^>]*?)\s*\/>/g, (match, tag, attrs) => {
      if (validSelfClosing.includes(tag.toLowerCase())) {
        return match;
      }
      return `<${tag}${attrs}></${tag}>`;
    });
    
    // Clean up multiple spaces and newlines
    htmlContent = htmlContent.replace(/\s{2,}/g, ' ');
    
    // Clean up empty attributes
    htmlContent = htmlContent.replace(/\s+class=""/g, '');
    htmlContent = htmlContent.replace(/\s+aria-current=\s*/g, ' ');
    htmlContent = htmlContent.replace(/=\s+>/g, '>');
    
    // Clean up extra whitespace between tags
    htmlContent = htmlContent.replace(/>\s+</g, '>\n<');
    
    // Remove empty lines and trim
    htmlContent = htmlContent.split('\n').filter(line => line.trim()).join('\n');
    
    return htmlContent;
  };

  // Convert Vue SFC to HTML
  const convertVueToHtml = (vueCode: string): string => {
    // Extract template content from Vue SFC
    const templateMatch = vueCode.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
    if (templateMatch) {
      let html = templateMatch[1].trim();
      // Convert Vue bindings to static
      html = html.replace(/v-bind:|:/g, '');
      html = html.replace(/v-on:|@/g, 'on');
      html = html.replace(/\{\{[^}]*\}\}/g, ''); // Remove {{ }} expressions
      html = html.replace(/v-if="[^"]*"/g, '');
      html = html.replace(/v-for="[^"]*"/g, '');
      html = html.replace(/v-model="[^"]*"/g, '');
      return html;
    }
    return vueCode;
  };

  // Convert Svelte to HTML
  const convertSvelteToHtml = (svelteCode: string): string => {
    let html = svelteCode;
    // Remove script and style tags
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    // Remove Svelte-specific syntax
    html = html.replace(/\{#[^}]*\}/g, '');
    html = html.replace(/\{\/[^}]*\}/g, '');
    html = html.replace(/\{:[^}]*\}/g, '');
    html = html.replace(/\{[^}]*\}/g, ''); // Remove {expressions}
    html = html.replace(/on:\w+/g, '');
    html = html.replace(/bind:\w+/g, '');
    return html.trim();
  };

  // Convert Angular to HTML
  const convertAngularToHtml = (angularCode: string): string => {
    // Extract template content
    const templateMatch = angularCode.match(/template:\s*`([\s\S]*?)`/);
    let html = templateMatch ? templateMatch[1] : angularCode;
    
    // Remove Angular-specific attributes and bindings
    html = html.replace(/\*ngFor="[^"]*"/g, '');
    html = html.replace(/\*ngIf="[^"]*"/g, '');
    html = html.replace(/\[([^\]]*)\]="[^"]*"/g, '$1=""');
    html = html.replace(/\(([^)]*)\)="[^"]*"/g, '');
    html = html.replace(/\{\{[^}]*\}\}/g, '');
    html = html.replace(/#\w+/g, '');
    return html.trim();
  };

  // Build the HTML document for the iframe
  const getPreviewDocument = () => {
    if (!code) return '';

    let htmlContent = code;

    // Check if code already has complete HTML structure
    const hasHtmlTag = code.toLowerCase().includes('<html');
    const hasDoctype = code.toLowerCase().includes('<!doctype');

    if (hasHtmlTag || hasDoctype) {
      // It's already HTML, just fix placeholder images
      htmlContent = fixPlaceholderImages(code);
      return htmlContent;
    }

    // Determine how to process based on code type
    const isReactCode = codeType === 'REACT' || codeType === 'NEXTJS' || 
      code.includes('import React') || 
      code.includes('export default function') ||
      code.includes('export function') ||
      (code.includes('className=') && !code.includes('<!DOCTYPE'));
    
    const isVueCode = codeType === 'VUE' || code.includes('<template>') || code.includes('<script setup>');
    const isSvelteCode = codeType === 'SVELTE' || (code.includes('<script>') && code.includes('$:'));
    const isAngularCode = codeType === 'ANGULAR' || code.includes('@Component') || code.includes('*ngFor');

    if (isReactCode) {
      htmlContent = convertReactToHtml(code);
    } else if (isVueCode) {
      htmlContent = convertVueToHtml(code);
    } else if (isSvelteCode) {
      htmlContent = convertSvelteToHtml(code);
    } else if (isAngularCode) {
      htmlContent = convertAngularToHtml(code);
    }

    // Fix placeholder images
    htmlContent = fixPlaceholderImages(htmlContent);

    // Wrap in complete HTML document with Tailwind
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#3b82f6',
            secondary: '#8b5cf6',
          }
        }
      }
    }
  </script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style id="base-styles">
    * { box-sizing: border-box; }
    html, body { 
      margin: 0; 
      padding: 0; 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    img { 
      max-width: 100%; 
      height: auto;
      display: block;
    }
    img[src=""] { display: none; }
    img:not([src]) { display: none; }
    /* Ensure Tailwind classes work */
    .bg-gradient-to-r { background-image: linear-gradient(to right, var(--tw-gradient-stops)); }
    .bg-gradient-to-br { background-image: linear-gradient(to bottom right, var(--tw-gradient-stops)); }
  </style>
  <style id="generated-styles">
    /* Injected styles from styles.css will go here */
  </style>
  <script>
    // Listen for messages from parent window
    window.addEventListener('message', function(event) {
      // Validate origin in production
      if (!event.data || typeof event.data !== 'object') return;
      
      var type = event.data.type;
      
      if (type === 'setViewport') {
        // Update viewport data attribute for responsive CSS
        var viewport = event.data.viewport; // 'desktop' | 'tablet' | 'mobile'
        document.documentElement.setAttribute('data-viewport', viewport);
        document.body.setAttribute('data-viewport', viewport);
      }
      
      if (type === 'applyStyles') {
        // Inject or update generated styles
        var css = event.data.css || '';
        var styleEl = document.getElementById('generated-styles');
        if (styleEl) {
          styleEl.textContent = css;
        }
      }
      
      if (type === 'updateHtml') {
        // Update the body content
        var html = event.data.html || '';
        document.body.innerHTML = html;
      }
      
      if (type === 'enableInspector') {
        // Enable inspector mode
        enableInspectorMode();
      }
      
      if (type === 'disableInspector') {
        // Disable inspector mode
        disableInspectorMode();
      }
    });
    
    // Inspector mode functionality
    var inspectorActive = false;
    var highlightOverlay = null;
    var selectedElement = null;
    
    function enableInspectorMode() {
      if (inspectorActive) return;
      inspectorActive = true;
      
      // Create highlight overlay
      highlightOverlay = document.createElement('div');
      highlightOverlay.id = 'inspector-overlay';
      highlightOverlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);z-index:9999;display:none;transition:all 0.1s ease;';
      document.body.appendChild(highlightOverlay);
      
      // Add styles for selected element
      var style = document.createElement('style');
      style.id = 'inspector-styles';
      style.textContent = '.inspector-selected{outline:2px solid #3b82f6!important;outline-offset:2px!important;}';
      document.head.appendChild(style);
      
      document.body.addEventListener('mousemove', handleMouseMove);
      document.body.addEventListener('click', handleClick);
      document.body.style.cursor = 'crosshair';
    }
    
    function disableInspectorMode() {
      inspectorActive = false;
      if (highlightOverlay) {
        highlightOverlay.remove();
        highlightOverlay = null;
      }
      var style = document.getElementById('inspector-styles');
      if (style) style.remove();
      if (selectedElement) {
        selectedElement.classList.remove('inspector-selected');
        selectedElement = null;
      }
      document.body.removeEventListener('mousemove', handleMouseMove);
      document.body.removeEventListener('click', handleClick);
      document.body.style.cursor = '';
    }
    
    function handleMouseMove(e) {
      if (!inspectorActive || !highlightOverlay) return;
      var target = e.target;
      if (target === document.body || target === highlightOverlay) {
        highlightOverlay.style.display = 'none';
        return;
      }
      var rect = target.getBoundingClientRect();
      highlightOverlay.style.display = 'block';
      highlightOverlay.style.top = rect.top + 'px';
      highlightOverlay.style.left = rect.left + 'px';
      highlightOverlay.style.width = rect.width + 'px';
      highlightOverlay.style.height = rect.height + 'px';
    }
    
    function handleClick(e) {
      if (!inspectorActive) return;
      e.preventDefault();
      e.stopPropagation();
      
      var target = e.target;
      if (target === document.body || target === highlightOverlay) return;
      
      // Remove previous selection
      if (selectedElement) {
        selectedElement.classList.remove('inspector-selected');
      }
      
      // Mark new selection
      selectedElement = target;
      selectedElement.classList.add('inspector-selected');
      
      // Get computed styles (only key ones)
      var computed = window.getComputedStyle(target);
      var styles = {};
      var styleProps = ['color', 'background-color', 'font-size', 'font-weight', 'padding', 'margin', 'border', 'display', 'flex-direction', 'justify-content', 'align-items', 'gap', 'border-radius'];
      styleProps.forEach(function(prop) {
        styles[prop] = computed.getPropertyValue(prop);
      });
      
      // Get bounding box
      var rect = target.getBoundingClientRect();
      
      // Generate unique ID if not present
      var id = target.id || target.getAttribute('data-inspector-id') || 'el-' + Math.random().toString(36).substr(2, 9);
      if (!target.id) {
        target.setAttribute('data-inspector-id', id);
      }
      
      // Send element info to parent
      window.parent.postMessage({
        type: 'elementSelected',
        elementInfo: {
          id: id,
          tagName: target.tagName,
          className: target.className || '',
          textContent: target.textContent ? target.textContent.trim().slice(0, 100) : '',
          styles: styles,
          boundingBox: {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            x: Math.round(rect.x),
            y: Math.round(rect.y)
          }
        }
      }, '*');
    }
    
    // Notify parent that iframe is ready
    window.parent.postMessage({ type: 'previewReady' }, '*');
  </script>
</head>
<body class="antialiased" data-viewport="desktop">
${htmlContent.trim()}
</body>
</html>`;
  };

  const isLoading = status === 'processing' || status === 'uploading';

  if (!code && !isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#1a1a1a] text-neutral-600 text-xs">
        Preview will appear here
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#1a1a1a]">
        <div className="text-center">
          <div className="w-5 h-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin mx-auto mb-2" />
          <p className="text-[11px] text-neutral-500">Generating...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#e5e5e5] relative">
      {/* Preview Container */}
      <div className="flex-1 overflow-auto flex justify-center items-start">
        <div 
          className="h-full bg-white shadow-sm transition-all duration-200"
          style={{ 
            width: viewport === 'desktop' ? '100%' : viewports[viewport].width,
            maxWidth: '100%'
          }}
        >
          <iframe
            ref={iframeRef}
            key={refreshKey}
            srcDoc={getPreviewDocument()}
            className="w-full h-full border-0"
            title="Live Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>

      {/* Viewport indicator for mobile/tablet */}
      {viewport !== 'desktop' && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-white text-[10px] rounded">
          {viewports[viewport].label}
        </div>
      )}
    </div>
  );
}

// Controls component to be used in the header
function PreviewControls() {
  const [viewport, setViewport] = useState<ViewportSize>(sharedViewport);

  const handleViewportChange = (v: ViewportSize) => {
    setViewport(v);
    setSharedViewport(v);
  };

  const handleOpenExternal = () => {
    // This will be handled by parent component
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => handleViewportChange('mobile')}
        className={`p-1 rounded transition-colors ${viewport === 'mobile' ? 'text-white bg-[#2a2a2a]' : 'text-neutral-500 hover:text-white'}`}
        title="Mobile (375px)"
      >
        <Smartphone className="w-3 h-3" />
      </button>
      <button
        onClick={() => handleViewportChange('tablet')}
        className={`p-1 rounded transition-colors ${viewport === 'tablet' ? 'text-white bg-[#2a2a2a]' : 'text-neutral-500 hover:text-white'}`}
        title="Tablet (768px)"
      >
        <Tablet className="w-3 h-3" />
      </button>
      <button
        onClick={() => handleViewportChange('desktop')}
        className={`p-1 rounded transition-colors ${viewport === 'desktop' ? 'text-white bg-[#2a2a2a]' : 'text-neutral-500 hover:text-white'}`}
        title="Desktop (100%)"
      >
        <Monitor className="w-3 h-3" />
      </button>
      <div className="w-px h-3 bg-[#2a2a2a] mx-1" />
      <button
        onClick={handleOpenExternal}
        className="p-1 rounded text-neutral-500 hover:text-white transition-colors"
        title="Open in new tab"
      >
        <ExternalLink className="w-3 h-3" />
      </button>
    </div>
  );
}

// Attach Controls as a static property
LivePreviewComponent.Controls = PreviewControls;

export default LivePreviewComponent;
