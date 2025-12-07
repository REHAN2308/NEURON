'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuth } from '@/components/AuthProvider';
import UploadZone from '@/components/UploadZone';
import Workspace from '@/components/Workspace';
import UserMenu from '@/components/UserMenu';
import initLandingBackground from '@/utils/landing-init';
import { 
  Settings,
  ChevronDown,
  Zap,
  Code2,
  Layers,
  Palette,
  Sparkles
} from 'lucide-react';
import { useState } from 'react';

export default function Home() {
  const { 
    imagePreview, 
    generatedCode, 
    settings, 
    setSettings,
    status,
    error,
    reset,
    isModifying
  } = useProjectStore();
  
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  
  const [showSettings, setShowSettings] = useState(false);
  const [instructions, setInstructions] = useState('');

  // Initialize animated background for landing page
  useEffect(() => {
    return initLandingBackground();
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  const hasProject = imagePreview || generatedCode;

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-fadeIn">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-white flex items-center justify-center shadow-2xl shadow-white/10">
            <span className="text-3xl font-black text-black">N</span>
          </div>
          <div className="w-8 h-8 mx-auto border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Don't render anything if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  // Show workspace with animation only when code is fully generated
  // IMPORTANT: Keep workspace visible when modifying code (isModifying=true)
  // This prevents the socket from disconnecting during code modifications
  const shouldShowWorkspace = generatedCode && (status === 'completed' || isModifying);
  const isProcessing = status === 'processing' || status === 'uploading';
  // Only show loading screen during INITIAL code generation, not during modifications
  const shouldShowLoadingScreen = isProcessing && imagePreview && !isModifying;

  if (shouldShowWorkspace) {
    return (
      <div className="animate-fadeIn">
        <Workspace />
      </div>
    );
  }

  // Show error state
  if (status === 'error' && error) {
    return (
      <div className="min-h-screen text-white flex items-center justify-center">
        <div className="geometric-bg" />
        <div className="relative z-10 text-center animate-fadeIn max-w-md px-6">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-red-500/20 flex items-center justify-center border border-red-500/30">
            <span className="text-4xl">⚠️</span>
          </div>
          <h2 className="text-2xl font-semibold mb-3">Something went wrong</h2>
          <p className="text-white/60 mb-6">{error}</p>
          <button
            onClick={reset}
            className="px-6 py-3 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition-all"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show loading state during initial processing only (not during code modifications)
  if (shouldShowLoadingScreen) {
    return (
      <div id="generating" className="min-h-screen text-white flex items-center justify-center relative overflow-hidden">
        {/* Background is handled by CSS ::before pseudo-element (animated moving background) */}
        
        <div className="relative z-10 text-center animate-fadeIn">
          {/* Spinner */}
          <div className="mb-8 flex justify-center">
            <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
          </div>
          
          {/* Image Preview */}
          <div className="mb-6 flex justify-center">
            <div className="w-48 h-48 rounded-xl overflow-hidden border-2 border-white/20 animate-scaleIn">
              <img 
                src={imagePreview} 
                alt="Uploaded" 
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          
          {/* Status Text */}
          <h2 className="text-2xl font-semibold mb-2 animate-slideUp">
            {status === 'uploading' ? 'Uploading Image...' : 'Generating Code...'}
          </h2>
          <p className="text-white/60 animate-slideUp animation-delay-200">
            Analyzing your design and creating optimized code
          </p>
          
          {/* Progress Dots */}
          <div className="flex justify-center gap-2 mt-6">
            <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce animation-delay-200"></div>
            <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce animation-delay-400"></div>
          </div>
        </div>
      </div>
    );
  }

  // Otherwise show the landing page
  return (
    <div id="landing" className="min-h-screen text-white relative overflow-hidden">
      {/* Background is handled by CSS ::before pseudo-element */}
      
      {!hasProject ? (
        /* Landing / Upload State */
        <div className="min-h-screen flex flex-col relative z-10">
          {/* Header */}
          <header className="relative z-10 px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-lg">
                  <span className="text-xl font-black text-black">N</span>
                </div>
                <span className="text-xl font-bold tracking-tight text-white">NEURON</span>
              </div>

              {/* Right side: Settings & User */}
              <div className="flex items-center gap-4">
                {/* Settings Button */}
                <div className="relative">
                  <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="hidden sm:inline">{settings.codeType} / {settings.framework}</span>
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  
                  {showSettings && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)} />
                      <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-white/10 bg-[#1a1a2e]/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden">
                        <div className="p-4">
                          <label className="block mb-2 text-xs font-medium uppercase tracking-wider text-white">Output Type</label>
                          <select 
                            value={settings.codeType}
                            onChange={(e) => setSettings({ codeType: e.target.value as any })}
                            className="w-full p-3 rounded-lg text-sm bg-white/5 border border-white/10 text-white focus:outline-none focus:border-white/50 transition-colors"
                          >
                            <option value="HTML">HTML</option>
                            <option value="REACT">React JSX</option>
                            <option value="VUE">Vue SFC</option>
                            <option value="NEXTJS">Next.js</option>
                            <option value="SVELTE">Svelte</option>
                          </select>
                        </div>
                        <div className="p-4 border-t border-white/10">
                          <label className="block mb-2 text-xs font-medium uppercase tracking-wider text-white">CSS Framework</label>
                          <select 
                            value={settings.framework}
                            onChange={(e) => setSettings({ framework: e.target.value as any })}
                            className="w-full p-3 rounded-lg text-sm bg-white/5 border border-white/10 text-white focus:outline-none focus:border-white/50 transition-colors"
                          >
                            <option value="TAILWIND">Tailwind CSS</option>
                            <option value="BOOTSTRAP">Bootstrap</option>
                            <option value="VANILLA">Vanilla CSS</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* User Menu */}
                <UserMenu />
              </div>
            </div>
          </header>

          {/* Hero Section */}
          <main className="flex-1 flex items-center justify-center px-6 py-12">
            <div className="max-w-2xl w-full text-center">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-white text-sm mb-8">
                <Zap className="w-4 h-4" />
                <span>AI-Powered Code Generation</span>
              </div>

              {/* Title */}
              <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight text-white">
                Transform Images into
                <span className="block text-white">
                  Production Code
                </span>
              </h1>

              {/* Subtitle */}
              <p className="text-lg text-neutral-400 mb-12 max-w-lg mx-auto leading-relaxed">
                Upload any screenshot, wireframe, or design mockup. 
                Get clean, production-ready code in seconds.
              </p>

              {/* Upload Zone */}
              <div className="max-w-md mx-auto mb-8 animate-slideUp">
                <UploadZone instructions={instructions} />
              </div>

              {/* Instructions Input */}
              <div className="max-w-md mx-auto mb-12 animate-slideUp animation-delay-200">
                <div className="bg-white/5 backdrop-blur-sm border border-white/20 rounded-2xl p-4 transition-all hover:bg-white/10">
                  <div className="relative">
                    <input
                      type="text"
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="Describe how you want the code (e.g. React + Tailwind, responsive, dark theme, compact)"
                      className="w-full px-4 py-3 pr-10 bg-white/10 text-white placeholder-white/40 rounded-lg border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/10 transition-all text-sm"
                    />
                    <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  </div>
                  <p className="text-xs text-white/40 mt-2 text-center">
                    These instructions will guide the first version of the generated code.
                  </p>
                </div>
              </div>

              {/* Features */}
              <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-neutral-400">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                    <Code2 className="w-4 h-4 text-white" />
                  </div>
                  <span>React & HTML</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                    <Layers className="w-4 h-4 text-white" />
                  </div>
                  <span>Tailwind CSS</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                    <Palette className="w-4 h-4 text-white" />
                  </div>
                  <span>Pixel Perfect</span>
                </div>
              </div>
            </div>
          </main>

          {/* Footer */}
          <footer className="px-6 py-4 text-center text-xs text-neutral-600">
            Powered by NEURON AI • Made with ♥
          </footer>
        </div>
      ) : null}
    </div>
  );
}
